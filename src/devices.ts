import type { HidReportDescriptor, KnownDevice, ReportSummary } from './types'

export const KNOWN_DEVICES: readonly KnownDevice[] = [
  { connectionType: 'wired', vendorId: 0x258a, productId: 0x010c, displayName: 'Yunzii B68 (wired)' },
  { connectionType: 'wireless', vendorId: 0x3554, productId: 0xfa09, displayName: 'Yunzii B68 dongle' },
]

export const DEVICE_FILTERS: readonly HIDDeviceFilter[] = KNOWN_DEVICES.map(({ vendorId, productId }) => ({
  vendorId,
  productId,
}))

export const VENDOR_USAGE_PAGE_MIN = 0xff00

export function matchKnownDevice(device: Pick<HIDDevice, 'vendorId' | 'productId'>): KnownDevice | null {
  return KNOWN_DEVICES.find(
    (known) => known.vendorId === device.vendorId && known.productId === device.productId,
  ) ?? null
}

function byteLength(report: HIDReportInfo): number {
  const bits = report.items.reduce((sum, item) => sum + item.reportSize * item.reportCount, 0)
  return Math.ceil(bits / 8)
}

function summarize(reports: HIDReportInfo[]): ReportSummary[] {
  return reports.map((report) => ({ reportId: report.reportId, byteLength: byteLength(report) }))
}

export function vendorCollections(device: Pick<HIDDevice, 'collections'>): HidReportDescriptor[] {
  const flattened: HIDCollectionInfo[] = []
  const visit = (collections: HIDCollectionInfo[]) => {
    for (const collection of collections) {
      flattened.push(collection)
      visit(collection.children ?? [])
    }
  }
  visit(device.collections)

  return flattened
    .filter((collection) => collection.usagePage >= VENDOR_USAGE_PAGE_MIN)
    .map((collection) => ({
      usagePage: collection.usagePage,
      usage: collection.usage,
      inputReports: summarize(collection.inputReports ?? []),
      outputReports: summarize(collection.outputReports ?? []),
      featureReports: summarize(collection.featureReports ?? []),
    }))
}

export function preferWired(devices: HIDDevice[]): HIDDevice[] {
  return [...devices].sort((left, right) => {
    const a = matchKnownDevice(left)?.connectionType === 'wired' ? 0 : 1
    const b = matchKnownDevice(right)?.connectionType === 'wired' ? 0 : 1
    return a - b
  })
}

