import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import type { ElementRef } from "react";
import { AccessibilityInfo, Keyboard } from "react-native";
import type { LayoutChangeEvent, View } from "react-native";

export type NavigationStartupSession = { handled: boolean; cancelled: boolean; guidancePrepared?: boolean };

// Focus reads the visible summary's label. Never also post a startup announcement.
export function useNavigationStartFocus(
  session: NavigationStartupSession | null,
  ready: boolean,
  onHandoff: () => boolean,
  announcement?: string,
) {
  const target = useRef<ElementRef<typeof View> | null>(null);
  const laidOutTarget = useRef<ElementRef<typeof View> | null>(null);
  const focused = useRef(false);
  const frame = useRef<number | null>(null);
  const latest = useRef({ session, ready, onHandoff });
  latest.current = { session, ready, onHandoff };
  const cancelFrame = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const focusSummary = useCallback(() => {
    cancelFrame();
    const pending = latest.current.session;
    if (!pending || pending.handled || pending.cancelled || !latest.current.ready ||
        !focused.current || Keyboard.isVisible() || !target.current ||
        laidOutTarget.current !== target.current) return;
    // A render-frame boundary commits the visible target after modal dismissal.
    // This is not a timer estimating VoiceOver speech duration.
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const current = latest.current;
      const node = target.current;
      if (current.session !== pending || pending.handled || pending.cancelled ||
          !current.ready || !focused.current || Keyboard.isVisible() ||
          !node || laidOutTarget.current !== node) return;
      if (current.onHandoff()) {
        if (announcement) {
          AccessibilityInfo.announceForAccessibilityWithOptions(
            announcement,
            { queue: false }
          );
        } else {
          AccessibilityInfo.sendAccessibilityEvent(node, "focus");
        }
      }
    });
  }, [cancelFrame, announcement]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    const keyboardHidden = Keyboard.addListener("keyboardDidHide", focusSummary);
    focusSummary();
    return () => {
      focused.current = false;
      cancelFrame();
      // The map owner invalidates sessions on screen blur/unmount. Effect
      // cleanup alone can also be a development Strict Mode replay.
      keyboardHidden.remove();
    };
  }, [cancelFrame, focusSummary]));
  useEffect(() => {
    focusSummary();
    return cancelFrame;
  }, [session, ready, focusSummary, cancelFrame]);

  const summaryRef = useCallback((node: ElementRef<typeof View> | null) => {
    target.current = node;
    if (!node) cancelFrame();
  }, [cancelFrame]);
  const onSummaryLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    laidOutTarget.current = width > 0 && height > 0 ? target.current : null;
    focusSummary();
  }, [focusSummary]);
  return { summaryRef, onSummaryLayout };
}
