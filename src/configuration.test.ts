import { describe, expect, it } from 'vitest'
import { buildSetConfigurationPayload, parseB68OnboardConfiguration } from './configuration'

describe('B68 onboard configuration', () => {
  it('parses fields confirmed by the real 400-byte GetLED capture', () => {
    const record = new Uint8Array(128)
    record[3] = 1
    record[6] = 4
    record[7] = 4
    record[10] = 6
    record[11] = 0x20
    record[126] = 0x5a
    record[127] = 0xa5
    const parsed = parseB68OnboardConfiguration(record)
    expect(parsed).toMatchObject({ debounceMs: 1, speedLevel: 4, brightnessLevel: 4, hardwareEffectId: 6, effectName: 'Effect slot 6 (ID 6)', effectParameter: 0x20, colorGroup: 0, colorName: 'Red' })
  })

  it('builds a typed SetLED record by patching only confirmed debounce byte 3', () => {
    const bytes = new Uint8Array(128)
    bytes[3] = 1
    bytes[10] = 13
    bytes[11] = 0x20
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

  it('patches only an allowlisted hardware effect ID', () => {
    const bytes = new Uint8Array(128)
    bytes[3] = 1
    bytes[10] = 13
    bytes[11] = 0x20
    bytes[126] = 0x5a
    bytes[127] = 0xa5
    const baseline = parseB68OnboardConfiguration(bytes)
    const payload = buildSetConfigurationPayload(baseline, { hardwareEffectId: 18 })
    expect(payload[7 + 10]).toBe(18)
    expect(payload[7 + 3]).toBe(1)
    expect(() => buildSetConfigurationPayload(baseline, { hardwareEffectId: 255 })).toThrow('Unknown')
  })

  it('patches only confirmed 0–4 hardware speed and brightness bytes', () => {
    const bytes = new Uint8Array(128)
    bytes[3] = 1
    bytes[6] = 4
    bytes[7] = 4
    bytes[10] = 6
    bytes[11] = 0x20
    bytes[126] = 0x5a
    bytes[127] = 0xa5
    const baseline = parseB68OnboardConfiguration(bytes)
    const payload = buildSetConfigurationPayload(baseline, { speedLevel: 2, brightnessLevel: 3 })
    expect(payload[7 + 6]).toBe(2)
    expect(payload[7 + 7]).toBe(3)
    expect([...payload.slice(7, 13)]).toEqual([...bytes.slice(0, 6)])
    expect([...payload.slice(15, 135)]).toEqual([...bytes.slice(8)])
    expect(() => buildSetConfigurationPayload(baseline, { speedLevel: 5 })).toThrow('speed level')
    expect(() => buildSetConfigurationPayload(baseline, { brightnessLevel: -1 })).toThrow('brightness level')
  })

  it('encodes the native fixed and random color groups at record offset 11', () => {
    const bytes = new Uint8Array(128)
    bytes[3] = 1
    bytes[10] = 6
    bytes[11] = 0x20
    bytes[126] = 0x5a
    bytes[127] = 0xa5
    const baseline = parseB68OnboardConfiguration(bytes)
    expect(buildSetConfigurationPayload(baseline, { colorGroup: 6 })[7 + 11]).toBe(0x26)
    expect(buildSetConfigurationPayload(baseline, { colorGroup: 7 })[7 + 11]).toBe(0x27)
    expect(() => buildSetConfigurationPayload(baseline, { colorGroup: 8 })).toThrow('0 to 7')
  })

  it('rejects bad markers and debounce bounds while preserving unknown effects', () => {
    const record = new Uint8Array(128)
    record[3] = 1
    record[10] = 13
    record[11] = 0x20
    expect(() => parseB68OnboardConfiguration(record)).toThrow('marker')
    record[126] = 0x5a
    record[127] = 0xa5
    record[3] = 5
    expect(() => parseB68OnboardConfiguration(record)).toThrow('debounce')
    record[3] = 1
    record[11] = 0x20
    record[10] = 0xff
    expect(parseB68OnboardConfiguration(record).effectName).toBe('Unknown effect 255')
  })

  it('resolves hardware effect ID zero to the vendor Off slot', () => {
    const record = new Uint8Array(128)
    record[3] = 1
    record[11] = 0x20
    record[126] = 0x5a
    record[127] = 0xa5
    expect(parseB68OnboardConfiguration(record)).toMatchObject({ effect: { name: 'Effect slot 20 (ID 0)', vendorLabel: 'Off' }, effectName: 'Effect slot 20 (ID 0)' })
  })
})
