# ESP32 MAX30102 蓝牙血氧仪微信小程序小组接入指南

适用场景：14 个大学生实践小组，每组都有一套 ESP32 + MAX30102 设备，需要各自烧录 Arduino 程序，并用各自的微信小程序连接、显示 PPG 波形、心率和 SpO2。

## 1. 总体思路

本项目由两部分组成：

1. ESP32 Arduino 程序
   - 读取 MAX30102 的红光/红外 PPG 数据。
   - 继续计算心率和 SpO2。
   - 保留原来的 `Serial2` 串口屏输出。
   - 新增 BLE 低功耗蓝牙 GATT 服务，把波形、心率和 SpO2 发送给手机。

2. 微信小程序
   - 手机作为 BLE Central。
   - 扫描并连接本组 ESP32。
   - 订阅 ESP32 的 notify 特征值。
   - 上方显示心率和 SpO2，下方用 Canvas 显示实时 PPG 波形。

每个小组必须有自己的一组唯一参数：

- 微信小程序 `AppID`
- ESP32 蓝牙设备名
- BLE Service UUID
- BLE 波形 Characteristic UUID
- BLE 指标 Characteristic UUID

注意：`AppID` 只决定小程序归属，不决定手机连接哪台 ESP32。防止课堂上 14 台设备互相干扰，主要靠“唯一设备名 + 唯一 BLE UUID”。

## 2. 建议分发给学生的文件

教师可以把当前小程序项目整理成一个压缩包或 Git 仓库，建议包含：

```text
WechatAPPDir/
  miniprogram/
  typings/
  docs/
  package.json
  tsconfig.json
  project.config.json
```

不建议分发：

```text
project.private.config.json
node_modules/
```

`project.private.config.json` 是微信开发者工具生成的本机私有配置，会覆盖一部分公共配置。学生导入项目后，开发者工具会自动生成自己的私有配置。

Arduino 端建议单独分发：

```text
MyPulseoximeterSpO2_1/
  MyPulseoximeterSpO2_1.ino
  filters.h
```

如果学生手头已经有最初版本 Arduino 程序，也可以只参考第 5 节，把 BLE 相关代码移植进去。

## 3. 每组唯一参数表

建议教师提前给每组分配固定参数。下面这组 UUID 可以直接使用。

| 小组 | ESP32 蓝牙设备名 | Service UUID | Wave UUID | Metrics UUID |
| --- | --- | --- | --- | --- |
| G01 | `ESP32-PulseOX-G01` | `7D6E0101-4F4F-4D50-8A43-4F58494D3032` | `7D6E0102-4F4F-4D50-8A43-4F58494D3032` | `7D6E0103-4F4F-4D50-8A43-4F58494D3032` |
| G02 | `ESP32-PulseOX-G02` | `7D6E0201-4F4F-4D50-8A43-4F58494D3032` | `7D6E0202-4F4F-4D50-8A43-4F58494D3032` | `7D6E0203-4F4F-4D50-8A43-4F58494D3032` |
| G03 | `ESP32-PulseOX-G03` | `7D6E0301-4F4F-4D50-8A43-4F58494D3032` | `7D6E0302-4F4F-4D50-8A43-4F58494D3032` | `7D6E0303-4F4F-4D50-8A43-4F58494D3032` |
| G04 | `ESP32-PulseOX-G04` | `7D6E0401-4F4F-4D50-8A43-4F58494D3032` | `7D6E0402-4F4F-4D50-8A43-4F58494D3032` | `7D6E0403-4F4F-4D50-8A43-4F58494D3032` |
| G05 | `ESP32-PulseOX-G05` | `7D6E0501-4F4F-4D50-8A43-4F58494D3032` | `7D6E0502-4F4F-4D50-8A43-4F58494D3032` | `7D6E0503-4F4F-4D50-8A43-4F58494D3032` |
| G06 | `ESP32-PulseOX-G06` | `7D6E0601-4F4F-4D50-8A43-4F58494D3032` | `7D6E0602-4F4F-4D50-8A43-4F58494D3032` | `7D6E0603-4F4F-4D50-8A43-4F58494D3032` |
| G07 | `ESP32-PulseOX-G07` | `7D6E0701-4F4F-4D50-8A43-4F58494D3032` | `7D6E0702-4F4F-4D50-8A43-4F58494D3032` | `7D6E0703-4F4F-4D50-8A43-4F58494D3032` |
| G08 | `ESP32-PulseOX-G08` | `7D6E0801-4F4F-4D50-8A43-4F58494D3032` | `7D6E0802-4F4F-4D50-8A43-4F58494D3032` | `7D6E0803-4F4F-4D50-8A43-4F58494D3032` |
| G09 | `ESP32-PulseOX-G09` | `7D6E0901-4F4F-4D50-8A43-4F58494D3032` | `7D6E0902-4F4F-4D50-8A43-4F58494D3032` | `7D6E0903-4F4F-4D50-8A43-4F58494D3032` |
| G10 | `ESP32-PulseOX-G10` | `7D6E0A01-4F4F-4D50-8A43-4F58494D3032` | `7D6E0A02-4F4F-4D50-8A43-4F58494D3032` | `7D6E0A03-4F4F-4D50-8A43-4F58494D3032` |
| G11 | `ESP32-PulseOX-G11` | `7D6E0B01-4F4F-4D50-8A43-4F58494D3032` | `7D6E0B02-4F4F-4D50-8A43-4F58494D3032` | `7D6E0B03-4F4F-4D50-8A43-4F58494D3032` |
| G12 | `ESP32-PulseOX-G12` | `7D6E0C01-4F4F-4D50-8A43-4F58494D3032` | `7D6E0C02-4F4F-4D50-8A43-4F58494D3032` | `7D6E0C03-4F4F-4D50-8A43-4F58494D3032` |
| G13 | `ESP32-PulseOX-G13` | `7D6E0D01-4F4F-4D50-8A43-4F58494D3032` | `7D6E0D02-4F4F-4D50-8A43-4F58494D3032` | `7D6E0D03-4F4F-4D50-8A43-4F58494D3032` |
| G14 | `ESP32-PulseOX-G14` | `7D6E0E01-4F4F-4D50-8A43-4F58494D3032` | `7D6E0E02-4F4F-4D50-8A43-4F58494D3032` | `7D6E0E03-4F4F-4D50-8A43-4F58494D3032` |

如果要临时增加小组，继续按同样规则扩展即可。例如 G15 可用 `7D6E0F01/02/03...`。

## 4. 学生准备工作

每组需要：

1. Arduino IDE 2.x。
2. ESP32 Arduino core。
3. `MAX3010x Sensor Library` 或与原始代码一致的 MAX30102 库。
4. `NimBLE-Arduino` 库。
5. 微信开发者工具。
6. 一台用于真机调试的手机，手机微信登录本组成员账号。

微信小程序账号有两种做法：

1. 每组注册自己的小程序账号，获得自己的 `AppID`。
2. 如果只做课堂演示，也可以使用测试号或由教师统一添加学生为开发者/体验成员。

如果学生要上传到自己的小程序后台，必须使用他们自己的 `AppID`，并由对应小程序账号授权。

## 5. Arduino 端修改方法

### 5.1 推荐做法

直接使用教师提供的已完成版 `MyPulseoximeterSpO2_1.ino`，然后只改每组参数。

在 Arduino 程序开头附近找到：

```cpp
const char *kBleDeviceName = "ESP32-PulseOX";
const char *kBleServiceUUID = "7d6e0001-4f4f-4d50-8a43-4f58494d3032";
const char *kBleWaveCharacteristicUUID = "7d6e0002-4f4f-4d50-8a43-4f58494d3032";
const char *kBleMetricsCharacteristicUUID = "7d6e0003-4f4f-4d50-8a43-4f58494d3032";
```

按第 3 节参数表替换。例如 G03：

```cpp
const char *kBleDeviceName = "ESP32-PulseOX-G03";
const char *kBleServiceUUID = "7d6e0301-4f4f-4d50-8a43-4f58494d3032";
const char *kBleWaveCharacteristicUUID = "7d6e0302-4f4f-4d50-8a43-4f58494d3032";
const char *kBleMetricsCharacteristicUUID = "7d6e0303-4f4f-4d50-8a43-4f58494d3032";
```

然后编译、烧录到本组 ESP32。

### 5.2 从最初版本手动移植

如果学生只有最初版本 Arduino 程序，需要做这些事：

1. 增加头文件：

```cpp
#include <NimBLEDevice.h>
```

2. 增加 BLE 设备名、Service UUID、Characteristic UUID 常量。
3. 增加 BLE Server、Wave Characteristic、Metrics Characteristic。
4. 在 `setup()` 中调用 `setupBle()`。
5. 原来每 8 个 PPG 点向串口屏发送一次波形时，同时调用：

```cpp
notifyWave(display_val, true);
```

6. 原来算出平均心率和平均 SpO2 并发送到串口屏时，同时调用：

```cpp
notifyMetrics(latestAverageBpm, latestAverageSpo2, true, true);
```

7. 没有检测到手指时，发送空状态：

```cpp
notifyWave(60, false);
notifyMetrics(0, 0, false, false);
```

手动移植容易漏掉回调、广播、特征值长度等细节，所以课堂项目建议直接从教师完成版开始，再由学生理解和标注关键代码。

## 6. 微信小程序端修改方法

### 6.1 更换 AppID

学生导入项目后，需要把 `project.config.json` 里的：

```json
"appid": "wx406a2964a365ca26"
```

改成自己小程序的 `AppID`。

也可以在微信开发者工具导入项目时填写自己的 `AppID`。如果导入后发现仍然是教师 AppID，直接改 `project.config.json` 后重新打开项目。

### 6.2 删除私有配置

如果教师压缩包里不小心带了 `project.private.config.json`，学生可以删除它，再用微信开发者工具重新打开项目。

### 6.3 更换本组 BLE 参数

打开：

```text
miniprogram/pages/index/index.ts
```

找到文件顶部：

```ts
const DEVICE_NAME_PREFIX = 'ESP32-PulseOX'
const SERVICE_UUID = '7D6E0001-4F4F-4D50-8A43-4F58494D3032'
const WAVE_CHARACTERISTIC_UUID = '7D6E0002-4F4F-4D50-8A43-4F58494D3032'
const METRICS_CHARACTERISTIC_UUID = '7D6E0003-4F4F-4D50-8A43-4F58494D3032'
```

按本组参数表修改。例如 G03：

```ts
const DEVICE_NAME_PREFIX = 'ESP32-PulseOX-G03'
const SERVICE_UUID = '7D6E0301-4F4F-4D50-8A43-4F58494D3032'
const WAVE_CHARACTERISTIC_UUID = '7D6E0302-4F4F-4D50-8A43-4F58494D3032'
const METRICS_CHARACTERISTIC_UUID = '7D6E0303-4F4F-4D50-8A43-4F58494D3032'
```

注意：Arduino 端和小程序端必须完全一致。设备名或 UUID 不一致，会出现“搜索不到设备”或“未找到血氧仪服务”。

## 7. BLE 数据协议

本项目使用两个 notify 特征值。

### 7.1 波形数据包

Characteristic：Wave UUID

长度：4 字节

| 字节 | 含义 |
| --- | --- |
| 0 | 包类型，固定 `0x01` |
| 1 | 波形序号，0 到 255 循环 |
| 2 | 波形值，范围 `0-120` |
| 3 | 标志位，bit0 为 `1` 表示检测到手指 |

发送频率约 50 点/秒。

### 7.2 心率和血氧数据包

Characteristic：Metrics UUID

长度：6 字节

| 字节 | 含义 |
| --- | --- |
| 0 | 包类型，固定 `0x02` |
| 1-2 | 心率 bpm，小端序 `uint16` |
| 3 | SpO2，范围 `0-100` |
| 4 | 标志位，bit0 为手指检测，bit1 为指标有效 |
| 5 | 当前波形序号 |

刚放上手指时，心率和 SpO2 需要等待若干次心跳后才会稳定，这是正常现象。

## 8. 真机测试步骤

1. 烧录 ESP32。
2. 打开 Arduino 串口监视器，确认出现：

```text
BLE advertising as ESP32-PulseOX-Gxx
Sensor initialized
```

3. 打开微信开发者工具，导入小程序项目。
4. 确认 `AppID`、设备名、UUID 已经换成本组参数。
5. 点击“编译”。
6. 用“预览”或“真机调试”在手机微信中打开。
7. 手机打开蓝牙。
8. Android 手机通常还需要给微信定位权限，并打开系统定位开关。
9. 小程序点击“连接设备”。
10. 放上手指，观察波形、心率、SpO2。

建议第一次联调时，只打开本组 ESP32 电源。确认无误后，再放到 14 组同时运行的课堂环境中测试。

## 9. 常见问题

### 9.1 小程序搜索不到设备

检查：

- ESP32 是否已经烧录并上电。
- 串口监视器是否显示 BLE advertising。
- 小程序 `DEVICE_NAME_PREFIX` 是否和 Arduino 的 `kBleDeviceName` 一致。
- 手机蓝牙是否打开。
- Android 是否给了微信定位权限，系统定位是否打开。
- 是否正在用微信开发者工具模拟器测试。BLE 必须用真机。

### 9.2 能看到设备，但提示未找到血氧仪服务

通常是 Service UUID 不一致。

检查：

- Arduino 的 `kBleServiceUUID`
- 小程序的 `SERVICE_UUID`

两端必须完全对应。

### 9.3 已连接，但没有波形

检查：

- Wave UUID 是否一致。
- 小程序是否成功订阅 notify。
- 手指是否放到传感器上。
- MAX30102 红光原始值是否超过程序中的 `kFingerThreshold`。

### 9.4 有波形，但心率和 SpO2 一直是 `--`

这是比较常见的算法和佩戴问题。

检查：

- 手指是否稳定覆盖传感器。
- 环境光是否太强。
- 是否刚开始测量，平均值需要等待约 5 次有效心跳。
- 串口屏上的心率和 SpO2 是否已经更新。

### 9.5 Arduino 编译找不到 `NimBLEDevice.h`

检查：

- Arduino IDE 是否安装了 `NimBLE-Arduino`。
- 库是否安装在当前 Arduino sketchbook 的 `libraries` 目录。
- Arduino IDE 是否重启过。
- 板卡是否选为 ESP32 系列。

### 9.6 小程序不能预览或上传

检查：

- `project.config.json` 里的 `appid` 是否是本组自己的。
- 当前微信账号是否是该小程序的开发者或管理员。
- 如果只是课堂演示，是否使用了测试号或被教师添加为体验成员。

## 10. 学生提交建议

每组建议提交：

1. Arduino 工程目录。
2. 微信小程序工程目录。
3. 本组参数说明：

```text
小组：Gxx
AppID：wx...
设备名：ESP32-PulseOX-Gxx
Service UUID：...
Wave UUID：...
Metrics UUID：...
```

4. 真机运行截图或录屏。
5. 简短说明：如何避免和其他组设备互相连接。

## 11. 官方文档参考

- 微信开发者工具下载：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
- 小程序项目配置：https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html
- 微信小程序 BLE 指南：https://developers.weixin.qq.com/miniprogram/dev/framework/device/ble.html
- notify 订阅接口：https://developers.weixin.qq.com/miniprogram/dev/api/device/bluetooth-ble/wx.notifyBLECharacteristicValueChange.html
