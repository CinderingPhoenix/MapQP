// Exercise the actual inline map script with Leaflet/DOM boundaries mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function harness() {
  const html = fs.readFileSync(path.join(__dirname, '../src/components/leaflet.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const created = [];
  const removed = [];
  const context = vm.createContext({
    window: {},
    document: {
      querySelector: () => null,
    },
    L: {
      divIcon: (options) => options,
      marker(coords, options) {
        const attrs = {};
        const element = { setAttribute: (key, value) => { attrs[key] = value; } };
        const marker = {
          options, attrs, coords, moves: 0,
          addTo() { created.push(marker); return marker; },
          getElement: () => element,
          getLatLng: () => ({ lat: marker.coords[0], lng: marker.coords[1] }),
          setLatLng(next) { marker.coords = next; marker.moves++; return marker; },
        };
        return marker;
      },
      polyline: () => ({ addTo() { return this; }, getBounds: () => [] }),
    },
  });
  vm.runInContext(script, context);
  context.map = { removeLayer: (layer) => removed.push(layer), fitBounds() {} };
  context.marker = { setLatLng() {} };
  context.circle = { setLatLng() {}, setRadius() {} };
  // Geometry calculations are outside this DOM lifecycle regression's scope.
  context.splitRouteAtUser = () => ({ traversed: [], remaining: [] });
  return { context, created, removed };
}

const route = (latitude = 42, longitude = -71) => ({
  geometry: [[42, -71], [42.1, -71.1]],
  destination: { latitude, longitude },
});

test('initial route destination has no keyboard action and is hidden from VoiceOver', () => {
  const h = harness();
  h.context.initRoute(route(), 42, -71);
  const marker = h.created[0];
  assert.equal(marker.options.keyboard, false);
  assert.equal(marker.options.interactive, false);
  assert.equal(marker.options.autoPanOnFocus, false);
  assert.equal(marker.attrs['aria-hidden'], 'true');
});

test('GPS and preview updates reuse the destination DOM element', () => {
  const h = harness();
  const update = h.context.window.updateMap;
  update(42, -71, 2, route());
  const original = h.created[0];
  for (let i = 0; i < 80; i++) update(42 + i / 10000, -71, 2, route());
  assert.equal(h.created.length, 1);
  assert.equal(original.moves, 0);
  assert.equal(h.removed.includes(original), false);
  assert.equal(h.context.destMarker, original);
});

test('rerouting moves the existing marker; cancellation removes it and restart recreates it', () => {
  const h = harness();
  const update = h.context.window.updateMap;
  update(42, -71, 2, route());
  const original = h.created[0];
  update(42, -71, 2, route(43, -72));
  assert.equal(h.created.length, 1);
  assert.equal(original.moves, 1);
  assert.equal(original.coords[0], 43);
  update(42, -71, 2, null);
  assert.equal(h.context.destMarker, null);
  assert.equal(h.removed.includes(original), true);
  update(42, -71, 2, route());
  assert.equal(h.created.length, 2);
  assert.equal(h.created[1].attrs['aria-hidden'], 'true');
});

for (const accessibilityMode of [false, true]) {
  test(`${accessibilityMode ? 'accessible' : 'standard'} map controls stay available without explicit startup focus`, () => {
    const h = harness();
    const controls = [];
    const messages = [];
    const focusRequests = [];
    const layer = () => ({ addTo() { return this; }, setLatLng() {}, setRadius() {} });
    const map = {
      setView() { return this; }, on() {}, invalidateSize() {},
      getBearing: () => 0, fitBounds() {}, removeLayer() {},
      addControl(control) { controls.push(control.onAdd(this)); },
    };
    Object.assign(h.context.L, {
      map: () => map,
      tileLayer: layer, circleMarker: layer, circle: layer,
      Control: { extend: (definition) => function() { Object.assign(this, definition); } },
      DomUtil: {
        create(tag, className) {
          return {
            tag, className, attrs: {}, style: {}, handlers: {},
            setAttribute(key, value) { this.attrs[key] = value; },
            focus() { focusRequests.push(this); },
          };
        },
      },
      DomEvent: {
        on(element, event, callback) { element.handlers[event] = callback; },
        stopPropagation() {}, preventDefault() {},
      },
    });
    h.context.document.getElementById = () => ({ style: {} });
    h.context.window.ReactNativeWebView = { postMessage: (message) => messages.push(message) };
    h.context.setTimeout = () => 1; // Native/layout timing is outside this mock.
    h.context.map = null;
    h.context.window.initMap(42, -71, 42, -71, 2, null, accessibilityMode);
    assert.deepEqual(controls.map((control) => control.attrs['aria-label']),
      accessibilityMode ? ['Compass', 'Mute navigation'] : ['Settings', 'Compass', 'Mute navigation']);
    h.context.window.updateMap(42, -71, 2, route());
    for (const control of controls) {
      assert.equal(control.tag, 'button');
      assert.equal(control.type, 'button');
      assert.notEqual(control.attrs['aria-hidden'], 'true');
      assert.notEqual(control.disabled, true);
      assert.equal(typeof control.handlers.click, 'function');
    }
    assert.equal(focusRequests.length, 0);
    assert.equal(messages.length, 0);
    if (!accessibilityMode) {
      controls[0].handlers.click({});
      assert.deepEqual(messages, ['OPEN_SETTINGS']);
    }
  });
}

