
import { Stack } from "expo-router";
import { SettingsProvider, useSettings } from "../context/settings-context";
import { useDeviceAccessibility } from "../hooks/use-device-accessibility";
import { useSessionMonitor } from "../hooks/use-session-monitor";

function RootNavigator() {
  const { settingsLoaded } = useSettings();
  const {
    reduceMotionEnabled,
    loaded: accessibilityLoaded,
  } = useDeviceAccessibility();

  if (!settingsLoaded || !accessibilityLoaded) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduceMotionEnabled ? "none" : "default",
      }}
    >
      <Stack.Screen name="index" />

      <Stack.Screen
        name="landing-page"
        options={{ gestureEnabled: false }}
      />

      <Stack.Screen
        name="standard-navigation"
        options={{ gestureEnabled: false }}
      />

      <Stack.Screen
        name="accessibility-navigation"
        options={{ gestureEnabled: false }}
      />

      <Stack.Screen name="settings" />
    </Stack>
  );
}

export default function RootLayout() {
  useSessionMonitor();

  return (
    <SettingsProvider>
      <RootNavigator />
    </SettingsProvider>
  );
}
