/* Real Angular + Chromium visual/runtime preview.
 * Required test-only packages: playwright-core, @sparticuz/chromium, angular.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const MODULES = process.env.BROWSER_TEST_MODULES || path.join(__dirname, 'node_modules');
const { chromium: playwright } = require(path.join(MODULES, 'playwright-core'));
const chromium = require(path.join(MODULES, '@sparticuz/chromium'));
const angularPath = path.join(MODULES, 'angular', 'angular.min.js');

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.ttf':'font/ttf',
  '.mp3':'audio/mpeg', '.txt':'text/plain; charset=utf-8'
};

async function makeServer(modName) {
  const modRoot = path.join(ROOT, modName);
  const tag = 'creatorpack-panel';
  const directiveJs = `/ui/modules/apps/${modName}/app.js`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/angular.js') {
      res.writeHead(200, {'Content-Type':mime['.js']});
      fs.createReadStream(angularPath).pipe(res);
      return;
    }
    if (url.pathname === '/preview') {
      res.writeHead(200, {'Content-Type':mime['.html']});
      res.end(`<!doctype html><html ng-app="beamng.apps"><head><meta charset="utf-8"><style>
        html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#263849}
        body{background:radial-gradient(circle at 70% 15%,#617d91 0,#344d5f 32%,#1b2a38 72%,#101923 100%)}
      </style><script src="/angular.js"></script><script>
        angular.module('beamng.apps',[]);
        window.bngApi={engineLua:function(){},engineLuaAsync:function(){}};
      </script><script src="${directiveJs}"></script></head><body><${tag}></${tag}></body></html>`);
      return;
    }
    const file = path.normalize(path.join(modRoot, decodeURIComponent(url.pathname)));
    if (!file.startsWith(modRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url:`http://127.0.0.1:${server.address().port}/preview` };
}

(async() => {
  const executablePath = await chromium.executablePath();
  const browser = await playwright.launch({ executablePath, args:chromium.args, headless:true });
  const errors = [];
  try {
    // CreatorPack real Angular render.
    let env = await makeServer('CreatorPack');
    let page = await browser.newPage({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
    page.on('pageerror', e => errors.push('CreatorPack: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push('CreatorPack console: ' + msg.text()); });
    await page.goto(env.url, {waitUntil:'networkidle'});
    await page.waitForSelector('.cp-panel', {state:'visible'});
    await page.waitForTimeout(500);
    await page.screenshot({path:'/tmp/creatorpack-workspace.png'});
    let geometry = await page.evaluate(() => {
      const p = document.querySelector('.cp-panel').getBoundingClientRect();
      return {left:p.left,top:p.top,right:p.right,bottom:p.bottom,width:innerWidth,height:innerHeight,
        tab:angular.element(document.querySelector('.cp-panel')).scope().tab};
    });
    assert.strictEqual(geometry.tab, 'kryesore');
    assert(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= geometry.width && geometry.bottom <= geometry.height);
    console.log('✓ CreatorPack Workspace renders inside 1920×1080 viewport');

    await page.keyboard.press('k');
    await page.waitForTimeout(120);
    let keyState = await page.evaluate(() => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      return {first:s.cfg.items[0].state, selected:s.selected};
    });
    assert.strictEqual(keyState.first, 'pass');
    assert.strictEqual(keyState.selected, 1);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(120);
    keyState = await page.evaluate(() => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      return {first:s.cfg.items[0].state, selected:s.selected};
    });
    assert.strictEqual(keyState.first, 'pending');
    assert.strictEqual(keyState.selected, 0);
    await page.keyboard.press('h');
    await page.waitForTimeout(120);
    assert.strictEqual(await page.locator('.cp-panel').count(), 0);
    await page.keyboard.press('h');
    await page.waitForSelector('.cp-panel', {state:'visible'});
    console.log('✓ Real H / K / Ctrl+Z keyboard events toggle, mark and undo');

    for (const tab of ['makinat','pamja','fotot','tjera']) {
      await page.evaluate(tabName => {
        const scope = angular.element(document.querySelector('.cp-panel')).scope();
        scope.tab = tabName; scope.$apply();
      }, tab);
      await page.waitForTimeout(150);
      await page.screenshot({path:`/tmp/creatorpack-${tab}.png`});
    }
    console.log('✓ Rrethet, Stili, Fotot and Më shumë render in Chromium');

    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.setShortsMode(true); scope.tab='shorts'; scope.$apply();
    });
    await page.waitForTimeout(350);
    const shorts = await page.evaluate(() => ({
      circles:document.querySelectorAll('.pf-hud .pf-item').length,
      masks:document.querySelectorAll('.pf-guide-dim').length,
      panel:document.querySelector('.cp-panel').getBoundingClientRect().toJSON()
    }));
    assert.strictEqual(shorts.circles, 4);
    assert.strictEqual(shorts.masks, 0);
    await page.screenshot({path:'/tmp/creatorpack-shorts-panel.png'});
    console.log('✓ Shorts panel renders with exactly four circles and no dark masks');

    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.cleanCapture(); scope.$apply();
    });
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('.cp-panel').count(), 0);
    assert.strictEqual(await page.locator('.pf-guides').count(), 0);
    assert.strictEqual(await page.locator('.pf-hud .pf-item').count(), 4);
    await page.screenshot({path:'/tmp/creatorpack-shorts-clean.png'});
    console.log('✓ Clean capture hides panel/guides and preserves four circles');
    await page.keyboard.press('h');
    await page.waitForSelector('.cp-panel', {state:'visible'});
    await page.waitForTimeout(120);
    assert.strictEqual(await page.locator('.pf-guides').count(), 1);
    console.log('✓ H returns from clean capture with Shorts guides restored');
    await page.close();
    await new Promise(resolve => env.server.close(resolve));
    assert.deepStrictEqual(errors, []);
    console.log('✓ No browser JavaScript errors');
    console.log('\nCreatorPack screenshots saved under /tmp/creatorpack-*.png');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
