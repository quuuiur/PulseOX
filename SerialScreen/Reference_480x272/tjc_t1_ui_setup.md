# 淘晶驰 T1 4.3 寸 480x272 血氧仪 UI 制作清单

## 1. 工程参数

- 屏幕型号：TJC T1 4.3 寸
- 分辨率：480x272
- 页面：`page0`
- 串口波特率：115200
- 动态控件名必须保留：`n0`、`n1`、`s0`

## 2. 导入背景图

把下面任意一个文件导入 USART HMI 编辑器的图片资源：

- `tjc_t1_480x272_pulseox_background.png`
- `tjc_t1_480x272_pulseox_background.bmp`

推荐优先用 PNG；如果编辑器不支持 PNG，就用 BMP。

然后在 `page0` 放一个图片控件：

| 属性 | 值 |
| --- | --- |
| objname | `p0` |
| x | `0` |
| y | `0` |
| w | `480` |
| h | `272` |
| pic | 选择刚导入的背景图 |

## 3. 心率数字控件

新建数字控件：

| 属性 | 值 |
| --- | --- |
| objname | `n0` |
| x | `30` |
| y | `90` |
| w | `78` |
| h | `52` |
| val | `0` |
| vscope | `global` |
| sta | `crop image` 或 `transparent` |
| bco | 深色/透明 |
| pco | 白色 |
| font | 选择 48 到 56 号粗体数字字体 |

Arduino 已经会发送：

```text
n0.val=心率
```

## 4. 血氧数字控件

新建数字控件：

| 属性 | 值 |
| --- | --- |
| objname | `n1` |
| x | `188` |
| y | `90` |
| w | `78` |
| h | `52` |
| val | `0` |
| vscope | `global` |
| sta | `crop image` 或 `transparent` |
| bco | 深色/透明 |
| pco | 白色 |
| font | 选择 48 到 56 号粗体数字字体 |

Arduino 已经会发送：

```text
n1.val=血氧
```

## 5. PPG 波形控件

新建波形控件：

| 属性 | 值 |
| --- | --- |
| objname | `s0` |
| x | `30` |
| y | `184` |
| w | `420` |
| h | `60` |
| ch | `1` |
| dir | 从左到右 |
| bco | 深色 |
| gdc | 暗蓝灰 |
| pco0 | 青色 |

Arduino 已经会发送：

```text
add s0.id,0,波形值
```

## 6. 页面初始化脚本

在 `page0` 的初始化事件里写：

```text
baud=115200
n0.val=0
n1.val=0
cle s0,0
```

如果你的编辑器不允许在页面初始化里设置 `baud`，就在工程或系统设置里把串口波特率设为 `115200`。

## 7. 推荐显示效果

- 背景：深蓝黑医疗监护风格
- 心率：红色标签，白色大数字
- 血氧：绿色标签，白色大数字
- 波形：青色曲线，暗色网格
- 状态区：右上角显示 BLE 和 Ready

## 8. 注意

这套 UI 和当前 Arduino 代码兼容，不需要改这三行：

```cpp
Serial2.print("add s0.id,0," + String(display_val) + "\xff\xff\xff");
Serial2.print("n0.val=" + String(latestAverageBpm) + "\xff\xff\xff");
Serial2.print("n1.val=" + String(latestAverageSpo2) + "\xff\xff\xff");
```

