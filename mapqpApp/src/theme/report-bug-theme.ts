import { darkThemeTokens, type ResolvedTheme } from "./app-theme";
import type { ColorVisionPreset } from "./color-vision-palettes";

/** Report-owned paint only. Light deliberately retains its existing, non-preset styling. */
export function reportBugPresentation(preset: ColorVisionPreset, increased: boolean, appearance: ResolvedTheme) {
  const dark = appearance === "dark";
  const t = darkThemeTokens(preset, increased);
  const accent = increased ? t.text : t.accent;
  type Paint = Partial<Record<"color" | "backgroundColor" | "borderColor" | "borderTopColor", string>>;
  const roles: Record<string, Paint> = {
    container: { backgroundColor: t.background },
    backText: { color: accent }, bugTile: { backgroundColor: t.tint },
    title: { color: t.text }, label: { color: t.text }, body: { color: t.text },
    meta: { color: t.secondary }, noticeTitle: { color: t.text },
    notice: { backgroundColor: t.surface, borderColor: t.outline },
    fieldSection: { borderTopColor: t.outline }, actions: { borderTopColor: t.outline },
    highContrastText: { color: t.text }, highContrastBorder: { borderColor: t.outline },
    categoryGroup: { backgroundColor: t.surface, borderColor: t.outline },
    categorySeparator: { borderTopColor: t.outline },
    selectedCategory: { backgroundColor: t.tint, borderColor: accent, borderTopColor: accent },
    selectedCategoryContrast: { backgroundColor: t.tint, borderColor: t.outline },
    radio: { backgroundColor: t.surface, borderColor: t.outline },
    contrastRadio: { borderColor: t.outline }, radioSelected: { borderColor: accent },
    radioDot: { backgroundColor: accent },
    input: { backgroundColor: t.surface, color: t.text, borderColor: t.outline },
    invalidInput: { borderColor: t.dangerText }, error: { color: t.dangerText },
    checkButton: { backgroundColor: t.primary, borderColor: t.outline },
    submitButton: { backgroundColor: t.primary, borderColor: t.outline },
    checkButtonText: { color: t.onSelected }, submitButtonText: { color: t.onSelected },
    submitButtonDisabled: { backgroundColor: t.raised, borderColor: t.outline },
    submitButtonTextDisabled: { color: t.secondary },
  };
  return {
    dark, tokens: t,
    accent: dark ? accent : "#741B2B",
    categoryIcon: dark ? accent : "#805563",
    error: dark ? t.dangerText : "#B42332",
    placeholder: dark ? t.secondary : "#70655F",
    styles: <T extends object>(light: T): T => dark
      ? Object.fromEntries(Object.entries(light).map(([name, value]) => [name, { ...value, ...roles[name] }])) as T
      : light,
  };
}
