import type { RoutingPreferences } from "../utils/routing";
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
export type SettingsAppearance = "standard" | "accessible";
export type NavigationMode = "standard" | "accessibility";
export type AccessibilityNeed = "visual" | "motor";

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

type AppSettings = AccessibilitySettings & RoutingPreferences & {
  settingsAppearance: SettingsAppearance;
  navigationMode: NavigationMode;
  accessibilityNeed: AccessibilityNeed | null;
  hasSelectedMode: boolean;
  distanceUnits: DistanceUnits;
  directionStyle: DirectionStyle;
  avoidStairs: boolean;
  hasAnsweredAvoidStairsPrompt: boolean;
  fontSize: number;
  repeatGuidanceEnabled: boolean;
  repeatGuidanceSeconds: number;
  accessibilitySettingsVersion: 5;
  colorVisionPreset: ColorVisionPresets;
};

type SettingsContextType = AppSettings & {
  setSettingsAppearance: (appearance: SettingsAppearance) => void;
  setNavigationMode: (mode: NavigationMode) => void;
  setAccessibilityNeed: (need: AccessibilityNeed) => void;
  setHasSelectedMode: (selected: boolean) => void;
  setDistanceUnits: (units: DistanceUnits) => void;
  setDirectionStyle: (style: DirectionStyle) => void;
  setFontSize: (size: number) => void;
  setRepeatGuidanceEnabled: (enabled: boolean) => void;
  setRepeatGuidanceSeconds: (seconds: number) => void;
  setAvoidStairs: (enabled: boolean) => void;
  settingsLoaded: boolean;
  settingsReadSucceeded: boolean;
  configureAvoidStairs: (enabled: boolean) => Promise<void>;
  configureRoutingPreferences: (preferences: Partial<RoutingPreferences>) => Promise<void>;
  resetAvoidStairsPreference: () => void;
  deviceAccessibility: DeviceAccessibilitySettings;
  setAccessibilityPreference: (preference: AccessibilityPreference, enabled: boolean) => void;
  resetAccessibilitySettings: () => void;
  setColorVisionPreset: (preset: ColorVisionPresets) => void;
};

const SETTINGS_STORAGE_KEY = "mapqp_settings";

const DEFAULT_SETTINGS: AppSettings = {
  settingsAppearance: "standard",
  navigationMode: "standard",
  accessibilityNeed: null,
  hasSelectedMode: false,
  distanceUnits: "imperial",
  directionStyle: "natural",
  avoidStairs: false,
  avoidIndoorRoutes: false,
  avoidInaccessibleCrosswalks: false,
  hasAnsweredAvoidStairsPrompt: false,
  fontSize: 1,
  repeatGuidanceEnabled: true,
  repeatGuidanceSeconds: 9,
  accessibilitySettingsVersion: 5,
  customAccessibilityPreferences: DEFAULT_CUSTOM_ACCESSIBILITY,
  colorVisionPreset: "default",
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
  const [settingsAppearance, setSettingsAppearance] = useState<SettingsAppearance>(DEFAULT_SETTINGS.settingsAppearance);
  const [navigationMode, setNavigationModeState] = useState<NavigationMode>(
    DEFAULT_SETTINGS.navigationMode
  );
  // Public calls represent an explicit choice, including reselecting the same mode.
  // Restoration below uses the raw state setter to preserve manual appearance overrides.
  const setNavigationMode = (mode: NavigationMode) => {
    setNavigationModeState(mode);
    if (mode === "accessibility") setSettingsAppearance("accessible");
  };

  const [colorVisionPreset, setColorVisionPreset] = useState<ColorVisionPresets> (DEFAULT_SETTINGS.colorVisionPreset);

  const [accessibilityNeed, setAccessibilityNeed] = useState<AccessibilityNeed | null>(null);

  const [hasSelectedMode, setHasSelectedMode] = useState(
    DEFAULT_SETTINGS.hasSelectedMode
  );

  const [distanceUnits, setDistanceUnits] = useState<DistanceUnits>(
    DEFAULT_SETTINGS.distanceUnits
  );

  const [directionStyle, setDirectionStyle] = useState<DirectionStyle>(
    DEFAULT_SETTINGS.directionStyle
  );

  const [routingPreference, setRoutingPreference] = useState({
    avoidStairs: false, avoidIndoorRoutes: false, avoidInaccessibleCrosswalks: false, hasAnsweredAvoidStairsPrompt: false, revision: 0,
  });
  const { avoidStairs, avoidIndoorRoutes, avoidInaccessibleCrosswalks } = routingPreference;
  const avoidStairsEdit = useRef<boolean | undefined>(undefined);
  const choiceRevision = useRef(0);
  const pendingChoices = useRef(new Map<number, { resolve: () => void; reject: (error: unknown) => void; previouslyAnswered: boolean }>());
  const pendingChoice = pendingChoices.current.get(routingPreference.revision);
  const hasAnsweredAvoidStairsPrompt = pendingChoice
    ? pendingChoice.previouslyAnswered : routingPreference.hasAnsweredAvoidStairsPrompt;
  const setAvoidStairs = (enabled: boolean) => {
    avoidStairsEdit.current = enabled;
    setRoutingPreference((previous) => ({ ...previous, avoidStairs: enabled }));
  };
  const configureAvoidStairs = (enabled: boolean) => configureRoutingPreferences({ avoidStairs: enabled });
  const configureRoutingPreferences = (preferences: Partial<RoutingPreferences>): Promise<void> => {
    if (!settingsLoaded || !settingsReadSucceeded) return Promise.reject(new Error("Settings are not ready. Please try again."));
    const revision = ++choiceRevision.current;
    avoidStairsEdit.current = preferences.avoidStairs ?? avoidStairs;
    const completion = new Promise<void>((resolve, reject) => pendingChoices.current.set(revision, { resolve, reject, previouslyAnswered: hasAnsweredAvoidStairsPrompt }));
    setRoutingPreference((previous) => ({ ...previous, ...preferences, hasAnsweredAvoidStairsPrompt: true, revision }));
    return completion;
  };
  const resetAvoidStairsPreference = () => {
    avoidStairsEdit.current = false;
    setRoutingPreference({ avoidStairs: false, avoidIndoorRoutes: false, avoidInaccessibleCrosswalks: false, hasAnsweredAvoidStairsPrompt: false, revision: ++choiceRevision.current });
  };
  const [repeatGuidanceEnabled, setRepeatGuidanceEnabled] = useState(DEFAULT_SETTINGS.repeatGuidanceEnabled);
  const [repeatGuidanceSeconds, setRepeatGuidanceSeconds] = useState(DEFAULT_SETTINGS.repeatGuidanceSeconds);
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

          if (parsedSettings.settingsAppearance === "standard" || parsedSettings.settingsAppearance === "accessible") {
            setSettingsAppearance(parsedSettings.settingsAppearance);
          }

          if (typeof parsedSettings.repeatGuidanceEnabled === "boolean") {
            setRepeatGuidanceEnabled(parsedSettings.repeatGuidanceEnabled);
          }
          if ([5, 9, 15, 30, 60].includes(parsedSettings.repeatGuidanceSeconds ?? 0)) {
            setRepeatGuidanceSeconds(parsedSettings.repeatGuidanceSeconds!);
          }
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
            setNavigationModeState(parsedSettings.navigationMode);
          }

          if (parsedSettings.accessibilityNeed === "visual" || parsedSettings.accessibilityNeed === "motor") {
            setAccessibilityNeed(parsedSettings.accessibilityNeed);
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

          if (typeof parsedSettings.avoidStairs === "boolean" && avoidStairsEdit.current === undefined) {
            setRoutingPreference({
              avoidStairs: parsedSettings.avoidStairs,
              avoidIndoorRoutes: parsedSettings.avoidIndoorRoutes === true,
              avoidInaccessibleCrosswalks: parsedSettings.avoidInaccessibleCrosswalks === true,
              hasAnsweredAvoidStairsPrompt: typeof parsedSettings.hasAnsweredAvoidStairsPrompt === "boolean"
                ? parsedSettings.hasAnsweredAvoidStairsPrompt
                : parsedSettings.hasAnsweredAvoidStairsPrompt === undefined,
              revision: 0,
            });
          }

          if (typeof parsedSettings.avoidStairs !== "boolean" && avoidStairsEdit.current === undefined &&
              typeof parsedSettings.hasAnsweredAvoidStairsPrompt === "boolean") {
            setRoutingPreference({ avoidStairs: false, avoidIndoorRoutes: parsedSettings.avoidIndoorRoutes === true, avoidInaccessibleCrosswalks: parsedSettings.avoidInaccessibleCrosswalks === true, hasAnsweredAvoidStairsPrompt: parsedSettings.hasAnsweredAvoidStairsPrompt, revision: 0 });
          }

          if (
            typeof parsedSettings.fontSize === "number" &&
            parsedSettings.fontSize >= 0.8 &&
            parsedSettings.fontSize <= 1.8
          ) {
            setFontSize(parsedSettings.fontSize);
          }

          if (isColorVisionPreset(parsedSettings.colorVisionPreset)) {
            setColorVisionPreset(parsedSettings.colorVisionPreset);
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
      settingsAppearance,
      navigationMode,
      accessibilityNeed,
      hasSelectedMode,
      distanceUnits,
      directionStyle,
      avoidStairs,
      avoidIndoorRoutes,
      avoidInaccessibleCrosswalks,
      hasAnsweredAvoidStairsPrompt: routingPreference.hasAnsweredAvoidStairsPrompt,
      fontSize,
      repeatGuidanceEnabled,
      repeatGuidanceSeconds,
      colorVisionPreset,
      accessibilitySettingsVersion: 5,
      ...accessibilitySettings,
    };
    // Capture this render's snapshot and serialize writes so an older save
    // cannot finish after a newer preference change.
    const revision = routingPreference.revision;
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await SecureStore.setItemAsync(
          SETTINGS_STORAGE_KEY,
          JSON.stringify(settings)
        );
        let acknowledgedChoice = false;
        for (const [pendingRevision, pending] of pendingChoices.current) {
          // React may batch rapid choices into one render. The saved latest
          // snapshot supersedes any earlier choice that had no separate render.
          if (pendingRevision <= revision) {
            pending.resolve();
            pendingChoices.current.delete(pendingRevision);
            acknowledgedChoice = true;
          }
        }
        if (acknowledgedChoice) {
          setRoutingPreference((previous) => previous.revision === revision ? { ...previous } : previous);
        }
      } catch (error) {
        console.error("Failed to save settings:", error);
        let failedChoice = false;
        let previouslyAnswered = false;
        for (const [pendingRevision, pending] of pendingChoices.current) {
          if (pendingRevision <= revision) {
            previouslyAnswered = pending.previouslyAnswered;
            pending.reject(error);
            pendingChoices.current.delete(pendingRevision);
            failedChoice = true;
          }
        }
        if (failedChoice) {
          // A failed answer remains eligible. Its caller keeps the dialog open for retry.
          setRoutingPreference((previous) => previous.revision === revision
            ? { ...previous, hasAnsweredAvoidStairsPrompt: previouslyAnswered } : previous);
        }
      }
    });
  }, [
    settingsAppearance,
    navigationMode,
    accessibilityNeed,
    hasSelectedMode,
    distanceUnits,
    directionStyle,
    avoidStairs,
    routingPreference,
    fontSize,
    repeatGuidanceEnabled,
    repeatGuidanceSeconds,
    settingsLoaded,
    settingsReadSucceeded,
    accessibilitySettings,
  ]);

  return (
    <SettingsContext.Provider
      value={{
        settingsAppearance,
        setSettingsAppearance,
        navigationMode,
        accessibilityNeed,
        setAccessibilityNeed,
        hasSelectedMode,
        distanceUnits,
        directionStyle,
        avoidStairs,
        avoidIndoorRoutes,
        avoidInaccessibleCrosswalks,
        setAvoidStairs,
        hasAnsweredAvoidStairsPrompt,
        configureAvoidStairs,
        configureRoutingPreferences,
        resetAvoidStairsPreference,
        settingsReadSucceeded,
        fontSize,
      repeatGuidanceEnabled,
      repeatGuidanceSeconds,
        setNavigationMode,
        setHasSelectedMode,
        setDistanceUnits,
        setDirectionStyle,
        setFontSize,
        setRepeatGuidanceEnabled,
        setRepeatGuidanceSeconds,
        settingsLoaded,
        accessibilitySettingsVersion: 5,
        ...accessibilitySettings,
        deviceAccessibility,
        setAccessibilityPreference,
        resetAccessibilitySettings,
        colorVisionPreset,
        setColorVisionPreset,
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

export type ColorVisionPresets = "default" | "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";

function isColorVisionPreset (value: unknown ): value is ColorVisionPresets {
  return ( value === "default" || value === "protanopia" || value === "deuteranopia" || value === "tritanopia" || value === "achromatopsia" ); }