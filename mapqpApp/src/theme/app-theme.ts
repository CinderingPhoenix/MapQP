import type { ColorVisionPreset } from "./color-vision-palettes";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export const THEME_OPTIONS = [
  { value: "light", label: "Light", description: "Always use the light appearance." },
  { value: "dark", label: "Dark", description: "Always use the dark appearance." },
  { value: "system", label: "System Default", description: "Follows your device’s appearance." },
] as const;

export function restoreThemePreference(value: unknown): ThemePreference {
  return value === "dark" || value === "system" ? value : "light";
}
export function resolveTheme(preference: ThemePreference, system: string | null | undefined): ResolvedTheme {
  return preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
}

const DARK_ACCENTS: Record<ColorVisionPreset, { primary: string; accent: string; tint: string }> = {
  default: { primary: "#741B2B", accent: "#F6B2C3", tint: "#3E2A32" },
  protanopia: { primary: "#293FAE", accent: "#9DB5FF", tint: "#252E49" },
  deuteranopia: { primary: "#1D43AE", accent: "#ABC0FF", tint: "#252F48" },
  tritanopia: { primary: "#007A00", accent: "#80D895", tint: "#203527" },
  achromatopsia: { primary: "#444444", accent: "#E6E6E6", tint: "#333333" },
};

export function darkThemeTokens(preset: ColorVisionPreset, increased: boolean) {
  const mono = preset === "achromatopsia";
  return {
    ...DARK_ACCENTS[preset],
    background: mono ? "#181818" : "#18181C",
    surface: mono ? "#242424" : "#242428",
    raised: mono ? "#303030" : "#303036",
    text: increased ? "#FFFFFF" : mono ? "#F5F5F5" : "#F5F5F7",
    secondary: increased ? "#FFFFFF" : mono ? "#C7C7C7" : "#C7C7CF",
    outline: increased ? "#FFFFFF" : mono ? "#8D8D8D" : "#8D8D98",
    separator: increased ? (mono ? "#8D8D8D" : "#8D8D98") : mono ? "#555555" : "#555560",
    onSelected: "#FFFFFF", thumb: "#FFFFFF", off: mono ? "#686868" : "#686870",
    dangerText: mono ? "#E6E6E6" : "#FFB4AB",
    dangerSurface: mono ? "#333333" : "#382323",
    dangerPressed: mono ? "#444444" : "#4B2828",
    backdrop: mono ? "#111111" : "#111114", scrim: "rgba(0,0,0,0.65)",
    focus: "#FFFFFF",
  };
}
