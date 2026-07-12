import { describe, expect, it } from 'vitest'
import {
  B68_MATRIX_BYTE_LENGTH,
  B68_MATRIX_ENTRY_COUNT,
  buildGetMatrixPayload,
  buildSetMatrixPayload,
  decodeMatrixLayer,
  decodeSemanticAssignment,
  encodeDisabledAssignment,
  encodeFnAssignment,
  encodeKeyboardAssignment,
  encodeMatrixLayer,
  matrixLayersEqual,
  type MatrixAssignment,
  parseMatrixResponse,
  replaceMatrixAssignment,
} from './matrix'

describe('B68 matrix protocol', () => {
  it('builds a layer-specific 512-byte GetMatrix request', () => {
    const payload = buildGetMatrixPayload('fn2')
    expect(payload).toHaveLength(519)
    expect([...payload.slice(0, 7)]).toEqual([0x83, 2, 0, 1, 0, 0x00, 0x02])
  })

  it('round-trips exactly 128 entries including the required CRC marker', () => {
    const assignments: MatrixAssignment[] = Array.from({ length: B68_MATRIX_ENTRY_COUNT }, (_, index) => ({
      bytes: [3, 1, 1, index],
    }))
    assignments[127] = { bytes: [0, 0, 0x5a, 0xa5] }
    const encoded = encodeMatrixLayer({ layer: 'default', assignments })
    expect(encoded).toHaveLength(B68_MATRIX_BYTE_LENGTH)
    expect(decodeMatrixLayer('default', encoded)).toEqual({ layer: 'default', assignments })
    const write = buildSetMatrixPayload({ layer: 'fn1', assignments })
    expect([...write.slice(0, 7)]).toEqual([0x03, 1, 0, 1, 0, 0, 2])
    expect([...write.slice(7, 7 + B68_MATRIX_BYTE_LENGTH)]).toEqual([...encoded])
    expect([...write.slice(7 + B68_MATRIX_BYTE_LENGTH)]).toEqual([])
  })

  it('accepts the observed native report-ID prefix and rejects mismatched layers', () => {
    const response = new Uint8Array(520)
    response[0] = 6
    response.set([0x83, 1, 0, 1, 0, 0x00, 0x02], 1)
    response.fill(0x12, 8, 8 + B68_MATRIX_BYTE_LENGTH)
    response.set([0, 0, 0x5a, 0xa5], 8 + 127 * 4)
    expect(parseMatrixResponse('fn1', new DataView(response.buffer)).assignments).toHaveLength(128)
    expect(() => parseMatrixResponse('fn2', new DataView(response.buffer))).toThrow('layer')
  })

  it('rejects incomplete matrices and malformed response lengths', () => {
    expect(() => decodeMatrixLayer('tap', new Uint8Array(511))).toThrow('512')
    const response = buildGetMatrixPayload('default')
    response[6] = 1
    expect(() => parseMatrixResponse('default', new DataView(response.buffer))).toThrow('declared')
  })

  it('replaces only an editable assignment and compares complete layers', () => {
    const assignments: MatrixAssignment[] = Array.from({ length: 128 }, () => ({ bytes: [0, 0, 0, 0] }))
    assignments[127] = { bytes: [0, 0, 0x5a, 0xa5] }
    const original = { layer: 'fn1', assignments } as const
    const changed = replaceMatrixAssignment(original, 33, encodeKeyboardAssignment(0x02, 0x0a))
    expect(changed.assignments[33].bytes).toEqual([0, 2, 0, 10])
    expect(original.assignments[33].bytes).toEqual([0, 0, 0, 0])
    expect(matrixLayersEqual(original, changed)).toBe(false)
    expect(matrixLayersEqual(changed, replaceMatrixAssignment(original, 33, encodeKeyboardAssignment(2, 10)))).toBe(true)
    expect(() => replaceMatrixAssignment(original, 127, encodeKeyboardAssignment(0, 4))).toThrow('0 through 126')
  })

  it('decodes assignment forms confirmed by the Default-layer hardware capture', () => {
    expect(decodeSemanticAssignment({ bytes: [0, 0, 0, 0x04] })).toEqual({ kind: 'keyboard', modifiers: 0, usage: 0x04 })
    expect(decodeSemanticAssignment({ bytes: [0, 0x02, 0, 0] })).toEqual({ kind: 'keyboard', modifiers: 0x02, usage: 0 })
    expect(decodeSemanticAssignment({ bytes: [0x0d, 0, 0, 0] })).toEqual({ kind: 'fn' })
    expect(decodeSemanticAssignment({ bytes: [0x07, 0, 0, 0x14] })).toEqual({ kind: 'device-command', command: 0x14 })
    expect(decodeSemanticAssignment({ bytes: [0x08, 3, 1, 0] })).toEqual({ kind: 'lighting-command', group: 3, value: 1, parameter: 0 })
    expect(decodeSemanticAssignment({ bytes: [0x01, 0, 0, 0x11] })).toEqual({ kind: 'mouse-command', command: 0x11 })
    expect(decodeSemanticAssignment({ bytes: [0x04, 0, 0, 0x22] })).toEqual({ kind: 'multimedia-command', command: 0x22 })
    expect(encodeKeyboardAssignment(0x40, 0).bytes).toEqual([0, 0x40, 0, 0])
    expect(encodeDisabledAssignment().bytes).toEqual([0, 0, 0, 0])
    expect(encodeFnAssignment().bytes).toEqual([0x0d, 0, 0, 0])
  })
})
