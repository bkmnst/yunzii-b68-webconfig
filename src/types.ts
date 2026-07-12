import type { B68OnboardConfiguration } from './configuration'

export type ConnectionType = 'wired' | 'wireless'

export interface KnownDevice {
  connectionType: ConnectionType
  vendorId: number
  productId: number
  displayName: string
}

export interface ReportSummary {
  reportId: number
  byteLength: number
}

export interface HidReportDescriptor {
  usagePage: number
  usage: number
  vendorDefined: boolean
  inputReports: ReportSummary[]
  outputReports: ReportSummary[]
  featureReports: ReportSummary[]
}

export type MetricResult<T> =
  | { state: 'available'; value: T; raw: readonly number[] }
  | { state: 'unsupported'; message: string }
  | { state: 'timeout'; message: string }
  | { state: 'invalid-response'; message: string; raw: readonly number[] }
  | { state: 'disconnected'; message: string }

export interface DeviceStatus {
  connected: boolean
  knownDevice: KnownDevice | null
  productName: string | null
  configuration: MetricResult<B68OnboardConfiguration>
  capabilities: DeviceCapabilities
  lastRefresh: Date | null
}

export interface DeviceCapabilities {
  debounce: boolean
  keymap: boolean
  liveRgb: boolean
  onboardEffects: boolean
}

export interface DiagnosticSnapshot {
  appBuild: string
  generatedAt: string
  device: {
    connectionType: ConnectionType
    vendorId: string
    productId: string
    productName: string
  }
  collections: HidReportDescriptor[]
  vendorCollectionCount: number
  capabilities: DeviceCapabilities
  featureReads: readonly {
    reportId: number
    result: 'ok' | 'error'
    bytes?: readonly number[]
    message?: string
  }[]
  inputReports: readonly {
    capturedAt: string
    reportId: number
    bytes: readonly number[]
  }[]
  events: readonly string[]
}
