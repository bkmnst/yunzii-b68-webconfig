# Yunzii B68 reverse-engineering handoff

Last updated: 2026-07-13.

This is the project handoff for future agents. It records what was actually proven, what only came from static analysis, what failed on real hardware, and what was deliberately removed from the product. Read this before adding any new device command.

## Project constraints and current scope

- The official Windows application was never executed during this work. The user explicitly rejected running it.
- The installer was extracted locally with `innounp`; `OemDrv.exe` was inspected statically with Rizin. USBPcap/Wireshark captures were also used during protocol discovery.
- Vendor executables, installer contents, packet captures, and `analysis/` remain local and are ignored by Git.
- The shipped app is a static Vite/TypeScript site for GitHub Pages and makes no application network requests.
- Allowed writes are limited to wired debounce, a numbered onboard effect, one ordinary keyboard-key assignment, and temporary live RGB.
- Firmware update, bootloader entry, reset, factory reset, raw packet sending, and guessed wireless commands are forbidden.

Current user-facing scope:

| Feature | Wired | Dongle | Notes |
| --- | --- | --- | --- |
| Descriptor diagnostics | Yes | Yes | No writes |
| Debounce 1–4 ms | Yes | No | Confirmed by exact readback and visible use |
| Single-key remapping | Yes | No | Letters confirmed on hardware; broader ordinary HID keys still need manual coverage |
| Live whole-board RGB | Yes | No | Confirmed on hardware; temporary keepalive mode |
| Live per-key RGB | Yes | No | Confirmed on hardware for the 67-key layout |
| Numbered onboard effects | Yes | No | Effects change; names were unreliable, some slots appeared blank |
| Firmware/battery UI | Removed | Removed | Findings retained below |
| Brightness/speed/onboard color | Removed | No | Writes were ineffective or insufficiently proven |
| Macros and special assignments | Removed | No | Evidence retained below; not productized |

## Device identifiers and WebHID collections

- Wired keyboard: VID `0x258A`, PID `0x010C`, product name observed as `Gaming Keyboard`.
- 2.4 GHz dongle: VID `0x3554`, PID `0xFA09`.
- `KB.ini` associates both identifier pairs with the same B68 model and contains `Fw=24`, `CRC=1`, and `Psd=3,0,0,0,1,88`.
- Knowing both VID/PID pairs does **not** prove that they share a command transport.

The useful wired Chromium descriptor exposed three vendor-defined `0xFF00:0x0001` collections:

1. Input report 3, 3 bytes.
2. Feature report 5, 5 bytes.
3. Input report 6, 7 bytes, and feature report 6, 519 WebHID payload bytes.

Earlier Chromium selection sometimes exposed only the protected keyboard collection (`usagePage 1`, `usage 6`). Filtering the WebHID request to usage page `0xFF00` exposed the configuration collections. Feature report 5 existed in the descriptor but `receiveFeatureReport(5)` returned `NotAllowedError` on the real keyboard.

Native HID report 6 is 520 bytes including the report ID. WebHID supplies the report ID separately, so application payloads are 519 bytes. Some feature reads nevertheless included byte `06` at the start of the returned `DataView`; parsers accept both observed framings and validate the remaining envelope.

## Common feature-report envelope

The `Fw=24` configuration path uses report 6. Most confirmed transfers begin with:

| Offset | Meaning |
| --- | --- |
| 0 | semantic command |
| 1 | selector/page subtype |
| 2 | reserved zero |
| 3 | one-based page or region |
| 4 | reserved zero |
| 5–6 | little-endian data length |
| 7… | data, then zero padding to 519 bytes |

The native driver uses `HidD_SetFeature`, waits briefly, then uses `HidD_GetFeature` for paired reads. Larger regions are paged in 512-byte blocks. Read commands commonly equal the write command with bit 7 set, but that pattern is evidence only; it is not permission to invent commands.

Known command families:

| Command | Meaning | Current app |
| --- | --- | --- |
| `0x03` / `0x83` | Set/Get matrix layer | Shipped, guarded |
| `0x04` / `0x84` | Set/Get onboard configuration (`SetLED`/`GetLED`) | Shipped, guarded subset |
| `0x05` / `0x85` | Set/Get macro archive | Removed |
| `0x06` / `0x86` | Set/Get game region | Not implemented |
| `0x08` | Direct/live RGB | Shipped, wired only |
| `0x0A` / `0x8A` | Persistent RGB table | Not implemented |
| `0x0B` | Screen parameter on other devices | Out of scope |
| `0x11` | Reset device | Forbidden |

## Live RGB: confirmed working

Live RGB uses report 6 command prefix:

```text
08 00 00 01 00 7A 01
```

It is followed by 96 RGB triplets. The B68 model maps its 67 physical controls sparsely into LED indices 1–95. Filling all 96 triplets produces a whole-board color; addressing the model indices produces per-key colors. A 750 ms resend keeps direct mode active. Stopping the keepalive allows the onboard effect to resume. This path does not persist an onboard profile.

Real-hardware result: whole-board preview and per-key painting both worked.

## Onboard configuration, debounce, and effects

`GetLED` request:

```text
84 00 00 01 00 90 01
```

The response declares 400 data bytes. The first 128 bytes are the active configuration record; record offsets 126–127 must be `5A A5`.

Confirmed record fields:

| Record offset | Meaning | Confidence |
| --- | --- | --- |
| 3 | Debounce, integer 1–4 ms | Hardware confirmed |
| 10 | Onboard hardware effect ID | Hardware confirmed |
| 11 | Effect/group parameter | Static evidence; complete behavior unconfirmed |
| 56–57 | `FF FF` sentinels in native construction | Static evidence |
| 58 onward | Repeated packed effect/group values | Static evidence; exact mapping incomplete |
| 126–127 | `5A A5` validity marker | Hardware confirmed |

`SetLED` uses command `0x04`, page/region 1, declared length 128. The web app starts from a complete validated record, changes only the allowlisted field, waits 60 ms, performs `GetLED`, and accepts success only when the full response is valid and the requested field matches.

Debounce at offset 3 worked on hardware and remains shipped.

The hardware effect IDs from `LedOpt1`…`LedOpt20` are:

```text
1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 0
```

ID `0` is Off. Changing these IDs changed the keyboard animation. The vendor labels and desktop preview-animation IDs did not reliably correspond to the observed effects, and several selections appeared blank. The current UI therefore displays only `1`–`19` and `Off`. A future hardware pass should record which slots are distinct and which are consistently blank before removing any.

### Failed brightness and speed hypothesis

Record bytes 6 and 7 initially looked like speed and brightness: the baseline contained values such as `2` and `4`, the model tables map both UI and hardware levels as `0,1,2,3,4`, and writes echoed through `GetLED`. Hardware testing disproved the behavior: changing bytes 6/7 to `0/0` or `1/1` changed only those stored bytes and did not visibly change speed or brightness.

The same captured record contained packed pairs beginning around offset 58, including values such as `04 47`. Static disassembly suggests these pairs combine mapped level values and effect/color state. Their exact per-effect indexing and write semantics were not completed. Do not restore brightness or speed using offsets 6/7.

### Persistent color

Static analysis associated offset 11 with `StartGp + group`; B68 uses `StartGp=0x20`, fixed groups 0–6, and random group 7. A later build wrote this byte, but real hardware never established that it alone controls persistent color. Packed per-effect fields may also need updating. Persistent color was removed rather than shipping a partial write.

## Matrix/key-remapping protocol

There are four layers with zero-based selectors:

```text
0 Default, 1 FN1, 2 FN2, 3 Tap
```

Each layer contains 128 four-byte entries (512 bytes total). Entry 127 must be `00 00 5A A5` because the model enables `CRC=1`. Entries 96–126 are reserved and must be preserved exactly from the hardware baseline.

Normal keyboard assignment bytes are:

```text
00 <modifier mask> 00 <HID keyboard usage>
```

The streamlined editor only creates `00 00 00 <usage>` assignments. It reads and validates the complete layer first, changes one physical-key index, sends `SetMatrix` (`0x03`), immediately reads `GetMatrix` (`0x83`), and requires an exact 512-byte match.

Observed factory state:

- Default contains the 67 physical assignments described by `KB.ini`.
- FN1 contains 34 assignments.
- FN2 and Tap were empty.
- Physical key/LED indices in the current 67-control layout range from 1 through 95 and are sparse.

Real-hardware result: remapping ordinary single letters worked. Numbers, punctuation, navigation keys, function keys, and all layers have codecs/tests but were not all manually exercised.

Special assignment families seen in factory data or static analysis:

- `0D 00 00 00`: Fn.
- Family `07`: device actions including Bluetooth slots, 2.4 GHz pairing, Win lock, backlight, battery display, and mute.
- Family `08`: lighting actions.
- Family `01`: mouse clicks/scrolling.
- Family `04`: multimedia/application commands.
- Family `03`: macro playback.

Direct mouse and multimedia assignments were implemented from static labels but did not work in the user's hardware test. They, modifier combinations, Fn/Disable creation, device actions, lighting actions, and macros were removed. Existing non-keyboard entries are preserved and shown only as read-only `Special …` labels.

## Firmware and battery findings (not shipped)

The Windows program gets its displayed USB firmware from `HidD_GetAttributes().VersionNumber`, not from a B68 vendor query. WebUSB can expose the equivalent `bcdDevice` version without claiming an interface, and an earlier web build implemented that read. It was removed from the final UI when the project was narrowed.

Report-6 identity query `82 01 00 01 00 06` returned a model ID at response byte 12 (observed model `0x01`). This is identity evidence, not firmware.

The wired input report observed on real hardware was:

```text
0A 05 <percentage> 10 00 00 00
```

The capture repeatedly contained `64` (100 percent). Subtype `07` appeared to be a write acknowledgement. A strict battery parser existed but was removed with the UI. The vendor model has `ShowPower=0`, and the located explicit battery query belonged to a mouse protocol rather than this keyboard. No safe dongle battery query was established.

## Macro archive findings (not shipped)

Static analysis recovered a variable archive capped at `0x2800` bytes: up to 100 four-byte descriptors followed by up to `0x2000` bytes of records. Descriptors contain a little-endian address and size. The report-6 B68 path pages the archive in 512-byte chunks with commands `0x05`/`0x85` and region 6.

The empty factory archive was read successfully. Typed macro codecs and guarded read/write logic were implemented, including keyboard and mouse events and exact decoded readback, but macro playback was never confirmed end to end on hardware. The feature and all codecs were removed from the streamlined app. Historical field notes remain in `docs/protocol.md`.

## Wireless status and caveats

The dongle VID/PID comes from the B68 model configuration, but no exact `3554:FA09` configuration branch or confirmed packet capture was established. The app can request and describe the dongle's vendor collection, but all configuration capabilities resolve false for wireless even if its descriptor resembles report 6 on the wired device.

Future wireless work must establish, in order:

1. The complete dongle WebHID descriptor and unsolicited input reports.
2. The exact static driver branch used for `3554:FA09`.
3. A confirmed read-only identity or configuration request with response validation.
4. Per-feature packet equivalence or translation.
5. Hardware validation and exact readback before enabling each write.

Do not send the wired packet set through the dongle merely because a feature report has the same size.

## Suggested future work

- Manually classify numbered effects and remove consistently blank duplicates.
- Decode the packed configuration pairs around offset 58 before revisiting speed, brightness, or persistent color.
- Test ordinary remaps beyond letters on every layer.
- Capture the dongle descriptor and static driver path without running the official UI.
- If wireless configuration becomes viable, add capabilities one at a time; do not create a global “wireless supported” switch.
- Keep all writes semantic, typed, baseline-dependent, and readback-verified.

## Verification and repository conventions

- Unit tests mock wired and dongle descriptors and assert that dongle writes remain impossible.
- Production assets must use Vite base `/yunzii-b68-webconfig/` for GitHub Pages.
- Run `npm test` and `npm run build` after protocol or UI changes.
- Keep installer files, executables, `analysis/`, packet captures, and raw protocol logs untracked.
