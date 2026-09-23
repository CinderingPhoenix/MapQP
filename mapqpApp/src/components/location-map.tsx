import { useRef, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";

// --- Types ---

type LocationMapProps = {
  latitude: number;
  longitude: number;
  userLatitude?: number;
  userLongitude?: number;
  accuracy: number;
  heading?: number | null; 
  route?: {
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    geometry: [number, number][];
  } | null;
  recenterSignal?: number;
  onUserDragged?: () => void;
  onHeadingModeChange?: (isFocused: boolean) => void;
};

// --- Main Component ---

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
  const lastInjectedHeading = useRef<number | null>(null);

  const currentMarkerLat = userLatitude ?? latitude;
  const currentMarkerLng = userLongitude ?? longitude;

  // OS-Level Hardware Compass with Bridge Throttling
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    if (isHeadingFocused) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        subscription = await Location.watchHeadingAsync((headingData) => {
          let headingDeg = headingData.trueHeading >= 0 
            ? headingData.trueHeading 
            : headingData.magHeading;

          if (isNaN(headingDeg)) return;

          // Deadband filter: Ignore micro-fluctuations under 0.8 degrees to prevent bridge overload
          if (
            lastInjectedHeading.current === null ||
            Math.abs(headingDeg - lastInjectedHeading.current) > 0.8
          ) {
            lastInjectedHeading.current = headingDeg;

            webViewRef.current?.injectJavaScript(`
              if (window.setTargetHeading) window.setTargetHeading(${headingDeg.toFixed(1)});
              true;
            `);
          }
        });
      })();
    } else {
      lastInjectedHeading.current = null;
    }

    return () => {
      subscription?.remove();
    };
  }, [isHeadingFocused]);

  const leafletHtml = useMemo(
    () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/leaflet-rotate@latest/dist/leaflet-rotate.min.js"></script>
      <style>
        html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #e0e0e0; }
        .leaflet-control-rotate, .leaflet-control-compass, .leaflet-bar.compass { display: none !important; }
        .leaflet-top.leaflet-right { top: 48px; right: 16px; }
        .compass-control {
          background: white; border-radius: 50% !important;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3); width: 54px !important; height: 54px !important;
          line-height: 54px !important; text-align: center; cursor: pointer; overflow: hidden;
        }
        .compass-icon {
          display: inline-block; font-size: 36px; line-height: 54px;
          transition: transform 0.1s ease-out; will-change: transform;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { 
          zoomControl: false, rotate: true, touchRotate: true, shiftKeyRotate: true
        }).setView([${latitude}, ${longitude}], 16);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        var marker = L.circleMarker([${currentMarkerLat}, ${currentMarkerLng}], {
          radius: 8, color: '#fffdf8', fillColor: '#e06b3c', fillOpacity: 1, weight: 3
        }).addTo(map);

        var circle = L.circle([${currentMarkerLat}, ${currentMarkerLng}], {
          radius: ${accuracy}, color: '#e06b3c', fillColor: '#e06b3c', fillOpacity: 0.3
        }).addTo(map);

        var remainingPolyline = null, traversedPolyline = null, destMarker = null;
        var isHeadingFocused = false;
        var currentBearing = 0, targetHeading = null, animFrameId = null;

        var routeData = ${JSON.stringify(route || null)};

        function getClosestPointOnSegment(p, a, b) {
          var cosLat = Math.cos(a[0] * Math.PI / 180);
          var px = (p[1] - a[1]) * cosLat;
          var py = p[0] - a[0];
          var bx = (b[1] - a[1]) * cosLat;
          var by = b[0] - a[0];
          var lenSq = bx * bx + by * by;
          if (lenSq === 0) return { point: a, distanceSq: py * py + px * px, t: 0 };
          var t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
          var closestLat = a[0] + t * by;
          var closestLng = a[1] + t * (b[1] - a[1]);
          var dx = (p[1] - closestLng) * cosLat;
          var dy = p[0] - closestLat;
          return { point: [closestLat, closestLng], distanceSq: dx * dx + dy * dy, t: t };
        }

        function splitRouteAtUser(userLat, userLng, geometry) {
          if (!geometry || geometry.length < 2) return { traversed: [], remaining: geometry || [] };
          var bestSegmentIndex = 0;
          var minDistanceSq = Infinity;
          var snappedPoint = [userLat, userLng];

          for (var i = 0; i < geometry.length - 1; i++) {
            var closest = getClosestPointOnSegment([userLat, userLng], geometry[i], geometry[i + 1]);
            if (closest.distanceSq < minDistanceSq) {
              minDistanceSq = closest.distanceSq;
              bestSegmentIndex = i;
              snappedPoint = closest.point;
            }
          }

          var traversed = geometry.slice(0, bestSegmentIndex + 1);
          traversed.push(snappedPoint);
          var remaining = [snappedPoint].concat(geometry.slice(bestSegmentIndex + 1));
          return { traversed: traversed, remaining: remaining };
        }

        function initRoute(rData, uLat, uLng) {
          if (!rData) return;
          var split = splitRouteAtUser(uLat, uLng, rData.geometry);
          traversedPolyline = L.polyline(split.traversed, { color: '#888888', weight: 6, opacity: 0.6 }).addTo(map);
          remainingPolyline = L.polyline(split.remaining, { color: '#1d5962', weight: 6, opacity: 0.9 }).addTo(map);
          destMarker = L.circleMarker([rData.destination.latitude, rData.destination.longitude], {
            radius: 9, color: '#fffdf8', fillColor: '#1d5962', fillOpacity: 1, weight: 3
          }).addTo(map);
          map.fitBounds(remainingPolyline.getBounds(), { padding: [36, 36] });
        }

        if (routeData) {
          initRoute(routeData, ${currentMarkerLat}, ${currentMarkerLng});
        }

        // Continuous Smooth Animation Loop
        function updateHeadingAnimation() {
          if (!isHeadingFocused) {
            animFrameId = null;
            return;
          }

          if (targetHeading !== null && !isNaN(targetHeading)) {
            var diff = (targetHeading - currentBearing + 540) % 360 - 180;
            
            // Interpolate smoothly with low pass dampening (0.08)
            if (Math.abs(diff) > 0.05) {
              currentBearing += diff * 0.08;
              currentBearing = (currentBearing + 360) % 360;
              map.setBearing(-currentBearing);
            }
          }

          animFrameId = requestAnimationFrame(updateHeadingAnimation);
        }

        window.setTargetHeading = function(trueHeadingDeg) {
          if (trueHeadingDeg === null || trueHeadingDeg === undefined || isNaN(trueHeadingDeg)) return;
          
          var OFFSET = -110; 
          var rawHeading = Number(trueHeadingDeg);
          targetHeading = (rawHeading + OFFSET + 360) % 360;

          if (isHeadingFocused && !animFrameId) {
            animFrameId = requestAnimationFrame(updateHeadingAnimation);
          }
        };

        function smoothRotateToZero() {
          if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
          }

          var startBearing = map.getBearing ? map.getBearing() : 0;
          var diff = (0 - startBearing + 540) % 360 - 180;
          var startTime = null;
          var duration = 300;

          function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            var easeProgress = 1 - Math.pow(1 - progress, 3);
            map.setBearing(startBearing + diff * easeProgress);

            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              map.setBearing(0);
              currentBearing = 0;
            }
          }

          requestAnimationFrame(step);
        }

        var CompassControl = L.Control.extend({
          options: { position: 'topright' },
          onAdd: function (map) {
            var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control compass-control');
            container.innerHTML = '<span id="compass-icon" class="compass-icon">🧭</span>';
            
            L.DomEvent.on(container, 'click', function (e) {
              L.DomEvent.stopPropagation(e);
              L.DomEvent.preventDefault(e);
              
              isHeadingFocused = !isHeadingFocused;
              
              if (isHeadingFocused) {
                container.style.backgroundColor = '#d3e3fd'; 
                window.ReactNativeWebView.postMessage('HEADING_LOCKED');
                currentBearing = map.getBearing ? -map.getBearing() : 0;
                
                map.setView(marker.getLatLng(), 18, { animate: true });

                if (!animFrameId) {
                  animFrameId = requestAnimationFrame(updateHeadingAnimation);
                }
              } else {
                container.style.backgroundColor = 'white';
                window.ReactNativeWebView.postMessage('HEADING_UNLOCKED');
                smoothRotateToZero();
              }
            });

            function updateCompassRotation() {
              var rawBearing = map.getBearing ? map.getBearing() : 0;
              var icon = document.getElementById('compass-icon');
              if (icon) {
                icon.style.transform = 'rotate(' + (-rawBearing - 45) + 'deg)';
              }
            }

            updateCompassRotation();
            map.on('rotate', updateCompassRotation);

            return container;
          }
        });
        map.addControl(new CompassControl());

        function cancelHeadingLock() {
          if (isHeadingFocused) {
            isHeadingFocused = false;
            if (animFrameId) {
              cancelAnimationFrame(animFrameId);
              animFrameId = null;
            }
            var compass = document.querySelector('.compass-control');
            if (compass) compass.style.backgroundColor = 'white';
            window.ReactNativeWebView.postMessage('HEADING_UNLOCKED');
          }
        }

        map.on('dragstart rotatestart', function() {
          cancelHeadingLock();
          window.ReactNativeWebView.postMessage('USER_DRAGGED');
        });

        window.updateMap = function(userLat, userLng, acc, newRoute) {
          var userLatLng = [userLat, userLng];
          marker.setLatLng(userLatLng);
          circle.setLatLng(userLatLng);
          circle.setRadius(acc);

          if (isHeadingFocused) {
            map.setView(userLatLng, Math.max(map.getZoom(), 18), { animate: true });
          }

          if (newRoute) {
            routeData = newRoute;
            var split = splitRouteAtUser(userLat, userLng, newRoute.geometry);

            if (traversedPolyline) map.removeLayer(traversedPolyline);
            if (remainingPolyline) map.removeLayer(remainingPolyline);
            if (destMarker) map.removeLayer(destMarker);

            traversedPolyline = L.polyline(split.traversed, { color: '#888888', weight: 6, opacity: 0.6 }).addTo(map);
            remainingPolyline = L.polyline(split.remaining, { color: '#1d5962', weight: 6, opacity: 0.9 }).addTo(map);

            destMarker = L.circleMarker([newRoute.destination.latitude, newRoute.destination.longitude], {
              radius: 9, color: '#fffdf8', fillColor: '#1d5962', fillOpacity: 1, weight: 3
            }).addTo(map);
          } else {
            routeData = null;
            if (traversedPolyline) { map.removeLayer(traversedPolyline); traversedPolyline = null; }
            if (remainingPolyline) { map.removeLayer(remainingPolyline); remainingPolyline = null; }
            if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
          }
        };

        window.resetView = function() {
          map.panTo(marker.getLatLng(), { animate: true });
        };
      </script>
    </body>
    </html>
  `,
    []
  );

  useEffect(() => {
    webViewRef.current?.injectJavaScript(`
      window.updateMap(${currentMarkerLat}, ${currentMarkerLng}, ${accuracy}, ${JSON.stringify(
      route || null
    )});
      true;
    `);
  }, [currentMarkerLat, currentMarkerLng, accuracy, route, heading]);

  useEffect(() => {
    if (recenterSignal !== undefined && recenterSignal > 0) {
      webViewRef.current?.injectJavaScript("window.resetView(); true;");
    }
  }, [recenterSignal]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: leafletHtml }}
        style={styles.map}
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