import { useMemo } from "react";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "./use-accessibility-preferences";
import { colorVisionPresentation, type ColorVisionTextRoles } from "../theme/color-vision-palettes";

export function useColorVisionPalette() {
  const { colorVisionPreset } = useSettings();
  const { darkerSystemColorsEnabled, highTextContrastEnabled } = useAccessibilityPreferences();
  const increased = darkerSystemColorsEnabled || highTextContrastEnabled;
  return useMemo(() => colorVisionPresentation(colorVisionPreset, increased), [colorVisionPreset, increased]);
}
export function useColorVisionStyles<T>(styles: T, textRoles?: ColorVisionTextRoles): T {
  const vision = useColorVisionPalette();
  return useMemo(() => vision.styles(styles, textRoles), [vision, styles, textRoles]);
}
export function useColorVisionColors<T extends Record<string, string>>(colors: T, textRoles?: ColorVisionTextRoles): T {
  const vision = useColorVisionPalette();
  return useMemo(() => vision.colors(colors, textRoles), [vision, colors, textRoles]);
}
