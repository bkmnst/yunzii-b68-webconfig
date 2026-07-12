/** Parses the captured unsolicited B68 status report; acknowledgements are rejected. */
export function parseBatteryStatusReport(bytes: ArrayLike<number>): number | null {
  if (bytes.length !== 7 || bytes[0] !== 0x0a || bytes[1] !== 0x05 || bytes[3] !== 0x10
    || bytes[4] !== 0 || bytes[5] !== 0 || bytes[6] !== 0) return null
  const percentage = bytes[2]
  return Number.isInteger(percentage) && percentage >= 0 && percentage <= 100 ? percentage : null
}
