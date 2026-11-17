const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

for (const legacy of [false, true]) test(`route to Washburn uses Unity with ${legacy ? 'legacy internal' : 'indoor'} connections`, async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/routing.ts'), 'utf8');
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, context);
  const points = JSON.parse(JSON.stringify(require('../src/data/route-points.json')));
  const buildings = require('../src/data/wpi-buildings.json');
  if (legacy) {
    const slug = id => id.startsWith('Unity Hall-entrance-') ? id.toLowerCase().replace(/\s+/g, '-') : id;
    points.connections = Object.fromEntries(Object.entries(points.connections).map(([id, edges]) => [slug(id), edges.map(edge => {
      if (typeof edge === 'string') return slug(edge);
      const next = { ...edge, to: slug(edge.to) };
      if (next.indoor) { next.internal = true; delete next.indoor; }
      return next;
    })]));
  }
  context.exports.initRoutingGraph(points, buildings);
  const unity = buildings.find(building => building.name === 'Unity Hall').entrances;
  const washburn = buildings.find(building => building.name === 'Washburn Shops').entrances[0];
  const origin = { latitude: 42.2741, longitude: -71.8055, label: 'Boynton Street' };
  const destination = { ...washburn, label: 'Washburn Shops' };
  const through = await context.exports.routeBetween(origin, destination);
  const outside = await context.exports.routeBetween(origin, destination, { avoidIndoorRoutes: true });
  const usesUnity = route => unity.slice(0, 2).every(entrance => route.geometry.some(
    ([lat, lng]) => lat === entrance.latitude && lng === entrance.longitude));
  assert.ok(usesUnity(through));
  assert.ok(!usesUnity(outside));
  assert.ok(through.distance < outside.distance);
  assert.ok(context.exports.getWalkwayDebugOverlay().nodes.every(([lat, lng]) => lat !== 0 || lng !== 0));
});
