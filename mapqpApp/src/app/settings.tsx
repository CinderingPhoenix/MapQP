import Slider from "@react-native-community/slider";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  type AccessibilityActionEvent,
  type TextProps,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { File, Paths } from "expo-file-system";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings, type AccessibilityPreference } from "../context/settings-context";
import type { DeviceAccessibilityPreference } from "../hooks/use-device-accessibility";
import { useAccessibilityPreferences, accessibilityControlState } from "../hooks/use-accessibility-preferences";
import { useAuthGuard } from "../hooks/use-auth-guard";
import defaultRoutePoints from "../data/route-points.json";
import { useFocusEffect } from "expo-router";

const ACCESSIBILITY_CONTROLS: {
  label: string; preference: AccessibilityPreference; devicePreference: DeviceAccessibilityPreference;
}[] = [
  { label: "Reduce Motion", preference: "reduceMotionEnabled", devicePreference: "reduceMotionEnabled" },
  { label: "Bold Text", preference: "boldTextEnabled", devicePreference: "boldTextEnabled" },
  { label: "Increase Contrast", preference: "increaseContrastEnabled", devicePreference: "darkerSystemColorsEnabled" },
  { label: "Reduce Transparency", preference: "reduceTransparencyEnabled", devicePreference: "reduceTransparencyEnabled" },
];

const KEYS_TO_DELETE = [
  "mapqp_microsoft_session",
  "mapqp_temp_code_session",
  "mapqp_temp_code_expires_at",
  "wpi_map_last_location",
];

// Keep the component type stable when accessibility preferences change.
function AccessibleText({ boldTextEnabled, style, ...props }: TextProps & { boldTextEnabled: boolean }) {
  return <Text {...props} style={[style, boldTextEnabled && styles.boldTextOverride]} />;
}

export default function SettingsPage() {
  useAuthGuard();
  const { fontScale, width } = useWindowDimensions();
  useFocusEffect(
    useCallback(() => {
      Speech.stop();
    }, [])
  );

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
    deviceAccessibility,
    customAccessibilityPreferences: savedAccessibilityPreferences,
    settingsLoaded,
    setAccessibilityPreference,
    resetAccessibilitySettings,
  } = useSettings();

  const [mapVersion, setMapVersion] = useState<string>(
    defaultRoutePoints.version ? String(defaultRoutePoints.version) : "1.0"
  );

  useEffect(() => {
    async function loadMapVersion() {
      try {
        const routeFile = new File(Paths.document, "route-points.json");
        if (routeFile.exists) {
          const content = await routeFile.text();
          const parsed = JSON.parse(content);
          if (parsed.version) {
            setMapVersion(String(parsed.version));
          }
        }
      } catch (err) {
        console.error("Error reading local map version:", err);
      }
    }
    void loadMapVersion();
  }, []);

  const accessibilityPreferences = useAccessibilityPreferences();
  const increasedContrast =
    accessibilityPreferences.darkerSystemColorsEnabled ||
    accessibilityPreferences.highTextContrastEnabled;

  const stackControls = width < 360 || fontSize * Math.min(fontScale, 2.5) >= 1.35;
  const deviceSettingValue = (preference: DeviceAccessibilityPreference) => {
    const status = deviceAccessibility.detectionStatus[preference];
    if (status === "loading") return "Loading";
    if (status === "unavailable") return "Unavailable";
    return deviceAccessibility[preference] ? "On" : "Off";
  };

  const deviceSettingStyles = (preference: DeviceAccessibilityPreference) => {
    const verifiedOn =
      deviceAccessibility.detectionStatus[preference] === "available" &&
      deviceAccessibility[preference];
    return [
      styles.deviceValue,
      verifiedOn ? styles.deviceValueOn : styles.deviceValueOff,
      increasedContrast &&
        (verifiedOn
          ? styles.deviceValueOnHighContrast
          : styles.deviceValueOffHighContrast),
    ];
  };

  const changeNavigationMode = (mode: "standard" | "accessibility") => {
    Speech.stop();
    setNavigationMode(mode);
  };

  const { from } = useLocalSearchParams<{ from?: string }>();

  const handleBackFromSettings = () => {
    Speech.stop();
    // The root coordinator applies the selected mode after this pop completes,
    // using the same path as iOS swipe-back and Android hardware back.
    router.back();
  };

  const returnToLandingPage = () => {
    Speech.stop();
    setHasSelectedMode(false);
    router.replace("/landing-page");
  };

  const handleFontSizeAccessibilityAction = (
    event: AccessibilityActionEvent
  ) => {
    if (event.nativeEvent.actionName === "increment") {
      setFontSize(Math.min(1.8, Math.round((fontSize + 0.1) * 10) / 10));
    } else if (event.nativeEvent.actionName === "decrement") {
      setFontSize(Math.max(0.8, Math.round((fontSize - 0.1) * 10) / 10));
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
                Speech.stop();
                await Promise.all(
                  KEYS_TO_DELETE.map((key) => SecureStore.deleteItemAsync(key))
                );

                setNavigationMode("standard");
                setHasSelectedMode(false);
                setDistanceUnits("imperial");
                setDirectionStyle("natural");
                setFontSize(1);
                resetAccessibilitySettings();

                Alert.alert(
                  "Local data deleted",
                  "Your saved app data was removed. You will be asked to sign in again.",
                  [
                    {
                      text: "Continue",
                      onPress: () => router.replace("/loading-screen"),
                    },
                  ]
                );
              } catch (error) {
                console.error("Failed to delete local storage:", error);
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
          accessibilityLabel={from ? "Back to navigation" : "Back"}
          accessibilityHint={
            from
              ? "Returns to navigation and applies the selected navigation mode"
              : "Returns to the previous screen"
          }
        >
          <AccessibleText
            boldTextEnabled={accessibilityPreferences.boldTextEnabled}
            allowFontScaling={false}
            style={styles.backArrow}
          >
            ‹
          </AccessibleText>
        </TouchableOpacity>

        <AccessibleText
          boldTextEnabled={accessibilityPreferences.boldTextEnabled}
          key={`settings-text-1-${fontScale}`}
          accessibilityRole="header"
          maxFontSizeMultiplier={2.5}
          style={[styles.headerTitle, { fontSize: 21 * fontSize }]}
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
        <AccessibleText
          boldTextEnabled={accessibilityPreferences.boldTextEnabled}
          key={`settings-text-2-${fontScale}`}
          maxFontSizeMultiplier={2.5}
          accessibilityRole="header"
          style={[
            styles.sectionLabel,
            styles.interactiveSectionLabel,
            styles.sectionBandRed,
            increasedContrast && styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          NAVIGATION MODE
        </AccessibleText>

        <View
          style={[
            styles.settingsCard,
            styles.navigationCard,
            increasedContrast && styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.optionRow}>
            <AccessibleText
              boldTextEnabled={accessibilityPreferences.boldTextEnabled}
              key={`settings-text-3-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[styles.settingTitle, { fontSize: 16 * fontSize }]}
            >
              Navigation mode
            </AccessibleText>

            <View
              style={[
                styles.segmentedControl,
                stackControls && styles.segmentedControlStacked,
                styles.redSegmentTrack,
                increasedContrast && styles.segmentedControlHighContrast,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  stackControls && styles.segmentButtonStacked,
                  navigationMode === "standard" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() => changeNavigationMode("standard")}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Standard navigation mode"
                accessibilityHint="Uses standard navigation when you return to the map"
                accessibilityState={{
                  selected: navigationMode === "standard",
                }}
              >
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-4-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
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
                  stackControls && styles.segmentButtonStacked,
                  navigationMode === "accessibility" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() => changeNavigationMode("accessibility")}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Accessible navigation mode"
                accessibilityHint="Uses accessible navigation when you return to the map"
                accessibilityState={{
                  selected: navigationMode === "accessibility",
                }}
              >
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-5-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
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
        <AccessibleText
          boldTextEnabled={accessibilityPreferences.boldTextEnabled}
          key={`settings-text-6-${fontScale}`}
          maxFontSizeMultiplier={2.5}
          accessibilityRole="header"
          style={[
            styles.sectionLabel,
            styles.interactiveSectionLabel,
            styles.sectionBandRed,
            increasedContrast && styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          NAVIGATION PREFERENCES
        </AccessibleText>

        <View
          style={[
            styles.settingsCard,
            styles.preferencesCard,
            increasedContrast && styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.optionRow}>
            <AccessibleText
              boldTextEnabled={accessibilityPreferences.boldTextEnabled}
              key={`settings-text-7-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[styles.settingTitle, { fontSize: 16 * fontSize }]}
            >
              Distance units
            </AccessibleText>

            <View
              style={[
                styles.segmentedControl,
                stackControls && styles.segmentedControlStacked,
                styles.redSegmentTrack,
                increasedContrast && styles.segmentedControlHighContrast,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  stackControls && styles.segmentButtonStacked,
                  distanceUnits === "imperial" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() => setDistanceUnits("imperial")}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Feet and miles"
                accessibilityHint="Displays distances in feet and miles"
                accessibilityState={{
                  selected: distanceUnits === "imperial",
                }}
              >
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-8-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
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
                  stackControls && styles.segmentButtonStacked,
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
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-9-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
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
            <AccessibleText
              boldTextEnabled={accessibilityPreferences.boldTextEnabled}
              key={`settings-text-10-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[styles.settingTitle, { fontSize: 16 * fontSize }]}
            >
              Direction style
            </AccessibleText>

            <View
              style={[
                styles.segmentedControl,
                stackControls && styles.segmentedControlStacked,
                styles.redSegmentTrack,
                increasedContrast && styles.segmentedControlHighContrast,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  stackControls && styles.segmentButtonStacked,
                  directionStyle === "natural" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() => setDirectionStyle("natural")}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Natural directions"
                accessibilityHint="Uses directions such as turn left or turn right"
                accessibilityState={{
                  selected: directionStyle === "natural",
                }}
              >
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-11-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
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
                  stackControls && styles.segmentButtonStacked,
                  directionStyle === "degrees" &&
                    styles.segmentButtonSelected,
                ]}
                onPress={() => setDirectionStyle("degrees")}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Degree based directions"
                accessibilityHint="Uses turning angles in degrees"
                accessibilityState={{
                  selected: directionStyle === "degrees",
                }}
              >
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-12-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
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
        <AccessibleText
          boldTextEnabled={accessibilityPreferences.boldTextEnabled}
          key={`settings-text-13-${fontScale}`}
          maxFontSizeMultiplier={2.5}
          accessibilityRole="header"
          style={[
            styles.sectionLabel,
            styles.displaySectionLabel,
            styles.sectionBandPurple,
            increasedContrast && styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          DISPLAY
        </AccessibleText>

        <View
          style={[
            styles.settingsCard,
            styles.displayCard,
            increasedContrast && styles.settingsCardHighContrast,
          ]}
        >
          <View style={styles.sliderRow}>
            <AccessibleText
              boldTextEnabled={accessibilityPreferences.boldTextEnabled}
              key={`settings-text-14-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[styles.settingTitle, { fontSize: 16 * fontSize }]}
            >
              Text size
            </AccessibleText>

            <View style={styles.sliderContainer}>
              <AccessibleText
                boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                key={`settings-text-15-${fontScale}`}
                maxFontSizeMultiplier={2.5}
                accessible={false}
                style={[
                  styles.smallA,
                  increasedContrast && styles.secondaryTextHighContrast,
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
                accessibilityHint={
                  Platform.OS === "ios"
                    ? "Swipe up or down to adjust text size"
                    : "Use the increase or decrease accessibility action to adjust text size"
                }
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
                onAccessibilityAction={handleFontSizeAccessibilityAction}
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
                  importantForAccessibility="no-hide-descendants"
                />
              </View>

              <AccessibleText
                boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                key={`settings-text-16-${fontScale}`}
                maxFontSizeMultiplier={2.5}
                accessible={false}
                style={[
                  styles.largeA,
                  increasedContrast && styles.secondaryTextHighContrast,
                  { fontSize: 24 * fontSize },
                ]}
              >
                A
              </AccessibleText>
            </View>

            <AccessibleText
              boldTextEnabled={accessibilityPreferences.boldTextEnabled}
              key={`settings-text-17-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.fontSizeValue,
                increasedContrast && styles.secondaryTextHighContrast,
                { fontSize: 12 * fontSize },
              ]}
            >
              {Math.round(fontSize * 100)}%
            </AccessibleText>
          </View>
        </View>

        {/* Accessibility preferences */}
        <AccessibleText
          boldTextEnabled={accessibilityPreferences.boldTextEnabled}
          key={`settings-text-18-${fontScale}`}
          maxFontSizeMultiplier={2.5}
          accessibilityRole="header"
          style={[
            styles.sectionLabel,
            styles.deviceSectionLabel,
            styles.sectionBandTeal,
            increasedContrast && styles.sectionLabelHighContrast,
            { fontSize: 12 * fontSize },
          ]}
        >
          ACCESSIBILITY
        </AccessibleText>
        <View key={`device-description-${fontScale}`} style={styles.deviceDescriptionContainer}>
          <AccessibleText
            boldTextEnabled={accessibilityPreferences.boldTextEnabled}
            allowFontScaling={false}
            style={[styles.deviceSectionDescription, increasedContrast && styles.secondaryTextHighContrast,
              {
                fontSize: 13 * fontSize * fontScale,
                lineHeight: Math.ceil(19 * fontSize * fontScale),
              }]}
          >
            Enabled device preferences always apply. You can enable additional preferences in MapQP. Your choices are saved independently.
          </AccessibleText>
        </View>
        <View style={[styles.settingsCard, styles.deviceSettingsCard,
          increasedContrast && styles.settingsCardHighContrast]}>
          <View style={styles.deviceSettingRow} accessible accessibilityRole="text"
            accessibilityLabel={`Screen reader, ${deviceSettingValue("screenReaderEnabled")}. Controlled by your device.`}>
            <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
              maxFontSizeMultiplier={2.5}
              style={[styles.settingTitle, styles.deviceSettingTitle, { fontSize: 16 * fontSize }]}>
              Screen Reader
            </AccessibleText>
            <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
              maxFontSizeMultiplier={2.5}
              style={[...deviceSettingStyles("screenReaderEnabled"), { fontSize: 14 * fontSize }]}>
              {deviceSettingValue("screenReaderEnabled")}
            </AccessibleText>
          </View>
          <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
            maxFontSizeMultiplier={2.5}
            style={[styles.deviceSectionDescription, increasedContrast && styles.secondaryTextHighContrast,
              { fontSize: 13 * fontSize }]}>
            VoiceOver and TalkBack are controlled in device settings. MapQP always keeps screen-reader support active.
          </AccessibleText>
          {ACCESSIBILITY_CONTROLS.map(({ label, preference, devicePreference }) => {
            const detectedPreference = preference === "increaseContrastEnabled" && Platform.OS === "android"
              ? "highTextContrastEnabled" : devicePreference;
            const control = accessibilityControlState(deviceAccessibility, detectedPreference,
              savedAccessibilityPreferences[preference], settingsLoaded);
            return (
              <View key={preference}>
                <Divider />
                <View style={[styles.deviceSettingRow, styles.accessibilitySourceRow,
                  stackControls && styles.accessibilitySourceRowStacked]}>
                  <View style={[styles.accessibilitySourceLabel,
                    stackControls && styles.accessibilitySourceLabelStacked]} accessible={false}>
                    <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                      maxFontSizeMultiplier={2.5} accessible={false}
                      style={[styles.settingTitle, styles.wrappingLabel, { fontSize: 16 * fontSize }]}>
                      {label}
                    </AccessibleText>
                    <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                      maxFontSizeMultiplier={2.5} accessible={false}
                      style={[styles.deviceSectionDescription, increasedContrast && styles.secondaryTextHighContrast,
                        { fontSize: 13 * fontSize }]}>
                      {control.explanation}
                    </AccessibleText>
                  </View>
                  <Switch
                    style={stackControls ? styles.stackedSwitch : undefined}
                    value={control.enabled}
                    disabled={control.disabled}
                    onValueChange={(enabled) => {
                      if (!control.disabled) setAccessibilityPreference(preference, enabled);
                    }}
                    accessibilityRole="switch"
                    accessibilityLabel={label}
                    accessibilityValue={{ text: control.explanation }}
                    accessibilityState={{ checked: control.enabled, disabled: control.disabled }}
                    accessibilityHint={control.disabled ? undefined : "Changes only your saved MapQP preference"}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* About / Route Version Info */}
        <Text style={[styles.sectionLabel, { fontSize: 12 * fontSize }]}>
          ABOUT
        </Text>

        <View style={styles.settingsCard}>
          <View style={styles.infoRow}>
            <Text style={[styles.settingTitle, { fontSize: 16 * fontSize }]}>
              Route Data Version
            </Text>
            <Text style={[styles.infoValue, { fontSize: 15 * fontSize }]}>
              v{mapVersion}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.landingButton}
          onPress={returnToLandingPage}
          accessibilityRole="button"
          accessibilityLabel="Back to landing page"
          accessibilityHint="Leaves navigation and returns to the landing page"
        >
          <AccessibleText
            boldTextEnabled={accessibilityPreferences.boldTextEnabled}
            key={`settings-text-31-${fontScale}`}
            maxFontSizeMultiplier={2.5}
            style={[styles.landingButtonText, { fontSize: 15 * fontSize }]}
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
          <AccessibleText
            boldTextEnabled={accessibilityPreferences.boldTextEnabled}
            key={`settings-text-32-${fontScale}`}
            style={[styles.deleteStorageText, { fontSize: 15 * fontSize }]}
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
    color: "#761723",
  },
  deviceSectionLabel: {
    color: "#064C52",
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
  infoRow: {
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoValue: {
    fontWeight: "600",
    color: "#6B7280",
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  accessibilitySourceRow: {
    paddingVertical: 14,
  },
  accessibilitySourceRowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  accessibilitySourceLabel: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 220,
    minWidth: 0,
    maxWidth: "100%",
  },
  accessibilitySourceLabelStacked: {
    flexBasis: "auto",
    flexGrow: 0,
    width: "100%",
  },
  stackedSwitch: {
    alignSelf: "flex-start",
  },
  wrappingLabel: {
    width: "100%",
    paddingVertical: 2,
  },
  deviceSettingTitle: {
    flex: 1,
    flexBasis: "50%",
    flexShrink: 1,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#F1F2F4",
    borderRadius: 10,
    padding: 3,
    marginTop: 12,
  },
  segmentedControlStacked: {
    flexDirection: "column",
  },
  segmentButtonStacked: {
    flex: 0,
    flexBasis: "auto",
    width: "100%",
  },
  segmentedControlHighContrast: {
    backgroundColor: "#F4E0E3",
    borderWidth: 2,
    borderColor: "#111827",
  },
  segmentButton: {
    flex: 1,
    minWidth: 0,
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
    width: "100%",
    paddingVertical: 2,
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
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  deviceValue: {
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
    maxWidth: "100%",
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
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#F9E5E7",
    borderWidth: 1,
    borderColor: "#E8B7BC",
    borderRadius: 12,
  },
  landingButtonText: {
    width: "100%",
    maxWidth: "100%",
    textAlign: "center",
    paddingVertical: 2,
    color: "#761723",
    fontSize: 15,
    fontWeight: "700",
  },
  deleteStorageButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    alignItems: "center",
    borderColor: "#B42318",
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: "#FFF0EE",
    marginTop: 12,
    paddingVertical: 13,
  },
  deleteStorageText: {
    width: "100%",
    maxWidth: "100%",
    textAlign: "center",
    paddingVertical: 2,
    color: "#B42318",
    fontSize: 15,
    fontWeight: "700",
  },
});
