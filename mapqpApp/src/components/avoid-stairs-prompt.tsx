import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";

// iOS supplies native onDismiss. Android removes its non-animated Dialog in
// the removal commit; notify on the following frames, not when visible is set.
export function useModalDismissal(visible: boolean, onDismiss?: () => void) {
  const wasVisible = useRef(false);
  const callback = useRef(onDismiss);
  callback.current = onDismiss;
  useEffect(() => {
    if (visible) { wasVisible.current = true; return; }
    if (!wasVisible.current || Platform.OS === "ios") return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        wasVisible.current = false;
        callback.current?.();
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [visible]);
  return () => {
    if (!wasVisible.current) return;
    wasVisible.current = false;
    callback.current?.();
  };
}

export function AvoidStairsPrompt({ visible, onAnswered, onDismiss }: {
  visible: boolean;
  onAnswered: () => void;
  onDismiss: () => void;
}) {
  const { fontSize, avoidStairs, configureAvoidStairs } = useSettings();
  const [selectedAvoidStairs, setSelectedAvoidStairs] = useState(avoidStairs);
  const { width, fontScale } = useWindowDimensions();
  const stackControls = width < 360 || fontSize * fontScale >= 1.4;
  const { screenReaderEnabled, loaded, boldTextEnabled } = useAccessibilityPreferences();
  const heading = useRef<React.ElementRef<typeof Text>>(null);
  const [presented, setPresented] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const focusHandled = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const nativeDismiss = useModalDismissal(visible, onDismiss);

  // Refresh the draft on presentation; toggling it never writes saved settings.
  const previouslyVisible = useRef(false);
  useEffect(() => {
    if (visible && !previouslyVisible.current) setSelectedAvoidStairs(avoidStairs);
    previouslyVisible.current = visible;
  }, [visible, avoidStairs]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!visible) {
      setPresented(false); setLaidOut(false); focusHandled.current = false;
    }
  }, [visible]);
  useEffect(() => {
    if (!visible || !presented || !laidOut || !loaded || !screenReaderEnabled || focusHandled.current) return;
    const frame = requestAnimationFrame(() => {
      if (!visibleRef.current || !heading.current || focusHandled.current) return;
      focusHandled.current = true;
      AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, presented, laidOut, loaded, screenReaderEnabled]);

  const answer = async (enabled: boolean) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(false);
    try {
      await configureAvoidStairs(enabled);
      if (mounted.current) onAnswered();
    } catch {
      if (mounted.current && visibleRef.current) setError(true);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return <Modal visible={visible} transparent animationType="none"
    onShow={() => setPresented(true)} onDismiss={nativeDismiss}
    onRequestClose={() => { /* An explicit selection is required. */ }}>
    <SafeAreaView style={styles.overlay}>
      <View style={styles.card} accessibilityViewIsModal importantForAccessibility="yes">
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text ref={heading} accessible accessibilityRole="header"
            onLayout={() => setLaidOut(true)} style={[styles.title, { fontSize: 23 * fontSize }]}>
            Customize Your Routes
          </Text>
          <Text style={[styles.text, { fontSize: 17 * fontSize }, boldTextEnabled && styles.bold]}>
            Choose how you'd prefer to navigate campus.
          </Text>
          {/* Connect the teammate's settings, setters, and save action here once
              implemented. Placeholder values must not enter persistent settings. */}
          {["Avoid Stairs", "Avoid Indoor Navigation", "Avoid Crossing Roads"].map((label, index) => {
            const comingSoon = index !== 0;
            const disabled = comingSoon || saving;
            return <View key={label} style={[styles.preferenceRow, stackControls && styles.stackedRow]}>
              <View style={styles.preferenceLabel} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Text style={[styles.text, { fontSize: 17 * fontSize }, styles.bold]}>{label}</Text>
                {comingSoon && <Text style={[styles.text, { fontSize: 15 * fontSize }]}>Coming Soon</Text>}
              </View>
              <View style={styles.switchTarget}>
                <Switch accessible importantForAccessibility="yes" hitSlop={8}
                  value={comingSoon ? false : selectedAvoidStairs} disabled={disabled}
                  onValueChange={comingSoon ? undefined : setSelectedAvoidStairs}
                  accessibilityRole="switch" accessibilityLabel={comingSoon ? `${label}, Coming Soon` : label}
                  accessibilityHint={comingSoon ? "Not available yet" : "Uses paths and building entrances marked accessible. Saved when you press Continue."}
                  accessibilityState={{ checked: comingSoon ? false : selectedAvoidStairs, disabled }}
                  trackColor={{ false: "#636366", true: "#761723" }} thumbColor="#FFFFFF" ios_backgroundColor="#636366" />
              </View>
            </View>;
          })}
          <TouchableOpacity style={[styles.button, saving && styles.saving]}
            accessibilityRole="button" accessibilityLabel="Continue"
            accessibilityHint="Saves your routing preference and closes this prompt"
            accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={() => void answer(selectedAvoidStairs)}>
            <Text style={[styles.buttonText, { fontSize: 18 * fontSize }]}>Continue</Text>
          </TouchableOpacity>
          {saving && <Text style={[styles.text, { fontSize: 17 * fontSize }]}>Saving preference…</Text>}
          {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            style={[styles.text, styles.bold, { fontSize: 17 * fontSize }]}>
            Could not save your choice. Press Continue to retry.
          </Text>}
          <Text style={[styles.text, { fontSize: 16 * fontSize }, boldTextEnabled && styles.bold]}>
            You can change these preferences anytime in Settings → Routing.
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.65)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: {
    backgroundColor: "#FFFFFF", borderRadius: 28, width: "100%", maxWidth: 380,
    maxHeight: "88%", alignSelf: "center", flexShrink: 1, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 10,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: 24, paddingVertical: 20, gap: 16 },
  title: { color: "#761723", fontWeight: "800", flexShrink: 1 },
  text: { color: "#172033", flexShrink: 1 },
  bold: { fontWeight: "800" },
  preferenceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  stackedRow: { flexDirection: "column", alignItems: "stretch" },
  preferenceLabel: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  switchTarget: { minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "flex-end" },
  button: { minHeight: 48, padding: 14, borderRadius: 12, backgroundColor: "#761723", justifyContent: "center", alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontWeight: "700", textAlign: "center", flexShrink: 1 },
  saving: { borderWidth: 2, borderColor: "#172033" },
});
