# Arduino 库依赖说明

复刻本项目时，Arduino IDE 需要安装下面两个外部库。

## 已打包库

当前文件夹已经包含：

```text
Libraries/
  MAX3010x_Sensor_Library/
  NimBLE-Arduino/
```

## 安装方法

把这两个文件夹复制到 Arduino 的库目录：

```text
C:\Users\你的用户名\Documents\Arduino\libraries\
```

复制完成后的结构应类似：

```text
Documents\Arduino\libraries\MAX3010x_Sensor_Library\src\MAX3010x.h
Documents\Arduino\libraries\NimBLE-Arduino\src\NimBLEDevice.h
```

然后重启 Arduino IDE。

## 每个库的用途

| 库 | 用途 |
| --- | --- |
| `MAX3010x_Sensor_Library` | 驱动 MAX30102，读取红光/红外原始数据 |
| `NimBLE-Arduino` | ESP32 BLE 蓝牙服务，把波形、心率、血氧发送给手机小程序 |

## 本项目自己的算法文件

心率和血氧计算还用到了项目自带文件：

```text
Arduino/MyPulseoximeterSpO2_1/filters.h
```

这个文件不是外部库，已经放在 Arduino 工程同目录下，不要删除。

## 编译前检查

Arduino IDE 中确认：

1. 板卡选择 ESP32 对应型号。
2. 已安装 ESP32 Arduino core。
3. `MAX3010x.h` 不报错。
4. `NimBLEDevice.h` 不报错。
5. `filters.h` 和 `.ino` 在同一个工程文件夹里。

如果报错：

```text
MAX3010x.h: No such file or directory
```

说明 `MAX3010x_Sensor_Library` 没有放进 Arduino `libraries` 目录，或放完后没有重启 Arduino IDE。

如果报错：

```text
NimBLEDevice.h: No such file or directory
```

说明 `NimBLE-Arduino` 没有放进 Arduino `libraries` 目录，或放完后没有重启 Arduino IDE。

