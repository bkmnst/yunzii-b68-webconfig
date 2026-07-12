import { describe, expect, it } from 'vitest'
import { assignmentLabel, hidKeyboardUsageName, modifierMaskName } from './assignment-label'

describe('semantic assignment labels', () => {
  it('names HID keyboard usages found in the B68 capture', () => {
    expect(hidKeyboardUsageName(0x04)).toBe('A')
    expect(hidKeyboardUsageName(0x1e)).toBe('1')
    expect(hidKeyboardUsageName(0x28)).toBe('Enter')
    expect(hidKeyboardUsageName(0x52)).toBe('Up')
  })

  it('names modifier masks and special B68 assignments', () => {
    expect(modifierMaskName(0x42)).toBe('Left Shift + Right Alt')
    expect(assignmentLabel({ bytes: [0x0d, 0, 0, 0] })).toBe('Fn')
    expect(assignmentLabel({ bytes: [0x07, 0, 0, 0x14] })).toBe('Mute')
    expect(assignmentLabel({ bytes: [0, 0, 0, 0] })).toBe('Disabled')
  })
})
