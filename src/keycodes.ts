export interface KeyboardUsageOption {
  usage: number
  label: string
}

const letters = Array.from({ length: 26 }, (_, index) => ({ usage: 0x04 + index, label: String.fromCharCode(65 + index) }))
const digits = ['1','2','3','4','5','6','7','8','9','0'].map((label, index) => ({ usage: 0x1e + index, label }))
const functionKeys = Array.from({ length: 12 }, (_, index) => ({ usage: 0x3a + index, label: `F${index + 1}` }))
const extendedFunctionKeys = Array.from({ length: 12 }, (_, index) => ({ usage: 0x68 + index, label: `F${index + 13}` }))

export const KEYBOARD_USAGE_OPTIONS: readonly KeyboardUsageOption[] = [
  ...letters,
  ...digits,
  { usage: 0x28, label: 'Enter' }, { usage: 0x29, label: 'Escape' }, { usage: 0x2a, label: 'Backspace' },
  { usage: 0x2b, label: 'Tab' }, { usage: 0x2c, label: 'Space' }, { usage: 0x2d, label: '-' },
  { usage: 0x2e, label: '=' }, { usage: 0x2f, label: '[' }, { usage: 0x30, label: ']' },
  { usage: 0x31, label: '\\' }, { usage: 0x32, label: 'Non-US # and ~' },
  { usage: 0x33, label: ';' }, { usage: 0x34, label: "'" },
  { usage: 0x35, label: '`' }, { usage: 0x36, label: ',' }, { usage: 0x37, label: '.' }, { usage: 0x38, label: '/' },
  { usage: 0x39, label: 'Caps Lock' }, ...functionKeys,
  { usage: 0x46, label: 'Print Screen' }, { usage: 0x47, label: 'Scroll Lock' }, { usage: 0x48, label: 'Pause' },
  { usage: 0x49, label: 'Insert' }, { usage: 0x4a, label: 'Home' }, { usage: 0x4b, label: 'Page Up' },
  { usage: 0x4c, label: 'Delete' }, { usage: 0x4d, label: 'End' }, { usage: 0x4e, label: 'Page Down' },
  { usage: 0x4f, label: 'Right Arrow' }, { usage: 0x50, label: 'Left Arrow' },
  { usage: 0x51, label: 'Down Arrow' }, { usage: 0x52, label: 'Up Arrow' },
  { usage: 0x53, label: 'Num Lock' }, { usage: 0x54, label: 'Numpad /' },
  { usage: 0x55, label: 'Numpad *' }, { usage: 0x56, label: 'Numpad -' },
  { usage: 0x57, label: 'Numpad +' }, { usage: 0x58, label: 'Numpad Enter' },
  { usage: 0x59, label: 'Numpad 1' }, { usage: 0x5a, label: 'Numpad 2' },
  { usage: 0x5b, label: 'Numpad 3' }, { usage: 0x5c, label: 'Numpad 4' },
  { usage: 0x5d, label: 'Numpad 5' }, { usage: 0x5e, label: 'Numpad 6' },
  { usage: 0x5f, label: 'Numpad 7' }, { usage: 0x60, label: 'Numpad 8' },
  { usage: 0x61, label: 'Numpad 9' }, { usage: 0x62, label: 'Numpad 0' },
  { usage: 0x63, label: 'Numpad .' }, { usage: 0x64, label: 'Non-US \\ and |' },
  { usage: 0x65, label: 'Application / Menu' },
  { usage: 0x67, label: 'Numpad =' }, ...extendedFunctionKeys,
  { usage: 0x85, label: 'Numpad ,' }, { usage: 0x87, label: 'International 1' },
  { usage: 0x88, label: 'International 2' }, { usage: 0x89, label: 'International 3' },
  { usage: 0x8a, label: 'International 4' }, { usage: 0x8b, label: 'International 5' },
  { usage: 0x8c, label: 'International 6' }, { usage: 0x8d, label: 'International 7' },
  { usage: 0x8e, label: 'International 8' }, { usage: 0x8f, label: 'International 9' },
  { usage: 0x90, label: 'Language 1' }, { usage: 0x91, label: 'Language 2' },
  { usage: 0x92, label: 'Language 3' }, { usage: 0x93, label: 'Language 4' },
  { usage: 0x94, label: 'Language 5' }, { usage: 0x95, label: 'Language 6' },
  { usage: 0x96, label: 'Language 7' }, { usage: 0x97, label: 'Language 8' },
  { usage: 0x98, label: 'Language 9' },
]
