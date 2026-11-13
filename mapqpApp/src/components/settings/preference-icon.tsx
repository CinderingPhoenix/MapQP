import { useColorVisionPalette, useColorVisionStyles } from "../../hooks/use-color-vision-palette";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, View } from "react-native";

export type PreferenceIconName = keyof typeof MaterialCommunityIcons.glyphMap | "reduce-motion";

const ROUTE_ICON_COLORS: Partial<Record<PreferenceIconName, string>> = {
  stairs: "#C45100",
  "office-building": "#7950B2",
  walk: "#26785C",
};

// Shared decorative artwork; keep the Accessible Settings dimensions and geometry.
export function PreferenceIcon({ name }: { name: PreferenceIconName }) {
  const vision = useColorVisionPalette();
  const s = useColorVisionStyles(baseStyles);
  const iconSize = 32;
  const stroke = iconSize * 0.055, circleRadius = iconSize * 0.25, dotSize = iconSize * 0.06;
  const diameter = circleRadius * 2 + stroke;
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    pointerEvents="none" style={s.icon}>
    {name === "reduce-motion" ? <View style={[s.motionTile, { width: iconSize, height: iconSize, borderRadius: iconSize * 0.22 }]}>
      {Array.from({ length: 16 }, (_, index) => {
        const angle = index * Math.PI * 2 / 16;
        return <View key={index} style={{ position: "absolute", backgroundColor: "#FFFFFF",
          width: dotSize, height: dotSize, borderRadius: dotSize / 2,
          left: iconSize * 0.35 + circleRadius * Math.cos(angle) - dotSize / 2,
          top: iconSize * 0.5 + circleRadius * Math.sin(angle) - dotSize / 2 }} />;
      })}
      <View style={{ position: "absolute", borderColor: "#FFFFFF", width: diameter, height: diameter,
        left: iconSize * 0.65 - diameter / 2, top: (iconSize - diameter) / 2,
        borderRadius: diameter / 2, borderWidth: stroke }} />
    </View> : <View style={[s.iconTile, { backgroundColor:
      vision.color(ROUTE_ICON_COLORS[name] ?? (name === "contrast-circle" || name === "layers-outline" ? "#636366" : "#007AFF"), "backgroundColor") }]}>
      <MaterialCommunityIcons name={name} size={25} color={vision.color("#FFFFFF", "iconColor")} accessible={false} allowFontScaling={false} />
    </View>}
  </View>;
}

const baseStyles = StyleSheet.create({
  icon: { width: 32, height: 32, flexShrink: 0 }, motionTile: { backgroundColor: "#30D158" },
  iconTile: { width: 32, height: 32, borderRadius: 7, alignItems: "center", justifyContent: "center" },
});
