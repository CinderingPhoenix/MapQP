type RoutePointsDocument = {
  version?: string;
  nodes: unknown[][];
  connections: Record<string, unknown[]>;
  [key: string]: unknown;
};

/** Match the compact node tuples in the route-points reference file. */
export function formatRoutePoints(data: RoutePointsDocument): string {
  const { version = "1.0", nodes, connections, ...metadata } = data;
  const nodeLines = nodes.map(node => `    [${node.map(value => JSON.stringify(value)).join(", ")}]`);
  const formattedNodes = nodeLines.length ? `[\n${nodeLines.join(",\n")}\n  ]` : "[]";
  const fields = [
    `  "version": ${JSON.stringify(version)}`,
    `  "nodes": ${formattedNodes}`,
    `  "connections": ${JSON.stringify(connections, null, 2).replace(/\n/g, "\n  ")}`,
    ...Object.entries(metadata).map(([key, value]) =>
      `  ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replace(/\n/g, "\n  ")}`),
  ];
  return `{\n${fields.join(",\n")}\n}\n`;
}
