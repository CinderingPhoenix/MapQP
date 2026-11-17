import { useState, type ComponentRef, type RefObject } from "react";
import { Text, TouchableOpacity, View, StyleSheet, useWindowDimensions } from "react-native";
import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSettings } from "../../context/settings-context";
import { useSettingsPalette } from "../../hooks/use-settings-theme";
import { useAccessibilityPreferences } from "../../hooks/use-accessibility-preferences";
import { THEME_OPTIONS } from "../../theme/settings-theme";
import { ColorVisionDialog } from "./color-vision-setting";

type Trigger = ComponentRef<typeof TouchableOpacity>;
export function SettingsStatusBar() {
  const focused = useIsFocused();
  const { dark } = useSettingsPalette();
  // Remove the override on blur; never set the application's global Appearance.
  return focused ? <StatusBar style={dark ? "light" : "dark"} animated={false} /> : null;
}

export function ThemeSetting({ onPress, triggerRef }: { onPress: () => void; triggerRef: RefObject<Trigger | null> }) {
  const { themePreference, settingsLoaded, settingsReadSucceeded, fontSize } = useSettings();
  const vision = useSettingsPalette();
  const { boldTextEnabled } = useAccessibilityPreferences();
  const [focused, setFocused] = useState(false);
  const disabled = !settingsLoaded || !settingsReadSucceeded;
  const label = THEME_OPTIONS.find(option => option.value === themePreference)?.label ?? "Light";
  const ink = vision.dark ? vision.tokens.text : "#000000";
  const accent = vision.textColor("#741B2B", "accentText");
  return <TouchableOpacity ref={triggerRef} onPress={onPress} disabled={disabled} activeOpacity={1}
    accessible accessibilityRole="button" accessibilityLabel={`App appearance, ${label}`}
    accessibilityHint="Opens Light, Dark, and System Default. Does not change Settings layout or navigation mode."
    accessibilityState={{ disabled }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={[s.row, { borderBottomColor: vision.dark ? vision.tokens.separator : "#D0CDC9" },
      disabled && { borderStyle: "dashed" }, focused && { borderWidth: 2, borderColor: vision.dark ? vision.tokens.focus : accent }]}>
    <Text accessible={false} allowFontScaling style={{ fontSize: 17 * fontSize, lineHeight: Math.ceil(24 * fontSize), flexShrink: 1,
      color: ink, fontWeight: boldTextEnabled ? "900" : "500" }}>App appearance</Text>
    <View style={s.value} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text allowFontScaling style={{ fontSize: 17 * fontSize, lineHeight: Math.ceil(24 * fontSize), flexShrink: 1,
        color: disabled ? ink : accent, fontWeight: boldTextEnabled ? "900" : "600" }}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={accent} allowFontScaling={false} />
    </View>
  </TouchableOpacity>;
}

export function ThemeChoices() {
  const { fontScale } = useWindowDimensions();
  const { themePreference, setThemePreference, settingsLoaded, settingsReadSucceeded, fontSize } = useSettings();
  const vision = useSettingsPalette();
  const { boldTextEnabled } = useAccessibilityPreferences();
  const [focused, setFocused] = useState<string | null>(null);
  const disabled = !settingsLoaded || !settingsReadSucceeded;
  const stacked = fontSize * fontScale >= 1.35;
  const ink = vision.dark ? vision.tokens.text : "#211E1C";
  const secondary = vision.dark ? vision.tokens.secondary : "#3D3733";
  const accent = vision.textColor("#741B2B", "accentText");
  return <View accessibilityRole="radiogroup" accessibilityLabel="App appearance" style={s.choices}>
    {THEME_OPTIONS.map(option => {
      const selected = themePreference === option.value;
      return <TouchableOpacity key={option.value} accessible accessibilityRole="radio" activeOpacity={1}
        accessibilityLabel={`${option.label}. ${option.description}`} accessibilityState={{ checked: selected, disabled }}
        accessibilityHint="Changes the app appearance only. Settings layout and navigation mode stay unchanged."
        disabled={disabled} onPress={() => setThemePreference(option.value)}
        onFocus={() => setFocused(option.value)} onBlur={() => setFocused(null)}
        style={[s.choice, stacked && { flexDirection: "column", alignItems: "flex-start" }, {
          backgroundColor: vision.dark ? (selected ? vision.tokens.tint : vision.tokens.raised) : selected ? vision.color("#741B2B", "backgroundColor") : vision.palette.surface,
          borderColor: focused === option.value && vision.dark ? vision.tokens.focus : selected ? accent : vision.dark ? vision.tokens.outline : vision.palette.outline,
          borderWidth: focused === option.value ? 3 : 2, borderStyle: disabled ? "dashed" : "solid",
        }]}>
        {selected && <MaterialCommunityIcons name="check" size={24} color="#FFFFFF" accessible={false}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />}
        <View style={[s.copy, stacked && { flex: 0, width: "100%" }]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text allowFontScaling style={{ fontSize: 22 * fontSize, lineHeight: Math.ceil(30 * fontSize),
            color: selected ? "#FFFFFF" : ink, fontWeight: boldTextEnabled ? "900" : "600" }}>{option.label}</Text>

        </View>
      </TouchableOpacity>;
    })}
    {disabled && <Text allowFontScaling style={{ fontSize: 18 * fontSize, lineHeight: Math.ceil(27 * fontSize), color: secondary }}>
      {!settingsLoaded ? "Loading saved preferences. Please wait." : "Saved preferences could not be loaded. Theme editing is unavailable."}
    </Text>}
  </View>;
}

export function SettingsThemeDialog(props: { visible: boolean; onClose: () => void; triggerRef: RefObject<Trigger | null> }) {
  // Reuse the existing safe-area, scrolling, dismissal and focus lifecycle.
  return <ColorVisionDialog {...props} selection="theme" />;
}

const s = StyleSheet.create({
  row: { minHeight: 56, paddingVertical: 10, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  value: { maxWidth: "55%", flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  choices: { gap: 8 }, choice: { minHeight: 56, minWidth: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    flexDirection: "row", alignItems: "center", gap: 12 }, copy: { flex: 1, minWidth: 0, gap: 8 },
});
