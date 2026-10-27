import * as SecureStore from "expo-secure-store";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDeviceAccessibility, type DeviceAccessibilitySettings } from "../hooks/use-device-accessibility";

export type DistanceUnits = "imperial" | "metric";
export type DirectionStyle = "natural" | "degrees";
export type NavigationMode = "standard" | "accessibility";

export type CustomAccessibilityPreferences = {
  reduceMotionEnabled: boolean;
  boldTextEnabled: boolean;
  increaseContrastEnabled: boolean;
  reduceTransparencyEnabled: boolean;
};

export type AccessibilityPreference = keyof CustomAccessibilityPreferences;

export const DEFAULT_CUSTOM_ACCESSIBILITY: CustomAccessibilityPreferences = {
  reduceMotionEnabled: false,
  boldTextEnabled: false,
  increaseContrastEnabled: false,
  reduceTransparencyEnabled: false,
};

const ACCESSIBILITY_PREFERENCES = Object.keys(DEFAULT_CUSTOM_ACCESSIBILITY) as AccessibilityPreference[];

type AccessibilitySettings = {
  customAccessibilityPreferences: CustomAccessibilityPreferences;
};

function readBooleans(value: unknown): Partial<CustomAccessibilityPreferences> {
  const restored: Partial<CustomAccessibilityPreferences> = {};
  if (value && typeof value === "object") {
    for (const key of ACCESSIBILITY_PREFERENCES) {
      const saved = (value as Record<string, unknown>)[key];
      if (typeof saved === "boolean") restored[key] = saved;
    }
  }
  return restored;
}

export function restoreAccessibilitySettings(value: unknown): AccessibilitySettings {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const customAccessibilityPreferences = {
    ...DEFAULT_CUSTOM_ACCESSIBILITY,
    ...readBooleans(saved.customAccessibilityPreferences),
  };
  // Current schemas preserve the custom bank, including dormant selections.
  // Only legacy schemas read their old active snapshots or per-setting modes.
  if (saved.accessibilitySettingsVersion !== 5 && saved.accessibilitySettingsVersion !== 4) {
    if (saved.accessibilitySettingsVersion === 3) {
      Object.assign(customAccessibilityPreferences, readBooleans(saved.accessibilityPreferences));
    } else if (saved.accessibilitySettingsVersion === 2 || saved.accessibilityPreferenceModes !== undefined) {
      const modes = saved.accessibilityPreferenceModes;
      if (modes && typeof modes === "object") {
        for (const key of ACCESSIBILITY_PREFERENCES) {
          const mode = (modes as Record<string, unknown>)[key];
          if (mode === "on" || mode === "off") customAccessibilityPreferences[key] = mode === "on";
        }
      }
    }
  }
  return { customAccessibilityPreferences };
}

type AppSettings = AccessibilitySettings & {
  navigationMode: NavigationMode;
  hasSelectedMode: boolean;
  distanceUnits: DistanceUnits;
  directionStyle: DirectionStyle;
  fontSize: number;
  accessibilitySettingsVersion: 5;
};

type SettingsContextType = AppSettings & {
  setNavigationMode: (mode: NavigationMode) => void;
  setHasSelectedMode: (selected: boolean) => void;
  setDistanceUnits: (units: DistanceUnits) => void;
  setDirectionStyle: (style: DirectionStyle) => void;
  setFontSize: (size: number) => void;
  settingsLoaded: boolean;
  deviceAccessibility: DeviceAccessibilitySettings;
  setAccessibilityPreference: (preference: AccessibilityPreference, enabled: boolean) => void;
  resetAccessibilitySettings: () => void;
};

const SETTINGS_STORAGE_KEY = "mapqp_settings";

const DEFAULT_SETTINGS: AppSettings = {
  navigationMode: "standard",
  hasSelectedMode: false,
  distanceUnits: "imperial",
  directionStyle: "natural",
  fontSize: 1,
  accessibilitySettingsVersion: 5,
  customAccessibilityPreferences: DEFAULT_CUSTOM_ACCESSIBILITY,
};

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const deviceAccessibility = useDeviceAccessibility();
  const [accessibilitySettings, setAccessibilitySettings] = useState<AccessibilitySettings>({
    customAccessibilityPreferences: DEFAULT_CUSTOM_ACCESSIBILITY,
  });
  const accessibilityEdits = useRef<Partial<CustomAccessibilityPreferences>>({});
  const [settingsReadSucceeded, setSettingsReadSucceeded] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const setAccessibilityPreference = (preference: AccessibilityPreference, enabled: boolean) => {
    accessibilityEdits.current = { ...accessibilityEdits.current, [preference]: enabled };
    setAccessibilitySettings((previous) => ({
      ...previous,
      customAccessibilityPreferences: { ...previous.customAccessibilityPreferences, [preference]: enabled },
    }));
  };
  const resetAccessibilitySettings = () => {
    accessibilityEdits.current = { ...DEFAULT_CUSTOM_ACCESSIBILITY };
    setAccessibilitySettings({
      customAccessibilityPreferences: { ...DEFAULT_CUSTOM_ACCESSIBILITY },
    });
    setSettingsReadSucceeded(true);
  };
  const [navigationMode, setNavigationMode] = useState<NavigationMode>(
    DEFAULT_SETTINGS.navigationMode
  );

  const [hasSelectedMode, setHasSelectedMode] = useState(
    DEFAULT_SETTINGS.hasSelectedMode
  );

  const [distanceUnits, setDistanceUnits] = useState<DistanceUnits>(
    DEFAULT_SETTINGS.distanceUnits
  );

  const [directionStyle, setDirectionStyle] = useState<DirectionStyle>(
    DEFAULT_SETTINGS.directionStyle
  );

  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize);

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      try {
        const savedSettings = await SecureStore.getItemAsync(
          SETTINGS_STORAGE_KEY
        );

        if (!active) return;
        if (savedSettings) {
          const parsedSettings: Partial<AppSettings> =
            JSON.parse(savedSettings) ?? {};

          const accessibility = restoreAccessibilitySettings(parsedSettings);
          setAccessibilitySettings({
            customAccessibilityPreferences: {
              ...accessibility.customAccessibilityPreferences, ...accessibilityEdits.current,
            },
          });

          if (
            parsedSettings.navigationMode === "standard" ||
            parsedSettings.navigationMode === "accessibility"
          ) {
            setNavigationMode(parsedSettings.navigationMode);
          }

          if (typeof parsedSettings.hasSelectedMode === "boolean") {
            setHasSelectedMode(parsedSettings.hasSelectedMode);
          }

          if (
            parsedSettings.distanceUnits === "imperial" ||
            parsedSettings.distanceUnits === "metric"
          ) {
            setDistanceUnits(parsedSettings.distanceUnits);
          }

          if (
            parsedSettings.directionStyle === "natural" ||
            parsedSettings.directionStyle === "degrees"
          ) {
            setDirectionStyle(parsedSettings.directionStyle);
          }

          if (
            typeof parsedSettings.fontSize === "number" &&
            parsedSettings.fontSize >= 0.8 &&
            parsedSettings.fontSize <= 1.8
          ) {
            setFontSize(parsedSettings.fontSize);
          }
        }
        setSettingsReadSucceeded(true);
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        if (active) setSettingsLoaded(true);
      }
    };

    void loadSettings();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!settingsLoaded || !settingsReadSucceeded) {
      return;
    }

    const settings: AppSettings = {
      navigationMode,
      hasSelectedMode,
      distanceUnits,
      directionStyle,
      fontSize,
      accessibilitySettingsVersion: 5,
      ...accessibilitySettings,
    };
    // Capture this render's snapshot and serialize writes so an older save
    // cannot finish after a newer preference change.
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await SecureStore.setItemAsync(
          SETTINGS_STORAGE_KEY,
          JSON.stringify(settings)
        );
      } catch (error) {
        console.error("Failed to save settings:", error);
      }
    });
  }, [
    navigationMode,
    hasSelectedMode,
    distanceUnits,
    directionStyle,
    fontSize,
    settingsLoaded,
    settingsReadSucceeded,
    accessibilitySettings,
  ]);

  return (
    <SettingsContext.Provider
      value={{
        navigationMode,
        hasSelectedMode,
        distanceUnits,
        directionStyle,
        fontSize,
        setNavigationMode,
        setHasSelectedMode,
        setDistanceUnits,
        setDirectionStyle,
        setFontSize,
        settingsLoaded,
        accessibilitySettingsVersion: 5,
        ...accessibilitySettings,
        deviceAccessibility,
        setAccessibilityPreference,
        resetAccessibilitySettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error(
      "useSettings must be used inside a SettingsProvider"
    );
  }

  return context;
}
