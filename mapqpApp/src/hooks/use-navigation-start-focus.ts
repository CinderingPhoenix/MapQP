import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import type { ElementRef } from "react";
import { AccessibilityInfo, Keyboard, Platform } from "react-native";
import type { LayoutChangeEvent, View } from "react-native";

// Route objects change on rerouting; the destination identifies a navigation session.
export function useNavigationStartFocus(
  destinationKey: string | null,
  destinationName: string,
  screenReaderEnabled: boolean,
  enabled = true,
) {
  const target = useRef<ElementRef<typeof View> | null>(null);
  // Ref detachment alone does not imply native unmounting. Cache layout by
  // instance so a same-instance reattachment needs no new onLayout event.
  const laidOutTarget = useRef<ElementRef<typeof View> | null>(null);
  const focused = useRef(false);
  const session = useMemo(() => ({ handled: false }), [destinationKey]);

  const focusSummary = useCallback(() => {
    const summary = target.current;
    if (!enabled || !destinationKey || session.handled || !focused.current ||
        !screenReaderEnabled || Keyboard.isVisible() ||
        !summary || laidOutTarget.current !== summary) return;

    session.handled = true;
    AccessibilityInfo.sendAccessibilityEvent(summary, "focus");
    // Keep startup speech separate from the instruction read by the focused control.
    const announcement = `Navigation started to ${destinationName}.`;
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibilityWithOptions(announcement, { queue: true });
    } else {
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [enabled, destinationKey, destinationName, screenReaderEnabled, session]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    const keyboardHidden = Keyboard.addListener("keyboardDidHide", focusSummary);
    focusSummary();
    return () => {
      focused.current = false;
      keyboardHidden.remove();
    };
  }, [focusSummary]));

  const summaryRef = useCallback((node: ElementRef<typeof View> | null) => {
    target.current = node;
  }, []);

  const onSummaryLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!target.current) return;
    if (width <= 0 || height <= 0) {
      laidOutTarget.current = null;
      return;
    }
    laidOutTarget.current = target.current;
    focusSummary();
  }, [focusSummary]);

  return { summaryRef, onSummaryLayout };
}
