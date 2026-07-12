import { describe, expect, it } from 'vitest'
import {
  B68_LED_SLOT_COUNT,
  buildLiveRgbPayload,
  hasConfirmedQuery,
  LIVE_RGB_PAYLOAD_LENGTH,
  validateBattery,
  validateChecksum,
} from './protocol'

describe('safe protocol boundary', () => {
  it('ships no unconfirmed device queries', () => {
    expect(hasConfirmedQuery('wired', 'firmware')).toBe(false)
    expect(hasConfirmedQuery('wireless', 'battery')).toBe(false)
  })

  it('accepts only bounded battery percentages', () => {
    expect(validateBattery([50], 0)).toMatchObject({ state: 'available', value: 50 })
    expect(validateBattery([101], 0).state).toBe('invalid-response')
    expect(validateBattery([], 0).state).toBe('invalid-response')
  })

  it('validates an additive one-byte checksum', () => {
    expect(validateChecksum([1, 2, 3])).toBe(true)
    expect(validateChecksum([1, 2, 4])).toBe(false)
    expect(validateChecksum([1])).toBe(false)
  })
})

describe('live RGB report', () => {
  it('builds the B68 report 6 payload with every mapped LED slot filled', () => {
    const payload = buildLiveRgbPayload({ red: 0x12, green: 0x34, blue: 0x56 })
    expect(payload).toHaveLength(LIVE_RGB_PAYLOAD_LENGTH)
    expect([...payload.slice(0, 7)]).toEqual([0x08, 0x00, 0x00, 0x01, 0x00, 0x7a, 0x01])
    for (let slot = 0; slot < B68_LED_SLOT_COUNT; slot += 1) {
      expect([...payload.slice(7 + slot * 3, 10 + slot * 3)]).toEqual([0x12, 0x34, 0x56])
    }
    expect([...payload.slice(7 + B68_LED_SLOT_COUNT * 3)]).toEqual(
      Array(LIVE_RGB_PAYLOAD_LENGTH - 7 - B68_LED_SLOT_COUNT * 3).fill(0),
    )
  })

  it('rejects invalid RGB channels', () => {
    expect(() => buildLiveRgbPayload({ red: -1, green: 0, blue: 0 })).toThrow(RangeError)
    expect(() => buildLiveRgbPayload({ red: 256, green: 0, blue: 0 })).toThrow(RangeError)
    expect(() => buildLiveRgbPayload({ red: 1.5, green: 0, blue: 0 })).toThrow(RangeError)
  })
})
