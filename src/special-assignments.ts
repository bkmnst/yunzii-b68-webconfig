import type { MatrixAssignment } from './matrix'

export const SAFE_DEVICE_ASSIGNMENTS = [
  { id: 'device:01', label: 'Lock Windows key', bytes: [0x07, 0, 0, 0x01] },
  { id: 'device:05', label: 'Bluetooth slot 1', bytes: [0x07, 0, 0, 0x05] },
  { id: 'device:06', label: 'Bluetooth slot 2', bytes: [0x07, 0, 0, 0x06] },
  { id: 'device:07', label: 'Bluetooth slot 3', bytes: [0x07, 0, 0, 0x07] },
  { id: 'device:08', label: '2.4 GHz pairing', bytes: [0x07, 0, 0, 0x08] },
  { id: 'device:0b', label: 'Backlight on / off', bytes: [0x07, 0, 0, 0x0b] },
  { id: 'device:11', label: 'Show battery level', bytes: [0x07, 0, 0, 0x11] },
  { id: 'device:12', label: 'White light on / off', bytes: [0x07, 0, 0, 0x12] },
  { id: 'device:14', label: 'Mute', bytes: [0x07, 0, 0, 0x14] },
  { id: 'device:15', label: 'Toggle number / F-row mode', bytes: [0x07, 0, 0, 0x15] },
] as const

export const LIGHTING_ASSIGNMENTS = [
  { id: 'lighting:effect', label: 'Next lighting effect', bytes: [0x08, 0, 0, 0] },
  { id: 'lighting:color', label: 'Next lighting color', bytes: [0x08, 2, 0, 0] },
  { id: 'lighting:brightness-up', label: 'Brightness up', bytes: [0x08, 3, 1, 0] },
  { id: 'lighting:brightness-down', label: 'Brightness down', bytes: [0x08, 3, 2, 0] },
  { id: 'lighting:speed-up', label: 'Effect speed up', bytes: [0x08, 4, 1, 0] },
  { id: 'lighting:speed-down', label: 'Effect speed down', bytes: [0x08, 4, 2, 0] },
] as const

const SAFE_ASSIGNMENTS = [...SAFE_DEVICE_ASSIGNMENTS, ...LIGHTING_ASSIGNMENTS]

export function encodeSafeSpecialAssignment(id: string): MatrixAssignment {
  const option = SAFE_ASSIGNMENTS.find((candidate) => candidate.id === id)
  if (!option) throw new RangeError('Unknown or excluded B68 special assignment.')
  return { bytes: [...option.bytes] as [number, number, number, number] }
}

