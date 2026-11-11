import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSettings } from "../context/settings-context";
import { COLOR_VISION_PALETTES } from "../theme/color-vision-palettes";

export type CameraAction = "zoom-in" | "zoom-out" | "pan-up" | "pan-down" | "pan-left" | "pan-right";
export type CameraState = { ready: boolean; zoom: number; minZoom: number; maxZoom: number };

export const MAP_CONTROLS_WIDTH = 164;
export const MAP_ZOOM_CONTROLS_WIDTH = 60;
export const MAP_CONTROLS_HEIGHT = 112;

type Control = { action: CameraAction; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string };
const ROWS: Control[][] = [
  [
    { action: "zoom-in", icon: "magnify-plus-outline", label: "Zoom in" },
    { action: "pan-up", icon: "arrow-up", label: "Pan map up" },
    { action: "zoom-out", icon: "magnify-minus-outline", label: "Zoom out" },
  ],
  [
    { action: "pan-left", icon: "arrow-left", label: "Pan map left" },
    { action: "pan-down", icon: "arrow-down", label: "Pan map down" },
    { action: "pan-right", icon: "arrow-right", label: "Pan map right" },
  ],
];

export default function MapControls({ accessibilityMode = false, camera, onCommand }: {
  accessibilityMode?: boolean; camera: CameraState; onCommand: (action: CameraAction) => void;
}) {
  const { colorVisionPreset } = useSettings();
  const palette = COLOR_VISION_PALETTES[colorVisionPreset];
  const rows = accessibilityMode ? ROWS : [[ROWS[0][0]], [ROWS[0][2]]];
  return <View style={[styles.panel, !accessibilityMode && styles.standardPanel]}>
    {rows.map((row, index) => <View key={index} style={styles.row}>
      {row.map(({ action, icon, label }) => {
        const disabled = !camera.ready ||
          (action === "zoom-in" && camera.zoom >= camera.maxZoom) ||
          (action === "zoom-out" && camera.zoom <= camera.minZoom);
        return <TouchableOpacity key={action} accessible
          style={[styles.button, {backgroundColor: disabled ? palette.background : palette.surface, borderColor: disabled ? palette.secondaryText : palette.border}]} disabled={disabled}
          accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
          accessibilityHint={action.startsWith("pan-")
            ? "Moves the view in this screen direction. Your location continues updating."
            : "Changes map zoom by one level. Your location continues updating."}
          onPress={() => { if (!disabled) onCommand(action); }}>
          <MaterialCommunityIcons name={icon} size={28} color={disabled ? palette.secondaryText : palette.primary}
            accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            allowFontScaling={false} />
        </TouchableOpacity>;
      })}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  panel: { width: MAP_CONTROLS_WIDTH, padding: 4, gap: 4, alignSelf: "flex-start",
    borderWidth: 2, borderRadius: 12 },
  standardPanel: { width: MAP_ZOOM_CONTROLS_WIDTH },
  row: { flexDirection: "row", gap: 4 },
  button: { width: 48, height: 48, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderRadius: 8 },
});
