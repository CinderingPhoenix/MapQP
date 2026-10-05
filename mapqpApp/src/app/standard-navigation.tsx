import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BuildingPicker from "../components/building-picker";
import LocationMap from "../components/location-map";
import { useSettings } from "../context/settings-context";
import { useDeviceAccessibility } from "../hooks/use-device-accessibility";
import {
  WPI_BUILDINGS,
  formatDirectionInstruction,
  formatDistance,
  formatDuration,
  formatInstructionWithDistance,
  getDistanceToStepPoint,
  getSegmentDistance,
  useMapNavigation,
} from "./map-logic";

export default function Home() {
  const {
    coordinates,
    mapCenter,
    error,
    destinationBuilding,
    route,
    routeError,
    currentRouteIndex,
    showRecenter,
    recenterSignal,
    routeLoadingProgress,
    upcomingSteps,
    nextStep,
    distToNextStepMeters,
    toggleMute,
    handleDestinationChange,
    handleCancelRoute,
    handleRecenter,
    setShowRecenter,
  } = useMapNavigation();
  const [directionsExpanded, setDirectionsExpanded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardTranslateY = useRef(new Animated.Value(0)).current;
  const { distanceUnits, directionStyle, fontSize } = useSettings();
  const { reduceMotionEnabled, boldTextEnabled, darkerSystemColorsEnabled } = useDeviceAccessibility();

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";

    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

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

  return (
    <SafeAreaView style={styles.container}>
      {route && (
        <View style={[styles.topRouteSummary, directionsExpanded ? styles.topRouteSummaryExpanded : styles.topRouteSummaryCollapsed]}>
          {directionsExpanded ? (
            <View style={styles.expandedContainer}>
              <TouchableOpacity onPress={() => setDirectionsExpanded(false)} activeOpacity={0.7} style={styles.expandedHeader}>
                <Text maxFontSizeMultiplier={1.6} style={[styles.boldText, { fontSize: 22 * fontSize, fontWeight: "bold" },]}>Upcoming Directions</Text>
                <Text maxFontSizeMultiplier={1.5} style={[styles.collapseHint, { fontSize: 13 * fontSize, color: darkerSystemColorsEnabled ? "#333" : "#888" }]}>Tap to collapse</Text>
              </TouchableOpacity>
              <ScrollView style={styles.directionsList} contentContainerStyle={styles.directionsListContent} nestedScrollEnabled keyboardShouldPersistTaps="always" showsVerticalScrollIndicator>
                {upcomingSteps.map((step, index) => {
                  const distance = index === 0
                    ? getDistanceToStepPoint(route.geometry, currentRouteIndex, step.pointIndex, coordinates?.latitude, coordinates?.longitude)
                    : getSegmentDistance(route.geometry, upcomingSteps[index - 1].pointIndex, step.pointIndex);
                  return <View key={`${step.pointIndex}-${index}`}style={[styles.directionItem, {borderBottomColor: darkerSystemColorsEnabled ? "#aaa" : "#eee",},]}><Text maxFontSizeMultiplier={1.8} style={[styles.directionInstruction, { fontSize: 19 * fontSize, fontWeight: boldTextEnabled ? "600" : "500" }, ]}>{formatInstructionWithDistance(formatDirectionInstruction(step, directionStyle), distance, distanceUnits)}</Text></View>;
                })}
                {upcomingSteps.length === 0 && <View style={[styles.directionItem, {borderBottomColor: darkerSystemColorsEnabled ? "#aaa" : "#eee"},]}><Text maxFontSizeMultiplier={1.8} style={[styles.directionInstruction, { fontSize: 19 * fontSize, fontWeight: boldTextEnabled ? "600" : "500" }, ]}>You have arrived!</Text></View>}
              </ScrollView>
              <TouchableOpacity onPress={() => setDirectionsExpanded(false)} activeOpacity={0.7}><Text maxFontSizeMultiplier={1.6} style={[styles.subText, { marginTop: 10 }, { fontSize: 16 * fontSize, fontWeight: boldTextEnabled ? "600" : "normal", color: darkerSystemColorsEnabled ? "#222" : "#555", }]}>{formatDistance(route.distance, distanceUnits)} • {formatDuration(route.duration)} left</Text></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setDirectionsExpanded(true)} activeOpacity={0.7}>
              <Text maxFontSizeMultiplier={2} style={[styles.boldText, { fontSize: 22 * fontSize, fontWeight: "bold" }, ]}>{nextStep ? formatInstructionWithDistance(formatDirectionInstruction(nextStep, directionStyle), distToNextStepMeters, distanceUnits) : "Follow route"}</Text>
              <Text maxFontSizeMultiplier={1.6} style={[styles.subText, { fontSize: 16 * fontSize, fontWeight: boldTextEnabled ? "600" : "normal", color: darkerSystemColorsEnabled ? "#222" : "#555" }, ]}>{formatDistance(route.distance, distanceUnits)} total • {formatDuration(route.duration)}</Text>
            </TouchableOpacity>
          )}
          {routeLoadingProgress < 1 && <View style={styles.progressBarBackground}><View style={[styles.progressBarFill, { width: `${routeLoadingProgress * 100}%` }]} /></View>}
        </View>
      )}

      <View style={styles.mapCanvas} onStartShouldSetResponderCapture={() => { Keyboard.dismiss(); if (directionsExpanded) setDirectionsExpanded(false); return false; }}>
        {error ? <View style={styles.loadingContainer}><Text maxFontSizeMultiplier={1.6} style={{ fontSize: 16 * fontSize }}>{error}</Text></View> : <LocationMap
          latitude={showRecenter ? mapCenter.latitude : (coordinates?.latitude ?? mapCenter.latitude)}
          longitude={showRecenter ? mapCenter.longitude : (coordinates?.longitude ?? mapCenter.longitude)}
          userLatitude={coordinates?.latitude}
          userLongitude={coordinates?.longitude}
          accuracy={coordinates?.accuracy ?? 0}
          route={route}
          directionsExpanded={directionsExpanded}
          recenterSignal={recenterSignal}
          onUserDragged={() => setShowRecenter(true)}
          onPanBack={() => setShowRecenter(false)}
          onHeadingModeChange={() => setShowRecenter(false)}
          onToggleMute={toggleMute}
          onOpenSettings={() => router.push("/settings")}
        />}
      </View>

      <Animated.View style={[styles.plannerPanel, { paddingBottom: keyboardHeight > 0 ? 48 : 40, transform: [{ translateY: keyboardTranslateY }] }]}> 
        {showRecenter && <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}><Text maxFontSizeMultiplier={1.5} style={[styles.recenterText, { fontSize: 14 * fontSize }]}>Recenter</Text></TouchableOpacity>}
        <BuildingPicker buildings={WPI_BUILDINGS} value={destinationBuilding} onChange={handleDestinationChange} onCancel={handleCancelRoute} placeholder="Search WPI destinations..." />
        {routeError !== "" && <Text maxFontSizeMultiplier={1.6} style={[styles.errorText, { fontSize: 14 * fontSize }]}>{routeError}</Text>}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  mapCanvas: { ...StyleSheet.absoluteFill, backgroundColor: "#e0e0e0" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  topRouteSummary: { position: "absolute", top: 56, left: 16, right: 16, zIndex: 20, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 5, borderWidth: 1, borderColor: "#e0e0e0", overflow: "hidden" },
  topRouteSummaryCollapsed: { maxHeight: 260 },
  topRouteSummaryExpanded: { height: "65%" },
  progressBarBackground: { position: "absolute", bottom: 0, left: 0, right: 0, height: 4, backgroundColor: "transparent" },
  progressBarFill: { height: "100%", backgroundColor: "#1d5962" },
  expandedContainer: { flex: 1, flexDirection: "column", minHeight: 0 },
  expandedHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 4, paddingBottom: 8 },
  collapseHint: { fontSize: 13, color: "#888" },
  directionsList: { flex: 1, minHeight: 0, marginTop: 4 },
  directionsListContent: { flexGrow: 0, paddingBottom: 8 },
  directionItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  directionInstruction: { fontSize: 19, fontWeight: "500", color: "#333" },
  plannerPanel: { position: "absolute", bottom: -16, left: 16, right: 16, zIndex: 10, backgroundColor: "#fff", borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 16, paddingBottom: 40, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 5, borderWidth: 1, borderBottomWidth: 0, borderColor: "#e0e0e0" },
  recenterButton: { position: "absolute", top: -56, right: 0, backgroundColor: "white", padding: 12, borderRadius: 8, elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, zIndex: 20 },
  recenterText: { fontWeight: "bold", color: "#333" },
  subText: { fontSize: 16, color: "#555", marginTop: 4 },
  boldText: { fontSize: 22, fontWeight: "bold", color: "#1d5962" },
  errorText: { color: "red", marginTop: 8 },
});
