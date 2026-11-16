import type { ResolvedTheme } from "./app-theme";
import type { ColorVisionPreset } from "./color-vision-palettes";
import { navigationPresentation } from "./navigation-theme";

/** Does not own modal lifecycle, focus, or the user's answer. */
export function routeAlternativePresentation(preset: ColorVisionPreset, increased: boolean, appearance: ResolvedTheme, opaque: boolean) {
  const { dark, tokens: t, warning } = navigationPresentation(preset, increased, appearance);
  type Paint = Partial<Record<"color" | "backgroundColor" | "borderColor", string>> & { borderWidth?: number };
  const roles: Record<string, Paint> = {
    overlay: { backgroundColor: opaque ? t.backdrop : "rgba(0,0,0,0.7)" },
    card: { backgroundColor: t.surface },
    heading: { color: increased ? t.text : t.accent },
    text: { color: t.text },
    warning: { backgroundColor: warning.surface, borderColor: warning.outline },
    warningTitle: { color: warning.text },
    cancel: { backgroundColor: t.surface, borderColor: t.outline },
    cancelText: { color: increased ? t.text : t.accent },
    accept: { backgroundColor: t.primary, borderColor: t.outline, borderWidth: 2 },
    acceptText: { color: t.onSelected },
  };
  return {
    styles: <T extends object>(light: T): T => dark
      ? Object.fromEntries(Object.entries(light).map(([name, value]) => [name, { ...value, ...roles[name] }])) as T
      : light,
  };
}
