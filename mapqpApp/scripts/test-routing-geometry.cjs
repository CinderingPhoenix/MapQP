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
test('route geometry preserves mapped corners on unequal-length walkway segments', async () => {
  const nodes = [['start', 0, -0.001], ['corner', 0, 0], ['bend', 0.0001, 0], ['end', 0.002, 0]];
  initRoutingGraph({ nodes, connections: { start: ['corner'], corner: ['bend'], bend: ['end'] } }, []);
  const route = await routeBetween({ latitude: 0, longitude: -0.001, label: 'Start' },
    { latitude: 0.002, longitude: 0, label: 'End' });
  assert.equal(JSON.stringify(route.geometry[0]), JSON.stringify(nodes[0].slice(1)));
  assert.equal(JSON.stringify(route.geometry.at(-1)), JSON.stringify(nodes.at(-1).slice(1)));
  assert.equal(JSON.stringify(route.geometry), JSON.stringify(route.navigationPath.map(p => p.coordinate)));
  for (const [, lat, lng] of nodes) {
    assert.ok(route.geometry.some(p => p[0] === lat && p[1] === lng), `Missing corner ${lat}, ${lng}`);
  }
});

test('object nodes produce the same route geometry as tuple nodes', async () => {
  const nodes = [['start', 0, -0.001], ['corner', 0, 0], ['end', 0.002, 0]];
  const connections = { start: ['corner'], corner: ['end'] };
  const start = { latitude: 0, longitude: -0.001, label: 'Start' };
  const end = { latitude: 0.002, longitude: 0, label: 'End' };
  initRoutingGraph({ nodes, connections }, []);
  const tupleRoute = await routeBetween(start, end);
  initRoutingGraph({ nodes: nodes.map(([id, latitude, longitude]) => ({ id, latitude, longitude })), connections }, []);
  const objectRoute = await routeBetween(start, end);
  assert.equal(JSON.stringify(objectRoute.geometry), JSON.stringify(tupleRoute.geometry));
  assert.equal(objectRoute.distance, tupleRoute.distance);
});
