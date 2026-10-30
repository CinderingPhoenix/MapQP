import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { useNavigationStartFocus } from "../hooks/use-navigation-start-focus";

// Stage 1: keep the proven focus/layout implementation available for rollback
// while Expo Speech + VoiceOver coexistence is verified on a physical iPhone.
const AUTOMATIC_SUMMARY_FOCUS_ENABLED = false;

type Props = {
  destinationKey: string | null;
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
  destinationKey, destinationName, screenReaderEnabled, instruction,
  expanded, onToggleDirections, children,
}: Props) {
  const { summaryRef, onSummaryLayout } = useNavigationStartFocus(
    destinationKey, destinationName, screenReaderEnabled,
    AUTOMATIC_SUMMARY_FOCUS_ENABLED,
  );
  return (
    <Pressable
      ref={summaryRef}
      onLayout={onSummaryLayout}
      accessible
      accessibilityRole="button"
      accessibilityLabel={instruction}
      accessibilityState={{ expanded }}
      accessibilityHint={expanded
        ? "Double tap to collapse upcoming directions"
        : "Double tap to show all upcoming directions"}
      onPress={onToggleDirections}
      style={({ pressed }) => ({ minHeight: 48, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
    >
      {children}
    </Pressable>
  );
}
