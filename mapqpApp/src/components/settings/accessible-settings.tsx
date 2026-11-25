import { Accordion as SettingsAccordion, HEADER_ICONS, SETTINGS_SECTION_TITLES, type HeaderIcon } from "./settings-accordion";
import { ColorVisionSetting, ColorVisionDialog, useColorVisionDialog } from "./color-vision-setting";
import { useSettingsPalette, useSettingsColors, useSettingsStyles } from "../../hooks/use-settings-theme";
import { ThemeChoices, SettingsStatusBar } from "./theme-setting";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Slider from "@react-native-community/slider";
import { router, useFocusEffect } from "expo-router";
import { Children, useCallback, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  AccessibilityInfo, Alert, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, useWindowDimensions,
  type AccessibilityActionEvent, type TextProps, type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings, type AccessibilityPreference } from "../../context/settings-context";
import { accessibilityControlState, useAccessibilityPreferences } from "../../hooks/use-accessibility-preferences";
import type { DeviceAccessibilityPreference } from "../../hooks/use-device-accessibility";
import { openUserStudySurvey } from "../../utils/user-study-survey";

import { PreferenceIcon, type PreferenceIconName as IconName } from "./preference-icon";
type Preference = {
  label: string; preference: AccessibilityPreference; devicePreference: DeviceAccessibilityPreference;
  icon: IconName; description: string;
};
type Props = {
  mapVersion: string;
  onBack: () => void;
  onHome: () => void;
  onDelete: () => void;
  onNavigationModeChange: (mode: "standard" | "accessibility") => void;
  onFontSizeAccessibilityAction: (event: AccessibilityActionEvent) => void;
  accessibilityControls: readonly Preference[];
};

const BASE_COLORS = {
  background: "#FAF8F4", panel: "#FFFFFF", ink: "#211E1C", secondary: "#3D3733",
  accent: "#741B2B", divider: "#BCB8B4", importantDivider: "#81756E", outline: "#70655F",
  contrastInk: "#000000", contrastOutline: "#272423", off: "#514B48", danger: "#8A211C",
} as const;

function useIncreasedContrast() {
  const { darkerSystemColorsEnabled, highTextContrastEnabled } = useAccessibilityPreferences();
  return darkerSystemColorsEnabled || highTextContrastEnabled;
}
function useLayout() {
  const { width, fontScale } = useWindowDimensions();
  const { fontSize } = useSettings();
  const scale = fontSize * fontScale;
  const gutter = width < 360 ? 12 : 20;
  return { width, scale, gutter, stacked: width < 360 || scale > 1.15,
    columns: scale >= 1.6 ? 1 : width < 340 || scale > 1.2 ? 2 : 3,
    // Estimate the space needed by a label's longest word, not just device width.
    // Text still wraps naturally; no row or label is height-clamped.
    stackRow: (label: string, icon = false, trailingWidth = 80) => {
      const available = width - gutter * 2 - 34 - trailingWidth - 12 - (icon ? 44 : 0);
      const longest = Math.max(...label.split(/\s+/).map((word) => word.length));
      return available < longest * 20 * scale * 0.62 || label.length * 20 * scale * 0.53 > available * 2.4;
    },
  };
}

function focusControl(target: ComponentRef<typeof TouchableOpacity> | ComponentRef<typeof Text> | null) {
  if (!target) return;
  if (Platform.OS === "web") target.focus();
  else AccessibilityInfo.sendAccessibilityEvent(target, "focus");
}

// Keep Accessible's existing text and style mapping; only disclosure behavior is shared.
function Accordion(props: { title: string; icon: HeaderIcon; children: ReactNode }) {
  const s = useSettingsStyles(baseStyles);
  const COLORS = useSettingsColors(BASE_COLORS);
  return <SettingsAccordion {...props} styles={s} ink={COLORS.ink} contrastInk={COLORS.contrastInk}
    renderText={(textProps) => <BoldText {...textProps} />} />;
}

function BoldText({ size = 20, weight = "700", color = BASE_COLORS.ink, style, textRef, ...props }:
  TextProps & { size?: number; weight?: TextStyle["fontWeight"]; color?: string;
    textRef?: React.Ref<ComponentRef<typeof Text>> }) {
  const COLORS = useSettingsColors(BASE_COLORS);
  const { fontSize } = useSettings();
  const { boldTextEnabled, darkerSystemColorsEnabled, highTextContrastEnabled } = useAccessibilityPreferences();
  const highContrast = darkerSystemColorsEnabled || highTextContrastEnabled;
  const vision = useSettingsPalette();
  color = vision.dark && color === BASE_COLORS.ink ? vision.tokens.text : vision.color(color);
  return <Text ref={textRef} allowFontScaling {...props} style={[
    { fontSize: size * fontSize, lineHeight: Math.ceil(size * fontSize * 1.45),
      fontWeight: weight, color: highContrast && (color === COLORS.secondary || color === COLORS.ink) ? COLORS.contrastInk : color,
      flexShrink: 1 }, style, boldTextEnabled && { fontWeight: "900" },
  ]} />;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const s = useSettingsStyles(baseStyles);
  const COLORS = useSettingsColors(BASE_COLORS);
  return <View style={s.section}>
    <BoldText size={22} accessibilityRole="header">{title}</BoldText>
    {description && <BoldText size={17} weight="600" color={COLORS.secondary}>{description}</BoldText>}
    {children}
  </View>;
}
function Panel({ children }: { children: ReactNode }) { return <View>{children}</View>; }
function Divider({ important = false }: { important?: boolean }) {
  const s = useSettingsStyles(baseStyles);
  const increasedContrast = useIncreasedContrast();
  return <View accessible={false} style={[s.divider, important && s.importantDivider,
    increasedContrast && s.strongDivider]} />;
}
function Choice({ label, selected, disabled = false, onPress, accessibilityLabel = label, mode = false }:
  { label: string; selected: boolean; disabled?: boolean; onPress?: () => void; accessibilityLabel?: string; mode?: boolean }) {
  const vision = useSettingsPalette();
  const s = useSettingsStyles(baseStyles);
  const COLORS = useSettingsColors(BASE_COLORS);
  const increasedContrast = useIncreasedContrast();
  return <TouchableOpacity accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ selected, disabled }} disabled={disabled} activeOpacity={0.85} onPress={onPress}
    style={[s.choice, increasedContrast && s.strongBoundary, mode && s.modeChoice, selected && s.selected, disabled && s.unavailable, disabled && !selected && vision.monochrome && { backgroundColor: vision.palette.disabledSurface }]}>
    <MaterialCommunityIcons name="check" size={24} color={vision.color(selected ? (vision.dark ? vision.tokens.onSelected : COLORS.panel) : COLORS.ink, "iconColor")}
      allowFontScaling={false} accessible={false} style={{ opacity: selected ? 1 : 0, flexShrink: 0 }} />
    <BoldText accessible={false} color={selected ? (vision.dark ? vision.tokens.onSelected : COLORS.panel) : COLORS.ink}>{label}</BoldText>
  </TouchableOpacity>;
}
function Choices({ children }: { children: ReactNode }) {
  const s = useSettingsStyles(baseStyles);
  const { stacked } = useLayout();
  return <View style={[s.choices, stacked && s.stacked]}>
    {Children.map(children, (child) => <View style={stacked ? s.choiceColumn : s.choiceCell}>{child}</View>)}
  </View>;
}
function Action({ label, description, onPress, danger = false, back = false, targetRef, onLayout }:
  { label: string; description?: string; onPress: () => void; danger?: boolean; back?: boolean;
    targetRef?: React.Ref<ComponentRef<typeof TouchableOpacity>>; onLayout?: () => void }) {
  const vision = useSettingsPalette();
  const s = useSettingsStyles(baseStyles);
  const COLORS = useSettingsColors(BASE_COLORS);
  const increasedContrast = useIncreasedContrast();
  const [pressed, setPressed] = useState(false);
  return <TouchableOpacity ref={targetRef} onLayout={onLayout} accessible accessibilityRole="button"
    accessibilityLabel={description ? `${label}. ${description}` : label}
    onPress={onPress} activeOpacity={danger ? 1 : 0.85}
    onPressIn={danger ? () => setPressed(true) : undefined}
    onPressOut={danger ? () => setPressed(false) : undefined}
    style={[s.action, back && s.back, back && increasedContrast && s.strongBoundary,
      danger && { minHeight: 56, paddingVertical: 8, paddingHorizontal: 12, flexWrap: "wrap", borderRadius: 12, borderWidth: 2, borderColor: vision.color(increasedContrast ? COLORS.contrastOutline : (pressed ? "#8F1C28" : "#B42332"), "borderColor"),
        backgroundColor: vision.dark ? (pressed ? vision.tokens.dangerPressed : vision.tokens.dangerSurface) : vision.color(pressed ? "#8F1C28" : "#B42332", "backgroundColor") }]}>
    {back && <MaterialCommunityIcons name="chevron-left" size={28} color={vision.color(COLORS.ink, "iconColor")} accessible={false} allowFontScaling={false} />}
    {danger && <MaterialCommunityIcons name="trash-can-outline" size={24} color={vision.dark ? vision.tokens.dangerText : vision.color("#FFFFFF", "iconColor")} accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />}
    <View style={s.actionCopy} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <BoldText color={danger ? (vision.dark ? vision.tokens.dangerText : "#FFFFFF") : COLORS.ink}>{label}</BoldText>
      {description && !danger && <BoldText size={17} weight="600" color={COLORS.secondary}>{description}</BoldText>}
    </View>
    {!danger && !back && <MaterialCommunityIcons name="chevron-right" size={28} color={vision.color(COLORS.ink, "iconColor")}
      accessible={false} allowFontScaling={false} />}
  </TouchableOpacity>;
}

function PreferenceLabel({ label, icon, stacked = false }: { label: string; icon?: IconName; stacked?: boolean }) {
  const s = useSettingsStyles(baseStyles);
  const { width, scale, gutter } = useLayout();
  const words = label.split(/\s+/);
  const wrapWithIcon = stacked && icon && Math.max(...words.map((word) => word.length)) * 20 * scale * 0.62
    > width - gutter * 2 - 34 - 44;
  // At narrow/large sizes, let a long word use the FULL row below the icon and
  // preceding word, rather than reserving an icon column on every text line.
  return <View style={[s.rowLabel, stacked && s.fullWidth, wrapWithIcon && s.wrappedIconLabel]}
    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {icon && <PreferenceIcon name={icon} />}
    {wrapWithIcon ? words.map((word, index) => <BoldText key={index} style={s.word}>{word}</BoldText>)
      : <BoldText style={s.flex}>{label}</BoldText>}
  </View>;
}

function ToggleRow({ label, value, onChange, disabled, description, icon, compact = false }:
  { label: string; value: boolean; onChange: (value: boolean) => void; disabled: boolean; description?: string; icon?: IconName; compact?: boolean }) {
  const s = useSettingsStyles(baseStyles);
  const { stackRow } = useLayout();
  // Give the new routing labels a little measurement slack for bold native
  // glyphs, so long words use the full row before their switch moves below.
  const routingIcon = icon === "stairs" || icon === "office-building" || icon === "walk";
  const stacked = !compact && stackRow(label, !!icon, routingIcon ? 96 : 80);
  return <TouchableOpacity accessible accessibilityRole="switch" accessibilityLabel={compact ? label : description ? `${label}. ${description}` : label}
    accessibilityHint={compact ? description : undefined}
    accessibilityState={{ checked: value, disabled }} disabled={disabled}
    onPress={() => { if (!disabled) onChange(!value); }} activeOpacity={1} style={[s.toggleRow, compact && s.compactBatteryRow, stacked && s.stackedRow]}>
    {compact ? <View style={s.flex} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <BoldText>{label}</BoldText>
      <BoldText size={18}>{value ? "On" : "Off"}</BoldText>
    </View> : <PreferenceLabel label={label} icon={icon} stacked={stacked} />}
    <View style={[s.switchGroup, stacked && s.stackedSwitchGroup]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[s.track, value ? s.trackOn : s.trackOff, disabled && s.trackDisabled]}>
        <View style={s.thumb} />
      </View>
      {!compact && <BoldText size={18}>{value ? "On" : "Off"}</BoldText>}
    </View>
  </TouchableOpacity>;
}

function AccessibilityPanel({ controls }: { controls: readonly Preference[] }) {
  const s = useSettingsStyles(baseStyles);
  const COLORS = useSettingsColors(BASE_COLORS);
  const { deviceAccessibility: device, customAccessibilityPreferences: saved, settingsLoaded, settingsReadSucceeded,
    setAccessibilityPreference } = useSettings();
  const { stackRow, scale } = useLayout();
  const readerStatus = device.detectionStatus.screenReaderEnabled;
  const readerValue = readerStatus === "loading" ? "Checking…" : readerStatus === "unavailable" ? "Unavailable"
    : device.screenReaderEnabled ? "On" : "Off";
  const statusWidth = (value: string) => Math.max(96, (`Device: ${value}`).length * 18 * scale * 0.58);
  const readerStacked = stackRow("Screen reader", true, statusWidth(readerValue));
  return <Panel>
    <View accessible accessibilityRole="text" accessibilityLabel={`Screen reader. Device: ${readerValue}. Read only. Managed in device settings.`}
      style={[s.toggleRow, readerStacked && s.stackedRow]}>
      <PreferenceLabel label="Screen reader" icon="account-voice" stacked={readerStacked} />
      <View style={s.status} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <BoldText size={18} color={COLORS.accent}>Device: {readerValue}</BoldText>
        <BoldText size={17} weight="600" color={COLORS.secondary}>Read only</BoldText>
      </View>
    </View>
    {controls.map(({ label: originalLabel, preference, devicePreference, icon, description }) => {
      const label = originalLabel.charAt(0) + originalLabel.slice(1).toLowerCase();
      const detected = preference === "increaseContrastEnabled" && Platform.OS === "android" ? "highTextContrastEnabled" : devicePreference;
      const control = accessibilityControlState(device, detected, saved[preference], settingsLoaded);
      const deviceOn = device[detected];
      const unavailable = device.detectionStatus[detected] === "unavailable";
      const savedStatus = settingsLoaded && settingsReadSucceeded ? `MapQP: ${saved[preference] ? "On" : "Off"} · Saved` : "MapQP: Not loaded";
      const reason = !settingsLoaded || device.detectionStatus[detected] === "loading" ? control.explanation
        : unavailable && deviceOn ? "Device unavailable · Last detected On. Editing unavailable."
        : deviceOn ? "Device setting must be off to edit." : undefined;
      return <View key={preference}>
        <Divider />
        {control.disabled ? <View style={s.readOnly} accessible accessibilityRole="text"
          accessibilityLabel={`${label}. ${description} ${deviceOn ? "Device: On. Read only." : "Editing unavailable."} ${savedStatus}. ${reason}`}>
          <View style={[s.readOnlyHeading, stackRow(label, true, statusWidth(deviceOn ? "On" : "Checking…")) && s.stackedRow]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <PreferenceLabel label={label} icon={icon} stacked={stackRow(label, true, statusWidth(deviceOn ? "On" : "Checking…"))} />
            <View style={s.status}>
              <BoldText size={18} color={COLORS.accent}>{deviceOn ? "Device: On" : "Checking…"}</BoldText>
              <BoldText size={17} weight="600" color={COLORS.secondary}>Read only</BoldText>
            </View>
          </View>
          <BoldText size={17} weight="600" color={COLORS.secondary} accessible={false}>{savedStatus}</BoldText>
          <BoldText size={17} weight="600" color={COLORS.secondary} accessible={false}>{reason}</BoldText>
        </View> : <>
          <ToggleRow label={label} icon={icon} value={control.enabled} disabled={false}
            description={unavailable ? `${description} Device status unavailable. Saved MapQP preference.` : description}
            onChange={(enabled) => setAccessibilityPreference(preference, enabled)} />
          {unavailable && <BoldText size={17} weight="600" color={COLORS.secondary} style={s.statusNote}>Device status unavailable · MapQP preference</BoldText>}
        </>}
      </View>;
    })}
  </Panel>;
}

export function AccessibleSettings({ mapVersion, onBack, onHome, onDelete, onNavigationModeChange,
  onFontSizeAccessibilityAction, accessibilityControls }: Props) {
  const vision = useSettingsPalette();
  const s = useSettingsStyles(baseStyles);
  const COLORS = useSettingsColors(BASE_COLORS);
  const colorVision = useColorVisionDialog();
  const settings = useSettings();
  const preferences = useAccessibilityPreferences();
  const increasedContrast = useIncreasedContrast();
  const [sliderWidth, setSliderWidth] = useState(0);
  const { stacked, columns, gutter } = useLayout();
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const active = useRef(false), initialFocusDone = useRef(false);
  const focusFrame = useRef<number | null>(null);
  const focusInitialHeading = useCallback(() => {
    if (!active.current || initialFocusDone.current || !heading.current || !preferences.screenReaderEnabled) return;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (active.current && !initialFocusDone.current) {
        initialFocusDone.current = true;
        focusControl(heading.current);
      }
    });
  }, [preferences.screenReaderEnabled]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    focusInitialHeading();
    return () => {
      active.current = false;
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      focusFrame.current = null;
    };
  }, [focusInitialHeading]));

  const disabled = !settings.settingsLoaded || !settings.settingsReadSucceeded;
  const setSize = (delta: number) => {
    if (!disabled) settings.setFontSize(Math.max(0.8, Math.min(1.8, Math.round((settings.fontSize + delta) * 10) / 10)));
  };
  const saveRoute = (key: "avoidStairs" | "avoidIndoorRoutes" | "avoidInaccessibleCrosswalks", value: boolean) => {
    if (disabled) return;
    const save = key === "avoidStairs" ? settings.configureAvoidStairs(value) : settings.configureRoutingPreferences({ [key]: value });
    void save.catch(() => Alert.alert("Could not save preference", "Please try changing the switch again."));
  };
  return <SafeAreaView style={s.container}>
    <SettingsStatusBar />
    <View style={{ paddingHorizontal: gutter, paddingTop: 12 }} accessibilityElementsHidden={colorVision.visible} aria-hidden={colorVision.visible} importantForAccessibility={colorVision.visible ? "no-hide-descendants" : "auto"}>
      <Action label="Back To Map" back onPress={onBack} />
    </View>
    <ScrollView accessibilityElementsHidden={colorVision.visible} aria-hidden={colorVision.visible} importantForAccessibility={colorVision.visible ? "no-hide-descendants" : "auto"} contentContainerStyle={[s.content, { paddingHorizontal: gutter }]} showsVerticalScrollIndicator>
      <View style={s.header}>
        <BoldText textRef={heading} size={28} weight="800" accessibilityRole="header"
          onLayout={focusInitialHeading}>Settings</BoldText>
      </View>
        <Section title="Navigation mode"><Choices>
          <Choice mode label="Standard" accessibilityLabel="Standard navigation mode" selected={settings.navigationMode === "standard"}
            disabled={disabled} onPress={() => onNavigationModeChange("standard")} />
          <Choice mode label="Accessibility" accessibilityLabel="Accessible navigation mode" selected={settings.navigationMode === "accessibility"}
            disabled={disabled} onPress={() => onNavigationModeChange("accessibility")} />
        </Choices></Section>
      <View style={s.accordions}>
      <Accordion title={SETTINGS_SECTION_TITLES.appearance} icon={HEADER_ICONS.display}>
          <BoldText style={s.label}>Settings layout</BoldText>
          <View style={s.choiceInset}><Choices>
            <Choice label="Standard" accessibilityLabel="Standard Settings layout" selected={false} disabled={disabled}
              onPress={() => settings.setSettingsAppearance("standard")} />
            <Choice label="Accessible" accessibilityLabel="Accessible Settings layout" selected disabled={disabled}
              onPress={() => settings.setSettingsAppearance("accessible")} />
          </Choices></View>
          <BoldText size={17} weight="600" color={COLORS.secondary} style={s.note}>Settings layout doesn’t change Navigation mode.</BoldText>
          <Divider important />
          <BoldText style={s.label}>App appearance</BoldText>
          <View style={s.choiceInset}><ThemeChoices /></View>
          <Divider important />
          <ColorVisionSetting accessibleAppearance onPress={colorVision.show} triggerRef={colorVision.triggerRef} />
      </Accordion>
      <Accordion title={SETTINGS_SECTION_TITLES.text} icon={HEADER_ICONS.text}>
          <BoldText style={s.label}>Text size</BoldText>
          <BoldText size={17} weight="600" color={COLORS.secondary} style={s.note}>80%–180%</BoldText>
          <View style={s.sliderGroup}>
            <BoldText size={18} color={COLORS.accent}>Current size: {Math.round(settings.fontSize * 100)}%</BoldText>
            <View style={s.slider} onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
              accessible accessibilityRole="adjustable" accessibilityLabel="Text size"
              accessibilityState={{ disabled }} accessibilityValue={{ min: 80, max: 180, now: Math.round(settings.fontSize * 100), text: `${Math.round(settings.fontSize * 100)} percent` }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) => { if (!disabled) onFontSizeAccessibilityAction(event); }}>
              <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                style={[s.sliderRail, increasedContrast && s.strongRail]} />
              <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                style={[s.sliderThumb, { left: Math.max(0, sliderWidth - 44) * (settings.fontSize - 0.8) }]} />
              <Slider minimumValue={0.8} maximumValue={1.8} step={0.1} value={settings.fontSize} disabled={disabled}
                onValueChange={(value) => { if (!disabled) settings.setFontSize(value); }}
                minimumTrackTintColor="transparent" maximumTrackTintColor="transparent" thumbTintColor="transparent"
                style={s.sliderInput} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
            </View>
          </View>
          <View style={s.sizeActions}><Choices>
            <TouchableOpacity style={[s.sizeButton, increasedContrast && s.strongBoundary, (disabled || settings.fontSize <= 0.8) && s.unavailable]} accessibilityRole="button" accessibilityLabel="Decrease text size"
              accessibilityState={{ disabled: disabled || settings.fontSize <= 0.8 }} disabled={disabled || settings.fontSize <= 0.8} onPress={() => setSize(-0.1)}>
              <BoldText accessible={false}>− Decrease</BoldText>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sizeButton, increasedContrast && s.strongBoundary, (disabled || settings.fontSize >= 1.8) && s.unavailable]} accessibilityRole="button" accessibilityLabel="Increase text size"
              accessibilityState={{ disabled: disabled || settings.fontSize >= 1.8 }} disabled={disabled || settings.fontSize >= 1.8} onPress={() => setSize(0.1)}>
              <BoldText accessible={false}>+ Increase</BoldText>
            </TouchableOpacity>
          </Choices></View>
          <Divider important />
          <BoldText style={s.label}>Distance units</BoldText>
          <View style={s.choiceInset}>
            <Choices>
              <Choice
                label="Feet / miles"
                selected={settings.distanceUnits === "imperial"}
                disabled={disabled}
                onPress={() => settings.setDistanceUnits("imperial")}
              />
              <Choice
                label="Meters / km"
                selected={settings.distanceUnits === "metric"}
                disabled={disabled}
                onPress={() => settings.setDistanceUnits("metric")}
              />
            </Choices>
          </View>
          <Divider important /><BoldText style={s.label}>Direction style</BoldText>
          <BoldText size={17} weight="600" color={COLORS.secondary} style={s.note}>Natural: Turn Left/Right. Degrees: Turn Left/Right 90°.</BoldText>
          <View style={s.choiceInset}><Choices>
            <Choice label="Natural" selected={settings.directionStyle === "natural"} disabled={disabled} onPress={() => settings.setDirectionStyle("natural")} />
            <Choice label="Degrees" selected={settings.directionStyle === "degrees"} disabled={disabled} onPress={() => settings.setDirectionStyle("degrees")} />
          </Choices></View>
      </Accordion>
      <Accordion title={SETTINGS_SECTION_TITLES.accessibility} icon={HEADER_ICONS.accessibility}>
        <AccessibilityPanel controls={accessibilityControls} />
        <Divider />
        <ToggleRow label="Battery Saver" icon="battery-heart-outline" value={settings.batterySaverEnabled} disabled={disabled}
          onChange={settings.setBatterySaverEnabled}
          description="Uses fewer location updates, less compass activity, and fewer animations. Background GPS and navigation notifications are off. Turn guidance stays on while navigation is open." />
      </Accordion>
      <Accordion title={SETTINGS_SECTION_TITLES.routing} icon={HEADER_ICONS.routing}>
          <BoldText style={s.label}>Route preferences</BoldText>
          <BoldText size={17} weight="600" color={COLORS.secondary} style={s.note}>Applies when starting a new route.</BoldText>
          <ToggleRow label="Avoid stairs" description="Avoid stairs." icon="stairs" value={settings.avoidStairs} disabled={disabled} onChange={(value) => saveRoute("avoidStairs", value)} /><Divider />
          <ToggleRow label="Avoid routes through buildings" description="Don?t use buildings as a way to reach another destination." icon="office-building" value={settings.avoidIndoorRoutes} disabled={disabled} onChange={(value) => saveRoute("avoidIndoorRoutes", value)} /><Divider />
          <ToggleRow label="Accessible road crossings only" description="Avoid crosswalks that don't have audible signals for visually impaired people." icon="walk" value={settings.avoidInaccessibleCrosswalks} disabled={disabled} onChange={(value) => saveRoute("avoidInaccessibleCrosswalks", value)} />
          <Divider important /><BoldText style={s.label}>Spoken guidance</BoldText>
          <BoldText size={17} weight="600" color={COLORS.secondary} style={s.note}>For accessibility navigation.</BoldText>
          <ToggleRow label="Repeat spoken instructions" value={settings.repeatGuidanceEnabled} disabled={disabled} onChange={settings.setRepeatGuidanceEnabled} /><Divider />
          <BoldText style={s.label}>Repetition interval</BoldText>
          <BoldText size={17} weight="600" color={COLORS.secondary} style={s.note}>Repeat the current instruction every:</BoldText>
          <View style={s.intervalGrid}>
            {[5, 9, 15, 30, 60].map((seconds) => <View key={seconds} style={{ width: columns === 3 ? "31%" : columns === 2 ? "48%" : "100%" }}>
              <Choice label={`${seconds} s`} accessibilityLabel={`Repeat every ${seconds} seconds`}
                selected={settings.repeatGuidanceSeconds === seconds} disabled={disabled || !settings.repeatGuidanceEnabled}
                onPress={() => settings.setRepeatGuidanceSeconds(seconds)} />
            </View>)}
          </View>
          {!settings.repeatGuidanceEnabled && <BoldText size={17} weight="600" color={COLORS.secondary} style={s.note}>Enable repetition to change the interval. Your interval is saved.</BoldText>}
          <BoldText size={17} weight="600" color={COLORS.secondary} style={s.note}>New directions are still spoken when repetition is off.</BoldText>
      </Accordion>
      <Accordion title={SETTINGS_SECTION_TITLES.support} icon={HEADER_ICONS.support}>
          <BoldText style={s.label}>Support</BoldText>
          <Action label="Share Your Feedback" description="Help improve MapQP by completing our user study survey. Opens in your browser."
            onPress={() => { void openUserStudySurvey(); }} /><Divider />
          <Action label="Report a bug" onPress={() => router.push("/report-bug")} /><Divider />
          <View style={[s.infoRow, stacked && s.stackedRow]}><BoldText style={s.flex}>Route data version</BoldText><BoldText size={18} color={COLORS.secondary}>v{mapVersion}</BoldText></View>
          <Divider important /><BoldText style={s.label}>Data management</BoldText>
          <View style={s.collapseFooter}>
            <Action label="Delete all local data" description="Confirmation required." danger onPress={onDelete} />
          </View>
      </Accordion>
      </View>
      <TouchableOpacity accessible accessibilityRole="button" accessibilityLabel="Return to Home"
        accessibilityHint="Returns to the MapQP landing page." onPress={onHome}
        style={[s.homeAction, increasedContrast && s.homeActionContrast]}>
        <MaterialCommunityIcons name="home-outline" size={28} color={vision.color(COLORS.accent, "iconColor")} accessible={false}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
        <View style={s.flex} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <BoldText size={22} weight="600">Return to Home</BoldText>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={28} color={vision.color(COLORS.accent, "iconColor")} accessible={false}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
      </TouchableOpacity>
    </ScrollView>
    <ColorVisionDialog accessibleAppearance visible={colorVision.visible} onClose={colorVision.close} triggerRef={colorVision.triggerRef} />
  </SafeAreaView>;
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BASE_COLORS.background },
  content: { paddingTop: 12, paddingBottom: 28, gap: 16 },
  header: { gap: 12 }, section: { gap: 12 }, accordions: { gap: 12 },
  homeAction: { width: "100%", minHeight: 72, padding: 16, flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: BASE_COLORS.panel, borderWidth: 1, borderColor: "#94877F", borderRadius: 12 },
  homeActionContrast: { borderWidth: 2, borderColor: BASE_COLORS.contrastOutline },
  accordionHeader: { minHeight: 72, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12,
    borderBottomWidth: 2, borderBottomColor: "transparent" },
  expandedHeader: { backgroundColor: "#F5ECEE", borderBottomColor: BASE_COLORS.accent, borderBottomWidth: 3 },
  accordionHeading: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  collapseFooter: { padding: 12 },
  collapseButton: { minWidth: 44, minHeight: 56, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: BASE_COLORS.outline,
    borderRadius: 12, backgroundColor: BASE_COLORS.panel },
  headerIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  panel: { backgroundColor: BASE_COLORS.panel, borderRadius: 18, borderWidth: 1, borderColor: BASE_COLORS.outline, overflow: "hidden" },
  strongPanel: { borderWidth: 2, borderColor: BASE_COLORS.contrastOutline },
  strongBoundary: { borderColor: BASE_COLORS.contrastOutline },
  divider: { height: 1, backgroundColor: BASE_COLORS.divider }, importantDivider: { backgroundColor: BASE_COLORS.importantDivider },
  strongDivider: { height: 2, backgroundColor: BASE_COLORS.contrastOutline },
  flex: { flex: 1, minWidth: 0 }, stacked: { flexDirection: "column" },
  fullWidth: { width: "100%", flexGrow: 0, flexShrink: 1, flexBasis: "auto" }, chevronEnd: { alignSelf: "flex-end" },
  wrappedIconLabel: { flexDirection: "row", flexWrap: "wrap", columnGap: 8, rowGap: 0 }, word: { maxWidth: "100%", flexShrink: 0 },
  stackedRow: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  choices: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  choiceCell: { flex: 1, minWidth: 0 }, choiceColumn: { width: "100%" },
  choice: { width: "100%", flexGrow: 1, flexShrink: 0, minWidth: 0, minHeight: 64, borderWidth: 2, borderColor: BASE_COLORS.outline, borderRadius: 12,
    backgroundColor: BASE_COLORS.panel, paddingHorizontal: 8, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 4 },
  modeChoice: { minHeight: 112, flexDirection: "column", alignItems: "flex-start", justifyContent: "center" },
  selected: { backgroundColor: BASE_COLORS.accent, borderColor: BASE_COLORS.accent }, unavailable: { borderStyle: "dashed" },
  action: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  actionCopy: { flex: 1, minWidth: 0, gap: 8 }, back: { minHeight: 56, borderRadius: 12, borderWidth: 1,
    borderColor: BASE_COLORS.outline, backgroundColor: BASE_COLORS.panel },
  rowLabel: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  toggleRow: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  compactBatteryRow: { minHeight: 64, paddingVertical: 4 },
  switchGroup: { alignItems: "center", gap: 4, flexShrink: 0, alignSelf: "center" },
  stackedSwitchGroup: { flexDirection: "row", alignSelf: "flex-start", minHeight: 56, gap: 16 },
  track: { width: 80, height: 48, borderRadius: 24, borderWidth: 2, padding: 4, justifyContent: "center", borderColor: BASE_COLORS.ink },
  trackOn: { backgroundColor: BASE_COLORS.accent, borderColor: BASE_COLORS.accent, alignItems: "flex-end" },
  trackOff: { backgroundColor: BASE_COLORS.off, alignItems: "flex-start" }, trackDisabled: { borderStyle: "dashed" },
  thumb: { width: 36, height: 36, borderRadius: 18, backgroundColor: BASE_COLORS.panel },
  status: { minWidth: 96, alignItems: "center", gap: 4, flexShrink: 0 },
  readOnly: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, minHeight: 96 }, readOnlyHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusNote: { paddingHorizontal: 16, paddingBottom: 16 },
  label: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  note: { paddingHorizontal: 16, paddingBottom: 8 }, choiceInset: { paddingHorizontal: 12, paddingVertical: 8 },
  sizeActions: { paddingHorizontal: 12, paddingVertical: 8 },
  sizeButton: { minHeight: 64, padding: 8, borderWidth: 2, borderColor: BASE_COLORS.outline, borderRadius: 12,
    justifyContent: "center", flexGrow: 1 },
  sliderGroup: { padding: 16, gap: 8 }, slider: { minHeight: 64, justifyContent: "center" }, sliderInput: { width: "100%", height: 64 },
  sliderRail: { position: "absolute", left: 22, right: 22, height: 12, borderRadius: 6, backgroundColor: "#85858F" },
  strongRail: { backgroundColor: BASE_COLORS.contrastOutline },
  sliderThumb: { position: "absolute", width: 44, height: 44, borderRadius: 22, borderWidth: 3,
    borderColor: BASE_COLORS.ink, backgroundColor: BASE_COLORS.panel },
  intervalGrid: { padding: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  infoRow: { minHeight: 64, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
});
