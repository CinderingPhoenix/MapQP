import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Keyboard } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import LocationMap from "../components/location-map";
import buildingData from "../data/wpi-buildings.json";
import { getWalkwayDebugOverlay, routeBetween } from "../utils/routing";
import type { WalkingRoute } from "../utils/routing";

// --- Types ---

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

// --- Constants ---

const SAMPLE_COUNT = 20; 
const MAX_ACCURACY_THRESHOLD = 25; 
const MAX_SAMPLE_AGE_MS = 20_000;
const OFF_ROUTE_THRESHOLD_METERS = 15;
const CAMPUS_CENTER = { latitude: 42.2744, longitude: -71.8075 };

const WPI_BUILDINGS: Building[] = buildingData.map((building) => ({
  id: building.name.toLowerCase().replaceAll(" ", "-"),
  name: building.name,
  entrances: building.entrances,
}));

// --- Utility Functions ---

/**
 * Calculates a smoothed, weighted average of recent GPS coordinates 
 * to reduce jitter and prevent the user marker from jumping erratically.
 */
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
  const baseAccuracy = weightedAcc / totalWeight;

  // CONFIDENCE BOOST: 
  // If the user is relatively stationary, gathering multiple independent samples 
  // exponentially increases our statistical confidence. Apply Standard Error of the Mean.
  const isStationary = (latestSample.speed ?? 0) < 0.5;
  let finalAccuracy = baseAccuracy;

  if (isStationary && candidateSamples.length > 1) {
    finalAccuracy = baseAccuracy / Math.sqrt(candidateSamples.length);
  }

  // Clamp to a realistic hardware minimum so the radius doesn't visually disappear
  finalAccuracy = Math.max(2, finalAccuracy);

  return {
    ...latestSample,
    latitude: weightedLat / totalWeight,
    longitude: weightedLng / totalWeight,
    accuracy: finalAccuracy,
  };
}

/**
 * SMART POLLING LOGIC
 * Calculates the ideal millisecond delay between GPS polls based on real-time factors.
 * 
 * - Poor Accuracy: Drops interval to poll faster and narrow down location.
 * - High Speed: Drops interval to keep up with user movement.
 * - Stopped & Accurate: Increases interval to save battery life.
 */
function calculateSmartPollingInterval(accuracy: number, speed: number): number {
  let interval = 4000; // Base interval (slowest baseline for battery saving)

  // 1. Accuracy Penalty: Subtract up to 2000ms if accuracy is worse than 50 meters
  const accuracyPenalty = Math.min((accuracy / 50) * 2000, 2000);
  interval -= accuracyPenalty;

  // 2. Speed Penalty: Subtract up to 1500ms if moving faster than 3 m/s (running pace)
  const speedPenalty = Math.min((speed / 3) * 1500, 1500);
  interval -= speedPenalty;

  // Clamp the final value between 500ms (fastest) and 4000ms (slowest)
  const clamped = Math.max(500, Math.min(interval, 4000));
  
  // Round to nearest 500ms bucket (500, 1000, 1500...) 
  // This prevents the GPS hardware subscription from restarting too frequently due to minor fluctuations.
  return Math.round(clamped / 500) * 500;
}

function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; 
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

function isUserOffRoute(userLat: number, userLng: number, geometry: [number, number][]): boolean {
  if (!geometry || geometry.length === 0) return false;
  
  let minDistance = Infinity;
  for (const [lat, lng] of geometry) {
    const dist = getDistanceFromLatLonInMeters(userLat, userLng, lat, lng);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  return minDistance > OFF_ROUTE_THRESHOLD_METERS;
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

// --- Main Component ---

export default function Home() {
  const samplesRef = useRef<Coordinates[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const initialLocationSet = useRef(false);
  const [mapCenter, setMapCenter] = useState(CAMPUS_CENTER);
  const [error, setError] = useState("");

  // Smart Polling State
  const [pollingInterval, setPollingInterval] = useState(1000);

  const [destinationBuilding, setDestinationBuilding] = useState("");
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  
  const autoRouteKeyRef = useRef("");
  const routeGeometryRef = useRef<[number, number][] | null>(null);
  const isReroutingRef = useRef(false);

  useEffect(() => {
    routeGeometryRef.current = route?.geometry ?? null;
  }, [route]);

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

    if (!activeCoords) {
      setRouteError("Waiting for your current location before planning.");
      return;
    }

    setRouteLoading(true);
    try {
      const origin = {
        latitude: activeCoords.latitude,
        longitude: activeCoords.longitude,
        label: "Your current location",
      };
      
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
  }, [destinationBuilding, coordinates]);

  // Track location continuously
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
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: pollingInterval, // Injected dynamically from state
          distanceInterval: 0, // Set to 0 so we rely entirely on our smart time interval
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

          // --- Trigger Smart Polling Evaluation ---
          const currentAccuracy = smoothed?.accuracy || location.coords.accuracy || 100;
          const currentSpeed = location.coords.speed || 0;
          const idealInterval = calculateSmartPollingInterval(currentAccuracy, currentSpeed);

          if (idealInterval !== pollingInterval) {
            setPollingInterval(idealInterval);
          }
        }
      );
    }

    startLocationTracking();
    return () => {
      subscription?.remove();
    };
  }, [destinationBuilding, planRoute, pollingInterval]); 

  useEffect(() => {
    if (!destinationBuilding || !coordinates) {
      return;
    }

    const routeKey = `current::${destinationBuilding}`;
    if (autoRouteKeyRef.current === routeKey) {
      return;
    }

    autoRouteKeyRef.current = routeKey;
    void planRoute();
  }, [coordinates, destinationBuilding, planRoute]);

  const handleDestinationChange = useCallback((buildingId: string) => {
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
          />
        )}
      </View>

      <View style={styles.plannerPanel}>
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

      {/* GPS Debug Info Panel */}
      <View style={styles.debugPanel}>
        <Text style={styles.debugText}>
          Accuracy: {coordinates?.accuracy ? `${coordinates.accuracy.toFixed(2)}m` : 'N/A'}
        </Text>
        <Text style={styles.debugText}>
          Polling: {pollingInterval}ms
        </Text>
      </View>
    </SafeAreaView>
  );
}

// --- Subcomponents ---

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

// --- Styling ---

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
  debugPanel: {
    position: "absolute",
    bottom: 32,
    left: 16,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 8,
    borderRadius: 8,
    zIndex: 100,
  },
  debugText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "monospace",
    marginVertical: 2,
  },
});