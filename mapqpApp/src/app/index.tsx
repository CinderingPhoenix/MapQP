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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LocationMap from "../components/location-map";
import buildingData from "../data/wpi-buildings.json";
import { routeBetween, WalkingRoute } from "../utils/routing";
import { Ionicons } from "@expo/vector-icons";

let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: (event: string, listener: (event: any) => void) => void = () => {};

try {
  const speechModule = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = speechModule.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = speechModule.useSpeechRecognitionEvent;
} catch (err) {
  // Fallback safely when running in Expo Go where native module is missing
  console.warn("expo-speech-recognition is not available in this environment.");
}

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

type DirectionStep = {
  instruction: string;
  pointIndex: number;
};

// --- Constants ---

const SAMPLE_COUNT = 20;
const BASE_MAX_SAMPLE_AGE_MS = 20_000;
const OFF_ROUTE_THRESHOLD_METERS = 15;
const CAMPUS_CENTER = { latitude: 42.2744, longitude: -71.8075 };
const RECENT_SEARCHES_STORAGE_KEY = "@wpi_map_recent_searches";

const WPI_BUILDINGS: Building[] = buildingData.map((building) => ({
  id: building.name.toLowerCase().replaceAll(" ", "-"),
  name: building.name,
  entrances: building.entrances,
}));

// --- Geographic & Math Helpers ---

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

function getDistanceFromLatLonInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = deg2rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(deg2rad(lat2));
  const x =
    Math.cos(deg2rad(lat1)) * Math.sin(deg2rad(lat2)) -
    Math.sin(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function formatInstructionWithDistance(instruction: string, distMeters: number): string {
  return distMeters <= 5 ? `${instruction} now` : `${instruction} in ${formatDistance(distMeters)}`;
}

// --- Navigation & Routing Helpers ---

function generateDirections(geometry: [number, number][]): DirectionStep[] {
  const steps: DirectionStep[] = [];
  if (!geometry || geometry.length < 2) return steps;

  let lastBearing = getBearing(geometry[0][0], geometry[0][1], geometry[1][0], geometry[1][1]);

  for (let i = 1; i < geometry.length - 1; i++) {
    const p1 = geometry[i];
    const p2 = geometry[i + 1];

    const dist = getDistanceFromLatLonInMeters(p1[0], p1[1], p2[0], p2[1]);
    if (dist < 3) continue;

    const currentBearing = getBearing(p1[0], p1[1], p2[0], p2[1]);
    let diff = currentBearing - lastBearing;

    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    let instruction = "";
    if (diff > 45 && diff <= 135) instruction = "Turn right";
    else if (diff > 10 && diff <= 45) instruction = "Slight right";
    else if (diff < -45 && diff >= -135) instruction = "Turn left";
    else if (diff < -10 && diff >= -45) instruction = "Slight left";

    if (instruction) {
      const lastStep = steps[steps.length - 1];
      if (!lastStep || lastStep.instruction !== instruction || i - lastStep.pointIndex > 3) {
        steps.push({ instruction, pointIndex: i });
      }
      lastBearing = currentBearing;
    }
  }

  steps.push({ instruction: "Arrive at destination", pointIndex: geometry.length - 1 });
  return steps;
}

function getDistanceToStepPoint(
  geometry: [number, number][],
  currentIndex: number,
  targetIndex: number,
  userLat?: number,
  userLng?: number
): number {
  if (!geometry || currentIndex >= targetIndex) return 0;

  let totalMeters = 0;
  let startSegment = currentIndex;

  if (userLat !== undefined && userLng !== undefined && currentIndex + 1 < geometry.length) {
    totalMeters += getDistanceFromLatLonInMeters(
      userLat,
      userLng,
      geometry[currentIndex + 1][0],
      geometry[currentIndex + 1][1]
    );
    startSegment = currentIndex + 1;
  }

  for (let i = startSegment; i < targetIndex && i < geometry.length - 1; i++) {
    totalMeters += getDistanceFromLatLonInMeters(
      geometry[i][0],
      geometry[i][1],
      geometry[i + 1][0],
      geometry[i + 1][1]
    );
  }

  return Math.round(totalMeters);
}

function getSegmentDistance(
  geometry: [number, number][],
  startIndex: number,
  endIndex: number
): number {
  if (!geometry || startIndex >= endIndex) return 0;

  let totalMeters = 0;
  for (let i = startIndex; i < endIndex && i < geometry.length - 1; i++) {
    totalMeters += getDistanceFromLatLonInMeters(
      geometry[i][0],
      geometry[i][1],
      geometry[i + 1][0],
      geometry[i + 1][1]
    );
  }

  return Math.round(totalMeters);
}

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

  let t = Math.max(0, Math.min(1, (px * bx + py * by) / segmentLengthSquared));
  const closestLat = a.lat + t * by;
  const closestLng = a.lng + t * (b.lng - a.lng);

  return {
    lat: closestLat,
    lng: closestLng,
    distance: getDistanceFromLatLonInMeters(p.lat, p.lng, closestLat, closestLng),
  };
}

function snapToRouteGeometry(
  userLat: number,
  userLng: number,
  geometry: [number, number][],
  snapThresholdMeters = 12
) {
  if (!geometry || geometry.length < 2) return { lat: userLat, lng: userLng, index: 0 };

  let bestPoint = { lat: userLat, lng: userLng };
  let minDistance = Infinity;
  let bestIndex = 0;

  for (let i = 0; i < geometry.length - 1; i++) {
    const a = { lat: geometry[i][0], lng: geometry[i][1] };
    const b = { lat: geometry[i + 1][0], lng: geometry[i + 1][1] };
    const closest = getClosestPointOnSegment({ lat: userLat, lng: userLng }, a, b);

    if (closest.distance < minDistance) {
      minDistance = closest.distance;
      bestPoint = { lat: closest.lat, lng: closest.lng };
      bestIndex = i;
    }
  }

  if (minDistance <= snapThresholdMeters) {
    return { lat: bestPoint.lat, lng: bestPoint.lng, index: bestIndex };
  }

  return { lat: userLat, lng: userLng, index: bestIndex };
}

function isUserOffRoute(userLat: number, userLng: number, geometry: [number, number][]): boolean {
  if (!geometry || geometry.length === 0) return false;

  let minDistance = Infinity;
  for (const [lat, lng] of geometry) {
    const dist = getDistanceFromLatLonInMeters(userLat, userLng, lat, lng);
    if (dist < minDistance) minDistance = dist;
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
  return routes.reduce((fastest, candidate) =>
    candidate.duration < fastest.duration ? candidate : fastest
  );
}

// --- Kalman Filtering & Polling Helpers ---

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

    if (dt > BASE_MAX_SAMPLE_AGE_MS / 1000) {
      previousStateRef.current = null;
      isResumingFromBackground = true;
    } else if (dt > 0) {
      const distanceMovedMeters = getDistanceFromLatLonInMeters(
        prev.lat,
        prev.lng,
        incomingSample.latitude,
        incomingSample.longitude
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

      predictedLat += (vLatMps * dtSec) / 111320;
      predictedLng += (vLngMps * dtSec) / (111320 * Math.cos(prev.lat * (Math.PI / 180)));
    }

    const estimatedSpeedMps = incomingSample.speed !== null ? incomingSample.speed : 1.2;
    const processNoiseVar = Math.pow(Math.max(0.5, estimatedSpeedMps * 0.5) * dtSec, 2);

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
  if (sampleCount < SAMPLE_COUNT) return 500;

  const validSpeed = Math.max(0, speed);
  const rawInterval = 4000 * Math.exp(-0.75 * validSpeed);
  const clamped = Math.max(500, Math.min(rawInterval, 4000));
  return Math.round(clamped / 250) * 250;
}

// --- Main Screen Component ---

export default function Home() {
  const samplesRef = useRef<Coordinates[]>([]);
  const kalmanStateRef = useRef<KalmanState | null>(null);
  const initialLocationSet = useRef(false);

  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [mapCenter, setMapCenter] = useState(CAMPUS_CENTER);
  const [error, setError] = useState("");
  const [pollingInterval, setPollingInterval] = useState(1000);

  const [originLabel] = useState("Your current location");
  const [destinationBuilding, setDestinationBuilding] = useState("");
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");

  const [routeSteps, setRouteSteps] = useState<DirectionStep[]>([]);
  const [currentRouteIndex, setCurrentRouteIndex] = useState(0);
  const [directionsExpanded, setDirectionsExpanded] = useState(false);

  const [showRecenter, setShowRecenter] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const autoRouteKeyRef = useRef("");
  const routeGeometryRef = useRef<[number, number][] | null>(null);
  const isReroutingRef = useRef(false);

  const keyboardTranslateY = useRef(new Animated.Value(0)).current;

  // Sync keyboard offset animation
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardTranslateY, {
        toValue: -(e.endCoordinates.height + 10),
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

  // Route Planning Execution Logic
  const planRoute = useCallback(
    async (currentCoords?: Coordinates) => {
      const activeCoords = currentCoords || coordinates;
      setRouteError("");

      const destinationSelection = WPI_BUILDINGS.find((b) => b.id === destinationBuilding);
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
          label: originLabel,
        };

        const destinationEntrances = destinationSelection.entrances.map((_, index) =>
          buildingPoint(destinationSelection, index)
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
          })
        );

        const availableOutdoorRoutes = outdoorCandidates.filter(
          (candidate): candidate is RouteCandidate => candidate !== null
        );

        if (availableOutdoorRoutes.length === 0) {
          throw new Error("The walking route service could not find a route. Try again.");
        }

        const outdoorRoute = fastestRoute(availableOutdoorRoutes);
        setRoute(outdoorRoute);
        setRouteSteps(generateDirections(outdoorRoute.geometry));
        setCurrentRouteIndex(0);
      } catch (routeRequestError) {
        autoRouteKeyRef.current = "";
        setRouteError(
          routeRequestError instanceof Error
            ? routeRequestError.message
            : "The route could not be planned. Try again."
        );
      } finally {
        setRouteLoading(false);
        isReroutingRef.current = false;
      }
    },
    [destinationBuilding, coordinates, originLabel]
  );

  // Live Location Subscription
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
          mayShowUserSettingsDialog: true,
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
            let newRouteIndex = currentRouteIndex;

            if (routeGeometryRef.current && !isReroutingRef.current && destinationBuilding !== "") {
              const snapped = snapToRouteGeometry(displayLat, displayLng, routeGeometryRef.current);
              displayLat = snapped.lat;
              displayLng = snapped.lng;
              newRouteIndex = snapped.index;
            }

            setCoordinates({
              ...processed,
              latitude: displayLat,
              longitude: displayLng,
            });

            if (newRouteIndex !== currentRouteIndex) {
              setCurrentRouteIndex(newRouteIndex);
            }

            if (!initialLocationSet.current) {
              setMapCenter({ latitude: displayLat, longitude: displayLng });
              initialLocationSet.current = true;
            }

            if (
              routeGeometryRef.current &&
              !isReroutingRef.current &&
              destinationBuilding !== "" &&
              isUserOffRoute(processed.latitude, processed.longitude, routeGeometryRef.current)
            ) {
              isReroutingRef.current = true;
              void planRoute(processed);
            }

            const currentAccuracy = processed?.accuracy || location.coords.accuracy || 100;
            const currentSpeed = location.coords.speed || 0;
            const idealInterval = calculateSmartPollingInterval(
              currentAccuracy,
              currentSpeed,
              nextSamples.length
            );

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
  }, [destinationBuilding, planRoute, pollingInterval, currentRouteIndex]);

  // Trigger route planning when destination updates
  useEffect(() => {
    if (!destinationBuilding || !coordinates) return;

    const routeKey = `current::${destinationBuilding}`;
    if (autoRouteKeyRef.current === routeKey) return;

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
    setRouteSteps([]);
    setCurrentRouteIndex(0);
    setDirectionsExpanded(false);
  }, []);

  const handleRecenter = useCallback(() => {
    setShowRecenter(false);
    setRecenterSignal((prev) => prev + 1);
  }, []);

  const upcomingSteps = routeSteps.filter((s) => s.pointIndex >= currentRouteIndex);
  const nextStep = upcomingSteps.length > 0 ? upcomingSteps[0] : null;

  const distToNextStepMeters =
    route && nextStep && coordinates
      ? getDistanceToStepPoint(
          route.geometry,
          currentRouteIndex,
          nextStep.pointIndex,
          coordinates.latitude,
          coordinates.longitude
        )
      : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Banner: Navigation Steps & Summary */}
      {route && (
        <View style={[styles.topRouteSummary, directionsExpanded && styles.topRouteSummaryExpanded]}>
          {directionsExpanded ? (
            <View style={styles.expandedContainer}>
              <TouchableOpacity
                onPress={() => setDirectionsExpanded(false)}
                activeOpacity={0.7}
                style={styles.expandedHeader}
              >
                <Text style={styles.boldText}>Upcoming Directions</Text>
                <Text style={styles.collapseHint}>Tap to collapse</Text>
              </TouchableOpacity>

              <ScrollView
                style={styles.directionsList}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator={true}
              >
                {upcomingSteps.map((step, idx) => {
                  const stepDistMeters =
                    idx === 0
                      ? getDistanceToStepPoint(
                          route.geometry,
                          currentRouteIndex,
                          step.pointIndex,
                          coordinates?.latitude,
                          coordinates?.longitude
                        )
                      : getSegmentDistance(
                          route.geometry,
                          upcomingSteps[idx - 1].pointIndex,
                          step.pointIndex
                        );

                  return (
                    <View key={idx} style={styles.directionItem}>
                      <Text style={styles.directionInstruction}>
                        {formatInstructionWithDistance(step.instruction, stepDistMeters)}
                      </Text>
                    </View>
                  );
                })}
                {upcomingSteps.length === 0 && (
                  <View style={styles.directionItem}>
                    <Text style={styles.directionInstruction}>You have arrived!</Text>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity onPress={() => setDirectionsExpanded(false)} activeOpacity={0.7}>
                <Text style={[styles.subText, { marginTop: 10 }]}>
                  {formatDistance(route.distance)} • {formatDuration(route.duration)} left
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => setDirectionsExpanded(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.boldText}>
                {nextStep
                  ? formatInstructionWithDistance(nextStep.instruction, distToNextStepMeters)
                  : "Follow route"}
              </Text>
              <Text style={styles.subText}>
                {formatDistance(route.distance)} total • {formatDuration(route.duration)}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Map Interactive Canvas */}
      <View
        style={styles.mapCanvas}
        onStartShouldSetResponderCapture={() => {
          Keyboard.dismiss();
          if (directionsExpanded) setDirectionsExpanded(false);
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

      {/* Bottom Route Planner */}
      <Animated.View style={[styles.plannerPanel, { transform: [{ translateY: keyboardTranslateY }] }]}>
        {showRecenter && (
          <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}>
            <Text style={styles.recenterText}>Recenter</Text>
          </TouchableOpacity>
        )}

        <BuildingPicker
          buildings={WPI_BUILDINGS}
          value={destinationBuilding}
          onChange={handleDestinationChange}
          onCancel={handleCancelRoute}
          placeholder="Search WPI destinations..."
        />

        {routeError !== "" && <Text style={styles.errorText}>{routeError}</Text>}
      </Animated.View>
    </SafeAreaView>
  );
}

// --- Building Picker Subcomponent ---

type BuildingPickerProps = {
  buildings: Building[];
  value: string;
  onChange: (buildingId: string) => void;
  onCancel: () => void;
  placeholder: string;
};

const BuildingPicker = React.memo(
  ({ buildings, value, onChange, onCancel, placeholder }: BuildingPickerProps) => {
    const selectedBuilding = buildings.find((b) => b.id === value);
    const [query, setQuery] = useState(selectedBuilding?.name ?? "");
    const [isOpen, setIsOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [recentSearchIds, setRecentSearchIds] = useState<string[]>([]);
    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const recentBuildings = recentSearchIds
      .map((id) => buildings.find((b) => b.id === id))
      .filter((b): b is Building => b !== undefined);

    const isQueryEmpty = query.trim() === "";

    // Safely register speech events only if the native module exists
    useSpeechRecognitionEvent("result", (event: any) => {
      const spokenText = event.results[0]?.transcript;
      if (spokenText) {
        setQuery(spokenText);
        setIsOpen(true);

        const matched = buildings.find((b) =>
          b.name.toLowerCase().includes(spokenText.toLowerCase().trim())
        );
        if (matched) {
          if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
          onChange(matched.id);
          setQuery(matched.name);
          saveRecentSearch(matched.id);
          setIsOpen(false);
          Keyboard.dismiss();
        }
      }
    });

    useSpeechRecognitionEvent("end", () => {
      setIsListening(false);
    });

    useSpeechRecognitionEvent("error", (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    });

    const handleVoiceSearch = async () => {
      if (value) return; // Prevent voice search if destination is already set

      try {
        if (!ExpoSpeechRecognitionModule || typeof ExpoSpeechRecognitionModule.isRecognitionAvailable !== "function") {
          Alert.alert(
            "Expo Go Limitation",
            "Voice search requires a custom development build and is disabled inside Expo Go."
          );
          return;
        }

        const isAvailable = await ExpoSpeechRecognitionModule.isRecognitionAvailable();
        if (!isAvailable) {
          Alert.alert("Unavailable", "Speech recognition is not available or supported on this device.");
          return;
        }

        const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!result.granted) {
          Alert.alert("Permission required", "Microphone and speech recognition permissions are needed for voice search.");
          return;
        }

        if (isListening) {
          ExpoSpeechRecognitionModule.stop();
          setIsListening(false);
          return;
        }

        setQuery("");
        setIsOpen(false);
        setIsListening(true);

        ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: true,
          maxAlternatives: 1,
        });
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
        setIsListening(false);
        Alert.alert("Error", "Could not start voice search on this device.");
      }
    };

    useEffect(() => {
      const loadRecentSearches = async () => {
        try {
          const jsonVal = await AsyncStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
          if (jsonVal) {
            const parsed = JSON.parse(jsonVal);
            if (Array.isArray(parsed)) setRecentSearchIds(parsed);
          }
        } catch (err) {
          console.error("Failed to load recent searches:", err);
        }
      };
      loadRecentSearches();

      return () => {
        if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        if (isListening && ExpoSpeechRecognitionModule?.stop) {
          ExpoSpeechRecognitionModule.stop();
        }
      };
    }, [isListening]);

    useEffect(() => {
      if (!value) {
        setQuery("");
      } else if (selectedBuilding) {
        setQuery(selectedBuilding.name);
      }
    }, [value, selectedBuilding]);

    const saveRecentSearch = useCallback(
      async (buildingId: string) => {
        try {
          const updated = [buildingId, ...recentSearchIds.filter((id) => id !== buildingId)].slice(0, 5);
          setRecentSearchIds(updated);
          await AsyncStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to save recent search:", err);
        }
      },
      [recentSearchIds]
    );

    const clearRecentSearches = useCallback(async () => {
      try {
        setRecentSearchIds([]);
        await AsyncStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
      } catch (err) {
        console.error("Failed to clear recent searches:", err);
      }
    }, []);

    const handleFocus = useCallback(() => {
      if (value) return; // Do not open dropdown on focus if route/destination is active
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      if (query.trim() === "" && recentBuildings.length === 0) {
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    }, [query, recentBuildings.length, value]);

    const handleBlur = useCallback(() => {
      blurTimeoutRef.current = setTimeout(() => setIsOpen(false), 150);
    }, []);

    const handleSelectBuilding = useCallback(
      (building: Building) => {
        if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        Keyboard.dismiss();
        onChange(building.id);
        setQuery(building.name);
        saveRecentSearch(building.id);
        setIsOpen(false);
      },
      [onChange, saveRecentSearch]
    );

    const matchingBuildings = buildings.filter((b) =>
      b.name.toLowerCase().includes(query.trim().toLowerCase())
    );

    return (
      <View style={styles.pickerContainer}>
        {isOpen && !value && (
          <ScrollView
            style={styles.dropdown}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="always"
          >
            {isQueryEmpty ? (
              recentBuildings.length > 0 && (
                <>
                  <View style={styles.dropdownHeader}>
                    <Text style={styles.dropdownHeaderText}>Recent Searches</Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
                        clearRecentSearches();
                      }}
                    >
                      <Text style={styles.clearRecentText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                  {recentBuildings.map((building) => (
                    <TouchableOpacity
                      key={`recent-${building.id}`}
                      style={styles.dropdownItem}
                      onPress={() => handleSelectBuilding(building)}
                    >
                      <Text style={styles.dropdownItemText}>{building.name}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )
            ) : (
              matchingBuildings.map((building) => (
                <TouchableOpacity
                  key={building.id}
                  style={styles.dropdownItem}
                  onPress={() => handleSelectBuilding(building)}
                >
                  <Text style={styles.dropdownItemText}>{building.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}
        <View style={styles.inputWrapper}>
          <TouchableOpacity
            style={[styles.micButton, value !== "" && { opacity: 0.4 }]}
            disabled={!!value}
            onPress={() => {
              if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
              void handleVoiceSearch();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isListening ? "mic" : "mic-outline"}
              size={20}
              color={isListening ? "#1d5962" : "#666"}
            />
          </TouchableOpacity>

          <TextInput
            style={[
              styles.input,
              styles.inputWithMic,
              (value !== "" || query !== "") && styles.inputWithClear,
              value !== "" && { backgroundColor: "#f9f9f9", color: "#333" },
            ]}
            value={query}
            editable={!value} // Disables typing/focus when a destination is set
            onChangeText={(text) => {
              setQuery(text);
              onChange("");
              if (text.trim() === "") {
                setIsOpen(recentBuildings.length > 0);
              } else {
                setIsOpen(true);
              }
            }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onSubmitEditing={() => setIsOpen(false)}
            placeholder={isListening ? "Listening..." : placeholder}
          />
          {(value !== "" || query !== "") && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
                if (isListening && ExpoSpeechRecognitionModule?.stop) {
                  ExpoSpeechRecognitionModule.stop();
                }
                setQuery("");
                setIsOpen(false);
                onCancel();
                Keyboard.dismiss();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.cancelButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }
);

// --- Stylesheet ---

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  mapCanvas: { ...StyleSheet.absoluteFill, backgroundColor: "#e0e0e0" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  topRouteSummary: {
    position: "absolute",
    top: 56,
    left: 16,
    right: 16,
    zIndex: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  topRouteSummaryExpanded: {
    height: 480,
  },
  expandedContainer: { flex: 1, flexDirection: "column" },
  expandedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
  },
  collapseHint: { fontSize: 13, color: "#888" },
  directionsList: { flex: 1, marginTop: 4 },
  directionItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  directionInstruction: { fontSize: 19, fontWeight: "500", color: "#333" },
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
  inputWrapper: { position: "relative", justifyContent: "center" },
  input: {
    height: 48,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  inputWithMic: { paddingLeft: 40 },
  inputWithClear: { paddingRight: 40 },
  micButton: {
    position: "absolute",
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 11,
  },
  clearButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 11,
  },
  cancelButtonText: { fontSize: 18, fontWeight: "bold", color: "#666" },
  dropdown: {
    maxHeight: 280,
    backgroundColor: "#fff",
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  dropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f7f7f7",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  dropdownHeaderText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#666",
    textTransform: "uppercase",
  },
  clearRecentText: { fontSize: 12, color: "#d9534f", fontWeight: "600" },
  dropdownItem: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  dropdownItemText: { fontSize: 16, color: "#333" },
  routeOrigin: { marginTop: 12 },
  smallText: { fontSize: 13, color: "#666" },
  subText: { fontSize: 16, color: "#555", marginTop: 4 },
  boldText: { fontSize: 22, fontWeight: "bold", color: "#1d5962" },
  bottomBoldText: { fontSize: 16, fontWeight: "bold" },
  errorText: { color: "red", marginTop: 8 },
});