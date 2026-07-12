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

  it('cancels state on a device disconnect', async () => {
    const transport = new KeyboardTransport()
    await transport.connect(mockDevice())
    transport.markDisconnected()
    expect(transport.status().connected).toBe(false)
    expect((await transport.queryFirmware()).state).toBe('disconnected')
  })
})
