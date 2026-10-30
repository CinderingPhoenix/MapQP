export type ConnectionDetail = { to: string; accessible?: boolean; indoor?: boolean; roadCrossing?: boolean };
export type Connections = Record<string, (string | ConnectionDetail)[]>;
const detail = (item: string | ConnectionDetail): ConnectionDetail => typeof item === "string" ? { to: item } : item;
export function normalizeConnections(input: Record<string, unknown[]>): Connections {
  return Object.fromEntries(Object.entries(input).map(([from, items]) => [from, items.map(item => {
    if (typeof item === "string") return item;
    if (Array.isArray(item)) return { to: String(item[0]), accessible: item[1] !== false, indoor: item[2] === true, roadCrossing: item[3] === true };
    const value = item as ConnectionDetail;
    return { to: value.to, accessible: value.accessible, indoor: value.indoor, roadCrossing: value.roadCrossing };
  })]));
}
export function serializeConnections(connections: Connections) {
  return Object.fromEntries(Object.entries(connections).map(([from, items]) => [from, items.map(item => {
    const connection = detail(item);
    return {
      to: connection.to,
      accessible: connection.accessible ?? true,
      indoor: connection.indoor ?? false,
      roadCrossing: connection.roadCrossing ?? false,
    };
  })]));
}
export function updateConnectionFlag(connections: Connections, from: string, to: string, flag: "accessible" | "roadCrossing"): Connections {
  const forward = connections[from]?.find(item => detail(item).to === to);
  const reverse = connections[to]?.find(item => detail(item).to === from);
  if (!forward && !reverse) return connections;
  const values = [forward, reverse].filter((item): item is string | ConnectionDetail => item !== undefined).map(detail);
  const merged = { accessible: values.every(item => item.accessible !== false), indoor: values.some(item => item.indoor), roadCrossing: values.some(item => item.roadCrossing) };
  merged[flag] = !merged[flag];
  const result = { ...connections };
  for (const [a, b] of [[from, to], [to, from]]) {
    const list = connections[a] ?? [];
    const next = { to: b, ...merged };
    result[a] = list.some(item => detail(item).to === b) ? list.map(item => detail(item).to === b ? next : item) : [...list, next];
  }
  return result;
}
export function toggleInternalConnection(connections: Connections, from: string, to: string, entranceIds: ReadonlySet<string>): Connections {
  if (from === to || !entranceIds.has(from) || !entranceIds.has(to)) {
    throw new Error("Internal connections require two different building entrances.");
  }
  const existing = [
    connections[from]?.find(item => detail(item).to === to),
    connections[to]?.find(item => detail(item).to === from),
  ].filter((item): item is string | ConnectionDetail => item !== undefined).map(detail);
  const indoor = !existing.some(item => item.indoor);
  const accessible = existing.every(item => item.accessible !== false);
  const result = { ...connections };
  for (const [a, b] of [[from, to], [to, from]]) {
    const list = connections[a] ?? [];
    const next = { to: b, accessible, indoor, roadCrossing: false };
    result[a] = list.some(item => detail(item).to === b)
      ? list.map(item => detail(item).to === b ? next : item)
      : [...list, next];
  }
  return result;
}
