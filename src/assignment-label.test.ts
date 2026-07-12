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

  it('names modifier masks and special B68 assignments', () => {
    expect(modifierMaskName(0x42)).toBe('Left Shift + Right Alt')
    expect(assignmentLabel({ bytes: [0x0d, 0, 0, 0] })).toBe('Fn')
    expect(assignmentLabel({ bytes: [0x07, 0, 0, 0x14] })).toBe('Mute')
    expect(assignmentLabel({ bytes: [0x07, 0, 0, 0x05] })).toBe('Bluetooth slot 1')
    expect(assignmentLabel({ bytes: [0x08, 3, 1, 0] })).toBe('Brightness up')
    expect(assignmentLabel({ bytes: [0x07, 0, 0, 0x0a] })).toBe('Device command 0x0A')
    expect(assignmentLabel({ bytes: [0x01, 0, 0, 0x16] })).toBe('Left double-click')
    expect(assignmentLabel({ bytes: [0x04, 0, 0, 0x25] })).toBe('Next track')
    expect(assignmentLabel({ bytes: [0, 0, 0, 0] })).toBe('Disabled')
  })
})
