
import { useAssets } from "expo-asset";
import { File } from "expo-file-system";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  TouchableOpacity,
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

/**
 * LocationMap embeds a Leaflet map in a React Native WebView.
 * Handles map initialization, user position updates,
 * heading tracking, and interaction callbacks.
 */
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

  const hasUserPannedAwayRef = useRef(false);

  const currentMarkerLat = userLatitude ?? latitude;
  const currentMarkerLng = userLongitude ?? longitude;

  const [assets] = useAssets([require("./leaflet.html")]);

  // Load the Leaflet HTML file.
  useEffect(() => {
    if (assets && assets[0]?.localUri) {
      const file = new File(assets[0].localUri);

      file
        .text()
        .then((content) => {
          setHtmlContent(content);
        })
        .catch((error) => {
          console.error("Failed to load Leaflet HTML:", error);
        });
    }
  }, [assets]);

  /**
   * Initialize the map after the WebView loads.
   * Includes the accessibility mode added in main.
   */
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

    // Synchronize the directions overlay with Leaflet.
    webViewRef.current?.injectJavaScript(`
      if (window.updateDirectionsExpanded) {
        window.updateDirectionsExpanded(
          ${directionsExpanded},
          ${!!route}
        );
      }
      true;
    `);
  };

  /**
   * Show the complete route, then return to
   * heading-focused navigation after four seconds.
   */
  useEffect(() => {
    if (route && route.geometry && route.geometry.length > 0) {
      hasUserPannedAwayRef.current = false;

      const routeCoords = route.geometry.map(
        (pt: [number, number]) => [pt[0], pt[1]]
      );

      webViewRef.current?.injectJavaScript(`
        if (window.map) {
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

  /**
   * Subscribe to compass updates while heading focus
   * is enabled.
   */
  useEffect(() => {
    if (!isHeadingFocused) return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    async function startHeadingTracking() {
      try {
        const sub = await Location.watchHeadingAsync((headingData) => {
          const rawHeading =
            headingData.trueHeading >= 0
              ? headingData.trueHeading
              : headingData.magHeading;

          if (
            !Number.isFinite(rawHeading) ||
            rawHeading < 0 ||
            headingData.accuracy === 0
          ) {
            return;
          }

          const normalizedHeading =
            ((rawHeading % 360) + 360) % 360;

          console.log("[MapQP Compass]", {
            trueHeading: headingData.trueHeading,
            magneticHeading: headingData.magHeading,
            accuracy: headingData.accuracy,
            selectedHeading: normalizedHeading,
          });

          webViewRef.current?.injectJavaScript(`
            if (window.setTargetHeading) {
              window.setTargetHeading(${normalizedHeading});
            }
            true;
          `);
        });

        if (cancelled) {
          sub.remove();
        } else {
          subscription = sub;
        }
      } catch (error) {
        console.error("[MapQP Compass] Tracking failed:", error);
      }
    }

    void startHeadingTracking();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [isHeadingFocused]);

  /**
   * Keep the marker and route synchronized,
   * including while the user manually pans the map.
   */
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
  }, [
    currentMarkerLat,
    currentMarkerLng,
    accuracy,
    route,
    heading,
  ]);

  /**
   * Recenter the map when requested.
   */
  useEffect(() => {
    if (
      recenterSignal !== undefined &&
      recenterSignal > 0
    ) {
      hasUserPannedAwayRef.current = false;

      webViewRef.current?.injectJavaScript(
        "if (window.resetView) window.resetView(); true;"
      );
    }
  }, [recenterSignal]);

  /**
   * Update Leaflet when the upcoming-directions
   * panel expands or collapses.
   */
  useEffect(() => {
    webViewRef.current?.injectJavaScript(`
      if (window.updateDirectionsExpanded) {
        window.updateDirectionsExpanded(
          ${directionsExpanded},
          ${!!route}
        );
      }
      true;
    `);
  }, [directionsExpanded, route]);

  /**
   * Accessible compass control.
   */
  const handleAccessibleCompass = () => {
    const nextFocused = !isHeadingFocused;

    hasUserPannedAwayRef.current = false;

    setIsHeadingFocused(nextFocused);
    onHeadingModeChange?.(nextFocused);
    onPanBack?.();

    webViewRef.current?.injectJavaScript(`
      if (window.setHeadingFocus) {
        window.setHeadingFocus(${nextFocused});
      }
      true;
    `);
  };

  if (!htmlContent) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{
          html: htmlContent,
          baseUrl: "https://localhost",
        }}
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
            onPanBack?.();
          } else if (data === "HEADING_UNLOCKED") {
            hasUserPannedAwayRef.current = false;
            setIsHeadingFocused(false);
            onHeadingModeChange?.(false);
            onPanBack?.();
          } else if (data === "TOGGLE_MUTE") {
            onToggleMute?.();
          } else if (data === "OPEN_SETTINGS") {
            onOpenSettings?.();
          }
        }}
      />

      {/* Screen-reader accessible map controls */}
      {screenReaderEnabled && (
        <>
          <TouchableOpacity
            style={[
              styles.accessibleControl,
              styles.accessibleSettings,
              route && styles.accessibleControlRoute,
              directionsExpanded &&
                styles.accessibleControlExpanded,
            ]}
            onPress={onOpenSettings}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Opens navigation settings"
          />

          <TouchableOpacity
            style={[
              styles.accessibleControl,
              styles.accessibleCompass,
              route && styles.accessibleControlRoute,
              directionsExpanded &&
                styles.accessibleControlExpanded,
            ]}
            onPress={handleAccessibleCompass}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Compass"
            accessibilityHint={
              isHeadingFocused
                ? "Double tap to turn off heading tracking"
                : "Double tap to turn on heading tracking"
            }
            accessibilityState={{
              selected: isHeadingFocused,
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  accessibleControl: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "transparent",
    zIndex: 100,
  },
  accessibleSettings: {
    top: 66,
    left: 10,
  },
  accessibleCompass: {
    top: 66,
    right: 22,
  },
  accessibleControlRoute: {
    top: 156,
  },
  accessibleControlExpanded: {
    top: "68%",
  },
});
