const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function compile(file, dependencies) {
  const output = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, { exports: output, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, console });
  return output;
}

function harness({ platform = 'android', foreground = false, nativeAvailable = true,
  running = true, notificationsGranted = true, locationGranted = true, decline = false, storage = new Map(),
  updateRoute = async route => route } = {}) {
  let task;
  let stateListener;
  let exitListener;
  let exited = false;
  const prompts = [];
  const routeKey = 'mapqp-background-route-v1';
  const updates = [], notifications = [], stopped = [], dismissed = [], started = [], channels = [];
  let notificationHandler;
  const native = { Platform: { OS: platform }, AppState: { currentState: foreground ? 'active' : 'background',
    addEventListener: (_event, listener) => { stateListener = listener; } },
    Alert: { alert: (_title, _body, buttons) => { prompts.push('explanation'); buttons[decline ? 0 : 1].onPress(); } } };
  const api = compile('src/utils/background-navigation.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key), setItem: async (key, value) => { storage.set(key, value); },
      removeItem: async key => { storage.delete(key); },
    },
    'expo-location': { hasStartedLocationUpdatesAsync: async () => running,
      getBackgroundPermissionsAsync: async () => ({ granted: locationGranted, canAskAgain: true }),
      requestBackgroundPermissionsAsync: async () => { prompts.push('location'); return { granted: !decline }; },
      startLocationUpdatesAsync: async name => { started.push(name); running = true; },
      Accuracy: { BestForNavigation: 1 }, ActivityType: { Fitness: 1 },
      stopLocationUpdatesAsync: async name => { stopped.push(name); running = false; } },
    'expo-notifications': {
      setNotificationHandler(value) { notificationHandler = value; },
      AndroidImportance: { HIGH: 4, LOW: 2 }, AndroidNotificationVisibility: { PUBLIC: 1 },
      setNotificationChannelAsync: async (...args) => channels.push(args),
      getPermissionsAsync: async () => ({ granted: notificationsGranted, canAskAgain: true }),
      requestPermissionsAsync: async () => { prompts.push('notifications'); return { granted: !decline }; },
      scheduleNotificationAsync: async notice => notifications.push(notice),
      dismissNotificationAsync: async id => dismissed.push(id),
      cancelScheduledNotificationAsync: async () => {},
    },
    'expo-task-manager': { defineTask: (_name, callback) => { task = callback; }, isAvailableAsync: async () => true },
    'react-native': native,
    './background-guidance': compile('src/utils/background-guidance.ts', {}),
    './background-rerouting': {
      saveBackgroundRoutingGraph: async () => {},
      updateBackgroundRoute: updateRoute,
    },
    '../../modules/navigation-notification': {
      updateNavigationNotification: async (...args) => { updates.push(args); return nativeAvailable; },
      clearNavigationNotification: async () => {},
      addNavigationExitListener: listener => { exitListener = listener; },
      isNavigationExitRequested: async () => exited,
    },
  });
  const route = { geometry: [[42, -71], [42.001, -71], [42.001, -70.999]],
    steps: [{ instruction: 'Turn right', pointIndex: 1 }, { instruction: 'Arrive at destination', pointIndex: 2 }],
    destination: 'Library', units: 'metric', expiresAt: Date.now() + 60000 };
  return { api, route, updates, notifications, stopped, dismissed, prompts, started, channels,
    notificationBehavior: () => notificationHandler.handleNotification(),
    get saved() { return storage.get(routeKey); },
    requestNativeExit() { exited = true; },
    async exit() {
      exited = true;
      exitListener();
      await task({ data: { locations: [] } });
    },
    async changeState(state) {
      native.AppState.currentState = state;
      stateListener(state);
      // A subsequent serialized task waits for the lifecycle change to finish.
      await task({ data: { locations: [] } });
    },
    fix: (lat, lng, accuracy = 5) => task({ data: { locations: [{ timestamp: Date.now(),
      coords: { latitude: lat, longitude: lng, accuracy } }] } }),
  };
}

test('persistent notification starts with a direction, then refreshes distance within the same maneuver', async () => {
  const h = harness();
  await h.api.syncBackgroundNavigation(h.route);
  assert.match(h.updates[0][2], /Turn right in .* m/);
  await h.fix(42.0002, -71);
  await h.fix(42.0004, -71);
  assert.equal(h.updates.length, 3);
  assert.notEqual(h.updates[1][2], h.updates[2][2]);
  assert.equal(h.notifications.length, 0);
});

test('foreground fixes cannot post a direction or arrival card even without the native updater', async () => {
  const h = harness({ foreground: true, nativeAvailable: false });
  await h.api.syncBackgroundNavigation(h.route);
  await h.fix(42.00096, -71);
  assert.match(h.updates.at(-1)[2], /Turn right now/);
  await h.fix(42.001, -70.999);
  assert.equal(h.notifications.length, 0);
});

test('returning to the app clears the card; leaving permits the same maneuver to notify again', async () => {
  const h = harness({ platform: 'ios' });
  await h.api.syncBackgroundNavigation(h.route);
  await h.fix(42.0002, -71);
  await h.changeState('active');
  assert.ok(h.dismissed.includes('mapqp-current-direction'));
  await h.changeState('background');
  await h.fix(42.0002, -71);
  assert.equal(h.notifications.length, 2);
});

test('already granted permissions do not prompt again on new routes', async () => {
  const h = harness({ running: false });
  await h.api.syncBackgroundNavigation(h.route);
  await h.api.stopBackgroundNavigation();
  await h.api.syncBackgroundNavigation(h.route);
  assert.equal(h.prompts.length, 0);
});

test('notification denial is remembered across routes and cold starts', async () => {
  const storage = new Map();
  const h = harness({ storage, running: false, notificationsGranted: false, decline: true });
  await h.api.syncBackgroundNavigation(h.route);
  await h.api.syncBackgroundNavigation(h.route);
  assert.deepEqual(h.prompts, ['notifications']);
  const restarted = harness({ storage, running: false, notificationsGranted: false, decline: true });
  await restarted.api.syncBackgroundNavigation(restarted.route);
  assert.equal(restarted.prompts.length, 0);
});

test('declining background explanation is remembered, and enabling it in Settings is detected', async () => {
  const storage = new Map();
  const h = harness({ storage, running: false, locationGranted: false, decline: true });
  await h.api.syncBackgroundNavigation(h.route);
  await h.api.syncBackgroundNavigation(h.route);
  assert.deepEqual(h.prompts, ['explanation']);
  const restarted = harness({ storage, running: false, locationGranted: true });
  await restarted.api.syncBackgroundNavigation(restarted.route);
  assert.equal(restarted.prompts.length, 0);
  assert.ok(restarted.saved);
});

test('arrival replaces the service with an arrival notification and stops tracking', async () => {
  const h = harness();
  await h.api.syncBackgroundNavigation(h.route);
  await h.fix(42.001, -70.999);
  assert.equal(h.notifications[0].content.title, 'You have arrived');
  assert.equal(h.notifications[0].content.sticky, false);
  assert.equal(h.stopped.length, 1);
  assert.equal(h.saved, undefined);
});

test('cancelled routes cannot update the notification on subsequent fixes', async () => {
  const h = harness();
  await h.api.syncBackgroundNavigation(h.route);
  await h.api.stopBackgroundNavigation();
  await h.fix(42.0005, -71);
  assert.equal(h.updates.length, 1);
  assert.equal(h.stopped.length, 1);
  assert.ok(h.dismissed.includes('mapqp-current-direction'));
});

test('iOS keeps background maneuver notifications', async () => {
  const h = harness({ platform: 'ios' });
  await h.api.syncBackgroundNavigation(h.route);
  await h.fix(42.0002, -71);
  await h.fix(42.0004, -71);
  assert.equal(h.updates.length, 0);
  assert.equal(h.notifications.length, 1);
});

test('poor GPS fixes cannot overwrite the direction', async () => {
  const h = harness();
  await h.api.syncBackgroundNavigation(h.route);
  await h.fix(42.0005, -71, 80);
  assert.equal(h.updates.length, 1);
});

test('notification receives a maneuver, ETA and route progress', async () => {
  const h = harness();
  await h.api.syncBackgroundNavigation({ ...h.route, duration: 300 });
  await h.fix(42.0005, -71);
  const presentation = h.updates.at(-1)[3];
  assert.equal(presentation.maneuver, 'right');
  assert.ok(presentation.progress > 0 && presentation.progress < 100);
  assert.ok(presentation.arrivalTime > Date.now());
});

test('Exit navigation stops background tracking and queued fixes cannot revive it', async () => {
  const h = harness();
  await h.api.syncBackgroundNavigation(h.route);
  const beforeExit = h.updates.length;
  await h.exit();
  await h.fix(42.0005, -71);
  assert.equal(h.saved, undefined);
  assert.equal(h.updates.length, beforeExit);
  assert.equal(h.stopped.length, 1);
});

test('foreground route refreshes a registered task whose service may have been lost during an upgrade', async () => {
  const h = harness({ foreground: true, running: true });
  await h.api.syncBackgroundNavigation(h.route);
  assert.deepEqual(h.started, ['mapqp-navigation-location']);
  assert.equal(h.prompts.length, 0);
});

test('direction updates and arrival notifications are silent', async () => {
  for (const platform of ['android', 'ios']) {
    const h = harness({ platform, nativeAvailable: false });
    await h.api.syncBackgroundNavigation(h.route);
    await h.fix(42.0002, -71);
    await h.fix(42.0005, -71);
    await h.fix(42.001, -70.999);
    assert.ok(h.notifications.length >= 2);
    assert.ok(h.notifications.every(n => n.content.sound === false));
    assert.equal((await h.notificationBehavior()).shouldPlaySound, false);
  }
});

test('fallback uses a new silent channel rather than the previously alerting channel', async () => {
  const h = harness({ running: false });
  await h.api.syncBackgroundNavigation(h.route);
  const [id, channel] = h.channels[0];
  assert.equal(id, 'navigation-directions-silent-v2');
  assert.equal(channel.sound, null);
  assert.equal(channel.enableVibrate, false);
  assert.equal(channel.importance, 2);
});

test('a background replacement route updates the direction card and persists its revision', async () => {
  const h = harness({ updateRoute: async route => ({ ...route, revision: 1,
    geometry: [[42.0005, -70.999], [42.001, -70.999]],
    steps: [{ instruction: 'Continue straight', pointIndex: 1 }] }) });
  await h.api.syncBackgroundNavigation(h.route);
  await h.fix(42.0005, -70.999);
  assert.match(h.updates.at(-1)[2], /Continue straight/);
  assert.equal(JSON.parse(h.saved).revision, 1);
});

test('exiting during recalculation cannot post or save a replacement route', async () => {
  const h = harness({ updateRoute: async route => { h.requestNativeExit(); return { ...route, revision: 1 }; } });
  await h.api.syncBackgroundNavigation(h.route);
  await h.fix(42.0005, -70.999);
  assert.equal(h.saved, undefined);
  assert.equal(h.updates.length, 1);
});

test('foreground focus sync cannot replace a newer background route with the old geometry', async () => {
  const storage = new Map();
  const h = harness({ storage });
  const route = { ...h.route, navigationId: 'session-1', revision: 0 };
  await h.api.syncBackgroundNavigation(route);
  const replacement = { ...route, revision: 1, geometry: [[42, -71], [42.001, -70.999]] };
  storage.set('mapqp-background-route-v1', JSON.stringify(replacement));
  await h.api.syncBackgroundNavigation(route);
  assert.equal(JSON.parse(h.saved).revision, 1);
  assert.deepEqual(JSON.parse(h.saved).geometry, replacement.geometry);
});
