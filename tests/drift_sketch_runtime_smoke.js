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
assert.strictEqual(scope.modVersion, '0.2.0');
assert(!Object.prototype.hasOwnProperty.call(scope.settings, 'sides'));
assert(commands.includes('extensions.driftSketch.uiState()'));
scope.start(); scope.stop(); scope.rebuild(); scope.clear();
assert(commands.includes('extensions.driftSketch.start()'));
assert(commands.includes('extensions.driftSketch.stop()'));
assert(commands.includes('extensions.driftSketch.rebuild()'));
assert(commands.includes('extensions.driftSketch.clear()'));
scope.settings.spacing = '3.2';
scope.pushSetting('spacing');
assert(commands.at(-1).includes('"spacing",3.2'));
scope.pushSetting('mesh');
assert(commands.at(-1).includes('"mesh","cone"'));
scope.handlers['driftSketch.state']({}, {recording:true, pointCount:12, pathLength:18.25,
  buildCount:0, coneCount:0, vehicleName:'Test Vehicle', status:'Recording', settings:{mesh:'pylon',spacing:3.2}});
assert.strictEqual(scope.state.recording, true);
assert.strictEqual(scope.settings.mesh, 'pylon');
assert.strictEqual(scope.meters(scope.state.pathLength), '18.3 m');
assert.strictEqual(scope.integer(12.6), 13);
console.log('✓ DriftSketch Start/Stop/Rebuild/Clear and settings issue real GE Lua commands');

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
assert(html.includes('Both sides') && !html.includes('AUTO CAR CLEARANCE') && !html.includes('Min. track width'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'DriftSketch/ui/modules/apps/DriftSketch/app.json'), 'utf8'));
assert.strictEqual(manifest.directive, 'driftSketchPanel');
console.log(`✓ DriftSketch ${expressions.length} Angular expressions resolve; app manifest/icon exist`);
