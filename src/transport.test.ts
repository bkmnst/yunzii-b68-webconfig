import { describe, expect, it, vi } from 'vitest'
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

describe('KeyboardTransport', () => {
  it('connects only an allowlisted device with a vendor collection', async () => {
    const transport = new KeyboardTransport()
    await transport.connect(mockDevice())
    expect(transport.status().connected).toBe(true)
    expect(transport.collections).toHaveLength(1)
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
