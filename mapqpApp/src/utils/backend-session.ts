import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

let pending: Promise<void> | null = null;

// Recover a missing backend token using the same exchange as Microsoft login.
// Failures leave the local login intact and can be retried on the next ping.
export function ensureBackendSession(): Promise<void> {
  if (pending) return pending;
  pending = recoverSession().finally(() => { pending = null; });
  return pending;
}

async function recoverSession(): Promise<void> {
  const extra = Constants.expoConfig?.extra;
  const server = extra?.SERVER_IP ?? process.env.SERVER_IP;
  const port = extra?.PORT ?? process.env.PORT;
  if (!server || !port) return;
  const session = await SecureStore.getItemAsync("mapqp_microsoft_session");
  if (!session || await SecureStore.getItemAsync("mapqp_access_token")) return;
  const credentials = JSON.parse(session);
  if (typeof credentials.accessToken !== "string" || !credentials.accessToken) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`http://${server}:${port}/auth/microsoft-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: credentials.accessToken }),
      signal: controller.signal,
    });
    if (!response.ok) return;
    const data = await response.json();
    if (typeof data.access_token !== "string" || !data.access_token) return;
    // Do not attach a response to a login that was logged out or replaced.
    if (await SecureStore.getItemAsync("mapqp_microsoft_session") !== session) return;
    await SecureStore.setItemAsync("mapqp_access_token", data.access_token);
  } finally {
    clearTimeout(timeout);
  }
}
