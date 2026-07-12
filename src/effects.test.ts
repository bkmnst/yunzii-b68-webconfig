import { describe, expect, it } from 'vitest'
import { B68_LIGHTING_EFFECTS, effectByHardwareId } from './effects'

describe('B68 lighting effects', () => {
  it('preserves the exact 20-entry app and hardware ordering', () => {
    expect(B68_LIGHTING_EFFECTS.map((effect) => effect.appIndex)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    )
    expect(B68_LIGHTING_EFFECTS.map((effect) => effect.hardwareId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 0,
    ])
    expect(B68_LIGHTING_EFFECTS.map((effect) => effect.previewAnimationId)).toEqual([
      1, 3, 2, 19, 15, 13, 20, 16, 18, 5, 7, 17, 12, 8, 28, 30, 14, 29, 0, 0,
    ])
  })

  it('preserves capability flags instead of exposing unsupported controls', () => {
    expect(effectByHardwareId(1)).toMatchObject({
      name: 'Effect slot 1 (ID 1)', vendorLabel: 'Fixed on', supportsSpeed: false, supportsBrightness: true, supportsFixedColor: true,
    })
    expect(effectByHardwareId(2)).toMatchObject({
      name: 'Effect slot 2 (ID 2)', vendorLabel: 'Respire', supportsSpeed: true, supportsRandomColor: true, supportsFixedColor: true,
    })
    expect(effectByHardwareId(0)).toMatchObject({
      name: 'Effect slot 20 (ID 0)', vendorLabel: 'Off', supportsSpeed: false, supportsBrightness: false,
    })
  })
})
