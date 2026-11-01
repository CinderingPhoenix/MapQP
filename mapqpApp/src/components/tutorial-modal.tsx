// tutorial-modal.tsx

import { useState, useEffect } from "react";
import { useModalDismissal } from "./avoid-stairs-prompt";
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

const tutorialPages: TutorialPage[] = [
  {
    title: "Navigating the App",
    subtitle: "Select your preferred navigation mode.",
    description: "Choose between Standard Mode for general campus navigation or Accessibility Mode for routes tailored specifically around accessibility needs.",
    image: require("../../assets/tutorial/landing-page.png"),
    highlights: [
      { top: "72%", left: "6%", width: "42%", height: "24%", label: "Standard Mode", tagPosition: "top" },
      { top: "72%", left: "52%", width: "42%", height: "24%", label: "Accessibility Mode", tagPosition: "top" },
      { top: "17%", left: "5%", width: "13%", height: "7%", label: "Settings Menu", tagPosition: "side" },
    ],
  },
  {
    title: "Standard Navigation Search",
    subtitle: "Navigating using the search bar",
    description: "This view highlights how to use the standard search bar to look up campus destinations, view recent searches, pick a destination building, and generate an active route.",
    image: require("../../assets/tutorial/standard-navigation.png"),
    highlights: [
      { top: "6%", left: "80%", width: "16%", height: "7%", label: "Map Orientation", tagPosition: "side" },
      { top: "13%", left: "80%", width: "16%", height: "7%", label: "Audio Feedback", tagPosition: "side" },
      { top: "90%", left: "5%", width: "90%", height: "9%", label: "Destination Selector", tagPosition: "top" },
      { top: "92%", left: "70%", width: "13%", height: "6%", label: "Saved Locations", tagPosition: "bottom" },
      { top: "7%", left: "2%", width: "13%", height: "6%", label: "Settings", tagPosition: "bottom" },
    ],
  },
  {
    title: "Recent Searches & Routing",
    subtitle: "Quickly access your latest routes",
    description: "This view demonstrates viewing and selecting a building from your recent searches to plan your route.",
    image: require("../../assets/tutorial/routing.png"),
    highlights: [
      { top: "59%", left: "6%", width: "87%", height: "6%", label: "Building Chooser", tagPosition: "top" },
      { top: "66%", left: "6%", width: "87%", height: "32%", label: "Recent Searches", tagPosition: "side" },
    ],
  },
  {
    title: "Using the Building Chooser",
    subtitle: "Quickly select a building from the list",
    description: "This view displays how to use the building chooser to quickly select a building from the list of available options.",
    image: require("../../assets/tutorial/building-chooser.png"),
    highlights: [
      { top: "12%", left: "57%", width: "38%", height: "5%", label: "Saved List Tab", tagPosition: "top" },
      { top: "19%" as any, left: "2%" as any, width: "35%" as any, height: "4%" as any, label: "Destination Option", tagPosition: "side" },
      { top: "19%" as any, left: "84%" as any, width: "10%" as any, height: "4%" as any, label: "Star/Un-Star Button", tagPosition: "side" },
    ],
  },
  {
    title: "Saved Locations",
    subtitle: "Quick access to your favorites",
    description: "This view demonstrates viewing and managing saved locations or bookmarks so you can instantly select frequent destinations like lecture halls or dorms.",
    image: require("../../assets/tutorial/saved-locations.png"),
    highlights: [
      { top: "19%" as any, left: "2%" as any, width: "35%" as any, height: "4%" as any, label: "Destination Option", tagPosition: "side" },
      { top: "19%" as any, left: "84%" as any, width: "10%" as any, height: "4%" as any, label: "Un-Star Location", tagPosition: "side" },
    ],
  },
  {
    title: "Settings & Customization",
    subtitle: "Where to find it & customize preferences",
    description: "Adjust navigation modes, select distance units, choose direction styles, and scale text.",
    image: require("../../assets/tutorial/settings.png"),
  },
  {
    title: "Directions",
    subtitle: "Tailored routes and step lists",
    description: "View upcoming step-by-step directions.",
    image: require("../../assets/tutorial/next-direction.png"),
    highlights: [
      { top: "5%" as any, left: "2%" as any, width: "94%" as any, height: "10%" as any, label: "Directions", tagPosition: "side" },
      { top: "93%" as any, left: "80%" as any, width: "12%" as any, height: "5%" as any, label: "Cancel Route", tagPosition: "bottom" },
    ],
  },
  {
    title: "Expanded Directions",
    subtitle: "Tailored routes and step lists",
    description: "Click on the directions to list all the directions in the route.",
    image: require("../../assets/tutorial/direction-list.png"),
  },
  {
    title: "Accessibility Mode",
    subtitle: "Routes avoiding stairs and non-accessible paths",
    description: "Navigate using a more accessibility friendly interface with routes that avoid stairs and non-accessible paths.",
    image: require("../../assets/tutorial/accessibility-navigation.png"),
    highlights: [
      { top: "89%" as any, left: "69%" as any, width: "15%" as any, height: "7%" as any, label: "Saved Destinations", tagPosition: "bottom" },
      { top: "89%" as any, left: "40%" as any, width: "20%" as any, height: "9%" as any, label: "Voice Search", tagPosition: "top" },
      { top: "89%" as any, left: "14%" as any, width: "20%" as any, height: "9%" as any, label: "Settings", tagPosition: "side" },
      { top: "6%" as any, left: "76%" as any, width: "20%" as any, height: "7%" as any, label: "Cancel Route", tagPosition: "top" },
    ],
  },
];

interface TutorialModalProps {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
}

export function TutorialModal({ visible, onClose, onDismiss }: TutorialModalProps) {
  const nativeDismiss = useModalDismissal(visible, onDismiss);
  const [currentPage, setCurrentPage] = useState(0);

  // Reset to page 0 every time the modal is opened
  useEffect(() => {
    if (visible) {
      setCurrentPage(0);
    }
  }, [visible]);

  const current = tutorialPages[currentPage];

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
      <View style={styles.modalOverlay}>
        <View style={styles.tutorialCard}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} accessible accessibilityRole="button" accessibilityLabel="Skip Tutorial">
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            <View style={styles.paginationDots}>
              {tutorialPages.map((_, index) => (
                <View
                  key={index}
                  style={[styles.dot, currentPage === index && styles.activeDot]}
                />
              ))}
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
  paginationDots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
  },
  activeDot: {
    backgroundColor: "#AC2B37",
    width: 20,
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