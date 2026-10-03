import { Stack } from "expo-router";
import { SettingsProvider } from "../context/settings-context";

export default function RootLayout() {
  return (
    <SettingsProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="landing-page" />
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