import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Slider from "@react-native-community/slider";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  type SwitchProps,
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

type SettingsIconName = keyof typeof MaterialCommunityIcons.glyphMap | "reduce-motion";

const ACCESSIBILITY_CONTROLS: {
  label: string; preference: AccessibilityPreference; devicePreference: DeviceAccessibilityPreference;
  icon: SettingsIconName;
  description: string;
}[] = [
  { label: "Reduce Motion", preference: "reduceMotionEnabled", devicePreference: "reduceMotionEnabled", icon: "reduce-motion", description: "Reduces animations and movement in MapQP." },
  { label: "Bold Text", preference: "boldTextEnabled", devicePreference: "boldTextEnabled", icon: "format-bold", description: "Makes supported app text thicker and easier to read." },
  { label: "Increase Contrast", preference: "increaseContrastEnabled", devicePreference: "darkerSystemColorsEnabled", icon: "contrast-circle", description: "Increases contrast in supported interface elements to make them easier to distinguish." },
  { label: "Reduce Transparency", preference: "reduceTransparencyEnabled", devicePreference: "reduceTransparencyEnabled", icon: "layers-outline", description: "Uses opaque backgrounds in supported interface elements to improve readability." },
];

// Each appearance exposes one switch target; decoration never becomes a focus stop.
function SettingsSwitch({ style, disabled, ...props }: SwitchProps) {
  const { settingsAppearance, fontSize } = useSettings();
  const accessibleAppearance = settingsAppearance === "accessible";
  const { boldTextEnabled } = useAccessibilityPreferences();
  if (accessibleAppearance) {
    const activate = () => {
      if (!disabled) props.onValueChange?.(!props.value);
    };
    // A single pressable switch target owns both touch and assistive activation.
    // Draw the visual ourselves so native disabled opacity cannot wash out the track.
    return <TouchableOpacity accessible accessibilityRole="switch"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      accessibilityValue={props.accessibilityValue}
      accessibilityState={{ ...props.accessibilityState, checked: !!props.value, disabled: !!disabled }}
      disabled={disabled} onPress={activate} activeOpacity={1}
      style={[style, accessibleStyles.switchControl, disabled && accessibleStyles.switchControlReadOnly]}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        pointerEvents="none" style={[accessibleStyles.switchTrack,
          props.value ? accessibleStyles.switchTrackOn : accessibleStyles.switchTrackOff]}>
        <View style={accessibleStyles.switchThumb} />
      </View>
      <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        pointerEvents="none" style={[accessibleStyles.switchStateLabel, { fontSize: 16.25 * fontSize }]}>
        {`${props.value ? "On" : "Off"}${disabled ? " (read only)" : ""}`}
      </Text>
    </TouchableOpacity>;
  }
  return <TouchableOpacity accessible accessibilityRole="switch"
    accessibilityLabel={props.accessibilityLabel}
    accessibilityHint={props.accessibilityHint}
    accessibilityValue={props.accessibilityValue}
    accessibilityState={{ ...props.accessibilityState, checked: !!props.value, disabled: !!disabled }}
    disabled={disabled} activeOpacity={1}
    onPress={() => { if (!disabled) props.onValueChange?.(!props.value); }}
    style={[style, standardSwitchStyles.control]}>
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      pointerEvents="none" style={[standardSwitchStyles.track,
        props.value ? standardSwitchStyles.on : standardSwitchStyles.off,
        disabled && standardSwitchStyles.readOnly]}>
      <View style={standardSwitchStyles.thumb} />
    </View>
    <AccessibleText boldTextEnabled={boldTextEnabled} accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" pointerEvents="none"
      style={[standardSwitchStyles.label, { fontSize: 14 * fontSize }]}>
      {`${props.value ? "On" : "Off"}${disabled ? " (read only)" : ""}`}
    </AccessibleText>
  </TouchableOpacity>;
}

const KEYS_TO_DELETE = [
  "mapqp_microsoft_session",
  "mapqp_temp_code_session",
  "mapqp_temp_code_expires_at",
  "wpi_map_last_location",
];

// Keep the component type stable when accessibility preferences change.
function AccessibleText({ boldTextEnabled, style, ...props }: TextProps & { boldTextEnabled: boolean }) {
  return <Text {...props} style={[style, boldTextEnabled && standardStyles.boldTextOverride]} />;
}

// Hints already describe these controls to screen readers. This copy is visual only.
function SettingDescription({ children }: { children: string }) {
  const { settingsAppearance, fontSize } = useSettings();
  const preferences = useAccessibilityPreferences();
  if (settingsAppearance !== "accessible") return null;
  const size = 13 * fontSize * 1.25;
  return <AccessibleText boldTextEnabled={preferences.boldTextEnabled} accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[accessibleStyles.description, { fontSize: size, lineHeight: Math.ceil(size * 1.5) }]}>
    {children}
  </AccessibleText>;
}

function SelectionIndicator({ selected }: { selected: boolean }) {
  const { settingsAppearance } = useSettings();
  if (settingsAppearance !== "accessible") return null;
  // Reserve the same space on both options to avoid shifts when selection changes.
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={accessibleStyles.selectionIndicator}>
    <MaterialCommunityIcons name="check" size={24} color="#FFFFFF" allowFontScaling={false}
      accessible={false} style={{ opacity: selected ? 1 : 0 }} />
  </View>;
}

// Icons supplement the labels and must not become assistive-navigation targets.
function SettingIcon({ name }: {
  name: SettingsIconName; highContrast: boolean;
}) {
  const { fontSize: textSizeMultiplier } = useSettings();
  const iconSize = Math.max(20, Math.min(30, Math.round(22 * textSizeMultiplier)));
  const stroke = iconSize * 0.055;
  const circleRadius = iconSize * 0.25;
  const dotSize = iconSize * 0.06;
  const circleDiameter = circleRadius * 2 + stroke;
  return <View style={[standardStyles.settingIcon, { width: iconSize + 2, height: iconSize + 2 }]}
    accessible={false} pointerEvents="none"
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {name === "reduce-motion" ? (
      <View style={[standardStyles.reduceMotionTile, { width: iconSize, height: iconSize, borderRadius: iconSize * 0.22 }]}>
        {/* Equal angular steps place identical dots on a circular centerline. */}
        {Array.from({ length: 16 }, (_, index) => {
          const angle = index * Math.PI * 2 / 16;
          return <View key={index} style={[standardStyles.reduceMotionDot, {
            width: dotSize, height: dotSize, borderRadius: dotSize / 2,
            left: iconSize * 0.35 + circleRadius * Math.cos(angle) - dotSize / 2,
            top: iconSize * 0.5 + circleRadius * Math.sin(angle) - dotSize / 2,
          }]} />;
        })}
        <View style={[standardStyles.reduceMotionCircle, {
          width: circleDiameter, height: circleDiameter,
          left: iconSize * 0.65 - circleDiameter / 2, top: (iconSize - circleDiameter) / 2,
          borderRadius: circleDiameter / 2, borderWidth: stroke,
        }]} />
      </View>
    ) : (
      <View style={[standardStyles.accessibilityIconTile, {
        width: iconSize, height: iconSize, borderRadius: iconSize * 0.22,
        backgroundColor: name === "stairs" ? "#C45100" : name === "compass" ? "#B32635" : name === "navigation" ? "#7950B2"
          : name === "contrast-circle" || name === "layers-outline" ? "#636366" : "#007AFF",
      }]}>
        <MaterialCommunityIcons name={name} size={Math.round(iconSize * 0.78)} color="#FFFFFF"
          accessible={false} allowFontScaling={false} />
      </View>
    )}
  </View>;
}

export default function SettingsPage() {
  useAuthGuard();
  const { fontScale, width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<"general" | "routing">("general");
  useFocusEffect(
    useCallback(() => {
      Speech.stop();
    }, [])
  );

  const {
    settingsAppearance,
    setSettingsAppearance,
    navigationMode,
    setNavigationMode,
    setHasSelectedMode,
    distanceUnits,
    setDistanceUnits,
    directionStyle,
    setDirectionStyle,
    avoidStairs,
    configureAvoidStairs,
    avoidIndoorRoutes,
    avoidInaccessibleCrosswalks,
    configureRoutingPreferences,
    resetAvoidStairsPreference,
    settingsReadSucceeded,
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
  const accessibleAppearance = settingsAppearance === "accessible";
  const styles = accessibleAppearance ? accessibleStyles : standardStyles;
  const displayFontSize = fontSize * (accessibleAppearance ? 1.25 : 1);
  const increasedContrast = accessibleAppearance ||
    accessibilityPreferences.darkerSystemColorsEnabled ||
    accessibilityPreferences.highTextContrastEnabled;

  const stackControls = width < 360 || displayFontSize * Math.min(fontScale, 2.5) >= 1.35;
  const stackPreferenceControls = accessibleAppearance || stackControls;
  // Estimate space for each label, the reserved icon, padding, and the option gap.
  // Short labels can stay side by side on wider screens even at larger text sizes.
  const selectorStacked = (longestLabel: number) => accessibleAppearance
    ? (width - 88) / 2 < longestLabel * 13 * displayFontSize * fontScale * 0.55 + 56
    : stackControls;
  const appearanceStacked = selectorStacked(10);
  const navigationStacked = selectorStacked(10);
  const distanceStacked = selectorStacked(7);
  const directionStacked = selectorStacked(7);
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
                resetAvoidStairsPreference();
                setFontSize(1);
                setSettingsAppearance("standard");
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
          style={[styles.headerTitle, { fontSize: 21 * displayFontSize }]}
        >
          Settings
        </AccessibleText>

        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.settingsTabs} accessibilityRole="tablist">
        {(["general", "routing"] as const).map((tab) => {
          const selected = activeTab === tab;
          const label = tab === "general" ? "General" : "Routing";
          return <TouchableOpacity key={tab} accessibilityRole="tab" accessibilityLabel={label}
            accessibilityState={{ selected }} onPress={() => setActiveTab(tab)}
            style={[styles.settingsTab, selected && styles.settingsTabSelected]}>
            <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled} accessible={false}
              style={[styles.settingsTabLabel, { fontSize: 17 * displayFontSize },
                selected && styles.settingsTabLabelSelected]}>
              {label}
            </AccessibleText>
          </TouchableOpacity>;
        })}
      </View>

      <ScrollView
        key={activeTab}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "general" ? <>
        <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
          accessibilityRole="header" style={[styles.sectionLabel, styles.interactiveSectionLabel,
            styles.sectionBandRed, { fontSize: 12 * displayFontSize }]}>
          Appearance
        </AccessibleText>
        <View style={[styles.settingsCard, styles.navigationCard,
          increasedContrast && styles.settingsCardHighContrast]}>
          <View style={styles.optionRow}>
            <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
              style={[styles.deviceSectionDescription, { fontSize: 13 * displayFontSize }]}>
              Choose how the Settings page is displayed. This does not affect your navigation mode.
            </AccessibleText>
            <View style={[styles.segmentedControl, appearanceStacked && styles.segmentedControlStacked,
              increasedContrast && styles.segmentedControlHighContrast]}>
              {(["standard", "accessible"] as const).map((appearance) => {
                const selected = settingsAppearance === appearance;
                const label = appearance === "standard" ? "Standard" : "Accessible";
                const disabled = !settingsLoaded || !settingsReadSucceeded;
                return <TouchableOpacity key={appearance} accessible accessibilityRole="button"
                  accessibilityLabel={`${label} Settings appearance`}
                  accessibilityHint={disabled ? "Settings appearance is unavailable until saved settings load successfully."
                    : `Displays Settings with ${appearance === "accessible" ? "larger text, stronger contrast, and more spacing" : "standard styling"}. Does not change navigation mode.`}
                  accessibilityState={{ selected, disabled }} disabled={disabled}
                  onPress={() => setSettingsAppearance(appearance)}
                  style={[styles.segmentButton, appearanceStacked && styles.segmentButtonStacked,
                    selected && styles.segmentButtonSelected]}>
                  <SelectionIndicator selected={selected} />
                  <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled} accessible={false}
                    style={[styles.segmentText, increasedContrast && styles.segmentTextHighContrast,
                      { fontSize: 13 * displayFontSize }, selected && styles.segmentTextSelected,
                      selected && styles.appearanceSelectionText]}>
                    {label}
                  </AccessibleText>
                </TouchableOpacity>;
              })}
            </View>
          </View>
        </View>
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
            { fontSize: 12 * displayFontSize },
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
            <View style={styles.settingLabelRow}>
              <SettingIcon name="compass" highContrast={increasedContrast} />
              <AccessibleText
                boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                key={`settings-text-3-${fontScale}`}
                maxFontSizeMultiplier={2.5}
                style={[styles.settingTitle, styles.iconLabelText, { fontSize: 16 * displayFontSize }]}
              >
                Navigation mode
              </AccessibleText>
            </View>
            <SettingDescription>Choose how MapQP guides you around campus.</SettingDescription>

            <View
              style={[
                styles.segmentedControl,
                navigationStacked && styles.segmentedControlStacked,
                styles.redSegmentTrack,
                increasedContrast && styles.segmentedControlHighContrast,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  navigationStacked && styles.segmentButtonStacked,
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
                <SelectionIndicator selected={navigationMode === "standard"} />
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-4-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
                    { fontSize: 13 * displayFontSize },
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
                  navigationStacked && styles.segmentButtonStacked,
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
                <SelectionIndicator selected={navigationMode === "accessibility"} />
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-5-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
                    { fontSize: 13 * displayFontSize },
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
            { fontSize: 12 * displayFontSize },
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
            <View style={styles.settingLabelRow}>
              <SettingIcon name="ruler" highContrast={increasedContrast} />
              <AccessibleText
                boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                key={`settings-text-7-${fontScale}`}
                maxFontSizeMultiplier={2.5}
                style={[styles.settingTitle, styles.iconLabelText, { fontSize: 16 * displayFontSize }]}
              >
                Distance units
              </AccessibleText>
            </View>
            <SettingDescription>Choose feet and miles or meters and kilometers.</SettingDescription>

            <View
              style={[
                styles.segmentedControl,
                distanceStacked && styles.segmentedControlStacked,
                styles.redSegmentTrack,
                increasedContrast && styles.segmentedControlHighContrast,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  distanceStacked && styles.segmentButtonStacked,
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
                <SelectionIndicator selected={distanceUnits === "imperial"} />
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-8-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
                    { fontSize: 13 * displayFontSize },
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
                  distanceStacked && styles.segmentButtonStacked,
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
                <SelectionIndicator selected={distanceUnits === "metric"} />
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-9-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
                    { fontSize: 13 * displayFontSize },
                    distanceUnits === "metric" &&
                      styles.segmentTextSelected,
                  ]}
                >
                  m / km
                </AccessibleText>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} accessible={false} />

          <View style={styles.optionRow}>
            <View style={styles.settingLabelRow}>
              <SettingIcon name="navigation" highContrast={increasedContrast} />
              <AccessibleText
                boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                key={`settings-text-10-${fontScale}`}
                maxFontSizeMultiplier={2.5}
                style={[styles.settingTitle, styles.iconLabelText, { fontSize: 16 * displayFontSize }]}
              >
                Direction style
              </AccessibleText>
            </View>
            <SettingDescription>Choose turn directions or turning angles in degrees.</SettingDescription>

            <View
              style={[
                styles.segmentedControl,
                directionStacked && styles.segmentedControlStacked,
                styles.redSegmentTrack,
                increasedContrast && styles.segmentedControlHighContrast,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  directionStacked && styles.segmentButtonStacked,
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
                <SelectionIndicator selected={directionStyle === "natural"} />
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-11-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
                    { fontSize: 13 * displayFontSize },
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
                  directionStacked && styles.segmentButtonStacked,
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
                <SelectionIndicator selected={directionStyle === "degrees"} />
                <AccessibleText
                  boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  key={`settings-text-12-${fontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.segmentText,
                    increasedContrast && styles.segmentTextHighContrast,
                    { fontSize: 13 * displayFontSize },
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
            { fontSize: 12 * displayFontSize },
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
            <View style={styles.settingLabelRow}>
              <SettingIcon name="format-size" highContrast={increasedContrast} />
              <AccessibleText
                boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                key={`settings-text-14-${fontScale}`}
                maxFontSizeMultiplier={2.5}
                style={[styles.settingTitle, styles.iconLabelText, { fontSize: 16 * displayFontSize }]}
              >
                Text size
              </AccessibleText>

            </View>
            <SettingDescription>Adjust the size of text displayed in MapQP.</SettingDescription>

            <View style={styles.sliderContainer}>
              <AccessibleText
                boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                key={`settings-text-15-${fontScale}`}
                maxFontSizeMultiplier={2.5}
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.smallA,
                  increasedContrast && styles.secondaryTextHighContrast,
                  { fontSize: 14 * displayFontSize },
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
                    ? "Adjusts the size of text displayed in MapQP. Swipe up or down to adjust text size"
                    : "Adjusts the size of text displayed in MapQP. Use the increase or decrease accessibility action to adjust text size"
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
                  style={{ flex: 1, height: accessibleAppearance ? 60 : 40 }}
                  minimumValue={0.8}
                  maximumValue={1.8}
                  step={0.1}
                  value={fontSize}
                  onValueChange={setFontSize}
                  minimumTrackTintColor="#6848A0"
                  maximumTrackTintColor="#D1D5DB"
                  thumbTintColor="#6848A0"
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              </View>

              <AccessibleText
                boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                key={`settings-text-16-${fontScale}`}
                maxFontSizeMultiplier={2.5}
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.largeA,
                  increasedContrast && styles.secondaryTextHighContrast,
                  { fontSize: 24 * displayFontSize },
                ]}
              >
                A
              </AccessibleText>
            </View>

            <AccessibleText
              boldTextEnabled={accessibilityPreferences.boldTextEnabled}
              key={`settings-text-17-${fontScale}`}
              maxFontSizeMultiplier={2.5}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.fontSizeValue,
                increasedContrast && styles.secondaryTextHighContrast,
                { fontSize: 12 * displayFontSize },
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
            { fontSize: 12 * displayFontSize },
          ]}
        >
          ACCESSIBILITY
        </AccessibleText>
        <View key={`device-description-${fontScale}`} style={styles.deviceDescriptionContainer}>
          <AccessibleText
            boldTextEnabled={accessibilityPreferences.boldTextEnabled}
            allowFontScaling={accessibleAppearance ? undefined : false}
            style={[styles.deviceSectionDescription, increasedContrast && styles.secondaryTextHighContrast,
              {
                fontSize: 13 * displayFontSize * (accessibleAppearance ? 1 : fontScale),
                lineHeight: Math.ceil(19 * displayFontSize * (accessibleAppearance ? 1 : fontScale)),
              }]}
          >
            Enabled device preferences always apply. You can enable additional preferences in MapQP. Your choices are saved independently.
          </AccessibleText>
        </View>
        <View style={[styles.settingsCard, styles.deviceSettingsCard,
          increasedContrast && styles.settingsCardHighContrast]}>
          <View style={styles.deviceSettingRow} accessible accessibilityRole="text"
            accessibilityHint="Provides spoken descriptions of interface elements to help you navigate without relying on sight. VoiceOver and TalkBack are controlled in device settings."
            accessibilityLabel={`Screen reader, ${deviceSettingValue("screenReaderEnabled")}. Controlled by your device.`}>
            <View style={[styles.settingLabelRow, styles.deviceSettingTitle]}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <SettingIcon name="account-voice" highContrast={increasedContrast} />
              <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                maxFontSizeMultiplier={2.5}
                style={[styles.settingTitle, styles.iconLabelText, { fontSize: 16 * displayFontSize }]}>
                Screen Reader
              </AccessibleText>
            <SettingDescription>Reads interface elements aloud.</SettingDescription>
            </View>
            <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
              maxFontSizeMultiplier={2.5}
              accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={[...deviceSettingStyles("screenReaderEnabled"), { fontSize: 14 * displayFontSize }]}>
              {deviceSettingValue("screenReaderEnabled")}
            </AccessibleText>
          </View>
          <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
            maxFontSizeMultiplier={2.5}
            style={[styles.deviceSectionDescription, increasedContrast && styles.secondaryTextHighContrast,
              { fontSize: 13 * displayFontSize }]}>
            VoiceOver and TalkBack are controlled in device settings. MapQP always keeps screen-reader support active.
          </AccessibleText>
          {ACCESSIBILITY_CONTROLS.map(({ label, preference, devicePreference, icon, description }) => {
            const detectedPreference = preference === "increaseContrastEnabled" && Platform.OS === "android"
              ? "highTextContrastEnabled" : devicePreference;
            const control = accessibilityControlState(deviceAccessibility, detectedPreference,
              savedAccessibilityPreferences[preference], settingsLoaded);
            const status = deviceAccessibility.detectionStatus[detectedPreference];
            const deviceControlled = deviceAccessibility[detectedPreference];
            // Native checked state conveys on/off; the value explains source and
            // detection availability, including when a switch cannot be edited.
            const sourceDescription = !settingsLoaded || status === "loading" ? control.explanation
              : deviceControlled ? (status === "unavailable"
                ? "Device status unavailable. Using the last detected device preference."
                : "Controlled by device settings.")
              : status === "unavailable" ? "Device status unavailable. Saved MapQP preference."
              : "Saved MapQP preference.";
            return (
              <View key={preference}>
                <View style={styles.divider} accessible={false} />
                <View style={[styles.deviceSettingRow, styles.accessibilitySourceRow,
                  stackPreferenceControls && styles.accessibilitySourceRowStacked]}>
                  <View style={[styles.accessibilitySourceLabel,
                    stackPreferenceControls && styles.accessibilitySourceLabelStacked]} accessible={false}
                    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <View style={styles.settingLabelRow}>
                      <SettingIcon name={icon} highContrast={increasedContrast} />
                      <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                        maxFontSizeMultiplier={2.5} accessible={false}
                        style={[styles.settingTitle, styles.wrappingLabel, { fontSize: 16 * displayFontSize }]}>
                        {label}
                      </AccessibleText>
                    </View>
                    <SettingDescription>{description}</SettingDescription>
                    <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                      maxFontSizeMultiplier={2.5} accessible={false}
                      style={[styles.deviceSectionDescription, increasedContrast && styles.secondaryTextHighContrast,
                        { fontSize: 13 * displayFontSize }]}>
                      {control.explanation}
                    </AccessibleText>
                  </View>
                  <SettingsSwitch
                    accessible importantForAccessibility="yes"
                    style={stackPreferenceControls ? styles.stackedSwitch : undefined}
                    value={control.enabled}
                    disabled={control.disabled}
                    onValueChange={(enabled) => {
                      if (!control.disabled) setAccessibilityPreference(preference, enabled);
                    }}
                    accessibilityRole="switch"
                    accessibilityLabel={label}
                    accessibilityValue={{ text: sourceDescription }}
                    accessibilityState={{ checked: control.enabled, disabled: control.disabled }}
                    accessibilityHint={`${description} ${deviceControlled ? "Change this preference in your device settings."
                      : control.disabled ? "This preference cannot be changed while settings are loading."
                      : "Changes only your saved MapQP preference."}`}
                  />
                </View>
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.landingButton, increasedContrast && styles.settingsCardHighContrast]}
          onPress={() => router.push("/report-bug")}
          accessibilityRole="button"
          accessibilityLabel="Report a Bug"
          accessibilityHint="Opens the bug reporting form. Submitting reports is not yet available."
        >
          <AccessibleText
            boldTextEnabled={accessibilityPreferences.boldTextEnabled}
            style={[styles.landingButtonText, { fontSize: 15 * displayFontSize }]}
          >
            Report a Bug
          </AccessibleText>
        </TouchableOpacity>

        {/* About / Route Version Info */}
        <Text style={[styles.sectionLabel, { fontSize: 12 * displayFontSize }]}>
          ABOUT
        </Text>

        <View style={styles.settingsCard}>
          <View style={styles.infoRow}>
            <Text style={[styles.settingTitle, { fontSize: 16 * displayFontSize }]}>
              Route Data Version
            </Text>
            <Text style={[styles.infoValue, { fontSize: 15 * displayFontSize }]}>
              v{mapVersion}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.landingButton}
          onPress={returnToLandingPage}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          accessibilityHint="Returns to the home screen."
        >
          <AccessibleText
            boldTextEnabled={accessibilityPreferences.boldTextEnabled}
            key={`settings-text-31-${fontScale}`}
            maxFontSizeMultiplier={2.5}
            style={[styles.landingButtonText, { fontSize: 15 * displayFontSize }]}
          >
            Back to Home
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
            style={[styles.deleteStorageText, { fontSize: 15 * displayFontSize }]}
          >
            Delete all local data
          </AccessibleText>
        </TouchableOpacity>
        </> : <View style={[styles.settingsCard, styles.preferencesCard,
          increasedContrast && styles.settingsCardHighContrast]}>
          <View style={[styles.deviceSettingRow, styles.accessibilitySourceRow,
            stackPreferenceControls && styles.accessibilitySourceRowStacked]}>
            <View style={[styles.accessibilitySourceLabel,
              stackPreferenceControls && styles.accessibilitySourceLabelStacked]} accessible={false}
              accessibilityElementsHidden={accessibleAppearance}
              importantForAccessibility={accessibleAppearance ? "no-hide-descendants" : "auto"}>
              <View style={styles.settingLabelRow}>
                <SettingIcon name="stairs" highContrast={increasedContrast} />
                <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  maxFontSizeMultiplier={2.5} accessible={false}
                  style={[styles.settingTitle, styles.wrappingLabel, { fontSize: 16 * displayFontSize }]}>
                  Avoid Stairs &amp; Use Accessible Entrances
                </AccessibleText>
              </View>
              <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                maxFontSizeMultiplier={2.5} accessible={false}
                style={[styles.deviceSectionDescription, increasedContrast && styles.secondaryTextHighContrast,
                  { fontSize: 13 * displayFontSize }]}>
                Uses paths and building entrances marked accessible in the map data.
                {"\n"}Changes apply when you start a new route.
                {navigationMode === "accessibility" && "\nAccessibility mode always uses accessible routing."}
              </AccessibleText>
            </View>
            <SettingsSwitch accessible importantForAccessibility="yes" style={stackPreferenceControls ? styles.stackedSwitch : undefined}
              value={avoidStairs} disabled={!settingsLoaded || !settingsReadSucceeded}
              onValueChange={(enabled) => { if (settingsLoaded && settingsReadSucceeded) void configureAvoidStairs(enabled).catch(() => Alert.alert("Could not save preference", "Please try changing the switch again.")); }}
              accessibilityRole="switch" accessibilityLabel="Avoid Stairs & Use Accessible Entrances"
              accessibilityState={{ checked: avoidStairs, disabled: !settingsLoaded || !settingsReadSucceeded }}
              accessibilityHint={"Uses paths and building entrances marked accessible in the map data. Changes apply when you start a new route." +
                (navigationMode === "accessibility" ? " Accessibility mode always uses accessible routing." : "")} />
          </View>
          {([
            { key: "avoidIndoorRoutes", icon: "office-building", label: "Avoid Indoor Navigation", value: avoidIndoorRoutes, description: "Excludes indoor walkways." },
            { key: "avoidInaccessibleCrosswalks", icon: "road-variant", label: "Avoid Inaccessible Road Crossings", value: avoidInaccessibleCrosswalks, description: "Allows road crossings marked accessible. Accessibility mode always enables this restriction." },
          ] as const).map(({ key, icon, label, value, description }) => (
            <View key={key} style={[styles.deviceSettingRow, styles.accessibilitySourceRow,
              stackPreferenceControls && styles.accessibilitySourceRowStacked]}>
              <View style={[styles.accessibilitySourceLabel, stackPreferenceControls && styles.accessibilitySourceLabelStacked]}
                accessibilityElementsHidden={accessibleAppearance}
                importantForAccessibility={accessibleAppearance ? "no-hide-descendants" : "auto"}>
                <View style={styles.settingLabelRow}>
                  <SettingIcon name={icon} highContrast={increasedContrast} />
                  <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                    style={[styles.settingTitle, styles.wrappingLabel, { fontSize: 16 * displayFontSize }]}>{label}</AccessibleText>
                </View>
                <AccessibleText boldTextEnabled={accessibilityPreferences.boldTextEnabled}
                  style={[styles.deviceSectionDescription, { fontSize: 13 * displayFontSize }]}>
                  {description}{"\n"}Changes apply when you start a new route.
                </AccessibleText>
              </View>
              <SettingsSwitch value={value} disabled={!settingsLoaded || !settingsReadSucceeded}
                style={stackPreferenceControls ? styles.stackedSwitch : undefined}
                accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={description}
                accessibilityState={{ checked: value, disabled: !settingsLoaded || !settingsReadSucceeded }}
                onValueChange={(enabled) => { void configureRoutingPreferences({ [key]: enabled }).catch(() =>
                  Alert.alert("Could not save preference", "Please try changing the switch again.")); }} />
            </View>
          ))}
        </View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const standardStyles = StyleSheet.create({
  appearanceSelectionText: { textDecorationLine: "underline" },
  settingsTabs: { flexDirection: "row", marginHorizontal: 18, marginTop: 16, padding: 4,
    gap: 4, borderWidth: 2, borderColor: "#761723", borderRadius: 12, backgroundColor: "#F9E5E7" },
  settingsTab: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 12, paddingHorizontal: 8,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent", borderRadius: 8 },
  settingsTabSelected: { backgroundColor: "#AC2B37", borderColor: "#761723" },
  settingsTabLabel: { color: "#761723", fontWeight: "600", textAlign: "center", flexShrink: 1 },
  settingsTabLabelSelected: { color: "#FFFFFF", fontWeight: "800", textDecorationLine: "underline" },
  accessibilityIconTile: { alignItems: "center", justifyContent: "center" },
  reduceMotionTile: { backgroundColor: "#30D158" },
  reduceMotionDot: { position: "absolute", backgroundColor: "#FFFFFF" },
  reduceMotionCircle: { position: "absolute", borderColor: "#FFFFFF" },
  settingLabelRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, minWidth: 0 },
  settingIcon: { flexShrink: 0, marginTop: 2,
    alignItems: "center", justifyContent: "center" },
  iconLabelText: { flex: 1, minWidth: 0 },
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
    flex: 1,
    minWidth: 0,
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

// One shared component tree and handler set; only these presentation tokens differ.
const accessibleStyles = StyleSheet.create({
  ...standardStyles,
  switchControl: { minWidth: 60, minHeight: 60, maxWidth: "100%", alignSelf: "flex-start",
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 12,
    borderWidth: 2, borderColor: "#111827", borderRadius: 12, backgroundColor: "#FFFFFF" },
  switchControlReadOnly: { borderStyle: "dashed", backgroundColor: "#F0F1F3" },
  switchTrack: { width: 64, height: 36, borderRadius: 18, borderWidth: 2,
    borderColor: "#111827", padding: 4, justifyContent: "center", flexShrink: 0 },
  switchTrackOff: { backgroundColor: "#4B5563", alignItems: "flex-start" },
  switchTrackOn: { backgroundColor: "#65101D", alignItems: "flex-end" },
  switchThumb: { width: 24, height: 24, borderRadius: 12, borderWidth: 1,
    borderColor: "#111827", backgroundColor: "#FFFFFF" },
  switchStateLabel: { color: "#111827", fontWeight: "900", flexShrink: 1 },
  // Match Settings' existing Bold Text override, the strongest numeric weight.
  // Use the native system font so the platform can resolve its heavy face.
  headerTitle: { ...standardStyles.headerTitle, fontWeight: "900" },
  backArrow: { ...standardStyles.backArrow, fontWeight: "900" },
  settingsTabLabelSelected: { ...standardStyles.settingsTabLabelSelected, fontWeight: "900" },
  deviceValue: { ...standardStyles.deviceValue, fontWeight: "900" },
  smallA: { ...standardStyles.smallA, fontWeight: "900" },
  largeA: { ...standardStyles.largeA, fontWeight: "900" },
  description: { color: "#111827", fontWeight: "900", width: "100%", marginTop: 6, marginBottom: 8, flexShrink: 1 },
  selectionIndicator: { width: 24, height: 24, flexShrink: 0 },
  // Keep one card outline; section bands and option outlines establish the hierarchy.
  settingsCardHighContrast: { ...standardStyles.settingsCardHighContrast, borderWidth: 1, borderLeftWidth: 1 },
  segmentedControlHighContrast: { ...standardStyles.segmentedControlHighContrast,
    backgroundColor: "transparent", borderWidth: 0 },
  sectionBandRed: { ...standardStyles.sectionBandRed, borderLeftWidth: 0 },
  sectionBandPurple: { ...standardStyles.sectionBandPurple, borderLeftWidth: 0 },
  sectionBandTeal: { ...standardStyles.sectionBandTeal, borderLeftWidth: 0 },
  container: { ...standardStyles.container, backgroundColor: "#FFFFFF" },
  header: { ...standardStyles.header, backgroundColor: "#65101D", paddingVertical: 18 },
  scrollContent: { ...standardStyles.scrollContent, paddingTop: 12, paddingBottom: 40 },
  sectionLabel: { ...standardStyles.sectionLabel, color: "#111827", fontWeight: "900", marginTop: 16, marginBottom: 8 },
  settingTitle: { ...standardStyles.settingTitle, color: "#111827", fontWeight: "900", marginBottom: 8 },
  deviceSectionDescription: { ...standardStyles.deviceSectionDescription, color: "#111827", fontWeight: "900", marginTop: 4 },
  infoValue: { ...standardStyles.infoValue, color: "#111827", fontWeight: "900" },
  fontSizeValue: { ...standardStyles.fontSizeValue, color: "#111827", fontWeight: "900" },
  optionRow: { ...standardStyles.optionRow, paddingVertical: 16 },
  infoRow: { ...standardStyles.infoRow, paddingVertical: 16, flexWrap: "wrap", gap: 12 },
  accessibilitySourceRow: { ...standardStyles.accessibilitySourceRow, paddingVertical: 16 },
  deviceSettingRow: { ...standardStyles.deviceSettingRow, minHeight: 72, paddingVertical: 16, gap: 10 },
  segmentedControl: { ...standardStyles.segmentedControl, marginTop: 12, gap: 12, padding: 0, backgroundColor: "transparent" },
  segmentButton: { ...standardStyles.segmentButton, flexDirection: "row", gap: 8, minHeight: 60, paddingVertical: 18, paddingHorizontal: 12,
    borderWidth: 2, borderColor: "#65101D" },
  segmentButtonSelected: { ...standardStyles.segmentButtonSelected, backgroundColor: "#65101D" },
  segmentText: { ...standardStyles.segmentText, color: "#111827", fontWeight: "900", width: "auto", flexShrink: 1 },
  segmentTextSelected: { ...standardStyles.segmentTextSelected, textDecorationLine: "underline" },
  settingsTabs: { ...standardStyles.settingsTabs, backgroundColor: "#FFFFFF", borderWidth: 0, gap: 12 },
  settingsTab: { ...standardStyles.settingsTab, minHeight: 60, paddingVertical: 18, borderColor: "#65101D" },
  settingsTabSelected: { ...standardStyles.settingsTabSelected, backgroundColor: "#65101D", borderColor: "#111827" },
  settingsTabLabel: { ...standardStyles.settingsTabLabel, color: "#65101D", fontWeight: "900" },
  sliderRow: { ...standardStyles.sliderRow, paddingVertical: 18 },
  slider: { ...standardStyles.slider, height: 60 },
  landingButton: { ...standardStyles.landingButton, minHeight: 60, paddingVertical: 20, borderWidth: 2, borderColor: "#65101D" },
  landingButtonText: { ...standardStyles.landingButtonText, color: "#65101D", fontWeight: "900" },
  deleteStorageButton: { ...standardStyles.deleteStorageButton, minHeight: 60, paddingVertical: 20, borderWidth: 2, borderColor: "#801A12" },
  deleteStorageText: { ...standardStyles.deleteStorageText, color: "#801A12", fontWeight: "900" },
  divider: { ...standardStyles.divider, backgroundColor: "#111827", height: 2 },
});

// Compact control styling for Standard; its cards, rows and typography stay unchanged.
const standardSwitchStyles = StyleSheet.create({
  control: { minWidth: 56, minHeight: 48, maxWidth: "100%", flexShrink: 1, alignSelf: "flex-start",
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingVertical: 6 },
  track: { width: 56, height: 32, flexShrink: 0, borderRadius: 16, borderWidth: 2,
    borderColor: "#111827", padding: 3, justifyContent: "center" },
  off: { backgroundColor: "#4B5563", alignItems: "flex-start" },
  on: { backgroundColor: "#166534", alignItems: "flex-end" },
  readOnly: { borderStyle: "dashed" },
  thumb: { width: 22, height: 22, borderRadius: 11, borderWidth: 1,
    borderColor: "#111827", backgroundColor: "#FFFFFF" },
  label: { color: "#111827", fontWeight: "700", flexShrink: 1 },
});
