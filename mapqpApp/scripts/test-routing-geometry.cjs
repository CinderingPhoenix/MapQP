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

test('travel direction favors the forward loop and has a separate cache entry and physical ETA', async () => {
  initRoutingGraph({ nodes: [['a', 0, 0], ['b', 0, 0.0002], ['c', 0.0002, 0.0002], ['d', 0.0002, 0]],
    connections: { a: ['b', 'd'], b: ['c'], c: ['d'] } }, []);
  const origin = { latitude: 0, longitude: 0.0001, label: 'Walker' };
  const destination = { latitude: 0.0002, longitude: 0, label: 'Destination' };
  const west = await routeBetween(origin, destination, {}, 270);
  const east = await routeBetween(origin, destination, {}, 90);
  assert.equal(west.geometry[1][1], 0);
  assert.equal(east.geometry[1][1], 0.0002);
  assert.ok(east.distance > west.distance);
  assert.equal(east.duration, east.distance / 1.4);
});

test('motion heading ignores stationary phone direction and noisy or stale movement', () => {
  const { getMotionHeading } = context.exports;
  const start = { latitude: 0, longitude: 0, accuracy: 3, timestamp: 1000 };
  const end = { ...start, longitude: 0.0001, timestamp: 11000, heading: 270, speed: 0 };
  assert.equal(getMotionHeading(end, start), 90);
  assert.equal(getMotionHeading({ ...end, speed: 1 }), 270);
  assert.equal(getMotionHeading({ ...end, accuracy: 30 }, start), undefined);
  assert.equal(getMotionHeading({ ...end, timestamp: 40000 }, start), undefined);
  assert.equal(getMotionHeading({ ...start, heading: 270, speed: 0 }, start), undefined);
});

test('a left turn followed by backward travel loses to a longer forward route, even at a graph vertex', async () => {
  initRoutingGraph({ nodes: [
    ['s', 0, 0], ['left', 0.0001, 0], ['back', 0.00015, -0.0001], ['dest', 0.001, 0],
    ['forward', 0, 0.0008], ['bend', 0.001, 0.0008],
  ], connections: { s: ['left', 'forward'], left: ['back'], back: ['dest'],
    forward: ['bend'], bend: ['dest'] } }, []);
  const origin = { latitude: 0, longitude: 0, label: 'Walker' };
  const destination = { latitude: 0.001, longitude: 0, label: 'Destination' };
  const shortest = await routeBetween(origin, destination);
  const forward = await routeBetween(origin, destination, {}, 90);
  assert.ok(shortest.geometry.some(p => p[0] === 0.0001 && p[1] === 0));
  assert.ok(forward.geometry.some(p => p[0] === 0 && p[1] === 0.0008));
  assert.ok(!forward.geometry.some(p => p[0] === 0.00015 && p[1] === -0.0001));
  assert.ok(forward.distance > shortest.distance);
  assert.equal(forward.duration, forward.distance / 1.4);
});

test('a required reversal still finds a permitted route at a dead end', async () => {
  initRoutingGraph({ nodes: [['s', 0, 0], ['end', 0, -0.001]], connections: { s: ['end'] } }, []);
  const route = await routeBetween({ latitude: 0, longitude: 0, label: 'Walker' },
    { latitude: 0, longitude: -0.001, label: 'End' }, {}, 90);
  assert.equal(route.geometry.at(-1)[1], -0.001);
  assert.ok(route.routingCost > route.distance);
});

test('routing accepts saved object nodes alongside bundled tuple nodes', async () => {
  initRoutingGraph({ nodes: [
    { id: 'start', latitude: 42, longitude: -71 },
    ['end', 42.001, -71],
  ], connections: { start: ['end'] } }, []);
  const route = await routeBetween({ latitude: 42, longitude: -71, label: 'Start' },
    { latitude: 42.001, longitude: -71, label: 'End' });
  assert.ok(route.distance > 0);
});

test('malformed nodes produce a validation error instead of an iterator error', () => {
  for (const node of [null, 42, {}, ['short', 42], ['bad', NaN, -71],
    { id: 'bad', latitude: '42', longitude: -71 }]) {
    assert.throws(() => initRoutingGraph({ nodes: [node], connections: {} }, []),
      /Invalid walkway node at index 0/);
  }
});
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


