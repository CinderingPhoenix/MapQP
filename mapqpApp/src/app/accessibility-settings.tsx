import Slider from "@react-native-community/slider";
import { router, useFocusEffect, useLocalSearchParams, useNavigation, type NativeStackNavigationProp } from "expo-router";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  AccessibilityInfo, Platform, ScrollView, StyleSheet, Switch, Text,
  TouchableOpacity, View, type TextProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings, type AccessibilityPreference } from "../context/settings-context";
import { accessibilityControlState, useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
import type { DeviceAccessibilityPreference } from "../hooks/use-device-accessibility";
import { useAuthGuard } from "../hooks/use-auth-guard";
import SettingsTabs from "../components/settings-tabs";

// Stable component identity keeps native text and focus intact during updates.
function SettingsText({ style, ...props }: TextProps) {
  const { fontSize } = useSettings();
  const { boldTextEnabled } = useAccessibilityPreferences();
  return <Text {...props} style={[styles.text, { fontSize: 16 * fontSize },
    boldTextEnabled && styles.bold, style]} />;
}

export default function AccessibilitySettingsPage() {
  useAuthGuard();
  const { fontSize, setFontSize, deviceAccessibility, customAccessibilityPreferences,
    settingsLoaded, setAccessibilityPreference } = useSettings();
  const preferences = useAccessibilityPreferences();
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
  const headingRef = useRef<React.ElementRef<typeof Text>>(null);
  const { from, accessibilityVisited } = useLocalSearchParams<{ from?: string; accessibilityVisited?: string }>();
  const focusHandled = useRef(accessibilityVisited === "true");
  const transitionReady = useRef(Platform.OS === "web");
  const [transitionComplete, setTransitionComplete] = useState(Platform.OS === "web");
  const [headingReady, setHeadingReady] = useState(false);

  useLayoutEffect(() => {
    const start = navigation.addListener("transitionStart", () => {
      transitionReady.current = false;
      setTransitionComplete(false);
    });
    const end = navigation.addListener("transitionEnd", (event) => {
      if (!event.data.closing) {
        transitionReady.current = true;
        setTransitionComplete(true);
      }
    });
    return () => { start(); end(); };
  }, [navigation]);

  useFocusEffect(useCallback(() => {
    if (!headingReady || !transitionComplete || !preferences.loaded || focusHandled.current) return;
    if (!preferences.screenReaderEnabled) {
      focusHandled.current = true;
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (!transitionReady.current || focusHandled.current || !headingRef.current) return;
      focusHandled.current = true;
      AccessibilityInfo.sendAccessibilityEvent(headingRef.current, "focus");
    });
    return () => cancelAnimationFrame(frame);
  }, [headingReady, transitionComplete, preferences.loaded, preferences.screenReaderEnabled]));

  const adjustTextSize = (change: number) =>
    setFontSize(Math.max(0.8, Math.min(1.8, Math.round((fontSize + change) * 10) / 10)));
  const headingStyle = [styles.sectionHeading, { fontSize: 21 * fontSize }];
  const increasedContrast = preferences.darkerSystemColorsEnabled || preferences.highTextContrastEnabled;
  const offTrack = increasedContrast ? "#333333" : "#595959";
  const onTrack = increasedContrast ? "#760F20" : "#A6192E";

  const preferenceControl = (label: string, preference: AccessibilityPreference,
    devicePreference: DeviceAccessibilityPreference) => {
    const control = accessibilityControlState(deviceAccessibility, devicePreference,
      customAccessibilityPreferences[preference], settingsLoaded);
    return <View key={preference} style={styles.preference}>
      <SettingsText style={styles.bold}>{label}</SettingsText>
      <SettingsText style={styles.description}>{control.explanation}</SettingsText>
      <View style={styles.switchRow}>
        <SettingsText>{control.enabled ? "On" : "Off"}</SettingsText>
        <View style={[styles.switchTarget, increasedContrast && styles.switchTargetHighContrast]}>
          <Switch value={control.enabled} disabled={control.disabled} hitSlop={10}
            onValueChange={(enabled) => {
              if (!control.disabled) setAccessibilityPreference(preference, enabled);
            }}
            trackColor={{ false: offTrack, true: onTrack }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={control.enabled ? onTrack : offTrack}
            accessibilityRole="switch" accessibilityLabel={label}
            accessibilityValue={{ text: control.explanation }}
            accessibilityState={{ checked: control.enabled, disabled: control.disabled }}
            accessibilityHint={control.disabled ? control.explanation : "Changes only your saved MapQP preference"} />
        </View>
      </View>
    </View>;
  };

  const readerStatus = deviceAccessibility.detectionStatus.screenReaderEnabled;
  const readerValue = readerStatus === "loading" ? "Loading" : readerStatus === "unavailable"
    ? "Unavailable" : deviceAccessibility.screenReaderEnabled ? "On" : "Off";

  return <SafeAreaView style={styles.container}>
    <ScrollView>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}
          accessibilityRole="button" accessibilityLabel={from ? "Back to navigation" : "Back to previous screen"}>
          <SettingsText style={styles.backText}>Back</SettingsText>
        </TouchableOpacity>
        <Text ref={headingRef} onLayout={(event) => setHeadingReady(event.nativeEvent.layout.height > 0)}
          accessibilityRole="header" style={[styles.pageHeading, { fontSize: 24 * fontSize }]}>
          Accessibility Settings
        </Text>
      </View>
      <View style={styles.content}>
        <SettingsTabs active="accessibility" />
        <SettingsText accessibilityRole="header" style={headingStyle}>Visual Accessibility</SettingsText>
        <View style={styles.card}>
          <View style={styles.preference}>
            <SettingsText style={styles.bold}>Text Size</SettingsText>
            <SettingsText>{Math.round(fontSize * 100)}%</SettingsText>
            <View accessible accessibilityRole="adjustable" accessibilityLabel="Text size"
              accessibilityValue={{ min: 80, max: 180, now: Math.round(fontSize * 100), text: `${Math.round(fontSize * 100)} percent` }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "increment") adjustTextSize(0.1);
                if (event.nativeEvent.actionName === "decrement") adjustTextSize(-0.1);
              }}>
              <Slider style={styles.slider} minimumValue={0.8} maximumValue={1.8} step={0.1}
                value={fontSize} onValueChange={setFontSize} minimumTrackTintColor="#A6192E"
                thumbTintColor="#A6192E" accessible={false} importantForAccessibility="no-hide-descendants" />
            </View>
            <View style={styles.sizeButtons}>
              {([-0.1, 0.1] as const).map((change) => {
                const disabled = change < 0 ? fontSize <= 0.8 : fontSize >= 1.8;
                const label = change < 0 ? "Decrease text size" : "Increase text size";
                return <TouchableOpacity key={change} style={styles.sizeButton} disabled={disabled}
                  onPress={() => adjustTextSize(change)} accessibilityRole="button"
                  accessibilityLabel={label} accessibilityState={{ disabled }}>
                  <SettingsText style={disabled ? styles.disabledText : styles.buttonText}>{label}</SettingsText>
                </TouchableOpacity>;
              })}
            </View>
          </View>
          {preferenceControl("Bold Text", "boldTextEnabled", "boldTextEnabled")}
          {preferenceControl("Increase Contrast", "increaseContrastEnabled",
            Platform.OS === "android" ? "highTextContrastEnabled" : "darkerSystemColorsEnabled")}
          {preferenceControl("Reduce Transparency", "reduceTransparencyEnabled", "reduceTransparencyEnabled")}
        </View>
        <SettingsText accessibilityRole="header" style={headingStyle}>Interaction and Motion</SettingsText>
        <View style={styles.card}>
          {preferenceControl("Reduce Motion", "reduceMotionEnabled", "reduceMotionEnabled")}
        </View>
        <SettingsText accessibilityRole="header" style={headingStyle}>Device Support</SettingsText>
        <View style={styles.card}>
          <View style={styles.preference}>
            <View accessible accessibilityRole="text"
              accessibilityLabel={`Screen Reader, ${readerValue}. Controlled by your device.`}>
              <SettingsText style={styles.bold}>Screen Reader</SettingsText>
              <SettingsText>{readerValue}</SettingsText>
            </View>
            <SettingsText style={styles.description}>
              Screen Reader is controlled through your device's accessibility settings.
            </SettingsText>
          </View>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F5F8" },
  header: { padding: 16, paddingBottom: 24, backgroundColor: "#AC2B37",
    borderBottomWidth: 2, borderColor: "#761723" },
  backButton: { minHeight: 48, minWidth: 48, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 12 },
  backText: { color: "#FFFFFF", fontWeight: "700" },
  pageHeading: { color: "#FFFFFF", fontWeight: "800", flexShrink: 1 },
  content: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 40,
    width: "100%", maxWidth: 760, alignSelf: "center" },
  text: { color: "#171717", flexShrink: 1 },
  bold: { fontWeight: "700" },
  introduction: { marginBottom: 28, padding: 16, backgroundColor: "#F9E5E7",
    borderLeftWidth: 5, borderLeftColor: "#AC2B37", borderRadius: 12 },
  sectionHeading: { fontWeight: "800", color: "#FFFFFF", backgroundColor: "#761723",
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 9, marginBottom: 12 },
  card: { borderWidth: 2, borderLeftWidth: 5, borderColor: "#AC2B37", borderRadius: 18,
    backgroundColor: "#FFF7F7", marginBottom: 32, overflow: "hidden" },
  preference: { padding: 20, gap: 14, borderBottomWidth: 1, borderBottomColor: "#B46C76" },
  description: { color: "#333333" },
  switchRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  switchTarget: { minHeight: 48, minWidth: 72, paddingHorizontal: 8, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#595959", borderRadius: 10, backgroundColor: "#F2F2F2" },
  switchTargetHighContrast: { borderWidth: 2, borderColor: "#171717" },
  slider: { width: "100%", height: 48 },
  sizeButtons: { gap: 12 },
  sizeButton: { minHeight: 48, justifyContent: "center", padding: 14, borderWidth: 2,
    borderColor: "#AC2B37", borderRadius: 12, backgroundColor: "#F9E5E7" },
  buttonText: { color: "#8C1426", fontWeight: "700" },
  disabledText: { color: "#595959" },
});
