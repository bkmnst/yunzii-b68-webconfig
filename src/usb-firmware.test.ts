import { describe, expect, it } from 'vitest'
import { firmwareFromUsbDescriptor } from './usb-firmware'

describe('USB firmware descriptor', () => {
  it('reconstructs the exact HID VersionNumber/bcdDevice word', () => {
    expect(firmwareFromUsbDescriptor({
      vendorId: 0x258a,
      productId: 0x010c,
      deviceVersionMajor: 1,
      deviceVersionMinor: 2,
      deviceVersionSubminor: 4,
    })).toEqual({ state: 'available', value: { formatted: '0x0124 (1.2.4)' }, raw: [0x24, 0x01] })
  })

  it('rejects another device and malformed BCD digits', () => {
    expect(firmwareFromUsbDescriptor({
      vendorId: 1, productId: 2, deviceVersionMajor: 1, deviceVersionMinor: 0, deviceVersionSubminor: 0,
    }).state).toBe('invalid-response')
    expect(firmwareFromUsbDescriptor({
      vendorId: 0x258a, productId: 0x010c, deviceVersionMajor: 1, deviceVersionMinor: 10, deviceVersionSubminor: 0,
    }).state).toBe('invalid-response')
  })
})

