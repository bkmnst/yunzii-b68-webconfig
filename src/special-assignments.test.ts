import { describe, expect, it } from 'vitest'
import { encodeSafeSpecialAssignment, LIGHTING_ASSIGNMENTS, SAFE_DEVICE_ASSIGNMENTS } from './special-assignments'

describe('allowlisted B68 special assignments', () => {
  it('encodes confirmed device and lighting actions', () => {
    expect(encodeSafeSpecialAssignment('device:14').bytes).toEqual([7, 0, 0, 0x14])
    expect(encodeSafeSpecialAssignment('lighting:speed-down').bytes).toEqual([8, 4, 2, 0])
  })

  it('does not expose reset or unknown commands', () => {
    expect(SAFE_DEVICE_ASSIGNMENTS.some((option) => Number(option.bytes[3]) === 0x04)).toBe(false)
    expect(LIGHTING_ASSIGNMENTS).toHaveLength(6)
    expect(() => encodeSafeSpecialAssignment('device:04')).toThrow('excluded')
  })
})
