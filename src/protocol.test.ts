import { describe, expect, it } from 'vitest'
import { hasConfirmedQuery, validateBattery, validateChecksum } from './protocol'

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

