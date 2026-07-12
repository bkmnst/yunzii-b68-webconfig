import { allCollections, matchKnownDevice } from './devices'
import {
  buildLiveRgbPayload,
  buildIdentityQueryPayload,
  buildPerKeyRgbPayload,
  LIVE_RGB_REPORT_ID,
  type RgbColor,
  parseModelId,
  unsupportedBattery,
  unsupportedFirmware,
} from './protocol'
import type {
  DiagnosticSnapshot,
  DeviceStatus,
  FirmwareInfo,
  HidReportDescriptor,
  KnownDevice,
  MetricResult,
} from './types'

export class KeyboardTransport extends EventTarget {
  #device: HIDDevice | null = null
  #knownDevice: KnownDevice | null = null
  #collections: HidReportDescriptor[] = []
  #events: string[] = []
  #featureReads: DiagnosticSnapshot['featureReads'] = []
  #inputReports: DiagnosticSnapshot['inputReports'] = []
  #abortController: AbortController | null = null
  #livePayload: Uint8Array<ArrayBuffer> | null = null
  #liveColorTimer: ReturnType<typeof setInterval> | null = null

  get device(): HIDDevice | null { return this.#device }
  get knownDevice(): KnownDevice | null { return this.#knownDevice }
  get collections(): readonly HidReportDescriptor[] { return this.#collections }
  get vendorCollectionCount(): number {
    return this.#collections.filter((collection) => collection.vendorDefined).length
  }
  get livePreviewActive(): boolean { return this.#liveColorTimer !== null }

  async connect(device: HIDDevice): Promise<void> {
    const known = matchKnownDevice(device)
    if (!known) throw new Error('This HID device is not an allowlisted Yunzii B68 device.')
    if (!device.opened) await device.open()

    const collections = allCollections(device)

    this.#abortController?.abort()
    this.#abortController = new AbortController()
    this.#device = device
    this.#knownDevice = known
    this.#collections = collections
    this.#featureReads = []
    this.#inputReports = []
    this.#record(
      `Connected: ${known.connectionType}; ${collections.length} visible collection(s); ${this.vendorCollectionCount} vendor-defined`,
    )
    device.oninputreport = (event) => {
      const bytes = [...new Uint8Array(event.data.buffer, event.data.byteOffset, Math.min(event.data.byteLength, 64))]
      this.#inputReports = [...this.#inputReports.slice(-49), {
        capturedAt: new Date().toISOString(),
        reportId: event.reportId,
        bytes,
      }]
      this.#record(`Input report ${event.reportId}: ${event.data.byteLength} byte(s); ${bytes.map(hexByte).join(' ')}`)
      this.dispatchEvent(new CustomEvent('inputreport', { detail: event }))
    }
    this.dispatchEvent(new Event('statuschange'))
  }

  async disconnect(): Promise<void> {
    const device = this.#device
    this.stopLiveColor()
    this.#abortController?.abort()
    this.#abortController = null
    if (device) device.oninputreport = null
    this.#device = null
    this.#knownDevice = null
    this.#collections = []
    this.#featureReads = []
    this.#inputReports = []
    this.#record('Disconnected')
    if (device?.opened) await device.close()
    this.dispatchEvent(new Event('statuschange'))
  }

  markDisconnected(): void {
    this.stopLiveColor()
    this.#abortController?.abort()
    this.#abortController = null
    if (this.#device) this.#device.oninputreport = null
    this.#device = null
    this.#knownDevice = null
    this.#collections = []
    this.#featureReads = []
    this.#inputReports = []
    this.#record('Device disconnected')
    this.dispatchEvent(new Event('statuschange'))
  }

  async queryFirmware(): Promise<MetricResult<FirmwareInfo>> {
    if (!this.#device?.opened) return { state: 'disconnected', message: 'Connect the keyboard first.' }
    const supportsReport5 = this.#collections.some((collection) =>
      collection.featureReports.some((report) => report.reportId === 5),
    )
    if (supportsReport5) await this.#readDiagnosticFeatureReport(5)

    const supportsReport6 = this.#collections.some((collection) =>
      collection.featureReports.some((report) => report.reportId === 6 && report.byteLength >= 519),
    )
    if (!supportsReport6) {
      const report5 = this.#featureReads.find((read) => read.reportId === 5)
      if (report5?.result === 'ok') {
        return {
          state: 'invalid-response',
          message: 'Feature report 5 was read successfully; its firmware encoding is not decoded yet.',
          raw: report5.bytes ?? [],
        }
      }
      if (report5?.result === 'error') {
        return { state: 'invalid-response', message: `Feature report 5 failed: ${report5.message}`, raw: [] }
      }
      return unsupportedFirmware()
    }

    try {
      await this.#device.sendFeatureReport(6, buildIdentityQueryPayload())
      const view = await this.#device.receiveFeatureReport(6)
      const bytes = [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)]
      const modelId = parseModelId(view)
      const modelHex = `0x${modelId.toString(16).padStart(2, '0').toUpperCase()}`
      this.#featureReads = [
        ...this.#featureReads.filter((read) => read.reportId !== 6),
        { reportId: 6, result: 'ok', bytes, message: `Identity response; model ID ${modelHex}` },
      ]
      this.#record(`Identity report read: model ${modelHex}; ${bytes.length} byte(s)`)
      return {
        state: 'invalid-response',
        message: `Model ID ${modelHex} identified; firmware encoding is being decoded.`,
        raw: bytes,
      }
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      this.#featureReads = [
        ...this.#featureReads.filter((read) => read.reportId !== 6),
        { reportId: 6, result: 'error', message },
      ]
      this.#record(`Identity report failed: ${message}`)
      return { state: 'invalid-response', message: `Identity query failed: ${message}`, raw: [] }
    }
  }

  async queryBattery(): Promise<MetricResult<number>> {
    if (!this.#device?.opened || !this.#knownDevice) {
      return { state: 'disconnected', message: 'Connect the keyboard first.' }
    }
    return unsupportedBattery(this.#knownDevice.connectionType)
  }

  async setLiveColor(color: RgbColor): Promise<void> {
    this.#assertLiveRgbSupport()
    this.stopLiveColor()
    this.#livePayload = buildLiveRgbPayload(color)
    await this.#sendLiveColorFrame()
    this.#startLiveRgbKeepalive()
    this.#record(`Live RGB preview started: ${color.red},${color.green},${color.blue}`)
    this.dispatchEvent(new Event('statuschange'))
  }

  #startLiveRgbKeepalive(): void {
    this.#liveColorTimer = globalThis.setInterval(() => {
      void this.#sendLiveColorFrame().catch((error: unknown) => {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        this.#record(`Live RGB keepalive failed: ${message}`)
        this.stopLiveColor()
        this.dispatchEvent(new CustomEvent('transporterror', { detail: message }))
      })
    }, 750)
  }

  async setLiveKeyColors(colors: ReadonlyMap<number, RgbColor>): Promise<void> {
    this.#assertLiveRgbSupport()
    this.stopLiveColor()
    this.#livePayload = buildPerKeyRgbPayload(colors)
    await this.#sendLiveColorFrame()
    this.#startLiveRgbKeepalive()
    this.#record(`Per-key RGB preview started: ${colors.size} colored key(s)`)
    this.dispatchEvent(new Event('statuschange'))
  }

  stopLiveColor(): void {
    if (this.#liveColorTimer !== null) globalThis.clearInterval(this.#liveColorTimer)
    const wasActive = this.#liveColorTimer !== null || this.#livePayload !== null
    this.#liveColorTimer = null
    this.#livePayload = null
    if (wasActive) {
      this.#record('Live RGB preview stopped; waiting for onboard effect to resume')
      this.dispatchEvent(new Event('statuschange'))
    }
  }

  status(): DeviceStatus {
    const connected = Boolean(this.#device?.opened && this.#knownDevice)
    const disconnected = { state: 'disconnected', message: 'Connect the keyboard first.' } as const
    return {
      connected,
      knownDevice: this.#knownDevice,
      productName: this.#device?.productName ?? null,
      firmware: connected ? unsupportedFirmware() : disconnected,
      battery: connected && this.#knownDevice ? unsupportedBattery(this.#knownDevice.connectionType) : disconnected,
      lastRefresh: null,
    }
  }

  diagnostics(): DiagnosticSnapshot | null {
    if (!this.#device || !this.#knownDevice) return null
    return {
      generatedAt: new Date().toISOString(),
      device: {
        connectionType: this.#knownDevice.connectionType,
        vendorId: `0x${this.#device.vendorId.toString(16).padStart(4, '0').toUpperCase()}`,
        productId: `0x${this.#device.productId.toString(16).padStart(4, '0').toUpperCase()}`,
        productName: this.#device.productName || this.#knownDevice.displayName,
      },
      collections: this.#collections,
      vendorCollectionCount: this.vendorCollectionCount,
      featureReads: this.#featureReads,
      inputReports: this.#inputReports,
      events: this.#events.slice(-25),
    }
  }

  #record(message: string): void {
    this.#events.push(`${new Date().toISOString()} ${message}`)
    if (this.#events.length > 100) this.#events.shift()
  }

  async #readDiagnosticFeatureReport(reportId: number): Promise<void> {
    if (!this.#device?.opened) return
    try {
      const view = await this.#device.receiveFeatureReport(reportId)
      const bytes = [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)]
      this.#featureReads = [
        ...this.#featureReads.filter((read) => read.reportId !== reportId),
        { reportId, result: 'ok', bytes },
      ]
      this.#record(`Feature report ${reportId} read: ${bytes.length} byte(s)`)
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      this.#featureReads = [
        ...this.#featureReads.filter((read) => read.reportId !== reportId),
        { reportId, result: 'error', message },
      ]
      this.#record(`Feature report ${reportId} failed: ${message}`)
    }
  }

  async #sendLiveColorFrame(): Promise<void> {
    if (!this.#device?.opened || !this.#livePayload) {
      throw new DOMException('The live RGB device is disconnected.', 'InvalidStateError')
    }
    await this.#device.sendFeatureReport(LIVE_RGB_REPORT_ID, this.#livePayload)
  }

  #assertLiveRgbSupport(): void {
    if (!this.#device?.opened) throw new DOMException('Connect the keyboard first.', 'InvalidStateError')
    const supportsLiveRgb = this.#collections.some((collection) =>
      collection.featureReports.some((report) =>
        report.reportId === LIVE_RGB_REPORT_ID && report.byteLength >= 519,
      ),
    )
    if (!supportsLiveRgb) {
      throw new DOMException('The connected interface does not expose the B68 live RGB report.', 'NotSupportedError')
    }
  }
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase()
}
