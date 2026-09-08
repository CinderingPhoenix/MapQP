import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import type { ActionFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import routePointsData from "../data/route-points.json";

type GraphNode = {
  id: string;
  latitude: number;
  longitude: number;
};

type Connections = Record<string, string[]>;

export type EditorMapProps = {
  nodes: GraphNode[];
  connections: Connections;
  mode: "add" | "connect" | "disconnect" | "delete";
  selectedNodeId: string | null;
  onMapClick: (lat: number, lng: number) => void;
  onNodeClick: (id: string) => void;
  onConnectionClick: (fromId: string, toId: string) => void;
  onNodeDragEnd: (id: string, lat: number, lng: number) => void;
};

export async function action({ request }: ActionFunctionArgs) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const data = await request.json();

  // Round to 6 decimal places
  if (data.nodes) {
    data.nodes = data.nodes.map((node: any) => ({
      ...node,
      latitude: typeof node.latitude === "number" ? Number(node.latitude.toFixed(6)) : node.latitude,
      longitude: typeof node.longitude === "number" ? Number(node.longitude.toFixed(6)) : node.longitude,
    }));
  }

  // Compact to single line formatting
  const rootKeys = Object.keys(data);
  let jsonString = "{\n";
  rootKeys.forEach((key, i) => {
    const val = data[key];
    jsonString += `  "${key}": `;
    if (Array.isArray(val)) {
      jsonString += "[\n";
      const items = val.map((item) => `    ${JSON.stringify(item)}`);
      jsonString += items.join(",\n");
      jsonString += "\n  ]";
    } else if (val !== null && typeof val === "object") {
      jsonString += "{\n";
      const subEntries = Object.entries(val).map(
        ([subK, subV]) => `    ${JSON.stringify(subK)}: ${JSON.stringify(subV)}`
      );
      jsonString += subEntries.join(",\n");
      jsonString += "\n  }";
    } else {
      jsonString += JSON.stringify(val);
    }
    if (i < rootKeys.length - 1) {
      jsonString += ",";
    }
    jsonString += "\n";
  });
  jsonString += "}";

  const filePath = path.join(process.cwd(), "app", "data", "route-points.json");
  await fs.writeFile(filePath, jsonString, "utf-8");
  return { success: true };
}

export default function Editor() {
  const fetcher = useFetcher();
  const [EditorMap, setEditorMap] = useState<ComponentType<EditorMapProps> | null>(null);
  const [error, setError] = useState("");

  const [nodes, setNodes] = useState<GraphNode[]>(routePointsData.nodes);
  const [connections, setConnections] = useState<Connections>(routePointsData.connections);
  const [mode, setMode] = useState<"add" | "connect" | "disconnect" | "delete">("add");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const handleNodeDragEnd = (id: string, latitude: number, longitude: number) => {
  const nextNodes = nodes.map((node) =>
      node.id === id ? { ...node, latitude, longitude } : node
  );
  setNodes(nextNodes);
  saveToDisk(nextNodes, connections);
  };
  
  useEffect(() => {
    let active = true;
    import("./editor-map")
      .then(({ default: map }) => {
        if (active) setEditorMap(() => map);
      })
      .catch((err) => {
        console.error("Failed to load map module:", err);
        if (active) setError("The map could not be loaded. Check console for details.");
      });

    return () => {
      active = false;
    };
  }, []);

  const saveToDisk = (updatedNodes: GraphNode[], updatedConns: Connections) => {
    fetcher.submit(
      { nodes: updatedNodes, connections: updatedConns },
      { method: "POST", encType: "application/json" }
    );
  };

  const handleMapClick = (latitude: number, longitude: number) => {
    if (mode !== "add") return;

    const id = `node_${Math.random().toString(36).substring(2, 9)}`;
    const roundedLat = Number(latitude.toFixed(6));
    const roundedLng = Number(longitude.toFixed(6));

    const nextNodes = [...nodes, { id, latitude: roundedLat, longitude: roundedLng }];
    
    const nextConnections = { ...connections };

    setNodes(nextNodes);
    setConnections(nextConnections);
    saveToDisk(nextNodes, nextConnections);
  };

  const removeConnection = (fromId: string, toId: string) => {
    const nextConnections = { ...connections };
    if (nextConnections[fromId]) {
      nextConnections[fromId] = nextConnections[fromId].filter((id) => id !== toId);
    }
    if (nextConnections[toId]) {
      nextConnections[toId] = nextConnections[toId].filter((id) => id !== fromId);
    }
    setConnections(nextConnections);
    saveToDisk(nodes, nextConnections);
  };

  const handleNodeClick = (nodeId: string) => {
    if (mode === "delete") {
      const nextNodes = nodes.filter((n) => n.id !== nodeId);
      const nextConnections = { ...connections };
      delete nextConnections[nodeId];
      Object.keys(nextConnections).forEach((key) => {
        nextConnections[key] = nextConnections[key].filter((connectedId) => connectedId !== nodeId);
      });

      setNodes(nextNodes);
      setConnections(nextConnections);
      saveToDisk(nextNodes, nextConnections);
      return;
    }

    if (mode === "connect") {
      if (!selectedNodeId) {
        setSelectedNodeId(nodeId);
        return;
      }

      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
        return;
      }

      const nextConnections = { ...connections };
      const listA = nextConnections[selectedNodeId] || [];
      const listB = nextConnections[nodeId] || [];

      if (!listA.includes(nodeId)) {
        nextConnections[selectedNodeId] = [...listA, nodeId];

        setConnections(nextConnections);
        saveToDisk(nodes, nextConnections);
      }

      setSelectedNodeId(null);
      return;
    }

    if (mode === "disconnect") {
      if (!selectedNodeId) {
        setSelectedNodeId(nodeId);
        return;
      }

      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
        return;
      }

      const listA = connections[selectedNodeId] || [];
      if (listA.includes(nodeId)) {
        removeConnection(selectedNodeId, nodeId);
      }

      setSelectedNodeId(null);
      return;
    }
  };

  const handleConnectionClick = (fromId: string, toId: string) => {
    if (mode === "disconnect" || mode === "delete") {
      removeConnection(fromId, toId);
    }
  };

  const activeConnectionList: [string, string][] = [];
  const seen = new Set<string>();
  Object.entries(connections).forEach(([from, toArray]) => {
    toArray.forEach((to) => {
      const key = [from, to].sort().join("::");
      if (!seen.has(key)) {
        seen.add(key);
        activeConnectionList.push([from, to]);
      }
    });
  });

  const isSaving = fetcher.state !== "idle";

  return (
    <main className="map-app">
      <div className="map-canvas" aria-label="Map view">
        {EditorMap ? (
          <EditorMap
            nodes={nodes}
            connections={connections}
            mode={mode}
            selectedNodeId={selectedNodeId}
            onMapClick={handleMapClick}
            onNodeClick={handleNodeClick}
            onConnectionClick={handleConnectionClick}
            onNodeDragEnd={handleNodeDragEnd}
            />
        ) : (
          <div className="map-loading">
            <span>{error || "Loading map..."}</span>
          </div>
        )}
      </div>
      <section className="planner-panel map-controls" aria-label="Editor controls">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Route Editor</h2>
            <span style={{ fontSize: "0.8rem", color: isSaving ? "#e06b3c" : "#27ae60", fontWeight: "bold" }}>
              {isSaving ? "Saving..." : "Saved to disk"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              style={{ fontWeight: mode === "add" ? "bold" : "normal" }}
              onClick={() => { setMode("add"); setSelectedNodeId(null); }}
            >
              Add Node
            </button>
            <button
              style={{ fontWeight: mode === "connect" ? "bold" : "normal" }}
              onClick={() => { setMode("connect"); setSelectedNodeId(null); }}
            >
              Connect
            </button>
            <button
              style={{ fontWeight: mode === "disconnect" ? "bold" : "normal", color: "#d35400" }}
              onClick={() => { setMode("disconnect"); setSelectedNodeId(null); }}
            >
              Disconnect
            </button>
            <button
              style={{ fontWeight: mode === "delete" ? "bold" : "normal", color: "#c0392b" }}
              onClick={() => { setMode("delete"); setSelectedNodeId(null); }}
            >
              Delete Node
            </button>
          </div>

          <p style={{ fontSize: "0.85rem", color: "#555", margin: 0 }}>
            {mode === "add" && "Click the map to create a node instantly."}
            {mode === "connect" && (!selectedNodeId
              ? "Click the first node to select it."
              : `Selected "${selectedNodeId}". Click a second node to connect.`)}
            {mode === "disconnect" && (!selectedNodeId
              ? "Click two connected nodes (or click line directly) to disconnect."
              : `Selected "${selectedNodeId}". Click connected node to remove edge.`)}
            {mode === "delete" && "Click a node on the map to delete it immediately."}
          </p>

          <hr style={{ borderTop: "1px solid #ccc", margin: "0.5rem 0" }} />

          <div>
            <h4 style={{ margin: "0 0 0.5rem 0" }}>Active Connections ({activeConnectionList.length})</h4>
            <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {activeConnectionList.map(([from, to]) => (
                <div key={`${from}::${to}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", background: "#f5f5f5", padding: "0.25rem 0.5rem", borderRadius: "3px" }}>
                  <span>{from} ↔ {to}</span>
                  <button
                    onClick={() => removeConnection(from, to)}
                    style={{ color: "#c0392b", border: "none", background: "none", cursor: "pointer", fontWeight: "bold" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}