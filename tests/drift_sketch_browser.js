/* Real Angular + Chromium render for the DriftSketch UI. */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const {pathToFileURL} = require('url');
const ROOT = path.resolve(__dirname, '..');
const MOD = path.join(ROOT, 'DriftSketch');
const MODULES = process.env.BROWSER_TEST_MODULES || path.join(__dirname, 'node_modules');
const SHOTS = process.env.DRIFTSKETCH_SHOTS || '/tmp';
const {chromium: playwright} = require(path.join(MODULES, 'playwright-core'));
(async() => {
  const {default: chromium} = await import(pathToFileURL(path.join(MODULES, '@sparticuz/chromium/build/index.js')).href);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/angular.js') {
      res.writeHead(200, {'Content-Type':'text/javascript'}); fs.createReadStream(path.join(MODULES, 'angular/angular.min.js')).pipe(res); return;
    }
    if (url.pathname === '/preview') {
      res.writeHead(200, {'Content-Type':'text/html'});
      res.end('<!doctype html><html ng-app="beamng.apps"><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:radial-gradient(circle at 70% 20%,#4b5b63,#18252d 65%,#0b1218)}</style><script src="/angular.js"></script><script>angular.module("beamng.apps",[]);window.__commands=[];window.bngApi={engineLua:function(c){window.__commands.push(c)}};</script><script src="/ui/modules/apps/DriftSketch/app.js"></script></head><body><drift-sketch-panel></drift-sketch-panel></body></html>');
      return;
    }
    const file = path.normalize(path.join(MOD, decodeURIComponent(url.pathname)));
    if (!file.startsWith(MOD + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(file);
    const mime = ext === '.js' ? 'text/javascript' : ext === '.html' ? 'text/html' : ext === '.png' ? 'image/png' : 'application/octet-stream';
    res.writeHead(200, {'Content-Type':mime}); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await playwright.launch({executablePath:await chromium.executablePath(), args:chromium.args, headless:true});
  const errors = [];
  const sent = command => page.evaluate(c => window.__commands.includes(c), command);
  let page;
  try {
    page = await browser.newPage({viewport:{width:1920,height:1080}});
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/preview`, {waitUntil:'networkidle'});
    await page.waitForSelector('.ds-panel', {state:'visible'});
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.ds-panel')).scope();
      scope.$root.$broadcast('driftSketch.state', {recording:false,pointCount:96,pathLength:182.4,buildCount:1,coneCount:364,
        ringsBuilt:5,ringSetCount:0,meshCount:369,
        vehicleName:'Any Vehicle · Live Path',status:'Built 364 objects + 5 rings. Open BeamNG replay — they stay in the scene.',statusError:false,
        settings:{mesh:'cone',tireColors:'rw',spacing:1.0,gap:0.3,scale:1,groundOffset:-0.55,maxCones:2000,smooth:true,keepBuilds:true,
          collision:false,driftWidth:true,gates:true,rings:true,ringCount:5,ringSize:7,ringGap:15,ringLift:0}});
    });
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const panel = document.querySelector('.ds-panel').getBoundingClientRect();
      return {panel:{left:panel.left,top:panel.top,right:panel.right,bottom:panel.bottom},width:innerWidth,height:innerHeight,
        meshes:document.querySelectorAll('.ds-metric')[2].textContent,commands:window.__commands};
    });
    assert(state.panel.left >= 0 && state.panel.top >= 0 && state.panel.right <= state.width && state.panel.bottom <= state.height);
    assert(state.meshes.includes('369'), 'metric shows markers + gates + rings');
    assert(state.commands.includes('extensions.driftSketch.uiState()'));
    await page.locator('.ds-btn.start').click();
    assert(await sent('extensions.driftSketch.start()'));
    assert.strictEqual(await page.locator('select[ng-model="settings.mesh"]').count(), 0);
    const meshButtons = page.locator('.ds-mesh-option');
    assert.strictEqual(await meshButtons.count(), 2, 'only Traffic Cone and Tire Stack remain');
    for (let i = 0; i < 2; i++) assert(await meshButtons.nth(i).isVisible());
    assert.strictEqual(await page.locator('.ds-color-option').count(), 0, 'tyre colours only show for Tire Stack');
    await page.locator('button[data-mesh="tireStack"]').click();
    assert(await sent('extensions.driftSketch.setSetting("mesh","tireStack")'));
    assert(await page.locator('button[data-mesh="tireStack"]').evaluate(element => element.classList.contains('is-active')));
    assert.strictEqual(await page.locator('.ds-color-option').count(), 2);
    assert(await page.locator('button[data-colors="rw"]').evaluate(element => element.classList.contains('is-active')));
    await page.locator('button[data-colors="rwb"]').click();
    assert(await sent('extensions.driftSketch.setSetting("tireColors","rwb")'));
    assert(await page.locator('button[data-colors="rwb"]').evaluate(element => element.classList.contains('is-active')));
    const spacing = page.locator('input[ng-model="settings.spacing"]');
    assert.strictEqual(await spacing.getAttribute('min'), '0.5');
    await spacing.evaluate(element => { element.value = '0.5'; element.dispatchEvent(new Event('input', {bubbles:true})); element.dispatchEvent(new Event('change', {bubbles:true})); });
    assert(await sent('extensions.driftSketch.setSetting("spacing",0.5)'));
    const gap = page.locator('input[ng-model="settings.gap"]');
    assert.strictEqual(await gap.getAttribute('min'), '0');
    assert.strictEqual(await gap.getAttribute('max'), '3');
    await gap.evaluate(element => { element.value = '0.15'; element.dispatchEvent(new Event('input', {bubbles:true})); element.dispatchEvent(new Event('change', {bubbles:true})); });
    assert(await sent('extensions.driftSketch.setSetting("gap",0.15)'), 'Gap to car slider reaches GE Lua');
    assert.strictEqual(await page.locator('input[ng-model="settings.width"]').count(), 0, 'Base width slider removed');
    assert(await page.locator('.ds-check.drift input').isChecked());
    await page.locator('.ds-check.drift').click();
    assert(await sent('extensions.driftSketch.setSetting("driftWidth",false)'));
    assert(await page.locator('.ds-check.gates input').isChecked());
    await page.locator('.ds-check.gates').click();
    assert(await sent('extensions.driftSketch.setSetting("gates",false)'));
    await page.locator('.ds-check.solid').click();
    assert(await sent('extensions.driftSketch.setSetting("collision",true)'));
    // Rings section: every control reaches GE Lua.
    assert(await page.locator('.ds-check.rings input').isChecked());
    await page.locator('.ds-check.rings').click();
    assert(await sent('extensions.driftSketch.setSetting("rings",false)'));
    for (const [key, value] of [['ringCount', '12'], ['ringSize', '10.5'], ['ringGap', '30'], ['ringLift', '2.5']]) {
      await page.locator(`input[ng-model="settings.${key}"]`).evaluate((element, v) => {
        element.value = v; element.dispatchEvent(new Event('input', {bubbles:true})); element.dispatchEvent(new Event('change', {bubbles:true}));
      }, value);
      assert(await sent(`extensions.driftSketch.setSetting("${key}",${value})`), key);
    }
    await page.locator('.ds-btn.ring').click();
    assert(await sent('extensions.driftSketch.placeRings()'));
    await page.locator('.ds-btn.ring-clear').click();
    assert(await sent('extensions.driftSketch.clearRings()'));
    await page.locator('.ds-help summary').click();
    assert(await page.locator('.ds-help-body').isVisible());
    const help = await page.locator('.ds-help-body').textContent();
    assert(help.includes('mbrapa') && help.includes('PLACE RINGS AHEAD') && help.includes('0.5 m'));
    await page.screenshot({path:path.join(SHOTS, 'driftsketch-panel-help.png')});
    await page.locator('.ds-help summary').click();
    // A clean state for the screenshot.
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.ds-panel')).scope();
      scope.$root.$broadcast('driftSketch.state', {recording:false,pointCount:96,pathLength:182.4,buildCount:1,coneCount:364,
        ringsBuilt:5,ringSetCount:0,meshCount:369,
        vehicleName:'Any Vehicle · Live Path',status:'Built 364 objects + 5 rings. Open BeamNG replay — they stay in the scene.',statusError:false,
        settings:{mesh:'tireStack',tireColors:'rw',spacing:1.0,gap:0.3,scale:1,groundOffset:-0.55,maxCones:2000,smooth:true,keepBuilds:true,
          collision:false,driftWidth:true,gates:true,rings:true,ringCount:5,ringSize:7,ringGap:15,ringLift:0}});
    });
    await page.waitForTimeout(200);
    await page.locator('.ds-panel').screenshot({path:path.join(SHOTS, 'driftsketch-panel.png')});
    assert.deepStrictEqual(errors, []);
    console.log('✓ DriftSketch Angular UI renders; 2 mesh buttons, tyre colours, 0.5 m spacing, gates, solid, rings and Albanian help work without browser errors');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
