// tutorial-modal.tsx

import { useState, useEffect } from "react";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
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

interface TutorialPage {
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
    title: "Standard Mode",
    subtitle: "Start your campus navigation",
    description: "Choose Standard Mode on the landing page to open the campus map and destination search.",
    image: require("../../assets/tutorial/landing-page.webp"),
    highlights: [
      { top: "72%", left: "6%", width: "42%", height: "24%", label: "Standard Mode", tagPosition: "top" },
    ],
  },
  {
    title: "Destination Search",
    subtitle: "Find a campus building",
    description: "Tap the destination search bar at the bottom of the map and enter a building name. Select a result to start a route to that destination.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "90%", left: "5%", width: "90%", height: "9%", label: "Destination Search", tagPosition: "top" },
    ],
  },
  {
    title: "Map Orientation",
    subtitle: "Change how the map faces",
    description: "Use the orientation control at the top right to change the map orientation while you navigate.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "6%", left: "80%", width: "16%", height: "7%", label: "Map Orientation", tagPosition: "bottom" },
    ],
  },
  {
    title: "Audio Feedback",
    subtitle: "Control spoken navigation",
    description: "Tap the audio control below the orientation button to mute or unmute spoken navigation instructions.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "13%", left: "80%", width: "16%", height: "7%", label: "Audio Feedback", tagPosition: "top" },
    ],
  },
  {
    title: "Open Saved Locations",
    subtitle: "Find your favorites from the map",
    description: "Tap the star beside the destination search to view your saved buildings and choose a frequent destination.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "92%", left: "70%", width: "13%", height: "6%", label: "Saved Locations", tagPosition: "top" },
    ],
  },
  {
    title: "Voice Search",
    subtitle: "Find a destination by speaking",
    description: "Tap the microphone beside the destination search bar and say a campus building name. The app starts a route directly to the recognized building.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "92%", left: "83%", width: "12%", height: "6%", label: "Voice Search", tagPosition: "top" },
    ],
  },
  {
    title: "Recent Searches",
    subtitle: "Return to a previous destination",
    description: "Open the destination search to see your recent searches. Tap a building in the list to start a new route there.",
    image: require("../../assets/tutorial/standard/routing.webp"),
    highlights: [
      { top: "30%", left: "6%", width: "87%", height: "34%", label: "Recent Searches", tagPosition: "top" },
    ],
  },
  {
    title: "Building Chooser",
    subtitle: "Browse available destinations",
    description: "Open the building chooser from the search panel to browse campus buildings instead of typing a name.",
    image: require("../../assets/tutorial/standard/routing.webp"),
    highlights: [
      { top: "23%", left: "6%", width: "87%", height: "6%", label: "Building Chooser", tagPosition: "top" },
    ],
  },
  {
    title: "Select a Building",
    subtitle: "Start a route from the building list",
    description: "Tap a building name in the chooser to select it as your destination and generate a route.",
    image: require("../../assets/tutorial/standard/building-chooser.webp"),
    highlights: [
      { top: "19%", left: "2%", width: "35%", height: "4%", label: "Select Building", tagPosition: "top" },
    ],
  },
  {
    title: "Save a Building",
    subtitle: "Keep a destination for later",
    description: "Tap the star beside a building to save it. Tap the star again to remove that building from your saved locations.",
    image: require("../../assets/tutorial/standard/building-chooser.webp"),
    highlights: [
      { top: "19%", left: "84%", width: "10%", height: "4%", label: "Save or Remove", tagPosition: "top" },
    ],
  },
  {
    title: "Saved List",
    subtitle: "Browse only your favorite buildings",
    description: "Switch to the Saved tab in the building chooser to see your favorites. Select a building to navigate there.",
    image: require("../../assets/tutorial/standard/building-chooser.webp"),
    highlights: [
      { top: "12%", left: "57%", width: "38%", height: "5%", label: "Saved Tab", tagPosition: "top" },
    ],
  },
  {
    title: "Manage Saved Locations",
    subtitle: "Remove a destination you no longer need",
    description: "In your saved locations, tap the filled star beside a building to remove it from the list. You can save it again from the building chooser.",
    image: require("../../assets/tutorial/standard/saved-locations.webp"),
    highlights: [
      { top: "19%", left: "84%", width: "10%", height: "4%", label: "Remove Favorite", tagPosition: "top" },
    ],
  },
  {
    title: "Next Direction",
    subtitle: "Follow the upcoming instruction",
    description: "Once a route starts, read the instruction at the top of the screen to see your next navigation step.",
    image: require("../../assets/tutorial/standard/next-direction.webp"),
    highlights: [
      { top: "5%", left: "2%", width: "94%", height: "10%", label: "Next Direction", tagPosition: "top" },
    ],
  },
  {
    title: "Expanded Directions",
    subtitle: "Review the upcoming steps",
    description: "Tap the direction summary at the top to expand the list of upcoming directions along your route.",
    image: require("../../assets/tutorial/standard/direction-list.webp"),
  },
  {
    title: "Cancel a Route",
    subtitle: "Stop the current navigation",
    description: "Tap the cancel control at the bottom of the screen to end the current route. You can then search for a new destination.",
    image: require("../../assets/tutorial/standard/next-direction.webp"),
    highlights: [
      { top: "93%", left: "80%", width: "12%", height: "5%", label: "Cancel Route", tagPosition: "top" },
    ],
  },
  {
    title: "Recenter the Map",
    subtitle: "Return to your current position",
    description: "The Recenter button appears at the bottom right when the map is no longer focused on your position, such as after moving around the map. Tap it to bring the map back to your current position.",
    image: require("../../assets/tutorial/standard/recenter.webp"),
    highlights: [
      { top: "84%", left: "78%", width: "19%", height: "5%", label: "Recenter", tagPosition: "top" },
    ],
  },
  {
    title: "Open Settings",
    subtitle: "Find navigation preferences",
    description: "Tap the settings button at the top left of the map to open your navigation preferences.",
    image: require("../../assets/tutorial/standard/standard-navigation.webp"),
    highlights: [
      { top: "7%", left: "2%", width: "13%", height: "6%", label: "Settings", tagPosition: "top" },
    ],
  },
  {
    title: "Customize Navigation",
    subtitle: "Adjust the app to your preferences",
    description: "In Settings, choose your navigation mode, distance units, direction style, and text size.",
    image: require("../../assets/tutorial/standard/settings.webp"),
    section: "standard-settings",
  },
  {
    title: "Routing Settings",
    subtitle: "Choose your route preferences",
    description: "Open the Routing tab in Settings to choose whether to avoid stairs, indoor walkways, or inaccessible road crossings. These choices apply when you start a new route. You can also adjust spoken instruction repetition under Accessibility.",
    image: require("../../assets/tutorial/standard/settings-routing.webp"),
    section: "standard-settings",
  },

];

const accessibilityTutorialPages: TutorialPage[] = [
  {
    title: "Accessibility Mode",
    subtitle: "Start accessible campus navigation",
    description: "Tap Accessibility Mode on the landing page to open the accessibility support options. Choose the option that matches your needs, then continue to the navigation screen.",
    image: require("../../assets/tutorial/landing-page.webp"),
    highlights: [
      { top: "75%", left: "51%", width: "45%", height: "20%", label: "Accessibility Mode", tagPosition: "top" },
    ],
  },
  {
    title: "Accessibility Support",
    subtitle: "Choose the support that matches your needs",
    description: "Choose Accessibility Mode on the landing page, select Visual impairment or Motor impairment, and tap Continue. Routing preferences are selected separately.",
    image: require("../../assets/tutorial/accessibility/accessibility-support.webp"),
    highlights: [
      { top: "39%", left: "9%", width: "82%", height: "16%", label: "Support Options", tagPosition: "top" },
    ],
  },
  {
    title: "Voice Search",
    subtitle: "Say your destination",
    description: "Tap Speak and say a campus building name. The app starts a route directly to the recognized building. Microphone and speech recognition permissions are requested on the loading screen.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "88%", left: "38%", width: "25%", height: "9%", label: "Speak", tagPosition: "top" },
    ],
  },
  {
    title: "Saved Destinations",
    subtitle: "Return to your favorite places",
    description: "Tap Saved to open your saved buildings. Choose a building to start a route. Use the star in the building list to save or remove a favorite.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "87%", left: "70%", width: "19%", height: "10%", label: "Saved", tagPosition: "top" },
    ],
  },
  {
    title: "Move and Zoom the Map",
    subtitle: "Explore without dragging or pinching",
    description: "Use the arrow buttons to move around the map. Tap plus to zoom in or minus to zoom out. Recenter returns the map to your location when available.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "66%", left: "3%", width: "36%", height: "12%", label: "Map Controls", tagPosition: "top" },
    ],
  },
  {
    title: "Map Orientation",
    subtitle: "Change how the map faces",
    description: "Tap the compass at the top right to change the map orientation.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "7%", left: "79%", width: "16%", height: "7%", label: "Orientation", tagPosition: "bottom" },
    ],
  },
  {
    title: "Spoken Directions",
    subtitle: "Control navigation audio",
    description: "Tap the speaker button to mute or unmute spoken directions. During a route, the top summary shows the next instruction; tap it to expand the directions. Instruction repetition can be adjusted in Settings.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "15%", left: "81%", width: "13%", height: "6%", label: "Audio", tagPosition: "top" },
    ],
  },
  {
    title: "Follow Your Route",
    subtitle: "See your next direction at a glance",
    description: "After choosing a destination, follow the highlighted route on the map. The summary at the top shows your next instruction, total distance, travel time, and arrival time. Tap the summary to expand your directions.",
    image: require("../../assets/tutorial/accessibility/routing.webp"),
    highlights: [
      { top: "6%", left: "4%", width: "92%", height: "8%", label: "Next Direction", tagPosition: "top" },
    ],
  },
  {
    title: "Expanded Directions",
    subtitle: "Review the upcoming steps",
    description: "Tap the route summary to open Upcoming Directions. Scroll through the list to review your route, then tap the summary again to collapse it.",
    image: require("../../assets/tutorial/accessibility/direction-list.webp"),
    highlights: [
      { top: "14%", left: "5%", width: "90%", height: "40%", label: "Upcoming Directions", tagPosition: "top" },
    ],
  },
  {
    title: "Cancel a Route",
    subtitle: "Cancel with the button or your voice",
    description: "Tap Cancel in the top route summary to stop navigation. You can also tap Speak and say \"cancel route\" to stop the current route using your voice. Then speak a new destination or choose another saved building.",
    image: require("../../assets/tutorial/accessibility/routing.webp"),
    highlights: [
      { top: "8%", left: "77%", width: "16%", height: "4%", label: "Cancel Route", tagPosition: "top" },
    ],
  },
  {
    title: "Recenter the Map",
    subtitle: "Return to your current position",
    description: "The Recenter button appears at the bottom right when the map is no longer focused on your position, such as after moving around the map. Tap it to bring the map back to your current position.",
    image: require("../../assets/tutorial/accessibility/recenter.webp"),
    highlights: [
      { top: "79%", left: "78%", width: "19%", height: "5%", label: "Recenter", tagPosition: "top" },
    ],
  },
  {
    title: "Open Settings",
    subtitle: "Adjust your navigation experience",
    description: "Tap Settings in the bottom controls to open your preferences.",
    image: require("../../assets/tutorial/accessibility/accessibility-navigation.webp"),
    highlights: [
      { top: "87%", left: "14%", width: "20%", height: "10%", label: "Settings", tagPosition: "top" },
    ],
  },
  {
    title: "General Settings",
    subtitle: "Personalize the display and directions",
    description: "Use the General tab to change navigation mode, Settings appearance, distance units, direction style, and text size. Scroll down for accessibility preferences and spoken instruction repetition.",
    image: require("../../assets/tutorial/accessibility/settings.webp"),
    section: "accessibility-settings",
  },
  {
    title: "Routing Settings",
    subtitle: "Choose which paths to allow",
    description: "Use the Routing tab to choose whether to avoid stairs, indoor walkways, or inaccessible road crossings. Each restriction follows its own switch and applies when you start a new route.",
    image: require("../../assets/tutorial/accessibility/settings-routing.webp"),
    section: "accessibility-settings",
  },
  {
    title: "Instruction Repetition",
    subtitle: "Choose how often directions repeat",
    description: "Scroll to Accessibility in the Routing tab to turn repetition on or off and select its frequency. Turning repetition off still allows new directions to be spoken. The same controls are available under Accessibility in General.",
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

  // Reset to page 0 every time the modal is opened
  useEffect(() => {
    if (visible) {
      setCurrentPage(0);
    }
  }, [visible]);

  const tutorialPages = tutorialPagesByMode[mode];
  const current = tutorialPages[currentPage];
  const pageGroups = getTutorialPageGroups(tutorialPages);
  const pageIndex = pageGroups.findIndex(
    (group) => currentPage >= group.start && currentPage < group.start + group.count
  );
  const currentGroup = pageGroups[pageIndex];
  const partIndex = currentPage - currentGroup.start;

  const handleModeChange = (nextMode: TutorialMode) => {
    if (nextMode !== mode) {
      setCurrentPage(0);
      setMode(nextMode);
    }
  };

  const handleNext = () => {
    if (currentPage < tutorialPages.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      setCurrentPage(0);
      onClose();
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

          <ScrollView key={`${mode}-${currentPage}`} style={styles.scrollArea}
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
