import type { NavigationPoint } from "./routing";

export type DirectionStep = {
  instruction: string;
  pointIndex: number;
  turnDegrees?: number;
};

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = deg2rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(deg2rad(lat2));
  const x = Math.cos(deg2rad(lat1)) * Math.sin(deg2rad(lat2)) - Math.sin(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function closestGeometryIndex(geometry: [number, number][], point: [number, number]): number {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < geometry.length; index++) {
    const distance = getDistanceFromLatLonInMeters(geometry[index][0], geometry[index][1], point[0], point[1]);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }
  return closestIndex;
}

export function formatDirectionInstruction(step: DirectionStep, style: "natural" | "degrees"): string {
  if (style === "natural" || step.turnDegrees === undefined || step.instruction === "Arrive at destination") {
    return step.instruction;
  }
  const degrees = Math.round(Math.abs(step.turnDegrees));
  if (degrees >= 150) return "Turn around";
  if (degrees <= 15) return "Continue straight";
  if (step.turnDegrees > 0) return `Turn right ${degrees}°`;
  return `Turn left ${degrees}°`;
}

export function generateDirections(geometry: [number, number][], navigationPath: NavigationPoint[] = []): DirectionStep[] {
  const steps: DirectionStep[] = [];
  if (!geometry || geometry.length < 2) return steps;

  for (let index = 1; index < navigationPath.length - 1; index++) {
    const decisionPoint = navigationPath[index];
    if (decisionPoint.connectionCount <= 2) continue;

    const previousPoint = navigationPath[index - 1].coordinate;
    const currentPoint = decisionPoint.coordinate;
    const nextPoint = navigationPath[index + 1].coordinate;
    const incomingBearing = getBearing(...previousPoint, ...currentPoint);
    const outgoingBearing = getBearing(...currentPoint, ...nextPoint);
    let diff = outgoingBearing - incomingBearing;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    // Small changes in mapped path geometry are bends, not maneuvers.
    // Do not add a straight-ahead instruction for these junctions.
    if (Math.abs(diff) <= 30) continue;
    const instruction = Math.abs(diff) >= 150 ? "Turn around" : diff > 45 ? "Turn right" : diff > 0 ? "Slight right" : diff < -45 ? "Turn left" : "Slight left";
    const pointIndex = closestGeometryIndex(geometry, currentPoint);
    const lastStep = steps[steps.length - 1];
    // Smoothed geometry can have many vertices within a few meters. Merge
    // repeated instructions by walking distance rather than vertex count.
    if (lastStep && pointIndex <= lastStep.pointIndex) continue;
    if (lastStep && lastStep.instruction === instruction &&
        getSegmentDistance(geometry, lastStep.pointIndex, pointIndex) <= 10) continue;
    steps.push({ instruction, pointIndex, turnDegrees: diff });
  }
  steps.push({ instruction: "Arrive at destination", pointIndex: geometry.length - 1 });
  return steps;
}

export function getSegmentDistance(geometry: [number, number][], startIndex: number, endIndex: number): number {
  if (!geometry || startIndex >= endIndex) return 0;
  let totalMeters = 0;
  for (let i = startIndex; i < endIndex && i < geometry.length - 1; i++) totalMeters += getDistanceFromLatLonInMeters(...geometry[i], ...geometry[i + 1]);
  return Math.round(totalMeters);
}

