import { darkThemeTokens, type ResolvedTheme } from "./app-theme";
import { colorVisionPresentation } from "./color-vision-palettes";

type Overrides = Record<string, Record<string, string | number>>;
/** Named presentation roles only. Never transforms image assets or geometry. */
export function landingPresentation(preset: unknown, increased: boolean, appearance: ResolvedTheme, opaque = false) {
  const legacy = colorVisionPresentation(preset, increased);
  const t = darkThemeTokens(legacy.preset, increased);
  const dark = appearance === "dark", original = !dark && legacy.preset === "default";
  const primary = dark ? t.primary : legacy.palette.primary;
  const accent = dark ? t.accent : legacy.palette.primary;
  const teal = legacy.preset === "default" ? "#72C8CA" : accent;
  const accessSurface = legacy.preset === "default" ? "#203638" : t.tint;
  const ink = dark ? t.text : "#172033";
  const outline = dark ? t.outline : legacy.palette.outline;
  const map = <T>(base: T, roles: Overrides): T => Object.fromEntries(Object.entries(base as object)
    .map(([name, value]) => [name, { ...value as object, ...roles[name] }])) as T;
  const landing: Overrides = dark ? {
    container: { backgroundColor: t.background }, mapBackground: { backgroundColor: t.background },
    header: { backgroundColor: t.surface, borderBottomColor: accent },
    quickActions: { backgroundColor: t.surface, borderColor: outline },
    quickActionsHighContrast: { backgroundColor: t.surface, borderColor: outline },
    quickActionDivider: { backgroundColor: outline }, quickActionText: { color: ink },
    presetLabel: { backgroundColor: t.surface, borderLeftColor: outline, borderRightColor: outline },
    presetLabelHighContrast: { backgroundColor: t.surface, borderLeftColor: outline, borderRightColor: outline,
      borderTopColor: outline, borderBottomColor: outline },
    presetText: { color: ink }, highContrastHeading: { color: ink },
    standardModeButton: { borderColor: increased ? outline : accent },
    accessibilityModeButton: { borderColor: increased ? outline : teal },
    standardTitle: { color: ink }, accessibilityTitle: { color: ink },
    standardDescription: { color: t.secondary }, accessibilityDescription: { color: t.secondary },
    standardAccent: { backgroundColor: accent }, accessibilityAccent: { backgroundColor: teal },
  } : {};
  if (legacy.preset !== "default") Object.assign(landing, {
    standardIcon: { backgroundColor: primary }, accessibilityIcon: { backgroundColor: primary },
    ...(!dark ? { standardModeButton: { borderColor: primary }, accessibilityModeButton: { borderColor: primary },
      standardTitle: { color: primary }, accessibilityTitle: { color: primary },
      standardDescription: { color: "#172033" }, accessibilityDescription: { color: "#172033" },
      standardAccent: { backgroundColor: primary }, accessibilityAccent: { backgroundColor: primary },
      header: { borderBottomColor: primary } } : {}),
  });
  const tutorial: Overrides = dark ? {
    tutorialCard: { backgroundColor: t.surface }, footer: { backgroundColor: t.surface, borderTopColor: outline },
    headerTitle: { color: ink }, title: { color: ink }, topicTitle: { color: ink },
    description: { color: t.secondary }, subtitle: { color: accent }, skipText: { color: accent },
    tabs: { backgroundColor: t.raised }, topicButton: { backgroundColor: t.raised },
    tabText: { color: ink }, activeTab: { backgroundColor: primary },
    bugReportButton: { backgroundColor: primary }, nextButtonFull: { backgroundColor: primary, shadowColor: primary },
    nextButtonHalf: { backgroundColor: primary, shadowColor: primary }, backButton: { backgroundColor: t.raised },
    backButtonText: { color: ink }, contrastBorder: { borderColor: outline },
    bugReportSection: { borderTopColor: outline }, imageContainer: { backgroundColor: t.raised, borderColor: outline },
    highlightTag: { backgroundColor: t.surface, borderColor: outline }, highlightTagText: { color: ink },
    yellowHighlightBox: { borderColor: accent, backgroundColor: "transparent" },
    progressSegment: { backgroundColor: outline }, filledSegment: { backgroundColor: accent },
    opaqueOverlay: { backgroundColor: t.backdrop },
    // Keep Default icon artwork readable without recoloring it.
    topicIcon: { backgroundColor: legacy.preset === "default" ? "#F1F5F9" : t.tint, borderRadius: 8 },
  } : {};
  if (!dark && !original) Object.assign(tutorial, {
    activeTab: { backgroundColor: primary }, bugReportButton: { backgroundColor: primary },
    nextButtonFull: { backgroundColor: primary, shadowColor: primary }, nextButtonHalf: { backgroundColor: primary, shadowColor: primary },
    subtitle: { color: primary }, skipText: { color: primary }, filledSegment: { backgroundColor: primary },
    ...(legacy.monochrome ? { yellowHighlightBox: { borderColor: primary, backgroundColor: "transparent" },
      highlightTag: { borderColor: outline }, highlightTagText: { color: primary },
      tabs: { backgroundColor: "#EEEEEE" }, topicButton: { backgroundColor: "#EEEEEE" },
      backButton: { backgroundColor: "#EEEEEE" }, imageContainer: { backgroundColor: "#EEEEEE", borderColor: outline },
      progressSegment: { backgroundColor: "#CCCCCC" }, footer: { borderTopColor: outline } } : {}),
  });
  const prompt: Overrides = {
    card: { backgroundColor: t.surface }, title: { color: accent }, text: { color: ink },
    preferenceRow: { borderBottomColor: outline }, button: { backgroundColor: primary },
    saving: { borderColor: outline },
    ...(opaque ? { overlay: { backgroundColor: t.backdrop } } : {}),
  };
  return { dark, original, tokens: t, primary, accent, ink, outline,
    utilityIcon: original ? "#172033" : dark ? ink : legacy.monochrome ? "#222222" : legacy.palette.text,
    topicIcon: legacy.preset === "default" ? "#AC2B37" : accent,
    scrim: dark ? legacy.monochrome ? "rgba(24,24,24,0.42)" : "rgba(24,24,28,0.42)" : "transparent",
    controlOff: dark ? t.off : legacy.color("#636366", "backgroundColor"),
    controlIosOff: dark ? t.off : legacy.color("#636366", "ios_backgroundColor"),
    landingStyles: <T>(base: T): T => original ? base : map(base, landing),
    tutorialStyles: <T>(base: T): T => original ? base : map(base, tutorial),
    promptStyles: <T>(base: T): T => dark ? map(base, prompt) : legacy.styles(base, { title: "highlightedHeading" }),
    gradient: (mode: "standard" | "accessibility", solid: boolean): readonly [string, string] => {
      if (dark) { const fill = mode === "standard" ? t.tint : accessSurface; return [fill, fill]; }
      if (!original) return [legacy.palette.tint, legacy.palette.tint];
      return mode === "standard" ? solid ? ["#FFF5F5", "#F9E5E7"] : ["rgba(255,245,245,0.96)", "rgba(249,229,231,0.96)"]
        : solid ? ["#F1FAF9", "#DDF2F0"] : ["rgba(241,250,249,0.96)", "rgba(221,242,240,0.96)"];
    },
  };
}
