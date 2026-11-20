import type {
  IndoorEdge,
  IndoorMapNode,
} from "../data/uh-indoor-graph";

import {
  UNITY_MAP_NODES,
  UNITY_MAP_EDGES,
} from "../data/uh-indoor-graph";

export function getEdgeSeconds(
  edge: IndoorEdge,
  walkingSpeedMps: number
): number {
  if (edge.travelSeconds !== undefined) {
    return edge.travelSeconds;
  }

  if (edge.kind !== "normal") {
    throw new Error(
      `Missing transition timing: ${edge.from} -> ${edge.to}`
    );
  }

  if (
    !Number.isFinite(walkingSpeedMps) ||
    walkingSpeedMps <= 0
  ) {
    throw new Error(
      "Walking speed must be a positive, finite number."
    );
  }

  return edge.distanceMeters / walkingSpeedMps;
}

export type CombinedRouteTime = {
  outdoorSeconds: number;
  entranceSeconds: number;
  indoorSeconds: number;
};

export function getTotalSeconds(
  time: CombinedRouteTime
): number {
  return (
    time.outdoorSeconds +
    time.entranceSeconds +
    time.indoorSeconds
  );
}