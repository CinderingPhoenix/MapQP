import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRoutingGraphSnapshot, initRoutingGraph, routeBetween } from "./routing";
import { generateDirections, formatDirectionInstruction } from "./navigation-directions";
import { getBackgroundGuidance, type BackgroundRoute, type MotionFix } from "./background-guidance";

const GRAPH_KEY = "mapqp-background-routing-graph-v1";

export async function saveBackgroundRoutingGraph() {
  const graph = getRoutingGraphSnapshot();
  if (graph) await AsyncStorage.setItem(GRAPH_KEY, JSON.stringify(graph));
}

export async function updateBackgroundRoute(route: BackgroundRoute,
  fix: MotionFix) {
  if (getBackgroundGuidance(route, fix.latitude, fix.longitude).key !== "off-route") {
    route.offRouteSamples = 0;
    route.rerouteFailed = false;
    return route;
  }
  // Require two distinct, precise off-route fixes; noisy GPS must not reroute.
  if ((fix.accuracy ?? Infinity) > 20 || fix.timestamp <= (route.lastOffRouteFix ?? 0)) return route;
  route.lastOffRouteFix = fix.timestamp;
  route.offRouteSamples = (route.offRouteSamples ?? 0) + 1;
  if (route.offRouteSamples < 2 || Date.now() - (route.lastRerouteAttempt ?? 0) < 15000) return route;
  route.lastRerouteAttempt = Date.now();
  try {
    if (!route.destinationPoint || !route.preferences) throw new Error("Missing saved routing preferences");
    // Headless tasks do not mount the loading screen which initializes routing.
    const saved = await AsyncStorage.getItem(GRAPH_KEY);
    if (!saved) throw new Error("Missing saved routing graph");
    const graph = JSON.parse(saved) as NonNullable<ReturnType<typeof getRoutingGraphSnapshot>>;
    initRoutingGraph(graph.points, graph.buildings);
    const origin = { latitude: fix.latitude, longitude: fix.longitude, label: "Your current location" };
    const plan = await routeBetween(origin, route.destinationPoint, route.preferences);
    if (plan.geometry.length < 2) throw new Error("Invalid replacement route");
    route.geometry = plan.geometry;
    route.duration = plan.duration;
    route.steps = generateDirections(plan.geometry, plan.navigationPath).map(step => ({ ...step,
      instruction: formatDirectionInstruction(step, route.directionStyle ?? "natural") }));
    route.reroutePlan = { ...plan, origin };
    route.revision = (route.revision ?? 0) + 1;
    route.offRouteSamples = 0;
    route.rerouteFailed = false;
    delete route.lastNotice;
  } catch (error) {
    route.rerouteFailed = true;
    console.warn("Background rerouting will retry", error);
  }
  return route;
}
