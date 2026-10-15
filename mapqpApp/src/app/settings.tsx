
import Slider from "@react-native-community/slider";
import { router, useLocalSearchParams } from "expo-router";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  type TextProps,
  TouchableOpacity,
  View,
  useWindowDimensions,
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
  const { fontScale } = useWindowDimensions();

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
  const increasedContrast =
    deviceAccessibility.darkerSystemColorsEnabled ||
    deviceAccessibility.highTextContrastEnabled;

  // Preserve the existing font sizes and accessibility props, while applying
  // the device Bold Text preference to every label on this screen.
  const AccessibleText = ({ style, ...props }: TextProps) => (
    <Text
      {...props}
      style={[style, deviceAccessibility.boldTextEnabled && styles.boldTextOverride]}
    />
  );

  const changeNavigationMode = (
    mode: "standard" | "accessibility"
  ) => {
    setNavigationMode(mode);
  };

  const { from } = useLocalSearchParams<{ from?: string }>();

  const handleBackFromSettings = () => {
    const originalMode =
      from === "standard-navigation"
        ? "standard"
        : from === "accessibility-navigation"
          ? "accessibility"
          : null;

    // No mode change: return to the existing screen.
    if (!originalMode || navigationMode === originalMode) {
      router.back();
      return;
    }

    // Mode changed: open the newly selected navigation screen.
    router.replace(
      navigationMode === "standard"
        ? "/standard-navigation"
        : "/accessibility-navigation"
    );
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
          onPress={handleBackFromSettings}
          accessibilityRole="button"
          accessibilityLabel="Back to navigation"
          accessibilityHint="Returns to navigation and applies the selected navigation mode"
        >
          <AccessibleText
            allowFontScaling={false}
            style={styles.backArrow}
          >
            ‹
          </AccessibleText>
        </TouchableOpacity>

        <AccessibleText key={`settings-text-1-${fontSize}-${fontScale}`}
          maxFontSizeMultiplier={2.5}
          style={[
            styles.headerTitle,
            { fontSize: 21 * fontSize },
          ]}
        >
          Settings
        </AccessibleText>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation Mode */}
        <AccessibleText key={`settings-text-2-${fontSize}-${fontScale}`}
          maxFontSizeMultiplier={2.5}
          accessibilityRole="header"
          style={[
            styles.sectionLabel,
            styles.interactiveSectionLabel,
            styles.sectionBandRed,
            increasedContrast &&
              styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          NAVIGATION MODE
        </AccessibleText>

        <View
          style={[
            styles.settingsCard,
            styles.navigationCard,
            increasedContrast &&
              styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.optionRow}>
            <AccessibleText key={`settings-text-3-${fontSize}-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.settingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Navigation mode
            </AccessibleText>

            <View
              style={[
                styles.segmentedControl,
                styles.redSegmentTrack,
                increasedContrast &&
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
                accessibilityHint="Uses standard navigation when you return to the map"
                accessibilityState={{
                  selected: navigationMode === "standard",
                }}
              >
                <AccessibleText key={`settings-text-4-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    navigationMode === "standard" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  Standard
                </AccessibleText>
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
                accessibilityHint="Uses accessible navigation when you return to the map"
                accessibilityState={{
                  selected: navigationMode === "accessibility",
                }}
              >
                <AccessibleText key={`settings-text-5-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    navigationMode === "accessibility" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  Accessible
                </AccessibleText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Navigation Preferences */}
        <AccessibleText key={`settings-text-6-${fontSize}-${fontScale}`}
          maxFontSizeMultiplier={2.5}
          accessibilityRole="header"
          style={[
            styles.sectionLabel,
            styles.interactiveSectionLabel,
            styles.sectionBandRed,
            increasedContrast &&
              styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          NAVIGATION PREFERENCES
        </AccessibleText>

        <View
          style={[
            styles.settingsCard,
            styles.preferencesCard,
            increasedContrast &&
              styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.optionRow}>
            <AccessibleText key={`settings-text-7-${fontSize}-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.settingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Distance units
            </AccessibleText>

            <View
              style={[
                styles.segmentedControl,
                styles.redSegmentTrack,
                increasedContrast &&
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
                accessibilityHint="Displays distances in feet and miles"
                accessibilityState={{
                  selected: distanceUnits === "imperial",
                }}
              >
                <AccessibleText key={`settings-text-8-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    distanceUnits === "imperial" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  ft / mi
                </AccessibleText>
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
                accessibilityHint="Displays distances in meters and kilometers"
                accessibilityState={{
                  selected: distanceUnits === "metric",
                }}
              >
                <AccessibleText key={`settings-text-9-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    distanceUnits === "metric" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  m / km
                </AccessibleText>
              </TouchableOpacity>
            </View>
          </View>

          <Divider />

          <View style={styles.optionRow}>
            <AccessibleText key={`settings-text-10-${fontSize}-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.settingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Direction style
            </AccessibleText>

            <View
              style={[
                styles.segmentedControl,
                styles.redSegmentTrack,
                increasedContrast &&
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
                accessibilityHint="Uses directions such as turn left or turn right"
                accessibilityState={{
                  selected: directionStyle === "natural",
                }}
              >
                <AccessibleText key={`settings-text-11-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    directionStyle === "natural" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  Natural
                </AccessibleText>
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
                accessibilityHint="Uses turning angles in degrees"
                accessibilityState={{
                  selected: directionStyle === "degrees",
                }}
              >
                <AccessibleText key={`settings-text-12-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast &&
                      styles.segmentTextHighContrast,
                    { fontSize: 13 * fontSize },
                    directionStyle === "degrees" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  Degrees
                </AccessibleText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Display */}
        <AccessibleText key={`settings-text-13-${fontSize}-${fontScale}`}
          maxFontSizeMultiplier={2.5}
          accessibilityRole="header"
          style={[
            styles.sectionLabel,
            styles.displaySectionLabel,
            styles.sectionBandPurple,
            increasedContrast &&
              styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          DISPLAY
        </AccessibleText>

        <View
          style={[
            styles.settingsCard,
            styles.displayCard,
            increasedContrast &&
              styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.sliderRow}>
            <AccessibleText key={`settings-text-14-${fontSize}-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.settingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Text size
            </AccessibleText>

            <View style={styles.sliderContainer}>
              <AccessibleText key={`settings-text-15-${fontSize}-${fontScale}`}
                maxFontSizeMultiplier={2.5}
                accessible={false}
                style={[
                  styles.smallA,
                  increasedContrast &&
                    styles.secondaryTextHighContrast,
                  { fontSize: 14 * fontSize },
                ]}
              >
                A
              </AccessibleText>

              <View
                style={styles.slider}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Text size"
                accessibilityHint="Swipe up or down to adjust text size"
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
                  minimumTrackTintColor="#6848A0"
                  maximumTrackTintColor="#D1D5DB"
                  thumbTintColor="#6848A0"
                  accessible={false}
                />
              </View>

              <AccessibleText key={`settings-text-16-${fontSize}-${fontScale}`}
                maxFontSizeMultiplier={2.5}
                accessible={false}
                style={[
                  styles.largeA,
                  increasedContrast &&
                    styles.secondaryTextHighContrast,
                  { fontSize: 24 * fontSize },
                ]}
              >
                A
              </AccessibleText>
            </View>

            <AccessibleText key={`settings-text-17-${fontSize}-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.fontSizeValue,
                increasedContrast &&
                  styles.secondaryTextHighContrast,
                { fontSize: 12 * fontSize },
              ]}
            >
              {Math.round(fontSize * 100)}%
            </AccessibleText>
          </View>
        </View>

        {/* Device Accessibility */}
        <AccessibleText key={`settings-text-18-${fontSize}-${fontScale}`}
          maxFontSizeMultiplier={2.5}
          accessibilityRole="header"
          style={[
            styles.sectionLabel,
            styles.deviceSectionLabel,
            styles.sectionBandTeal,
            increasedContrast &&
              styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          DEVICE ACCESSIBILITY
        </AccessibleText>
        <View
          key={`device-description-${fontSize}-${fontScale}`}
          style={styles.deviceDescriptionContainer}
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.deviceSectionDescription,
              increasedContrast && styles.secondaryTextHighContrast,
              deviceAccessibility.boldTextEnabled && styles.boldTextOverride,
              {
                // Scale explicitly so iOS measures the full wrapped height.
                fontSize: 13 * fontSize * fontScale,
                lineHeight: Math.ceil(19 * fontSize * fontScale),
              },
            ]}
          >
            Read-only preferences imported from your device
          </Text>
        </View>

        <View
          style={[
            styles.settingsCard,
            styles.deviceSettingsCard,
            increasedContrast &&
              styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.deviceSettingRow} accessible accessibilityRole="text" accessibilityLabel={`Screen reader, ${deviceAccessibility.screenReaderEnabled ? "On" : "Off"}`}>
            <AccessibleText key={`settings-text-19-${fontSize}-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.settingTitle,
                styles.deviceSettingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Screen reader
            </AccessibleText>
            <AccessibleText key={`settings-text-20-${fontSize}-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.deviceValue,
                deviceAccessibility.screenReaderEnabled ? styles.deviceValueOn : styles.deviceValueOff,
                increasedContrast && (deviceAccessibility.screenReaderEnabled ? styles.deviceValueOnHighContrast : styles.deviceValueOffHighContrast),
                { fontSize: 14 * fontSize },
              ]}
            >
              {deviceAccessibility.screenReaderEnabled
                ? "On"
                : "Off"}
            </AccessibleText>
          </View>

          <Divider />

          <View style={styles.deviceSettingRow} accessible accessibilityRole="text" accessibilityLabel={`Reduce motion, ${deviceAccessibility.reduceMotionEnabled ? "On" : "Off"}`}>
            <AccessibleText key={`settings-text-21-${fontSize}-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.settingTitle,
                styles.deviceSettingTitle,
                { fontSize: 16 * fontSize },
              ]}
            >
              Reduce motion
            </AccessibleText>
            <AccessibleText key={`settings-text-22-${fontSize}-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.deviceValue,
                deviceAccessibility.reduceMotionEnabled ? styles.deviceValueOn : styles.deviceValueOff,
                increasedContrast && (deviceAccessibility.reduceMotionEnabled ? styles.deviceValueOnHighContrast : styles.deviceValueOffHighContrast),
                { fontSize: 14 * fontSize },
              ]}
            >
              {deviceAccessibility.reduceMotionEnabled
                ? "On"
                : "Off"}
            </AccessibleText>
          </View>

          {Platform.OS === "ios" && (
            <>
              <Divider />

              <View style={styles.deviceSettingRow} accessible accessibilityRole="text" accessibilityLabel={`Bold text, ${deviceAccessibility.boldTextEnabled ? "On" : "Off"}`}>
                <AccessibleText key={`settings-text-23-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.settingTitle,
                    styles.deviceSettingTitle,
                    { fontSize: 16 * fontSize },
                  ]}
                >
                  Bold text
                </AccessibleText>
                <AccessibleText key={`settings-text-24-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.deviceValue,
                    deviceAccessibility.boldTextEnabled ? styles.deviceValueOn : styles.deviceValueOff,
                    increasedContrast && (deviceAccessibility.boldTextEnabled ? styles.deviceValueOnHighContrast : styles.deviceValueOffHighContrast),
                    { fontSize: 14 * fontSize },
                  ]}
                >
                  {deviceAccessibility.boldTextEnabled
                    ? "On"
                    : "Off"}
                </AccessibleText>
              </View>

              <Divider />

              <View style={styles.deviceSettingRow} accessible accessibilityRole="text" accessibilityLabel={`Increase contrast, ${deviceAccessibility.darkerSystemColorsEnabled ? "On" : "Off"}`}>
                <AccessibleText key={`settings-text-25-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.settingTitle,
                    styles.deviceSettingTitle,
                    { fontSize: 16 * fontSize },
                  ]}
                >
                  Increase contrast
                </AccessibleText>
                <AccessibleText key={`settings-text-26-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.deviceValue,
                    deviceAccessibility.darkerSystemColorsEnabled ? styles.deviceValueOn : styles.deviceValueOff,
                    increasedContrast && (deviceAccessibility.darkerSystemColorsEnabled ? styles.deviceValueOnHighContrast : styles.deviceValueOffHighContrast),
                    { fontSize: 14 * fontSize },
                  ]}
                >
                  {deviceAccessibility.darkerSystemColorsEnabled
                    ? "On"
                    : "Off"}
                </AccessibleText>
              </View>

            </>
          )}

          {Platform.OS === "android" && (
            <>
              <Divider />

              <View style={styles.deviceSettingRow} accessible accessibilityRole="text" accessibilityLabel={`High text contrast, ${deviceAccessibility.highTextContrastEnabled ? "On" : "Off"}`}>
                <AccessibleText key={`settings-text-29-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.settingTitle,
                    { fontSize: 16 * fontSize },
                  ]}
                >
                  High text contrast
                </AccessibleText>
                <AccessibleText key={`settings-text-30-${fontSize}-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.deviceValue,
                    deviceAccessibility.highTextContrastEnabled ? styles.deviceValueOn : styles.deviceValueOff,
                    increasedContrast && (deviceAccessibility.highTextContrastEnabled ? styles.deviceValueOnHighContrast : styles.deviceValueOffHighContrast),
                    { fontSize: 14 * fontSize },
                  ]}
                >
                  {deviceAccessibility.highTextContrastEnabled
                    ? "On"
                    : "Off"}
                </AccessibleText>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.landingButton}
          onPress={returnToLandingPage}
          accessibilityRole="button"
          accessibilityLabel="Back to landing page"
          accessibilityHint="Leaves navigation and returns to the landing page"
        >
          <AccessibleText key={`settings-text-31-${fontSize}-${fontScale}`}
            maxFontSizeMultiplier={2.5}
            style={[
              styles.landingButtonText,
              { fontSize: 15 * fontSize },
            ]}
          >
            Back to landing page
          </AccessibleText>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Delete all local data"
          accessibilityHint="Opens a confirmation dialog before deleting saved data"
          style={styles.deleteStorageButton}
          onPress={deleteLocalStorage}
        >
          <AccessibleText key={`settings-text-32-${fontSize}-${fontScale}`}
            style={[
              styles.deleteStorageText,
              { fontSize: 15 * fontSize },
            ]}
          >
            Delete all local data
          </AccessibleText>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Divider() {
  return <View style={styles.divider} accessible={false} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F5F8",
  },
  header: {
    minHeight: 68,
    paddingVertical: 12,
    backgroundColor: "#AC2B37",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  backButton: {
    width: 48,
    height: 48,
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  backArrow: {
    color: "#FFFFFF",
    fontSize: 38,
  },
  headerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
    flexShrink: 1,
  },
  headerSpacer: {
    width: 48,
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
  interactiveSectionLabel: {
    color: "#761723", // AAA contrast on the light-red section header
  },
  deviceSectionLabel: {
    color: "#064C52", // AAA contrast on the light-teal section header
  },
  deviceDescriptionContainer: {
    width: "100%",
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 20,
    alignSelf: "stretch",
  },
  deviceSectionDescription: {
    color: "#425466",
    // No flexShrink or fixed height/lineHeight: allow the text to
    // determine its own height at the largest iOS accessibility sizes.
  },
  sectionBandRed: {
    backgroundColor: "#F9E5E7",
    borderLeftWidth: 5,
    borderLeftColor: "#AC2B37",
    borderRadius: 9,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginLeft: 0,
    overflow: "hidden",
  },
  displaySectionLabel: {
    color: "#40256F",
  },
  sectionBandPurple: {
    backgroundColor: "#EDE7F8",
    borderLeftWidth: 5,
    borderLeftColor: "#6848A0",
    borderRadius: 9,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginLeft: 0,
    overflow: "hidden",
  },
  sectionBandTeal: {
    backgroundColor: "#DDF2F0",
    borderLeftWidth: 5,
    borderLeftColor: "#087F8C",
    borderRadius: 9,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginLeft: 0,
    overflow: "hidden",
  },
  sectionLabelHighContrast: {
    textDecorationLine: "underline",
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
  navigationCard: {
    backgroundColor: "#FFF7F7",
    borderWidth: 1,
    borderColor: "#E8B7BC",
    borderLeftWidth: 5,
    borderLeftColor: "#AC2B37",
  },
  preferencesCard: {
    backgroundColor: "#FFF7F7",
    borderWidth: 1,
    borderColor: "#E8B7BC",
    borderLeftWidth: 5,
    borderLeftColor: "#AC2B37",
  },
  displayCard: {
    backgroundColor: "#F7F3FD",
    borderWidth: 1,
    borderColor: "#C8B7E3",
    borderLeftWidth: 5,
    borderLeftColor: "#6848A0",
  },
  redSegmentTrack: {
    backgroundColor: "#F4E0E3",
  },
  deviceSettingsCard: {
    backgroundColor: "#F2FAF9",
    borderWidth: 1,
    borderColor: "#A6D5D0",
    borderLeftWidth: 4,
    borderLeftColor: "#087F8C",
  },
  settingsCardHighContrast: {
    borderWidth: 2,
    borderColor: "#111827",
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
    backgroundColor: "#F4E0E3",
    borderWidth: 2,
    borderColor: "#111827",
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    minHeight: 48,
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
    textAlign: "center",
    flexShrink: 1,
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
    height: 48,
    marginHorizontal: 8,
  },
  smallA: {
    fontSize: 14,
    fontWeight: "700",
    color: "#40256F",
  },
  largeA: {
    fontSize: 24,
    fontWeight: "700",
    color: "#40256F",
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
    backgroundColor: "#D7DFE5",
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
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 52,
    textAlign: "center",
  },
  deviceValueOn: {
    color: "#064C52",
    backgroundColor: "#E2F4F2",
  },
  deviceValueOff: {
    color: "#374151",
    backgroundColor: "#F0F1F3",
  },
  deviceValueOnHighContrast: {
    color: "#FFFFFF",
    backgroundColor: "#075E68",
    borderWidth: 2,
    borderColor: "#111827",
  },
  deviceValueOffHighContrast: {
    color: "#111827",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#111827",
  },
  boldTextOverride: {
    fontWeight: "900",
  },
  landingButton: {
    marginTop: 28,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#F9E5E7",
    borderWidth: 1,
    borderColor: "#E8B7BC",
    borderRadius: 12,
  },
  landingButtonText: {
    color: "#761723",
    fontSize: 15,
    fontWeight: "700",
  },
  deleteStorageButton: {
    alignItems: "center",
    borderColor: "#B42318",
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: "#FFF0EE",
    marginTop: 12,
    paddingVertical: 13,
  },
  deleteStorageText: {
    color: "#B42318",
    fontSize: 15,
    fontWeight: "700",
  },
});
