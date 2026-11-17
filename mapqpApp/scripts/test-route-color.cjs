const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('route color applies before creation, to an active route, and to recreated routes', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/components/leaflet.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    L: { polyline: (_, options) => ({
      options,
      addTo() { return this; },
      setStyle(style) { Object.assign(this.options, style); },
    }) },
  });
  vm.runInContext(script, context);
  context.window.setRouteColor('#293FAE');
  context.remainingPolyline = context.createRemainingPolyline([]);
  assert.equal(context.remainingPolyline.options.color, '#293FAE');
  context.window.setRouteColor('#222222');
  assert.equal(context.remainingPolyline.options.color, '#222222');
  assert.equal(context.createRemainingPolyline([]).options.color, '#222222');
  context.window.setRouteColor('#1d5962');
  assert.equal(context.remainingPolyline.options.color, '#1d5962');
  const outline = context.createRemainingOutline([]);
  assert.equal(outline.options.color, '#ffffff');
  assert.ok(outline.options.weight > context.remainingPolyline.options.weight);
  assert.equal(outline.options.interactive, false);
});
