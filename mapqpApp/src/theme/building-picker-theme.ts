import { darkThemeTokens, type ResolvedTheme } from "./app-theme";
import type { ColorVisionPreset } from "./color-vision-palettes";

/** Picker-owned presentation only. Light styles have already passed through the legacy preset adapter. */
export function buildingPickerPresentation(preset: ColorVisionPreset, increased: boolean, appearance: ResolvedTheme) {
  const dark = appearance === "dark";
  const mono = preset === "achromatopsia";
  const t = darkThemeTokens(preset, increased);
  const accent = increased ? t.text : preset === "default" ? "#72C8CA" : t.accent;
  const tint = preset === "default" ? "#203638" : t.tint;
  const colors = {
    text: t.text, secondary: t.secondary, outline: t.outline, accent,
    selected: mono ? t.primary : tint, onSelected: mono ? t.onSelected : accent,
    inputSelected: t.raised, primary: t.primary, onPrimary: t.onSelected,
    saved: mono ? t.text : preset === "default" ? "#F1C40F" : t.accent,
    icon: t.secondary, danger: t.dangerText,
    listening: tint, listeningInk: accent,
  };
  type Paint = Partial<Record<"color" | "backgroundColor" | "borderColor" | "borderBottomColor", string>>;
  const roles: Record<string, Paint> = {
    container: { backgroundColor: t.surface }, accessibilityContainer: { backgroundColor: t.surface },
    secondaryControlCircle: { backgroundColor: t.raised, borderColor: t.outline },
    accessibilityControlLabel: { color: t.text },
    voiceControl: { backgroundColor: t.primary }, voiceControlListening: { backgroundColor: tint },
    voiceControlLabel: { color: t.onSelected },
    input: { backgroundColor: t.raised, borderColor: t.outline, color: t.text },
    cancelButtonText: { color: t.secondary },
    dropdown: { backgroundColor: t.surface, borderColor: t.outline },
    dropdownHeader: { backgroundColor: t.raised, borderBottomColor: t.separator },
    dropdownHeaderText: { color: t.secondary },
    listeningActiveContainer: { backgroundColor: tint, borderColor: t.outline },
    listeningActiveText: { color: accent },
    buildingSelectorButton: { backgroundColor: tint, borderColor: t.outline },
    buildingSelectorText: { color: accent }, clearRecentText: { color: t.dangerText },
    buildingRow: { borderBottomColor: t.separator },
    buildingRowSelected: { backgroundColor: colors.selected }, buildingRowText: { color: t.text },
    buildingRowTextSelected: { color: colors.onSelected }, emptyStateText: { color: t.secondary },
    selectorModal: { backgroundColor: t.background },
    selectorHeader: { backgroundColor: t.surface, borderBottomColor: t.separator },
    selectorTitle: { color: accent }, selectorClose: { color: t.secondary },
    modalTabs: { backgroundColor: t.raised, borderBottomColor: t.separator },
    modalTabActive: { backgroundColor: t.surface, borderBottomColor: accent },
    modalTabText: { color: t.secondary }, modalTabTextActive: { color: accent },
  };
  return { dark, colors, tokens: t,
    color: (light: string | undefined, role: keyof typeof colors) => dark ? colors[role] : light,
    styles: <T extends object>(light: T): T => dark ? Object.fromEntries(Object.entries(light).map(([name, value]) =>
      [name, { ...value, ...roles[name] }])) as T : light,
  };
}
