import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/settings-context";
import { useLocationWarmup } from "../hooks/use-location-warmup";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function LandingPage() {
  useLocationWarmup();
  const { setNavigationMode, setHasSelectedMode } = useSettings();

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
        />
        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
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

          <View style={styles.presetArea}>
            <View style={styles.presetLabel}>
              <Text style={styles.presetText}>
                Choose Your Navigation Mode
              </Text>
            </View>

            <View style={styles.buttonRow}>
              {/* Standard Mode */}
              <TouchableOpacity
                style={styles.buttonWrapper}
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
                  style={styles.modeButton}
                >
                  <View style={[styles.modeIcon, styles.standardIcon]}>
                    <Text style={styles.standardIconText}>➤</Text>
                  </View>

                  <Text style={styles.modeTitle}>
                    Standard{"\n"}Mode
                  </Text>

                  <Text style={styles.modeDescription}>
                    General campus navigation
                  </Text>

                  <View style={styles.standardAccent} />
                </LinearGradient>
              </TouchableOpacity>

              {/* Accessibility Mode */}
              <TouchableOpacity
                style={styles.buttonWrapper}
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
                  style={styles.modeButton}
                >
                  <View style={[styles.modeIcon, styles.accessibilityIcon]}>
                    <Text style={styles.accessibilityIconText}>♿</Text>
                  </View>

                  <Text style={styles.modeTitle}>
                    Accessibility{"\n"}Mode
                  </Text>

                  <Text style={styles.modeDescription}>
                    Navigation built around your needs
                  </Text>

                  <View style={styles.accessibilityAccent} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },

  header: {
    height: 90,
    backgroundColor: "rgba(255,255,255,0.55)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },

  logoPlaceholder: {
    width: 75,
    height: 75,
    borderRadius: 18,
    backgroundColor: "#D1D1D1",
    justifyContent: "center",
    alignItems: "center",
  },

  logoPlaceholderText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000000",
  },

  wpiLogo: {
    width: 150,
    height: 120,
  },

  mapqpLogo: {
    width: 150,
    height: 140,
  },

  mapBackground: {
    flex: 1,
    width: "100%",
  },

  presetArea: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 18,
    paddingBottom: 26,
  },

  presetLabel: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 20,
  },

  presetText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#172033",
    textAlign: "center",
  },

  buttonRow: {
    flexDirection: "row",
    gap: 14,
  },

  buttonWrapper: {
    flex: 1,
    aspectRatio: 0.9,
    borderRadius: 28,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.18,
    shadowRadius: 9,
    elevation: 6,
  },

  modeButton: {
    flex: 1,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    overflow: "hidden",
  },

  modeIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },

  standardIcon: {
    backgroundColor: "#246B96",
  },

  accessibilityIcon: {
    backgroundColor: "#AC2B37",
  },

  standardIconText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
  },

  accessibilityIconText: {
    color: "#FFFFFF",
    fontSize: 29,
  },

  modeTitle: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "900",
    color: "#172033",
    textAlign: "center",
    marginBottom: 8,
  },

  modeDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: "#4B5563",
    textAlign: "center",
  },

  standardAccent: {
    position: "absolute",
    bottom: 0,
    left: 24,
    right: 24,
    height: 5,
    backgroundColor: "#246B96",
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },

  accessibilityAccent: {
    position: "absolute",
    bottom: 0,
    left: 24,
    right: 24,
    height: 5,
    backgroundColor: "#AC2B37",
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  settingsButton: {
    position: "absolute",
    top: 130,
    right: 0,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
});