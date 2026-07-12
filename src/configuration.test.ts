import { describe, expect, it } from 'vitest'
import { parseB68OnboardConfiguration } from './configuration'

describe('B68 onboard configuration', () => {
  it('parses fields confirmed by the real 400-byte GetLED capture', () => {
    const record = new Uint8Array(128)
    record[3] = 1
    record[10] = 13
    record[11] = 0x20
    record[126] = 0x5a
    record[127] = 0xa5
    const parsed = parseB68OnboardConfiguration(record)
    expect(parsed).toMatchObject({ debounceMs: 1, hardwareEffectId: 13, effectName: 'Rainbow wheel', effectParameter: 0x20 })
  })

  it('rejects bad markers and debounce bounds while preserving unknown effects', () => {
    const record = new Uint8Array(128)
    record[3] = 1
    record[10] = 13
    expect(() => parseB68OnboardConfiguration(record)).toThrow('marker')
    record[126] = 0x5a
    record[127] = 0xa5
    record[3] = 5
    expect(() => parseB68OnboardConfiguration(record)).toThrow('debounce')
    record[3] = 1
    record[10] = 0xff
    expect(parseB68OnboardConfiguration(record).effectName).toBe('Unknown effect 255')
  })

  it('resolves hardware effect ID zero as Off', () => {
    const record = new Uint8Array(128)
    record[3] = 1
    record[126] = 0x5a
    record[127] = 0xa5
    expect(parseB68OnboardConfiguration(record)).toMatchObject({ effect: { name: 'Off' }, effectName: 'Off' })
  })
})
