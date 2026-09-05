import { useEffect } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";

type LocationMapProps = {
  latitude: number;
  longitude: number;
  accuracy: number;
  route?: {
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    geometry: [number, number][];
  } | null;
};

export default function LocationMap({
  latitude,
  longitude,
  accuracy,
  route,
}: LocationMapProps) {
  const position: [number, number] = [latitude, longitude];

  return (
    <MapContainer
      center={position}
      zoom={16}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapPosition position={position} />
      {route && <RouteBounds route={route} />}
      <Circle
        center={position}
        radius={accuracy}
        pathOptions={{ color: "#e06b3c", fillColor: "#e06b3c" }}
      />
      <CircleMarker
        center={position}
        radius={8}
        pathOptions={{
          color: "#fffdf8",
          fillColor: "#e06b3c",
          fillOpacity: 1,
          weight: 3,
        }}
      />
      {route && (
        <>
          <Polyline
            positions={route.geometry}
            pathOptions={{ color: "#1d5962", weight: 6, opacity: 0.9 }}
          />
          <CircleMarker
            center={[route.destination.latitude, route.destination.longitude]}
            radius={9}
            pathOptions={{
              color: "#fffdf8",
              fillColor: "#1d5962",
              fillOpacity: 1,
              weight: 3,
            }}
          />
        </>
      )}
    </MapContainer>
  );
}

function MapPosition({ position }: { position: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(position, map.getZoom(), { animate: true });
  }, [map, position[0], position[1]]);

  return null;
}

function RouteBounds({
  route,
}: {
  route: NonNullable<LocationMapProps["route"]>;
}) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(
      [
        [route.origin.latitude, route.origin.longitude],
        [route.destination.latitude, route.destination.longitude],
      ],
      { padding: [36, 36], maxZoom: 17, animate: true },
    );
  }, [map, route]);

  return null;
}
