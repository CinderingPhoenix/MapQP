import { Asset } from "expo-asset";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { useDeviceAccessibility } from "../hooks/use-device-accessibility";

type LocationMapProps = {
  latitude: number;
  longitude: number;
  userLatitude?: number;
  userLongitude?: number;
  accuracy: number;
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
};

export default function LocationMap({
  latitude,
  longitude,
  userLatitude,
  userLongitude,
  accuracy,
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
}: LocationMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [isHeadingFocused, setIsHeadingFocused] = useState(false);
  const [mapUri, setMapUri] = useState<string>("");

  const { screenReaderEnabled, reduceMotionEnabled, loaded: accessibilityLoaded } = useDeviceAccessibility();

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

  // Force Leaflet map resize and re-render tiles when directions expanded/collapsed state changes
  useEffect(() => {
    webViewRef.current?.injectJavaScript(`
      if (window.map) {
        window.map.invalidateSize();
      }
      true;
    `);
  }, [directionsExpanded]);

  const handleLoadEnd = () => {
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
  };

  /**
   * Show the complete route facing North, then switch to
   * heading-focused navigation and zoom into the user after 4 seconds.
   */
  useEffect(() => {
    if (route && route.geometry && route.geometry.length > 0) {
      hasUserPannedAwayRef.current = false;

      const routeCoords = route.geometry.map(
        (pt: [number, number]) => [pt[0], pt[1]]
      );

      webViewRef.current?.injectJavaScript(`
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

      const timeoutId = setTimeout(() => {
        hasUserPannedAwayRef.current = false;

        setIsHeadingFocused(true);
        onHeadingModeChange?.(true);
        onPanBack?.();

        webViewRef.current?.injectJavaScript(`
          if (window.setHeadingFocus) {
            window.setHeadingFocus(true);
          }

          if (window.updateMap) {
            window.updateMap(
              ${currentMarkerLat},
              ${currentMarkerLng},
              ${accuracy},
              ${JSON.stringify(route)}
            );
          }
          if (window.map) {
            window.map.invalidateSize();
          }
          true;
        `);
      }, 4000);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [route]);

  const hasUserPannedAwayRef = useRef(false);

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
      webViewRef.current?.injectJavaScript(`
        if (window.resetView) {
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
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ uri: mapUri }}
        style={styles.map}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        allowFileAccessFromFileURLs={true}
        onLoadEnd={handleLoadEnd}
        onMessage={(event) => {
          const data = event.nativeEvent.data;
          if (data === "USER_DRAGGED") {
            hasUserPannedAwayRef.current = true;
            setIsHeadingFocused(false);
            onUserDragged?.();
          } else if (data === "HEADING_LOCKED") {
            hasUserPannedAwayRef.current = false;
            setIsHeadingFocused(true);
            onHeadingModeChange?.(true);
          } else if (data === "HEADING_UNLOCKED") {
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: "100%", height: "100%" },
});