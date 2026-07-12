interface HIDReportItem {
  reportSize: number
  reportCount: number
}

interface HIDReportInfo {
  reportId: number
  items: HIDReportItem[]
}

interface HIDCollectionInfo {
  usagePage: number
  usage: number
  type: number
  children: HIDCollectionInfo[]
  inputReports: HIDReportInfo[]
  outputReports: HIDReportInfo[]
  featureReports: HIDReportInfo[]
}

interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice
  readonly reportId: number
  readonly data: DataView
}

interface HIDDevice extends EventTarget {
  readonly opened: boolean
  readonly vendorId: number
  readonly productId: number
  readonly productName: string
  readonly collections: HIDCollectionInfo[]
  oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => unknown) | null
  open(): Promise<void>
  close(): Promise<void>
  receiveFeatureReport(reportId: number): Promise<DataView>
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>
  sendReport(reportId: number, data: BufferSource): Promise<void>
}

interface HIDConnectionEvent extends Event {
  readonly device: HIDDevice
}

interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>
  requestDevice(options: { filters: HIDDeviceFilter[] }): Promise<HIDDevice[]>
  addEventListener(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEvent) => void): void
  removeEventListener(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEvent) => void): void
}

interface HIDDeviceFilter {
  vendorId?: number
  productId?: number
  usagePage?: number
  usage?: number
}

interface Navigator {
  readonly hid: HID
  readonly usb?: USB
}

interface USBDevice {
  readonly vendorId: number
  readonly productId: number
  readonly productName?: string
  readonly deviceVersionMajor: number
  readonly deviceVersionMinor: number
  readonly deviceVersionSubminor: number
}

interface USB {
  requestDevice(options: { filters: Array<{ vendorId: number; productId?: number }> }): Promise<USBDevice>
}
