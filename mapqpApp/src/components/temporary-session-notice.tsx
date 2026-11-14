import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, StyleSheet, Text } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
import { isReviewSession } from "../utils/review-access";

// Display only: never writes or renews the session deadline.
export function TemporarySessionNotice() {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const { fontSize } = useSettings();
  const { emphasizedTextEnabled } = useAccessibilityPreferences();
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all([
      SecureStore.getItemAsync("mapqp_temp_code_session"),
      SecureStore.getItemAsync("mapqp_temp_code_expires_at"),
    ]).then(([code, expiry]) => {
      if (active) {
        const value = Number(expiry);
        setDeadline(code && !isReviewSession(code) && expiry && Number.isFinite(value) ? value : null);
        setNow(Date.now());
      }
    }).catch(() => { if (active) setDeadline(null); });
    return () => { active = false; };
  }, []));
  useEffect(() => {
    if (deadline === null) return;
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [deadline]);
  if (deadline === null) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remaining = seconds >= 3600
    ? `${hours}h`
    : `${minutes}m ${seconds % 60}s`;
  return (
    <Text style={[styles.notice, { fontSize: 14 * fontSize, fontWeight: emphasizedTextEnabled ? "bold" : "500" }]}>
      {seconds > 0 ? `Temporary access: signs out in ${remaining}` : "Temporary access expired. Signing out?"}
    </Text>
  );
}
const styles = StyleSheet.create({
  notice: {
    color: "#713F12", backgroundColor: "#FEF3C7",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    textAlign: "center", marginBottom: 8, flexShrink: 1,
  },
});
