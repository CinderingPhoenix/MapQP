import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Keyboard, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Building, getSimilarityScore } from "../app/map-logic";
import { useSettings } from "../context/settings-context";
import { useDeviceAccessibility } from "../hooks/use-device-accessibility";

let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: (event: string, listener: (event: any) => void) => void = () => {};
try {
  const speechModule = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = speechModule.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = speechModule.useSpeechRecognitionEvent;
} catch {
  console.warn("expo-speech-recognition is not available in this environment.");
}

const RECENT_SEARCHES_STORAGE_KEY = "@wpi_map_recent_searches";

type BuildingPickerProps = {
  buildings: Building[];
  value: string;
  onChange: (buildingId: string) => void;
  onCancel: () => void;
  placeholder: string;
};

export default React.memo(function BuildingPicker({ buildings, value, onChange, onCancel, placeholder }: BuildingPickerProps) {
  const { fontSize } = useSettings();
  const { reduceMotionEnabled } = useDeviceAccessibility();
  const textBoxHeight = Math.max(48, 48 * fontSize);
  const selectedBuilding = buildings.find((building) => building.id === value);
  const [query, setQuery] = useState(selectedBuilding?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [isBuildingSelectorOpen, setIsBuildingSelectorOpen] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recentSearchIds, setRecentSearchIds] = useState<string[]>([]);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentBuildings = recentSearchIds.map((id) => buildings.find((building) => building.id === id)).filter((building): building is Building => building !== undefined);
  const isQueryEmpty = query.trim() === "";

  const saveRecentSearch = useCallback(async (buildingId: string) => {
    const updated = [buildingId, ...recentSearchIds.filter((id) => id !== buildingId)].slice(0, 5);
    setRecentSearchIds(updated);
    await AsyncStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
  }, [recentSearchIds]);

  const selectBuilding = useCallback((building: Building) => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    Keyboard.dismiss();
    onChange(building.id);
    setQuery(building.name);
    void saveRecentSearch(building.id);
    setIsOpen(false);
    setIsBuildingSelectorOpen(false);
    setIsInputFocused(false);
  }, [onChange, saveRecentSearch]);

  useSpeechRecognitionEvent("result", (event: any) => {
    const spokenText = event.results[0]?.transcript;
    if (!spokenText) return;
    setQuery(spokenText);
    setIsOpen(true);
    const cleanSpoken = spokenText.toLowerCase().trim();
    let matched = buildings.find((building) => building.name.toLowerCase().includes(cleanSpoken));
    if (!matched) {
      let bestMatch: Building | null = null;
      let highestSimilarity = 0;
      for (const building of buildings) {
        const similarity = getSimilarityScore(cleanSpoken, building.name);
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = building;
        }
      }
      if (highestSimilarity >= 0.45) matched = bestMatch ?? undefined;
    }
    if (matched) selectBuilding(matched);
  });
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  useSpeechRecognitionEvent("error", (event: any) => {
    console.error("Speech recognition error:", event.error);
    setIsListening(false);
  });

  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_STORAGE_KEY).then((valueFromStorage) => {
      if (valueFromStorage) {
        const parsed: unknown = JSON.parse(valueFromStorage);
        if (Array.isArray(parsed)) setRecentSearchIds(parsed.filter((id): id is string => typeof id === "string"));
      }
    }).catch((storageError) => console.error("Failed to load recent searches:", storageError));
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      if (isListening) ExpoSpeechRecognitionModule?.stop?.();
    };
  }, [isListening]);

  useEffect(() => {
    if (!value) setQuery("");
    else if (selectedBuilding) setQuery(selectedBuilding.name);
  }, [value, selectedBuilding]);

  const handleVoiceSearch = async () => {
    if (value) return;
    if (!ExpoSpeechRecognitionModule?.isRecognitionAvailable) {
      Alert.alert("Expo Go Limitation", "Voice search requires a custom development build and is disabled inside Expo Go.");
      return;
    }
    try {
      if (!(await ExpoSpeechRecognitionModule.isRecognitionAvailable())) {
        Alert.alert("Unavailable", "Speech recognition is not available or supported on this device.");
        return;
      }
      if (!(await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted) {
        Alert.alert("Permission required", "Microphone and speech recognition permissions are needed for voice search.");
        return;
      }
      if (isListening) {
        ExpoSpeechRecognitionModule.stop();
        setIsListening(false);
        return;
      }
      setQuery("");
      setIsOpen(false);
      setIsListening(true);
      ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, maxAlternatives: 1 });
    } catch (voiceError) {
      console.error("Failed to start speech recognition:", voiceError);
      setIsListening(false);
      Alert.alert("Error", "Could not start voice search on this device.");
    }
  };

  const clearRecentSearches = async () => {
    setRecentSearchIds([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  };
  const matchingBuildings = buildings.filter((building) => building.name.toLowerCase().includes(query.trim().toLowerCase()));

  return <View style={styles.container}>
    <View style={styles.inputWrapper}>
      {isListening ? <TouchableOpacity style={[styles.listeningActiveContainer, { height: textBoxHeight }]} onPress={() => { ExpoSpeechRecognitionModule?.stop?.(); setIsListening(false); }}><Ionicons name="mic" size={24 * fontSize} color="#1d5962" /><Text maxFontSizeMultiplier={1.5} style={[styles.listeningActiveText, { fontSize: 16 * fontSize, lineHeight: 20 * fontSize }]}>Listening...</Text></TouchableOpacity> : <>
        <TouchableOpacity style={[styles.micButton, (value !== "" || query !== "") && styles.micButtonWithClear, value !== "" && { opacity: 0.4 }]} disabled={!!value} onPress={() => void handleVoiceSearch()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="mic-outline" size={20} color="#666" /></TouchableOpacity>
        <TextInput maxFontSizeMultiplier={1.5} style={[styles.input, { height: textBoxHeight, fontSize: 16 * fontSize, lineHeight: 20 * fontSize }, styles.inputWithMic, (value !== "" || query !== "") && styles.inputWithClear, value !== "" && { backgroundColor: "#f9f9f9", color: "#333" }]} value={query} editable={!value} onChangeText={(text) => { setQuery(text); onChange(""); setIsOpen(text.trim() === "" ? recentBuildings.length > 0 : true); }} onFocus={() => { setIsInputFocused(true); if (!value) setIsOpen(query.trim() !== "" || recentBuildings.length > 0); }} onBlur={() => { blurTimeoutRef.current = setTimeout(() => { setIsOpen(false); setIsInputFocused(false); }, 150); }} onSubmitEditing={() => setIsOpen(false)} placeholder={placeholder} />
        {(value !== "" || query !== "") && <TouchableOpacity style={styles.clearButton} onPress={() => { setQuery(""); setIsOpen(false); onCancel(); Keyboard.dismiss(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text maxFontSizeMultiplier={1.5} style={[styles.cancelButtonText, { fontSize: 18 * fontSize }]}>✕</Text></TouchableOpacity>}
      </>}
    </View>

    {isInputFocused && !value && <TouchableOpacity style={styles.buildingSelectorButton} onPress={() => { Keyboard.dismiss(); setIsOpen(false); setIsBuildingSelectorOpen(true); }} activeOpacity={0.75}>
      <Ionicons name="list-outline" size={18} color="#1d5962" />
      <Text maxFontSizeMultiplier={1.5} style={[styles.buildingSelectorText, { fontSize: 15 * fontSize }]}>Choose a building</Text>
    </TouchableOpacity>}

    {isInputFocused && isOpen && !value && (isQueryEmpty ? recentBuildings.length > 0 && <View style={styles.dropdown}>
        <View style={styles.dropdownHeader}><Text maxFontSizeMultiplier={1.5} style={[styles.dropdownHeaderText, { fontSize: 12 * fontSize }]}>Recent Searches</Text><TouchableOpacity onPress={() => void clearRecentSearches()}><Text maxFontSizeMultiplier={1.5} style={[styles.clearRecentText, { fontSize: 12 * fontSize }]}>Clear</Text></TouchableOpacity></View>
        {recentBuildings.map((building) => <TouchableOpacity key={`recent-${building.id}`} style={styles.dropdownItem} onPress={() => selectBuilding(building)}><Text maxFontSizeMultiplier={1.6} style={[styles.dropdownItemText, { fontSize: 16 * fontSize }]}>{building.name}</Text></TouchableOpacity>)}
      </View> : <ScrollView style={[styles.dropdown, styles.searchDropdown]} nestedScrollEnabled keyboardShouldPersistTaps="always">
        {matchingBuildings.map((building) => <TouchableOpacity key={building.id} style={styles.dropdownItem} onPress={() => selectBuilding(building)}><Text maxFontSizeMultiplier={1.6} style={[styles.dropdownItemText, { fontSize: 16 * fontSize }]}>{building.name}</Text></TouchableOpacity>)}
      </ScrollView>)}

    <Modal visible={isBuildingSelectorOpen} animationType={reduceMotionEnabled ? "none" : "slide"} onRequestClose={() => setIsBuildingSelectorOpen(false)}>
      <View style={styles.selectorModal}>
        <View style={styles.selectorHeader}>
          <Text maxFontSizeMultiplier={1.6} style={[styles.selectorTitle, { fontSize: 24 * fontSize }]}>Choose a building</Text>
          <TouchableOpacity onPress={() => setIsBuildingSelectorOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text maxFontSizeMultiplier={1.5} style={styles.selectorClose}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.selectorList} keyboardShouldPersistTaps="always">
          {buildings.map((building) => <TouchableOpacity key={building.id} style={[styles.selectorItem, value === building.id && styles.selectorItemSelected]} onPress={() => selectBuilding(building)}>
            <Text maxFontSizeMultiplier={1.6} style={[styles.selectorItemText, { fontSize: 17 * fontSize }, value === building.id && styles.selectorItemTextSelected]}>{building.name}</Text>
            {value === building.id && <Ionicons name="checkmark" size={22} color="#1d5962" />}
          </TouchableOpacity>)}
        </ScrollView>
      </View>
    </Modal>
  </View>;
});

const styles = StyleSheet.create({
  container: { zIndex: 10, position: "relative" },
  inputWrapper: { position: "relative", justifyContent: "center" },
  input: { height: 48, borderColor: "#ccc", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#fff", fontSize: 16 },
  inputWithMic: { paddingRight: 40 },
  inputWithClear: { paddingRight: 40 },
  micButton: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 11 },
  micButtonWithClear: { right: 44 },
  clearButton: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 11 },
  cancelButtonText: { fontSize: 18, fontWeight: "bold", color: "#666" },
  dropdown: { backgroundColor: "#fff", borderColor: "#ccc", borderWidth: 1, borderRadius: 8, marginTop: 12, marginBottom: 8 },
  searchDropdown: { maxHeight: 280 },
  dropdownHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#f7f7f7", borderBottomWidth: 1, borderBottomColor: "#eee" },
  dropdownHeaderText: { fontSize: 12, fontWeight: "bold", color: "#666", textTransform: "uppercase" },
  listeningActiveContainer: { height: 48, flexDirection: "row", borderColor: "#1d5962", borderWidth: 2, borderRadius: 8, backgroundColor: "#e8f4f5", justifyContent: "center", alignItems: "center" },
  listeningActiveText: { fontSize: 16, fontWeight: "600", color: "#1d5962", marginLeft: 8 },
  buildingSelectorButton: { height: 42, marginTop: 8, borderWidth: 1, borderColor: "#b8d1d4", borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#f4fafb" },
  buildingSelectorText: { color: "#1d5962", fontSize: 15, fontWeight: "600" },
  clearRecentText: { fontSize: 12, color: "#d9534f", fontWeight: "600" },
  dropdownItem: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  dropdownItemText: { fontSize: 16, color: "#333" },
  selectorModal: { flex: 1, backgroundColor: "#fff", paddingTop: 56 },
  selectorHeader: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#e5e5e5" },
  selectorTitle: { flex: 1, flexShrink: 1, fontSize: 24, fontWeight: "700", color: "#1d5962", paddingRight: 12 },
  selectorClose: { fontSize: 22, fontWeight: "700", color: "#666" },
  selectorList: { padding: 16 },
  selectorItem: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, borderWidth: 1, borderColor: "#ddd", borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectorItemSelected: { borderColor: "#1d5962", backgroundColor: "#e8f4f5" },
  selectorItemText: { flex: 1, flexShrink: 1, fontSize: 17, color: "#333", paddingRight: 8 },
  selectorItemTextSelected: { color: "#1d5962", fontWeight: "700" },
});
