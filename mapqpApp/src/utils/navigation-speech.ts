import type { SpeechOptions } from "expo-speech";
import { Platform } from "react-native";

// Reversible iOS experiment supported by installed expo-speech 58.0.3:
// let the system manage synthesis audio-session interruptions/mixing. This
// does NOT serialize speech with VoiceOver or guarantee that overlap stops.
// Set false to explicitly restore the application audio session on next speech.
const SYSTEM_MANAGED_IOS_SPEECH_SESSION_EXPERIMENT = false;

type SpeechEngine = {
  speak: (text: string, options: SpeechOptions) => void;
  stop: () => Promise<void>;
};
type PromptKind = "startup" | "maneuver" | "arrival" | "optional";
type Prompt = { text: string; kind: PromptKind };

// One active utterance and at most one pending important prompt. Optional
// orientation/repeat prompts are dropped while busy, rather than queued stale.
export class NavigationSpeech {
  private enabled = true;
  private active: Prompt | null = null;
  private pending: Prompt | null = null;
  private generation = 0;
  private stopBarrier: Promise<void> = Promise.resolve();

  constructor(private readonly engine: SpeechEngine) {}

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.cancel();
  }

  cancel() {
    const hadSpeech = this.active !== null;
    this.generation++;
    this.active = null;
    this.pending = null;
    if (hadSpeech) {
      // A future utterance waits for native stop to complete. Old completion
      // callbacks cannot drain a queue belonging to a newer navigation session.
      this.stopBarrier = this.stopBarrier.then(() => this.engine.stop()).catch((error: unknown) => {
        console.warn("Unable to stop navigation speech", error);
      });
    }
  }

  request(text: string, kind: PromptKind): boolean {
    if (!this.enabled || !text) return false;
    if (this.active?.text === text || this.pending?.text === text) return true;
    const prompt = { text, kind };
    if (this.active) {
      if (kind === "optional") return false;
      if (this.active.kind !== "optional") {
        if (this.pending?.kind === "arrival" && kind !== "arrival") return false;
        this.pending = prompt; // Newer important guidance supersedes stale queued guidance.
        return true;
      }
      this.cancel(); // Maneuvers can preempt optional orientation/repeat speech.
    }
    this.begin(prompt);
    return true;
  }

  private begin(prompt: Prompt) {
    this.active = prompt;
    const generation = ++this.generation;
    const finish = () => {
      if (generation !== this.generation) return;
      this.active = null;
      const next = this.pending;
      this.pending = null;
      if (next && this.enabled) this.begin(next);
    };
    void this.stopBarrier.then(() => {
      if (!this.enabled || generation !== this.generation) return;
      try {
        this.engine.speak(prompt.text, {
          language: "en-US", rate: 1,
          ...(Platform.OS === "ios" ? {
            useApplicationAudioSession: !SYSTEM_MANAGED_IOS_SPEECH_SESSION_EXPERIMENT,
          } : {}),
          onDone: finish, onStopped: finish,
          onError: () => { finish(); },
        });
      } catch (error) {
        console.warn("Unable to start navigation speech", error);
        finish();
      }
    });
  }
}

export type StepSpeechStage = { m25?: boolean; m5?: boolean; turn?: boolean };

// Startup already conveys the first maneuver at its current distance. Consume
// that range (and earlier ranges), while preserving later approach thresholds.
export function initialSpeechStages(distance: number): StepSpeechStage {
  return { m25: distance <= 25, m5: distance <= 5, turn: distance <= 2 };
}
