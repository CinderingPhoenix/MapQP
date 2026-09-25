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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import buildingData from "../data/wpi-buildings.json";

const SPEECH_SERVER = "http://130.215.172.161:8000";

export default function VoiceCommands() {
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

      const text = (result.text || "").toLowerCase().trim();

      setTranscript(result.text || "No speech detected.");

      // Accessibility mode
      if (
        text.includes("accessibility") ||
        text.includes("accessible mode")
      ) {
        router.replace("/navigation?mode=accessibility");
        return;
      }

      // Standard mode
      if (
        text.includes("standard navigation") ||
        text.includes("standard mode") ||
        text === "standard"
      ) {
        router.replace("/navigation?mode=standard");
        return;
      }

            // Building destinations
      // Get the building names directly from wpi-buildings.json.
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

      // Support common shorter names / spoken variations
      const buildingAliases: {
        [key: string]: string;
      } = {
        "morgan": "Morgan Hall",
        "unity": "Unity Hall",
        "alden": "Alden Memorial",
        "boynton": "Boynton Hall",
        "daniels": "Daniels Hall",
        "fuller": "Fuller Laboratories",
        "goddard": "Goddard Hall",
        "gordon library": "Gordon Library",
        "gordon": "Gordon Library",
        "higgins": "Higgins Laboratories",
        "innovation studios": "Innovation Studios",
        "innovation": "Innovation Studios",
        "kaven": "Kaven Hall",
        "olin": "Olin Hall",
        "project center": "Project Center",
        "project": "Project Center",
        "sandford riley": "Sandford Riley Hall",
        "sanford riley": "Sandford Riley Hall",
        "sandford": "Sandford Riley Hall",
        "sanford": "Sandford Riley Hall",
        "stratton": "Stratton Hall",
        "washburn": "Washburn Shops",
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
        `I heard: "${result.text}"\n\nTry saying "open accessibility", "open standard navigation", "take me to Morgan Hall", or "take me to Unity Hall."`
      );
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

  const toggleRecording = async () => {
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
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Voice Commands</Text>

          <Text style={styles.description}>
            Use your voice to control MapQP navigation.
          </Text>
        </View>

        <View style={styles.microphoneSection}>
          <TouchableOpacity
            style={[
              styles.microphoneButton,
              recorderState.isRecording &&
                styles.microphoneButtonListening,
            ]}
            onPress={toggleRecording}
            activeOpacity={0.8}
            disabled={isTranscribing}
          >
            <Text style={styles.microphoneIcon}>
              {recorderState.isRecording ? "🔴" : "🎙"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.listeningText}>
            {recorderState.isRecording
              ? "Listening..."
              : isTranscribing
              ? "Transcribing..."
              : recordingComplete
              ? "Recording captured"
              : "Tap to speak"}
          </Text>

          <Text style={styles.statusText}>
            {recorderState.isRecording
              ? "Tap the microphone again when you are finished."
              : isTranscribing
              ? "Converting your speech to text..."
              : "Tap the microphone to start recording."}
          </Text>
        </View>

        

        <View style={styles.transcriptCard}>
          <Text style={styles.transcriptTitle}>
            Transcription
          </Text>

          <Text style={styles.transcriptText}>
            {transcript || "Your spoken command will appear here."}
          </Text>
        </View>

        <View style={styles.lastCommandSection}>
          <Text style={styles.lastCommandTitle}>
            Microphone status
          </Text>

          <Text style={styles.lastCommand}>
            {permissionGranted
              ? "Microphone permission granted"
              : "Microphone permission not granted"}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },

  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  backButtonText: {
    fontSize: 18,
    color: "#374151",
    fontWeight: "600",
  },

  header: {
    marginTop: 24,
    alignItems: "center",
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },

  description: {
    fontSize: 16,
    lineHeight: 24,
    color: "#4B5563",
    textAlign: "center",
    maxWidth: 400,
  },

  microphoneSection: {
    alignItems: "center",
    marginTop: 45,
  },

  microphoneButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },

  microphoneButtonListening: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
  },

  microphoneIcon: {
    fontSize: 55,
  },

  listeningText: {
    marginTop: 20,
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },

  statusText: {
    marginTop: 8,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },

  exampleCard: {
    marginTop: 35,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
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
    fontSize: 16,
    color: "#4B5563",
    marginBottom: 8,
  },

  transcriptCard: {
    marginTop: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },

  transcriptTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },

  transcriptText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#111827",
  },

  lastCommandSection: {
    marginTop: 20,
    alignItems: "center",
  },

  lastCommandTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },

  lastCommand: {
    marginTop: 6,
    fontSize: 15,
    color: "#111827",
    textAlign: "center",
  },
});
