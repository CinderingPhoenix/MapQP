import { useRef, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { DeviceMotion } from "expo-sensors";
import { useAssets } from "expo-asset";
import { File } from "expo-file-system";

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
};

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
}: LocationMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [isHeadingFocused, setIsHeadingFocused] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string>("");

  const currentMarkerLat = userLatitude ?? latitude;
  const currentMarkerLng = userLongitude ?? longitude;

  // Load the separate leaflet.html file as a raw text string
  const [assets] = useAssets([require("./leaflet.html")]);

  useEffect(() => {
    if (assets && assets[0]?.localUri) {
      const file = new File(assets[0].localUri);
      file.text().then((content) => {
        setHtmlContent(content);
      });
    }
  }, [assets]);

  // Pass initial coordinates to Leaflet once the HTML loads into WebView
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

  // Device motion heading handler with smoothing filter
  useEffect(() => {
    let subscription: ReturnType<typeof DeviceMotion.addListener> | null = null;
    let smoothedHeading: number | null = null;
    const smoothingFactor = 0.25; // Lower = smoother/slower response, Higher = snappier

    if (isHeadingFocused) {
      DeviceMotion.setUpdateInterval(50);
      subscription = DeviceMotion.addListener((motionData) => {
        if (!motionData.rotation) return;
        const rawHeadingDeg = motionData.rotation.alpha * -(180 / Math.PI) - 90;
        if (isNaN(rawHeadingDeg)) return;

        // Initialize smoothing baseline
        if (smoothedHeading === null) {
          smoothedHeading = rawHeadingDeg;
        } else {
          // Handle 360-degree wrapping safely
          let diff = rawHeadingDeg - smoothedHeading;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;

          // Apply dead-zone filter: ignore micro-movements under 0.4 degrees to prevent jitter
          if (Math.abs(diff) < 0.4) return;

          smoothedHeading += diff * smoothingFactor;
          smoothedHeading = (smoothedHeading + 360) % 360;
        }

        webViewRef.current?.injectJavaScript(`
          if (window.setTargetHeading) window.setTargetHeading(${smoothedHeading.toFixed(2)});
          true;
        `);
      });
    }

    return () => {
      subscription?.remove();
    };
  }, [isHeadingFocused]);

  // Sync state updates
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

  // Recenter handler
  useEffect(() => {
    if (recenterSignal !== undefined && recenterSignal > 0) {
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
            onUserDragged?.();
          } else if (data === "HEADING_LOCKED") {
            setIsHeadingFocused(true);
            onHeadingModeChange?.(true);
          } else if (data === "HEADING_UNLOCKED") {
            setIsHeadingFocused(false);
            onHeadingModeChange?.(false);
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