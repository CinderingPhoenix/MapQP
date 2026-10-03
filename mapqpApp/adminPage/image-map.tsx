import React, { useEffect, useState } from "react";
import {
  CircleMarker,
  ImageOverlay,
  Marker,
  MapContainer,
  Polyline,
  useMapEvents,
} from "react-leaflet";
import { CRS, divIcon, type LatLngBoundsExpression, type LatLngExpression } from "leaflet";

export type ImageMapNode = { id: string; x: number; y: number };
export type ImageMapConnection = string | { to: string; accessible?: boolean };
export type ImageMapNetwork = {
  nodes: ImageMapNode[];
  connections: Record<string, ImageMapConnection[]>;
};

type Props = {
  imageUrl: string;
  network: ImageMapNetwork;
  mode: "add" | "connect" | "accessibility" | "disconnect" | "delete" | "link";
  selectedNodeId: string | null;
  onMapClick: (x: number, y: number) => void;
  onNodeClick: (id: string) => void;
  onConnectionClick: (fromId: string, toId: string) => void;
  onNodeDragEnd: (id: string, x: number, y: number) => void;
};

function MapEvents({ onMapClick }: { onMapClick: Props["onMapClick"] }) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lng, event.latlng.lat);
    },
  });
  return null;
}

export default function ImageMap({
  imageUrl,
  network,
  mode,
  selectedNodeId,
  onMapClick,
  onNodeClick,
  onConnectionClick,
  onNodeDragEnd,
}: Props) {
  const [imageSize, setImageSize] = useState({ width: 1000, height: 1000 });
  const nodeMap = new Map(network.nodes.map((node) => [node.id, node]));
  const bounds: LatLngBoundsExpression = [[0, 0], [imageSize.height, imageSize.width]];
  const connections: { key: string; from: ImageMapNode; to: ImageMapNode; accessible: boolean }[] = [];
  const seen = new Set<string>();

  useEffect(() => {
    const image = new Image();
    image.onload = () => setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = imageUrl;
  }, [imageUrl]);

  Object.entries(network.connections).forEach(([fromId, items]) => {
    const from = nodeMap.get(fromId);
    if (!from) return;
    items.forEach((item) => {
      const toId = typeof item === "string" ? item : item.to;
      const to = nodeMap.get(toId);
      const key = [fromId, toId].sort().join("::");
      if (!to || seen.has(key)) return;
      seen.add(key);
      connections.push({ key, from, to, accessible: typeof item === "string" || item.accessible !== false });
    });
  });

  return (
    <MapContainer
      crs={CRS.Simple}
      bounds={bounds}
      maxBounds={bounds}
      maxZoom={4}
      minZoom={-4}
      style={{ height: "100%", width: "100%", background: "#222" }}
      scrollWheelZoom
    >
      <ImageOverlay url={imageUrl} bounds={bounds} />
      <MapEvents onMapClick={onMapClick} />
      {connections.map((connection) => {
        const positions: [[number, number], [number, number]] = [
          [connection.from.y, connection.from.x],
          [connection.to.y, connection.to.x],
        ];
        const canEdit = mode === "disconnect" || mode === "accessibility";
        const handleClick = (event: { originalEvent: { stopPropagation: () => void } }) => {
          event.originalEvent.stopPropagation();
          onConnectionClick(connection.from.id, connection.to.id);
        };

        return (
          <React.Fragment key={connection.key}>
            {canEdit && (
              <Polyline
                positions={positions}
                interactive
                pathOptions={{ color: "transparent", weight: 24, opacity: 0 }}
                eventHandlers={{ click: handleClick }}
              />
            )}
            <Polyline
              positions={positions}
              pathOptions={{
                color: connection.accessible ? "#d46b3f" : "#8e44ad",
                weight: 4,
                dashArray: connection.accessible ? undefined : "6, 6",
              }}
              interactive={canEdit}
              eventHandlers={{ click: handleClick }}
            />
          </React.Fragment>
        );
      })}
      {network.nodes.map((node) => (
        <Marker
          key={node.id}
          position={[node.y, node.x]}
          draggable
          icon={divIcon({
            className: "image-node",
            html: `<span style="display:block;width:${node.id === selectedNodeId ? 18 : 13}px;height:${node.id === selectedNodeId ? 18 : 13}px;border-radius:50%;background:${node.id === selectedNodeId ? "#e06b3c" : "#1d5962"};border:2px solid white;"></span>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          })}
          eventHandlers={{
            click: (event) => {
              event.originalEvent.stopPropagation();
              onNodeClick(node.id);
            },
            dragend: (event) => {
              const position = event.target.getLatLng();
              onNodeDragEnd(node.id, position.lng, position.lat);
            },
          }}
        />
      ))}
    </MapContainer>
  );
}
