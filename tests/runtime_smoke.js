/* Node-only Angular/CEF smoke harness. No BeamNG required.
 * Optional: set FENGARI_PATH (or install fengari) and every engineLua command the panel
 * sends is compiled exactly the way BeamNG runs it. With a callback, BeamNG's bngApi
 * embeds the command as an expression: guihooks.trigger("onBNGAPICallback", id, <cmd>).
 * The 6.0.0–6.2.0 gallery scan sent "extensions.load(...); ..." with a callback, which is
 * a Lua syntax error in the game; this harness now fails on that.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const bundledManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'CreatorPack/ui/modules/apps/CreatorPack/gallery.json'), 'utf8'));
const directives = Object.create(null);
const listeners = Object.create(null);
const documentHandlers = Object.create(null);
const luaCommands = [];
const luaCallbackCommands = [];
const luaSyntaxErrors = [];
let fengari = null;
try { fengari = require(process.env.FENGARI_PATH || 'fengari'); } catch (e) { fengari = null; }
function luaCompiles(src) {
  if (!fengari) return null;
  const { lua, lauxlib, to_luastring } = fengari;
  const L = lauxlib.luaL_newstate();
  const status = lauxlib.luaL_loadstring(L, to_luastring(src));
  return status === lua.LUA_OK ? true : lua.lua_tojsstring(L, -1);
}
function recordLua(command, callback) {
  luaCommands.push(command);
  if (callback) luaCallbackCommands.push(command);
  const wrapped = callback ? 'guihooks.trigger("onBNGAPICallback",1,' + command + ')' : command;
  const result = luaCompiles(wrapped);
  if (result === null) {
    if (callback && command.includes(';')) luaSyntaxErrors.push('callback command contains ";": ' + command);
  } else if (result !== true) {
    luaSyntaxErrors.push(result + '  <-  ' + command.slice(0, 160));
  }
}
// Runs one UI command in Lua with a stub extension and returns {fn, args} as Lua saw them.
function luaCall(command) {
  if (!fengari) return null;
  const { lua, lauxlib, lualib, to_luastring } = fengari;
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const prelude = `captured = nil
extensions = { load = function() end, creatorpack = setmetatable({}, { __index = function(t, k)
  return function(...) captured = { fn = k, args = { ... } } end end }) }
`;
  const after = `
local out = { captured and captured.fn or '' }
for i, v in ipairs(captured and captured.args or {}) do out[#out + 1] = tostring(v) end
return table.concat(out, string.char(31))`;
  const status = lauxlib.luaL_dostring(L, to_luastring(prelude + command + after));
  if (status !== lua.LUA_OK) throw new Error('Lua failed: ' + lua.lua_tojsstring(L, -1) + ' <- ' + command);
  const parts = lua.lua_tojsstring(L, -1).split('\x1f');
  return { fn: parts[0], args: parts.slice(1) };
}
let timeoutId = 0;
const timers = new Map();

function forEach(value, fn) {
  if (!value) return;
  if (Array.isArray(value)) value.forEach((v, i) => fn(v, i));
  else Object.keys(value).forEach(k => fn(value[k], k));
}
const moduleApi = {
  directive(name, definition) {
    directives[name] = definition;
    return moduleApi;
  }
};
global.angular = {
  module: () => moduleApi,
  forEach,
  extend: (...args) => Object.assign(...args),
  copy: value => value === undefined ? undefined : JSON.parse(JSON.stringify(value)),
  isArray: Array.isArray,
  element: () => ({ scope: () => currentScope })
};

const store = new Map();
const localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};
global.localStorage = localStorage;

const audioInstances = [];
class FakeAudio {
  constructor() { this.preload = ''; this.volume = 1; this.src = ''; this.played = 0; audioInstances.push(this); }
  load() {}
  play() { this.played++; return Promise.resolve(); }
  cloneNode() { const a = new FakeAudio(); a.src = this.src; return a; }
}
class FakeXHR {
  open(method, url) { this.url = url; }
  send() {
    this.status = 200;
    if (this.url === '/ui/modules/apps/CreatorPack/gallery.json') {
      this.responseText = fs.readFileSync(path.join(ROOT, 'CreatorPack/ui/modules/apps/CreatorPack/gallery.json'), 'utf8');
      this.response = this.responseText;
    } else {
      this.response = new ArrayBuffer(256);
    }
    if (this.onload) this.onload();
  }
}
global.XMLHttpRequest = FakeXHR;

// Minimal synchronous image/canvas/FileReader fakes so photo flows run in Node.
const brokenSources = new Set();
class FakeImage {
  constructor() { this.naturalWidth = 0; this.naturalHeight = 0; this.onload = null; this.onerror = null; this._src = ''; }
  set src(value) {
    this._src = String(value);
    if (brokenSources.has(this._src) || this._src.includes('BROKEN')) { if (this.onerror) this.onerror(); return; }
    this.naturalWidth = this.width = 640; this.naturalHeight = this.height = 480;
    if (this.onload) this.onload();
  }
  get src() { return this._src; }
}
const canvasCalls = [];
function fakeCanvas() {
  const canvas = {
    width: 0, height: 0, style: {},
    getContext: () => ({ clearRect() {}, fillRect() {}, drawImage(im, x, y, w, h) { canvasCalls.push({ w, h }); }, set fillStyle(v) {} }),
    toDataURL: type => 'data:' + (type || 'image/png') + ';base64,' + Buffer.from('canvas:' + canvas.width + 'x' + canvas.height + ':' + (type || 'image/png') + '|' + 'p'.repeat(64)).toString('base64')
  };
  return canvas;
}
class FakeFileReader {
  readAsDataURL(file) {
    this.result = file.dataUrl || ('data:' + (file.type || 'image/png') + ';base64,' + Buffer.from(file.name).toString('base64'));
    if (this.onload) this.onload({ target: this });
  }
}
global.Image = FakeImage;
global.FileReader = FakeFileReader;
const fakeDocumentNode = {
  fonts: { check: () => true },
  querySelector: () => null,
  createElement: tag => (tag === 'canvas' ? fakeCanvas() : { style: {}, getContext: () => null })
};
const windowObject = {
  innerWidth: 1920,
  innerHeight: 1080,
  document: fakeDocumentNode,
  localStorage,
  Audio: FakeAudio,
  XMLHttpRequest: FakeXHR,
  addEventListener() {},
  removeEventListener() {},
  getComputedStyle: () => ({ fontFamily: 'Bebas Neue HUD' }),
  bngApi: {
    engineLua(command, callback) { recordLua(command, callback); },
    engineLuaAsync(command) { recordLua(command); }
  }
};
global.window = windowObject;
global.document = fakeDocumentNode;

const documentService = {
  on(name, fn) { (documentHandlers[name] || (documentHandlers[name] = [])).push(fn); },
  off(name, fn) {
    if (!documentHandlers[name]) return;
    documentHandlers[name] = fn ? documentHandlers[name].filter(x => x !== fn) : [];
  }
};
function timeout(fn, delay) {
  const id = ++timeoutId;
  timers.set(id, { fn, delay });
  return id;
}
timeout.cancel = id => timers.delete(id);

const rootScope = {
  $on(name, fn) {
    (listeners[name] || (listeners[name] = [])).push(fn);
    return () => { listeners[name] = (listeners[name] || []).filter(x => x !== fn); };
  }
};
function emit(name, data) {
  (listeners[name] || []).slice().forEach(fn => fn({}, data));
}
let currentScope = null;
function makeScope() {
  const own = Object.create(null);
  const scope = {
    $root: rootScope,
    $apply(fn) { if (fn) fn(); },
    $applyAsync(fn) { if (fn) fn(); },
    $evalAsync(fn) { if (fn) fn(); },
    $watch() { return () => {}; },
    $on(name, fn) { (own[name] || (own[name] = [])).push(fn); return () => {}; },
    $destroy() { (own.$destroy || []).forEach(fn => fn()); }
  };
  return scope;
}
const element = [{
  style: {},
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, focus() {}
}];

function instantiate(file, directiveName) {
  const full = path.join(ROOT, file);
  delete require.cache[require.resolve(full)];
  require(full);
  const definition = directives[directiveName];
  assert(definition, 'Directive not registered: ' + directiveName);
  const factory = Array.isArray(definition) ? definition[definition.length - 1] : definition;
  const directive = factory(documentService, windowObject, timeout, rootScope);
  const link = directive.link || directive;
  const scope = makeScope();
  currentScope = scope;
  link(scope, element, null);
  return scope;
}

function checkHtmlBindings(jsFile, htmlFile) {
  const js = fs.readFileSync(path.join(ROOT, jsFile), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
  const defined = new Set();
  for (const match of js.matchAll(/scope\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(match[1]);
  const expressions = [];
  for (const match of html.matchAll(/(?:ng-[a-z-]+|onchange)="([^"]*)"/g)) expressions.push(match[1]);
  for (const match of html.matchAll(/\{\{([^}]*)\}\}/g)) expressions.push(match[1]);
  const missing = new Set();
  const keywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'function']);
  for (const expression of expressions) {
    for (const match of expression.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = match[1];
      const before = expression.slice(0, match.index).trimEnd();
      if (before.endsWith('.') || keywords.has(name)) continue;
      if (!defined.has(name)) missing.add(name + ' ← ' + expression);
    }
  }
  assert.deepStrictEqual([...missing], [], 'Missing Angular bindings in ' + htmlFile);
  return expressions.length;
}

const results = [];
function ok(name) { results.push(name); console.log('✓ ' + name); }

// Static HTML → scope binding verification.
const mainBindingCount = checkHtmlBindings(
  'CreatorPack/ui/modules/apps/CreatorPack/app.js',
  'CreatorPack/ui/modules/apps/CreatorPack/app.html');
ok('CreatorPack Angular bindings resolved (' + mainBindingCount + ' expressions)');
// CreatorPack runtime logic.
const main = instantiate('CreatorPack/ui/modules/apps/CreatorPack/app.js', 'creatorpackPanel');
assert.strictEqual(main.modVersion, '6.3.0');
assert.strictEqual(main.cfg.items.length, 8);
assert.strictEqual(main.toggleCost, undefined);
ok('CreatorPack boots with clean vehicle-only configuration');

assert.strictEqual(main.gallery.length, bundledManifest.files.length);
assert.strictEqual(main.addImageByName, undefined);
assert.strictEqual(main.onManualImage, undefined);
assert.strictEqual(directives.pfFileRead, undefined);
assert(directives.cpFilePick, 'Choose File directive must be registered');
assert(directives.cpImgEvents, 'Gallery image fallback directive must be registered');
assert.strictEqual(typeof main.onPickedFiles, 'function');
assert.strictEqual(typeof main.openImageFolder, 'function');
assert.strictEqual(main.ui.tab, 'kryesore');
for (const name of bundledManifest.files) {
  assert(fs.existsSync(path.join(ROOT, 'CreatorPack/ui/modules/apps/CreatorPack/imazhet', name)), 'Missing gallery image: ' + name);
}
ok('All ' + bundledManifest.files.length + ' bundled images appear before Lua answers; Choose File and open-folder exist');

const originalLayout = main.cfg.layout;
const originalX = main.cfg.positionX;
main.setShortsMode(true);
assert.strictEqual(main.cfg.shortsMode, true);
assert.strictEqual(main.cfg.layout, 'grid');
assert.strictEqual(main.cfg.gridCols, 2);
assert.strictEqual(main.cfg.guideRatio, '9:16');
assert.strictEqual(main.visibleCircleCount(), 4);
for (let i = 0; i < 4; i++) assert.strictEqual(main.circleVisible(i), true);
assert.strictEqual(main.circleVisible(4), false);
main.cfg.items[0].enabled = false;
assert.strictEqual(main.visibleCircleCount(), 4, 'Shorts must stay at four circles even after a legacy disable flag');
main.cfg.items[0].enabled = true;
assert.strictEqual(main.guideDimLeftStyle, undefined);
assert.strictEqual(main.guideDimRightStyle, undefined);
assert.strictEqual(main.cfg.guideDim, undefined);
const topY = main.cfg.positionY;
main.shortsPlace('bottom');
assert.notStrictEqual(main.cfg.positionY, topY);
assert(main.cfg.positionY >= 0);
main.setShortsMode(true);
assert.strictEqual(main.visibleCircleCount(), 4);
main.toggleVehicles();
assert.strictEqual(main.cfg.vehiclesOn, true);
assert.strictEqual(main.visibleCircleCount(), 4);
main.cleanCapture();
assert.strictEqual(main.cfg.showPanel, false);
assert.strictEqual(main.cfg.guidesOn, false);
assert.strictEqual(main.visibleCircleCount(), 4);
main.togglePanel();
assert.strictEqual(main.cfg.showPanel, true);
assert.strictEqual(main.cfg.guidesOn, true);
main.loadPreset({data:{shortsMode:false, layout:'column', gridCols:7, vehiclesOn:false, showArrows:true}});
assert.strictEqual(main.cfg.shortsMode, true);
assert.strictEqual(main.cfg.layout, 'grid');
assert.strictEqual(main.cfg.gridCols, 2);
assert.strictEqual(main.cfg.vehiclesOn, true);
assert.strictEqual(main.vehiclesVisible(), true);
assert.strictEqual(main.hudStyle().gridTemplateColumns, 'repeat(2, auto)');
assert.strictEqual(main.visibleCircleCount(), 4);
ok('Shorts keeps exactly four visible circles, 2×2 layout, 9:16 guides and safe placement');

main.setShortsMode(false);
assert.strictEqual(main.cfg.layout, originalLayout);
assert.strictEqual(main.cfg.positionX, originalX);
assert.strictEqual(main.visibleCircleCount(), 8);
emit('pfhud.action', { action: 'toggleShorts' });
assert.strictEqual(main.cfg.shortsMode, true);
emit('pfhud.action', { action: 'toggleShorts' });
assert.strictEqual(main.cfg.shortsMode, false);
ok('Shorts restores the previous layout and Lua action toggles both ways');

main.setSeries6Mode(true);
assert.strictEqual(main.cfg.series6Mode, true);
assert.strictEqual(main.cfg.shortsMode, true);
assert.strictEqual(main.cfg.seriesPreset, 'bmw');
assert.strictEqual(main.seriesPresets.length, 10);
assert.deepStrictEqual(main.seriesPresets.map(preset => preset.name), [
  'BMW', 'Toyota LC300', 'Lightning McQueen', 'Mercedes G-Class',
  'Lamborghini Huracán', 'Nissan GT-R R34', 'Toyota Supra MK4',
  'Ford Mustang GT', 'Jeep Wrangler', 'Semi Truck'
]);
const expectedSeriesColors = ['#f4df28', '#3978f6', '#ff8a32', '#f04444', '#58d83e', '#f45bd5'];
const expectedSeriesScales = [0.46, 0.58, 0.70, 0.82, 0.94, 1.06];
let seriesAssetCount = 0;
for (const preset of main.seriesPresets) {
  main.setSeriesPreset(preset.id);
  assert.strictEqual(main.cfg.seriesPreset, preset.id);
  assert.strictEqual(main.seriesSlots.length, 6);
  assert.deepStrictEqual(main.seriesSlots.map(slot => slot.color), expectedSeriesColors, preset.name + ' palette');
  assert.deepStrictEqual(main.seriesSlots.map(slot => slot.scale), expectedSeriesScales, preset.name + ' scales');
  for (const slot of main.seriesSlots) {
    assert(fs.existsSync(path.join(ROOT, 'CreatorPack', slot.image)), 'Missing Series asset: ' + slot.image);
    seriesAssetCount++;
  }
}
assert.strictEqual(seriesAssetCount, 60);
main.setSeriesPreset('bmw');
ok('All 10 Series presets keep the BMW palette/scales and resolve 60 transparent variants');
assert.strictEqual(main.seriesSlots.length, 6);
assert.strictEqual(main.visibleCircleCount(), 6);
assert.deepStrictEqual(main.seriesSlots.map(slot => slot.label), [
  'TINY CAR', 'SMALL CAR', 'MEDIUM CAR', 'NORMAL CAR', 'BIG CAR', 'GIANT CAR'
]);
assert.deepStrictEqual(main.seriesSlots.map(slot => slot.color), [
  '#f4df28', '#3978f6', '#ff8a32', '#f04444', '#58d83e', '#f45bd5'
]);
for (let i = 0; i < 6; i++) {
  assert.strictEqual(main.circleVisible(i), true);
  assert.strictEqual(main.cfg.items[i].enabled, true);
  const asset = path.join(ROOT, 'CreatorPack', main.seriesSlots[i].image);
  assert(fs.existsSync(asset), 'Missing Series 6 asset: ' + main.seriesSlots[i].image);
  assert(main.seriesImageStyle(main.seriesSlots[i]).width.endsWith('px'));
}
assert.strictEqual(main.circleVisible(6), false);
assert(main.seriesSlots.every((slot, i, all) => i === 0 || slot.scale > all[i - 1].scale));
assert.strictEqual(main.seriesActiveTitle(), 'TINY CAR');
assert.strictEqual(main.seriesSlotStyle(1).marginLeft, '14px');
assert(main.seriesTitleStyle().WebkitTextStroke.includes('2.5px'));
assert.strictEqual(main.seriesTitleStyle().textShadow, 'none');
const normalSlotWidth = parseFloat(main.seriesSlotStyle(1).width);
main.cfg.seriesGap = -18;
assert.strictEqual(main.seriesSlotStyle(1).marginLeft, '-18px');
assert.strictEqual(parseFloat(main.seriesSlotStyle(1).width), normalSlotWidth);
main.cfg.seriesGap = 24;
assert.strictEqual(main.seriesSlotStyle(1).marginLeft, '24px');
assert.strictEqual(parseFloat(main.seriesSlotStyle(1).width), normalSlotWidth);
const normalTitleSize = parseFloat(main.seriesTitleStyle().fontSize);
main.cfg.seriesTitleSize = 125;
assert(parseFloat(main.seriesTitleStyle().fontSize) > normalTitleSize);
main.cfg.seriesTitleOutline = 0;
assert.strictEqual(main.seriesTitleStyle().WebkitTextStroke, '0px transparent');
main.resetSeriesAppearance();
assert.strictEqual(main.cfg.seriesGap, 14);
assert.strictEqual(main.cfg.seriesCarScale, 100);
assert.strictEqual(main.cfg.seriesTitleSize, 100);
assert.strictEqual(main.cfg.seriesTitleOutline, 2.5);
main.select(5);
assert.strictEqual(main.seriesActiveTitle(), 'GIANT CAR');
const giantWidth = parseFloat(main.seriesImageStyle(main.seriesSlots[5], 5).width);
main.cfg.seriesSlotX[5] = 24;
main.cfg.seriesSlotScale[5] = 120;
assert.strictEqual(main.seriesSlotStyle(5).transform, 'translateX(24px)');
assert(parseFloat(main.seriesImageStyle(main.seriesSlots[5], 5).width) > giantWidth);
const tinyWidth = parseFloat(main.seriesImageStyle(main.seriesSlots[0], 0).width);
main.cfg.seriesCarScale = 80;
assert(parseFloat(main.seriesImageStyle(main.seriesSlots[0], 0).width) < tinyWidth);
main.resetSeriesSelected();
assert.strictEqual(main.cfg.seriesSlotX[5], 0);
assert.strictEqual(main.cfg.seriesSlotScale[5], 100);
main.resetSeriesAppearance();
assert.strictEqual(main.cfg.seriesCarScale, 100);
assert(main.cfg.seriesSlotX.every(value => value === 0));
assert(main.cfg.seriesSlotScale.every(value => value === 100));
const shortsSeriesWidth = parseFloat(main.seriesHudStyle().width);
const shortsGiantWidth = parseFloat(main.seriesImageStyle(main.seriesSlots[5], 5).width);
assert.strictEqual(main.cfg.seriesView, 'shorts');
main.setSeriesView('full');
assert.strictEqual(main.cfg.seriesView, 'full');
assert.strictEqual(parseFloat(main.seriesHudStyle().width), main.viewport.w);
assert(parseFloat(main.seriesImageStyle(main.seriesSlots[5], 5).width) > shortsGiantWidth * 2);
main.seriesPlace('center');
const fullBaseLeft = parseFloat(main.seriesHudStyle().left);
const fullBaseTop = parseFloat(main.seriesHudStyle().top);
main.cfg.seriesOffsetX = 35;
main.cfg.seriesOffsetY = -20;
assert.strictEqual(parseFloat(main.seriesHudStyle().left), fullBaseLeft + 35);
assert.strictEqual(parseFloat(main.seriesHudStyle().top), fullBaseTop - 20);
main.resetSeriesPosition();
assert.strictEqual(main.cfg.seriesOffsetX, 0);
assert.strictEqual(main.cfg.seriesOffsetY, 0);
const fullCenterY = main.cfg.positionY;
main.seriesPlace('bottom');
assert.notStrictEqual(main.cfg.positionY, fullCenterY);
main.setSeriesView('shorts');
assert.strictEqual(parseFloat(main.seriesHudStyle().width), shortsSeriesWidth);
const autoTinyMark = parseFloat(main.seriesMarkStyle(0).fontSize);
const autoBigMark = parseFloat(main.seriesMarkStyle(4).fontSize);
const autoGiantMark = parseFloat(main.seriesMarkStyle(5).fontSize);
const tinyCarWidth = parseFloat(main.seriesImageStyle(main.seriesSlots[0], 0).width);
const bigCarWidth = parseFloat(main.seriesImageStyle(main.seriesSlots[4], 4).width);
const giantCarWidth = parseFloat(main.seriesImageStyle(main.seriesSlots[5], 5).width);
assert(autoTinyMark < autoGiantMark, 'Auto marks must fit each car instead of using one fixed size');
assert(Math.abs(autoTinyMark - tinyCarWidth * 0.40) <= 1, 'Non-linear curve must make TINY smaller than the old 62% fit');
assert(autoTinyMark < tinyCarWidth * 0.62);
assert(autoBigMark > bigCarWidth * 0.62, 'BIG must be larger than the old linear fit');
assert(Math.abs(autoGiantMark - giantCarWidth * 0.82) <= 1, 'GIANT must use the enlarged end of the curve');
assert(autoGiantMark > giantCarWidth * 0.62);
main.cfg.seriesMarkScale = 150;
assert(Math.abs(parseFloat(main.seriesMarkStyle(0).fontSize) - autoTinyMark * 1.5) <= 1);
main.cfg.seriesMarkAuto = false;
assert.strictEqual(main.seriesMarkStyle(0).fontSize, main.seriesMarkStyle(5).fontSize);
main.resetSeriesAppearance();
assert.strictEqual(main.cfg.seriesMarkAuto, true);
assert.strictEqual(main.cfg.seriesMarkScale, 100);
main.next();
assert.strictEqual(main.selected, 5, 'Series navigation must stop at GIANT');
main.select(0);
main.markState('pass');
assert.strictEqual(main.cfg.items[0].state, 'pass');
assert.strictEqual(main.selected, 1);
assert.strictEqual(main.seriesActiveTitle(), 'SMALL CAR');
main.undo();
assert.strictEqual(main.cfg.items[0].state, 'pending');
assert.strictEqual(main.selected, 0);
main.markState('fail');
assert.strictEqual(main.cfg.items[0].state, 'fail');
assert.strictEqual(main.selected, 1);
main.resetStates();
assert.strictEqual(main.selected, 0);
assert(main.cfg.items.slice(0, 6).every(item => item.state === 'pending'));
main.seriesPlace('top');
const seriesTop = main.cfg.positionY;
main.seriesPlace('bottom');
assert.notStrictEqual(main.cfg.positionY, seriesTop);
assert(main.cfg.positionY >= 0);
main.cleanCapture();
assert.strictEqual(main.cfg.showPanel, false);
assert.strictEqual(main.cfg.guidesOn, false);
assert.strictEqual(main.visibleCircleCount(), 6);
main.togglePanel();
assert.strictEqual(main.cfg.showPanel, true);
assert.strictEqual(main.cfg.guidesOn, true);
main.setShortsMode(true);
assert.strictEqual(main.cfg.series6Mode, false);
assert.strictEqual(main.visibleCircleCount(), 4);
assert.strictEqual(main.cfg.layout, 'grid');
assert.strictEqual(main.cfg.gridCols, 2);
main.setShortsMode(false);
assert.strictEqual(main.visibleCircleCount(), 8);
ok('Series keeps Full Size, X/Y placement, per-car controls, non-linear marks, title outline, K/L flow and separate Shorts');

main.cfg.markGlow = 0;
main.cfg.markOutline = 0;
assert.strictEqual(main.markStyle().textShadow, 'none');
assert.strictEqual(main.markStyle().WebkitTextStroke, '0px transparent');
main.adjustMarkGlow(100);
assert.strictEqual(main.cfg.markGlow, 30);
assert(main.markStyle().textShadow.includes('30px'));
main.adjustMarkGlow(-100);
assert.strictEqual(main.cfg.markGlow, 0);
main.adjustMarkOutline(-10);
assert.strictEqual(main.cfg.markOutline, 0);
main.adjustMarkOutline(1.25);
assert.strictEqual(main.cfg.markOutline, 1.3);
main.cfg.glow = 0;
assert.strictEqual(main.itemStyle(main.cfg.items[0]).boxShadow, 'none');
ok('PASS/FAIL glow clamps to 0–30, thin black outline is adjustable and pending circles have no black shadow');

main.cfg.soundOn = false;
main.selected = 0;
main.markState('pass');
assert.strictEqual(main.cfg.items[0].state, 'pass');
assert.strictEqual(main.selected, 1, 'autoAdvance should select the next pending circle');
main.undo();
assert.strictEqual(main.cfg.items[0].state, 'pending');
main.resetStates();
assert.strictEqual(main.selected, 0);
assert(main.cfg.items.every(item => item.state === 'pending'));
ok('PASS marking, auto-advance, undo and reset execute without runtime errors');

const scanStart = luaCommands.length;
main.scanImages();
const scanCommand = luaCommands.slice(scanStart).find(command => command.includes('pfhudListImages'));
assert(scanCommand, 'Rifresko must ask Lua for the folder list');
assert(!luaCallbackCommands.includes(scanCommand), 'The scan must not use a callback (BeamNG wraps callback commands as one expression)');
const scanCall = luaCall(scanCommand);
if (scanCall) assert.deepStrictEqual(scanCall, { fn: 'pfhudListImages', args: ['manual'] });
assert(audioInstances.some(audio => audio.src.endsWith('/sounds/pass.mp3')), 'PASS audio was not initialized');
assert(audioInstances.some(audio => audio.src.endsWith('/sounds/fail.mp3')), 'FAIL audio was not initialized');
assert.strictEqual(main.testSound('pass'), true);
assert.strictEqual(main.testSound('fail'), true);
assert(audioInstances.some(audio => audio.src.endsWith('/sounds/fail.mp3') && audio.played > 0), 'FAIL audio did not play');
ok('Rifresko sends a valid, callback-free pfhudListImages command; PASS/FAIL audio paths execute');

assert.strictEqual(main.galleryState, 'loading');
const watchdogEntry = [...timers.entries()].find(([, timer]) => timer.delay === 8000);
assert(watchdogEntry, 'Gallery must have an 8 second watchdog');
watchdogEntry[1].fn();
assert.strictEqual(main.galleryState, 'err');
assert(main.galleryInfo.includes('nuk u përgjigj'));
emit('creatorpack.images', {ok:true, dir:'/ui/modules/apps/CreatorPack/imazhet/', files:['dynamic-new-car.png']});
assert.strictEqual(main.galleryState, 'ok');
assert.strictEqual(main.gallery.length, bundledManifest.files.length + 1);
assert(main.gallery.some(image => image.name === 'dynamic-new-car.png'));
assert(main.gallery.some(image => image.name === 'volvo.png'));
ok('Gallery timeout recovers and Lua adds new files without hiding bundled images');

main.selected = 0;
const volvo = main.gallery.find(image => image.name === 'volvo.png');
assert(volvo, 'Bundled Volvo image must be clickable');
const manualPath = '/ui/modules/apps/CreatorPack/imazhet/volvo.png';
brokenSources.add(manualPath);                       // CEF cannot open it as URL → Lua fallback
const beforeVolvo = luaCommands.length;
main.useGalleryImage(volvo);
assert.strictEqual(main.cfg.items[0].imageFile, manualPath);
assert.strictEqual(main.cfg.items[0].image, manualPath, 'Gallery URL must appear immediately');
assert.strictEqual(main.imageBgStyle(main.cfg.items[0]).backgroundImage, 'url("' + manualPath + '")');
const volvoCommand = luaCommands.slice(beforeVolvo).find(command => command.includes('pfhudImageData'));
assert(volvoCommand, 'Fallback must ask Lua for the photo');
const volvoCall = luaCall(volvoCommand);
if (volvoCall) assert.deepStrictEqual(volvoCall, { fn: 'pfhudImageData', args: [manualPath, 'img:' + manualPath] });
emit('creatorpack.filedata', {id:'img:' + manualPath, path:manualPath, i:2, n:2, mime:'image/png', data:'Jj'});
assert.strictEqual(main.cfg.items[0].image, manualPath, 'Image must wait for every chunk');
emit('creatorpack.filedata', {id:'img:' + manualPath, path:manualPath, i:1, n:2, mime:'image/png', data:'YW'});
assert(main.cfg.items[0].image.startsWith('data:image/png;base64,'), 'Lua chunks must become a saved base64 photo');
assert(Buffer.from(main.cfg.items[0].image.split(',')[1], 'base64').toString().startsWith('canvas:320x240:image/png'));
assert.strictEqual(main.photoCount(), 1);
ok('One gallery click places Volvo; Lua chunks (out of order) become a 320 px base64 photo in the same circle');

emit('creatorpack.images', {ok:true, dir:'/CreatorPack/imazhet/', userDir:'/CreatorPack/imazhet/',
  userReal:'C:/Users/Test/AppData/Local/BeamNG/BeamNG.drive/current/CreatorPack/imazhet/',
  files:[
    {path:'/CreatorPack/imazhet/old.png', name:'old.png', user:true, mtime:100, size:2048},
    {path:'/CreatorPack/imazhet/foto (2).png', name:'foto (2).png', user:true, mtime:200, size:5 * 1048576},
    {path:manualPath, name:'volvo.png', user:false}
  ],
  skipped:[{name:'iphone.HEIC', ext:'heic'}], userCount:2, modCount:1});
assert.strictEqual(main.gallery[0].name, 'foto (2).png', 'Newest photo from your folder comes first');
assert.strictEqual(main.gallery[1].name, 'old.png');
assert.strictEqual(main.gallery[0].url, '/CreatorPack/imazhet/foto%20(2).png');
assert.strictEqual(main.gallery.length, bundledManifest.files.length + 2);
assert.strictEqual(main.galleryUserCount, 2);
assert.deepStrictEqual(main.gallerySkipped, ['iphone.HEIC']);
assert(main.galleryInfo.includes('2 nga folderi yt'));
assert(main.galleryTitle(main.gallery[0]).includes('5.0 MB'));
assert.strictEqual(main.userFolderLabel(), 'C:\\Users\\Test\\AppData\\Local\\BeamNG\\BeamNG.drive\\current\\CreatorPack\\imazhet');
ok('Your CreatorPack/imazhet photos are listed first (newest first), URL-encoded, with HEIC reported');

const fancy = main.gallery[0];
main.galleryImgError(fancy);
assert.strictEqual(fancy.state, 'loading');
const thumbCall = luaCall(luaCommands[luaCommands.length - 1]);
if (thumbCall) assert.deepStrictEqual(thumbCall.args, ['/CreatorPack/imazhet/foto (2).png', 'img:/CreatorPack/imazhet/foto (2).png']);
emit('creatorpack.filedata', {id:'img:/CreatorPack/imazhet/foto (2).png', i:1, n:1, mime:'image/png', data:'iVBORw0KGgo='});
assert.strictEqual(fancy.state, 'ok');
assert(fancy.src.startsWith('data:image/png;base64,'));
const oldEntry = main.gallery[1];
main.galleryImgError(oldEntry);
emit('creatorpack.filedata', {id:'img:/CreatorPack/imazhet/old.png', err:'nuk u lexu file-i'});
assert.strictEqual(oldEntry.state, 'err');
const commandsBeforeRetry = luaCommands.length;
main.galleryImgError(oldEntry);
assert.strictEqual(luaCommands.length, commandsBeforeRetry, 'An unreadable image must not be requested again and again');
ok('Thumbnails CEF cannot open are fetched once from Lua; unreadable ones are marked instead of looping');

for (const tricky of [
  '/CreatorPack/imazhet/Makina ë ç (1).jpg',
  "/CreatorPack/imazhet/it's #1 50%.png",
  '/CreatorPack/imazhet/a "quoted" back\\slash.png'
]) {
  emit('creatorpack.images', {ok:true, files:[{path:tricky, name:tricky.split('/').pop(), user:true}]});
  const entry = main.gallery.find(image => image.path === tricky);
  assert(entry, 'Tricky name must be listed: ' + tricky);
  assert(!/[ "#%\\]/.test(entry.url.replace(/%[0-9A-F]{2}/g, '')), 'URL must encode space, quote, #, % and backslash: ' + entry.url);
  assert.strictEqual(decodeURIComponent(entry.url), tricky, 'URL must decode back to the exact path');
  main.galleryImgError(entry);
  const trickyCall = luaCall(luaCommands[luaCommands.length - 1]);
  if (trickyCall) assert.strictEqual(trickyCall.args[0], tricky, 'Lua must receive the exact file name');
  emit('creatorpack.filedata', {id:'img:' + tricky, err:'test'});
}
ok('File names with spaces, ë/ç, (1), #, %, quotes and backslashes reach Lua byte-for-byte');

main.setTab('makinat');
main.openGalleryFor(2);
assert.strictEqual(main.selected, 2);
assert.strictEqual(main.ui.tab, 'fotot');
ok('"Zgjidh foto nga galeria" selects the circle and opens the Fotot tab (shared ui.tab)');

main.openImageFolder();
const folderCall = luaCall(luaCommands[luaCommands.length - 1]);
if (folderCall) assert.deepStrictEqual(folderCall, { fn: 'pfhudOpenImageFolder', args: [] });
emit('creatorpack.folder', {ok:true, created:true, dir:'/CreatorPack/imazhet/', real:'C:/Users/Test/AppData/Local/BeamNG/BeamNG.drive/current/CreatorPack/imazhet/'});
assert(main.folderNote.includes('C:\\Users\\Test\\AppData\\Local\\BeamNG\\BeamNG.drive\\current\\CreatorPack\\imazhet'));
emit('creatorpack.folder', {ok:false, created:true, err:'exploreFolder mungon'});
assert(main.folderNote.startsWith('✗') && main.folderNote.includes('CreatorPack\\imazhet'));
ok('"Hap folderin" asks Lua to open CreatorPack/imazhet and shows the real Windows path (or how to open it)');

const uploadStart = luaCommands.length;
main.selected = 1;
main.onPickedFiles([
  { name: 'Fotoja ime.png', type: 'image/png' },
  { name: 'iphone.HEIC', type: 'image/heic' },
  { name: 'tjeter.jpg', type: 'image/jpeg' }
]);
let uploadCommands = luaCommands.slice(uploadStart).filter(command => command.includes('pfhudUploadChunk'));
assert.strictEqual(uploadCommands.length, 1, 'Files are uploaded one after another');
assert(main.cfg.items[1].image.startsWith('data:image/png;base64,'), 'First photo goes into the selected circle at once');
assert(Buffer.from(main.cfg.items[1].image.split(',')[1], 'base64').toString().startsWith('canvas:320x240:image/png'));
assert.strictEqual(main.uploadBusy, 3);
const firstUpload = luaCall(uploadCommands[0]);
const firstId = firstUpload ? firstUpload.args[0] : /pfhudUploadChunk\("([^"]+)"/.exec(uploadCommands[0])[1];
if (firstUpload) {
  assert.strictEqual(firstUpload.fn, 'pfhudUploadChunk');
  assert.deepStrictEqual(firstUpload.args.slice(1, 4), ['Fotoja ime.png', '1', '1']);
  assert(Buffer.from(firstUpload.args[4], 'base64').toString().startsWith('canvas:640x480:image/png'));
}
emit('creatorpack.uploaded', {id:firstId, ok:true, path:'/CreatorPack/imazhet/Fotoja ime.png', name:'Fotoja ime.png'});
uploadCommands = luaCommands.slice(uploadStart).filter(command => command.includes('pfhudUploadChunk'));
assert.strictEqual(uploadCommands.length, 2, 'HEIC is skipped, the JPG is uploaded next');
const secondUpload = luaCall(uploadCommands[1]);
const secondId = secondUpload ? secondUpload.args[0] : /pfhudUploadChunk\("([^"]+)"/.exec(uploadCommands[1])[1];
if (secondUpload) {
  assert.strictEqual(secondUpload.args[1], 'tjeter.jpg');
  assert(Buffer.from(secondUpload.args[4], 'base64').toString().startsWith('canvas:640x480:image/jpeg'));
}
emit('creatorpack.uploaded', {id:secondId, ok:false, err:'disk full'});
assert.strictEqual(main.uploadBusy, 0);
assert(main.uploadNote.includes('rrethin #2'), main.uploadNote);
assert(main.uploadNote.includes('1 foto u ruajt'), main.uploadNote);
assert(main.uploadNote.includes('iphone.HEIC'), main.uploadNote);
assert(main.uploadNote.includes('disk full'), main.uploadNote);
assert.strictEqual(main.cfg.items[1].imageFile, '/CreatorPack/imazhet/Fotoja ime.png');
main.onPickedFiles([{ name: 'rrethi katër.webp', type: 'image/webp' }], 3);
assert.strictEqual(main.selected, 3);
assert(main.cfg.items[3].image.startsWith('data:image/png;base64,'));
const lastUpload = luaCommands.filter(command => command.includes('pfhudUploadChunk')).pop();
const lastCall = luaCall(lastUpload);
if (lastCall) assert.strictEqual(lastCall.args[1], 'rrethi katër.png', 'Transparent formats are stored as PNG');
emit('creatorpack.uploaded', {id:lastCall ? lastCall.args[0] : /pfhudUploadChunk\("([^"]+)"/.exec(lastUpload)[1], ok:true, path:'/CreatorPack/imazhet/rrethi katër.png'});
assert.strictEqual(main.uploadBusy, 0);
ok('Choose File: first photo → selected circle, every photo saved via Lua (chunked), HEIC/errors reported, per-circle upload works');

assert.deepStrictEqual(luaSyntaxErrors, [], 'Every engineLua command must be valid Lua exactly as BeamNG runs it');
assert(!luaCallbackCommands.some(command => /;/.test(command)), 'No callback command may contain statements');
ok('All ' + luaCommands.length + ' engineLua commands compile as BeamNG runs them' + (fengari ? ' (Fengari Lua parser)' : ' (heuristic; install fengari for a real parse)'));

// Ensure every static asset referenced by the HTML exists.
for (const app of ['CreatorPack']) {
  const html = fs.readFileSync(path.join(ROOT, app, 'ui/modules/apps', app, 'app.html'), 'utf8');
  for (const match of html.matchAll(/(?:src=|url\()["']?(\/ui\/modules\/apps\/[^"')]+)/g)) {
    if (match[1].includes('{{')) continue;
    const asset = path.join(ROOT, app, match[1]);
    assert(fs.existsSync(asset), 'Missing asset: ' + match[1]);
  }
}
ok('Static font/image asset paths resolve inside the CreatorPack ZIP root');

console.log('\n' + results.length + ' smoke checks passed.');
main.$destroy();
