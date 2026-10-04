import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Building, getSimilarityScore } from "../app/map-logic";

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
  const selectedBuilding = buildings.find((building) => building.id === value);
  const [query, setQuery] = useState(selectedBuilding?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
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
    {isOpen && !value && <ScrollView style={styles.dropdown} nestedScrollEnabled keyboardShouldPersistTaps="always">
      {isQueryEmpty ? recentBuildings.length > 0 && <>
        <View style={styles.dropdownHeader}><Text maxFontSizeMultiplier={1.5} style={styles.dropdownHeaderText}>Recent Searches</Text><TouchableOpacity onPress={() => void clearRecentSearches()}><Text maxFontSizeMultiplier={1.5} style={styles.clearRecentText}>Clear</Text></TouchableOpacity></View>
        {recentBuildings.map((building) => <TouchableOpacity key={`recent-${building.id}`} style={styles.dropdownItem} onPress={() => selectBuilding(building)}><Text maxFontSizeMultiplier={1.6} style={styles.dropdownItemText}>{building.name}</Text></TouchableOpacity>)}
      </> : matchingBuildings.map((building) => <TouchableOpacity key={building.id} style={styles.dropdownItem} onPress={() => selectBuilding(building)}><Text maxFontSizeMultiplier={1.6} style={styles.dropdownItemText}>{building.name}</Text></TouchableOpacity>)}
    </ScrollView>}
    <View style={styles.inputWrapper}>
      {isListening ? <TouchableOpacity style={styles.listeningActiveContainer} onPress={() => { ExpoSpeechRecognitionModule?.stop?.(); setIsListening(false); }}><Ionicons name="mic" size={24} color="#1d5962" /><Text maxFontSizeMultiplier={1.5} style={styles.listeningActiveText}>Listening...</Text></TouchableOpacity> : <>
        <TouchableOpacity style={[styles.micButton, value !== "" && { opacity: 0.4 }]} disabled={!!value} onPress={() => void handleVoiceSearch()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="mic-outline" size={20} color="#666" /></TouchableOpacity>
        <TextInput maxFontSizeMultiplier={1.5} style={[styles.input, styles.inputWithMic, (value !== "" || query !== "") && styles.inputWithClear, value !== "" && { backgroundColor: "#f9f9f9", color: "#333" }]} value={query} editable={!value} onChangeText={(text) => { setQuery(text); onChange(""); setIsOpen(text.trim() === "" ? recentBuildings.length > 0 : true); }} onFocus={() => { if (!value) setIsOpen(query.trim() !== "" || recentBuildings.length > 0); }} onBlur={() => { blurTimeoutRef.current = setTimeout(() => setIsOpen(false), 150); }} onSubmitEditing={() => setIsOpen(false)} placeholder={placeholder} />
        {(value !== "" || query !== "") && <TouchableOpacity style={styles.clearButton} onPress={() => { setQuery(""); setIsOpen(false); onCancel(); Keyboard.dismiss(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text maxFontSizeMultiplier={1.5} style={styles.cancelButtonText}>✕</Text></TouchableOpacity>}
      </>}
    </View>
  </View>;
});

const styles = StyleSheet.create({
  container: { zIndex: 10, position: "relative" },
  inputWrapper: { position: "relative", justifyContent: "center" },
  input: { height: 48, borderColor: "#ccc", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#fff", fontSize: 16 },
  inputWithMic: { paddingLeft: 40 },
  inputWithClear: { paddingRight: 40 },
  micButton: { position: "absolute", left: 12, top: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 11 },
  clearButton: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 11 },
  cancelButtonText: { fontSize: 18, fontWeight: "bold", color: "#666" },
  dropdown: { maxHeight: 280, backgroundColor: "#fff", borderColor: "#ccc", borderWidth: 1, borderRadius: 8, marginBottom: 8 },
  dropdownHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#f7f7f7", borderBottomWidth: 1, borderBottomColor: "#eee" },
  dropdownHeaderText: { fontSize: 12, fontWeight: "bold", color: "#666", textTransform: "uppercase" },
  listeningActiveContainer: { height: 48, flexDirection: "row", borderColor: "#1d5962", borderWidth: 2, borderRadius: 8, backgroundColor: "#e8f4f5", justifyContent: "center", alignItems: "center" },
  listeningActiveText: { fontSize: 16, fontWeight: "600", color: "#1d5962", marginLeft: 8 },
  clearRecentText: { fontSize: 12, color: "#d9534f", fontWeight: "600" },
  dropdownItem: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  dropdownItemText: { fontSize: 16, color: "#333" },
});
