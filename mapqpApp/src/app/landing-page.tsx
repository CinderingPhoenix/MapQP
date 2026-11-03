// landing-page.tsx

import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useNavigation, type NativeStackNavigationProp } from "expo-router";
import { useCallback, useLayoutEffect, useRef, useState, useEffect } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AccessibilityInfo, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useSettings, type AccessibilityNeed } from "../context/settings-context";
import { useAuthGuard } from "../hooks/use-auth-guard";
import { useLocationWarmup } from "../hooks/use-location-warmup";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
import { TutorialModal } from "../components/tutorial-modal";
import { AvoidStairsPrompt } from "../components/avoid-stairs-prompt";

const TUTORIAL_SHOWN_KEY = "mapqp_tutorial_shown_once";

export default function LandingPage() {
  useLocationWarmup();
  const { isChecking: authChecking } = useAuthGuard();
  const { setNavigationMode, setHasSelectedMode, settingsLoaded, settingsReadSucceeded, hasAnsweredAvoidStairsPrompt, accessibilityNeed, setAccessibilityNeed } = useSettings();
  const { fontScale, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { screenReaderEnabled, loaded: accessibilityLoaded, darkerSystemColorsEnabled, highTextContrastEnabled, reduceTransparencyEnabled, boldTextEnabled } = useAccessibilityPreferences();
  const increasedContrast = darkerSystemColorsEnabled || highTextContrastEnabled;
  const opaqueSurfaces = increasedContrast || reduceTransparencyEnabled;
  const largeText = fontScale > 1.25;
  const stackButtons = width < 340 || fontScale >= 1.65;
  const headingRef = useRef<React.ElementRef<typeof Text>>(null);
  const [headingLaidOut, setHeadingLaidOut] = useState(false);
  const initialFocusHandled = useRef(false);
  const navigation = useNavigation<NativeStackNavigationProp<{ "landing-page": undefined }>>();

  const [showTutorial, setShowTutorial] = useState(false);
  const [showAccessibilityChoice, setShowAccessibilityChoice] = useState(false);
  const [selectedNeed, setSelectedNeed] = useState<AccessibilityNeed | null>(accessibilityNeed);
  const pendingAccessibilityNavigation = useRef(false);
  const [tutorialReady, setTutorialReady] = useState(false);
  const [tutorialReadSucceeded, setTutorialReadSucceeded] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(true);
  const [promptPhase, setPromptPhase] = useState<"waiting" | "open" | "closing" | "done">("waiting");
  const [focused, setFocused] = useState(navigation.isFocused());
  const mounted = useRef(true);
  const tutorialClosing = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    setTutorialReady(false);
    setTutorialReadSucceeded(false);
    setPromptPhase("waiting");
    async function checkFirstLaunch() {
      try {
        const hasShown = await SecureStore.getItemAsync(TUTORIAL_SHOWN_KEY);
        if (!active) return;
        setTutorialDismissed(hasShown === "true");
        setShowTutorial(hasShown !== "true");
        setTutorialReadSucceeded(true);
      } catch (error) {
        // Skip new onboarding after an unverified read; keep landing usable.
        console.error("Failed to check tutorial status", error);
      } finally {
        if (active) setTutorialReady(true);
      }
    }
    void checkFirstLaunch();
    return () => { active = false; };
  }, []));

  const handleDismissTutorial = async () => {
    if (tutorialClosing.current) return;
    tutorialClosing.current = true;
    try {
      await SecureStore.setItemAsync(TUTORIAL_SHOWN_KEY, "true");
    } catch (error) {
      console.error("Failed to save tutorial status", error);
    }
    if (mounted.current) setShowTutorial(false);
    tutorialClosing.current = false;
  };

  // The web stack has no native transition events. On iOS/Android, onAppear
  // emits transitionEnd even when the transition has no animation.
  const [transitionComplete, setTransitionComplete] = useState(Platform.OS === "web");
  const transitionCompleteRef = useRef(Platform.OS === "web");

  useLayoutEffect(() => {
    const removeFocus = navigation.addListener("focus", () => setFocused(true));
    const removeStart = navigation.addListener("transitionStart", () => {
      transitionCompleteRef.current = false;
      setTransitionComplete(false);
    });
    const removeEnd = navigation.addListener("transitionEnd", (event) => {
      if (event.data.closing) return;
      transitionCompleteRef.current = true;
      setTransitionComplete(true);
    });
    const removeBlur = navigation.addListener("blur", () => {
      setFocused(false);
      initialFocusHandled.current = true;
      transitionCompleteRef.current = false;
      setTransitionComplete(false);
    });
    return () => {
      removeFocus();
      removeStart();
      removeEnd();
      removeBlur();
    };
  }, [navigation]);

  useEffect(() => {
    if (!focused) setPromptPhase("waiting");
  }, [focused]);

  const eligibilityReady = settingsLoaded && tutorialReady && accessibilityLoaded && !authChecking;
  useEffect(() => {
    if (!focused || !transitionComplete || !eligibilityReady || showTutorial || !tutorialDismissed || promptPhase !== "waiting") return;
    setPromptPhase(!settingsReadSucceeded || !tutorialReadSucceeded || hasAnsweredAvoidStairsPrompt ? "done" : "open");
  }, [focused, transitionComplete, eligibilityReady, showTutorial, tutorialDismissed, promptPhase, hasAnsweredAvoidStairsPrompt, settingsReadSucceeded, tutorialReadSucceeded]);

  const onboardingBlocksFocus = !eligibilityReady || showTutorial || !tutorialDismissed || promptPhase !== "done";
  const onboardingBlocksFocusRef = useRef(onboardingBlocksFocus);
  onboardingBlocksFocusRef.current = onboardingBlocksFocus;
  const tutorialVisible = showTutorial && focused && !authChecking && transitionComplete;
  const promptVisible = promptPhase === "open" && focused && !authChecking && transitionComplete;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "ios" && Platform.OS !== "android") return;
      if (onboardingBlocksFocus || !focused || !accessibilityLoaded || !headingLaidOut || !transitionComplete || initialFocusHandled.current) return;
      if (!screenReaderEnabled) {
        initialFocusHandled.current = true;
        return;
      }

      const frame = requestAnimationFrame(() => {
        if (onboardingBlocksFocusRef.current || !navigation.isFocused() || !transitionCompleteRef.current || initialFocusHandled.current || !headingRef.current) return;
        initialFocusHandled.current = true;
        AccessibilityInfo.sendAccessibilityEvent(headingRef.current, "focus");
      });
      return () => cancelAnimationFrame(frame);
    }, [accessibilityLoaded, headingLaidOut, screenReaderEnabled, transitionComplete, onboardingBlocksFocus, focused, navigation])
  );

  const openStandardNavigation = () => {
    setNavigationMode("standard");
    setHasSelectedMode(true);
    router.push("/standard-navigation");
  };

  const openAccessibilityNavigation = () => {
    setSelectedNeed(accessibilityNeed);
    setShowAccessibilityChoice(true);
  };

  const finishAccessibilityNavigation = () => {
    if (!pendingAccessibilityNavigation.current) return;
    pendingAccessibilityNavigation.current = false;
    router.push("/accessibility-navigation");
  };

  const confirmAccessibilityChoice = () => {
    if (!selectedNeed || !settingsLoaded) return;
    setAccessibilityNeed(selectedNeed);
    setNavigationMode("accessibility");
    setHasSelectedMode(true);
    pendingAccessibilityNavigation.current = true;
    setShowAccessibilityChoice(false);
    // iOS must finish dismissing its native modal before pushing a screen.
    if (Platform.OS !== "ios") finishAccessibilityNavigation();
  };

  return (
    <View style={styles.container} onTouchStart={() => { if (!onboardingBlocksFocus) initialFocusHandled.current = true; }}>
      <View style={styles.mapBackground} pointerEvents={onboardingBlocksFocus ? "none" : "auto"}
        accessibilityElementsHidden={onboardingBlocksFocus}
        importantForAccessibility={onboardingBlocksFocus ? "no-hide-descendants" : "auto"}>
        <ExpoImage
          source={require("../../assets/images/campus-map.webp")}
          style={[StyleSheet.absoluteFill, styles.mapImage]}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          transition={0}
          accessible={false}
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.header, opaqueSurfaces && { backgroundColor: "#fff" }, increasedContrast && { borderBottomWidth: 3, borderBottomColor: "#761723" }]}>
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

          {/* Settings Button */}
          <TouchableOpacity
            style={[styles.settingsButton, { top: insets.top + 130, left: insets.left + 28 }, opaqueSurfaces && { backgroundColor: "#fff" }, increasedContrast && { borderWidth: 2, borderColor: "#172033" }]}
            onPress={() => router.push("/settings")}
            activeOpacity={0.7}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Opens the application settings"
          >
            <Ionicons name="settings-outline" size={28} color="#172033" />
          </TouchableOpacity>

          {/* Reopen Tutorial Button */}
          <TouchableOpacity
            style={[styles.tutorialButton, { top: insets.top + 195, left: insets.left + 28 }, opaqueSurfaces && { backgroundColor: "#fff" }, increasedContrast && { borderWidth: 2, borderColor: "#172033" }]}
            onPress={() => { initialFocusHandled.current = false; setTutorialDismissed(false); setShowTutorial(true); }}
            activeOpacity={0.7}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Tutorial"
            accessibilityHint="Reopens the app tutorial"
          >
            <Ionicons name="help-circle-outline" size={28} color="#172033" />
          </TouchableOpacity>

          <ScrollView
            key={`landing-scroll-${stackButtons ? "stacked" : "row"}-${fontScale.toFixed(2)}`}
            style={styles.contentScroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={largeText}
          >
            <View style={styles.presetArea}>
              <View style={[styles.presetLabel, increasedContrast && styles.presetLabelHighContrast]}>
                <Text
                  ref={headingRef}
                  onLayout={() => setHeadingLaidOut(true)}
                  accessible
                  key={`landing-heading-${fontScale}`}
                  style={[styles.presetText, boldTextEnabled && styles.boldHeading, increasedContrast && styles.highContrastHeading]}
                  maxFontSizeMultiplier={3}
                  accessibilityRole="header"
                  accessibilityLabel="MapQP, accessible campus navigation. Choose your navigation mode"
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
                    colors={opaqueSurfaces
                      ? ["#FFF5F5", "#F9E5E7"]
                      : ["rgba(255,245,245,0.96)", "rgba(249,229,231,0.96)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.modeButton, styles.standardModeButton, largeText && styles.modeButtonLargeText, increasedContrast && styles.modeButtonHighContrast]}
                  >
                    <View style={[styles.modeIcon, styles.standardIcon]}>
                      <Text style={styles.standardIconText} allowFontScaling={false}>➤</Text>
                    </View>
                    <Text
                      key={`standard-title-${fontScale}`}
                      style={[styles.modeTitle, styles.standardTitle, boldTextEnabled && styles.boldHeading]}
                      maxFontSizeMultiplier={3}
                    >
                      Standard{"\n"}Mode
                    </Text>
                    <Text
                      key={`standard-description-${fontScale}`}
                      style={[styles.modeDescription, styles.standardDescription, boldTextEnabled && styles.boldDescription]}
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
                  accessibilityHint="Choose visual or motor impairment support before opening campus navigation"
                >
                  <LinearGradient
                    colors={opaqueSurfaces
                      ? ["#F1FAF9", "#DDF2F0"]
                      : ["rgba(241,250,249,0.96)", "rgba(221,242,240,0.96)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.modeButton, styles.accessibilityModeButton, largeText && styles.modeButtonLargeText, increasedContrast && styles.modeButtonHighContrast]}
                  >
                    <View style={[styles.modeIcon, styles.accessibilityIcon]}>
                      <Text style={styles.accessibilityIconText} allowFontScaling={false}>♿</Text>
                    </View>
                    <Text
                      key={`accessibility-title-${fontScale}`}
                      style={[styles.modeTitle, styles.accessibilityTitle, boldTextEnabled && styles.boldHeading]}
                      maxFontSizeMultiplier={3}
                    >
                      Accessibility{"\n"}Mode
                    </Text>
                    <Text
                      key={`accessibility-description-${fontScale}`}
                      style={[styles.modeDescription, styles.accessibilityDescription, boldTextEnabled && styles.boldDescription]}
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

      <Modal
        visible={showAccessibilityChoice}
        transparent
        animationType="none"
        onRequestClose={() => setShowAccessibilityChoice(false)}
        onDismiss={finishAccessibilityNavigation}
      >
        <View style={styles.choiceOverlay}>
          <View style={styles.choiceCard} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={styles.choiceContent}>
              <Text accessibilityRole="header" style={styles.choiceTitle}>Accessibility support</Text>
              <Text style={styles.choiceDescription}>Choose the option that best matches your needs.</Text>
              {([
                { value: "visual", label: "Visual impairment" },
                { value: "motor", label: "Motor impairment" },
              ] as const).map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.choiceOption, selectedNeed === option.value && styles.choiceOptionSelected]}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: selectedNeed === option.value }}
                  onPress={() => setSelectedNeed(option.value)}
                >
                  <Text style={styles.choiceOptionText}>{option.label}</Text>
                  <Ionicons
                    name={selectedNeed === option.value ? "radio-button-on" : "radio-button-off"}
                    size={26}
                    color="#064C52"
                    accessible={false}
                  />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.choiceContinue, (!selectedNeed || !settingsLoaded) && styles.choiceDisabled]}
                disabled={!selectedNeed || !settingsLoaded}
                accessibilityRole="button"
                accessibilityState={{ disabled: !selectedNeed || !settingsLoaded }}
                onPress={confirmAccessibilityChoice}
              >
                <Text style={styles.choiceContinueText}>Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.choiceCancel}
                accessibilityRole="button"
                onPress={() => setShowAccessibilityChoice(false)}
              >
                <Text style={styles.choiceOptionText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* First-time Tutorial Modal Component */}
      <TutorialModal visible={tutorialVisible} onClose={handleDismissTutorial} onDismiss={() => {
        if (!showTutorial && mounted.current) {
          initialFocusHandled.current = false;
          setTutorialDismissed(true);
        }
      }} />
      <AvoidStairsPrompt visible={promptVisible} onAnswered={() => {
        if (mounted.current) setPromptPhase(navigation.isFocused() ? "closing" : "waiting");
      }} onDismiss={() => {
        if (mounted.current && promptPhase === "closing") {
          initialFocusHandled.current = false;
          setPromptPhase("done");
        }
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  choiceOverlay: {
    flex: 1, justifyContent: "center", alignItems: "center",
    padding: 24, backgroundColor: "rgba(0,0,0,0.65)",
  },
  choiceCard: { width: "100%", maxWidth: 420, maxHeight: "90%", backgroundColor: "#FFFFFF", borderRadius: 24 },
  choiceContent: { padding: 24, gap: 16 },
  choiceTitle: { fontSize: 24, fontWeight: "800", color: "#064C52" },
  choiceDescription: { fontSize: 16, color: "#334155" },
  choiceOption: {
    minHeight: 56, padding: 16, borderWidth: 2, borderColor: "#64748B",
    borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 12,
  },
  choiceOptionSelected: { borderColor: "#064C52", backgroundColor: "#DDF2F0" },
  choiceOptionText: { flexShrink: 1, flexGrow: 1, fontSize: 18, fontWeight: "700", color: "#064C52" },
  choiceContinue: { minHeight: 48, padding: 14, borderRadius: 12, backgroundColor: "#064C52", alignItems: "center" },
  choiceContinueText: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  choiceDisabled: { backgroundColor: "#64748B" },
  choiceCancel: { minHeight: 48, alignItems: "center", justifyContent: "center", padding: 12 },
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  safeArea: { flex: 1, backgroundColor: "transparent" },
  header: {
    height: 90,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderBottomWidth: 3,
    borderBottomColor: "#AC2B37",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    zIndex: 2,
  },
  wpiLogo: { width: 150, height: 120 },
  mapqpLogo: { width: 150, height: 140 },
  mapBackground: { flex: 1, width: "100%", backgroundColor: "#63865B", overflow: "hidden" },
  mapImage: { transform: [{ scale: 1 }] },
  contentScroll: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "flex-end" },
  presetArea: { paddingHorizontal: 18, paddingBottom: 26, paddingTop: 30 },
  presetLabel: {
    transform: [{ translateY: 10 }],
    alignSelf: "stretch",
    width: "100%",
    minWidth: 0,
    backgroundColor: "#F1F5F9",
    borderLeftWidth: 5,
    borderLeftColor: "#475569",
    borderRightWidth: 5,
    borderRightColor: "#475569",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    marginBottom: 20,
    maxWidth: "100%",
  },
  presetLabelHighContrast: {
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderLeftColor: "#172033",
    borderRightColor: "#172033",
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: "#172033",
    borderBottomColor: "#172033",
    backgroundColor: "#FFFFFF",
  },
  boldHeading: { fontWeight: "900" },
  boldDescription: { fontWeight: "800" },
  highContrastHeading: { color: "#000000" },
  presetText: {
    fontSize: 22, fontWeight: "800", color: "#172033", textAlign: "center",
    width: "100%", paddingVertical: 2,
  },
  buttonRow: { flexDirection: "row", gap: 14, alignItems: "stretch" },
  buttonRowStacked: { flexDirection: "column" },
  buttonWrapper: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 200,
    borderRadius: 28,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
    elevation: 6,
  },
  buttonWrapperStacked: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: "100%",
  },
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
  standardModeButton: { borderColor: "#AC2B37", borderWidth: 2 },
  accessibilityModeButton: { borderColor: "#087F8C", borderWidth: 2 },
  modeButtonHighContrast: { borderWidth: 4 },
  standardTitle: { color: "#761723" },
  accessibilityTitle: { color: "#064C52" },
  standardDescription: { color: "#761723" },
  accessibilityDescription: { color: "#064C52" },
  modeButtonLargeText: { paddingVertical: 24 },
  modeIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  standardIcon: { backgroundColor: "#761723" },
  accessibilityIcon: { backgroundColor: "#064C52" },
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
    height: 5, backgroundColor: "#761723",
    borderTopLeftRadius: 5, borderTopRightRadius: 5,
  },
  accessibilityAccent: {
    position: "absolute", bottom: 0, left: 24, right: 24,
    height: 5, backgroundColor: "#064C52",
    borderTopLeftRadius: 5, borderTopRightRadius: 5,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingsButton: {
    position: "absolute",
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    justifyContent: "center", alignItems: "center", zIndex: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 5, elevation: 5,
  },
  tutorialButton: {
    position: "absolute",
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    justifyContent: "center", alignItems: "center", zIndex: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 5, elevation: 5,
  },
});
