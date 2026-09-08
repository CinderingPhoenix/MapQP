import buildingData from "../data/wpi-buildings.json";

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

const routeCache = new Map<string, WalkingRoute>();
const WALKING_SPEED_METERS_PER_SECOND = 1.4;

type GraphNode = {
  id: string;
  latitude: number;
  longitude: number;
};

type GraphEdge = {
  nodeId: string;
  distance: number;
};

const walkwayNodes: GraphNode[] = [
  { id: "walkway-quad-west", latitude: 42.2733, longitude: -71.8103 },
  { id: "walkway-quad-east", latitude: 42.27335, longitude: -71.8089 },
  { id: "walkway-alden-west", latitude: 42.2731, longitude: -71.8083 },
  { id: "walkway-alden-east", latitude: 42.2735, longitude: -71.8078 },
  { id: "walkway-boynton-west", latitude: 42.2738, longitude: -71.8072 },
  { id: "walkway-boynton-east", latitude: 42.2738, longitude: -71.8058 },
  { id: "walkway-campus-center", latitude: 42.27435, longitude: -71.8083 },
  { id: "walkway-higgins-south", latitude: 42.27405, longitude: -71.8085 },
  { id: "walkway-higgins-east", latitude: 42.2741, longitude: -71.8078 },
  { id: "walkway-salisbury-west", latitude: 42.2747, longitude: -71.8081 },
  { id: "walkway-salisbury-center", latitude: 42.2748, longitude: -71.8074 },
  { id: "walkway-salisbury-east", latitude: 42.2749, longitude: -71.8064 },
  { id: "walkway-kaven-south", latitude: 42.2747, longitude: -71.8058 },
  { id: "walkway-kaven-north", latitude: 42.2752, longitude: -71.8059 },
  { id: "walkway-atwater-south", latitude: 42.27505, longitude: -71.8067 },
  { id: "walkway-olin-north", latitude: 42.2755, longitude: -71.8078 },
  { id: "walkway-salisbury-north", latitude: 42.2758, longitude: -71.8077 },
  { id: "walkway-salisbury-far-east", latitude: 42.2758, longitude: -71.8053 },
];

const campusNodes: GraphNode[] = [
  ...walkwayNodes,
  ...buildingData.flatMap((building) => [
  ...building.entrances.map((entrance, index) => ({
    id: `${building.name}-entrance-${index}`,
    latitude: entrance.latitude,
    longitude: entrance.longitude,
  })),
  ...(building.indoorShortcuts ?? []).flatMap((shortcut, index) => [
    {
      id: `${building.name}-shortcut-${index}-entrance`,
      latitude: shortcut.entrance[0],
      longitude: shortcut.entrance[1],
    },
    {
      id: `${building.name}-shortcut-${index}-exit`,
      latitude: shortcut.exit[0],
      longitude: shortcut.exit[1],
    },
  ]),
  ]),
];

const graphEdges = new Map<string, GraphEdge[]>();
for (const node of walkwayNodes) {
  graphEdges.set(node.id, []);
}
for (let index = 0; index < walkwayNodes.length - 1; index += 1) {
  connectWalkwayNodes(walkwayNodes[index], walkwayNodes[index + 1]);
}
for (const node of campusNodes.filter((candidate) => !walkwayNodes.includes(candidate))) {
  const nearest = nearestEdges(node, walkwayNodes).slice(0, 2);
  graphEdges.set(node.id, nearest);
  for (const edge of nearest) {
    graphEdges.set(edge.nodeId, [
      ...(graphEdges.get(edge.nodeId) ?? []),
      { nodeId: node.id, distance: edge.distance },
    ]);
  }
}

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
  const edges = new Map(graphEdges);
  edges.set(startId, nearestEdges(origin, walkwayNodes));
  edges.set(destinationId, []);
  for (const edge of nearestEdges(destination, walkwayNodes)) {
    edges.set(edge.nodeId, [
      ...(edges.get(edge.nodeId) ?? []),
      { nodeId: destinationId, distance: edge.distance },
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
    if (current === destinationId) {
      break;
    }

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

  const path = [destinationId];
  while (path[0] !== startId) {
    const parent = previous.get(path[0]);
    if (!parent) {
      throw new Error("The local walking route is incomplete.");
    }
    path.unshift(parent);
  }

  const geometry = path.map((nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)!;
    return [node.latitude, node.longitude] as [number, number];
  });
  const distance = distances.get(destinationId)!;

  return {
    geometry,
    distance,
    duration: distance / WALKING_SPEED_METERS_PER_SECOND,
  };
}

function nearestEdges(
  point: Pick<RoutePoint, "latitude" | "longitude">,
  nodes: GraphNode[],
): GraphEdge[] {
  return nodes
    .map((node) => ({
      nodeId: node.id,
      distance: distanceBetween(point.latitude, point.longitude, node.latitude, node.longitude),
    }))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 4);
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
