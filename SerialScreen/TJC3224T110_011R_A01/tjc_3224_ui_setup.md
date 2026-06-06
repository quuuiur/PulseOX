# TJC3224T110_011R_A01 血氧仪 UI 制作清单

## 1. 工程型号

- 型号：`TJC3224T110_011R_A01`
- 分辨率：`320x240`
- 页面：`page0`
- 波特率：`115200`

## 2. 导入背景图

在 USART HMI 编辑器左下角点 **图片**，点 `+` 导入：

- `tjc_3224_pulseox_background.bmp`

如果你的编辑器支持 PNG，也可以导入：

- `tjc_3224_pulseox_background.png`

## 3. 放背景图片控件

左侧工具箱选择 **图片**，拖到页面上，属性改成：

| 属性 | 值 |
| --- | --- |
| objname | `p0` |
| x | `0` |
| y | `0` |
| w | `320` |
| h | `240` |
| pic | 选择导入的背景图 |

## 4. 心率数字控件

左侧选择 **数字**，放到左上卡片里：

| 属性 | 值 |
| --- | --- |
| objname | `n0` |
| x | `22` |
| y | `68` |
| w | `58` |
| h | `38` |
| val | `0` |
| vscope | `全局` |
| sta | `透明` 或 `切图` |
| pco | 白色 |
| font | 32 到 40 号数字字体 |

## 5. 血氧数字控件

左侧选择 **数字**，放到中间卡片里：

| 属性 | 值 |
| --- | --- |
| objname | `n1` |
| x | `124` |
| y | `68` |
| w | `58` |
| h | `38` |
| val | `0` |
| vscope | `全局` |
| sta | `透明` 或 `切图` |
| pco | 白色 |
| font | 32 到 40 号数字字体 |

## 6. PPG 波形控件

左侧选择 **曲线/波形**，放到底部波形区域：

| 属性 | 值 |
| --- | --- |
| objname | `s0` |
| x | `22` |
| y | `150` |
| w | `276` |
| h | `60` |
| ch | `1` |
| pco0 | 青色 |
| bco | 深色 |
| gdc | 深蓝灰 |

## 7. page0 初始化事件

在底部 **事件** 区，选择 `page0` 的 **初始化事件**，填：

```text
baud=115200
n0.val=0
n1.val=0
cle s0,0
```

## 8. Arduino 对应关系

当前 Arduino 代码已经会发送：

```cpp
Serial2.print("add s0.id,0," + String(display_val) + "\xff\xff\xff");
Serial2.print("n0.val=" + String(latestAverageBpm) + "\xff\xff\xff");
Serial2.print("n1.val=" + String(latestAverageSpo2) + "\xff\xff\xff");
```

所以屏幕里这三个控件名必须保持：

- `s0`：波形
- `n0`：心率
- `n1`：血氧

