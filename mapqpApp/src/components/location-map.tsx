import { useRef, useEffect, useState, useMemo } from "react";
import { StyleSheet, View, TouchableOpacity, Text } from "react-native";
import { WebView } from "react-native-webview";

// --- Types ---

type LocationMapProps = {
  latitude: number;
  longitude: number;
  userLatitude?: number;
  userLongitude?: number;
  accuracy: number;
  route?: {
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    geometry: [number, number][];
  } | null;
};

// --- Main Component ---

export default function LocationMap({
  latitude,
  longitude,
  userLatitude,
  userLongitude,
  accuracy,
  route,
}: LocationMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [showRecenter, setShowRecenter] = useState(false);

  // Fallback to the default map center if the user's specific location is unavailable
  const currentMarkerLat = userLatitude ?? latitude;
  const currentMarkerLng = userLongitude ?? longitude;

  // Memoize the HTML string so the WebView only mounts and loads the Leaflet library once
  const leafletHtml = useMemo(() => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #e0e0e0; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        // Initialize the Leaflet map with zoom controls disabled
        var map = L.map('map', { zoomControl: false }).setView([${latitude}, ${longitude}], 16);
        
        // Load OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        // Render the user's location marker
        var marker = L.circleMarker([${currentMarkerLat}, ${currentMarkerLng}], {
          radius: 8,
          color: '#fffdf8',
          fillColor: '#e06b3c',
          fillOpacity: 1,
          weight: 3
        }).addTo(map);

        // Render the accuracy radius circle around the user's marker
        var circle = L.circle([${currentMarkerLat}, ${currentMarkerLng}], {
          radius: ${accuracy},
          color: '#e06b3c',
          fillColor: '#e06b3c',
          fillOpacity: 0.3
        }).addTo(map);

        var routePolyline = null;
        var destMarker = null;
        var userMoved = false;

        // Draw the initial route if one is provided
        var routeData = ${JSON.stringify(route || null)};
        if (routeData) {
          routePolyline = L.polyline(routeData.geometry, { color: '#1d5962', weight: 6, opacity: 0.9 }).addTo(map);
          destMarker = L.circleMarker([routeData.destination.latitude, routeData.destination.longitude], {
            radius: 9,
            color: '#fffdf8',
            fillColor: '#1d5962',
            fillOpacity: 1,
            weight: 3
          }).addTo(map);
          map.fitBounds(routePolyline.getBounds(), { padding: [36, 36] });
        }

        // Listen for user map panning to trigger the 'Recenter' button in React Native
        map.on('dragstart', function() {
          userMoved = true;
          window.ReactNativeWebView.postMessage('USER_DRAGGED');
        });

        // Global function called by React Native to dynamically update coordinates without reloading the entire WebView
        window.updateMap = function(userLat, userLng, acc, newRoute) {
          var userLatLng = [userLat, userLng];
          marker.setLatLng(userLatLng);
          circle.setLatLng(userLatLng);
          circle.setRadius(acc);

          if (newRoute) {
            if (routePolyline) map.removeLayer(routePolyline);
            if (destMarker) map.removeLayer(destMarker);
            routePolyline = L.polyline(newRoute.geometry, { color: '#1d5962', weight: 6, opacity: 0.9 }).addTo(map);
            destMarker = L.circleMarker([newRoute.destination.latitude, newRoute.destination.longitude], {
              radius: 9,
              color: '#fffdf8',
              fillColor: '#1d5962',
              fillOpacity: 1,
              weight: 3
            }).addTo(map);
          }
        };

        // Global function called by React Native to animate the camera back to the user
        window.resetView = function() {
          userMoved = false;
          map.setView([${currentMarkerLat}, ${currentMarkerLng}], 16, { animate: true });
        };
      </script>
    </body>
    </html>
  `, []);

  // Inject fresh coordinate and route data into the WebView whenever the state changes in React Native
  useEffect(() => {
    webViewRef.current?.injectJavaScript(`
      window.updateMap(${currentMarkerLat}, ${currentMarkerLng}, ${accuracy}, ${JSON.stringify(route || null)});
      true;
    `);
  }, [currentMarkerLat, currentMarkerLng, accuracy, route]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: leafletHtml }}
        style={styles.map}
        onMessage={(event) => {
          if (event.nativeEvent.data === "USER_DRAGGED") {
            setShowRecenter(true);
          }
        }}
      />
      {showRecenter && (
        <TouchableOpacity
          style={styles.recenterButton}
          onPress={() => {
            setShowRecenter(false);
            webViewRef.current?.injectJavaScript("window.resetView(); true;");
          }}
        >
          <Text style={styles.recenterText}>Recenter</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// --- Styling ---

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: "100%", height: "100%" },
  recenterButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  recenterText: { fontWeight: "bold", color: "#333" },
});