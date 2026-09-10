import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import type { ActionFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import routePointsData from "../data/route-points.json";
import buildingData from "../data/wpi-buildings.json";

type GraphNode = {
  id: string;
  latitude: number;
  longitude: number;
};

type ConnectionDetail = {
  to: string;
  accessible?: boolean;
};

type Connections = Record<string, (string | ConnectionDetail)[]>;

type Entrance = {
  latitude: number;
  longitude: number;
  floor: number;
  accessibility: boolean;
  name: string;
};

type Building = {
  name: string;
  entrances: Entrance[];
};

export type EditorMapProps = {
  nodes: GraphNode[];
  connections: Connections;
  buildings: Building[];
  mode: "add" | "connect" | "disconnect" | "delete" | "accessibility" | "add-entrance";
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

  if (data.nodes) {
    data.nodes = data.nodes.map((node: any) => ({
      ...node,
      latitude: typeof node.latitude === "number" ? Number(node.latitude.toFixed(6)) : node.latitude,
      longitude: typeof node.longitude === "number" ? Number(node.longitude.toFixed(6)) : node.longitude,
    }));
  }

  const rootKeys = Object.keys(data).filter((k) => k !== "buildings");
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
      const subEntries = Object.entries(val).map(([subK, subV]) => {
        const formattedVal = JSON.stringify(subV, null, 2).replace(/\n/g, "\n    ");
        return `    ${JSON.stringify(subK)}: ${formattedVal}`;
      });
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

  if (data.nodes || data.connections) {
    const filePath = path.join(process.cwd(), "app", "data", "route-points.json");
    await fs.writeFile(filePath, jsonString, "utf-8");
  }

  if (data.buildings) {
    const buildingsPath = path.join(process.cwd(), "app", "data", "wpi-buildings.json");
    await fs.writeFile(buildingsPath, JSON.stringify(data.buildings, null, 2), "utf-8");
  }

  return { success: true };
}

export default function Editor() {
  const fetcher = useFetcher();
  const [EditorMap, setEditorMap] = useState<ComponentType<EditorMapProps> | null>(null);
  const [error, setError] = useState("");

  const [nodes, setNodes] = useState<GraphNode[]>(routePointsData.nodes);
  const [connections, setConnections] = useState<Connections>(routePointsData.connections as Connections);
  const [buildings, setBuildings] = useState<Building[]>(buildingData as Building[]);

  const [mode, setMode] = useState<"add" | "connect" | "disconnect" | "delete" | "accessibility" | "add-entrance">("add");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [selectedBuilding, setSelectedBuilding] = useState<string>(buildingData[0]?.name || "");
  const [entranceName, setEntranceName] = useState("");
  const [entranceFloor, setEntranceFloor] = useState<number>(1);
  const [entranceAccessible, setEntranceAccessible] = useState<boolean>(true);

  const handleUpdateEntranceField = (field: string, value: any) => {
    if (!selectedNodeId || !selectedNodeId.includes("-entrance-")) return;
    const parts = selectedNodeId.split("-entrance-");
    const buildingSlug = parts[0];
    const entranceIndex = Number(parts[1]);

    const nextBuildings = buildings.map((b) => {
      const sanitizedName = b.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      if (sanitizedName === buildingSlug) {
        const updatedEntrances = [...b.entrances];
        updatedEntrances[entranceIndex] = {
          ...updatedEntrances[entranceIndex],
          [field]: value,
        };
        return { ...b, entrances: updatedEntrances };
      }
      return b;
    });

    setBuildings(nextBuildings);
    saveToDisk(nodes, connections, nextBuildings);
  };

  const saveToDisk = (updatedNodes: GraphNode[], updatedConns: Connections, updatedBuildings?: Building[]) => {
    fetcher.submit(
      { nodes: updatedNodes, connections: updatedConns, buildings: updatedBuildings || buildings },
      { method: "POST", encType: "application/json" }
    );
  };

  const handleNodeDragEnd = (id: string, latitude: number, longitude: number) => {
    if (id.includes("-entrance-")) {
      const parts = id.split("-entrance-");
      const buildingName = parts[0].replace(/-/g, " ");
      const entranceIndex = Number(parts[1]);

      const nextBuildings = buildings.map((b) => {
        if (b.name.toLowerCase().replace(/[^a-z0-9]/g, "") === buildingName.toLowerCase().replace(/[^a-z0-9]/g, "")) {
          const updatedEntrances = [...b.entrances];
          if (updatedEntrances[entranceIndex]) {
            updatedEntrances[entranceIndex] = {
              ...updatedEntrances[entranceIndex],
              latitude: Number(latitude.toFixed(6)),
              longitude: Number(longitude.toFixed(6)),
            };
          }
          return { ...b, entrances: updatedEntrances };
        }
        return b;
      });

      setBuildings(nextBuildings);
      saveToDisk(nodes, connections, nextBuildings);
      return;
    }

    const nextNodes = nodes.map((node) =>
      node.id === id
        ? {
            ...node,
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6)),
          }
        : node
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

  const handleMapClick = (latitude: number, longitude: number) => {
    if (mode === "add-entrance") {
      if (!selectedBuilding) return;
      const roundedLat = Number(latitude.toFixed(6));
      const roundedLng = Number(longitude.toFixed(6));

      const nextBuildings = buildings.map((b) => {
        if (b.name === selectedBuilding) {
          return {
            ...b,
            entrances: [
              ...b.entrances,
              {
                latitude: roundedLat,
                longitude: roundedLng,
                name: entranceName || "Main Entrance",
                floor: Number(entranceFloor),
                accessibility: entranceAccessible,
              },
            ],
          };
        }
        return b;
      });

      setBuildings(nextBuildings);
      saveToDisk(nodes, connections, nextBuildings);
      setEntranceName("");
      return;
    }

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
      nextConnections[fromId] = nextConnections[fromId].filter((item) => {
        const target = typeof item === "string" ? item : item?.to;
        return target && target !== toId;
      });
    }
    if (nextConnections[toId]) {
      nextConnections[toId] = nextConnections[toId].filter((item) => {
        const target = typeof item === "string" ? item : item?.to;
        return target && target !== fromId;
      });
    }
    setConnections(nextConnections);
    saveToDisk(nodes, nextConnections);
  };

  const toggleAccessibility = (fromId: string, toId: string) => {
    const nextConnections = { ...connections };

    const updateListForPair = (fId: string, tId: string) => {
      const list = nextConnections[fId] || [];
      const index = list.findIndex((item) => {
        const target = typeof item === "string" ? item : item?.to;
        return target === tId;
      });

      if (index !== -1) {
        const current = list[index];
        const isCurrentlyAccessible = typeof current === "string" || current.accessible !== false;
        if (isCurrentlyAccessible) {
          list[index] = { to: tId, accessible: false };
        } else {
          list[index] = tId;
        }
      } else {
        list.push({ to: tId, accessible: false });
      }
      nextConnections[fId] = list;
    };

    updateListForPair(fromId, toId);
    updateListForPair(toId, fromId);

    setConnections(nextConnections);
    saveToDisk(nodes, nextConnections);
  };

  const handleNodeClick = (nodeId: string) => {
    if (selectedNodeId === nodeId && (mode === "add" || mode === "add-entrance")) {
      setSelectedNodeId(null);
      return;
    }

    if (mode === "add" || mode === "add-entrance") {
      setSelectedNodeId(nodeId);
      return;
    }

    if (mode === "delete") {
      if (nodeId.includes("-entrance-")) {
        const parts = nodeId.split("-entrance-");
        const targetBuildingName = parts[0].replace(/-/g, " ");
        const entranceIndex = Number(parts[1]);

        const nextBuildings = buildings.map((b) => {
          if (b.name.toLowerCase().replace(/[^a-z0-9]/g, "") === targetBuildingName.toLowerCase().replace(/[^a-z0-9]/g, "")) {
            return {
              ...b,
              entrances: b.entrances.filter((_, idx) => idx !== entranceIndex),
            };
          }
          return b;
        });

        const nextConnections = { ...connections };
        delete nextConnections[nodeId];
        Object.keys(nextConnections).forEach((key) => {
          nextConnections[key] = nextConnections[key].filter((item) => {
            const target = typeof item === "string" ? item : item?.to;
            return target && target !== nodeId;
          });
        });

        setBuildings(nextBuildings);
        setConnections(nextConnections);
        saveToDisk(nodes, nextConnections, nextBuildings);
        return;
      }

      const nextNodes = nodes.filter((n) => n.id !== nodeId);
      const nextConnections = { ...connections };
      delete nextConnections[nodeId];
      Object.keys(nextConnections).forEach((key) => {
        nextConnections[key] = nextConnections[key].filter((item) => {
          const target = typeof item === "string" ? item : item?.to;
          return target && target !== nodeId;
        });
      });

      setNodes(nextNodes);
      setConnections(nextConnections);
      saveToDisk(nextNodes, nextConnections);
      return;
    }

    if (nodeId.includes("-entrance-")) {
      setSelectedNodeId(nodeId);
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

      const existsA = listA.some((item) => {
        const target = typeof item === "string" ? item : item?.to;
        return target === nodeId;
      });

      if (!existsA) {
        nextConnections[selectedNodeId] = [...listA, nodeId];
        setConnections(nextConnections);
        saveToDisk(nodes, nextConnections);
      }

      setSelectedNodeId(null);
      return;
    }

    if (mode === "disconnect" || mode === "accessibility") {
      if (!selectedNodeId) {
        setSelectedNodeId(nodeId);
        return;
      }

      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
        return;
      }

      const listA = connections[selectedNodeId] || [];
      const exists = listA.some((item) => {
        const target = typeof item === "string" ? item : item?.to;
        return target === nodeId;
      });

      if (exists) {
        if (mode === "disconnect") {
          removeConnection(selectedNodeId, nodeId);
        } else if (mode === "accessibility") {
          toggleAccessibility(selectedNodeId, nodeId);
        }
      }

      setSelectedNodeId(null);
      return;
    }
  };

  const handleConnectionClick = (fromId: string, toId: string) => {
    if (mode === "disconnect") {
      removeConnection(fromId, toId);
    } else if (mode === "accessibility") {
      toggleAccessibility(fromId, toId);
    }
  };

  const activeConnectionList: { from: string; to: string; accessible: boolean }[] = [];
  const seen = new Set<string>();

  Object.entries(connections).forEach(([from, toArray]) => {
    if (!Array.isArray(toArray)) return;
    toArray.forEach((item) => {
      const to = typeof item === "string" ? item : item?.to;
      if (!to) return;
      const accessible = typeof item === "string" ? true : item.accessible !== false;
      const key = [from, to].sort().join("::");
      if (!seen.has(key)) {
        seen.add(key);
        activeConnectionList.push({ from, to, accessible });
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
            buildings={buildings}
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
          </div>

          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <button
              style={{ fontWeight: mode === "add" ? "bold" : "normal" }}
              onClick={() => { setMode("add"); setSelectedNodeId(null); }}
            >
              Add Node
            </button>
            <button
              style={{ fontWeight: mode === "add-entrance" ? "bold" : "normal", color: "#2980b9" }}
              onClick={() => { setMode("add-entrance"); setSelectedNodeId(null); }}
            >
              Add Entrance
            </button>
            <button
              style={{ fontWeight: mode === "connect" ? "bold" : "normal" }}
              onClick={() => { setMode("connect"); setSelectedNodeId(null); }}
            >
              Connect
            </button>
            <button
              style={{ fontWeight: mode === "accessibility" ? "bold" : "normal", color: "#8e44ad" }}
              onClick={() => { setMode("accessibility"); setSelectedNodeId(null); }}
            >
              Accessibility
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
              Delete
            </button>
          </div>

          {mode === "add-entrance" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", background: "#f9f9f9", padding: "0.75rem", borderRadius: "4px", border: "1px solid #ddd" }}>
              <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "0.9rem" }}>Building Entrance Details</h4>
              <label style={{ fontSize: "0.8rem" }}>
                Building:
                <select 
                  value={selectedBuilding} 
                  onChange={(e) => setSelectedBuilding(e.target.value)}
                  style={{ width: "100%", marginTop: "2px", padding: "4px" }}
                >
                  {buildings.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: "0.8rem" }}>
                Entrance Name:
                <input 
                  type="text" 
                  value={entranceName} 
                  onChange={(e) => setEntranceName(e.target.value)} 
                  placeholder="e.g. Quad Entrance"
                  style={{ width: "100%", marginTop: "2px", padding: "4px" }}
                />
              </label>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.8rem", flex: 1 }}>
                  Floor:
                  <input 
                    type="number" 
                    step="0.5"
                    value={entranceFloor} 
                    onChange={(e) => setEntranceFloor(Number(e.target.value))} 
                    style={{ width: "100%", marginTop: "2px", padding: "4px" }}
                  />
                </label>

                <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "1rem" }}>
                  <input 
                    type="checkbox" 
                    checked={entranceAccessible} 
                    onChange={(e) => setEntranceAccessible(e.target.checked)} 
                  />
                  Accessible
                </label>
              </div>
              <span style={{ fontSize: "0.75rem", color: "#2980b9", fontWeight: "bold" }}>Click map to place entrance in {selectedBuilding}.</span>
            </div>
          )}

          {selectedNodeId && !selectedNodeId.includes("-entrance-") && (() => {
            const node = nodes.find((n) => n.id === selectedNodeId);
            if (!node) return null;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", background: "#e8f8f5", padding: "0.75rem", borderRadius: "4px", border: "1px solid #1abc9c" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ margin: "0", fontSize: "0.9rem", color: "#16a085" }}>Edit Node Properties</h4>
                  <button 
                    onClick={() => setSelectedNodeId(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold" }}
                  >
                    ✕
                  </button>
                </div>
                <span style={{ fontSize: "0.75rem", color: "#666" }}>Node ID: {node.id}</span>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <label style={{ fontSize: "0.8rem", flex: 1 }}>
                    Latitude:
                    <input 
                      type="number" 
                      step="0.000001"
                      value={node.latitude} 
                      onChange={(e) => {
                        const lat = Number(e.target.value);
                        const nextNodes = nodes.map((n) => n.id === node.id ? { ...n, latitude: lat } : n);
                        setNodes(nextNodes);
                        saveToDisk(nextNodes, connections);
                      }} 
                      style={{ width: "100%", marginTop: "2px", padding: "4px" }}
                    />
                  </label>

                  <label style={{ fontSize: "0.8rem", flex: 1 }}>
                    Longitude:
                    <input 
                      type="number" 
                      step="0.000001"
                      value={node.longitude} 
                      onChange={(e) => {
                        const lng = Number(e.target.value);
                        const nextNodes = nodes.map((n) => n.id === node.id ? { ...n, longitude: lng } : n);
                        setNodes(nextNodes);
                        saveToDisk(nextNodes, connections);
                      }} 
                      style={{ width: "100%", marginTop: "2px", padding: "4px" }}
                    />
                  </label>
                </div>
              </div>
            );
          })()}
          {selectedNodeId && selectedNodeId.includes("-entrance-") && (() => {
            const parts = selectedNodeId.split("-entrance-");
            const buildingSlug = parts[0];
            const entranceIndex = Number(parts[1]);
            const building = buildings.find(
              (b) => b.name.toLowerCase().replace(/[^a-z0-9]/g, "-") === buildingSlug
            );
            const entrance = building?.entrances[entranceIndex];

            if (!entrance) return null;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", background: "#fef9e7", padding: "0.75rem", borderRadius: "4px", border: "1px solid #f1c40f" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ margin: "0", fontSize: "0.9rem", color: "#b7950b" }}>Edit Entrance Properties</h4>
                  <button 
                    onClick={() => setSelectedNodeId(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold" }}
                  >
                    ✕
                  </button>
                </div>
                <span style={{ fontSize: "0.75rem", color: "#666" }}>Building: {building.name}</span>

                <label style={{ fontSize: "0.8rem" }}>
                  Name:
                  <input 
                    type="text" 
                    value={entrance.name} 
                    onChange={(e) => handleUpdateEntranceField("name", e.target.value)} 
                    style={{ width: "100%", marginTop: "2px", padding: "4px" }}
                  />
                </label>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <label style={{ fontSize: "0.8rem", flex: 1 }}>
                    Floor:
                    <input 
                      type="number" 
                      step="0.5"
                      value={entrance.floor} 
                      onChange={(e) => handleUpdateEntranceField("floor", Number(e.target.value))} 
                      style={{ width: "100%", marginTop: "2px", padding: "4px" }}
                    />
                  </label>

                  <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "1rem" }}>
                    <input 
                      type="checkbox" 
                      checked={entrance.accessibility ?? true} 
                      onChange={(e) => handleUpdateEntranceField("accessibility", e.target.checked)} 
                    />
                    Accessible
                  </label>
                </div>
              </div>
            );
          })()}

          <p style={{ fontSize: "0.85rem", color: "#555", margin: 0 }}>
            {mode === "add" && "Click the map to create a walkway node instantly."}
            {mode === "add-entrance" && "Fill out metadata above and click the map location to add the building entrance."}
            {mode === "connect" && (!selectedNodeId ? "Click the first node to select it." : `Selected "${selectedNodeId}". Click second node to connect.`)}
            {mode === "accessibility" && (!selectedNodeId ? "Click first node of a connection." : `Selected "${selectedNodeId}". Click target node or line to toggle accessibility.`)}
            {mode === "disconnect" && (!selectedNodeId ? "Click two connected nodes or click line directly." : `Selected "${selectedNodeId}". Click connected node to remove.`)}
            {mode === "delete" && "Click a node on the map to delete it immediately."}
          </p>

          <hr style={{ borderTop: "1px solid #ccc", margin: "0.2rem 0" }} />

          <div>
            <h4 style={{ margin: "0 0 0.5rem 0" }}>Active Connections ({activeConnectionList.length})</h4>
            <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {activeConnectionList.map(({ from, to, accessible }) => (
                <div key={`${from}::${to}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", background: "#f5f5f5", padding: "0.25rem 0.5rem", borderRadius: "3px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    {from} ↔ {to}
                    {!accessible && <span style={{ color: "#c0392b", fontSize: "0.7rem", fontWeight: "bold", background: "#fadbd8", padding: "1px 4px", borderRadius: "3px" }}>Stairs</span>}
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={() => toggleAccessibility(from, to)}
                      style={{ color: accessible ? "#8e44ad" : "#27ae60", border: "none", background: "none", cursor: "pointer", fontSize: "0.75rem" }}
                    >
                      {accessible ? "Mark Stairs" : "Mark Accessible"}
                    </button>
                    <button
                      onClick={() => removeConnection(from, to)}
                      style={{ color: "#c0392b", border: "none", background: "none", cursor: "pointer", fontWeight: "bold" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}