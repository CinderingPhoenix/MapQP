// map-logic.ts

import { useSettings } from "@/context/settings-context";
import * as SecureStore from "expo-secure-store";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Vibration } from "react-native";
import { NavigationPoint, routeBetween, WalkingRoute } from "./routing";
import { useFocusEffect } from "expo-router"; // ✅ Use Expo Router's hook instead

import { NavigationSpeech, initialSpeechStages, type StepSpeechStage } from "./navigation-speech";

export type Point = {
  latitude: number;
  longitude: number;
  label: string;
};

export type RoutePlan = WalkingRoute & {
  arrivalTime: number;
  origin: Point;
  destination: Point;
};

export type Building = {
  id: string;
  name: string;
  entrances: readonly {
    latitude: number;
    longitude: number;
    name: string;
    floor?: number;
    accessibility: boolean;
  }[];
};

export type Coordinates = {
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
  variance: number;
  timestamp: number;
  consecutiveOutliers: number;
};

export type DirectionStep = {
  instruction: string;
  pointIndex: number;
  turnDegrees?: number;
};

type OrientationPrompt = {
  direction: "left" | "right" | "around";
  timestamp: number;
};

type RouteCandidate = WalkingRoute & {
  origin: Point;
  destination: Point;
};

const BASE_MAX_SAMPLE_AGE_MS = 20_000;
const OFF_ROUTE_THRESHOLD_METERS = 15;
const CAMPUS_CENTER = { latitude: 42.2744, longitude: -71.8075 };
const LAST_LOCATION_STORAGE_KEY = "wpi_map_last_location";

export function parseBuildingData(rawBuildings: any[]): Building[] {
  if (!Array.isArray(rawBuildings)) {
    console.error("Expected an array for rawBuildings, but received:", typeof rawBuildings);
    return [];
  }

  return rawBuildings.map((building) => {
    const name = building.name || (Array.isArray(building) ? building[0] : "");
    const rawEntrances = building.entrances || (Array.isArray(building) ? building[1] : []);

    const entrances = (Array.isArray(rawEntrances) ? rawEntrances : []).map((entrance: any) => {
      if (Array.isArray(entrance)) {
        // Tuple format support: [latitude, longitude, name, floor, accessibility]
        return {
          latitude: entrance[0],
          longitude: entrance[1],
          name: entrance[2],
          floor: entrance[3],
          accessibility: entrance[4],
        };
      } else {
        // Object format support from wpi-buildings.json
        return {
          latitude: entrance.latitude,
          longitude: entrance.longitude,
          name: entrance.name || "Main Entrance",
          floor: entrance.floor,
          accessibility: !!entrance.accessibility,
        };
      }
    });

    return {
      id: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      name,
      entrances,
    };
  });
}

export function getSimilarityScore(str1: string, str2: string): number {
  const a = str1.toLowerCase().trim();
  const b = str2.toLowerCase().trim();
  if (a.length === 0) return b.length === 0 ? 1 : 0;
  if (b.length === 0) return 0;

  const matrix = Array.from({ length: b.length + 1 }, () => new Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      matrix[j][i] = b[j - 1] === a[i - 1]
        ? matrix[j - 1][i - 1]
        : Math.min(matrix[j - 1][i - 1] + 1, matrix[j][i - 1] + 1, matrix[j - 1][i] + 1);
    }
  }
  const distance = matrix[b.length][a.length];
  return (Math.max(a.length, b.length) - distance) / Math.max(a.length, b.length);
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = deg2rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(deg2rad(lat2));
  const x = Math.cos(deg2rad(lat1)) * Math.sin(deg2rad(lat2)) - Math.sin(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function formatDistance(meters: number, units: "imperial" | "metric" = "metric"): string {
  if (units === "imperial") {
    const feet = meters * 3.28084;
    if (feet < 5280) return `${Math.round(feet)} ft`;
    return `${(feet / 5280).toFixed(1)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatArrivalTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

export function formatInstructionWithDistance(instruction: string, distMeters: number, units: "imperial" | "metric" = "metric", isCurrentStep = true): string {
  const message = instruction === "Arrive at destination"
    ? "You will arrive at your destination"
    : instruction;
  return isCurrentStep && distMeters <= 5 ? `${message} now` : `${message} in ${formatDistance(distMeters, units)}`;
}

function closestGeometryIndex(geometry: [number, number][], point: [number, number]): number {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < geometry.length; index++) {
    const distance = getDistanceFromLatLonInMeters(geometry[index][0], geometry[index][1], point[0], point[1]);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }
  return closestIndex;
}

export function formatDirectionInstruction(step: DirectionStep, style: "natural" | "degrees"): string {
  if (style === "natural" || step.turnDegrees === undefined || step.instruction === "Arrive at destination") {
    return step.instruction;
  }
  const degrees = Math.round(Math.abs(step.turnDegrees));
  if (degrees <= 15) return "Continue straight";
  if (step.turnDegrees > 0) return `Turn right ${degrees}°`;
  return `Turn left ${degrees}°`;
}

export function generateDirections(geometry: [number, number][], navigationPath: NavigationPoint[] = []): DirectionStep[] {
  const steps: DirectionStep[] = [];
  if (!geometry || geometry.length < 2) return steps;

  for (let index = 1; index < navigationPath.length - 1; index++) {
    const decisionPoint = navigationPath[index];
    if (decisionPoint.connectionCount <= 2) continue;

    const previousPoint = navigationPath[index - 1].coordinate;
    const currentPoint = decisionPoint.coordinate;
    const nextPoint = navigationPath[index + 1].coordinate;
    const incomingBearing = getBearing(...previousPoint, ...currentPoint);
    const outgoingBearing = getBearing(...currentPoint, ...nextPoint);
    let diff = outgoingBearing - incomingBearing;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    // Small changes in mapped path geometry are bends, not maneuvers.
    // Do not add a straight-ahead instruction for these junctions.
    if (Math.abs(diff) <= 30) continue;
    const instruction = diff > 45 ? "Turn right" : diff > 0 ? "Slight right" : diff < -45 ? "Turn left" : "Slight left";
    const pointIndex = closestGeometryIndex(geometry, currentPoint);
    const lastStep = steps[steps.length - 1];
    // Smoothed geometry can have many vertices within a few meters. Merge
    // repeated instructions by walking distance rather than vertex count.
    if (lastStep && pointIndex <= lastStep.pointIndex) continue;
    if (lastStep && lastStep.instruction === instruction &&
        getSegmentDistance(geometry, lastStep.pointIndex, pointIndex) <= 10) continue;
    steps.push({ instruction, pointIndex, turnDegrees: diff });
  }
  steps.push({ instruction: "Arrive at destination", pointIndex: geometry.length - 1 });
  return steps;
}

export function getDistanceToStepPoint(geometry: [number, number][], currentIndex: number, targetIndex: number, userLat?: number, userLng?: number): number {
  if (!geometry || currentIndex >= targetIndex) return 0;
  let totalMeters = 0;
  let startSegment = currentIndex;
  if (userLat !== undefined && userLng !== undefined && currentIndex + 1 < geometry.length) {
    totalMeters += getDistanceFromLatLonInMeters(userLat, userLng, ...geometry[currentIndex + 1]);
    startSegment = currentIndex + 1;
  }
  for (let i = startSegment; i < targetIndex && i < geometry.length - 1; i++) totalMeters += getDistanceFromLatLonInMeters(...geometry[i], ...geometry[i + 1]);
  return Math.round(totalMeters);
}

export function getSegmentDistance(geometry: [number, number][], startIndex: number, endIndex: number): number {
  if (!geometry || startIndex >= endIndex) return 0;
  let totalMeters = 0;
  for (let i = startIndex; i < endIndex && i < geometry.length - 1; i++) totalMeters += getDistanceFromLatLonInMeters(...geometry[i], ...geometry[i + 1]);
  return Math.round(totalMeters);
}

function getClosestPointOnSegment(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const cosLat = Math.cos(deg2rad(a.lat));
  const px = (p.lng - a.lng) * cosLat;
  const py = p.lat - a.lat;
  const bx = (b.lng - a.lng) * cosLat;
  const by = b.lat - a.lat;
  const lengthSquared = bx * bx + by * by;
  if (lengthSquared === 0) return { lat: a.lat, lng: a.lng, distance: getDistanceFromLatLonInMeters(p.lat, p.lng, a.lat, a.lng) };
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared));
  const lat = a.lat + t * by;
  const lng = a.lng + t * (b.lng - a.lng);
  return { lat, lng, distance: getDistanceFromLatLonInMeters(p.lat, p.lng, lat, lng) };
}

function snapToRouteGeometry(userLat: number, userLng: number, geometry: [number, number][], snapThresholdMeters = 12) {
  if (!geometry || geometry.length < 2) return { lat: userLat, lng: userLng, index: 0 };
  let bestPoint = { lat: userLat, lng: userLng };
  let minDistance = Infinity;
  let bestIndex = 0;
  for (let i = 0; i < geometry.length - 1; i++) {
    const closest = getClosestPointOnSegment({ lat: userLat, lng: userLng }, { lat: geometry[i][0], lng: geometry[i][1] }, { lat: geometry[i + 1][0], lng: geometry[i + 1][1] });
    if (closest.distance < minDistance) {
      minDistance = closest.distance;
      bestPoint = closest;
      bestIndex = i;
    }
  }
  return minDistance <= snapThresholdMeters ? { ...bestPoint, index: bestIndex } : { lat: userLat, lng: userLng, index: bestIndex };
}

function isUserOffRoute(userLat: number, userLng: number, geometry: [number, number][]): boolean {
  if (!geometry.length) return false;
  return Math.min(...geometry.map(([lat, lng]) => getDistanceFromLatLonInMeters(userLat, userLng, lat, lng))) > OFF_ROUTE_THRESHOLD_METERS;
}

function processAdvancedCoordinates(incomingSample: Coordinates, previousStateRef: React.MutableRefObject<KalmanState | null>): Coordinates | null {
  const accuracy = Math.max(incomingSample.accuracy || 2, 2);
  if (accuracy > 20 && !previousStateRef.current) return null;
  if (!previousStateRef.current) {
    previousStateRef.current = { lat: incomingSample.latitude, lng: incomingSample.longitude, variance: accuracy ** 2, timestamp: incomingSample.timestamp, consecutiveOutliers: 0 };
    return incomingSample;
  }
  const previous = previousStateRef.current;
  const dt = Math.max(0.1, (incomingSample.timestamp - previous.timestamp) / 1000);
  if (dt > BASE_MAX_SAMPLE_AGE_MS / 1000) {
    previousStateRef.current = { lat: incomingSample.latitude, lng: incomingSample.longitude, variance: accuracy ** 2, timestamp: incomingSample.timestamp, consecutiveOutliers: 0 };
    return incomingSample;
  }
  const distanceMoved = getDistanceFromLatLonInMeters(previous.lat, previous.lng, incomingSample.latitude, incomingSample.longitude);
  if (distanceMoved / dt > 6.5 && distanceMoved > 15 && accuracy > 8) {
    previous.consecutiveOutliers += 1;
    if (previous.consecutiveOutliers < 3) return { ...incomingSample, latitude: previous.lat, longitude: previous.lng, accuracy: Math.sqrt(previous.variance) };
  }
  previous.consecutiveOutliers = 0;
  const predictedVariance = previous.variance + (1.5 * dt) ** 2;
  const gain = predictedVariance / (predictedVariance + accuracy ** 2);
  const latitude = previous.lat + gain * (incomingSample.latitude - previous.lat);
  const longitude = previous.lng + gain * (incomingSample.longitude - previous.lng);
  const variance = (1 - gain) * predictedVariance;
  previousStateRef.current = { lat: latitude, lng: longitude, variance, timestamp: incomingSample.timestamp, consecutiveOutliers: 0 };
  return { ...incomingSample, latitude, longitude, accuracy: Math.max(2, Math.min(Math.sqrt(variance), 2)) };
}

function fastestRoute(routes: RouteCandidate[]): RouteCandidate {
  return routes.reduce((fastest, candidate) => (candidate.duration < fastest.duration ? candidate : fastest));
}

export function useMapNavigation(buildings: Building[]) {
  const [isFocused, setIsFocused] = useState(true);
  const speechRef = useRef<NavigationSpeech | null>(null);
  if (!speechRef.current) speechRef.current = new NavigationSpeech(Speech);
  const navigationSpeech = speechRef.current;
  const audioMutedRef = useRef(false);
  const screenFocusedRef = useRef(true);
  const spokenDestinationRef = useRef<string | null>(null);
  const speechGeometryRef = useRef<[number, number][] | null>(null);

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      navigationSpeech.setEnabled(!audioMutedRef.current);
      setIsFocused(true);
      return () => {
        screenFocusedRef.current = false;
        setIsFocused(false);
        navigationSpeech.setEnabled(false);
        Speech.stop();
      };
    }, [navigationSpeech])
  );

  const kalmanStateRef = useRef<KalmanState | null>(null);
  const initialLocationSet = useRef(false);
  const spokenStagesRef = useRef<Record<number, StepSpeechStage>>({});
  const orientationPromptRef = useRef<OrientationPrompt | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [mapCenter, setMapCenter] = useState(CAMPUS_CENTER);
  const [error, setError] = useState("");
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [destinationBuilding, setDestinationBuilding] = useState("");
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [routeDestinationBuilding, setRouteDestinationBuilding] = useState<string | null>(null);
  const [, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeSteps, setRouteSteps] = useState<DirectionStep[]>([]);
  const [currentRouteIndex, setCurrentRouteIndex] = useState(0);
  const [showRecenter, setShowRecenter] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [routeLoadingProgress, setRouteLoadingProgress] = useState(0);
  const [currentHeading, setCurrentHeading] = useState<number | null>(null);

  const progressAnimationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRouteKeyRef = useRef("");
  const routeGeometryRef = useRef<[number, number][] | null>(null);
  const isReroutingRef = useRef(false);
  const destinationBuildingRef = useRef(destinationBuilding);
  const isRouteCancelledRef = useRef(false);
  const offRouteCountRef = useRef(0);
  const showRecenterRef = useRef(showRecenter);
  const { distanceUnits, directionStyle, navigationMode } = useSettings();

  useEffect(() => { destinationBuildingRef.current = destinationBuilding; }, [destinationBuilding]);
  useEffect(() => { showRecenterRef.current = showRecenter; }, [showRecenter]);
  useEffect(() => { routeGeometryRef.current = route?.geometry ?? null; }, [route]);

  const handleCancelRoute = useCallback(() => {
    isRouteCancelledRef.current = true;
    destinationBuildingRef.current = "";
    autoRouteKeyRef.current = "";
    routeGeometryRef.current = null;
    isReroutingRef.current = false;
    navigationSpeech.cancel();
    spokenDestinationRef.current = null;
    speechGeometryRef.current = null;
    spokenStagesRef.current = {};
    orientationPromptRef.current = null;
    if (progressAnimationRef.current) clearInterval(progressAnimationRef.current);
    setRouteLoadingProgress(0);
    setRoute(null);
    setRouteDestinationBuilding(null);
    setDestinationBuilding("");
    setRouteError("");
    setRouteSteps([]);
    setCurrentRouteIndex(0);
  }, [navigationSpeech]);

  const prevNavigationModeRef = useRef(navigationMode);
  
  useEffect(() => {
    if (prevNavigationModeRef.current !== navigationMode) {
      prevNavigationModeRef.current = navigationMode;
      if (route) {
        handleCancelRoute();
      }
    }
  }, [navigationMode, route, handleCancelRoute]);

  useEffect(() => {
    SecureStore.getItemAsync(LAST_LOCATION_STORAGE_KEY).then((savedLocation) => {
      if (!savedLocation || initialLocationSet.current) return;
      const parsed = JSON.parse(savedLocation);
      if (parsed.latitude && parsed.longitude) setMapCenter({ latitude: parsed.latitude, longitude: parsed.longitude });
    }).catch((loadError) => console.error("Failed to load last known location:", loadError));
  }, []);

  const toggleMute = useCallback(() => {
    const muted = !audioMutedRef.current;
    audioMutedRef.current = muted;
    navigationSpeech.setEnabled(!muted && screenFocusedRef.current);
    setIsAudioMuted(muted);
  }, [navigationSpeech]);

  const startRoutePreviewCountdown = useCallback(() => {
    setRouteLoadingProgress(0);
    if (progressAnimationRef.current) clearInterval(progressAnimationRef.current);
    const startTime = Date.now();
    progressAnimationRef.current = setInterval(() => {
      const progress = Math.min((Date.now() - startTime) / 4000, 1);
      setRouteLoadingProgress(progress);
      if (progress >= 1 && progressAnimationRef.current) clearInterval(progressAnimationRef.current);
    }, 50);
  }, []);

  const planRoute = useCallback(async (currentCoords?: Coordinates) => {
    const targetBuilding = destinationBuildingRef.current;
    setRouteError("");
    
    const selectedBuilding = buildings.find((building) => building.id === targetBuilding);
    const activeCoords = currentCoords || coordinates;
    
    if (!targetBuilding) return;
    if (!selectedBuilding) return setRouteError("Choose a WPI destination building.");
    if (!activeCoords) return setRouteError("Waiting for your current location before planning.");
    
    setRouteLoading(true);
    try {
      const origin = { latitude: activeCoords.latitude, longitude: activeCoords.longitude, label: "Your current location" };
      const accessibleOnly = navigationMode === "accessibility";
      const entrances = selectedBuilding.entrances.filter(
        (entrance) => !accessibleOnly || entrance.accessibility
      );
      if (entrances.length === 0) {
        throw new Error("This building has no accessible entrance.");
      }
      const candidates = await Promise.all(entrances.map(async (entrance) => {
        const destination = {
          latitude: entrance.latitude,
          longitude: entrance.longitude,
          label: `${selectedBuilding.name} ${entrance.name}`,
        };
        try {
          return {
            ...(await routeBetween(origin, destination, { accessibleOnly })),
            origin,
            destination,
          };
        } catch {
          return null;
        }
      }));
      if (destinationBuildingRef.current !== targetBuilding || isRouteCancelledRef.current) return;
      const availableRoutes = candidates.filter((candidate): candidate is RouteCandidate => candidate !== null);
      if (!availableRoutes.length) throw new Error("The walking route service could not find a route. Try again.");
      const fastest = fastestRoute(availableRoutes);
      const selectedRoute = {
        ...fastest,
        arrivalTime: Date.now() + fastest.duration * 1000,
      };
      setRoute(selectedRoute);
      setRouteDestinationBuilding(targetBuilding);
      const steps = generateDirections(selectedRoute.geometry, selectedRoute.navigationPath);
      setRouteSteps(steps);
      setCurrentRouteIndex(0);
      startRoutePreviewCountdown();
      const newNavigation = spokenDestinationRef.current !== targetBuilding;
      const previousGeometry = speechGeometryRef.current;
      const geometryChanged = !previousGeometry || previousGeometry.length !== selectedRoute.geometry.length ||
        selectedRoute.geometry.some((point, index) =>
          point[0] !== previousGeometry[index][0] || point[1] !== previousGeometry[index][1]);
      if (newNavigation || geometryChanged) spokenStagesRef.current = {};
      speechGeometryRef.current = selectedRoute.geometry;
      if (newNavigation) {
        spokenDestinationRef.current = targetBuilding;
        navigationSpeech.cancel();
        const firstStep = steps[0];
        const distance = firstStep
          ? getDistanceToStepPoint(selectedRoute.geometry, 0, firstStep.pointIndex, activeCoords.latitude, activeCoords.longitude)
          : selectedRoute.distance;
        const instruction = firstStep
          ? `${formatDirectionInstruction(firstStep, directionStyle)} in ${formatDistance(distance, distanceUnits)}`
          : `Route distance ${formatDistance(distance, distanceUnits)}`;
        const accepted = navigationSpeech.request(`Navigating to ${selectedBuilding.name}. ${instruction}.`, "startup");
        if (accepted && firstStep) {
          const stages = initialSpeechStages(distance);
          if (firstStep.instruction === "Arrive at destination" && distance <= 5) stages.turn = true;
          spokenStagesRef.current[firstStep.pointIndex] = stages;
        }
      }
    } catch (routeRequestError) {
      if (destinationBuildingRef.current === targetBuilding && !isRouteCancelledRef.current) {
        autoRouteKeyRef.current = "";
        setRouteError(routeRequestError instanceof Error ? routeRequestError.message : "The route could not be planned. Try again.");
      }
    } finally {
      setRouteLoading(false);
      isReroutingRef.current = false;
    }
  }, [
    coordinates,
    buildings,
    navigationMode,
    navigationSpeech,
    distanceUnits,
    directionStyle,
    startRoutePreviewCountdown,
    isFocused,
    buildings,
  ]);

  const planRouteRef = useRef(planRoute);
  const currentRouteIndexRef = useRef(currentRouteIndex);
  useEffect(() => { planRouteRef.current = planRoute; }, [planRoute]);
  useEffect(() => { currentRouteIndexRef.current = currentRouteIndex; }, [currentRouteIndex]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let isMounted = true;
    const initializeLocation = async () => {
      const permissions = await Location.requestForegroundPermissionsAsync();
      if (permissions.status !== "granted") { if (isMounted) setError("Location permission is required to plan a route."); return; }
      subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 250, distanceInterval: 0, mayShowUserSettingsDialog: true }, (location) => {
        if (!isMounted) return;
        const processed = processAdvancedCoordinates({ ...location.coords, accuracy: location.coords.accuracy || 0, timestamp: location.timestamp } as Coordinates, kalmanStateRef);
        if (!processed) return;
        let displayLat = processed.latitude;
        let displayLng = processed.longitude;
        let newRouteIndex = currentRouteIndexRef.current;
        if (routeGeometryRef.current && !isReroutingRef.current && destinationBuildingRef.current) {
          const snapped = snapToRouteGeometry(displayLat, displayLng, routeGeometryRef.current);
          displayLat = snapped.lat;
          displayLng = snapped.lng;
          newRouteIndex = snapped.index;
        }
        const displayedCoordinates = { ...processed, latitude: displayLat, longitude: displayLng };
        setCoordinates(displayedCoordinates);
        if (!showRecenterRef.current) setMapCenter({ latitude: displayLat, longitude: displayLng });
        SecureStore.setItemAsync(LAST_LOCATION_STORAGE_KEY, JSON.stringify({ latitude: displayLat, longitude: displayLng })).catch((saveError) => console.error("Failed to save location", saveError));
        if (newRouteIndex !== currentRouteIndexRef.current) setCurrentRouteIndex(newRouteIndex);
        if (!initialLocationSet.current) { setMapCenter({ latitude: displayLat, longitude: displayLng }); initialLocationSet.current = true; }
        if (routeGeometryRef.current && !isReroutingRef.current && destinationBuildingRef.current) {
          if (isUserOffRoute(processed.latitude, processed.longitude, routeGeometryRef.current)) {
            offRouteCountRef.current += 1;
            if (offRouteCountRef.current >= 2) { isReroutingRef.current = true; offRouteCountRef.current = 0; void planRouteRef.current(processed); }
          } else offRouteCountRef.current = 0;
        }
        setError("");
      });
    };
    initializeLocation().catch((locationError) => { if (isMounted) setError(locationError instanceof Error ? locationError.message : "Unable to access your location."); });
    return () => { isMounted = false; subscription?.remove(); };
  }, []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let isMounted = true;

    Location.watchHeadingAsync((headingData) => {
      if (!isMounted) return;
      const heading = headingData.trueHeading >= 0 ? headingData.trueHeading : headingData.magHeading;
      if (Number.isFinite(heading) && heading >= 0) {
        setCurrentHeading(heading % 360);
      }
    }).then((nextSubscription) => {
      if (isMounted) subscription = nextSubscription;
      else nextSubscription.remove();
    }).catch((headingError) => {
      console.warn("Unable to track heading for route guidance:", headingError);
    });

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (!destinationBuilding || !coordinates) return;
    const routeKey = `current::${destinationBuilding}`;
    if (autoRouteKeyRef.current === routeKey) return;
    isRouteCancelledRef.current = false;
    autoRouteKeyRef.current = routeKey;
    void planRoute();
  }, [coordinates, destinationBuilding, planRoute]);

  const handleDestinationChange = useCallback((buildingId: string) => {
    isRouteCancelledRef.current = false;
    autoRouteKeyRef.current = "";
    setDestinationBuilding(buildingId);
    if (buildingId) void planRoute();
  }, [planRoute]);

  const handleRecenter = useCallback(() => { setShowRecenter(false); setRecenterSignal((previous) => previous + 1); }, []);
  const upcomingSteps = routeSteps.filter((step) => step.pointIndex >= currentRouteIndex);
  const nextStep = upcomingSteps[0] ?? null;
  const nextStepInstruction = nextStep
    ? formatDirectionInstruction(nextStep, directionStyle)
    : null;
  const distToNextStepMeters = route && nextStep && coordinates ? getDistanceToStepPoint(route.geometry, currentRouteIndex, nextStep.pointIndex, coordinates.latitude, coordinates.longitude) : 0;

  useEffect(() => {
    if (!isFocused || navigationMode !== "accessibility") {
      return;
    }

    if (!route || !coordinates || isRouteCancelledRef.current) {
      return;
    }

    const activeHeading = currentHeading !== null ? currentHeading : coordinates.heading;

    if (activeHeading === null || activeHeading === undefined) {
      return;
    }

    const lookAheadIndex = Math.min(currentRouteIndex + 1, route.geometry.length - 1);
    if (lookAheadIndex <= currentRouteIndex) return;

    const routeBearing = getBearing(
      coordinates.latitude,
      coordinates.longitude,
      route.geometry[lookAheadIndex][0],
      route.geometry[lookAheadIndex][1],
    );
    
    const diff = (routeBearing - activeHeading + 360) % 360;

    let direction: "left" | "right" | "around" | "facing";
    if (diff <= 15 || diff >= 345) {
      direction = "facing";
    } else if (diff >= 135 && diff <= 225) {
      direction = "around";
    } else if (diff < 180) {
      direction = "right";
    } else {
      direction = "left";
    }

    if (isAudioMuted) return;
    if (nextStep?.instruction === "Arrive at destination" && distToNextStepMeters <= 5) return;
    if (diff <= 15 || diff >= 345) return;

    const now = Date.now();
    const previousPrompt = orientationPromptRef.current;
    
    if (previousPrompt && now - previousPrompt.timestamp < 8_000) return;

    const promptDir = direction === "around" ? "around" : direction === "right" ? "right" : "left";
    const orientationMessage = promptDir === "around"
      ? "Turn around to face the route"
      : `Turn ${promptDir} to face the route`;

    if (navigationSpeech.request(orientationMessage, "optional")) {
      orientationPromptRef.current = { direction: promptDir, timestamp: now };
    }
  }, [route, coordinates, currentHeading, currentRouteIndex, isAudioMuted, navigationMode, isFocused, nextStep, distToNextStepMeters, navigationSpeech]);

  const repeatGuidanceRef = useRef({ nextStep, distToNextStepMeters, distanceUnits, directionStyle });
  useEffect(() => {
    repeatGuidanceRef.current = { nextStep, distToNextStepMeters, distanceUnits, directionStyle };
  }, [nextStep, distToNextStepMeters, distanceUnits, directionStyle]);

  // Repeat only while idle; a stable interval reads the latest GPS distance.
  useEffect(() => {
    if (!isFocused || navigationMode !== "accessibility" || !route || isAudioMuted) return;
    const intervalId = setInterval(() => {
      if (isRouteCancelledRef.current) return;
      const current = repeatGuidanceRef.current;
      if (!current.nextStep) return;
      if (current.nextStep.instruction === "Arrive at destination" && current.distToNextStepMeters <= 5) return;
      navigationSpeech.request(formatInstructionWithDistance(
        formatDirectionInstruction(current.nextStep, current.directionStyle),
        current.distToNextStepMeters, current.distanceUnits,
      ), "optional");
    }, 9000);
    return () => clearInterval(intervalId);
  }, [isFocused, navigationMode, route, isAudioMuted, navigationSpeech]);

  useEffect(() => {
    if (!isFocused || !route || !nextStep || !coordinates || isRouteCancelledRef.current) return;
    const stages = spokenStagesRef.current[nextStep.pointIndex] ?? {};
    spokenStagesRef.current[nextStep.pointIndex] = stages;
    
    const speakPrompt = (text: string) => {
      if (!isFocused) return;
      if (Platform.OS !== "web") { 
        try { 
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
        } catch { 
          Vibration.vibrate(150); 
        } 
      }
      if (isRouteCancelledRef.current) return;
      // Still consume each haptic stage once while muted, as before. Muting
      // must not make every subsequent GPS sample vibrate/retry the same stage.
      if (audioMutedRef.current) return true;
      return navigationSpeech.request(text, nextStep.instruction === "Arrive at destination" ? "arrival" : "maneuver");
    };

    if (nextStep.instruction === "Arrive at destination") {
      if (distToNextStepMeters <= 5 && !stages.turn) {
        const destinationName = route.destination?.label || "your destination";
        if (speakPrompt(`You have arrived at ${destinationName}`)) stages.turn = true;
      }
      return;
    }

    if (distToNextStepMeters <= 25 && distToNextStepMeters > 5 && !stages.m25) {
      const distance = distanceUnits === "imperial" ? "80 feet" : "25 meters";
      if (speakPrompt(`In ${distance}, ${nextStepInstruction}`)) stages.m25 = true;
    } else if (distToNextStepMeters <= 5 && distToNextStepMeters > 2 && !stages.m5) {
      const distance = distanceUnits === "imperial" ? "15 feet" : "5 meters";
      if (speakPrompt(`In ${distance}, ${nextStepInstruction}`)) stages.m5 = true;
    } else if (distToNextStepMeters <= 2 && !stages.turn) {
      if (speakPrompt(`${nextStepInstruction} now`)) stages.turn = true;
    }
  }, [isFocused, route, nextStep, nextStepInstruction, coordinates, distToNextStepMeters, isAudioMuted, distanceUnits, navigationSpeech]);

  return { 
    coordinates, 
    mapCenter, 
    error, 
    isAudioMuted, 
    destinationBuilding, 
    route, 
    routeDestinationBuilding,
    routeError, 
    routeSteps, 
    currentRouteIndex, 
    showRecenter, 
    recenterSignal, 
    routeLoadingProgress, 
    upcomingSteps, 
    nextStep, 
    distToNextStepMeters,
    currentHeading,
    toggleMute, 
    handleDestinationChange, 
    handleCancelRoute, 
    handleRecenter, 
    setShowRecenter 
  };
}
