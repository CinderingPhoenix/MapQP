import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useKeepAwake } from "expo-keep-awake";
import { useSettings } from "../context/settings-context";

function Awake() {
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  return null;
}

export function NavigationKeepAwake() {
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const { batterySaverEnabled } = useSettings();
  return focused && !batterySaverEnabled ? <Awake /> : null;
}
