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
  try {
    const page = await browser.newPage({viewport:{width:1920,height:1080}});
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/preview`, {waitUntil:'networkidle'});
    await page.waitForSelector('.ds-panel', {state:'visible'});
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.ds-panel')).scope();
      scope.$root.$broadcast('driftSketch.state', {recording:false,pointCount:96,pathLength:182.4,buildCount:1,coneCount:248,
        vehicleName:'Any Vehicle · Live Path',status:'Built 248 cones. Open BeamNG replay — they stay in the scene.',statusError:false,
        settings:{mesh:'cone',spacing:2.4,width:4.2,scale:1,groundOffset:-0.55,maxCones:1200,smooth:true,keepBuilds:true,collision:false,driftWidth:true,gates:true}});
    });
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const panel = document.querySelector('.ds-panel').getBoundingClientRect();
      return {panel:{left:panel.left,top:panel.top,right:panel.right,bottom:panel.bottom},width:innerWidth,height:innerHeight,
        meshes:document.querySelectorAll('.ds-metric')[2].textContent,commands:window.__commands};
    });
    assert(state.panel.left >= 0 && state.panel.top >= 0 && state.panel.right <= state.width && state.panel.bottom <= state.height);
    assert(state.meshes.includes('248'));
    assert(state.commands.includes('extensions.driftSketch.uiState()'));
    await page.locator('.ds-btn.start').click();
    assert(await page.evaluate(() => window.__commands.includes('extensions.driftSketch.start()')));
    await page.locator('select[ng-model="settings.mesh"]').selectOption('tireStack');
    assert(await page.evaluate(() => window.__commands.includes('extensions.driftSketch.setSetting("mesh","tireStack")')));
    assert(await page.locator('.ds-check.drift input').isChecked());
    await page.locator('.ds-check.drift').click();
    assert(await page.evaluate(() => window.__commands.includes('extensions.driftSketch.setSetting("driftWidth",false)')));
    assert(await page.locator('.ds-check.gates input').isChecked());
    await page.locator('.ds-check.gates').click();
    assert(await page.evaluate(() => window.__commands.includes('extensions.driftSketch.setSetting("gates",false)')));
    await page.locator('.ds-check.solid').click();
    assert(await page.evaluate(() => window.__commands.includes('extensions.driftSketch.setSetting("collision",true)')));
    await page.locator('.ds-help summary').click();
    assert(await page.locator('.ds-help-body').isVisible());
    assert((await page.locator('.ds-help-body').textContent()).includes('mbrapa'));
    await page.screenshot({path:'/tmp/driftsketch-panel-help.png'});
    await page.locator('.ds-help summary').click();
    await page.screenshot({path:'/tmp/driftsketch-panel.png'});
    assert.deepStrictEqual(errors, []);
    console.log('✓ DriftSketch Angular UI renders; Start, Drift widen, Gates, Solid and Albanian help work without browser errors');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
