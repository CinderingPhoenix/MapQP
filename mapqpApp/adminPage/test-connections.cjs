const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, 'connections.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { normalizeConnections, serializeConnections, updateConnectionFlag } = context.exports;
const plain = value => JSON.parse(JSON.stringify(value));
test('crosswalk and audible flags serialize and reload without losing stair or indoor metadata', () => {
  const input = { a: [['b', false, true]], b: ['a'] };
  const original = normalizeConnections(input);
  const crossing = updateConnectionFlag(original, 'a', 'b', 'roadCrossing');
  const audible = updateConnectionFlag(crossing, 'b', 'a', 'audibleSignal');
  const saved = plain(serializeConnections(audible));
  assert.deepEqual(saved.a, [['b', false, true, true, true]]);
  assert.deepEqual(saved.b, [['a', false, true, true, true]]);
  assert.equal(normalizeConnections(saved).a[0].audibleSignal, true);
  assert.equal(original.a[0].roadCrossing, false);
});
test('removing a crosswalk clears audible signals on both directions', () => {
  const connections = normalizeConnections({ a: [['b', true, false, true, true]] });
  const saved = plain(serializeConnections(updateConnectionFlag(connections, 'a', 'b', 'roadCrossing')));
  assert.deepEqual(saved, { a: ['b'], b: ['a'] });
});
test('changing stair accessibility preserves crosswalk labels', () => {
  const connections = normalizeConnections({ a: [['b', true, false, true, true]] });
  const saved = plain(serializeConnections(updateConnectionFlag(connections, 'a', 'b', 'accessible')));
  assert.deepEqual(saved.a, [['b', false, false, true, true]]);
});
test('legacy strings and tuples round trip unchanged', () => {
  const input = { a: ['b', ['c', false], ['d', true, true]] };
  assert.deepEqual(plain(serializeConnections(normalizeConnections(input))), input);
});
