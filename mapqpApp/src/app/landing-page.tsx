import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LandingPage() {
  const openStandardNavigation = () => {
    router.push("/standard-navigation");
  };

  const openAccessibilityNavigation = () => {
    router.push("/accessibility-navigation");
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoPlaceholderText}>Logo</Text>
          </View>

          <Image
            source={require("../../assets/images/wpi-logo.png")}
            style={styles.wpiLogo}
            resizeMode="contain"
          />
        </View>

        {/* Campus Map */}
        <ImageBackground
          source={require("../../assets/images/campus-map.png")}
          style={styles.mapBackground}
          resizeMode="cover"
        >
          <View style={styles.presetArea}>
            <View style={styles.presetLabel}>
              <Text style={styles.presetText}>Select your preset</Text>
            </View>

            <View style={styles.buttonRow}>
              {/* Standard Mode */}
              <TouchableOpacity
                style={styles.buttonWrapper}
                onPress={openStandardNavigation}
                activeOpacity={0.85}
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
        </ImageBackground>
      </SafeAreaView>
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
    backgroundColor: "#FFFFFF",
  },

  header: {
    height: 130,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 28,
  },

  logoPlaceholder: {
    width: 105,
    height: 105,
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
    width: 105,
    height: 105,
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
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginBottom: 38,
  },

  presetText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#000000",
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
});