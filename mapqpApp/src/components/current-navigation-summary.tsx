
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import {
  useNavigationStartFocus,
  type NavigationStartupSession,
} from "../hooks/use-navigation-start-focus";

type Props = {
  startupSession: NavigationStartupSession | null;
  startupReady: boolean;
  onStartupHandoff: () => boolean;
  startupAnnouncement?: boolean;
  destinationName: string;
  screenReaderEnabled: boolean;
  instruction: string;
  expanded: boolean;
  onToggleDirections: () => void;
  children: ReactNode;
};

// Keep the current direction/distance mounted above the upcoming list in both
// modes. Group only this control; Cancel and list entries remain separate.
export default function CurrentNavigationSummary({
  startupSession,
  startupReady,
  onStartupHandoff,
  startupAnnouncement = false,
  destinationName,
  screenReaderEnabled,
  instruction,
  expanded,
  onToggleDirections,
  children,
}: Props) {
  const startupMessage =
    `Navigating to ${destinationName}. ${instruction}.`;

  const { summaryRef, onSummaryLayout } = useNavigationStartFocus(
    startupSession,
    startupReady && screenReaderEnabled,
    onStartupHandoff,
    startupAnnouncement ? startupMessage : undefined,
  );

  return (
    <Pressable
      ref={summaryRef}
      onLayout={onSummaryLayout}
      accessible
      accessibilityRole="button"
      accessibilityLabel={startupMessage}
      accessibilityState={{ expanded }}
      accessibilityHint={
        expanded
          ? "Double tap to collapse upcoming directions"
          : "Double tap to show all upcoming directions"
      }
      onPress={onToggleDirections}
      style={({ pressed }) => ({
        minHeight: 48,
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
