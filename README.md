# Yunzii B68 Web Configurator

A cautious, browser-based status tool for the Yunzii B68 keyboard. It targets desktop Chromium browsers through [WebHID](https://developer.mozilla.org/docs/Web/API/WebHID_API) and is designed for static hosting on GitHub Pages.

## Current status

The application can safely discover and inspect every HID collection Chromium exposes, marking vendor-defined collections when present:

| Connection | Vendor ID | Product ID |
| --- | ---: | ---: |
| Wired B68 | `0x258A` | `0x010C` |
| 2.4 GHz dongle | `0x3554` | `0xFA09` |

The WebHID picker requires vendor usage page `0xFF00`, preventing Chromium from selecting the protected boot-keyboard interface (`0x01:0x06`).

The app performs a read-only `receiveFeatureReport(5)` request when that report is exposed, preserving its raw response or browser error in Advanced diagnostics. Its firmware encoding is not presented as a value until independently confirmed. No arbitrary packet-sending surface is exposed.

Device identification uses the Sinowealth `0x010C` report-6 query (`82 01 00 01 00 06`), then reads report 6 and extracts the model ID from WebHID response byte 12. The complete response remains visible in diagnostics while firmware fields are decoded.

Live solid-color preview uses the B68's vendor feature report 6 (`0xFF00:0x0001`, 519-byte WebHID payload). It fills the 96 LED slots established by the B68 layout map and refreshes the direct-mode frame every 750 ms. Stopping the stream lets the keyboard return to its onboard effect; no onboard profile is written.

The per-key editor uses all 67 B68 key/control entries and their sparse LED indices from the model configuration. Selected keys can be painted repeatedly into a live custom frame without writing onboard memory.

Lighting profiles can be saved locally, loaded into the live preview, deleted, and imported/exported as validated versioned JSON. These browser-local profiles do not claim to be onboard profiles; device persistence remains a separate protocol feature.

## Safety boundary

Allowed behavior currently includes device selection, descriptor inspection, status reads, and the explicit live RGB preview command. The project does not expose arbitrary packet sending and does not include firmware writing, bootloader entry, reset, or factory-reset operations.

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

Static evidence from the extracted Windows application shows use of `HidD_GetFeature`, `HidD_SetFeature`, `ReadFile`, and `WriteFile`, with no separate kernel driver. Its configuration identifies `Fw=24` and `CRC=1`, but those values alone are not sufficient evidence for a safe command implementation.

The original installer and all extracted vendor binaries and assets are intentionally excluded from version control and must not be redistributed with this project.
