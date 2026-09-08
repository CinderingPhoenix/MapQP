import React, { useMemo } from "react";
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
  mode,
  selectedNodeId,
  onMapClick,
  onNodeClick,
  onConnectionClick,
  onNodeDragEnd,
}: EditorMapProps) {
  const lines: { key: string; fromId: string; toId: string; positions: [[number, number], [number, number]] }[] = [];
  const seenEdges = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const isLineClickable = mode === "disconnect" || mode === "delete";

  Object.entries(connections).forEach(([fromId, toIds]) => {
    const fromNode = nodeMap.get(fromId);
    if (!fromNode) return;

    toIds.forEach((toId) => {
      const toNode = nodeMap.get(toId);
      if (!toNode) return;

      const edgeKey = [fromId, toId].sort().join("::");
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        lines.push({
          key: edgeKey,
          fromId,
          toId,
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

      {lines.map((line) => (
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
            pathOptions={{ color: "#d46b3f", weight: 4, opacity: 0.8 }}
            eventHandlers={{
              click: (e: { originalEvent: { stopPropagation: () => void; }; }) => {
                if (isLineClickable) {
                  e.originalEvent.stopPropagation();
                  onConnectionClick(line.fromId, line.toId);
                }
              },
            }}
          />
        </React.Fragment>
      ))}

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