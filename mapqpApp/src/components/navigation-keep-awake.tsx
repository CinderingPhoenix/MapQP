import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useSettings } from "../context/settings-context";
import { useAppActive } from "../hooks/use-app-active";

function ScreenAwake() {
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  return null;
}

export function NavigationKeepAwake() {
  const { batterySaverEnabled } = useSettings();
  const active = useAppActive();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  return !batterySaverEnabled && focused && active ? <ScreenAwake /> : null;
}
