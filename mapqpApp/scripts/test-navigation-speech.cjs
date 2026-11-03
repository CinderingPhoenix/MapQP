const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function compile(relative, dependencies, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, console, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, ...globals });
  return exports;
}
const speechModule = compile('utils/navigation-speech.ts', { 'react-native': { Platform: { OS: 'ios' } } });
const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function engineHarness() {
  const spoken = [];
  let stops = 0;
  const engine = {
    speak(text, options) { spoken.push({ text, options }); },
    async stop() { stops++; },
  };
  return { engine, spoken, get stops() { return stops; } };
}

test('startup is protected; optional guidance is dropped and pending maneuvers stay bounded/latest', async () => {
  const h = engineHarness();
  const speech = new speechModule.NavigationSpeech(h.engine);
  speech.request('Startup', 'startup');
  await drain();
  assert.equal(speech.request('Face right', 'optional'), false);
  speech.request('In 25 meters, turn left', 'maneuver');
  speech.request('In 5 meters, turn left', 'maneuver');
  speech.request('Turn left now', 'maneuver');
  assert.equal(h.spoken.length, 1);
  assert.equal(h.stops, 0);
  h.spoken[0].options.onDone();
  await drain();
  assert.deepEqual(h.spoken.map((item) => item.text), ['Startup', 'Turn left now']);
});

test('maneuver preempts optional speech; stale completion cannot consume newer guidance', async () => {
  const h = engineHarness();
  const speech = new speechModule.NavigationSpeech(h.engine);
  speech.request('Optional orientation', 'optional');
  await drain();
  const stale = h.spoken[0].options.onStopped;
  speech.request('Turn right now', 'maneuver');
  speech.request('You have arrived', 'arrival');
  stale();
  await drain();
  assert.equal(h.stops, 1);
  assert.equal(h.spoken[1].text, 'Turn right now');
  h.spoken[1].options.onDone();
  await drain();
  assert.equal(h.spoken[2].text, 'You have arrived');
});

test('mute/cancel invalidate active, scheduled, and pending speech before a new route', async () => {
  const h = engineHarness();
  const speech = new speechModule.NavigationSpeech(h.engine);
  speech.request('Canceled before dispatch', 'startup');
  speech.cancel();
  await drain();
  assert.equal(h.spoken.length, 0);
  speech.request('Route A', 'startup');
  await drain();
  speech.request('Pending turn', 'maneuver');
  speech.setEnabled(false);
  h.spoken[0].options.onDone();
  assert.equal(speech.request('Muted direction', 'maneuver'), false);
  await drain();
  assert.equal(h.spoken.length, 1);
  speech.setEnabled(true);
  speech.request('Route B', 'startup');
  await drain();
  assert.deepEqual(h.spoken.map((item) => item.text), ['Route A', 'Route B']);
});

test('a new route waits for native stop completion and cannot be canceled by an old callback', async () => {
  const h = engineHarness();
  let releaseStop;
  h.engine.stop = () => new Promise((resolve) => { releaseStop = resolve; });
  const speech = new speechModule.NavigationSpeech(h.engine);
  speech.request('Old route', 'startup');
  await drain();
  speech.cancel();
  speech.request('New route', 'startup');
  await drain();
  assert.equal(h.spoken.length, 1);
  releaseStop();
  await drain();
  h.spoken[0].options.onStopped();
  speech.request('Important turn', 'maneuver');
  await drain();
  assert.equal(h.spoken.length, 2);
  h.spoken[1].options.onDone();
  await drain();
  assert.equal(h.spoken[2].text, 'Important turn');
});

// Execute the real map hook and formatting/direction-generation code. Inject
// processed GPS state at the speech boundary; filtering and routing are separate.
function navigationHarness({ mode = 'standard', reader = false, routing, alert } = {}) {
  const h = engineHarness();
  const slots = [];
  const stateSlots = new Map();
  let cursor = 0;
  let stateCursor = 0;
  let dirty = true;
  let result;
  let now = 100000;
  const effects = [];
  const intervals = new Map();
  let nextTimer = 1;
  const source = ts.createSourceFile('map-logic.ts', fs.readFileSync(path.join(__dirname, '../src/utils/map-logic.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const hook = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'useMapNavigation');
  const stateNames = hook.body.statements.flatMap((statement) => ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.filter((node) => ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === 'useState').map((node) => node.name.elements[0].getText(source)) : []);
  const react = {
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++;
      stateSlots.set(stateNames[stateCursor++], index);
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, (next) => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index].deps[i]))) slots[index] = { value: factory(), deps };
      return slots[index].value;
    },
    useCallback: (callback, deps) => react.useMemo(() => callback, deps),
    useEffect(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !deps || deps.some((dep, i) => !Object.is(dep, slots[index].deps[i]))) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  const geometry = [[0, 0], [0, 0.0009], [0.0009, 0.0009]];
  const plan = {
    geometry, distance: 200, duration: 180,
    navigationPath: geometry.map((coordinate, index) => ({ coordinate, connectionCount: index === 1 ? 3 : 1 })),
  };
  let accessibilityCalls = 0;
  const module = compile('utils/map-logic.ts', {
    react,
    'expo-router': { useFocusEffect: (callback) => react.useEffect(callback, [callback]) },
    '@/context/settings-context': { useSettings: () => ({ distanceUnits: 'metric', directionStyle: 'natural', navigationMode: mode, deviceAccessibility: { screenReaderEnabled: reader } }) },
    // Kept as a trap if a VoiceOver-specific speech branch is reintroduced.
    '@/hooks/use-device-accessibility': { useDeviceAccessibility: () => ({ screenReaderEnabled: reader }) },
    'expo-speech': h.engine,
    'expo-secure-store': { getItemAsync: async () => null, setItemAsync: async () => {} },
    'expo-haptics': { impactAsync: async () => {}, ImpactFeedbackStyle: { Medium: 'Medium' } },
    'expo-location': {
      Accuracy: { BestForNavigation: 1 }, requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
      watchPositionAsync: async () => ({ remove() {} }), watchHeadingAsync: async () => ({ remove() {} }),
    },
    'react-native': { Alert: { alert: alert || (() => {}) }, Platform: { OS: 'ios' }, Vibration: { vibrate() {} }, AccessibilityInfo: {
      announceForAccessibility() { accessibilityCalls++; }, announceForAccessibilityWithOptions() { accessibilityCalls++; },
    } },
    './routing': { ...compile('utils/routing.ts', {}), routeBetween: async (...args) => {
      if (routing) await routing(...args);
      return plan;
    } },
    './navigation-speech': speechModule,
  }, {
    setInterval(callback, ms) { const id = nextTimer++; intervals.set(id, { callback, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
    Date: class extends Date { static now() { return now; } },
  });
  const buildings = [{ id: 'library', name: 'Library', entrances: [{ name: 'Main', latitude: 0.0009, longitude: 0.0009, accessibility: true }] }];
  function render() {
    let count = 0;
    while (dirty) {
      assert.ok(++count < 30, 'hook renders should settle');
      dirty = false; cursor = 0; stateCursor = 0;
      result = module.useMapNavigation(buildings);
      while (effects.length) effects.shift()();
    }
  }
  async function flush() {
    for (let i = 0; i < 20; i++) { render(); await Promise.resolve(); }
  }
  function inject(name, value) { slots[stateSlots.get(name)].value = value; dirty = true; }
  render();
  return {
    h, module, intervals, flush,
    get result() { return result; },
    get accessibilityCalls() { return accessibilityCalls; },
    async start(latitude = 0, longitude = 0) {
      inject('coordinates', { latitude, longitude, accuracy: 2, heading: 90 });
      await flush();
      result.handleDestinationChange('library');
      await flush();
    },
    async position(latitude, longitude, index = 0) {
      inject('coordinates', { latitude, longitude, accuracy: 2, heading: 90 });
      inject('currentRouteIndex', index);
      await flush();
    },
    async heading(degrees) { inject('currentHeading', degrees); now += 9000; await flush(); },
    async finish() { h.spoken.at(-1).options.onDone(); await flush(); },
  };
}

for (const accept of [true, false]) test(`fallback route requires consent: ${accept ? 'accept' : 'cancel'}`, async () => {
  const n = navigationHarness({ mode: 'accessibility',
    routing: async (_origin, _destination, options) => {
      if (options.avoidInaccessibleCrosswalks) throw new Error('No route');
    },
  });
  await n.start();
  assert.equal(n.result.routeAlternative.join(','), 'avoidInaccessibleCrosswalks');
  assert.equal(n.result.route, null);
  assert.equal(n.h.spoken.length, 0);
  n.result.answerRouteAlternative(accept);
  await n.flush();
  assert.equal(n.result.routeAlternative, null);
  assert.equal(!!n.result.route, accept);
  assert.equal(n.h.spoken.length, accept ? 1 : 0);
});

for (const mode of ['standard', 'accessibility']) for (const reader of [false, true]) {
  test(`${mode}, VoiceOver ${reader}: Expo startup uses generated instruction/distance; GPS, maneuvers, arrival`, async () => {
    const n = navigationHarness({ mode, reader });
    await n.start();
    assert.equal(n.h.spoken.length, 1);
    assert.equal(n.h.spoken[0].text, `Navigating to Library. ${n.result.nextStep.instruction} in ${n.module.formatDistance(n.result.distToNextStepMeters, 'metric')}.`);
    assert.equal(n.accessibilityCalls, 0);
    await n.finish();
    for (let i = 0; i < 10; i++) await n.position(0, i / 1000000);
    assert.equal(n.h.spoken.length, 1);
    await n.position(0, 0.00072);
    assert.match(n.h.spoken.at(-1).text, /^In 25 meters, Turn left$/);
    const before = n.h.spoken.length;
    for (let i = 0; i < 10; i++) await n.position(0, 0.00072);
    assert.equal(n.h.spoken.length, before);
    await n.finish();
    await n.position(0, 0.000872);
    assert.match(n.h.spoken.at(-1).text, /^In 5 meters, Turn left$/);
    await n.finish();
    await n.position(0, 0.00089);
    assert.equal(n.h.spoken.at(-1).text, 'Turn left now');
    await n.finish();
    await n.position(0.0009, 0.0009, 2);
    assert.match(n.h.spoken.at(-1).text, /^You have arrived/);
    await n.finish();
    assert.equal(n.accessibilityCalls, 0);
  });
}

test('VoiceOver mute suppresses startup and guidance; unmute permits later maneuvers', async () => {
  const n = navigationHarness({ reader: true, mode: 'accessibility' });
  n.result.toggleMute();
  await n.flush();
  await n.start();
  await n.position(0, 0.00072);
  await n.heading(270);
  for (const timer of n.intervals.values()) if (timer.ms === 9000) timer.callback();
  await n.flush();
  assert.equal(n.h.spoken.length, 0);
  assert.equal(n.accessibilityCalls, 0);
  n.result.toggleMute();
  await n.flush();
  await n.heading(90);
  await n.position(0, 0.000872);
  assert.match(n.h.spoken.at(-1).text, /Turn left/);
  n.result.toggleMute();
  await n.flush();
  assert.ok(n.h.stops > 0);
});

test('startup within a maneuver range consumes that initial range without duplicating the instruction', async () => {
  const n = navigationHarness({ reader: true });
  await n.start(0, 0.00072);
  assert.equal(n.h.spoken.length, 1);
  assert.match(n.h.spoken[0].text, /Turn left in 20 m/);
  await n.finish();
  for (let i = 0; i < 10; i++) await n.position(0, 0.00072);
  assert.equal(n.h.spoken.length, 1);
  await n.position(0, 0.000872);
  assert.equal(n.h.spoken.length, 2);
  assert.match(n.h.spoken[1].text, /In 5 meters, Turn left/);
});

test('replanning an active destination does not repeat route startup speech', async () => {
  const n = navigationHarness({ reader: true });
  await n.start(0, 0.00072);
  n.result.handleDestinationChange('library');
  await n.flush();
  await n.finish();
  assert.equal(n.h.spoken.filter((item) => item.text.startsWith('Navigating to')).length, 1);
  assert.equal(n.h.spoken.length, 1, 'an identical replan must not replay the initial maneuver range');
});

test('accessible orientation/repeats remain optional; GPS changes do not reset repeat interval', async () => {
  const n = navigationHarness({ mode: 'accessibility', reader: true });
  await n.start();
  const repeatId = [...n.intervals].find(([, timer]) => timer.ms === 9000)[0];
  await n.finish();
  await n.heading(270);
  assert.match(n.h.spoken.at(-1).text, /^Turn around to face the route$/);
  await n.finish();
  await n.heading(90);
  await n.position(0, 0.0002);
  assert.equal(n.intervals.has(repeatId), true);
  n.intervals.get(repeatId).callback();
  await n.flush();
  assert.equal(n.h.spoken.at(-1).text, n.module.formatInstructionWithDistance(n.result.nextStep.instruction, n.result.distToNextStepMeters, 'metric'));
});

test('cancel stops startup/pending maneuver; restart permits one new startup', async () => {
  const n = navigationHarness({ reader: true });
  await n.start();
  const stale = n.h.spoken[0].options.onDone;
  await n.position(0, 0.00072); // Queued behind startup.
  assert.equal(n.h.spoken.length, 1);
  n.result.handleCancelRoute();
  await n.flush();
  stale();
  await n.flush();
  assert.equal(n.h.spoken.length, 1);
  assert.ok(n.h.stops > 0);
  await n.start();
  assert.equal(n.h.spoken.filter((item) => item.text.startsWith('Navigating to')).length, 2);
});


for (const platform of ['ios', 'android']) {
  test(`audio-session experiment applies to every prompt on ${platform} without changing dispatch order`, async () => {
    const module = compile('utils/navigation-speech.ts', { 'react-native': { Platform: { OS: platform } } });
    const h = engineHarness();
    const speech = new module.NavigationSpeech(h.engine);
    for (const kind of ['startup', 'maneuver', 'arrival', 'optional']) {
      speech.request(kind, kind);
      await drain();
      const last = h.spoken.at(-1);
      assert.equal(last.text, kind);
      assert.equal(last.options.useApplicationAudioSession, platform === 'ios' ? false : undefined);
      last.options.onDone();
      await drain();
    }
    assert.equal(h.stops, 0);
    assert.deepEqual(h.spoken.map((item) => item.text), ['startup', 'maneuver', 'arrival', 'optional']);
  });
}
