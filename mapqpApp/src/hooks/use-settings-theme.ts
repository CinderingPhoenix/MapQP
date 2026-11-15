import { useMemo } from "react";
import { useColorScheme } from "react-native";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "./use-accessibility-preferences";
import { resolveTheme, settingsPresentation, STANDARD_SETTINGS_ROLES, ACCESSIBLE_SETTINGS_ROLES } from "../theme/settings-theme";

// Only Settings consumers opt in. Other screens keep useColorVisionPalette.
export function useSettingsPalette() {
  const { themePreference, colorVisionPreset } = useSettings();
  const system = useColorScheme();
  const { darkerSystemColorsEnabled, highTextContrastEnabled } = useAccessibilityPreferences();
  const increased = darkerSystemColorsEnabled || highTextContrastEnabled;
  const theme = resolveTheme(themePreference, system);
  return useMemo(() => settingsPresentation(colorVisionPreset, increased, theme), [colorVisionPreset, increased, theme]);
}
export function useSettingsStyles<T>(styles: T, appearance: "standard" | "accessible" = "accessible"): T {
  const theme = useSettingsPalette();
  return useMemo(() => theme.styles(styles, appearance === "standard" ? STANDARD_SETTINGS_ROLES : ACCESSIBLE_SETTINGS_ROLES), [theme, styles, appearance]);
}
export function useSettingsColors<T extends Record<string, string>>(colors: T): T {
  const theme = useSettingsPalette();
  return useMemo(() => theme.colors(colors), [theme, colors]);
}
