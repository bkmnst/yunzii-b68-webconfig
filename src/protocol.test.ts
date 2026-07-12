import { describe, expect, it } from 'vitest'
import {
  B68_LED_SLOT_COUNT,
  buildLiveRgbPayload,
  buildGetOnboardLightingPayload,
  buildPerKeyRgbPayload,
  LIVE_RGB_PAYLOAD_LENGTH,
  parseOnboardLightingResponse,
} from './protocol'

describe('live RGB report', () => {
  it('builds the B68 report 6 payload with every mapped LED slot filled', () => {
    const payload = buildLiveRgbPayload({ red: 0x12, green: 0x34, blue: 0x56 })
    expect(payload).toHaveLength(LIVE_RGB_PAYLOAD_LENGTH)
    expect([...payload.slice(0, 7)]).toEqual([0x08, 0x00, 0x00, 0x01, 0x00, 0x7a, 0x01])
    for (let slot = 0; slot < B68_LED_SLOT_COUNT; slot += 1) {
      expect([...payload.slice(7 + slot * 3, 10 + slot * 3)]).toEqual([0x12, 0x34, 0x56])
    }
    expect([...payload.slice(7 + B68_LED_SLOT_COUNT * 3)]).toEqual(
      Array(LIVE_RGB_PAYLOAD_LENGTH - 7 - B68_LED_SLOT_COUNT * 3).fill(0),
    )
  })

  it('rejects invalid RGB channels', () => {
    expect(() => buildLiveRgbPayload({ red: -1, green: 0, blue: 0 })).toThrow(RangeError)
    expect(() => buildLiveRgbPayload({ red: 256, green: 0, blue: 0 })).toThrow(RangeError)
    expect(() => buildLiveRgbPayload({ red: 1.5, green: 0, blue: 0 })).toThrow(RangeError)
  })

  it('places per-key colors at sparse B68 LED indices', () => {
    const colors = new Map([
      [1, { red: 255, green: 0, blue: 0 }],
      [95, { red: 0, green: 0, blue: 255 }],
    ])
    const payload = buildPerKeyRgbPayload(colors)
    expect([...payload.slice(10, 13)]).toEqual([255, 0, 0])
    expect([...payload.slice(7 + 95 * 3, 10 + 95 * 3)]).toEqual([0, 0, 255])
    expect([...payload.slice(7, 10)]).toEqual([0, 0, 0])
  })

  it('rejects per-key colors outside the B68 LED range', () => {
    expect(() => buildPerKeyRgbPayload(new Map([[96, { red: 1, green: 2, blue: 3 }]]))).toThrow(RangeError)
  })
})

describe('onboard lighting query', () => {
  it('builds the confirmed 400-byte GetLED request', () => {
    const payload = buildGetOnboardLightingPayload()
    expect(payload).toHaveLength(519)
    expect([...payload.slice(0, 7)]).toEqual([0x84, 0, 0, 1, 0, 0x90, 1])
    expect([...payload.slice(7)]).toEqual(Array(512).fill(0))
  })

  it('accepts only a matching GetLED response envelope', () => {
    const response = buildGetOnboardLightingPayload()
    response.fill(0x5a, 7, 407)
    expect(parseOnboardLightingResponse(new DataView(response.buffer))).toHaveLength(400)
    response[0] = 0x04
    expect(() => parseOnboardLightingResponse(new DataView(response.buffer))).toThrow('header')
    expect(() => parseOnboardLightingResponse(new DataView(new ArrayBuffer(406)))).toThrow('shorter')
  })

  it('accepts the native report ID prefix observed on Chromium feature reads', () => {
    const response = new Uint8Array(520)
    response[0] = 6
    response.set([0x84, 0, 0, 1, 0, 0x90, 1], 1)
    response.fill(0x33, 8, 408)
    const data = parseOnboardLightingResponse(new DataView(response.buffer))
    expect(data).toHaveLength(400)
    expect(data[0]).toBe(0x33)
  })
})
