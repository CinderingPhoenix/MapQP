import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Platform,
} from "react-native";

export type DeviceAccessibilityPreference =
  | "screenReaderEnabled"
  | "reduceMotionEnabled"
  | "boldTextEnabled"
  | "highTextContrastEnabled"
  | "darkerSystemColorsEnabled"
  | "reduceTransparencyEnabled";

export type PreferenceDetectionStatus = "loading" | "available" | "unavailable";

export type DeviceAccessibilitySettings = {
  screenReaderEnabled: boolean;
  reduceMotionEnabled: boolean;
  boldTextEnabled: boolean;
  highTextContrastEnabled: boolean;
  darkerSystemColorsEnabled: boolean;
  reduceTransparencyEnabled: boolean;
  detectionStatus: Record<DeviceAccessibilityPreference, PreferenceDetectionStatus>;
  // Initial refresh has settled; individual queries may still be unavailable.
  loaded: boolean;
};

type BooleanAccessibilityEvent =
  | "screenReaderChanged"
  | "reduceMotionChanged"
  | "boldTextChanged"
  | "darkerSystemColorsChanged"
  | "reduceTransparencyChanged"
  | "highTextContrastChanged";

export function useDeviceAccessibility(): DeviceAccessibilitySettings {
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [boldTextEnabled, setBoldTextEnabled] = useState(false);
  const [highTextContrastEnabled, setHighTextContrastEnabled] = useState(false);
  const [darkerSystemColorsEnabled, setDarkerSystemColorsEnabled] = useState(false);
  const [reduceTransparencyEnabled, setReduceTransparencyEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [detectionStatus, setDetectionStatus] = useState<
    Record<DeviceAccessibilityPreference, PreferenceDetectionStatus>
  >({
    screenReaderEnabled: "loading",
    reduceMotionEnabled: "loading",
    boldTextEnabled: Platform.OS === "ios" ? "loading" : "unavailable",
    darkerSystemColorsEnabled: Platform.OS === "ios" ? "loading" : "unavailable",
    reduceTransparencyEnabled: Platform.OS === "ios" ? "loading" : "unavailable",
    highTextContrastEnabled: Platform.OS === "android" ? "loading" : "unavailable",
  });

  useEffect(() => {
    let active = true;
    let refreshGeneration = 0;

    const updateStatus = (
      preference: DeviceAccessibilityPreference,
      status: PreferenceDetectionStatus,
    ) => {
      if (active) {
        setDetectionStatus((previous) => ({ ...previous, [preference]: status }));
      }
    };

    // Subscribe before querying. A newer event or query invalidates an older
    // asynchronous result, so startup reads cannot overwrite live changes.
    const observeSetting = (
      preference: DeviceAccessibilityPreference,
      event: BooleanAccessibilityEvent,
      query: () => Promise<boolean>,
      setValue: (value: boolean) => void,
    ) => {
      let revision = 0;
      const subscription = AccessibilityInfo.addEventListener(event, (value) => {
        revision += 1;
        if (active) {
          setValue(value);
          updateStatus(preference, "available");
        }
      });

      return {
        read: async () => {
          const queryRevision = ++revision;
          updateStatus(preference, "loading");
          try {
            const value = await query();
            if (active && queryRevision === revision) {
              setValue(value);
              updateStatus(preference, "available");
            }
          } catch (error) {
            // Preserve the last valid boolean for existing consumers, but do
            // not present that cached value as a successful current detection.
            if (queryRevision === revision) updateStatus(preference, "unavailable");
            console.warn(`Unable to read device accessibility setting ${event}:`, error);
          }
        },
        remove: () => subscription.remove(),
      };
    };

    const observers = [
      observeSetting("screenReaderEnabled", "screenReaderChanged", () => AccessibilityInfo.isScreenReaderEnabled(), setScreenReaderEnabled),
      observeSetting("reduceMotionEnabled", "reduceMotionChanged", () => AccessibilityInfo.isReduceMotionEnabled(), setReduceMotionEnabled),
    ];

    if (Platform.OS === "ios") {
      observers.push(
        observeSetting("boldTextEnabled", "boldTextChanged", () => AccessibilityInfo.isBoldTextEnabled(), setBoldTextEnabled),
        observeSetting("darkerSystemColorsEnabled", "darkerSystemColorsChanged", () => AccessibilityInfo.isDarkerSystemColorsEnabled(), setDarkerSystemColorsEnabled),
        observeSetting("reduceTransparencyEnabled", "reduceTransparencyChanged", () => AccessibilityInfo.isReduceTransparencyEnabled(), setReduceTransparencyEnabled),
      );
    } else if (Platform.OS === "android") {
      observers.push(
        observeSetting("highTextContrastEnabled", "highTextContrastChanged", () => AccessibilityInfo.isHighTextContrastEnabled(), setHighTextContrastEnabled),
      );
    }

    // Each read handles its own failure; one unavailable preference must not
    // prevent screen-reader or Reduce Motion detection.
    const refresh = async () => {
      const generation = ++refreshGeneration;
      await Promise.all(observers.map((observer) => observer.read()));
      // A foreground refresh can supersede the startup read. Readiness belongs
      // to the latest refresh, just as values belong to the latest query/event.
      if (active && generation === refreshGeneration) setLoaded(true);
    };
    void refresh();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });

    return () => {
      active = false;
      appStateSubscription.remove();
      observers.forEach((observer) => observer.remove());
    };
  }, []);

  return {
    screenReaderEnabled,
    reduceMotionEnabled,
    boldTextEnabled,
    highTextContrastEnabled,
    darkerSystemColorsEnabled,
    reduceTransparencyEnabled,
    detectionStatus,
    loaded,
  };
}
