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

export type WalkwayDebugOverlay = {
  nodes: [number, number][];
  connections: [[number, number], [number, number]][];
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
  { id: "quad-center", latitude: 42.27384471336243, longitude: -71.80980835945334 },
  { id: "quad-rec-harrington", latitude: 42.274121688625264, longitude: -71.81002343271793 },
  { id: "quad-rec-morgan", latitude: 42.27367674431656, longitude: -71.81017884187825 },
  { id: "quad-daniels", latitude: 42.27350068349751, longitude: -71.80987764371383 },
  { id: "quad-daniels-sanford", latitude: 42.27342544146955, longitude: -71.80927006530047 },
  { id: "quad-bartlett", latitude: 42.27375952485588, longitude: -71.80909815489579 },
  { id: "quad-innovation", latitude: 42.274137165180576, longitude: -71.80916415517422 },
  { id: "innovation-higgins", latitude: 42.274051139670256, longitude: -71.80860200379927 },
  { id: "innovation-higgins-campus-center", latitude: 42.274546454307426, longitude: -71.80846455903826 },
  { id: "innovation-messenger", latitude: 42.27462961522782, longitude: -71.80916564593984 },
  { id: "fountain-campus-center", latitude: 42.2744811806659, longitude: -71.80784022450472},
  { id: "fountain-olin", latitude: 42.27452438750855, longitude: -71.80777394152985},
  { id: "fountain-straton", latitude: 42.27443060956069, longitude: -71.80779361398845},
  { id: "fountain-salisbury", latitude: 42.27446588941587, longitude: -71.80769572430522},
  { id: "olin-main-entrance", latitude: 42.27488688555022, longitude: -71.80770650286598},
  { id: "olin-atwater", latitude: 42.27516296985081, longitude: -71.80761375217321},
  { id: "olin-salisbury-street", latitude: 42.27590323467943, longitude: -71.80738325177589},
  { id: "fuller-upper", latitude: 42.27485364088761, longitude: -71.80671842923698 },
  { id: "fuller-lower", latitude: 42.2750742912282, longitude: -71.80618504820738 },
  { id: "boynton", latitude: 42.273548072025385, longitude: -71.80695060715583 },
  { id: "boynton-corner", latitude: 42.27331347937322, longitude: -71.80711913166509 },
  { id: "alden", latitude: 42.27348011861333, longitude: -71.80835755945768 },
  { id: "straton-higgins", latitude: 42.27379454864059, longitude: -71.80793139030013 },
  { id: "gordon", latitude: 42.27426762142964, longitude: -71.80672682883 },
  { id: "unity-lower", latitude: 42.273620333825455, longitude: -71.80563798917942 },
  { id: "unity-upper", latitude: 42.27380426934777, longitude: -71.80674716196235 },
  { id: "unity-upper-washburn", latitude: 42.27381042504417, longitude: -71.80690773830483 },
  { id: "institute-park-salisbury-street", latitude: 42.27523469928868, longitude: -71.80515083178038},
  { id: "institute-park-humbolt-ave", latitude: 42.275616076067635, longitude: -71.80304302434887},
];

const walkwayConnections: Record<string, string[]> = {
  "quad-center": ["quad-rec-harrington", "quad-rec-morgan", "quad-daniels", "quad-daniels-sanford", "quad-innovation"],
  "quad-rec-harrington": ["quad-innovation"],
  "quad-rec-morgan": ["quad-daniels", "quad-rec-harrington"],
  "quad-daniels": ["quad-daniels-sanford"],
  "quad-daniels-sanford": ["quad-bartlett"],
  "quad-bartlett": ["quad-innovation"],
  "quad-innovation": ["innovation-higgins", "innovation-messenger", "innovation-higgins-campus-center"],
  "innovation-higgins": ["innovation-higgins-campus-center"],
  "innovation-higgins-campus-center": ["fountain-campus-center"],
  "innovation-messenger": ["innovation-higgins-campus-center"],
  "fountain-campus-center": ["fountain-olin", "fountain-straton"],
  "fountain-olin": ["olin-main-entrance", "fountain-salisbury"],
  "fountain-salisbury": ["fountain-straton", "gordon"],
  "fountain-straton" : ["straton-higgins"],
  "olin-main-entrance": ["olin-atwater"],
  "olin-salisbury-street": ["olin-atwater"],
  "olin-atwater": ["fuller-upper"],
  "fuller-lower": ["fuller-upper"],
  "fuller-upper": ["gordon"],
  "gordon": ["unity-upper-washburn"],
  "unity-upper-washburn": ["boynton"],
  "boynton": ["boynton-corner"],
  "boynton-corner": ["alden"],
  "unity-lower": ["unity-upper"],
  "unity-upper": ["unity-upper-washburn"],
};

const campusNodes: GraphNode[] = [
  ...walkwayNodes,
  ...buildingData.flatMap((building) => [
  ...building.entrances.map((entrance, index) => ({
    id: `${building.name}-entrance-${index}`,
    latitude: entrance.latitude,
    longitude: entrance.longitude,
  })),
  ]),
];

const graphEdges = new Map<string, GraphEdge[]>();
for (const node of walkwayNodes) {
  graphEdges.set(node.id, []);
}
const walkwayNodesById = new Map(walkwayNodes.map((node) => [node.id, node]));
for (const [fromId, toIds] of Object.entries(walkwayConnections)) {
  const fromNode = walkwayNodesById.get(fromId);
  if (!fromNode) {
    throw new Error(`Unknown walkway node: ${fromId}`);
  }

  for (const toId of toIds) {
    const toNode = walkwayNodesById.get(toId);
    if (!toNode) {
      throw new Error(`Unknown walkway node: ${toId}`);
    }
    connectWalkwayNodes(fromNode, toNode);
  }
}

export function getWalkwayDebugOverlay(): WalkwayDebugOverlay {
  return {
    nodes: walkwayNodes.map((node) => [node.latitude, node.longitude]),
    connections: Object.entries(walkwayConnections).flatMap(([fromId, toIds]) => {
      const fromNode = walkwayNodesById.get(fromId)!;
      return toIds.map((toId) => {
        const toNode = walkwayNodesById.get(toId)!;
        return [
          [fromNode.latitude, fromNode.longitude] as [number, number],
          [toNode.latitude, toNode.longitude] as [number, number],
        ] as [[number, number], [number, number]];
      });
    }),
  };
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
