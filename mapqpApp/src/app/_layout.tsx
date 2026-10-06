import { Stack } from "expo-router";
import { SettingsProvider } from "../context/settings-context";
import { useSessionMonitor } from '../hooks/use-session-monitor';

export default function RootLayout() {
  useSessionMonitor();
  return (
    <SettingsProvider>
      <Stack
        screenOptions={{
          headerShown: false,
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
    </SettingsProvider>
  );
}