const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, console, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const drain = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

for (const platform of ['android', 'ios']) {
  test(`${platform} navigation speech uses the selected voice, rate, volume and audio setting`, async () => {
    const spoken = [];
    const { NavigationSpeech } = load('src/utils/navigation-speech.ts', {
      'react-native': { Platform: { OS: platform }, AccessibilityInfo: {} },
    });
    const speech = new NavigationSpeech({ speak: (text, options) => spoken.push({ text, options }), stop: async () => {} });
    speech.setMode('tts'); speech.setEnabled(true);
    speech.setVoiceSettings(1.4, 0.6, 'test-voice', true);
    assert.equal(speech.request('Turn left', 'maneuver'), true);
    await drain();
    assert.equal(spoken[0].options.voice, 'test-voice');
    assert.equal(spoken[0].options.rate, 1.4);
    assert.equal(spoken[0].options.volume, 0.6);
    assert.equal(spoken[0].options.useApplicationAudioSession, platform === 'ios' ? false : undefined);
    spoken[0].options.onDone();
    speech.setVoiceSettings(0.8, 1, 'second-voice', false);
    speech.request('Turn right', 'maneuver'); await drain();
    assert.equal(spoken[1].options.voice, 'second-voice');
    assert.equal(spoken[1].options.useApplicationAudioSession, platform === 'ios' ? true : undefined);
  });
}

test('keep awake follows focus, the saved setting and battery saver', () => {
  let focused = false, focusEffect;
  const settings = { keepScreenAwake: true, batterySaverEnabled: false };
  const { NavigationKeepAwake } = load('src/components/navigation-keep-awake.tsx', {
    'react': { useState: () => [focused, value => { focused = value; }], useCallback: fn => fn },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'expo-router': { useFocusEffect: fn => { focusEffect = fn; } },
    'expo-keep-awake': { useKeepAwake() {} },
    '../context/settings-context': { useSettings: () => settings },
  });
  assert.equal(NavigationKeepAwake(), null);
  const onBlur = focusEffect();
  assert.ok(NavigationKeepAwake());
  settings.keepScreenAwake = false;
  assert.equal(NavigationKeepAwake(), null);
  settings.keepScreenAwake = true; settings.batterySaverEnabled = true;
  assert.equal(NavigationKeepAwake(), null);
  settings.batterySaverEnabled = false; onBlur();
  assert.equal(NavigationKeepAwake(), null);
});
