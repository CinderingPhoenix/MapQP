import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import type { Route } from "./+types/home";

type LocationMapProps = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
};

const SAMPLE_COUNT = 5;

export function meta({}: Route.MetaArgs) {
  return [
    { title: "My GPS Coordinates" },
    { name: "description", content: "View your current GPS coordinates." },
  ];
}

export default function Home() {
  const samplesRef = useRef<Coordinates[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [LocationMap, setLocationMap] = useState<ComponentType<LocationMapProps> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    import("./location-map")
      .then(({ default: map }) => {
        if (active) {
          setLocationMap(() => map);
        }
      })
      .catch(() => {
        if (active) {
          setError("The map could not be loaded. Refresh and try again.");
        }
      });

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return () => {
        active = false;
      };
    }

    const watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        if (
          !Number.isFinite(coords.latitude) ||
          !Number.isFinite(coords.longitude) ||
          !Number.isFinite(coords.accuracy)
        ) {
          return;
        }

        const sample: Coordinates = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          altitude: coords.altitude,
          altitudeAccuracy: coords.altitudeAccuracy,
          heading: coords.heading,
          speed: coords.speed,
          timestamp,
        };

        const nextSamples = [...samplesRef.current, sample].slice(
          -SAMPLE_COUNT,
        );

        samplesRef.current = nextSamples;

        const totals = nextSamples.reduce(
          (total, currentSample) => ({
            latitude: total.latitude + currentSample.latitude,
            longitude: total.longitude + currentSample.longitude,
            accuracy: total.accuracy + currentSample.accuracy,
          }),
          {
            latitude: 0,
            longitude: 0,
            accuracy: 0,
          },
        );

        setCoordinates({
          ...sample,
          latitude: totals.latitude / nextSamples.length,
          longitude: totals.longitude / nextSamples.length,
          accuracy: totals.accuracy / nextSamples.length,
        });

        setError("");
      },
      (positionError) => {
        setError(positionError.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000,
      },
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return (
    <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "24px" }}>
        <div>
          <p>Live location</p>
          <h1>Your GPS coordinates</h1>
        </div>
        <p>{coordinates ? "Receiving GPS" : "Searching"}</p>
      </div>

      {error ? (
        <section role="alert">
          <strong>Location unavailable</strong>
          <p>{error}</p>
        </section>
      ) : coordinates ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.8fr)", gap: "16px" }}>
          <section aria-label="Your location on a map">
            {LocationMap ? (
              <LocationMap
                latitude={coordinates.latitude}
                longitude={coordinates.longitude}
                accuracy={coordinates.accuracy}
              />
            ) : (
              <p>Loading map...</p>
            )}
          </section>
          <section>
            <div>
              <p>Position data</p>
              <span>5-sample average</span>
            </div>
          <Coordinate
            label="Latitude"
            value={coordinates.latitude.toFixed(7)}
          />
          <Coordinate
            label="Longitude"
            value={coordinates.longitude.toFixed(7)}
          />
          <Coordinate
            label="Filtered Accuracy"
            value={`${Math.round(coordinates.accuracy)} m`}
          />
          <Coordinate
            label="Altitude"
            value={
              coordinates.altitude === null
                ? "Unavailable"
                : `${coordinates.altitude.toFixed(1)} m`
            }
          />
          <Coordinate
            label="Altitude Accuracy"
            value={
              coordinates.altitudeAccuracy === null
                ? "Unavailable"
                : `${Math.round(coordinates.altitudeAccuracy)} m`
            }
          />
          <Coordinate
            label="Heading"
            value={
              coordinates.heading === null
                ? "Unavailable"
                : `${Math.round(coordinates.heading)}°`
            }
          />
          <Coordinate
            label="Speed"
            value={
              coordinates.speed === null
                ? "Unavailable"
                : `${coordinates.speed.toFixed(1)} m/s`
            }
          />
          <Coordinate
            label="Timestamp"
            value={new Date(coordinates.timestamp).toLocaleString()}
          />
          </section>
        </div>
      ) : (
        <section>
          <p>Waiting for an accurate location...</p>
        </section>
      )}
    </main>
  );
}

function Coordinate({
  label,
  value,
}: {
  label: string;
  value: number | string | null;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "8px 0" }}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}