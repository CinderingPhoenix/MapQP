import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
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

export function useDeviceAccessibility(): DeviceAccessibilitySettings {
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [boldTextEnabled, setBoldTextEnabled] = useState(false);
  const [highTextContrastEnabled, setHighTextContrastEnabled] = useState(false);
  const [darkerSystemColorsEnabled, setDarkerSystemColorsEnabled] = useState(false);
  const [reduceTransparencyEnabled, setReduceTransparencyEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadAccessibilitySettings = async () => {
      try {
        const screenReader = await AccessibilityInfo.isScreenReaderEnabled();
        const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();

        setScreenReaderEnabled(screenReader);
        setReduceMotionEnabled(reduceMotion);

        if (Platform.OS === "ios") {
          const [boldText, darkerColors, reduceTransparency] =
            await Promise.all([
              AccessibilityInfo.isBoldTextEnabled(),
              AccessibilityInfo.isDarkerSystemColorsEnabled(),
              AccessibilityInfo.isReduceTransparencyEnabled(),
            ]);

          setBoldTextEnabled(boldText);
          setDarkerSystemColorsEnabled(darkerColors);
          setReduceTransparencyEnabled(reduceTransparency);
        }

        if (Platform.OS === "android") {
          const highContrast =
            await AccessibilityInfo.isHighTextContrastEnabled();

          setHighTextContrastEnabled(highContrast);
        }
      } catch (error) {
        console.warn(
          "Unable to read device accessibility settings:",
          error
        );
      } finally {
        setLoaded(true);
      }
    };

    void loadAccessibilitySettings();

    const screenReaderSubscription =
      AccessibilityInfo.addEventListener(
        "screenReaderChanged",
        setScreenReaderEnabled
      );

    const reduceMotionSubscription =
      AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReduceMotionEnabled
      );

    const darkerSystemColorsSubscription =
      AccessibilityInfo.addEventListener(
        "darkerSystemColorsChanged",
        setDarkerSystemColorsEnabled
      );

    const boldTextSubscription =
      AccessibilityInfo.addEventListener(
        "boldTextChanged",
        setBoldTextEnabled
      );

    
    const reduceTransparencySubscription =
      AccessibilityInfo.addEventListener(
        "reduceTransparencyChanged",
        setReduceTransparencyEnabled
      );

    return () => {
      screenReaderSubscription.remove();
      reduceMotionSubscription.remove();
      darkerSystemColorsSubscription.remove();
      boldTextSubscription.remove();
      reduceTransparencySubscription.remove();
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