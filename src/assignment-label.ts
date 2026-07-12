import { decodeSemanticAssignment, type MatrixAssignment } from './matrix'
import { KEYBOARD_USAGE_OPTIONS } from './keycodes'

const HID_USAGE_NAMES: ReadonlyMap<number, string> = new Map(
  KEYBOARD_USAGE_OPTIONS.map(({ usage, label }) => [usage, label]),
)

const MODIFIER_NAMES = ['Left Ctrl', 'Left Shift', 'Left Alt', 'Left GUI', 'Right Ctrl', 'Right Shift', 'Right Alt', 'Right GUI'] as const

const B68_DEVICE_COMMANDS: Readonly<Record<number, string>> = Object.freeze({
  0x01: 'Lock Windows key',
  0x04: 'Reset keyboard',
  0x05: 'Bluetooth slot 1',
  0x06: 'Bluetooth slot 2',
  0x07: 'Bluetooth slot 3',
  0x08: '2.4 GHz pairing',
  0x0b: 'Backlight on / off',
  0x11: 'Show battery level',
  0x12: 'White light on / off',
  0x14: 'Mute',
  0x15: 'Toggle number / F-row mode',
})

const B68_LIGHTING_COMMANDS: Readonly<Record<string, string>> = Object.freeze({
  '0,0,0': 'Next lighting effect',
  '2,0,0': 'Next lighting color',
  '3,1,0': 'Brightness up',
  '3,2,0': 'Brightness down',
  '4,1,0': 'Effect speed up',
  '4,2,0': 'Effect speed down',
})

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
    case 'fn': return 'Fn'
    case 'device-command': return B68_DEVICE_COMMANDS[semantic.command] ?? `Device command 0x${semantic.command.toString(16).padStart(2, '0').toUpperCase()}`
    case 'lighting-command': return B68_LIGHTING_COMMANDS[`${semantic.group},${semantic.value},${semantic.parameter}`]
      ?? `Lighting command ${semantic.group}:${semantic.value}:${semantic.parameter}`
    case 'crc-marker': return 'CRC marker'
    case 'macro': return `Macro ${semantic.index + 1} · ${semantic.mode}`
    case 'unknown': return `Special ${semantic.bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')}`
  }
}
