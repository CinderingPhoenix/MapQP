const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/hooks/use-session-monitor.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
function monitor(expiry) {
  const stored = new Map([
    ['mapqp_temp_code_session', '123456'],
    ['mapqp_temp_code_expires_at', expiry],
    ['mapqp_access_token', 'token'],
  ]);
  const timers = [];
  const redirects = [];
  const context = {
    exports: {},
    require(name) {
      if (name === 'react') return { useCallback: fn => fn, useEffect: () => {}, useRef: value => ({ current: value }) };
      if (name === 'react-native') return { Alert: { alert() {} } };
      if (name === 'expo-router') return { usePathname: () => '/standard-navigation', router: { replace: value => redirects.push(value) } };
      if (name === 'expo-secure-store') return {
        getItemAsync: async key => stored.get(key) ?? null,
        deleteItemAsync: async key => { stored.delete(key); },
      };
      throw Error(name);
    },
    Date, console,
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
  };
  vm.runInNewContext(source, context);
  return { ...context.exports.useSessionMonitor(), stored, timers, redirects };
}
test('expired sessions lose their code, deadline, and access token and return to login', async () => {
  const session = monitor(String(Date.now() - 1000));
  await session.refreshSessionTimer();
  assert.equal(session.stored.size, 0);
  assert.deepEqual(session.redirects, ['/']);
});
test('missing and malformed deadlines cannot keep a temporary session alive', async () => {
  for (const expiry of [null, 'invalid']) {
    const session = monitor(expiry);
    await session.refreshSessionTimer();
    assert.equal(session.stored.size, 0);
    assert.deepEqual(session.redirects, ['/']);
  }
});
test('long sessions schedule bounded checks instead of overflowing native timers', async () => {
  const session = monitor(String(Date.now() + 40 * 24 * 3600 * 1000));
  await session.refreshSessionTimer();
  assert.equal(session.timers[0].delay, 60000);
  assert.equal(session.redirects.length, 0);
});
test('expiry uses the stored deadline without any displayed countdown state', async () => {
  const session = monitor(String(Date.now() + 30000));
  await session.refreshSessionTimer();
  assert.ok(session.timers[0].delay > 0);
  session.stored.set('mapqp_temp_code_expires_at', String(Date.now() - 1));
  await session.timers[0].callback();
  // Timer callbacks start the async check without returning its promise.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.stored.size, 0);
});
