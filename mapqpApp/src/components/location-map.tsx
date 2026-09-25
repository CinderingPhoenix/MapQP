import { useRef, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
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

  // Device absolute compass heading handler with smoothing filter
  // Device absolute compass heading handler with unbounded continuous tracking
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

          // Apply the 90-degree offset and normalize to 0-359
          rawHeadingDeg = (rawHeadingDeg - 90) % 360;

          if (absoluteHeading === null || previousRawHeading === null) {
            absoluteHeading = rawHeadingDeg;
            previousRawHeading = rawHeadingDeg; // Set initial baseline
          } else {
            let diff = rawHeadingDeg - previousRawHeading;
            
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            // Accumulate continuously (can go to 400, 720, -150, etc.)
            absoluteHeading += diff;
            previousRawHeading = rawHeadingDeg; // Update baseline only after exceeding dead-zone

            // Pass the unbounded heading. Leaflet handles the visual smoothing natively.
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