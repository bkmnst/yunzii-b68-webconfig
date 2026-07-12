import { LIVE_RGB_PAYLOAD_LENGTH, LIVE_RGB_REPORT_ID } from './protocol'
import { decodeMacroAssignment, type MacroPlaybackMode } from './macro'

export const B68_MATRIX_ENTRY_COUNT = 128
export const B68_MATRIX_ENTRY_SIZE = 4
export const B68_MATRIX_BYTE_LENGTH = B68_MATRIX_ENTRY_COUNT * B68_MATRIX_ENTRY_SIZE
export const B68_MATRIX_CRC_INDEX = 127
export const B68_MATRIX_CRC_BYTES = [0x00, 0x00, 0x5a, 0xa5] as const

export type B68Layer = 'default' | 'fn1' | 'fn2' | 'tap'
export const B68_LAYERS: readonly B68Layer[] = ['default', 'fn1', 'fn2', 'tap']

export interface MatrixAssignment {
  readonly bytes: readonly [number, number, number, number]
}

export interface B68MatrixLayer {
  layer: B68Layer
  assignments: readonly MatrixAssignment[]
}

export type SemanticMatrixAssignment =
  | { kind: 'disabled' }
  | { kind: 'keyboard'; modifiers: number; usage: number }
  | { kind: 'macro'; index: number; mode: MacroPlaybackMode; repeatCount: number }
  | { kind: 'fn' }
  | { kind: 'device-command'; command: number }
  | { kind: 'lighting-command'; group: number; value: number; parameter: number }
  | { kind: 'crc-marker' }
  | { kind: 'unknown'; bytes: readonly [number, number, number, number] }

export function decodeSemanticAssignment(assignment: MatrixAssignment): SemanticMatrixAssignment {
  const [type, modifiers, parameter, usage] = assignment.bytes
  if (type === 0 && modifiers === 0 && parameter === 0x5a && usage === 0xa5) return { kind: 'crc-marker' }
  if (type === 0 && modifiers === 0 && parameter === 0 && usage === 0) return { kind: 'disabled' }
  if (type === 0 && parameter === 0) return { kind: 'keyboard', modifiers, usage }
  if (type === 0x03) {
    const macro = decodeMacroAssignment(Uint8Array.from(assignment.bytes))
    return { kind: 'macro', ...macro }
  }
  if (type === 0x0d && modifiers === 0 && parameter === 0 && usage === 0) return { kind: 'fn' }
  if (type === 0x07 && modifiers === 0 && parameter === 0) return { kind: 'device-command', command: usage }
  if (type === 0x08) return { kind: 'lighting-command', group: modifiers, value: parameter, parameter: usage }
  return { kind: 'unknown', bytes: assignment.bytes }
}

export function encodeKeyboardAssignment(modifiers: number, usage: number): MatrixAssignment {
  assertByte(modifiers)
  assertByte(usage)
  if (modifiers === 0 && usage === 0) throw new RangeError('Use a disabled assignment instead of an empty keyboard assignment.')
  return { bytes: [0, modifiers, 0, usage] }
}

export function encodeDisabledAssignment(): MatrixAssignment { return { bytes: [0, 0, 0, 0] } }
export function encodeFnAssignment(): MatrixAssignment { return { bytes: [0x0d, 0, 0, 0] } }

export function replaceMatrixAssignment(
  matrix: B68MatrixLayer,
  index: number,
  assignment: MatrixAssignment,
): B68MatrixLayer {
  if (!Number.isInteger(index) || index < 0 || index >= B68_MATRIX_CRC_INDEX) {
    throw new RangeError(`Editable B68 matrix indices are 0 through ${B68_MATRIX_CRC_INDEX - 1}.`)
  }
  assignment.bytes.forEach(assertByte)
  const assignments = matrix.assignments.map((current, currentIndex) => currentIndex === index
    ? { bytes: [...assignment.bytes] as [number, number, number, number] }
    : { bytes: [...current.bytes] as [number, number, number, number] })
  return { layer: matrix.layer, assignments }
}

export function matrixLayersEqual(left: B68MatrixLayer, right: B68MatrixLayer): boolean {
  return left.layer === right.layer && left.assignments.length === right.assignments.length
    && left.assignments.every((assignment, index) => assignment.bytes.every(
      (byte, offset) => byte === right.assignments[index].bytes[offset],
    ))
}

function layerIndex(layer: B68Layer): number {
  const index = B68_LAYERS.indexOf(layer)
  if (index < 0) throw new RangeError('Unknown B68 layer.')
  return index
}

function assertByte(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError('Matrix assignment bytes must be integers from 0 to 255.')
}

/** Builds the statically confirmed GetMatrix (0x83) query for one B68 layer. */
export function buildGetMatrixPayload(layer: B68Layer): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(new ArrayBuffer(LIVE_RGB_PAYLOAD_LENGTH))
  payload.set([0x83, layerIndex(layer), 0, 1, 0, B68_MATRIX_BYTE_LENGTH & 0xff, B68_MATRIX_BYTE_LENGTH >>> 8])
  return payload
}

/** Builds one complete, typed SetMatrix (0x03) payload; it is not a raw-send API. */
export function buildSetMatrixPayload(matrix: B68MatrixLayer): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(new ArrayBuffer(LIVE_RGB_PAYLOAD_LENGTH))
  payload.set([0x03, layerIndex(matrix.layer), 0, 1, 0, B68_MATRIX_BYTE_LENGTH & 0xff, B68_MATRIX_BYTE_LENGTH >>> 8])
  payload.set(encodeMatrixLayer(matrix), 7)
  return payload
}

export function encodeMatrixLayer(matrix: B68MatrixLayer): Uint8Array {
  if (matrix.assignments.length !== B68_MATRIX_ENTRY_COUNT) throw new RangeError(`A B68 matrix layer must contain ${B68_MATRIX_ENTRY_COUNT} assignments.`)
  const result = new Uint8Array(B68_MATRIX_BYTE_LENGTH)
  matrix.assignments.forEach((assignment, index) => {
    if (assignment.bytes.length !== B68_MATRIX_ENTRY_SIZE) throw new RangeError('Each matrix assignment must contain four bytes.')
    assignment.bytes.forEach(assertByte)
    result.set(assignment.bytes, index * B68_MATRIX_ENTRY_SIZE)
  })
  if (!B68_MATRIX_CRC_BYTES.every((byte, offset) => result[B68_MATRIX_CRC_INDEX * 4 + offset] === byte)) {
    throw new RangeError('B68 matrix CRC marker is missing or invalid.')
  }
  return result
}

export function decodeMatrixLayer(layer: B68Layer, bytes: Uint8Array): B68MatrixLayer {
  if (bytes.length !== B68_MATRIX_BYTE_LENGTH) throw new RangeError(`B68 matrix data must contain ${B68_MATRIX_BYTE_LENGTH} bytes.`)
  const assignments: MatrixAssignment[] = []
  for (let offset = 0; offset < bytes.length; offset += B68_MATRIX_ENTRY_SIZE) {
    assignments.push({ bytes: [bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]] })
  }
  if (!B68_MATRIX_CRC_BYTES.every((byte, offset) => bytes[B68_MATRIX_CRC_INDEX * 4 + offset] === byte)) {
    throw new RangeError('B68 matrix CRC marker is missing or invalid.')
  }
  return { layer, assignments }
}

/** Validates the native/WebHID response envelope before decoding all 128 entries. */
export function parseMatrixResponse(layer: B68Layer, response: DataView): B68MatrixLayer {
  const bytes = new Uint8Array(response.buffer, response.byteOffset, response.byteLength)
  const start = bytes[0] === LIVE_RGB_REPORT_ID ? 1 : 0
  const headerLength = 7
  if (bytes.length < start + headerLength + B68_MATRIX_BYTE_LENGTH) throw new RangeError('GetMatrix response is too short.')
  const expectedLayer = layerIndex(layer)
  if (bytes[start] !== 0x83 || bytes[start + 1] !== expectedLayer || bytes[start + 2] !== 0 || bytes[start + 3] !== 1 || bytes[start + 4] !== 0) {
    throw new RangeError('GetMatrix response header, layer, or page echo is invalid.')
  }
  const length = bytes[start + 5] | (bytes[start + 6] << 8)
  if (length !== B68_MATRIX_BYTE_LENGTH) throw new RangeError(`GetMatrix response declared ${length} bytes instead of ${B68_MATRIX_BYTE_LENGTH}.`)
  return decodeMatrixLayer(layer, bytes.slice(start + headerLength, start + headerLength + B68_MATRIX_BYTE_LENGTH))
}
