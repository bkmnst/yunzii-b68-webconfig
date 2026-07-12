import './style.css'
import { assignmentLabel } from './assignment-label'
import { DEVICE_FILTERS, matchKnownDevice, preferWired } from './devices'
import { B68_LIGHTING_EFFECTS } from './effects'
import { KEYBOARD_USAGE_OPTIONS } from './keycodes'
import { B68_KEYS, B68_KEY_ROWS } from './layout'
import { B68_LAYERS, encodeKeyboardAssignment, replaceMatrixAssignment, type B68Layer } from './matrix'
import { KeyboardTransport } from './transport'
import type { DeviceStatus, MetricResult } from './types'
import type { RgbColor } from './protocol'

type WorkspaceMode = 'remap' | 'rgb'

const app = document.querySelector<HTMLDivElement>('#app')!
const transport = new KeyboardTransport()
let mode: WorkspaceMode = 'remap'
let selectedRemapKey: number | null = null
const selectedRgbKeys = new Set<number>()
const keyColors = new Map<number, RgbColor>()

app.innerHTML = `
  <main>
    <header class="app-header">
      <div><p class="kicker">WebHID configuration utility</p><h1>Yunzii B68 Configurator</h1><p class="lede">Wired key remapping, onboard effects, debounce, and live RGB.</p></div>
      <div class="actions"><button id="connect" class="primary">Connect</button><button id="disconnect" class="secondary" hidden>Disconnect</button></div>
      <p id="notice" class="notice" role="status" aria-live="polite"></p>
    </header>

    <section class="status-panel" aria-labelledby="status-title">
      <div class="panel-heading"><div><p class="kicker">Device status</p><h2 id="status-title">Waiting for a keyboard</h2></div><span id="connection-pill" class="pill">Disconnected</span></div>
      <div class="metrics">
        <article><span class="metric-label">Connection</span><strong id="mode">—</strong><small id="identity">No device selected</small></article>
        <article><span class="metric-label">Debounce</span><strong id="debounce">—</strong><small id="debounce-detail">Connect to inspect</small></article>
      </div>
      <div class="profile-controls hardware-controls">
        <button id="refresh" class="secondary" disabled>Refresh</button>
        <label>Debounce <select id="debounce-setting"><option value="1">1 ms</option><option value="2">2 ms</option><option value="3">3 ms</option><option value="4">4 ms</option></select></label>
        <button id="apply-debounce" class="secondary" disabled>Apply debounce</button>
      </div>
    </section>

    <section class="lighting-panel" aria-labelledby="effects-title">
      <div class="lighting-heading"><div><p class="kicker">Onboard RGB</p><h2 id="effects-title">Effects</h2><p>Hardware order. Vendor names were removed because they did not reliably match the animations.</p></div></div>
      <div id="effect-grid" class="effect-grid"></div>
      <p id="effect-summary" class="section-summary">Connect over USB to read the current effect.</p>
    </section>

    <section class="lighting-panel workspace" aria-labelledby="workspace-title">
      <div class="lighting-heading">
        <div><p class="kicker">Keyboard workspace</p><h2 id="workspace-title">Remap keys</h2><p id="workspace-help">Read a layer, select one physical key below, then assign one keyboard key.</p></div>
        <div class="mode-switch" role="tablist"><button id="mode-remap" class="mode-button active" role="tab" aria-selected="true">Remap</button><button id="mode-rgb" class="mode-button" role="tab" aria-selected="false">RGB</button></div>
      </div>
      <div id="remap-controls" class="profile-controls workspace-controls">
        <label>Layer <select id="remap-layer"></select></label>
        <button id="read-layer" class="secondary" disabled>Read layer</button>
        <label>Assign selected key to <select id="remap-usage"></select></label>
        <button id="apply-remap" class="primary" disabled>Apply</button>
        <span id="remap-summary">Read a layer to begin.</span>
      </div>
      <div id="rgb-controls" class="profile-controls workspace-controls" hidden>
        <input id="live-color" type="color" value="#cba6f7" aria-label="RGB color" />
        <button id="apply-color" class="secondary" disabled>Apply whole board</button>
        <button id="paint-keys" class="secondary" disabled>Paint selected</button>
        <button id="clear-keys" class="secondary" disabled>Clear colors</button>
        <button id="stop-color" class="secondary" disabled>Stop preview</button>
        <span>Live preview is temporary and does not overwrite an onboard profile.</span>
      </div>
      <div id="key-grid" class="keyboard-grid" aria-label="B68 keyboard editor"></div>
    </section>

    <details class="diagnostics">
      <summary>Advanced diagnostics <span>Local only</span></summary>
      <div class="diagnostic-actions"><p>Descriptors, capability decisions, recent input reports, and guarded operation results.</p><button id="copy" class="secondary" disabled>Copy report</button></div>
      <pre id="diagnostic-output">Connect a keyboard to inspect its HID collections.</pre>
    </details>
  </main>
  <footer><span>Yunzii B68 Configurator · ${__BUILD_ID__}</span><span>WebHID · local</span></footer>
`

const byId = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!
const ui = {
  connect: byId<HTMLButtonElement>('connect'), disconnect: byId<HTMLButtonElement>('disconnect'), notice: byId<HTMLElement>('notice'),
  title: byId<HTMLElement>('status-title'), pill: byId<HTMLElement>('connection-pill'), connectionMode: byId<HTMLElement>('mode'), identity: byId<HTMLElement>('identity'), debounce: byId<HTMLElement>('debounce'),
  debounceDetail: byId<HTMLElement>('debounce-detail'), refresh: byId<HTMLButtonElement>('refresh'),
  debounceSetting: byId<HTMLSelectElement>('debounce-setting'),
  applyDebounce: byId<HTMLButtonElement>('apply-debounce'), effectGrid: byId<HTMLElement>('effect-grid'),
  effectSummary: byId<HTMLElement>('effect-summary'), workspaceTitle: byId<HTMLElement>('workspace-title'),
  workspaceHelp: byId<HTMLElement>('workspace-help'), modeRemap: byId<HTMLButtonElement>('mode-remap'), modeRgb: byId<HTMLButtonElement>('mode-rgb'),
  remapControls: byId<HTMLElement>('remap-controls'), rgbControls: byId<HTMLElement>('rgb-controls'), remapLayer: byId<HTMLSelectElement>('remap-layer'),
  readLayer: byId<HTMLButtonElement>('read-layer'), remapUsage: byId<HTMLSelectElement>('remap-usage'), applyRemap: byId<HTMLButtonElement>('apply-remap'),
  remapSummary: byId<HTMLElement>('remap-summary'), liveColor: byId<HTMLInputElement>('live-color'), applyColor: byId<HTMLButtonElement>('apply-color'),
  paintKeys: byId<HTMLButtonElement>('paint-keys'), clearKeys: byId<HTMLButtonElement>('clear-keys'), stopColor: byId<HTMLButtonElement>('stop-color'),
  keyGrid: byId<HTMLElement>('key-grid'), copy: byId<HTMLButtonElement>('copy'), diagnostics: byId<HTMLElement>('diagnostic-output'),
}

for (const layer of B68_LAYERS) ui.remapLayer.add(new Option(layer.toUpperCase(), layer))
for (const key of KEYBOARD_USAGE_OPTIONS) ui.remapUsage.add(new Option(key.label, String(key.usage)))
for (const effect of B68_LIGHTING_EFFECTS) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'effect-tile'
  button.dataset.effect = String(effect.hardwareId)
  button.textContent = effect.name
  button.addEventListener('click', async () => {
    ui.notice.textContent = `Applying ${effect.name} and verifying readback…`
    try {
      await transport.applyOnboardEffect(effect.hardwareId)
      ui.notice.textContent = `${effect.name} applied and verified.`
    } catch (error) { ui.notice.textContent = message(error, 'The effect was not verified.') }
    render()
  })
  ui.effectGrid.append(button)
}

for (const row of B68_KEY_ROWS) {
  const rowElement = document.createElement('div')
  rowElement.className = 'keyboard-row'
  for (const key of row) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'keyboard-key'
    button.dataset.led = String(key.ledIndex)
    button.style.setProperty('--key-width', String(key.width ?? 1))
    button.innerHTML = `<span class="key-label"></span><small class="key-assignment"></small>`
    button.querySelector<HTMLElement>('.key-label')!.textContent = key.label
    button.addEventListener('click', () => {
      if (mode === 'remap') selectedRemapKey = selectedRemapKey === key.ledIndex ? null : key.ledIndex
      else if (selectedRgbKeys.has(key.ledIndex)) selectedRgbKeys.delete(key.ledIndex)
      else selectedRgbKeys.add(key.ledIndex)
      renderKeyboard()
      render()
    })
    rowElement.append(button)
  }
  ui.keyGrid.append(rowElement)
}

function message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }

function describe<T>(result: MetricResult<T>, formatter: (value: T) => string): [string, string] {
  switch (result.state) {
    case 'available': return [formatter(result.value), 'Read from keyboard']
    case 'unsupported': return ['Unavailable', result.message]
    case 'timeout': return ['Timed out', result.message]
    case 'invalid-response': return ['Invalid', result.message]
    case 'disconnected': return ['—', result.message]
  }
}

function renderKeyboard(): void {
  const matrix = transport.matrix(ui.remapLayer.value as B68Layer)
  for (const button of ui.keyGrid.querySelectorAll<HTMLButtonElement>('.keyboard-key')) {
    const index = Number(button.dataset.led)
    const decoded = matrix?.assignments[index]
    button.querySelector<HTMLElement>('.key-assignment')!.textContent = decoded ? assignmentLabel(decoded) : ''
    const color = keyColors.get(index)
    button.style.setProperty('--key-color', color ? `rgb(${color.red} ${color.green} ${color.blue})` : 'transparent')
    button.classList.toggle('painted', Boolean(color))
    button.classList.toggle('keymap-read', Boolean(decoded))
    const selected = mode === 'remap' ? selectedRemapKey === index : selectedRgbKeys.has(index)
    button.classList.toggle('selected', selected)
    button.setAttribute('aria-pressed', String(selected))
  }
}

function render(status: DeviceStatus = transport.status()): void {
  const [debounce, debounceDetail] = describe(status.configuration, (value) => `${value.debounceMs} ms`)
  ui.debounce.textContent = debounce; ui.debounceDetail.textContent = debounceDetail
  ui.title.textContent = status.connected ? (status.productName || status.knownDevice!.displayName) : 'Waiting for a keyboard'
  ui.pill.textContent = status.connected ? 'Connected' : 'Disconnected'; ui.pill.classList.toggle('connected', status.connected)
  ui.connectionMode.textContent = status.knownDevice?.connectionType ?? '—'
  ui.identity.textContent = status.knownDevice ? `${status.knownDevice.vendorId.toString(16).padStart(4, '0').toUpperCase()}:${status.knownDevice.productId.toString(16).padStart(4, '0').toUpperCase()}` : 'No device selected'
  ui.connect.hidden = status.connected; ui.disconnect.hidden = !status.connected; ui.refresh.disabled = !status.connected
  ui.applyDebounce.disabled = status.configuration.state !== 'available' || !status.capabilities.debounce
  ui.debounceSetting.disabled = !status.capabilities.debounce
  if (status.configuration.state === 'available') {
    ui.debounceSetting.value = String(status.configuration.value.debounceMs)
    ui.effectSummary.textContent = `${status.configuration.value.effectName} active.`
  } else ui.effectSummary.textContent = status.capabilities.onboardEffects ? 'Refresh to read the current effect.' : 'Onboard effects require a confirmed wired configuration channel.'
  for (const button of ui.effectGrid.querySelectorAll<HTMLButtonElement>('.effect-tile')) {
    button.disabled = status.configuration.state !== 'available' || !status.capabilities.onboardEffects
    const active = status.configuration.state === 'available' && Number(button.dataset.effect) === status.configuration.value.hardwareEffectId
    button.classList.toggle('active', active)
  }
  ui.readLayer.disabled = !status.capabilities.keymap
  ui.applyRemap.disabled = !status.capabilities.keymap || selectedRemapKey === null || !transport.matrix(ui.remapLayer.value as B68Layer)
  ui.applyColor.disabled = !status.capabilities.liveRgb
  ui.paintKeys.disabled = !status.capabilities.liveRgb || selectedRgbKeys.size === 0
  ui.clearKeys.disabled = !status.capabilities.liveRgb || keyColors.size === 0
  ui.stopColor.disabled = !transport.livePreviewActive
  ui.copy.disabled = !status.connected
  const diagnostics = transport.diagnostics()
  ui.diagnostics.textContent = diagnostics ? JSON.stringify(diagnostics, null, 2) : 'Connect a keyboard to inspect its HID collections.'
  renderKeyboard()
}

function setMode(next: WorkspaceMode): void {
  mode = next
  ui.modeRemap.classList.toggle('active', mode === 'remap'); ui.modeRgb.classList.toggle('active', mode === 'rgb')
  ui.modeRemap.setAttribute('aria-selected', String(mode === 'remap')); ui.modeRgb.setAttribute('aria-selected', String(mode === 'rgb'))
  ui.remapControls.hidden = mode !== 'remap'; ui.rgbControls.hidden = mode !== 'rgb'
  ui.workspaceTitle.textContent = mode === 'remap' ? 'Remap keys' : 'Paint keys'
  ui.workspaceHelp.textContent = mode === 'remap' ? 'Read a layer, select one physical key below, then assign one keyboard key.' : 'Select one or more keys below, choose a color, and preview it live.'
  renderKeyboard(); render()
}

async function refresh(): Promise<void> {
  if (!transport.device) return
  ui.notice.textContent = 'Reading supported status…'
  if (transport.capabilities.debounce || transport.capabilities.onboardEffects) await transport.inspectOnboardLighting()
  ui.notice.textContent = transport.knownDevice?.connectionType === 'wireless'
    ? 'Dongle connected. Only descriptor-proven capabilities are enabled.'
    : 'Status refreshed.'
  render()
}

async function connect(device?: HIDDevice): Promise<void> {
  ui.notice.textContent = 'Waiting for browser permission…'
  try {
    const selected = device ?? preferWired((await navigator.hid.requestDevice({ filters: [...DEVICE_FILTERS] })).filter((item) => matchKnownDevice(item)))[0]
    if (!selected) { ui.notice.textContent = 'No keyboard selected.'; return }
    await transport.connect(selected)
    await refresh()
  } catch (error) { ui.notice.textContent = message(error, 'The keyboard could not be opened.'); render() }
}

ui.connect.addEventListener('click', () => void connect())
ui.disconnect.addEventListener('click', () => void transport.disconnect().then(() => { selectedRemapKey = null; selectedRgbKeys.clear(); render() }))
ui.refresh.addEventListener('click', () => void refresh())
ui.modeRemap.addEventListener('click', () => setMode('remap'))
ui.modeRgb.addEventListener('click', () => setMode('rgb'))
ui.remapLayer.addEventListener('change', () => { selectedRemapKey = null; ui.remapSummary.textContent = transport.matrix(ui.remapLayer.value as B68Layer) ? 'Layer loaded.' : 'Read this layer to begin.'; render() })
ui.readLayer.addEventListener('click', async () => {
  const layer = ui.remapLayer.value as B68Layer
  ui.notice.textContent = `Reading ${layer.toUpperCase()} layer…`
  await transport.inspectMatrix(layer)
  ui.remapSummary.textContent = transport.matrix(layer) ? 'Layer validated. Select a physical key.' : 'Layer validation failed.'
  render()
})
ui.applyRemap.addEventListener('click', async () => {
  const layer = ui.remapLayer.value as B68Layer
  const baseline = transport.matrix(layer)
  if (!baseline || selectedRemapKey === null) return
  const key = B68_KEYS.find((candidate) => candidate.ledIndex === selectedRemapKey)
  const target = KEYBOARD_USAGE_OPTIONS.find((candidate) => candidate.usage === Number(ui.remapUsage.value))
  ui.notice.textContent = `Applying ${key?.label ?? 'key'} → ${target?.label ?? 'key'} and verifying all 512 bytes…`
  try {
    await transport.applyMatrixLayer(replaceMatrixAssignment(baseline, selectedRemapKey, encodeKeyboardAssignment(Number(ui.remapUsage.value))))
    ui.remapSummary.textContent = `${key?.label ?? 'Key'} → ${target?.label ?? 'key'} applied and verified.`
    ui.notice.textContent = 'Key assignment applied and verified.'
  } catch (error) { ui.notice.textContent = message(error, 'The assignment was not verified.') }
  render()
})

function colorFromInput(): RgbColor {
  const value = ui.liveColor.value
  return { red: Number.parseInt(value.slice(1, 3), 16), green: Number.parseInt(value.slice(3, 5), 16), blue: Number.parseInt(value.slice(5, 7), 16) }
}
ui.applyColor.addEventListener('click', async () => { try { await transport.setLiveColor(colorFromInput()); ui.notice.textContent = 'Whole-board live preview active.' } catch (error) { ui.notice.textContent = message(error, 'Live RGB failed.') } render() })
ui.paintKeys.addEventListener('click', async () => {
  const color = colorFromInput(); for (const index of selectedRgbKeys) keyColors.set(index, color)
  try { await transport.setLiveKeyColors(keyColors); ui.notice.textContent = `${selectedRgbKeys.size} selected key(s) painted.` } catch (error) { ui.notice.textContent = message(error, 'Per-key RGB failed.') }
  render()
})
ui.clearKeys.addEventListener('click', async () => { keyColors.clear(); try { await transport.setLiveKeyColors(keyColors) } catch { /* render capability state below */ } ui.notice.textContent = 'Custom colors cleared.'; render() })
ui.stopColor.addEventListener('click', () => { transport.stopLiveColor(); ui.notice.textContent = 'Live preview stopped; the onboard effect can resume.'; render() })
ui.applyDebounce.addEventListener('click', async () => { try { await transport.applyDebounce(Number(ui.debounceSetting.value)); ui.notice.textContent = 'Debounce applied and verified.' } catch (error) { ui.notice.textContent = message(error, 'Debounce was not verified.') } render() })
ui.copy.addEventListener('click', async () => { const report = transport.diagnostics(); if (report) { await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); ui.notice.textContent = 'Diagnostic report copied.' } })

transport.addEventListener('statuschange', () => render())
transport.addEventListener('transporterror', (event) => { ui.notice.textContent = `Keyboard communication stopped: ${(event as CustomEvent<string>).detail}`; render() })

if (!('hid' in navigator)) {
  ui.connect.disabled = true
  ui.notice.textContent = 'WebHID is unavailable. Use desktop Chrome, Edge, or another compatible Chromium browser over HTTPS or localhost.'
} else {
  navigator.hid.addEventListener('disconnect', (event) => { if (event.device === transport.device) transport.markDisconnected() })
  void navigator.hid.getDevices().then((devices) => {
    const authorized = preferWired(devices.filter((device) => matchKnownDevice(device)))
    if (authorized.length > 0) ui.notice.textContent = `${authorized.length} previously authorized B68 device${authorized.length === 1 ? ' is' : 's are'} available.`
  })
}

setMode('remap')
