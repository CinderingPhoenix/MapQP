import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { router } from "expo-router";
import { fetch as expoFetch } from "expo/fetch";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import buildingData from "../data/wpi-buildings.json";

const SPEECH_SERVER = "http://130.215.172.161:8000";

type Building = {
  name: string;
};

export default function LandingPage() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [recordingComplete, setRecordingComplete] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  useEffect(() => {
    requestMicrophonePermission();
  }, []);

  const requestMicrophonePermission = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();

    if (status.granted) {
      setPermissionGranted(true);

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
    } else {
      Alert.alert(
        "Microphone Permission Required",
        "MapQP needs microphone access to use voice commands."
      );
    }
  };

  /*
   * Normalize speech so that small differences do not matter.
   *
   * Examples:
   *
   * "Atwater Kent Laboratories"
   * "At Water Kent Laboratories"
   * "ATWATER KENT LABORATORIES"
   *
   * all become:
   *
   * "atwaterkentlaboratories"
   */
  const normalizeSpeech = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  };

  /*
   * Standard Levenshtein distance.
   *
   * This tells us how many character changes are needed
   * to turn one string into another.
   */
  const levenshteinDistance = (
    first: string,
    second: string
  ) => {
    const rows = first.length + 1;
    const columns = second.length + 1;

    const matrix: number[][] = Array.from(
      { length: rows },
      () => Array(columns).fill(0)
    );

    for (let i = 0; i < rows; i++) {
      matrix[i][0] = i;
    }

    for (let j = 0; j < columns; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < columns; j++) {
        const cost =
          first[i - 1] === second[j - 1] ? 0 : 1;

        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[rows - 1][columns - 1];
  };

  /*
   * Compare a building candidate against the spoken command.
   *
   * This handles cases where the building name is only part
   * of a longer command such as:
   *
   * "take me to at water kent laboratories"
   *
   * instead of requiring the entire sentence to match.
   */
  const getFuzzyMatchScore = (
    spokenText: string,
    candidate: string
  ) => {
    const normalizedSpoken = normalizeSpeech(spokenText);
    const normalizedCandidate = normalizeSpeech(candidate);

    if (!normalizedSpoken || !normalizedCandidate) {
      return 0;
    }

    // Exact normalized match anywhere in the command.
    if (normalizedSpoken.includes(normalizedCandidate)) {
      return 1;
    }

    /*
     * Check substrings around the length of the building name.
     *
     * This lets:
     *
     * "caveinhall"
     *
     * be compared with:
     *
     * "kavenhall"
     */
    const candidateLength = normalizedCandidate.length;

    const minimumLength = Math.max(
      1,
      candidateLength - 3
    );

    const maximumLength = Math.min(
      normalizedSpoken.length,
      candidateLength + 3
    );

    let bestDistance = Infinity;

    for (
      let length = minimumLength;
      length <= maximumLength;
      length++
    ) {
      for (
        let start = 0;
        start + length <= normalizedSpoken.length;
        start++
      ) {
        const section = normalizedSpoken.substring(
          start,
          start + length
        );

        const distance = levenshteinDistance(
          section,
          normalizedCandidate
        );

        if (distance < bestDistance) {
          bestDistance = distance;
        }
      }
    }

    if (bestDistance === Infinity) {
      return 0;
    }

    /*
     * Convert edit distance into a score from 0 to 1.
     */
    const score =
      1 -
      bestDistance /
        Math.max(
          normalizedCandidate.length,
          1
        );

    return Math.max(0, score);
  };

  /*
   * Known speech variations.
   *
   * These are useful for names that Whisper can consistently
   * interpret as completely different words.
   */
  const buildingAliases: {
    [key: string]: string;
  } = {
    // Morgan Hall
    morgan: "Morgan Hall",
    "morgan hall": "Morgan Hall",

    // Unity Hall
    unity: "Unity Hall",
    "unity hall": "Unity Hall",

    // Alden Memorial
    alden: "Alden Memorial",
    "alden memorial": "Alden Memorial",

    // Boynton Hall
    boynton: "Boynton Hall",
    "boynton hall": "Boynton Hall",

    // Daniels Hall
    daniels: "Daniels Hall",
    "daniels hall": "Daniels Hall",

    // Fuller Laboratories
    fuller: "Fuller Laboratories",
    "fuller laboratories": "Fuller Laboratories",
    "fuller labs": "Fuller Laboratories",

    // Goddard Hall
    goddard: "Goddard Hall",
    "goddard hall": "Goddard Hall",

    // Gordon Library
    gordon: "Gordon Library",
    "gordon library": "Gordon Library",

    // Higgins Laboratories
    higgins: "Higgins Laboratories",
    "higgins laboratories": "Higgins Laboratories",
    "higgins labs": "Higgins Laboratories",

    // Innovation Studios
    innovation: "Innovation Studios",
    "innovation studios": "Innovation Studios",

    // Kaven Hall
    kaven: "Kaven Hall",
    "kaven hall": "Kaven Hall",
    "cave in": "Kaven Hall",
    "cave in hall": "Kaven Hall",
    "cave and": "Kaven Hall",
    "cave and hall": "Kaven Hall",
    "cavin hall": "Kaven Hall",
    "caven hall": "Kaven Hall",

    // Olin Hall
    olin: "Olin Hall",
    "olin hall": "Olin Hall",

    // Project Center
    project: "Project Center",
    "project center": "Project Center",

    // Sandford Riley Hall
    sandford: "Sandford Riley Hall",
    sanford: "Sandford Riley Hall",
    "sandford riley": "Sandford Riley Hall",
    "sanford riley": "Sandford Riley Hall",

    // Stratton Hall
    stratton: "Stratton Hall",
    "stratton hall": "Stratton Hall",

    // Washburn Shops
    washburn: "Washburn Shops",
    "washburn shops": "Washburn Shops",

    // Atwater Kent Laboratories
    atwater: "Atwater Kent Laboratories",
    "at water": "Atwater Kent Laboratories",
    "atwater kent": "Atwater Kent Laboratories",
    "at water kent": "Atwater Kent Laboratories",
    "atwater kent laboratories":
      "Atwater Kent Laboratories",
    "at water kent laboratories":
      "Atwater Kent Laboratories",
    "atwater kent labs":
      "Atwater Kent Laboratories",
    "at water kent labs":
      "Atwater Kent Laboratories",
  };

  /*
   * Resolve the building from whatever Whisper heard.
   */
  const findBuildingFromSpeech = (
    spokenText: string
  ): string | null => {
    const normalizedText = normalizeSpeech(spokenText);

    if (!normalizedText) {
      return null;
    }

    const buildings = (buildingData as Building[]).map(
      (building) => building.name
    );

    /*
     * First: exact normalized building-name matching.
     *
     * This handles:
     *
     * Atwater Kent Laboratories
     * At Water Kent Laboratories
     *
     * because spaces are removed.
     */
    for (const buildingName of buildings) {
      const normalizedBuilding =
        normalizeSpeech(buildingName);

      if (
        normalizedText.includes(normalizedBuilding)
      ) {
        return buildingName;
      }
    }

    /*
     * Second: exact alias matching after normalization.
     */
    const aliases = Object.keys(buildingAliases);

    for (const alias of aliases) {
      const normalizedAlias =
        normalizeSpeech(alias);

      if (
        normalizedText.includes(normalizedAlias)
      ) {
        return buildingAliases[alias];
      }
    }

    /*
     * Third: fuzzy matching.
     *
     * We compare both official building names and aliases.
     */
    let bestBuilding: string | null = null;
    let bestScore = 0;

    /*
     * Official building names.
     */
    for (const buildingName of buildings) {
      const score = getFuzzyMatchScore(
        spokenText,
        buildingName
      );

      if (score > bestScore) {
        bestScore = score;
        bestBuilding = buildingName;
      }
    }

    /*
     * Aliases.
     */
    for (const alias of aliases) {
      const score = getFuzzyMatchScore(
        spokenText,
        alias
      );

      if (score > bestScore) {
        bestScore = score;
        bestBuilding = buildingAliases[alias];
      }
    }

    /*
     * Only accept reasonably strong matches.
     *
     * This prevents unrelated speech from accidentally
     * opening a random building.
     */
    if (bestBuilding && bestScore >= 0.60) {
      console.log(
        "Voice building match:",
        bestBuilding,
        "score:",
        bestScore
      );

      return bestBuilding;
    }

    return null;
  };

  const executeVoiceCommand = (
    resultText: string
  ) => {
    const text = resultText.toLowerCase().trim();

    setTranscript(resultText);

    if (
      text.includes("accessibility") ||
      text.includes("accessible mode")
    ) {
      router.replace(
        "/navigation?mode=accessibility"
      );
      return;
    }

    if (
      text.includes("standard navigation") ||
      text.includes("standard mode") ||
      text === "standard"
    ) {
      router.replace(
        "/navigation?mode=standard"
      );
      return;
    }

    /*
     * Find the destination using the robust building
     * resolver above.
     */
    const matchedBuilding =
      findBuildingFromSpeech(resultText);

    if (matchedBuilding) {
      console.log(
        "Navigating to building:",
        matchedBuilding
      );

      router.replace(
        `/navigation?mode=standard&destination=${encodeURIComponent(
          matchedBuilding
        )}`
      );

      return;
    }

    Alert.alert(
      "Command Not Recognized",
      `I heard: "${resultText}"\n\nTry saying "open accessibility", "open standard navigation", or "take me to Morgan Hall."`
    );
  };

  const transcribeRecording = async (
    uri: string
  ) => {
    try {
      setIsTranscribing(true);
      setTranscript("");

      const file = new File(uri);

      const formData = new FormData();
      formData.append("file", file as any);

      const response = await expoFetch(
        `${SPEECH_SERVER}/transcribe`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();

        throw new Error(
          `Speech server returned ${response.status}: ${errorBody}`
        );
      }

      const result = await response.json();

      console.log(
        "Transcription result:",
        result
      );

      const resultText =
        result.text || "No speech detected.";

      executeVoiceCommand(resultText);
    } catch (error) {
      console.error(
        "Transcription error:",
        error
      );

      Alert.alert(
        "Transcription Error",
        String(error)
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleVoiceCommands = async () => {
    if (!permissionGranted) {
      await requestMicrophonePermission();
      return;
    }

    if (recorderState.isRecording) {
      await recorder.stop();

      setRecordingComplete(true);

      const recordingUri = recorder.uri;

      console.log(
        "Recording finished:",
        recordingUri
      );

      if (recordingUri) {
        await transcribeRecording(recordingUri);
      }

      return;
    }

    setRecordingComplete(false);
    setTranscript("");

    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.appName}>
            MapQP
          </Text>

          <Text style={styles.tagline}>
            Welcome to WPI
          </Text>

          <Text style={styles.description}>
            Find your way around campus with
            navigation designed with accessibility
            in mind.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Choose Navigation
          </Text>

          <TouchableOpacity
            style={styles.navigationCard}
            onPress={() =>
              router.replace(
                "/navigation?mode=standard"
              )
            }
            activeOpacity={0.8}
          >
            <View style={styles.navigationIcon}>
              <Text
                style={styles.navigationIconText}
              >
                ➤
              </Text>
            </View>

            <View style={styles.navigationText}>
              <Text
                style={styles.navigationTitle}
              >
                Standard Navigation
              </Text>

              <Text
                style={
                  styles.navigationDescription
                }
              >
                Standard map and walking
                navigation.
              </Text>
            </View>

            <Text style={styles.arrow}>
              ›
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navigationCard}
            onPress={() =>
              router.replace(
                "/navigation?mode=accessibility"
              )
            }
            activeOpacity={0.8}
          >
            <View style={styles.navigationIcon}>
              <Text
                style={styles.navigationIconText}
              >
                ◉
              </Text>
            </View>

            <View style={styles.navigationText}>
              <Text
                style={styles.navigationTitle}
              >
                Accessibility Navigation
              </Text>

              <Text
                style={
                  styles.navigationDescription
                }
              >
                Larger controls, text, and
                navigation elements.
              </Text>
            </View>

            <Text style={styles.arrow}>
              ›
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.voiceCard,
              recorderState.isRecording &&
                styles.voiceCardListening,
            ]}
            onPress={toggleVoiceCommands}
            activeOpacity={0.8}
            disabled={isTranscribing}
          >
            <View
              style={[
                styles.navigationIcon,
                recorderState.isRecording &&
                  styles.voiceIconListening,
              ]}
            >
              <Text
                style={styles.navigationIconText}
              >
                {recorderState.isRecording
                  ? "🔴"
                  : "🎙"}
              </Text>
            </View>

            <View style={styles.navigationText}>
              <Text
                style={styles.navigationTitle}
              >
                {recorderState.isRecording
                  ? "Listening..."
                  : isTranscribing
                  ? "Transcribing..."
                  : "Voice Commands"}
              </Text>

              <Text
                style={
                  styles.navigationDescription
                }
              >
                {recorderState.isRecording
                  ? "Tap again when you are finished speaking."
                  : isTranscribing
                  ? "Converting your speech into a command..."
                  : "Tap here and speak a navigation command."}
              </Text>
            </View>

            {!recorderState.isRecording &&
              !isTranscribing && (
                <Text style={styles.arrow}>
                  🎙
                </Text>
              )}
          </TouchableOpacity>

          {(recorderState.isRecording ||
            isTranscribing ||
            recordingComplete ||
            transcript) && (
            <View style={styles.voiceStatusCard}>
              <Text
                style={styles.voiceStatusTitle}
              >
                Voice Command
              </Text>

              {recorderState.isRecording && (
                <Text
                  style={styles.voiceStatusText}
                >
                  Listening for your command...
                </Text>
              )}

              {isTranscribing && (
                <Text
                  style={styles.voiceStatusText}
                >
                  Transcribing your recording...
                </Text>
              )}

              {transcript &&
                !isTranscribing && (
                  <Text
                    style={styles.voiceTranscript}
                  >
                    Heard: "{transcript}"
                  </Text>
                )}

              {recordingComplete &&
                !recorderState.isRecording &&
                !isTranscribing &&
                !transcript && (
                  <Text
                    style={styles.voiceStatusText}
                  >
                    Recording captured.
                  </Text>
                )}
            </View>
          )}
        </View>

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
    marginBottom: 20,
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

  voiceCard: {
    minHeight: 100,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#9CA3AF",
  },

  voiceCardListening: {
    backgroundColor: "#FEF2F2",
    borderColor: "#EF4444",
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

  voiceIconListening: {
    backgroundColor: "#FEE2E2",
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
    fontSize: 28,
    color: "#6B7280",
    marginLeft: 10,
  },

  voiceStatusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },

  voiceStatusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },

  voiceStatusText: {
    fontSize: 15,
    color: "#4B5563",
  },

  voiceTranscript: {
    fontSize: 16,
    lineHeight: 23,
    color: "#111827",
  },

  exampleCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },

  exampleTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },

  exampleText: {
    fontSize: 15,
    color: "#4B5563",
    marginBottom: 8,
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