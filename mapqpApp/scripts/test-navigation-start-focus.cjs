const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real shared summary + hook with mocked native boundaries. These
// checks verify request/lifecycle behavior, not iOS VoiceOver focus acceptance.
function harness(platform = 'ios', testPreservedFocus = true) {
  const slots = [];
  const events = [];
  const listeners = new Set();
  let cursor = 0;
  let effect;
  let previousEffect;
  let cleanup;
  let keyboardVisible = false;
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => dep !== slots[index].deps[i])) {
        slots[index] = { value: factory(), deps };
      }
      return slots[index].value;
    },
    useCallback: (callback, deps) => react.useMemo(() => callback, deps),
  };
  const native = {
    Pressable: 'NativePressable',
    Platform: { OS: platform },
    Keyboard: {
      isVisible: () => keyboardVisible,
      addListener: (_, callback) => {
        listeners.add(callback);
        return { remove: () => listeners.delete(callback) };
      },
    },
    AccessibilityInfo: {
      sendAccessibilityEvent: (node, eventType) => {
        assert.equal(eventType, 'focus');
        events.push(['focus', node]);
      },
      announceForAccessibility: (text) => events.push(['announce', text]),
      announceForAccessibilityWithOptions: (text, options) => events.push(['announce', text, options]),
    },
  };
  const modules = {};
  function load(relative) {
    const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, {
      exports,
      require(name) {
        if (name === 'react') return react;
        if (name === 'react-native') return native;
        if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
        if (name === 'expo-router') return { useFocusEffect: (callback) => { effect = callback; } };
        if (name === '../hooks/use-navigation-start-focus') return {
          // Exercise retained focus/layout behavior separately from Stage 1's
          // production-disabled summary path.
          useNavigationStartFocus: (...args) => modules.hook.useNavigationStartFocus(...args.slice(0, 3), testPreservedFocus ? true : args[3]),
        };
        throw new Error(`Unexpected dependency: ${name}`);
      },
    });
    return exports;
  }
  modules.hook = load('hooks/use-navigation-start-focus.ts');
  const Summary = load('components/current-navigation-summary.tsx').default;
  return {
    events,
    render(key = 'library', reader = true, overrides = {}) {
      cursor = 0;
      const element = Summary({
        destinationKey: key, destinationName: 'Library', screenReaderEnabled: reader,
        instruction: 'Turn left in 25 meters', expanded: false,
        onToggleDirections() {}, children: 'Visible current direction and distance', ...overrides,
      });
      if (effect !== previousEffect || !cleanup) {
        cleanup?.();
        cleanup = effect();
        previousEffect = effect;
      }
      return element;
    },
    keyboard(visible) {
      keyboardVisible = visible;
      if (!visible) for (const callback of listeners) callback();
    },
    blur() { cleanup?.(); cleanup = undefined; },
    listenerCount: () => listeners.size,
  };
}
const layout = (width = 200, height = 60) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });

// Verify the focus target itself, not a separate hidden instruction or list heading.
test('the shared top summary is a single native accessible control with direction and maneuver distance', () => {
  const h = harness();
  const summary = h.render();
  assert.equal(summary.type, 'NativePressable');
  assert.equal(summary.props.accessible, true);
  assert.equal(summary.props.accessibilityRole, 'button');
  assert.equal(summary.props.accessibilityLabel, 'Turn left in 25 meters');
  const nativeSummary = {};
  summary.props.ref(nativeSummary);
  summary.props.onLayout(layout());
  assert.equal(h.events[0][1], nativeSummary);
});

test('waits for mount, nonzero layout, and keyboard dismissal; focuses once', () => {
  const h = harness();
  h.keyboard(true);
  const { props } = h.render();
  assert.equal(h.events.length, 0);
  const nativeSummary = {};
  props.ref(nativeSummary);
  props.onLayout(layout(0, 0));
  assert.equal(h.events.length, 0);
  props.onLayout(layout());
  assert.equal(h.events.length, 0);
  h.keyboard(false);
  assert.equal(h.events.length, 2);
  assert.equal(h.events[0][1], nativeSummary);
  assert.equal(h.events[1][1], 'Navigation started to Library.');
  assert.equal(h.events[1][2].queue, true);
});

test('GPS, progress, direction updates, and expanding/collapsing keep the target/ref without refocusing', () => {
  const h = harness();
  const first = h.render();
  const node = {};
  first.props.ref(node);
  first.props.onLayout(layout());
  for (let i = 0; i < 80; i++) {
    const next = h.render('library', true, { instruction: `Turn left in ${80 - i} meters`, expanded: i % 2 === 0 });
    assert.equal(next.type, first.type);
    assert.equal(next.props.ref, first.props.ref);
    assert.equal(next.props.onLayout, first.props.onLayout);
    assert.equal(next.props.accessibilityLabel, `Turn left in ${80 - i} meters`);
    next.props.onLayout(layout());
  }
  assert.equal(h.events.length, 2);
});

test('same-instance ref detach/reattach needs no new layout to issue pending focus', () => {
  const h = harness();
  h.keyboard(true);
  const first = h.render();
  const node = {};
  first.props.ref(node);
  first.props.onLayout(layout());
  for (let i = 0; i < 80; i++) {
    const { props } = h.render();
    props.ref(null);
    props.ref(node);
  }
  h.keyboard(false);
  assert.equal(h.events.length, 2);
  assert.equal(h.events[0][1], node);
});

test('a different native instance must lay out; a late layout after detachment cannot focus', () => {
  const h = harness();
  h.keyboard(true);
  const { props } = h.render();
  props.ref({});
  props.onLayout(layout());
  props.ref(null);
  props.onLayout(layout());
  h.keyboard(false);
  assert.equal(h.events.length, 0);
  const replacement = {};
  props.ref(replacement);
  assert.equal(h.events.length, 0);
  props.onLayout(layout());
  assert.equal(h.events.length, 2);
  assert.equal(h.events[0][1], replacement);
});

test('cancelling and starting the same destination again permits a new handoff', () => {
  const h = harness();
  let { props } = h.render();
  props.ref({});
  props.onLayout(layout());
  props.ref(null);
  h.render(null);
  props = h.render().props;
  props.ref({});
  props.onLayout(layout());
  assert.equal(h.events.filter(([kind]) => kind === 'focus').length, 2);
});

test('zero-sized layout invalidates earlier readiness until the summary is visible again', () => {
  const h = harness();
  h.keyboard(true);
  const { props } = h.render();
  props.ref({});
  props.onLayout(layout());
  props.onLayout(layout(0, 0));
  h.keyboard(false);
  assert.equal(h.events.length, 0);
  props.onLayout(layout());
  assert.equal(h.events.length, 2);
});

test('late reader detection can focus; toggling the reader and returning from Settings cannot repeat it', () => {
  const h = harness();
  const { props } = h.render('library', false);
  props.ref({});
  props.onLayout(layout());
  assert.equal(h.events.length, 0);
  h.render();
  h.blur();
  h.render();
  h.render('library', false);
  h.render();
  assert.equal(h.events.length, 2);
});

test('screen blur blocks pending layout focus and removes the keyboard listener', () => {
  const h = harness();
  const { props } = h.render();
  props.ref({});
  h.blur();
  props.onLayout(layout());
  h.keyboard(false);
  assert.equal(h.events.length, 0);
  assert.equal(h.listenerCount(), 0);
});

test('Android uses the ordinary announcement API', () => {
  const h = harness('android');
  const { props } = h.render();
  props.ref({});
  props.onLayout(layout());
  assert.equal(h.events[1].length, 2);
});

// Structural integration checks ensure each route renders the tested component
// inside its actual top summary, independently of the directions-list branch.
for (const screen of ['standard-navigation', 'accessibility-navigation']) {
  test(`${screen} uses the persistent current summary at the top, including maneuver distance`, () => {
    const source = ts.createSourceFile(`${screen}.tsx`, fs.readFileSync(path.join(__dirname, `../src/app/${screen}.tsx`), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.equal(source.parseDiagnostics.length, 0);
    const summaries = [];
    function visit(node) {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'CurrentNavigationSummary') summaries.push(node);
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(summaries.length, 1);
    const summary = summaries[0];
    const attrs = summary.openingElement.attributes.getText(source);
    assert.match(attrs, /destinationKey=\{routeDestinationBuilding\}/);
    assert.match(attrs, /instruction=\{[\s\S]*formatInstructionWithDistance/);
    assert.match(attrs, /distToNextStepMeters/);
    assert.match(attrs, /distanceUnits/);
    assert.match(summary.children.map((child) => child.getText(source)).join(''), /formatInstructionWithDistance/);
    let withinTopSummary = false;
    for (let parent = summary.parent; parent; parent = parent.parent) {
      if (ts.isJsxElement(parent) && parent.openingElement.attributes.getText(source).includes('styles.topRouteSummary')) withinTopSummary = true;
      if (ts.isConditionalExpression(parent)) assert.notEqual(parent.condition.getText(source), 'directionsExpanded');
      if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) assert.notEqual(parent.left.getText(source), 'directionsExpanded');
    }
    assert.equal(withinTopSummary, true);
    if (screen === 'accessibility-navigation') {
      const announcementListeners = [];
      const cancellationButtons = [];
      function checkCancellation(node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 'AccessibilityInfo.addEventListener' &&
            node.arguments[0]?.text === 'announcementFinished') announcementListeners.push(node);
        if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'TouchableOpacity') {
          const attributes = node.attributes.getText(source);
          if (attributes.includes('accessibilityLabel="Cancel route"') && attributes.includes('onPress={handleCancelRoute}')) cancellationButtons.push(node);
        }
        ts.forEachChild(node, checkCancellation);
      }
      checkCancellation(source);
      assert.equal(announcementListeners.length, 0, 'announcement completion must not be treated as recognized speech');
      assert.equal(cancellationButtons.length, 1, 'the legitimate Cancel route button must remain wired');
    }
  });
}

// Exercise real picker event handlers; the native modal is a mocked boundary.
async function pickerHarness({ platform = 'ios', accessibilityControls = true, reduceMotion = false, onSelect = () => {} } = {}) {
  const slots = [];
  const effects = [];
  const speechHandlers = {};
  const selections = [];
  let cursor = 0;
  let value = '';
  let tree;
  const react = {
    memo: (component) => component,
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useCallback: (callback) => callback,
    useEffect(callback, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => dep !== slots[index][i])) effects.push(callback);
      slots[index] = deps;
    },
  };
  react.default = react;
  react.__esModule = true;
  const jsx = (type, props) => ({ type, props });
  const native = {
    Platform: { OS: platform }, StyleSheet: { create: (styles) => styles },
    useWindowDimensions: () => ({ fontScale: 1 }), Keyboard: { dismiss() {} },
    Modal: 'Modal', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput',
    TouchableOpacity: 'TouchableOpacity', View: 'View', Alert: { alert() {} },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/components/building-picker.tsx'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, setTimeout, clearTimeout,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return native;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === 'expo-secure-store') return {
        getItemAsync: async () => JSON.stringify(['library']), setItemAsync: async () => {},
      };
      if (name === 'expo-speech-recognition') return {
        ExpoSpeechRecognitionModule: { stop() {} },
        useSpeechRecognitionEvent: (event, handler) => { speechHandlers[event] = handler; },
      };
      if (name === '../utils/map-logic') return { getSimilarityScore: () => 0 };
      if (name === '../context/settings-context') return {
        useSettings: () => ({ fontSize: 1, deviceAccessibility: { boldTextEnabled: false } }),
      };
      if (name === '../hooks/use-accessibility-preferences') return {
        useAccessibilityPreferences: () => ({ reduceMotionEnabled: reduceMotion }),
      };
      throw new Error(`Unexpected picker dependency: ${name}`);
    },
  });
  const buildings = [{ id: 'library', name: 'Library' }, { id: 'gym', name: 'Gym' }];
  function render() {
    cursor = 0;
    tree = exports.default({
      buildings, value, accessibilityControls, placeholder: 'Destination', onCancel() {},
      onChange(id) { value = id; selections.push(id); onSelect(id); },
    });
    while (effects.length) effects.shift()();
    return tree;
  }
  function nodes(root, predicate) {
    if (Array.isArray(root)) return root.flatMap((child) => nodes(child, predicate));
    if (!root || typeof root !== 'object') return [];
    return [...(predicate(root) ? [root] : []), ...nodes(root.props?.children, predicate)];
  }
  function find(predicate, root = tree) {
    const result = nodes(root, predicate)[0];
    assert.ok(result, 'expected picker element');
    return result;
  }
  function modal() { return find((node) => node.type === 'Modal'); }
  function selectRow(root) {
    find((node) => node.type === 'TouchableOpacity' && !node.props.accessibilityLabel &&
      nodes(node, (child) => child.type === 'Text' && child.props.children === 'Library').length > 0, root).props.onPress();
  }
  render();
  await Promise.resolve(); // Drain mocked storage reads, not a UI timing workaround.
  render();
  return {
    selections, render, modal,
    modalTitle() {
      return find((node) => node.type === 'Text' &&
        ['Saved Locations', 'Choose a building'].includes(node.props.children), modal()).props.children;
    },
    modalRows() {
      return nodes(modal(), (node) => node.type === 'Text' &&
        buildings.some((building) => building.name === node.props.children)).map((node) => node.props.children);
    },
    requestClose() { modal().props.onRequestClose(); render(); },
    openSaved() {
      find((node) => node.props?.accessibilityLabel === (accessibilityControls ? 'View saved locations' : 'Saved Locations')).props.onPress();
      render();
    },
    selectModalRow() { selectRow(modal()); render(); },
    selectInlineRow() { selectRow(find((node) => node.type === 'ScrollView')); render(); },
    closeModal() {
      find((node) => node.props?.accessibilityLabel === 'Close building selector', modal()).props.onPress();
      render();
    },
    search(text) {
      const input = find((node) => node.type === 'TextInput');
      input.props.onChangeText(text);
      input.props.onFocus();
      render();
    },
    voice(text) { speechHandlers.result({ results: [{ transcript: text }] }); render(); },
    showAllModalLocations() {
      find((node) => node.type === 'TouchableOpacity' && nodes(node, (child) => child.type === 'Text' && child.props.children === 'All Locations').length > 0, modal()).props.onPress();
      render();
    },
  };
}

for (const reduceMotion of [false, true]) {
  test(`iOS Saved selection starts after native modal restoration (Reduce Motion ${reduceMotion})`, async () => {
    const navigation = harness('ios', false);
    const order = [];
    const picker = await pickerHarness({ reduceMotion, onSelect(id) {
      order.push('route-start');
      const { props } = navigation.render(id);
      props.ref({});
      props.onLayout(layout());
      order.push('summary-mounted');
    } });
    picker.openSaved();
    assert.equal(picker.modal().props.visible, true);
    assert.equal(picker.modalTitle(), 'Saved Locations');
    assert.deepEqual(picker.modalRows(), ['Library']);
    assert.equal(picker.modal().props.animationType, reduceMotion ? 'none' : 'slide');
    picker.selectModalRow();
    assert.equal(picker.modal().props.visible, false);
    assert.equal(picker.modalTitle(), 'Saved Locations', 'outgoing modal title must not change');
    assert.deepEqual(picker.modalRows(), ['Library'], 'unsaved rows must not appear during dismissal');
    assert.equal(picker.selections.length, 0, 'closing visibility must not start navigation');
    assert.equal(navigation.events.length, 0);
    // Native iOS completes dismissal/restoration before delivering onDismiss to JS.
    order.push('native-restore-saved');
    picker.modal().props.onDismiss();
    picker.render();
    assert.equal(picker.modalTitle(), 'Choose a building');
    assert.deepEqual(picker.modalRows(), ['Library', 'Gym']);
    assert.deepEqual(order, ['native-restore-saved', 'route-start', 'summary-mounted']);
    assert.deepEqual(picker.selections, ['library']);
    picker.modal().props.onDismiss();
    for (let i = 0; i < 80; i++) navigation.render('library', true, { instruction: `Continue in ${80 - i} meters` });
    assert.equal(navigation.events.length, 0);
    picker.openSaved();
    picker.closeModal();
    assert.equal(picker.modalTitle(), 'Saved Locations');
    assert.deepEqual(picker.modalRows(), ['Library']);
    picker.modal().props.onDismiss();
    picker.render();
    assert.equal(picker.modalTitle(), 'Choose a building');
    assert.deepEqual(picker.selections, ['library'], 'closing without selecting must not replay a consumed selection');
    // Route cancellation and another selection of the same saved location.
    navigation.render(null);
    picker.openSaved();
    picker.selectModalRow();
    assert.deepEqual(picker.selections, ['library']);
    picker.modal().props.onDismiss();
    assert.deepEqual(picker.selections, ['library', 'library']);
    assert.equal(navigation.events.length, 0);
  });
}

test('standard inline Saved, text search, and voice selection remain immediate on iOS', async () => {
  const saved = await pickerHarness({ accessibilityControls: false });
  saved.openSaved();
  assert.equal(saved.modal().props.visible, false);
  saved.selectInlineRow();
  assert.deepEqual(saved.selections, ['library']);
  const search = await pickerHarness({ accessibilityControls: false });
  search.search('Library');
  search.selectInlineRow();
  assert.equal(search.selections.at(-1), 'library');
  const voice = await pickerHarness();
  voice.voice('Library');
  assert.deepEqual(voice.selections, ['library']);
});

test('All Locations in the iOS selector uses the same dismissal ordering', async () => {
  const picker = await pickerHarness();
  picker.openSaved();
  picker.showAllModalLocations();
  picker.selectModalRow();
  assert.equal(picker.selections.length, 0);
  picker.modal().props.onDismiss();
  assert.deepEqual(picker.selections, ['library']);
});

test('Android selection does not wait for the iOS-only onDismiss event', async () => {
  const picker = await pickerHarness({ platform: 'android' });
  picker.openSaved();
  picker.selectModalRow();
  assert.deepEqual(picker.selections, ['library']);
  picker.modal().props.onDismiss();
  assert.deepEqual(picker.selections, ['library']);
});


test('Stage 1 summary stays accessible without automatic VoiceOver focus or announcements', () => {
  for (const reader of [false, true]) {
    const h = harness('ios', false);
    const first = h.render('library', reader);
    first.props.ref({});
    first.props.onLayout(layout());
    assert.equal(first.props.accessible, true);
    assert.equal(first.props.accessibilityLabel, 'Turn left in 25 meters');
    for (let i = 0; i < 80; i++) {
      h.render('library', reader, { instruction: `Turn left in ${80 - i} meters` }).props.onLayout(layout());
    }
    h.keyboard(false);
    assert.equal(h.events.length, 0);
  }
});

test('iOS request-close keeps Saved content until dismissal without selecting a destination', async () => {
  const picker = await pickerHarness();
  picker.openSaved();
  picker.requestClose();
  assert.equal(picker.modal().props.visible, false);
  assert.equal(picker.modalTitle(), 'Saved Locations');
  assert.deepEqual(picker.modalRows(), ['Library']);
  assert.equal(picker.selections.length, 0);
  picker.modal().props.onDismiss();
  picker.render();
  assert.equal(picker.modalTitle(), 'Choose a building');
  assert.equal(picker.selections.length, 0);
});

test('Android Saved selection and close retain their immediate filter reset behavior', async () => {
  const picker = await pickerHarness({ platform: 'android' });
  picker.openSaved();
  picker.selectModalRow();
  assert.deepEqual(picker.selections, ['library']);
  assert.equal(picker.modalTitle(), 'Choose a building');
  picker.openSaved();
  picker.closeModal();
  assert.equal(picker.modalTitle(), 'Choose a building');
  picker.openSaved();
  picker.requestClose();
  assert.equal(picker.modalTitle(), 'Saved Locations', 'Android request-close behavior is unchanged');
});
