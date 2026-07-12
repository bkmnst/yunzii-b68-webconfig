# B68 protocol evidence

This document records independently recovered protocol facts from static analysis of the extracted vendor executable. The executable was not run. Addresses refer to the analyzed `OemDrv.exe` image and vendor binaries are intentionally excluded from Git.

## HID interfaces

- Wired B68: `258A:010C`, configuration firmware family `Fw=24`.
- Wireless dongle: `3554:FA09`; its transport remains unconfirmed.
- The wired configuration interface uses feature report 6 with a native length of 520 bytes. WebHID passes the report ID separately and therefore exposes a 519-byte payload.

## Configuration envelope

`CDevG5KB::AccessData` selects native report ID 6 for `Fw=24`. A one-page WebHID payload has this seven-byte envelope:

| Offset | Meaning |
| --- | --- |
| 0 | semantic command |
| 1 | selector, zero where unused |
| 2 | reserved zero |
| 3 | one-based page number |
| 4 | reserved zero |
| 5 | data length, low byte |
| 6 | data length, high byte |
| 7... | data or zero padding |

The native implementation chunks larger transfers at 512 data bytes. Read operations send the request with `HidD_SetFeature`, wait, and then call `HidD_GetFeature`.

## Confirmed semantic commands

| Command | Read/write | Vendor method | Status |
| --- | --- | --- | --- |
| `0x04` | write | `SetLED` | 128-byte constructed record; data layout partly recovered |
| `0x84` | read | `GetLED` | 400-byte data block; shipped as a guarded diagnostic read |
| `0x05` / `0x85` | write/read | `SetMacro` / `GetMacro` | Envelope confirmed; data layout pending |
| `0x06` / `0x86` | write/read | `SetGame` / `GetGame` | Envelope confirmed; selector/layout pending |
| `0x0A` / `0x8A` | write/read | `SetLedRgbTab` / `GetLedRgbTab` | 512-byte RGB table; layout partly recovered |
| `0x0B` | write | `SetScreenParam` | Out of scope unless B68 evidence shows a keyboard use |
| `0x11` | write | `ResetDevice` | Explicitly forbidden and not implemented |

`SetMatrix` / `GetMatrix` are the separate command pair `0x03` / `0x83`. The selector is the zero-based layer number: Default, FN1, FN2, or Tap. The B68 matrix has 96 four-byte hardware assignments, so each layer transfer is exactly 384 bytes. Physical keys use the matrix indices recorded in `KB.ini` (1 through 95 for this layout, with unused positions retained). A strict read-query builder and response codec are implemented, and the diagnostic UI permits one explicitly selected read at a time; no arbitrary matrix bytes are exposed to the UI.

The paired read command is the write command with bit 7 set. This is documented evidence, not permission to synthesize or expose arbitrary commands.

## Onboard lighting

The wired sync routine calls `GetLED` with exactly 400 bytes and retries malformed data at most three times. The confirmed WebHID request prefix is:

```text
84 00 00 01 00 90 01
```

The response must echo command `0x84`, selector zero, reserved zero, page 1, and length 400 before its data is accepted. Hardware diagnostics show that Chromium returns native report ID `06` as byte 0 for this B68 feature interface, even though WebHID normally supplies the report ID separately; the parser therefore accepts either framing and validates all remaining fields at the corresponding offset. The vendor sync routine additionally validates fields inside the data block; those offsets are not yet all named.

The normal write path does **not** write the 400-byte read buffer back. It constructs a fresh 128-byte record, passes it to `SetLED`, waits 60 ms, and checks a device-state getter. Earlier analysis mistook that getter for an apply command; no separate commit packet has been established. Confirmed constructed offsets include an effect-state flag at 9, hardware effect ID at 10, another effect parameter at 11, side-light fields at 18–21, optional settings at 22–24, two `FF` sentinels at 56–57, and a sequence of packed pairs beginning at 58. The semantic names of every field still require correlation with a real response or additional static evidence.

The B68 definition supplies 20 ordered effect entries and five capability flags after each hardware effect ID: speed, brightness, direction, random color, and fixed color. These are encoded in `src/effects.ts`; controls must be shown or enabled from those flags rather than assumed globally. The generic constructor also contains wheel and side-light branches, but they are model-flagged and are not treated as B68 features without matching B68 evidence.

The write path also builds a separate 512-byte RGB table and calls the vtable method at offset `0x70` (`SetLedRgbTab`, command `0x0A`). It places the validity bytes `5A A5` at table offsets 506 and 507. The table contains groups of RGB triplets assembled from the application model. This table is not the same packet as live RGB report command `0x08`.

## Macro archive

Static analysis of `FillMatrix` and `StMacro_To_HdMacro` confirms that the macro transfer is a variable-length archive capped at `0x2800` (10,240) bytes. It contains at most 100 four-byte descriptors followed by up to `0x2000` bytes of packed records. Each descriptor is a little-endian `u16` address and `u16` size. Addresses are adjusted to follow the complete descriptor table.

A record begins with a one-byte UTF-16LE name byte length and the name bytes. The remaining bytes are four-byte events: `(type << 4) | delay[19:16]`, `delay[15:8]`, `delay[7:0]`, and an event value. Delays are capped at `0xFFFFF`. Event types 1 through 5 represent keyboard, mouse-button, and three pointer/wheel forms; for type 1, bit 7 marks key release. The layer matrix uses action type `0x05` and references these records by a one-based internal buffer ID.

The on-device four-byte key assignment is `03`, a playback flag (`01`, `02`, or `04`), repeat count, and zero-based macro index. The extracted English resource and matching code order identify these as fixed cycle count, cycle until the assigned key is released, and cycle until any key is pressed. Fixed-count mode uses the configured repeat count; the other two force that byte to one. The source includes strict offline codecs for both this assignment and the confirmed archive format. Macro writes remain disconnected from the WebHID transport until the complete matrix readback path is validated.

## Firmware and battery

The Windows app obtains its displayed USB firmware value from `HidD_GetAttributes().VersionNumber`, not from a B68 vendor query. WebHID does not expose that field. Report-6 model identity is useful device evidence but must not be labeled as firmware.

The located battery command belongs to the vendor's mouse protocol, not the B68 keyboard. `ShowPower=0` in the B68 configuration also indicates that the Windows UI hides this value. No keyboard battery query is shipped until wired or dongle evidence establishes one.

## Safety boundary

Only named operations with a statically supported purpose and fixed packet construction may reach the transport. Firmware writing, bootloader entry, reset, factory reset, and a generic raw-send UI/API remain forbidden.
