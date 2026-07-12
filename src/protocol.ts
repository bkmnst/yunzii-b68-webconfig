import type { ConnectionType, FirmwareInfo, MetricResult } from './types'

export type SafeQueryName = 'firmware' | 'battery'

/**
 * No command is shipped until its wire format has been independently confirmed.
 * Keeping this table empty is an intentional safety control, not a placeholder
 * for arbitrary packets.
 */
const CONFIRMED_QUERIES: Readonly<
  Partial<Record<ConnectionType, Readonly<Partial<Record<SafeQueryName, never>>>>>
> = Object.freeze({})

export function hasConfirmedQuery(connection: ConnectionType, name: SafeQueryName): boolean {
  return Boolean(CONFIRMED_QUERIES[connection]?.[name])
}

export function unsupportedFirmware(): MetricResult<FirmwareInfo> {
  return {
    state: 'unsupported',
    message: 'The read-only firmware command has not been safely confirmed yet.',
  }
}

export function unsupportedBattery(connection: ConnectionType): MetricResult<number> {
  return {
    state: 'unsupported',
    message: connection === 'wired'
      ? 'Battery reporting is normally unavailable while the keyboard is wired.'
      : 'The read-only battery command has not been safely confirmed yet.',
  }
}

export function validateBattery(raw: readonly number[], offset: number): MetricResult<number> {
  const value = raw[offset]
  if (value === undefined || value < 0 || value > 100) {
    return { state: 'invalid-response', message: 'Battery value was outside 0–100%.', raw }
  }
  return { state: 'available', value, raw }
}

export function validateChecksum(bytes: readonly number[]): boolean {
  if (bytes.length < 2) return false
  const expected = bytes.at(-1)
  const calculated = bytes.slice(0, -1).reduce((sum, value) => (sum + value) & 0xff, 0)
  return expected === calculated
}

