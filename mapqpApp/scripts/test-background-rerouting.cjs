const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  let now = Date.now(), fail = false;
  const storage = new Map(), requests = [];
  function compile(file, dependencies = {}) {
    const output = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils', file + '.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText, { exports: output, require: name => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    }, Date: class extends Date { static now() { return now; } }, console: { warn() {} } });
    return output;
  }
  const routing = compile('routing');
  const graph = { nodes: [['a', 42, -71], ['b', 42.001, -71], ['c', 42.001, -70.999], ['d', 42, -70.999]],
    connections: { a: ['b', 'd'], b: ['a', 'c'], c: ['b', 'd'], d: ['c', 'a'] } };
  routing.initRoutingGraph(graph, []);
  const api = compile('background-rerouting', {
    '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key),
      setItem: async (key, value) => storage.set(key, value) },
    './routing': { ...routing, routeBetween: async (...args) => {
      requests.push(args);
      if (fail) throw new Error('No route satisfies preferences');
      return routing.routeBetween(...args);
    } },
    './navigation-directions': compile('navigation-directions'),
    './background-guidance': compile('background-guidance'),
  });
  const route = { geometry: [[42, -71], [42.001, -71]], steps: [{ instruction: 'Arrive at destination', pointIndex: 1 }],
    destination: 'Library', destinationPoint: { latitude: 42.001, longitude: -71, label: 'Library entrance' },
    preferences: { avoidStairs: true, avoidIndoorRoutes: true, avoidInaccessibleCrosswalks: true },
    units: 'metric', navigationId: 'test-navigation', expiresAt: now + 7200000 };
  return { api, routing, requests, route,
    setFail(value) { fail = value; },
    tick(ms = 2000) { now += ms; },
    fix(overrides = {}) { return { latitude: 42.0005, longitude: -70.999, accuracy: 5, timestamp: now, ...overrides }; },
  };
}

test('headless reroute restores the saved graph and keeps destination and every restriction', async () => {
  const h = harness();
  await h.api.saveBackgroundRoutingGraph();
  // Simulate a process with no graph initialized by a screen.
  h.routing.initRoutingGraph({ nodes: [], connections: {} }, []);
  await h.api.updateBackgroundRoute(h.route, h.fix());
  assert.equal(h.requests.length, 0);
  h.tick();
  await h.api.updateBackgroundRoute(h.route, h.fix());
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0][1], h.route.destinationPoint);
  assert.equal(h.requests[0][2], h.route.preferences);
  assert.equal(h.route.revision, 1);
  assert.equal(h.route.navigationId, 'test-navigation');
  assert.ok(h.route.reroutePlan.geometry.length >= 2);
  assert.equal(h.route.steps.at(-1).instruction, 'Arrive at destination');
  assert.equal(h.route.rerouteFailed, false);
});

test('noisy, repeated and isolated off-route fixes do not recalculate', async () => {
  const h = harness();
  await h.api.saveBackgroundRoutingGraph();
  await h.api.updateBackgroundRoute(h.route, h.fix({ accuracy: 25 }));
  h.tick();
  await h.api.updateBackgroundRoute(h.route, h.fix());
  await h.api.updateBackgroundRoute(h.route, h.fix());
  assert.equal(h.requests.length, 0);
  h.tick();
  await h.api.updateBackgroundRoute(h.route, h.fix({ longitude: -71 }));
  h.tick();
  await h.api.updateBackgroundRoute(h.route, h.fix());
  assert.equal(h.requests.length, 0);
});

test('failure keeps the old route and restrictions, backs off, and retries automatically', async () => {
  const h = harness();
  await h.api.saveBackgroundRoutingGraph();
  const geometry = h.route.geometry;
  h.setFail(true);
  await h.api.updateBackgroundRoute(h.route, h.fix());
  h.tick();
  await h.api.updateBackgroundRoute(h.route, h.fix());
  assert.equal(h.route.rerouteFailed, true);
  assert.equal(h.route.geometry, geometry);
  h.tick();
  await h.api.updateBackgroundRoute(h.route, h.fix());
  assert.equal(h.requests.length, 1);
  h.setFail(false);
  h.tick(16000);
  await h.api.updateBackgroundRoute(h.route, h.fix());
  assert.equal(h.requests.length, 2);
  assert.equal(h.route.revision, 1);
});
