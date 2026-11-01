const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/routing.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const { initRoutingGraph, routeBetween } = context.exports;
const origin = { latitude: 0, longitude: -0.001, label: 'Start' };
const destination = { latitude: 0, longitude: 0.007, label: 'End' };
const edge = (to, accessible = true, indoor = false, roadCrossing = false) => ({to, accessible, indoor, roadCrossing});
function initialize(detours = true) {
  initRoutingGraph({
    nodes: [['o',0,-0.001], ['a',0,0], ['b',0,0.002], ['c',0,0.004], ['d',0,0.006], ['end',0,0.007],
      ['crosswalk',0.001,0.001], ['ramp',0.001,0.003], ['outside',0.001,0.005]],
    connections: { o: ['a'], a: [edge('b', false, false, true), ...(detours ? [edge('crosswalk',true,false,true)] : [])],
      crosswalk: detours ? [edge('b',true,false,true)] : [],
      b: [edge('c', false), ...(detours ? ['ramp'] : [])], ramp: detours ? ['c'] : [],
      c: [edge('d',true,true), ...(detours ? ['outside'] : [])], outside: detours ? ['d'] : [], d: ['end'] },
  }, []);
}
const visits = (route, longitude) => route.navigationPath.some(p => p.coordinate[0] === 0.001 && p.coordinate[1] === longitude);
test('all eight preference combinations apply together and have distinct cached routes', async () => {
  initialize();
  for (let mask = 0; mask < 8; mask++) {
    const options = { avoidStairs: !!(mask & 1), avoidIndoorRoutes: !!(mask & 2), avoidInaccessibleCrosswalks: !!(mask & 4) };
    for (const [start, end] of [[origin,destination],[destination,origin]]) {
      const route = await routeBetween(start, end, options);
      assert.equal(visits(route,0.001), options.avoidInaccessibleCrosswalks, JSON.stringify(options));
      assert.equal(visits(route,0.003), options.avoidStairs, JSON.stringify(options));
      assert.equal(visits(route,0.005), options.avoidIndoorRoutes, JSON.stringify(options));
    }
  }
  assert.equal(visits(await routeBetween(origin,destination),0.001),false);
});
test('no matching route fails instead of relaxing preferences', async () => {
  initialize(false);
  for (let mask = 1; mask < 8; mask++) {
    await assert.rejects(routeBetween(origin, destination, { avoidStairs: !!(mask & 1), avoidIndoorRoutes: !!(mask & 2), avoidInaccessibleCrosswalks: !!(mask & 4) }), /No local walking route/);
  }
});
test('named flags match legacy connections without a separate audible flag', () => {
  const normalize = context.exports.normalizeWalkwayConnection;
  assert.equal(JSON.stringify(normalize(['b',false,false,true])), JSON.stringify(normalize(edge('b',false,false,true))));
  assert.equal('audibleSignal' in normalize(edge('b')),false);
});

test('Faraday to Fuller avoids stairs via the ramp in both directions', async () => {
  const buildings = require('../src/data/wpi-buildings.json');
  initRoutingGraph(require('../src/data/route-points.json'), buildings);
  const faraday = buildings.find(building => building.name === 'Faraday Hall');
  const fuller = buildings.find(building => building.name === 'Fuller Laboratories');
  for (const start of faraday.entrances) {
    for (const end of fuller.entrances) {
      assert.equal(start.accessibility && end.accessibility, true);
      for (const [origin, destination] of [[start, end], [end, start]]) {
        const route = await routeBetween(origin, destination, { avoidStairs: true });
        assert.ok(route.distance > 0 && route.distance < 1000);
        assert.ok(route.navigationPath.some(point =>
          point.coordinate[0] === 42.275245 && point.coordinate[1] === -71.806161
        ), 'route uses the Fuller ramp');
      }
    }
  }
});
