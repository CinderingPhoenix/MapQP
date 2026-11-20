import {
    router, useFocusEffect, useLocalSearchParams
} from "expo-router";
import {
    useCallback, useEffect, useRef, useState
} from "react";
import { useKeepAwake} from "expo-keep-awake";
import { ActivityIndicator, Animated, Keyboard, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, TextInput} from "react-native";
import { SafeAreaView} from "react-native-safe-area-context";
import { File, Paths} from "expo-file-system";
import { Barometer} from "expo-sensors";

import CurrentNavigationSummary from "../components/current-navigation-summary";
import RecenterOverlay from "../components/recenter-overlay";

import { useSettings} from "../context/settings-context";
import { useAccessibilityPreferences} from "../hooks/use-accessibility-preferences";
import { useAuthGuard} from "../hooks/use-auth-guard";

import { formatDistance, formatDuration, formatArrivalTime, findNearestEntrance} from "../utils/map-logic";

import type { ColorVisionPresets } from "../context/settings-context";;
import { COLOR_VISION_PALETTES } from "../theme/color-vision-palettes";
import { UNITY_FLOOR_CALIBRATION, UNITY_ELEVATOR_TIMING} from "../data/uh-floor-calib";
import unityRoomData from "../data/uh-rooms.json";
import IndoorMap, {type UnityFloor} from "../components/indoor-map";
import * as Location from "expo-location";
import { getEdgeSeconds, getTotalSeconds} from "../utils/indoor-routing";
import { WALKING_SPEED_METERS_PER_SECOND} from "../utils/routing";
import type {
  IndoorEdge,
  IndoorMapNode,
} from "../data/uh-indoor-graph";

import {
  UNITY_MAP_NODES,
  UNITY_MAP_EDGES,
  getIndoorEntranceForOutdoorNode
} from "../data/uh-indoor-graph";
import {
  UNITY_OUTDOOR_ENTRANCES,
} from "../data/uh-outdoor-entrances";
import { findIndoorRoute } from "../utils/find-indoor-route";

type IndoorCalibration = {
    buildingId: string;
    entranceNodeId: string;
    referenceFloor: UnityFloor;
    referencePressureHpa: number;
    calibratedAt: number;
};

type IndoorFloorState = {
    estimatedFloor: number;
    confirmedFloor: number;
    status: "stable" | "transitioning" | "uncertain";
};

type IndoorEntrance = {
    latitude: number | null;
    longitude: number | null;
    name: string;
    floor: number;
    accessibility: boolean | null;
};

type IndoorRoom = {
    roomNum: string;
    name: string;
    entrances: IndoorEntrance[];
};

type EntranceFloor = 1 | 2 | 5;

const unityRooms: IndoorRoom[] = unityRoomData.rooms;

export default function IndoorNavigation() {
  const { roomNum: roomNumParam,
    entryFloor: entryFloorParam,
    entranceNodeId: entranceNodeIdParam} = useLocalSearchParams<{
    roomNum?: string;
    entryFloor?: string;
    entranceNodeId?: string;
  }>();
  const [displayedFloor, setDisplayedFloor] = useState<UnityFloor | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationError, setLocationError] = useState("");
  const [indoorRouteEdges, setIndoorRouteEdges] = useState<IndoorEdge[] | null>(null);
  const [routeError, setRouteError] = useState("");
    
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  useAuthGuard();

  const { settingsAppearance, fontSize, colorVisionPreset} = useSettings();
  const palette = COLOR_VISION_PALETTES[colorVisionPreset];

  const accessibleAppearance = settingsAppearance === "accessible";

  const [selectedRoomNum, setSelectedRoomNum] = useState<string | null>(null);
  
  const selectedRoom = unityRooms.find((room) => room.roomNum === selectedRoomNum) ?? null;

  const [entranceFloor, setEntranceFloor] = useState<EntranceFloor | null>(null);

  const [pressureHpa, setPressureHpa] = useState<number | null>(null);
  const [filteredPressureHpa, setFilteredPressureHpa] =
    useState<number | null>(null);

  const [calibration, setCalibration] =
    useState<IndoorCalibration | null>(null);

  const [sensorReady, setSensorReady] = useState(false);
  const [sensorError, setSensorError] = useState("");
  const [sampleCount, setSampleCount] = useState(0);

  const readingsRef = useRef<
    Array<{ pressure: number; timestamp: number }>
  >([]);

  useEffect(() => {
  setSelectedRoomNum(roomNumParam ?? null);
}, [roomNumParam]);

useEffect(() => {
  if (!entranceNodeIdParam) return;

  // Accept either an indoor entrance ID or its mapped outdoor ID.
  const entrance =
    UNITY_MAP_NODES.find(
      (node) =>
        node.kind === "entrance" &&
        node.id === entranceNodeIdParam,
    ) ??
    getIndoorEntranceForOutdoorNode(entranceNodeIdParam);

  if (!entrance) {
    setLocationError(
      `No indoor entrance matches: ${entranceNodeIdParam}`,
    );
    return;
  }

  const floor = entrance.floor;

  if (floor !== 1 && floor !== 2 && floor !== 5) {
    setLocationError("Unsupported entrance floor.");
    return;
  }

  // Use the matched node's floor, rather than a conflicting
  // entryFloor parameter.
  setEntranceFloor(floor);
  setDisplayedFloor(floor);
  setCurrentNodeId(entrance.id);
  setLocationError("");
}, [entranceNodeIdParam]);

useEffect(() => {
  // Identify the entrance once; do not switch it on every GPS update.
  // Use GPS only when no explicit entrance ID was supplied.
  if (
    entranceNodeIdParam ||
    entranceFloor !== null ||
    location === null
  ) {
    return;
  }

  const entrances = UNITY_OUTDOOR_ENTRANCES.filter(
    (entrance) =>
      UNITY_MAP_NODES.some(
        (node) =>
          node.id === entrance.indoorNodeId &&
          node.kind === "entrance" &&
          node.floor === entrance.floor,
      ),
  );

  console.log(
  "Entrance candidates",
  JSON.stringify(entrances, null, 2),
  );

  console.log("Location used for entrance selection", {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    timestamp: location.timestamp,
  });

  if (entrances.length === 0) {
    setLocationError(
      "No valid Unity Hall entrance coordinates are available.",
    );
    return;
  }

  const nearest = findNearestEntrance(
    {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    },
    entrances,
  );

  if (!nearest) {
    setLocationError("Unable to determine the nearest entrance.");
    return;
  }

  const floor = nearest.entrance.floor;

  if (floor !== 1 && floor !== 2 && floor !== 5) {
    setLocationError("The nearest entrance has an unsupported floor.");
    return;
  }

  const selectedEntrance = entrances.find(
    (entrance) => entrance === nearest.entrance,
  );

  if (!selectedEntrance) {
    setLocationError(
      "Unable to resolve the selected outdoor entrance.",
    );
    return;
  }

  const entranceNode = UNITY_MAP_NODES.find(
    (node) =>
      node.id === selectedEntrance.indoorNodeId &&
      node.kind === "entrance",
  );

  if (!entranceNode) {
    setLocationError(
      `Indoor entrance node is missing: ${selectedEntrance.indoorNodeId}`,
    );
    return;
  }

  if (entranceNode.floor !== selectedEntrance.floor) {
    setLocationError(
      "The outdoor entrance floor does not match its indoor node.",
    );
    return;
  }

  setEntranceFloor(selectedEntrance.floor);
  setDisplayedFloor(selectedEntrance.floor);
  setCurrentNodeId(entranceNode.id);
  setLocationError("");

    console.log("Nearest entrance selection", {
      name: nearest.entrance.name,
      floor,
      distanceMeters: nearest.distanceMeters,
      entranceNodeId: selectedEntrance.indoorNodeId,
      indoorNodeFound: Boolean(entranceNode),
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    setEntranceFloor(floor);
    setDisplayedFloor(floor);
    setCurrentNodeId(entranceNode.id);
    setLocationError("");
}, [location, entranceFloor, entranceNodeIdParam]);

  useEffect(() => {
    let active = true;
    let subscription: Location.LocationSubscription | null = null;

    async function startLocation() {
      try {
        const permission =
          await Location.requestForegroundPermissionsAsync();

        if (!active) return;

        if (permission.status !== "granted") {
          setLocationError(
            "Location permission is needed to show your position."
          );
          return;
        }

        const watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 1,
          },
          (nextLocation) => {
            if (!active) return;

            setLocation(nextLocation);
          }
        );

        if (!active) {
          watcher.remove();
          return;
        }

        subscription = watcher;
      } catch (error) {
        if (!active) return;

        setLocationError(
          error instanceof Error
            ? error.message
            : "Unable to start location tracking."
        );
      }
    }

    void startLocation();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let subscription: ReturnType<typeof Barometer.addListener> | null =
        null;

      readingsRef.current = [];
      setSensorReady(false);
      setSensorError("");
      setSampleCount(0);
      setPressureHpa(null);
      setFilteredPressureHpa(null);

      // Require a fresh calibration after leaving and returning.
      setCalibration(null);

      async function startBarometer() {
        try {
          const available = await Barometer.isAvailableAsync();

          if (!active) return;

          if (!available) {
            setSensorError(
              "Automatic floor detection is unavailable on this device."
            );
            return;
          }

          subscription = Barometer.addListener(({ pressure }) => {
            if (!active || !Number.isFinite(pressure) || pressure <= 0) {
              return;
            }

            const now = Date.now();

            // Keep a recent, bounded sample window.
            const recentReadings = [
              ...readingsRef.current,
              { pressure, timestamp: now },
            ]
              .filter((reading) => now - reading.timestamp <= 5000)
              .slice(-50);

            readingsRef.current = recentReadings;

            const sortedPressures = recentReadings
              .map((reading) => reading.pressure)
              .sort((a, b) => a - b);

            const middle = Math.floor(sortedPressures.length / 2);

            const median =
              sortedPressures.length % 2 === 0
                ? (sortedPressures[middle - 1] +
                    sortedPressures[middle]) /
                  2
                : sortedPressures[middle];

            setPressureHpa(pressure);
            setFilteredPressureHpa(median);
            setSampleCount(recentReadings.length);
            setSensorReady(true);
          });
        } catch (error) {
          if (!active) return;

          setSensorError(
            error instanceof Error
              ? error.message
              : "Unable to start the barometer."
          );
        }
      }

      void startBarometer();

      return () => {
        active = false;
        subscription?.remove();
      };
    }, [])
  );

  const ENTRANCE_NODE_IDS: Record<EntranceFloor, string> = {
      1: "Unity-One-Entr",
      2: "Unity-Two-Entr",
      5: "Unity-Fiv-Entr"
    }

  function calibrateAtEntrance(entranceFloor: UnityFloor, entranceNodeId: string): boolean {
    const readings = readingsRef.current;
    const latestReading = readings[readings.length - 1];

    if (
      filteredPressureHpa === null ||
      readings.length < 5 ||
      !latestReading ||
      Date.now() - latestReading.timestamp > 2000
    ) {
      return false;
    }

    setCalibration({
      buildingId: "Unity",
      entranceNodeId,
      referenceFloor: entranceFloor,
      referencePressureHpa: filteredPressureHpa,
      calibratedAt: Date.now(),
    });

    setSensorError("");
    return true;
  }

  function handleEntranceConfirmed(floor: EntranceFloor) {
    const entranceNodeId = ENTRANCE_NODE_IDS[floor];

    // The identified entrance determines the initial indoor floor.
    setEntranceFloor(floor);
    setDisplayedFloor(floor);

    // Attempt barometer calibration separately.
    const calibrated = calibrateAtEntrance(floor, entranceNodeId);

    if (!calibrated) {
      setSensorError(
        "Entrance identified. Stay at the entrance while barometer calibration is completed."
      );
      return;
    }

    setSensorError("");
  }

  const pressureChange =
    calibration !== null && filteredPressureHpa !== null
      ? calibration.referencePressureHpa - filteredPressureHpa
      : null;

  const indoorSeconds =
    indoorRouteEdges === null
      ? null
      : indoorRouteEdges.reduce(
          (total, edge) =>
            total +
            getEdgeSeconds(edge, WALKING_SPEED_METERS_PER_SECOND),
          0
        );

  const totalSeconds =
    indoorSeconds === null
      ? null
      : getTotalSeconds({
          outdoorSeconds: 0,
          entranceSeconds: 0,
          indoorSeconds,
        });

  const roomArrivalTime =
    totalSeconds === null
      ? null
      : Date.now() + totalSeconds * 1000;

    useEffect(() => {
      setIndoorRouteEdges(null);
      setRouteError("");

      if (!currentNodeId || !selectedRoomNum) return;

      // Treat 500, 500A, and 500B as the same destination room.
      const baseRoomNumber = (value: string): string =>
        value.trim().toUpperCase().replace(/[AB]$/, "");

      const requestedRoom = baseRoomNumber(selectedRoomNum);

      const destinations = UNITY_MAP_NODES.filter(
        (node) =>
          node.kind === "room" &&
          node.roomNum !== undefined &&
          baseRoomNumber(node.roomNum) === requestedRoom,
      );

      if (destinations.length === 0) {
        setRouteError(
          `No indoor map node exists for room ${selectedRoomNum}.`,
        );
        return;
      }

      try {
        let bestRoute: IndoorEdge[] | null = null;
        let bestSeconds = Infinity;

        for (const destination of destinations) {
          const route = findIndoorRoute(
            UNITY_MAP_NODES,
            UNITY_MAP_EDGES,
            currentNodeId,
            destination.id,
          );

          // This entrance may be unreachable even if another is reachable.
          if (route === null) continue;

          const seconds = route.reduce(
            (total, edge) =>
              total +
              getEdgeSeconds(
                edge,
                WALKING_SPEED_METERS_PER_SECOND,
              ),
            0,
          );

          if (seconds < bestSeconds) {
            bestSeconds = seconds;
            bestRoute = route;
          }
        }

        if (bestRoute === null) {
          setRouteError(
            `No connected indoor route exists to any entrance ` +
              `of room ${requestedRoom}.`,
          );
          return;
        }

        setIndoorRouteEdges(bestRoute);
      } catch (error) {
        setRouteError(
          error instanceof Error
            ? error.message
            : "Unable to calculate the indoor route.",
        );
      }
    }, [currentNodeId, selectedRoomNum]);

  return (
  <SafeAreaView style={[styles.container, { backgroundColor: palette.background}]}>
    {/* Indoor map surface */}
    <View style={styles.mapCanvas}>
      {displayedFloor !== null ? (
        // <IndoorMap
        //   displayedFloor={displayedFloor}
        //   selectedRoomNum={selectedRoomNum}
        // />
        <IndoorMap
          displayedFloor={displayedFloor}
          selectedRoomNum={selectedRoomNum}
          currentNodeId={currentNodeId}
          routeEdges={indoorRouteEdges ?? []}
        />
      ) : (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            backgroundColor: palette.background,
          }}
        >
          <Text
            style={{
              fontSize: 16 * fontSize,
              color: palette.text,
              textAlign: "center",
            }}
          >
            {locationError || "Determining closest entrance..."}
          </Text>
        </View>
      )}
    </View>

    {/* Selected destination ;l */}
    <View style={[styles.summaryPanel, {
      backgroundColor: palette.surface, borderColor:palette.border
    }]}>
      {totalSeconds !== null && roomArrivalTime !== null && (
        <View style = {{ marginTop: 8}}>
          <Text style = {{ fontSize: 16 * fontSize, color: palette.text}}>
            Estimated trip: {formatDuration(totalSeconds)}
          </Text>

          <Text style = {{ marginTop: 4, fontSize: 15 * fontSize, color: palette.secondaryText}}>
            Estimated arrival: {formatArrivalTime(roomArrivalTime)}
          </Text>
        </View>
      )}

      {routeError !== "" && (
        <Text
          accessibilityRole="alert"
          style={{
            marginTop: 8,
            color: "#a00000",
            fontSize: 14 * fontSize,
          }}
        >
          {routeError}
        </Text>
      )}
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 20 * fontSize,
          fontWeight: "bold",
          color: palette.text,
        }}
      >
        {selectedRoomNum != null
            ? `Room ${selectedRoomNum}`
            : "Unity Hall"}
      </Text>

      <Text
        accessibilityRole = "alert"
        style = {{
          marginTop: 8,
          color: "#a00000",
          fontSize: 14 * fontSize
        }}>
          {sensorError}
        </Text>
    </View>
  </SafeAreaView>
);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  mapCanvas: {
    flex: 1,
    backgroundColor: "#eee",
  },
  summaryPanel: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    elevation: 4,
    zIndex: 10,
  }
});