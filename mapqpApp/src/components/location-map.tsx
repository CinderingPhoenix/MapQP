import { useAssets } from "expo-asset";
import { File } from "expo-file-system";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

type LocationMapProps = {
  latitude: number;
  longitude: number;
  userLatitude?: number;
  userLongitude?: number;
  accuracy: number;
  heading?: number | null;
  route?: any;
  recenterSignal?: number;
  onUserDragged?: () => void;
  onHeadingModeChange?: (isFocused: boolean) => void;
  onToggleMute?: () => void;
  onOpenSettings?: () => void;
  onPanBack?: () => void;
};

/**
 * LocationMap component embeds and bridges a Leaflet map HTML file within a React Native WebView.
 * Manages map initialization assets, user position updates, heading tracking subscriptions, and interaction callbacks.
 */
export default function LocationMap({
  latitude,
  longitude,
  userLatitude,
  userLongitude,
  accuracy,
  heading,
  route,
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

  // Track whether the user has manually dragged away from auto-centering
  const hasUserPannedAwayRef = useRef(false);

  const currentMarkerLat = userLatitude ?? latitude;
  const currentMarkerLng = userLongitude ?? longitude;

  const [assets] = useAssets([require("./leaflet.html")]);

  useEffect(() => {
    if (assets && assets[0]?.localUri) {
      const file = new File(assets[0].localUri);
      file.text().then((content) => {
        setHtmlContent(content);
      });
    }
  }, [assets]);

  /**
   * Injects initialization script into the WebView once the HTML content has loaded.
   */
  const handleLoadEnd = () => {
    webViewRef.current?.injectJavaScript(`
      if (window.initMap) {
        window.initMap(
          ${latitude}, 
          ${longitude}, 
          ${currentMarkerLat}, 
          ${currentMarkerLng}, 
          ${accuracy}, 
          ${JSON.stringify(route || null)}
        );
      }
      true;
    `);
  };

  // 1. Initial route overview fitBounds -> 4 second silent delay -> focuses on user & sets heading focused
  useEffect(() => {
    if (route && route.geometry && route.geometry.length > 0) {
      hasUserPannedAwayRef.current = false;
      const routeCoords = route.geometry.map((pt: [number, number]) => [pt[0], pt[1]]);

      webViewRef.current?.injectJavaScript(`
        if (window.map) {
          var bounds = L.latLngBounds(${JSON.stringify(routeCoords)});
          window.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
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
            window.updateMap(${currentMarkerLat}, ${currentMarkerLng}, ${accuracy}, ${JSON.stringify(route)});
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
   * Subscribes to device heading updates when heading focus is locked.
   */
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let isMounted = true;
    let previousRawHeading: number | null = null;
    let absoluteHeading: number | null = null;

    async function startHeadingTracking() {
      if (isHeadingFocused) {
        const sub = await Location.watchHeadingAsync((headingData) => {
          let rawHeadingDeg = headingData.trueHeading >= 0 
            ? headingData.trueHeading 
            : headingData.magHeading;

          rawHeadingDeg = rawHeadingDeg % 360;

          if (absoluteHeading === null || previousRawHeading === null) {
            absoluteHeading = rawHeadingDeg;
            previousRawHeading = rawHeadingDeg; 
          } else {
            let diff = rawHeadingDeg - previousRawHeading;
            
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            if (Math.abs(diff) < 0.5) return;

            absoluteHeading += diff;
            previousRawHeading = rawHeadingDeg;

            webViewRef.current?.injectJavaScript(`
              if (window.setTargetHeading) window.setTargetHeading(${absoluteHeading.toFixed(2)});
              true;
            `);
          }
        });

        if (isMounted) {
          subscription = sub;
        } else {
          sub.remove();
        }
      }
    }

    startHeadingTracking();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [isHeadingFocused]);

  // Keep the marker and route progress synchronized even when the viewport is manually panned.
  useEffect(() => {
    webViewRef.current?.injectJavaScript(`
      if (window.updateMap) {
        window.updateMap(${currentMarkerLat}, ${currentMarkerLng}, ${accuracy}, ${JSON.stringify(
      route || null
    )});
      }
      true;
    `);
  }, [currentMarkerLat, currentMarkerLng, accuracy, route, heading]);

  // Recenter signal explicitly resets the view and re-enables tracking
  useEffect(() => {
    if (recenterSignal !== undefined && recenterSignal > 0) {
      hasUserPannedAwayRef.current = false;
      webViewRef.current?.injectJavaScript(
        "if (window.resetView) window.resetView(); true;"
      );
    }
  }, [recenterSignal]);

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: "100%", height: "100%" },
});