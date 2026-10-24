import { useAssets } from "expo-asset";
import { File } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
} from "react-native";
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
  const [htmlContent, setHtmlContent] = useState<string>("");

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

  const [assets] = useAssets([require("./leaflet.html")]);

  useEffect(() => {
    if (assets && assets[0]?.localUri) {
      const file = new File(assets[0].localUri);
      file
        .text()
        .then((content) => setHtmlContent(content))
        .catch((error) => console.error("Failed to load Leaflet HTML:", error));
    }
  }, [assets]);

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

      // 1. Reset map bearing to North (0) and fit bounds to show full route overview
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
        }
        true;
      `);

      // 2. After 4 seconds matching routeLoadingProgress, lock heading focus and zoom on user
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

          true;
        `);
      }, 4000);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [route]);

  const hasUserPannedAwayRef = useRef(false);

  // Pass active heading to map rotation when locked
  useEffect(() => {
    if (!isHeadingFocused || heading === null || heading === undefined) return;
    webViewRef.current?.injectJavaScript(`
      if (window.setTargetHeading) {
        window.setTargetHeading(${heading});
      }
      true;
    `);
  }, [heading, isHeadingFocused]);

  /**
   * Recenter the map when requested.
   */
  useEffect(() => {
    if (recenterSignal !== undefined && recenterSignal > 0) {
      webViewRef.current?.injectJavaScript(`
        if (window.resetView) {
          window.resetView();
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

  if (!htmlContent) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: htmlContent, baseUrl: "https://localhost" }}
        style={styles.map}
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