import './style.css'
import { assignmentLabel } from './assignment-label'
import { DEVICE_FILTERS, matchKnownDevice, preferWired } from './devices'
import { KEYBOARD_USAGE_OPTIONS, MODIFIER_OPTIONS } from './keycodes'
import { B68_KEYS, B68_KEY_ROWS } from './layout'
import {
  B68_LAYERS,
  encodeDisabledAssignment,
  encodeFnAssignment,
  encodeKeyboardAssignment,
  replaceMatrixAssignment,
  type B68Layer,
  type B68MatrixLayer,
} from './matrix'
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
import { B68_WIRED_PRODUCT_ID, B68_WIRED_VENDOR_ID, firmwareFromUsbDescriptor } from './usb-firmware'
import { encodeSafeSpecialAssignment, LIGHTING_ASSIGNMENTS, SAFE_DEVICE_ASSIGNMENTS } from './special-assignments'
import { B68_LIGHTING_EFFECTS } from './effects'
import { B68_ONBOARD_COLORS } from './configuration'
import { encodeMacroAssignment, type HardwareMacro, type HardwareMacroEvent, type MacroPlaybackMode } from './macro'
import { encodeDirectAssignment, MOUSE_ASSIGNMENTS, MULTIMEDIA_ASSIGNMENTS } from './direct-assignments'

const app = document.querySelector<HTMLDivElement>('#app')!
const transport = new KeyboardTransport()

app.innerHTML = `
  <main>
    <header class="hero">
      <div class="eyebrow"><span class="signal"></span> Local WebHID tool</div>
      <h1>Your B68,<br><em>without the driver.</em></h1>
      <p class="lede">Inspect and configure your keyboard directly in the browser. Nothing is installed or uploaded, and device changes happen only when you explicitly apply them.</p>
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
        <button id="read-usb-firmware" class="text-button" disabled>Read USB firmware</button>
        <span id="last-refresh">Not refreshed</span>
      </div>
      <div class="profile-controls hardware-controls">
        <label>Onboard effect <select id="onboard-effect-setting"></select></label>
        <button id="apply-onboard-effect" class="secondary" disabled>Apply and verify effect</button>
        <label>Onboard color <select id="onboard-color-setting"></select></label>
        <button id="apply-onboard-color" class="secondary" disabled>Apply and verify color</button>
        <label>Effect speed <select id="speed-setting"><option value="0">0 / 4</option><option value="1">1 / 4</option><option value="2">2 / 4</option><option value="3">3 / 4</option><option value="4">4 / 4</option></select></label>
        <label>Brightness <select id="brightness-setting"><option value="0">0 / 4</option><option value="1">1 / 4</option><option value="2">2 / 4</option><option value="3">3 / 4</option><option value="4">4 / 4</option></select></label>
        <button id="apply-lighting-levels" class="secondary" disabled>Apply and verify levels</button>
        <label>Debounce <select id="debounce-setting"><option value="1">1 ms</option><option value="2">2 ms</option><option value="3">3 ms</option><option value="4">4 ms</option></select></label>
        <button id="apply-debounce" class="secondary" disabled>Apply and verify debounce</button>
      </div>
    </section>

    <section class="lighting-panel" aria-labelledby="remap-title">
      <div class="lighting-heading">
        <div><p class="kicker">Key assignment</p><h2 id="remap-title">Remap a key</h2>
        <p>Read a complete layer first. Applying a staged assignment writes only that typed layer and verifies all 512 bytes immediately.</p></div>
      </div>
      <div class="profile-controls remap-controls">
        <label>Layer <select id="remap-layer"></select></label>
        <button id="read-remap-layer" class="secondary" disabled>Read layer</button>
        <label>Physical key <select id="remap-key"></select></label>
        <label>Assignment <select id="remap-kind"><option value="keyboard">Keyboard key / combo</option><option value="mouse">Mouse action</option><option value="multimedia">Multimedia action</option><option value="device">Device action</option><option value="lighting">Lighting action</option><option value="macro">Macro</option><option value="disabled">Disable</option><option value="fn">Fn</option></select></label>
        <label>Key <select id="remap-usage"></select></label>
        <label id="remap-special-label" hidden>Action <select id="remap-special"></select></label>
        <label id="remap-macro-label" hidden>Macro <select id="remap-macro"></select></label>
        <label id="remap-playback-label" hidden>Playback <select id="remap-playback"><option value="count">Fixed count</option><option value="until-release">Until key release</option><option value="until-any-key">Until any key</option></select></label>
        <label id="remap-repeat-label" hidden>Repeats <input id="remap-repeat" type="number" min="1" max="255" value="1" /></label>
        <fieldset id="remap-modifiers"><legend>Modifiers</legend></fieldset>
        <button id="stage-remap" class="secondary" disabled>Stage assignment</button>
        <button id="apply-remap" class="primary" disabled>Apply and verify</button>
        <span id="remap-summary">Read a layer to begin.</span>
      </div>
    </section>

    <section class="lighting-panel" aria-labelledby="macro-title">
      <div class="lighting-heading"><div><p class="kicker">Macro editor</p><h2 id="macro-title">Build keyboard sequences</h2>
      <p>Read the device archive first. Create explicit press/release events, then write the typed archive and verify it byte-for-byte.</p></div></div>
      <div class="profile-controls macro-controls">
        <button id="read-macros" class="secondary" disabled>Read macros</button>
        <label>Stored / staged <select id="macro-list"><option value="">No macros</option></select></label>
        <button id="edit-macro" class="secondary" disabled>Edit selected</button>
        <button id="delete-macro" class="secondary" disabled>Delete selected</button>
        <label>Name <input id="macro-name" maxlength="127" /></label>
        <label>Event <select id="macro-event-kind"><option value="keyboard">Keyboard key</option><option value="mouse-button">Mouse button</option><option value="mouse-x">Mouse X movement</option><option value="mouse-y">Mouse Y movement</option><option value="wheel">Mouse wheel</option></select></label>
        <label id="macro-key-label">Key <select id="macro-key"></select></label>
        <label id="macro-button-label" hidden>Button <select id="macro-button"><option value="1">Left</option><option value="2">Right</option><option value="4">Middle</option><option value="8">Back</option><option value="16">Forward</option></select></label>
        <label id="macro-value-label" hidden>Amount <input id="macro-value" type="number" min="-127" max="127" value="1" /></label>
        <label id="macro-action-label">Action <select id="macro-action"><option value="press">Press</option><option value="release">Release</option></select></label>
        <label>Delay before event <input id="macro-delay" type="number" min="0" max="1048575" value="20" /> ms</label>
        <button id="add-macro-event" class="secondary">Add event</button>
        <button id="clear-macro-events" class="secondary" disabled>Clear events</button>
        <button id="save-macro" class="secondary" disabled>Add macro to archive</button>
        <button id="cancel-macro-edit" class="secondary" hidden>Cancel edit</button>
        <button id="apply-macros" class="primary" disabled>Apply archive and verify</button>
      </div>
      <ol id="macro-events" class="macro-events"><li>No draft events.</li></ol>
      <p id="macro-summary">Read the keyboard archive before applying macros.</p>
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
        <button id="inspect-macros" class="secondary" disabled>Read macro archive</button>
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
  readUsbFirmware: document.querySelector<HTMLButtonElement>('#read-usb-firmware')!,
  debounceSetting: document.querySelector<HTMLSelectElement>('#debounce-setting')!,
  applyDebounce: document.querySelector<HTMLButtonElement>('#apply-debounce')!,
  speedSetting: document.querySelector<HTMLSelectElement>('#speed-setting')!,
  brightnessSetting: document.querySelector<HTMLSelectElement>('#brightness-setting')!,
  applyLightingLevels: document.querySelector<HTMLButtonElement>('#apply-lighting-levels')!,
  onboardEffectSetting: document.querySelector<HTMLSelectElement>('#onboard-effect-setting')!,
  applyOnboardEffect: document.querySelector<HTMLButtonElement>('#apply-onboard-effect')!,
  onboardColorSetting: document.querySelector<HTMLSelectElement>('#onboard-color-setting')!,
  applyOnboardColor: document.querySelector<HTMLButtonElement>('#apply-onboard-color')!,
  copy: document.querySelector<HTMLButtonElement>('#copy')!,
  inspectMatrix: document.querySelector<HTMLButtonElement>('#inspect-matrix')!,
  inspectMacros: document.querySelector<HTMLButtonElement>('#inspect-macros')!,
  remapLayer: document.querySelector<HTMLSelectElement>('#remap-layer')!,
  readRemapLayer: document.querySelector<HTMLButtonElement>('#read-remap-layer')!,
  remapKey: document.querySelector<HTMLSelectElement>('#remap-key')!,
  remapKind: document.querySelector<HTMLSelectElement>('#remap-kind')!,
  remapUsage: document.querySelector<HTMLSelectElement>('#remap-usage')!,
  remapSpecial: document.querySelector<HTMLSelectElement>('#remap-special')!,
  remapSpecialLabel: document.querySelector<HTMLElement>('#remap-special-label')!,
  remapMacro: document.querySelector<HTMLSelectElement>('#remap-macro')!,
  remapMacroLabel: document.querySelector<HTMLElement>('#remap-macro-label')!,
  remapPlayback: document.querySelector<HTMLSelectElement>('#remap-playback')!,
  remapPlaybackLabel: document.querySelector<HTMLElement>('#remap-playback-label')!,
  remapRepeat: document.querySelector<HTMLInputElement>('#remap-repeat')!,
  remapRepeatLabel: document.querySelector<HTMLElement>('#remap-repeat-label')!,
  remapModifiers: document.querySelector<HTMLFieldSetElement>('#remap-modifiers')!,
  stageRemap: document.querySelector<HTMLButtonElement>('#stage-remap')!,
  applyRemap: document.querySelector<HTMLButtonElement>('#apply-remap')!,
  remapSummary: document.querySelector<HTMLElement>('#remap-summary')!,
  readMacros: document.querySelector<HTMLButtonElement>('#read-macros')!,
  macroList: document.querySelector<HTMLSelectElement>('#macro-list')!,
  editMacro: document.querySelector<HTMLButtonElement>('#edit-macro')!,
  deleteMacro: document.querySelector<HTMLButtonElement>('#delete-macro')!,
  macroName: document.querySelector<HTMLInputElement>('#macro-name')!,
  macroEventKind: document.querySelector<HTMLSelectElement>('#macro-event-kind')!,
  macroKey: document.querySelector<HTMLSelectElement>('#macro-key')!,
  macroKeyLabel: document.querySelector<HTMLElement>('#macro-key-label')!,
  macroButton: document.querySelector<HTMLSelectElement>('#macro-button')!,
  macroButtonLabel: document.querySelector<HTMLElement>('#macro-button-label')!,
  macroValue: document.querySelector<HTMLInputElement>('#macro-value')!,
  macroValueLabel: document.querySelector<HTMLElement>('#macro-value-label')!,
  macroAction: document.querySelector<HTMLSelectElement>('#macro-action')!,
  macroActionLabel: document.querySelector<HTMLElement>('#macro-action-label')!,
  macroDelay: document.querySelector<HTMLInputElement>('#macro-delay')!,
  addMacroEvent: document.querySelector<HTMLButtonElement>('#add-macro-event')!,
  clearMacroEvents: document.querySelector<HTMLButtonElement>('#clear-macro-events')!,
  saveMacro: document.querySelector<HTMLButtonElement>('#save-macro')!,
  cancelMacroEdit: document.querySelector<HTMLButtonElement>('#cancel-macro-edit')!,
  applyMacros: document.querySelector<HTMLButtonElement>('#apply-macros')!,
  macroEvents: document.querySelector<HTMLOListElement>('#macro-events')!,
  macroSummary: document.querySelector<HTMLElement>('#macro-summary')!,
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
let stagedMatrix: B68MatrixLayer | null = null
let macroDrafts: HardwareMacro[] | null = null
let macroDraftEvents: HardwareMacroEvent[] = []
let editingMacroIndex: number | null = null

for (const effect of B68_LIGHTING_EFFECTS) {
  ui.onboardEffectSetting.add(new Option(
    `${effect.name} — vendor label: ${effect.vendorLabel}`,
    String(effect.hardwareId),
  ))
}
for (const color of B68_ONBOARD_COLORS) ui.onboardColorSetting.add(new Option(color.name, String(color.group)))
ui.onboardColorSetting.add(new Option('Random', '7'))

for (const layer of B68_LAYERS) ui.remapLayer.add(new Option(layer.toUpperCase(), layer))
for (const key of B68_KEYS) ui.remapKey.add(new Option(key.label, String(key.ledIndex)))
for (const key of KEYBOARD_USAGE_OPTIONS) ui.remapUsage.add(new Option(key.label, String(key.usage)))
for (const key of KEYBOARD_USAGE_OPTIONS) ui.macroKey.add(new Option(key.label, String(key.usage)))
for (const modifier of MODIFIER_OPTIONS) {
  const label = document.createElement('label')
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.value = String(modifier.mask)
  label.append(input, ` ${modifier.label}`)
  ui.remapModifiers.append(label)
}
renderMacroEventInput()

function renderSpecialAssignmentOptions(): void {
  const options = ui.remapKind.value === 'device' ? SAFE_DEVICE_ASSIGNMENTS
    : ui.remapKind.value === 'lighting' ? LIGHTING_ASSIGNMENTS
      : ui.remapKind.value === 'mouse' ? MOUSE_ASSIGNMENTS
        : ui.remapKind.value === 'multimedia' ? MULTIMEDIA_ASSIGNMENTS : []
  ui.remapSpecial.replaceChildren(...options.map((option) => new Option(option.label, option.id)))
  ui.remapSpecialLabel.hidden = options.length === 0
}

function renderMacroEditor(): void {
  ui.macroEvents.replaceChildren(...(macroDraftEvents.length > 0
    ? macroDraftEvents.map((event, index) => {
      const item = document.createElement('li')
      const signedValue = event.value > 127 ? event.value - 256 : event.value
      const key = KEYBOARD_USAGE_OPTIONS.find((option) => option.usage === event.value)?.label ?? `0x${event.value.toString(16)}`
      const button = ({ 1: 'Left', 2: 'Right', 4: 'Middle', 8: 'Back', 16: 'Forward' } as Record<number, string>)[event.value] ?? `mask 0x${event.value.toString(16)}`
      const description = event.type === 1 ? `${event.released ? 'Release' : 'Press'} ${key}`
        : event.type === 2 ? `${event.released ? 'Release' : 'Press'} ${button} mouse button`
          : event.type === 3 ? `Move mouse X ${signedValue}`
            : event.type === 4 ? `Move mouse Y ${signedValue}`
              : `Scroll wheel ${signedValue}`
      const text = document.createElement('span')
      text.textContent = `${event.delayMs} ms · ${description}`
      const up = Object.assign(document.createElement('button'), { type: 'button', textContent: '↑', disabled: index === 0, title: 'Move event earlier' })
      const down = Object.assign(document.createElement('button'), { type: 'button', textContent: '↓', disabled: index === macroDraftEvents.length - 1, title: 'Move event later' })
      const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Remove', title: 'Remove event' })
      up.addEventListener('click', () => {
        if (index === 0) return
        const events = [...macroDraftEvents]
        ;[events[index - 1], events[index]] = [events[index], events[index - 1]]
        macroDraftEvents = events
        renderMacroEditor()
      })
      down.addEventListener('click', () => {
        if (index >= macroDraftEvents.length - 1) return
        const events = [...macroDraftEvents]
        ;[events[index], events[index + 1]] = [events[index + 1], events[index]]
        macroDraftEvents = events
        renderMacroEditor()
      })
      remove.addEventListener('click', () => {
        macroDraftEvents = macroDraftEvents.filter((_, eventIndex) => eventIndex !== index)
        renderMacroEditor()
      })
      const actions = document.createElement('span')
      actions.className = 'macro-event-actions'
      actions.append(up, down, remove)
      item.append(text, actions)
      return item
    })
    : [Object.assign(document.createElement('li'), { textContent: 'No draft events.' })]))
  ui.clearMacroEvents.disabled = macroDraftEvents.length === 0
  ui.saveMacro.disabled = macroDrafts === null || macroDraftEvents.length === 0 || ui.macroName.value.trim().length === 0
  ui.saveMacro.textContent = editingMacroIndex === null ? 'Add macro to archive' : 'Replace macro in archive'
  ui.cancelMacroEdit.hidden = editingMacroIndex === null
  ui.macroList.replaceChildren(new Option(macroDrafts?.length ? 'Select macro' : 'No macros', ''))
  macroDrafts?.forEach((macro, index) => ui.macroList.add(new Option(`${index + 1}. ${macro.name}`, String(index))))
  ui.editMacro.disabled = !ui.macroList.value
  ui.deleteMacro.disabled = !ui.macroList.value
  ui.applyMacros.disabled = macroDrafts === null || macroDrafts.length === 0
  ui.remapMacro.replaceChildren(...(transport.macros ?? []).map((macro, index) => new Option(`${index + 1}. ${macro.name}`, String(index))))
  const macroMode = ui.remapKind.value === 'macro'
  ui.remapMacroLabel.hidden = !macroMode
  ui.remapPlaybackLabel.hidden = !macroMode
  ui.remapRepeatLabel.hidden = !macroMode || ui.remapPlayback.value !== 'count'
  ui.stageRemap.disabled = !transport.matrix(ui.remapLayer.value as B68Layer) || (macroMode && ui.remapMacro.options.length === 0)
}

function renderMacroEventInput(): void {
  const kind = ui.macroEventKind.value
  const keyboard = kind === 'keyboard'
  const button = kind === 'mouse-button'
  ui.macroKeyLabel.hidden = !keyboard
  ui.macroButtonLabel.hidden = !button
  ui.macroValueLabel.hidden = keyboard || button
  ui.macroActionLabel.hidden = !keyboard && !button
  ui.macroValueLabel.firstChild!.textContent = kind === 'wheel' ? 'Wheel amount ' : kind === 'mouse-x' ? 'X amount ' : 'Y amount '
}

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
  if (status.configuration.state === 'available') {
    ui.debounceSetting.value = String(status.configuration.value.debounceMs)
    ui.onboardEffectSetting.value = String(status.configuration.value.hardwareEffectId)
    ui.speedSetting.value = String(status.configuration.value.speedLevel)
    ui.brightnessSetting.value = String(status.configuration.value.brightnessLevel)
    ui.onboardColorSetting.value = String(status.configuration.value.colorGroup)
  }
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
  ui.readUsbFirmware.disabled = !status.connected || status.knownDevice?.connectionType !== 'wired' || !navigator.usb
  ui.applyDebounce.disabled = status.configuration.state !== 'available' || status.knownDevice?.connectionType !== 'wired'
  ui.applyOnboardEffect.disabled = status.configuration.state !== 'available' || status.knownDevice?.connectionType !== 'wired'
  const lightingConfiguration = status.configuration.state === 'available' ? status.configuration.value : null
  const supportsLightingLevels = lightingConfiguration !== null && status.knownDevice?.connectionType === 'wired'
  ui.speedSetting.disabled = !supportsLightingLevels || !lightingConfiguration?.effect?.supportsSpeed
  ui.brightnessSetting.disabled = !supportsLightingLevels || !lightingConfiguration?.effect?.supportsBrightness
  const selectedColorGroup = Number(ui.onboardColorSetting.value)
  const supportsSelectedColor = selectedColorGroup === 7
    ? Boolean(lightingConfiguration?.effect?.supportsRandomColor)
    : Boolean(lightingConfiguration?.effect?.supportsFixedColor)
  ui.onboardColorSetting.disabled = !lightingConfiguration
  ui.applyOnboardColor.disabled = status.knownDevice?.connectionType !== 'wired' || !supportsSelectedColor
  ui.applyLightingLevels.disabled = !supportsLightingLevels
  ui.readMacros.disabled = !status.connected || status.knownDevice?.connectionType !== 'wired'
  ui.copy.disabled = !status.connected
  ui.inspectMatrix.disabled = !status.connected || status.knownDevice?.connectionType !== 'wired'
  ui.inspectMacros.disabled = !status.connected || status.knownDevice?.connectionType !== 'wired'
  ui.readRemapLayer.disabled = !status.connected || status.knownDevice?.connectionType !== 'wired'
  ui.stageRemap.disabled = !transport.matrix(ui.remapLayer.value as B68Layer)
    || (ui.remapKind.value === 'macro' && ui.remapMacro.options.length === 0)
  ui.applyRemap.disabled = !stagedMatrix
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
ui.applyDebounce.addEventListener('click', async () => {
  const debounceMs = Number(ui.debounceSetting.value)
  ui.applyDebounce.disabled = true
  ui.notice.textContent = `Applying ${debounceMs} ms debounce and verifying hardware readback…`
  try {
    await transport.applyDebounce(debounceMs)
    ui.notice.textContent = `Debounce set to ${debounceMs} ms and verified.`
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'The debounce setting was not verified.'
  }
  render()
})
ui.applyOnboardEffect.addEventListener('click', async () => {
  const hardwareEffectId = Number(ui.onboardEffectSetting.value)
  const effect = B68_LIGHTING_EFFECTS.find((candidate) => candidate.hardwareId === hardwareEffectId)
  ui.applyOnboardEffect.disabled = true
  ui.notice.textContent = `Applying ${effect?.name ?? `effect ${hardwareEffectId}`} and verifying hardware readback…`
  try {
    await transport.applyOnboardEffect(hardwareEffectId)
    ui.notice.textContent = `${effect?.name ?? 'Onboard effect'} applied and verified.`
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'The onboard effect was not verified.'
  }
  render()
})
ui.onboardColorSetting.addEventListener('change', render)
ui.applyOnboardColor.addEventListener('click', async () => {
  const colorGroup = Number(ui.onboardColorSetting.value)
  const label = colorGroup === 7 ? 'Random' : B68_ONBOARD_COLORS.find((color) => color.group === colorGroup)?.name ?? `group ${colorGroup}`
  ui.applyOnboardColor.disabled = true
  ui.notice.textContent = `Applying onboard color ${label} and verifying hardware readback…`
  try {
    await transport.applyOnboardColor(colorGroup)
    ui.notice.textContent = `Onboard color ${label} applied and verified.`
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'The onboard color was not verified.'
  }
  render()
})
ui.applyLightingLevels.addEventListener('click', async () => {
  const speedLevel = Number(ui.speedSetting.value)
  const brightnessLevel = Number(ui.brightnessSetting.value)
  ui.applyLightingLevels.disabled = true
  ui.notice.textContent = `Applying speed ${speedLevel}/4 and brightness ${brightnessLevel}/4 with hardware verification…`
  try {
    await transport.applyLightingLevels(speedLevel, brightnessLevel)
    ui.notice.textContent = `Speed ${speedLevel}/4 and brightness ${brightnessLevel}/4 applied and verified.`
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'The lighting levels were not verified.'
  }
  render()
})
ui.readUsbFirmware.addEventListener('click', async () => {
  if (!navigator.usb) {
    ui.notice.textContent = 'WebUSB is unavailable in this browser.'
    return
  }
  ui.readUsbFirmware.disabled = true
  ui.notice.textContent = 'Select the same wired B68 to read its USB device-version descriptor. No interface will be opened or claimed.'
  try {
    const device = await navigator.usb.requestDevice({ filters: [{ vendorId: B68_WIRED_VENDOR_ID, productId: B68_WIRED_PRODUCT_ID }] })
    const result = firmwareFromUsbDescriptor(device)
    transport.acceptUsbFirmware(result, device.vendorId, device.productId)
    render()
    ui.notice.textContent = result.state === 'available'
      ? `USB firmware descriptor read: ${result.value.formatted}.`
      : result.message
  } catch (error) {
    ui.notice.textContent = error instanceof DOMException && error.name === 'NotFoundError'
      ? 'No USB device was selected.'
      : error instanceof Error ? error.message : 'The USB firmware descriptor could not be read.'
  } finally {
    render()
  }
})
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
ui.inspectMacros.addEventListener('click', async () => {
  ui.inspectMacros.disabled = true
  ui.notice.textContent = 'Reading and validating the macro archive descriptor table…'
  await transport.inspectMacros()
  render()
  ui.notice.textContent = transport.macros
    ? `Macro archive validated: ${transport.macros.length} macro${transport.macros.length === 1 ? '' : 's'}. Copy the report to share the result.`
    : 'Macro archive validation failed; no macro write is available.'
})
ui.remapLayer.addEventListener('change', () => {
  stagedMatrix = null
  renderKeymap(ui.remapLayer.value as B68Layer)
  ui.remapSummary.textContent = transport.matrix(ui.remapLayer.value as B68Layer) ? 'Layer is validated; choose an assignment.' : 'Read this layer to begin.'
  render()
})
ui.remapKind.addEventListener('change', () => {
  const keyboard = ui.remapKind.value === 'keyboard'
  ui.remapUsage.disabled = !keyboard
  ui.remapModifiers.disabled = !keyboard
  renderSpecialAssignmentOptions()
  renderMacroEditor()
})
ui.remapPlayback.addEventListener('change', renderMacroEditor)
ui.readRemapLayer.addEventListener('click', async () => {
  const layer = ui.remapLayer.value as B68Layer
  stagedMatrix = null
  ui.readRemapLayer.disabled = true
  ui.notice.textContent = `Reading the complete ${layer.toUpperCase()} layer before editing…`
  await transport.inspectMatrix(layer)
  renderKeymap(layer)
  ui.remapSummary.textContent = transport.matrix(layer) ? 'Layer validated; choose a key and assignment.' : 'Layer validation failed; no write is available.'
  render()
})
ui.stageRemap.addEventListener('click', () => {
  const layer = ui.remapLayer.value as B68Layer
  const baseline = transport.matrix(layer)
  if (!baseline) return
  const index = Number(ui.remapKey.value)
  const assignment = ui.remapKind.value === 'disabled' ? encodeDisabledAssignment()
    : ui.remapKind.value === 'fn' ? encodeFnAssignment()
    : ui.remapKind.value === 'device' || ui.remapKind.value === 'lighting' ? encodeSafeSpecialAssignment(ui.remapSpecial.value)
    : ui.remapKind.value === 'mouse' || ui.remapKind.value === 'multimedia' ? encodeDirectAssignment(ui.remapSpecial.value)
    : ui.remapKind.value === 'macro' ? { bytes: [...encodeMacroAssignment(
      Number(ui.remapMacro.value),
      ui.remapPlayback.value as MacroPlaybackMode,
      Number(ui.remapRepeat.value),
    )] as [number, number, number, number] }
    : encodeKeyboardAssignment(
      [...ui.remapModifiers.querySelectorAll<HTMLInputElement>('input:checked')].reduce((mask, input) => mask | Number(input.value), 0),
      Number(ui.remapUsage.value),
    )
  stagedMatrix = replaceMatrixAssignment(baseline, index, assignment)
  ui.remapSummary.textContent = `${B68_KEYS.find((key) => key.ledIndex === index)?.label ?? `Slot ${index}`} → ${assignmentLabel(assignment)} (staged)`
  render()
})
ui.readMacros.addEventListener('click', async () => {
  ui.readMacros.disabled = true
  ui.notice.textContent = 'Reading and validating the device macro archive…'
  await transport.inspectMacros()
  macroDrafts = transport.macros?.map((macro) => ({ ...macro, events: macro.events.map((event) => ({ ...event })) })) ?? null
  editingMacroIndex = null
  macroDraftEvents = []
  ui.macroSummary.textContent = macroDrafts ? `${macroDrafts.length} macro${macroDrafts.length === 1 ? '' : 's'} loaded from the keyboard.` : 'Macro archive validation failed.'
  renderMacroEditor()
  render()
})
ui.macroName.addEventListener('input', renderMacroEditor)
ui.macroEventKind.addEventListener('change', renderMacroEventInput)
ui.addMacroEvent.addEventListener('click', () => {
  const delayMs = Number(ui.macroDelay.value)
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 0xfffff) {
    ui.notice.textContent = 'Macro delay must be an integer from 0 to 1,048,575 ms.'
    return
  }
  const kind = ui.macroEventKind.value
  let event: HardwareMacroEvent
  if (kind === 'keyboard') {
    event = { type: 1, delayMs, value: Number(ui.macroKey.value), released: ui.macroAction.value === 'release' }
  } else if (kind === 'mouse-button') {
    event = { type: 2, delayMs, value: Number(ui.macroButton.value), released: ui.macroAction.value === 'release' }
  } else {
    const amount = Number(ui.macroValue.value)
    if (!Number.isInteger(amount) || amount < -127 || amount > 127 || amount === 0) {
      ui.notice.textContent = 'Mouse movement and wheel amounts must be nonzero integers from -127 to 127.'
      return
    }
    event = { type: kind === 'mouse-x' ? 3 : kind === 'mouse-y' ? 4 : 5, delayMs, value: amount & 0xff }
  }
  macroDraftEvents = [...macroDraftEvents, event]
  renderMacroEditor()
})
ui.clearMacroEvents.addEventListener('click', () => { macroDraftEvents = []; renderMacroEditor() })
ui.saveMacro.addEventListener('click', () => {
  if (macroDrafts === null || macroDraftEvents.length === 0) return
  const name = ui.macroName.value.trim()
  if (!name) return
  const saved = { name, events: macroDraftEvents.map((event) => ({ ...event })) }
  if (editingMacroIndex === null) macroDrafts = [...macroDrafts, saved]
  else macroDrafts = macroDrafts.map((macro, index) => index === editingMacroIndex ? saved : macro)
  macroDraftEvents = []
  editingMacroIndex = null
  ui.macroName.value = ''
  ui.macroSummary.textContent = `${macroDrafts.length} macro${macroDrafts.length === 1 ? '' : 's'} staged; apply to write and verify.`
  renderMacroEditor()
})
ui.macroList.addEventListener('change', () => {
  const selected = ui.macroList.value !== ''
  ui.editMacro.disabled = !selected
  ui.deleteMacro.disabled = !selected
})
ui.editMacro.addEventListener('click', () => {
  if (macroDrafts === null || ui.macroList.value === '') return
  const index = Number(ui.macroList.value)
  const macro = macroDrafts[index]
  if (!macro) return
  editingMacroIndex = index
  ui.macroName.value = macro.name
  macroDraftEvents = macro.events.map((event) => ({ ...event }))
  ui.macroSummary.textContent = `Editing macro ${index + 1}; changes remain staged until archive apply.`
  renderMacroEditor()
})
ui.cancelMacroEdit.addEventListener('click', () => {
  editingMacroIndex = null
  macroDraftEvents = []
  ui.macroName.value = ''
  ui.macroSummary.textContent = 'Macro edit cancelled; the staged archive is unchanged.'
  renderMacroEditor()
})
ui.deleteMacro.addEventListener('click', () => {
  if (macroDrafts === null || ui.macroList.value === '') return
  macroDrafts = macroDrafts.filter((_, index) => index !== Number(ui.macroList.value))
  editingMacroIndex = null
  macroDraftEvents = []
  ui.macroName.value = ''
  ui.macroSummary.textContent = macroDrafts.length === 0
    ? 'The final macro cannot be cleared on-device until a clearing packet is confirmed.'
    : `${macroDrafts.length} macro${macroDrafts.length === 1 ? '' : 's'} staged.`
  renderMacroEditor()
})
ui.applyMacros.addEventListener('click', async () => {
  if (!macroDrafts?.length) return
  ui.applyMacros.disabled = true
  ui.notice.textContent = 'Writing typed macro pages and verifying the complete decoded archive…'
  try {
    await transport.applyMacros(macroDrafts)
    macroDrafts = transport.macros?.map((macro) => ({ ...macro, events: macro.events.map((event) => ({ ...event })) })) ?? null
    ui.macroSummary.textContent = `${macroDrafts?.length ?? 0} macro(s) applied and verified.`
    ui.notice.textContent = 'Macro archive applied; byte-for-byte readback matched.'
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'The macro archive was not verified.'
  }
  renderMacroEditor()
  render()
})
ui.applyRemap.addEventListener('click', async () => {
  if (!stagedMatrix) return
  ui.applyRemap.disabled = true
  ui.notice.textContent = 'Applying the typed key assignment and verifying exact hardware readback…'
  try {
    await transport.applyMatrixLayer(stagedMatrix)
    renderKeymap(stagedMatrix.layer)
    ui.remapSummary.textContent = 'Assignment applied and verified.'
    ui.notice.textContent = 'Key assignment applied; the complete 512-byte readback matched.'
    stagedMatrix = null
  } catch (error) {
    ui.notice.textContent = error instanceof Error ? error.message : 'The key assignment was not verified.'
  }
  render()
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
