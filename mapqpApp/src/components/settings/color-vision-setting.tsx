import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useEffect, useRef, useState, type ComponentRef, type RefObject } from "react";
import { AccessibilityInfo, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings } from "../../context/settings-context";
import { useAccessibilityPreferences } from "../../hooks/use-accessibility-preferences";
import { useColorVisionPalette } from "../../hooks/use-color-vision-palette";
import { COLOR_VISION_OPTIONS, colorVisionDialogSize } from "../../theme/color-vision-palettes";

type Trigger = ComponentRef<typeof TouchableOpacity>;
const SCOPE = "Changes Settings and navigation controls, not the map.";

export function useColorVisionDialog() {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<Trigger>(null);
  const show = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  useFocusEffect(useCallback(() => close, [close]));
  return { visible, triggerRef, show, close };
}

export function ColorVisionSetting({ accessibleAppearance = false, onPress, triggerRef }: {
  accessibleAppearance?: boolean; onPress: () => void; triggerRef: RefObject<Trigger | null>;
}) {
  const { colorVisionPreset, fontSize, settingsLoaded, settingsReadSucceeded } = useSettings();
  const { boldTextEnabled } = useAccessibilityPreferences();
  const vision = useColorVisionPalette();
  const label = COLOR_VISION_OPTIONS.find(option => option.value === colorVisionPreset)?.label ?? "Default";
  const disabled = !settingsLoaded || !settingsReadSucceeded;
  const ink = vision.color(accessibleAppearance ? "#211E1C" : "#000000");
  const accent = vision.textColor("#741B2B", "accentText");
  const size = accessibleAppearance ? 20 : 17;
  const scale = (n: number) => ({ fontSize: n * fontSize, lineHeight: Math.ceil(n * fontSize * 1.4) });
  return <TouchableOpacity activeOpacity={1} ref={triggerRef} accessible accessibilityRole="button"
    accessibilityLabel={`Color vision, ${label}`} accessibilityHint={`${SCOPE} Opens color-vision presets.`}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[s.trigger, accessibleAppearance ? s.accessibleTrigger : s.standardTrigger,
      { borderColor: vision.color(accessibleAppearance ? "#81756E" : "#D0CDC9", "borderColor") },
      disabled && vision.monochrome && { borderStyle: "dashed", backgroundColor: vision.palette.disabledSurface }]}>
    <View style={[s.triggerHeading, accessibleAppearance && s.accessibleHeading]} accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.copy}>
        <View style={s.labelLine}><Text allowFontScaling style={[scale(size), { flexShrink: 1, color: ink, fontWeight: boldTextEnabled ? "900" : accessibleAppearance ? "700" : "500" }]}>Color vision</Text>
          {accessibleAppearance && <MaterialCommunityIcons name="chevron-right" size={28} color={vision.color(accent, "iconColor")} accessible={false} allowFontScaling={false} />}
        </View>
        {accessibleAppearance && <Text allowFontScaling style={[scale(20), { color: accent, fontWeight: boldTextEnabled ? "900" : "600" }]}>{label}</Text>}
      </View>
      {!accessibleAppearance && <Text allowFontScaling style={[scale(15), s.value, { color: accent, fontWeight: boldTextEnabled ? "900" : "600" }]}>{label}</Text>}
      {!accessibleAppearance && <MaterialCommunityIcons name="chevron-right" size={20} color={vision.color(accent, "iconColor")}
        accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />}
    </View>
    <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling
      style={[scale(accessibleAppearance ? 17 : 14), { color: ink, fontWeight: boldTextEnabled ? "900" : accessibleAppearance ? "600" : "400" }]}>{SCOPE}</Text>
  </TouchableOpacity>;
}

export function ColorVisionDialog({ visible, onClose, triggerRef, accessibleAppearance = false }: {
  visible: boolean; onClose: () => void; triggerRef: RefObject<Trigger | null>; accessibleAppearance?: boolean;
}) {
  const { colorVisionPreset, setColorVisionPreset, fontSize } = useSettings();
  const preferences = useAccessibilityPreferences();
  const vision = useColorVisionPalette();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const size = colorVisionDialogSize(width, height, insets);
  const enlarged = accessibleAppearance && fontSize * fontScale >= 1.35;
  const titleRef = useRef<ComponentRef<typeof View>>(null);
  const active = useRef(false), shown = useRef(false), laidOut = useRef(false), focused = useRef(false);
  const wasVisible = useRef(false), restorePending = useRef(false), visibleRef = useRef(visible);
  const frames = useRef<number[]>([]);
  visibleRef.current = visible;
  if (visible && !wasVisible.current) {
    shown.current = false; laidOut.current = false; focused.current = false;
    restorePending.current = false;
  }
  wasVisible.current = visible;
  const cancelFrames = useCallback(() => { frames.current.forEach(cancelAnimationFrame); frames.current = []; }, []);
  useFocusEffect(useCallback(() => {
    active.current = true;
    return () => { active.current = false; restorePending.current = false; cancelFrames(); };
  }, [cancelFrames]));
  useEffect(() => cancelFrames, [cancelFrames]);
  const focus = (target: ComponentRef<typeof View> | Trigger | null) => {
    if (!target || !active.current) return;
    if (Platform.OS === "web") (target as unknown as { focus: (options?: { preventScroll: boolean }) => void }).focus({ preventScroll: true });
    else if (preferences.screenReaderEnabled) AccessibilityInfo.sendAccessibilityEvent(target, "focus");
  };
  const focusTitle = () => {
    if (!visibleRef.current || !shown.current || !laidOut.current || focused.current) return;
    frames.current.push(requestAnimationFrame(() => {
      if (!visibleRef.current || !active.current || focused.current) return;
      focused.current = true; focus(titleRef.current);
    }));
  };
  const restore = () => {
    if (!restorePending.current || visibleRef.current || !active.current) return;
    restorePending.current = false;
    focus(triggerRef.current);
  };
  useEffect(() => {
    if (visible || !restorePending.current || Platform.OS === "ios") return;
    frames.current.push(requestAnimationFrame(() => {
      frames.current.push(requestAnimationFrame(restore));
    }));
    // onDismiss handles iOS; Android/web wait until the modal is removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const dismiss = () => { cancelFrames(); restorePending.current = true; onClose(); };
  const font = (n: number, selected = false) => ({ fontSize: n * fontSize,
    lineHeight: Math.ceil(n * fontSize * 1.45), fontWeight: preferences.boldTextEnabled ? "900" as const : "600" as const,
    color: selected ? "#FFFFFF" : vision.color(accessibleAppearance ? "#211E1C" : "#000000"), flexShrink: 1 });
  const outline = vision.increased ? vision.color("#272423", "borderColor") : vision.color("#70655F", "borderColor");
  const primary = vision.color("#741B2B", "backgroundColor");
  const description = <Text allowFontScaling style={font(accessibleAppearance ? 17 : 14)}>{SCOPE}</Text>;

  return <Modal transparent visible={visible} animationType="none" onRequestClose={dismiss}
    onShow={() => { shown.current = true; focusTitle(); }} onDismiss={restore}>
    <View style={[s.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16,
      paddingLeft: insets.left, paddingRight: insets.right,
      backgroundColor: preferences.reduceTransparencyEnabled ? (accessibleAppearance ? vision.color("#F7F6F2", "backgroundColor") : vision.settingsBackground("#F7F6F2")) : vision.color("rgba(39,36,35,0.4)", "backgroundColor") }]}>
      <View testID="color-vision-dialog" accessibilityViewIsModal importantForAccessibility="yes" onAccessibilityEscape={dismiss}
        style={[s.panel, { width: size.width, maxHeight: size.maxHeight, borderColor: outline,
          backgroundColor: accessibleAppearance ? "#FFFFFF" : vision.settingsBackground("#F7F6F2") }]}>
        <View style={[s.header, accessibleAppearance && s.accessibleHeader]}>
          <View ref={titleRef} accessible accessibilityRole="header" accessibilityLabel="Color vision" focusable
            onLayout={event => { const { width: w, height: h } = event.nativeEvent.layout; laidOut.current = w > 0 && h > 0; focusTitle(); }}>
            <Text accessible={false} allowFontScaling style={[font(accessibleAppearance ? 28 : 23), { fontWeight: preferences.boldTextEnabled ? "900" : accessibleAppearance ? "800" : "600" }]}>Color vision</Text>
          </View>
          {!enlarged && description}
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={[s.options, { paddingHorizontal: accessibleAppearance ? 8 : 20 }]}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <View accessibilityRole="radiogroup" style={[s.optionsGroup, accessibleAppearance && s.accessibleOptionsGroup]}>
            {COLOR_VISION_OPTIONS.map(option => {
              const selected = option.value === colorVisionPreset;
              return <TouchableOpacity activeOpacity={1} key={option.value} accessible accessibilityRole="radio"
                accessibilityLabel={`${option.label}. ${option.description}`} accessibilityState={{ checked: selected }}
                onPress={() => { setColorVisionPreset(option.value); dismiss(); }}
                style={[s.option, accessibleAppearance && s.accessibleOption, enlarged && s.enlargedOption,
                  { borderColor: selected && !vision.increased ? primary : outline,
                    borderWidth: vision.increased ? 2 : 1, backgroundColor: selected ? primary : "#FFFFFF" }]}>
                {!accessibleAppearance && (selected ? <MaterialCommunityIcons name="check" size={20} color="#FFFFFF"
                  accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
                  : <View style={{ width: 20 }} />)}
                <View style={[s.optionCopy, enlarged && s.enlargedCopy]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={[s.optionHeading, enlarged && s.enlargedHeading]}>
                    {accessibleAppearance && enlarged && selected && <MaterialCommunityIcons name="check" size={24} color="#FFFFFF" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />}
                    <Text accessible={false} allowFontScaling style={[font(accessibleAppearance ? 20 : 17, selected), s.optionName,
                      accessibleAppearance && { lineHeight: Math.ceil(20 * fontSize * 1.4) }, enlarged && s.enlargedName]}>{option.label}</Text>
                    {accessibleAppearance && !enlarged && selected && <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />}
                  </View>
                  <Text accessible={false} allowFontScaling style={[font(accessibleAppearance ? 16 : 14, selected),
                    { lineHeight: Math.ceil((accessibleAppearance ? 22 : 20) * fontSize),
                      fontWeight: preferences.boldTextEnabled ? "900" : "400",
                      color: selected ? "#FFFFFF" : accessibleAppearance ? "#3D3733" : "#000000" }]}>{option.description}</Text>
                </View>
              </TouchableOpacity>;
            })}
          </View>
          {enlarged && <View style={s.largeScope}>{description}</View>}
        </ScrollView>
        <View style={s.footer}>
          <TouchableOpacity activeOpacity={1} accessible accessibilityRole="button" accessibilityLabel="Cancel" onPress={dismiss}
            style={[s.cancel, { borderColor: outline, borderWidth: accessibleAppearance || vision.increased ? 2 : 0 }]}>
            <Text accessible={false} allowFontScaling style={[font(accessibleAppearance ? 20 : 17), { color: vision.textColor("#741B2B", "accentText"), textAlign: "center" }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  trigger: { gap: 4, paddingVertical: 10 }, standardTrigger: { borderBottomWidth: 1 },
  accessibleTrigger: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 8 },
  labelLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  triggerHeading: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 },
  accessibleHeading: { minHeight: 72, gap: 12 }, copy: { flex: 1, minWidth: 0, gap: 4 }, value: { maxWidth: "50%" },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  panel: { flexShrink: 1, borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  header: { flexShrink: 0, padding: 12, paddingVertical: 16, gap: 8 },
  accessibleHeader: { paddingHorizontal: 16 },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 }, options: { paddingBottom: 4 }, optionsGroup: { gap: 12 }, accessibleOptionsGroup: { gap: 8 },
  option: { minHeight: 56, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12 },
  optionCopy: { flex: 1, minWidth: 0, gap: 2 },
  optionHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionName: { flex: 1, minWidth: 0 },
  enlargedCopy: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" },
  enlargedName: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" },
  enlargedHeading: { flexDirection: "column", alignItems: "flex-start", gap: 4 },
  accessibleOption: { minHeight: 56, paddingHorizontal: 8, paddingVertical: 6 },
  enlargedOption: { flexDirection: "column", alignItems: "stretch" },
  largeScope: { paddingTop: 12, paddingHorizontal: 4 },
  footer: { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 12 },
  cancel: { minHeight: 64, borderRadius: 12, padding: 16, alignItems: "center", justifyContent: "center" },
});
