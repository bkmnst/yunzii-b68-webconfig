import { describe, expect, it } from 'vitest'
import { KEYBOARD_USAGE_OPTIONS } from './keycodes'

describe('semantic keyboard assignment catalog', () => {
  it('contains unique ordinary keyboard usages without media controls', () => {
    expect(new Set(KEYBOARD_USAGE_OPTIONS.map(({ usage }) => usage)).size).toBe(KEYBOARD_USAGE_OPTIONS.length)
    expect(KEYBOARD_USAGE_OPTIONS.find(({ label }) => label === 'A')?.usage).toBe(0x04)
    expect(KEYBOARD_USAGE_OPTIONS.find(({ label }) => label === 'F12')?.usage).toBe(0x45)
    expect(KEYBOARD_USAGE_OPTIONS.find(({ label }) => label === 'F24')?.usage).toBe(0x73)
    expect(KEYBOARD_USAGE_OPTIONS.find(({ label }) => label === 'Numpad Enter')?.usage).toBe(0x58)
    expect(KEYBOARD_USAGE_OPTIONS.find(({ label }) => label === 'Application / Menu')?.usage).toBe(0x65)
    expect(KEYBOARD_USAGE_OPTIONS.find(({ label }) => label === 'International 9')?.usage).toBe(0x8f)
    expect(KEYBOARD_USAGE_OPTIONS.some(({ label }) => label.includes('Volume'))).toBe(false)
  })
})
