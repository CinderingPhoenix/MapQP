import Constants from "expo-constants";
import { osVersion } from "expo-device";
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
  os_version: string | null;
};
export type BugReportPayload = BugReportMetadata & {
  category: BugReportCategory;
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
// Metadata is prepared for phase 2; this module does not submit or persist data.
export function collectBugReportMetadata(): BugReportMetadata {
  const platform = Platform.OS;
  return {
    platform: platform === "ios" || platform === "android" || platform === "web"
      ? platform : "unknown",
    app_version: Constants.expoConfig?.version ?? null,
    os_version: osVersion ?? null,
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
      category: draft.category,
      description: draft.description.trim(),
      steps_to_reproduce: draft.stepsToReproduce.trim() || null,
      platform: metadata.platform,
      app_version: metadata.app_version,
      os_version: metadata.os_version,
    },
  };
}
