import { Stack } from "expo-router";
import { SettingsProvider, useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
import { useSessionMonitor } from "../hooks/use-session-monitor";
import { useNavigationModeRouting } from "../hooks/use-navigation-mode-routing";

function RootNavigator() {
  const { settingsLoaded, navigationMode } = useSettings();
  const {
    reduceMotionEnabled,
    loaded: accessibilityLoaded,
  } = useAccessibilityPreferences();
  const screenListeners = useNavigationModeRouting(
    navigationMode,
    settingsLoaded && accessibilityLoaded,
  );

  if (!settingsLoaded || !accessibilityLoaded) {
    return null;
  }

  return (
    <Stack
      screenListeners={screenListeners}
      screenOptions={{
        headerShown: false,
        animation: reduceMotionEnabled ? "none" : undefined,
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

      <Stack.Screen name="settings" options={({ route }) => ({
        animation: (route.params as { settingsTab?: string } | undefined)?.settingsTab === "true"
          ? "none" : reduceMotionEnabled ? "none" : "default",
      })} />
      <Stack.Screen name="accessibility-settings" options={({ route }) => ({
        animation: (route.params as { settingsTab?: string } | undefined)?.settingsTab === "true"
          ? "none" : reduceMotionEnabled ? "none" : "default",
      })} />
      <Stack.Screen name="report-bug" />
    </Stack>
  );
}

function MainLayout() {
  useSessionMonitor();
  return <RootNavigator />;
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <MainLayout />
    </SettingsProvider>
  );
}
