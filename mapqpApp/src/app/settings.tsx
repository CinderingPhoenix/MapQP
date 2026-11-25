import { Accordion as SettingsAccordion, HEADER_ICONS, SETTINGS_SECTION_TITLES, type HeaderIcon } from "../components/settings/settings-accordion";
import { ColorVisionSetting, ColorVisionDialog, useColorVisionDialog } from "../components/settings/color-vision-setting";
import { useSettingsPalette, useSettingsColors, useSettingsStyles } from "../hooks/use-settings-theme";
import { ThemeSetting, SettingsThemeDialog, SettingsStatusBar } from "../components/settings/theme-setting";
import { PreferenceIcon } from "../components/settings/preference-icon";
import { AccessibleSettings } from "../components/settings/accessible-settings";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Slider from "@react-native-community/slider";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  AccessibilityInfo,
  Modal,
  Platform,
  ScrollView,
  type SwitchProps,
  StyleSheet,
  Text,
  type AccessibilityActionEvent,
  type TextProps,
  type TextStyle,
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
import { openUserStudySurvey } from "../utils/user-study-survey";
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
];

const KEYS_TO_DELETE = [
  "mapqp_tutorial_shown_once",
  "mapqp_microsoft_session",
  "mapqp_access_token",
  "mapqp_temp_code_session",
  "mapqp_temp_code_expires_at",
  "wpi_map_last_location",
];

export default function SettingsPage() {
  const navigation = useNavigation();
  useAuthGuard();
  useFocusEffect(
    useCallback(() => {
      Speech.stop();
    }, [])
  );

  const {
    settingsAppearance,
    setSettingsAppearance, 
    setColorVisionPreset,
    setThemePreference,
    setBatterySaverEnabled,
    navigationMode,
    setNavigationMode,
    setHasSelectedMode,
    setDistanceUnits,
    setDirectionStyle,
    resetAvoidStairsPreference,
    fontSize,
    setFontSize,
    settingsLoaded,
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

  const accessibleAppearance = settingsAppearance === "accessible";

  // Mount the selected map behind Settings; the stack's eventual replace reuses
  // this preloaded route, including its WebView, instead of starting it on exit.
  useEffect(() => {
    if (!settingsLoaded) return;
    router.prefetch(navigationMode === "accessibility"
      ? "/accessibility-navigation" : "/standard-navigation");
  }, [navigationMode, settingsLoaded]);

  const changeNavigationMode = (mode: "standard" | "accessibility") => {
    Speech.stop();
    setNavigationMode(mode);
    const state = navigation.getState();
    if (!state) return;
    const settingsIndex = state.index;
    const source = state.routes[settingsIndex - 1];
    const target = mode === "standard" ? "standard-navigation" : "accessibility-navigation";
    if (state.routes[settingsIndex]?.name === "settings" && source &&
        (source.name === "standard-navigation" || source.name === "accessibility-navigation") &&
        source.name !== target) {
      navigation.dispatch({
        type: "REPLACE", target: state.key, source: source.key,
        payload: { name: target },
      });
    }
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
                setColorVisionPreset("default");
                setThemePreference("light");
                setBatterySaverEnabled(false);
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

  // Standard keeps its existing Signal presentation, state and handlers.
  if (!accessibleAppearance) return <SignalSettings
    from={from} mapVersion={mapVersion}
    onBack={handleBackFromSettings} onHome={returnToLandingPage}
    onDelete={deleteLocalStorage} onNavigationModeChange={changeNavigationMode}
    onFontSizeAccessibilityAction={handleFontSizeAccessibilityAction}
  />;

  return <AccessibleSettings mapVersion={mapVersion}
    onBack={handleBackFromSettings} onHome={returnToLandingPage}
    onDelete={deleteLocalStorage} onNavigationModeChange={changeNavigationMode}
    onFontSizeAccessibilityAction={handleFontSizeAccessibilityAction}
    accessibilityControls={ACCESSIBILITY_CONTROLS} />;
}

// Signal is intentionally separate from standardStyles: Accessible appearance
// inherits those legacy styles, so changing them would also change Accessible.
const BASE_SIGNAL = {
  background: "#F7F6F2", heading: "#000000", ink: "#000000", muted: "#000000", status: "#000000",
  divider: "#D0CDC9", accent: "#741B2B", off: "#686868", outline: "#686868",
  disabled: "#E0DDD7",
} as const;

// Standard-only visual overrides. Effective settings remain owned by the
// existing resolver; no saved values or shared Accessible styles are changed.
function useSignalContrast() {
  const preferences = useAccessibilityPreferences();
  return preferences.darkerSystemColorsEnabled || preferences.highTextContrastEnabled;
}

function useSignalStyles() {
  const signalStyles = useSettingsStyles(baseSignalStyles, "standard");
  const vision = useSettingsPalette();
  const increased = useSignalContrast();
  if (vision.dark) return {
    ...signalStyles,
    choice: { ...signalStyles.choice, borderWidth: 2 },
    deviceBadge: { ...signalStyles.deviceBadge, borderWidth: 1 },
    switchOn: { ...signalStyles.switchOn, borderColor: increased ? vision.tokens.outline : vision.tokens.accent, borderWidth: 1, padding: 3 },
    switchOff: { ...signalStyles.switchOff, borderColor: vision.tokens.outline, borderWidth: 1, padding: 3 },
  };
  const neutralBadge = { ...signalStyles.deviceBadge, backgroundColor: vision.readOnlyStatus.surface };
  if (!increased) return vision.monochrome ? signalStyles : { ...signalStyles, deviceBadge: neutralBadge };
  const contrasted = {
    ...signalStyles,
    container: { ...signalStyles.container, backgroundColor: vision.settingsBackground(BASE_SIGNAL.background) },
    modeGroup: { ...signalStyles.modeGroup, backgroundColor: "#FFFFFF" },
    choice: { ...signalStyles.choice, backgroundColor: "#FFFFFF", borderColor: "#272423", borderWidth: 2 },
    choiceSelected: { ...signalStyles.choiceSelected, borderColor: "#272423" },
    choiceLabel: { ...signalStyles.choiceLabel, fontWeight: "700" as const },
    preferenceRow: { ...signalStyles.preferenceRow, borderBottomColor: "#272423", borderBottomWidth: 2 },
    preferenceBlock: { ...signalStyles.preferenceBlock, borderBottomColor: "#272423", borderBottomWidth: 2 },
    // These are grouping separators, not interactive control outlines.
    switchRow: { ...signalStyles.switchRow, borderBottomColor: "#B9B1AA" },
    routeInfo: { ...signalStyles.routeInfo, borderLeftColor: "#70655F" },
    deviceBadge: { ...signalStyles.deviceBadge, backgroundColor: "#DAD6D0", borderWidth: 2, borderColor: "#272423" },
    switchTrack: { ...signalStyles.switchTrack, borderWidth: 2, borderColor: "#272423", padding: 2 },
    switchOff: { ...signalStyles.switchOff, backgroundColor: "#454545" },
    switchReadOnly: { ...signalStyles.switchReadOnly, borderWidth: 2, padding: 2 },
    disabled: { ...signalStyles.disabled, backgroundColor: "#DAD6D0" },
    modalPanel: { ...signalStyles.modalPanel, backgroundColor: vision.settingsBackground(BASE_SIGNAL.background), borderColor: "#272423", borderWidth: 2 },
    opaqueOverlay: { ...signalStyles.opaqueOverlay, backgroundColor: vision.settingsBackground(BASE_SIGNAL.background) },
  };
  return vision.monochrome ? vision.styles(contrasted) : { ...contrasted, deviceBadge: { ...contrasted.deviceBadge, backgroundColor: vision.readOnlyStatus.surface } };
}

function SignalText({ size = 17, weight = "400", color = BASE_SIGNAL.ink, style, textRef, ...props }:
  TextProps & { size?: number; weight?: TextStyle["fontWeight"]; color?: string; textRef?: React.Ref<React.ElementRef<typeof Text>> }) {
  const SIGNAL = useSettingsColors(BASE_SIGNAL);
  const { fontSize } = useSettings();
  const preferences = useAccessibilityPreferences();
  const highContrast = preferences.darkerSystemColorsEnabled || preferences.highTextContrastEnabled;
  const vision = useSettingsPalette();
  color = vision.dark && color === BASE_SIGNAL.ink ? vision.tokens.text : vision.color(color);
  if (vision.dark && size <= 16) size = size === 15 ? 17 : 16;
  return <Text ref={textRef} allowFontScaling maxFontSizeMultiplier={vision.dark ? undefined : 2.5} {...props}
    style={[{ fontSize: size * fontSize, lineHeight: Math.ceil(size * fontSize * 1.4),
      fontWeight: weight, color: highContrast && (color === SIGNAL.muted || color === SIGNAL.status || color === SIGNAL.outline) ? SIGNAL.ink : color,
      flexShrink: 1 }, style, preferences.boldTextEnabled && standardStyles.boldTextOverride]} />;
}

function SignalSection({ title, description, children, titleRef }: {
  title: string; description?: string; children: ReactNode; titleRef?: React.Ref<React.ElementRef<typeof Text>>;
}) {
  const SIGNAL = useSettingsColors(BASE_SIGNAL);
  const signalStyles = useSignalStyles();
  return <View style={signalStyles.section}>
    <SignalText textRef={titleRef} size={24} weight="800" color={SIGNAL.heading} accessibilityRole="header">{title}</SignalText>
    {description && <SignalText size={14} color={SIGNAL.muted}>{description}</SignalText>}
    {children}
  </View>;
}

function SignalAccordion(props: { title: string; icon: HeaderIcon; children: ReactNode }) {
  const signalStyles = useSignalStyles();
  const SIGNAL = useSettingsColors(BASE_SIGNAL);
  return <SettingsAccordion {...props} appearance="standard" styles={signalStyles}
    ink={SIGNAL.ink} contrastInk={SIGNAL.ink}
    renderText={(textProps) => <SignalText weight="600" {...textProps} />}>
    <View style={signalStyles.accordionContent}>{props.children}</View>
  </SettingsAccordion>;
}

function useSignalStacked() {
  const { width, fontScale } = useWindowDimensions();
  const { fontSize } = useSettings();
  return width < 360 || fontSize * Math.min(fontScale, 2.5) >= 1.35;
}

type SignalOption = {
  label: string; accessibilityLabel: string; hint: string; selected: boolean; onPress: () => void;
};

function SignalChoice({ label, accessibilityLabel, hint, selected, onPress, disabled = false, vertical = false }: SignalOption & {
  disabled?: boolean; vertical?: boolean;
}) {
  const vision = useSettingsPalette();
  const SIGNAL = useSettingsColors(BASE_SIGNAL);
  const signalStyles = useSignalStyles();
  const stacked = useSignalStacked();
  const increased = useSignalContrast();
  return <TouchableOpacity accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityHint={hint} accessibilityState={{ selected, disabled }} disabled={disabled}
    onPress={onPress} style={[signalStyles.choice, (vertical || stacked) && signalStyles.stackedChoice, selected && signalStyles.choiceSelected,
      disabled && !selected && signalStyles.disabled, disabled && signalStyles.disabledChoice]}>
    {selected && <MaterialCommunityIcons name={disabled ? "lock-check-outline" : "check"} size={16} color={vision.dark ? vision.tokens.onSelected : vision.color("#FFFFFF", "iconColor")} accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />}
    {disabled && !selected && increased && <MaterialCommunityIcons name="lock-outline" size={16} color={vision.color(SIGNAL.ink, "iconColor")}
      accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />}
    <SignalText accessible={false} size={16} weight="600" color={selected ? "#FFFFFF" : SIGNAL.ink}
      style={signalStyles.choiceLabel}>{label}</SignalText>
  </TouchableOpacity>;
}

// Compact rows expose the existing choices in a native, scrollable dialog.
// No draft preference or new persistence path is introduced.
function SignalPreferenceRow({ label, value, description, options, disabled = false }: {
  label: string; value: string; description?: string; options: SignalOption[]; disabled?: boolean;
}) {
  const vision = useSettingsPalette();
  const SIGNAL = useSettingsColors(BASE_SIGNAL);
  const signalStyles = useSignalStyles();
  const [open, setOpen] = useState(false);
  const [presented, setPresented] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const trigger = useRef<React.ElementRef<typeof TouchableOpacity>>(null);
  const heading = useRef<React.ElementRef<typeof Text>>(null);
  const wasOpen = useRef(false);
  const focusHandled = useRef(false);
  const stacked = useSignalStacked();
  const { fontSize } = useSettings();
  const { screenReaderEnabled, reduceTransparencyEnabled, boldTextEnabled } = useAccessibilityPreferences();
  const increased = useSignalContrast();

  const restoreFocus = useCallback(() => {
    if (screenReaderEnabled && trigger.current) {
      if (Platform.OS === "web") trigger.current.focus();
      else AccessibilityInfo.sendAccessibilityEvent(trigger.current, "focus");
    }
  }, [screenReaderEnabled]);

  useEffect(() => {
    if (open) { wasOpen.current = true; return; }
    setPresented(false); setLaidOut(false); focusHandled.current = false;
    if (!wasOpen.current || Platform.OS === "ios") return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => { wasOpen.current = false; restoreFocus(); });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [open, restoreFocus]);

  useEffect(() => {
    if (!open || !presented || !laidOut || !screenReaderEnabled || focusHandled.current) return;
    const frame = requestAnimationFrame(() => {
      if (heading.current) {
        focusHandled.current = true;
        if (Platform.OS === "web") heading.current.focus();
        else AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, presented, laidOut, screenReaderEnabled]);

  return <>
    <TouchableOpacity ref={trigger} accessible accessibilityRole="button" accessibilityLabel={`${label}, ${value}`}
      accessibilityHint={`${description ? `${description} ` : ""}Opens the available choices.`}
      accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => setOpen(true)}
      style={[signalStyles.preferenceBlock, disabled && signalStyles.disabled]}>
      <View style={[signalStyles.preferenceHeading, stacked && signalStyles.stackedRow]}>
        <View style={[signalStyles.rowLabel, stacked && signalStyles.stackedLabel]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SignalText weight="500">{label}</SignalText>
        </View>
        <View style={[signalStyles.valueWithChevron, stacked && signalStyles.stackedValue]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SignalText size={15} weight="600" color={disabled ? SIGNAL.status : SIGNAL.accent}>{value}</SignalText>
          {disabled && increased && <MaterialCommunityIcons name="lock-outline" size={16} color={vision.color(SIGNAL.ink, "iconColor")}
            accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />}
          <MaterialCommunityIcons name="chevron-right" size={20} color={vision.color(disabled ? SIGNAL.status : SIGNAL.accent, "iconColor")} accessible={false} allowFontScaling={false} />
        </View>
      </View>
      {description && <SignalText size={14} color={SIGNAL.muted} accessible={false}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{description}</SignalText>}
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="none" onShow={() => setPresented(true)}
      onRequestClose={() => setOpen(false)} onDismiss={() => { wasOpen.current = false; restoreFocus(); }}>
      <SafeAreaView style={[signalStyles.modalOverlay, reduceTransparencyEnabled && signalStyles.opaqueOverlay]}>
        <View style={signalStyles.modalPanel} accessibilityViewIsModal importantForAccessibility="yes">
          <ScrollView contentContainerStyle={signalStyles.modalContent} keyboardShouldPersistTaps="handled">
            <Text ref={heading} accessible accessibilityRole="header" onLayout={() => setLaidOut(true)}
              style={[signalStyles.modalHeading, { fontSize: 23 * fontSize, lineHeight: Math.ceil(32 * fontSize) },
                boldTextEnabled && standardStyles.boldTextOverride]} allowFontScaling maxFontSizeMultiplier={2.5}>{label}</Text>
            {description && <SignalText size={14} color={SIGNAL.muted}>{description}</SignalText>}
            {options.map((option) => <SignalChoice key={option.accessibilityLabel} {...option} vertical
              disabled={disabled} onPress={() => { setOpen(false); option.onPress(); }} />)}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Cancel ${label} selection`}
              onPress={() => setOpen(false)} style={signalStyles.cancelButton}>
              <SignalText color={SIGNAL.accent} weight="600">Cancel</SignalText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  </>;
}

function SignalSwitch(props: SwitchProps) {
  const SIGNAL = useSettingsColors(BASE_SIGNAL);
  const signalStyles = useSignalStyles();
  const stacked = useSignalStacked();
  const { value, disabled, onValueChange, ...accessibilityProps } = props;
  return <TouchableOpacity {...accessibilityProps} accessible accessibilityRole="switch"
    accessibilityState={{ ...props.accessibilityState, checked: !!value, disabled: !!disabled }}
    disabled={disabled} activeOpacity={1} onPress={() => { if (!disabled) onValueChange?.(!value); }}
    style={[signalStyles.switchControl, stacked && signalStyles.switchControlLarge]}>
    <SignalText size={14} color={SIGNAL.status} accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">{`${value ? "On" : "Off"}${disabled ? " (read only)" : ""}`}</SignalText>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[signalStyles.switchTrack, value ? signalStyles.switchOn : signalStyles.switchOff,
        disabled && signalStyles.switchReadOnly]}>
      <View style={signalStyles.switchThumb} />
    </View>
  </TouchableOpacity>;
}

function SignalSwitchRow({ label, description, status, icon, children }: {
  label: string; description?: string; status?: string; icon?: SettingsIconName; children: ReactNode;
}) {
  const SIGNAL = useSettingsColors(BASE_SIGNAL);
  const signalStyles = useSignalStyles();
  const stacked = useSignalStacked();
  return <View style={signalStyles.switchRow}>
    <View style={[signalStyles.preferenceHeading, stacked && signalStyles.stackedRow]}>
      <View style={[signalStyles.rowLabel, stacked && signalStyles.stackedLabel, icon && signalStyles.iconLabel]}
        accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {icon && <PreferenceIcon name={icon} />}
        <SignalText weight="500">{label}</SignalText>
      </View>
      {children}
    </View>
    {description && <SignalText size={14} color={SIGNAL.muted}>{description}</SignalText>}
    {status && <SignalText size={14} weight="500" color={SIGNAL.status}>{status}</SignalText>}
  </View>;
}

function SignalGuidanceSettings({ titleRef }: { titleRef?: React.Ref<React.ElementRef<typeof Text>> }) {
  const SIGNAL = useSettingsColors(BASE_SIGNAL);
  const signalStyles = useSignalStyles();
  const { repeatGuidanceEnabled, repeatGuidanceSeconds, setRepeatGuidanceEnabled, setRepeatGuidanceSeconds,
    settingsLoaded, settingsReadSucceeded } = useSettings();
  const stacked = useSignalStacked();
  const disabled = !settingsLoaded || !settingsReadSucceeded;
  return <SignalSection title="Spoken guidance" description="During accessibility navigation." titleRef={titleRef}>
    <SignalSwitchRow label="Repeat instructions">
      <SignalSwitch value={repeatGuidanceEnabled} disabled={disabled} onValueChange={setRepeatGuidanceEnabled}
        accessibilityLabel="Repeat spoken instruction"
        accessibilityHint="Repeats the current instruction during accessibility navigation. Turning this off keeps new direction announcements enabled." />
    </SignalSwitchRow>
    <View style={signalStyles.frequencyGroup}>
      <View style={[signalStyles.textSizeHeading, stacked && signalStyles.stackedRow]}>
        <SignalText size={14} weight="500">Interval in seconds</SignalText>
        <SignalText size={15} weight="600" color={SIGNAL.accent}>{repeatGuidanceSeconds} seconds</SignalText>
      </View>
      <View style={[signalStyles.frequencyOptions, stacked && signalStyles.stackedChoices]}>
        {[5, 9, 15, 30, 60].map((seconds) => <SignalChoice key={seconds} label={String(seconds)}
          accessibilityLabel={`Repeat every ${seconds} seconds`} hint={`Repeats the current instruction every ${seconds} seconds.`}
          selected={repeatGuidanceSeconds === seconds} disabled={disabled || !repeatGuidanceEnabled}
          onPress={() => setRepeatGuidanceSeconds(seconds)} />)}
      </View>
      {!repeatGuidanceEnabled && <SignalText size={14} color={SIGNAL.muted}>
        Enable repetition to change its frequency. Your selected frequency is saved.
      </SignalText>}
    </View>
    <SignalText size={14} color={SIGNAL.muted}>
      Turning repetition off keeps new direction announcements on.
    </SignalText>
  </SignalSection>;
}

function SignalActionRow({ label, description, onPress, accessibilityLabel = label, accessibilityHint, chevron = true }: {
  label: string; description?: string; onPress: () => void; accessibilityLabel?: string;
  accessibilityHint: string; chevron?: boolean;
}) {
  const vision = useSettingsPalette();
  const SIGNAL = useSettingsColors(BASE_SIGNAL);
  const signalStyles = useSignalStyles();
  const [pressed, setPressed] = useState(false);
  const preferences = useAccessibilityPreferences();
  const increasedContrast = preferences.darkerSystemColorsEnabled || preferences.highTextContrastEnabled;
  return <TouchableOpacity accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint} onPress={onPress}
    activeOpacity={chevron ? undefined : 1}
    onPressIn={!chevron ? () => setPressed(true) : undefined}
    onPressOut={!chevron ? () => setPressed(false) : undefined}
    style={[signalStyles.preferenceRow, !chevron && signalStyles.deleteAction,
      !chevron && { backgroundColor: vision.dark ? (pressed ? vision.tokens.dangerPressed : vision.tokens.dangerSurface) : vision.color(pressed ? "#8F1C28" : "#B42332", "backgroundColor"),
        borderColor: vision.dark ? vision.tokens.outline : vision.monochrome ? vision.palette.outline : increasedContrast ? "#000000" : (pressed ? "#8F1C28" : "#B42332"),
        borderBottomColor: vision.dark ? vision.tokens.outline : vision.monochrome ? vision.palette.outline : increasedContrast ? "#000000" : (pressed ? "#8F1C28" : "#B42332") }]}>
    {!chevron && <MaterialCommunityIcons name="trash-can-outline" size={24} color={vision.dark ? vision.tokens.dangerText : vision.color("#FFFFFF", "iconColor")} accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />}
    <View style={signalStyles.rowLabel} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SignalText weight={chevron ? "500" : "700"} color={chevron ? SIGNAL.ink : vision.dark ? vision.tokens.dangerText : "#FFFFFF"}>{label}</SignalText>
      {description && <SignalText size={14} color={SIGNAL.muted}>{description}</SignalText>}
    </View>
    {chevron && <MaterialCommunityIcons name="chevron-right" size={20} color={vision.color(SIGNAL.accent, "iconColor")} accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />}
  </TouchableOpacity>;
}

type SignalSettingsProps = {
  from?: string; mapVersion: string; onBack: () => void; onHome: () => void; onDelete: () => void;
  onNavigationModeChange: (mode: "standard" | "accessibility") => void;
  onFontSizeAccessibilityAction: (event: AccessibilityActionEvent) => void;
};

function SignalSettings({ from, mapVersion, onBack, onHome, onDelete,
  onNavigationModeChange, onFontSizeAccessibilityAction }: SignalSettingsProps) {
  const vision = useSettingsPalette();
  const SIGNAL = useSettingsColors(BASE_SIGNAL);
  const signalStyles = useSignalStyles();
  const { settingsAppearance, setSettingsAppearance, navigationMode, distanceUnits, setDistanceUnits,
    directionStyle, setDirectionStyle, fontSize, setFontSize, deviceAccessibility,
    customAccessibilityPreferences: savedAccessibilityPreferences, settingsLoaded, settingsReadSucceeded,
    setAccessibilityPreference, avoidStairs, avoidIndoorRoutes, avoidInaccessibleCrosswalks,
    configureAvoidStairs, configureRoutingPreferences, batterySaverEnabled, setBatterySaverEnabled } = useSettings();
  const stacked = useSignalStacked();
  const increased = useSignalContrast();
  const colorVision = useColorVisionDialog();
  const themeDialog = useColorVisionDialog();
  const disabled = !settingsLoaded || !settingsReadSucceeded;
  const deviceValue = (preference: DeviceAccessibilityPreference) => {
    const status = deviceAccessibility.detectionStatus[preference];
    return status === "loading" ? "Loading" : status === "unavailable" ? "Unavailable" : deviceAccessibility[preference] ? "On" : "Off";
  };

  return <SafeAreaView style={signalStyles.container}>
    <SettingsStatusBar />
    <View style={signalStyles.pinnedHeader} accessibilityElementsHidden={colorVision.visible || themeDialog.visible} aria-hidden={colorVision.visible || themeDialog.visible} importantForAccessibility={colorVision.visible || themeDialog.visible ? "no-hide-descendants" : "auto"}>
        <View style={signalStyles.topRow}>
          <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={from ? "Back to navigation" : "Back"}
            accessibilityHint={from ? "Returns to navigation and applies the selected navigation mode" : "Returns to the previous screen"}
            style={signalStyles.backButton}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={vision.color(SIGNAL.accent, "iconColor")} accessible={false} allowFontScaling={false} />
            <SignalText accessible={false} size={16} weight="500" color={SIGNAL.accent}>{from ? "Back to map" : "Back"}</SignalText>
          </TouchableOpacity>
          <SignalText size={16} weight="700">MapQP</SignalText>
        </View>
    </View>
    <ScrollView accessibilityElementsHidden={colorVision.visible || themeDialog.visible} aria-hidden={colorVision.visible || themeDialog.visible} importantForAccessibility={colorVision.visible || themeDialog.visible ? "no-hide-descendants" : "auto"} showsVerticalScrollIndicator={false} contentContainerStyle={signalStyles.content}>
      <View style={signalStyles.header}>
        <View style={signalStyles.titleGroup}>
          <SignalText size={30} weight="700" color={SIGNAL.heading} accessibilityRole="header">Settings</SignalText>
        </View>
      </View>
      <View style={signalStyles.sections}>
        <SignalSection title="Navigation">
          <View style={signalStyles.modeGroup}>
            <SignalText weight="600">Navigation mode</SignalText>
            <View style={[signalStyles.choices, stacked && signalStyles.stackedChoices]}>
              <SignalChoice label="Standard" accessibilityLabel="Standard navigation mode"
                hint="Uses standard navigation when you return to the map" selected={navigationMode === "standard"}
                onPress={() => onNavigationModeChange("standard")} />
              <SignalChoice label="Accessibility" accessibilityLabel="Accessible navigation mode"
                hint="Uses accessible navigation when you return to the map" selected={navigationMode === "accessibility"}
                onPress={() => onNavigationModeChange("accessibility")} />
            </View>
          </View>
        </SignalSection>
        <SignalAccordion title={SETTINGS_SECTION_TITLES.appearance} icon={HEADER_ICONS.display}>
          <SignalPreferenceRow label="Settings layout" value={settingsAppearance === "standard" ? "Standard" : "Accessible"}
            disabled={disabled}
            options={(["standard", "accessible"] as const).map((appearance) => ({
              label: appearance === "standard" ? "Standard" : "Accessible",
              accessibilityLabel: `${appearance === "standard" ? "Standard" : "Accessible"} Settings layout`,
              hint: `Displays Settings with ${appearance === "accessible" ? "larger text, stronger contrast, and more spacing" : "standard styling"}. Does not change navigation mode.`,
              selected: settingsAppearance === appearance, onPress: () => setSettingsAppearance(appearance),
            }))} />
          <ThemeSetting onPress={themeDialog.show} triggerRef={themeDialog.triggerRef} />
          <ColorVisionSetting onPress={colorVision.show} triggerRef={colorVision.triggerRef} />
        </SignalAccordion>
        <SignalAccordion title={SETTINGS_SECTION_TITLES.text} icon={HEADER_ICONS.text}>
          <View style={signalStyles.sliderGroup}>
            <View style={[signalStyles.textSizeHeading, stacked && signalStyles.stackedRow]}>
              <SignalText weight="500">Text size</SignalText>
              <SignalText size={15} weight="600" color={SIGNAL.accent} accessible={false}>{Math.round(fontSize * 100)}%</SignalText>
            </View>
            <View style={signalStyles.sliderRow}>
              <SignalText size={15} color={SIGNAL.muted} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">A</SignalText>
              <View style={signalStyles.slider} accessible accessibilityRole="adjustable" accessibilityLabel="Text size"
                accessibilityHint={Platform.OS === "ios"
                  ? "Adjusts the size of text displayed in MapQP. Swipe up or down to adjust text size"
                  : "Adjusts the size of text displayed in MapQP. Use the increase or decrease accessibility action to adjust text size"}
                accessibilityValue={{ min: 80, max: 180, now: Math.round(fontSize * 100), text: `${Math.round(fontSize * 100)} percent` }}
                accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                onAccessibilityAction={onFontSizeAccessibilityAction}>
                <Slider style={signalStyles.sliderInput} minimumValue={0.8} maximumValue={1.8} step={0.1}
                  value={fontSize} onValueChange={setFontSize} minimumTrackTintColor={vision.dark ? vision.tokens.accent : vision.color(SIGNAL.accent, "backgroundColor")}
                  maximumTrackTintColor={vision.dark ? vision.tokens.outline : vision.monochrome ? vision.palette.outline : increased ? "#272423" : SIGNAL.outline} thumbTintColor={vision.dark ? vision.tokens.accent : vision.color(SIGNAL.accent, "backgroundColor")} accessible={false}
                  accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
              </View>
              <SignalText size={25} weight="600" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">A</SignalText>
            </View>
          </View>
          <SignalPreferenceRow label="Distance units" value={distanceUnits === "imperial" ? "Feet / miles" : "Meters / km"}
            options={[
              { label: "Feet / miles", accessibilityLabel: "Feet and miles", hint: "Displays distances in feet and miles",
                selected: distanceUnits === "imperial", onPress: () => setDistanceUnits("imperial") },
              { label: "Meters / km", accessibilityLabel: "Meters and kilometers", hint: "Displays distances in meters and kilometers",
                selected: distanceUnits === "metric", onPress: () => setDistanceUnits("metric") },
            ]} />
          <SignalPreferenceRow label="Direction style" value={directionStyle === "natural" ? "Natural" : "Degrees"}
            description="Choose between natural (Turn Left/Right) or degrees (Turn Left/Right 90°)."
            options={[
              { label: "Natural", accessibilityLabel: "Natural directions", hint: "Uses directions such as turn left or turn right",
                selected: directionStyle === "natural", onPress: () => setDirectionStyle("natural") },
              { label: "Degrees", accessibilityLabel: "Degree based directions", hint: "Uses turning angles in degrees",
                selected: directionStyle === "degrees", onPress: () => setDirectionStyle("degrees") },
            ]} />
        </SignalAccordion>
        <SignalAccordion title={SETTINGS_SECTION_TITLES.accessibility} icon={HEADER_ICONS.accessibility}>
          <SignalText size={14} color={SIGNAL.muted}>Device settings take priority. MapQP switches add preferences when device settings are off.</SignalText>
          <View accessible accessibilityRole="text" accessibilityLabel={`Screen reader, ${deviceValue("screenReaderEnabled")}. Controlled by your device.`}
            accessibilityHint="Provides spoken descriptions of interface elements to help you navigate without relying on sight. VoiceOver and TalkBack are controlled in device settings."
            style={signalStyles.switchRow}>
            <View style={[signalStyles.preferenceHeading, stacked && signalStyles.stackedRow]} accessible={false}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[signalStyles.rowLabel, stacked && signalStyles.stackedLabel, signalStyles.iconLabel]}>
                <PreferenceIcon name="account-voice" />
                <SignalText weight="500">Screen reader</SignalText>
              </View>
              <View style={signalStyles.deviceBadge}>
                {!vision.monochrome && !increased && <View pointerEvents="none" accessible={false}
                  accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                  style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
                    borderRadius: 6, borderWidth: 1, borderColor: vision.readOnlyStatus.outline }} /> }
                <SignalText size={14} weight="600" color={SIGNAL.status}>{deviceValue("screenReaderEnabled")}</SignalText>
              </View>
            </View>
            <SignalText size={14} color={SIGNAL.muted} accessible={false}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants">VoiceOver or TalkBack reads screen content aloud.</SignalText>
            <SignalText size={14} weight="500" color={SIGNAL.status} accessible={false}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants">Device {deviceValue("screenReaderEnabled").toLowerCase()} · Read only</SignalText>
          </View>
          {ACCESSIBILITY_CONTROLS.map(({ label, preference, devicePreference, description, icon }) => {
            const detectedPreference = preference === "increaseContrastEnabled" && Platform.OS === "android"
              ? "highTextContrastEnabled" : devicePreference;
            const control = accessibilityControlState(deviceAccessibility, detectedPreference, savedAccessibilityPreferences[preference], settingsLoaded);
            const status = deviceAccessibility.detectionStatus[detectedPreference];
            const deviceControlled = deviceAccessibility[detectedPreference];
            const sourceDescription = !settingsLoaded || status === "loading" ? control.explanation
              : deviceControlled ? (status === "unavailable" ? "Device status unavailable. Using the last detected device preference." : "Controlled by device settings.")
              : status === "unavailable" ? "Device status unavailable. Saved MapQP preference." : "Saved MapQP preference.";
            const summary = `Device ${deviceValue(detectedPreference).toLowerCase()} · MapQP ${settingsLoaded ? savedAccessibilityPreferences[preference] ? "on" : "off" : "loading"}`
              + (control.disabled ? ` · ${deviceControlled ? "Read only" : "Loading"}` : "")
              + (status === "unavailable" && deviceControlled ? " · Last detected on" : "");
            return <SignalSwitchRow key={preference} label={label.charAt(0) + label.slice(1).toLowerCase()}
              status={summary} icon={icon}>
              <SignalSwitch value={control.enabled} disabled={control.disabled} accessibilityLabel={label}
                accessibilityValue={{ text: sourceDescription }} accessibilityState={{ checked: control.enabled, disabled: control.disabled }}
                accessibilityHint={`${description} ${deviceControlled ? "Change this preference in your device settings."
                  : control.disabled ? "This preference cannot be changed while settings are loading." : "Changes only your saved MapQP preference."}`}
                onValueChange={(enabled) => { if (!control.disabled) setAccessibilityPreference(preference, enabled); }} />
            </SignalSwitchRow>;
          })}
          <SignalSwitchRow label="Battery Saver" icon="battery-heart-outline">
            <SignalSwitch value={batterySaverEnabled} onValueChange={setBatterySaverEnabled} disabled={disabled}
              accessibilityLabel="Battery Saver" accessibilityHint="Reduces power use. Location updates may be slower. Background GPS and navigation notifications are off. Turn guidance stays on while navigation is open." />
          </SignalSwitchRow>
        </SignalAccordion>
        <SignalAccordion title={SETTINGS_SECTION_TITLES.routing} icon={HEADER_ICONS.routing}>
          <SignalSection title="Route preferences" description="Changes apply when you start a new route.">
            <SignalSwitchRow label="Avoid stairs" icon="stairs" description="Avoid stairs and inaccessible building entrances.">
              <SignalSwitch value={avoidStairs} disabled={disabled} accessibilityLabel="Avoid stairs"
                accessibilityHint="Avoid stairs and inaccessible building entrances. Changes apply when you start a new route."
                onValueChange={(enabled) => { if (!disabled) void configureAvoidStairs(enabled).catch(() => Alert.alert("Could not save preference", "Please try changing the switch again.")); }} />
            </SignalSwitchRow>
            {([
              { key: "avoidIndoorRoutes", icon: "office-building", label: "Avoid routes through buildings", accessibilityLabel: "Avoid routes through buildings", value: avoidIndoorRoutes,
                description: "Don't use buildings as a way to reach another destination.", hint: "Don't use buildings as a way to reach another destination." },
              { key: "avoidInaccessibleCrosswalks", icon: "walk", label: "Accessible crossings only", accessibilityLabel: "Avoid Inaccessible Road Crossings",
                value: avoidInaccessibleCrosswalks, description: "Avoid crosswalks that don't have audible indicators.",
                hint: "Avoid crosswalks that don't have audible indicators." },
            ] as const).map(({ key, icon, label, accessibilityLabel, value, description, hint }) => <SignalSwitchRow key={key} label={label} icon={icon} description={description}>
              <SignalSwitch value={value} disabled={disabled} accessibilityLabel={accessibilityLabel} accessibilityHint={hint}
                onValueChange={(enabled) => { if (!disabled) void configureRoutingPreferences({ [key]: enabled }).catch(() =>
                  Alert.alert("Could not save preference", "Please try changing the switch again.")); }} />
            </SignalSwitchRow>)}
          </SignalSection>
          <SignalGuidanceSettings />
          <View style={signalStyles.routeInfo}>
            <SignalText size={17} weight="600" color={SIGNAL.heading} accessibilityRole="header">About your route</SignalText>
            <SignalText size={14} color={SIGNAL.muted}>Accessibility is based on campus map data, not live conditions. Check your surroundings as you travel.</SignalText>
          </View>
        </SignalAccordion>
        <SignalAccordion title={SETTINGS_SECTION_TITLES.support} icon={HEADER_ICONS.support}>
          <SignalActionRow label="Share Your Feedback"
            description="Help improve MapQP by completing our user study survey."
            accessibilityLabel="Share Your Feedback. Help improve MapQP by completing our user study survey."
            accessibilityHint="Opens the survey in your browser."
            onPress={() => { void openUserStudySurvey(); }} />
          <SignalActionRow label="Report a bug" accessibilityLabel="Report a Bug"
            description="Send a bug report to the mapQP team."
            accessibilityHint="Opens the form to submit a bug report."
            onPress={() => router.push("/report-bug")} />
          <View style={[signalStyles.preferenceRow, stacked && signalStyles.stackedRow]}>
            <SignalText size={15} color={SIGNAL.status}>Route data version</SignalText>
            <SignalText size={15} color={SIGNAL.status}>v{mapVersion}</SignalText>
          </View>

          <View style={signalStyles.deleteSection}>
            <SignalActionRow label="Delete all local data" accessibilityHint="Opens a confirmation dialog before deleting saved data"
              onPress={onDelete} chevron={false} />
            <SignalText size={14} color={SIGNAL.muted}>Removes saved app data from this device. Confirmation required.</SignalText>
          </View>
        </SignalAccordion>
      </View>
      <TouchableOpacity accessible accessibilityRole="button" accessibilityLabel="Return to Home"
        accessibilityHint="Return to the MapQP home screen" onPress={onHome}
        style={[signalStyles.homeAction, increased && signalStyles.homeActionContrast]}>
        <MaterialCommunityIcons name="home-outline" size={24} color={vision.color(SIGNAL.accent, "iconColor")} accessible={false}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
        <View style={signalStyles.rowLabel} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SignalText weight="600">Return to Home</SignalText>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={vision.color(SIGNAL.accent, "iconColor")} accessible={false}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
      </TouchableOpacity>
      <View style={signalStyles.footer}>
        <SignalText size={13} color={SIGNAL.status} style={signalStyles.centered}>MapQP · WPI campus navigation</SignalText>
      </View>
    </ScrollView>
    <ColorVisionDialog visible={colorVision.visible} onClose={colorVision.close} triggerRef={colorVision.triggerRef} />
    <SettingsThemeDialog visible={themeDialog.visible} onClose={themeDialog.close} triggerRef={themeDialog.triggerRef} />
  </SafeAreaView>;
}

const baseSignalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BASE_SIGNAL.background },
  content: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 20, paddingBottom: 16 },
  pinnedHeader: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 20, paddingTop: 4 },
  header: { gap: 8, paddingTop: 4 },
  topRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  backButton: { minHeight: 44, flexDirection: "row", alignItems: "center", flexShrink: 1 },
  titleGroup: { paddingVertical: 4 },
  centered: { textAlign: "center" },
  sections: { gap: 12, paddingTop: 16, paddingBottom: 12 },
  section: { gap: 4 },
  panel: { backgroundColor: BASE_SIGNAL.background, borderRadius: 12, borderWidth: 1, borderColor: BASE_SIGNAL.outline, overflow: "hidden" },
  strongPanel: { borderWidth: 2, borderColor: "#272423" },
  strongBoundary: { borderColor: "#272423" },
  accordionHeader: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8,
    borderBottomWidth: 2, borderBottomColor: "transparent" },
  expandedHeader: { backgroundColor: "#EEECE5", borderBottomColor: BASE_SIGNAL.accent },
  accordionHeading: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  headerIcon: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  wrappedIconLabel: { flexDirection: "row", flexWrap: "wrap", columnGap: 8, rowGap: 0 },
  fullWidth: { width: "100%", flexGrow: 0, flexShrink: 1, flexBasis: "auto" },
  flex: { flex: 1, minWidth: 0 }, chevronEnd: { alignSelf: "flex-end" },
  accordionContent: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  collapseFooter: { padding: 12 },
  collapseButton: { minWidth: 48, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: BASE_SIGNAL.outline, borderRadius: 8, backgroundColor: BASE_SIGNAL.background },
  modeGroup: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: "#EEECE5" },
  choices: { flexDirection: "row", gap: 4 },
  stackedChoices: { flexDirection: "column", alignItems: "stretch" },
  choice: { flexGrow: 1, flexBasis: 0, minWidth: 0, minHeight: 48, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: BASE_SIGNAL.outline, backgroundColor: "#F0EEEA" },
  choiceSelected: { backgroundColor: BASE_SIGNAL.accent, borderColor: BASE_SIGNAL.accent },
  stackedChoice: { flexBasis: "auto", flexGrow: 0, flexShrink: 0, width: "100%" },
  choiceLabel: { textAlign: "center" },
  preferenceRow: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BASE_SIGNAL.divider },
  preferenceBlock: { gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BASE_SIGNAL.divider },
  preferenceHeading: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowLabel: { flex: 1, minWidth: 0, gap: 4 },
  iconLabel: { flexDirection: "row", alignItems: "center", gap: 12 },
  valueWithChevron: { maxWidth: "45%", flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  stackedRow: { flexDirection: "column", alignItems: "stretch" },
  stackedLabel: { flex: 0, flexBasis: "auto", width: "100%" },
  stackedValue: { maxWidth: "100%", alignSelf: "flex-start" },
  switchRow: { gap: 6, paddingTop: 8, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BASE_SIGNAL.divider },
  deviceBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: "#E9E7DF" },
  switchControl: { minHeight: 48, maxWidth: "100%", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, flexShrink: 0 },
  switchControlLarge: { alignSelf: "flex-start", flexShrink: 1, flexWrap: "wrap" },
  switchTrack: { width: 52, height: 32, borderRadius: 16, padding: 4, justifyContent: "center", flexShrink: 0 },
  switchOn: { backgroundColor: BASE_SIGNAL.accent, alignItems: "flex-end" },
  switchOff: { backgroundColor: BASE_SIGNAL.off, alignItems: "flex-start" },
  switchReadOnly: { borderWidth: 1, borderStyle: "dashed", borderColor: BASE_SIGNAL.ink, padding: 3 },
  switchThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" },
  sliderGroup: { gap: 4, paddingTop: 12, paddingBottom: 4 },
  textSizeHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  slider: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: "center" },
  sliderInput: { width: "100%", height: 48 },
  frequencyGroup: { gap: 12, paddingVertical: 12 },
  frequencyOptions: { flexDirection: "row", gap: 6 },
  homeAction: { width: "100%", minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12,
    marginTop: 12, padding: 16, borderWidth: 1, borderColor: "#94877F", borderRadius: 12, backgroundColor: "#FFFFFF" },
  homeActionContrast: { borderWidth: 2, borderColor: "#272423" },
  deleteSection: { gap: 4 },
  deleteAction: { minHeight: 48, borderWidth: 2, borderBottomWidth: 2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  routeInfo: { gap: 8, borderLeftWidth: 2, borderLeftColor: BASE_SIGNAL.divider, paddingLeft: 16, paddingVertical: 8 },
  footer: { alignItems: "center", paddingTop: 20, paddingBottom: 12 },
  // Disabled choices/rows keep full text contrast; the fill, neutral value and
  // locked selected indicator distinguish them without changing their geometry.
  disabled: { backgroundColor: BASE_SIGNAL.disabled },
  disabledChoice: { borderStyle: "dashed" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(37,39,32,0.35)", justifyContent: "center", padding: 24 },
  opaqueOverlay: { backgroundColor: BASE_SIGNAL.background },
  modalPanel: { maxHeight: "90%", maxWidth: 480, width: "100%", alignSelf: "center", backgroundColor: BASE_SIGNAL.background,
    borderWidth: 1, borderColor: BASE_SIGNAL.outline, borderRadius: 16, overflow: "hidden" },
  modalContent: { padding: 24, gap: 16 },
  modalHeading: { color: BASE_SIGNAL.heading, fontSize: 23, lineHeight: 32, fontWeight: "600" },
  cancelButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});

const standardStyles = StyleSheet.create({
  boldTextOverride: { fontWeight: "900" },
});
