import { useMemo } from "react";
import { useColorScheme } from "react-native";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "./use-accessibility-preferences";
import { darkThemeTokens, resolveTheme } from "../theme/app-theme";

/** One persisted preference and one live system subscription; screens opt in. */
export function useAppTheme() {
  const { themePreference, colorVisionPreset: preset, settingsLoaded } = useSettings();
  const system = useColorScheme();
  const preferences = useAccessibilityPreferences();
  const increased = preferences.darkerSystemColorsEnabled || preferences.highTextContrastEnabled;
  const resolvedTheme = resolveTheme(themePreference, system);
  return useMemo(() => ({ preset, increased, resolvedTheme, dark: resolvedTheme === "dark",
    ready: settingsLoaded && preferences.loaded,
    opaque: increased || preferences.reduceTransparencyEnabled,
    tokens: darkThemeTokens(preset, increased),
  }), [preset, increased, resolvedTheme, settingsLoaded, preferences.loaded, preferences.reduceTransparencyEnabled]);
}
