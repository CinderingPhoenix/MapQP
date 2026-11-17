import { useMemo } from "react";
import { useAppTheme } from "./use-app-theme";
import { settingsPresentation, STANDARD_SETTINGS_ROLES, ACCESSIBLE_SETTINGS_ROLES } from "../theme/settings-theme";

// Only Settings consumers opt in. Other screens keep useColorVisionPalette.
export function useSettingsPalette() {
  const { preset, increased, resolvedTheme } = useAppTheme();
  return useMemo(() => settingsPresentation(preset, increased, resolvedTheme), [preset, increased, resolvedTheme]);
}
export function useSettingsStyles<T>(styles: T, appearance: "standard" | "accessible" = "accessible"): T {
  const theme = useSettingsPalette();
  return useMemo(() => theme.styles(styles, appearance === "standard" ? STANDARD_SETTINGS_ROLES : ACCESSIBLE_SETTINGS_ROLES), [theme, styles, appearance]);
}
export function useSettingsColors<T extends Record<string, string>>(colors: T): T {
  const theme = useSettingsPalette();
  return useMemo(() => theme.colors(colors), [theme, colors]);
}
