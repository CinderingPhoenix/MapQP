import type { UnityFloor } from "../components/indoor-map";

// ============================================================
// Types
// ============================================================

export type IndoorMapNode = {
  id: string;
  floor: UnityFloor;
  x: number;
  y: number;
  kind: "entrance" | "hallway" | "room" | "stairs" | "elevator";
  roomNum?: string;
  outdoorNodeId?: string;
};

export type IndoorEdgeKind = "normal" | "stair" | "elevator";

export type IndoorMapEdge = {
  from: string;
  to: string;
  bidirectional: boolean;
  kind: IndoorEdgeKind;
  distanceMeters: number;
  travelSeconds: number;
};

export type IndoorMapConnections = Record<string, string[]>;

type PixelNode = [
  id: string,
  x: number,
  y: number,
  kind: IndoorMapNode["kind"],
  roomNum?: string,
  outdoorNodeId?: string,
];

// ============================================================
// Image dimensions
// ============================================================

const FLOOR_4_IMAGE_SIZE = {
  width: 1169,
  height: 658,
};

// Inferred from your original normalized coordinates.
// Update these values if the actual image dimensions differ.
const FLOOR_5_IMAGE_SIZE = {
  width: 1270,
  height: 539,
};

export const WALKING_SPEED_METERS_PER_SECOND = 1.4;

const INCHES_TO_METERS = 0.0254;

type FloorScale = {
  width: number;
  height: number;
  inchesPerPixelX: number;
  inchesPerPixelY: number;
};

const FLOOR_SCALES: Partial<Record<UnityFloor, FloorScale>> = {
  1: {
    width: 973,
    height: 554,
    inchesPerPixelX: 188 / 75,
    inchesPerPixelY: 146 / 51,
  },
  4: {
    width: FLOOR_4_IMAGE_SIZE.width,
    height: FLOOR_4_IMAGE_SIZE.height,
    inchesPerPixelX: 108 / 45,
    inchesPerPixelY: 146 / 66,
  },
  5: {
    width: FLOOR_5_IMAGE_SIZE.width,
    height: FLOOR_5_IMAGE_SIZE.height,
    inchesPerPixelX: 108 / 26,
    inchesPerPixelY: 146 / 57,
  },
};

function calculateDistanceMeters(
  from: IndoorMapNode,
  to: IndoorMapNode,
): number {
  if (from.floor !== to.floor) {
    throw new Error(
      `Cross-floor distance must be specified explicitly: ${from.id} -> ${to.id}`,
    );
  }

  const scale = FLOOR_SCALES[from.floor];

  if (!scale) {
    throw new Error(`Missing scale for floor ${from.floor}`);
  }

  const dxPixels = (to.x - from.x) * scale.width;
  const dyPixels = (to.y - from.y) * scale.height;

  const dxInches = dxPixels * scale.inchesPerPixelX;
  const dyInches = dyPixels * scale.inchesPerPixelY;

  return Math.hypot(dxInches, dyInches) * INCHES_TO_METERS;
}

// ============================================================
// Coordinate conversion
// ============================================================

function normalizePixelNodes(
  floor: UnityFloor,
  imageSize: { width: number; height: number },
  nodes: PixelNode[],
): IndoorMapNode[] {
  return nodes.map(
    ([id, x, y, kind, roomNum, outdoorNodeId]) => ({
      id,
      floor,
      x: Number((x / imageSize.width).toFixed(5)),
      y: Number((y / imageSize.height).toFixed(5)),
      kind,
      ...(roomNum !== undefined ? { roomNum } : {}),
      ...(outdoorNodeId !== undefined
        ? { outdoorNodeId }
        : {}),
    }),
  );
}

// ============================================================
// Floor 1
// Existing normalized coordinates preserved.
// ============================================================

const FLOOR_1_NODES: IndoorMapNode[] = [
  // Entrance
  {
    id: "Unity-One-Entr",
    floor: 1,
    x: 0.14902,
    y: 0.44765,
    kind: "entrance",

    outdoorNodeId: "unity-lower"
  },

  // Hallways
  {
    id: "UHH-11",
    floor: 1,
    x: 0.22816,
    y: 0.44765,
    kind: "hallway",
  },
  {
    id: "UHH-12",
    floor: 1,
    x: 0.22816,
    y: 0.56137,
    kind: "hallway",
  },
  {
    id: "UHH-13",
    floor: 1,
    x: 0.16238,
    y: 0.56137,
    kind: "hallway",
  },
  {
    id: "UHH-14",
    floor: 1,
    x: 0.38952,
    y: 0.56137,
    kind: "hallway",
  },
  {
    id: "UHH-15",
    floor: 1,
    x: 0.47071,
    y: 0.56137,
    kind: "hallway",
  },
  {
    id: "UHH-16",
    floor: 1,
    x: 0.59404,
    y: 0.56137,
    kind: "hallway",
  },
  {
    id: "UHH-17",
    floor: 1,
    x: 0.62590,
    y: 0.62455,
    kind: "hallway",
  },
  {
    id: "UHH-18",
    floor: 1,
    x: 0.62590,
    y: 0.74188,
    kind: "hallway",
  },

  // Stairs
  {
    id: "Unity-One-SA",
    floor: 1,
    x: 0.11819,
    y: 0.52527,
    kind: "stairs",
  },
  {
    id: "Unity-One-SB",
    floor: 1,
    x: 0.62590,
    y: 0.88628,
    kind: "stairs",
  },

  // Elevators
  {
    id: "Unity-One-E1",
    floor: 1,
    x: 0.57348,
    y: 0.44765,
    kind: "elevator",
  },
  {
    id: "Unity-One-E2",
    floor: 1,
    x: 0.62076,
    y: 0.44765,
    kind: "elevator",
  },

  // Rooms
  {
    id: "Un100A",
    floor: 1,
    x: 0.15005,
    y: 0.61552,
    kind: "room",
    roomNum: "100A",
  },
  {
    id: "Un100B",
    floor: 1,
    x: 0.38438,
    y: 0.61552,
    kind: "room",
    roomNum: "100B",
  },
  {
    id: "Un111",
    floor: 1,
    x: 0.59609,
    y: 0.68773,
    kind: "room",
    roomNum: "111",
  },
  {
    id: "Un112",
    floor: 1,
    x: 0.59609,
    y: 0.79061,
    kind: "room",
    roomNum: "112",
  },
  {
    id: "Un115",
    floor: 1,
    x: 0.63926,
    y: 0.80686,
    kind: "room",
    roomNum: "115",
  },
  {
    id: "Un116",
    floor: 1,
    x: 0.63926,
    y: 0.71119,
    kind: "room",
    roomNum: "116",
  },
  {
    id: "Un117",
    floor: 1,
    x: 0.63926,
    y: 0.64621,
    kind: "room",
    roomNum: "117",
  },
  {
    id: "Un150A",
    floor: 1,
    x: 0.22816,
    y: 0.41155,
    kind: "room",
    roomNum: "150A",
  },
  {
    id: "Un150B",
    floor: 1,
    x: 0.39466,
    y: 0.50903,
    kind: "room",
    roomNum: "150B",
  },
  {
    id: "Un151",
    floor: 1,
    x: 0.47071,
    y: 0.50903,
    kind: "room",
    roomNum: "151",
  },
];

// ============================================================
// Floor 4
// Pixel coordinates converted to normalized coordinates.
// ============================================================

const FLOOR_4_NODES = normalizePixelNodes(
  4,
  FLOOR_4_IMAGE_SIZE,
  [
    // Hallways
    ["UHH-41", 210, 336, "hallway"],
    ["UHH-42", 293, 352, "hallway"],
    ["UHH-43", 414, 352, "hallway"],
    ["UHH-44", 470, 352, "hallway"],
    ["UHH-45", 598, 352, "hallway"],
    ["UHH-46", 735, 352, "hallway"],
    ["UHH-47", 857, 352, "hallway"],
    ["UHH-48", 1076, 352, "hallway"],
    ["UHH-49", 857, 298, "hallway"],
    ["UHH-410", 857, 250, "hallway"],
    ["UHH-411", 857, 125, "hallway"],
    ["UHH-412", 834, 125, "hallway"],
    ["UHH-413", 798, 125, "hallway"],
    ["UHH-414", 710, 125, "hallway"],
    ["UHH-415", 648, 125, "hallway"],
    ["UHH-416", 603, 125, "hallway"],
    ["UHH-417", 496, 125, "hallway"],
    ["UHH-418", 466, 125, "hallway"],
    ["UHH-419", 421, 125, "hallway"],
    ["UHH-420", 347, 125, "hallway"],
    ["UHH-421", 327, 125, "hallway"],
    ["UHH-422", 300, 125, "hallway"],
    ["UHH-423", 250, 125, "hallway"],
    ["UHH-424", 192, 136, "hallway"],
    ["UHH-425", 603, 223, "hallway"],
    ["UHH-426", 603, 279, "hallway"],
    ["UHH-427", 759, 396, "hallway"],
    ["UHH-428", 759, 480, "hallway"],

    // Stairs
    ["Unity-Four-SA", 180, 336, "stairs"],
    ["Unity-Four-SB", 759, 559, "stairs"],
    ["Unity-Four-SC", 1007, 303, "stairs"],

    // Elevators
    ["Unity-Four-E1", 697, 285, "elevator"],
    ["Unity-Four-E2", 754, 285, "elevator"],

    // Rooms
    ["Un400A", 202, 396, "room", "400A"],
    ["Un400B", 416, 396, "room", "400B"],
    ["Un405A", 465, 396, "room", "405A"],
    ["Un405B", 607, 396, "room", "405B"],
    ["Un411", 723, 446, "room", "411"],
    ["Un412", 723, 511, "room", "412"],
    ["Un415", 775, 521, "room", "415"],
    ["Un416", 775, 460, "room", "416"],
    ["Un417", 775, 418, "room", "417"],
    ["Un420A", 851, 396, "room", "420A"],
    ["Un420B", 1078, 396, "room", "420B"],
    ["Un435A", 885, 250, "room", "435A"],
    ["Un435B", 885, 107, "room", "435B"],
    ["Un441", 295, 321, "room", "441"],
    ["Un442", 468, 321, "room", "442"],
    ["Un443", 550, 276, "room", "443"],
    ["Un444", 550, 222, "room", "444"],
    ["Un451", 225, 169, "room", "451"],
    ["Un452", 325, 157, "room", "452"],
    ["Un453", 351, 157, "room", "453"],
    ["Un454", 426, 157, "room", "454"],
    ["Un455", 471, 157, "room", "455"],
    ["Un456", 495, 157, "room", "456"],
    ["Un460", 178, 93, "room", "460"],
    ["Un461", 250, 93, "room", "461"],
    ["Un462", 300, 93, "room", "462"],
    ["Un463", 330, 93, "room", "463"],
    ["Un464", 416, 93, "room", "464"],
    ["Un465", 469, 93, "room", "465"],
    ["Un466", 604, 93, "room", "466"],
    ["Un471", 682, 172, "room", "471"],
    ["Un472", 788, 155, "room", "472"],
    ["Un481", 647, 93, "room", "481"],
    ["Un482", 713, 93, "room", "482"],
    ["Un483", 810, 93, "room", "483"],
    ["Un484", 836, 93, "room", "484"],
  ],
);

// ============================================================
// Floor 5
// Updated pixel coordinates and hallway numbering.
// ============================================================

const FLOOR_5_NODES = normalizePixelNodes(
  5,
  FLOOR_5_IMAGE_SIZE,
  [
    // Entrance
    [
      "Unity-Fiv-Entr",
      1217,
      270,
      "entrance",
      undefined,
      "unity-upper-washburn",
    ],

    // Hallways
    ["UHH-51", 147, 278, "hallway"],
    ["UHH-52", 340, 290, "hallway"],
    ["UHH-53", 484, 290, "hallway"],
    ["UHH-54", 576, 290, "hallway"],
    ["UHH-55", 709, 289, "hallway"],
    ["UHH-56", 1132, 266, "hallway"],
    ["UHH-57", 1132, 157, "hallway"],
    ["UHH-58", 909, 290, "hallway"],
    ["UHH-59", 909, 256, "hallway"],
    ["UHH-510", 608, 330, "hallway"],
    ["UHH-511", 608, 397, "hallway"],

    // Stairs
    ["Unity-Fiv-SA", 109, 282, "stairs"],
    ["Unity-Fiv-SB", 604, 476, "stairs"],
    ["Unity-Fiv-SC", 828, 249, "stairs"],

    // Elevators
    ["Unity-Fiv-E1", 557, 234, "elevator"],
    ["Unity-Fiv-E2", 603, 234, "elevator"],

    // Rooms
    ["Un500A", 145, 328, "room", "500A"],
    ["Un500B", 320, 328, "room", "500B"],
    ["Un505A", 365, 328, "room", "505A"],
    ["Un505B", 483, 328, "room", "505B"],
    ["Un511", 579, 369, "room", "511"],
    ["Un512", 579, 425, "room", "512"],
    ["Un515", 620, 431, "room", "515"],
    ["Un516", 620, 381, "room", "516"],
    ["Un517", 620, 346, "room", "517"],
    ["Un520A", 685, 328, "room", "520A"],
    ["Un520B", 873, 328, "room", "520B"],
    ["Un544", 703, 143, "room", "544"],
    ["Un545A", 765, 170, "room", "545A"],
    ["Un545B", 982, 185, "room", "545B"],
    ["Un547", 1029, 198, "room", "547"],
    ["Un548", 1051, 199, "room", "548"],
    ["Un551", 1176, 210, "room", "551"],
    ["Un552", 1176, 164, "room", "552"],
    ["Un553", 1176, 142, "room", "553"],
  ],
);

// ============================================================
// All nodes
// ============================================================

export const UNITY_MAP_NODES: IndoorMapNode[] = [
  ...FLOOR_1_NODES,
  ...FLOOR_4_NODES,
  ...FLOOR_5_NODES,
];

// ============================================================
// Connection definitions
//
// Each physical connection only needs to appear once.
// buildIndoorMapEdges also accepts repeated/reverse entries
// and removes duplicates.
//
// buildIndoorMapConnections generates a complete neighbor list
// for every node, including rooms, stairs, and elevators.
// ============================================================

const FLOOR_1_CONNECTIONS: IndoorMapConnections = {
  "UHH-11": [
    "Unity-One-Entr",
    "Un150A",
    "UHH-12",
  ],
  "UHH-12": ["UHH-13", "UHH-14"],
  "UHH-13": ["Unity-One-SA", "Un100A"],
  "UHH-14": ["Un150B", "Un100B", "UHH-15"],
  "UHH-15": ["Un151", "UHH-16"],
  "UHH-16": [
    "Unity-One-E1",
    "Unity-One-E2",
    "UHH-17",
  ],
  "UHH-17": ["UHH-18"],
  "UHH-18": [
    "Unity-One-SB",
    "Un111",
    "Un112",
    "Un115",
    "Un116",
    "Un117",
  ],
};

const FLOOR_4_CONNECTIONS: IndoorMapConnections = {
  "UHH-41": ["Unity-Four-SA", "Un400A", "UHH-42"],
  "UHH-42": ["Un441", "UHH-43"],
  "UHH-43": ["Un400B", "UHH-44"],
  "UHH-44": ["Un442", "Un405A", "UHH-45"],
  "UHH-45": ["Un405B", "UHH-46", "UHH-426"],
  "UHH-46": [
    "Unity-Four-E1",
    "Unity-Four-E2",
    "UHH-47",
    "UHH-427",
  ],
  "UHH-47": ["Un420A", "UHH-48", "UHH-49"],
  "UHH-48": ["Un420B"],
  "UHH-49": ["Unity-Four-SC", "UHH-410"],
  "UHH-410": ["Un435A", "UHH-411"],
  "UHH-411": ["Un435B", "UHH-412"],
  "UHH-412": ["Un484", "UHH-413"],
  "UHH-413": ["Un483", "Un472", "UHH-414"],
  "UHH-414": ["Un482", "Un471", "UHH-415"],
  "UHH-415": ["Un481", "UHH-416"],
  "UHH-416": ["Un466", "UHH-417", "UHH-425"],
  "UHH-417": ["Un456", "UHH-418"],
  "UHH-418": ["Un465", "Un455", "UHH-419"],
  "UHH-419": ["Un464", "Un454", "UHH-420"],
  "UHH-420": ["Un453", "UHH-421"],
  "UHH-421": ["Un463", "Un452", "UHH-422"],
  "UHH-422": ["Un462", "UHH-423"],
  "UHH-423": ["Un461", "UHH-424"],
  "UHH-424": ["Un460", "Un451"],

  // Interprets your "Unhh26" reference as "Unhh426".
  "UHH-425": ["Un444", "UHH-426"],

  "UHH-426": ["Un443"],
  "UHH-427": ["UHH-428"],
  "UHH-428": [
    "Unity-Four-SB",
    "Un411",
    "Un412",
    "Un415",
    "Un416",
    "Un417",
  ],
};

const FLOOR_5_CONNECTIONS: IndoorMapConnections = {
  "UHH-51": ["Unity-Fiv-SA", "Un500A", "UHH-52"],
  "UHH-52": ["Un500B", "Un505A", "UHH-53"],
  "UHH-53": ["Un505B", "UHH-54"],
  "UHH-54": [
    "Unity-Fiv-E1",
    "Unity-Fiv-E2",
    "UHH-55",
    "UHH-510",
  ],
  "UHH-55": [
    "Un520A",
    "Un544",
    "UHH-58",
  ],
  "UHH-56": [
    "Unity-Fiv-Entr",
    "UHH-57",
    "UHH-58",
    "UHH-59",
  ],
  "UHH-57": [
    "Un547",
    "Un548",
    "Un551",
    "Un552",
    "Un553",
  ],
  "UHH-58": ["Un520B", "UHH-59"],

  // Your self-reference from Unhh59 to itself is omitted.
  "UHH-59": ["Unity-Fiv-SC"],

  "UHH-510": ["UHH-511"],
  "UHH-511": [
    "Unity-Fiv-SB",
    "Un511",
    "Un512",
    "Un515",
    "Un516",
    "Un517",
  ],

  // Awaiting confirmed connections.
  "Un545A": [],
  "Un545B": [],
};

// Add only confirmed stair/elevator links between floors.
// These entries are bidirectional, just like same-floor links.
const CROSS_FLOOR_CONNECTIONS: IndoorMapConnections = {};

// ============================================================
// Edge builder
// ============================================================

export function buildIndoorMapEdges(
  nodes: IndoorMapNode[],
  connectionLists: IndoorMapConnections[],
): IndoorMapEdge[] {
  const byId = new Map<string, IndoorMapNode>();

  for (const node of nodes) {
    if (byId.has(node.id)) {
      throw new Error(`Duplicate indoor node ID: ${node.id}`);
    }

    byId.set(node.id, node);
  }

  const edges: IndoorMapEdge[] = [];
  const seen = new Set<string>();

  for (const connections of connectionLists) {
    for (const [fromId, targets] of Object.entries(connections)) {
      const from = byId.get(fromId);

      if (!from) {
        throw new Error(`Unknown connection source: ${fromId}`);
      }

      for (const toId of targets) {
        const to = byId.get(toId);

        if (!to) {
          throw new Error(
            `Unknown connection target: ${fromId} -> ${toId}`,
          );
        }

        if (fromId === toId) continue;

        const key = JSON.stringify([fromId, toId].sort());

        if (seen.has(key)) continue;

        if (from.floor !== to.floor) {
          throw new Error(
            `Define an explicit stair/elevator edge for: ${fromId} -> ${toId}`,
          );
        }

        const distanceMeters = calculateDistanceMeters(from, to);

        edges.push({
          from: fromId,
          to: toId,
          bidirectional: true,
          kind: "normal",
          distanceMeters,
          travelSeconds:
            distanceMeters / WALKING_SPEED_METERS_PER_SECOND,
        });

        seen.add(key);
      }
    }
  }

  return edges;
}

// ============================================================
// Complete per-node connection list builder
// ============================================================

export function buildIndoorMapConnections(
  nodes: IndoorMapNode[],
  edges: IndoorMapEdge[],
): IndoorMapConnections {
  const neighbors = new Map<string, Set<string>>();

  // Includes every node, even if it has no connections.
  for (const node of nodes) {
    if (neighbors.has(node.id)) {
      throw new Error(`Duplicate indoor node ID: ${node.id}`);
    }

    neighbors.set(node.id, new Set());
  }

  for (const edge of edges) {
    const fromNeighbors = neighbors.get(edge.from);
    const toNeighbors = neighbors.get(edge.to);

    if (!fromNeighbors || !toNeighbors) {
      throw new Error(
        `Unknown node in edge: ${edge.from} -> ${edge.to}`,
      );
    }

    if (edge.from === edge.to) continue;

    fromNeighbors.add(edge.to);

    if (edge.bidirectional) {
      toNeighbors.add(edge.from);
    }
  }

  return Object.fromEntries(
    Array.from(neighbors, ([id, targets]) => [
      id,
      Array.from(targets),
    ]),
  );
}

// ============================================================
// Exported edge type, edge array, and complete connections
// ============================================================

// Individual edge type used by routing/navigation files.
export type IndoorEdge = IndoorMapEdge;

// Runtime array containing all edges.
export const UNITY_MAP_EDGES: IndoorEdge[] =
  buildIndoorMapEdges(UNITY_MAP_NODES, [
    FLOOR_1_CONNECTIONS,
    FLOOR_4_CONNECTIONS,
    FLOOR_5_CONNECTIONS,
    CROSS_FLOOR_CONNECTIONS,
  ]);

// Complete neighbor list for every node.
export const UNITY_MAP_CONNECTIONS: IndoorMapConnections =
  buildIndoorMapConnections(
    UNITY_MAP_NODES,
    UNITY_MAP_EDGES,
  );

export const FLOOR_METERS_PER_PIXEL = {
  1: {
    x: (188 * 0.0254) / 75,
    y: (146 * 0.0254) / 51,
  },
  4: {
    x: (108 * 0.0254) / 45,
    y: (146 * 0.0254) / 66,
  },
  5: {
    x: (108 * 0.0254) / 26,
    y: (146 * 0.0254) / 57,
  },
} as const;

export function getIndoorEntranceForOutdoorNode(
  outdoorNodeId: string,
): IndoorMapNode | null {
  return (
    UNITY_MAP_NODES.find(
      (node) =>
        node.kind === "entrance" &&
        node.outdoorNodeId === outdoorNodeId,
    ) ?? null
  );
}