import type { NavigationMode } from "../context/settings-context";

type NavigationRoute = "standard-navigation" | "accessibility-navigation";

export type ModeRoutingState = {
  key: string;
  index: number;
  routes: readonly { key: string; name: string }[];
};

export type ModeReplacement = {
  stackKey: string;
  sourceKey: string;
  settingsKey: string;
  name: NavigationRoute;
};

function isNavigationRoute(name: string): name is NavigationRoute {
  return name === "standard-navigation" || name === "accessibility-navigation";
}

// A Settings return is a two-part handshake: JS has removed Settings AND native
// has finished revealing its source. Neither event alone permits a replacement.
export function createNavigationModeRouting(
  getMode: () => NavigationMode | null,
  nativeTransitions: boolean,
) {
  let pending: {
    stackKey: string;
    settingsKey: string;
    sourceKey: string;
    revealStarted: boolean;
    revealComplete: boolean;
  } | null = null;

  function observe(state: ModeRoutingState) {
    const active = state.routes[state.index];
    if (active?.name === "settings" || active?.name === "accessibility-settings") {
      const source = state.routes[state.index - 1];
      if (!source || !isNavigationRoute(source.name)) {
        pending = null;
      } else if (pending?.settingsKey !== active.key || pending.stackKey !== state.key) {
        pending = {
          stackKey: state.key,
          settingsKey: active.key,
          sourceKey: source.key,
          revealStarted: false,
          revealComplete: false,
        };
      }
    } else if (pending && (state.key !== pending.stackKey || active?.key !== pending.sourceKey)) {
      // Explicit exits to landing/loading/auth are not Settings returns.
      pending = null;
    }
  }

  function reconcile(state: ModeRoutingState): ModeReplacement | undefined {
    const active = state.routes[state.index];
    const returning = pending;
    if (!returning || active?.key !== returning.sourceKey ||
        state.routes.some((route) => route.key === returning.settingsKey) ||
        (nativeTransitions && !returning.revealComplete)) return;

    const mode = getMode();
    if (!mode) return;
    const name: NavigationRoute = mode === "standard"
      ? "standard-navigation" : "accessibility-navigation";
    // Consume before dispatch: duplicate state/focus/end events cannot dispatch
    // again, even if the replacement's state update has not arrived yet.
    pending = null;
    if (active.name === name) return;
    return {
      stackKey: returning.stackKey,
      sourceKey: returning.sourceKey,
      settingsKey: returning.settingsKey,
      name,
    };
  }

  return {
    stateChanged(state: ModeRoutingState) {
      observe(state);
      return reconcile(state);
    },
    transitionStart(state: ModeRoutingState, key: string, closing: boolean) {
      observe(state);
      if (pending?.sourceKey === key) {
        pending.revealStarted = !closing;
        pending.revealComplete = false;
      }
    },
    transitionEnd(state: ModeRoutingState, key: string, closing: boolean) {
      observe(state);
      if (pending?.sourceKey === key && !closing && pending.revealStarted) {
        pending.revealComplete = true;
      }
      return reconcile(state);
    },
    gestureCancel(state: ModeRoutingState, key: string) {
      observe(state);
      if (pending && (pending.settingsKey === key || pending.sourceKey === key)) {
        pending.revealStarted = false;
        pending.revealComplete = false;
      }
    },
    reset() {
      pending = null;
    },
  };
}
