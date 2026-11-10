const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('bug reports match the strict server schema and use authenticated POST', async () => {
  let token = 'test-token';
  let responseStatus = 201;
  const requests = [];
  const context = {
    exports: {}, process: { env: {} }, AbortController, setTimeout, clearTimeout,
    require(name) {
      if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: {
        version: '1.0.0', extra: { SERVER_IP: 'localhost', PORT: '8000' },
      } } };
      if (name === 'react-native') return { Platform: { OS: 'ios' } };
      if (name === 'expo-secure-store') return { getItemAsync: async (key) => {
        assert.equal(key, 'mapqp_access_token'); return token;
      } };
      throw new Error(`Unexpected import ${name}`);
    },
    fetch: async (url, options) => { requests.push({ url, options }); return { status: responseStatus }; },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/bug-reports.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, context);
  const api = context.exports;
  for (const category of api.BUG_REPORT_CATEGORIES) {
    const report = api.prepareBugReport({ category: category.value, description: ' Bug ', stepsToReproduce: '' },
      api.collectBugReportMetadata());
    assert.equal(report.valid, true);
    assert.equal(report.payload.category, category.label);
    assert.deepEqual(JSON.parse(JSON.stringify(report.payload)), {
      category: category.label, description: 'Bug', steps_to_reproduce: null,
      platform: 'ios', app_version: '1.0.0',
    });
    await api.submitBugReport(report.payload);
  }
  const { url, options } = requests[0];
  assert.equal(url, 'http://localhost:8000/bug-reports');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer test-token');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(options.body).category, 'Navigation');
  responseStatus = 401;
  await assert.rejects(api.submitBugReport({}), /sign in again/);
  responseStatus = 500;
  await assert.rejects(api.submitBugReport({}), /could not accept/);
  token = null;
  const count = requests.length;
  await assert.rejects(api.submitBugReport({}), /sign in before/);
  assert.equal(requests.length, count);
  assert.equal(api.prepareBugReport({ category: 'other', description: '   ', stepsToReproduce: '' }, {}).valid, false);
});
