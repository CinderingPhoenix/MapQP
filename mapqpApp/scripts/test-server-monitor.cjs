const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('server monitor polls while active, resumes, and cleans up', async () => {
  let cleanup, tick, onState, period, removed = false, cleared = false;
  let calls = 0, ok = true, fail = false;
  const statuses = [];
  const context = {
    exports: {}, process: { env: {} }, AbortController, setTimeout, clearTimeout,
    setInterval(callback, ms) { tick = callback; period = ms; return 1; },
    clearInterval() { cleared = true; },
    require(name) {
      if (name === 'react') return { useEffect(callback) { cleanup = callback(); } };
      if (name === 'react-native') return { AppState: {
        currentState: 'active', addEventListener(event, callback) {
          onState = callback; return { remove() { removed = true; } };
        },
      } };
      if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: {
        extra: { SERVER_IP: 'localhost', PORT: '8000' },
      } } };
      if (name === '../utils/server-status') return { setServerOnline(value) { statuses.push(value); } };
      if (name === '../utils/backend-session') return { ensureBackendSession: async () => {} };
      throw new Error(`Unexpected import ${name}`);
    },
    async fetch(url, options) {
      calls++;
      assert.equal(url, 'http://localhost:8000/auth/public-key');
      assert.equal(options.cache, 'no-store');
      if (fail) throw new Error('offline');
      return { ok };
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/hooks/use-server-monitor.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, context);
  context.exports.useServerMonitor();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  assert.equal(period, 60000);
  assert.equal(calls, 0);
  tick(); tick();
  await flush();
  assert.equal(calls, 1, 'in-flight checks must not overlap');
  assert.equal(statuses.at(-1), true);
  onState('background'); tick();
  await flush();
  assert.equal(calls, 1);
  ok = false;
  onState('active');
  await flush();
  assert.equal(calls, 2);
  assert.equal(statuses.at(-1), false);
  fail = true; tick();
  await flush();
  assert.equal(statuses.at(-1), false);
  fail = false; ok = true; tick();
  await flush();
  assert.equal(statuses.at(-1), true);
  cleanup();
  assert.ok(removed && cleared);
  tick();
  assert.equal(calls, 4);
});
