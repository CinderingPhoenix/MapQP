import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BuildingPicker from "../components/building-picker";
import LocationMap from "../components/location-map";
import { useSettings } from "../context/settings-context";
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
  const keyboardTranslateY = useRef(new Animated.Value(0)).current;
  const { distanceUnits, directionStyle, fontSize } = useSettings();

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => Animated.timing(keyboardTranslateY, { toValue: -(event.endCoordinates.height + 10), duration: event.duration || 175, useNativeDriver: true }).start());
    const hideSub = Keyboard.addListener(hideEvent, (event) => Animated.timing(keyboardTranslateY, { toValue: 0, duration: event.duration || 200, useNativeDriver: true }).start());
    return () => { showSub.remove(); hideSub.remove(); };
  }, [keyboardTranslateY]);

  return (
    <SafeAreaView style={styles.container}>
      {route && (
        <View style={[styles.topRouteSummary, directionsExpanded && styles.topRouteSummaryExpanded]}>
          {directionsExpanded ? (
            <View style={styles.expandedContainer}>
              <TouchableOpacity onPress={() => setDirectionsExpanded(false)} activeOpacity={0.7} style={styles.expandedHeader}>
                <Text style={[styles.boldText, { fontSize: 22 * fontSize },]}>Upcoming Directions</Text>
                <Text style={styles.collapseHint}>Tap to collapse</Text>
              </TouchableOpacity>
              <ScrollView style={styles.directionsList} nestedScrollEnabled keyboardShouldPersistTaps="always" showsVerticalScrollIndicator>
                {upcomingSteps.map((step, index) => {
                  const distance = index === 0
                    ? getDistanceToStepPoint(route.geometry, currentRouteIndex, step.pointIndex, coordinates?.latitude, coordinates?.longitude)
                    : getSegmentDistance(route.geometry, upcomingSteps[index - 1].pointIndex, step.pointIndex);
                  return <View key={`${step.pointIndex}-${index}`} style={styles.directionItem}><Text style={[styles.directionInstruction, { fontSize: 19 * fontSize }, ]}>{formatInstructionWithDistance(formatDirectionInstruction(step, directionStyle), distance, distanceUnits)}</Text></View>;
                })}
                {upcomingSteps.length === 0 && <View style={styles.directionItem}><Text style={[styles.directionInstruction, { fontSize: 19 * fontSize }, ]}>You have arrived!</Text></View>}
              </ScrollView>
              <TouchableOpacity onPress={() => setDirectionsExpanded(false)} activeOpacity={0.7}><Text style={[styles.subText, { marginTop: 10 }, { fontSize: 16 * fontSize }]}>{formatDistance(route.distance, distanceUnits)} • {formatDuration(route.duration)} left</Text></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setDirectionsExpanded(true)} activeOpacity={0.7}>
              <Text style={[styles.boldText, { fontSize: 22 * fontSize }, ]}>{nextStep ? formatInstructionWithDistance(formatDirectionInstruction(nextStep, directionStyle), distToNextStepMeters, distanceUnits) : "Follow route"}</Text>
              <Text style={[styles.subText, { fontSize: 16 * fontSize }, ]}>{formatDistance(route.distance, distanceUnits)} total • {formatDuration(route.duration)}</Text>
            </TouchableOpacity>
          )}
          {routeLoadingProgress < 1 && <View style={styles.progressBarBackground}><View style={[styles.progressBarFill, { width: `${routeLoadingProgress * 100}%` }]} /></View>}
        </View>
      )}

      <View style={styles.mapCanvas} onStartShouldSetResponderCapture={() => { Keyboard.dismiss(); if (directionsExpanded) setDirectionsExpanded(false); return false; }}>
        {error ? <View style={styles.loadingContainer}><Text>{error}</Text></View> : <LocationMap
          latitude={showRecenter ? mapCenter.latitude : (coordinates?.latitude ?? mapCenter.latitude)}
          longitude={showRecenter ? mapCenter.longitude : (coordinates?.longitude ?? mapCenter.longitude)}
          userLatitude={coordinates?.latitude}
          userLongitude={coordinates?.longitude}
          accuracy={coordinates?.accuracy ?? 0}
          route={route}
          recenterSignal={recenterSignal}
          onUserDragged={() => setShowRecenter(true)}
          onPanBack={() => setShowRecenter(false)}
          onHeadingModeChange={() => setShowRecenter(false)}
          onToggleMute={toggleMute}
          onOpenSettings={() => router.push("/settings")}
        />}
      </View>

      <Animated.View style={[styles.plannerPanel, { transform: [{ translateY: keyboardTranslateY }] }]}>
        {showRecenter && <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}><Text style={styles.recenterText}>Recenter</Text></TouchableOpacity>}
        <BuildingPicker buildings={WPI_BUILDINGS} value={destinationBuilding} onChange={handleDestinationChange} onCancel={handleCancelRoute} placeholder="Search WPI destinations..." />
        {routeError !== "" && <Text style={styles.errorText}>{routeError}</Text>}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  mapCanvas: { ...StyleSheet.absoluteFill, backgroundColor: "#e0e0e0" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  topRouteSummary: { position: "absolute", top: 56, left: 16, right: 16, zIndex: 20, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 5, borderWidth: 1, borderColor: "#e0e0e0", overflow: "hidden" },
  topRouteSummaryExpanded: { height: 480 },
  progressBarBackground: { position: "absolute", bottom: 0, left: 0, right: 0, height: 4, backgroundColor: "transparent" },
  progressBarFill: { height: "100%", backgroundColor: "#1d5962" },
  expandedContainer: { flex: 1, flexDirection: "column" },
  expandedHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8 },
  collapseHint: { fontSize: 13, color: "#888" },
  directionsList: { flex: 1, marginTop: 4 },
  directionItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  directionInstruction: { fontSize: 19, fontWeight: "500", color: "#333" },
  plannerPanel: { position: "absolute", bottom: 16, left: 16, right: 16, zIndex: 10, backgroundColor: "#fff", borderRadius: 12, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 5, borderWidth: 1, borderColor: "#e0e0e0" },
  recenterButton: { position: "absolute", top: -56, right: 0, backgroundColor: "white", padding: 12, borderRadius: 8, elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, zIndex: 20 },
  recenterText: { fontWeight: "bold", color: "#333" },
  subText: { fontSize: 16, color: "#555", marginTop: 4 },
  boldText: { fontSize: 22, fontWeight: "bold", color: "#1d5962" },
  errorText: { color: "red", marginTop: 8 },
});
