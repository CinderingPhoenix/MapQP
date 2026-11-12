import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const BUG_REPORT_TEXT_LIMIT = 5000;

export const BUG_REPORT_CATEGORIES = [
  { value: "navigation", label: "Navigation" },
  { value: "accessibility", label: "Accessibility" },
  { value: "settings", label: "Settings" },
  { value: "login", label: "Login" },
  { value: "other", label: "Other" },
] as const;

export type BugReportCategory = (typeof BUG_REPORT_CATEGORIES)[number]["value"];
export type BugReportDraft = {
  category: BugReportCategory | null;
  description: string;
  stepsToReproduce: string;
};
export type BugReportErrors = Partial<Record<keyof BugReportDraft, string>>;
export type BugReportMetadata = {
  platform: "ios" | "android" | "web" | "unknown";
  app_version: string | null;
};
export type BugReportPayload = BugReportMetadata & {
  category: (typeof BUG_REPORT_CATEGORIES)[number]["label"];
  description: string;
  steps_to_reproduce: string | null;
};

export function validateBugReport(draft: BugReportDraft): BugReportErrors {
  const errors: BugReportErrors = {};
  if (!BUG_REPORT_CATEGORIES.some(({ value }) => value === draft.category)) {
    errors.category = "Choose a problem category.";
  }
  if (!draft.description.trim()) {
    errors.description = "Describe the problem. A description is required.";
  } else if (draft.description.length > BUG_REPORT_TEXT_LIMIT) {
    errors.description = "Description must be 5,000 characters or fewer.";
  }
  if (draft.stepsToReproduce.length > BUG_REPORT_TEXT_LIMIT) {
    errors.stepsToReproduce = "Steps to reproduce must be 5,000 characters or fewer.";
  }
  return errors;
}

// Explicit allowlist: never spread device information or app configuration.
export function collectBugReportMetadata(): BugReportMetadata {
  const platform = Platform.OS;
  return {
    platform: platform === "ios" || platform === "android" || platform === "web"
      ? platform : "unknown",
    app_version: Constants.expoConfig?.version?.slice(0, 100) ?? null,
  };
}

export function prepareBugReport(
  draft: BugReportDraft,
  metadata: BugReportMetadata,
): { valid: false; errors: BugReportErrors } | { valid: true; payload: BugReportPayload } {
  const errors = validateBugReport(draft);
  if (Object.keys(errors).length || draft.category === null) {
    return { valid: false, errors };
  }
  return {
    valid: true,
    payload: {
      category: BUG_REPORT_CATEGORIES.find(({ value }) => value === draft.category)!.label,
      description: draft.description.trim(),
      steps_to_reproduce: draft.stepsToReproduce.trim() || null,
      platform: metadata.platform,
      app_version: metadata.app_version,
    },
  };
}

export async function submitBugReport(payload: BugReportPayload): Promise<void> {
  const extra = Constants.expoConfig?.extra;
  const server = extra?.SERVER_IP ?? process.env.SERVER_IP;
  const port = extra?.PORT ?? process.env.PORT;
  if (!server || !port) throw new Error("The report server is not configured.");
  const token = await SecureStore.getItemAsync("mapqp_access_token");
  if (!token) throw new Error("Please sign in before submitting a report.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`http://${server}:${port}/bug-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("Your session could not be verified. Please sign in again.");
    }
    if (response.status !== 201) throw new Error("The server could not accept your report. Please try again.");
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The request timed out. Your report may have been received.");
    if (error instanceof TypeError) throw new Error("Unable to reach the server. Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
