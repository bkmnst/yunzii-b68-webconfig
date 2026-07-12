import type { MatrixAssignment } from './matrix'

export interface DirectAssignmentOption {
  readonly id: string
  readonly label: string
  readonly bytes: readonly [number, number, number, number]
}

/** Named category-1 cases from the native B68 assignment-label switch. */
export const MOUSE_ASSIGNMENTS: readonly DirectAssignmentOption[] = Object.freeze([
  { id: 'mouse:left', label: 'Left click', bytes: [0x01, 0, 0, 0x11] },
  { id: 'mouse:middle', label: 'Middle click', bytes: [0x01, 0, 0, 0x12] },
  { id: 'mouse:right', label: 'Right click', bytes: [0x01, 0, 0, 0x13] },
  { id: 'mouse:forward', label: 'Mouse forward', bytes: [0x01, 0, 0, 0x14] },
  { id: 'mouse:back', label: 'Mouse back', bytes: [0x01, 0, 0, 0x15] },
  { id: 'mouse:double-click', label: 'Left double-click', bytes: [0x01, 0, 0, 0x16] },
  { id: 'mouse:right-double-click', label: 'Right double-click', bytes: [0x01, 0, 0, 0x18] },
  { id: 'mouse:scroll-up', label: 'Scroll up', bytes: [0x01, 0, 0, 0x19] },
  { id: 'mouse:scroll-down', label: 'Scroll down', bytes: [0x01, 0, 0, 0x1a] },
])

/** Named category-4 cases from the native B68 assignment-label switch. */
export const MULTIMEDIA_ASSIGNMENTS: readonly DirectAssignmentOption[] = Object.freeze([
  { id: 'media:player', label: 'Open media player', bytes: [0x04, 0, 0, 0x21] },
  { id: 'media:play-pause', label: 'Play / pause', bytes: [0x04, 0, 0, 0x22] },
  { id: 'media:stop', label: 'Stop media', bytes: [0x04, 0, 0, 0x23] },
  { id: 'media:previous', label: 'Previous track', bytes: [0x04, 0, 0, 0x24] },
  { id: 'media:next', label: 'Next track', bytes: [0x04, 0, 0, 0x25] },
  { id: 'media:volume-up', label: 'Volume up', bytes: [0x04, 0, 0, 0x26] },
  { id: 'media:volume-down', label: 'Volume down', bytes: [0x04, 0, 0, 0x27] },
  { id: 'media:mute', label: 'Mute', bytes: [0x04, 0, 0, 0x28] },
  { id: 'media:brightness-up', label: 'Screen brightness up', bytes: [0x04, 0, 0, 0x29] },
  { id: 'media:brightness-down', label: 'Screen brightness down', bytes: [0x04, 0, 0, 0x2a] },
  { id: 'media:email', label: 'Open email', bytes: [0x04, 0, 0, 0x30] },
  { id: 'media:calculator', label: 'Open calculator', bytes: [0x04, 0, 0, 0x31] },
  { id: 'media:file-explorer', label: 'Open file explorer', bytes: [0x04, 0, 0, 0x32] },
  { id: 'media:home', label: 'Browser home', bytes: [0x04, 0, 0, 0x34] },
  { id: 'media:favorites', label: 'Browser favorites', bytes: [0x04, 0, 0, 0x39] },
  { id: 'media:task-view', label: 'Task view', bytes: [0x04, 0, 0, 0x5a] },
])

const DIRECT_ASSIGNMENTS = [...MOUSE_ASSIGNMENTS, ...MULTIMEDIA_ASSIGNMENTS]

export function encodeDirectAssignment(id: string): MatrixAssignment {
  const option = DIRECT_ASSIGNMENTS.find((candidate) => candidate.id === id)
  if (!option) throw new RangeError('Unknown or excluded B68 direct assignment.')
  return { bytes: [...option.bytes] as [number, number, number, number] }
}

export function directAssignmentLabel(type: number, command: number): string | undefined {
  return DIRECT_ASSIGNMENTS.find((option) => option.bytes[0] === type && option.bytes[3] === command)?.label
}
