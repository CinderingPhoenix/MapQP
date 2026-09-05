import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import type { Route } from "./+types/home";
import buildingData from "../data/wpi-buildings.json";

type LocationMapProps = {
  latitude: number;
  longitude: number;
  accuracy: number;
  route?: RoutePlan | null;
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

type WalkingRoute = {
  geometry: [number, number][];
  distance: number;
  duration: number;
  via?: undefined;
};

type IndoorShortcut = {
  name: string;
  entrance: readonly [number, number];
  exit: readonly [number, number];
  duration: number;
};

type Building = {
  id: string;
  name: string;
  entrances: readonly {
    latitude: number;
    longitude: number;
    name: string;
  }[];
  indoorShortcuts?: readonly IndoorShortcut[];
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
const CAMPUS_CENTER = { latitude: 42.2744, longitude: -71.8075 };
const routeCache = new Map<string, WalkingRoute>();
let routeRequestTail = Promise.resolve();
const WPI_BUILDINGS: Building[] = buildingData.map((building) => ({
  id: building.name.toLowerCase().replaceAll(" ", "-"),
  name: building.name,
  entrances: building.entrances,
  ...(building.indoorShortcuts
    ? {
        indoorShortcuts: building.indoorShortcuts.map((shortcut) => ({
          ...shortcut,
          entrance: [shortcut.entrance[0], shortcut.entrance[1]] as [number, number],
          exit: [shortcut.exit[0], shortcut.exit[1]] as [number, number],
        })),
      }
    : {}),
}));

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

        if (import.meta.env.DEV) {
          console.debug("[MapQP] GPS position", {
            latitude: totals.latitude / nextSamples.length,
            longitude: totals.longitude / nextSamples.length,
            accuracy: totals.accuracy / nextSamples.length,
            altitude: sample.altitude,
            altitudeAccuracy: sample.altitudeAccuracy,
            heading: sample.heading,
            speed: sample.speed,
            timestamp: sample.timestamp,
          });
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
      const currentLocation = originMode === "current"
        ? {
            latitude: coordinates!.latitude,
            longitude: coordinates!.longitude,
            label: "Your current location",
          }
        : null;
      const entrancePair = originSelection
        ? await closestRouteEntrancePair(originSelection, destinationSelection)
        : null;
      const destinationEntranceIndex = currentLocation
        ? await closestRouteEntranceIndex(destinationSelection, currentLocation)
        : entrancePair!.destinationIndex;
      const origin = currentLocation ?? buildingPoint(originSelection!, entrancePair!.originIndex);
      const destination = buildingPoint(
        destinationSelection,
        destinationEntranceIndex,
      );

      const outdoorRoute = await routeBetween(origin, destination);
      const shouldCheckIndoorShortcuts = originMode === "building"
        ? originSelection?.id === "boynton-hall" ||
          originSelection?.id === "fuller-laboratories" ||
          originSelection?.id === "unity-hall" ||
          destinationSelection.id === "boynton-hall" ||
          destinationSelection.id === "fuller-laboratories" ||
          destinationSelection.id === "unity-hall"
        : destinationSelection.id === "boynton-hall";
      const relevantShortcutBuildings = new Set([
        "fuller-laboratories",
        "unity-hall",
      ]);
      const shortcutRoutes = WPI_BUILDINGS.filter((building) =>
        shouldCheckIndoorShortcuts && relevantShortcutBuildings.has(building.id),
      ).flatMap(
        (building) => building.indoorShortcuts ?? [],
      ).flatMap((shortcut) => [
        { shortcut, entrance: shortcut.entrance, exit: shortcut.exit },
        { shortcut, entrance: shortcut.exit, exit: shortcut.entrance },
      ]).map(async ({ shortcut, entrance, exit }) => {
        const shortcutEntrance: Point = {
          latitude: entrance[0],
          longitude: entrance[1],
          label: `${shortcut.name} entrance`,
        };
        const shortcutExit: Point = {
          latitude: exit[0],
          longitude: exit[1],
          label: `${shortcut.name} exit`,
        };
        const [toShortcut, fromShortcut] = await Promise.all([
          routeBetween(origin, shortcutEntrance),
          routeBetween(shortcutExit, destination),
        ]);

        return {
          geometry: [
            ...toShortcut.geometry,
            [shortcutExit.latitude, shortcutExit.longitude] as [number, number],
            ...fromShortcut.geometry,
          ],
          distance: toShortcut.distance +
            distanceBetween(
              entrance[0],
              entrance[1],
              exit[0],
              exit[1],
            ) +
            fromShortcut.distance,
          duration: toShortcut.duration + shortcut.duration + fromShortcut.duration,
          via: shortcut.name,
        };
      });
      const candidates = [outdoorRoute, ...(await Promise.all(shortcutRoutes))];
      const selectedRoute = candidates.reduce((shortest, candidate) =>
        candidate.duration < shortest.duration ? candidate : shortest,
      );

      setRoute({
        origin,
        destination,
        geometry: selectedRoute.geometry,
        distance: selectedRoute.distance,
        duration: selectedRoute.duration,
        via: selectedRoute.via,
      });
    } catch (routeRequestError) {
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

async function routeBetween(origin: Point, destination: Point): Promise<WalkingRoute> {
  const cacheKey = [
    origin.longitude,
    origin.latitude,
    destination.longitude,
    destination.latitude,
  ].join(",");
  const cachedRoute = routeCache.get(cacheKey);
  if (cachedRoute) {
    return cachedRoute;
  }

  const response = await requestWalkingRoute(
    `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`,
  );
  if (!response.ok) {
    throw new Error("The walking route could not be found.");
  }

  const data = await response.json();
  const selectedRoute = data.routes?.[0];
  if (!selectedRoute) {
    throw new Error("No walking route was found between those buildings.");
  }

  const route = {
    geometry: selectedRoute.geometry.coordinates.map(
      ([longitude, latitude]: [number, number]) => [latitude, longitude] as [number, number],
    ),
    distance: selectedRoute.distance,
    duration: selectedRoute.duration,
    via: undefined,
  };
  routeCache.set(cacheKey, route);
  return route;
}

function requestWalkingRoute(url: string): Promise<Response> {
  const request = routeRequestTail.then(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 0 : 1500 * 2 ** (attempt - 1)));
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20_000);

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (response.status !== 429 && response.status < 500) {
          return response;
        }
      } catch {
        if (attempt === 2) {
          throw new Error("The walking route service timed out. Wait a moment and try again.");
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    throw new Error("The walking route service is busy. Wait a moment and try again.");
  });

  routeRequestTail = request.then(() => undefined, () => undefined);
  return request;
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

function distanceBetween(
  latitudeOne: number,
  longitudeOne: number,
  latitudeTwo: number,
  longitudeTwo: number,
) {
  const latitudeScale = Math.cos(((latitudeOne + latitudeTwo) / 2) * Math.PI / 180);
  const latitudeDelta = (latitudeTwo - latitudeOne) * 111_320;
  const longitudeDelta = (longitudeTwo - longitudeOne) * 111_320 * latitudeScale;
  return Math.hypot(latitudeDelta, longitudeDelta);
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