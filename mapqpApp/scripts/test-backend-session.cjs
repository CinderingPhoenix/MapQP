const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('missing backend sessions recover, retry failures, and ignore logout during exchange', async () => {
  const sessionKey = 'mapqp_microsoft_session', tokenKey = 'mapqp_access_token';
  const session = JSON.stringify({ accessToken: 'microsoft-token' });
  const storage = new Map([[sessionKey, session]]);
  let calls = 0, fail = false, logout = false;
  const context = {
    exports: {}, process: { env: {} }, AbortController, setTimeout, clearTimeout,
    require(name) {
      if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: {
        extra: { SERVER_IP: 'localhost', PORT: '8000' },
      } } };
      if (name === 'expo-secure-store') return {
        getItemAsync: async key => storage.get(key) ?? null,
        setItemAsync: async (key, value) => { storage.set(key, value); },
      };
      throw new Error(`Unexpected import ${name}`);
    },
    async fetch(url, options) {
      calls++;
      assert.equal(url, 'http://localhost:8000/auth/microsoft-session');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { email: 'microsoft-token' });
      if (fail) throw new Error('offline');
      if (logout) storage.delete(sessionKey);
      return { ok: true, json: async () => ({ access_token: 'backend-token' }) };
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/backend-session.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, context);
  const { ensureBackendSession } = context.exports;
  fail = true;
  await assert.rejects(ensureBackendSession(), /offline/);
  assert.equal(storage.get(sessionKey), session);
  fail = false;
  await Promise.all([ensureBackendSession(), ensureBackendSession()]);
  assert.equal(calls, 2, 'concurrent recovery must share one exchange');
  assert.equal(storage.get(tokenKey), 'backend-token');
  await ensureBackendSession();
  assert.equal(calls, 2, 'existing token must not be exchanged every minute');
  storage.delete(tokenKey);
  logout = true;
  await ensureBackendSession();
  assert.equal(storage.has(tokenKey), false);
  await ensureBackendSession();
  assert.equal(calls, 3, 'signed-out users must not exchange');
});
