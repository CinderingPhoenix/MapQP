const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../src/utils/routing.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText, context);
const { initRoutingGraph, routeBetween } = context.exports;
const origin = { latitude: 0, longitude: -0.001, label: 'Start' };
const destination = { latitude: 0, longitude: 0.003, label: 'End' };
function initialize({ audible = true, crossingFlag = true, stairs = false, indoor = false } = {}) {
  initRoutingGraph({
    nodes: [['start', 0, -0.001], ['a', 0, 0], ['b', 0, 0.002], ['end', 0, 0.003], ['signal', 0.001, 0.001]],
    connections: { start: ['a'], a: [['b', true, false, true], ['signal', !stairs, indoor, crossingFlag, audible]],
      signal: [['b', !stairs, indoor, crossingFlag, audible]], b: ['end', 'a'] },
  }, []);
}
const hasSignal = route => route.navigationPath.some(p => p.coordinate[0] === 0.001);
test('audible crossing preference takes the marked detour, in either direction, with separate cached results', async () => {
  initialize();
  assert.equal(hasSignal(await routeBetween(origin, destination)), false);
  assert.equal(hasSignal(await routeBetween(origin, destination, { avoidInaccessibleCrosswalks: true })), true);
  assert.equal(hasSignal(await routeBetween(destination, origin, { avoidInaccessibleCrosswalks: true })), true);
  assert.equal(hasSignal(await routeBetween(origin, destination)), false);
});
test('ordinary paths remain allowed and missing audible flags block marked crossings', async () => {
  initialize({ audible: false, crossingFlag: false });
  assert.equal(hasSignal(await routeBetween(origin, destination, { avoidInaccessibleCrosswalks: true })), true);
  initialize({ audible: false });
  await assert.rejects(routeBetween(origin, destination, { avoidInaccessibleCrosswalks: true }), /No local walking route/);
});
test('crosswalk preference combines with stair and indoor avoidance', async () => {
  for (const [fixture, options] of [[{ stairs: true }, { avoidStairs: true }], [{ indoor: true }, { avoidIndoorRoutes: true }]]) {
    initialize(fixture);
    await assert.rejects(routeBetween(origin, destination, { ...options, avoidInaccessibleCrosswalks: true }), /No local walking route/);
  }
});
test('named connections route identically to legacy tuples and load the migrated campus data', async () => {
  initialize();
  const legacy = await routeBetween(origin, destination, { avoidInaccessibleCrosswalks: true });
  const normalize = context.exports.normalizeWalkwayConnection;
  const connections = { start: ['a'], a: [['b', true, false, true], ['signal', true, false, true, true]],
    signal: [['b', true, false, true, true]], b: ['end', 'a'] };
  initRoutingGraph({
    nodes: [['start', 0, -0.001], ['a', 0, 0], ['b', 0, 0.002], ['end', 0, 0.003], ['signal', 0.001, 0.001]],
    connections: Object.fromEntries(Object.entries(connections).map(([key, items]) => [key, items.map(normalize)])),
  }, []);
  const named = await routeBetween(origin, destination, { avoidInaccessibleCrosswalks: true });
  assert.equal(JSON.stringify(named), JSON.stringify(legacy));
  assert.ok(context.exports.getWalkwayDebugOverlay().connections.length > 0);
  const campus = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/route-points.json'), 'utf8'));
  for (const items of Object.values(campus.connections)) for (const item of items) {
    assert.equal(typeof item.to, 'string');
    for (const flag of ['accessible', 'indoor', 'roadCrossing', 'audibleSignal']) assert.equal(typeof item[flag], 'boolean');
  }
  initRoutingGraph(campus, []);
  assert.ok(context.exports.getWalkwayDebugOverlay().connections.length > 0);
});
