# B68 protocol evidence

This document records independently recovered protocol facts from static analysis of the extracted vendor executable. The executable was not run. Addresses refer to the analyzed `OemDrv.exe` image and vendor binaries are intentionally excluded from Git.

## HID interfaces

- Wired B68: `258A:010C`, configuration firmware family `Fw=24`.
- Wireless dongle: `3554:FA09`; its transport remains unconfirmed.
- The wired configuration interface uses feature report 6 with a native length of 520 bytes. WebHID passes the report ID separately and therefore exposes a 519-byte payload.
- Its 7-byte input status report is `0A 05 <battery> 10 00 00 00`; repeated real captures reported `64` (100 percent). Subtype `07` is a write acknowledgement. The parser accepts only the complete subtype-`05` envelope and a bounded 0–100 value.

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

`SetMatrix` / `GetMatrix` are the separate command pair `0x03` / `0x83`. The selector is the zero-based layer number: Default, FN1, FN2, or Tap. Static analysis confirms the model's default `MatrixLen=128`, so each layer transfer is exactly 512 bytes. Physical keys use the matrix indices recorded in `KB.ini` (1 through 95 for this layout), remaining positions are reserved, and entry 127 must be `00 00 5A A5` because `CRC=1`. A strict read-query builder and response codec are implemented, and the diagnostic UI permits one explicitly selected read at a time; no arbitrary matrix bytes are exposed to the UI.

The initial 384-byte Default-layer capture contains 67 nonzero assignments in entries 0–95, exactly matching the 67 controls in `KB.ini`. Normal keyboard assignments are `00`, HID modifier mask, `00`, HID keyboard usage. Fn is `0D 00 00 00`; mute is vendor device-command assignment `07 00 00 14`; unused positions are zero. These forms now decode to semantic assignment types rather than raw UI-editable bytes. That initial diagnostic intentionally proved the active range but did not include reserved entries 96–127; subsequent reads request the authoritative full 512-byte layer and require the CRC marker.

A second real read validates FN1 with 34 assignments and validates FN2 and Tap as empty, matching their factory `KB.ini` sections. The FN1 bytes also confirm vendor device-command family `07` and lighting-command family `08`. Labels for Bluetooth slots, 2.4 GHz pairing, Win lock, battery display, backlight, reset, F-row switching, effect/color, brightness, and speed are cross-checked against the official B68 manual. Command `07 00 00 0A` on FN+G and lighting command `08 00 00 01` on FN+Space remain unnamed because the available documentation does not identify them.

Static analysis of the native assignment-label routine proves direct mouse family `01` with named command bytes `11`–`16` and `18`–`1A`, and multimedia family `04` with named commands `21`–`2A`, `30`–`32`, `34`, `39`, and `5A`. The routine reverses each raw four-byte device entry into an internal 32-bit key before splitting its high-byte family and 24-bit command; this cross-checks the already captured keyboard representation. Only named mouse/media cases are allowlisted. The unnamed mouse case `17`, all unknown switch gaps, and the separate advanced family containing reset are excluded.

The matching typed `SetMatrix` constructor uses command `03`, the same fixed layer selector, page 1, declared length 512, and a complete encoded layer with the required CRC marker. The transport now has a semantic layer-write transaction that is callable only after that layer has been fully read and validated. It preserves reserved entries 96–126 from the hardware baseline and accepts success only after an immediate exact 512-byte `GetMatrix` readback. It is not an arbitrary packet API and is not yet exposed in the UI pending the first authoritative 512-byte hardware capture.

The paired read command is the write command with bit 7 set. This is documented evidence, not permission to synthesize or expose arbitrary commands.

## Onboard lighting

The wired sync routine calls `GetLED` with exactly 400 bytes and retries malformed data at most three times. The confirmed WebHID request prefix is:

```text
84 00 00 01 00 90 01
```

The response must echo command `0x84`, selector zero, reserved zero, page 1, and length 400 before its data is accepted. Hardware diagnostics show that Chromium returns native report ID `06` as byte 0 for this B68 feature interface, even though WebHID normally supplies the report ID separately; the parser therefore accepts either framing and validates all remaining fields at the corresponding offset. The vendor sync routine additionally validates fields inside the data block; those offsets are not yet all named.

A real B68 read confirms that bytes 0–127 are the active configuration record and that offsets 126–127 contain its `5A A5` validity marker. Offset 3 is debounce (captured as 1 ms, within the model's packed 1–4 ms capability). Offset 10 is the hardware lighting effect ID and offset 11 its effect parameter. The remaining 272 bytes in this capture were zero.

The normal write path does **not** write the 400-byte read buffer back. It constructs a fresh 128-byte record, passes it to `SetLED`, waits 60 ms, and checks a device-state getter. Earlier analysis mistook that getter for an apply command; no separate commit packet has been established. Confirmed constructed offsets include an effect-state flag at 9, hardware effect ID at 10, another effect parameter at 11, side-light fields at 18–21, optional settings at 22–24, two `FF` sentinels at 56–57, and a sequence of packed pairs beginning at 58. The semantic names of every field still require correlation with a real response or additional static evidence.

Debounce is independently confirmed at record offset 3 and the B68 configuration constrains it to 1–4 ms. The shipped typed debounce operation starts from the validated 128-byte record, changes only offset 3, sends command `04` with declared length 128, waits 60 ms, and requires a fresh validated `GetLED` response to echo the requested value. No other unknown record byte is modified.

The onboard hardware effect ID is independently confirmed at record offset 10 and is constrained to the exact 20-entry `LedOpt` table from `KB.ini`. Hardware speed and light are record offsets 6 and 7; the B68 maps both UI and hardware levels identically to `0,1,2,3,4`, and the real capture reports `4,4`. Typed effect and level operations preserve every other byte and require a fresh `GetLED` readback to echo every requested value. Speed and brightness controls are gated by the current effect's `LedOpt` capability flags.

The generic driver supports an optional sleep selector, but the B68 model does not set `ShowSleep`; its missing INI value resolves to zero and the native UI omits that control. Static analysis recovers the generic table (`30,60,90,120,180,240,300,600,900,1200` seconds mapped to hardware values `1,2,3,4,6,8,10,20,30,40`) and shows that generic record byte 3 is written from the sleep selector only when `ShowSleep` is enabled. On B68, `ShowDebounce=0x04000101` is enabled instead and the same record byte is the captured, validated debounce value. A B68 sleep write is therefore not exposed.

The B68 definition supplies 20 ordered effect entries. Each `LedOpt` row contains the hardware effect ID, a separate desktop preview-animation ID, then five capability flags: speed, brightness, direction, random color, and fixed color. An early build incorrectly sent the preview ID, which produced mismatched or blank effects; only the actual hardware IDs `1–18`, `21`, and `0` are now allowlisted. Real-hardware testing subsequently confirmed that changing these IDs changes effects, but also that several vendor names do not correspond to the observed animation and some slots appear blank. The UI therefore identifies effects by slot and hardware ID and treats the vendor text only as an unverified label. Blank behavior may depend on as-yet undecoded color/mode fields. These are encoded in `src/effects.ts`; controls must be shown or enabled from those flags rather than assumed globally. The generic constructor also contains wheel and side-light branches, but they are model-flagged and are not treated as B68 features without matching B68 evidence.

The write path also builds a separate 512-byte RGB table and calls the vtable method at offset `0x70` (`SetLedRgbTab`, command `0x0A`). It places the validity bytes `5A A5` at table offsets 506 and 507. The table contains groups of RGB triplets assembled from the application model. This table is not the same packet as live RGB report command `0x08`.

## Macro archive

Static analysis of `FillMatrix` and `StMacro_To_HdMacro` confirms that the macro transfer is a variable-length archive capped at `0x2800` (10,240) bytes. It contains at most 100 four-byte descriptors followed by up to `0x2000` bytes of packed records. Each descriptor is a little-endian `u16` address and `u16` size. Addresses are adjusted to follow the complete descriptor table.

The B68-specific `CDevComboFilm::SetMacro` path splits this archive into at most twenty 512-byte pages. Each WebHID feature payload is 519 bytes with header `05 <page> 00 06 00 <lengthLE>` and the page bytes at offset 7; the last page declares its real length and the native app waits 100 ms between pages. A strict offline page constructor is implemented. Device transmission remains gated until the paired macro read can establish archive length/count and provide exact post-write validation.

The paired B68 read maps `CDevComboFilm` operation `0x43` to wire command `0x85`, with the same page index and region `6`. Page zero always contains the complete descriptor table (maximum 400 bytes); its first descriptor address is `macroCount * 4`, and the final descriptor gives the exact archive end. The diagnostic therefore reads page zero, validates the inferred count/end, fetches only required later pages, and runs the strict archive decoder. Macro writes remain gated until this read succeeds on real hardware.

Real hardware validates the empty factory archive with `GetMacro`. Macro writes are now transport-enabled only after a successful baseline read: typed `SetMacro` pages are sent 100 ms apart, the complete archive is immediately fetched again through `GetMacro`, decoded, re-encoded, and compared byte-for-byte. The native empty-archive path sends no pages, so clearing the final macro remains explicitly unsupported rather than inventing a clearing packet.

A record begins with a one-byte UTF-16LE name byte length and the name bytes. The remaining bytes are four-byte events: `(type << 4) | delay[19:16]`, `delay[15:8]`, `delay[7:0]`, and an event value. Delays are capped at `0xFFFFF`. Static conversion branches prove type 1 is keyboard, type 2 is a mouse-button bit mask (left/right/middle/back/forward = `01/02/04/08/10`), types 3 and 4 are signed one-byte X and Y movement, and type 5 is signed wheel movement. Bit 7 marks release for types 1 and 2. The layer matrix uses action type `0x05` and references these records by a one-based internal buffer ID.

The on-device four-byte key assignment is `03`, a playback flag (`01`, `02`, or `04`), repeat count, and zero-based macro index. The extracted English resource and matching code order identify these as fixed cycle count, cycle until the assigned key is released, and cycle until any key is pressed. Fixed-count mode uses the configured repeat count; the other two force that byte to one. The source includes strict codecs for both this assignment and the confirmed archive format. Macro writes are exposed only through the guarded typed operation described above; arbitrary macro pages are not exposed to the UI.

## Firmware and battery

The Windows app obtains its displayed USB firmware value from `HidD_GetAttributes().VersionNumber`, not from a B68 vendor query. WebHID does not expose that field. For the wired `258A:010C` device, the app offers a separate user-gesture WebUSB descriptor read and reconstructs that same `bcdDevice` word from Chromium's major/minor/subminor fields; it does not open or claim an interface. Report-6 model identity is useful device evidence but must not be labeled as firmware.

The located battery command belongs to the vendor's mouse protocol, not the B68 keyboard. `ShowPower=0` in the B68 configuration also indicates that the Windows UI hides this value. No keyboard battery query is shipped until wired or dongle evidence establishes one.

## Safety boundary

Only named operations with a statically supported purpose and fixed packet construction may reach the transport. Firmware writing, bootloader entry, reset, factory reset, and a generic raw-send UI/API remain forbidden.
