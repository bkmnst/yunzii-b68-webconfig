import { decodeSemanticAssignment, type MatrixAssignment } from './matrix'
import { KEYBOARD_USAGE_OPTIONS } from './keycodes'

const HID_USAGE_NAMES: ReadonlyMap<number, string> = new Map(
  KEYBOARD_USAGE_OPTIONS.map(({ usage, label }) => [usage, label]),
)

const MODIFIER_NAMES = ['Left Ctrl', 'Left Shift', 'Left Alt', 'Left GUI', 'Right Ctrl', 'Right Shift', 'Right Alt', 'Right GUI'] as const

export function hidKeyboardUsageName(usage: number): string {
  return HID_USAGE_NAMES.get(usage) ?? `Keyboard 0x${usage.toString(16).padStart(2, '0').toUpperCase()}`
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
    case 'crc-marker': return 'CRC marker'
    case 'unknown': return `Special ${semantic.bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')}`
  }
}
