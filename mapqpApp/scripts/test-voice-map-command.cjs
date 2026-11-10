const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/voice-map-command.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const parse = context.exports.parseVoiceMapCommand;

test('spoken map commands match the camera protocol', () => {
  for (const [phrase, command] of [
    ['Please zoom in.', 'zoom-in'], ['zoom out please', 'zoom-out'],
    ['move left', 'pan-left'], ['move right', 'pan-right'],
    ['move up', 'pan-up'], ['move down', 'pan-down'],
    ['pan the map left', 'pan-left'], ['move map right', 'pan-right'],
    ['recenter map', 'recenter'], ['recenter', 'recenter'],
    ['Please re-center the map.', 'recenter'],
  ]) assert.equal(parse(phrase), command, phrase);
});

test('destinations, routing preferences and unsupported commands pass through', () => {
  for (const phrase of ['Fuller Hall', 'Left Wing', 'go to recenter map',
    'move left hall', 'zoom in to Fuller', 'avoid stairs', 'cancel route',
    'zoom', 'move', 'move northeast', '']) {
    assert.equal(parse(phrase), null, phrase);
  }
});
