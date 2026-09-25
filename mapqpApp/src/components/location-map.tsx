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

  // Load the separate Leaflet HTML file.
  const [assets] = useAssets([require("./leaflet.html")]);

  useEffect(() => {
    if (assets && assets[0]?.localUri) {
      const file = new File(assets[0].localUri);

      file.text().then((content) => {
        setHtmlContent(content);
      });
    }
  }, [assets]);

  // Initialize the Leaflet map after the WebView loads.
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

  // Track the device compass while heading mode is enabled.
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let isMounted = true;

    let previousRawHeading: number | null = null;
    let absoluteHeading: number | null = null;

    async function startHeadingTracking() {
      if (!isHeadingFocused) {
        return;
      }

      const sub = await Location.watchHeadingAsync(
        (headingData) => {
          let rawHeadingDeg =
            headingData.trueHeading >= 0
              ? headingData.trueHeading
              : headingData.magHeading;

          // Apply the 90-degree offset used by the map rotation system.
          rawHeadingDeg =
            (rawHeadingDeg - 90) % 360;

          if (
            absoluteHeading === null ||
            previousRawHeading === null
          ) {
            absoluteHeading = rawHeadingDeg;
            previousRawHeading = rawHeadingDeg;
          } else {
            let diff =
              rawHeadingDeg -
              previousRawHeading;

            if (diff > 180) {
              diff -= 360;
            }

            if (diff < -180) {
              diff += 360;
            }

            // Keep a continuous heading value so the map
            // does not suddenly spin the long way around.
            absoluteHeading += diff;
            previousRawHeading = rawHeadingDeg;

            webViewRef.current?.injectJavaScript(`
              if (window.setTargetHeading) {
                window.setTargetHeading(
                  ${absoluteHeading.toFixed(2)}
                );
              }
              true;
            `);
          }
        }
      );

      if (isMounted) {
        subscription = sub;
      } else {
        sub.remove();
      }
    }

    startHeadingTracking();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [isHeadingFocused]);

  // Update the user's location and route without
  // reloading the entire WebView.
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

  // Allow the parent screen to request a recenter.
  useEffect(() => {
    if (
      recenterSignal !== undefined &&
      recenterSignal > 0
    ) {
      webViewRef.current?.injectJavaScript(
        "if (window.resetView) window.resetView(); true;"
      );
    }
  }, [recenterSignal]);

  if (!htmlContent) {
    return (
      <View style={styles.container} />
    );
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
          const data =
            event.nativeEvent.data;

          if (data === "USER_DRAGGED") {
            onUserDragged?.();
          } else if (
            data === "HEADING_LOCKED"
          ) {
            setIsHeadingFocused(true);
            onHeadingModeChange?.(true);
          } else if (
            data === "HEADING_UNLOCKED"
          ) {
            setIsHeadingFocused(false);
            onHeadingModeChange?.(false);
          }
        }}
      />
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
});