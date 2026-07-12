import { describe, expect, it, vi } from 'vitest'
import { encodeKeyboardAssignment, replaceMatrixAssignment, type B68MatrixLayer, type MatrixAssignment } from './matrix'
import { KeyboardTransport } from './transport'

function reportCollection(): HIDCollectionInfo {
  return {
    usagePage: 0xff00, usage: 1, type: 0, children: [],
    inputReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 7 }] }], outputReports: [],
    featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
  }
}

function mockDevice(overrides: Partial<HIDDevice> = {}): HIDDevice {
  const target = new EventTarget()
  return Object.assign(target, {
    opened: false, vendorId: 0x258a, productId: 0x010c, productName: 'B68 Keyboard', collections: [reportCollection()], oninputreport: null,
    open: vi.fn(async function (this: HIDDevice) { Object.defineProperty(this, 'opened', { value: true, configurable: true }) }),
    close: vi.fn(async function (this: HIDDevice) { Object.defineProperty(this, 'opened', { value: false, configurable: true }) }),
    receiveFeatureReport: vi.fn(), sendFeatureReport: vi.fn(), sendReport: vi.fn(),
  }, overrides) as HIDDevice
}

function configurationResponse(debounceMs: number, hardwareEffectId = 13): DataView {
  const response = new Uint8Array(519)
  response.set([0x84, 0, 0, 1, 0, 0x90, 1])
  response[7 + 3] = debounceMs
  response[7 + 10] = hardwareEffectId
  response[7 + 126] = 0x5a
  response[7 + 127] = 0xa5
  return new DataView(response.buffer)
}

function matrix(assignAt?: [number, number], layer: B68MatrixLayer['layer'] = 'default'): B68MatrixLayer {
  const assignments: MatrixAssignment[] = Array.from({ length: 128 }, () => ({ bytes: [0, 0, 0, 0] }))
  if (assignAt) assignments[assignAt[0]] = encodeKeyboardAssignment(assignAt[1])
  assignments[127] = { bytes: [0, 0, 0x5a, 0xa5] }
  return { layer, assignments }
}

function matrixResponse(value: B68MatrixLayer): DataView {
  const response = new Uint8Array(519)
  response.set([0x83, ['default', 'fn1', 'fn2', 'tap'].indexOf(value.layer), 0, 1, 0, 0, 2])
  value.assignments.forEach((assignment, index) => response.set(assignment.bytes, 7 + index * 4))
  return new DataView(response.buffer)
}

describe('streamlined keyboard transport', () => {
  it('derives confirmed wired capabilities from the exact report channel', async () => {
    const transport = new KeyboardTransport()
    await transport.connect(mockDevice())
    expect(transport.status().capabilities).toEqual({ debounce: true, keymap: true, liveRgb: true, onboardEffects: true })
  })

  it('keeps dongle writes disabled even when its descriptor resembles wired', async () => {
    const device = mockDevice({ vendorId: 0x3554, productId: 0xfa09 })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    expect(transport.status().capabilities).toEqual({ debounce: false, keymap: false, liveRgb: false, onboardEffects: false })
    await transport.inspectOnboardLighting()
    await transport.inspectMatrix('default')
    await expect(transport.setLiveColor({ red: 1, green: 2, blue: 3 })).rejects.toMatchObject({ name: 'NotSupportedError' })
    expect(device.sendFeatureReport).not.toHaveBeenCalled()
  })

  it('writes debounce only after a validated baseline and matching readback', async () => {
    const device = mockDevice({ receiveFeatureReport: vi.fn().mockResolvedValueOnce(configurationResponse(1)).mockResolvedValueOnce(configurationResponse(4)) })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectOnboardLighting()
    await transport.applyDebounce(4)
    const payload = vi.mocked(device.sendFeatureReport).mock.calls[1][1] as Uint8Array
    expect(payload[7 + 3]).toBe(4)
    expect(transport.status().configuration).toMatchObject({ state: 'available', value: { debounceMs: 4 } })
  })

  it('writes only a numbered effect ID and verifies it', async () => {
    const device = mockDevice({ receiveFeatureReport: vi.fn().mockResolvedValueOnce(configurationResponse(1, 13)).mockResolvedValueOnce(configurationResponse(1, 18)) })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectOnboardLighting()
    await transport.applyOnboardEffect(18)
    const payload = vi.mocked(device.sendFeatureReport).mock.calls[1][1] as Uint8Array
    expect(payload[7 + 10]).toBe(18)
    expect(payload[7 + 6]).toBe(0)
    expect(payload[7 + 7]).toBe(0)
  })

  it('writes one unmodified keyboard key and requires exact layer readback', async () => {
    const baseline = matrix(undefined, 'fn1')
    const changed = replaceMatrixAssignment(baseline, 33, encodeKeyboardAssignment(0x0a))
    const device = mockDevice({ receiveFeatureReport: vi.fn().mockResolvedValueOnce(matrixResponse(baseline)).mockResolvedValueOnce(matrixResponse(changed)) })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectMatrix('fn1')
    await transport.applyMatrixLayer(changed)
    const payload = vi.mocked(device.sendFeatureReport).mock.calls[1][1] as Uint8Array
    expect([...payload.slice(7 + 33 * 4, 7 + 34 * 4)]).toEqual([0, 0, 0, 0x0a])
    expect(transport.matrix('fn1')).toEqual(changed)
  })

  it('rejects reserved entry changes', async () => {
    const baseline = matrix()
    const device = mockDevice({ receiveFeatureReport: vi.fn().mockResolvedValue(matrixResponse(baseline)) })
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.inspectMatrix('default')
    const tampered = { ...baseline, assignments: baseline.assignments.map((entry, index): MatrixAssignment => index === 100 ? { bytes: [1, 0, 0, 0] } : entry) }
    await expect(transport.applyMatrixLayer(tampered)).rejects.toThrow('Reserved')
  })

  it('runs live RGB until stopped and cancels it on disconnect', async () => {
    vi.useFakeTimers()
    const device = mockDevice()
    const transport = new KeyboardTransport()
    await transport.connect(device)
    await transport.setLiveColor({ red: 1, green: 2, blue: 3 })
    await vi.advanceTimersByTimeAsync(750)
    expect(device.sendFeatureReport).toHaveBeenCalledTimes(2)
    transport.markDisconnected()
    await vi.advanceTimersByTimeAsync(750)
    expect(device.sendFeatureReport).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
