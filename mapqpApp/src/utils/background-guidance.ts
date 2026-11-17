import type { RoutePoint, RoutingPreferences, WalkingRoute } from "./routing";

export type MotionFix = { latitude: number; longitude: number; timestamp: number;
  accuracy: number | null; heading?: number | null; speed?: number | null };

export type BackgroundRoute = {
  motionFix?: MotionFix;
  geometry: [number, number][];
  steps: { instruction: string; pointIndex: number }[];
  destination: string;
  units: "metric" | "imperial";
  expiresAt: number;
  duration?: number;
  lastNotice?: string;
  navigationId?: string;
  destinationPoint?: RoutePoint;
  preferences?: RoutingPreferences;
  directionStyle?: "natural" | "degrees";
  revision?: number;
  reroutePlan?: WalkingRoute & { origin: RoutePoint };
  offRouteSamples?: number;
  lastOffRouteFix?: number;
  lastRerouteAttempt?: number;
  rerouteFailed?: boolean;
};

function distance(a: [number, number], b: [number, number]) {
  const radians = Math.PI / 180;
  const x = (a[1] - b[1]) * radians * Math.cos((a[0] + b[0]) * radians / 2);
  const y = (a[0] - b[0]) * radians;
  return Math.hypot(x, y) * 6371000;
}

export function getBackgroundGuidance(route: BackgroundRoute, lat: number, lng: number) {
  const point: [number, number] = [lat, lng];
  let nearest = Infinity;
  let segment = 0;
  let fraction = 0;
  for (let i = 0; i < route.geometry.length - 1; i++) {
    const a = route.geometry[i], b = route.geometry[i + 1];
    const cos = Math.cos(a[0] * Math.PI / 180);
    const x = (b[1] - a[1]) * cos, y = b[0] - a[0];
    const t = Math.max(0, Math.min(1, (((lng - a[1]) * cos * x + (lat - a[0]) * y) / (x * x + y * y)) || 0));
    const d = distance(point, [a[0] + t * y, a[1] + t * (b[1] - a[1])]);
    if (d < nearest) { nearest = d; segment = i; fraction = t; }
  }
  let total = 0, completed = 0;
  for (let i = 0; i < route.geometry.length - 1; i++) {
    const length = distance(route.geometry[i], route.geometry[i + 1]);
    total += length;
    if (i < segment) completed += length;
    else if (i === segment) completed += length * fraction;
  }
  const progress = total > 0 ? Math.max(0, Math.min(100, completed / total * 100)) : 0;
  const presentation = {
    progress,
    arrivalTime: Date.now() + (route.duration ?? total / 1.4) * (1 - progress / 100) * 1000,
  };
  if (nearest > 30) return { ...presentation, maneuver: "off-route", key: "off-route",
    body: route.rerouteFailed ? "Unable to find a route with your routing preferences. Retrying automatically."
      : "Recalculating your route…", arrived: false };
  const end = route.geometry[route.geometry.length - 1];
  if (distance(point, end) <= 8) return { ...presentation, progress: 100, maneuver: "arrive", key: "arrival", body: `You have arrived at ${route.destination}.`, arrived: true };
  const step = route.steps.find(s => s.pointIndex > segment);
  if (!step) return { ...presentation, maneuver: "straight", key: "continue", body: "Continue towards your destination.", arrived: false };
  let meters = distance(route.geometry[segment], route.geometry[segment + 1]) * (1 - fraction);
  for (let i = segment + 1; i < step.pointIndex; i++) meters += distance(route.geometry[i], route.geometry[i + 1]);
  const stage = meters <= 10 ? "now" : meters <= 30 ? "near" : "ahead";
  const amount = route.units === "imperial" ? `${Math.round(meters * 3.28084)} ft` : `${Math.round(meters)} m`;
  const instruction = step.instruction.toLowerCase();
  const maneuver = /around|u.turn/.test(instruction) ? "uturn"
    : instruction.includes("left") ? "left" : instruction.includes("right") ? "right"
      : instruction.includes("arrive") ? "arrive" : "straight";
  return { ...presentation, maneuver, key: `${step.pointIndex}:${stage}`, body: `${step.instruction}${stage === "now" ? " now" : ` in ${amount}`}`, arrived: false };
}
