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

Live solid-color preview uses the B68's vendor feature report 6 (`0xFF00:0x0001`, 519-byte WebHID payload). It fills the 96 LED slots established by the B68 layout map and refreshes the direct-mode frame every 750 ms. Stopping the stream lets the keyboard return to its onboard effect; no onboard profile is written.

## Safety boundary

Allowed behavior currently includes device selection, descriptor inspection, status reads, and the explicit live RGB preview command. The project does not expose arbitrary packet sending and does not include firmware writing, bootloader entry, reset, or factory-reset operations.

No device data is uploaded. Diagnostic reports exist only in memory and can be copied manually.

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
