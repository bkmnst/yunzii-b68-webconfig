export interface KeyboardUsageOption {
  usage: number
  label: string
}

const letters = Array.from({ length: 26 }, (_, index) => ({ usage: 0x04 + index, label: String.fromCharCode(65 + index) }))
const digits = ['1','2','3','4','5','6','7','8','9','0'].map((label, index) => ({ usage: 0x1e + index, label }))
const functionKeys = Array.from({ length: 12 }, (_, index) => ({ usage: 0x3a + index, label: `F${index + 1}` }))

export const KEYBOARD_USAGE_OPTIONS: readonly KeyboardUsageOption[] = [
  ...letters,
  ...digits,
  { usage: 0x28, label: 'Enter' }, { usage: 0x29, label: 'Escape' }, { usage: 0x2a, label: 'Backspace' },
  { usage: 0x2b, label: 'Tab' }, { usage: 0x2c, label: 'Space' }, { usage: 0x2d, label: '-' },
  { usage: 0x2e, label: '=' }, { usage: 0x2f, label: '[' }, { usage: 0x30, label: ']' },
  { usage: 0x31, label: '\\' }, { usage: 0x33, label: ';' }, { usage: 0x34, label: "'" },
  { usage: 0x35, label: '`' }, { usage: 0x36, label: ',' }, { usage: 0x37, label: '.' }, { usage: 0x38, label: '/' },
  { usage: 0x39, label: 'Caps Lock' }, ...functionKeys,
  { usage: 0x46, label: 'Print Screen' }, { usage: 0x47, label: 'Scroll Lock' }, { usage: 0x48, label: 'Pause' },
  { usage: 0x49, label: 'Insert' }, { usage: 0x4a, label: 'Home' }, { usage: 0x4b, label: 'Page Up' },
  { usage: 0x4c, label: 'Delete' }, { usage: 0x4d, label: 'End' }, { usage: 0x4e, label: 'Page Down' },
  { usage: 0x4f, label: 'Right Arrow' }, { usage: 0x50, label: 'Left Arrow' },
  { usage: 0x51, label: 'Down Arrow' }, { usage: 0x52, label: 'Up Arrow' },
]

export const MODIFIER_OPTIONS = [
  { mask: 0x01, label: 'Ctrl' }, { mask: 0x02, label: 'Shift' },
  { mask: 0x04, label: 'Alt' }, { mask: 0x08, label: 'Win' },
] as const

