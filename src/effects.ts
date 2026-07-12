export interface LightingEffect {
  appIndex: number
  hardwareId: number
  previewAnimationId: number
  name: string
  supportsSpeed: boolean
  supportsBrightness: boolean
  supportsDirection: boolean
  supportsRandomColor: boolean
  supportsFixedColor: boolean
}

function effect(
  appIndex: number,
  previewAnimationId: number,
  name: string,
  speed: number,
  brightness: number,
  direction: number,
  randomColor: number,
  fixedColor: number,
): LightingEffect {
  return Object.freeze({
    appIndex,
    hardwareId: appIndex === 20 ? 0 : appIndex === 19 ? 21 : appIndex,
    previewAnimationId,
    name,
    supportsSpeed: Boolean(speed),
    supportsBrightness: Boolean(brightness),
    supportsDirection: Boolean(direction),
    supportsRandomColor: Boolean(randomColor),
    supportsFixedColor: Boolean(fixedColor),
  })
}

/** Exact B68 effect ordering and capability flags from its vendor definition. */
export const B68_LIGHTING_EFFECTS: readonly LightingEffect[] = Object.freeze([
  effect(1, 1, 'Fixed on', 0, 1, 0, 1, 1),
  effect(2, 3, 'Respire', 1, 1, 0, 1, 1),
  effect(3, 2, 'Rainbow', 1, 1, 0, 0, 0),
  effect(4, 19, 'Flash away', 1, 1, 0, 1, 1),
  effect(5, 15, 'Raindrops', 1, 1, 0, 1, 1),
  effect(6, 13, 'Rainbow wheel', 1, 1, 0, 1, 1),
  effect(7, 20, 'Ripples shining', 1, 1, 0, 1, 1),
  effect(8, 16, 'Stars twinkle', 1, 1, 0, 1, 1),
  effect(9, 18, 'Shadow disappear', 1, 1, 0, 1, 1),
  effect(10, 5, 'Retro snake', 1, 1, 0, 1, 1),
  effect(11, 7, 'Neon stream', 1, 1, 0, 1, 1),
  effect(12, 17, 'Reaction', 1, 1, 0, 1, 1),
  effect(13, 12, 'Sine wave', 1, 1, 0, 1, 1),
  effect(14, 8, 'Retinue scanning', 1, 1, 0, 1, 1),
  effect(15, 28, 'Rotating windmill', 1, 1, 0, 0, 0),
  effect(16, 30, 'Colorful waterfall', 1, 1, 0, 0, 0),
  effect(17, 14, 'Blossoming', 1, 1, 0, 0, 0),
  effect(18, 29, 'Rotating storm', 1, 1, 0, 1, 1),
  effect(19, 0, 'Self-define', 0, 0, 0, 0, 0),
  effect(20, 0, 'Off', 0, 0, 0, 0, 0),
])

export function effectByHardwareId(hardwareId: number): LightingEffect | undefined {
  return B68_LIGHTING_EFFECTS.find((candidate) => candidate.hardwareId === hardwareId)
}
