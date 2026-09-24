import buildingData from "../data/wpi-buildings.json";
import routePointsData from "../data/route-points.json";

// --- Types ---

export type RoutePoint = {
  latitude: number;
  longitude: number;
  label: string;
};

export type WalkingRoute = {
  geometry: [number, number][];
  distance: number;
  duration: number;
  via?: string;
};

export type WalkwayDebugOverlay = {
  nodes: [number, number][];
  connections: [[number, number], [number, number]][];
};

type GraphNode = {
  id: string;
  latitude: number;
  longitude: number;
};

type GraphEdge = {
  nodeId: string;
  distance: number;
};

// --- Constants & Graph Initialization ---

const WALKING_SPEED_METERS_PER_SECOND = 1.4;
const routeCache = new Map<string, WalkingRoute>();

// 1. Cast the raw JSON data to array types
const rawNodes = routePointsData.nodes as [string, number, number][];
const rawConnections = routePointsData.connections as [string, string, number?][];

// 2. Rehydrate nodes into GraphNode objects
const walkwayNodes: GraphNode[] = rawNodes.map((node) => ({
  id: node[0],
  latitude: node[1],
  longitude: node[2],
}));

// Combine walkway intersection nodes and building entrance points into a unified graph
const campusNodes: GraphNode[] = [
  ...walkwayNodes,
  ...buildingData.flatMap((building) =>
    building.entrances.map((entrance, index) => ({
      id: `${building.name}-entrance-${index}`,
      latitude: entrance.latitude,
      longitude: entrance.longitude,
    }))
  ),
];

const campusNodesById = new Map(campusNodes.map((node) => [node.id, node]));
const graphEdges = new Map<string, GraphEdge[]>();

for (const node of campusNodes) {
  graphEdges.set(node.id, []);
}

// 1. Build bidirectional edges for pre-defined walkway paths using the flat array
for (const conn of rawConnections) {
  const fromId = conn[0];
  const toId = conn[1];
  
  const fromNode = campusNodesById.get(fromId);
  const toNode = campusNodesById.get(toId);

  if (!fromNode) {
    console.warn(`Unknown node in walkwayConnections: ${fromId}`);
    continue;
  }
  if (!toNode) {
    console.warn(`Unknown node in walkwayConnections: ${toId}`);
    continue;
  }
  
  connectWalkwayNodes(fromNode, toNode);
}

// 2. Connect building entrances to the nearest existing walkway segments
for (const node of campusNodes.filter((candidate) => !walkwayNodes.includes(candidate))) {
  const existingEdges = graphEdges.get(node.id) ?? [];
  if (existingEdges.length === 0) {
    const nearest = nearestEdges(node);
    graphEdges.set(node.id, nearest);
    for (const edge of nearest) {
      graphEdges.set(edge.nodeId, [
        ...(graphEdges.get(edge.nodeId) ?? []),
        { nodeId: node.id, distance: edge.distance },
      ]);
    }
  }
}

// --- Public API ---

/**
 * Returns overlay geometry for debug visualization of walkway nodes and paths.
 */
export function getWalkwayDebugOverlay(): WalkwayDebugOverlay {
  return {
    nodes: campusNodes.map((node) => [node.latitude, node.longitude]),
    connections: rawConnections
      .map((conn) => {
        const fromNode = campusNodesById.get(conn[0]);
        const toNode = campusNodesById.get(conn[1]);
        
        if (!fromNode || !toNode) return null;
        
        return [
          [fromNode.latitude, fromNode.longitude] as [number, number],
          [toNode.latitude, toNode.longitude] as [number, number],
        ] as [[number, number], [number, number]];
      })
      .filter((conn): conn is [[number, number], [number, number]] => conn !== null),
  };
}

/**
 * Computes or retrieves a cached walking route between two geographical points.
 */
export async function routeBetween(
  origin: RoutePoint,
  destination: RoutePoint,
): Promise<WalkingRoute> {
  const cacheKey = [
    origin.longitude,
    origin.latitude,
    destination.longitude,
    destination.latitude,
  ].join(",");

  const cachedRoute = routeCache.get(cacheKey);
  if (cachedRoute) {
    return cachedRoute;
  }

  const route = findLocalWalkingRoute(origin, destination);
  routeCache.set(cacheKey, route);
  return route;
}

// --- Pathfinding & Geometry ---

/**
 * Executes Dijkstra's algorithm to calculate the shortest path along the campus walkway graph.
 */
function findLocalWalkingRoute(
  origin: RoutePoint,
  destination: RoutePoint,
): WalkingRoute {
  const startId = "__origin";
  const destinationId = "__destination";

  const nodes = [
    { id: startId, latitude: origin.latitude, longitude: origin.longitude },
    ...campusNodes,
    { id: destinationId, latitude: destination.latitude, longitude: destination.longitude },
  ];

  // Dynamically attach origin and destination points to nearby edges
  const edges = new Map(graphEdges);
  edges.set(startId, nearestEdges(origin));
  edges.set(destinationId, []);

  for (const edge of nearestEdges(destination)) {
    edges.set(edge.nodeId, [
      ...(edges.get(edge.nodeId) ?? []),
      { nodeId: destinationId, distance: edge.distance },
    ]);
  }

  const distances = new Map<string, number>([[startId, 0]]);
  const previous = new Map<string, string>();
  const open = new Set([startId]);

  // Dijkstra search loop
  while (open.size > 0) {
    const current = [...open].reduce((closest, nodeId) =>
      (distances.get(nodeId) ?? Number.POSITIVE_INFINITY) <
        (distances.get(closest) ?? Number.POSITIVE_INFINITY)
        ? nodeId
        : closest,
    );

    open.delete(current);
    if (current === destinationId) break;

    for (const edge of edges.get(current) ?? []) {
      const nextDistance = (distances.get(current) ?? 0) + edge.distance;
      if (nextDistance < (distances.get(edge.nodeId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.nodeId, nextDistance);
        previous.set(edge.nodeId, current);
        open.add(edge.nodeId);
      }
    }
  }

  if (!distances.has(destinationId)) {
    throw new Error("No local walking route was found between those locations.");
  }

  // Reconstruct the node path from destination back to origin
  const path = [destinationId];
  while (path[0] !== startId) {
    const parent = previous.get(path[0]);
    if (!parent) {
      throw new Error("The local walking route is incomplete.");
    }
    path.unshift(parent);
  }

  const rawGeometry = path.map((nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)!;
    return [node.latitude, node.longitude] as [number, number];
  });

  const geometry = smoothPolyline(rawGeometry);
  const distance = distances.get(destinationId)!;

  return {
    geometry,
    distance,
    duration: distance / WALKING_SPEED_METERS_PER_SECOND,
  };
}

/**
 * Applies Chaikin's corner-cutting algorithm to smooth jagged polyline path lines.
 */
function smoothPolyline(
  points: [number, number][],
  iterations = 2,
  tension = 0.25
): [number, number][] {
  if (points.length <= 2 || iterations <= 0) return points;

  let current = points;

  for (let i = 0; i < iterations; i++) {
    const smoothed: [number, number][] = [current[0]];

    for (let j = 0; j < current.length - 1; j++) {
      const p0 = current[j];
      const p1 = current[j + 1];

      const q: [number, number] = [
        (1 - tension) * p0[0] + tension * p1[0],
        (1 - tension) * p0[1] + tension * p1[1],
      ];
      const r: [number, number] = [
        tension * p0[0] + (1 - tension) * p1[0],
        tension * p0[1] + (1 - tension) * p1[1],
      ];

      smoothed.push(q, r);
    }

    smoothed.push(current[current.length - 1]);
    current = smoothed;
  }

  return current;
}

// --- Math & Distance Calculations ---

/**
 * Finds the nearest graph segment to project an arbitrary coordinate point onto.
 */
function nearestEdges(
  point: Pick<RoutePoint, "latitude" | "longitude">,
): GraphEdge[] {
  let bestEdges: GraphEdge[] = [];
  let minDistanceToSegment = Number.POSITIVE_INFINITY;
  const seenEdges = new Set<string>();

  for (const [fromId, neighbors] of graphEdges.entries()) {
    const fromNode = campusNodesById.get(fromId);
    if (!fromNode) continue;

    for (const neighbor of neighbors) {
      const toId = neighbor.nodeId;
      const toNode = campusNodesById.get(toId);
      if (!toNode) continue;

      const edgeKey = [fromId, toId].sort().join("::");
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);

      const { distToSegment, distToFrom, distToTo } = projectPointToSegment(
        point.latitude,
        point.longitude,
        fromNode,
        toNode
      );

      if (distToSegment < minDistanceToSegment) {
        minDistanceToSegment = distToSegment;
        bestEdges = [
          { nodeId: fromNode.id, distance: distToSegment + distToFrom },
          { nodeId: toNode.id, distance: distToSegment + distToTo },
        ];
      }
    }
  }

  return bestEdges;
}

/**
 * Projects a point onto a line segment using planar projection scaled for local latitude.
 */
function projectPointToSegment(
  pLat: number,
  pLng: number,
  a: GraphNode,
  b: GraphNode
) {
  const latScale = Math.cos(((a.latitude + b.latitude) / 2) * (Math.PI / 180));

  const dxAB = (b.longitude - a.longitude) * 111_320 * latScale;
  const dyAB = (b.latitude - a.latitude) * 111_320;

  const dxAP = (pLng - a.longitude) * 111_320 * latScale;
  const dyAP = (pLat - a.latitude) * 111_320;

  const ab2 = dxAB * dxAB + dyAB * dyAB;
  let t = ab2 === 0 ? 0 : (dxAP * dxAB + dyAP * dyAB) / ab2;
  t = Math.max(0, Math.min(1, t));

  const projX = t * dxAB;
  const projY = t * dyAB;

  const distToSegment = Math.hypot(dxAP - projX, dyAP - projY);
  const distToFrom = Math.hypot(projX, projY);
  const distToTo = Math.hypot(dxAB - projX, dyAB - projY);

  return { distToSegment, distToFrom, distToTo };
}

function connectWalkwayNodes(first: GraphNode, second: GraphNode) {
  const distance = distanceBetween(
    first.latitude,
    first.longitude,
    second.latitude,
    second.longitude,
  );

  graphEdges.set(first.id, [
    ...(graphEdges.get(first.id) ?? []),
    { nodeId: second.id, distance },
  ]);
  graphEdges.set(second.id, [
    ...(graphEdges.get(second.id) ?? []),
    { nodeId: first.id, distance },
  ]);
}

/**
 * Calculates straight-line distance (in meters) between two coordinates using planar equirectangular projection.
 */
export function distanceBetween(
  latitudeOne: number,
  longitudeOne: number,
  latitudeTwo: number,
  longitudeTwo: number,
) {
  const latitudeScale = Math.cos(((latitudeOne + latitudeTwo) / 2) * Math.PI / 180);
  const latitudeDelta = (latitudeTwo - latitudeOne) * 111_320;
  const longitudeDelta = (longitudeTwo - longitudeOne) * 111_320 * latitudeScale;
  return Math.hypot(latitudeDelta, longitudeDelta);
}