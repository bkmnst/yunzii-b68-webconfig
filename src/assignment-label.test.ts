import { describe, expect, it } from 'vitest'
import { assignmentLabel, hidKeyboardUsageName, modifierMaskName } from './assignment-label'

describe('semantic assignment labels', () => {
  it('names HID keyboard usages found in the B68 capture', () => {
    expect(hidKeyboardUsageName(0x04)).toBe('A')
    expect(hidKeyboardUsageName(0x1e)).toBe('1')
    expect(hidKeyboardUsageName(0x28)).toBe('Enter')
    expect(hidKeyboardUsageName(0x52)).toBe('Up Arrow')
    expect(hidKeyboardUsageName(0x58)).toBe('Numpad Enter')
    expect(hidKeyboardUsageName(0x73)).toBe('F24')
    expect(hidKeyboardUsageName(0x8f)).toBe('International 9')
  })

  it('labels existing modifiers but treats excluded assignment families as special', () => {
    expect(modifierMaskName(0x42)).toBe('Left Shift + Right Alt')
    expect(assignmentLabel({ bytes: [0x0d, 0, 0, 0] })).toBe('Special 0d 00 00 00')
    expect(assignmentLabel({ bytes: [0x07, 0, 0, 0x14] })).toBe('Special 07 00 00 14')
    expect(assignmentLabel({ bytes: [0, 0, 0, 0] })).toBe('Disabled')
  })
})
