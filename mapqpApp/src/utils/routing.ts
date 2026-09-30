import routePointsData from "../data/route-points.json";
import buildingData from "../data/wpi-buildings.json";

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

// The route-points JSON stores nodes as:
// [nodeId, latitude, longitude]
const rawNodes = routePointsData.nodes as [string, number, number][];

// Connections are stored as:
// [fromNodeId, toNodeId]
const rawConnections =
  routePointsData.connections as [string, string, number?][];

// Convert the raw JSON nodes into graph nodes.
const walkwayNodes: GraphNode[] = rawNodes.map((node) => ({
  id: node[0],
  latitude: node[1],
  longitude: node[2],
}));

// Combine walkway nodes and building entrance nodes.
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

const campusNodesById = new Map(
  campusNodes.map((node) => [node.id, node])
);

const graphEdges = new Map<string, GraphEdge[]>();

for (const node of campusNodes) {
  graphEdges.set(node.id, []);
}

// --- Build walkway graph ---

// Connections in route-points.json are flat pairs:
// ["node_a", "node_b"]
//
// Each connection is bidirectional.
for (const connection of rawConnections) {
  const fromId = connection[0];
  const toId = connection[1];

  const fromNode = campusNodesById.get(fromId);
  const toNode = campusNodesById.get(toId);

  if (!fromNode) {
    console.warn(
      `Unknown node in walkwayConnections: ${fromId}`
    );
    continue;
  }

  if (!toNode) {
    console.warn(
      `Unknown node in walkwayConnections: ${toId}`
    );
    continue;
  }

  connectWalkwayNodes(fromNode, toNode);
}

// --- Connect building entrances to walkway graph ---

for (const node of campusNodes.filter(
  (candidate) => !walkwayNodes.includes(candidate)
)) {
  const existingEdges = graphEdges.get(node.id) ?? [];

  if (existingEdges.length === 0) {
    const nearest = nearestEdges(node);

    graphEdges.set(node.id, nearest);

    for (const edge of nearest) {
      graphEdges.set(edge.nodeId, [
        ...(graphEdges.get(edge.nodeId) ?? []),
        {
          nodeId: node.id,
          distance: edge.distance,
        },
      ]);
    }
  }
}

// --- Public API ---

export function getWalkwayDebugOverlay(): WalkwayDebugOverlay {
  return {
    nodes: campusNodes.map((node) => [
      node.latitude,
      node.longitude,
    ]),

    connections: rawConnections
      .map((connection) => {
        const fromNode = campusNodesById.get(connection[0]);
        const toNode = campusNodesById.get(connection[1]);

        if (!fromNode || !toNode) {
          return null;
        }

        return [
          [
            fromNode.latitude,
            fromNode.longitude,
          ] as [number, number],

          [
            toNode.latitude,
            toNode.longitude,
          ] as [number, number],
        ] as [[number, number], [number, number]];
      })
      .filter(
        (
          connection
        ): connection is [
          [number, number],
          [number, number]
        ] => connection !== null
      ),
  };
}

export async function routeBetween(
  origin: RoutePoint,
  destination: RoutePoint
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

  const route = findLocalWalkingRoute(
    origin,
    destination
  );

  routeCache.set(cacheKey, route);

  return route;
}

// --- Pathfinding ---

function findLocalWalkingRoute(
  origin: RoutePoint,
  destination: RoutePoint
): WalkingRoute {
  const startId = "__origin";
  const destinationId = "__destination";

  const nodes = [
    {
      id: startId,
      latitude: origin.latitude,
      longitude: origin.longitude,
    },

    ...campusNodes,

    {
      id: destinationId,
      latitude: destination.latitude,
      longitude: destination.longitude,
    },
  ];

  // Copy the existing graph so we can add the
  // temporary origin and destination nodes.
  const edges = new Map(graphEdges);

  // Connect the user's current location to
  // the closest walkway segment.
  edges.set(
    startId,
    nearestEdges(origin)
  );

  // Destination initially has no outgoing edges.
  edges.set(destinationId, []);

  // Connect the closest walkway segment to
  // the destination.
  for (const edge of nearestEdges(destination)) {
    edges.set(edge.nodeId, [
      ...(edges.get(edge.nodeId) ?? []),

      {
        nodeId: destinationId,
        distance: edge.distance,
      },
    ]);
  }

  // --- Dijkstra's algorithm ---

  const distances = new Map<string, number>([
    [startId, 0],
  ]);

  const previous = new Map<string, string>();

  const open = new Set<string>([
    startId,
  ]);

  while (open.size > 0) {
    const current = [...open].reduce(
      (closest, nodeId) =>
        (distances.get(nodeId) ??
          Number.POSITIVE_INFINITY) <
        (distances.get(closest) ??
          Number.POSITIVE_INFINITY)
          ? nodeId
          : closest
    );

    open.delete(current);

    if (current === destinationId) {
      break;
    }

    for (const edge of edges.get(current) ?? []) {
      const nextDistance =
        (distances.get(current) ?? 0) +
        edge.distance;

      if (
        nextDistance <
        (distances.get(edge.nodeId) ??
          Number.POSITIVE_INFINITY)
      ) {
        distances.set(
          edge.nodeId,
          nextDistance
        );

        previous.set(
          edge.nodeId,
          current
        );

        open.add(edge.nodeId);
      }
    }
  }

  if (!distances.has(destinationId)) {
    throw new Error(
      "No local walking route was found between those locations."
    );
  }

  // --- Reconstruct route ---

  const path = [destinationId];

  while (path[0] !== startId) {
    const parent = previous.get(path[0]);

    if (!parent) {
      throw new Error(
        "The local walking route is incomplete."
      );
    }

    path.unshift(parent);
  }

  const rawGeometry = path.map((nodeId) => {
    const node = nodes.find(
      (candidate) => candidate.id === nodeId
    );

    if (!node) {
      throw new Error(
        `Route node ${nodeId} could not be found.`
      );
    }

    return [
      node.latitude,
      node.longitude,
    ] as [number, number];
  });

  const geometry = smoothPolyline(
    rawGeometry
  );

  const distance =
    distances.get(destinationId)!;

  return {
    geometry,
    distance,
    duration:
      distance /
      WALKING_SPEED_METERS_PER_SECOND,
  };
}

// --- Geometry ---

function smoothPolyline(
  points: [number, number][],
  iterations = 2,
  tension = 0.25
): [number, number][] {
  if (
    points.length <= 2 ||
    iterations <= 0
  ) {
    return points;
  }

  let current = points;

  for (
    let i = 0;
    i < iterations;
    i++
  ) {
    const smoothed: [
      number,
      number
    ][] = [current[0]];

    for (
      let j = 0;
      j < current.length - 1;
      j++
    ) {
      const p0 = current[j];
      const p1 = current[j + 1];

      const q: [
        number,
        number
      ] = [
        (1 - tension) * p0[0] +
          tension * p1[0],

        (1 - tension) * p0[1] +
          tension * p1[1],
      ];

      const r: [
        number,
        number
      ] = [
        tension * p0[0] +
          (1 - tension) * p1[0],

        tension * p0[1] +
          (1 - tension) * p1[1],
      ];

      smoothed.push(q, r);
    }

    smoothed.push(
      current[current.length - 1]
    );

    current = smoothed;
  }

  return current;
}

// --- Nearest graph edge ---

function nearestEdges(
  point: Pick<
    RoutePoint,
    "latitude" | "longitude"
  >
): GraphEdge[] {
  let bestEdges: GraphEdge[] = [];

  let minDistanceToSegment =
    Number.POSITIVE_INFINITY;

  const seenEdges = new Set<string>();

  for (const [
    fromId,
    neighbors,
  ] of graphEdges.entries()) {
    const fromNode =
      campusNodesById.get(fromId);

    if (!fromNode) {
      continue;
    }

    for (const neighbor of neighbors) {
      const toId =
        neighbor.nodeId;

      const toNode =
        campusNodesById.get(toId);

      if (!toNode) {
        continue;
      }

      const edgeKey = [
        fromId,
        toId,
      ]
        .sort()
        .join("::");

      if (seenEdges.has(edgeKey)) {
        continue;
      }

      seenEdges.add(edgeKey);

      const {
        distToSegment,
        distToFrom,
        distToTo,
      } =
        projectPointToSegment(
          point.latitude,
          point.longitude,
          fromNode,
          toNode
        );

      if (
        distToSegment <
        minDistanceToSegment
      ) {
        minDistanceToSegment =
          distToSegment;

        bestEdges = [
          {
            nodeId: fromNode.id,
            distance:
              distToSegment +
              distToFrom,
          },

          {
            nodeId: toNode.id,
            distance:
              distToSegment +
              distToTo,
          },
        ];
      }
    }
  }

  return bestEdges;
}

function projectPointToSegment(
  pLat: number,
  pLng: number,
  a: GraphNode,
  b: GraphNode
) {
  const latScale = Math.cos(
    ((a.latitude +
      b.latitude) /
      2) *
      (Math.PI / 180)
  );

  const dxAB =
    (b.longitude -
      a.longitude) *
    111_320 *
    latScale;

  const dyAB =
    (b.latitude -
      a.latitude) *
    111_320;

  const dxAP =
    (pLng -
      a.longitude) *
    111_320 *
    latScale;

  const dyAP =
    (pLat -
      a.latitude) *
    111_320;

  const ab2 =
    dxAB * dxAB +
    dyAB * dyAB;

  let t =
    ab2 === 0
      ? 0
      : (dxAP * dxAB +
          dyAP * dyAB) /
        ab2;

  t = Math.max(
    0,
    Math.min(1, t)
  );

  const projX = t * dxAB;
  const projY = t * dyAB;

  const distToSegment =
    Math.hypot(
      dxAP - projX,
      dyAP - projY
    );

  const distToFrom =
    Math.hypot(
      projX,
      projY
    );

  const distToTo =
    Math.hypot(
      dxAB - projX,
      dyAB - projY
    );

  return {
    distToSegment,
    distToFrom,
    distToTo,
  };
}

// --- Graph connections ---

function connectWalkwayNodes(
  first: GraphNode,
  second: GraphNode
) {
  const distance =
    distanceBetween(
      first.latitude,
      first.longitude,
      second.latitude,
      second.longitude
    );

  graphEdges.set(first.id, [
    ...(graphEdges.get(first.id) ?? []),

    {
      nodeId: second.id,
      distance,
    },
  ]);

  graphEdges.set(second.id, [
    ...(graphEdges.get(second.id) ?? []),

    {
      nodeId: first.id,
      distance,
    },
  ]);
}

// --- Distance ---

export function distanceBetween(
  latitudeOne: number,
  longitudeOne: number,
  latitudeTwo: number,
  longitudeTwo: number
) {
  const latitudeScale = Math.cos(
    ((latitudeOne +
      latitudeTwo) /
      2) *
      (Math.PI / 180)
  );

  const latitudeDelta =
    (latitudeTwo -
      latitudeOne) *
    111_320;

  const longitudeDelta =
    (longitudeTwo -
      longitudeOne) *
    111_320 *
    latitudeScale;

  return Math.hypot(
    latitudeDelta,
    longitudeDelta
  );
}