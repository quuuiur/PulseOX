#include <Arduino.h>
#include <Wire.h>
#include <MAX3010x.h>
#include <NimBLEDevice.h>
#include "filters.h"

MAX30102 sensor;
const int kMax30102SdaPin = 3;
const int kMax30102SclPin = 1;
const int kDisplayRxPin = 16;
const int kDisplayTxPin = 17;
const bool kEnableSerialDebug = false;
const auto kSamplingRate = sensor.SAMPLING_RATE_400SPS;
const float kSamplingFrequency = 400.0;
// Finger Detection Threshold and Cooldown
const unsigned long kFingerThreshold = 10000;
const unsigned int kFingerCooldownMs = 500;
// Edge Detection Threshold 
const float kEdgeThreshold = -2000.0;
// Filters
const float kLowPassCutoff = 5.0;
const float kHighPassCutoff = 0.5;
// Averaging
const bool kEnableAveraging = true;
const int kAveragingSamples = 5;
const int kSampleThreshold = 5;

//蓝牙服务相关ID设置
const char *kBleDeviceName = "ESP32-PulseOX-G07"; //根据组号设置
const char *kBleServiceUUID = "7d6e0701-4f4f-4d50-8a43-4f58494d3032"; //根据组号设置
const char *kBleWaveCharacteristicUUID = "7d6e0702-4f4f-4d50-8a43-4f58494d3032"; //根据组号设置
const char *kBleMetricsCharacteristicUUID = "7d6e0703-4f4f-4d50-8a43-4f58494d3032"; //根据组号设置

//NimBLE GATT Server
NimBLEServer *bleServer = nullptr;
NimBLECharacteristic *waveCharacteristic = nullptr;
NimBLECharacteristic *metricsCharacteristic = nullptr;
volatile bool bleConnected = false;

float PPGWave = 0;
int PPGcount = 0;
uint8_t waveSequence = 0;
int latestAverageBpm = 0;
int latestAverageSpo2 = 0;
bool latestMetricsReady = false;
unsigned long lastNoFingerNotifyMs = 0;
unsigned long lastSensorDebugMs = 0;
unsigned long lastWaveDebugMs = 0;

// Filter Instances
LowPassFilter low_pass_filter_red(kLowPassCutoff, kSamplingFrequency);
LowPassFilter low_pass_filter_ir(kLowPassCutoff, kSamplingFrequency);
HighPassFilter high_pass_filter(kHighPassCutoff, kSamplingFrequency);
Differentiator differentiator(kSamplingFrequency);
MovingAverageFilter<kAveragingSamples> averager_bpm;
MovingAverageFilter<kAveragingSamples> averager_r;
MovingAverageFilter<kAveragingSamples> averager_spo2;

// Statistic for pulse oximetry
MinMaxAvgStatistic stat_red;
MinMaxAvgStatistic stat_ir;

// R value to SpO2 calibration factors
// See https://www.maximintegrated.com/en/design/technical-documents/app-notes/6/6845.html
float kSpO2_A = 1.5958422;
float kSpO2_B = -34.6596622;
float kSpO2_C = 112.6898759;

// Timestamp of the last heartbeat
long last_heartbeat = 0;

// Timestamp for finger detection
long finger_timestamp = 0;
bool finger_detected = false;

// Last diff to detect zero crossing
float last_diff = NAN;
bool crossed = false;
long crossed_time = 0;

//BLEServer回调函数类
class PulseBleServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *server, NimBLEConnInfo &connInfo) override {
    bleConnected = true;
    server->updateConnParams(connInfo.getConnHandle(), 12, 24, 0, 180);
    if (kEnableSerialDebug) {
      Serial.println("BLE client connected");
    }
  }

  void onDisconnect(NimBLEServer *server, NimBLEConnInfo &connInfo, int reason) override {
    (void)server;
    (void)connInfo;
    (void)reason;
    bleConnected = false;
    NimBLEDevice::startAdvertising();
    if (kEnableSerialDebug) {
      Serial.println("BLE client disconnected, advertising restarted");
    }
  }
};

PulseBleServerCallbacks bleCallbacks;

//将value范围限定在[minValue, maxValue]的辅助函数
int clampInt(int value, int minValue, int maxValue) {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}
//BLE服务中的波形数据更新
void notifyWave(int value, bool fingerDetected) {
  if (waveCharacteristic == nullptr) {
    return;
  }
  //波形数据包长度4字节(Characteristic：Wave UUID)
  uint8_t payload[4] = {
    0x01, //数据包类型，固定0x01
    waveSequence++, //波形序号，0 到 255 循环
    static_cast<uint8_t>(clampInt(value, 0, 120)), //波形值，范围 0-120
    static_cast<uint8_t>(fingerDetected ? 0x01 : 0x00) //标志位，bit0为1表示检测到手指
  };

  waveCharacteristic->setValue(payload, sizeof(payload));
  if (bleConnected) {
    waveCharacteristic->notify();
  }
}

//BLE服务中的测量数据（心率和血氧）更新
void notifyMetrics(int bpm, int spo2, bool fingerDetected, bool metricsReady) {
  if (metricsCharacteristic == nullptr) {
    return;
  }

  uint8_t flags = 0; //标志位，bit0 为手指检测，bit1 为指标有效
  if (fingerDetected) {
    flags |= 0x01;
  }
  if (metricsReady) {
    flags |= 0x02;
  }

  int safeBpm = clampInt(bpm, 0, 300);
  int safeSpo2 = clampInt(spo2, 0, 100);
  //心率和血氧数据包长度6字节（Characteristic：Metrics UUID）
  uint8_t payload[6] = {
    0x02, //	数据包类型，固定0x02
    static_cast<uint8_t>(safeBpm & 0xff), //心率 bpm，低8位
    static_cast<uint8_t>((safeBpm >> 8) & 0xff), //心率 bpm，高8位
    static_cast<uint8_t>(safeSpo2), //SpO2
    flags, //标志位，bit0 为手指检测，bit1 为指标有效
    waveSequence //当前波形序号
  };

  metricsCharacteristic->setValue(payload, sizeof(payload));
  if (bleConnected) {
    metricsCharacteristic->notify();
  }
}
//蓝牙BLE服务设置
void setupBle() {
  NimBLEDevice::init(kBleDeviceName);

  bleServer = NimBLEDevice::createServer();
  bleServer->setCallbacks(&bleCallbacks, false);

  NimBLEService *pulseService = bleServer->createService(kBleServiceUUID);
  waveCharacteristic = pulseService->createCharacteristic(
    kBleWaveCharacteristicUUID,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY,
    4
  );
  metricsCharacteristic = pulseService->createCharacteristic(
    kBleMetricsCharacteristicUUID,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY,
    6
  );

  notifyWave(60, false);
  notifyMetrics(0, 0, false, false);

  bleServer->start();

  NimBLEAdvertising *advertising = NimBLEDevice::getAdvertising();
  advertising->setName(kBleDeviceName);
  advertising->addServiceUUID(kBleServiceUUID);
  advertising->enableScanResponse(true);
  advertising->start();

  if (kEnableSerialDebug) {
    Serial.println("BLE advertising as ESP32-PulseOX");
  }
}

void scanI2cBus() {
  Serial.println("Scanning I2C bus...");
  bool foundDevice = false;

  for (uint8_t address = 1; address < 127; ++address) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.print("I2C device found at 0x");
      if (address < 16) {
        Serial.print("0");
      }
      Serial.println(address, HEX);
      foundDevice = true;
    }
  }

  if (!foundDevice) {
    Serial.println("No I2C device found. Check MAX30102 SDA=GPIO3, SCL=GPIO1, VCC and GND.");
  }
}

//重置滤波器、平均器、心跳检测状态
void resetMeasurementState() {
  differentiator.reset();
  averager_bpm.reset();
  averager_r.reset();
  averager_spo2.reset();
  low_pass_filter_red.reset();
  low_pass_filter_ir.reset();
  high_pass_filter.reset();
  stat_red.reset();
  stat_ir.reset();

  PPGWave = 0;
  PPGcount = 0;
  last_heartbeat = 0;
  last_diff = NAN;
  crossed = false;
  latestAverageBpm = 0;
  latestAverageSpo2 = 0;
  latestMetricsReady = false;
}

void setup() {
  if (kEnableSerialDebug) {
    Serial.begin(115200);
  }
  delay(300);
  Wire.begin(kMax30102SdaPin, kMax30102SclPin);
  Wire.setClock(400000);
  if (kEnableSerialDebug) {
    scanI2cBus();
  }

  // 串口屏使用Serial2，TX/RX按实际接线交叉连接
  Serial2.begin(115200, SERIAL_8N1, kDisplayRxPin, kDisplayTxPin);

  setupBle(); //配置蓝牙服务

  if (sensor.begin() && sensor.setSamplingRate(kSamplingRate)) {
    if (kEnableSerialDebug) {
      Serial.println("Sensor initialized");
    }
  } else {
    if (kEnableSerialDebug) {
      Serial.println("Sensor not found. BLE can connect, but measurement will not run.");
    }
    while (1) {
      delay(1000);
    }
  }
}

void loop() {
  auto sample = sensor.readSample(1000);
  float current_value_red = sample.red;
  float current_value_ir = sample.ir;

  if (kEnableSerialDebug && millis() - lastSensorDebugMs >= 1000) {
    Serial.print("MAX30102 raw red=");
    Serial.print(sample.red);
    Serial.print(" ir=");
    Serial.print(sample.ir);
    Serial.print(" finger=");
    Serial.println(sample.red > kFingerThreshold ? "yes" : "no");
    lastSensorDebugMs = millis();
  }

  if (sample.red > kFingerThreshold) {
    if (millis() - finger_timestamp > kFingerCooldownMs) {
      finger_detected = true;
    }
  } else {//没有检测到手指    
    if (finger_detected || latestMetricsReady) {
      notifyMetrics(0, 0, false, false);
    }
    resetMeasurementState(); //重置滤波器、平均器、心跳检测状态
    finger_detected = false;
    finger_timestamp = millis();
    //通知小程序/串口屏：当前无有效测量
    if (millis() - lastNoFingerNotifyMs >= 500) {
      notifyWave(60, false);
      notifyMetrics(0, 0, false, false);
      lastNoFingerNotifyMs = millis();
    }
    //本轮loop到此结束，不再执行后面的心率/血氧算法
    return;
  }

  if (finger_detected) {
    current_value_red = low_pass_filter_red.process(current_value_red);
    current_value_ir = low_pass_filter_ir.process(current_value_ir);

    stat_red.process(current_value_red);
    stat_ir.process(current_value_ir);

    float current_value = high_pass_filter.process(current_value_red);
    float current_diff = differentiator.process(current_value);

    PPGWave += current_value;
    ++PPGcount;
    if (PPGcount >= 8) { //8点累加取平均（由原始的400点/秒降低到50点/秒）
      // 使用 map() 将 -500~500 映射到 0~120
      int display_val = map(static_cast<int>(PPGWave / 8), -500, 500, 0, 120);
      display_val = clampInt(display_val, 0, 120);
      //向串口屏的波形控件s0的通道0发送绘图指令
      Serial2.print("add s0.id,0," + String(display_val) + "\xff\xff\xff");
      //向蓝牙设备发送波形数据点
      notifyWave(display_val, true);
      if (kEnableSerialDebug && millis() - lastWaveDebugMs >= 1000) {
        Serial.print("PPG wave=");
        Serial.println(display_val);
        lastWaveDebugMs = millis();
      }

      PPGcount = 0;
      PPGWave = 0;
    }

    if (!isnan(current_diff) && !isnan(last_diff)) {
      if (last_diff > 0 && current_diff < 0) {
        crossed = true;
        crossed_time = millis();
      }

      if (current_diff > 0) {
        crossed = false;
      }

      if (crossed && current_diff < kEdgeThreshold) {
        if (last_heartbeat != 0 && crossed_time - last_heartbeat > 300) {
          int bpm = 60000 / (crossed_time - last_heartbeat);
          float rred = (stat_red.maximum() - stat_red.minimum()) / stat_red.average();
          float rir = (stat_ir.maximum() - stat_ir.minimum()) / stat_ir.average();
          float r = rred / rir;
          float spo2 = kSpO2_A * r * r + kSpO2_B * r + kSpO2_C;

          if (bpm > 50 && bpm < 250) {
            if (kEnableSerialDebug) {
              Serial.print("Heartbeat bpm=");
              Serial.print(bpm);
              Serial.print(" spo2=");
              Serial.println(spo2);
            }
            if (kEnableAveraging) {
              int average_bpm = static_cast<int>(averager_bpm.process(bpm));
              averager_r.process(r);
              int average_spo2 = static_cast<int>(averager_spo2.process(spo2));

              if (averager_bpm.count() >= kSampleThreshold) {
                latestAverageBpm = average_bpm;
                latestAverageSpo2 = clampInt(average_spo2, 0, 100);
                latestMetricsReady = true;
                //向串口屏的数字控件n0发送平均心率
                Serial2.print("n0.val=" + String(latestAverageBpm) + "\xff\xff\xff");
                //向串口屏的数字控件n1发送平均SpO2
                Serial2.print("n1.val=" + String(latestAverageSpo2) + "\xff\xff\xff");
                //向蓝牙设备发送心率和SpO2测量值
                notifyMetrics(latestAverageBpm, latestAverageSpo2, true, true);
              }
            } else {
              latestAverageBpm = bpm;
              latestAverageSpo2 = clampInt(static_cast<int>(spo2), 0, 100);
              latestMetricsReady = true;
              notifyMetrics(latestAverageBpm, latestAverageSpo2, true, true);
            }
          }

          stat_red.reset();
          stat_ir.reset();
        }

        crossed = false;
        last_heartbeat = crossed_time;
      }
    }

    last_diff = current_diff;
  }
}
