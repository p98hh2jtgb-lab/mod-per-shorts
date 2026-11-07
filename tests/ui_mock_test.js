// Mock of the BeamNG UI app directive for the 0.9.22 clean rollback.
// Usage: node ui_mock_test.js <app.js path>
const fs = require('fs');
const file = process.argv[2];
let total = 0, failed = 0;
function check(cond, msg) {
  total++;
  if (!cond) { failed++; console.log('FAIL: ' + msg); }
  else console.log('ok  : ' + msg);
}
function eq(a, b, msg) { check(a === b, msg + ' (got ' + String(a) + ', expected ' + String(b) + ')'); }

let directiveDef = null;
global.angular = {
  module: function () {
    return { directive: function (name, def) { check(name === 'driftSketchPanel', 'registers driftSketchPanel'); directiveDef = def; } };
  }
};
new Function('angular', fs.readFileSync(file, 'utf8'))(global.angular);
check(!!directiveDef, 'app.js registered its directive');
eq(directiveDef[0], '$window', 'directive injects $window');

const calls = [];
const listeners = {};
const fakeWindow = { bngApi: { engineLua: function (cmd) { calls.push(cmd); } } };
const scope = {
  $on: function (name, fn) { listeners[name] = fn; return function () {}; },
  $applyAsync: function (fn) { fn(); }
};
directiveDef[1](fakeWindow).link(scope);

eq(scope.modVersion, '0.9.22', 'panel displays v0.9.22');
check(calls.indexOf('extensions.driftSketch.uiState()') >= 0, 'panel asks for Lua state on load');

const forbidden = ['topple', 'coneCollision', 'hudTotal', 'hudLabel', 'hudSize', 'hudStyle',
  'hudCard', 'hudOutline', 'hudGlow', 'hudShadow', 'soundEnabled', 'soundVolume',
  'useSelectedTrailer', 'unregisterSelectedTrailer', 'clearTrailers', 'playHitSound'];
for (const key of forbidden) {
  check(!(key in scope.settings) && typeof scope[key] === 'undefined',
    'removed feature is absent from the panel: ' + key);
}

const actions = [
  ['start', 'extensions.driftSketch.start()'],
  ['stop', 'extensions.driftSketch.stop()'],
  ['rebuild', 'extensions.driftSketch.rebuild()'],
  ['clear', 'extensions.driftSketch.clear()']
];
for (const [fn, cmd] of actions) {
  calls.length = 0;
  scope[fn]();
  eq(calls[0], cmd, '"' + fn + '" calls ' + cmd);
}
calls.length = 0;
scope.settings.spacing = 2.5;
scope.pushSetting('spacing');
eq(calls[0], 'extensions.driftSketch.setSetting("spacing",2.5)', 'pushSetting sends numeric setting');

check(typeof listeners['driftSketch.state'] === 'function', 'panel listens to driftSketch.state');
listeners['driftSketch.state'](null, {
  recording: false, coneCount: 56, buildCount: 1,
  settings: {spacing: 1.0, gap: 0.3, groundOffset: -0.55, maxCones: 2000,
    smooth: true, keepBuilds: true, driftWidth: false}
});
eq(scope.state.coneCount, 56, 'state event updates cone count');
check(scope.state.toppledCount === undefined && scope.state.displayTotal === undefined,
  'no counter/HUD numbers in state');
check(scope.state.extraVehicles === undefined, 'no World Editor trailer list in state');

console.log('== RESULT: ' + total + ' checks, ' + failed + ' failed ==');
process.exitCode = failed > 0 ? 1 : 0;
