import { useEffect } from "react";
import { AppState } from "react-native";
import Constants from "expo-constants";
import { setServerOnline } from "../utils/server-status";
import { ensureBackendSession } from "../utils/backend-session";

// Use the existing lightweight public endpoint; no login or map download needed.
export function useServerMonitor() {
  useEffect(() => {
    const extra = Constants.expoConfig?.extra;
    const server = extra?.SERVER_IP ?? process.env.SERVER_IP;
    const port = extra?.PORT ?? process.env.PORT;
    if (!server || !port) {
      setServerOnline(false);
      return;
    }

    let active = AppState.currentState === "active";
    let disposed = false;
    let request: AbortController | null = null;
    const ping = async () => {
      if (!active || disposed || request) return;
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`http://${server}:${port}/auth/public-key`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (active && !disposed) {
          setServerOnline(response.ok);
          if (response.ok) {
            // Authentication failures must not mark a reachable server offline.
            await ensureBackendSession().catch(() => {});
          }
        }
      } catch {
        if (active && !disposed) setServerOnline(false);
      } finally {
        clearTimeout(timeout);
        request = null;
      }
    };

    // Startup already checks availability. Check again each minute and on resume.
    const interval = setInterval(() => { void ping(); }, 60000);
    const subscription = AppState.addEventListener("change", (state) => {
      const wasActive = active;
      active = state === "active";
      if (!active) request?.abort();
      else if (!wasActive) void ping();
    });
    return () => {
      disposed = true;
      clearInterval(interval);
      subscription.remove();
      request?.abort();
    };
  }, []);
}
