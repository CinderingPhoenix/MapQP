import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function LandingPage() {
  const openMap = () => {
    router.replace("/map");
  };

  const openWpiMap = () => {
    Linking.openURL("https://maps.wpi.edu/");
  };

  const openAAUMap = () => {
    Linking.openURL("https://nav.ollioddi.dk/");
  };

  const openUoMMap = () => {
    Linking.openURL("https://accessmap.uom.gr/maps/demo-building/ground");
  };

  const openEcotarium = () => {
  if (Platform.OS === "ios") {
    Linking.openURL(
      "https://apps.apple.com/us/app/ecotarium-explorer/id6478123975"
    );
  } else {
    Linking.openURL(
      "https://play.google.com/store/apps/details?id=org.ecotarium.ecotariumapp&pcampaignid=web_share"
    );
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>MapQP</Text>
          <Text style={styles.tagline}>
            Accessible navigation for everyone.
          </Text>
          <Text style={styles.description}>
            Find your way around campus with navigation designed with
            accessibility in mind.
          </Text>
        </View>

        {/* Navigation Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Navigation</Text>

          {/* Standard Navigation */}
          <TouchableOpacity
            style={styles.navigationCard}
            onPress={openMap}
            activeOpacity={0.8}
          >
            <View style={styles.navigationIcon}>
              <Text style={styles.navigationIconText}>➤</Text>
            </View>

            <View style={styles.navigationText}>
              <Text style={styles.navigationTitle}>
                Standard Navigation
              </Text>
              <Text style={styles.navigationDescription}>
                Standard map and walking navigation.
              </Text>
            </View>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          {/* Low Vision Navigation */}
          <TouchableOpacity
            style={styles.navigationCard}
            onPress={openMap}
            activeOpacity={0.8}
          >
            <View style={styles.navigationIcon}>
              <Text style={styles.navigationIconText}>◉</Text>
            </View>

            <View style={styles.navigationText}>
              <Text style={styles.navigationTitle}>
                Low Vision Navigation
              </Text>
              <Text style={styles.navigationDescription}>
                Larger controls, text, and navigation elements.
              </Text>
            </View>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Related Maps */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Related Maps</Text>

          <TouchableOpacity
            style={styles.previousApp}
            onPress={openWpiMap}
            activeOpacity={0.8}
          >
            <View style={styles.appIcon}>
              <Text style={styles.appIconText}>W</Text>
            </View>

            <View style={styles.previousAppText}>
              <Text style={styles.previousAppTitle}>WPI Campus</Text>
              <Text style={styles.previousAppDescription}>
                WPI Interactive Map
              </Text>
            </View>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.previousApp}
            onPress={openEcotarium}
          >
            <View style={styles.appIcon}>
              <Text style={styles.appIconText}>E</Text>
            </View>

            <View style={styles.previousAppText}>
              <Text style={styles.previousAppTitle}>EcoTarium</Text>
                <Text style={styles.previousAppDescription}>
                  EcoTarium Explorer App
                </Text>
            </View>
            <Text style={styles.arrow}>›</Text>

          </TouchableOpacity>

          <TouchableOpacity
            style={styles.previousApp}
            onPress={openAAUMap}
            activeOpacity={0.8}
          >
            <View style={styles.appIcon}>
              <Text style={styles.appIconText}>A</Text>
            </View>

            <View style={styles.previousAppText}>
              <Text style={styles.previousAppTitle}>AAU Map</Text>
              <Text style={styles.previousAppDescription}>
                Aalborg University Copenhagen Map
              </Text>
            </View>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.previousApp}
            onPress={openUoMMap}
            activeOpacity={0.8}
          >
            <View style={styles.appIcon}>
              <Text style={styles.appIconText}>A</Text>
            </View>

            <View style={styles.previousAppText}>
              <Text style={styles.previousAppTitle}>AccessMap</Text>
              <Text style={styles.previousAppDescription}>
                University of Macedonia Map Demo
              </Text>
            </View>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            MapQP • Accessible Campus Navigation
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },

  header: {
    paddingTop: 20,
    paddingBottom: 32,
  },

  appName: {
    fontSize: 42,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },

  tagline: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 12,
  },

  description: {
    fontSize: 16,
    lineHeight: 24,
    color: "#4B5563",
    maxWidth: 500,
  },

  section: {
    marginBottom: 30,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 14,
  },

  previousApp: {
    minHeight: 82,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  appIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  appIconText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
  },

  previousAppText: {
    flex: 1,
  },

  previousAppTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },

  previousAppDescription: {
    fontSize: 14,
    color: "#6B7280",
  },

  navigationCard: {
    minHeight: 100,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },

  navigationIcon: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },

  navigationIconText: {
    fontSize: 27,
    fontWeight: "700",
    color: "#111827",
  },

  navigationText: {
    flex: 1,
  },

  navigationTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 5,
  },

  navigationDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: "#4B5563",
  },

  arrow: {
    fontSize: 32,
    color: "#6B7280",
    marginLeft: 10,
  },

  footer: {
    alignItems: "center",
    paddingTop: 10,
  },

  footerText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
});