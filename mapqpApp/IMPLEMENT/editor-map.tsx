import React from "react";
import { divIcon } from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import type { EditorMapProps } from "./editor";

const CAMPUS_CENTER: [number, number] = [42.2744, -71.8075];

export default function EditorMap({
  nodes,
  connections,
  buildings,
  mode,
  selectedNodeId,
  onMapClick,
  onNodeClick,
  onConnectionClick,
  onNodeDragEnd,
}: EditorMapProps) {
  const lines: { key: string; fromId: string; toId: string; accessible: boolean; positions: [[number, number], [number, number]] }[] = [];
  const seenEdges = new Set<string>();

  const allNodes: { id: string; latitude: number; longitude: number }[] = [...nodes];
  
  if (buildings) {
    buildings.forEach((building) => {
      building.entrances.forEach((entrance, index) => {
        const entranceId = `${building.name}-entrance-${index}`;
        allNodes.push({
          id: entranceId,
          latitude: entrance.latitude,
          longitude: entrance.longitude,
        });
      });
    });
  }

  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  const isLineClickable = mode === "disconnect" || mode === "delete" || mode === "accessibility";

  Object.entries(connections).forEach(([fromId, toIds]) => {
    const fromNode = nodeMap.get(fromId);
    if (!fromNode) return;

    toIds.forEach((item) => {
      const toId = typeof item === "string" ? item : item.to;
      const accessible = typeof item === "string" ? true : item.accessible !== false;
      const toNode = nodeMap.get(toId);
      if (!toNode) return;

      const edgeKey = [fromId, toId].sort().join("::");
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        lines.push({
          key: edgeKey,
          fromId,
          toId,
          accessible,
          positions: [
            [fromNode.latitude, fromNode.longitude],
            [toNode.latitude, toNode.longitude],
          ],
        });
      }
    });
  });

  return (
    <MapContainer
      center={CAMPUS_CENTER}
      zoom={16}
      maxZoom={22}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={22}
        maxNativeZoom={19}
      />

      <MapEventCatcher onMapClick={onMapClick} />

      {lines.map((line) => {
        const lineColor = line.accessible ? "#d46b3f" : "#8e44ad";

        return (
          <React.Fragment key={line.key}>
            {isLineClickable && (
              <Polyline
                positions={line.positions}
                interactive={true}
                pathOptions={{ color: "transparent", weight: 20 }}
                eventHandlers={{
                  click: (e: { originalEvent: { stopPropagation: () => void; }; }) => {
                    e.originalEvent.stopPropagation();
                    onConnectionClick(line.fromId, line.toId);
                  },
                }}
              />
            )}
            
            <Polyline
              positions={line.positions}
              interactive={isLineClickable}
              pathOptions={{
                color: lineColor,
                weight: 4,
                opacity: 0.8,
                dashArray: line.accessible ? undefined : "6, 6"
              }}
              eventHandlers={{
                click: (e: { originalEvent: { stopPropagation: () => void; }; }) => {
                  if (isLineClickable) {
                    e.originalEvent.stopPropagation();
                    onConnectionClick(line.fromId, line.toId);
                  }
                },
              }}
            >
              {!line.accessible && (
                <Tooltip permanent={false} direction="center">
                  Not Accessibility Friendly (Stairs/Steep)
                </Tooltip>
              )}
            </Polyline>
          </React.Fragment>
        );
      })}

      {nodes.map((node) => {
        const isSelected = node.id === selectedNodeId;

        const nodeIcon = divIcon({
          className: "",
          html: `<div style="
            width: ${isSelected ? 16 : 12}px;
            height: ${isSelected ? 16 : 12}px;
            background-color: ${isSelected ? "#e06b3c" : "#1d5962"};
            border: 2px solid ${isSelected ? "#e06b3c" : "#fffdf8"};
            border-radius: 50%;
            cursor: grab;
            transform: translate(-50%, -50%);
          "></div>`,
          iconSize: [0, 0],
        });

        return (
          <Marker
            key={node.id}
            position={[node.latitude, node.longitude]}
            icon={nodeIcon}
            draggable={true}
            eventHandlers={{
              click: (e: { originalEvent: { stopPropagation: () => void; }; }) => {
                e.originalEvent.stopPropagation();
                onNodeClick(node.id);
              },
              dragend: (e: { target: any; }) => {
                const marker = e.target;
                const position = marker.getLatLng();
                onNodeDragEnd(node.id, position.lat, position.lng);
              },
            }}
          >
            <Tooltip permanent={isSelected} direction="top">
              {node.id}
            </Tooltip>
          </Marker>
        );
      })}

      {buildings && buildings.flatMap((building) =>
        building.entrances.map((entrance, index) => {
          const entranceId = `${building.name}-entrance-${index}`;
          const isSelected = entranceId === selectedNodeId;

          const entranceIcon = divIcon({
            className: "",
            html: `<div style="
              width: ${isSelected ? 18 : 14}px;
              height: ${isSelected ? 18 : 14}px;
              background-color: ${isSelected ? "#e06b3c" : "#2980b9"};
              border: 2px format #fffdf8;
              border: 2px solid #fffdf8;
              border-radius: 4px;
              cursor: grab;
              transform: translate(-50%, -50%);
            " title="${building.name}: ${entrance.name}"></div>`,
            iconSize: [0, 0],
          });

          return (
            <Marker
              key={entranceId}
              position={[entrance.latitude, entrance.longitude]}
              icon={entranceIcon}
              draggable={true}
              eventHandlers={{
                click: (e: { originalEvent: { stopPropagation: () => void; }; }) => {
                  e.originalEvent.stopPropagation();
                  onNodeClick(entranceId);
                },
                dragend: (e: { target: any; }) => {
                  const marker = e.target;
                  const position = marker.getLatLng();
                  onNodeDragEnd(entranceId, position.lat, position.lng);
                },
              }}
            >
              <Tooltip permanent={isSelected} direction="top">
                {building.name} - {entrance.name} (Fl {entrance.floor})
              </Tooltip>
            </Marker>
          );
        })
      )}
    </MapContainer>
  );
}

function MapEventCatcher({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}