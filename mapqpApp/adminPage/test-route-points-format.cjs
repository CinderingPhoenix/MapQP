const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, 'route-points-format.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { formatRoutePoints } = context.exports;
test('writes version and compact nodes while preserving every connection flag', () => {
  const data = { nodes: [['quad-center', 42.273833, -71.8098]], connections: { 'quad-center': ['plain', ['stairs', false], ['crosswalk', true, false, true, true]] } };
  const output = formatRoutePoints(data);
  assert.ok(output.includes('    ["quad-center", 42.273833, -71.8098]\n'));
  assert.deepEqual(JSON.parse(output), { version: '1.0', ...data });
});
test('preserves existing version and document metadata', () => {
  const data = { version: '2.0', nodes: [], connections: {}, description: 'Campus map' };
  assert.deepEqual(JSON.parse(formatRoutePoints(data)), data);
});
