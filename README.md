# Yunzii B68 Web Configurator

A cautious, browser-based status tool for the Yunzii B68 keyboard. It targets desktop Chromium browsers through [WebHID](https://developer.mozilla.org/docs/Web/API/WebHID_API) and is designed for static hosting on GitHub Pages.

## Current status

The application can safely discover and inspect every HID collection Chromium exposes, marking vendor-defined collections when present:

| Connection | Vendor ID | Product ID |
| --- | ---: | ---: |
| Wired B68 | `0x258A` | `0x010C` |
| 2.4 GHz dongle | `0x3554` | `0xFA09` |

Firmware and battery queries remain explicitly unavailable until their exact read-only packet formats are independently confirmed through static analysis. The shipped application sends no HID reports.

## Safety boundary

Allowed behavior is limited to device selection, connection, descriptor inspection, passive input-report metadata, and confirmed status queries. The project does not include arbitrary packet sending, RGB or key configuration, firmware writing, bootloader entry, reset, or factory-reset operations.

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
