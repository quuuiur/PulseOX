const DEVICE_NAME_PREFIX = 'ESP32-PulseOX-G07'
const SERVICE_UUID = '7D6E0701-4F4F-4D50-8A43-4F58494D3032'
const WAVE_CHARACTERISTIC_UUID = '7D6E0702-4F4F-4D50-8A43-4F58494D3032'
const METRICS_CHARACTERISTIC_UUID = '7D6E0703-4F4F-4D50-8A43-4F58494D3032'
const WAVE_POINT_COUNT = 160
const DEFAULT_WAVE_VALUE = 60
const CANVAS_FALLBACK_WIDTH = 320
const CANVAS_FALLBACK_HEIGHT = 180

type DeviceListItem = {
  deviceId: string
  name: string
  rssi: number
}

type ErrorResult = WechatMiniprogram.GeneralCallbackResult & {
  errCode?: number
}

const wavePoints: number[] = Array.from(
  { length: WAVE_POINT_COUNT },
  () => DEFAULT_WAVE_VALUE
)

let canvasContext: WechatMiniprogram.CanvasContext | null = null
let canvasWidth = CANVAS_FALLBACK_WIDTH
let canvasHeight = CANVAS_FALLBACK_HEIGHT
let bluetoothDeviceFoundHandler: WechatMiniprogram.OnBluetoothDeviceFoundCallback | null = null
let bleValueChangeHandler: WechatMiniprogram.OnBLECharacteristicValueChangeCallback | null = null
let connectedDeviceId = ''
let connectedServiceId = ''
let waveCharacteristicId = ''
let metricsCharacteristicId = ''
let connecting = false
let connectedAt = 0
let elapsedTimer: ReturnType<typeof setInterval> | null = null
let lastPacketUiUpdate = 0

function normalizeUuid(uuid: string): string {
  return uuid.toUpperCase()
}

function getErrorText(res: ErrorResult): string {
  return res.errCode === undefined ? res.errMsg : `${res.errMsg} (${res.errCode})`
}

function getDeviceName(device: WechatMiniprogram.BlueToothDevice): string {
  return device.name || device.localName || 'Unnamed BLE'
}

function toDeviceListItem(device: WechatMiniprogram.BlueToothDevice): DeviceListItem {
  return {
    deviceId: device.deviceId,
    name: getDeviceName(device),
    rssi: device.RSSI || 0,
  }
}

function isPulseOxDevice(device: DeviceListItem): boolean {
  return device.name.indexOf(DEVICE_NAME_PREFIX) >= 0
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`
}

function resetWavePoints(): void {
  for (let index = 0; index < wavePoints.length; index += 1) {
    wavePoints[index] = DEFAULT_WAVE_VALUE
  }
}

function clearElapsedTimer(): void {
  if (elapsedTimer !== null) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

Component({
  data: {
    deviceName: DEVICE_NAME_PREFIX,
    statusText: '未连接',
    signalText: '等待连接',
    elapsedText: '00:00',
    heartRate: '--',
    spo2: '--',
    lastPacketText: '--',
    isScanning: false,
    isConnected: false,
    fingerDetected: false,
    devices: [] as DeviceListItem[],
  },

  lifetimes: {
    ready() {
      this.initCanvas()
    },

    detached() {
      this.cleanupBluetooth()
    },
  },

  methods: {
    initCanvas() {
      canvasContext = wx.createCanvasContext('waveCanvas', this)

      wx.createSelectorQuery()
        .in(this)
        .select('#waveCanvas')
        .boundingClientRect((rect) => {
          const box = rect as WechatMiniprogram.BoundingClientRectCallbackResult | null
          if (box) {
            canvasWidth = box.width || CANVAS_FALLBACK_WIDTH
            canvasHeight = box.height || CANVAS_FALLBACK_HEIGHT
          }
          this.drawWave()
        })
        .exec()
    },

    startScan() {
      if (this.data.isConnected || connecting) {
        return
      }

      this.setData({
        statusText: '正在初始化蓝牙',
        signalText: '搜索设备',
        isScanning: true,
        devices: [],
      })

      wx.openBluetoothAdapter({
        mode: 'central',
        success: () => {
          this.bindBluetoothDiscovery()
          wx.startBluetoothDevicesDiscovery({
            allowDuplicatesKey: true,
            success: () => {
              this.setData({
                statusText: `正在搜索 ${DEVICE_NAME_PREFIX}`,
                isScanning: true,
              })
            },
            fail: (res) => {
              this.setData({
                statusText: `搜索失败：${getErrorText(res as ErrorResult)}`,
                signalText: '搜索失败',
                isScanning: false,
              })
            },
          })
        },
        fail: (res) => {
          this.setData({
            statusText: `蓝牙不可用：${getErrorText(res as ErrorResult)}`,
            signalText: '请打开蓝牙权限',
            isScanning: false,
          })
        },
      })
    },

    bindBluetoothDiscovery() {
      if (bluetoothDeviceFoundHandler) {
        wx.offBluetoothDeviceFound(bluetoothDeviceFoundHandler)
      }

      bluetoothDeviceFoundHandler = (res) => {
        this.handleDeviceFound(res)
      }
      wx.onBluetoothDeviceFound(bluetoothDeviceFoundHandler)
    },

    handleDeviceFound(res: WechatMiniprogram.OnBluetoothDeviceFoundCallbackResult) {
      const currentDevices = this.data.devices as DeviceListItem[]
      const nextDevices = currentDevices.slice()
      let firstPulseOxDevice: DeviceListItem | null = null

      for (const device of res.devices) {
        const item = toDeviceListItem(device)
        if (!item.name || item.name === 'Unnamed BLE') {
          continue
        }

        const existingIndex = nextDevices.findIndex(
          (savedDevice) => savedDevice.deviceId === item.deviceId
        )
        if (existingIndex >= 0) {
          nextDevices[existingIndex] = item
        } else {
          nextDevices.push(item)
        }

        if (firstPulseOxDevice === null && isPulseOxDevice(item)) {
          firstPulseOxDevice = item
        }
      }

      nextDevices.sort((left, right) => right.rssi - left.rssi)
      this.setData({ devices: nextDevices.slice(0, 8) })

      if (firstPulseOxDevice !== null && !connecting && !this.data.isConnected) {
        this.connectDevice(firstPulseOxDevice.deviceId, firstPulseOxDevice.name)
      }
    },

    connectFromList(e: WechatMiniprogram.TouchEvent) {
      const deviceId = String(e.currentTarget.dataset.deviceId || '')
      const name = String(e.currentTarget.dataset.name || DEVICE_NAME_PREFIX)
      if (!deviceId) {
        return
      }
      this.connectDevice(deviceId, name)
    },

    connectDevice(deviceId: string, name: string) {
      if (connecting || this.data.isConnected) {
        return
      }

      connecting = true
      connectedDeviceId = deviceId
      this.setData({
        deviceName: name,
        statusText: '正在连接设备',
        signalText: '连接中',
      })

      wx.stopBluetoothDevicesDiscovery({
        complete: () => {
          this.setData({ isScanning: false })
        },
      })

      wx.createBLEConnection({
        deviceId,
        timeout: 10000,
        success: () => {
          this.setData({
            isConnected: true,
            statusText: '已连接，正在发现服务',
            signalText: '发现服务',
          })
          this.startElapsedTimer()
          setTimeout(() => {
            this.discoverServices()
          }, 500)
        },
        fail: (res) => {
          connecting = false
          connectedDeviceId = ''
          this.setData({
            isConnected: false,
            statusText: `连接失败：${getErrorText(res as ErrorResult)}`,
            signalText: '连接失败',
          })
        },
      })
    },

    discoverServices() {
      wx.getBLEDeviceServices({
        deviceId: connectedDeviceId,
        success: (res) => {
          const service = res.services.find(
            (item) => normalizeUuid(item.uuid) === SERVICE_UUID
          )

          if (!service) {
            connecting = false
            this.setData({
              statusText: '未找到血氧仪服务',
              signalText: '服务未匹配',
            })
            return
          }

          connectedServiceId = service.uuid
          this.discoverCharacteristics()
        },
        fail: (res) => {
          connecting = false
          this.setData({
            statusText: `获取服务失败：${getErrorText(res as ErrorResult)}`,
            signalText: '服务失败',
          })
        },
      })
    },

    discoverCharacteristics() {
      wx.getBLEDeviceCharacteristics({
        deviceId: connectedDeviceId,
        serviceId: connectedServiceId,
        success: (res) => {
          const wave = res.characteristics.find(
            (item) => normalizeUuid(item.uuid) === WAVE_CHARACTERISTIC_UUID
          )
          const metrics = res.characteristics.find(
            (item) => normalizeUuid(item.uuid) === METRICS_CHARACTERISTIC_UUID
          )

          if (!wave || !metrics) {
            connecting = false
            this.setData({
              statusText: '未找到波形或指标特征值',
              signalText: '特征未匹配',
            })
            return
          }

          waveCharacteristicId = wave.uuid
          metricsCharacteristicId = metrics.uuid
          this.subscribeNotifications()
        },
        fail: (res) => {
          connecting = false
          this.setData({
            statusText: `获取特征失败：${getErrorText(res as ErrorResult)}`,
            signalText: '特征失败',
          })
        },
      })
    },

    subscribeNotifications() {
      if (bleValueChangeHandler) {
        wx.offBLECharacteristicValueChange(bleValueChangeHandler)
      }

      bleValueChangeHandler = (result) => {
        this.handleBleValueChange(result)
      }
      wx.onBLECharacteristicValueChange(bleValueChangeHandler)

      this.enableNotify(waveCharacteristicId, () => {
        this.enableNotify(metricsCharacteristicId, () => {
          connecting = false
          this.setData({
            statusText: '已连接，等待测量数据',
            signalText: '等待手指',
          })
        })
      })
    },

    enableNotify(characteristicId: string, onSuccess: () => void) {
      wx.notifyBLECharacteristicValueChange({
        deviceId: connectedDeviceId,
        serviceId: connectedServiceId,
        characteristicId,
        state: true,
        type: 'notification',
        success: onSuccess,
        fail: (res) => {
          connecting = false
          this.setData({
            statusText: `订阅失败：${getErrorText(res as ErrorResult)}`,
            signalText: '订阅失败',
          })
        },
      })
    },

    handleBleValueChange(result: WechatMiniprogram.OnBLECharacteristicValueChangeCallbackResult) {
      const characteristicId = normalizeUuid(result.characteristicId)
      const view = new DataView(result.value)

      if (view.byteLength < 1) {
        return
      }

      if (characteristicId === WAVE_CHARACTERISTIC_UUID) {
        this.handleWavePacket(view)
      } else if (characteristicId === METRICS_CHARACTERISTIC_UUID) {
        this.handleMetricsPacket(view)
      }
    },

    handleWavePacket(view: DataView) {
      if (view.byteLength < 4 || view.getUint8(0) !== 0x01) {
        return
      }

      const waveValue = view.getUint8(2)
      const fingerDetected = (view.getUint8(3) & 0x01) !== 0
      wavePoints.shift()
      wavePoints.push(waveValue)
      this.drawWave()

      const now = Date.now()
      if (now - lastPacketUiUpdate > 500) {
        lastPacketUiUpdate = now
        this.setData({
          fingerDetected,
          lastPacketText: new Date(now).toLocaleTimeString(),
          signalText: fingerDetected ? '测量中' : '未检测到手指',
        })
      }
    },

    handleMetricsPacket(view: DataView) {
      if (view.byteLength < 6 || view.getUint8(0) !== 0x02) {
        return
      }

      const bpm = view.getUint16(1, true)
      const spo2 = view.getUint8(3)
      const flags = view.getUint8(4)
      const fingerDetected = (flags & 0x01) !== 0
      const metricsReady = (flags & 0x02) !== 0

      this.setData({
        heartRate: metricsReady && bpm > 0 ? String(bpm) : '--',
        spo2: metricsReady && spo2 > 0 ? String(spo2) : '--',
        fingerDetected,
        signalText: fingerDetected
          ? metricsReady
            ? '测量稳定'
            : '测量中'
          : '未检测到手指',
        lastPacketText: new Date().toLocaleTimeString(),
      })
    },

    startElapsedTimer() {
      clearElapsedTimer()
      connectedAt = Date.now()
      this.setData({ elapsedText: '00:00' })
      elapsedTimer = setInterval(() => {
        this.updateElapsed()
      }, 1000)
    },

    updateElapsed() {
      if (connectedAt === 0) {
        return
      }
      this.setData({
        elapsedText: formatElapsed(Date.now() - connectedAt),
      })
    },

    drawWave() {
      if (canvasContext === null) {
        return
      }

      const ctx = canvasContext
      const width = canvasWidth || CANVAS_FALLBACK_WIDTH
      const height = canvasHeight || CANVAS_FALLBACK_HEIGHT
      const paddingX = 10
      const paddingY = 16
      const plotWidth = width - paddingX * 2
      const plotHeight = height - paddingY * 2

      ctx.clearRect(0, 0, width, height)
      ctx.setFillStyle('#ffffff')
      ctx.fillRect(0, 0, width, height)

      ctx.setStrokeStyle('#e3edf2')
      ctx.setLineWidth(1)
      for (let index = 1; index < 4; index += 1) {
        const y = paddingY + (plotHeight * index) / 4
        ctx.beginPath()
        ctx.moveTo(paddingX, y)
        ctx.lineTo(width - paddingX, y)
        ctx.stroke()
      }

      ctx.setStrokeStyle('#22a6c7')
      ctx.setLineWidth(2)
      ctx.beginPath()
      wavePoints.forEach((point, index) => {
        const x = paddingX + (plotWidth * index) / (wavePoints.length - 1)
        const normalized = Math.max(0, Math.min(120, point)) / 120
        const y = paddingY + plotHeight - normalized * plotHeight
        if (index === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })
      ctx.stroke()
      ctx.draw(false)
    },

    disconnect() {
      this.cleanupBluetooth()
      this.setData({
        statusText: '已断开',
        signalText: '等待连接',
      })
    },

    cleanupBluetooth() {
      connecting = false
      clearElapsedTimer()

      if (bluetoothDeviceFoundHandler) {
        wx.offBluetoothDeviceFound(bluetoothDeviceFoundHandler)
        bluetoothDeviceFoundHandler = null
      }
      if (bleValueChangeHandler) {
        wx.offBLECharacteristicValueChange(bleValueChangeHandler)
        bleValueChangeHandler = null
      }

      wx.stopBluetoothDevicesDiscovery({})
      if (connectedDeviceId) {
        wx.closeBLEConnection({ deviceId: connectedDeviceId })
      }
      wx.closeBluetoothAdapter({})

      connectedDeviceId = ''
      connectedServiceId = ''
      waveCharacteristicId = ''
      metricsCharacteristicId = ''
      connectedAt = 0
      resetWavePoints()
      this.drawWave()

      this.setData({
        isScanning: false,
        isConnected: false,
        fingerDetected: false,
        heartRate: '--',
        spo2: '--',
        elapsedText: '00:00',
        lastPacketText: '--',
      })
    },
  },
})
