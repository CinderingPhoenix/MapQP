import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
import { useAppTheme } from "../hooks/use-app-theme";
import { useSettingsPalette } from "../hooks/use-settings-theme";
import { openUserStudySurvey } from "../utils/user-study-survey";
import { useModalDismissal } from "./avoid-stairs-prompt";

export function PostNavigationSurvey({ visible, onClose, returnFocusRef }: {
  visible: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<React.ElementRef<typeof View> | null>;
}) {
  const theme = useAppTheme();
  const { palette } = useSettingsPalette();
  const { fontSize } = useSettings();
  const { screenReaderEnabled, emphasizedTextEnabled } = useAccessibilityPreferences();
  const heading = useRef<React.ElementRef<typeof Text>>(null);
  const [shown, setShown] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const focused = useRef(false);
  const answered = useRef(false);
  const openAfterDismiss = useRef(false);
  const nativeDismiss = useModalDismissal(visible, () => {
    if (openAfterDismiss.current) {
      openAfterDismiss.current = false;
      void openUserStudySurvey();
    } else if (answered.current && screenReaderEnabled && AppState.currentState === "active" && returnFocusRef.current) {
      if (Platform.OS === "web") returnFocusRef.current.focus();
      else AccessibilityInfo.sendAccessibilityEvent(returnFocusRef.current, "focus");
    }
  });

  useEffect(() => {
    if (!visible) { setShown(false); setLaidOut(false); focused.current = false; }
    else answered.current = false;
  }, [visible]);
  useEffect(() => {
    if (!visible || !shown || !laidOut || focused.current || (!screenReaderEnabled && Platform.OS !== "web")) return;
    const frame = requestAnimationFrame(() => {
      if (!heading.current || focused.current) return;
      focused.current = true;
      // A layout boundary, NOT an estimate of arrival speech duration. Native
      // modal focus may interrupt screen-reader speech; see docs/user-study-survey.md.
      if (Platform.OS === "web") heading.current.focus();
      else AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, shown, laidOut, screenReaderEnabled]);

  const answer = (open: boolean) => {
    if (!visible || answered.current) return;
    answered.current = true;
    openAfterDismiss.current = open;
    onClose();
  };
  const ink = { color: palette.text };
  const body = { fontSize: 18 * fontSize, fontWeight: emphasizedTextEnabled ? "700" as const : "400" as const };
  const outline = { borderColor: palette.outline, borderWidth: theme.increased ? 2 : 1 };
  return <Modal visible={visible} transparent animationType="none" onShow={() => setShown(true)}
    onDismiss={nativeDismiss} onRequestClose={() => answer(false)}>
    <SafeAreaView style={[styles.overlay, { backgroundColor: theme.opaque ? (theme.dark ? theme.tokens.backdrop : palette.background) : "rgba(0,0,0,0.7)" }]}>
      <View style={[styles.card, outline, { backgroundColor: palette.surface }]} accessibilityViewIsModal
        importantForAccessibility="yes" onAccessibilityEscape={() => answer(false)}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text ref={heading} allowFontScaling accessible accessibilityRole="header" onLayout={() => setLaidOut(true)}
            {...(Platform.OS === "web" ? { tabIndex: -1 as const } : {})}
            style={[styles.heading, ink, { fontSize: 26 * fontSize }]}>Help improve MapQP</Text>
          <Text allowFontScaling style={[ink, body]}>Would you like to share feedback about your trip? Taking the user study survey is optional.</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fill Out Survey"
            accessibilityHint="Opens the optional MapQP user study survey in your browser."
            activeOpacity={0.9} onPress={() => answer(true)} style={[styles.button, outline, { backgroundColor: palette.primary }]}>
            <Text allowFontScaling style={[styles.buttonText, { fontSize: 19 * fontSize, color: palette.onPrimary }]}>Fill Out Survey</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Not Now"
            accessibilityHint="Closes this invitation without opening the survey. Navigation is unchanged."
            activeOpacity={0.9} onPress={() => answer(false)} style={[styles.button, outline, { backgroundColor: palette.surface }]}>
            <Text allowFontScaling style={[styles.buttonText, ink, { fontSize: 19 * fontSize }]}>Not Now</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  card: { width: "100%", maxWidth: 480, maxHeight: "90%", borderRadius: 24, overflow: "hidden", flexShrink: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 24, gap: 20 },
  heading: { fontWeight: "800", flexShrink: 1 },
  button: { minHeight: 56, padding: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buttonText: { fontWeight: "700", textAlign: "center", flexShrink: 1 },
});
