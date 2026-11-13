const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/position-interpolation.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context);
// Exercise the exact serialization used by the WebView, without module scope.
const create = vm.runInNewContext(`(${context.exports.createPositionInterpolator.toString()})`);
const now = 100000;
const fix = (extra = {}) => ({ latitude: 0, longitude: 0, accuracy: 3, timestamp: now, speed: 1, heading: 90, ...extra });
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.0000001, `${a} != ${b}`);

test('heading fallback predicts movement and stops after three seconds', () => {
  const p = create(); p.update(fix(), null, now);
  near(p.sample(now + 1000)[1], 1 / 111320);
  near(p.sample(now + 3000)[1], 3 / 111320);
  near(p.sample(now + 30000)[1], 3 / 111320);
});
test('route projection follows corners and stops at the destination', () => {
  const p = create(); p.update(fix(), [[0, 0], [0, 1 / 111320], [1 / 111320, 1 / 111320]], now);
  near(p.sample(now + 1500)[0], 0.5 / 111320);
  near(p.sample(now + 1500)[1], 1 / 111320);
  near(p.sample(now + 10000)[0], 1 / 111320);
});
test('stationary, inaccurate, stale and implausibly fast fixes do not drift', () => {
  for (const extra of [{ speed: 0 }, { accuracy: 50 }, { speed: 20 }, { timestamp: now - 10000 }]) {
    const p = create(); p.update(fix(extra), null, now);
    near(p.sample(now + 2000)[1], 0);
  }
});
test('GPS corrections ease from the displayed position and old fixes are ignored', () => {
  const p = create(); p.update(fix(), null, now);
  const before = p.sample(now + 2000);
  p.update(fix({ longitude: 1 / 111320, speed: 0, timestamp: now + 2000 }), null, now + 2000);
  near(p.sample(now + 2000)[1], before[1]);
  near(p.sample(now + 2600)[1], 1 / 111320);
  p.update(fix(), null, now + 2700);
  near(p.sample(now + 2800)[1], 1 / 111320);
  p.reset(); assert.equal(p.sample(now + 3000), null);
});
test('heading updates do not restart the prediction horizon; distant routes use heading', () => {
  const p = create(); p.update(fix(), [[1, 1], [2, 1]], now);
  p.update(fix({ heading: 0 }), null, now + 2500);
  near(p.sample(now + 6000)[0], 3 / 111320);
});
test('moving away from a route does not force the marker forward along it', () => {
  const p = create(); p.update(fix({ heading: 270 }), [[0, 0], [0, 1]], now);
  assert.ok(p.sample(now + 1000)[1] < 0);
});

test('a selected route can provide direction when the first GPS fix has no heading', () => {
  const p = create(); p.update(fix({ heading: null }), [[0, 0], [0, 1]], now);
  near(p.sample(now + 1000)[1], 1 / 111320);
});

test('WebView smooths only the marker, follows locked camera and stops its timer', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/components/leaflet.html'), 'utf8');
  // Parse every inline script as well as executing the motion integration itself.
  for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  let clock = now, tick, markerPoint, cameraMoves = 0;
  const predictor = create();
  const sandbox = {
    window: { positionInterpolator: predictor },
    document: { hidden: false, addEventListener() {} },
    map: { panTo() { cameraMoves++; } },
    marker: { setLatLng(point) { markerPoint = point; } }, circle: { setLatLng() {} },
    isHeadingFocused: false,
    Date: { now: () => clock },
    setInterval(callback, interval) { assert.equal(interval, 100); tick = callback; return 1; },
    clearInterval() { tick = null; },
  };
  sandbox.window.addEventListener = () => {};
  const block = html.slice(html.indexOf('    var motionTimer ='), html.indexOf('    window.updateMap ='));
  vm.runInNewContext(block, sandbox);
  sandbox.window.updateMotionSample(fix(), null, true);
  clock += 1000; tick();
  near(markerPoint[1], 1 / 111320);
  assert.equal(cameraMoves, 0, 'manual map exploration remains undisturbed');
  sandbox.isHeadingFocused = true;
  clock += 1000; tick();
  assert.equal(cameraMoves, 1);
  clock += 2000; tick();
  assert.equal(tick, null, 'prediction does not leave an idle animation loop running');
  sandbox.window.updateMotionSample(fix(), null, false);
  near(markerPoint[1], 0);
  assert.equal(tick, null);
});
