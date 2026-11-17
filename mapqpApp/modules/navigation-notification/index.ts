import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

const native = Platform.OS === "android"
  ? requireOptionalNativeModule<{
    update(task: string, title: string, body: string, progress: number, arrivalTime: number, maneuver: string): Promise<boolean>;
    clear(): Promise<void>;
    isExitRequested(): Promise<boolean>;
    consumeExitRequest(): Promise<boolean>;
    addListener(event: string, listener: () => void): { remove(): void };
  }>("NavigationNotification")
  : null;

export async function updateNavigationNotification(task: string, title: string, body: string,
  guidance: { progress: number; arrivalTime: number; maneuver: string }) {
  return native ? native.update(task, title, body, guidance.progress, guidance.arrivalTime, guidance.maneuver) : false;
}

export async function clearNavigationNotification() {
  await native?.clear();
}

export function addNavigationExitListener(listener: () => void) {
  return native?.addListener("exitNavigation", listener);
}

export async function consumeNavigationExit() {
  return native ? native.consumeExitRequest() : false;
}

export async function isNavigationExitRequested() {
  return native ? native.isExitRequested() : false;
}
