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
    expect(B68_LIGHTING_EFFECTS.map((effect) => effect.name)).toEqual([
      ...Array.from({ length: 19 }, (_, index) => String(index + 1)), 'Off',
    ])
  })

  it('uses neutral names instead of unverified vendor labels', () => {
    expect(effectByHardwareId(1)).toEqual({ appIndex: 1, hardwareId: 1, name: '1' })
    expect(effectByHardwareId(0)).toEqual({ appIndex: 20, hardwareId: 0, name: 'Off' })
  })
})
