import { colorVisionPresentation, type ColorVisionPreset } from "./color-vision-palettes";

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

export function darkSettingsTokens(preset: ColorVisionPreset, increased: boolean) {
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
export type SettingsTokens = ReturnType<typeof darkSettingsTokens>;
type ColorRules = Readonly<Record<string, Partial<Record<"color" | "backgroundColor" | "borderColor" | "borderBottomColor" | "borderLeftColor", keyof SettingsTokens>>>>;

// Explicit style roles. No color inversion or changes to the legacy adapter.
export const STANDARD_SETTINGS_ROLES: ColorRules = {
  container: { backgroundColor: "background" }, tabs: { borderBottomColor: "separator" },
  tabSelected: { borderBottomColor: "accent" }, modeGroup: { backgroundColor: "surface" },
  choice: { backgroundColor: "raised", borderColor: "outline" },
  choiceSelected: { backgroundColor: "primary", borderColor: "accent" },
  preferenceRow: { borderBottomColor: "separator" }, preferenceBlock: { borderBottomColor: "separator" },
  switchRow: { borderBottomColor: "separator" }, deviceBadge: { backgroundColor: "raised", borderColor: "outline" },
  switchOn: { backgroundColor: "primary" }, switchOff: { backgroundColor: "off" },
  switchReadOnly: { borderColor: "outline" }, switchThumb: { backgroundColor: "thumb" },
  homeAction: { backgroundColor: "surface", borderColor: "outline" }, homeActionContrast: { borderColor: "outline" },
  routeInfo: { borderLeftColor: "outline" }, disabled: { backgroundColor: "raised" },
  modalOverlay: { backgroundColor: "scrim" }, opaqueOverlay: { backgroundColor: "backdrop" },
  modalPanel: { backgroundColor: "surface", borderColor: "outline" }, modalHeading: { color: "text" },
};
export const ACCESSIBLE_SETTINGS_ROLES: ColorRules = {
  container: { backgroundColor: "background" }, homeAction: { backgroundColor: "surface", borderColor: "outline" },
  homeActionContrast: { borderColor: "outline" }, expandedHeader: { backgroundColor: "tint", borderBottomColor: "accent" },
  collapseButton: { backgroundColor: "surface", borderColor: "outline" }, panel: { backgroundColor: "surface", borderColor: "outline" },
  strongPanel: { borderColor: "outline" }, strongBoundary: { borderColor: "outline" },
  divider: { backgroundColor: "separator" }, importantDivider: { backgroundColor: "outline" }, strongDivider: { backgroundColor: "outline" },
  choice: { backgroundColor: "raised", borderColor: "outline" }, selected: { backgroundColor: "primary", borderColor: "accent" },
  back: { backgroundColor: "surface", borderColor: "outline" }, track: { borderColor: "outline" },
  trackOn: { backgroundColor: "primary", borderColor: "accent" }, trackOff: { backgroundColor: "off" },
  thumb: { backgroundColor: "thumb" }, sizeButton: { borderColor: "outline" }, sliderRail: { backgroundColor: "outline" },
  strongRail: { backgroundColor: "outline" }, sliderThumb: { backgroundColor: "thumb", borderColor: "background" },
};

export function settingsPresentation(value: unknown, increased = false, appearance: ResolvedTheme = "light") {
  const legacy = colorVisionPresentation(value, increased);
  const tokens = darkSettingsTokens(legacy.preset, increased);
  const dark = appearance === "dark";
  // Artwork owns its original foreground/background pair. Appearance may theme
  // the surrounding surface, but only a color-vision preset may recolor artwork.
  const iconColors = (background: string, foreground: string) => {
    if (legacy.preset === "default") return { background, foreground };
    const fill = legacy.color(background, "backgroundColor");
    const ink = legacy.color(foreground, "iconColor");
    if (!dark) return { background: fill, foreground: ink };
    return {
      background: fill === legacy.palette.tint ? tokens.tint : tokens.primary,
      foreground: ink === legacy.palette.primary ? tokens.accent : ink,
    };
  };
  const color = <T extends string | undefined>(source: T, role = "color"): T => {
    if (!dark) return legacy.color(source, role);
    // Dark callers supply semantic tokens; artwork/control fills explicitly opt in.
    if (role === "borderColor" || role === "borderBottomColor") return tokens.outline as T;
    if (role === "backgroundColor" && source !== "transparent") return tokens.primary as T;
    return source;
  };
  const styles = <T>(original: T, rules: ColorRules = {}): T => {
    if (!dark) return legacy.styles(original);
    return Object.fromEntries(Object.entries(original as object).map(([name, style]) => [name, {
      ...style as object,
      ...Object.fromEntries(Object.entries(rules[name] ?? {}).map(([property, token]) => [property, tokens[token]])),
    }])) as T;
  };
  const colors = <T extends Record<string, string>>(original: T): T => {
    if (!dark) return legacy.colors(original, { accent: "accentText" });
    const roles: Record<string, string> = {
      background: tokens.background, panel: tokens.surface, heading: tokens.text, ink: tokens.text,
      muted: tokens.secondary, status: tokens.secondary, secondary: tokens.secondary,
      accent: tokens.accent, divider: tokens.separator, importantDivider: tokens.outline,
      outline: tokens.outline, contrastOutline: tokens.outline, contrastInk: tokens.text,
      off: tokens.off, disabled: tokens.raised, danger: tokens.dangerText,
    };
    return Object.fromEntries(Object.entries(original).map(([key, v]) => [key, roles[key] ?? v])) as T;
  };
  return { ...legacy, dark, tokens, color, styles, colors, iconColors,
    palette: dark ? { ...legacy.palette, background: tokens.background, surface: tokens.surface,
      text: tokens.text, secondaryText: tokens.secondary, primary: tokens.primary, onPrimary: tokens.onSelected,
      outline: tokens.outline, tint: tokens.tint, off: tokens.off, disabledSurface: tokens.raised,
      danger: tokens.dangerText } : legacy.palette,
    textColor: <T extends string | undefined>(source: T, role: "accentText" | "highlightedHeading"): T =>
      dark ? tokens.accent as T : legacy.textColor(source, role),
    settingsBackground: (source: string) => dark ? tokens.background : legacy.settingsBackground(source),
    readOnlyStatus: dark ? { surface: tokens.raised, outline: tokens.outline, text: tokens.text } : legacy.readOnlyStatus,
  };
}
