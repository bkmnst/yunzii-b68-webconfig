import { describe, expect, it } from 'vitest'
import { decodeMacroArchive, decodeMacroAssignment, encodeMacroArchive, encodeMacroAssignment, MACRO_MAX_COUNT } from './macro'

describe('macro archive codec', () => {
  it('encodes the descriptor table, UTF-16LE names, and four-byte events', () => {
    const bytes = encodeMacroArchive([{ name: 'A', events: [
      { type: 1, delayMs: 0x12345, value: 0x04 },
      { type: 1, delayMs: 20, value: 0x04, released: true },
    ] }])
    expect([...bytes]).toEqual([
      0x04, 0x00, 0x0b, 0x00,
      0x02, 0x41, 0x00,
      0x11, 0x23, 0x45, 0x04,
      0x90, 0x00, 0x14, 0x04,
    ])
  })

  it('round-trips multiple macro records', () => {
    const macros = [
      { name: 'Copy', events: [{ type: 1 as const, delayMs: 0, value: 0x06 }] },
      { name: 'Wheel', events: [{ type: 3 as const, delayMs: 1000, value: 0xff }] },
    ]
    expect(decodeMacroArchive(encodeMacroArchive(macros), 2)).toEqual([
      { name: 'Copy', events: [{ type: 1, delayMs: 0, value: 0x06, released: false }] },
      { name: 'Wheel', events: [{ type: 3, delayMs: 1000, value: 0xff, released: false }] },
    ])
  })

  it('rejects unsafe sizes, event fields, and malformed descriptors', () => {
    expect(() => encodeMacroArchive(Array.from({ length: MACRO_MAX_COUNT + 1 }, () => ({ name: '', events: [] })))).toThrow('At most')
    expect(() => encodeMacroArchive([{ name: '', events: [{ type: 1, delayMs: 0x100000, value: 1 }] }])).toThrow('delay')
    expect(() => encodeMacroArchive([{ name: '', events: [{ type: 2, delayMs: 0, value: 1, released: true }] }])).toThrow('Only keyboard')
    expect(() => decodeMacroArchive(Uint8Array.from([5, 0, 1, 0, 0]), 1)).toThrow('contiguous')
  })

  it('encodes and validates macro key assignments', () => {
    expect([...encodeMacroAssignment(7, 0, 3)]).toEqual([0x03, 0x01, 0x03, 0x07])
    expect(decodeMacroAssignment(encodeMacroAssignment(99, 2))).toEqual({ index: 99, setting: 2, repeatCount: 1 })
    expect(() => encodeMacroAssignment(100, 0)).toThrow('index')
    expect(() => decodeMacroAssignment(Uint8Array.of(3, 4, 2, 0))).toThrow('playback')
  })
})
