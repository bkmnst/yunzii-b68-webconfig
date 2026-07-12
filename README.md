# Yunzii B68 Web Configurator

A local-first browser configurator for the Yunzii B68 keyboard. It targets desktop Chromium browsers through WebHID and WebUSB and is designed for static hosting on GitHub Pages.

## Current status

The application can safely discover and inspect every HID collection Chromium exposes, marking vendor-defined collections when present:

| Connection | Vendor ID | Product ID |
| --- | ---: | ---: |
| Wired B68 | `0x258A` | `0x010C` |
| 2.4 GHz dongle | `0x3554` | `0xFA09` |

The WebHID picker requires vendor usage page `0xFF00`, preventing Chromium from selecting the protected boot-keyboard interface (`0x01:0x06`).

The app performs a read-only `receiveFeatureReport(5)` request when that report is exposed, preserving its raw response or browser error in Advanced diagnostics. Its firmware encoding is not presented as a value until independently confirmed. No arbitrary packet-sending surface is exposed.

Battery percentage is decoded from the keyboard's validated unsolicited status report; acknowledgement packets and malformed values are ignored, and no guessed battery query is sent.

Device identification uses the Sinowealth `0x010C` report-6 query (`82 01 00 01 00 06`), then reads report 6 and extracts the model ID from WebHID response byte 12. Wired firmware is read separately from the USB `bcdDevice` descriptor after an explicit user gesture; no USB interface is opened or claimed.

Live solid-color preview uses the B68's vendor feature report 6 (`0xFF00:0x0001`, 519-byte WebHID payload). It fills the 96 LED slots established by the B68 layout map and refreshes the direct-mode frame every 750 ms. Stopping the stream lets the keyboard return to its onboard effect; no onboard profile is written.

The per-key editor uses all 67 B68 key/control entries and their sparse LED indices from the model configuration. Selected keys can be painted repeatedly into a live custom frame without writing onboard memory.

Lighting profiles can be saved locally, loaded into the live preview, deleted, and imported/exported as validated versioned JSON. These browser-local profiles do not claim to be onboard profiles; device persistence remains a separate protocol feature.

All four 512-byte keymap layers can be read and decoded. The semantic remapping editor supports standard keyboard keys, Ctrl/Shift/Alt/Win combinations, disabling a key, assigning Fn, confirmed wireless/device actions, and confirmed lighting controls. Reset remains readable in a factory keymap but is intentionally excluded from assignable actions. A persistent keymap change is available only after a complete CRC-valid baseline read, preserves reserved hardware entries, and is accepted only when an immediate full readback matches exactly.

Debounce can be set to the B68-supported 1–4 ms range. The operation patches only the confirmed debounce byte in a CRC-valid onboard record and requires a fresh `GetLED` readback to match before reporting success.

All 20 onboard effect slots from the B68 model definition can be selected persistently. Effect selection patches only the confirmed hardware-effect byte in the validated current record and likewise requires matching `GetLED` readback. The displayed vendor labels are explicitly marked as unverified because real-hardware testing found that several names do not match the observed animation; a blank slot may also require additional color/mode fields that have not yet been decoded.

Supported effects expose persistent 0–4 speed and brightness controls. These patch only the model-mapped hardware fields and require matching `GetLED` readback.

The macro editor can build and revise named keyboard and mouse sequences with per-event delays, including five mouse buttons, signed X/Y movement, and wheel movement. Events can be reordered or removed; writes use the typed paged archive and require a complete decoded byte-for-byte readback. Verified macros can then be assigned to keys with fixed-count, until-release, or until-any-key playback. Clearing the final macro remains disabled because the native zero-length path sends no clearing page.

## Safety boundary

Allowed behavior currently includes device selection, descriptor inspection, validated status/keymap reads, explicit live RGB preview, and typed keymap changes with exact readback. The project does not expose arbitrary packet sending and does not include firmware writing, bootloader entry, reset, or factory-reset operations.

No device data is uploaded. Diagnostic reports exist only in memory and can be copied manually.
Up to 50 recent HID input reports are retained in memory with at most 64 bytes each, so wired and dongle status events can be compared without an extension or persistent traffic log.

## Development

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
```

WebHID requires a secure context. Use the local development URL or HTTPS. The production base path is `/yunzii-b68-webconfig/`.

## Reverse-engineering notes

Static evidence from the extracted Windows application shows use of `HidD_GetFeature`, `HidD_SetFeature`, `ReadFile`, and `WriteFile`, with no separate kernel driver. The first confirmed read-only configuration operation, `GetLED`, is implemented with a fixed request and strict response-envelope validation. Detailed evidence and the recovered command matrix are in [docs/protocol.md](docs/protocol.md).

The original installer and all extracted vendor binaries and assets are intentionally excluded from version control and must not be redistributed with this project.
