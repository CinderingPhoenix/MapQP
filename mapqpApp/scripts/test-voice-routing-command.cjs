const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/voice-routing-command.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const parse = context.exports.parseVoiceRoutingCommand;
test('routing commands recognize enable and disable phrases', () => {
  for (const [phrase, preference, enabled] of [
    ['avoid stairs', 'avoidStairs', true],
    ['Please turn off avoid stairs.', 'avoidStairs', false],
    ['allow stairs', 'avoidStairs', false],
    ['enable indoor route avoidance', 'avoidIndoorRoutes', true],
    ['allow inside routes', 'avoidIndoorRoutes', false],
    ['turn on crosswalk avoidance', 'avoidInaccessibleCrosswalks', true],
    ['disable inaccessible road crossings', 'avoidInaccessibleCrosswalks', false],
    ['avoid crosswalks off', 'avoidInaccessibleCrosswalks', false],
  ]) {
    const result = parse(phrase);
    assert.equal(result?.preference, preference, phrase);
    assert.equal(result?.enabled, enabled, phrase);
  }
});
test('building names and incomplete commands cannot change preferences', () => {
  for (const phrase of ['Fuller Hall', 'stairs', 'turn off', 'avoid', 'go to indoor routes building', 'cancel route']) {
    assert.equal(parse(phrase), null, phrase);
  }
});
