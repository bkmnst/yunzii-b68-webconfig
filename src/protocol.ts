import type { ConnectionType, FirmwareInfo, MetricResult } from './types'

export type SafeQueryName = 'firmware' | 'battery'

export interface RgbColor {
  red: number
  green: number
  blue: number
}

export const B68_LED_SLOT_COUNT = 96
export const LIVE_RGB_REPORT_ID = 6
export const LIVE_RGB_PAYLOAD_LENGTH = 519
const LIVE_RGB_HEADER = [0x08, 0x00, 0x00, 0x01, 0x00, 0x7a, 0x01] as const
const IDENTITY_QUERY = [0x82, 0x01, 0x00, 0x01, 0x00, 0x06] as const
const GET_LED_HEADER = [0x84, 0x00, 0x00, 0x01, 0x00, 0x90, 0x01] as const
export const ONBOARD_LIGHTING_DATA_LENGTH = 400

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

function assertColorChannel(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError('RGB channels must be integers from 0 to 255.')
  }
}

/**
 * Builds report 6's 519-byte payload. WebHID supplies the report ID separately.
 * The B68 maps its 67 physical keys into LED slots 1–95; filling all 96 slots
 * safely covers every mapped key without relying on another model's key order.
 */
export function buildLiveRgbPayload(color: RgbColor): Uint8Array<ArrayBuffer> {
  assertColorChannel(color.red)
  assertColorChannel(color.green)
  assertColorChannel(color.blue)

  const payload = new Uint8Array(new ArrayBuffer(LIVE_RGB_PAYLOAD_LENGTH))
  payload.set(LIVE_RGB_HEADER)
  for (let slot = 0; slot < B68_LED_SLOT_COUNT; slot += 1) {
    const offset = LIVE_RGB_HEADER.length + slot * 3
    payload[offset] = color.red
    payload[offset + 1] = color.green
    payload[offset + 2] = color.blue
  }
  return payload
}

export function buildPerKeyRgbPayload(
  colors: ReadonlyMap<number, RgbColor>,
  background: RgbColor = { red: 0, green: 0, blue: 0 },
): Uint8Array<ArrayBuffer> {
  assertColorChannel(background.red)
  assertColorChannel(background.green)
  assertColorChannel(background.blue)
  const payload = buildLiveRgbPayload(background)
  for (const [slot, color] of colors) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= B68_LED_SLOT_COUNT) {
      throw new RangeError(`LED slot ${slot} is outside the B68 range.`)
    }
    assertColorChannel(color.red)
    assertColorChannel(color.green)
    assertColorChannel(color.blue)
    const offset = LIVE_RGB_HEADER.length + slot * 3
    payload[offset] = color.red
    payload[offset + 1] = color.green
    payload[offset + 2] = color.blue
  }
  return payload
}

export function buildIdentityQueryPayload(): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(new ArrayBuffer(LIVE_RGB_PAYLOAD_LENGTH))
  payload.set(IDENTITY_QUERY)
  return payload
}

/** Builds the driver's confirmed, read-only GetLED request for the B68. */
export function buildGetOnboardLightingPayload(): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(new ArrayBuffer(LIVE_RGB_PAYLOAD_LENGTH))
  payload.set(GET_LED_HEADER)
  return payload
}

export function parseOnboardLightingResponse(response: DataView): readonly number[] {
  const bytes = new Uint8Array(response.buffer, response.byteOffset, response.byteLength)
  const headerLength = GET_LED_HEADER.length
  if (bytes.length < headerLength + ONBOARD_LIGHTING_DATA_LENGTH) {
    throw new RangeError('GetLED response is shorter than its declared 400-byte data block.')
  }
  if (bytes[0] !== 0x84 || bytes[1] !== 0 || bytes[2] !== 0 || bytes[3] !== 1) {
    throw new RangeError('GetLED response header or page echo is invalid.')
  }
  const declaredLength = bytes[5] | (bytes[6] << 8)
  if (declaredLength !== ONBOARD_LIGHTING_DATA_LENGTH) {
    throw new RangeError(`GetLED response declared ${declaredLength} bytes instead of 400.`)
  }
  return [...bytes.slice(headerLength, headerLength + ONBOARD_LIGHTING_DATA_LENGTH)]
}

export function parseModelId(response: DataView): number {
  if (response.byteLength <= 12) throw new RangeError('Identity response is too short to contain a model ID.')
  return response.getUint8(12)
}
