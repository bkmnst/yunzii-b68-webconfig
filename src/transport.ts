import { allCollections, matchKnownDevice } from './devices'
import { unsupportedBattery, unsupportedFirmware } from './protocol'
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
  #abortController: AbortController | null = null

  get device(): HIDDevice | null { return this.#device }
  get knownDevice(): KnownDevice | null { return this.#knownDevice }
  get collections(): readonly HidReportDescriptor[] { return this.#collections }
  get vendorCollectionCount(): number {
    return this.#collections.filter((collection) => collection.vendorDefined).length
  }

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
    this.#record(
      `Connected: ${known.connectionType}; ${collections.length} visible collection(s); ${this.vendorCollectionCount} vendor-defined`,
    )
    device.oninputreport = (event) => {
      this.#record(`Input report ${event.reportId}: ${event.data.byteLength} byte(s)`)
      this.dispatchEvent(new CustomEvent('inputreport', { detail: event }))
    }
    this.dispatchEvent(new Event('statuschange'))
  }

  async disconnect(): Promise<void> {
    const device = this.#device
    this.#abortController?.abort()
    this.#abortController = null
    if (device) device.oninputreport = null
    this.#device = null
    this.#knownDevice = null
    this.#collections = []
    this.#featureReads = []
    this.#record('Disconnected')
    if (device?.opened) await device.close()
    this.dispatchEvent(new Event('statuschange'))
  }

  markDisconnected(): void {
    this.#abortController?.abort()
    this.#abortController = null
    if (this.#device) this.#device.oninputreport = null
    this.#device = null
    this.#knownDevice = null
    this.#collections = []
    this.#featureReads = []
    this.#record('Device disconnected')
    this.dispatchEvent(new Event('statuschange'))
  }

  async queryFirmware(): Promise<MetricResult<FirmwareInfo>> {
    if (!this.#device?.opened) return { state: 'disconnected', message: 'Connect the keyboard first.' }
    const supportsReport5 = this.#collections.some((collection) =>
      collection.featureReports.some((report) => report.reportId === 5),
    )
    if (!supportsReport5) return unsupportedFirmware()

    try {
      const view = await this.#device.receiveFeatureReport(5)
      const bytes = [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)]
      this.#featureReads = [
        ...this.#featureReads.filter((read) => read.reportId !== 5),
        { reportId: 5, result: 'ok', bytes },
      ]
      this.#record(`Feature report 5 read: ${bytes.length} byte(s)`)
      return {
        state: 'invalid-response',
        message: 'Feature report 5 was read successfully; its firmware encoding is not decoded yet.',
        raw: bytes,
      }
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      this.#featureReads = [
        ...this.#featureReads.filter((read) => read.reportId !== 5),
        { reportId: 5, result: 'error', message },
      ]
      this.#record(`Feature report 5 failed: ${message}`)
      return { state: 'invalid-response', message: `Feature report 5 failed: ${message}`, raw: [] }
    }
  }

  async queryBattery(): Promise<MetricResult<number>> {
    if (!this.#device?.opened || !this.#knownDevice) {
      return { state: 'disconnected', message: 'Connect the keyboard first.' }
    }
    return unsupportedBattery(this.#knownDevice.connectionType)
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
      events: this.#events.slice(-25),
    }
  }

  #record(message: string): void {
    this.#events.push(`${new Date().toISOString()} ${message}`)
    if (this.#events.length > 100) this.#events.shift()
  }
}
