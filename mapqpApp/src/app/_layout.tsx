import { Stack } from "expo-router";

export default function RootLayout() {
  return (
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
    </Stack>
  );
}