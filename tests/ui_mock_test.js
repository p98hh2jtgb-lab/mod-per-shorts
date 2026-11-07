// DriftSketch 0.9.26 UI panel mock test ---------------------------------------
// Usage: node ui_mock_test_0926.js [path/to/app.js]
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FILE = process.argv[2] || path.join(__dirname, 'ui/modules/apps/DriftSketch/app.js');
const source = fs.readFileSync(FILE, 'utf8');
let total = 0, failed = 0;
function check(cond, msg) {
  total++;
  if (!cond) { failed++; console.log('FAIL: ' + msg); }
  else console.log('ok  : ' + msg);
}
function eq(a, b, msg) { check(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

const commands = [];
const listeners = {};
let linkFn = null;
const angular = {
  module: function () {
    return {
      directive: function (name, def) { linkFn = def[def.length - 1]($window).link; return angular; }
    };
  }
};
const $window = {
  bngApi: {
    engineLua: function (cmd) { commands.push(cmd); }
  }
};
const scope = {
  $on: function (name, fn) { listeners[name] = fn; return function () { delete listeners[name]; }; },
  $applyAsync: function (fn) { fn(); }
};
vm.runInNewContext(source, {angular, JSON, Math, Number, isFinite, console});

check(typeof linkFn === 'function', 'directive link function registered');
linkFn(scope);
eq(scope.modVersion, '0.9.26', 'panel displays version 0.9.26');
eq(scope.settings.rigPad, 1.0, 'safety floor defaults to 1.0 m');
eq(scope.state.rigPoseCount, 0, 'trailer centreline station count starts at 0');
eq(scope.settings.rigAware, true, 'auto-detect checkbox defaults ON');
eq(scope.settings.rigMargin, 0.25, 'extra rig clearance defaults 0.25 m');
eq(scope.settings.collision, false, 'Solid / car damage OFF');
eq(scope.settings.gates, false, 'optional truss gates OFF');
eq(scope.settings.rings, false, 'rings OFF');
eq(scope.state.rigCount, 0, 'rig list starts empty');
check(Array.isArray(scope.state.rigVehicles), 'rigVehicles is an array');
eq(scope.settings.topple, undefined, 'no topple setting');
eq(scope.settings.coneCollision, undefined, 'no physical cone collision setting');
eq(scope.settings.hudCard, undefined, 'no HUD card setting');
eq(scope.settings.soundVolume, undefined, 'no sound setting');
eq(scope.settings.physics, undefined, 'no physics setting');
check(!('toppledCount' in scope.state), 'no topple counter in UI state');
check(commands.indexOf('extensions.driftSketch.uiState()') >= 0, 'initial uiState requested');

// Panel button -> GE extension command (World Editor selected trailer)
const before = commands.length;
scope.redetectRig();
eq(commands[before], 'extensions.driftSketch.redetectRig()', 'Node Grabber re-scan button calls redetectRig()');
scope.useSelectedTrailer();
eq(commands[before + 1], 'extensions.driftSketch.useSelectedVehicle()', 'Use selected trailer calls useSelectedVehicle()');
scope.unregisterSelectedTrailer();
eq(commands[before + 2], 'extensions.driftSketch.unregisterSelectedVehicle()', 'Remove selected calls unregisterSelectedVehicle()');
scope.unregisterTrailer(202);
eq(commands[before + 3], 'extensions.driftSketch.unregisterVehicle(202)', 'per-row x calls unregisterVehicle(id)');
scope.unregisterTrailer('nope');
eq(commands.length, before + 4, 'invalid row id is ignored (no lua command)');
scope.clearTrailers();
eq(commands[before + 4], 'extensions.driftSketch.clearSelectedVehicles()', 'Remove all calls clearSelectedVehicles()');

// Rig settings are passed through with correct numeric/boolean coercion
scope.settings.rigMargin = 0.75;
scope.pushSetting('rigMargin');
eq(commands[commands.length - 1], 'extensions.driftSketch.setSetting("rigMargin",0.75)', 'rigMargin pushed as number');
scope.settings.rigAware = false;
scope.pushSetting('rigAware');
eq(commands[commands.length - 1], 'extensions.driftSketch.setSetting("rigAware",false)', 'rigAware pushed as boolean');
scope.settings.rigPad = 2.4;
scope.pushSetting('rigPad');
eq(commands[commands.length - 1], 'extensions.driftSketch.setSetting("rigPad",2.4)', 'rigPad pushed as number');

// Core actions still work
for (const [fn, cmd] of [
  ['start', 'extensions.driftSketch.start()'],
  ['stop', 'extensions.driftSketch.stop()'],
  ['rebuild', 'extensions.driftSketch.rebuild()'],
  ['clear', 'extensions.driftSketch.clear()'],
  ['placeRings', 'extensions.driftSketch.placeRings()'],
  ['clearRings', 'extensions.driftSketch.clearRings()']
]) { scope[fn](); eq(commands[commands.length - 1], cmd, fn + '() command'); }

// Incoming state from GE, including the rig list
check(typeof listeners['driftSketch.state'] === 'function', 'state listener registered');
listeners['driftSketch.state']({}, {
  recording: false, buildCount: 1, rigCount: 1, rigPoseCount: 161,
  rigVehicles: [{id: 202, name: 'Rimorkio_WE', source: 'Auto'}],
  settings: {mesh: 'cone', rigAware: true, rigMargin: 0.5, spacing: 2}
});
eq(scope.state.rigCount, 1, 'rig count from GE displayed');
eq(scope.state.rigVehicles[0].name, 'Rimorkio_WE', 'rig vehicle name from GE displayed');
eq(scope.settings.rigMargin, 0.5, 'settings snapshot from GE applied');
eq(scope.integer(scope.state.rigCount), 1, 'integer() renders the rig count');
eq(scope.state.rigPoseCount, 161, 'trailer centreline station count from GE displayed');
eq(scope.canRebuild(), true, 'Rebuild enabled after a build');

// HTML wiring
const html = fs.readFileSync(path.join(path.dirname(FILE), 'app.html'), 'utf8');
for (const token of [
  'useSelectedTrailer()', 'unregisterSelectedTrailer()', 'clearTrailers()',
  'unregisterTrailer(veh.id)', 'settings.rigAware', 'settings.rigMargin',
  'state.rigVehicles', 'state.rigCount', 'v{{modVersion}}',
  'RIMORKIO / TRAILER', 'Auto-detect / Zbulo vetë',
  'settings.rigPad', 'Hapësira minimale', 'state.rigPoseCount',
  'pika të vijës së rimorkios', 'REBUILD WITH CURRENT SETTINGS',
  'redetectRig()', 'RIPROVË ZBULIMIN', 'NODE GRABBER',
  'CTRL', 'mesi i mausit', '(Opsionale)', 'ds-rig-ng'
]) check(html.indexOf(token) >= 0, 'HTML contains ' + token);
check(html.indexOf('RIMORKIO / TRAILER') < html.indexOf('MESH &amp; TRACK SETTINGS'),
  'trailer section is at the TOP of the panel (visible without scrolling)');
check(html.indexOf('RIPROVË ZBULIMIN') < html.indexOf('(Opsionale)'),
  'Node Grabber re-scan is offered BEFORE the optional World Editor button');
check(html.indexOf('Nuk duhet ta zgjedhësh në World Editor') >= 0 &&
      html.indexOf('(Opsionale) Objekti i zgjedhur në World Editor') >= 0,
  'panel explains that World Editor selection is NOT required');
for (const token of ['topple', 'counter', 'Counter', 'hudCard', 'soundVolume', 'physics'])
  check(html.toLowerCase().indexOf(token.toLowerCase()) < 0, 'HTML free of ' + token);

console.log('== RESULT: ' + total + ' checks, ' + failed + ' failed ==');
process.exit(failed ? 1 : 0);
