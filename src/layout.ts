export interface B68Key {
  label: string
  ledIndex: number
  width?: number
}

export const B68_KEY_ROWS: readonly (readonly B68Key[])[] = [
  [
    { label: 'Esc', ledIndex: 1 }, { label: '1', ledIndex: 7 }, { label: '2', ledIndex: 13 },
    { label: '3', ledIndex: 19 }, { label: '4', ledIndex: 25 }, { label: '5', ledIndex: 31 },
    { label: '6', ledIndex: 37 }, { label: '7', ledIndex: 43 }, { label: '8', ledIndex: 49 },
    { label: '9', ledIndex: 55 }, { label: '0', ledIndex: 61 }, { label: '-', ledIndex: 67 },
    { label: '=', ledIndex: 73 }, { label: 'Backspace', ledIndex: 79, width: 2 },
  ],
  [
    { label: 'Tab', ledIndex: 2, width: 1.5 }, { label: 'Q', ledIndex: 8 }, { label: 'W', ledIndex: 14 },
    { label: 'E', ledIndex: 20 }, { label: 'R', ledIndex: 26 }, { label: 'T', ledIndex: 32 },
    { label: 'Y', ledIndex: 38 }, { label: 'U', ledIndex: 44 }, { label: 'I', ledIndex: 50 },
    { label: 'O', ledIndex: 56 }, { label: 'P', ledIndex: 62 }, { label: '[', ledIndex: 68 },
    { label: ']', ledIndex: 74 }, { label: '\\', ledIndex: 80, width: 1.5 }, { label: 'Delete', ledIndex: 92 },
  ],
  [
    { label: 'Caps', ledIndex: 3, width: 1.75 }, { label: 'A', ledIndex: 9 }, { label: 'S', ledIndex: 15 },
    { label: 'D', ledIndex: 21 }, { label: 'F', ledIndex: 27 }, { label: 'G', ledIndex: 33 },
    { label: 'H', ledIndex: 39 }, { label: 'J', ledIndex: 45 }, { label: 'K', ledIndex: 51 },
    { label: 'L', ledIndex: 57 }, { label: ';', ledIndex: 63 }, { label: "'", ledIndex: 69 },
    { label: 'Enter', ledIndex: 81, width: 2.25 }, { label: 'PgUp', ledIndex: 93 },
  ],
  [
    { label: 'Shift', ledIndex: 4, width: 2.25 }, { label: 'Z', ledIndex: 10 }, { label: 'X', ledIndex: 16 },
    { label: 'C', ledIndex: 22 }, { label: 'V', ledIndex: 28 }, { label: 'B', ledIndex: 34 },
    { label: 'N', ledIndex: 40 }, { label: 'M', ledIndex: 46 }, { label: ',', ledIndex: 52 },
    { label: '.', ledIndex: 58 }, { label: '/', ledIndex: 64 }, { label: 'RShift', ledIndex: 82, width: 1.75 },
    { label: '↑', ledIndex: 88 }, { label: 'PgDn', ledIndex: 94 },
  ],
  [
    { label: 'Ctrl', ledIndex: 5, width: 1.25 }, { label: 'Win', ledIndex: 11, width: 1.25 },
    { label: 'Alt', ledIndex: 17, width: 1.25 }, { label: 'Space', ledIndex: 35, width: 6.25 },
    { label: 'RAlt', ledIndex: 53, width: 1.25 }, { label: 'Fn', ledIndex: 59, width: 1.25 },
    { label: '←', ledIndex: 83 }, { label: '↓', ledIndex: 89 }, { label: '→', ledIndex: 95 },
  ],
  [{ label: 'Mute control', ledIndex: 91 }],
]

export const B68_KEYS: readonly B68Key[] = B68_KEY_ROWS.flat()

