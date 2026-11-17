import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

// Absolute numeric insets resolve from the planner's padding box. Cancel its
// border so the button aligns with the planner's outer right and top edges.
export default function RecenterOverlay({ visible, measuredHeight, plannerBorderWidth, onHeightChange, children }: {
  visible: boolean;
  measuredHeight: number;
  plannerBorderWidth: number;
  onHeightChange: (height: number) => void;
  children: ReactNode;
}) {
  return <View accessible={false} onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
    pointerEvents={visible ? "box-none" : "none"}
    accessibilityElementsHidden={!visible}
    importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    style={[styles.slot, { top: -measuredHeight - 16 - plannerBorderWidth,
      right: -plannerBorderWidth, opacity: visible ? 1 : 0 }]}>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  slot: { position: "absolute", maxWidth: "100%", overflow: "visible", zIndex: 20 },
});
