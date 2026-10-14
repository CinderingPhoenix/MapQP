
import Slider from "@react-native-community/slider";
import { router } from "expo-router";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/settings-context";
import { useDeviceAccessibility } from "../hooks/use-device-accessibility";
import { useAuthGuard } from "../hooks/use-auth-guard";

const KEYS_TO_DELETE = [
  "mapqp_microsoft_session",
  "mapqp_temp_code_session",
  "mapqp_temp_code_expires_at",
  "wpi_map_last_location",
];

export default function SettingsPage() {
  useAuthGuard();

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

  const deviceAccessibility = useDeviceAccessibility();

  const changeNavigationMode = (
    mode: "standard" | "accessibility"
  ) => {
    setNavigationMode(mode);
  };

  const returnToLandingPage = () => {
    setHasSelectedMode(false);
    router.replace("/landing-page");
  };

  const handleFontSizeAccessibilityAction = (event: any) => {
    if (event.nativeEvent.actionName === "increment") {
      setFontSize(
        Math.min(1.8, Math.round((fontSize + 0.1) * 10) / 10)
      );
    } else if (event.nativeEvent.actionName === "decrement") {
      setFontSize(
        Math.max(0.8, Math.round((fontSize - 0.1) * 10) / 10)
      );
    }
  };

  const deleteLocalStorage = () => {
    Alert.alert(
      "Delete local data?",
      "This will remove your saved settings, login session, recent searches, and cached location from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await Promise.all(
                  KEYS_TO_DELETE.map((key) =>
                    SecureStore.deleteItemAsync(key)
                  )
                );

                setNavigationMode("standard");
                setHasSelectedMode(false);
                setDistanceUnits("imperial");
                setDirectionStyle("natural");
                setFontSize(1);

                Alert.alert(
                  "Local data deleted",
                  "Your saved app data was removed. You will be asked to sign in again.",
                  [
                    {
                      text: "Continue",
                      onPress: () =>
                        router.replace("/loading-screen"),
                    },
                  ]
                );
              } catch (error) {
                console.error(
                  "Failed to delete local storage:",
                  error
                );
                Alert.alert(
                  "Unable to delete local data",
                  "Your saved app data could not be removed. Please try again."
                );
              }
            })();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text
            maxFontSizeMultiplier={1.3}
            style={[
              styles.backArrow,
              { fontSize: 38 * fontSize },
            ]}
          >
            ‹
          </Text>
        </TouchableOpacity>

        <Text
          maxFontSizeMultiplier={1.5}
          style={[
            styles.headerTitle,
            { fontSize: 21 * fontSize },
          ]}
        >
          Settings
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation Mode */}
        <Text
          maxFontSizeMultiplier={1.5}
          style={[
            styles.sectionLabel,
            deviceAccessibility.darkerSystemColorsEnabled &&
              styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          NAVIGATION MODE
        </Text>

        <View
          style={[
            styles.settingsCard,
            deviceAccessibility.darkerSystemColorsEnabled &&
              styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.optionRow}>
            <Text
              maxFontSizeMultiplier={1.6}
              style={[
                styles.settingTitle,
                styles.deviceSettingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Navigation mode
            </Text>

            <View
              style={[
                styles.segmentedControl,
                deviceAccessibility.darkerSystemColorsEnabled &&
                  styles.segmentedControlHighContrast,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  navigationMode === "standard" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() =>
                  changeNavigationMode("standard")
                }
                accessible
                accessibilityRole="button"
                accessibilityLabel="Standard navigation mode"
                accessibilityState={{
                  selected: navigationMode === "standard",
                }}
              >
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[
                    styles.segmentText,
                    deviceAccessibility.darkerSystemColorsEnabled &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    navigationMode === "standard" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  Standard
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  navigationMode === "accessibility" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() =>
                  changeNavigationMode("accessibility")
                }
                accessible
                accessibilityRole="button"
                accessibilityLabel="Accessible navigation mode"
                accessibilityState={{
                  selected: navigationMode === "accessibility",
                }}
              >
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[
                    styles.segmentText,
                    deviceAccessibility.darkerSystemColorsEnabled &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    navigationMode === "accessibility" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  Accessible
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Navigation Preferences */}
        <Text
          maxFontSizeMultiplier={1.5}
          style={[
            styles.sectionLabel,
            deviceAccessibility.darkerSystemColorsEnabled &&
              styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          NAVIGATION PREFERENCES
        </Text>

        <View
          style={[
            styles.settingsCard,
            deviceAccessibility.darkerSystemColorsEnabled &&
              styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.optionRow}>
            <Text
              maxFontSizeMultiplier={1.6}
              style={[
                styles.settingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Distance units
            </Text>

            <View
              style={[
                styles.segmentedControl,
                deviceAccessibility.darkerSystemColorsEnabled &&
                  styles.segmentedControlHighContrast,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  distanceUnits === "imperial" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() =>
                  setDistanceUnits("imperial")
                }
                accessible
                accessibilityRole="button"
                accessibilityLabel="Feet and miles"
                accessibilityState={{
                  selected: distanceUnits === "imperial",
                }}
              >
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[
                    styles.segmentText,
                    deviceAccessibility.darkerSystemColorsEnabled &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    distanceUnits === "imperial" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  ft / mi
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  distanceUnits === "metric" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() => setDistanceUnits("metric")}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Meters and kilometers"
                accessibilityState={{
                  selected: distanceUnits === "metric",
                }}
              >
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[
                    styles.segmentText,
                    deviceAccessibility.darkerSystemColorsEnabled &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    distanceUnits === "metric" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  m / km
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Divider />

          <View style={styles.optionRow}>
            <Text
              maxFontSizeMultiplier={1.6}
              style={[
                styles.settingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Direction style
            </Text>

            <View
              style={[
                styles.segmentedControl,
                deviceAccessibility.darkerSystemColorsEnabled &&
                  styles.segmentedControlHighContrast,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  directionStyle === "natural" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() =>
                  setDirectionStyle("natural")
                }
                accessible
                accessibilityRole="button"
                accessibilityLabel="Natural directions"
                accessibilityState={{
                  selected: directionStyle === "natural",
                }}
              >
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[
                    styles.segmentText,
                    deviceAccessibility.darkerSystemColorsEnabled &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    directionStyle === "natural" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  Natural
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  directionStyle === "degrees" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() =>
                  setDirectionStyle("degrees")
                }
                accessible
                accessibilityRole="button"
                accessibilityLabel="Degree based directions"
                accessibilityState={{
                  selected: directionStyle === "degrees",
                }}
              >
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[
                    styles.segmentText,
                    deviceAccessibility.darkerSystemColorsEnabled &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    directionStyle === "degrees" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  Degrees
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Display */}
        <Text
          maxFontSizeMultiplier={1.5}
          style={[
            styles.sectionLabel,
            deviceAccessibility.darkerSystemColorsEnabled &&
              styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          DISPLAY
        </Text>

        <View
          style={[
            styles.settingsCard,
            deviceAccessibility.darkerSystemColorsEnabled &&
              styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.sliderRow}>
            <Text
              maxFontSizeMultiplier={1.6}
              style={[
                styles.settingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Text size
            </Text>

            <View style={styles.sliderContainer}>
              <Text
                maxFontSizeMultiplier={1.4}
                style={[
                  styles.smallA,
                  deviceAccessibility.darkerSystemColorsEnabled &&
                    styles.secondaryTextHighContrast,
                  { fontSize: 14 * fontSize },
                ]}
              >
                A
              </Text>

              <View
                style={styles.slider}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Text size"
                accessibilityValue={{
                  min: 80,
                  max: 180,
                  now: Math.round(fontSize * 100),
                  text: `${Math.round(fontSize * 100)} percent`,
                }}
                accessibilityActions={[
                  { name: "increment" },
                  { name: "decrement" },
                ]}
                onAccessibilityAction={
                  handleFontSizeAccessibilityAction
                }
              >
                <Slider
                  style={{ flex: 1, height: 40 }}
                  minimumValue={0.8}
                  maximumValue={1.8}
                  step={0.1}
                  value={fontSize}
                  onValueChange={setFontSize}
                  minimumTrackTintColor="#AC2B37"
                  maximumTrackTintColor="#D1D5DB"
                  thumbTintColor="#AC2B37"
                  accessible={false}
                />
              </View>

              <Text
                maxFontSizeMultiplier={1.4}
                style={[
                  styles.largeA,
                  deviceAccessibility.darkerSystemColorsEnabled &&
                    styles.secondaryTextHighContrast,
                  { fontSize: 24 * fontSize },
                ]}
              >
                A
              </Text>
            </View>

            <Text
              maxFontSizeMultiplier={1.4}
              style={[
                styles.fontSizeValue,
                deviceAccessibility.darkerSystemColorsEnabled &&
                  styles.secondaryTextHighContrast,
                { fontSize: 12 * fontSize },
              ]}
            >
              {Math.round(fontSize * 100)}%
            </Text>
          </View>
        </View>

        {/* Device Accessibility */}
        <Text
          maxFontSizeMultiplier={1.5}
          style={[
            styles.sectionLabel,
            deviceAccessibility.darkerSystemColorsEnabled &&
              styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          DEVICE ACCESSIBILITY
        </Text>

        <View
          style={[
            styles.settingsCard,
            deviceAccessibility.darkerSystemColorsEnabled &&
              styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.deviceSettingRow}>
            <Text
              maxFontSizeMultiplier={1.6}
              style={[
                styles.settingTitle,
                styles.deviceSettingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Screen reader
            </Text>
            <Text
              maxFontSizeMultiplier={1.5}
              style={[
                styles.deviceValue,
                deviceAccessibility.darkerSystemColorsEnabled &&
                  styles.deviceValueHighContrast,
                { fontSize: 14 * fontSize },
              ]}
            >
              {deviceAccessibility.screenReaderEnabled
                ? "On"
                : "Off"}
            </Text>
          </View>

          <Divider />

          <View style={styles.deviceSettingRow}>
            <Text
              maxFontSizeMultiplier={1.6}
              style={[
                styles.settingTitle,
                styles.deviceSettingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Reduce motion
            </Text>
            <Text
              maxFontSizeMultiplier={1.5}
              style={[
                styles.deviceValue,
                deviceAccessibility.darkerSystemColorsEnabled &&
                  styles.deviceValueHighContrast,
                { fontSize: 14 * fontSize },
              ]}
            >
              {deviceAccessibility.reduceMotionEnabled
                ? "On"
                : "Off"}
            </Text>
          </View>

          {Platform.OS === "ios" && (
            <>
              <Divider />

              <View style={styles.deviceSettingRow}>
                <Text
                  maxFontSizeMultiplier={1.6}
                  style={[
                    styles.settingTitle,
                    styles.deviceSettingTitle,
                    { fontSize: 16 * fontSize },
                  ]}
                >
                  Bold text
                </Text>
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[
                    styles.deviceValue,
                    deviceAccessibility.darkerSystemColorsEnabled &&
                      styles.deviceValueHighContrast,
                    { fontSize: 14 * fontSize },
                  ]}
                >
                  {deviceAccessibility.boldTextEnabled
                    ? "On"
                    : "Off"}
                </Text>
              </View>

              <Divider />

              <View style={styles.deviceSettingRow}>
                <Text
                  maxFontSizeMultiplier={1.6}
                  style={[
                    styles.settingTitle,
                    styles.deviceSettingTitle,
                    { fontSize: 16 * fontSize },
                  ]}
                >
                  Increase contrast
                </Text>
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[
                    styles.deviceValue,
                    deviceAccessibility.darkerSystemColorsEnabled &&
                      styles.deviceValueHighContrast,
                    { fontSize: 14 * fontSize },
                  ]}
                >
                  {deviceAccessibility.darkerSystemColorsEnabled
                    ? "On"
                    : "Off"}
                </Text>
              </View>

              <Divider />

              <View style={styles.deviceSettingRow}>
                <Text
                  maxFontSizeMultiplier={1.6}
                  style={[
                    styles.settingTitle,
                    styles.deviceSettingTitle,
                    { fontSize: 16 * fontSize },
                  ]}
                >
                  Reduce transparency
                </Text>
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[
                    styles.deviceValue,
                    deviceAccessibility.darkerSystemColorsEnabled &&
                      styles.deviceValueHighContrast,
                    { fontSize: 14 * fontSize },
                  ]}
                >
                  {deviceAccessibility.reduceTransparencyEnabled
                    ? "On"
                    : "Off"}
                </Text>
              </View>
            </>
          )}

          {Platform.OS === "android" && (
            <>
              <Divider />

              <View style={styles.deviceSettingRow}>
                <Text
                  maxFontSizeMultiplier={1.6}
                  style={[
                    styles.settingTitle,
                    { fontSize: 16 * fontSize },
                  ]}
                >
                  High text contrast
                </Text>
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[
                    styles.deviceValue,
                    deviceAccessibility.darkerSystemColorsEnabled &&
                      styles.deviceValueHighContrast,
                    { fontSize: 14 * fontSize },
                  ]}
                >
                  {deviceAccessibility.highTextContrastEnabled
                    ? "On"
                    : "Off"}
                </Text>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.landingButton}
          onPress={returnToLandingPage}
          accessibilityRole="button"
          accessibilityLabel="Back to landing page"
        >
          <Text
            maxFontSizeMultiplier={1.5}
            style={[
              styles.landingButtonText,
              { fontSize: 15 * fontSize },
            ]}
          >
            Back to landing page
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          style={styles.deleteStorageButton}
          onPress={deleteLocalStorage}
        >
          <Text
            style={[
              styles.deleteStorageText,
              { fontSize: 15 * fontSize },
            ]}
          >
            Delete all local data
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F6F7",
  },
  header: {
    height: 68,
    backgroundColor: "#AC2B37",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },
  backArrow: {
    color: "#FFFFFF",
    fontSize: 38,
    lineHeight: 40,
  },
  headerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  headerSpacer: {
    width: 42,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#7A7A7A",
    marginLeft: 6,
    marginBottom: 8,
    marginTop: 12,
    letterSpacing: 0.8,
  },
  sectionLabelHighContrast: {
    color: "#111827",
  },
  settingsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  settingsCardHighContrast: {
    borderWidth: 1.5,
    borderColor: "#4B5563",
  },
  optionRow: {
    paddingVertical: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  deviceSettingTitle: {
    flex: 1,
    flexShrink: 1,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#F1F2F4",
    borderRadius: 10,
    padding: 3,
    marginTop: 12,
  },
  segmentedControlHighContrast: {
    backgroundColor: "#E1E3E6",
    borderWidth: 1,
    borderColor: "#6B7280",
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonSelected: {
    backgroundColor: "#AC2B37",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
  },
  segmentTextHighContrast: {
    color: "#111827",
  },
  segmentTextSelected: {
    color: "#FFFFFF",
  },
  sliderRow: {
    paddingVertical: 18,
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: 8,
  },
  smallA: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4B5563",
  },
  largeA: {
    fontSize: 24,
    fontWeight: "700",
    color: "#4B5563",
  },
  fontSizeValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
  },
  secondaryTextHighContrast: {
    color: "#111827",
  },
  divider: {
    height: 1,
    backgroundColor: "#ECEDEF",
  },
  deviceSettingRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  deviceValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    flexShrink: 0,
  },
  deviceValueHighContrast: {
    color: "#111827",
  },
  landingButton: {
    marginTop: 28,
    paddingVertical: 14,
    alignItems: "center",
  },
  landingButtonText: {
    color: "#AC2B37",
    fontSize: 15,
    fontWeight: "700",
  },
  deleteStorageButton: {
    alignItems: "center",
    borderColor: "#B42318",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingVertical: 13,
  },
  deleteStorageText: {
    color: "#B42318",
    fontSize: 15,
    fontWeight: "700",
  },
});
