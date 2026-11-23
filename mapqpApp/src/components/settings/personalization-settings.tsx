import * as Speech from "expo-speech";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Switch, Text, TouchableOpacity, View } from "react-native";
import { useSettings } from "../../context/settings-context";
import { useSettingsPalette } from "../../hooks/use-settings-theme";

const ENGLISH_REGIONS: Record<string, string> = {
  US: "United States", GB: "United Kingdom", AU: "Australia", CA: "Canada",
  IN: "India", IE: "Ireland", NZ: "New Zealand", ZA: "South Africa",
};

function voiceRegion(language: string) {
  const region = language.replace(/_/g, "-").split("-").slice(1).find((part) => /^[a-z]{2}$/i.test(part))?.toUpperCase();
  return region ? ENGLISH_REGIONS[region] ?? region : "English";
}

function labelVoices(voices: Speech.Voice[]) {
  const sorted = [...voices].sort((a, b) => a.identifier.localeCompare(b.identifier));
  const counts: Record<string, number> = {};
  const labels = new Map<string, string>();
  for (const voice of sorted) {
    const region = voiceRegion(voice.language);
    // Android often exposes engine identifiers in place of human names.
    const hasReadableName = !/^en[-_][a-z]{2}(?:[-_]|$)/i.test(voice.name) &&
      /^[\p{L}][\p{L} .'-]*$/u.test(voice.name) && voice.name.length <= 40;
    const base = hasReadableName ? `${voice.name} (${region})` : `${region} voice`;
    counts[base] = (counts[base] ?? 0) + 1;
    labels.set(voice.identifier, `${base} ${counts[base]}`);
  }
  return labels;
}

export function PersonalizationSettings() {
  const settings = useSettings();
  const theme = useSettingsPalette();
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [otherVoiceIds, setOtherVoiceIds] = useState<string[]>([]);
  const [showVoices, setShowVoices] = useState(false);
  const [voiceError, setVoiceError] = useState(false);
  const previewRevision = useRef(0);
  const disabled = !settings.settingsLoaded || !settings.settingsReadSucceeded;
  const ink = theme.dark ? theme.tokens.text : "#211E1C";
  const accent = theme.dark ? theme.tokens.accent : "#741B2B";
  useEffect(() => {
    let active = true;
    Speech.getAvailableVoicesAsync().then((items) => {
      if (active) {
        setVoices(items.filter((voice) => /^en[-_]us(?:[-_]|$)/i.test(voice.language)));
        setOtherVoiceIds(items.filter((voice) => !/^en[-_]us(?:[-_]|$)/i.test(voice.language)).map((voice) => voice.identifier));
      }
    }).catch(() => { if (active) setVoiceError(true); });
    return () => { active = false; previewRevision.current++; void Speech.stop(); };
  }, []);
  useEffect(() => {
    if (settings.settingsLoaded && settings.settingsReadSucceeded && otherVoiceIds.includes(settings.guidanceVoice)) {
      settings.setGuidanceVoice("");
    }
  }, [otherVoiceIds, settings.settingsLoaded, settings.settingsReadSucceeded, settings.guidanceVoice, settings.setGuidanceVoice]);
  const voiceLabels = useMemo(() => {
    const original = labelVoices(voices);
    const femaleNumbers = new Set([1, 2, 3, 4, 5, 10, 11, 13, 16, 17]);
    const labels = new Map<string, string>();
    let female = 0;
    let male = 0;
    const sorted = [...voices].sort((a, b) =>
      (original.get(a.identifier) ?? "").localeCompare(original.get(b.identifier) ?? "", undefined, { numeric: true }));
    for (const voice of sorted) {
      const label = original.get(voice.identifier) ?? "Saved voice unavailable";
      const match = /^United States voice (\d+)$/.exec(label);
      if (!match) labels.set(voice.identifier, label);
      else if (femaleNumbers.has(Number(match[1]))) labels.set(voice.identifier, `United States Female ${++female}`);
      else labels.set(voice.identifier, `United States Male ${++male}`);
    }
    return labels;
  }, [voices]);
  const sortedVoices = useMemo(() => [...voices].sort((a, b) =>
    (voiceLabels.get(a.identifier) ?? "").localeCompare(voiceLabels.get(b.identifier) ?? "", undefined, { numeric: true })), [voices, voiceLabels]);
  const displayVoice = (identifier: string) => identifier
    ? voiceLabels.get(identifier) ?? "Saved voice unavailable"
    : "Device default";
  const selectedVoice = voices.find((voice) => voice.identifier === settings.guidanceVoice);
  const textStyle = { color: ink, fontSize: 17 * settings.fontSize, lineHeight: 25 * settings.fontSize };
  const row = (label: string, value: boolean, change: (value: boolean) => void, description?: string) => <View style={{ paddingVertical: 10, gap: 4 }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Text style={[textStyle, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={change} disabled={disabled} accessibilityLabel={label} />
    </View>
    {description && <Text style={[textStyle, { fontSize: 14 * settings.fontSize }]}>{description}</Text>}
  </View>;
  const previewVoice = (identifier: string) => {
    const revision = ++previewRevision.current;
    void Speech.stop().then(() => {
      if (revision !== previewRevision.current) return;
      Speech.speak("Your navigation voice is ready.", {
        rate: settings.guidanceRate, volume: settings.guidanceVolume,
        ...(identifier ? { voice: identifier } : { language: "en-US" }),
        ...(Platform.OS === "ios" ? { useApplicationAudioSession: !settings.manageSpeechAudio } : {}),
      });
    }).catch((error) => console.warn("Unable to preview voice", error));
  };
  const chooseVoice = (identifier: string) => {
    settings.setGuidanceVoice(identifier);
    setShowVoices(false);
    if (!settings.deviceAccessibility.screenReaderEnabled) previewVoice(identifier);
  };
  return <View style={{ gap: 8 }}>
    {row("Keep screen awake", settings.keepScreenAwake, settings.setKeepScreenAwake, "Keeps the screen on while navigation is open. Battery Saver takes priority.")}
    <View style={{ paddingVertical: 10, gap: 8 }}>
      <Text style={textStyle}>Arrival alert</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([
          { label: "Speech", speech: true, vibration: false },
          { label: "Vibrate", speech: false, vibration: true },
          { label: "Both", speech: true, vibration: true },
        ] as const).map((option) => {
          const selected = settings.arrivalSpeech === option.speech && settings.arrivalVibration === option.vibration;
          return <TouchableOpacity key={option.label} accessibilityRole="radio" accessibilityLabel={option.label}
            accessibilityState={{ checked: selected, disabled }} disabled={disabled}
            onPress={() => { settings.setArrivalSpeech(option.speech); settings.setArrivalVibration(option.vibration); }}
            style={{ minHeight: 48, minWidth: 90, flexGrow: 1, justifyContent: "center", alignItems: "center",
              padding: 10, borderWidth: selected ? 2 : 1, borderColor: accent, borderRadius: 8 }}>
            <Text style={textStyle}>{option.label}{selected ? " (selected)" : ""}</Text>
          </TouchableOpacity>;
        })}
      </View>
    </View>
    <View style={{ paddingVertical: 10, gap: 8 }}>
      <Text style={textStyle}>Navigation vibration</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([
          { label: "Off", turn: false, reroute: false },
          { label: "Turns", turn: true, reroute: false },
          { label: "Rerouting", turn: false, reroute: true },
          { label: "Both", turn: true, reroute: true },
        ] as const).map((option) => {
          const selected = settings.turnVibration === option.turn && settings.rerouteVibration === option.reroute;
          return <TouchableOpacity key={option.label} accessibilityRole="radio" accessibilityLabel={`Navigation vibration: ${option.label}`}
            accessibilityState={{ checked: selected, disabled }} disabled={disabled}
            onPress={() => { settings.setTurnVibration(option.turn); settings.setRerouteVibration(option.reroute); }}
            style={{ minHeight: 48, minWidth: 90, flexGrow: 1, justifyContent: "center", alignItems: "center",
              padding: 10, borderWidth: selected ? 2 : 1, borderColor: accent, borderRadius: 8 }}>
            <Text style={textStyle}>{option.label}{selected ? " (selected)" : ""}</Text>
          </TouchableOpacity>;
        })}
      </View>
      <Text style={[textStyle, { fontSize: 14 * settings.fontSize }]}>Applies while navigation is open.</Text>
    </View>
    {Platform.OS === "ios" && row("Manage other audio during speech", settings.manageSpeechAudio, settings.setManageSpeechAudio, "Lets iOS manage mixing and interruptions during MapQP speech.")}
    <Text style={textStyle}>Navigation voice</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Navigation voice: ${selectedVoice || !settings.guidanceVoice ? displayVoice(settings.guidanceVoice) : "Saved voice unavailable"}`}
      accessibilityState={{ expanded: showVoices, disabled }} disabled={disabled} onPress={() => setShowVoices(!showVoices)}
      style={{ minHeight: 48, justifyContent: "center", padding: 10, borderWidth: 1, borderColor: accent, borderRadius: 8 }}>
      <Text style={textStyle}>{selectedVoice || !settings.guidanceVoice ? displayVoice(settings.guidanceVoice) : "Saved voice unavailable"}</Text>
    </TouchableOpacity>
    {showVoices && <View style={{ gap: 6 }}>
      {voiceError && <Text style={textStyle}>Voices could not be loaded.</Text>}
      {sortedVoices.map((voice) => <TouchableOpacity key={voice.identifier || "default"}
        accessibilityRole="radio" accessibilityState={{ checked: settings.guidanceVoice === voice.identifier }}
        onPress={() => chooseVoice(voice.identifier)} style={{ minHeight: 48, justifyContent: "center", padding: 10, borderWidth: 1, borderColor: accent, borderRadius: 8 }}>
        <Text style={textStyle}>{displayVoice(voice.identifier)}{settings.guidanceVoice === voice.identifier ? " (selected)" : ""}</Text>
      </TouchableOpacity>)}
    </View>}
    {!settings.deviceAccessibility.screenReaderEnabled && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Preview navigation voice" disabled={disabled}
      onPress={() => previewVoice(selectedVoice?.identifier ?? "")}
      style={{ minHeight: 48, justifyContent: "center" }}><Text style={[textStyle, { color: accent }]}>Preview voice</Text></TouchableOpacity>}
  </View>;
}
