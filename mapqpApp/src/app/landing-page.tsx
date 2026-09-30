import { router } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LandingPage() {
  const openStandardNavigation = () => {
    router.push("/navigation?mode=standard");
  };

  const openAccessibilityNavigation = () => {
    router.push("/navigation?mode=accessibility");
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
            Welcome to WPI
          </Text>

          <Text style={styles.description}>
            Find your way around campus with navigation designed with
            accessibility in mind.
          </Text>
        </View>

        {/* Navigation Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Choose Navigation
          </Text>

          {/* Standard Navigation */}
          <TouchableOpacity
            style={styles.navigationCard}
            onPress={openStandardNavigation}
            activeOpacity={0.8}
          >
            <View style={styles.navigationIcon}>
              <Text style={styles.navigationIconText}>
                ➤
              </Text>
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

          {/* Accessibility Navigation */}
          <TouchableOpacity
            style={styles.navigationCard}
            onPress={openAccessibilityNavigation}
            activeOpacity={0.8}
          >
            <View style={styles.navigationIcon}>
              <Text style={styles.navigationIconText}>
                ◉
              </Text>
            </View>

            <View style={styles.navigationText}>
              <Text style={styles.navigationTitle}>
                Accessibility Navigation
              </Text>

              <Text style={styles.navigationDescription}>
                Navigation designed with accessibility preferences
                and larger controls.
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
    flexGrow: 1,
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
    color: "#9CA3AF",
    marginLeft: 10,
  },

  footer: {
    marginTop: "auto",
    paddingTop: 30,
    alignItems: "center",
  },

  footerText: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
});