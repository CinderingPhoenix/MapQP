import { useEffect } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
} from "react-leaflet";

type LocationMapProps = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export default function LocationMap({
  latitude,
  longitude,
  accuracy,
}: LocationMapProps) {
  const position: [number, number] = [latitude, longitude];

  return (
    <MapContainer
      center={position}
      zoom={16}
      scrollWheelZoom
      style={{ height: "70vh", minHeight: "360px", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapPosition position={position} />
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
    </MapContainer>
  );
}

function MapPosition({ position }: { position: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(position, map.getZoom(), { animate: true });
  }, [map, position]);

  return null;
}
