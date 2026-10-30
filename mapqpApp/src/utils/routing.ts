// Temporary preferences for testing; replace with settings values when wired up.
const avoidStairs = false;
const avoidIndoorRoutes = false;
const avoidInaccessibleCrosswalks = false;

export type RoutingPreferences = {
  avoidStairs: boolean;
  avoidIndoorRoutes: boolean;
  avoidInaccessibleCrosswalks: boolean;
};

export function getRoutingPreferences(): RoutingPreferences {
  return { avoidStairs, avoidIndoorRoutes, avoidInaccessibleCrosswalks };
}

// --- Types ---

export type RoutePoint = {
  latitude: number;
  longitude: number;
  label: string;
};

export type WalkingRoute = {
  geometry: [number, number][];
  navigationPath: NavigationPoint[];
  distance: number;
  duration: number;
  via?: string;
};

export type NavigationPoint = {
  coordinate: [number, number];
  connectionCount: number;
};

export type WalkwayDebugOverlay = {
  nodes: [number, number][];
  connections: [[number, number], [number, number]][];
};

export type GraphNode = {
  id: string;
  latitude: number;
  longitude: number;
};

export type GraphEdge = {
  nodeId: string;
  distance: number;
  accessible: boolean;
  indoor: boolean;
  roadCrossing: boolean;
};

// Named flags make connection data readable without knowing tuple positions.
// Legacy strings and tuples remain supported for downloaded map data.
export type WalkwayConnection = {
  to: string;
  accessible?: boolean;
  indoor?: boolean;
  roadCrossing?: boolean;
};
export type WalkwayConnectionItem = WalkwayConnection | string | [
  nodeId: string,
  accessible: boolean,
  indoor?: boolean,
  roadCrossing?: boolean,
];

export function normalizeWalkwayConnection(item: WalkwayConnectionItem) {
  if (typeof item === "string") {
    return { to: item, accessible: true, indoor: false, roadCrossing: false };
  }
  if (Array.isArray(item)) {
    return { to: item[0], accessible: item[1] !== false, indoor: item[2] ?? false,
      roadCrossing: item[3] ?? false };
  }
  return { to: item.to, accessible: item.accessible ?? true, indoor: item.indoor ?? false,
    roadCrossing: item.roadCrossing ?? false };
}

export type BuildingEntranceObject = {
  latitude: number;
  longitude: number;
  name?: string;
  floor?: number;
  accessibility?: boolean;
};

export type BuildingObject = {
  name: string;
  entrances: BuildingEntranceObject[];
};

export type BuildingTuple = [string, [number, number, string, number, boolean][]];

export type BuildingInput = BuildingObject | BuildingTuple;

// --- Constants & Graph Initialization ---

const WALKING_SPEED_METERS_PER_SECOND = 1.4;
const routeCache = new Map<string, WalkingRoute>();

// Mutable graph state
let walkwayNodes: GraphNode[] = [];
let walkwayConnections: Record<string, WalkwayConnectionItem[]> = {};
let campusNodes: GraphNode[] = [];
let campusNodesById = new Map<string, GraphNode>();
let graphEdges = new Map<string, GraphEdge[]>();

export function initRoutingGraph(
  routePointsData: { nodes: [string, number, number][]; connections: Record<string, WalkwayConnectionItem[]> },
  buildingData: BuildingInput[]
) {
  // Clear existing state for fresh over-the-air updates
  routeCache.clear();
  graphEdges.clear();
  campusNodesById.clear();

  // Map tuple nodes [id, latitude, longitude] to GraphNode objects
  walkwayNodes = routePointsData.nodes.map(([id, latitude, longitude]) => ({
    id,
    latitude,
    longitude,
  }));
  walkwayConnections = routePointsData.connections;

  // Map building entrances supporting both object and tuple formats
  campusNodes = [
    ...walkwayNodes,
    ...buildingData.flatMap((item) => {
      const buildingName = Array.isArray(item) ? item[0] : item.name;
      const entrances = Array.isArray(item) ? item[1] : item.entrances;

      return entrances.map((entrance, index: number) => {
        const latitude = Array.isArray(entrance) ? entrance[0] : entrance.latitude;
        const longitude = Array.isArray(entrance) ? entrance[1] : entrance.longitude;
        return {
          id: `${buildingName}-entrance-${index}`,
          latitude,
          longitude,
        };
      });
    }),
  ];

  campusNodesById = new Map(campusNodes.map((node) => [node.id, node]));
  
  const accessibleEntranceIds = new Set(
    buildingData.flatMap((item) => {
      const buildingName = Array.isArray(item) ? item[0] : item.name;
      const entrances = Array.isArray(item) ? item[1] : item.entrances;

      return entrances.flatMap((entrance, index: number) => {
        const accessibility = Array.isArray(entrance) ? entrance[4] : entrance.accessibility;
        return accessibility ? [`${buildingName}-entrance-${index}`] : [];
      });
    })
  );

  for (const node of campusNodes) {
    graphEdges.set(node.id, []);
  }

  // 1. Build bidirectional edges for pre-defined walkway paths
  for (const [fromId, toIds] of Object.entries(walkwayConnections)) {
    let fromNode = campusNodesById.get(fromId);
    if (!fromNode) {
      // Fallback: automatically register missing nodes to prevent crashes
      fromNode = { id: fromId, latitude: 0, longitude: 0 };
      campusNodesById.set(fromId, fromNode);
      campusNodes.push(fromNode);
      graphEdges.set(fromId, []);
    }

    for (const item of toIds) {
      const { to: toId, accessible: isAccessible, indoor: isIndoor, roadCrossing } = normalizeWalkwayConnection(item);

      let toNode = campusNodesById.get(toId);
      if (!toNode) {
        // Fallback: automatically register missing target nodes to prevent crashes
        toNode = { id: toId, latitude: 0, longitude: 0 };
        campusNodesById.set(toId, toNode);
        campusNodes.push(toNode);
        graphEdges.set(toId, []);
      }
      connectWalkwayNodes(
        fromNode,
        toNode,
        isAccessible,
        isIndoor,
        roadCrossing
      );
    }
  }

  // 2. Connect building entrances to the nearest existing walkway segments
  for (const node of campusNodes.filter((candidate) => !walkwayNodes.includes(candidate))) {
    const existingEdges = graphEdges.get(node.id) ?? [];
    if (existingEdges.length === 0) {
      const entranceIsAccessible = accessibleEntranceIds.has(node.id);
      const nearest = nearestEdges(node).map((edge) => ({
        ...edge,
        accessible: edge.accessible && entranceIsAccessible,
      }));
      graphEdges.set(node.id, nearest);
      for (const edge of nearest) {
        graphEdges.set(edge.nodeId, [
          ...(graphEdges.get(edge.nodeId) ?? []),
          {
            nodeId: node.id,
            distance: edge.distance,
            accessible: edge.accessible,
            indoor: edge.indoor,
            roadCrossing: edge.roadCrossing,

          },
        ]);
      }
    }
  }

  // Entrance accessibility applies to every graph edge connected to that entrance
  for (const node of campusNodes.filter((candidate) => !walkwayNodes.includes(candidate))) {
    const entranceIsAccessible = accessibleEntranceIds.has(node.id);
    for (const edge of graphEdges.get(node.id) ?? []) {
      edge.accessible = edge.accessible && entranceIsAccessible;
      const reverseEdge = (graphEdges.get(edge.nodeId) ?? []).find(
        (candidate) => candidate.nodeId === node.id
      );
      if (reverseEdge) {
        reverseEdge.accessible = edge.accessible;
      }
    }
  }
}

// --- Public API ---

export function getWalkwayDebugOverlay(): WalkwayDebugOverlay {
  return {
    nodes: campusNodes.map((node) => [node.latitude, node.longitude]),
    connections: Object.entries(walkwayConnections).flatMap(([fromId, toIds]) => {
      const fromNode = campusNodesById.get(fromId);
      if (!fromNode) return [];
      return toIds
        .map((item) => {
          const toId = normalizeWalkwayConnection(item).to;
          const toNode = campusNodesById.get(toId);
          if (!toNode) return null;
          return [
            [fromNode.latitude, fromNode.longitude] as [number, number],
            [toNode.latitude, toNode.longitude] as [number, number],
          ] as [[number, number], [number, number]];
        })
        .filter((conn): conn is [[number, number], [number, number]] => conn !== null);
    }),
  };
}

export async function routeBetween(
  origin: RoutePoint,
  destination: RoutePoint,
  options: Partial<RoutingPreferences> = {},
): Promise<WalkingRoute> {
  if (campusNodes.length === 0) throw new Error("Routing graph is not initialized.");
  
  const preferences = { ...getRoutingPreferences(), ...options };
  const cacheKey = [
    origin.longitude,
    origin.latitude,
    destination.longitude,
    destination.latitude,
    preferences.avoidStairs,
    preferences.avoidIndoorRoutes,
    preferences.avoidInaccessibleCrosswalks,
  ].join(",");

  const cachedRoute = routeCache.get(cacheKey);
  if (cachedRoute) return cachedRoute;

  const route = findLocalWalkingRoute(origin, destination, preferences);
  routeCache.set(cacheKey, route);
  return route;
}

// --- Pathfinding & Geometry ---

function findLocalWalkingRoute(
  origin: RoutePoint,
  destination: RoutePoint,
  preferences: RoutingPreferences,
): WalkingRoute {
  const startId = "__origin";
  const destinationId = "__destination";

  const nodes = [
    { id: startId, latitude: origin.latitude, longitude: origin.longitude },
    ...campusNodes,
    { id: destinationId, latitude: destination.latitude, longitude: destination.longitude },
  ];

  const edges = new Map(graphEdges);
  edges.set(startId, nearestEdges(origin, preferences));
  edges.set(destinationId, []);

  for (const edge of nearestEdges(destination, preferences)) {
    edges.set(edge.nodeId, [
      ...(edges.get(edge.nodeId) ?? []),
      { ...edge, nodeId: destinationId },
    ]);
  }

  const distances = new Map<string, number>([[startId, 0]]);
  const previous = new Map<string, string>();
  const open = new Set([startId]);

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
      if (!isEdgeAllowed(edge, preferences)) continue;
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

  const path = [destinationId];
  while (path[0] !== startId) {
    const parent = previous.get(path[0]);
    if (!parent) throw new Error("The local walking route is incomplete.");
    path.unshift(parent);
  }

  const rawGeometry = path.map((nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)!;
    return [node.latitude, node.longitude] as [number, number];
  });

  const geometry = smoothPolyline(rawGeometry);
  const navigationPath = path.map((nodeId) => ({
    coordinate: nodes.find((candidate) => candidate.id === nodeId)!,
    connectionCount: (edges.get(nodeId) ?? []).filter(
      (edge) => isEdgeAllowed(edge, preferences)
    ).length,
  })).map(({ coordinate, connectionCount }) => ({
    coordinate: [coordinate.latitude, coordinate.longitude] as [number, number],
    connectionCount,
  }));
  const distance = distances.get(destinationId)!;

  return {
    geometry,
    navigationPath,
    distance,
    duration: distance / WALKING_SPEED_METERS_PER_SECOND,
  };
}

function smoothPolyline(points: [number, number][], iterations = 2, tension = 0.25): [number, number][] {
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

function isEdgeAllowed(edge: GraphEdge, preferences: RoutingPreferences): boolean {
  // Every enabled preference must pass; one preference cannot override another.
  return (!preferences.avoidStairs || edge.accessible) &&
    (!preferences.avoidIndoorRoutes || !edge.indoor) &&
    (!preferences.avoidInaccessibleCrosswalks || !edge.roadCrossing || edge.accessible);
}

function nearestEdges(
  point: Pick<RoutePoint, "latitude" | "longitude">,
  preferences: RoutingPreferences = { avoidStairs: false, avoidIndoorRoutes: false, avoidInaccessibleCrosswalks: false },
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
      if (!isEdgeAllowed(neighbor, preferences)) continue;

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
          {
            nodeId: fromNode.id,
            distance: distToSegment + distToFrom,
            accessible: neighbor.accessible,
            indoor: neighbor.indoor,
            roadCrossing: neighbor.roadCrossing,

          },
          {
            nodeId: toNode.id,
            distance: distToSegment + distToTo,
            accessible: neighbor.accessible,
            indoor: neighbor.indoor,
            roadCrossing: neighbor.roadCrossing,

          },
        ];
      }
    }
  }
  return bestEdges;
}

function projectPointToSegment(pLat: number, pLng: number, a: GraphNode, b: GraphNode) {
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

function connectWalkwayNodes(first: GraphNode, second: GraphNode, accessible: boolean, indoor: boolean, roadCrossing: boolean) {
  const distance = distanceBetween(first.latitude, first.longitude, second.latitude, second.longitude);
  addOrMergeEdge(first.id, { nodeId: second.id, distance, accessible, indoor, roadCrossing });
  addOrMergeEdge(second.id, { nodeId: first.id, distance, accessible, indoor, roadCrossing });
}

function addOrMergeEdge(nodeId: string, edge: GraphEdge) {
  const edges = graphEdges.get(nodeId) ?? [];
  const existingEdge = edges.find((candidate) => candidate.nodeId === edge.nodeId);
  if (existingEdge) {
    existingEdge.accessible = existingEdge.accessible && edge.accessible;
    existingEdge.indoor = existingEdge.indoor || edge.indoor;
    // A label on either direction applies to the bidirectional crossing.
    existingEdge.roadCrossing = existingEdge.roadCrossing || edge.roadCrossing;
    return;
  }
  graphEdges.set(nodeId, [...edges, edge]);
}

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