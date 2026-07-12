import { describe, expect, it } from 'vitest'
import { KEYBOARD_USAGE_OPTIONS, MODIFIER_OPTIONS } from './keycodes'

describe('semantic keyboard assignment catalog', () => {
  it('contains unique standard usages and modifier masks', () => {
    expect(new Set(KEYBOARD_USAGE_OPTIONS.map(({ usage }) => usage)).size).toBe(KEYBOARD_USAGE_OPTIONS.length)
    expect(KEYBOARD_USAGE_OPTIONS.find(({ label }) => label === 'A')?.usage).toBe(0x04)
    expect(KEYBOARD_USAGE_OPTIONS.find(({ label }) => label === 'F12')?.usage).toBe(0x45)
    expect(MODIFIER_OPTIONS.reduce((mask, option) => mask | option.mask, 0)).toBe(0x0f)
  })
})
