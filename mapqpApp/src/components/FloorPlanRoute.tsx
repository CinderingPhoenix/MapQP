import React, { useState } from "react";
import {
  Image,
  ImageSourcePropType,
  Pressable,
  Text,
  View,
} from "react-native";

type Point = {
  x: number;
  y: number;
};

type Props = {
  source: ImageSourcePropType;
};

export default function FloorPlanRoute({ source }: Props) {
  const [points, setPoints] = useState<Point[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const asset = Image.resolveAssetSource(source);

if (!asset || !asset.width || !asset.height) {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text>
        Cannot load the floor-plan image dimensions.
        Check the image source for this floor.
      </Text>
    </View>
  );
}

const imageRatio = asset.width / asset.height;

  const imageWidth = Math.min(
    size.width,
    size.height * imageRatio
  );

  const imageHeight = imageWidth / imageRatio;
  const left = (size.width - imageWidth) / 2;
  const top = (size.height - imageHeight) / 2;

  return (
    <View
      style={{ flex: 1, backgroundColor: "#eee" }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width, height });
      }}
    >
      {imageWidth > 0 && imageHeight > 0 && (
        <Pressable
          accessibilityLabel="Tap the entrance, hallway turns, and room door to mark a route"
          onPress={(event) => {
            const { locationX, locationY } = event.nativeEvent;

            setPoints((previous) => [
              ...previous,
              {
                x: locationX / imageWidth,
                y: locationY / imageHeight,
              },
            ]);
          }}
          style={{
            position: "absolute",
            left,
            top,
            width: imageWidth,
            height: imageHeight,
          }}
        >
          <Image
            source={source}
            resizeMode="contain"
            style={{ width: "100%", height: "100%" }}
          />

          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
            }}
          >
            {/* Draw a line between each pair of tapped points. */}
            {points.slice(1).map((point, index) => {
              const previous = points[index];

              const x1 = previous.x * imageWidth;
              const y1 = previous.y * imageHeight;
              const x2 = point.x * imageWidth;
              const y2 = point.y * imageHeight;

              const length = Math.hypot(x2 - x1, y2 - y1);
              const angle = Math.atan2(y2 - y1, x2 - x1);

              return (
                <View
                  key={`line-${index}`}
                  style={{
                    position: "absolute",
                    left: (x1 + x2) / 2 - length / 2,
                    top: (y1 + y2) / 2 - 3,
                    width: length,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "#0066ff",
                    transform: [{ rotate: `${angle}rad` }],
                  }}
                />
              );
            })}

            {/* Mark the entrance, turns, and destination. */}
            {points.map((point, index) => (
              <View
                key={`point-${index}`}
                style={{
                  position: "absolute",
                  left: point.x * imageWidth - 8,
                  top: point.y * imageHeight - 8,
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: "#fff",
                  backgroundColor:
                    index === 0
                      ? "#16803c"
                      : index === points.length - 1
                        ? "#d62828"
                        : "#0066ff",
                }}
              />
            ))}
          </View>
        </Pressable>
      )}

      <View
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          padding: 12,
          borderRadius: 8,
          backgroundColor: "#fff",
        }}
      >
        <Text style={{ color: "#111" }}>
          Tap entrance → hallway turns → room door.
        </Text>

        <View style={{ flexDirection: "row", marginTop: 8 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setPoints((previous) => previous.slice(0, -1));
            }}
            style={{ padding: 10, marginRight: 12 }}
          >
            <Text style={{ color: "#0066cc" }}>Undo</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setPoints([])}
            style={{ padding: 10 }}
          >
            <Text style={{ color: "#b00020" }}>Clear route</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};