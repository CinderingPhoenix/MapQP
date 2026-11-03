import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
import type { RoutingPreferences } from "../utils/routing";
import { useModalDismissal } from "./avoid-stairs-prompt";

const warnings: Record<keyof RoutingPreferences, { title: string; detail: string }> = {
  avoidStairs: { title: "May use stairs or an inaccessible entrance", detail: "Avoid stairs will be off for this route." },
  avoidIndoorRoutes: { title: "Travels indoors", detail: "Avoid indoor routes will be off for this route." },
  avoidInaccessibleCrosswalks: { title: "Uses an inaccessible crosswalk", detail: "Avoid inaccessible crosswalks will be off for this route." },
};

export function RouteAlternativePrompt({ relaxed, onAnswer }: {
  relaxed: (keyof RoutingPreferences)[];
  onAnswer: (accepted: boolean) => void;
}) {
  const { fontSize } = useSettings();
  const { screenReaderEnabled, boldTextEnabled } = useAccessibilityPreferences();
  const heading = useRef<React.ElementRef<typeof Text>>(null);
  const [shown, setShown] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const [choice, setChoice] = useState<boolean | null>(null);
  const choiceRef = useRef<boolean | null>(null);
  const visible = choice === null;
  const nativeDismiss = useModalDismissal(visible, () => {
    if (choiceRef.current !== null) onAnswer(choiceRef.current);
  });
  const answer = (accepted: boolean) => {
    if (choiceRef.current !== null) return;
    choiceRef.current = accepted;
    setChoice(accepted);
  };

  useEffect(() => {
    if (!shown || !laidOut || !visible || (!screenReaderEnabled && Platform.OS !== "web")) return;
    const frame = requestAnimationFrame(() => {
      if (!heading.current) return;
      if (Platform.OS === "web") heading.current.focus();
      else AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
    });
    return () => cancelAnimationFrame(frame);
  }, [shown, laidOut, screenReaderEnabled, visible]);

  const body = { fontSize: 18 * fontSize, fontWeight: boldTextEnabled ? "700" as const : "400" as const };
  return <Modal transparent visible={visible} animationType="none" onShow={() => setShown(true)}
    onDismiss={nativeDismiss} onRequestClose={() => answer(false)}>
    <SafeAreaView style={styles.overlay}>
      <View style={styles.card} accessibilityViewIsModal importantForAccessibility="yes"
        onAccessibilityEscape={() => answer(false)}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text ref={heading} accessible accessibilityRole="header" onLayout={() => setLaidOut(true)}
            {...(Platform.OS === "web" ? { tabIndex: -1 as const } : {})}
            style={[styles.heading, { fontSize: 26 * fontSize }]}>Review an alternative route</Text>
          <Text style={[styles.text, body]}>We couldn't find a route with your current settings. Another route is available, but it has these barriers:</Text>
          <View style={styles.warnings}>
            {relaxed.map((key) => <View key={key} style={styles.warning} accessible
              accessibilityLabel={`${warnings[key].title}. ${warnings[key].detail}`}>
              <Text style={[styles.warningTitle, { fontSize: 19 * fontSize }]}>{warnings[key].title}</Text>
              <Text style={[styles.text, body]}>{warnings[key].detail}</Text>
            </View>)}
          </View>
          <Text style={[styles.text, body]}>Your saved settings will stay the same. Choose whether this route works for you.</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityHint="Closes this prompt without starting the alternative route."
            onPress={() => answer(false)} style={[styles.button, styles.cancel]}>
            <Text style={[styles.cancelText, { fontSize: 19 * fontSize }]}>Cancel route</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityHint="Starts the route with the barriers listed above."
            onPress={() => answer(true)} style={[styles.button, styles.accept]}>
            <Text style={[styles.acceptText, { fontSize: 19 * fontSize }]}>Use this route</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.7)" },
  card: { width: "100%", maxWidth: 480, maxHeight: "90%", backgroundColor: "#FFFFFF", borderRadius: 24, overflow: "hidden", flexShrink: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 24, gap: 20 },
  heading: { color: "#761723", fontWeight: "800" },
  text: { color: "#172033" },
  warnings: { gap: 12 },
  warning: { backgroundColor: "#FFF4E5", borderColor: "#885000", borderWidth: 2, borderRadius: 12, padding: 16, gap: 8 },
  warningTitle: { color: "#603800", fontWeight: "700" },
  button: { minHeight: 56, padding: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancel: { borderWidth: 2, borderColor: "#761723", backgroundColor: "#FFFFFF" },
  accept: { backgroundColor: "#761723" },
  cancelText: { color: "#761723", fontWeight: "700", textAlign: "center" },
  acceptText: { color: "#FFFFFF", fontWeight: "700", textAlign: "center" },
});
