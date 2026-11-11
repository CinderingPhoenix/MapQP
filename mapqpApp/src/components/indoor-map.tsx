import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from "react-native";

export type UnityFloor = 1 | 2 | 3 | 4 | 5;

const FLOOR_IMAGES: Record<UnityFloor, ImageSourcePropType> = {
  1: require("../../assets/images/UH1B.png"),
  2: require("../../assets/images/UH2B.png"),
  3: require("../../assets/images/UH3B.png"),
  4: require("../../assets/images/UH4B.png"),
  5: require("../../assets/images/UH5B.png"),
};

type IndoorMapProps = {
  displayedFloor: UnityFloor;
  selectedRoomNum?: string | number | null;
};

export default function IndoorMap({
  displayedFloor,
  selectedRoomNum
}: IndoorMapProps) {
  const source = FLOOR_IMAGES[displayedFloor];
  const dimensions = Image.resolveAssetSource(source);

  const width = dimensions?.width;
  const height = dimensions?.height;


  const aspectRatio =
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
        ? width / height
        : 1;

  return (
  <View style={{ flex: 1, backgroundColor: "#eee" }}>
    <Image
      source={source}
      resizeMode="contain"
      accessibilityLabel={`Unity Hall floor ${displayedFloor} plan`}
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  </View>
);
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    overflow: "hidden",
  },
});