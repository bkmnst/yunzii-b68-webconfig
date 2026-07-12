import { describe, expect, it } from 'vitest'
import {
  colorToHex,
  createLightingProfile,
  hexToColor,
  loadStoredProfiles,
  parseProfileFile,
  profileColorMap,
  storeProfiles,
} from './profiles'

describe('lighting profiles', () => {
  it('converts RGB colors without loss', () => {
    expect(colorToHex({ red: 1, green: 160, blue: 255 })).toBe('#01A0FF')
    expect(hexToColor('#01a0ff')).toEqual({ red: 1, green: 160, blue: 255 })
  })

  it('creates sorted B68 profiles and restores their color map', () => {
    const profile = createLightingProfile('  Night  ', new Map([
      [95, { red: 0, green: 0, blue: 255 }],
      [1, { red: 255, green: 0, blue: 0 }],
    ]))
    expect(profile.name).toBe('Night')
    expect(Object.keys(profile.colors)).toEqual(['1', '95'])
    expect(profileColorMap(profile).get(95)).toEqual({ red: 0, green: 0, blue: 255 })
  })

  it('rejects malformed imported profiles', () => {
    expect(() => parseProfileFile('{"version":2}')).toThrow(TypeError)
    expect(() => parseProfileFile(JSON.stringify({
      version: 1, id: 'x', name: 'x', createdAt: '', colors: { 96: '#000000' },
    }))).toThrow(TypeError)
  })

  it('stores profiles and skips invalid stored entries', () => {
    let raw: string | null = null
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => { raw = value },
    }
    const profile = createLightingProfile('Saved', new Map())
    storeProfiles(storage, [profile])
    expect(loadStoredProfiles(storage)).toEqual([profile])
    raw = JSON.stringify([profile, { bad: true }])
    expect(loadStoredProfiles(storage)).toEqual([profile])
  })
})

