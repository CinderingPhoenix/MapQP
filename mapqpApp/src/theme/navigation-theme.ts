import { darkThemeTokens, type ResolvedTheme } from "./app-theme";
import type { ColorVisionPreset } from "./color-vision-palettes";

/** Shared control/overlay paint only. The legacy Light path remains authoritative. */
export function navigationPresentation(preset: ColorVisionPreset, increased: boolean, appearance: ResolvedTheme) {
  const dark = appearance === "dark";
  const t = darkThemeTokens(preset, increased);
  const mono = preset === "achromatopsia";
  const warning = {
    surface: mono ? t.raised : "#382F1F",
    text: increased ? t.text : mono ? t.text : "#FFDC9A",
    outline: increased ? t.outline : mono ? t.outline : "#D6B574",
  };
  const controls = {
    background: t.background, surface: t.surface, raised: t.raised, icon: increased ? t.text : t.accent,
    disabledIcon: t.secondary, outline: t.outline, selected: t.tint,
    text: t.text, secondary: t.secondary, danger: t.dangerText, focus: t.focus,
    compassNorth: increased ? t.text : t.accent,
    compassSouth: increased ? t.text : preset === "default" ? "#72C8CA" : t.secondary,
  };
  type Paint = Partial<Record<"color" | "backgroundColor" | "borderColor", string>>;
  const roles: Record<string, Paint> = {
    panel: { backgroundColor: t.surface, borderColor: t.outline },
    button: { backgroundColor: t.surface, borderColor: t.outline },
    disabled: { backgroundColor: t.raised, borderColor: t.outline },
  };
  return {
    dark, tokens: t, controls, warning,
    // No map, route or camera state belongs in this serializable payload.
    mapUI: { dark, colors: controls },
    noticeStyle: dark ? { color: warning.text, backgroundColor: warning.surface } : undefined,
    styles: <T extends object>(light: T): T => dark
      ? Object.fromEntries(Object.entries(light).map(([name, value]) => [name, { ...value, ...roles[name] }])) as T
      : light,
  };
}

/** Screen-owned panels and directions. Separate from shared-control paint so
 * opting in a screen cannot change the Stage 1 components or legacy Light UI. */
export function navigationScreenPresentation(preset: ColorVisionPreset, increased: boolean, appearance: ResolvedTheme) {
  const { dark, tokens: t } = navigationPresentation(preset, increased, appearance);
  const colors = {
    text: t.text, secondary: t.secondary, outline: t.outline, surface: t.surface,
    divider: t.outline, error: t.dangerText,
    navigationAccent: increased ? t.text : preset === "default" ? "#72C8CA" : t.accent,
  };
  type Paint = Partial<Record<"color" | "backgroundColor" | "borderColor" | "borderBottomColor", string>>;
  const roles: Record<string, Paint> = {
    container: { backgroundColor: t.background },
    mapCanvas: { backgroundColor: t.background },
    plannerPanel: { backgroundColor: t.surface, borderColor: t.outline },
    topRouteSummary: { backgroundColor: t.surface, borderColor: t.outline },
    boldText: { color: colors.navigationAccent },
    highlightedHeading: { color: colors.navigationAccent },
    subText: { color: t.secondary },
    directionInstruction: { color: t.text },
    directionItem: { borderBottomColor: colors.divider },
    progressBarBackground: { backgroundColor: t.raised },
    progressBarFill: { backgroundColor: colors.navigationAccent },
    recenterButton: { backgroundColor: t.primary, borderColor: t.outline },
    recenterText: { color: t.onSelected },
    // A high-contrast danger fill supplies the boundary without adding borders
    // or changing the Accessible screen's existing button dimensions.
    cancelRouteButton: { backgroundColor: increased ? t.text : t.dangerText },
    cancelRouteButtonText: { color: t.dangerSurface },
    errorText: { color: colors.error },
  };
  return {
    dark, colors,
    color: (light: string, role: keyof typeof colors) => dark ? colors[role] : light,
    styles: <T extends object>(light: T): T => dark
      ? Object.fromEntries(Object.entries(light).map(([name, value]) => [name, { ...value, ...roles[name] }])) as T
      : light,
  };
}
