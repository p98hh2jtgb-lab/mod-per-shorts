// Mock of the BeamNG UI app directive: verifies the 0.9.21 panel wiring without
// a browser. Usage: node ui_mock_test.js <app.js path>
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
// Load the real app.js.
new Function('angular', fs.readFileSync(file, 'utf8'))(global.angular);
check(!!directiveDef, 'app.js registered its directive');
eq(directiveDef[0], '$window', 'directive injects $window');

const calls = [];
const listeners = {};
const fakeWindow = {
  bngApi: { engineLua: function (cmd) { calls.push(cmd); } },
  AudioContext: null,
  setTimeout: function () {},
  Audio: function () { return { preload: '', play: function () { return { then: function () { return { catch: function () {} }; } }; } }; }
};
const scope = {
  $on: function (name, fn) { listeners[name] = fn; return function () {}; },
  $applyAsync: function (fn) { fn(); }
};
const directive = directiveDef[1](fakeWindow);
directive.link(scope);

eq(scope.modVersion, '0.9.21', 'panel displays v0.9.21');
check(calls.indexOf('extensions.driftSketch.uiState()') >= 0, 'panel asks for Lua state on load');
eq(scope.state.extraVehicleCount, 0, 'no trailer registered by default');

calls.length = 0;
scope.useSelectedTrailer();
eq(calls[0], 'extensions.driftSketch.useSelectedVehicle()', '"Përdor rimorkion e zgjedhur" calls the Lua registration');
calls.length = 0;
scope.unregisterSelectedTrailer();
eq(calls[0], 'extensions.driftSketch.unregisterSelectedVehicle()', '"Hiq rimorkion e zgjedhur" calls the Lua unregistration');
calls.length = 0;
scope.clearTrailers();
eq(calls[0], 'extensions.driftSketch.clearSelectedVehicles()', '"Hiq të gjitha" calls the Lua clear');
calls.length = 0;
scope.unregisterTrailer('202');
eq(calls[0], 'extensions.driftSketch.unregisterVehicle(202)', 'list row × unregisters by id');
calls.length = 0;
scope.unregisterTrailer('not-a-number');
eq(calls.length, 0, 'invalid list row id is ignored');

// State event from Lua must populate the registered-vehicle list.
check(typeof listeners['driftSketch.state'] === 'function', 'panel listens to driftSketch.state');
listeners['driftSketch.state'](null, {
  extraVehicles: [{id: 202, name: 'Rimorkio_WE', source: 'World Editor'}],
  extraVehicleCount: 1,
  settings: {hudLabel: 'CONES DOWN', topple: true, coneCollision: false, soundVolume: 3},
  toppleEventSerial: 0, eventSession: 's1'
});
eq(scope.state.extraVehicleCount, 1, 'state event updates the trailer count');
eq(scope.state.extraVehicles[0].name, 'Rimorkio_WE', 'state event updates the trailer list');
eq(scope.settings.soundVolume, 3, 'HUD settings still come from Lua state');

console.log('== RESULT: ' + total + ' checks, ' + failed + ' failed ==');
process.exitCode = failed > 0 ? 1 : 0;
