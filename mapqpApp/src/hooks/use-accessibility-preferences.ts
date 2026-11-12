import { useSettings, type CustomAccessibilityPreferences } from "../context/settings-context";
import type { DeviceAccessibilitySettings, DeviceAccessibilityPreference } from "./use-device-accessibility";

export type EffectiveAccessibilitySettings = DeviceAccessibilitySettings & {
  emphasizedTextEnabled: boolean;
};

type AccessibilityControlState = {
  enabled: boolean;
  disabled: boolean;
  explanation: string;
};

// A retained true value is a previously successful ON reading. The detection
// hook preserves it through refreshes/failures until a successful OFF reading.
export function accessibilityControlState(
  device: DeviceAccessibilitySettings,
  preference: DeviceAccessibilityPreference,
  customEnabled: boolean,
  settingsLoaded: boolean,
): AccessibilityControlState {
  const status = device.detectionStatus[preference];
  const deviceEnabled = device[preference];
  const enabled = deviceEnabled || customEnabled;
  const disabled = !settingsLoaded || status === "loading" || deviceEnabled;
  let explanation: string;
  if (!settingsLoaded) explanation = "Loading saved preferences...";
  else if (status === "loading") explanation = "Checking device settings...";
  else if (status === "unavailable") {
    explanation = deviceEnabled
      ? "Device status unavailable; last detected enabled"
      : `Device status unavailable. ${customEnabled ? "Enabled in MapQP" : "Disabled in MapQP"}`;
  } else explanation = deviceEnabled ? "Enabled by device settings" : customEnabled ? "Enabled in MapQP" : "Disabled";
  return { enabled, disabled, explanation };
}

export function resolveAccessibilityPreferences(
  device: DeviceAccessibilitySettings,
  custom: CustomAccessibilityPreferences,
  settingsLoaded: boolean,
): EffectiveAccessibilitySettings {
  const boldTextEnabled = device.boldTextEnabled || custom.boldTextEnabled;
  return {
    ...device,
    reduceMotionEnabled: device.reduceMotionEnabled || custom.reduceMotionEnabled,
    boldTextEnabled,
    // Keep the existing consumer contract for iOS/Android contrast. Raw device
    // readings and their detection statuses remain separately in the provider.
    darkerSystemColorsEnabled: device.darkerSystemColorsEnabled || custom.increaseContrastEnabled,
    highTextContrastEnabled: device.highTextContrastEnabled,
    // Transparency adjustments follow the device; legacy saved app values are ignored.
    reduceTransparencyEnabled: device.reduceTransparencyEnabled,
    emphasizedTextEnabled: boldTextEnabled,
    loaded: settingsLoaded && device.loaded,
  };
}

export function useAccessibilityPreferences() {
  const { deviceAccessibility, customAccessibilityPreferences, settingsLoaded } = useSettings();
  return resolveAccessibilityPreferences(deviceAccessibility, customAccessibilityPreferences, settingsLoaded);
}
