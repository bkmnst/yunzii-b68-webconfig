import { describe, expect, it } from 'vitest'
import {
  B68_MATRIX_BYTE_LENGTH,
  B68_MATRIX_ENTRY_COUNT,
  buildGetMatrixPayload,
  decodeMatrixLayer,
  encodeMatrixLayer,
  parseMatrixResponse,
} from './matrix'

describe('B68 matrix protocol', () => {
  it('builds a layer-specific 384-byte GetMatrix request', () => {
    const payload = buildGetMatrixPayload('fn2')
    expect(payload).toHaveLength(519)
    expect([...payload.slice(0, 7)]).toEqual([0x83, 2, 0, 1, 0, 0x80, 0x01])
  })

  it('round-trips exactly 96 four-byte assignments', () => {
    const assignments = Array.from({ length: B68_MATRIX_ENTRY_COUNT }, (_, index) => ({
      bytes: [3, 1, 1, index] as const,
    }))
    const encoded = encodeMatrixLayer({ layer: 'default', assignments })
    expect(encoded).toHaveLength(B68_MATRIX_BYTE_LENGTH)
    expect(decodeMatrixLayer('default', encoded)).toEqual({ layer: 'default', assignments })
  })

  it('accepts the observed native report-ID prefix and rejects mismatched layers', () => {
    const response = new Uint8Array(520)
    response[0] = 6
    response.set([0x83, 1, 0, 1, 0, 0x80, 1], 1)
    response.fill(0x12, 8, 8 + B68_MATRIX_BYTE_LENGTH)
    expect(parseMatrixResponse('fn1', new DataView(response.buffer)).assignments).toHaveLength(96)
    expect(() => parseMatrixResponse('fn2', new DataView(response.buffer))).toThrow('layer')
  })

  it('rejects incomplete matrices and malformed response lengths', () => {
    expect(() => decodeMatrixLayer('tap', new Uint8Array(383))).toThrow('384')
    const response = buildGetMatrixPayload('default')
    response[5] = 0
    expect(() => parseMatrixResponse('default', new DataView(response.buffer))).toThrow('declared')
  })
})
