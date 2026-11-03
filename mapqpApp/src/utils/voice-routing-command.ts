import type { RoutingPreferences } from "./routing";

// Match the complete command so building names never become setting changes.
export function parseVoiceRoutingCommand(text: string): { preference: keyof RoutingPreferences; enabled: boolean } | null {
  const command = text.toLowerCase().replace(/[^a-z\s]/g, "").trim()
    .replace(/\s+/g, " ").replace(/^please /, "").replace(/ please$/, "");
  const match = command.match(/^(.+) (on|off)$/) ?? command.match(/^(turn on|turn off|enable|disable|avoid|allow|use) (.+)$/);
  if (!match) return null;
  const suffix = match[2] === "on" || match[2] === "off";
  const action = suffix ? match[2] : match[1];
  const target = (suffix ? match[1] : match[2]).replace(/^(?:the )?(?:avoid |avoiding )?/, "")
    .replace(/ (?:avoidance|restriction|setting)$/, "");
  let preference: keyof RoutingPreferences;
  if (/^(?:stairs|stair avoidance)$/.test(target)) preference = "avoidStairs";
  else if (/^(?:indoor|inside)(?: routes?| navigation| walkways)?$/.test(target)) preference = "avoidIndoorRoutes";
  else if (/^(?:inaccessible )?(?:crosswalks?|road crossings?)$/.test(target)) preference = "avoidInaccessibleCrosswalks";
  else return null;
  return { preference, enabled: ["turn on", "enable", "avoid", "on"].includes(action) };
}
