const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const compiled = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../src/utils/background-guidance.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: compiled });
const guidance = compiled.getBackgroundGuidance;
const route = {
  geometry: [[42, -71], [42.001, -71], [42.001, -70.999]],
  steps: [{ instruction: 'Turn right', pointIndex: 1 }, { instruction: 'Arrive at destination', pointIndex: 2 }],
  destination: 'Library', units: 'metric', expiresAt: Date.now() + 10000,
};
test('announces approaching and immediate turns, then advances beyond the turn', () => {
  assert.match(guidance(route, 42.0008, -71).key, /1:near/);
  assert.match(guidance(route, 42.00096, -71).body, /Turn right now/);
  assert.match(guidance(route, 42.001, -70.9997).key, /2:/);
});
test('does not declare arrival when passing a different part of the route', () => {
  assert.equal(guidance(route, 42.0005, -71).arrived, false);
  assert.equal(guidance(route, 42.001, -70.999).arrived, true);
});
test('off-route guidance asks to reopen the app instead of giving a false turn', () => {
  assert.equal(guidance(route, 42.005, -71).key, 'off-route');
});
test('imperial directions use feet', () => {
  assert.match(guidance({ ...route, units: 'imperial' }, 42.0005, -71).body, /ft/);
});

test('progress advances by distance along the route, and arrival completes it', () => {
  const start = guidance(route, 42, -71);
  const middle = guidance(route, 42.0005, -71);
  const finish = guidance(route, 42.001, -70.999);
  assert.equal(start.progress, 0);
  assert.ok(middle.progress > start.progress && middle.progress < finish.progress);
  assert.equal(finish.progress, 100);
  assert.equal(finish.maneuver, 'arrive');
});

test('left and U-turn instructions select the corresponding arrow', () => {
  for (const [instruction, maneuver] of [['Turn left', 'left'], ['Turn around', 'uturn']]) {
    assert.equal(guidance({ ...route, steps: [{ instruction, pointIndex: 1 }] }, 42.0005, -71).maneuver, maneuver);
  }
});
