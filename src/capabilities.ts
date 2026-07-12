import type { DeviceCapabilities, HidReportDescriptor, KnownDevice } from './types'

const NO_CAPABILITIES: DeviceCapabilities = Object.freeze({
  debounce: false,
  keymap: false,
  liveRgb: false,
  onboardEffects: false,
})

/**
 * Capabilities require both protocol evidence and a matching descriptor. The
 * dongle identifiers are known, but its command transport is not; only its
 * validated unsolicited status envelope is accepted for now.
 */
export function deriveDeviceCapabilities(
  device: KnownDevice | null,
  collections: readonly HidReportDescriptor[],
): DeviceCapabilities {
  if (!device) return { ...NO_CAPABILITIES }
  const hasConfigurationReport = collections.some((collection) =>
    collection.vendorDefined
      && collection.featureReports.some((report) => report.reportId === 6 && report.byteLength >= 519),
  )
  if (device.connectionType === 'wireless') {
    return { ...NO_CAPABILITIES }
  }
  return {
    debounce: hasConfigurationReport,
    keymap: hasConfigurationReport,
    liveRgb: hasConfigurationReport,
    onboardEffects: hasConfigurationReport,
  }
}
