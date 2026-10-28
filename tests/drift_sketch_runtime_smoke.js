/* DriftSketch Angular binding and command smoke test. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const directives = Object.create(null);
const moduleApi = {directive(name, definition) { directives[name] = definition; return moduleApi; }};
global.angular = {module:() => moduleApi};
const commands = [];
const windowObject = {bngApi:{engineLua(command) { commands.push(command); }}};
const scope = {
  handlers:{},
  $on(name, fn) { this.handlers[name] = fn; return () => { delete this.handlers[name]; }; },
  $applyAsync(fn) { if (fn) fn(); }
};
require(path.join(ROOT, 'DriftSketch/ui/modules/apps/DriftSketch/app.js'));
const definition = directives.driftSketchPanel;
assert(definition, 'DriftSketch directive must register');
const factory = definition[definition.length - 1];
const directive = factory(windowObject);
directive.link(scope, [{style:{}}]);
assert.strictEqual(scope.modVersion, '0.9.1');
assert(!Object.prototype.hasOwnProperty.call(scope.settings, 'sides'));
assert.strictEqual(scope.settings.collision, false);
assert.strictEqual(scope.settings.driftWidth, false, 'Drift widen OFF by default: tight corridor');
assert.strictEqual(scope.settings.gap, 0.3);
assert.strictEqual(scope.settings.width, undefined, 'Base width replaced by Gap to car');
assert.strictEqual(scope.settings.gates, true);
assert.strictEqual(scope.settings.spacing, 1.0);
assert.strictEqual(scope.settings.tireColors, 'rw');
assert.deepStrictEqual([scope.settings.rings, scope.settings.ringCount, scope.settings.ringSize, scope.settings.ringGap,
  scope.settings.ringLift], [false, 5, 7.0, 15.0, 0.0]);
assert(commands.includes('extensions.driftSketch.uiState()'));
scope.start(); scope.stop(); scope.rebuild(); scope.clear(); scope.placeRings(); scope.clearRings();
for (const name of ['start', 'stop', 'rebuild', 'clear', 'placeRings', 'clearRings']) {
  assert(commands.includes(`extensions.driftSketch.${name}()`), name);
}
scope.settings.spacing = '0.6';
scope.pushSetting('spacing');
assert(commands.at(-1).includes('"spacing",0.6'));
for (const [key, raw, sent] of [['ringCount', '12', '12'], ['ringSize', '9.5', '9.5'], ['ringGap', '25', '25'], ['ringLift', '1.25', '1.25']]) {
  scope.settings[key] = raw;
  scope.pushSetting(key);
  assert.strictEqual(commands.at(-1), `extensions.driftSketch.setSetting("${key}",${sent})`, key + ' is sent as a number');
}
scope.pushSetting('mesh');
assert(commands.at(-1).includes('"mesh","cone"'));
scope.selectMesh('tireStack');
assert.strictEqual(scope.settings.mesh, 'tireStack');
assert(commands.at(-1).includes('"mesh","tireStack"'));
const count = commands.length;
scope.selectMesh('pylon'); scope.selectMesh('tire');
assert.strictEqual(commands.length, count, 'removed meshes cannot be selected');
assert.strictEqual(scope.settings.mesh, 'tireStack');
scope.selectTireColors('rwb');
assert.strictEqual(commands.at(-1), 'extensions.driftSketch.setSetting("tireColors","rwb")');
scope.selectTireColors('pink');
assert.strictEqual(scope.settings.tireColors, 'rwb');
scope.settings.rings = true;
scope.pushSetting('rings');
assert(commands.at(-1).includes('"rings",true'));
scope.pushSetting('collision');
assert(commands.at(-1).includes('"collision",false'));
scope.pushSetting('gates');
assert(commands.at(-1).includes('"gates",true'));
assert.strictEqual(scope.canRebuild(), false);
scope.handlers['driftSketch.state']({}, {recording:true, pointCount:12, pathLength:18.25,
  buildCount:0, coneCount:0, ringsBuilt:3, ringSetCount:1, meshCount:3, vehicleName:'Test Vehicle', status:'Recording',
  settings:{mesh:'cone', spacing:3.2, rings:false}});
assert.strictEqual(scope.state.recording, true);
assert.strictEqual(scope.settings.mesh, 'cone');
assert.strictEqual(scope.meters(scope.state.pathLength), '18.3 m');
assert.strictEqual(scope.integer(12.6), 13);
assert.strictEqual(scope.meshTotal(), 3);
assert.strictEqual(scope.canRebuild(), false, 'no rebuild while recording');
assert.strictEqual(scope.hasRings(), true);
scope.handlers['driftSketch.state']({}, {recording:false, buildCount:0, ringSetCount:1, coneCount:0, ringsBuilt:4,
  settings:{mesh:'cone'}});
assert.strictEqual(scope.canRebuild(), true, 'placed rings alone can be rebuilt');
assert.strictEqual(scope.meshTotal(), 4, 'mesh total falls back to markers + rings');
console.log('✓ DriftSketch Start/Stop/Rebuild/Clear, rings and settings issue real GE Lua commands');

const js = fs.readFileSync(path.join(ROOT, 'DriftSketch/ui/modules/apps/DriftSketch/app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'DriftSketch/ui/modules/apps/DriftSketch/app.html'), 'utf8');
const defined = new Set([...js.matchAll(/scope\.([A-Za-z_$][\w$]*)\s*=/g)].map(match => match[1]));
const expressions = [];
for (const match of html.matchAll(/(?:ng-[a-z-]+)="([^"]*)"/g)) expressions.push(match[1]);
for (const match of html.matchAll(/\{\{([^}]*)\}\}/g)) expressions.push(match[1]);
const missing = new Set();
for (const expression of expressions) {
  for (const match of expression.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = match[1];
    if (expression.slice(0, match.index).trimEnd().endsWith('.')) continue;
    if (!defined.has(name)) missing.add(name + ' ← ' + expression);
  }
}
assert.deepStrictEqual([...missing], []);
assert(fs.existsSync(path.join(ROOT, 'DriftSketch/ui/modules/apps/DriftSketch/app.png')));
assert(!html.includes('Left only') && !html.includes('Right only') && !html.includes("pushSetting('sides')"));
assert(html.includes('Both sides') && html.includes('Solid / car damage') && html.includes("pushSetting('collision')"));
assert(html.includes('Drift widen') && html.includes('SI PUNON PANELI') && html.includes("pushSetting('driftWidth')"));
assert(html.includes('Gap to car') && html.includes("pushSetting('gap')") && !html.includes('Base width') && !html.includes("settings.width"));
assert(html.includes('<b>Gap to car:</b>') && html.includes('korridor shumë i ngushtë'));
assert(html.includes('Start / Finish gates') && html.includes("pushSetting('gates')"));
assert(!html.includes('Tall Pylon') && !html.includes('Single Tire') && !html.includes('data-mesh="pylon"') && !html.includes('data-mesh="tire"'));
assert(html.includes('Traffic Cone') && html.includes('Tire Stack') && html.includes('data-mesh="cone"') && html.includes('data-mesh="tireStack"'));
assert(!html.includes('<select') && html.includes('1 CLICK · NO DROPDOWN'));
assert(html.includes('data-colors="rw"') && html.includes('data-colors="rwb"'));
assert(/type="range" min="0\.5" max="10" step="0\.1" ng-model="settings\.spacing"/.test(html), 'spacing reaches 0.5 m');
for (const key of ['ringCount', 'ringSize', 'ringGap', 'ringLift', 'rings']) assert(html.includes(`pushSetting('${key}')`), key);
assert(html.includes('ng-click="placeRings()"') && html.includes('ng-click="clearRings()"'));
assert(html.includes('Rings on drive') && html.includes('PLACE RINGS AHEAD'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'DriftSketch/ui/modules/apps/DriftSketch/app.json'), 'utf8'));
assert.strictEqual(manifest.directive, 'driftSketchPanel');
console.log(`✓ DriftSketch ${expressions.length} Angular expressions resolve; app manifest/icon exist`);
