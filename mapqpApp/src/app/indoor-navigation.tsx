import {
    router, useFocusEffect, useLocalSearchParams
} from "expo-router";
import {
    useCallback, useEffect, useRef, useState
} from "react";
import { useKeepAwake} from "expo-keep-awake";
import {
    ActivityIndicator, Animated, Keyboard, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, TextInput
} from "react-native";
import { SafeAreaView} from "react-native-safe-area-context";
import { File, Paths} from "expo-file-system";
import { Barometer} from "expo-sensors";

import CurrentNavigationSummary from "../components/current-navigation-summary";
import RecenterOverlay from "../components/recenter-overlay";

import { useSettings} from "../context/settings-context";
import { useAccessibilityPreferences} from "../hooks/use-accessibility-preferences";
import { useAuthGuard} from "../hooks/use-auth-guard";

import {
    formatDistance, formatDuration, formatArrivalTime
} from "../utils/map-logic";

import { COLOR_VISION_PALETTES} from "../theme/color-vision-palettes";
import { UNITY_FLOOR_CALIBRATION, UNITY_ELEVATOR_TIMING} from "../data/uh-floor-calib";
import unityRoomData from "../data/uh-rooms.json";
import IndoorMap, {type UnityFloor} from "../components/indoor-map";

type IndoorCalibration = {
    buildingId: string;
    entranceNodeId: string;
    referenceFloor: number;
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

const unityRooms: IndoorRoom[] = unityRoomData.rooms;

export default function IndoorNavigation() {
    const [displayedFloor, setDisplayedFloor] = useState<UnityFloor>(1);
    
    useKeepAwake(undefined, { suppressDeactivateWarnings: true });
    useAuthGuard();

  const { fontSize } = useSettings();

  const [roomSearch, setRoomSearch] = useState("");
  const [selectedRoomNum, setSelectedRoomNum] = useState<string | null>(null);
  
  const normalizedSearch = roomSearch.trim().toLowerCase();
  
  const filteredRooms = unityRooms.filter((room) =>
    `${room.roomNum} ${room.name}`.toLowerCase().includes(normalizedSearch));
  
  const selectedRoom = unityRooms.find((room) => room.roomNum === selectedRoomNum) ?? null;

  const [selectedFloor, setSelectedFloor] = useState<1 | 2>(1);

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
              "A barometer is unavailable. Manual floor selection will be needed."
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

  function calibrateAtEntrance() {
    const readings = readingsRef.current;
    const latestReading = readings[readings.length - 1];

    if (
      filteredPressureHpa === null ||
      readings.length < 5 ||
      !latestReading ||
      Date.now() - latestReading.timestamp > 2000
    ) {
      setSensorError(
        "Wait for several fresh pressure readings before calibrating."
      );
      return;
    }

    setCalibration({
      buildingId: "Unity",
      entranceNodeId:
        selectedFloor === 1
          ? "Unity-One-Entr"
          : "Unity-Two-Entr",
      referenceFloor: selectedFloor,
      referencePressureHpa: filteredPressureHpa,
      calibratedAt: Date.now(),
    });

    setSensorError("");
  }

  const pressureChange =
    calibration !== null && filteredPressureHpa !== null
      ? calibration.referencePressureHpa - filteredPressureHpa
      : null;

  return (
  <SafeAreaView style={styles.container}>
    {/* Main map surface */}
    <View style={styles.mapCanvas}>
        <IndoorMap
            displayedFloor={displayedFloor}
            selectedRoomNum={selectedRoomNum}
        />
    </View>

    {/* Selected destination */}
    <View style={styles.summaryPanel}>
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 20 * fontSize,
          fontWeight: "bold",
          color: "#1d5962",
        }}
      >
        {selectedRoomNum != null
            ? `Room ${selectedRoomNum}`
            : "Unity Hall"}
      </Text>

      <Text
        style={{
          marginTop: 4,
          fontSize: 15 * fontSize,
          color: "#444",
        }}
      >
        Viewing floor {displayedFloor}
      </Text>
    </View>

    {/* Floor controls */}
    <View style={styles.floorControls}>
      {([1, 2, 3, 4, 5] as const).map((floor) => {
        const selected = displayedFloor === floor;

        return (
          <TouchableOpacity
            key={floor}
            accessibilityRole="button"
            accessibilityLabel={`Show floor ${floor}`}
            accessibilityState={{ selected }}
            onPress={() => setDisplayedFloor(floor)}
            style={[
              styles.floorButton,
              selected && styles.floorButtonSelected,
            ]}
          >
            <Text
              style={{
                fontSize: 16 * fontSize,
                color: selected ? "#fff" : "#111",
              }}
            >
              {floor}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>

    {/* Destination search */}
    <View style={styles.searchPanel}>
      <TextInput
        value={roomSearch}
        onChangeText={setRoomSearch}
        placeholder="Search Unity rooms..."
        placeholderTextColor="#666"
        accessibilityLabel="Search Unity destinations"
        autoCorrect={false}
        style={[
          styles.searchInput,
          { fontSize: 16 * fontSize },
        ]}
      />

      {roomSearch.trim() !== "" && (
        <ScrollView
          style={styles.searchResults}
          keyboardShouldPersistTaps="handled"
        >
          {filteredRooms.map((room) => (
            <TouchableOpacity
              key={room.roomNum}
              accessibilityRole="button"
              onPress={() => {
                setSelectedRoomNum(room.roomNum);
                setRoomSearch("");
              }}
              style={styles.searchResult}
            >
              <Text
                style={{
                  fontSize: 16 * fontSize,
                  color: "#111",
                }}
              >
                {room.name}
              </Text>
            </TouchableOpacity>
          ))}

          {filteredRooms.length === 0 && (
            <Text style={styles.emptyResults}>
              No matching destinations.
            </Text>
          )}
        </ScrollView>
      )}
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
  },
  floorControls: {
    position: "absolute",
    top: 180,
    right: 16,
    gap: 8,
    zIndex: 10,
  },
  floorButton: {
    minWidth: 48,
    minHeight: 48,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#888",
    backgroundColor: "#fff",
  },
  floorButtonSelected: {
    backgroundColor: "#1d5962",
    borderColor: "#1d5962",
  },
  searchPanel: {
    position: "absolute",
    bottom: 32,
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    elevation: 4,
    zIndex: 20,
  },
  searchInput: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#888",
    borderRadius: 8,
    color: "#111",
    backgroundColor: "#fff",
  },
  searchResults: {
    maxHeight: 220,
    marginTop: 8,
  },
  searchResult: {
    minHeight: 48,
    padding: 12,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  emptyResults: {
    padding: 12,
    color: "#444",
  },
});