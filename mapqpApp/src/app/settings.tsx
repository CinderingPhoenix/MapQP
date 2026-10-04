import Slider from "@react-native-community/slider";
import { router } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/settings-context";

export default function SettingsPage() {
  const {
    navigationMode,
    setNavigationMode,
    setHasSelectedMode,
    distanceUnits,
    setDistanceUnits,
    directionStyle,
    setDirectionStyle,
    fontSize,
    setFontSize,
  } = useSettings();

  const changeNavigationMode = (
    mode: "standard" | "accessibility"
  ) => {
    setNavigationMode(mode);

    if (mode === "standard") {
      router.replace("/standard-navigation");
    } else {
      router.replace("/accessibility-navigation");
    }
  };

  const returnToLandingPage = () => {
    setHasSelectedMode(false);
    router.replace("/landing-page");
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={[styles.backArrow, { fontSize: 38 * fontSize }]}>‹</Text>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { fontSize: 21 * fontSize }]}>Settings</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation Mode */}
        <Text style={[styles.sectionLabel, { fontSize: 12 * fontSize }]}>NAVIGATION MODE</Text>

        <View style={styles.settingsCard}>
        <View style={styles.optionRow}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontSize }]}>Navigation mode</Text>

            <View style={styles.segmentedControl}>
            <TouchableOpacity
                style={[
                styles.segmentButton,
                navigationMode === "standard" && styles.segmentButtonSelected,
                ]}
                onPress={() => changeNavigationMode("standard")}
            >
                <Text
                style={[
                    styles.segmentText,
                    { fontSize: 13 * fontSize },
                    navigationMode === "standard" && styles.segmentTextSelected,
                ]}
                >
                Standard
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[
                styles.segmentButton,
                navigationMode === "accessibility" && styles.segmentButtonSelected,
                ]}
                onPress={() => changeNavigationMode("accessibility")}
            >
                <Text
                style={[
                    styles.segmentText,
                    { fontSize: 13 * fontSize },
                    navigationMode === "accessibility" && styles.segmentTextSelected,
                ]}
                >
                Accessible
                </Text>
            </TouchableOpacity>
            </View>
        </View>
        </View>

        {/* Navigation Preferences */}
        <Text style={[styles.sectionLabel, { fontSize: 12 * fontSize }]}>NAVIGATION PREFERENCES</Text>

        <View style={styles.settingsCard}>
        <View style={styles.optionRow}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontSize }]}>Distance units</Text>

            <View style={styles.segmentedControl}>
            <TouchableOpacity
                style={[
                styles.segmentButton,
                distanceUnits === "imperial" && styles.segmentButtonSelected,
                ]}
                onPress={() => setDistanceUnits("imperial")}
            >
                <Text
                style={[
                    styles.segmentText,
                    { fontSize: 13 * fontSize },
                    distanceUnits === "imperial" && styles.segmentTextSelected,
                ]}
                >
                ft / mi
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[
                styles.segmentButton,
                distanceUnits === "metric" && styles.segmentButtonSelected,
                ]}
                onPress={() => setDistanceUnits("metric")}
            >
                <Text
                style={[
                    styles.segmentText,
                    { fontSize: 13 * fontSize },
                    distanceUnits === "metric" && styles.segmentTextSelected,
                ]}
                >
                m / km
                </Text>
            </TouchableOpacity>
            </View>
        </View>

        <Divider />

        <View style={styles.optionRow}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontSize }]}>Direction style</Text>

            <View style={styles.segmentedControl}>
            <TouchableOpacity
                style={[
                styles.segmentButton,
                directionStyle === "natural" && styles.segmentButtonSelected,
                ]}
                onPress={() => setDirectionStyle("natural")}
            >
                <Text
                style={[
                    styles.segmentText,
                    { fontSize: 13 * fontSize },
                    directionStyle === "natural" && styles.segmentTextSelected,
                ]}
                >
                Natural
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[
                styles.segmentButton,
                directionStyle === "degrees" && styles.segmentButtonSelected,
                ]}
                onPress={() => setDirectionStyle("degrees")}
            >
                <Text
                style={[
                    styles.segmentText,
                    { fontSize: 13 * fontSize },
                    directionStyle === "degrees" && styles.segmentTextSelected,
                ]}
                >
                Degrees
                </Text>
            </TouchableOpacity>
            </View>
        </View>
        </View>

        {/* Display */}
        <Text style={[styles.sectionLabel, { fontSize: 12 * fontSize }]}>DISPLAY</Text>

        <View style={styles.settingsCard}>
        <View style={styles.sliderRow}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontSize }]}>Text size</Text>

            <View style={styles.sliderContainer}>
            <Text style={[styles.smallA, { fontSize: 14 * fontSize }]}>A</Text>

            <Slider
                style={styles.slider}
                minimumValue={0.8}
                maximumValue={1.8}
                step={0.1}
                value={fontSize}
                onValueChange={setFontSize}
                minimumTrackTintColor="#AC2B37"
                maximumTrackTintColor="#D1D5DB"
                thumbTintColor="#AC2B37"
            />

            <Text style={[styles.largeA, { fontSize: 24 * fontSize }]}>A</Text>
            </View>

            <Text style={[styles.fontSizeValue, { fontSize: 12 * fontSize }]}>
            {Math.round(fontSize * 100)}%
            </Text>
        </View>
        </View>

        <TouchableOpacity
          style={styles.landingButton}
          onPress={returnToLandingPage}
        >
          <Text style={[styles.landingButtonText, { fontSize: 15 * fontSize }]}>Back to landing page</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingToggle({
  title,
  value,
  onValueChange,
}: {
  title: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingTitle}>{title}</Text>

      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: "#D1D5DB",
          true: "#D98A92",
        }}
        thumbColor={value ? "#AC2B37" : "#F4F4F5"}
      />
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F6F7" },
  header: { height: 68, backgroundColor: "#AC2B37", flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
  backButton: { width: 42, height: 42, justifyContent: "center", alignItems: "center" },
  backArrow: { color: "#FFFFFF", fontSize: 38, lineHeight: 40 },
  headerTitle: { flex: 1, color: "#FFFFFF", fontSize: 21, fontWeight: "800", textAlign: "center" },
  headerSpacer: { width: 42 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 40 },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: "#7A7A7A", marginLeft: 6, marginBottom: 8, marginTop: 12, letterSpacing: 0.8 },
  settingsCard: { backgroundColor: "#FFFFFF", borderRadius: 18, paddingHorizontal: 16, shadowColor: "#000000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
  settingRow: { minHeight: 88, flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  optionRow: { paddingVertical: 16 },
  settingTitle: { fontSize: 16, fontWeight: "700", color: "#1F2937", marginBottom: 4 },
  segmentedControl: { flexDirection: "row", backgroundColor: "#F1F2F4", borderRadius: 10, padding: 3, marginTop: 12 },
  segmentButton: { flex: 1, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segmentButtonSelected: { backgroundColor: "#AC2B37" },
  segmentText: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
  segmentTextSelected: { color: "#FFFFFF" },
  sliderRow: { paddingVertical: 18 },
  sliderContainer: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  slider: { flex: 1, height: 40, marginHorizontal: 8 },
  smallA: { fontSize: 14, fontWeight: "700", color: "#4B5563" },
  largeA: { fontSize: 24, fontWeight: "700", color: "#4B5563" },
  fontSizeValue: { fontSize: 12, fontWeight: "600", color: "#6B7280", textAlign: "center" },
  divider: { height: 1, backgroundColor: "#ECEDEF" },
  footerText: { textAlign: "center", fontSize: 12, color: "#9CA3AF", marginTop: 30 },
  landingButton: { marginTop: 28, paddingVertical: 14, alignItems: "center" },
  landingButtonText: { color: "#AC2B37", fontSize: 15, fontWeight: "700" },
});