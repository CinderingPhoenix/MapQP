import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
import { useState, useEffect, type ComponentProps } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useModalDismissal } from "./avoid-stairs-prompt";
import { StyleSheet, Text, View, TouchableOpacity, Modal, ScrollView, Image, Platform, TextStyle, ViewStyle, useWindowDimensions } from "react-native";

interface HighlightItem {
  top: string;
  left: string;
  width: string;
  height: string;
  label: string;
  tagPosition?: "top" | "side" | "bottom";
}

type TutorialTopic = "getting-started" | "navigation" | "destinations" | "saved" | "routing" | "settings";

interface TutorialPage {
  topic: TutorialTopic;
  title: string;
  subtitle: string;
  description: string;
  image: any;
  section?: string;
  highlights?: HighlightItem[];
}

type TutorialMode = "standard" | "accessibility";

const standardTutorialPages: TutorialPage[] = [
  {
    topic: "getting-started",
    title: "Standard Mode",
    subtitle: "Start your campus navigation",
    description: "Tap Standard Mode to open the campus map.",
    image: require("../../assets/tutorial/landing-page.webp"),
    highlights: [
      { top: "72%", left: "6%", width: "42%", height: "24%", label: "Standard Mode", tagPosition: "top" },
    ],
  },
  {
    topic: "destinations",
    title: "Destination Search",
    subtitle: "Find a campus building",
    description: "Type a building name in search. Tap a result to start a route.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "90%", left: "5%", width: "90%", height: "9%", label: "Destination Search", tagPosition: "top" },
    ],
  },
  {
    topic: "navigation",
    title: "Map Orientation",
    subtitle: "Change how the map faces",
    description: "Tap the top-right compass to change map orientation.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "6%", left: "80%", width: "16%", height: "7%", label: "Map Orientation", tagPosition: "bottom" },
    ],
  },
  {
    topic: "navigation",
    title: "Audio Feedback",
    subtitle: "Control spoken navigation",
    description: "Tap the speaker to mute or unmute directions.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "13%", left: "80%", width: "16%", height: "7%", label: "Audio Feedback", tagPosition: "top" },
    ],
  },
  {
    topic: "saved",
    title: "Open Saved Locations",
    subtitle: "Find your favorites from the map",
    description: "Tap the star beside search to open saved buildings.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "92%", left: "70%", width: "13%", height: "6%", label: "Saved Locations", tagPosition: "top" },
    ],
  },
  {
    topic: "destinations",
    title: "Voice Search",
    subtitle: "Find a destination by speaking",
    description: "Tap the microphone and say a building name to start a route.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "92%", left: "83%", width: "12%", height: "6%", label: "Voice Search", tagPosition: "top" },
    ],
  },
  {
    topic: "destinations",
    title: "Recent Searches",
    subtitle: "Return to a previous destination",
    description: "Open search, then tap a recent building to route there.",
    image: require("../../assets/tutorial/standard/routing.webp"),
    highlights: [
      { top: "30%", left: "6%", width: "87%", height: "34%", label: "Recent Searches", tagPosition: "top" },
    ],
  },
  {
    topic: "destinations",
    title: "Building Chooser",
    subtitle: "Browse available destinations",
    description: "Open the building chooser from search to browse destinations.",
    image: require("../../assets/tutorial/standard/routing.webp"),
    highlights: [
      { top: "23%", left: "6%", width: "87%", height: "6%", label: "Building Chooser", tagPosition: "top" },
    ],
  },
  {
    topic: "destinations",
    title: "Select a Building",
    subtitle: "Start a route from the building list",
    description: "Tap a building to start a route.",
    image: require("../../assets/tutorial/standard/building-chooser.webp"),
    highlights: [
      { top: "19%", left: "2%", width: "35%", height: "4%", label: "Select Building", tagPosition: "top" },
    ],
  },
  {
    topic: "saved",
    title: "Save a Building",
    subtitle: "Keep a destination for later",
    description: "Tap a building's star to save or remove it.",
    image: require("../../assets/tutorial/standard/building-chooser.webp"),
    highlights: [
      { top: "19%", left: "84%", width: "10%", height: "4%", label: "Save or Remove", tagPosition: "top" },
    ],
  },
  {
    topic: "saved",
    title: "Saved List",
    subtitle: "Browse only your favorite buildings",
    description: "Open the Saved tab. Tap a building to route there.",
    image: require("../../assets/tutorial/standard/building-chooser.webp"),
    highlights: [
      { top: "12%", left: "57%", width: "38%", height: "5%", label: "Saved Tab", tagPosition: "top" },
    ],
  },
  {
    topic: "saved",
    title: "Manage Saved Locations",
    subtitle: "Remove a destination you no longer need",
    description: "Tap the filled star to remove a saved building.",
    image: require("../../assets/tutorial/standard/saved-locations.webp"),
    highlights: [
      { top: "19%", left: "84%", width: "10%", height: "4%", label: "Remove Favorite", tagPosition: "top" },
    ],
  },
  {
    topic: "routing",
    title: "Next Direction",
    subtitle: "Follow the upcoming instruction",
    description: "Follow the next instruction at the top of the map.",
    image: require("../../assets/tutorial/standard/next-direction.webp"),
    highlights: [
      { top: "5%", left: "2%", width: "94%", height: "10%", label: "Next Direction", tagPosition: "top" },
    ],
  },
  {
    topic: "routing",
    title: "Expanded Directions",
    subtitle: "Review the upcoming steps",
    description: "Tap the top direction summary to see upcoming steps.",
    image: require("../../assets/tutorial/standard/direction-list.webp"),
  },
  {
    topic: "routing",
    title: "Cancel a Route",
    subtitle: "Stop the current navigation",
    description: "Tap Cancel at the bottom to stop your route.",
    image: require("../../assets/tutorial/standard/next-direction.webp"),
    highlights: [
      { top: "93%", left: "80%", width: "12%", height: "5%", label: "Cancel Route", tagPosition: "top" },
    ],
  },
  {
    topic: "navigation",
    title: "Recenter the Map",
    subtitle: "Return to your current position",
    description: "When Recenter appears, tap it to return to your location.",
    image: require("../../assets/tutorial/standard/recenter.webp"),
    highlights: [
      { top: "84%", left: "78%", width: "19%", height: "5%", label: "Recenter", tagPosition: "top" },
    ],
  },
  {
    topic: "settings",
    title: "Open Settings",
    subtitle: "Find navigation preferences",
    description: "Tap the top-left settings button to open preferences.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "7%", left: "2%", width: "13%", height: "6%", label: "Settings", tagPosition: "top" },
    ],
  },
  {
    topic: "settings",
    title: "Customize Navigation",
    subtitle: "Adjust the app to your preferences",
    description: "Choose your mode, units, direction style, and text size.",
    image: require("../../assets/tutorial/standard/settings.webp"),
    section: "standard-settings",
  },
  {
    topic: "routing",
    title: "Routing Settings",
    subtitle: "Choose your route preferences",
    description: "In Settings > Routing, choose paths to avoid. Changes apply to new routes.",
    image: require("../../assets/tutorial/standard/settings-routing.webp"),
    section: "standard-settings",
  },

];

const accessibilityTutorialPages: TutorialPage[] = [
  {
    topic: "getting-started",
    title: "Accessibility Mode",
    subtitle: "Start accessible campus navigation",
    description: "Tap Accessibility Mode to open accessible campus navigation.",
    image: require("../../assets/tutorial/landing-page.webp"),
    highlights: [
      { top: "75%", left: "51%", width: "45%", height: "20%", label: "Accessibility Mode", tagPosition: "top" },
    ],
  },
  {
    topic: "destinations",
    title: "Voice Search",
    subtitle: "Say your destination",
    description: "Tap Speak and say a building name to start a route.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "88%", left: "38%", width: "25%", height: "9%", label: "Speak", tagPosition: "top" },
    ],
  },
  {
    topic: "saved",
    title: "Saved Destinations",
    subtitle: "Return to your favorite places",
    description: "Tap Saved, then choose a building to start a route.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "87%", left: "70%", width: "19%", height: "10%", label: "Saved", tagPosition: "top" },
    ],
  },
  {
    topic: "saved",
    title: "Manage Saved Locations",
    subtitle: "Remove a destination you no longer need",
    description: "Tap the filled star to remove a saved building.",
    image: require("../../assets/tutorial/standard/saved-locations.webp"),
    highlights: [
      { top: "19%", left: "84%", width: "10%", height: "4%", label: "Remove Favorite", tagPosition: "top" },
    ],
  },
  {
    topic: "navigation",
    title: "Move and Zoom the Map",
    subtitle: "Explore without dragging or pinching",
    description: "Use arrows to move the map. Tap + or - to zoom.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "66%", left: "3%", width: "36%", height: "12%", label: "Map Controls", tagPosition: "top" },
    ],
  },
  {
    topic: "navigation",
    title: "Map Orientation",
    subtitle: "Change how the map faces",
    description: "Tap the top-right compass to change map orientation.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "7%", left: "79%", width: "16%", height: "7%", label: "Orientation", tagPosition: "bottom" },
    ],
  },
  {
    topic: "navigation",
    title: "Spoken Directions",
    subtitle: "Control navigation audio",
    description: "Tap the speaker to mute or unmute directions.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "15%", left: "81%", width: "13%", height: "6%", label: "Audio", tagPosition: "top" },
    ],
  },
  {
    topic: "routing",
    title: "Follow Your Route",
    subtitle: "See your next direction at a glance",
    description: "Follow the highlighted route and the instruction at the top.",
    image: require("../../assets/tutorial/accessibility/routing.webp"),
    highlights: [
      { top: "6%", left: "4%", width: "92%", height: "8%", label: "Next Direction", tagPosition: "top" },
    ],
  },
  {
    topic: "routing",
    title: "Expanded Directions",
    subtitle: "Review the upcoming steps",
    description: "Tap the route summary to show or hide upcoming directions.",
    image: require("../../assets/tutorial/accessibility/direction-list.webp"),
    highlights: [
      { top: "14%", left: "5%", width: "90%", height: "40%", label: "Upcoming Directions", tagPosition: "top" },
    ],
  },
  {
    topic: "routing",
    title: "Cancel a Route",
    subtitle: "Cancel with the button or your voice",
    description: "Tap Cancel, or tap Speak and say \"cancel route\".",
    image: require("../../assets/tutorial/accessibility/routing.webp"),
    highlights: [
      { top: "8%", left: "77%", width: "16%", height: "4%", label: "Cancel Route", tagPosition: "top" },
    ],
  },
  {
    topic: "navigation",
    title: "Recenter the Map",
    subtitle: "Return to your current position",
    description: "When Recenter appears, tap it to return to your location.",
    image: require("../../assets/tutorial/accessibility/recenter.webp"),
    highlights: [
      { top: "79%", left: "78%", width: "19%", height: "5%", label: "Recenter", tagPosition: "top" },
    ],
  },
  {
    topic: "settings",
    title: "Open Settings",
    subtitle: "Adjust your navigation experience",
    description: "Tap Settings at the bottom to open preferences.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "87%", left: "14%", width: "20%", height: "10%", label: "Settings", tagPosition: "top" },
    ],
  },
  {
    topic: "settings",
    title: "General Settings",
    subtitle: "Personalize the display and directions",
    description: "In General, choose your mode, units, direction style, and text size.",
    image: require("../../assets/tutorial/accessibility/settings.webp"),
    section: "accessibility-settings",
  },
  {
    topic: "routing",
    title: "Routing Settings",
    subtitle: "Choose which paths to allow",
    description: "Choose paths to avoid in Routing. Changes apply to new routes.",
    image: require("../../assets/tutorial/accessibility/settings-routing.webp"),
    section: "accessibility-settings",
  },
  {
    topic: "settings",
    title: "Instruction Repetition",
    subtitle: "Choose how often directions repeat",
    description: "Under Accessibility, turn repetition on or off and choose how often directions repeat.",
    image: require("../../assets/tutorial/accessibility/settings-routing-repetition.webp"),
    section: "accessibility-settings",
  },
];

const tutorialPagesByMode: Record<TutorialMode, TutorialPage[]> = {
  standard: standardTutorialPages,
  accessibility: accessibilityTutorialPages,
};

// Consecutive slides sharing a section or screenshot form one tutorial page.
function getTutorialPageGroups(pages: TutorialPage[]) {
  const groups: { start: number; count: number }[] = [];
  pages.forEach((page, index) => {
    if (index === 0 || (page.section ?? page.image) !== (pages[index - 1].section ?? pages[index - 1].image)) {
      groups.push({ start: index, count: 1 });
    } else {
      groups[groups.length - 1].count += 1;
    }
  });
  return groups;
}

const tutorialTopics: { value: TutorialTopic; label: string; icon: ComponentProps<typeof MaterialCommunityIcons>["name"]; description: string }[] = [
  { value: "getting-started", icon: "rocket-launch-outline", label: "Getting Started", description: "Choose a mode." },
  { value: "navigation", icon: "compass-outline", label: "Navigation", description: "Map and audio controls." },
  { value: "destinations", icon: "map-search-outline", label: "Destinations", description: "Find campus buildings." },
  { value: "saved", icon: "star-outline", label: "Saved Locations", description: "Manage saved buildings." },
  { value: "routing", icon: "routes", label: "Routing", description: "Directions and route options." },
  { value: "settings", icon: "cog-outline", label: "Settings", description: "Display and navigation preferences." },
];

const tutorialModes = [
  { value: "standard", label: "Standard" },
  { value: "accessibility", label: "Accessibility" },
] as const;

interface TutorialModalProps {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
}

export function TutorialModal({ visible, onClose, onDismiss }: TutorialModalProps) {
  const nativeDismiss = useModalDismissal(visible, onDismiss);
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const { fontSize } = useSettings();
  const preferences = useAccessibilityPreferences();
  const increasedContrast = preferences.darkerSystemColorsEnabled || preferences.highTextContrastEnabled;
  const textStyle = (base: TextStyle, treatment: "ordinary" | "accent" | "onControl" | "callout" = "ordinary", baselineScale = 1): TextStyle => ({
    fontSize: (base.fontSize ?? 14) * baselineScale * fontSize,
    ...(base.lineHeight !== undefined ? { lineHeight: base.lineHeight * baselineScale * fontSize } : {}),
    ...(preferences.boldTextEnabled ? {
      ...(Platform.OS === "ios" ? { fontFamily: "System" } : {}),
      fontWeight: base.fontWeight === "800" ? "900" : base.fontWeight === "700" ? "800" : "700",
    } : {}),
    ...(treatment === "ordinary" && (preferences.boldTextEnabled || increasedContrast)
      ? { color: "#111827" } : {}),
    ...(treatment === "accent" && increasedContrast ? { color: "#761723" } : {}),
    ...(treatment === "onControl" ? { color: "#FFFFFF" } : {}),
    ...(treatment === "callout" && increasedContrast ? { color: "#111827" } : {}),
  });
  const contrastBorder = increasedContrast && styles.contrastBorder;
  const previewHeight = Math.min(360, screenHeight * 0.38, Math.max(120, screenWidth - 128) * 2.22);
  const previewWidth = previewHeight / 2.22;
  const tagWidth = Math.min(160, previewWidth);
  const [mode, setMode] = useState<TutorialMode>("standard");
  const [currentPage, setCurrentPage] = useState(0);
  const slideTextScale = mode === "accessibility" ? 1.12 : 1;
  const [selectedTopic, setSelectedTopic] = useState<TutorialTopic | null>(null);

  // Start at the topic menu every time the modal is opened
  useEffect(() => {
    if (visible) {
      setSelectedTopic(null);
      setCurrentPage(0);
    }
  }, [visible]);

  const tutorialPages = tutorialPagesByMode[mode].filter(
    (page) => selectedTopic === null || page.topic === selectedTopic
  );
  const current = tutorialPages[currentPage];
  const pageGroups = getTutorialPageGroups(tutorialPages);
  const pageIndex = pageGroups.findIndex(
    (group) => currentPage >= group.start && currentPage < group.start + group.count
  );
  const currentGroup = pageGroups[pageIndex];
  const partIndex = currentPage - currentGroup.start;

  const handleModeChange = (nextMode: TutorialMode) => {
    if (nextMode !== mode) {
      setSelectedTopic(null);
      setCurrentPage(0);
      setMode(nextMode);
    }
  };

  const handleNext = () => {
    if (currentPage < tutorialPages.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      setCurrentPage(0);
      setSelectedTopic(null);
    }
  };

  const handleBack = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onDismiss={nativeDismiss}
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, preferences.reduceTransparencyEnabled && styles.opaqueOverlay]}>
        <View style={styles.tutorialCard}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.headerTitle, textStyle(styles.headerTitle)]}>MapQP Tutorial</Text>
            <TouchableOpacity style={styles.skipButton} onPress={onClose} accessible accessibilityRole="button" accessibilityLabel="Skip Tutorial">
              <Text style={[styles.skipText, textStyle(styles.skipText)]}>Skip Tutorial</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabs} accessibilityRole="tablist">
            {tutorialModes.map((tab) => (
              <TouchableOpacity
                key={tab.value}
                style={[styles.tab, mode === tab.value && styles.activeTab, contrastBorder]}
                onPress={() => handleModeChange(tab.value)}
                accessibilityRole="tab"
                accessibilityLabel={`${tab.label} tutorial`}
                accessibilityState={{ selected: mode === tab.value }}
              >
                <Text style={[styles.tabText, mode === tab.value && styles.activeTabText, textStyle(styles.tabText, mode === tab.value ? "onControl" : "ordinary")]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {selectedTopic === null ? (
            <ScrollView key={`topics-${mode}`} style={styles.scrollArea} contentContainerStyle={styles.topicContent} showsVerticalScrollIndicator>
              <Text style={styles.title} accessibilityRole="header">What would you like to learn?</Text>
              <View style={styles.topicGrid}>
              {tutorialTopics.map((topic) => (
                <TouchableOpacity
                  key={topic.value}
                  style={styles.topicButton}
                  onPress={() => { setCurrentPage(0); setSelectedTopic(topic.value); }}
                  accessibilityRole="button"
                  accessibilityLabel={topic.label}
                  accessibilityHint={topic.description}
                >
                  <View style={styles.topicIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <MaterialCommunityIcons name={topic.icon} size={36} color="#AC2B37" />
                  </View>
                  <Text style={styles.topicTitle}>{topic.label}</Text>
                </TouchableOpacity>
              ))}
              </View>
            </ScrollView>
          ) : (
            <>
            <ScrollView key={`${mode}-${selectedTopic}-${currentPage}`} style={styles.scrollArea}
              contentContainerStyle={styles.content} showsVerticalScrollIndicator>
              <View style={[styles.imageContainer, { width: previewWidth, height: previewHeight }]}>
                <Image source={current.image} style={styles.previewImage} resizeMode="cover" />
                {current.highlights?.map((box, idx) => {
                  let tagStyle: ViewStyle = styles.tagTop;
                  if (box.tagPosition === "side") tagStyle = styles.tagSide;
                  if (box.tagPosition === "bottom") tagStyle = styles.tagBottom;

                return (
                  <View
                    key={idx}
                    style={[
                      styles.yellowHighlightBox,
                      preferences.reduceTransparencyEnabled && { backgroundColor: "transparent" },
                      {
                        top: box.top as any,
                        left: box.left as any,
                        width: box.width as any,
                        height: box.height as any,
                      },
                    ]}
                  >
                    <View style={[styles.highlightTag, tagStyle, {
                      // Keep the larger label inside the screenshot's horizontal bounds.
                      width: tagWidth,
                      left: Math.min(previewWidth - tagWidth, parseFloat(box.left) * previewWidth / 100)
                        - parseFloat(box.left) * previewWidth / 100,
                    }]}>
                      <Text style={[styles.highlightTagText, textStyle(styles.highlightTagText, "callout")]}>
                        {box.label}
                      </Text>
                    </View>
                  </View>
                  );
                })}
              </View>

            <Text style={[styles.title, textStyle(styles.title, "ordinary", slideTextScale)]}>{current.title}</Text>
            <Text style={[styles.subtitle, textStyle(styles.subtitle, "accent", slideTextScale)]}>{current.subtitle}</Text>
            <Text style={[styles.description, textStyle(styles.description, "ordinary", slideTextScale)]}>{current.description}</Text>
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.progressContainer}>
              {currentGroup.count > 1 && (
                <View
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel="Current page parts"
                  accessibilityValue={{ min: 1, max: currentGroup.count, now: partIndex + 1 }}
                >
                  <View style={styles.progressSegments}>
                    {Array.from({ length: currentGroup.count }, (_, index) => (
                      <View
                        key={index}
                        style={[styles.progressSegment, index <= partIndex && styles.filledSegment, contrastBorder]}
                      />
                    ))}
                  </View>
                </View>
              )}
              <View
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Tutorial pages"
                accessibilityValue={{
                  min: 1,
                  max: pageGroups.length,
                  now: pageIndex + 1,
                }}
              >
                <View style={styles.progressSegments}>
                  {pageGroups.map((group, index) => (
                    <View
                      key={group.start}
                      style={[styles.progressSegment, index <= pageIndex && styles.filledSegment, contrastBorder]}
                    />
                  ))}
                </View>
              </View>
            </View>

            <View key={`buttons-${currentPage}`} style={styles.buttonRow}>
              {currentPage > 0 && (
                <TouchableOpacity style={[styles.backButton, contrastBorder]} onPress={handleBack} accessible accessibilityRole="button" accessibilityLabel="Previous slide">
                  <Text style={[styles.backButtonText, textStyle(styles.backButtonText)]}>Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[currentPage > 0 ? styles.nextButtonHalf : styles.nextButtonFull, contrastBorder]} onPress={handleNext} accessible accessibilityRole="button" accessibilityLabel={currentPage === tutorialPages.length - 1 ? "Get Started" : "Next slide"}>
                <Text style={[styles.nextButtonText, textStyle(styles.nextButtonText, "onControl")]}>
                  {currentPage === tutorialPages.length - 1 ? "Get Started" : "Next"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topicContent: { paddingHorizontal: 24, paddingBottom: 24, gap: 16 },
  topicGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  topicButton: { flexGrow: 1, flexBasis: "45%", minHeight: 112, padding: 12,
    alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 16, backgroundColor: "#F1F5F9" },
  topicIcon: { alignItems: "center", justifyContent: "center" },
  topicTitle: { fontSize: 16, fontWeight: "600", color: "#172033", textAlign: "center" },
  contrastBorder: { borderWidth: 2, borderColor: "#111827" },
  opaqueOverlay: { backgroundColor: "#262626" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#172033", flex: 1, minWidth: 0, paddingVertical: 2 },
  skipButton: { flexShrink: 1, minWidth: 0, paddingVertical: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  tutorialCard: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 20,
    padding: 4,
    gap: 4,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: "#AC2B37",
  },
  tabText: {
    alignSelf: "stretch",
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
  },
  activeTabText: {
    color: "#FFFFFF",
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  scrollArea: {
    flexShrink: 1,
    minHeight: 0,
  },
  content: {
    paddingHorizontal: 24,
    alignItems: "center",
    paddingBottom: 48,
  },
  imageContainer: {
    width: 200,
    height: 444,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    overflow: "visible",
    marginTop: 36,
    marginBottom: 20,
    position: "relative",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
  },
  yellowHighlightBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#FACC15",
    backgroundColor: "rgba(250, 204, 21, 0.25)",
    borderRadius: 8,
  },
  highlightTag: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#713F12",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  tagTop: {
    position: "absolute",
    bottom: "100%",
    marginBottom: 6,
    width: 160,
  },
  tagBottom: {
    position: "absolute",
    top: "100%",
    marginTop: 6,
    width: 160,
  },
  tagSide: {
    position: "absolute",
    bottom: "100%",
    marginBottom: 6,
    width: 160,
  },
  highlightTagText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    color: "#713F12",
    textAlign: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#172033",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#AC2B37",
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    fontSize: 13,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 20,
  },
  footer: {
    flexShrink: 0,
    padding: 20,
    alignItems: "center",
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },
  progressContainer: {
    width: "100%",
    gap: 12,
  },
  progressSegments: {
    flexDirection: "row",
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
  },
  filledSegment: {
    backgroundColor: "#AC2B37",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    alignSelf: "stretch",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
  },
  nextButtonFull: {
    width: "100%",
    backgroundColor: "#AC2B37",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#AC2B37",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  nextButtonHalf: {
    flex: 1,
    backgroundColor: "#AC2B37",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#AC2B37",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  nextButtonText: {
    alignSelf: "stretch",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
