import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  Animated,
  Platform,
} from "react-native";
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

type KalmanState = {
  lat: number;
  lng: number;
  varianceLat: number;
  varianceLng: number;
  timestamp: number;
};

// --- Constants ---

const SAMPLE_COUNT = 20; 
const BASE_MAX_SAMPLE_AGE_MS = 20_000;
const OFF_ROUTE_THRESHOLD_METERS = 15;
const CAMPUS_CENTER = { latitude: 42.2744, longitude: -71.8075 };

const WPI_BUILDINGS: Building[] = buildingData.map((building) => ({
  id: building.name.toLowerCase().replaceAll(" ", "-"), 
  name: building.name, 
  entrances: building.entrances, 
}));

// --- Utility Functions ---

function processAdvancedCoordinates(
  incomingSample: Coordinates,
  previousStateRef: React.MutableRefObject<KalmanState | null>,
  sampleBuffer: Coordinates[]
): Coordinates | null {
  const now = incomingSample.timestamp;
  let adjustedAccuracy = Math.max(incomingSample.accuracy, 1.0);
  let isResumingFromBackground = false;

  if (previousStateRef.current) {
    const prev = previousStateRef.current;
    const dt = (now - prev.timestamp) / 1000;

    if (dt > (BASE_MAX_SAMPLE_AGE_MS / 1000)) {
      previousStateRef.current = null;
      isResumingFromBackground = true;
    } else if (dt > 0) {
      const distanceMovedMeters = getDistanceFromLatLonInMeters(
        prev.lat, prev.lng, incomingSample.latitude, incomingSample.longitude
      );
      const impliedSpeed = distanceMovedMeters / dt;

      if (impliedSpeed > 7.0) { 
        const penaltyFactor = Math.min(impliedSpeed / 2, 10);
        adjustedAccuracy *= penaltyFactor;
      }
    }
  }

  let currentLat = incomingSample.latitude;
  let currentLng = incomingSample.longitude;
  let currentVar = Math.pow(adjustedAccuracy, 2);

  if (previousStateRef.current && !isResumingFromBackground) {
    const prev = previousStateRef.current;
    const dtSec = Math.max(0.1, (now - prev.timestamp) / 1000);

    let predictedLat = prev.lat;
    let predictedLng = prev.lng;

    if (incomingSample.speed !== null && incomingSample.heading !== null && incomingSample.speed > 0.2) {
      const headingRad = incomingSample.heading * (Math.PI / 180);
      const vLatMps = incomingSample.speed * Math.cos(headingRad);
      const vLngMps = incomingSample.speed * Math.sin(headingRad);

      const dLat = (vLatMps * dtSec) / 111320;
      const dLng = (vLngMps * dtSec) / (111320 * Math.cos(prev.lat * (Math.PI / 180)));

      predictedLat += dLat;
      predictedLng += dLng;
    }

    const estimatedSpeedMps = incomingSample.speed !== null ? incomingSample.speed : 1.2;
    const processNoiseSpeed = Math.max(0.5, estimatedSpeedMps * 0.5);
    const processNoiseVar = Math.pow(processNoiseSpeed * dtSec, 2);

    const predictedVar = prev.varianceLat + processNoiseVar;
    const kalmanGain = predictedVar / (predictedVar + currentVar);

    currentLat = predictedLat + kalmanGain * (incomingSample.latitude - predictedLat);
    currentLng = predictedLng + kalmanGain * (incomingSample.longitude - predictedLng);

    currentVar = (1 - kalmanGain) * predictedVar;
  }

  previousStateRef.current = {
    lat: currentLat,
    lng: currentLng,
    varianceLat: currentVar,
    varianceLng: currentVar, 
    timestamp: now,
  };

  const isStationary = (incomingSample.speed ?? 0) < 0.5;
  let finalAccuracy = Math.sqrt(currentVar);

  if (isStationary && sampleBuffer.length > 1) {
    finalAccuracy = finalAccuracy / Math.sqrt(Math.min(sampleBuffer.length, 5));
  }

  return {
    ...incomingSample,
    latitude: currentLat,
    longitude: currentLng,
    accuracy: Math.max(2, Math.min(finalAccuracy, 50)),
  };
}

function calculateSmartPollingInterval(accuracy: number, speed: number, sampleCount: number): number {
  if (sampleCount < SAMPLE_COUNT) {
    return 500;
  }

  const validSpeed = Math.max(0, speed);
  const decayRate = 0.75;
  const rawInterval = 4000 * Math.exp(-decayRate * validSpeed);

  const clamped = Math.max(500, Math.min(rawInterval, 4000));
  return Math.round(clamped / 250) * 250;
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

// --- Map Matching / Snap-to-Route Helpers ---

function getClosestPointOnSegment(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const cosLat = Math.cos(deg2rad(a.lat));
  const px = (p.lng - a.lng) * cosLat;
  const py = p.lat - a.lat;
  const bx = (b.lng - a.lng) * cosLat;
  const by = b.lat - a.lat;

  const segmentLengthSquared = bx * bx + by * by;
  
  if (segmentLengthSquared === 0) {
    return { lat: a.lat, lng: a.lng, distance: getDistanceFromLatLonInMeters(p.lat, p.lng, a.lat, a.lng) };
  }

  let t = (px * bx + py * by) / segmentLengthSquared;
  t = Math.max(0, Math.min(1, t)); 

  const closestLat = a.lat + t * by;
  const closestLng = a.lng + t * (b.lng - a.lng); 

  return {
    lat: closestLat,
    lng: closestLng,
    distance: getDistanceFromLatLonInMeters(p.lat, p.lng, closestLat, closestLng)
  };
}

function snapToRouteGeometry(userLat: number, userLng: number, geometry: [number, number][], snapThresholdMeters = 12) {
  if (!geometry || geometry.length < 2) return { lat: userLat, lng: userLng };

  let bestPoint = { lat: userLat, lng: userLng };
  let minDistance = Infinity;

  for (let i = 0; i < geometry.length - 1; i++) {
    const a = { lat: geometry[i][0], lng: geometry[i][1] };
    const b = { lat: geometry[i+1][0], lng: geometry[i+1][1] };
    
    const closest = getClosestPointOnSegment({ lat: userLat, lng: userLng }, a, b);
    
    if (closest.distance < minDistance) {
      minDistance = closest.distance;
      bestPoint = { lat: closest.lat, lng: closest.lng };
    }
  }

  if (minDistance <= snapThresholdMeters) {
    return bestPoint;
  }

  return { lat: userLat, lng: userLng };
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
  const kalmanStateRef = useRef<KalmanState | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const initialLocationSet = useRef(false);
  const [mapCenter, setMapCenter] = useState(CAMPUS_CENTER);
  const [error, setError] = useState("");

  const [pollingInterval, setPollingInterval] = useState(1000);

  const [destinationBuilding, setDestinationBuilding] = useState("");
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  
  const [showRecenter, setShowRecenter] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const autoRouteKeyRef = useRef("");
  const routeGeometryRef = useRef<[number, number][] | null>(null);
  const isReroutingRef = useRef(false);

  // Keyboard offset animation with native timing sync
  const keyboardTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const targetOffset = -(e.endCoordinates.height + 10);
      
      Animated.timing(keyboardTranslateY, {
        toValue: targetOffset,
        duration: e.duration || 175,
        useNativeDriver: true,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardTranslateY, {
        toValue: 0,
        duration: e.duration || 200,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardTranslateY]);

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
          timeInterval: pollingInterval, 
          distanceInterval: 0, 
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

          const processed = processAdvancedCoordinates(sample, kalmanStateRef, samplesRef.current);
          
          if (processed) {
            const dynamicMaxAge = Math.max(BASE_MAX_SAMPLE_AGE_MS, SAMPLE_COUNT * pollingInterval);

            const nextSamples = [...samplesRef.current, processed]
              .filter((s) => location.timestamp - s.timestamp <= dynamicMaxAge)
              .slice(-SAMPLE_COUNT);

            samplesRef.current = nextSamples;

            let displayLat = processed.latitude;
            let displayLng = processed.longitude;

            if (routeGeometryRef.current && !isReroutingRef.current && destinationBuilding !== "") {
              const snapped = snapToRouteGeometry(displayLat, displayLng, routeGeometryRef.current);
              displayLat = snapped.lat;
              displayLng = snapped.lng;
            }

            setCoordinates({
              ...processed,
              latitude: displayLat,
              longitude: displayLng,
            });
            
            if (!initialLocationSet.current) {
              setMapCenter({ latitude: displayLat, longitude: displayLng });
              initialLocationSet.current = true;
            }

            if (
              routeGeometryRef.current && 
              !isReroutingRef.current && 
              destinationBuilding !== ""
            ) {
              if (isUserOffRoute(processed.latitude, processed.longitude, routeGeometryRef.current)) {
                isReroutingRef.current = true;
                void planRoute(processed);
              }
            }

            const currentAccuracy = processed?.accuracy || location.coords.accuracy || 100;
            const currentSpeed = location.coords.speed || 0;
            const idealInterval = calculateSmartPollingInterval(currentAccuracy, currentSpeed, nextSamples.length);

            if (idealInterval !== pollingInterval) {
              setPollingInterval(idealInterval);
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

  const handleRecenter = useCallback(() => {
    setShowRecenter(false);
    setRecenterSignal((prev) => prev + 1);
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
            recenterSignal={recenterSignal}
            onUserDragged={() => setShowRecenter(true)}
          />
        )}
      </View>

      <Animated.View
        style={[
          styles.plannerPanel,
          { transform: [{ translateY: keyboardTranslateY }] },
        ]}
      >
        {showRecenter && (
          <TouchableOpacity
            style={styles.recenterButton}
            onPress={handleRecenter}
          >
            <Text style={styles.recenterText}>Recenter</Text>
          </TouchableOpacity>
        )}
        
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
      </Animated.View>
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

  useEffect(() => {
    if (!value) {
      setQuery("");
    } else if (selectedBuilding) {
      setQuery(selectedBuilding.name);
    }
  }, [value, selectedBuilding]);
  
  const matchingBuildings = buildings.filter((b) =>
    b.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <View style={styles.pickerContainer}>
      {isOpen && query.length > 0 && (
        <ScrollView style={styles.dropdown} keyboardShouldPersistTaps="handled">
          {matchingBuildings.map((building) => (
            <TouchableOpacity
              key={building.id}
              style={styles.dropdownItem}
              onPress={() => {
                Keyboard.dismiss();
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
    bottom: 16,
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
  recenterButton: {
    position: "absolute",
    top: -56,
    right: 0,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 20,
  },
  recenterText: { fontWeight: "bold", color: "#333" },
  pickerContainer: { zIndex: 10, position: "relative" },
  input: { height: 48, borderColor: "#ccc", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#fff" },
  dropdown: { 
    maxHeight: 150, 
    backgroundColor: "#fff", 
    borderColor: "#ccc", 
    borderWidth: 1, 
    borderRadius: 8, 
    marginBottom: 4 
  },
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