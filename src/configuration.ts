import { B68_LIGHTING_EFFECTS, type LightingEffect } from './effects'

export const B68_CONFIGURATION_LENGTH = 128
export const B68_CONFIGURATION_MARKER_OFFSET = 126
export const B68_DEBOUNCE_MIN_MS = 1
export const B68_DEBOUNCE_MAX_MS = 4
export const B68_LIGHTING_LEVEL_MIN = 0
export const B68_LIGHTING_LEVEL_MAX = 4

export interface B68OnboardConfiguration {
  debounceMs: number
  speedLevel: number
  brightnessLevel: number
  hardwareEffectId: number
  effect: LightingEffect | null
  effectName: string
  effectParameter: number
  raw: readonly number[]
}

export interface B68ConfigurationPatch {
  debounceMs?: number
  speedLevel?: number
  brightnessLevel?: number
  hardwareEffectId?: number
}

export function buildSetConfigurationPayload(
  baseline: B68OnboardConfiguration,
  patch: B68ConfigurationPatch,
): Uint8Array<ArrayBuffer> {
  if (patch.debounceMs !== undefined
    && (!Number.isInteger(patch.debounceMs) || patch.debounceMs < B68_DEBOUNCE_MIN_MS || patch.debounceMs > B68_DEBOUNCE_MAX_MS)) {
      throw new RangeError('B68 debounce must be an integer from 1 to 4 ms.')
  }
  if (patch.hardwareEffectId !== undefined && !B68_LIGHTING_EFFECTS.some((effect) => effect.hardwareId === patch.hardwareEffectId)) {
    throw new RangeError('Unknown B68 hardware effect ID.')
  }
  for (const [name, value] of [['speed', patch.speedLevel], ['brightness', patch.brightnessLevel]] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < B68_LIGHTING_LEVEL_MIN || value > B68_LIGHTING_LEVEL_MAX)) {
      throw new RangeError(`B68 ${name} level must be an integer from 0 to 4.`)
    }
  }
  // Validate the complete baseline and its marker before preserving all unknown fields.
  parseB68OnboardConfiguration(baseline.raw)
  const payload = new Uint8Array(new ArrayBuffer(519))
  payload.set([0x04, 0, 0, 1, 0, B68_CONFIGURATION_LENGTH, 0])
  payload.set(baseline.raw, 7)
  if (patch.debounceMs !== undefined) payload[7 + 3] = patch.debounceMs
  if (patch.speedLevel !== undefined) payload[7 + 6] = patch.speedLevel
  if (patch.brightnessLevel !== undefined) payload[7 + 7] = patch.brightnessLevel
  if (patch.hardwareEffectId !== undefined) payload[7 + 10] = patch.hardwareEffectId
  return payload
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
  const speedLevel = bytes[6]
  const brightnessLevel = bytes[7]
  if (speedLevel > B68_LIGHTING_LEVEL_MAX || brightnessLevel > B68_LIGHTING_LEVEL_MAX) {
    throw new RangeError('B68 lighting level is outside its confirmed 0–4 capability.')
  }
  const effectCandidates = B68_LIGHTING_EFFECTS.filter((candidate) => candidate.hardwareId === hardwareEffectId)
  const effect = effectCandidates.length === 1 ? effectCandidates[0] : null
  const effectName = effect?.name ?? (effectCandidates.length > 1
    ? effectCandidates.map((candidate) => candidate.name).join(' / ')
    : `Unknown effect ${hardwareEffectId}`)
  return {
    debounceMs,
    speedLevel,
    brightnessLevel,
    hardwareEffectId,
    effect,
    effectName,
    effectParameter: bytes[11],
    raw: Array.from({ length: B68_CONFIGURATION_LENGTH }, (_, index) => bytes[index]),
  }
}
