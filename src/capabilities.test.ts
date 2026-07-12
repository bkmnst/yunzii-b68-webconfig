import { describe, expect, it } from 'vitest'
import { deriveDeviceCapabilities } from './capabilities'
import type { HidReportDescriptor, KnownDevice } from './types'

const wired: KnownDevice = { connectionType: 'wired', vendorId: 0x258a, productId: 0x010c, displayName: 'B68' }
const wireless: KnownDevice = { connectionType: 'wireless', vendorId: 0x3554, productId: 0xfa09, displayName: 'B68 dongle' }
const reports: HidReportDescriptor[] = [{
  usagePage: 0xff00, usage: 1, vendorDefined: true,
  inputReports: [{ reportId: 6, byteLength: 7 }], outputReports: [],
  featureReports: [{ reportId: 6, byteLength: 519 }],
}]

describe('device capability derivation', () => {
  it('enables confirmed wired operations only with the exact report channel', () => {
    expect(deriveDeviceCapabilities(wired, reports)).toEqual({
      debounce: true, keymap: true, liveRgb: true, onboardEffects: true,
    })
    expect(deriveDeviceCapabilities(wired, [])).toEqual({
      debounce: false, keymap: false, liveRgb: false, onboardEffects: false,
    })
  })

  it('does not infer dongle write support from a matching descriptor', () => {
    expect(deriveDeviceCapabilities(wireless, reports)).toEqual({
      debounce: false, keymap: false, liveRgb: false, onboardEffects: false,
    })
  })

  it('returns no capabilities without a known device', () => {
    expect(Object.values(deriveDeviceCapabilities(null, reports))).toEqual([false, false, false, false])
  })
})
