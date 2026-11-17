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
const { initRoutingGraph, validateMapData } = context.exports;

const routes = { nodes: [['start', 42.27, -71.8]], connections: { start: [] } };
test('bundled map data passes validation and initializes', () => {
  const routes = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/route-points.json'), 'utf8'));
  const buildings = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/wpi-buildings.json'), 'utf8'));
  assert.doesNotThrow(() => initRoutingGraph(routes, buildings));
});
test('downloaded object nodes initialize alongside tuple nodes', () => {
  assert.doesNotThrow(() => initRoutingGraph({ ...routes, nodes: [{ id: 'start', latitude: 42.27, longitude: -71.8 }] }, []));
});
test('malformed nodes still fail with details of the incompatible value', () => {
  for (const node of [null, {}, { id: 'start', latitude: '42.27', longitude: -71.8 }, ['start', 42.27]]) {
    assert.throws(() => initRoutingGraph({ ...routes, nodes: [node] }, []), /Invalid walkway node at index 0.*received/);
  }
});
test('non-iterable connection lists are rejected before graph construction', () => {
  assert.throws(() => initRoutingGraph({ ...routes, connections: { start: { to: 'end' } } }, []), /Invalid connection list/);
});
test('malformed buildings, entrances, and connections are rejected', () => {
  for (const buildings of [{ buildings: [] }, [null], [{ name: 'Fuller', entrances: {} }], [{ name: 'Fuller', entrances: [null] }]]) {
    assert.throws(() => validateMapData(routes, buildings), /Invalid/);
  }
  assert.throws(() => validateMapData({ ...routes, connections: { start: [null] } }, []), /Invalid walkway connection/);
});
test('object and legacy tuple building formats remain supported', () => {
  assert.doesNotThrow(() => validateMapData(routes, [
    { name: 'Fuller', entrances: [{ latitude: 42.27, longitude: -71.8 }] },
    ['Fuller', [[42.27, -71.8, 'Main', 1, true]]],
  ]));
});
