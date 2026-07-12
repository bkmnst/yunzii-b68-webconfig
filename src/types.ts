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

export interface FirmwareInfo {
  formatted: string
}

export interface DeviceStatus {
  connected: boolean
  knownDevice: KnownDevice | null
  productName: string | null
  firmware: MetricResult<FirmwareInfo>
  battery: MetricResult<number>
  lastRefresh: Date | null
}

export interface DiagnosticSnapshot {
  generatedAt: string
  device: {
    connectionType: ConnectionType
    vendorId: string
    productId: string
    productName: string
  }
  collections: HidReportDescriptor[]
  vendorCollectionCount: number
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
