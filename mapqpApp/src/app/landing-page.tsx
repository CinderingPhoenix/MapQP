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

  const executeVoiceCommand = (resultText: string) => {
    const text = resultText.toLowerCase().trim();

    setTranscript(resultText);

    if (
      text.includes("accessibility") ||
      text.includes("accessible mode")
    ) {
      router.replace("/navigation?mode=accessibility");
      return;
    }

    if (
      text.includes("standard navigation") ||
      text.includes("standard mode") ||
      text === "standard"
    ) {
      router.replace("/navigation?mode=standard");
      return;
    }

    const buildingNames = buildingData
      .map((building) => building.name)
      .sort((a, b) => b.length - a.length);

    const normalizedText = text
      .replace(/[.,!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const matchedBuilding = buildingNames.find((buildingName) =>
      normalizedText.includes(buildingName.toLowerCase())
    );

    if (matchedBuilding) {
      router.replace(
        `/navigation?mode=standard&destination=${encodeURIComponent(
          matchedBuilding
        )}`
      );
      return;
    }

    const buildingAliases: {
      [key: string]: string;
    } = {
      morgan: "Morgan Hall",
      unity: "Unity Hall",
      alden: "Alden Memorial",
      boynton: "Boynton Hall",
      daniels: "Daniels Hall",
      fuller: "Fuller Laboratories",
      goddard: "Goddard Hall",
      "gordon library": "Gordon Library",
      gordon: "Gordon Library",
      higgins: "Higgins Laboratories",
      "innovation studios": "Innovation Studios",
      innovation: "Innovation Studios",
      kaven: "Kaven Hall",
      olin: "Olin Hall",
      "project center": "Project Center",
      project: "Project Center",
      "sandford riley": "Sandford Riley Hall",
      "sanford riley": "Sandford Riley Hall",
      sandford: "Sandford Riley Hall",
      sanford: "Sandford Riley Hall",
      stratton: "Stratton Hall",
      washburn: "Washburn Shops",
    };

    const matchedAlias = Object.keys(buildingAliases).find((alias) =>
      normalizedText.includes(alias)
    );

    if (matchedAlias) {
      const buildingName = buildingAliases[matchedAlias];

      router.replace(
        `/navigation?mode=standard&destination=${encodeURIComponent(
          buildingName
        )}`
      );
      return;
    }

    Alert.alert(
      "Command Not Recognized",
      `I heard: "${resultText}"\n\nTry saying "open accessibility", "open standard navigation", or "take me to Morgan Hall."`
    );
  };

  const transcribeRecording = async (uri: string) => {
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

      console.log("Transcription result:", result);

      const resultText = result.text || "No speech detected.";

      executeVoiceCommand(resultText);
    } catch (error) {
      console.error("Transcription error:", error);

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

      console.log("Recording finished:", recordingUri);

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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Choose Navigation
          </Text>

          <TouchableOpacity
            style={styles.navigationCard}
            onPress={() =>
              router.replace("/navigation?mode=standard")
            }
            activeOpacity={0.8}
          >
            <View style={styles.navigationIcon}>
              <Text style={styles.navigationIconText}>➤</Text>
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

          <TouchableOpacity
            style={styles.navigationCard}
            onPress={() =>
              router.replace("/navigation?mode=accessibility")
            }
            activeOpacity={0.8}
          >
            <View style={styles.navigationIcon}>
              <Text style={styles.navigationIconText}>◉</Text>
            </View>

            <View style={styles.navigationText}>
              <Text style={styles.navigationTitle}>
                Accessibility Navigation
              </Text>

              <Text style={styles.navigationDescription}>
                Larger controls, text, and navigation elements.
              </Text>
            </View>

            <Text style={styles.arrow}>›</Text>
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
              <Text style={styles.navigationIconText}>
                {recorderState.isRecording ? "🔴" : "🎙"}
              </Text>
            </View>

            <View style={styles.navigationText}>
              <Text style={styles.navigationTitle}>
                {recorderState.isRecording
                  ? "Listening..."
                  : isTranscribing
                  ? "Transcribing..."
                  : "Voice Commands"}
              </Text>

              <Text style={styles.navigationDescription}>
                {recorderState.isRecording
                  ? "Tap again when you are finished speaking."
                  : isTranscribing
                  ? "Converting your speech into a command..."
                  : "Tap here and speak a navigation command."}
              </Text>
            </View>

            {!recorderState.isRecording &&
              !isTranscribing && (
                <Text style={styles.arrow}>🎙</Text>
              )}
          </TouchableOpacity>

          {(recorderState.isRecording ||
            isTranscribing ||
            recordingComplete ||
            transcript) && (
            <View style={styles.voiceStatusCard}>
              <Text style={styles.voiceStatusTitle}>
                Voice Command
              </Text>

              {recorderState.isRecording && (
                <Text style={styles.voiceStatusText}>
                  Listening for your command...
                </Text>
              )}

              {isTranscribing && (
                <Text style={styles.voiceStatusText}>
                  Transcribing your recording...
                </Text>
              )}

              {transcript && !isTranscribing && (
                <Text style={styles.voiceTranscript}>
                  Heard: "{transcript}"
                </Text>
              )}

              {recordingComplete &&
                !recorderState.isRecording &&
                !isTranscribing &&
                !transcript && (
                  <Text style={styles.voiceStatusText}>
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