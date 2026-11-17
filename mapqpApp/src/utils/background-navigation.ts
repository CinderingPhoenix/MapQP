import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Alert, AppState, Platform } from "react-native";
import { getBackgroundGuidance, type BackgroundRoute } from "./background-guidance";
import { saveBackgroundRoutingGraph, updateBackgroundRoute } from "./background-rerouting";
import { updateNavigationNotification, clearNavigationNotification, addNavigationExitListener, isNavigationExitRequested } from "../../modules/navigation-notification";

const TASK = "mapqp-navigation-location";
const KEY = "mapqp-background-route-v1";
// New ID: Android retains the sound/vibration settings of existing channels.
const CHANNEL = "navigation-directions-silent-v2";
const NOTICE = "mapqp-current-direction";
const NOTIFICATION_PROMPT = "mapqp-notification-permission-prompted-v1";
const BACKGROUND_PROMPT = "mapqp-background-permission-prompted-v1";
// Serialize setup, cancellation, and headless updates to avoid reviving a cancelled route.
let pending: Promise<unknown> = Promise.resolve();
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const result = pending.then(action);
  pending = result.catch(() => {});
  return result;
}

if (Platform.OS !== "web") {
  addNavigationExitListener(() => { void stopBackgroundNavigation().catch(error => console.warn("Unable to exit navigation", error)); });
  Notifications.setNotificationHandler({ handleNotification: async () => ({
    shouldShowBanner: AppState.currentState !== "active",
    shouldShowList: AppState.currentState !== "active",
    shouldPlaySound: false, shouldSetBadge: false,
  }) });
  AppState.addEventListener("change", state => {
    void serialize(async () => {
      if (state === "active") {
        await Notifications.cancelScheduledNotificationAsync(NOTICE);
        await Notifications.dismissNotificationAsync(NOTICE);
      }
      const saved = await AsyncStorage.getItem(KEY);
      if (!saved) return;
      const route: BackgroundRoute = JSON.parse(saved);
      if (state === "active") {
        delete route.lastNotice;
        await AsyncStorage.setItem(KEY, JSON.stringify(route));
      }
    }).catch(error => console.warn("Unable to clear navigation notification", error));
  });
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, ({ data, error }) => serialize(async () => {
    if (error) { console.warn("Background navigation:", error.message); return; }
    if (await isNavigationExitRequested()) { await stop(); return; }
    const saved = await AsyncStorage.getItem(KEY);
    if (!saved || !data?.locations.length) return;
    let route: BackgroundRoute = JSON.parse(saved);
    if (Date.now() > route.expiresAt) { await stop(); return; }
    const location = data.locations[data.locations.length - 1];
    if (Date.now() - location.timestamp > 30000 || (location.coords.accuracy ?? Infinity) > 30) return;
    if (AppState.currentState !== "active") {
      route = await updateBackgroundRoute(route, { ...location.coords, timestamp: location.timestamp });
      // Exit can be requested natively while a replacement route is calculated.
      if (await isNavigationExitRequested()) { await stop(); return; }
    }
    const guidance = getBackgroundGuidance(route, location.coords.latitude, location.coords.longitude);
    const title = guidance.arrived ? "You have arrived" : `Directions to ${route.destination}`;
    const updatedService = Platform.OS === "android" && !guidance.arrived
      ? await updateNavigationNotification(TASK, title, guidance.body, guidance) : false;
    if (updatedService) {
      // Remove the separate direction card left by older builds or startup.
      await Notifications.dismissNotificationAsync(NOTICE);
    }
    // The native controller hides the service notification while foregrounded.
    const noticeKey = Platform.OS === "android" ? guidance.body : guidance.key;
    if (!updatedService && AppState.currentState !== "active" && noticeKey !== route.lastNotice) {
      await Notifications.scheduleNotificationAsync({ identifier: NOTICE,
        content: { title, body: guidance.body,
          sound: false,
          sticky: Platform.OS === "android" && !guidance.arrived,
          autoDismiss: guidance.arrived, data: { navigation: true } },
        trigger: Platform.OS === "android" ? { channelId: CHANNEL } : null,
      });
      route.lastNotice = noticeKey;
    }
    if (guidance.arrived) {
      // Keep the arrival notification visible after stopping the location service.
      await AsyncStorage.removeItem(KEY);
      await clearNavigationNotification();
      await Location.stopLocationUpdatesAsync(TASK);
    } else await AsyncStorage.setItem(KEY, JSON.stringify(route));
  }));
}

async function stop() {
  await AsyncStorage.removeItem(KEY);
  await clearNavigationNotification();
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  await Notifications.cancelScheduledNotificationAsync(NOTICE);
  await Notifications.dismissNotificationAsync(NOTICE);
}

export function stopBackgroundNavigation() {
  if (Platform.OS === "web") return Promise.resolve();
  return serialize(stop);
}

export function getSavedBackgroundRoute(): Promise<BackgroundRoute | null> {
  return serialize(async () => {
    const saved = await AsyncStorage.getItem(KEY);
    return saved ? JSON.parse(saved) : null;
  });
}

export function syncBackgroundNavigation(route: BackgroundRoute, batterySaverEnabled = false) {
  if (batterySaverEnabled) return stopBackgroundNavigation();
  if (Platform.OS === "web") return Promise.resolve();
  return serialize(async () => {
    if (!await TaskManager.isAvailableAsync()) return;
    const previous = await AsyncStorage.getItem(KEY);
    const saved: BackgroundRoute | null = previous ? JSON.parse(previous) : null;
    // A focus change must not overwrite a headless reroute before the screen
    // has had a chance to adopt it.
    if (saved?.navigationId && saved.navigationId === route.navigationId &&
        (saved.revision ?? 0) > (route.revision ?? 0)) {
      route = { ...route, ...saved, units: route.units, directionStyle: route.directionStyle };
    }
    const running = await Location.hasStartedLocationUpdatesAsync(TASK);
    const initial = getBackgroundGuidance(route, ...route.geometry[0]);
    const title = `Directions to ${route.destination}`;
    if (!running) {
      if (Platform.OS === "android") await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Navigation directions", importance: Notifications.AndroidImportance.LOW,
        sound: null, enableVibrate: false, vibrationPattern: [],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      let notifications = await Notifications.getPermissionsAsync();
      if (!notifications.granted && notifications.canAskAgain && !await AsyncStorage.getItem(NOTIFICATION_PROMPT)) {
        await AsyncStorage.setItem(NOTIFICATION_PROMPT, "true");
        notifications = await Notifications.requestPermissionsAsync();
      }
      if (!notifications.granted) return;
      let permission = await Location.getBackgroundPermissionsAsync();
      if (!permission.granted) {
        if (!permission.canAskAgain || await AsyncStorage.getItem(BACKGROUND_PROMPT)) return;
        await AsyncStorage.setItem(BACKGROUND_PROMPT, "true");
        // Explain the Settings handoff once, then remember the user's choice.
        const proceed = await new Promise<boolean>(resolve => Alert.alert("Background directions",
          "Allow background location (Allow all the time on Android) to keep receiving directions while your screen is locked or you use another app.",
          [{ text: "Not now", style: "cancel", onPress: () => resolve(false) },
            { text: "Continue", onPress: () => resolve(true) }],
          { cancelable: true, onDismiss: () => resolve(false) }));
        if (!proceed) return;
        permission = await Location.requestBackgroundPermissionsAsync();
        if (!permission.granted) return;
      }
    }
    await saveBackgroundRoutingGraph();
    await AsyncStorage.setItem(KEY, JSON.stringify(route));
    // A registered task can survive an app upgrade/process restart even when
    // its Android service is gone. Refresh its options while foregrounded so
    // Expo recreates/promotes the service before the app backgrounds again.
    if (!running || AppState.currentState === "active") {
      try {
        await Location.startLocationUpdatesAsync(TASK, {
          accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 2000,
          pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
          activityType: Location.ActivityType.Fitness,
          foregroundService: { notificationTitle: title,
            notificationBody: initial.body, killServiceOnDestroy: false },
        });
      } catch (error) { await AsyncStorage.removeItem(KEY); throw error; }
    }
    if (Platform.OS === "android") await updateNavigationNotification(TASK, title, initial.body, initial);
  });
}
