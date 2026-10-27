/* Real Angular + Chromium visual/runtime preview.
 * Required test-only packages: playwright-core, @sparticuz/chromium, angular.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const bundledManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'CreatorPack/ui/modules/apps/CreatorPack/gallery.json'), 'utf8'));
const MODULES = process.env.BROWSER_TEST_MODULES || path.join(__dirname, 'node_modules');
const { pathToFileURL } = require('url');
const { chromium: playwright } = require(path.join(MODULES, 'playwright-core'));
const chromiumPath = path.join(MODULES, '@sparticuz', 'chromium', 'build', 'index.js');
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
        window.__pfAudioElements=[];
        const NativeAudio=window.Audio;
        if(NativeAudio){
          window.Audio=function(...args){
            const audio=new NativeAudio(...args);
            window.__pfAudioElements.push(audio);
            return audio;
          };
          window.Audio.prototype=NativeAudio.prototype;
        }
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
  const { default: chromium } = await import(pathToFileURL(chromiumPath).href);
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
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      return {left:p.left,top:p.top,right:p.right,bottom:p.bottom,width:innerWidth,height:innerHeight,
        tab:scope.ui.tab, galleryCount:scope.gallery.length};
    });
    assert.strictEqual(geometry.tab, 'kryesore');
    assert.strictEqual(geometry.galleryCount, bundledManifest.files.length, 'Bundled gallery must render before Lua responds');
    assert(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= geometry.width && geometry.bottom <= geometry.height);
    console.log('✓ CreatorPack Workspace renders inside 1920×1080 viewport');

    const initializedSounds = await page.evaluate(() => window.__pfAudioElements.map(audio => audio.src));
    assert(initializedSounds.some(src => src.endsWith('/sounds/pass.mp3')), 'PASS was not initialized in Chromium');
    assert(initializedSounds.some(src => src.endsWith('/sounds/fail.mp3')), 'FAIL was not initialized in Chromium');
    const decodedSounds = await page.evaluate(async() => {
      const Context = window.AudioContext || window.webkitAudioContext;
      const context = new Context();
      const result = {};
      for (const kind of ['pass','fail']) {
        const response = await fetch(`/ui/modules/apps/CreatorPack/sounds/${kind}.mp3`);
        const bytes = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(bytes);
        result[kind] = {duration:buffer.duration,sampleRate:buffer.sampleRate};
      }
      await context.close();
      return result;
    });
    assert(decodedSounds.pass.duration > 0.2 && decodedSounds.fail.duration > 0.5);
    console.log(`✓ PASS and FAIL initialize and decode (${decodedSounds.pass.duration.toFixed(2)}s / ${decodedSounds.fail.duration.toFixed(2)}s)`);

    await page.keyboard.press('k');
    await page.waitForTimeout(120);
    let keyState = await page.evaluate(() => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      return {first:s.cfg.items[0].state, selected:s.selected};
    });
    assert.strictEqual(keyState.first, 'pass');
    assert.strictEqual(keyState.selected, 1);
    assert.strictEqual(await page.locator('.pf-hud .pf-mark.pass svg').count(), 1, 'Standard PASS must use a platform-independent SVG mark');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(120);
    keyState = await page.evaluate(() => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      return {first:s.cfg.items[0].state, selected:s.selected};
    });
    assert.strictEqual(keyState.first, 'pending');
    assert.strictEqual(keyState.selected, 0);
    await page.keyboard.press('l');
    await page.waitForTimeout(120);
    keyState = await page.evaluate(() => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      return {first:s.cfg.items[0].state,selected:s.selected};
    });
    assert.strictEqual(keyState.first, 'fail');
    assert.strictEqual(keyState.selected, 1);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(120);
    await page.keyboard.press('h');
    await page.waitForTimeout(120);
    assert.strictEqual(await page.locator('.cp-panel').count(), 0);
    await page.keyboard.press('h');
    await page.waitForSelector('.cp-panel', {state:'visible'});
    console.log('✓ Real H / K / L / Ctrl+Z keyboard events toggle, mark PASS/FAIL and undo');

    const navLabels = {makinat:'Rrethet', pamja:'Stili', fotot:'Fotot', series:'Series', tjera:'Më shumë'};
    for (const tab of ['makinat','pamja','fotot','series','tjera']) {
      await page.click(`.cp-nav button:has-text("${navLabels[tab]}")`);
      await page.waitForTimeout(150);
      const activeTab = await page.evaluate(() => angular.element(document.querySelector('.cp-panel')).scope().ui.tab);
      assert.strictEqual(activeTab, tab, 'Real nav click must switch the panel tab');
      await page.screenshot({path:`/tmp/creatorpack-${tab}.png`});
    }
    console.log('✓ Real clicks on Rrethet, Stili, Fotot, Series 6 and Më shumë switch and render in Chromium');

    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      // Like BeamNG: commands without callback; Lua answers with a guihooks event.
      window.__callbackCommands = [];
      window.bngApi.engineLua = function(command, callback) {
        if (callback) window.__callbackCommands.push(command);
        if (command.includes('pfhudListImages')) {
          setTimeout(() => scope.$root.$broadcast('creatorpack.images', {ok:true, dir:'/ui/modules/apps/CreatorPack/imazhet/', files:['volvo.png']}), 0);
        }
      };
      scope.setTab('fotot'); scope.scanImages(false); scope.$apply();
    });
    await page.waitForFunction(expected => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      return scope.galleryState === 'ok' && scope.gallery.length === expected &&
        document.querySelectorAll('.cp-gallery button').length === expected;
    }, bundledManifest.files.length, {timeout:10000});
    assert.strictEqual(await page.locator('.cp-manual-file').count(), 0);
    assert(await page.locator('input[type="file"]').count() >= 2, 'Choose File inputs must exist (Fotot + per circle)');
    assert(await page.locator('.cp-photos label.cp-upload').isVisible(), '"Ngarko nga kompjuteri" must be visible in Fotot');
    assert.deepStrictEqual(await page.evaluate(() => window.__callbackCommands), [], 'Gallery scan must not use engineLua callbacks');
    const volvoButton = page.locator('.cp-gallery button[title^="volvo.png"]');
    await volvoButton.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector('.cp-gallery button[title^="volvo.png"] img');
      return image && image.complete && image.naturalWidth > 0;
    }, null, {timeout:10000});
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.select(0);
    });
    await volvoButton.click();
    await page.waitForTimeout(500);
    const immediateImage = await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      const circleImage = document.querySelector('.pf-hud .pf-item-image');
      return {
        stored:String(scope.cfg.items[0].image || ''),
        file:scope.cfg.items[0].imageFile,
        circleBackground:circleImage ? getComputedStyle(circleImage).backgroundImage.slice(0, 80) : 'missing'
      };
    });
    assert(immediateImage.stored.startsWith('data:image') || immediateImage.stored.endsWith('/volvo.png'), JSON.stringify(immediateImage));
    assert.strictEqual(immediateImage.file, '/ui/modules/apps/CreatorPack/imazhet/volvo.png');
    assert(immediateImage.circleBackground.startsWith('url('));
    await page.waitForFunction(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      return String(scope.cfg.items[0].image || '').startsWith('data:image');
    }, null, {timeout:10000});
    const galleryImage = await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      const circleImage = document.querySelector('.pf-hud .pf-item-image');
      return {
        galleryState:scope.galleryState,
        galleryCount:scope.gallery.length,
        photoCount:scope.photoCount(),
        circleBackground:circleImage ? getComputedStyle(circleImage).backgroundImage.slice(0, 40) : 'missing'
      };
    });
    assert.strictEqual(galleryImage.galleryState, 'ok');
    assert.strictEqual(galleryImage.galleryCount, bundledManifest.files.length);
    assert(galleryImage.photoCount >= 1);
    assert(galleryImage.circleBackground.startsWith('url('));
    await page.screenshot({path:'/tmp/creatorpack-gallery-volvo.png'});
    console.log(`✓ All ${bundledManifest.files.length} images render; one Volvo gallery click fills the circle and is saved as base64`);

    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.setShortsMode(true); scope.setTab('shorts'); scope.$apply();
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

    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.setSeries6Mode(true); scope.setTab('series'); scope.$apply();
    });
    await page.waitForTimeout(400);
    const series = await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      const cars = [...document.querySelectorAll('.pf-series-car')];
      const rects = cars.map(car => car.getBoundingClientRect());
      return {
        count:cars.length,
        standardCircles:document.querySelectorAll('.pf-hud .pf-item').length,
        title:document.querySelector('.pf-series-active')?.textContent.trim(),
        widths:rects.map(rect => rect.width),
        gaps:rects.slice(1).map((rect, i) => rect.left - rects[i].right),
        centers:[...document.querySelectorAll('.pf-series-slot')].map(slot => {
          const rect = slot.getBoundingClientRect(); return rect.left + rect.width / 2;
        }),
        titleOutline:getComputedStyle(document.querySelector('.pf-series-active')).getPropertyValue('-webkit-text-stroke-width'),
        loaded:cars.every(car => car.complete && car.naturalWidth > 0),
        visible:scope.visibleCircleCount(),
        labels:scope.seriesSlots.map(slot => slot.label)
      };
    });
    assert.strictEqual(series.count, 6);
    assert.strictEqual(series.standardCircles, 0);
    assert.strictEqual(series.visible, 6);
    assert.strictEqual(series.title, 'TINY CAR');
    assert.strictEqual(series.titleOutline, '2.5px');
    assert.strictEqual(series.loaded, true, 'Every transparent BMW variant must load');
    assert(series.widths.every((width, i) => i === 0 || width > series.widths[i - 1]), 'Car widths must increase Tiny → Giant');
    assert(series.gaps.every(gap => Math.abs(gap - 14) < 0.2), 'Default visible gaps must be equal, including BIG → GIANT');
    await page.screenshot({path:'/tmp/creatorpack-series-panel.png'});
    console.log('✓ BMW Series 6 renders six loaded transparent variants in increasing size with active title');

    const presetIds = await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      return scope.seriesPresets.map(preset => preset.id);
    });
    assert.strictEqual(presetIds.length, 10);
    assert.strictEqual(await page.locator('.cp-series-preset-card').count(), 10);
    for (const presetId of presetIds) {
      await page.evaluate(id => {
        const scope = angular.element(document.querySelector('.cp-panel')).scope();
        scope.setSeriesPreset(id); scope.select(0); scope.$apply();
      }, presetId);
      await page.waitForFunction(() => {
        const cars = [...document.querySelectorAll('.pf-series-car')];
        return cars.length === 6 && cars.every(car => car.complete && car.naturalWidth > 0);
      }, null, {timeout:10000});
      if (presetId === 'mcqueen') await page.screenshot({path:'/tmp/creatorpack-series-mcqueen.png'});
    }
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.setSeriesPreset('bmw'); scope.select(0); scope.$apply();
    });
    await page.waitForTimeout(200);
    console.log('✓ All 10 preset cards switch models and load all 60 transparent variants, including McQueen');

    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.cfg.seriesGap = Number(scope.cfg.seriesGap) - 18;
      scope.cfg.seriesTitleSize = 115;
      scope.cfg.seriesTitleOutline = 3;
      scope.persist(); scope.$apply();
    });
    await page.waitForTimeout(200);
    const customizedSeries = await page.evaluate(() => {
      const title = document.querySelector('.pf-series-active');
      const style = getComputedStyle(title);
      const slots = [...document.querySelectorAll('.pf-series-slot')].map(slot => {
        const rect = slot.getBoundingClientRect(); return rect.left + rect.width / 2;
      });
      return {centers:slots, outline:style.getPropertyValue('-webkit-text-stroke-width'),
        fontStyle:style.fontStyle, fontSize:parseFloat(style.fontSize)};
    });
    const baseSpacing = series.centers[1] - series.centers[0];
    const compactSpacing = customizedSeries.centers[1] - customizedSeries.centers[0];
    assert(compactSpacing < baseSpacing, 'Negative spacing must bring cars closer together');
    assert(Math.abs((baseSpacing - compactSpacing) - 18) < 0.1, 'Spacing slider must change the real car distance by 18px');
    assert.strictEqual(customizedSeries.outline, '3px');
    assert.strictEqual(customizedSeries.fontStyle, 'italic');
    await page.screenshot({path:'/tmp/creatorpack-series-custom.png'});
    console.log('✓ Series spacing compacts live and the sport title has adjustable black outline/size');

    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.select(5);
      scope.cfg.seriesSlotX[5] = 24;
      scope.cfg.seriesSlotScale[5] = 120;
      scope.persist(); scope.$apply();
    });
    await page.waitForTimeout(200);
    const manualGiant = await page.evaluate(() => {
      const slots = document.querySelectorAll('.pf-series-slot');
      const cars = document.querySelectorAll('.pf-series-car');
      return {transform:slots[5].style.transform, width:cars[5].getBoundingClientRect().width,
        title:document.querySelector('.pf-series-active').textContent.trim()};
    });
    assert.strictEqual(manualGiant.transform, 'translateX(24px)');
    assert(manualGiant.width > series.widths[5] * 1.15, 'Per-car scale must resize GIANT live');
    assert.strictEqual(manualGiant.title, 'GIANT CAR');
    await page.screenshot({path:'/tmp/creatorpack-series-manual.png'});
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.resetSeriesSelected(); scope.select(0); scope.$apply();
    });
    await page.waitForTimeout(120);
    console.log('✓ GIANT has independent live X offset and scale, with per-car reset');

    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.resetSeriesAppearance(); scope.setSeriesView('full'); scope.seriesPlace('center'); scope.$apply();
    });
    await page.waitForTimeout(300);
    const fullSeries = await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      const hud = document.querySelector('.pf-series-hud').getBoundingClientRect();
      const cars = [...document.querySelectorAll('.pf-series-car')].map(car => car.getBoundingClientRect());
      return {view:scope.cfg.seriesView,hudWidth:hud.width,hudLeft:hud.left,hudTop:hud.top,
        firstLeft:cars[0].left,lastRight:cars[cars.length - 1].right,viewport:innerWidth};
    });
    assert.strictEqual(fullSeries.view, 'full');
    assert(Math.abs(fullSeries.hudWidth - fullSeries.viewport) < 0.2);
    assert(Math.abs(fullSeries.firstLeft) < 2, 'Full Size must start at the real left screen edge');
    assert(Math.abs(fullSeries.lastRight - fullSeries.viewport) < 2, 'Full Size must end at the real right screen edge');
    await page.screenshot({path:'/tmp/creatorpack-series-full.png'});
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.cleanCapture(); scope.$apply();
    });
    await page.waitForTimeout(180);
    assert.strictEqual(await page.locator('.cp-panel').count(), 0);
    assert.strictEqual(await page.locator('.pf-series-car').count(), 6);
    await page.screenshot({path:'/tmp/creatorpack-series-full-clean.png'});
    await page.keyboard.press('h');
    await page.waitForSelector('.cp-panel', {state:'visible'});
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.cfg.seriesOffsetX = 32; scope.cfg.seriesOffsetY = 18; scope.$apply();
    });
    await page.waitForTimeout(150);
    const shiftedSeries = await page.evaluate(() => {
      const rect = document.querySelector('.pf-series-hud').getBoundingClientRect();
      return {left:rect.left,top:rect.top};
    });
    assert(Math.abs(shiftedSeries.left - (fullSeries.hudLeft + 32)) < 0.2);
    assert(Math.abs(shiftedSeries.top - (fullSeries.hudTop + 18)) < 0.2);
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.resetSeriesPosition(); scope.setSeriesView('shorts'); scope.seriesPlace('top'); scope.$apply();
    });
    await page.waitForTimeout(200);
    console.log('✓ Full Size fills the complete screen edge-to-edge; manual X/Y and Shorts return work live');

    await page.keyboard.press('k');
    await page.waitForTimeout(120);
    let seriesKey = await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      return {first:scope.cfg.items[0].state, selected:scope.selected,
        title:document.querySelector('.pf-series-active')?.textContent.trim(),
        pass:document.querySelectorAll('.pf-series-mark.pass').length};
    });
    assert.deepStrictEqual(seriesKey, {first:'pass',selected:1,title:'SMALL CAR',pass:1});
    const autoMark = await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      const mark = document.querySelector('.pf-series-mark.pass');
      const car = document.querySelectorAll('.pf-series-car')[0];
      const style = getComputedStyle(mark);
      const rect = mark.getBoundingClientRect();
      return {fontSize:parseFloat(style.fontSize), carWidth:car.getBoundingClientRect().width,
        auto:scope.cfg.seriesMarkAuto,color:style.color,display:style.display,visibility:style.visibility,
        opacity:style.opacity,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},svgPaths:mark.querySelectorAll('svg path').length};
    });
    assert.strictEqual(autoMark.auto, true);
    assert(Math.abs(autoMark.fontSize - autoMark.carWidth * 0.40) <= 1, 'PASS must use the smaller non-linear TINY fit');
    assert.strictEqual(autoMark.display, 'flex');
    assert.strictEqual(autoMark.visibility, 'visible');
    assert(autoMark.rect.width > 0 && autoMark.rect.height > 0);
    assert.strictEqual(autoMark.svgPaths, 2, 'Series PASS must render an outlined SVG instead of a missing font glyph');
    await page.screenshot({path:'/tmp/creatorpack-series-auto-mark.png'});
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.cfg.seriesMarkScale = 150; scope.$apply();
    });
    await page.waitForTimeout(120);
    const manualMarkSize = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.pf-series-mark.pass')).fontSize));
    assert(Math.abs(manualMarkSize - autoMark.fontSize * 1.5) <= 1, 'Manual mark scale must resize auto-fit');
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.cfg.seriesMarkAuto = false; scope.$apply();
    });
    await page.waitForTimeout(120);
    const fixedMarks = await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      return {tiny:parseFloat(getComputedStyle(document.querySelector('.pf-series-mark.pass')).fontSize),
        giant:parseFloat(scope.seriesMarkStyle(5).fontSize)};
    });
    assert.strictEqual(fixedMarks.tiny, fixedMarks.giant, 'Disabling Auto must use the same fixed base for all marks');
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.cfg.seriesMarkAuto = true; scope.cfg.seriesMarkScale = 100; scope.$apply();
    });
    await page.waitForTimeout(120);
    console.log('✓ PASS/FAIL non-linear auto-fit, manual 150% and fixed-size mode work live');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(120);
    await page.keyboard.press('l');
    await page.waitForTimeout(120);
    seriesKey = await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      return {first:scope.cfg.items[0].state, selected:scope.selected,
        title:document.querySelector('.pf-series-active')?.textContent.trim(),
        fail:document.querySelectorAll('.pf-series-mark.fail').length};
    });
    assert.deepStrictEqual(seriesKey, {first:'fail',selected:1,title:'SMALL CAR',fail:1});
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(120);
    console.log('✓ Series 6 K / L / auto-advance / Ctrl+Z update the same six slot states');

    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.cleanCapture(); scope.$apply();
    });
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('.cp-panel').count(), 0);
    assert.strictEqual(await page.locator('.pf-guides').count(), 0);
    assert.strictEqual(await page.locator('.pf-series-car').count(), 6);
    await page.screenshot({path:'/tmp/creatorpack-series-clean.png'});
    await page.keyboard.press('h');
    await page.waitForSelector('.cp-panel', {state:'visible'});
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      const scope = angular.element(document.querySelector('.cp-panel')).scope();
      scope.setShortsMode(true); scope.setTab('shorts'); scope.$apply();
    });
    await page.waitForTimeout(250);
    assert.strictEqual(await page.locator('.pf-series-car').count(), 0);
    assert.strictEqual(await page.locator('.pf-hud .pf-item').count(), 4);
    console.log('✓ Series clean capture keeps six cars; returning to standard Shorts restores exactly four circles');
    await page.close();
    await new Promise(resolve => env.server.close(resolve));
    assert.deepStrictEqual(errors, []);
    console.log('✓ No browser JavaScript errors');
    console.log('\nCreatorPack screenshots saved under /tmp/creatorpack-*.png');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
