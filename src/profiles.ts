import type { RgbColor } from './protocol'

export interface LightingProfile {
  version: 1
  id: string
  name: string
  colors: Record<string, string>
  createdAt: string
}

export const LIGHTING_PROFILE_STORAGE_KEY = 'yunzii-b68-lighting-profiles-v1'

export function colorToHex(color: RgbColor): string {
  return `#${[color.red, color.green, color.blue]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase()
}

export function hexToColor(hex: string): RgbColor {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new TypeError(`Invalid RGB color: ${hex}`)
  const value = Number.parseInt(hex.slice(1), 16)
  return { red: (value >> 16) & 0xff, green: (value >> 8) & 0xff, blue: value & 0xff }
}

export function createLightingProfile(name: string, colors: ReadonlyMap<number, RgbColor>): LightingProfile {
  const cleanName = name.trim()
  if (!cleanName) throw new TypeError('Profile name cannot be empty.')
  const entries = [...colors.entries()].sort(([left], [right]) => left - right)
  return {
    version: 1,
    id: globalThis.crypto.randomUUID(),
    name: cleanName,
    colors: Object.fromEntries(entries.map(([slot, color]) => [String(slot), colorToHex(color)])),
    createdAt: new Date().toISOString(),
  }
}

export function profileColorMap(profile: LightingProfile): Map<number, RgbColor> {
  validateLightingProfile(profile)
  return new Map(Object.entries(profile.colors).map(([slot, color]) => [Number(slot), hexToColor(color)]))
}

export function validateLightingProfile(value: unknown): asserts value is LightingProfile {
  if (!value || typeof value !== 'object') throw new TypeError('Profile must be an object.')
  const profile = value as Partial<LightingProfile>
  if (profile.version !== 1 || typeof profile.id !== 'string' || typeof profile.name !== 'string'
    || typeof profile.createdAt !== 'string' || !profile.colors || typeof profile.colors !== 'object') {
    throw new TypeError('Unsupported or malformed lighting profile.')
  }
  for (const [slotText, color] of Object.entries(profile.colors)) {
    const slot = Number(slotText)
    if (!Number.isInteger(slot) || slot < 0 || slot > 95 || typeof color !== 'string') {
      throw new TypeError(`Invalid B68 LED slot: ${slotText}`)
    }
    hexToColor(color)
  }
}

export function parseProfileFile(text: string): LightingProfile {
  const value: unknown = JSON.parse(text)
  validateLightingProfile(value)
  return value
}

export function loadStoredProfiles(storage: Pick<Storage, 'getItem'>): LightingProfile[] {
  const raw = storage.getItem(LIGHTING_PROFILE_STORAGE_KEY)
  if (!raw) return []
  try {
    const values: unknown = JSON.parse(raw)
    if (!Array.isArray(values)) return []
    return values.filter((value): value is LightingProfile => {
      try { validateLightingProfile(value); return true } catch { return false }
    })
  } catch {
    return []
  }
}

export function storeProfiles(storage: Pick<Storage, 'setItem'>, profiles: readonly LightingProfile[]): void {
  storage.setItem(LIGHTING_PROFILE_STORAGE_KEY, JSON.stringify(profiles))
}

