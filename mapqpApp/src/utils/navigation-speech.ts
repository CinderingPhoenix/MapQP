import type { SpeechOptions } from "expo-speech";
import { AccessibilityInfo, Platform } from "react-native";

type SpeechEngine = {
  speak: (text: string, options: SpeechOptions) => void;
  stop: () => Promise<void>;
};
export type PoliteAnnouncement = { text: string; revision: number };
export type SpeechMode = "tts" | "screen-reader" | null;
type PromptKind = "startup" | "maneuver" | "urgent" | "arrival" | "optional" | "feedback";
type Prompt = { text: string; kind: PromptKind; expires: number; valid: () => boolean };

// One owner, one active utterance and at most one pending prompt. Native
// screen-reader speech has no portable completion/cancel API: never build an OS
// announcement backlog or use estimated speech duration as a completion signal.
export class NavigationSpeech {
  private enabled = false;
  private muted = false;
  private listening = false;
  private mode: SpeechMode = null;
  private active: Prompt | null = null;
  private pending: Prompt | null = null;
  private generation = 0;
  private context = 0;
  // Expo's synthesizer is global even when two navigation screens are mounted.
  // A newly focused screen must await the old screen's native stop as well.
  private static stopBarrier: Promise<void> = Promise.resolve();
  private static stopFailed = false;
  private lastAnnouncementAt = -Infinity;

  constructor(
    private readonly engine: SpeechEngine,
    private readonly politeAnnouncement: (text: string) => void = () => {},
  ) {}

  async readyForFocusGuidance(): Promise<boolean> {
    await NavigationSpeech.stopBarrier;
    return !NavigationSpeech.stopFailed && this.enabled && !this.muted && !this.listening && this.mode === "screen-reader";
  }

  // The focused visible summary owns startup speech; suppress immediate optional chatter.
  noteFocusGuidance() {
    this.lastAnnouncementAt = Date.now();
  }

  setMode(mode: SpeechMode) {
    if (mode === this.mode) return;
    // Initial detection can release a still-valid command result. An actual
    // channel change invalidates incompatible speech, including delayed results.
    const deferred = this.mode === null ? this.pending : null;
    if (this.mode === null) this.interrupt();
    else this.cancel();
    this.mode = mode;
    this.pending = deferred;
    this.flush();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.cancel();
    else this.flush();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.cancel();
  }

  setListening(listening: boolean): Promise<void> {
    if (listening !== this.listening) {
      this.listening = listening;
      if (listening) this.cancel();
      else this.flush();
    }
    return NavigationSpeech.stopBarrier.then(() => {
      if (listening && NavigationSpeech.stopFailed) throw new Error("Navigation speech could not be stopped before recording.");
    });
  }

  // Capture at command start, not when a delayed save/map response resolves.
  // New routes, recognition sessions, mode switches and transitions invalidate it.
  feedbackReporter(valid: () => boolean): (text: string) => boolean {
    const context = this.context;
    return (text) => this.request(text, "feedback", () => context === this.context && valid());
  }

  cancel() {
    this.context++;
    this.interrupt();
    this.politeAnnouncement("");
  }

  clearGuidance() {
    const feedback = this.pending?.kind === "feedback" ? this.pending : null;
    if (this.active?.kind !== "feedback") this.interrupt();
    this.pending = feedback;
    this.politeAnnouncement("");
    this.flush();
  }

  private interrupt() {
    const hadTts = this.active !== null && this.mode === "tts";
    this.generation++;
    this.active = null;
    this.pending = null;
    if (hadTts || NavigationSpeech.stopFailed) {
      NavigationSpeech.stopBarrier = NavigationSpeech.stopBarrier.then(() => this.engine.stop()).then(() => {
        NavigationSpeech.stopFailed = false;
      }).catch((error: unknown) => {
        // Do not launch another speech channel if native synthesis failed to stop.
        NavigationSpeech.stopFailed = true;
        console.warn("Unable to stop navigation speech", error);
      });
    }
  }

  request(text: string, kind: PromptKind, valid: () => boolean = () => true): boolean {
    if (!this.enabled || !text || !valid() || (this.muted && kind !== "feedback")) return false;
    // Guidance is recomputed from current GPS after detection/listening resolves.
    // Only explicit command feedback is held, in the existing single pending slot.
    if (this.mode === null || this.listening) {
      if (kind !== "feedback") return false;
      this.pending = { text, kind, expires: Date.now() + 8000, valid };
      return true;
    }
    if (kind === "optional" && this.mode === "screen-reader" && Date.now() - this.lastAnnouncementAt < 2000) return false;
    if (this.active?.text === text || this.pending?.text === text) return true;
    const prompt = { text, kind, expires: Date.now() + 8000, valid };
    if (this.active) {
      if (kind === "optional") return false;
      if (this.active.kind === "arrival" && kind !== "arrival") return false;
      if (kind !== "urgent" && kind !== "arrival" && this.active.kind !== "optional") {
        if (this.pending?.kind === "arrival") return false;
        this.pending = prompt;
        return true;
      }
      // Urgent turns/arrival preempt outdated TTS. Keep command context intact.
      this.interrupt();
    }
    if (kind === "urgent" || kind === "arrival") this.politeAnnouncement("");
    this.begin(prompt);
    return true;
  }

  private flush() {
    if (!this.enabled || this.listening || this.mode === null || this.active) return;
    const next = this.pending;
    this.pending = null;
    if (next && next.expires > Date.now() && next.valid() && (!this.muted || next.kind === "feedback")) this.begin(next);
  }

  private begin(prompt: Prompt) {
    this.active = prompt;
    const generation = ++this.generation;
    const finish = () => {
      if (generation !== this.generation) return;
      this.active = null;
      this.flush();
    };
    void NavigationSpeech.stopBarrier.then(() => {
      if (!this.enabled || generation !== this.generation) return;
      if (NavigationSpeech.stopFailed || this.listening || this.mode === null || !prompt.valid() || prompt.expires <= Date.now()) {
        finish();
        return;
      }
      try {
        if (this.mode === "screen-reader") {
          this.lastAnnouncementAt = Date.now();
          if (Platform.OS === "ios") {
            AccessibilityInfo.announceForAccessibilityWithOptions(prompt.text, {
              queue: false,
              priority: prompt.kind === "optional" ? "low"
                : prompt.kind === "urgent" || prompt.kind === "arrival" ? "high" : "default",
            });
          } else if (Platform.OS === "android" && prompt.kind === "optional") {
            this.politeAnnouncement(prompt.text);
          } else AccessibilityInfo.announceForAccessibility(prompt.text);
          // Delivery, not completion: urgent updates may supersede this message.
          // The OS owns speech already delivered; cancellation only clears our work.
          finish();
        } else {
          this.engine.speak(prompt.text, {
            language: "en-US", rate: 1,
            ...(Platform.OS === "ios" ? { useApplicationAudioSession: true } : {}),
            onDone: finish, onStopped: finish, onError: finish,
          });
        }
      } catch (error) {
        console.warn("Unable to start navigation speech", error);
        finish();
      }
    });
  }
}

type StageFlags = { m25?: boolean; m5?: boolean; turn?: boolean };
export type StepSpeechStage = StageFlags & { haptics?: StageFlags };

// Startup already conveys the first maneuver at its current distance. Consume
// that range (and earlier ranges), while preserving later approach thresholds.
export function initialSpeechStages(distance: number): StepSpeechStage {
  return { m25: distance <= 25, m5: distance <= 5, turn: distance <= 2 };
}
