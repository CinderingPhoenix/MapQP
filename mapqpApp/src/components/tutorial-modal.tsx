// tutorial-modal.tsx

import { useState, useEffect } from "react";
import { StyleSheet, Text, View, TouchableOpacity, Modal, ScrollView, Image, ViewStyle } from "react-native";

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
  highlights?: HighlightItem[];
}

type TutorialMode = "standard" | "accessibility";

const standardTutorialPages: TutorialPage[] = [
  {
    title: "Standard Mode",
    subtitle: "Start your campus navigation",
    description: "Choose Standard Mode on the landing page to open the campus map and destination search.",
    image: require("../../assets/tutorial/landing-page.png"),
    highlights: [
      { top: "72%", left: "6%", width: "42%", height: "24%", label: "Standard Mode", tagPosition: "top" },
    ],
  },
  {
    title: "Destination Search",
    subtitle: "Find a campus building",
    description: "Tap the destination search bar at the bottom of the map and enter a building name. Select a result to start a route to that destination.",
    image: require("../../assets/tutorial/standard-navigation.png"),
    highlights: [
      { top: "90%", left: "5%", width: "90%", height: "9%", label: "Destination Search", tagPosition: "top" },
    ],
  },
  {
    title: "Map Orientation",
    subtitle: "Change how the map faces",
    description: "Use the orientation control at the top right to change the map orientation while you navigate.",
    image: require("../../assets/tutorial/standard-navigation.png"),
    highlights: [
      { top: "6%", left: "80%", width: "16%", height: "7%", label: "Map Orientation", tagPosition: "top" },
    ],
  },
  {
    title: "Audio Feedback",
    subtitle: "Control spoken navigation",
    description: "Tap the audio control below the orientation button to mute or unmute spoken navigation instructions.",
    image: require("../../assets/tutorial/standard-navigation.png"),
    highlights: [
      { top: "13%", left: "80%", width: "16%", height: "7%", label: "Audio Feedback", tagPosition: "top" },
    ],
  },
  {
    title: "Open Saved Locations",
    subtitle: "Find your favorites from the map",
    description: "Tap the star beside the destination search to view your saved buildings and choose a frequent destination.",
    image: require("../../assets/tutorial/standard-navigation.png"),
    highlights: [
      { top: "92%", left: "70%", width: "13%", height: "6%", label: "Saved Locations", tagPosition: "top" },
    ],
  },
  {
    title: "Recent Searches",
    subtitle: "Return to a previous destination",
    description: "Open the destination search to see your recent searches. Tap a building in the list to start a new route there.",
    image: require("../../assets/tutorial/routing.png"),
    highlights: [
      { top: "66%", left: "6%", width: "87%", height: "32%", label: "Recent Searches", tagPosition: "top" },
    ],
  },
  {
    title: "Building Chooser",
    subtitle: "Browse available destinations",
    description: "Open the building chooser from the search panel to browse campus buildings instead of typing a name.",
    image: require("../../assets/tutorial/routing.png"),
    highlights: [
      { top: "59%", left: "6%", width: "87%", height: "6%", label: "Building Chooser", tagPosition: "top" },
    ],
  },
  {
    title: "Select a Building",
    subtitle: "Start a route from the building list",
    description: "Tap a building name in the chooser to select it as your destination and generate a route.",
    image: require("../../assets/tutorial/building-chooser.png"),
    highlights: [
      { top: "19%", left: "2%", width: "35%", height: "4%", label: "Select Building", tagPosition: "top" },
    ],
  },
  {
    title: "Save a Building",
    subtitle: "Keep a destination for later",
    description: "Tap the star beside a building to save it. Tap the star again to remove that building from your saved locations.",
    image: require("../../assets/tutorial/building-chooser.png"),
    highlights: [
      { top: "19%", left: "84%", width: "10%", height: "4%", label: "Save or Remove", tagPosition: "top" },
    ],
  },
  {
    title: "Saved List",
    subtitle: "Browse only your favorite buildings",
    description: "Switch to the Saved tab in the building chooser to see your favorites. Select a building to navigate there.",
    image: require("../../assets/tutorial/building-chooser.png"),
    highlights: [
      { top: "12%", left: "57%", width: "38%", height: "5%", label: "Saved Tab", tagPosition: "top" },
    ],
  },
  {
    title: "Manage Saved Locations",
    subtitle: "Remove a destination you no longer need",
    description: "In your saved locations, tap the filled star beside a building to remove it from the list. You can save it again from the building chooser.",
    image: require("../../assets/tutorial/saved-locations.png"),
    highlights: [
      { top: "19%", left: "84%", width: "10%", height: "4%", label: "Remove Favorite", tagPosition: "top" },
    ],
  },
  {
    title: "Open Settings",
    subtitle: "Find navigation preferences",
    description: "Tap the settings button at the top left of the map to open your navigation preferences.",
    image: require("../../assets/tutorial/standard-navigation.png"),
    highlights: [
      { top: "7%", left: "2%", width: "13%", height: "6%", label: "Settings", tagPosition: "top" },
    ],
  },
  {
    title: "Customize Navigation",
    subtitle: "Adjust the app to your preferences",
    description: "In Settings, choose your navigation mode, distance units, direction style, and text size.",
    image: require("../../assets/tutorial/settings.png"),
  },
  {
    title: "Next Direction",
    subtitle: "Follow the upcoming instruction",
    description: "Once a route starts, read the instruction at the top of the screen to see your next navigation step.",
    image: require("../../assets/tutorial/next-direction.png"),
    highlights: [
      { top: "5%", left: "2%", width: "94%", height: "10%", label: "Next Direction", tagPosition: "top" },
    ],
  },
  {
    title: "Expanded Directions",
    subtitle: "Review the upcoming steps",
    description: "Tap the direction summary at the top to expand the list of upcoming directions along your route.",
    image: require("../../assets/tutorial/direction-list.png"),
  },
  {
    title: "Cancel a Route",
    subtitle: "Stop the current navigation",
    description: "Tap the cancel control at the bottom of the screen to end the current route. You can then search for a new destination.",
    image: require("../../assets/tutorial/next-direction.png"),
    highlights: [
      { top: "93%", left: "80%", width: "12%", height: "5%", label: "Cancel Route", tagPosition: "top" },
    ],
  },
];

const accessibilityTutorialPages: TutorialPage[] = [
  {
    title: "Accessibility Mode",
    subtitle: "Find your destination with accessible controls",
    description: "Choose Accessibility Mode on the landing page. Use the destination search or Voice Search to find a campus building, then select it to start navigation.",
    image: require("../../assets/tutorial/accessibility-navigation.png"),
    highlights: [
      { top: "89%" as any, left: "40%" as any, width: "20%" as any, height: "9%" as any, label: "Voice Search", tagPosition: "top" },

    ],
  },
  {
    title: "Saved Destinations",
    subtitle: "Open your favorite places from the bottom controls",
    description: "Tap Saved to open your saved destinations. Select a building to navigate there, or use the star beside a building in the chooser to save or remove it.",
    image: require("../../assets/tutorial/accessibility-navigation.png"),
    highlights: [
      { top: "89%", left: "69%", width: "15%", height: "7%", label: "Saved Destinations", tagPosition: "top" },
    ],
  },
  {
    title: "Accessible Directions",
    subtitle: "Follow the route summary at the top",
    description: "After choosing a destination, read the next instruction in the top route summary. Tap the summary to expand upcoming directions. Use Cancel at the top to stop navigation.",
    image: require("../../assets/tutorial/accessibility-navigation.png"),
    highlights: [
      { top: "6%", left: "76%", width: "20%", height: "7%", label: "Cancel Route", tagPosition: "top" },
    ],
  },
  {
    title: "Accessibility Settings",
    subtitle: "Customize your navigation experience",
    description: "Open Settings from the bottom controls to adjust text size, distance units, and direction style. Screen reader, contrast, and reduced motion preferences are controlled in your device settings.",
    image: require("../../assets/tutorial/accessibility-navigation.png"),
    highlights: [
      { top: "89%", left: "14%", width: "20%", height: "9%", label: "Settings", tagPosition: "top" },
    ],
  },
];

const tutorialPagesByMode: Record<TutorialMode, TutorialPage[]> = {
  standard: standardTutorialPages,
  accessibility: accessibilityTutorialPages,
};

// Consecutive slides using the same screenshot are parts of one tutorial page.
function getTutorialPageGroups(pages: TutorialPage[]) {
  const groups: { start: number; count: number }[] = [];
  pages.forEach((page, index) => {
    if (index === 0 || page.image !== pages[index - 1].image) {
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
}

export function TutorialModal({ visible, onClose }: TutorialModalProps) {
  const [mode, setMode] = useState<TutorialMode>("standard");
  const [currentPage, setCurrentPage] = useState(0);

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
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.tutorialCard}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} accessible accessibilityRole="button" accessibilityLabel="Skip Tutorial">
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabs} accessibilityRole="tablist">
            {tutorialModes.map((tab) => (
              <TouchableOpacity
                key={tab.value}
                style={[styles.tab, mode === tab.value && styles.activeTab]}
                onPress={() => handleModeChange(tab.value)}
                accessibilityRole="tab"
                accessibilityLabel={`${tab.label} tutorial`}
                accessibilityState={{ selected: mode === tab.value }}
              >
                <Text style={[styles.tabText, mode === tab.value && styles.activeTabText]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView key={`${mode}-${currentPage}`} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.imageContainer}>
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
                      {
                        top: box.top as any,
                        left: box.left as any,
                        width: box.width as any,
                        height: box.height as any,
                      },
                    ]}
                  >
                    <View style={[styles.highlightTag, tagStyle]}>
                      <Text style={styles.highlightTagText}>
                        {box.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <Text style={styles.title}>{current.title}</Text>
            <Text style={styles.subtitle}>{current.subtitle}</Text>
            <Text style={styles.description}>{current.description}</Text>
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
                        style={[styles.progressSegment, index <= partIndex && styles.filledSegment]}
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
                      style={[styles.progressSegment, index <= pageIndex && styles.filledSegment]}
                    />
                  ))}
                </View>
              </View>
            </View>

            <View key={`buttons-${currentPage}`} style={styles.buttonRow}>
              {currentPage > 0 && (
                <TouchableOpacity style={styles.backButton} onPress={handleBack} accessible accessibilityRole="button" accessibilityLabel="Previous slide">
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={currentPage > 0 ? styles.nextButtonHalf : styles.nextButtonFull} onPress={handleNext} accessible accessibilityRole="button" accessibilityLabel={currentPage === tutorialPages.length - 1 ? "Get Started" : "Next slide"}>
                <Text style={styles.nextButtonText}>
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
    alignItems: "flex-end",
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
  content: {
    paddingHorizontal: 24,
    alignItems: "center",
    paddingBottom: 20,
  },
  imageContainer: {
    width: 200,
    height: 444,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    overflow: "visible",
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
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  tagTop: {
    position: "absolute",
    top: -28,
    left: -20,
    width: 85,
  },
  tagBottom: {
    position: "absolute",
    bottom: -28,
    left: -20,
    width: 85,
  },
  tagSide: {
    position: "absolute",
    left: -88,
    top: 0,
    width: 82,
  },
  highlightTagText: {
    fontSize: 8.5,
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
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});