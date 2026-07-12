import type { FirmwareInfo, MetricResult } from './types'

export const B68_WIRED_VENDOR_ID = 0x258a
export const B68_WIRED_PRODUCT_ID = 0x010c

export interface UsbDeviceVersion {
  vendorId: number
  productId: number
  deviceVersionMajor: number
  deviceVersionMinor: number
  deviceVersionSubminor: number
}

function bcdDigit(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new RangeError(`${name} is not a single BCD digit.`)
  }
  return value
}

/** Converts Chromium's parsed USB bcdDevice fields back to the HID VersionNumber used by the Windows app. */
export function firmwareFromUsbDescriptor(device: UsbDeviceVersion): MetricResult<FirmwareInfo> {
  if (device.vendorId !== B68_WIRED_VENDOR_ID || device.productId !== B68_WIRED_PRODUCT_ID) {
    return { state: 'invalid-response', message: 'The selected USB device is not the wired Yunzii B68.', raw: [] }
  }
  try {
    const major = bcdDigit(device.deviceVersionMajor, 'USB device-version major component')
    const minor = bcdDigit(device.deviceVersionMinor, 'USB device-version minor component')
    const subminor = bcdDigit(device.deviceVersionSubminor, 'USB device-version subminor component')
    const versionNumber = (major << 8) | (minor << 4) | subminor
    const hex = versionNumber.toString(16).padStart(4, '0').toUpperCase()
    return {
      state: 'available',
      value: { formatted: `0x${hex} (${major}.${minor}.${subminor})` },
      raw: [versionNumber & 0xff, versionNumber >>> 8],
    }
  } catch (error) {
    return {
      state: 'invalid-response',
      message: error instanceof Error ? error.message : 'The USB device version is malformed.',
      raw: [],
    }
  }
}

