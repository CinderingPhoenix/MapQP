const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/map-logic.ts'), 'utf8');
const ast = ts.createSourceFile('map-logic.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['deg2rad', 'getDistanceFromLatLonInMeters', 'getBearing', 'formatDistance',
  'formatInstructionWithDistance', 'closestGeometryIndex', 'generateDirections', 'getSegmentDistance', 'getDistanceToStepPoint']);
const functions = ast.statements.filter(s => ts.isFunctionDeclaration(s) && names.has(s.name.text)).map(s => s.getText(ast)).join('\n');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(functions, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, context);
const logic = context.exports;
function fixture(scale) {
  const points = [[0,0], [0,0.00005], [0.00002868,0.00009096], [0.00007567,0.00010806], [0.0002,0.0002]]
    .map(p => p.map(v => v * scale));
  const geometry = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < 10; j++) geometry.push(points[i].map((v, k) => v + (points[i+1][k] - v) * j / 10));
  }
  geometry.push(points.at(-1));
  return { geometry, navigation: points.map((coordinate, i) => ({coordinate, connectionCount: i === 1 || i === 2 ? 3 : 2})) };
}
test('nearby matching slight turns merge despite dense smoothed geometry', () => {
  const f = fixture(1);
  const steps = logic.generateDirections(f.geometry, f.navigation);
  assert.equal(steps.filter(s => s.instruction === 'Slight left').length, 1);
  assert.equal(steps.at(-1).instruction, 'Arrive at destination');
});
test('matching turns farther apart remain separate', () => {
  const f = fixture(10);
  assert.equal(logic.generateDirections(f.geometry, f.navigation).filter(s => s.instruction === 'Slight left').length, 2);
});
test('only the immediate step says now; future steps and arrival retain distances', () => {
  const format = logic.formatInstructionWithDistance;
  assert.equal(format('Slight left', 2), 'Slight left now');
  assert.equal(format('Slight left', 2, 'metric', false), 'Slight left in 2 m');
  assert.equal(format('Arrive at destination', 2, 'metric', false), 'You will arrive at your destination in 2 m');
  assert.equal(format('Arrive at destination', 2), 'You will arrive at your destination now');
  const geometry = [[0,0], [0,0.001], [0,0.002]];
  assert.ok(logic.getDistanceToStepPoint(geometry, 0, 2) > logic.getDistanceToStepPoint(geometry, 0, 1));
});

function turnFixture(degrees) {
  // Project meter offsets near campus, so tests exercise real latitude scaling.
  const latitude = 42.2744;
  const longitude = -71.8075;
  const radians = degrees * Math.PI / 180;
  const point = (east, north) => [latitude + north / 111320,
    longitude + east / (111320 * Math.cos(latitude * Math.PI / 180))];
  const geometry = [point(-20, 0), point(0, 0), point(20 * Math.cos(radians), -20 * Math.sin(radians))];
  return { geometry, navigation: geometry.map((coordinate, i) => ({coordinate, connectionCount: i === 1 ? 4 : 1})) };
}
test('straight paths and gentle left/right bends produce no maneuver row', () => {
  for (const angle of [0, 10, -10, 20, -20, 29, -29]) {
    const f = turnFixture(angle);
    const steps = logic.generateDirections(f.geometry, f.navigation);
    assert.equal(steps.length, 1, `Unexpected maneuver for ${angle} degree bend`);
    assert.equal(steps[0].instruction, 'Arrive at destination');
  }
});
test('meaningful slight turns and full turns still produce directions', () => {
  for (const [angle, expected] of [[35, 'Slight right'], [-35, 'Slight left'], [90, 'Turn right'], [-90, 'Turn left']]) {
    const f = turnFixture(angle);
    const steps = logic.generateDirections(f.geometry, f.navigation);
    assert.equal(steps[0].instruction, expected);
    assert.equal(steps.at(-1).instruction, 'Arrive at destination');
  }
});
