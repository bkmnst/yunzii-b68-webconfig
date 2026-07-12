import './style.css'
import { assignmentLabel } from './assignment-label'
import { DEVICE_FILTERS, matchKnownDevice, preferWired } from './devices'
import { B68_KEY_ROWS } from './layout'
import { B68_LAYERS, type B68Layer } from './matrix'
import {
  createLightingProfile,
  loadStoredProfiles,
  parseProfileFile,
  profileColorMap,
  storeProfiles,
  type LightingProfile,
} from './profiles'
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
        <article>
          <span class="metric-label">Onboard effect</span>
          <strong id="onboard-effect">—</strong>
          <small id="onboard-effect-detail">Connect to inspect</small>
        </article>
        <article>
          <span class="metric-label">Debounce</span>
          <strong id="debounce">—</strong>
          <small id="debounce-detail">Connect to inspect</small>
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
      <div class="profile-controls">
        <select id="profile-select" aria-label="Saved lighting profile"><option value="">Lighting profiles</option></select>
        <button id="save-profile" class="secondary">Save current</button>
        <button id="load-profile" class="secondary" disabled>Load</button>
        <button id="delete-profile" class="secondary" disabled>Delete</button>
        <button id="export-profile" class="secondary" disabled>Export</button>
        <label class="secondary file-button">Import<input id="import-profile" type="file" accept="application/json,.json" /></label>
      </div>
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
        <select id="matrix-layer" aria-label="Diagnostic keymap layer">
          <option value="default">Default keymap</option>
          <option value="fn1">FN1 keymap</option>
          <option value="fn2">FN2 keymap</option>
          <option value="tap">Tap keymap</option>
        </select>
        <button id="inspect-matrix" class="secondary" disabled>Read selected keymap</button>
        <button id="copy" class="secondary" disabled>Copy report</button>
      </div>
      <pre id="diagnostic-output">Connect a keyboard to inspect its HID collections.</pre>
    </details>
  </main>
  <footer><span>Yunzii B68 Web Configurator · build ${__BUILD_ID__}</span><span>Open, local, cautious.</span></footer>
`

const ui = {
  connect: document.querySelector<HTMLButtonElement>('#connect')!,
  disconnect: document.querySelector<HTMLButtonElement>('#disconnect')!,
  refresh: document.querySelector<HTMLButtonElement>('#refresh')!,
  copy: document.querySelector<HTMLButtonElement>('#copy')!,
  inspectMatrix: document.querySelector<HTMLButtonElement>('#inspect-matrix')!,
  matrixLayer: document.querySelector<HTMLSelectElement>('#matrix-layer')!,
  applyColor: document.querySelector<HTMLButtonElement>('#apply-color')!,
  liveColor: document.querySelector<HTMLInputElement>('#live-color')!,
  stopColor: document.querySelector<HTMLButtonElement>('#stop-color')!,
  paintKeys: document.querySelector<HTMLButtonElement>('#paint-keys')!,
  clearKeys: document.querySelector<HTMLButtonElement>('#clear-keys')!,
  keyGrid: document.querySelector<HTMLElement>('#key-grid')!,
  profileSelect: document.querySelector<HTMLSelectElement>('#profile-select')!,
  saveProfile: document.querySelector<HTMLButtonElement>('#save-profile')!,
  loadProfile: document.querySelector<HTMLButtonElement>('#load-profile')!,
  deleteProfile: document.querySelector<HTMLButtonElement>('#delete-profile')!,
  exportProfile: document.querySelector<HTMLButtonElement>('#export-profile')!,
  importProfile: document.querySelector<HTMLInputElement>('#import-profile')!,
  notice: document.querySelector<HTMLElement>('#notice')!,
  title: document.querySelector<HTMLElement>('#status-title')!,
  pill: document.querySelector<HTMLElement>('#connection-pill')!,
  firmware: document.querySelector<HTMLElement>('#firmware')!,
  firmwareDetail: document.querySelector<HTMLElement>('#firmware-detail')!,
  battery: document.querySelector<HTMLElement>('#battery')!,
  batteryDetail: document.querySelector<HTMLElement>('#battery-detail')!,
  mode: document.querySelector<HTMLElement>('#mode')!,
  identity: document.querySelector<HTMLElement>('#identity')!,
  onboardEffect: document.querySelector<HTMLElement>('#onboard-effect')!,
  onboardEffectDetail: document.querySelector<HTMLElement>('#onboard-effect-detail')!,
  debounce: document.querySelector<HTMLElement>('#debounce')!,
  debounceDetail: document.querySelector<HTMLElement>('#debounce-detail')!,
  lastRefresh: document.querySelector<HTMLElement>('#last-refresh')!,
  diagnostics: document.querySelector<HTMLElement>('#diagnostic-output')!,
}

const selectedLeds = new Set<number>()
const keyColors = new Map<number, { red: number; green: number; blue: number }>()
let lightingProfiles: LightingProfile[] = loadStoredProfiles(localStorage)

for (const row of B68_KEY_ROWS) {
  const rowElement = document.createElement('div')
  rowElement.className = 'keyboard-row'
  for (const key of row) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'keyboard-key'
    const keyLabel = document.createElement('span')
    keyLabel.className = 'key-label'
    keyLabel.textContent = key.label
    const assignment = document.createElement('small')
    assignment.className = 'key-assignment'
    button.append(keyLabel, assignment)
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

function renderKeyColors(): void {
  for (const button of ui.keyGrid.querySelectorAll<HTMLButtonElement>('.keyboard-key')) {
    const led = Number(button.dataset.led)
    const assigned = keyColors.get(led)
    button.style.setProperty('--key-color', assigned ? `rgb(${assigned.red} ${assigned.green} ${assigned.blue})` : 'transparent')
    button.classList.toggle('painted', Boolean(assigned))
  }
}

function renderKeymap(layer: B68Layer): void {
  const matrix = transport.matrix(layer)
  for (const button of ui.keyGrid.querySelectorAll<HTMLButtonElement>('.keyboard-key')) {
    const index = Number(button.dataset.led)
    const assignment = button.querySelector<HTMLElement>('.key-assignment')!
    const decoded = matrix?.assignments[index]
    assignment.textContent = decoded ? assignmentLabel(decoded) : ''
    button.title = decoded ? `${layer.toUpperCase()}: ${assignment.textContent}` : ''
    button.classList.toggle('keymap-read', Boolean(decoded))
  }
}

function renderProfiles(selectedId = ui.profileSelect.value): void {
  ui.profileSelect.replaceChildren(new Option('Lighting profiles', ''))
  for (const profile of lightingProfiles) ui.profileSelect.add(new Option(profile.name, profile.id))
  ui.profileSelect.value = lightingProfiles.some((profile) => profile.id === selectedId) ? selectedId : ''
  const selected = Boolean(ui.profileSelect.value)
  ui.loadProfile.disabled = !selected
  ui.deleteProfile.disabled = !selected
  ui.exportProfile.disabled = !selected
}

renderProfiles()

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
  const [onboardEffect, onboardEffectDetail] = describe(status.configuration, (value) => value.effectName)
  const [debounce, debounceDetail] = describe(status.configuration, (value) => `${value.debounceMs} ms`)
  ui.firmware.textContent = firmware
  ui.firmwareDetail.textContent = firmwareDetail
  ui.battery.textContent = battery
  ui.batteryDetail.textContent = batteryDetail
  ui.onboardEffect.textContent = onboardEffect
  ui.onboardEffectDetail.textContent = onboardEffectDetail
  ui.debounce.textContent = debounce
  ui.debounceDetail.textContent = debounceDetail
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
  ui.inspectMatrix.disabled = !status.connected || status.knownDevice?.connectionType !== 'wired'
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
  await transport.inspectOnboardLighting()
  render({
    ...transport.status(),
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
ui.inspectMatrix.addEventListener('click', async () => {
  const layer = ui.matrixLayer.value as B68Layer
  if (!B68_LAYERS.includes(layer)) return
  ui.inspectMatrix.disabled = true
  ui.notice.textContent = `Reading and validating the ${layer.toUpperCase()} keymap…`
  await transport.inspectMatrix(layer)
  renderKeymap(layer)
  render()
  ui.notice.textContent = `${layer.toUpperCase()} keymap diagnostic complete. Copy the report to share the validated result.`
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
  renderKeyColors()
  try {
    await transport.setLiveKeyColors(keyColors)
    ui.notice.textContent = `Per-key preview active with ${keyColors.size} colored key${keyColors.size === 1 ? '' : 's'}.`
    render()
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'The per-key preview failed.'
  }
})
ui.profileSelect.addEventListener('change', () => renderProfiles())
ui.saveProfile.addEventListener('click', () => {
  const name = window.prompt('Name this lighting profile:')
  if (name === null) return
  try {
    const profile = createLightingProfile(name, keyColors)
    lightingProfiles = [...lightingProfiles, profile]
    storeProfiles(localStorage, lightingProfiles)
    renderProfiles(profile.id)
    ui.notice.textContent = `Saved lighting profile “${profile.name}” locally.`
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'Profile could not be saved.'
  }
})
ui.loadProfile.addEventListener('click', async () => {
  const profile = lightingProfiles.find((item) => item.id === ui.profileSelect.value)
  if (!profile) return
  keyColors.clear()
  for (const [slot, color] of profileColorMap(profile)) keyColors.set(slot, color)
  renderKeyColors()
  try {
    await transport.setLiveKeyColors(keyColors)
    ui.notice.textContent = `Loaded and applied “${profile.name}”.`
    render()
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'Profile could not be applied.'
  }
})
ui.deleteProfile.addEventListener('click', () => {
  const profile = lightingProfiles.find((item) => item.id === ui.profileSelect.value)
  if (!profile || !window.confirm(`Delete “${profile.name}”?`)) return
  lightingProfiles = lightingProfiles.filter((item) => item.id !== profile.id)
  storeProfiles(localStorage, lightingProfiles)
  renderProfiles()
  ui.notice.textContent = `Deleted local profile “${profile.name}”.`
})
ui.exportProfile.addEventListener('click', () => {
  const profile = lightingProfiles.find((item) => item.id === ui.profileSelect.value)
  if (!profile) return
  const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${profile.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'b68-profile'}.json`
  anchor.click()
  URL.revokeObjectURL(url)
})
ui.importProfile.addEventListener('change', async () => {
  const file = ui.importProfile.files?.[0]
  if (!file) return
  try {
    const profile = parseProfileFile(await file.text())
    const imported = { ...profile, id: crypto.randomUUID() }
    lightingProfiles = [...lightingProfiles, imported]
    storeProfiles(localStorage, lightingProfiles)
    renderProfiles(imported.id)
    ui.notice.textContent = `Imported “${imported.name}” locally.`
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'Profile import failed.'
  } finally {
    ui.importProfile.value = ''
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
