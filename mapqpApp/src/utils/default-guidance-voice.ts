import type { Voice } from "expo-speech";

// Matches the first numbered US voice in the personalization list.
export function defaultGuidanceVoice(voices: Voice[]): string {
  return voices.filter((voice) => /^en[-_]us(?:[-_]|$)/i.test(voice.language) &&
    /^en[-_][a-z]{2}(?:[-_]|$)/i.test(voice.name))
    .sort((a, b) => a.identifier.localeCompare(b.identifier))[0]?.identifier ?? "";
}
