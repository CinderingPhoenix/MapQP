export type RoutingPreferences = {
  avoidStairs: boolean;
  avoidIndoorRoutes: boolean;
  avoidInaccessibleCrosswalks: boolean;
};

export function getRoutingPreferences(settings: Partial<RoutingPreferences> = {}): RoutingPreferences {
  return { avoidStairs: false, avoidIndoorRoutes: false, avoidInaccessibleCrosswalks: false, ...settings };
}

export function getRelaxedRoutingPreferences(preferences: RoutingPreferences) {
  const enabled = (Object.keys(preferences) as (keyof RoutingPreferences)[])
    .filter((key) => preferences[key]);
  return Array.from({ length: (1 << enabled.length) - 1 }, (_, index) => {
    const relaxed = enabled.filter((_, bit) => (index + 1) & (1 << bit));
    const options = { ...preferences };
    for (const key of relaxed) options[key] = false;
    return { options, relaxed };
  }).sort((a, b) => a.relaxed.length - b.relaxed.length);
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
type WalkwaySegment = { from: GraphNode; to: GraphNode; edge: GraphEdge };
let routingSegments: WalkwaySegment[] | null = null;

export function initRoutingGraph(
  routePointsData: { nodes: unknown[]; connections: Record<string, WalkwayConnectionItem[]> },
  buildingData: BuildingInput[]
) {
  // Bundled data uses tuples; older saved/downloaded data may use objects.
  const validatedNodes: GraphNode[] = routePointsData.nodes.map((node, index) => {
    const fields = Array.isArray(node)
      ? (node.length === 3 ? { id: node[0], latitude: node[1], longitude: node[2] } : null)
      : (node !== null && typeof node === "object" ? node as Partial<GraphNode> : null);
    const { id, latitude, longitude } = fields ?? {};
    if (typeof id !== "string" ||
        typeof latitude !== "number" || !Number.isFinite(latitude) ||
        typeof longitude !== "number" || !Number.isFinite(longitude)) {
      throw new Error(`Invalid walkway node at index ${index}: expected [id, latitude, longitude] or { id, latitude, longitude } with finite coordinates.`);
    }
    return { id, latitude, longitude };
  });

  // Clear existing state for fresh over-the-air updates
  routeCache.clear();
  routingSegments = null;
  graphEdges.clear();
  campusNodesById.clear();

  // Store normalized nodes as GraphNode objects.
  walkwayNodes = validatedNodes;
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

  const walkwayNodeSet = new Set(walkwayNodes);

  // 2. Connect building entrances to the nearest existing walkway segments
  for (const node of campusNodes.filter((candidate) => !walkwayNodeSet.has(candidate))) {
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
  for (const node of campusNodes.filter((candidate) => !walkwayNodeSet.has(candidate))) {
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
  routingSegments = collectWalkwaySegments();
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

// Binary min-heap: selecting the next node costs O(log V), not a full scan.
class RouteQueue {
  private entries: { nodeId: string; distance: number }[] = [];

  push(nodeId: string, distance: number) {
    const entry = { nodeId, distance };
    let index = this.entries.length;
    this.entries.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.entries[parent].distance <= distance) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop() {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (this.entries.length && last) {
      let index = 0;
      while (index * 2 + 1 < this.entries.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.entries.length && this.entries[child + 1].distance < this.entries[child].distance) child++;
        if (last.distance <= this.entries[child].distance) break;
        this.entries[index] = this.entries[child];
        index = child;
      }
      this.entries[index] = last;
    }
    return first;
  }
}

function findLocalWalkingRoute(
  origin: RoutePoint,
  destination: RoutePoint,
  preferences: RoutingPreferences,
): WalkingRoute {
  const startId = "__origin";
  const destinationId = "__destination";

  const nodeById = (nodeId: string): GraphNode => {
    if (nodeId === startId) return { id: startId, ...origin };
    if (nodeId === destinationId) return { id: destinationId, ...destination };
    return campusNodesById.get(nodeId)!;
  };

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
  const open = new RouteQueue();
  open.push(startId, 0);

  for (let entry = open.pop(); entry; entry = open.pop()) {
    const current = entry.nodeId;
    // A shorter path may have queued a newer entry for the same node.
    if (entry.distance !== distances.get(current)) continue;
    if (current === destinationId) break;

    for (const edge of edges.get(current) ?? []) {
      if (!isEdgeAllowed(edge, preferences)) continue;
      const nextDistance = (distances.get(current) ?? 0) + edge.distance;
      if (nextDistance < (distances.get(edge.nodeId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.nodeId, nextDistance);
        previous.set(edge.nodeId, current);
        open.push(edge.nodeId, nextDistance);
      }
    }
  }

  if (!distances.has(destinationId)) {
    throw new Error("No local walking route was found between those locations.");
  }

  const path = [destinationId];
  while (path[path.length - 1] !== startId) {
    const parent = previous.get(path[path.length - 1]);
    if (!parent) throw new Error("The local walking route is incomplete.");
    path.push(parent);
  }
  // Predecessors reconstruct from destination to origin; guidance follows travel order.
  path.reverse();

  // Preserve every graph vertex so the displayed line follows mapped walkways.
  const geometry = path.map((nodeId) => {
    const node = nodeById(nodeId);
    return [node.latitude, node.longitude] as [number, number];
  });

  const navigationPath = path.map((nodeId) => ({
    coordinate: nodeById(nodeId),
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

// --- Math & Distance Calculations ---

function isEdgeAllowed(edge: GraphEdge, preferences: RoutingPreferences): boolean {
  // Every enabled preference must pass; one preference cannot override another.
  // Crossing accessibility is controlled separately from stair avoidance.
  return (!preferences.avoidStairs || edge.roadCrossing || edge.accessible) &&
    (!preferences.avoidIndoorRoutes || !edge.indoor) &&
    (!preferences.avoidInaccessibleCrosswalks || !edge.roadCrossing || edge.accessible);
}

function collectWalkwaySegments(): WalkwaySegment[] {
  const segments: WalkwaySegment[] = [];
  const seen = new Set<string>();
  for (const [fromId, neighbors] of graphEdges) {
    const from = campusNodesById.get(fromId);
    if (!from) continue;
    for (const edge of neighbors) {
      const to = campusNodesById.get(edge.nodeId);
      if (!to) continue;
      const key = JSON.stringify([fromId, edge.nodeId].sort());
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({ from, to, edge });
    }
  }
  return segments;
}

function nearestEdges(
  point: Pick<RoutePoint, "latitude" | "longitude">,
  preferences: RoutingPreferences = { avoidStairs: false, avoidIndoorRoutes: false, avoidInaccessibleCrosswalks: false },
): GraphEdge[] {
  let bestEdges: GraphEdge[] = [];
  let minDistanceToSegment = Number.POSITIVE_INFINITY;
  // During initialization, entrance attachment still changes the graph.
  // Once initialized, reuse the unique segment list for every route request.
  for (const { from: fromNode, to: toNode, edge: neighbor } of routingSegments ?? collectWalkwaySegments()) {
    if (!isEdgeAllowed(neighbor, preferences)) continue;

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
