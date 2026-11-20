import { useState } from "react";
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from "react-native";

import {
  UNITY_MAP_NODES,
  type IndoorMapNode,
  type IndoorEdge,
} from "../data/uh-indoor-graph";

import Svg, { Line } from "react-native-svg";

export type UnityFloor = 1 | 2 | 3 | 4 | 5;

const FLOOR_IMAGES: Record<UnityFloor, ImageSourcePropType> = {
  1: require("../../assets/images/UH1B.png"),
  2: require("../../assets/images/UH2B.png"),
  3: require("../../assets/images/UH3B.png"),
  4: require("../../assets/images/UH4B.png"),
  5: require("../../assets/images/UH5B.png"),
};

const NODE_COLORS: Record<IndoorMapNode["kind"], string> = {
  entrance: "#008044",
  hallway: "#0066cc",
  room: "#8b3db8",
  stairs: "#b85c00",
  elevator: "#007f87",
};

type IndoorMapProps = {
  displayedFloor: UnityFloor;
  selectedRoomNum?: string | number | null;
  currentNodeId?: string | null;
  routeEdges?: IndoorEdge[];
};

export default function IndoorMap({
  displayedFloor,
  selectedRoomNum = null,
  currentNodeId = null,
  routeEdges = [],
}: IndoorMapProps) {
  const [container, setContainer] = useState({
    width: 0,
    height: 0,
  });

  const floorNodes = UNITY_MAP_NODES.filter(
    (node) => node.floor === displayedFloor
  );

  const source = FLOOR_IMAGES[displayedFloor];
  const dimensions = Image.resolveAssetSource(source);

  const sourceWidth = dimensions?.width ?? 0;
  const sourceHeight = dimensions?.height ?? 0;

  const hasValidDimensions =
    Number.isFinite(sourceWidth) &&
    Number.isFinite(sourceHeight) &&
    sourceWidth > 0 &&
    sourceHeight > 0;

  // Preserve your original orientation rules.
  const shouldRotate = sourceWidth > sourceHeight;
  const rotation = shouldRotate ? "270deg" : "180deg";

  const availableWidth = shouldRotate
    ? container.height
    : container.width;

  const availableHeight = shouldRotate
    ? container.width
    : container.height;

  const scale = hasValidDimensions
    ? Math.min(
        availableWidth / sourceWidth,
        availableHeight / sourceHeight
      )
    : 0;

  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;

  const canRender =
    container.width > 0 &&
    container.height > 0 &&
    hasValidDimensions;

  const nodesById = new Map(
    UNITY_MAP_NODES.map((node) => [node.id, node]),
  );

  const routeSegments: Array<{
    key: string;
    from: IndoorMapNode;
    to: IndoorMapNode;
  }> = [];

  routeEdges.forEach((edge, index) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);

    if (!from || !to) return;

    // Draw only segments entirely on the displayed floor.
    if (
      from.floor !== displayedFloor ||
      to.floor !== displayedFloor
    ) {
      return;
    }

    routeSegments.push({
      key: `${index}-${edge.from}-${edge.to}`,
      from,
      to,
    });
  });

  const visibleNodeIds = new Set<string>();

  for (const edge of routeEdges) {
    visibleNodeIds.add(edge.from);
    visibleNodeIds.add(edge.to);
  }

  // Keep the current position visible even before a route is calculated.
  if (currentNodeId) {
    visibleNodeIds.add(currentNodeId);
  }

  const visibleFloorNodes = floorNodes.filter((node) =>
    visibleNodeIds.has(node.id),
  );

  return (
    <View
      style={styles.container}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;

        setContainer((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height }
        );
      }}
    >
      {canRender && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: renderedWidth,
            height: renderedHeight,
            left: (container.width - renderedWidth) / 2,
            top: (container.height - renderedHeight) / 2,
            transform: [{ rotate: rotation }],
          }}
        >
          <Image
            source={source}
            resizeMode="contain"
            accessibilityLabel={`Unity Hall floor ${displayedFloor} plan`}
            style={styles.floorImage}
          />

          <Svg
            pointerEvents="none"
            width={renderedWidth}
            height={renderedHeight}
            style={StyleSheet.absoluteFill}
          >
            {routeSegments.map(({ key, from, to }) => (
              <Line
                key={key}
                x1={from.x * renderedWidth}
                y1={from.y * renderedHeight}
                x2={to.x * renderedWidth}
                y2={to.y * renderedHeight}
                stroke="#0055ff"
                strokeWidth={5}
                strokeLinecap="round"
              />
            ))}
          </Svg>

          {visibleFloorNodes.map((node) => {
            const isSelectedRoom =
              selectedRoomNum !== null &&
              node.roomNum !== undefined &&
              node.roomNum === String(selectedRoomNum);

            const isCurrentNode = node.id === currentNodeId;

            const size = isCurrentNode
              ? 18
              : isSelectedRoom
                ? 16
                : 10;

            const color = isCurrentNode
              ? "#0055ff"
              : isSelectedRoom
                ? "#d00000"
                : NODE_COLORS[node.kind];

                const nodesById = new Map(
                  UNITY_MAP_NODES.map((node) => [node.id, node]),
                );

                const routeSegments: Array<{
                  key: string;
                  from: IndoorMapNode;
                  to: IndoorMapNode;
                }> = [];

                routeEdges.forEach((edge, index) => {
                  const from = nodesById.get(edge.from);
                  const to = nodesById.get(edge.to);

                  if (!from || !to) return;

                  // Never draw a line between different floor plans.
                  if (
                    from.floor !== displayedFloor ||
                    to.floor !== displayedFloor
                  ) {
                    return;
                  }

                  routeSegments.push({
                    key: `${index}-${edge.from}-${edge.to}`,
                    from,
                    to,
                  });
                });

            return (
              <View
                key={node.id}
                style={{
                  position: "absolute",
                  left: node.x * renderedWidth - size / 2,
                  top: node.y * renderedHeight - size / 2,
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: color,
                  borderWidth: 2,
                  borderColor: "#ffffff",
                  zIndex: isCurrentNode
                    ? 3
                    : isSelectedRoom
                      ? 2
                      : 1,
                }}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cccccc",
    borderRadius: 12,
    overflow: "hidden",
  },
  floorImage: {
    width: "100%",
    height: "100%",
  },
});