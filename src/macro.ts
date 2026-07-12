export const MACRO_MAX_COUNT = 100
export const MACRO_DATA_CAPACITY = 0x2000
export const MACRO_TRANSFER_CAPACITY = 0x2800
export const MACRO_MAX_DELAY_MS = 0xfffff

export type MacroEventType = 1 | 2 | 3 | 4 | 5

export interface HardwareMacroEvent {
  type: MacroEventType
  delayMs: number
  value: number
  /** Only keyboard events (type 1) use bit 7 as the key-release flag. */
  released?: boolean
}

export interface HardwareMacro {
  name: string
  events: readonly HardwareMacroEvent[]
}

export type MacroPlaybackSetting = 0 | 1 | 2

/** Encodes the confirmed four-byte key-matrix reference to a macro record. */
export function encodeMacroAssignment(index: number, setting: MacroPlaybackSetting, repeatCount = 1): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index >= MACRO_MAX_COUNT) throw new RangeError('Macro index is out of range.')
  if (setting !== 0 && setting !== 1 && setting !== 2) throw new RangeError('Macro playback setting must be 0, 1, or 2.')
  assertByte(repeatCount, 'Macro repeat count')
  if (setting === 0 && repeatCount === 0) throw new RangeError('Macro repeat count must be at least 1 for playback setting 0.')
  return Uint8Array.of(0x03, 1 << setting, setting === 0 ? repeatCount : 1, index)
}

export function decodeMacroAssignment(bytes: Uint8Array): { index: number; setting: MacroPlaybackSetting; repeatCount: number } {
  if (bytes.length !== 4 || bytes[0] !== 0x03 || bytes[3] >= MACRO_MAX_COUNT) throw new RangeError('Invalid macro key assignment.')
  const setting = bytes[1] === 1 ? 0 : bytes[1] === 2 ? 1 : bytes[1] === 4 ? 2 : -1
  if (setting < 0 || (setting !== 0 && bytes[2] !== 1) || bytes[2] === 0) throw new RangeError('Invalid macro playback fields.')
  return { index: bytes[3], setting: setting as MacroPlaybackSetting, repeatCount: bytes[2] }
}

function encodeUtf16Le(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < value.length; index += 1) view.setUint16(index * 2, value.charCodeAt(index), true)
  return bytes
}

function decodeUtf16Le(bytes: Uint8Array): string {
  if (bytes.length % 2 !== 0) throw new RangeError('Macro name byte length must be even UTF-16LE data.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let value = ''
  for (let index = 0; index < bytes.length; index += 2) value += String.fromCharCode(view.getUint16(index, true))
  return value
}

function assertByte(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError(`${field} must be an integer from 0 to 255.`)
}

function encodeMacro(macro: HardwareMacro): Uint8Array {
  const name = encodeUtf16Le(macro.name)
  if (name.length > 0xfe) throw new RangeError('Macro names may contain at most 127 UTF-16 code units.')
  const result = new Uint8Array(1 + name.length + macro.events.length * 4)
  result[0] = name.length
  result.set(name, 1)
  let offset = 1 + name.length
  for (const event of macro.events) {
    if (!Number.isInteger(event.type) || event.type < 1 || event.type > 5) throw new RangeError('Macro event type must be from 1 to 5.')
    if (!Number.isInteger(event.delayMs) || event.delayMs < 0 || event.delayMs > MACRO_MAX_DELAY_MS) {
      throw new RangeError(`Macro delay must be an integer from 0 to ${MACRO_MAX_DELAY_MS}.`)
    }
    assertByte(event.value, 'Macro event value')
    if (event.released && event.type !== 1) throw new TypeError('Only keyboard macro events can be marked released.')
    result[offset] = (event.type << 4) | (event.released ? 0x80 : 0) | (event.delayMs >>> 16)
    result[offset + 1] = event.delayMs >>> 8
    result[offset + 2] = event.delayMs
    result[offset + 3] = event.value
    offset += 4
  }
  return result
}

/** Encodes the vendor archive: a packed address/size table followed by macro records. */
export function encodeMacroArchive(macros: readonly HardwareMacro[]): Uint8Array {
  if (macros.length > MACRO_MAX_COUNT) throw new RangeError(`At most ${MACRO_MAX_COUNT} macros can be stored.`)
  const records = macros.map(encodeMacro)
  const dataLength = records.reduce((total, record) => total + record.length, 0)
  if (dataLength > MACRO_DATA_CAPACITY) throw new RangeError(`Macro records exceed the ${MACRO_DATA_CAPACITY}-byte data capacity.`)
  const tableLength = records.length * 4
  const totalLength = tableLength + dataLength
  if (totalLength > MACRO_TRANSFER_CAPACITY) throw new RangeError('Macro archive exceeds the keyboard transfer capacity.')
  const result = new Uint8Array(totalLength)
  const view = new DataView(result.buffer)
  let offset = tableLength
  records.forEach((record, index) => {
    view.setUint16(index * 4, offset, true)
    view.setUint16(index * 4 + 2, record.length, true)
    result.set(record, offset)
    offset += record.length
  })
  return result
}

/** Decodes an archive when its macro count is known from the layer matrix assignments. */
export function decodeMacroArchive(bytes: Uint8Array, macroCount: number): readonly HardwareMacro[] {
  if (!Number.isInteger(macroCount) || macroCount < 0 || macroCount > MACRO_MAX_COUNT) throw new RangeError('Invalid macro count.')
  if (bytes.length > MACRO_TRANSFER_CAPACITY || bytes.length < macroCount * 4) throw new RangeError('Invalid macro archive length.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const result: HardwareMacro[] = []
  let priorEnd = macroCount * 4
  for (let index = 0; index < macroCount; index += 1) {
    const address = view.getUint16(index * 4, true)
    const size = view.getUint16(index * 4 + 2, true)
    if (address !== priorEnd || size < 1 || address + size > bytes.length) throw new RangeError('Macro descriptor table is not contiguous or is out of bounds.')
    const record = bytes.subarray(address, address + size)
    const nameLength = record[0]
    if (nameLength % 2 !== 0 || 1 + nameLength > record.length || (record.length - 1 - nameLength) % 4 !== 0) {
      throw new RangeError('Macro record has an invalid name or event length.')
    }
    const name = decodeUtf16Le(record.subarray(1, 1 + nameLength))
    const events: HardwareMacroEvent[] = []
    for (let offset = 1 + nameLength; offset < record.length; offset += 4) {
      const flags = record[offset]
      const type = ((flags >>> 4) & 0x07) as MacroEventType
      if (type < 1 || type > 5) throw new RangeError('Macro record contains an unknown event type.')
      events.push({
        type,
        released: type === 1 && (flags & 0x80) !== 0,
        delayMs: ((flags & 0x0f) << 16) | (record[offset + 1] << 8) | record[offset + 2],
        value: record[offset + 3],
      })
    }
    result.push({ name, events })
    priorEnd = address + size
  }
  if (priorEnd !== bytes.length) throw new RangeError('Macro archive contains unreferenced trailing data.')
  return result
}
