import { describe, expect, it } from 'vitest'
import { allCollections, matchKnownDevice, preferWired, vendorCollections } from './devices'

const collection = (usagePage: number, reportId = 0): HIDCollectionInfo => ({
  usagePage,
  usage: 1,
  type: 0,
  children: [],
  inputReports: [{ reportId, items: [{ reportSize: 8, reportCount: 64 }] }],
  outputReports: [],
  featureReports: [{ reportId, items: [{ reportSize: 8, reportCount: 65 }] }],
})

describe('known devices', () => {
  it('matches wired and wireless identifiers', () => {
    expect(matchKnownDevice({ vendorId: 0x258a, productId: 0x010c })?.connectionType).toBe('wired')
    expect(matchKnownDevice({ vendorId: 0x3554, productId: 0xfa09 })?.connectionType).toBe('wireless')
  })

  it('rejects an unknown device', () => {
    expect(matchKnownDevice({ vendorId: 1, productId: 2 })).toBeNull()
  })

  it('prefers wired authorization', () => {
    const wireless = { vendorId: 0x3554, productId: 0xfa09 } as HIDDevice
    const wired = { vendorId: 0x258a, productId: 0x010c } as HIDDevice
    expect(preferWired([wireless, wired])).toEqual([wired, wireless])
  })
})

describe('HID descriptors', () => {
  it('keeps only vendor-defined collections and computes report byte lengths', () => {
    const result = vendorCollections({ collections: [collection(0x01), collection(0xff00, 7)] })
    expect(result).toEqual([{
      usagePage: 0xff00,
      usage: 1,
      vendorDefined: true,
      inputReports: [{ reportId: 7, byteLength: 64 }],
      outputReports: [],
      featureReports: [{ reportId: 7, byteLength: 65 }],
    }])
  })

  it('describes protected and vendor-defined collections for diagnostics', () => {
    const result = allCollections({ collections: [collection(0x01), collection(0xff00)] })
    expect(result.map(({ usagePage, vendorDefined }) => ({ usagePage, vendorDefined }))).toEqual([
      { usagePage: 0x01, vendorDefined: false },
      { usagePage: 0xff00, vendorDefined: true },
    ])
  })
})
