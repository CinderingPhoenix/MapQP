// Run: node scripts/benchmark-routing.cjs [path-to-baseline-routing.ts]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'src/data/route-points.json'), 'utf8'));
const buildings = JSON.parse(fs.readFileSync(path.join(root, 'src/data/wpi-buildings.json'), 'utf8'));
function load(file) {
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}
const requests = Array.from({length: 96}, (_, i) => {
  const [,lat,lng] = data.nodes[(i * 37) % data.nodes.length];
  const [,endLat,endLng] = data.nodes[(i * 71 + 123) % data.nodes.length];
  return [{latitude:lat + i * 1e-10,longitude:lng,label:'Start'},
    {latitude:endLat,longitude:endLng,label:'End'},
    {avoidStairs:!!(i&1),avoidIndoorRoutes:!!(i&2),avoidInaccessibleCrosswalks:!!(i&4)}];
});
async function measure(api) {
  const times = [];
  let results;
  for (let round = 0; round < 6; round++) {
    api.initRoutingGraph(data, buildings);
    const start = performance.now();
    results = [];
    for (const args of requests) {
      try { results.push(await api.routeBetween(...args)); }
      catch (error) { results.push({error: error.message}); }
    }
    if (round) times.push(performance.now() - start);
  }
  times.sort((a,b) => a-b);
  return {medianMs: times[2], results};
}
(async () => {
  const current = await measure(load(path.join(root, 'src/utils/routing.ts')));
  console.log(`Current: ${current.medianMs.toFixed(1)} ms per ${requests.length} uncached campus requests (median of 5 runs)`);
  if (process.argv[2]) {
    const baseline = await measure(load(process.argv[2]));
    let differentPaths = 0;
    for (let i=0; i<requests.length; i++) {
      const a = current.results[i], b = baseline.results[i];
      assert.equal(a.error, b.error, `Route availability changed: ${i}`);
      if (!a.error) {
        assert.ok(Math.abs(a.distance-b.distance)<1e-6, `Shortest distance changed: ${i}`);
        if (JSON.stringify(a.geometry) !== JSON.stringify(b.geometry)) differentPaths++;
      }
    }
    console.log(`Baseline: ${baseline.medianMs.toFixed(1)} ms; ${(baseline.medianMs/current.medianMs).toFixed(2)}x faster. All ${requests.length} outcomes/distances match; ${differentPaths} equal-distance path changes.`);
  }
})().catch(error => { console.error(error); process.exitCode=1; });
