import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Keyboard } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import LocationMap from "../components/location-map";
import buildingData from "../data/wpi-buildings.json";
import { getWalkwayDebugOverlay, routeBetween } from "../utils/routing";
import type { WalkingRoute, WalkwayDebugOverlay } from "../utils/routing";

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
const OFF_ROUTE_THRESHOLD_METERS = 15; // Distance threshold to trigger re-routing
const CAMPUS_CENTER = { latitude: 42.2744, longitude: -71.8075 };
const WALKWAY_DEBUG = __DEV__ ? getWalkwayDebugOverlay() : undefined;
const WPI_BUILDINGS: Building[] = buildingData.map((building) => ({
  id: building.name.toLowerCase().replaceAll(" ", "-"),
  name: building.name,
  entrances: building.entrances,
}));

function computeWeightedCoordinates(samples: Coordinates[], currentTimestamp: number): Coordinates | null {
  if (samples.length === 0) return null;

  let freshSamples = samples.filter((s) => currentTimestamp - s.timestamp <= MAX_SAMPLE_AGE_MS);
  if (freshSamples.length === 0) {
    freshSamples = [samples[samples.length - 1]];
  }

  const accurateSamples = freshSamples.filter((s) => s.accuracy <= MAX_ACCURACY_THRESHOLD);
  const candidateSamples = accurateSamples.length > 0 ? accurateSamples : freshSamples;

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

// Helper to calculate approximate distance in meters between two lat/lng points (Haversine-ish)
function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // Radius of the earth in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

// Check if user is too far from all segments of the current route geometry
function isUserOffRoute(userLat: number, userLng: number, geometry: [number, number][]): boolean {
  if (!geometry || geometry.length === 0) return false;
  
  // Find the minimum distance from the user to any point along the route geometry
  let minDistance = Infinity;
  for (const [lat, lng] of geometry) {
    const dist = getDistanceFromLatLonInMeters(userLat, userLng, lat, lng);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance > OFF_ROUTE_THRESHOLD_METERS;
}

export default function Home() {
  const samplesRef = useRef<Coordinates[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  
  const initialLocationSet = useRef(false);
  const [mapCenter, setMapCenter] = useState(CAMPUS_CENTER);

  const [error, setError] = useState("");
  const [originMode, setOriginMode] = useState<"current" | "building">("current");
  const [originBuilding, setOriginBuilding] = useState("");
  const [destinationBuilding, setDestinationBuilding] = useState("");
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const autoRouteKeyRef = useRef("");
  
  // Ref to track route geometry inside the background location listener without triggering re-subscriptions
  const routeGeometryRef = useRef<[number, number][] | null>(null);
  useEffect(() => {
    routeGeometryRef.current = route?.geometry ?? null;
  }, [route]);

  const isReroutingRef = useRef(false);

  // Define planRoute so it can be called dynamically on re-route
  const planRoute = useCallback(async (currentCoords?: Coordinates) => {
    const activeCoords = currentCoords || coordinates;
    setRouteError("");

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
      setRouteError("Choose a WPI origin buildingcharts.");
      return;
    }

    if (originMode === "current" && !activeCoords) {
      setRouteError("Waiting for your current location before planning.");
      return;
    }

    setRouteLoading(true);
    try {
      const origin = originMode === "current"
        ? {
            latitude: activeCoords!.latitude,
            longitude: activeCoords!.longitude,
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
      isReroutingRef.current = false;
    }
  }, [destinationBuilding, originBuilding, originMode, coordinates]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    async function startLocationTracking() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission is required to plan a route.");
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 1,
        },
        (location) => {
          const sample: Coordinates = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy || 0,
            altitude: location.coords.altitude,
            altitudeAccuracy: location.coords.altitudeAccuracy,
            heading: location.coords.heading,
            speed: location.coords.speed,
            timestamp: location.timestamp,
          };

          const nextSamples = [...samplesRef.current, sample]
            .filter((s) => location.timestamp - s.timestamp <= MAX_SAMPLE_AGE_MS)
            .slice(-SAMPLE_COUNT);

          samplesRef.current = nextSamples;
          const smoothed = computeWeightedCoordinates(nextSamples, location.timestamp);
          
          if (smoothed) {
            setCoordinates(smoothed);
            
            if (!initialLocationSet.current) {
              setMapCenter({ latitude: smoothed.latitude, longitude: smoothed.longitude });
              initialLocationSet.current = true;
            }

            // Check if user is actively navigating and has drifted off-route
            if (
              routeGeometryRef.current && 
              !isReroutingRef.current && 
              destinationBuilding !== ""
            ) {
              if (isUserOffRoute(smoothed.latitude, smoothed.longitude, routeGeometryRef.current)) {
                isReroutingRef.current = true;
                void planRoute(smoothed);
              }
            }
          }
          setError("");
        }
      );
    }

    startLocationTracking();
    return () => {
      subscription?.remove();
    };
  }, [destinationBuilding, planRoute]);

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
  }, [coordinates, destinationBuilding, originBuilding, originMode, planRoute]);

  const handleDestinationChange = useCallback((buildingId: string) => {
    setOriginMode("current");
    setOriginBuilding("");
    setDestinationBuilding(buildingId);
  }, []);

  const handleCancelRoute = useCallback(() => {
    setRoute(null);
    setDestinationBuilding("");
    autoRouteKeyRef.current = "";
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View 
        style={styles.mapCanvas}
        onStartShouldSetResponder={() => {
          Keyboard.dismiss();
          return false;
        }}
      >
        {error ? (
          <View style={styles.loadingContainer}>
            <Text>{error}</Text>
          </View>
        ) : (
          <LocationMap
            latitude={route?.origin.latitude ?? mapCenter.latitude}
            longitude={route?.origin.longitude ?? mapCenter.longitude}
            userLatitude={coordinates?.latitude}
            userLongitude={coordinates?.longitude}
            accuracy={coordinates?.accuracy ?? 0}
            route={route}
            walkwayDebug={WALKWAY_DEBUG}
          />
        )}
      </View>

      <View style={styles.plannerPanel}>
        {/* TEST GPS ACCURACY START - Delete this block after testing */}
        <View style={{ marginBottom: 12, padding: 8, backgroundColor: "#fee2e2", borderRadius: 6, borderWidth: 1, borderColor: "#fecaca" }}>
          <Text style={{ fontSize: 12, color: "#991b1b", fontWeight: "bold" }}>
            TEST GPS Accuracy: {coordinates ? `${Math.round(coordinates.accuracy)}m` : "Acquiring..."}
          </Text>
        </View>
        {/* TEST GPS ACCURACY END */}

        <BuildingPicker
          buildings={WPI_BUILDINGS}
          value={destinationBuilding}
          onChange={handleDestinationChange}
          placeholder="Search WPI destinations..."
        />

        {destinationBuilding !== "" && (
          <View style={styles.routeOrigin}>
            <Text style={styles.smallText}>Starting location</Text>
            <Text style={styles.boldText}>
              {routeLoading ? "Recalculating route..." : (coordinates ? "Your current location" : "Locating you...")}
            </Text>
          </View>
        )}

        {routeError !== "" && <Text style={styles.errorText}>{routeError}</Text>}

        {route && (
          <View style={styles.routeSummary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.boldText}>{formatDistance(route.distance)}</Text>
              <Text>about {formatDuration(route.duration)} on foot</Text>
            </View>
            <TouchableOpacity onPress={handleCancelRoute} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

type BuildingPickerProps = {
  buildings: Building[];
  value: string;
  onChange: (buildingId: string) => void;
  placeholder: string;
};

const BuildingPicker = React.memo(({ buildings, value, onChange, placeholder }: BuildingPickerProps) => {
  const selectedBuilding = buildings.find((b) => b.id === value);
  const [query, setQuery] = useState(selectedBuilding?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const matchingBuildings = buildings.filter((b) =>
    b.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <View style={styles.pickerContainer}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          onChange("");
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
      />
      {isOpen && query.length > 0 && (
        <ScrollView style={styles.dropdown} keyboardShouldPersistTaps="handled">
          {matchingBuildings.map((building) => (
            <TouchableOpacity
              key={building.id}
              style={styles.dropdownItem}
              onPress={() => {
                onChange(building.id);
                setQuery(building.name);
                setIsOpen(false);
              }}
            >
              <Text>{building.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
});

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  mapCanvas: { ...StyleSheet.absoluteFill, backgroundColor: "#e0e0e0" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  plannerPanel: {
    position: "absolute",
    top: 32,
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  pickerContainer: { zIndex: 10, position: "relative" },
  input: { height: 48, borderColor: "#ccc", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#fff" },
  dropdown: { maxHeight: 150, backgroundColor: "#fff", borderColor: "#ccc", borderWidth: 1, borderRadius: 8, marginTop: 4 },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  routeOrigin: { marginTop: 12 },
  smallText: { fontSize: 12, color: "#666" },
  boldText: { fontSize: 16, fontWeight: "bold" },
  errorText: { color: "red", marginTop: 8 },
  routeSummary: { 
    marginTop: 16, 
    padding: 12, 
    backgroundColor: "#f9f9f9", 
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cancelButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#666",
  },
});