export interface LightingEffect {
  appIndex: number
  hardwareId: number
  name: string
}

function effect(appIndex: number): LightingEffect {
  return Object.freeze({
    appIndex,
    hardwareId: appIndex === 20 ? 0 : appIndex === 19 ? 21 : appIndex,
    name: appIndex === 20 ? 'Off' : String(appIndex),
  })
}

/** Confirmed B68 hardware effect slots. Names remain intentionally neutral. */
export const B68_LIGHTING_EFFECTS: readonly LightingEffect[] = Object.freeze(
  Array.from({ length: 20 }, (_, index) => effect(index + 1)),
)

export function effectByHardwareId(hardwareId: number): LightingEffect | undefined {
  return B68_LIGHTING_EFFECTS.find((candidate) => candidate.hardwareId === hardwareId)
}
