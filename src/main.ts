import './style.css'
import { DEVICE_FILTERS, matchKnownDevice, preferWired } from './devices'
import { B68_KEY_ROWS } from './layout'
import { KeyboardTransport } from './transport'
import type { DeviceStatus, MetricResult } from './types'

const app = document.querySelector<HTMLDivElement>('#app')!
const transport = new KeyboardTransport()

app.innerHTML = `
  <main>
    <header class="hero">
      <div class="eyebrow"><span class="signal"></span> Local WebHID tool</div>
      <h1>Your B68,<br><em>without the driver.</em></h1>
      <p class="lede">Inspect firmware and battery status directly in your browser. Nothing is installed, uploaded, or changed on your keyboard.</p>
      <div class="actions">
        <button id="connect" class="primary">Connect configuration interface</button>
        <button id="disconnect" class="secondary" hidden>Disconnect</button>
      </div>
      <p id="notice" class="notice" role="status" aria-live="polite"></p>
    </header>

    <section class="status-panel" aria-labelledby="status-title">
      <div class="panel-heading">
        <div>
          <p class="kicker">Device status</p>
          <h2 id="status-title">Waiting for a keyboard</h2>
        </div>
        <span id="connection-pill" class="pill">Disconnected</span>
      </div>
      <div class="metrics">
        <article>
          <span class="metric-label">Firmware</span>
          <strong id="firmware">—</strong>
          <small id="firmware-detail">Connect to inspect</small>
        </article>
        <article>
          <span class="metric-label">Battery</span>
          <strong id="battery">—</strong>
          <small id="battery-detail">Connect to inspect</small>
        </article>
        <article>
          <span class="metric-label">Connection</span>
          <strong id="mode">—</strong>
          <small id="identity">No device selected</small>
        </article>
      </div>
      <div class="refresh-row">
        <button id="refresh" class="text-button" disabled>Refresh status</button>
        <span id="last-refresh">Not refreshed</span>
      </div>
    </section>

    <section class="lighting-panel" aria-labelledby="lighting-title">
      <div class="lighting-heading">
        <div>
        <p class="kicker">Lighting preview</p>
        <h2 id="lighting-title">Live and per-key color</h2>
        <p>Select no keys to color the whole board, or select keys below to paint a custom layout. This does not overwrite an onboard profile.</p>
        </div>
        <div class="color-control">
        <input id="live-color" type="color" value="#c8ff43" aria-label="Live keyboard color" />
        <button id="apply-color" class="secondary" disabled>Apply whole board</button>
        <button id="paint-keys" class="secondary" disabled>Paint selected</button>
        <button id="clear-keys" class="secondary" disabled>Clear custom colors</button>
        <button id="stop-color" class="secondary" disabled>Stop preview</button>
        </div>
      </div>
      <div id="key-grid" class="keyboard-grid" aria-label="B68 per-key lighting editor"></div>
    </section>

    <section class="trust-grid">
      <div><span>01</span><h3>Private by design</h3><p>Communication stays between this page and your keyboard.</p></div>
      <div><span>02</span><h3>Guarded commands</h3><p>Only named, validated device operations are exposed—never arbitrary HID packets.</p></div>
      <div><span>03</span><h3>Chromium required</h3><p>Use desktop Chrome, Edge, or another browser with WebHID over HTTPS or localhost.</p></div>
    </section>

    <details class="diagnostics">
      <summary>Advanced diagnostics <span>Descriptors only</span></summary>
      <div class="diagnostic-actions">
        <p>Useful for identifying the safe vendor-defined report channel. This information never leaves your browser.</p>
        <button id="copy" class="secondary" disabled>Copy report</button>
      </div>
      <pre id="diagnostic-output">Connect a keyboard to inspect its HID collections.</pre>
    </details>
  </main>
  <footer><span>Yunzii B68 Web Configurator</span><span>Open, local, cautious.</span></footer>
`

const ui = {
  connect: document.querySelector<HTMLButtonElement>('#connect')!,
  disconnect: document.querySelector<HTMLButtonElement>('#disconnect')!,
  refresh: document.querySelector<HTMLButtonElement>('#refresh')!,
  copy: document.querySelector<HTMLButtonElement>('#copy')!,
  applyColor: document.querySelector<HTMLButtonElement>('#apply-color')!,
  liveColor: document.querySelector<HTMLInputElement>('#live-color')!,
  stopColor: document.querySelector<HTMLButtonElement>('#stop-color')!,
  paintKeys: document.querySelector<HTMLButtonElement>('#paint-keys')!,
  clearKeys: document.querySelector<HTMLButtonElement>('#clear-keys')!,
  keyGrid: document.querySelector<HTMLElement>('#key-grid')!,
  notice: document.querySelector<HTMLElement>('#notice')!,
  title: document.querySelector<HTMLElement>('#status-title')!,
  pill: document.querySelector<HTMLElement>('#connection-pill')!,
  firmware: document.querySelector<HTMLElement>('#firmware')!,
  firmwareDetail: document.querySelector<HTMLElement>('#firmware-detail')!,
  battery: document.querySelector<HTMLElement>('#battery')!,
  batteryDetail: document.querySelector<HTMLElement>('#battery-detail')!,
  mode: document.querySelector<HTMLElement>('#mode')!,
  identity: document.querySelector<HTMLElement>('#identity')!,
  lastRefresh: document.querySelector<HTMLElement>('#last-refresh')!,
  diagnostics: document.querySelector<HTMLElement>('#diagnostic-output')!,
}

const selectedLeds = new Set<number>()
const keyColors = new Map<number, { red: number; green: number; blue: number }>()

for (const row of B68_KEY_ROWS) {
  const rowElement = document.createElement('div')
  rowElement.className = 'keyboard-row'
  for (const key of row) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'keyboard-key'
    button.textContent = key.label
    button.dataset.led = String(key.ledIndex)
    button.style.setProperty('--key-width', String(key.width ?? 1))
    button.setAttribute('aria-pressed', 'false')
    button.addEventListener('click', () => {
      if (selectedLeds.has(key.ledIndex)) selectedLeds.delete(key.ledIndex)
      else selectedLeds.add(key.ledIndex)
      const selected = selectedLeds.has(key.ledIndex)
      button.classList.toggle('selected', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
    rowElement.append(button)
  }
  ui.keyGrid.append(rowElement)
}

function describe<T>(result: MetricResult<T>, formatter: (value: T) => string): [string, string] {
  switch (result.state) {
    case 'available': return [formatter(result.value), 'Read from keyboard']
    case 'unsupported': return ['Unavailable', result.message]
    case 'timeout': return ['Timed out', result.message]
    case 'invalid-response': return ['Invalid', result.message]
    case 'disconnected': return ['—', result.message]
  }
}

function render(status: DeviceStatus = transport.status()): void {
  const [firmware, firmwareDetail] = describe(status.firmware, (value) => value.formatted)
  const [battery, batteryDetail] = describe(status.battery, (value) => `${value}%`)
  ui.firmware.textContent = firmware
  ui.firmwareDetail.textContent = firmwareDetail
  ui.battery.textContent = battery
  ui.batteryDetail.textContent = batteryDetail
  ui.title.textContent = status.connected ? (status.productName || status.knownDevice!.displayName) : 'Waiting for a keyboard'
  ui.pill.textContent = status.connected ? 'Connected' : 'Disconnected'
  ui.pill.classList.toggle('connected', status.connected)
  ui.mode.textContent = status.knownDevice?.connectionType ?? '—'
  ui.identity.textContent = status.knownDevice
    ? `${status.knownDevice.vendorId.toString(16).padStart(4, '0').toUpperCase()}:${status.knownDevice.productId.toString(16).padStart(4, '0').toUpperCase()}`
    : 'No device selected'
  ui.connect.hidden = status.connected
  ui.disconnect.hidden = !status.connected
  ui.refresh.disabled = !status.connected
  ui.copy.disabled = !status.connected
  ui.applyColor.disabled = !status.connected
  ui.stopColor.disabled = !status.connected || !transport.livePreviewActive
  ui.paintKeys.disabled = !status.connected
  ui.clearKeys.disabled = !status.connected || keyColors.size === 0
  ui.lastRefresh.textContent = status.lastRefresh ? `Updated ${status.lastRefresh.toLocaleTimeString()}` : 'Not refreshed'
  const diagnostics = transport.diagnostics()
  ui.diagnostics.textContent = diagnostics ? JSON.stringify(diagnostics, null, 2) : 'Connect a keyboard to inspect its HID collections.'
}

async function connect(device?: HIDDevice): Promise<void> {
  ui.notice.textContent = 'Waiting for browser permission…'
  try {
    let selected = device
    if (!selected) {
      const devices = await navigator.hid.requestDevice({ filters: [...DEVICE_FILTERS] })
      selected = preferWired(devices.filter((item) => matchKnownDevice(item)))[0]
    }
    if (!selected) {
      ui.notice.textContent = 'No keyboard selected. You can try again whenever you are ready.'
      return
    }
    await transport.connect(selected)
    ui.notice.textContent = transport.vendorCollectionCount > 0
      ? `${matchKnownDevice(selected)!.displayName} is connected. Descriptor inspection is ready.`
      : `${matchKnownDevice(selected)!.displayName} is connected, but Chromium exposed no vendor-defined collection. Copy the advanced diagnostic report so we can inspect every visible usage page.`
    await refresh()
  } catch (error) {
    ui.notice.textContent = error instanceof DOMException && error.name === 'NotAllowedError'
      ? 'Permission was not granted. No device was accessed.'
      : error instanceof Error ? error.message : 'The keyboard could not be opened.'
    render()
  }
}

async function refresh(): Promise<void> {
  if (!transport.knownDevice) return
  ui.refresh.disabled = true
  const [firmware, battery] = await Promise.all([
    transport.queryFirmware(),
    transport.queryBattery(),
  ])
  render({
    connected: Boolean(transport.device?.opened),
    knownDevice: transport.knownDevice,
    productName: transport.device?.productName ?? null,
    firmware,
    battery,
    lastRefresh: new Date(),
  })
  ui.refresh.disabled = false
}

ui.connect.addEventListener('click', () => void connect())
ui.disconnect.addEventListener('click', () => void transport.disconnect())
ui.refresh.addEventListener('click', () => void refresh())
ui.copy.addEventListener('click', async () => {
  const report = transport.diagnostics()
  if (!report) return
  await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
  ui.notice.textContent = 'Diagnostic report copied. It has not been uploaded anywhere.'
})
ui.applyColor.addEventListener('click', async () => {
  const hex = ui.liveColor.value.slice(1)
  const value = Number.parseInt(hex, 16)
  const color = {
    red: (value >> 16) & 0xff,
    green: (value >> 8) & 0xff,
    blue: value & 0xff,
  }
  ui.applyColor.disabled = true
  try {
    await transport.setLiveColor(color)
    ui.notice.textContent = `Live RGB preview active: ${ui.liveColor.value.toUpperCase()}. Stop it to resume the onboard effect.`
    render()
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'The live RGB preview failed.'
  } finally {
    ui.applyColor.disabled = !transport.status().connected
  }
})
ui.stopColor.addEventListener('click', () => {
  transport.stopLiveColor()
  ui.notice.textContent = 'Live preview stopped. The onboard hardware effect should resume automatically.'
  render()
})
ui.paintKeys.addEventListener('click', async () => {
  if (selectedLeds.size === 0) {
    ui.notice.textContent = 'Select one or more keys in the layout first.'
    return
  }
  const hex = Number.parseInt(ui.liveColor.value.slice(1), 16)
  const color = { red: (hex >> 16) & 0xff, green: (hex >> 8) & 0xff, blue: hex & 0xff }
  for (const led of selectedLeds) keyColors.set(led, color)
  for (const button of ui.keyGrid.querySelectorAll<HTMLButtonElement>('.keyboard-key')) {
    const led = Number(button.dataset.led)
    const assigned = keyColors.get(led)
    button.style.setProperty('--key-color', assigned ? `rgb(${assigned.red} ${assigned.green} ${assigned.blue})` : 'transparent')
    button.classList.toggle('painted', Boolean(assigned))
  }
  try {
    await transport.setLiveKeyColors(keyColors)
    ui.notice.textContent = `Per-key preview active with ${keyColors.size} colored key${keyColors.size === 1 ? '' : 's'}.`
    render()
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'The per-key preview failed.'
  }
})
ui.clearKeys.addEventListener('click', async () => {
  keyColors.clear()
  selectedLeds.clear()
  for (const button of ui.keyGrid.querySelectorAll<HTMLButtonElement>('.keyboard-key')) {
    button.classList.remove('selected', 'painted')
    button.setAttribute('aria-pressed', 'false')
    button.style.removeProperty('--key-color')
  }
  try {
    await transport.setLiveKeyColors(keyColors)
    ui.notice.textContent = 'Custom colors cleared. Stop the preview to resume the onboard effect.'
    render()
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'Custom colors could not be cleared.'
  }
})
transport.addEventListener('transporterror', (event) => {
  ui.notice.textContent = `Keyboard communication stopped: ${(event as CustomEvent<string>).detail}`
  render()
})
transport.addEventListener('statuschange', () => render())

if (!('hid' in navigator)) {
  ui.connect.disabled = true
  ui.notice.textContent = 'WebHID is unavailable. Open this page in desktop Chrome, Edge, or another compatible Chromium browser.'
} else {
  navigator.hid.addEventListener('disconnect', (event) => {
    if (event.device === transport.device) transport.markDisconnected()
  })
  navigator.hid.getDevices().then((devices) => {
    const authorized = preferWired(devices.filter((device) => matchKnownDevice(device)))
    if (authorized.length > 0) {
      ui.notice.textContent = `${authorized.length} previously authorized B68 device${authorized.length > 1 ? 's are' : ' is'} available.`
    }
  }).catch(() => undefined)
}

render()
