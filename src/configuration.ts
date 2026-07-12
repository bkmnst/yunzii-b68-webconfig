import { B68_LIGHTING_EFFECTS, type LightingEffect } from './effects'

export const B68_CONFIGURATION_LENGTH = 128
export const B68_CONFIGURATION_MARKER_OFFSET = 126
export const B68_DEBOUNCE_MIN_MS = 1
export const B68_DEBOUNCE_MAX_MS = 4

export interface B68OnboardConfiguration {
  debounceMs: number
  hardwareEffectId: number
  effect: LightingEffect | null
  effectName: string
  effectParameter: number
  raw: readonly number[]
}

/** Parses the hardware-backed first 128 bytes returned by GetLED. */
export function parseB68OnboardConfiguration(bytes: ArrayLike<number>): B68OnboardConfiguration {
  if (bytes.length < B68_CONFIGURATION_LENGTH) throw new RangeError('B68 configuration record is shorter than 128 bytes.')
  if (bytes[B68_CONFIGURATION_MARKER_OFFSET] !== 0x5a || bytes[B68_CONFIGURATION_MARKER_OFFSET + 1] !== 0xa5) {
    throw new RangeError('B68 configuration marker is invalid.')
  }
  const debounceMs = bytes[3]
  if (debounceMs < B68_DEBOUNCE_MIN_MS || debounceMs > B68_DEBOUNCE_MAX_MS) {
    throw new RangeError('B68 debounce value is outside its confirmed 1–4 ms capability.')
  }
  const hardwareEffectId = bytes[10]
  const effectCandidates = B68_LIGHTING_EFFECTS.filter((candidate) => candidate.hardwareId === hardwareEffectId)
  const effect = effectCandidates.length === 1 ? effectCandidates[0] : null
  const effectName = effect?.name ?? (effectCandidates.length > 1
    ? effectCandidates.map((candidate) => candidate.name).join(' / ')
    : `Unknown effect ${hardwareEffectId}`)
  return {
    debounceMs,
    hardwareEffectId,
    effect,
    effectName,
    effectParameter: bytes[11],
    raw: Array.from({ length: B68_CONFIGURATION_LENGTH }, (_, index) => bytes[index]),
  }
}
