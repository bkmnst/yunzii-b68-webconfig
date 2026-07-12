import { describe, expect, it, vi } from 'vitest'
import { encodeKeyboardAssignment, replaceMatrixAssignment, type B68MatrixLayer, type MatrixAssignment } from './matrix'
import { encodeMacroArchive } from './macro'
import { KeyboardTransport } from './transport'

function mockDevice(overrides: Partial<HIDDevice> = {}): HIDDevice {
  const target = new EventTarget()
  return Object.assign(target, {
    opened: false,
    vendorId: 0x258a,
    productId: 0x010c,
    productName: 'B68 Keyboard',
    collections: [{
      usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [], featureReports: [],
    }],
    oninputreport: null,
    open: vi.fn(async function (this: HIDDevice) { Object.defineProperty(this, 'opened', { value: true, configurable: true }) }),
    close: vi.fn(async function (this: HIDDevice) { Object.defineProperty(this, 'opened', { value: false, configurable: true }) }),
    receiveFeatureReport: vi.fn(),
    sendFeatureReport: vi.fn(),
    sendReport: vi.fn(),
  }, overrides) as HIDDevice
}

function matrixResponse(matrix: B68MatrixLayer): DataView {
  const response = new Uint8Array(519)
  const layer = ['default', 'fn1', 'fn2', 'tap'].indexOf(matrix.layer)
  response.set([0x83, layer, 0, 1, 0, 0, 2])
  matrix.assignments.forEach((assignment, index) => response.set(assignment.bytes, 7 + index * 4))
  return new DataView(response.buffer)
}

function configurationResponse(debounceMs: number, hardwareEffectId = 13, speedLevel = 4, brightnessLevel = 4): DataView {
  const response = new Uint8Array(519)
  response.set([0x84, 0, 0, 1, 0, 0x90, 1])
  response[7 + 3] = debounceMs
  response[7 + 6] = speedLevel
  response[7 + 7] = brightnessLevel
  response[7 + 10] = hardwareEffectId
  response[7 + 126] = 0x5a
  response[7 + 127] = 0xa5
  return new DataView(response.buffer)
}

function macroPageResponse(pageIndex: number, bytes: Uint8Array): DataView {
  const response = new Uint8Array(519)
  response.set([0x85, pageIndex, 0, 6, 0, 0, 2])
  response.set(bytes.slice(pageIndex * 512, (pageIndex + 1) * 512), 7)
  return new DataView(response.buffer)
}

describe('KeyboardTransport', () => {
  it('connects only an allowlisted device with a vendor collection', async () => {
    const transport = new KeyboardTransport()
    await transport.connect(mockDevice())
    expect(transport.status().connected).toBe(true)
    expect(transport.collections).toHaveLength(1)
  })

  it('updates battery only from the validated unsolicited status subtype', async () => {
    const device = mockDevice()
    const transport = new KeyboardTransport()
    await transport.connect(device)
    const emit = (bytes: number[]) => device.oninputreport?.({
      device,
      reportId: 6,
      data: new DataView(Uint8Array.from(bytes).buffer),
    } as HIDInputReportEvent)

    emit([0x0a, 0x07, 0, 0x10, 0, 0, 0])
    expect(transport.status().battery.state).toBe('unsupported')
    emit([0x0a, 0x05, 87, 0x10, 0, 0, 0])
    expect(transport.status().battery).toEqual({
      state: 'available', value: 87, raw: [0x0a, 0x05, 87, 0x10, 0, 0, 0],
    })
  })

  it('keeps a device connected when Chromium exposes no vendor collection', async () => {
    const device = mockDevice({
      collections: [{
        usagePage: 0x01, usage: 0x06, type: 0, children: [], inputReports: [], outputReports: [], featureReports: [],
      }],
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    expect(transport.status().connected).toBe(true)
    expect(transport.vendorCollectionCount).toBe(0)
    expect(transport.diagnostics()?.collections).toHaveLength(1)
  })

  it('captures bounded input report bytes in local diagnostics', async () => {
    const device = mockDevice()
    const transport = new KeyboardTransport()
    await transport.connect(device)
    const bytes = Uint8Array.from([0x12, 0x34, 0x56])
    device.oninputreport?.call(device, {
      reportId: 3,
      data: new DataView(bytes.buffer),
      device,
    } as HIDInputReportEvent)
    expect(transport.diagnostics()?.inputReports).toMatchObject([
      { reportId: 3, bytes: [0x12, 0x34, 0x56] },
    ])
  })

  it('rejects unknown devices without opening them', async () => {
    const device = mockDevice({ vendorId: 1, productId: 2 })
    await expect(new KeyboardTransport().connect(device)).rejects.toThrow('not an allowlisted')
    expect(device.open).not.toHaveBeenCalled()
  })

  it('does not send HID reports for unsupported queries', async () => {
    const device = mockDevice()
    const transport = new KeyboardTransport()
    await transport.connect(device)
    expect((await transport.queryFirmware()).state).toBe('unsupported')
    expect((await transport.queryBattery()).state).toBe('unsupported')
    expect(device.sendReport).not.toHaveBeenCalled()
    expect(device.sendFeatureReport).not.toHaveBeenCalled()
  })

  it('retains a descriptor firmware result and binds it to the connected VID/PID', async () => {
    const transport = new KeyboardTransport()
    await transport.connect(mockDevice())
    const firmware = { state: 'available', value: { formatted: '0x0100 (1.0.0)' }, raw: [0, 1] } as const
    expect(() => transport.acceptUsbFirmware(firmware, 0x3554, 0xfa09)).toThrow('does not belong')
    transport.acceptUsbFirmware(firmware, 0x258a, 0x010c)
    expect(transport.status().firmware).toEqual(firmware)
    expect(await transport.queryFirmware()).toEqual(firmware)
  })

  it('reads feature report 5 without sending a report', async () => {
    const bytes = Uint8Array.from([0x12, 0x34, 0x56, 0x78, 0x64])
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00,
        usage: 1,
        type: 0,
        children: [],
        inputReports: [],
        outputReports: [],
        featureReports: [{ reportId: 5, items: [{ reportSize: 8, reportCount: 5 }] }],
      }],
      receiveFeatureReport: vi.fn(async () => new DataView(bytes.buffer)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    const result = await transport.queryFirmware()
    expect(result).toMatchObject({ state: 'invalid-response', raw: [...bytes] })
    expect(device.receiveFeatureReport).toHaveBeenCalledWith(5)
    expect(device.sendReport).not.toHaveBeenCalled()
    expect(device.sendFeatureReport).not.toHaveBeenCalled()
    expect(transport.diagnostics()?.featureReads).toEqual([
      { reportId: 5, result: 'ok', bytes: [...bytes] },
    ])
  })

  it('records feature report 5 read failures', async () => {
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00,
        usage: 1,
        type: 0,
        children: [],
        inputReports: [],
        outputReports: [],
        featureReports: [{ reportId: 5, items: [{ reportSize: 8, reportCount: 5 }] }],
      }],
      receiveFeatureReport: vi.fn(async () => { throw new DOMException('Device rejected the report', 'NetworkError') }),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    expect((await transport.queryFirmware()).state).toBe('invalid-response')
    expect(transport.diagnostics()?.featureReads[0]).toMatchObject({ reportId: 5, result: 'error' })
  })

  it('queries and records the report-6 model identity', async () => {
    const response = new Uint8Array(519)
    response[12] = 0xab
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn(async () => new DataView(response.buffer)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    const result = await transport.queryFirmware()
    expect(device.sendFeatureReport).toHaveBeenCalledWith(6, expect.any(Uint8Array))
    expect(result).toMatchObject({ state: 'invalid-response', message: expect.stringContaining('0xAB') })
    expect(transport.diagnostics()?.featureReads[0]).toMatchObject({
      reportId: 6,
      result: 'ok',
      message: expect.stringContaining('0xAB'),
    })
  })

  it('uses only the confirmed semantic GetLED request and validates its response', async () => {
    const response = new Uint8Array(519)
    response.set([0x84, 0, 0, 1, 0, 0x90, 1])
    response.fill(0x5a, 7, 407)
    response[7 + 3] = 1
    response[7 + 6] = 4
    response[7 + 7] = 4
    response[7 + 10] = 13
    response[7 + 126] = 0x5a
    response[7 + 127] = 0xa5
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn(async () => new DataView(response.buffer)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectOnboardLighting()

    expect(device.sendFeatureReport).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(device.sendFeatureReport).mock.calls[0][1] as Uint8Array
    expect([...payload.slice(0, 7)]).toEqual([0x84, 0, 0, 1, 0, 0x90, 1])
    expect(transport.diagnostics()?.featureReads[0]).toMatchObject({
      reportId: 6,
      result: 'ok',
      message: expect.stringContaining('Effect slot 13 (ID 13); vendor label Sine wave'),
    })
  })

  it('changes only typed debounce and requires a matching GetLED readback', async () => {
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn()
        .mockResolvedValueOnce(configurationResponse(1))
        .mockResolvedValueOnce(configurationResponse(4)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await expect(transport.applyDebounce(4)).rejects.toThrow('Read and validate')
    await transport.inspectOnboardLighting()
    await transport.applyDebounce(4)

    expect(device.sendFeatureReport).toHaveBeenCalledTimes(3)
    const payload = vi.mocked(device.sendFeatureReport).mock.calls[1][1] as Uint8Array
    expect([...payload.slice(0, 7)]).toEqual([0x04, 0, 0, 1, 0, 0x80, 0])
    expect(payload[10]).toBe(4)
    expect(transport.status().configuration).toMatchObject({ state: 'available', value: { debounceMs: 4 } })
  })

  it('rejects a debounce write whose readback does not match', async () => {
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn().mockResolvedValue(configurationResponse(1)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectOnboardLighting()
    await expect(transport.applyDebounce(4)).rejects.toThrow('did not confirm')
  })

  it('changes only an allowlisted effect ID and requires matching readback', async () => {
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn()
        .mockResolvedValueOnce(configurationResponse(1, 13))
        .mockResolvedValueOnce(configurationResponse(1, 18)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectOnboardLighting()
    await transport.applyOnboardEffect(18)

    const payload = vi.mocked(device.sendFeatureReport).mock.calls[1][1] as Uint8Array
    expect([...payload.slice(0, 7)]).toEqual([4, 0, 0, 1, 0, 128, 0])
    expect(payload[7 + 3]).toBe(1)
    expect(payload[7 + 10]).toBe(18)
    expect(transport.status().configuration).toMatchObject({ state: 'available', value: { hardwareEffectId: 18 } })
  })

  it('changes only typed speed and brightness levels and requires matching readback', async () => {
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn()
        .mockResolvedValueOnce(configurationResponse(1, 13, 4, 4))
        .mockResolvedValueOnce(configurationResponse(1, 13, 2, 3)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectOnboardLighting()
    await transport.applyLightingLevels(2, 3)

    const payload = vi.mocked(device.sendFeatureReport).mock.calls[1][1] as Uint8Array
    expect(payload[7 + 6]).toBe(2)
    expect(payload[7 + 7]).toBe(3)
    expect(payload[7 + 3]).toBe(1)
    expect(payload[7 + 10]).toBe(13)
    expect(transport.status().configuration).toMatchObject({
      state: 'available', value: { speedLevel: 2, brightnessLevel: 3 },
    })
  })

  it('refuses unsupported lighting-level changes for the current effect', async () => {
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn().mockResolvedValue(configurationResponse(1, 1, 4, 4)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectOnboardLighting()
    await expect(transport.applyLightingLevels(3, 4)).rejects.toThrow('does not support speed')
    expect(device.sendFeatureReport).toHaveBeenCalledTimes(1)
  })

  it('uses the confirmed read-only GetMatrix request for the default layer', async () => {
    const response = new Uint8Array(519)
    response.set([0x83, 0, 0, 1, 0, 0, 2])
    response.fill(1, 7)
    response.set([0, 0, 0x5a, 0xa5], 7 + 127 * 4)
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn(async () => new DataView(response.buffer)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectMatrix('default')

    const payload = vi.mocked(device.sendFeatureReport).mock.calls[0][1] as Uint8Array
    expect([...payload.slice(0, 7)]).toEqual([0x83, 0, 0, 1, 0, 0, 2])
    expect(transport.diagnostics()?.featureReads[0]).toMatchObject({
      result: 'ok',
      message: expect.stringContaining('127/127'),
    })
  })

  it('writes a typed matrix only after a validated read and exact readback', async () => {
    const assignments: MatrixAssignment[] = Array.from({ length: 128 }, () => ({ bytes: [0, 0, 0, 0] }))
    assignments[127] = { bytes: [0, 0, 0x5a, 0xa5] }
    const baseline: B68MatrixLayer = { layer: 'fn1', assignments }
    const changed = replaceMatrixAssignment(baseline, 33, encodeKeyboardAssignment(0, 0x0a))
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn()
        .mockResolvedValueOnce(matrixResponse(baseline))
        .mockResolvedValueOnce(matrixResponse(changed)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await expect(transport.applyMatrixLayer(changed)).rejects.toThrow('Read and validate')
    await transport.inspectMatrix('fn1')
    await transport.applyMatrixLayer(changed)

    expect(device.sendFeatureReport).toHaveBeenCalledTimes(3)
    const setPayload = vi.mocked(device.sendFeatureReport).mock.calls[1][1] as Uint8Array
    expect([...setPayload.slice(0, 7)]).toEqual([0x03, 1, 0, 1, 0, 0, 2])
    expect([...setPayload.slice(7 + 33 * 4, 7 + 34 * 4)]).toEqual([0, 0, 0, 0x0a])
    expect(transport.matrix('fn1')).toEqual(changed)
  })

  it('rejects reserved matrix changes and mismatched readback', async () => {
    const assignments: MatrixAssignment[] = Array.from({ length: 128 }, () => ({ bytes: [0, 0, 0, 0] }))
    assignments[127] = { bytes: [0, 0, 0x5a, 0xa5] }
    const baseline: B68MatrixLayer = { layer: 'default', assignments }
    const changed = replaceMatrixAssignment(baseline, 1, encodeKeyboardAssignment(0, 4))
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn().mockResolvedValue(matrixResponse(baseline)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectMatrix('default')

    const tampered: B68MatrixLayer = {
      ...baseline,
      assignments: baseline.assignments.map((assignment, index): MatrixAssignment => index === 100 ? { bytes: [1, 0, 0, 0] } : assignment),
    }
    await expect(transport.applyMatrixLayer(tampered)).rejects.toThrow('Reserved')
    await expect(transport.applyMatrixLayer(changed)).rejects.toThrow('readback did not match')
  })

  it('reads and validates only the required macro archive pages', async () => {
    const archive = encodeMacroArchive([{ name: 'Copy', events: [
      { type: 1, delayMs: 0, value: 0x06 }, { type: 1, delayMs: 10, value: 0x06, released: true },
    ] }])
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn().mockResolvedValue(macroPageResponse(0, archive)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectMacros()

    expect(transport.macros).toEqual([{ name: 'Copy', events: [
      { type: 1, delayMs: 0, value: 6, released: false },
      { type: 1, delayMs: 10, value: 6, released: true },
    ] }])
    expect(device.sendFeatureReport).toHaveBeenCalledTimes(1)
    const request = vi.mocked(device.sendFeatureReport).mock.calls[0][1] as Uint8Array
    expect([...request.slice(0, 7)]).toEqual([0x85, 0, 0, 6, 0, 0, 2])
    expect(transport.diagnostics()?.featureReads[0].message).toContain('1 macro')
  })

  it('does not expose macros from a malformed page response', async () => {
    const bad = new Uint8Array(519)
    bad.set([0x85, 1, 0, 6, 0, 0, 2])
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn().mockResolvedValue(new DataView(bad.buffer)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectMacros()
    expect(transport.macros).toBeNull()
    expect(transport.diagnostics()?.featureReads[0]).toMatchObject({ result: 'error', message: expect.stringContaining('page echo') })
  })

  it('writes typed macro pages only after a validated baseline and exact decoded readback', async () => {
    const macros = [{ name: 'A', events: [{ type: 1 as const, delayMs: 20, value: 4 }] }]
    const archive = encodeMacroArchive(macros)
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn()
        .mockResolvedValueOnce(macroPageResponse(0, new Uint8Array()))
        .mockResolvedValueOnce(macroPageResponse(0, archive)),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await expect(transport.applyMacros(macros)).rejects.toThrow('Read and validate')
    await transport.inspectMacros()
    await transport.applyMacros(macros)

    expect(transport.macros).toEqual([{ name: 'A', events: [{ type: 1, delayMs: 20, value: 4, released: false }] }])
    expect(device.sendFeatureReport).toHaveBeenCalledTimes(3)
    const setPage = vi.mocked(device.sendFeatureReport).mock.calls[1][1] as Uint8Array
    expect([...setPage.slice(0, 7)]).toEqual([5, 0, 0, 6, 0, archive.length, 0])
  })

  it('refuses an unconfirmed empty-archive clearing write', async () => {
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
      receiveFeatureReport: vi.fn().mockResolvedValue(macroPageResponse(0, new Uint8Array())),
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectMacros()
    await expect(transport.applyMacros([])).rejects.toThrow('empty macro archive')
    expect(device.sendFeatureReport).toHaveBeenCalledTimes(1)
  })

  it('sends only the semantic live RGB feature report', async () => {
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00,
        usage: 1,
        type: 0,
        children: [],
        inputReports: [],
        outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.setLiveColor({ red: 1, green: 2, blue: 3 })
    expect(device.sendFeatureReport).toHaveBeenCalledTimes(1)
    expect(device.sendFeatureReport).toHaveBeenCalledWith(6, expect.any(Uint8Array))
    expect(device.sendReport).not.toHaveBeenCalled()
    expect(transport.livePreviewActive).toBe(true)
    transport.stopLiveColor()
    expect(transport.livePreviewActive).toBe(false)
  })

  it('keeps direct RGB alive until stopped', async () => {
    vi.useFakeTimers()
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00,
        usage: 1,
        type: 0,
        children: [],
        inputReports: [],
        outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.setLiveColor({ red: 4, green: 5, blue: 6 })
    await vi.advanceTimersByTimeAsync(1_500)
    expect(device.sendFeatureReport).toHaveBeenCalledTimes(3)
    transport.stopLiveColor()
    await vi.advanceTimersByTimeAsync(1_500)
    expect(device.sendFeatureReport).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('refuses live RGB when report 6 is unavailable', async () => {
    const transport = new KeyboardTransport()
    await transport.connect(mockDevice())
    await expect(transport.setLiveColor({ red: 1, green: 2, blue: 3 })).rejects.toMatchObject({
      name: 'NotSupportedError',
    })
  })

  it('sends a sparse per-key RGB frame through report 6', async () => {
    const device = mockDevice({
      collections: [{
        usagePage: 0xff00, usage: 1, type: 0, children: [], inputReports: [], outputReports: [],
        featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
      }],
    })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.setLiveKeyColors(new Map([[95, { red: 7, green: 8, blue: 9 }]]))
    const payload = vi.mocked(device.sendFeatureReport).mock.calls[0][1] as Uint8Array
    expect([...payload.slice(7 + 95 * 3, 10 + 95 * 3)]).toEqual([7, 8, 9])
    transport.stopLiveColor()
  })

  it('cancels state on a device disconnect', async () => {
    const transport = new KeyboardTransport()
    await transport.connect(mockDevice())
    transport.markDisconnected()
    expect(transport.status().connected).toBe(false)
    expect((await transport.queryFirmware()).state).toBe('disconnected')
  })
})
