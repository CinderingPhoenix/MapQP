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
const connection = (to, accessible = true, indoor = false, roadCrossing = false) =>
  ({ to, accessible, indoor, roadCrossing });
test('crosswalk flags serialize and reload without losing stair or indoor metadata', () => {
  const input = { a: [['b', false, true]], b: ['a'] };
  const original = normalizeConnections(input);
  const crossing = updateConnectionFlag(original, 'a', 'b', 'roadCrossing');
  const saved = plain(serializeConnections(crossing));
  assert.deepEqual(saved.a, [connection('b', false, true, true, true)]);
  assert.deepEqual(saved.b, [connection('a', false, true, true, true)]);
  assert.equal('audibleSignal' in saved.a[0], false);
  assert.equal(original.a[0].roadCrossing, false);
});
test('removing a crosswalk updates both directions', () => {
  const connections = normalizeConnections({ a: [['b', true, false, true, true]] });
  const saved = plain(serializeConnections(updateConnectionFlag(connections, 'a', 'b', 'roadCrossing')));
  assert.deepEqual(saved, { a: [connection('b')], b: [connection('a')] });
});
test('changing stair accessibility preserves crosswalk labels', () => {
  const connections = normalizeConnections({ a: [['b', true, false, true, true]] });
  const saved = plain(serializeConnections(updateConnectionFlag(connections, 'a', 'b', 'accessible')));
  assert.deepEqual(saved.a, [connection('b', false, false, true, true)]);
});
test('legacy strings and tuples save with explicit named flags', () => {
  const input = { a: ['b', ['c', false], ['d', true, true]] };
  assert.deepEqual(plain(serializeConnections(normalizeConnections(input))), { a: [connection('b'), connection('c', false), connection('d', true, true)] });
});

test('campus JSON saves named fields with unchanged targets and flag values', () => {
  const campus = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/route-points.json'), 'utf8'));
  const saved = plain(serializeConnections(normalizeConnections(campus.connections)));
  for (const [from, items] of Object.entries(campus.connections)) {
    assert.equal(saved[from].length, items.length);
    items.forEach((item, index) => {
      const expected = typeof item === 'string' ? connection(item) : Array.isArray(item)
        ? connection(item[0], item[1], item[2], item[3])
        : connection(item.to, item.accessible, item.indoor, item.roadCrossing);
      assert.deepEqual(saved[from][index], expected);
    });
  }
  assert.deepEqual(plain(serializeConnections(normalizeConnections(saved))), saved);
});
test('newly connected nodes also save named flags', () => {
  assert.deepEqual(plain(serializeConnections({ first: ['second'] })), { first: [connection('second')] });
});
test('internal connections require two real distinct entrances and save bidirectionally', () => {
  const ids = new Set(['Building-entrance-0', 'Building-entrance-1']);
  const toggle = context.exports.toggleInternalConnection;
  assert.throws(() => toggle({}, 'Building-entrance-0', 'walkway', ids), /two different building entrances/);
  assert.throws(() => toggle({}, 'Building-entrance-0', 'Building-entrance-0', ids), /two different building entrances/);
  const created = toggle({}, 'Building-entrance-0', 'Building-entrance-1', ids);
  const saved = plain(serializeConnections(created));
  assert.deepEqual(saved['Building-entrance-0'], [connection('Building-entrance-1', true, true)]);
  assert.deepEqual(saved['Building-entrance-1'], [connection('Building-entrance-0', true, true)]);
  const removed = toggle(created, 'Building-entrance-1', 'Building-entrance-0', ids);
  assert.equal(removed['Building-entrance-0'][0].indoor, false);
});
test('labeling an existing internal connection preserves stair restrictions', () => {
  const ids = new Set(['a', 'b']);
  const result = context.exports.toggleInternalConnection({ a: [{to:'b', accessible:false}] }, 'a', 'b', ids);
  assert.equal(result.a[0].accessible, false);
  assert.equal(result.b[0].accessible, false);
  assert.equal(result.a[0].indoor, true);
});
