import type {
  IndoorEdge,
  IndoorMapNode,
} from "../data/uh-indoor-graph";

export function findIndoorRoute(
  nodes: IndoorMapNode[],
  edges: IndoorEdge[],
  startId: string,
  destinationId: string,
): IndoorEdge[] | null {
  const graph = new Map<string, IndoorEdge[]>();

  for (const node of nodes) {
    graph.set(node.id, []);
  }

  if (!graph.has(startId) || !graph.has(destinationId)) {
    return null;
  }

  for (const edge of edges) {
    if (!graph.has(edge.from) || !graph.has(edge.to)) {
      throw new Error(
        `Unknown node in edge: ${edge.from} -> ${edge.to}`,
      );
    }

    if (
      !Number.isFinite(edge.travelSeconds) ||
      edge.travelSeconds < 0
    ) {
      throw new Error(
        `Invalid travel time: ${edge.from} -> ${edge.to}`,
      );
    }

    graph.get(edge.from)!.push(edge);

    if (edge.bidirectional) {
      graph.get(edge.to)!.push({
        ...edge,
        from: edge.to,
        to: edge.from,
      });
    }
  }

  const distances = new Map<string, number>();
  const previous = new Map<string, IndoorEdge>();
  const unvisited = new Set(graph.keys());

  for (const id of graph.keys()) {
    distances.set(id, Infinity);
  }

  distances.set(startId, 0);

  while (unvisited.size > 0) {
    let currentId: string | undefined;
    let shortest = Infinity;

    for (const id of unvisited) {
      const distance = distances.get(id)!;

      if (distance < shortest) {
        shortest = distance;
        currentId = id;
      }
    }

    if (currentId === undefined) {
      return null;
    }

    if (currentId === destinationId) {
      const route: IndoorEdge[] = [];
      let cursor = destinationId;

      while (cursor !== startId) {
        const edge = previous.get(cursor);

        if (!edge) return null;

        route.push(edge);
        cursor = edge.from;
      }

      return route.reverse();
    }

    unvisited.delete(currentId);

    for (const edge of graph.get(currentId)!) {
      if (!unvisited.has(edge.to)) continue;

      const candidate = shortest + edge.travelSeconds;

      if (candidate < distances.get(edge.to)!) {
        distances.set(edge.to, candidate);
        previous.set(edge.to, edge);
      }
    }
  }

  return null;
}