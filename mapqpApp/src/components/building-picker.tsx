
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Modal,
  useWindowDimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Building, getSimilarityScore } from "../utils/map-logic";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";

let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: (
  event: string,
  listener: (event: any) => void
) => void = () => {};

try {
  const speechModule = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = speechModule.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = speechModule.useSpeechRecognitionEvent;
} catch {
  console.warn(
    "expo-speech-recognition is not available in this environment."
  );
}

const RECENT_SEARCHES_STORAGE_KEY = "wpi_map_recent_searches";
const SAVED_LOCATIONS_STORAGE_KEY = "wpi_map_saved_locations";

type BuildingPickerProps = {
  buildings: Building[];
  value: string;
  onChange: (buildingId: string) => void;
  onCancel: () => void;
  placeholder: string;
  accessibilityControls?: boolean;
  onOpenSettings?: () => void;
};

export default React.memo(function BuildingPicker({
  buildings,
  value,
  onChange,
  onCancel,
  placeholder,
  accessibilityControls = false,
  onOpenSettings,
}: BuildingPickerProps) {
  const { fontSize, deviceAccessibility } = useSettings();
  const {
    reduceMotionEnabled,
    boldTextEnabled,
    darkerSystemColorsEnabled,
    highTextContrastEnabled,
  } = useAccessibilityPreferences();
  const increasedContrast = darkerSystemColorsEnabled || highTextContrastEnabled;
  // iOS Bold Text can render wider glyphs than React Native measures for wrapping.
  // Break the known affected labels explicitly only when device Bold Text is on.
  const deviceBoldTextEnabled = deviceAccessibility.boldTextEnabled;
  const accessibleText = {
    fontWeight: boldTextEnabled ? ("700" as const) : undefined,
    color: increasedContrast ? "#111" : undefined,
  };
  const accessibleAccentText = {
    fontWeight: boldTextEnabled ? ("700" as const) : undefined,
    color: increasedContrast ? "#10434b" : undefined,
  };
  const accessibleLightText = {
    fontWeight: boldTextEnabled ? ("800" as const) : undefined,
  };
  const accessibleBorder = {
    borderColor: increasedContrast ? "#444" : undefined,
  };

  const { fontScale: systemFontScale } = useWindowDimensions();
  // A single-line destination field stays aligned with its action icons.
  // Use a responsive height, but never allow the selected name to wrap under the border.
  const textBoxHeight = Math.max(48, 20 * fontSize * Math.min(systemFontScale, 2.5) + 24);
  const selectedBuilding = buildings.find(
    (building) => building.id === value
  );

  const [query, setQuery] = useState(selectedBuilding?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [isBuildingSelectorOpen, setIsBuildingSelectorOpen] =
    useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [recentSearchIds, setRecentSearchIds] = useState<string[]>([]);
  const [savedBuildingIds, setSavedBuildingIds] = useState<string[]>([]);

  const blurTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const recentBuildings = recentSearchIds
    .map((id) => buildings.find((building) => building.id === id))
    .filter(
      (building): building is Building => building !== undefined
    );

  const savedBuildings = savedBuildingIds
    .map((id) => buildings.find((building) => building.id === id))
    .filter(
      (building): building is Building => building !== undefined
    );

  const isQueryEmpty = query.trim() === "";

  // Persistence helpers
  const saveRecentSearch = useCallback(
    async (buildingId: string) => {
      const updated = [
        buildingId,
        ...recentSearchIds.filter((id) => id !== buildingId),
      ].slice(0, 5);

      setRecentSearchIds(updated);

      await SecureStore.setItemAsync(
        RECENT_SEARCHES_STORAGE_KEY,
        JSON.stringify(updated)
      );
    },
    [recentSearchIds]
  );

  const toggleSaveBuilding = useCallback(
    async (buildingId: string) => {
      setSavedBuildingIds((prev) => {
        const isSaved = prev.includes(buildingId);
        const updated = isSaved
          ? prev.filter((id) => id !== buildingId)
          : [...prev, buildingId];

        void SecureStore.setItemAsync(
          SAVED_LOCATIONS_STORAGE_KEY,
          JSON.stringify(updated)
        );

        return updated;
      });
    },
    []
  );

  const selectBuilding = useCallback(
    (building: Building) => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }

      Keyboard.dismiss();
      onChange(building.id);
      setQuery(building.name);
      void saveRecentSearch(building.id);
      setIsOpen(false);
      setShowSavedOnly(false);
      setIsBuildingSelectorOpen(false);
      setIsInputFocused(false);
    },
    [onChange, saveRecentSearch]
  );

  // Speech recognition
  useSpeechRecognitionEvent("result", (event: any) => {
    const spokenText = event.results[0]?.transcript;
    if (!spokenText) return;

    setQuery(spokenText);
    setIsOpen(true);

    const cleanSpoken = spokenText.toLowerCase().trim();

    let matched = buildings.find((building) =>
      building.name.toLowerCase().includes(cleanSpoken)
    );

    if (!matched) {
      let bestMatch: Building | null = null;
      let highestSimilarity = 0;

      for (const building of buildings) {
        const similarity = getSimilarityScore(
          cleanSpoken,
          building.name
        );

        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = building;
        }
      }

      if (highestSimilarity >= 0.45) {
        matched = bestMatch ?? undefined;
      }
    }

    if (matched) {
      selectBuilding(matched);
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent("error", (event: any) => {
    console.error("Speech recognition error:", event.error);
    setIsListening(false);
  });

  // Load saved and recent locations
  useEffect(() => {
    SecureStore.getItemAsync(RECENT_SEARCHES_STORAGE_KEY)
      .then((val) => {
        if (val) {
          const parsed: unknown = JSON.parse(val);
          if (Array.isArray(parsed)) {
            setRecentSearchIds(
              parsed.filter(
                (id): id is string => typeof id === "string"
              )
            );
          }
        }
      })
      .catch((err) =>
        console.error("Failed to load recent searches:", err)
      );

    SecureStore.getItemAsync(SAVED_LOCATIONS_STORAGE_KEY)
      .then((val) => {
        if (val) {
          const parsed: unknown = JSON.parse(val);
          if (Array.isArray(parsed)) {
            setSavedBuildingIds(
              parsed.filter(
                (id): id is string => typeof id === "string"
              )
            );
          }
        }
      })
      .catch((err) =>
        console.error("Failed to load saved locations:", err)
      );
  }, []);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
      ExpoSpeechRecognitionModule?.stop?.();
    },
    []
  );

  useEffect(() => {
    if (!value) {
      setQuery("");
    } else if (selectedBuilding) {
      setQuery(selectedBuilding.name);
    }
  }, [value, selectedBuilding]);

  const handleVoiceSearch = async () => {
    if (value && !accessibilityControls) return;

    if (!ExpoSpeechRecognitionModule?.isRecognitionAvailable) {
      Alert.alert(
        "Expo Go Limitation",
        "Voice search requires a custom development build and is disabled inside Expo Go."
      );
      return;
    }

    try {
      if (
        !(await ExpoSpeechRecognitionModule.isRecognitionAvailable())
      ) {
        Alert.alert(
          "Unavailable",
          "Speech recognition is not available or supported on this device."
        );
        return;
      }

      if (
        !(await ExpoSpeechRecognitionModule.requestPermissionsAsync())
          .granted
      ) {
        Alert.alert(
          "Permission required",
          "Microphone and speech recognition permissions are needed for voice search."
        );
        return;
      }

      if (isListening) {
        ExpoSpeechRecognitionModule.stop();
        setIsListening(false);
        return;
      }

      if (value) onCancel();

      setQuery("");
      setIsOpen(false);
      setIsListening(true);

      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        maxAlternatives: 1,
      });
    } catch (voiceError) {
      console.error(
        "Failed to start speech recognition:",
        voiceError
      );
      setIsListening(false);
      Alert.alert(
        "Error",
        "Could not start voice search on this device."
      );
    }
  };

  const clearRecentSearches = async () => {
    setRecentSearchIds([]);
    await SecureStore.deleteItemAsync(RECENT_SEARCHES_STORAGE_KEY);
  };

  const matchingBuildings = buildings.filter((building) =>
    building.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const renderBuildingRow = (
    building: Building,
    isSelected = false
  ) => {
    const isSaved = savedBuildingIds.includes(building.id);

    return (
      <View
        key={building.id}
        style={[
          styles.buildingRow,
          isSelected && styles.buildingRowSelected,
          isSelected && increasedContrast && { borderLeftWidth: 4, borderLeftColor: "#10434b" },
          { borderBottomColor: increasedContrast ? "#666" : undefined },
        ]}
      >
        <TouchableOpacity
          style={styles.buildingRowMain}
          onPress={() => selectBuilding(building)}
          activeOpacity={0.7}
        >
          <Text key={`picker-text-1-${fontSize}-${systemFontScale}`}
            maxFontSizeMultiplier={2.5}
            style={[
              styles.buildingRowText,
              { fontSize: 16 * fontSize },
              isSelected && styles.buildingRowTextSelected,
              accessibleText,
            ]}
          >
            {building.name}
          </Text>

          {isSelected && (
            <Ionicons
              name="checkmark"
              size={20}
              color="#1d5962"
              style={{ marginRight: 6 }}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.starIconButton, increasedContrast && { borderWidth: 1, borderColor: "#555", borderRadius: 8 }]}
          onPress={() => void toggleSaveBuilding(building.id)}
          hitSlop={{
            top: 10,
            bottom: 10,
            left: 10,
            right: 10,
          }}
          accessibilityRole="button"
          accessibilityLabel={
            isSaved
              ? `Remove ${building.name} from saved locations`
              : `Save ${building.name}`
          }
        >
          <Ionicons
            name={isSaved ? "star" : "star-outline"}
            size={22}
            color={increasedContrast ? (isSaved ? "#805500" : "#333") : (isSaved ? "#f1c40f" : "#888")}
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View
      style={
        accessibilityControls
          ? styles.accessibilityContainer
          : styles.container
      }
    >
      {accessibilityControls && (
        <View style={styles.accessibilityControls}>
          <TouchableOpacity
            style={styles.secondaryControl}
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            activeOpacity={0.75}
          >
            <View style={[styles.secondaryControlCircle, increasedContrast && { borderColor: "#444", borderWidth: 2 }]}>
              <Ionicons
                name="settings-outline"
                size={27}
                color="#333"
              />
            </View>

            <Text key={`picker-text-2-${fontSize}-${systemFontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.accessibilityControlLabel,
                { fontSize: 13 * fontSize },
                accessibleText,
              ]}
            >
              Settings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.voiceControl,
              isListening && styles.voiceControlListening,
            ]}
            onPress={() => void handleVoiceSearch()}
            accessibilityRole="button"
            accessibilityLabel={
              isListening
                ? "Stop voice destination search"
                : "Search destinations by voice"
            }
            activeOpacity={0.8}
          >
            <Ionicons
              name={isListening ? "mic" : "mic-outline"}
              size={36}
              color="#fff"
            />

            <Text key={`picker-text-3-${fontSize}-${systemFontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.voiceControlLabel,
                { fontSize: 14 * fontSize },
                accessibleLightText,
              ]}
            >
              {isListening ? "Listening" : "Speak"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryControl}
            onPress={() => {
              setShowSavedOnly(true);
              setIsBuildingSelectorOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="View saved locations"
            activeOpacity={0.75}
          >
            <View style={[styles.secondaryControlCircle, increasedContrast && { borderColor: "#444", borderWidth: 2 }]}>
              <Ionicons name="star" size={27} color={increasedContrast ? "#805500" : "#f1c40f"} />
            </View>

            <Text key={`picker-text-4-${fontSize}-${systemFontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.accessibilityControlLabel,
                { fontSize: 13 * fontSize },
                accessibleText,
              ]}
            >
              Saved
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!accessibilityControls && (
        <View style={styles.inputWrapper}>
          {isListening ? (
            <TouchableOpacity
              style={[
                styles.listeningActiveContainer,
                { height: textBoxHeight },
              ]}
              onPress={() => {
                ExpoSpeechRecognitionModule?.stop?.();
                setIsListening(false);
              }}
            >
              <Ionicons
                name="mic"
                size={24 * fontSize}
                color="#1d5962"
              />

              <Text key={`picker-text-5-${fontSize}-${systemFontScale}`}
                maxFontSizeMultiplier={2.5}
                style={[
                  styles.listeningActiveText,
                  {
                    fontSize: 16 * fontSize,
                    lineHeight: 20 * fontSize,
                  },
                  accessibleAccentText,
                ]}
              >
                Listening...
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                key={`picker-input-${fontSize}-${systemFontScale}`}
                maxFontSizeMultiplier={2.5}
                multiline={false}
                numberOfLines={1}
                style={[
                  styles.input,
                  {
                    height: textBoxHeight,
                    fontSize: 16 * fontSize,
                  },
                  styles.inputPadded,
                  value !== "" && {
                    backgroundColor: "#f9f9f9",
                    color: "#333",
                  },
                  accessibleText,
                  accessibleBorder,
                ]}
                value={query}
                editable={!value}
                onChangeText={(text) => {
                  setQuery(text);
                  onChange("");
                  setShowSavedOnly(false);
                  setIsOpen(
                    text.trim() === ""
                      ? recentBuildings.length > 0
                      : true
                  );
                }}
                onFocus={() => {
                  setIsInputFocused(true);
                  if (!value) {
                    setIsOpen(
                      query.trim() !== "" ||
                        recentBuildings.length > 0 ||
                        showSavedOnly
                    );
                  }
                }}
                onBlur={() => {
                  blurTimeoutRef.current = setTimeout(() => {
                    setIsOpen(false);
                    setIsInputFocused(false);
                  }, 150);
                }}
                onSubmitEditing={() => setIsOpen(false)}
                placeholder={placeholder}
              />

              <View style={styles.inputRightActions}>
                {/* Saved locations */}
                <TouchableOpacity
                  style={styles.actionIconButton}
                  onPress={() => {
                    if (blurTimeoutRef.current) {
                      clearTimeout(blurTimeoutRef.current);
                    }

                    const nextSavedState = !showSavedOnly;
                    setShowSavedOnly(nextSavedState);
                    setIsInputFocused(true);
                    setIsOpen(true);
                  }}
                  hitSlop={{
                    top: 10,
                    bottom: 10,
                    left: 6,
                    right: 6,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Saved Locations"
                >
                  <Ionicons
                    name={
                      showSavedOnly ? "star" : "star-outline"
                    }
                    size={20}
                    color={
                      showSavedOnly ? "#f1c40f" : "#666"
                    }
                  />
                </TouchableOpacity>

                {/* Voice search */}
                <TouchableOpacity
                  style={[
                    styles.actionIconButton,
                    value !== "" && { opacity: 0.4 },
                  ]}
                  disabled={!!value}
                  onPress={() => void handleVoiceSearch()}
                  hitSlop={{
                    top: 10,
                    bottom: 10,
                    left: 6,
                    right: 6,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Voice Search"
                >
                  <Ionicons
                    name="mic-outline"
                    size={20}
                    color="#666"
                  />
                </TouchableOpacity>

                {/* Clear input */}
                {(value !== "" || query !== "") && (
                  <TouchableOpacity
                    style={styles.actionIconButton}
                    accessibilityRole="button"
                    accessibilityLabel="Clear destination"
                    onPress={() => {
                      setQuery("");
                      setIsOpen(false);
                      setShowSavedOnly(false);
                      onCancel();
                      Keyboard.dismiss();
                    }}
                    hitSlop={{
                      top: 10,
                      bottom: 10,
                      left: 6,
                      right: 6,
                    }}
                  >
                    <Text key={`picker-text-6-${fontSize}-${systemFontScale}`}
                      maxFontSizeMultiplier={2.5}
                      style={[
                        styles.cancelButtonText,
                        { fontSize: 18 * fontSize },
                        accessibleText,
                      ]}
                    >
                      ✕
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
      )}

      {isInputFocused && !value && (
        <TouchableOpacity
          style={[styles.buildingSelectorButton, increasedContrast && { borderColor: "#444", borderWidth: 2 }]}
          onPress={() => {
            Keyboard.dismiss();
            setIsOpen(false);
            setIsBuildingSelectorOpen(true);
          }}
          activeOpacity={0.75}
        >
          <Ionicons
            name="list-outline"
            size={18}
            color="#1d5962"
          />

          <Text key={`picker-text-7-${fontSize}-${systemFontScale}`}
            maxFontSizeMultiplier={2.5}
            style={[
              styles.buildingSelectorText,
              { fontSize: 15 * fontSize },
              accessibleAccentText,
            ]}
          >
            {deviceBoldTextEnabled ? "Choose a\nbuilding" : "Choose a building"}
          </Text>
        </TouchableOpacity>
      )}

      {isInputFocused && isOpen && !value && (
        <ScrollView
          style={[styles.dropdown, styles.searchDropdown, accessibleBorder]}
          nestedScrollEnabled
          keyboardShouldPersistTaps="always"
        >
          {showSavedOnly ? (
            <>
              <View style={styles.dropdownHeader}>
                <Text key={`picker-text-8-${fontSize}-${systemFontScale}`}
                  maxFontSizeMultiplier={2.5}
                  style={[
                    styles.dropdownHeaderText,
                    { fontSize: 12 * fontSize },
                    accessibleText,
                  ]}
                >
                  Saved Locations
                </Text>
              </View>

              {savedBuildings.length > 0 ? (
                savedBuildings.map((building) =>
                  renderBuildingRow(
                    building,
                    value === building.id
                  )
                )
              ) : (
                <View style={styles.emptyState}>
                  <Text key={`picker-text-9-${fontSize}-${systemFontScale}`}
                    maxFontSizeMultiplier={2.5}
                    style={[
                      styles.emptyStateText,
                      { fontSize: 14 * fontSize },
                      accessibleText,
                    ]}
                  >
                    No saved locations yet.
                  </Text>
                </View>
              )}
            </>
          ) : isQueryEmpty ? (
            recentBuildings.length > 0 && (
              <View>
                <View style={styles.dropdownHeader}>
                  <Text key={`picker-text-10-${fontSize}-${systemFontScale}`}
                    maxFontSizeMultiplier={2.5}
                    style={[
                      styles.dropdownHeaderText,
                      { fontSize: 12 * fontSize },
                    accessibleText,
                    ]}
                  >
                    {deviceBoldTextEnabled ? "Recent\nSearches" : "Recent Searches"}
                  </Text>

                  <TouchableOpacity
                    style={styles.clearRecentButton}
                    accessibilityRole="button"
                    accessibilityLabel="Clear recent searches"
                    onPress={() =>
                      void clearRecentSearches()
                    }
                  >
                    <Text key={`picker-text-11-${fontSize}-${systemFontScale}`}
                      maxFontSizeMultiplier={2.5}
                      style={[
                        styles.clearRecentText,
                        { fontSize: 12 * fontSize },
                        accessibleText,
                      ]}
                    >
                      Clear
                    </Text>
                  </TouchableOpacity>
                </View>

                {recentBuildings.map((building) =>
                  renderBuildingRow(
                    building,
                    value === building.id
                  )
                )}
              </View>
            )
          ) : (
            matchingBuildings.map((building) =>
              renderBuildingRow(
                building,
                value === building.id
              )
            )
          )}
        </ScrollView>
      )}

      {/* Building selection modal */}
      <Modal
        visible={isBuildingSelectorOpen}
        animationType={
          reduceMotionEnabled ? "none" : "slide"
        }
        onRequestClose={() =>
          setIsBuildingSelectorOpen(false)
        }
      >
        <View style={styles.selectorModal}>
          <View style={styles.selectorHeader}>
            <Text key={`picker-text-12-${fontSize}-${systemFontScale}`}
              maxFontSizeMultiplier={2.5}
              style={[
                styles.selectorTitle,
                { fontSize: 24 * fontSize },
                accessibleAccentText,
              ]}
            >
              {showSavedOnly
                ? "Saved Locations"
                : "Choose a building"}
            </Text>

            <TouchableOpacity
              style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
              accessibilityRole="button"
              accessibilityLabel="Close building selector"
              onPress={() => {
                setIsBuildingSelectorOpen(false);
                setShowSavedOnly(false);
              }}
              hitSlop={{
                top: 10,
                bottom: 10,
                left: 10,
                right: 10,
              }}
            >
              <Text key={`picker-text-13-${fontSize}-${systemFontScale}`}
                maxFontSizeMultiplier={2.5}
                style={[styles.selectorClose, accessibleText]}
              >
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          {/* Modal tabs */}
          <View style={styles.modalTabs}>
            <TouchableOpacity
              style={[
                styles.modalTab,
                !showSavedOnly && styles.modalTabActive,
                increasedContrast && !showSavedOnly && { borderBottomWidth: 4, borderBottomColor: "#10434b" },
              ]}
              onPress={() => setShowSavedOnly(false)}
            >
              <Text key={`picker-text-14-${fontSize}-${systemFontScale}`}
                maxFontSizeMultiplier={2.5}
                style={[
                  styles.modalTabText,
                  !showSavedOnly &&
                    styles.modalTabTextActive,
                  { fontSize: 15 * fontSize },
                  accessibleText,
                ]}
              >
                {deviceBoldTextEnabled ? "All\nLocations" : "All Locations"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalTab,
                showSavedOnly && styles.modalTabActive,
                increasedContrast && showSavedOnly && { borderBottomWidth: 4, borderBottomColor: "#10434b" },
              ]}
              onPress={() => setShowSavedOnly(true)}
            >
              <Ionicons
                name="star"
                size={16}
                color={
                  showSavedOnly ? "#1d5962" : "#666"
                }
                style={{ marginRight: 6 }}
              />

              <Text key={`picker-text-15-${fontSize}-${systemFontScale}`}
                maxFontSizeMultiplier={2.5}
                style={[
                  styles.modalTabText,
                  showSavedOnly &&
                    styles.modalTabTextActive,
                  { fontSize: 15 * fontSize },
                  accessibleText,
                ]}
              >
                Saved ({savedBuildings.length})
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.selectorList}
            keyboardShouldPersistTaps="always"
          >
            {(showSavedOnly
              ? savedBuildings
              : buildings
            ).map((building) =>
              renderBuildingRow(
                building,
                value === building.id
              )
            )}

            {showSavedOnly &&
              savedBuildings.length === 0 && (
                <View style={styles.emptyState}>
                  <Text key={`picker-text-16-${fontSize}-${systemFontScale}`}
                    maxFontSizeMultiplier={2.5}
                    style={[
                      styles.emptyStateText,
                      { fontSize: 15 * fontSize },
                      accessibleText,
                    ]}
                  >
                    No saved locations found.
                  </Text>
                </View>
              )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
    position: "relative",
  },
  accessibilityContainer: {
    zIndex: 10,
    width: "100%",
  },
  accessibilityControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  secondaryControl: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 82,
  },
  secondaryControlCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#f1f3f4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d9dddf",
  },
  accessibilityControlLabel: {
    width: "100%",
    maxWidth: "100%",
    textAlign: "center",
    color: "#333",
    fontWeight: "600",
    marginTop: 4,
  },
  voiceControl: {
    width: 82,
    minHeight: 82,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 41,
    backgroundColor: "#D00000",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
  },
  voiceControlListening: {
    backgroundColor: "#801f29",
  },
  voiceControlLabel: {
    width: "100%",
    maxWidth: "100%",
    textAlign: "center",
    color: "#fff",
    fontWeight: "700",
    marginTop: 1,
  },
  inputWrapper: {
    position: "relative",
    justifyContent: "center",
  },
  input: {
    height: 48,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  inputPadded: {
    paddingRight: 132,
  },
  inputRightActions: {
    position: "absolute",
    right: 8,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  actionIconButton: {
    minWidth: 44,
    minHeight: 48,
    paddingHorizontal: 6,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#666",
  },
  dropdown: {
    backgroundColor: "#fff",
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  searchDropdown: {
    maxHeight: 340,
  },
  dropdownHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 4,
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f7f7f7",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  dropdownHeaderText: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
    fontSize: 12,
    fontWeight: "bold",
    color: "#666",
    textTransform: "uppercase",
  },
  listeningActiveContainer: {
    height: 48,
    flexDirection: "row",
    borderColor: "#1d5962",
    borderWidth: 2,
    borderRadius: 8,
    backgroundColor: "#e8f4f5",
    justifyContent: "center",
    alignItems: "center",
  },
  listeningActiveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1d5962",
    marginLeft: 8,
  },
  buildingSelectorButton: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#b8d1d4",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f4fafb",
  },
  buildingSelectorText: {
    // Shrink only when needed, reserving the icon, gap and button padding.
    // Without flexGrow, short labels and the icon remain centered together.
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
    textAlign: "center",
    color: "#1d5962",
    fontSize: 15,
    fontWeight: "600",
  },
  clearRecentButton: {
    minHeight: 48,
    minWidth: 48,
    maxWidth: "100%",
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  clearRecentText: {
    maxWidth: "100%",
    textAlign: "center",
    fontSize: 12,
    color: "#d9534f",
    fontWeight: "600",
  },
  buildingRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  buildingRowSelected: {
    backgroundColor: "#e8f4f5",
  },
  buildingRowMain: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  buildingRowText: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  buildingRowTextSelected: {
    color: "#1d5962",
    fontWeight: "700",
  },
  starIconButton: {
    minWidth: 48,
    minHeight: 48,
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    maxWidth: "100%",
    textAlign: "center",
    color: "#777",
    fontStyle: "italic",
  },
  selectorModal: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 56,
  },
  selectorHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  selectorTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: 24,
    fontWeight: "700",
    color: "#1d5962",
    paddingRight: 12,
  },
  selectorClose: {
    fontSize: 22,
    fontWeight: "700",
    color: "#666",
  },
  modalTabs: {
    flexDirection: "row",
    // Stretch both tabs to the taller label so their bottom borders align.
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    backgroundColor: "#f9f9f9",
  },
  modalTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  modalTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#1d5962",
    backgroundColor: "#fff",
  },
  modalTabText: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
    textAlign: "center",
    color: "#666",
    fontWeight: "600",
  },
  modalTabTextActive: {
    color: "#1d5962",
    fontWeight: "700",
  },
  selectorList: {
    padding: 16,
  },
});
