import { allCollections, matchKnownDevice } from './devices'
import { deriveDeviceCapabilities } from './capabilities'
import { buildSetConfigurationPayload, parseB68OnboardConfiguration, type B68OnboardConfiguration } from './configuration'
import {
  B68_MATRIX_CRC_INDEX,
  buildGetMatrixPayload,
  buildSetMatrixPayload,
  encodeMatrixLayer,
  matrixLayersEqual,
  parseMatrixResponse,
  type B68Layer,
  type B68MatrixLayer,
} from './matrix'
import {
  buildLiveRgbPayload,
  buildGetOnboardLightingPayload,
  buildPerKeyRgbPayload,
  LIVE_RGB_REPORT_ID,
  type RgbColor,
  parseOnboardLightingResponse,
} from './protocol'
import type {
  DiagnosticSnapshot,
  DeviceStatus,
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
  #configuration: MetricResult<B68OnboardConfiguration> = { state: 'unsupported', message: 'Onboard configuration has not been read yet.' }
  #matrices = new Map<B68Layer, B68MatrixLayer>()

  get device(): HIDDevice | null { return this.#device }
  get knownDevice(): KnownDevice | null { return this.#knownDevice }
  get collections(): readonly HidReportDescriptor[] { return this.#collections }
  get vendorCollectionCount(): number {
    return this.#collections.filter((collection) => collection.vendorDefined).length
  }
  get livePreviewActive(): boolean { return this.#liveColorTimer !== null }
  matrix(layer: B68Layer): B68MatrixLayer | undefined { return this.#matrices.get(layer) }
  get capabilities() { return deriveDeviceCapabilities(this.#knownDevice, this.#collections) }

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
    this.#configuration = { state: 'unsupported', message: 'Onboard configuration has not been read yet.' }
    this.#matrices.clear()
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
    this.#configuration = { state: 'disconnected', message: 'Connect the keyboard first.' }
    this.#matrices.clear()
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
    this.#configuration = { state: 'disconnected', message: 'Connect the keyboard first.' }
    this.#matrices.clear()
    this.#record('Device disconnected')
    this.dispatchEvent(new Event('statuschange'))
  }

  async inspectOnboardLighting(): Promise<void> {
    if (!this.#device?.opened || !this.capabilities.debounce) return
    const supportsReport6 = this.#collections.some((collection) =>
      collection.featureReports.some((report) => report.reportId === 6 && report.byteLength >= 519),
    )
    if (!supportsReport6) return

    let bytes: number[] = []
    try {
      await this.#device.sendFeatureReport(6, buildGetOnboardLightingPayload())
      await new Promise((resolve) => globalThis.setTimeout(resolve, 20))
      const view = await this.#device.receiveFeatureReport(6)
      bytes = [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)]
      const lighting = parseOnboardLightingResponse(view)
      const configuration = parseB68OnboardConfiguration(lighting)
      this.#configuration = { state: 'available', value: configuration, raw: configuration.raw }
      this.#featureReads = [...this.#featureReads, {
        reportId: 6,
        result: 'ok',
        bytes,
        message: `GetLED validated; debounce ${configuration.debounceMs} ms; ${configuration.effectName}`,
      }]
      this.#record(`GetLED report read and validated: ${lighting.length} data byte(s)`)
      this.dispatchEvent(new Event('statuschange'))
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      this.#featureReads = [...this.#featureReads, {
        reportId: 6,
        result: 'error',
        bytes,
        message: `GetLED: ${message}`,
      }]
      this.#record(`GetLED report failed: ${message}`)
      this.#configuration = { state: 'invalid-response', message, raw: bytes }
      this.dispatchEvent(new Event('statuschange'))
    }
  }

  async applyDebounce(debounceMs: number): Promise<void> {
    if (!this.#device?.opened || !this.capabilities.debounce) {
      throw new Error('Debounce is unavailable for this connection.')
    }
    if (this.#configuration.state !== 'available') {
      throw new Error('Read and validate the onboard configuration before changing debounce.')
    }
    const payload = buildSetConfigurationPayload(this.#configuration.value, { debounceMs })
    this.stopLiveColor()
    await this.#device.sendFeatureReport(6, payload)
    await new Promise((resolve) => globalThis.setTimeout(resolve, 60))
    await this.inspectOnboardLighting()
    if (this.#configuration.state !== 'available' || this.#configuration.value.debounceMs !== debounceMs) {
      this.#record(`Debounce write readback mismatch; requested ${debounceMs} ms`)
      throw new Error('The keyboard readback did not confirm the requested debounce setting.')
    }
    this.#record(`Debounce write verified: ${debounceMs} ms`)
  }

  async applyOnboardEffect(hardwareEffectId: number): Promise<void> {
    if (!this.#device?.opened || !this.capabilities.onboardEffects) {
      throw new Error('Onboard effects are unavailable for this connection.')
    }
    if (this.#configuration.state !== 'available') {
      throw new Error('Read and validate the onboard configuration before changing its effect.')
    }
    const payload = buildSetConfigurationPayload(this.#configuration.value, { hardwareEffectId })
    this.stopLiveColor()
    await this.#device.sendFeatureReport(6, payload)
    await new Promise((resolve) => globalThis.setTimeout(resolve, 60))
    await this.inspectOnboardLighting()
    if (this.#configuration.state !== 'available' || this.#configuration.value.hardwareEffectId !== hardwareEffectId) {
      this.#record(`Onboard effect write readback mismatch; requested ID ${hardwareEffectId}`)
      throw new Error('The keyboard readback did not confirm the requested onboard effect.')
    }
    this.#record(`Onboard effect write verified: ID ${hardwareEffectId}`)
  }

  async inspectMatrix(layer: B68Layer): Promise<void> {
    if (!this.#device?.opened || !this.capabilities.keymap) return
    const supportsReport6 = this.#collections.some((collection) =>
      collection.featureReports.some((report) => report.reportId === 6 && report.byteLength >= 519),
    )
    if (!supportsReport6) return

    let bytes: number[] = []
    try {
      await this.#device.sendFeatureReport(6, buildGetMatrixPayload(layer))
      await new Promise((resolve) => globalThis.setTimeout(resolve, 20))
      const view = await this.#device.receiveFeatureReport(6)
      bytes = [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)]
      const matrix = parseMatrixResponse(layer, view)
      this.#matrices.set(layer, matrix)
      const assigned = matrix.assignments.slice(0, 127).filter((assignment) => assignment.bytes.some((byte) => byte !== 0)).length
      this.#featureReads = [...this.#featureReads, {
        reportId: 6,
        result: 'ok',
        bytes,
        message: `GetMatrix(${layer}) validated; ${assigned}/127 nonzero assignments; CRC marker valid`,
      }]
      this.#record(`${layer} matrix read and validated: ${assigned}/127 nonzero assignments; CRC marker valid`)
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      this.#featureReads = [...this.#featureReads, {
        reportId: 6,
        result: 'error',
        bytes,
        message: `GetMatrix(${layer}): ${message}`,
      }]
      this.#record(`${layer} matrix read failed: ${message}`)
    }
  }

  /** Writes one complete typed layer, then requires an exact full-layer readback before accepting it. */
  async applyMatrixLayer(matrix: B68MatrixLayer): Promise<void> {
    if (!this.#device?.opened || !this.capabilities.keymap) {
      throw new Error('Key remapping is unavailable for this connection.')
    }
    const baseline = this.#matrices.get(matrix.layer)
    if (!baseline) throw new Error('Read and validate this complete keymap layer before changing it.')
    encodeMatrixLayer(matrix)
    for (let index = 96; index < B68_MATRIX_CRC_INDEX; index += 1) {
      if (!matrix.assignments[index].bytes.every((byte, offset) => byte === baseline.assignments[index].bytes[offset])) {
        throw new Error('Reserved matrix entries must remain unchanged from the validated hardware read.')
      }
    }

    this.stopLiveColor()
    await this.#device.sendFeatureReport(6, buildSetMatrixPayload(matrix))
    await new Promise((resolve) => globalThis.setTimeout(resolve, 60))
    await this.#device.sendFeatureReport(6, buildGetMatrixPayload(matrix.layer))
    await new Promise((resolve) => globalThis.setTimeout(resolve, 20))
    const view = await this.#device.receiveFeatureReport(6)
    const readback = parseMatrixResponse(matrix.layer, view)
    if (!matrixLayersEqual(matrix, readback)) {
      this.#record(`${matrix.layer} matrix write readback mismatch`)
      throw new Error('The keyboard readback did not match the requested keymap; the change was not accepted.')
    }
    this.#matrices.set(matrix.layer, readback)
    this.#record(`${matrix.layer} matrix write verified by exact 512-byte readback`)
    this.dispatchEvent(new Event('statuschange'))
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
      configuration: connected ? this.#configuration : disconnected,
      capabilities: this.capabilities,
      lastRefresh: null,
    }
  }

  diagnostics(): DiagnosticSnapshot | null {
    if (!this.#device || !this.#knownDevice) return null
    return {
      appBuild: __BUILD_ID__,
      generatedAt: new Date().toISOString(),
      device: {
        connectionType: this.#knownDevice.connectionType,
        vendorId: `0x${this.#device.vendorId.toString(16).padStart(4, '0').toUpperCase()}`,
        productId: `0x${this.#device.productId.toString(16).padStart(4, '0').toUpperCase()}`,
        productName: this.#device.productName || this.#knownDevice.displayName,
      },
      collections: this.#collections,
      vendorCollectionCount: this.vendorCollectionCount,
      capabilities: this.capabilities,
      featureReads: this.#featureReads,
      inputReports: this.#inputReports,
      events: this.#events.slice(-25),
    }
  }

  #record(message: string): void {
    this.#events.push(`${new Date().toISOString()} ${message}`)
    if (this.#events.length > 100) this.#events.shift()
  }

  async #sendLiveColorFrame(): Promise<void> {
    if (!this.#device?.opened || !this.#livePayload) {
      throw new DOMException('The live RGB device is disconnected.', 'InvalidStateError')
    }
    await this.#device.sendFeatureReport(LIVE_RGB_REPORT_ID, this.#livePayload)
  }

  #assertLiveRgbSupport(): void {
    if (!this.#device?.opened) throw new DOMException('Connect the keyboard first.', 'InvalidStateError')
    if (!this.capabilities.liveRgb) {
      throw new DOMException('Live RGB is not confirmed for this connection.', 'NotSupportedError')
    }
  }
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase()
}
