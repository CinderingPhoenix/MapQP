import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import buildingData from "../data/wpi-buildings.json";
import type { WalkwayDebugOverlay, WalkingRoute } from "../utils/routing";
import { getWalkwayDebugOverlay, routeBetween } from "../utils/routing";
import type { Route } from "./+types/home";

type LocationMapProps = {
  latitude: number;
  longitude: number;
  accuracy: number;
  route?: RoutePlan | null;
  walkwayDebug?: WalkwayDebugOverlay;
};

type Point = {
  latitude: number;
  longitude: number;
  label: string;
};

type RoutePlan = {
  origin: Point;
  destination: Point;
  geometry: [number, number][];
  distance: number;
  duration: number;
  via?: string;
};

type RouteCandidate = WalkingRoute & {
  origin: Point;
  destination: Point;
};

type Building = {
  id: string;
  name: string;
  entrances: readonly {
    latitude: number;
    longitude: number;
    name: string;
  }[];
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

const SAMPLE_COUNT = 8;
const MAX_ACCURACY_THRESHOLD = 150;
const MAX_SAMPLE_AGE_MS = 15_000;
const CAMPUS_CENTER = { latitude: 42.2744, longitude: -71.8075 };
const WALKWAY_DEBUG = import.meta.env.DEV ? getWalkwayDebugOverlay() : undefined;
const WPI_BUILDINGS: Building[] = buildingData.map((building) => ({
  id: building.name.toLowerCase().replaceAll(" ", "-"),
  name: building.name,
  entrances: building.entrances,
}));

function computeWeightedCoordinates(samples: Coordinates[], currentTimestamp: number): Coordinates | null {
  if (samples.length === 0) return null;

  // 1. Filter out stale samples older than 15s
  let freshSamples = samples.filter((s) => currentTimestamp - s.timestamp <= MAX_SAMPLE_AGE_MS);
  if (freshSamples.length === 0) {
    freshSamples = [samples[samples.length - 1]];
  }

  // 2. Filter out low-accuracy spikes if higher quality fixes exist
  const accurateSamples = freshSamples.filter((s) => s.accuracy <= MAX_ACCURACY_THRESHOLD);
  const candidateSamples = accurateSamples.length > 0 ? accurateSamples : freshSamples;

  // 3. Inverse Variance Weighting: w_i = 1 / accuracy^2
  let totalWeight = 0;
  let weightedLat = 0;
  let weightedLng = 0;
  let weightedAcc = 0;

  for (const sample of candidateSamples) {
    const weight = 1 / Math.pow(Math.max(sample.accuracy, 0.5), 2);
    totalWeight += weight;
    weightedLat += sample.latitude * weight;
    weightedLng += sample.longitude * weight;
    weightedAcc += sample.accuracy * weight;
  }

  const latestSample = candidateSamples[candidateSamples.length - 1];

  return {
    ...latestSample,
    latitude: weightedLat / totalWeight,
    longitude: weightedLng / totalWeight,
    accuracy: weightedAcc / totalWeight,
  };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "MapQP | Plan a route" },
    { name: "description", content: "Plan a route between buildings." },
  ];
}

export default function Home() {
  const samplesRef = useRef<Coordinates[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [LocationMap, setLocationMap] = useState<ComponentType<LocationMapProps> | null>(null);
  const [error, setError] = useState("");
  const [originMode, setOriginMode] = useState<"current" | "building">("current");
  const [originBuilding, setOriginBuilding] = useState("");
  const [destinationBuilding, setDestinationBuilding] = useState("");
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const autoRouteKeyRef = useRef("");

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

        const nextSamples = [...samplesRef.current, sample]
          .filter((s) => timestamp - s.timestamp <= MAX_SAMPLE_AGE_MS)
          .slice(-SAMPLE_COUNT);

        samplesRef.current = nextSamples;

        const smoothed = computeWeightedCoordinates(nextSamples, timestamp);
        if (smoothed) {
          setCoordinates(smoothed);

          if (import.meta.env.DEV) {
            console.debug("[MapQP] GPS position (smoothed)", {
              latitude: smoothed.latitude,
              longitude: smoothed.longitude,
              accuracy: smoothed.accuracy,
              altitude: sample.altitude,
              altitudeAccuracy: sample.altitudeAccuracy,
              heading: sample.heading,
              speed: sample.speed,
              timestamp: sample.timestamp,
            });
          }
        }

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

  useEffect(() => {
    const hasOrigin = originMode === "current" ? Boolean(coordinates) : Boolean(originBuilding);
    if (!destinationBuilding || !hasOrigin) {
      return;
    }

    const routeKey = `${originMode}:${originBuilding}:${destinationBuilding}`;
    if (autoRouteKeyRef.current === routeKey) {
      return;
    }

    autoRouteKeyRef.current = routeKey;
    void planRoute();
  }, [coordinates, destinationBuilding, originBuilding, originMode]);

  async function planRoute() {
    setRouteError("");
    setRoute(null);

    const destinationSelection = WPI_BUILDINGS.find(
      (building) => building.id === destinationBuilding,
    );
    if (!destinationSelection) {
      setRouteError("Choose a WPI destination building.");
      return;
    }

    const originSelection = WPI_BUILDINGS.find(
      (building) => building.id === originBuilding,
    );
    if (originMode === "building" && !originSelection) {
      setRouteError("Choose a WPI origin building.");
      return;
    }

    if (originMode === "current" && !coordinates) {
      setRouteError("Waiting for your current location before planning.");
      return;
    }

    setRouteLoading(true);
    try {
      const origin = originMode === "current"
        ? {
            latitude: coordinates!.latitude,
            longitude: coordinates!.longitude,
            label: "Your current location",
          }
        : buildingPoint(originSelection!, 0);
      const destinationEntrances = destinationSelection.entrances.map((_, index) =>
        buildingPoint(destinationSelection, index),
      );

      const outdoorCandidates = await Promise.all(
        destinationEntrances.map(async (destination): Promise<RouteCandidate | null> => {
          try {
            return {
              ...(await routeBetween(origin, destination)),
              origin,
              destination,
            };
          } catch {
            return null;
          }
        }),
      );
      const availableOutdoorRoutes = outdoorCandidates.filter(
        (candidate): candidate is RouteCandidate => candidate !== null,
      );
      if (availableOutdoorRoutes.length === 0) {
        throw new Error("The walking route service could not find a route. Try again.");
      }
      const outdoorRoute = fastestRoute(availableOutdoorRoutes);
      setRoute(outdoorRoute);
    } catch (routeRequestError) {
      autoRouteKeyRef.current = "";
      setRouteError(
        routeRequestError instanceof Error
          ? routeRequestError.message
          : "The route could not be planned. Try again.",
      );
    } finally {
      setRouteLoading(false);
    }
  }

  return (
    <main className="map-app">
      <div className="map-canvas" aria-label="Map view">
        {LocationMap ? (
          <LocationMap
            latitude={coordinates?.latitude ?? route?.origin.latitude ?? CAMPUS_CENTER.latitude}
            longitude={coordinates?.longitude ?? route?.origin.longitude ?? CAMPUS_CENTER.longitude}
            accuracy={coordinates?.accuracy ?? 0}
            route={route}
            walkwayDebug={WALKWAY_DEBUG}
          />
        ) : (
          <div className="map-loading">
            <span>{error || "Waiting for your location..."}</span>
          </div>
        )}
      </div>
      <section className="planner-panel map-controls" aria-label="Plan a route">
        <div className="route-form">
          <label className="destination-field">
            <span className="sr-only">Destination</span>
            <BuildingPicker
              buildings={WPI_BUILDINGS}
              value={destinationBuilding}
              onChange={(buildingId) => {
                setOriginMode("current");
                setOriginBuilding("");
                setDestinationBuilding(buildingId);
              }}
              ariaLabel="Search WPI buildings"
            />
          </label>
        </div>
        {destinationBuilding && (
          <div className="route-origin" aria-live="polite">
            <span className="route-origin-dot" aria-hidden="true" />
            <div>
              <small>Starting location</small>
              <strong>{coordinates ? "Your current location" : "Locating you..."}</strong>
            </div>
          </div>
        )}
        {routeError && <p className="form-error" role="alert">{routeError}</p>}
        {route && (
          <div className="route-summary" aria-live="polite">
            <strong>{formatDistance(route.distance)}</strong>
            <span>about {formatDuration(route.duration)} on foot</span>
            <span>{route.origin.label} to {route.destination.label}</span>
          </div>
        )}
      </section>
    </main>
  );
}

function BuildingPicker({
  buildings,
  value,
  onChange,
  ariaLabel,
}: {
  buildings: Building[];
  value: string;
  onChange: (buildingId: string) => void;
  ariaLabel: string;
}) {
  const selectedBuilding = buildings.find((building) => building.id === value);
  const [query, setQuery] = useState(selectedBuilding?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const matchingBuildings = buildings.filter((building) =>
    building.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function selectBuilding(building: Building) {
    onChange(building.id);
    setQuery(building.name);
    setIsOpen(false);
  }

  return (
    <div className="building-picker">
      <input
        className="text-input"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && matchingBuildings[0]) {
            event.preventDefault();
            selectBuilding(matchingBuildings[0]);
          }
          if (event.key === "Escape") {
            setIsOpen(false);
          }
        }}
        placeholder="Search WPI buildings..."
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={isOpen}
      />
      {isOpen && (
        <div className="building-options" role="listbox">
          {matchingBuildings.length > 0 ? matchingBuildings.map((building) => (
            <button
              key={building.id}
              type="button"
              className="building-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectBuilding(building)}
            >
              {building.name}
            </button>
          )) : (
            <p className="building-empty">No WPI buildings match that search.</p>
          )}
        </div>
      )}
    </div>
  );
}

function buildingPoint(building: Building, entranceIndex: number): Point {
  const entrance = building.entrances[entranceIndex];

  return {
    latitude: entrance.latitude,
    longitude: entrance.longitude,
    label: `${building.name} ${entrance.name}`,
  };
}

function fastestRoute(routes: RouteCandidate[]): RouteCandidate {
  return routes.reduce(
    (fastest, candidate) => candidate.duration < fastest.duration ? candidate : fastest,
  );
}

async function closestRouteEntranceIndex(building: Building, point: Point) {
  let closestIndex = 0;
  let shortestDuration = Number.POSITIVE_INFINITY;

  for (let entranceIndex = 0; entranceIndex < building.entrances.length; entranceIndex += 1) {
    const route = await routeBetween(point, buildingPoint(building, entranceIndex));
    if (route.duration < shortestDuration) {
      shortestDuration = route.duration;
      closestIndex = entranceIndex;
    }
  }

  return closestIndex;
}

async function closestRouteEntrancePair(origin: Building, destination: Building) {
  let closestPair = { originIndex: 0, destinationIndex: 0 };
  let shortestDuration = Number.POSITIVE_INFINITY;

  for (let originIndex = 0; originIndex < origin.entrances.length; originIndex += 1) {
    for (let destinationIndex = 0; destinationIndex < destination.entrances.length; destinationIndex += 1) {
      const route = await routeBetween(
        buildingPoint(origin, originIndex),
        buildingPoint(destination, destinationIndex),
      );
      if (route.duration < shortestDuration) {
        shortestDuration = route.duration;
        closestPair = { originIndex, destinationIndex };
      }
    }
  }

  return closestPair;
}

function formatDistance(meters: number) {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}