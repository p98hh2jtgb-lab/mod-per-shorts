/* Node-only Angular/CEF smoke harness. No BeamNG or third-party packages required. */
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

const fakeDocumentNode = {
  fonts: { check: () => true },
  querySelector: () => null,
  createElement: () => ({ style: {}, getContext: () => null })
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
    engineLua(command) { luaCommands.push(command); },
    engineLuaAsync(command) { luaCommands.push(command); }
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
assert.strictEqual(main.modVersion, '6.1.2');
assert.strictEqual(main.cfg.items.length, 8);
assert.strictEqual(main.toggleCost, undefined);
ok('CreatorPack boots with clean vehicle-only configuration');

assert.strictEqual(main.gallery.length, bundledManifest.files.length);
assert.strictEqual(main.addImageByName, undefined);
assert.strictEqual(main.onManualImage, undefined);
assert.strictEqual(directives.pfFileRead, undefined);
for (const name of bundledManifest.files) {
  assert(fs.existsSync(path.join(ROOT, 'CreatorPack/ui/modules/apps/CreatorPack/imazhet', name)), 'Missing gallery image: ' + name);
}
ok('All ' + bundledManifest.files.length + ' bundled images load without Lua, Choose File or manual filenames');

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
ok('BMW Series 6 keeps equal real spacing, per-car manual controls, title outline, K/L flow and separate Shorts');

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

main.scanImages();
assert(luaCommands.some(command => command.includes('pfhudListImages')));
assert(audioInstances.some(audio => audio.src.endsWith('/sounds/pass.mp3')), 'PASS audio was not initialized');
assert(audioInstances.some(audio => audio.src.endsWith('/sounds/fail.mp3')), 'FAIL audio was not initialized');
assert.strictEqual(main.testSound('pass'), true);
assert.strictEqual(main.testSound('fail'), true);
assert(audioInstances.some(audio => audio.src.endsWith('/sounds/fail.mp3') && audio.played > 0), 'FAIL audio did not play');
ok('Manual image scan and independent PASS/FAIL audio paths execute');

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
main.useGalleryImage(volvo);
const manualPath = '/ui/modules/apps/CreatorPack/imazhet/volvo.png';
assert.strictEqual(main.cfg.items[0].imageFile, manualPath);
assert.strictEqual(main.cfg.items[0].image, manualPath, 'Gallery URL must appear immediately');
assert(main.imageBgStyle(main.cfg.items[0]).backgroundImage.includes('volvo.png'));
assert(luaCommands.some(command => command.includes('pfhudImageData')));
emit('creatorpack.imagedata', {path:manualPath, data:'data:image/png;base64,YWJj'});
assert.strictEqual(main.cfg.items[0].image, 'data:image/png;base64,YWJj');
assert.strictEqual(main.photoCount(), 1);
ok('One gallery click places Volvo and Lua base64 refreshes the same circle');

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
