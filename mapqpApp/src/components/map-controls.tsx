import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";

export type CameraAction = "zoom-in" | "zoom-out" | "pan-up" | "pan-down" | "pan-left" | "pan-right";
export type CameraState = { ready: boolean; zoom: number; minZoom: number; maxZoom: number };

export default function MapControls({ accessibilityMode, camera, onCommand, availableHeight = 164 }: {
  accessibilityMode: boolean; camera: CameraState; onCommand: (action: CameraAction) => void; availableHeight?: number;
}) {
  const [requestedExpanded, setExpanded] = useState(accessibilityMode);
  const canExpand = availableHeight >= 164;
  const expanded = requestedExpanded && canExpand;
  const { boldTextEnabled } = useAccessibilityPreferences();
  const textStyle = [styles.symbol, boldTextEnabled && styles.bold];
  const button = (action: CameraAction, symbol: string, label: string, disabled = false) => (
    <TouchableOpacity key={action} style={[styles.button, disabled && styles.disabled]}
      disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityHint={action.startsWith("pan-")
        ? "Moves the view in this screen direction. Your location continues updating."
        : "Changes map zoom by one level. Your location continues updating."}
      onPress={() => onCommand(action)}>
      <Text accessible={false} allowFontScaling={false} style={textStyle}>{symbol}</Text>
    </TouchableOpacity>
  );
  return <View style={styles.panel}>
    <View style={[styles.zoomRow, !accessibilityMode && styles.verticalZoom]}>
      {button("zoom-in", "+", "Zoom In", !camera.ready || camera.zoom >= camera.maxZoom)}
      {button("zoom-out", "−", "Zoom Out", !camera.ready || camera.zoom <= camera.minZoom)}
      {accessibilityMode && <TouchableOpacity style={styles.button} accessibilityRole="button"
        accessibilityLabel="Directional pan controls" accessibilityState={{ expanded, disabled: !canExpand }} disabled={!canExpand}
        accessibilityHint={!canExpand ? "More map space is needed. Collapse route directions or rotate your device."
          : expanded ? "Hides directional map buttons" : "Shows directional map buttons"}
        onPress={() => setExpanded((previous) => !previous)}>
        <Text accessible={false} allowFontScaling={false} style={textStyle}>{expanded ? "⌃" : "↔"}</Text>
      </TouchableOpacity>}
    </View>
    {accessibilityMode && expanded && <ScrollView style={styles.panScroll} contentContainerStyle={styles.directions}
      keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      <View style={styles.upRow}>
        {button("pan-up", "↑", "Pan Up", !camera.ready)}
      </View>
      <View style={styles.directionRow}>
        {button("pan-left", "←", "Pan Left", !camera.ready)}
        {button("pan-down", "↓", "Pan Down", !camera.ready)}
        {button("pan-right", "→", "Pan Right", !camera.ready)}
      </View>
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { flexShrink: 1, alignSelf: "flex-start", maxWidth: "100%", padding: 4, gap: 4,
    backgroundColor: "#FFF7F7", borderWidth: 2, borderColor: "#761723", borderRadius: 12 },
  zoomRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, flexShrink: 0 },
  verticalZoom: { flexDirection: "column", flexWrap: "nowrap" },
  panScroll: { flexGrow: 0, flexShrink: 1, maxHeight: 100 },
  directions: { gap: 4 },
  upRow: { alignItems: "center" },
  directionRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4 },
  button: { width: 48, height: 48, alignItems: "center", justifyContent: "center",
    backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#761723", borderRadius: 8 },
  symbol: { color: "#761723", fontSize: 26, fontWeight: "600", textAlign: "center" },
  bold: { fontWeight: "800" },
  disabled: { borderColor: "#595959", backgroundColor: "#E5E5E5" },
});
