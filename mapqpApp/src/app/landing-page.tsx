import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/settings-context";
import { useAuthGuard } from "../hooks/use-auth-guard";
import { useLocationWarmup } from "../hooks/use-location-warmup";

export default function LandingPage() {
  useLocationWarmup();
  useAuthGuard();
  const { setNavigationMode, setHasSelectedMode } = useSettings();
  const { fontScale, width } = useWindowDimensions();
  const largeText = fontScale > 1.25;
  const stackButtons = width < 340 || fontScale >= 1.65;

  const openStandardNavigation = () => {
    setNavigationMode("standard");
    setHasSelectedMode(true);
    router.push("/standard-navigation");
  };

  const openAccessibilityNavigation = () => {
    setNavigationMode("accessibility");
    setHasSelectedMode(true);
    router.push("/accessibility-navigation");
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapBackground}>
        <ExpoImage
          source={require("../../assets/images/campus-map.png")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          transition={0}
          accessible={false}
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <ExpoImage
              source={require("../../assets/images/mapqp-logo.png")}
              style={styles.mapqpLogo}
              contentFit="contain"
              cachePolicy="memory-disk"
              priority="high"
              transition={0}
              accessibilityLabel="MapQP logo"
            />
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => router.push("/settings")}
                activeOpacity={0.7}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Settings"
                accessibilityHint="Opens the application settings"
              >
                <Ionicons name="settings-outline" size={28} color="#172033" />
              </TouchableOpacity>
              <ExpoImage
                source={require("../../assets/images/wpi-logo.png")}
                style={styles.wpiLogo}
                contentFit="contain"
                cachePolicy="memory-disk"
                priority="high"
                transition={0}
                accessible={false}
              />
            </View>
          </View>

          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={largeText}
          >
            <View style={styles.presetArea}>
              <View style={styles.presetLabel}>
                <Text
                  key={`landing-heading-${fontScale}`}
                  style={styles.presetText}
                  maxFontSizeMultiplier={3}
                  accessibilityRole="header"
                >
                  Choose Your Navigation Mode
                </Text>
              </View>

              <View style={[styles.buttonRow, stackButtons && styles.buttonRowStacked]}>
                <TouchableOpacity
                  style={[styles.buttonWrapper, stackButtons && styles.buttonWrapperStacked]}
                  onPress={openStandardNavigation}
                  activeOpacity={0.85}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Standard mode"
                  accessibilityHint="Opens standard campus navigation"
                >
                  <LinearGradient
                    colors={[
                      "rgba(255,255,255,0.72)",
                      "rgba(255,255,255,0.97)",
                      "rgba(255,255,255,0.97)",
                      "rgba(220,240,255,0.72)",
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.modeButton, largeText && styles.modeButtonLargeText]}
                  >
                    <View style={[styles.modeIcon, styles.standardIcon]}>
                      <Text style={styles.standardIconText} allowFontScaling={false}>➤</Text>
                    </View>
                    <Text
                      key={`standard-title-${fontScale}`}
                      style={styles.modeTitle}
                      maxFontSizeMultiplier={3}
                    >
                      Standard{"\n"}Mode
                    </Text>
                    <Text
                      key={`standard-description-${fontScale}`}
                      style={styles.modeDescription}
                      maxFontSizeMultiplier={3}
                    >
                      General campus navigation
                    </Text>
                    <View style={styles.standardAccent} />
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.buttonWrapper, stackButtons && styles.buttonWrapperStacked]}
                  onPress={openAccessibilityNavigation}
                  activeOpacity={0.85}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Accessibility mode"
                  accessibilityHint="Opens accessible campus navigation"
                >
                  <LinearGradient
                    colors={[
                      "rgba(255,255,255,0.72)",
                      "rgba(255,255,255,0.97)",
                      "rgba(255,255,255,0.97)",
                      "rgba(255,225,228,0.72)",
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.modeButton, largeText && styles.modeButtonLargeText]}
                  >
                    <View style={[styles.modeIcon, styles.accessibilityIcon]}>
                      <Text style={styles.accessibilityIconText} allowFontScaling={false}>♿</Text>
                    </View>
                    <Text
                      key={`accessibility-title-${fontScale}`}
                      style={styles.modeTitle}
                      maxFontSizeMultiplier={3}
                    >
                      Accessibility{"\n"}Mode
                    </Text>
                    <Text
                      key={`accessibility-description-${fontScale}`}
                      style={styles.modeDescription}
                      maxFontSizeMultiplier={3}
                    >
                      Navigation built around your needs
                    </Text>
                    <View style={styles.accessibilityAccent} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  safeArea: { flex: 1, backgroundColor: "transparent" },
  header: {
    height: 90,
    backgroundColor: "rgba(255,255,255,0.55)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    zIndex: 2,
  },
  wpiLogo: { width: 150, height: 120 },
  mapqpLogo: { width: 150, height: 140 },
  mapBackground: { flex: 1, width: "100%" },
  contentScroll: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "flex-end" },
  presetArea: { paddingHorizontal: 18, paddingBottom: 26, paddingTop: 30 },
  presetLabel: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    marginBottom: 20,
    maxWidth: "100%",
  },
  presetText: { fontSize: 22, fontWeight: "800", color: "#172033", textAlign: "center" },
  buttonRow: { flexDirection: "row", gap: 14, alignItems: "stretch" },
  buttonRowStacked: { flexDirection: "column" },
  buttonWrapper: {
    flex: 1,
    minWidth: 0,
    minHeight: 200,
    borderRadius: 28,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
    elevation: 6,
  },
  buttonWrapperStacked: { flex: 0, width: "100%" },
  modeButton: {
    flexGrow: 1,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    overflow: "hidden",
  },
  modeButtonLargeText: { paddingVertical: 24 },
  modeIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  standardIcon: { backgroundColor: "#246B96" },
  accessibilityIcon: { backgroundColor: "#AC2B37" },
  standardIconText: { color: "#FFFFFF", fontSize: 28, fontWeight: "900" },
  accessibilityIconText: { color: "#FFFFFF", fontSize: 29 },
  modeTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#172033",
    textAlign: "center",
    marginBottom: 8,
  },
  modeDescription: { fontSize: 12, color: "#4B5563", textAlign: "center" },
  standardAccent: {
    position: "absolute", bottom: 0, left: 24, right: 24,
    height: 5, backgroundColor: "#246B96",
    borderTopLeftRadius: 5, borderTopRightRadius: 5,
  },
  accessibilityAccent: {
    position: "absolute", bottom: 0, left: 24, right: 24,
    height: 5, backgroundColor: "#AC2B37",
    borderTopLeftRadius: 5, borderTopRightRadius: 5,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingsButton: {
    position: "absolute", top: 130, right: 0,
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    justifyContent: "center", alignItems: "center", zIndex: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 5, elevation: 5,
  },
});
