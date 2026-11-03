// accessibility-navigation.tsx

import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import {
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";

import BuildingPicker from "../components/building-picker";
import LocationMap from "../components/location-map";
import RecenterOverlay from "../components/recenter-overlay";
import CurrentNavigationSummary from "../components/current-navigation-summary";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
import { useAuthGuard } from "../hooks/use-auth-guard";
import {
  Building,
  parseBuildingData,
  formatDirectionInstruction,
  formatDistance,
  formatDuration,
  formatArrivalTime,
  formatInstructionWithDistance,
  getDistanceToStepPoint,
  useMapNavigation,
} from "../utils/map-logic";
import { initRoutingGraph } from "../utils/routing";

import defaultRoutePoints from "../data/route-points.json";
import defaultBuildings from "../data/wpi-buildings.json";

export default function Home() {
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  useAuthGuard();
  const { fontScale, height: windowHeight } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState(windowHeight);
  const [textRefresh, setTextRefresh] = useState(0);
  const [summaryBottom, setSummaryBottom] = useState(0);
  const [plannerHeight, setPlannerHeight] = useState(160);
  const [recenterHeight, setRecenterHeight] = useState(0);
  // Reserve the measured button plus the same gap even while it is hidden.
  const recenterClearance = recenterHeight + 16;

  // --- Dynamic Map Data State & Hooks (Must be called unconditionally) ---
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isMapDataLoaded, setIsMapDataLoaded] = useState(false);
  const [dataError, setDataError] = useState("");

  const [directionsExpanded, setDirectionsExpanded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardTranslateY = useRef(new Animated.Value(0)).current;

  const { distanceUnits, directionStyle, fontSize } = useSettings();
  const accessibilityPreferences = useAccessibilityPreferences();

  const screenReaderEnabled = accessibilityPreferences?.screenReaderEnabled ?? false;
  const reduceMotionEnabled = accessibilityPreferences?.reduceMotionEnabled ?? false;
  const accessibilityLoaded = accessibilityPreferences?.loaded ?? false;
  const boldTextEnabled = accessibilityPreferences?.boldTextEnabled ?? false;
  const darkerSystemColorsEnabled = accessibilityPreferences?.darkerSystemColorsEnabled ?? false;
  const highTextContrastEnabled = accessibilityPreferences?.highTextContrastEnabled ?? false;
  const reduceTransparencyEnabled = accessibilityPreferences?.reduceTransparencyEnabled ?? false;

  const {
    coordinates,
    mapCenter,
    error,
    destinationBuilding,
    route,
    routeDestinationBuilding,
    routeError,
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
    setShowRecenter,
  } = useMapNavigation(buildings);

  // iOS can retain stale native text measurements after returning from Settings.
  useFocusEffect(
    useCallback(() => {
      setTextRefresh((previous) => previous + 1);
    }, [fontScale])
  );

  useEffect(() => {
    async function loadLocalMapData() {
      try {
        let routeData = defaultRoutePoints;
        let buildingData = defaultBuildings;

        const routeFile = new File(Paths.document, "route-points.json");
        const buildingsFile = new File(Paths.document, "wpi-buildings.json");

        if (routeFile.exists) {
          const routeContent = await routeFile.text();
          routeData = JSON.parse(routeContent);
        }

        if (buildingsFile.exists) {
          const buildingContent = await buildingsFile.text();
          buildingData = JSON.parse(buildingContent);
        }

        initRoutingGraph(routeData, buildingData);
        setBuildings(parseBuildingData(buildingData));
        setIsMapDataLoaded(true);
      } catch (err) {
        setDataError(err instanceof Error ? err.message : "Error loading map data");
        console.error("Map Data Load Error:", err);
      }
    }
    
    loadLocalMapData();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      const targetY = -(event.endCoordinates.height + 24);

      if (reduceMotionEnabled) {
        keyboardTranslateY.setValue(targetY);
      } else {
        Animated.timing(keyboardTranslateY, {
          toValue: targetY,
          duration: event.duration || 175,
          useNativeDriver: true,
        }).start();
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      setKeyboardHeight(0);

      if (reduceMotionEnabled) {
        keyboardTranslateY.setValue(0);
      } else {
        Animated.timing(keyboardTranslateY, {
          toValue: 0,
          duration: event.duration || 200,
          useNativeDriver: true,
        }).start();
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardTranslateY, reduceMotionEnabled]);

  // Conditional loading checks must happen AFTER all hooks are defined
  if (!isMapDataLoaded || !accessibilityLoaded) {
    return (
      <SafeAreaView style={[styles.container, styles.loadingContainer]}>
        {dataError ? (
          <Text style={[styles.errorText, { fontSize: 16 * fontSize }]}>{dataError}</Text>
        ) : (
          <>
            <ActivityIndicator size="large" color="#1d5962" />
            <Text style={{ marginTop: 16, fontSize: 16 * fontSize, color: "#555" }}>Loading accessibility options...</Text>
          </>
        )}
      </SafeAreaView>
    );
  }

  const increasedContrast = darkerSystemColorsEnabled || highTextContrastEnabled;
  const emphasizedText = accessibilityPreferences.emphasizedTextEnabled;

  return (
    <SafeAreaView style={styles.container} onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}>
      {route && (
        <View
          onLayout={(event) => setSummaryBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
          style={[
            styles.topRouteSummary,
            increasedContrast && { borderColor: "#1d5962", borderWidth: 2 },
            reduceTransparencyEnabled && { backgroundColor: "#fff" },
            directionsExpanded ? styles.topRouteSummaryExpanded : styles.topRouteSummaryCollapsed,
            directionsExpanded && { height: Math.min(viewportHeight * 0.65,
              Math.max(120, viewportHeight - plannerHeight - keyboardHeight - recenterClearance - 248)) },
          ]}
        >
          {/* Header Row containing Route Info and a dedicated Cancel Button */}
          <View style={styles.routeHeaderRow}>
            <View style={{ flex: 1 }}>
              <CurrentNavigationSummary
                destinationKey={routeDestinationBuilding}
                destinationName={buildings.find((building) => building.id === routeDestinationBuilding)?.name ?? "your destination"}
                screenReaderEnabled={screenReaderEnabled}
                expanded={directionsExpanded}
                onToggleDirections={() => setDirectionsExpanded((previous) => !previous)}
                instruction={
                  nextStep
                    ? formatInstructionWithDistance(formatDirectionInstruction(nextStep, directionStyle), distToNextStepMeters, distanceUnits)
                    : "Follow route"
                }
              >
                <Text
                  key={`nav-text-6-${fontSize}-${fontScale}-${textRefresh}`}
                  accessible={false}
                  maxFontSizeMultiplier={2.5}
                  style={[styles.boldText, { fontSize: 22 * fontSize, fontWeight: "bold" }]}
                >
                  {nextStep
                    ? formatInstructionWithDistance(formatDirectionInstruction(nextStep, directionStyle), distToNextStepMeters, distanceUnits)
                    : "Follow route"}
                </Text>
                <Text
                  key={`nav-text-7-${fontSize}-${fontScale}-${textRefresh}`}
                  accessible={false}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.subText,
                    {
                      fontSize: 16 * fontSize,
                      fontWeight: boldTextEnabled ? "600" : "normal",
                      color: darkerSystemColorsEnabled ? "#222" : "#555",
                    },
                  ]}
                >
                  {formatDistance(route.distance, distanceUnits)}
                  {" total • "}
                  {formatDuration(route.duration)}{" \u00b7 Arrive "}{formatArrivalTime(route.arrivalTime)}
                </Text>
              </CurrentNavigationSummary>
            </View>

            {/* Dedicated Cancel Route Button */}
            <TouchableOpacity
              style={[styles.cancelRouteButton, increasedContrast && { borderColor: "#d9534f", borderWidth: 2 }]}
              onPress={handleCancelRoute}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Cancel route"
              accessibilityHint="Double tap to stop navigation and cancel the current route"
            >
              <Text style={[styles.cancelRouteButtonText, { fontSize: 14 * fontSize }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {directionsExpanded && (
            <View style={styles.expandedContainer}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={2.5} style={[styles.boldText, { fontSize: 22 * fontSize }]}>
                Upcoming Directions
              </Text>
              <ScrollView
                style={styles.directionsList}
                contentContainerStyle={styles.directionsListContent}
                nestedScrollEnabled
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator
              >
                {upcomingSteps.map((step, index) => {
                  const distance = getDistanceToStepPoint(
                    route.geometry,
                    currentRouteIndex,
                    step.pointIndex,
                    coordinates?.latitude,
                    coordinates?.longitude
                  );

                  return (
                    <View
                      key={`${step.pointIndex}-${index}`}
                      style={[styles.directionItem, { borderBottomColor: darkerSystemColorsEnabled ? "#aaa" : "#eee" }]}
                    >
                      <Text
                        key={`nav-text-3-${fontSize}-${fontScale}-${textRefresh}`}
                        maxFontSizeMultiplier={2.5}
                        style={[styles.directionInstruction, { fontSize: 19 * fontSize, fontWeight: boldTextEnabled ? "600" : "500" }]}
                      >
                        {formatInstructionWithDistance(formatDirectionInstruction(step, directionStyle), distance, distanceUnits, index === 0)}
                      </Text>
                    </View>
                  );
                })}

                {upcomingSteps.length === 0 && (
                  <View style={[styles.directionItem, { borderBottomColor: darkerSystemColorsEnabled ? "#aaa" : "#eee" }]}>
                    <Text
                      key={`nav-text-4-${fontSize}-${fontScale}-${textRefresh}`}
                      maxFontSizeMultiplier={2.5}
                      style={[styles.directionInstruction, { fontSize: 19 * fontSize, fontWeight: boldTextEnabled ? "600" : "500" }]}
                    >
                      You have arrived!
                    </Text>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity onPress={() => setDirectionsExpanded(false)} activeOpacity={0.7}>
                <Text
                  key={`nav-text-5-${fontSize}-${fontScale}-${textRefresh}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.subText,
                    {
                      marginTop: 10,
                      fontSize: 16 * fontSize,
                      fontWeight: boldTextEnabled ? "600" : "normal",
                      color: darkerSystemColorsEnabled ? "#222" : "#555",
                    },
                  ]}
                >
                  {formatDistance(route.distance, distanceUnits)}
                  {" • "}
                  {formatDuration(route.duration)} left{" \u00b7 Arrive "}{formatArrivalTime(route.arrivalTime)}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {routeLoadingProgress < 1 &&
            (!accessibilityLoaded || reduceMotionEnabled ? (
              <Text
                maxFontSizeMultiplier={2.5}
                style={[
                  styles.subText,
                  { fontSize: 14 * fontSize, color: increasedContrast ? "#111" : "#555", fontWeight: emphasizedText ? "bold" : "normal" },
                ]}
              >
                Route preview
              </Text>
            ) : (
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${routeLoadingProgress * 100}%` }]} />
              </View>
            ))}
        </View>
      )}

      {/* Map */}
      <View
        style={styles.mapCanvas}
        onStartShouldSetResponderCapture={() => {
          Keyboard.dismiss();
          if (directionsExpanded) {
            setDirectionsExpanded(false);
          }
          return false;
        }}
      >
        {error ? (
          <View style={styles.loadingContainer}>
            <Text
              key={`nav-text-8-${fontSize}-${fontScale}-${textRefresh}`}
              maxFontSizeMultiplier={2.5}
              style={{ fontSize: 16 * fontSize, color: increasedContrast ? "#111" : "#333", fontWeight: emphasizedText ? "bold" : "normal" }}
            >
              {error}
            </Text>
          </View>
        ) : (
          <LocationMap
            latitude={showRecenter ? mapCenter.latitude : coordinates?.latitude ?? mapCenter.latitude}
            longitude={showRecenter ? mapCenter.longitude : coordinates?.longitude ?? mapCenter.longitude}
            userLatitude={coordinates?.latitude}
            userLongitude={coordinates?.longitude}
            accuracy={coordinates?.accuracy ?? 0}
            heading={currentHeading}
            route={route}
            directionsExpanded={directionsExpanded}
            controlsTop={route ? summaryBottom + 12 : 132}
            controlsBottom={plannerHeight + keyboardHeight + recenterClearance}
            accessibilityMode
            recenterSignal={recenterSignal}
            onUserDragged={() => setShowRecenter(true)}
            onPanBack={() => setShowRecenter(false)}
            onHeadingModeChange={() => setShowRecenter(false)}
            onToggleMute={toggleMute}
            onOpenSettings={() =>
              router.push({
                pathname: "/settings",
                params: { from: "accessibility-navigation" },
              })
            }
          />
        )}
      </View>

      {/* Destination picker */}
      <Animated.View
        onLayout={(event) => setPlannerHeight(event.nativeEvent.layout.height)}
        style={[
          styles.plannerPanel,
          increasedContrast && { borderColor: "#1d5962", borderWidth: 2 },
          reduceTransparencyEnabled && { backgroundColor: "#fff" },
          {
            paddingBottom: keyboardHeight > 0 ? 48 : 40,
            transform: [{ translateY: keyboardTranslateY }],
          },
        ]}
      >
        <RecenterOverlay visible={showRecenter} measuredHeight={recenterHeight}
          plannerBorderWidth={increasedContrast ? 2 : styles.plannerPanel.borderWidth} onHeightChange={setRecenterHeight}>
          <TouchableOpacity
            style={[styles.recenterButton, increasedContrast && { borderWidth: 2, borderColor: "#1d5962" }]}
            onPress={() => { if (showRecenter) handleRecenter(); }}
            disabled={!showRecenter} accessible={showRecenter}
            accessibilityRole="button"
            accessibilityLabel="Recenter map"
            accessibilityHint="Moves the map back to your current location"
          >
            <Text
              key={`nav-text-9-${fontSize}-${fontScale}-${textRefresh}`}
              accessible={false}
              maxFontSizeMultiplier={2.5}
              style={[styles.recenterText, { fontSize: 14 * fontSize }]}
            >
              Recenter
            </Text>
          </TouchableOpacity>
        </RecenterOverlay>

        <BuildingPicker
          buildings={buildings}
          value={destinationBuilding}
          onChange={handleDestinationChange}
          onCancel={handleCancelRoute}
          placeholder="Search WPI destinations..."
          accessibilityControls
          onOpenSettings={() =>
            router.push({
              pathname: "/settings",
              params: { from: "accessibility-navigation" },
            })
          }
        />

        {routeError !== "" && (
          <Text
            key={`nav-text-10-${fontSize}-${fontScale}-${textRefresh}`}
            maxFontSizeMultiplier={2.5}
            style={[styles.errorText, { fontSize: 14 * fontSize }]}
          >
            {routeError}
          </Text>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  mapCanvas: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#e0e0e0",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
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
    overflow: "visible",
  },
  topRouteSummaryCollapsed: {
    maxHeight: 420,
  },
  topRouteSummaryExpanded: {
    height: "65%",
  },
  routeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cancelRouteButton: {
    backgroundColor: "#d9534f",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 12,
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelRouteButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  progressBarBackground: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "transparent",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#1d5962",
  },
  expandedContainer: {
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    marginTop: 8,
  },
  directionsList: {
    flex: 1,
    minHeight: 0,
    marginTop: 4,
  },
  directionsListContent: {
    flexGrow: 0,
    paddingBottom: 8,
  },
  directionItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  directionInstruction: {
    fontSize: 19,
    fontWeight: "500",
    color: "#333",
  },
  plannerPanel: {
    position: "absolute",
    bottom: -16,
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 34,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "#e0e0e0",
  },
  recenterButton: {
    minHeight: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    padding: 12,
    borderRadius: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 20,
  },
  recenterText: {
    fontWeight: "bold",
    color: "#333",
  },
  subText: {
    fontSize: 16,
    color: "#555",
    marginTop: 4,
  },
  boldText: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1d5962",
  },
  errorText: {
    color: "red",
    marginTop: 8,
  },
});
