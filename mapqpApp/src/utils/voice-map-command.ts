import type { CameraAction } from "../components/map-controls";

export type VoiceMapCommand = CameraAction | "recenter";

// Match whole commands so destination names remain available to building search.
export function parseVoiceMapCommand(text: string): VoiceMapCommand | null {
  const command = text.toLowerCase().replace(/[^a-z\s]/g, " ").trim()
    .replace(/\s+/g, " ").replace(/^please /, "").replace(/ please$/, "");
  const zoom = command.match(/^zoom (in|out)(?: on (?:the )?map)?$/);
  if (zoom) return zoom[1] === "in" ? "zoom-in" : "zoom-out";
  const pan = command.match(/^(?:move|pan)(?: the)?(?: map)? (left|right|up|down)$/);
  if (pan) return `pan-${pan[1]}` as VoiceMapCommand;
  if (command === "center map") return "recenter";
  if (/^(?:recenter|re center)(?: (?:the )?map)?$/.test(command)) return "recenter";
  return null;
}
