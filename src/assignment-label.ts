import { decodeSemanticAssignment, type MatrixAssignment } from './matrix'

const HID_USAGE_NAMES: Readonly<Record<number, string>> = Object.freeze({
  0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space',
  0x2d: '-', 0x2e: '=', 0x2f: '[', 0x30: ']', 0x31: '\\', 0x32: '#',
  0x33: ';', 0x34: "'", 0x35: '`', 0x36: ',', 0x37: '.', 0x38: '/', 0x39: 'Caps Lock',
  0x49: 'Insert', 0x4a: 'Home', 0x4b: 'Page Up', 0x4c: 'Delete', 0x4d: 'End',
  0x4e: 'Page Down', 0x4f: 'Right', 0x50: 'Left', 0x51: 'Down', 0x52: 'Up',
})

const MODIFIER_NAMES = ['Left Ctrl', 'Left Shift', 'Left Alt', 'Left GUI', 'Right Ctrl', 'Right Shift', 'Right Alt', 'Right GUI'] as const

export function hidKeyboardUsageName(usage: number): string {
  if (usage >= 0x04 && usage <= 0x1d) return String.fromCharCode(65 + usage - 0x04)
  if (usage >= 0x1e && usage <= 0x26) return String(usage - 0x1d)
  if (usage === 0x27) return '0'
  if (usage >= 0x3a && usage <= 0x45) return `F${usage - 0x39}`
  return HID_USAGE_NAMES[usage] ?? `Keyboard 0x${usage.toString(16).padStart(2, '0').toUpperCase()}`
}

export function modifierMaskName(mask: number): string {
  const names = MODIFIER_NAMES.filter((_, bit) => (mask & (1 << bit)) !== 0)
  return names.length > 0 ? names.join(' + ') : ''
}

export function assignmentLabel(assignment: MatrixAssignment): string {
  const semantic = decodeSemanticAssignment(assignment)
  switch (semantic.kind) {
    case 'disabled': return 'Disabled'
    case 'keyboard': {
      const modifier = modifierMaskName(semantic.modifiers)
      const key = semantic.usage === 0 ? '' : hidKeyboardUsageName(semantic.usage)
      return [modifier, key].filter(Boolean).join(' + ')
    }
    case 'fn': return 'Fn'
    case 'consumer': return semantic.usage === 0x14 ? 'Mute' : `Consumer 0x${semantic.usage.toString(16).padStart(2, '0').toUpperCase()}`
    case 'macro': return `Macro ${semantic.index + 1} · ${semantic.mode}`
    case 'unknown': return `Special ${semantic.bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')}`
  }
}
