import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Platform,
} from "react-native";

export type DeviceAccessibilitySettings = {
  screenReaderEnabled: boolean;
  reduceMotionEnabled: boolean;
  boldTextEnabled: boolean;
  highTextContrastEnabled: boolean;
  darkerSystemColorsEnabled: boolean;
  reduceTransparencyEnabled: boolean;
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

  useEffect(() => {
    let active = true;
    let refreshGeneration = 0;

    // Subscribe before querying. A newer event or query invalidates an older
    // asynchronous result, so startup reads cannot overwrite live changes.
    const observeSetting = (
      event: BooleanAccessibilityEvent,
      query: () => Promise<boolean>,
      setValue: (value: boolean) => void,
    ) => {
      let revision = 0;
      const subscription = AccessibilityInfo.addEventListener(event, (value) => {
        revision += 1;
        if (active) setValue(value);
      });

      return {
        read: async () => {
          const queryRevision = ++revision;
          try {
            const value = await query();
            if (active && queryRevision === revision) setValue(value);
          } catch (error) {
            console.warn(`Unable to read device accessibility setting ${event}:`, error);
          }
        },
        remove: () => subscription.remove(),
      };
    };

    const observers = [
      observeSetting("screenReaderChanged", () => AccessibilityInfo.isScreenReaderEnabled(), setScreenReaderEnabled),
      observeSetting("reduceMotionChanged", () => AccessibilityInfo.isReduceMotionEnabled(), setReduceMotionEnabled),
    ];

    if (Platform.OS === "ios") {
      observers.push(
        observeSetting("boldTextChanged", () => AccessibilityInfo.isBoldTextEnabled(), setBoldTextEnabled),
        observeSetting("darkerSystemColorsChanged", () => AccessibilityInfo.isDarkerSystemColorsEnabled(), setDarkerSystemColorsEnabled),
        observeSetting("reduceTransparencyChanged", () => AccessibilityInfo.isReduceTransparencyEnabled(), setReduceTransparencyEnabled),
      );
    } else if (Platform.OS === "android") {
      observers.push(
        observeSetting("highTextContrastChanged", () => AccessibilityInfo.isHighTextContrastEnabled(), setHighTextContrastEnabled),
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
    loaded,
  };
}
