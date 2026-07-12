# Yunzii B68 Configurator

Static Chromium WebHID utility for the Yunzii B68. The current app intentionally focuses on the confirmed wired configuration path.

## Current features

- Visual single-key remapping for Default, FN1, FN2, and Tap layers.
- Temporary whole-board and per-key RGB preview.
- Persistent numbered onboard effects (`1`–`19` and `Off`).
- Persistent 1–4 ms debounce control.
- Local descriptor and traffic diagnostics.

Every persistent change starts from a validated device read and requires an exact readback. The UI has no arbitrary packet sender.

The `3554:FA09` dongle can be selected for descriptor diagnostics, but configuration remains unavailable because its command transport has not been established. Firmware, battery, macros, special assignments, persistent color, brightness, and speed are not part of the current UI.

See [docs/reverse-engineering-handoff.md](docs/reverse-engineering-handoff.md) for the complete project history, confirmed protocol evidence, failed experiments, and future-work notes. [docs/protocol.md](docs/protocol.md) contains the lower-level packet reference.

## Development

```sh
npm install
npm test
npm run build
npm run dev
```

The production base path is `/yunzii-b68-webconfig/`. WebHID requires desktop Chromium and HTTPS or localhost.
