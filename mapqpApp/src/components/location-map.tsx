import { createPositionInterpolator } from "../utils/position-interpolation";
import { useSettings } from "../context/settings-context";
import { useFocusEffect } from "expo-router";
import { Asset } from "expo-asset";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { VoiceMapCommand } from "../utils/voice-map-command";
import { AppState, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import MapControls, { MAP_CONTROLS_HEIGHT, MAP_CONTROLS_WIDTH, MAP_ZOOM_CONTROLS_WIDTH, type CameraAction, type CameraState } from "./map-controls";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";

export type LocationMapHandle = {
  voiceCommand: (command: VoiceMapCommand, recenter: () => void) => Promise<string>;
};

type LocationMapProps = {
  ref?: Ref<LocationMapHandle>;
  latitude: number;
  longitude: number;
  userLatitude?: number;
  userLongitude?: number;
  accuracy: number;
  speed?: number | null;
  positionHeading?: number | null;
  positionTimestamp?: number;
  heading?: number | null;
  route?: any;
  directionsExpanded?: boolean;
  accessibilityMode?: boolean;
  recenterSignal?: number;
  onUserDragged?: () => void;
  onHeadingModeChange?: (isFocused: boolean) => void;
  onToggleMute?: () => void;
  onOpenSettings?: () => void;
  onPanBack?: () => void;
  controlsTop?: number;
  controlsBottom?: number;
};

export default function LocationMap({
  ref,
  latitude,
  longitude,
  userLatitude,
  userLongitude,
  accuracy,
  speed,
  positionHeading,
  positionTimestamp,
  heading,
  route,
  directionsExpanded = false,
  accessibilityMode = false,
  recenterSignal,
  onUserDragged,
  onHeadingModeChange,
  onToggleMute,
  onOpenSettings,
  onPanBack,
  controlsTop = 132,
  controlsBottom = 160,
}: LocationMapProps) {
  const { batterySaverEnabled, deviceAccessibility, customAccessibilityPreferences } = useSettings();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useFocusEffect(useCallback(() => {
    setFocused(true);
    setForeground(AppState.currentState === "active");
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);
  // Battery saver reduces decorative motion, but only explicit user/device
  // Reduce Motion settings suppress this position smoothing.
  const smoothPosition = batterySaverEnabled && focused && foreground &&
    !deviceAccessibility.reduceMotionEnabled && !customAccessibilityPreferences.reduceMotionEnabled;
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView<{}>>(null);
  const [mapHeight, setMapHeight] = useState(0);
  const [controlLayout, setControlLayout] = useState<{
    hasRoute: boolean; expanded: boolean; clearance: number; top: number; leftBottom: number;
  } | null>(null);
  const [isHeadingFocused, setIsHeadingFocused] = useState(false);
  const [camera, setCamera] = useState<CameraState>({ ready: false, zoom: 16, minZoom: 0, maxZoom: 19 });
  const cameraReady = useRef(camera.ready);
  const voiceSequence = useRef(0);
  const pendingVoice = useRef<{ id: number; resolve: (message: string) => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const pendingRecenter = useRef<number | null>(null);
  const finishVoice = (message: string) => {
    const pending = pendingVoice.current;
    pendingVoice.current = null;
    pendingRecenter.current = null;
    if (pending) { clearTimeout(pending.timer); pending.resolve(message); }
  };
  useEffect(() => () => finishVoice("Map command cancelled."), []);
  useImperativeHandle(ref, () => ({
    voiceCommand: (command, recenter) => {
      if (!accessibilityMode || !cameraReady.current || !webViewRef.current) return Promise.resolve("Map is still loading.");
      if (pendingVoice.current) return Promise.resolve("Map is still moving. Try again.");
      if (command === "recenter" && (!Number.isFinite(userLatitude) || !Number.isFinite(userLongitude))) return Promise.resolve("Current location is unavailable.");
      if (command === "zoom-in" && camera.zoom >= camera.maxZoom) return Promise.resolve("Maximum zoom reached.");
      if (command === "zoom-out" && camera.zoom <= camera.minZoom) return Promise.resolve("Minimum zoom reached.");
      return new Promise<string>((resolve) => {
        const id = ++voiceSequence.current;
        pendingVoice.current = { id, resolve, timer: setTimeout(() => finishVoice("Map command timed out. Try again."), 4500) };
        cancelPreview();
        try {
          if (command === "recenter") { pendingRecenter.current = id; recenter(); }
          else {
            beginManualExploration();
            webViewRef.current?.injectJavaScript(`window.voiceCameraCommand && window.voiceCameraCommand(${JSON.stringify(command)}, ${id}); true;`);
          }
        } catch { finishVoice("Could not move the map. Try again."); }
      });
    },
  }));
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewGeneration = useRef(0);
  const hasUserPannedAwayRef = useRef(false);
  const cancelPreview = () => {
    previewGeneration.current += 1;
    if (previewTimer.current !== null) clearTimeout(previewTimer.current);
    previewTimer.current = null;
  };
  const beginManualExploration = () => {
    cancelPreview();
    hasUserPannedAwayRef.current = true;
    setIsHeadingFocused(false);
    onUserDragged?.();
  };
  const sendCameraCommand = (action: CameraAction) => {
    if (!camera.ready) return;
    beginManualExploration();
    webViewRef.current?.injectJavaScript(`window.cameraCommand && window.cameraCommand(${JSON.stringify(action)}); true;`);
  };
  const [mapUri, setMapUri] = useState<string>("");

  const {
    reduceMotionEnabled,
    boldTextEnabled,
    darkerSystemColorsEnabled,
    highTextContrastEnabled,
    reduceTransparencyEnabled,
    loaded: accessibilityLoaded,
  } = useAccessibilityPreferences();
  const increasedContrast = darkerSystemColorsEnabled || highTextContrastEnabled;
  const visualPreferencesScript = `
    if (window.setVisualAccessibility) {
      window.setVisualAccessibility(${boldTextEnabled}, ${increasedContrast}, ${reduceTransparencyEnabled});
    }
    true;
  `;

  useEffect(() => {
    webViewRef.current?.injectJavaScript(visualPreferencesScript);
  }, [visualPreferencesScript]);

  useEffect(() => {
    webViewRef.current?.injectJavaScript(`
      if (window.setReduceMotion) {
        window.setReduceMotion(${!accessibilityLoaded || reduceMotionEnabled});
      }
      true;
    `);
  }, [accessibilityLoaded, reduceMotionEnabled]);

  const currentMarkerLat = userLatitude ?? latitude;
  const currentMarkerLng = userLongitude ?? longitude;
  const motionScript = `
    if (window.updateMotionSample) window.updateMotionSample(${JSON.stringify({
      latitude: currentMarkerLat, longitude: currentMarkerLng,
      accuracy, speed, heading: positionHeading != null && positionHeading >= 0 ? positionHeading : heading,
      timestamp: positionTimestamp,
    })}, ${JSON.stringify(route?.geometry ?? null)}, ${smoothPosition});
    true;
  `;
  useEffect(() => {
    if (camera.ready) webViewRef.current?.injectJavaScript(motionScript);
  }, [motionScript, camera.ready]);


  // Robust asset loader ensuring the file is downloaded locally before passing URI to WebView
  useEffect(() => {
    async function loadMapAsset() {
      try {
        const asset = Asset.fromModule(require("./leaflet.html"));
        if (!asset.downloaded) {
          await asset.downloadAsync();
        }
        if (asset.localUri) {
          setMapUri(asset.localUri);
        }
      } catch (error) {
        console.error("Failed to load Leaflet asset URI:", error);
      }
    }
    loadMapAsset();
  }, []);

  const hasRoute = !!route;
  const summaryClearance = hasRoute ? controlsTop : 0;
  const controlPositionScript = `
    if (window.updateDirectionsExpanded) {
      window.updateDirectionsExpanded(${directionsExpanded}, ${hasRoute}, ${summaryClearance});
    }
    if (window.map) window.map.invalidateSize();
    true;
  `;
  useEffect(() => {
    webViewRef.current?.injectJavaScript(controlPositionScript);
  }, [controlPositionScript, camera.ready, mapHeight]);

  const layoutCurrent = controlLayout?.hasRoute === hasRoute &&
    controlLayout?.expanded === directionsExpanded && controlLayout?.clearance === summaryClearance;
  // Both screens supply measured planner + keyboard + recenter clearance.
  // Use max rather than adding the bottom inset again to that measured clearance.
  const panelBottom = Math.max(controlsBottom, insets.bottom + 12);
  const upperBoundary = Math.max(insets.top + 12, hasRoute ? Math.max(150, controlsTop) : 132,
    layoutCurrent ? controlLayout.leftBottom + 8 : 0);
  const availableControlsHeight = mapHeight > 0
    ? Math.max(0, mapHeight - upperBoundary - panelBottom) : MAP_CONTROLS_HEIGHT;
  const controlsHeight = Math.min(MAP_CONTROLS_HEIGHT, availableControlsHeight);


  const handleLoadEnd = () => {
    webViewRef.current?.injectJavaScript(`
      window.positionInterpolator = (${createPositionInterpolator.toString()})();
      true;
    `);
    webViewRef.current?.injectJavaScript(visualPreferencesScript);
    webViewRef.current?.injectJavaScript(`
      if (window.setReduceMotion) {
        window.setReduceMotion(${!accessibilityLoaded || reduceMotionEnabled});
      }
      if (window.initMap) {
        window.initMap(
          ${latitude},
          ${longitude},
          ${currentMarkerLat},
          ${currentMarkerLng},
          ${accuracy},
          ${JSON.stringify(route || null)},
          ${accessibilityMode}
        );
      }
      setTimeout(function() {
        if (window.map) {
          window.map.invalidateSize();
        }
      }, 300);
      true;
    `);
    webViewRef.current?.injectJavaScript(controlPositionScript);
    webViewRef.current?.injectJavaScript(motionScript);
  };

  const latestPosition = useRef({ currentMarkerLat, currentMarkerLng, accuracy, route });
  latestPosition.current = { currentMarkerLat, currentMarkerLng, accuracy, route };

  /**
   * Show the complete route facing North, then switch to
   * heading-focused navigation and zoom into the user after 4 seconds.
   */
  useEffect(() => {
    cancelPreview();
    if (camera.ready && route && route.geometry && route.geometry.length > 0) {
      hasUserPannedAwayRef.current = false;

      const routeCoords = route.geometry.map(
        (pt: [number, number]) => [pt[0], pt[1]]
      );

      webViewRef.current?.injectJavaScript(`
        window.manualCameraExploration = false;
        if (window.map) {
          if (window.smoothRotateToZero) {
            window.smoothRotateToZero();
          } else {
            window.map.setBearing(0);
          }

          var bounds = L.latLngBounds(
            ${JSON.stringify(routeCoords)}
          );

          window.map.fitBounds(bounds, {
            padding: [60, 60],
            maxZoom: 16,
            animate: !window.reduceMotionEnabled
          });
          window.map.invalidateSize();
        }
        true;
      `);

      const generation = previewGeneration.current;
      previewTimer.current = setTimeout(() => {
        if (hasUserPannedAwayRef.current || generation !== previewGeneration.current) return;
        previewTimer.current = null;
        const latest = latestPosition.current;

        setIsHeadingFocused(true);
        onHeadingModeChange?.(true);
        onPanBack?.();

        webViewRef.current?.injectJavaScript(`
          if (!window.manualCameraExploration) {
            if (window.setHeadingFocus) {
              window.setHeadingFocus(true);
            }

            if (window.updateMap) {
              window.updateMap(
                ${latest.currentMarkerLat},
                ${latest.currentMarkerLng},
                ${latest.accuracy},
                ${JSON.stringify(latest.route)}
              );
            }
            if (window.map) {
              window.map.invalidateSize();
            }
          }
          true;
        `);
      }, 4000);
    }
    return cancelPreview;
  }, [route, camera.ready]);

  useEffect(() => {
    if (!isHeadingFocused || heading === null || heading === undefined) return;
    webViewRef.current?.injectJavaScript(`
      if (window.setTargetHeading) {
        window.setTargetHeading(${heading});
      }
      true;
    `);
  }, [heading, isHeadingFocused]);

  useEffect(() => {
    if (recenterSignal !== undefined && recenterSignal > 0) {
      cancelPreview();
      const voiceId = pendingRecenter.current;
      pendingRecenter.current = null;
      webViewRef.current?.injectJavaScript(`
        if (${voiceId !== null} && window.voiceCameraCommand) {
          window.voiceCameraCommand('recenter', ${voiceId});
        } else if (window.resetView) {
          window.resetView();
        }
        if (window.map) {
          window.map.invalidateSize();
        }
        true;
      `);
    }
  }, [recenterSignal]);

  useEffect(() => {
    webViewRef.current?.injectJavaScript(`
      if (window.updateMap) {
        window.updateMap(
          ${currentMarkerLat},
          ${currentMarkerLng},
          ${accuracy},
          ${JSON.stringify(route || null)}
        );
      }
      true;
    `);
  }, [currentMarkerLat, currentMarkerLng, accuracy, route]);

  if (!mapUri) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container} onLayout={(event) => setMapHeight(event.nativeEvent.layout.height)}>
      <WebView<{}>
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ uri: mapUri }}
        style={styles.map}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        allowFileAccessFromFileURLs={true}
        onLoadStart={() => {
          cameraReady.current = false;
          finishVoice("Map reloaded. Try again.");
          cancelPreview();
          setCamera((previous) => ({ ...previous, ready: false }));
        }}
        onError={() => {
          cameraReady.current = false;
          finishVoice("Map is unavailable. Try again.");
          cancelPreview();
          setCamera((previous) => ({ ...previous, ready: false }));
        }}
        onLoadEnd={handleLoadEnd}
        onMessage={(event: WebViewMessageEvent) => {
          const data = event.nativeEvent.data;
          if (data.startsWith("{")) {
            try {
              const state = JSON.parse(data);
              if (state.type === "VOICE_CAMERA_RESULT" && state.id === pendingVoice.current?.id && typeof state.message === "string") {
                finishVoice(state.message);
              }
              if (state.type === "MAP_CONTROLS_LAYOUT" &&
                  [state.top, state.leftBottom, state.clearance].every(Number.isFinite)) {
                setControlLayout(state);
              }
              if (["MAP_READY", "CAMERA_STATE", "CAMERA_COMMAND_COMPLETE"].includes(state.type) &&
                  [state.zoom, state.minZoom, state.maxZoom].every(Number.isFinite)) {
                cameraReady.current = true;
                setCamera({ ready: true, zoom: state.zoom, minZoom: state.minZoom, maxZoom: state.maxZoom });
              }
            } catch { /* Ignore messages outside the camera protocol. */ }
          } else if (data === "USER_DRAGGED") {
            beginManualExploration();
          } else if (data === "HEADING_LOCKED") {
            cancelPreview();
            hasUserPannedAwayRef.current = false;
            setIsHeadingFocused(true);
            onHeadingModeChange?.(true);
          } else if (data === "HEADING_UNLOCKED") {
            cancelPreview();
            hasUserPannedAwayRef.current = false;
            setIsHeadingFocused(false);
            onHeadingModeChange?.(false);
          } else if (data === "TOGGLE_MUTE") {
            onToggleMute?.();
          } else if (data === "OPEN_SETTINGS") {
            onOpenSettings?.();
          }
        }}
      />
      <View pointerEvents="box-none" style={[styles.controls,
        { left: insets.left + 12, bottom: panelBottom, width: accessibilityMode ? MAP_CONTROLS_WIDTH : MAP_ZOOM_CONTROLS_WIDTH, height: controlsHeight }]}>
        <ScrollView style={styles.controlsViewport} contentContainerStyle={styles.controlsContent}
          scrollEnabled={availableControlsHeight < MAP_CONTROLS_HEIGHT}
          showsVerticalScrollIndicator={availableControlsHeight < MAP_CONTROLS_HEIGHT}
          keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          <MapControls accessibilityMode={accessibilityMode} camera={camera} onCommand={sendCameraCommand} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: "100%", height: "100%" },
  controlsViewport: { flex: 1 },
  controlsContent: { alignItems: "flex-start" },
  controls: { position: "absolute", maxWidth: "94%" },
});
