import { useEffect } from "react";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const LAST_LOCATION_STORAGE_KEY = "wpi_map_last_location";

let ExpoSpeechRecognitionModule: { requestPermissionsAsync?: () => Promise<unknown> } | null = null;
try {
  const speechModule = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = speechModule.ExpoSpeechRecognitionModule;
} catch {
  console.warn("expo-speech-recognition is not available in this environment.");
}

export function useLocationWarmup(requestNotifications = false): void {
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let isMounted = true;

    const startLocationWarmup = async () => {
      try {
        const permissions = await Location.requestForegroundPermissionsAsync();
        if (permissions.status === "granted" && isMounted) {
          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 250,
              distanceInterval: 1,
              mayShowUserSettingsDialog: true,
            },
            (location) => {
              if (!isMounted) return;
              SecureStore.setItemAsync(
                LAST_LOCATION_STORAGE_KEY,
                JSON.stringify({
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                }),
              ).catch((error) => console.error("Failed to save warmup location", error));
            },
          );
        }
      } finally {
        if (ExpoSpeechRecognitionModule?.requestPermissionsAsync) {
          try {
            await ExpoSpeechRecognitionModule.requestPermissionsAsync();
          } catch (error) {
            console.warn("Unable to request microphone permission during startup:", error);
          }
        }
        if (requestNotifications && Platform.OS !== "web") {
          try {
            if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("navigation-directions-silent-v2", {
              name: "Navigation directions", importance: Notifications.AndroidImportance.LOW,
              sound: null, enableVibrate: false, vibrationPattern: [],
              lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            });
            const permission = await Notifications.getPermissionsAsync();
            const key = "mapqp-notification-permission-prompted-v1";
            if (!permission.granted && permission.canAskAgain && !await AsyncStorage.getItem(key)) {
              await AsyncStorage.setItem(key, "true");
              await Notifications.requestPermissionsAsync();
            }
          } catch (error) {
            console.warn("Unable to request notification permission during startup:", error);
          }
        }
      }
    };

    startLocationWarmup().catch((error) => {
      if (isMounted) console.warn("Unable to warm up location before navigation:", error);
    });

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [requestNotifications]);
}
