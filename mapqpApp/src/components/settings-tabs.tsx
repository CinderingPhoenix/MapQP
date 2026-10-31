import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";

export default function SettingsTabs({ active }: { active: "general" | "accessibility" }) {
  const { fontSize } = useSettings();
  const { boldTextEnabled } = useAccessibilityPreferences();
  const { from, accessibilityVisited } = useLocalSearchParams<{
    from?: string; accessibilityVisited?: string;
  }>();

  return <View style={styles.tabs} accessibilityRole="tablist">
    {(["general", "accessibility"] as const).map((tab) => {
      const selected = active === tab;
      const label = tab === "general" ? "General" : "Accessibility";
      return <TouchableOpacity key={tab} accessibilityRole="tab"
        accessibilityLabel={label} accessibilityState={{ selected }}
        style={[styles.tab, selected && styles.selectedTab]}
        onPress={() => {
          if (selected) return;
          // Replace the current settings tab, leaving the original caller below it.
          router.replace({
            pathname: tab === "general" ? "/settings" : "/accessibility-settings",
            params: {
              ...(from ? { from } : {}),
              settingsTab: "true",
              ...((active === "accessibility" || accessibilityVisited === "true")
                ? { accessibilityVisited: "true" } : {}),
            },
          });
        }}>
        <Text style={[styles.label, { fontSize: 18 * fontSize },
          boldTextEnabled && styles.bold, selected && styles.selectedLabel]}>
          {label}
        </Text>
      </TouchableOpacity>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", borderWidth: 2, borderColor: "#8C1426", borderRadius: 12,
    padding: 4, gap: 4, backgroundColor: "#FFF2F3", marginBottom: 24 },
  tab: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 6, paddingVertical: 12,
    justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "transparent", borderRadius: 8 },
  selectedTab: { backgroundColor: "#8C1426", borderColor: "#171717" },
  label: { color: "#641020", textAlign: "center", flexShrink: 1, fontWeight: "500" },
  bold: { fontWeight: "700" },
  selectedLabel: { color: "#FFFFFF", fontWeight: "800", textDecorationLine: "underline" },
});
