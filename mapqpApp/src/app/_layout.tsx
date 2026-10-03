import { Stack } from "expo-router";
import { SettingsProvider } from "../context/settings-context";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="landing-page" />
      <Stack.Screen name="loading-screen" />
      <Stack.Screen name="standard-navigation" />
      <Stack.Screen name="accessibility-navigation" />
    </Stack>
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
        <Stack.Screen name="accessibility-navigation" />
        <Stack.Screen name="settings" />
      </Stack>
    </SettingsProvider>
  );
}