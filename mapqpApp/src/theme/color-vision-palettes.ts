export const COLOR_VISION_OPTIONS = [
  { value: "default", label: "Default", description: "Original MapQP colors" },
  { value: "protanopia", label: "Protanopia", description: "Red-green color blindness (reduced red sensitivity)" },
  { value: "deuteranopia", label: "Deuteranopia", description: "Red-green color blindness (reduced green sensitivity)" },
  { value: "tritanopia", label: "Tritanopia", description: "Blue-yellow color blindness" },
  { value: "achromatopsia", label: "Monochromacy", description: "High-contrast grayscale controls for people with limited or no color perception." },
] as const;
export type ColorVisionPreset = typeof COLOR_VISION_OPTIONS[number]["value"];
export function isColorVisionPreset(value: unknown): value is ColorVisionPreset {
  return COLOR_VISION_OPTIONS.some(option => option.value === value);
}
export function restoreColorVisionPreset(value: unknown): ColorVisionPreset {
  return isColorVisionPreset(value) ? value : "default";
}
export type ColorVisionTextRole = "accentText" | "highlightedHeading";
export type ColorVisionTextRoles = Readonly<Record<string, ColorVisionTextRole>>;

export type ColorVisionPalette = {
  background: string; surface: string; text: string; secondaryText: string;
  primary: string; onPrimary: string; outline: string; tint: string;
  off: string; disabledSurface: string; danger: string;
};
const neutral = { surface: "#FFFFFF", onPrimary: "#FFFFFF", off: "#514B48", disabledSurface: "#DAD6D0", danger: "#B42332" };
// Default is intentionally NOT used to recolor existing surfaces. Their own
// burgundy/teal palettes remain authoritative. Accent swatches are not borders.
export const COLOR_VISION_PALETTES: Record<ColorVisionPreset, ColorVisionPalette> = {
  default: { ...neutral, background: "#F7F6F2", text: "#000000", secondaryText: "#3D3733", primary: "#741B2B", outline: "#686868", tint: "#F5ECEE" },
  protanopia: { ...neutral, background: "#F2F5F8", text: "#192A37", secondaryText: "#546269", primary: "#293FAE", outline: "#52606E", tint: "#EDF0FB" },
  deuteranopia: { ...neutral, background: "#F2F6F8", text: "#1A2B37", secondaryText: "#556269", primary: "#1D43AE", outline: "#52606E", tint: "#EDF1FB" },
  tritanopia: { ...neutral, background: "#F3F5FA", text: "#222840", secondaryText: "#5A606F", primary: "#007A00", outline: "#58616D", tint: "#EEF5EE" },
  achromatopsia: { ...neutral, background: "#F2F5F8", text: "#111111", secondaryText: "#444444", primary: "#222222", outline: "#595959", tint: "#EEEEEE", off: "#595959", disabledSurface: "#EEEEEE", danger: "#222222" },
};

const accents = new Set(["#741b2b", "#761723", "#ac2b37", "#64101e", "#65101d", "#1d5962", "#10434b", "#26785c", "#175e49", "#245b8f", "#65418c", "#286341", "#6848a0", "#075e68", "#064c52", "#087f8c", "#40256f", "#7950b2", "#f1c40f", "#805500", "#007aff", "#30d158", "#c45100"]);
const whites = new Set(["white", "#fff", "#ffffff", "#fffdf8"]);
const secondary = new Set(["#555", "#555555", "#666", "#777", "#888", "#444", "#686868", "#636366", "#3d3733", "#425466", "#595959", "#6b7280", "#374151", "#4b5563", "#7a7a7a"]);
const surfaces = new Set(["#f7f6f2", "#faf8f4", "#f3f5f8", "#f7f7f7", "#f9f9f9", "#f1f3f4"]);
const disabled = new Set(["#dad6d0", "#e0ddd7", "#e5e5e5", "#e0e0e0", "#d9dddf", "#ccc", "#aaa"]);
const tints = new Set(["#f5ecee", "#f4dde2", "#f4e0e3", "#f9e5e7", "#fbeff1", "#eaf1f8", "#eaf3ed", "#f1ebf7", "#e8f4f5", "#f4fafb", "#eee", "#eeece5", "#f0eeea", "#e9e7df", "#ddf3eb", "#f2faf6", "#f7f3fd", "#ede7f8", "#b8d1d4"]);
const danger = new Set(["red", "#d9534f", "#d00000", "#b42332", "#b42318", "#b32635", "#801f29", "#8a211c", "#801a12"]);

/** Scoped adapter for existing native color roles; never traverses React trees,
 * changes geometry, or reaches the WebView/map. Default is an exact identity. */
export function colorVisionPresentation(value: unknown, increased = false) {
  const preset = restoreColorVisionPreset(value);
  const base = COLOR_VISION_PALETTES[preset];
  const monochrome = preset === "achromatopsia";
  const accessibleBase = preset === "default" || monochrome ? base : { ...base, disabledSurface: "#EEECE8" };
  const palette = increased ? { ...accessibleBase, background: "#FFFFFF", text: "#000000", secondaryText: "#000000", outline: monochrome ? "#222222" : "#272423", off: "#454545" } : accessibleBase;
  function color<T extends string | undefined>(source: T, role = "color"): T {
    if (preset === "default" || source === undefined) return source;
    const hex = source.toLowerCase();
    // Only known accent/semantic foregrounds opt into grayscale. Ordinary ink
    // stays owned by the screen; faint secondary grays are the contrast exception.
    if (monochrome) {
      if (role === "shadowColor" || hex === "transparent") return source;
      if (role === "color" || role === "iconColor") {
        if (accents.has(hex) || danger.has(hex) || ["#8f1c28", "#885000", "#603800"].includes(hex)) return palette.primary as T;
        if (["#777", "#777777", "#888", "#888888", "#7a7a7a"].includes(hex)) return "#595959" as T;
        return source;
      }
      if (danger.has(hex) || hex === "#8f1c28") return palette.primary as T;
      if (["#885000", "#603800"].includes(hex)) return palette.outline as T;
      if (hex === "#fff4e5") return palette.tint as T;
      if (hex.startsWith("rgba")) {
        // Preserve alpha and overlay behavior, not the decorative hue.
        return source.replace(/rgba\([^,]+,[^,]+,[^,]+,/, "rgba(34,34,34,") as T;
      }
      if (["#85858f", "#272423", "#81756e", "#70655f", "#b9b1aa", "#bcb8b4"].includes(hex)) return palette.outline as T;
    }
    if (role === "color") return source; // other presets preserve every foreground
    if (hex === "transparent" || hex.startsWith("rgba") || role === "shadowColor") return source;
    if (whites.has(hex)) return palette.surface as T;
    if (danger.has(hex) || ["#885000", "#603800", "#fff4e5"].includes(hex)) return source;
    if (hex === "#8f1c28") return source; // existing destructive pressed state
    if (role.toLowerCase().includes("border")) return palette.outline as T;
    if (role === "backgroundColor" || role === "ios_backgroundColor") {
      if (accents.has(hex)) return palette.primary as T;
      if (secondary.has(hex) || hex === "#514b48") return palette.off as T;
      if (disabled.has(hex)) return palette.disabledSurface as T;
      if (surfaces.has(hex)) return palette.background as T;
      if (tints.has(hex)) return palette.tint as T;
      return source; // retain semantic warning surfaces
    }
    // Foreground text is owned by each screen, including its contrast overrides.
    // Only explicitly marked decorative/control icons adopt the accent.
    if (role === "iconColor" && accents.has(hex)) return palette.primary as T;
    return source;
  }
  // Opt-in roles only: never infer informational text roles from its hue.
  function textColor<T extends string | undefined>(source: T, role: ColorVisionTextRole): T {
    if (source === undefined || preset === "default" || monochrome) return color(source);
    return (role === "accentText" || role === "highlightedHeading" ? palette.primary : source) as T;
  }
  // Explicit non-semantic control fill, even when its original hue was red.
  function controlSurface(source: string) {
    return monochrome ? color(source, "backgroundColor") : preset === "default" ? source : palette.primary;
  }
  // Standard Settings keeps its established background; other surfaces retain
  // their existing contrast handling. Monochromacy is an exact legacy path.
  function settingsBackground(source: string) {
    return monochrome ? color(source, "backgroundColor") : preset === "default" ? source : base.background;
  }
  const readOnlyStatus = { surface: "#E0E0E0", outline: "#686868", text: "#000000" };
  function styles<T>(original: T, textRoles: ColorVisionTextRoles = {}): T {
    if (preset === "default") return original;
    return Object.fromEntries(Object.entries(original as object).map(([name, style]) => [name, name === "mapCanvas" || (!monochrome && /warning|danger|error|destructive|cancelRoute/i.test(name)) ? style :
      Object.fromEntries(Object.entries(style as object).map(([key, v]) => [key,
        typeof v === "string" && (key === "color" || key.endsWith("Color")) ? (key === "color" && textRoles[name] ? textColor(v, textRoles[name]) : monochrome && key === "backgroundColor" && name === "choice" ? palette.surface : color(v, key)) : v]))])) as T;
  }
  function colors<T extends Record<string, string>>(original: T, textRoles: ColorVisionTextRoles = {}): T {
    if (preset === "default") return original;
    // Preserve ordinary ink tokens. Monochromacy alone neutralizes known
    // accent/semantic tokens; other presets keep all existing foregrounds.
    const roles: Record<string, string> = { background: palette.background, panel: palette.surface, card: palette.surface,
      selected: palette.primary, onSelected: palette.onPrimary, off: palette.off, disabled: palette.disabledSurface,
      ...(monochrome ? { accent: palette.primary, danger: palette.primary, outline: palette.outline, contrastOutline: palette.outline, importantDivider: palette.outline } : {}) };
    return Object.fromEntries(Object.entries(original).map(([key, v]) => [key, textRoles[key] ? textColor(v, textRoles[key]) : roles[key] ?? color(v, key.toLowerCase().includes("divider") ? "borderColor" : "color")])) as T;
  }
  return { preset, monochrome, palette, increased, color, textColor, controlSurface, settingsBackground, readOnlyStatus, styles, colors };
}

export function colorVisionDialogSize(width: number, height: number, insets: { left: number; right: number; top: number; bottom: number }) {
  return { width: Math.min(Math.max(0, width - insets.left - insets.right) * 0.9, 520),
    maxHeight: Math.max(0, height - insets.top - insets.bottom - 32) };
}
