import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import routePointsData from "../src/data/route-points.json";
import buildingData from "../src/data/wpi-buildings.json";
import ImageMap, { type ImageMapNetwork } from "./image-map";

type GraphNode = {
  id: string;
  latitude: number;
  longitude: number;
};

type ConnectionDetail = {
  to: string;
  accessible?: boolean;
  internal?: boolean;
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

type ImageMapInfo = { path: string; name: string; networkPath: string };
type MapEndpoint = { map: string; nodeId: string };
type MapLink = { from: MapEndpoint; to: MapEndpoint };

export type EditorMapProps = {
  nodes: GraphNode[];
  connections: Connections;
  buildings: Building[];
  mode: "add" | "connect" | "disconnect" | "delete" | "accessibility" | "internal" | "add-entrance" | "link";
  selectedNodeId: string | null;
  onMapClick: (lat: number, lng: number) => void;
  onNodeClick: (id: string) => void;
  onConnectionClick: (fromId: string, toId: string) => void;
  onNodeDragEnd: (id: string, lat: number, lng: number) => void;
};

export default function Editor() {
  const [EditorMap, setEditorMap] = useState<ComponentType<EditorMapProps> | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [nodes, setNodes] = useState<GraphNode[]>(routePointsData.nodes);
  const [connections, setConnections] = useState<Connections>(routePointsData.connections as Connections);
  const [buildings, setBuildings] = useState<Building[]>(buildingData as Building[]);

  const [mode, setMode] = useState<"add" | "connect" | "disconnect" | "delete" | "accessibility" | "internal" | "add-entrance" | "link">("add");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [selectedBuilding, setSelectedBuilding] = useState<string>(buildingData[0]?.name || "");
  const [entranceName, setEntranceName] = useState("");
  const [entranceFloor, setEntranceFloor] = useState<number>(1);
  const [entranceAccessible, setEntranceAccessible] = useState<boolean>(true);
  const [imageMaps, setImageMaps] = useState<ImageMapInfo[]>([]);
  const [selectedImageMap, setSelectedImageMap] = useState<ImageMapInfo | null>(null);
  const [imageNetwork, setImageNetwork] = useState<ImageMapNetwork>({ nodes: [], connections: {} });
  const [imageMode, setImageMode] = useState<"add" | "connect" | "accessibility" | "disconnect" | "delete" | "link">("add");
  const [imageSelectedNodeId, setImageSelectedNodeId] = useState<string | null>(null);
  const [mapLinks, setMapLinks] = useState<MapLink[]>([]);
  const [linkTargetMap, setLinkTargetMap] = useState("campus");
  const [pendingLinkSource, setPendingLinkSource] = useState<MapEndpoint | null>(null);

  const currentMapKey = selectedImageMap?.networkPath ?? "campus";
  const saveMapLinks = (links: MapLink[]) => {
    setMapLinks(links);
    fetch("/api/map-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links }),
    }).catch((err) => {
      console.error("Failed to save map links:", err);
      setError("Map links could not be saved.");
    });
  };

  const addMapLink = (source: MapEndpoint, target: MapEndpoint) => {
    if (source.map === target.map && source.nodeId === target.nodeId) return;
    const exists = mapLinks.some((link) =>
      (link.from.map === source.map && link.from.nodeId === source.nodeId && link.to.map === target.map && link.to.nodeId === target.nodeId)
      || (link.to.map === source.map && link.to.nodeId === source.nodeId && link.from.map === target.map && link.from.nodeId === target.nodeId));
    if (!exists) saveMapLinks([...mapLinks, { from: source, to: target }]);
    setPendingLinkSource(null);
    setSelectedNodeId(null);
    setImageSelectedNodeId(null);
  };

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
    setIsSaving(true);
    fetch("/api/editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: updatedNodes, connections: updatedConns, buildings: updatedBuildings || buildings }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Save failed with status ${response.status}`);
      })
      .catch((err) => {
        console.error(err);
        setError("The latest changes could not be saved.");
      })
      .finally(() => setIsSaving(false));
  };

  useEffect(() => {
    fetch("/api/maps")
      .then((response) => response.json() as Promise<ImageMapInfo[]>)
      .then(setImageMaps)
      .catch((err) => {
        console.error("Failed to load floor maps:", err);
        setError("Floor maps could not be loaded.");
      });
  }, []);

  useEffect(() => {
    fetch("/api/map-links")
      .then((response) => response.json() as Promise<MapLink[]>)
      .then(setMapLinks)
      .catch((err) => {
        console.error("Failed to load map links:", err);
        setError("Map links could not be loaded.");
      });
  }, []);

  useEffect(() => {
    if (!selectedImageMap) return;
    fetch(`/api/map-network?path=${encodeURIComponent(selectedImageMap.networkPath)}`)
      .then((response) => response.ok ? response.json() : { nodes: [], connections: {} })
      .then((network) => setImageNetwork(network as ImageMapNetwork))
      .catch((err) => {
        console.error("Failed to load floor map network:", err);
        setImageNetwork({ nodes: [], connections: {} });
      });
    setImageSelectedNodeId(null);
  }, [selectedImageMap]);

  const saveImageNetwork = (network: ImageMapNetwork) => {
    setImageNetwork(network);
    setIsSaving(true);
    fetch(`/api/map-network?path=${encodeURIComponent(selectedImageMap?.networkPath ?? "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Map save failed with status ${response.status}`);
      })
      .catch((err) => {
        console.error(err);
        setError("The floor map network could not be saved.");
      })
      .finally(() => setIsSaving(false));
  };

  const imageTarget = (item: string | { to: string }) => typeof item === "string" ? item : item.to;
  const updateImageConnection = (fromId: string, toId: string) => {
    const connections = { ...imageNetwork.connections };
    const add = (from: string, to: string) => {
      const list = [...(connections[from] ?? [])];
      const index = list.findIndex((item) => imageTarget(item) === to);
      if (index === -1) list.push(to);
      connections[from] = list;
    };
    add(fromId, toId);
    add(toId, fromId);
    saveImageNetwork({ ...imageNetwork, connections });
  };

  const toggleImageAccessibility = (fromId: string, toId: string) => {
    const connections = { ...imageNetwork.connections };
    [fromId, toId].forEach((from, index) => {
      const target = index === 0 ? toId : fromId;
      const list = [...(connections[from] ?? [])];
      const itemIndex = list.findIndex((item) => imageTarget(item) === target);
      if (itemIndex === -1) return;
      const item = list[itemIndex];
      const details = typeof item === "string" ? { to: item } : { to: item.to, ...(item.accessible === false ? { accessible: false } : {}) };
      list[itemIndex] = details.accessible === false ? target : { ...details, accessible: false };
      connections[from] = list;
    });
    saveImageNetwork({ ...imageNetwork, connections });
  };

  const removeImageConnection = (fromId: string, toId: string) => {
    const connections = { ...imageNetwork.connections };
    [fromId, toId].forEach((from, index) => {
      const target = index === 0 ? toId : fromId;
      connections[from] = (connections[from] ?? []).filter((item) => imageTarget(item) !== target);
    });
    saveImageNetwork({ ...imageNetwork, connections });
    setImageSelectedNodeId(null);
  };

  const handleImageNodeClick = (id: string) => {
    if (imageMode === "link") {
      if (pendingLinkSource && pendingLinkSource.map !== currentMapKey) {
        addMapLink(pendingLinkSource, { map: currentMapKey, nodeId: id });
        return;
      }
      setPendingLinkSource({ map: currentMapKey, nodeId: id });
      setImageSelectedNodeId(id);
      return;
    }
    if (imageMode === "delete") {
      const connections = Object.fromEntries(Object.entries(imageNetwork.connections)
        .filter(([key]) => key !== id)
        .map(([key, items]) => [key, items.filter((item) => imageTarget(item) !== id)]));
      saveImageNetwork({ nodes: imageNetwork.nodes.filter((node) => node.id !== id), connections });
      setImageSelectedNodeId(null);
      return;
    }
    if (imageMode === "add") {
      setImageSelectedNodeId(imageSelectedNodeId === id ? null : id);
      return;
    }
    if (!imageSelectedNodeId) {
      setImageSelectedNodeId(id);
    } else if (imageSelectedNodeId === id) {
      setImageSelectedNodeId(null);
    } else if (imageMode === "connect") {
      updateImageConnection(imageSelectedNodeId, id);
      setImageSelectedNodeId(null);
    } else if (imageMode === "accessibility") {
      const list = imageNetwork.connections[imageSelectedNodeId] ?? [];
      if (list.some((item) => imageTarget(item) === id)) toggleImageAccessibility(imageSelectedNodeId, id);
      setImageSelectedNodeId(null);
    } else if (imageMode === "disconnect") {
      const connections = { ...imageNetwork.connections };
      [imageSelectedNodeId, id].forEach((from, index) => {
        const to = index === 0 ? id : imageSelectedNodeId;
        connections[from] = (connections[from] ?? []).filter((item) => imageTarget(item) !== to);
      });
      saveImageNetwork({ ...imageNetwork, connections });
      setImageSelectedNodeId(null);
    }
  };

  const handleImageMapClick = (x: number, y: number) => {
    if (imageMode !== "add") return;
    const id = `image_node_${Math.random().toString(36).slice(2, 9)}`;
    saveImageNetwork({ ...imageNetwork, nodes: [...imageNetwork.nodes, { id, x, y }] });
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
        const details = typeof current === "string" ? { to: current } : { ...current };
        list[index] = isCurrentlyAccessible
          ? { ...details, accessible: false }
          : { to: tId, ...(details.internal ? { internal: true } : {}) };
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

  const toggleInternal = (fromId: string, toId: string) => {
    const nextConnections = { ...connections };
    const updateListForPair = (fId: string, tId: string) => {
      const list = [...(nextConnections[fId] || [])];
      const index = list.findIndex((item) => (typeof item === "string" ? item : item.to) === tId);
      if (index === -1) return;
      const current = list[index];
      const details = typeof current === "string" ? { to: current } : { ...current };
      if (details.internal) {
        delete details.internal;
        list[index] = details.accessible === undefined ? tId : details;
      } else {
        list[index] = { ...details, internal: true };
      }
      nextConnections[fId] = list;
    };
    updateListForPair(fromId, toId);
    updateListForPair(toId, fromId);
    setConnections(nextConnections);
    saveToDisk(nodes, nextConnections);
  };

  const handleNodeClick = (nodeId: string) => {
    if (mode === "link") {
      if (pendingLinkSource && pendingLinkSource.map !== currentMapKey) {
        addMapLink(pendingLinkSource, { map: currentMapKey, nodeId });
        return;
      }
      setPendingLinkSource({ map: currentMapKey, nodeId });
      setSelectedNodeId(nodeId);
      return;
    }
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

    if (mode === "disconnect" || mode === "accessibility" || mode === "internal") {
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
        } else {
          toggleInternal(selectedNodeId, nodeId);
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
    } else if (mode === "internal") {
      toggleInternal(fromId, toId);
    }
  };

  const activeConnectionList: { from: string; to: string; accessible: boolean; internal: boolean }[] = [];
  const seen = new Set<string>();

  Object.entries(connections).forEach(([from, toArray]) => {
    if (!Array.isArray(toArray)) return;
    toArray.forEach((item) => {
      const to = typeof item === "string" ? item : item?.to;
      if (!to) return;
      const accessible = typeof item === "string" ? true : item.accessible !== false;
      const internal = typeof item !== "string" && item.internal === true;
      const key = [from, to].sort().join("::");
      if (!seen.has(key)) {
        seen.add(key);
        activeConnectionList.push({ from, to, accessible, internal });
      }
    });
  });

  return (
    <main className="map-app">
      <div className="map-canvas" aria-label="Map view">
        {selectedImageMap ? (
          <ImageMap
            imageUrl={`/maps/${selectedImageMap.path}`}
            network={imageNetwork}
            mode={imageMode}
            selectedNodeId={imageSelectedNodeId}
            onMapClick={handleImageMapClick}
            onNodeClick={handleImageNodeClick}
            onConnectionClick={(from, to) => {
              if (imageMode === "disconnect") removeImageConnection(from, to);
              else if (imageMode === "accessibility") toggleImageAccessibility(from, to);
            }}
            onNodeDragEnd={(id, x, y) => saveImageNetwork({ ...imageNetwork, nodes: imageNetwork.nodes.map((node) => node.id === id ? { ...node, x, y } : node) })}
          />
        ) : (
        EditorMap ? (
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
        )
        )}
      </div>
      <section className="planner-panel map-controls" aria-label="Editor controls">
        <div style={{ marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1px solid #ddd" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "0.4rem" }}>Map layer</label>
          <select
            value={selectedImageMap?.path ?? ""}
            onChange={(event) => {
              const next = imageMaps.find((map) => map.path === event.target.value) ?? null;
              setSelectedImageMap(next);
              setLinkTargetMap("campus");
              if (pendingLinkSource) {
                if (next) setImageMode("link");
                else setMode("link");
              }
            }}
            style={{ width: "100%", padding: "0.4rem" }}
          >
            <option value="">Campus route map</option>
            {imageMaps.map((map) => <option key={map.path} value={map.path}>{map.name}</option>)}
          </select>
        </div>
        {selectedImageMap && (
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {(["add", "connect", "accessibility", "disconnect", "delete", "link"] as const).map((nextMode) => (
              <button key={nextMode} onClick={() => { setImageMode(nextMode); setImageSelectedNodeId(null); if (nextMode === "link") setPendingLinkSource(null); }} style={{ fontWeight: imageMode === nextMode ? "bold" : "normal" }}>
                {nextMode[0].toUpperCase() + nextMode.slice(1)}
              </button>
            ))}
            <p style={{ width: "100%", fontSize: "0.85rem", color: "#555", margin: 0 }}>
              {imageMode === "add" ? "Click the image to add a node." : imageMode === "link" ? (pendingLinkSource ? "Choose a node on this map to finish the link." : "Select a node to link to another map.") : imageSelectedNodeId ? `Selected "${imageSelectedNodeId}". Choose another node.` : "Select two nodes to edit their connection."}
            </p>
          </div>
        )}
        {pendingLinkSource && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.75rem", background: "#eef6ff", border: "1px solid #8ab4f8", borderRadius: "4px", marginBottom: "1rem" }}>
            <strong>Link selected node</strong>
            <span style={{ fontSize: "0.8rem" }}>Source selected. Choose the destination map, then click its node.</span>
            <select value={linkTargetMap} onChange={(event) => {
              const targetMap = event.target.value;
              setLinkTargetMap(targetMap);
              const next = imageMaps.find((map) => map.networkPath === targetMap) ?? null;
              setSelectedImageMap(next);
              if (next) setImageMode("link");
              else setMode("link");
            }}>
              <option value="campus">Campus route map</option>
              {imageMaps.filter((map) => map.networkPath !== selectedImageMap?.networkPath).map((map) => (
                <option key={map.networkPath} value={map.networkPath}>{map.name}</option>
              ))}
            </select>
            <button onClick={() => { setPendingLinkSource(null); setSelectedNodeId(null); setImageSelectedNodeId(null); }}>Cancel link</button>
          </div>
        )}
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
              style={{ fontWeight: mode === "internal" ? "bold" : "normal", color: "#2980b9" }}
              onClick={() => { setMode("internal"); setSelectedNodeId(null); }}
            >
              Internal
            </button>
            <button
              style={{ fontWeight: mode === "link" ? "bold" : "normal", color: "#16a085" }}
              onClick={() => { setMode("link"); setSelectedNodeId(null); setPendingLinkSource(null); }}
            >
              Link map node
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
              {activeConnectionList.map(({ from, to, accessible, internal }) => (
                <div key={`${from}::${to}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", background: "#f5f5f5", padding: "0.25rem 0.5rem", borderRadius: "3px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    {from} ↔ {to}
                    {internal && <span style={{ color: "#2980b9", fontSize: "0.7rem", fontWeight: "bold", background: "#dbeafe", padding: "1px 4px", borderRadius: "3px" }}>Inside</span>}
                    {!accessible && <span style={{ color: "#c0392b", fontSize: "0.7rem", fontWeight: "bold", background: "#fadbd8", padding: "1px 4px", borderRadius: "3px" }}>Stairs</span>}
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={() => toggleInternal(from, to)}
                      style={{ color: internal ? "#6b7280" : "#2980b9", border: "none", background: "none", cursor: "pointer", fontSize: "0.75rem" }}
                    >
                      {internal ? "Remove internal" : "Mark internal"}
                    </button>
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