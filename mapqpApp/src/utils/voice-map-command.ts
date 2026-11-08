import type { CameraAction } from "../components/map-controls";

export type VoiceMapCommand = CameraAction | "recenter";

export function parseVoiceMapCommand(text: string): VoiceMapCommand | null {
  const phrase = text.toLowerCase().replace(/[^a-z\s]/g, "").trim()
    .replace(/\s+/g, " ").replace(/^please /, "").replace(/ please$/, "");
  const commands: Record<string, VoiceMapCommand> = {
    "zoom in": "zoom-in", "zoom out": "zoom-out",
    "move left": "pan-left", "move right": "pan-right",
    "move up": "pan-up", "move down": "pan-down", "recenter map": "recenter",
    "recenter": "recenter", "center map": "recenter",
  };
  return Object.prototype.hasOwnProperty.call(commands, phrase) ? commands[phrase] : null;
}
