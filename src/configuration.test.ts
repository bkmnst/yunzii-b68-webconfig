import { describe, expect, it } from 'vitest'
import { buildSetConfigurationPayload, parseB68OnboardConfiguration } from './configuration'

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

  it('builds a typed SetLED record by patching only confirmed debounce byte 3', () => {
    const bytes = new Uint8Array(128)
    bytes[3] = 1
    bytes[10] = 13
    bytes[126] = 0x5a
    bytes[127] = 0xa5
    const baseline = parseB68OnboardConfiguration(bytes)
    const payload = buildSetConfigurationPayload(baseline, { debounceMs: 4 })
    expect(payload).toHaveLength(519)
    expect([...payload.slice(0, 7)]).toEqual([0x04, 0, 0, 1, 0, 0x80, 0])
    expect(payload[10]).toBe(4)
    expect([...payload.slice(7, 10)]).toEqual([...bytes.slice(0, 3)])
    expect([...payload.slice(11, 135)]).toEqual([...bytes.slice(4)])
    expect(() => buildSetConfigurationPayload(baseline, { debounceMs: 0 })).toThrow('1 to 4')
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
