import type { NativeStackNavigationProp } from "expo-router";
import { useCallback, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";
import type { NavigationMode } from "../context/settings-context";
import {
  createNavigationModeRouting,
  type ModeReplacement,
} from "../utils/navigation-mode-routing";

type RootNavigation = NativeStackNavigationProp<Record<string, object | undefined>>;

export function useNavigationModeRouting(mode: NavigationMode, ready: boolean) {
  const latestMode = useRef<NavigationMode | null>(null);
  const lastNavigation = useRef<RootNavigation | null>(null);
  const coordinator = useRef<ReturnType<typeof createNavigationModeRouting> | null>(null);
  if (!coordinator.current) {
    coordinator.current = createNavigationModeRouting(
      () => latestMode.current,
      Platform.OS !== "web",
    );
  }
  const routing = coordinator.current;

  const apply = useCallback((navigation: RootNavigation, replacement?: ModeReplacement) => {
    if (!replacement) return;
    const state = navigation.getState();
    // Recheck immediately before a targeted replace. Never replace Settings or
    // a different route if another navigation action has already taken over.
    if (state.key !== replacement.stackKey ||
        state.routes[state.index]?.key !== replacement.sourceKey ||
        state.routes.some((route) => route.key === replacement.settingsKey)) return;
    navigation.dispatch({
      type: "REPLACE",
      target: replacement.stackKey,
      source: replacement.sourceKey,
      payload: { name: replacement.name },
    });
  }, []);

  useLayoutEffect(() => {
    latestMode.current = ready ? mode : null;
    const navigation = lastNavigation.current;
    if (navigation) apply(navigation, routing.stateChanged(navigation.getState()));
  }, [mode, ready, routing, apply]);

  useLayoutEffect(() => () => {
    routing.reset();
    lastNavigation.current = null;
  }, [routing]);

  // Stack owns listener registration and cleanup. Keep these at the persistent
  // layout: listeners on Settings itself may disappear before native completion.
  return useCallback(({ navigation, route }: {
    navigation: RootNavigation;
    route: { key: string };
  }) => {
    const currentState = () => {
      lastNavigation.current = navigation;
      return navigation.getState();
    };
    const synchronize = () => apply(navigation, routing.stateChanged(currentState()));
    return {
      state: synchronize,
      focus: synchronize,
      transitionStart: (event: { data: { closing: boolean } }) => {
        routing.transitionStart(currentState(), route.key, event.data.closing);
      },
      transitionEnd: (event: { data: { closing: boolean } }) => {
        apply(navigation, routing.transitionEnd(currentState(), route.key, event.data.closing));
      },
      gestureCancel: () => routing.gestureCancel(currentState(), route.key),
    };
  }, [routing, apply]);
}
