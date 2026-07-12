import { describe, expect, it } from 'vitest'
import { parseBatteryStatusReport } from './battery'

describe('B68 battery status input report', () => {
  it('accepts only the captured status envelope and bounded percentage', () => {
    expect(parseBatteryStatusReport(Uint8Array.of(0x0a, 0x05, 100, 0x10, 0, 0, 0))).toBe(100)
    expect(parseBatteryStatusReport(Uint8Array.of(0x0a, 0x05, 0, 0x10, 0, 0, 0))).toBe(0)
    expect(parseBatteryStatusReport(Uint8Array.of(0x0a, 0x05, 101, 0x10, 0, 0, 0))).toBeNull()
  })

  it('ignores write acknowledgements and malformed reports', () => {
    expect(parseBatteryStatusReport(Uint8Array.of(0x0a, 0x07, 0, 0x10, 0, 0, 0))).toBeNull()
    expect(parseBatteryStatusReport(Uint8Array.of(0x0a, 0x05, 50, 0, 0, 0, 0))).toBeNull()
    expect(parseBatteryStatusReport(Uint8Array.of(0x0a, 0x05, 50, 0x10, 0, 0))).toBeNull()
  })
})
