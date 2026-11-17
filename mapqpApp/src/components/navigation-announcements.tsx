import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import type { PoliteAnnouncement } from "../utils/navigation-speech";

// TalkBack has no announcement priority option. Optional guidance updates this
// polite live region; urgent instructions use the coordinator's explicit API.
// Native delivery timing still belongs to TalkBack and needs device validation.
export default function NavigationAnnouncements({ message }: { message: PoliteAnnouncement }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText("");
    if (Platform.OS !== "android" || !message.text) return;
    // Commit an empty value first so a configured repetition of identical text
    // still changes the native live region. This is rendering, not a speech timer.
    const frame = requestAnimationFrame(() => setText(message.text));
    return () => cancelAnimationFrame(frame);
  }, [message]);
  if (Platform.OS !== "android") return null;
  return <Text accessible={false} importantForAccessibility="yes"
    accessibilityLiveRegion="polite" pointerEvents="none" style={styles.liveRegion}>{text}</Text>;
}

const styles = StyleSheet.create({
  liveRegion: { position: "absolute", width: 1, height: 1, overflow: "hidden" },
});
