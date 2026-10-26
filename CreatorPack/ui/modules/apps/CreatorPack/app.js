
angular.module('beamng.apps')

.directive('creatorpackPanel', ['$document', '$window', '$timeout', '$rootScope', function($document, $window, $timeout, $rootScope) {
  return {
    replace: true,
    restrict: 'EA',
    templateUrl: '/ui/modules/apps/CreatorPack/app.html',
    link: function(scope, element) {
      var STORAGE_KEY = 'pfhud_config_v14_working_upload_clone';
      // v5.11.1: nese hapet nje INSTANCE e dyte e modit (ndodh kur kthehesh prej
      // menusë), ajo e re merr kontrollin e shkrimit — kshtu konfigurimi i vjeter
      // s'ia prish te rejat (logot, fotot, pozicionet).
      var STATE_KEY = STORAGE_KEY + '_gjendja';     // v5.11.1: mini-ruajtje (markat + file-at)
      var BACKUP_KEY = STORAGE_KEY + '_backup';     // v5.11.1: kopja e fundit e konfigurimit
      // v5.11.2: KETO DUHET ME QENE PARA load() — perndryshe fotot s'rikthehen ne nisje!
      var PHOTO_KEY = STORAGE_KEY + '_fotos';
      var PHOTO_LEVELS = [320, 280, 240, 200, 170, 150, 128];
      var TRASH_KEY = PHOTO_KEY + '_kosh';           // v5.11.2: koshi i fotove te fshira
      var WIPE_KEY = STORAGE_KEY + '_fshi';          // v5.11.2: shenja "i fshiva me dore" (mos i kthe vetë)
      var LOGO_KEY = STORAGE_KEY + '_logot';         // v5.11.3: logot e ruajtura (base64 i vogel) — nuk humbin kurrë
      var INSTANCE_ID = 'pf' + (new Date().getTime()) + '-' + Math.floor(Math.random() * 100000);
      function bornOf(id) { var m = String(id).match(/^pf(\d+)-/); return m ? Number(m[1]) : 0; }
      function touchInstance() {
        try { ($window.__pfHudOwners || ($window.__pfHudOwners = {}))[INSTANCE_ID] = new Date().getTime(); } catch (e) {}
      }
      // A jom un instanca ma e re e GJALLË? Instancat e vjetra s'shkruajne ma
      // (kshtu nje instance e vjeter s'ia prish konfigurimin te res).
      function iAmOwner() {
        try {
          var reg = $window.__pfHudOwners || {}, now = new Date().getTime(), mine = true, myBorn = bornOf(INSTANCE_ID);
          angular.forEach(reg, function (t, id) {
            if (id === INSTANCE_ID) return;
            if ((now - t) > 15000) return;                 // s'osht ma e gjallë
            if (bornOf(id) > myBorn) mine = false;         // ka nje ma te re e te gjallë
          });
          return mine;
        } catch (e) { return true; }
      }
      touchInstance();

      // =====================================================
      // v5.3.0 — Versioni shfaqet brenda HUD-it, që të shihet
      // menjëherë nëse BeamNG ka ngarkuar versionin e re.
      // =====================================================
      var MOD_VERSION = '6.0.3';
      scope.modVersion = MOD_VERSION;
      scope.storageKey = STORAGE_KEY;

      // v5.11.1: marka e makinës aktuale ruhet edhe ne mini-ruajtjen e sigurt
      var brandInfoGlobal = null;
      scope.loadState = 'ok';          // ok | repaired | corrupt (kontrollon shkrimet)
      scope.bootLoadState = 'ok';      // v5.11.1: si u lexu konfigurimi ne nisje (per lajmërim)

      function defaultItems(count) {
        var items = [];
        for (var i = 0; i < count; i++) {
          items.push({
            label: 'Makina ' + (i + 1),
            image: '',
            enabled: true,
            state: 'pending',
            imageScale: 1.0,
            imageOffsetX: 0,
            imageOffsetY: 0,
            imageRotation: 0
          });
        }
        return items;
      }

      function defaults() {
        return {
          showPanel: true,
          vehiclesOn: true,        // v5.1: false = fsheh rrumullakat e makinave, fsheh rreshtin e rretheve
          vehiclesKey: 'v',        // v5.1: tasti UI per ON/OFF te rretheve
          positionX: 18,
          positionY: 18,
          panelX: 18,
          panelY: 112,
          itemSize: 112,
          gap: 14,
          imageScale: 1.0,
          showArrows: false,
          showMarks: true,
          markSize: 0.82,
          markPos: 'center',        // v5.10: ku del ✓/✕ — center | above | under
          markOffsetX: 0,           // v5.10: zhvendosja e shenjave (px)
          markOffsetY: 0,
          markSoundVolume: 0.85,    // v5.10: volumi i ka-ching / buzzer
          brandLogoOn: true,        // v5.11: logoja e markës automatikisht kur ndërron makinën
          brandBadge: true,         // v5.11: badge me shkronja kur s'ka file logo
          circleShape: 'circle',
          outlineWidth: 4,
          glow: 8,
          markGlow: 0,
          markOutline: 1.2,
          shortsMode: false,
          shortsRestore: null,
          shortsSafeAreas: true,
          pendingFillOpacity: 0.16,
          pendingOutlineOpacity: 0.00,
          currentIndex: 0,
          soundOn: true,
          passKey: 'k',
          failKey: 'l',
          nextKey: 'PageDown',
          prevKey: 'PageUp',
          resetKey: 'g',
          togglePanelKey: 'h',
          useHotkeys: true,
          showMiniButton: true,
          hudDensity: 'normal',

          // ---- v2.1: GUIDAT PER SHORTS (9:16) ----
          guidesOn: false,         // shfaq kornizen e sigurt + vijat e mesit
          guideRatio: '9:16',      // 9:16 | 4:5 | 1:1 | 16:9
          guideCenterV: true,      // vija vertikale ne mes
          guideCenterH: true,      // vija horizontale ne mes
          guideThirds: false,      // rregulli i te tretave
          guideColor: '#00e5ff',

          // ---- v2.0 PREMIUM ----
          theme: 'luxury',         // default | glass | neon | minimal | luxury
          layout: 'row',           // row | grid | column
          gridCols: 4,
          autoAdvance: true,       // kalo automatikisht te itemi tjeter pas markimit
          animLevel: 'full',       // full | subtle | off
          showLabels: false,       // emrat nen fotot
          labelSize: 13,
          presets: [],             // presets te ruajtura
          photoArchive: {},        // v5.10.1: arkiva e fotove (fotot nuk humbin kurrë)
          photoMaxPx: 320,         // v5.10.1: madhesia max e fotos se rruatjtur (px)
          items: defaultItems(8)
        };
      }

      function normalizeConfig(saved, fallback) {
        var cfg = angular.extend({}, fallback, saved || {});
        Object.keys(cfg).forEach(function(k) {
          if (/^(survival|cost|autoPhoto|live|stream|damage)/i.test(k)) delete cfg[k];
        });
        delete cfg.guideDim; // Shorts guides never darken the game/screenshot.
        if (!cfg.items || !cfg.items.length) cfg.items = defaultItems(8);

        // force cleaner defaults from v4 while keeping user items/images if saved
        if (!cfg.photoArchive || typeof cfg.photoArchive !== 'object') cfg.photoArchive = {};
        if (!cfg.photoMaxPx || isNaN(Number(cfg.photoMaxPx))) cfg.photoMaxPx = 320;
        if (cfg.pendingFillOpacity === undefined || cfg.pendingFillOpacity === null) cfg.pendingFillOpacity = 0.18;
        // v5.1: ON/OFF per rrumullakat e makinave (false = rrethet fshihen)
        if (cfg.vehiclesOn === undefined || cfg.vehiclesOn === null) cfg.vehiclesOn = true;
        if (!cfg.vehiclesKey) cfg.vehiclesKey = 'v';
        if (cfg.pendingOutlineOpacity === undefined || cfg.pendingOutlineOpacity === null) cfg.pendingOutlineOpacity = 0.08;
        if (cfg.showMiniButton === undefined || cfg.showMiniButton === null) cfg.showMiniButton = true;
        if (cfg.showMarks === undefined || cfg.showMarks === null) cfg.showMarks = true;
        if (cfg.markSize === undefined || cfg.markSize === null) cfg.markSize = 0.82;
        if (cfg.markPos !== 'center' && cfg.markPos !== 'above' && cfg.markPos !== 'under') cfg.markPos = 'center';
        if (cfg.markOffsetX === undefined || cfg.markOffsetX === null) cfg.markOffsetX = 0;
        if (cfg.markOffsetY === undefined || cfg.markOffsetY === null) cfg.markOffsetY = 0;
        if (cfg.markSoundVolume === undefined || cfg.markSoundVolume === null) cfg.markSoundVolume = 0.85;
        if (cfg.brandLogoOn === undefined || cfg.brandLogoOn === null) cfg.brandLogoOn = true;
        if (cfg.brandBadge === undefined || cfg.brandBadge === null) cfg.brandBadge = true;
        if (cfg.useHotkeys === undefined || cfg.useHotkeys === null) cfg.useHotkeys = true;
        if (cfg.panelX === undefined || cfg.panelX === null) cfg.panelX = 18;
        if (cfg.panelY === undefined || cfg.panelY === null) cfg.panelY = 112;

        // ---- v2.0 PREMIUM defaults (ruan konfigurimet e vjetra) ----
        if (!cfg.theme) cfg.theme = 'default';
        if (!cfg.layout) cfg.layout = 'row';
        if (cfg.gridCols === undefined || cfg.gridCols === null) cfg.gridCols = 4;
        if (cfg.autoAdvance === undefined || cfg.autoAdvance === null) cfg.autoAdvance = true;
        // pastro celesat e vjeter te statistikave
        ['showStats','statsAuto','statsPosX','statsPosY','showStreak',
         'showPercent','showProgressBar','countUp'].forEach(function(k){ delete cfg[k]; });
        if (!cfg.animLevel) cfg.animLevel = 'full';
        if (cfg.showLabels === undefined || cfg.showLabels === null) cfg.showLabels = false;
        if (cfg.labelSize === undefined || cfg.labelSize === null) cfg.labelSize = 13;
        if (!angular.isArray(cfg.presets)) cfg.presets = [];

        if (cfg.circlesClean == null) cfg.circlesClean = true;

        // ---- v2.1 guides ----
        if (cfg.guidesOn === undefined || cfg.guidesOn === null) cfg.guidesOn = false;
        if (!cfg.guideRatio) cfg.guideRatio = '9:16';
        if (cfg.guideCenterV === undefined || cfg.guideCenterV === null) cfg.guideCenterV = true;
        if (cfg.guideCenterH === undefined || cfg.guideCenterH === null) cfg.guideCenterH = true;
        if (cfg.guideThirds === undefined || cfg.guideThirds === null) cfg.guideThirds = false;
        if (!cfg.guideColor) cfg.guideColor = '#00e5ff';
        cfg.passKey = 'k';
        cfg.failKey = 'l';
        cfg.nextKey = 'PageDown';
        cfg.prevKey = 'PageUp';
        cfg.resetKey = 'g';
        cfg.togglePanelKey = 'h';
        if (cfg.markGlow == null) cfg.markGlow = 0;
        if (cfg.markOutline == null) cfg.markOutline = 1.2;
        if (cfg.shortsMode == null) cfg.shortsMode = false;
        if (cfg.shortsSafeAreas == null) cfg.shortsSafeAreas = true;
        cfg.markGlow = Math.max(0, Math.min(30, Number(cfg.markGlow) || 0));
        cfg.markOutline = Math.max(0, Math.min(4, Number(cfg.markOutline) || 0));

        angular.forEach(cfg.items, function(item, idx) {
          ['damageRatio','damagePulse','survivalChance','visited','costLocked','costFrozen','cost','noAuto'].forEach(function(k) { delete item[k]; });
          if (item.enabled === undefined) item.enabled = true;
          if (!item.label) item.label = 'Makina ' + (idx + 1);
          if (!item.state) item.state = 'pending';
          if (!item.image) {
            var ark = cfg.photoArchive['s' + idx];
            if (!ark && item.imageModel) ark = cfg.photoArchive['m:' + item.imageModel];
            if (ark) item.image = ark;
          }
          if (item.imageScale == null) item.imageScale = cfg.imageScale || 1.0;
          if (item.imageOffsetX == null) item.imageOffsetX = 0;
          if (item.imageOffsetY == null) item.imageOffsetY = 0;
          if (item.imageRotation == null) item.imageRotation = 0;
          
        });

        return cfg;
      }

      // v5.10.2: fotot ruahen NE VEÇANTI (PHOTO_KEY) — nuk varen prej konfigurimit
      // dhe NUK humbin kur mbyllet e rihapet loja.
      function loadPhotosArchive() {
        var out = {};
        try {
          var raw = localStorage.getItem(PHOTO_KEY);
          if (!raw) return out;
          var pa = JSON.parse(raw);
          if (pa && typeof pa === 'object') {
            angular.forEach(pa, function(v, k) { if (v && String(v).indexOf('data:image') === 0) out[k] = v; });
          }
        } catch (e) {}
        return out;
      }

      function restoreImagesFromArchive(cfg, archive) {
        var n = 0;
        archive = archive || cfg.photoArchive || {};
        angular.forEach(cfg.items, function(item, idx) {
          if (!item || item.image) return;
          var v = archive['s' + idx] || (item.imageModel ? archive['m:' + item.imageModel] : '');
          if (v) { item.image = v; n++; }
        });
        return n;
      }

      function load() {
        var d = defaults();
        var cfg = d, restored = 0, state = 'ok', raw = null;
        try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
        if (raw) {
          try {
            cfg = normalizeConfig(JSON.parse(raw), d);
          } catch (e) {
            // v5.11.1: konfigurimi i dëmtuar/shkurtuar — MOS i humb logot e fotot:
            // kthehu prej KOPJES se sigurt (shkruhet gjith herë para celesit kryesor).
            state = 'corrupt';
            try {
              var bk = localStorage.getItem(BACKUP_KEY);
              if (bk) { cfg = normalizeConfig(JSON.parse(bk), d); state = 'repaired'; }
            } catch (e2) {}
          }
        }
        scope.loadState = state;
        scope.bootLoadState = state;
        // v5.11.1: markat e logot prej mini-ruajtjes se sigurt (gjith herë)
        try { applyStateStore(cfg); } catch (e) {}
        // v5.10.2: bashko arkiven e fotove (te ruajtura veçmas) + riktheji në rrathë
        var recovered = 0;
        try {
          var disk = loadPhotosArchive();
          if (!cfg.photoArchive || typeof cfg.photoArchive !== 'object') cfg.photoArchive = {};
          angular.forEach(disk, function(v, k) { if (!cfg.photoArchive[k]) cfg.photoArchive[k] = v; });
          // v5.11.2: nese arkiva u ZBRAZ (fotot humbën), provo prej KOSHIT e prej KOPJES
          var wipedByUser = false;
          try { wipedByUser = !!localStorage.getItem(WIPE_KEY); } catch (e) {}
          if (photoCountInArch(cfg.photoArchive) === 0 && !wipedByUser) {
            var cand = {};
            angular.forEach(trashArchive(), function (v, k) { cand[k] = v; });
            angular.forEach(backupArchive(), function (v, k) { if (!cand[k]) cand[k] = v; });
            var nR = 0;
            angular.forEach(cand, function (v, k) { cfg.photoArchive[k] = v; nR++; });
            if (nR) recovered = nR;
          }
          restored = restoreImagesFromArchive(cfg, cfg.photoArchive);
        } catch (e) {}
        return { cfg: cfg, restored: restored, recovered: recovered };
      }

      var bootLoad = load();
      scope.cfg = bootLoad.cfg;
      scope.restoredPhotos = bootLoad.restored || 0;
      scope.recoveredPhotos = bootLoad.recovered || 0;   // v5.11.2: u gjetën prej koshit/kopjes
      scope.selected = Math.max(0, Math.min(scope.cfg.currentIndex || 0, scope.cfg.items.length - 1));
      scope.storageWarning = '';

      scope.rootClass = function() {
        return 'pf-theme-' + (scope.cfg.theme || 'default') +
               ' pf-anim-' + (scope.cfg.animLevel || 'full') +
               ' pf-layout-' + (scope.cfg.layout || 'row') +
               ' pf-density-' + (scope.cfg.hudDensity || 'normal');
      };

      scope.labelStyle = function() {
        return { fontSize: (Number(scope.cfg.labelSize) || 13) + 'px' };
      };
      scope.fx = { show: false, type: null };
      var fxTimer = null;


      scope.setShape = function(shape) {
        scope.cfg.circleShape = shape;
        scope.persist();
      };

      function stripRaw(obj) {
        var out = {}, k;
        for (k in obj) {
          if (obj.hasOwnProperty(k) && k.indexOf('__raw') === -1) out[k] = obj[k];
        }
        return out;
      }

      // v5.10.2: KONFIGURIMI dhe FOTOT ruahen në DY vende te ndryshme:
      //   STORAGE_KEY  -> vetem konfigurimi (i vogel, ruahet gjith herë)
      //   PHOTO_KEY    -> fotot e rrathëve (arkiva) — nuk humbin kur mbyllet loja
      // Nese fotot s'ruahen dot (memoria plot), kompresohen VETË derisa te ruahen;
      // nese as kshtu s'ruahen, te thuhet qartë (kurrë humbje e heshtur).
      // v5.11.2: PHOTO_KEY/PHOTO_LEVELS/TRASH_KEY u shpërngulën LART (rreshti ~39) —
      // load() thirrej PARA se PHOTO_KEY te caktohej: fotot s'riktheheshin ne nisje
      // e pastaj mbuloheshin me {} prej savePhotos() -> HUMBNIN (bugu qe u gjet tash).
      var photoSaveBusy = false;
      scope.photoSavedKB = 0;
      scope.photoSaveState = 'ok';       // ok | compressed | failed
      scope.photoSaveNote = '';
      scope.restoredPhotos = scope.restoredPhotos || 0;
      var autoCompressing = false;      // v5.10.1: roje kunder ciklit te kompresimit
      function configForSave(withImages) {
        var out = stripRaw(scope.cfg);
        if (!out.photoArchive || typeof out.photoArchive !== 'object') out.photoArchive = {};
        out.items = (scope.cfg.items || []).map(function(it, i) {
          var c = {}; for (var k in it) if (it.hasOwnProperty(k)) c[k] = it[k];
          // v5.10.1: arkiva mbushet vetë nga fotot që janë në rrathë (s'humbe kurrë gja)
          if (it && it.image && String(it.image).indexOf('data:image') === 0) {   // v5.11.3: edhe file-at e folderit (si base64)
            out.photoArchive['s' + i] = it.image;
            if (it.imageModel) out.photoArchive['m:' + it.imageModel] = it.image;
          }
          if (!withImages) c.image = '';
          return c;
        });
        return out;
      }
      function cleanArchive() {
        var src = (scope.cfg.photoArchive && typeof scope.cfg.photoArchive === 'object') ? scope.cfg.photoArchive : {};
        var out = {}, n = 0;
        angular.forEach(src, function(v, k) { if (v && String(v).indexOf('data:image') === 0) { out[k] = v; n++; } });
        return out;
      }

      // =====================================================
      // v5.11.1: MINI-RUAJTJE E SIGURT + KOPJA E KONFIGURIMIT
      //   _gjendja  -> markat e rrathëve + file-at e fotove (shumë e vogel)
      //   _backup   -> kopja e konfigurimit te fundit te MIRE
      // Keto shkruhen PARA celesit kryesor, kshtu edhe nese ai dëmtohet,
      // logot e fotot nuk humbin.
      // =====================================================
      // v5.11.2: "KOSH I FOTOVE" — para se me fshi gja, fotot shkojne ketu e mund t'i kthesh
      function filterPhotoArchive(src) {
        var out = {}, n = 0;
        angular.forEach(src || {}, function (v, k) { if (v && String(v).indexOf('data:image') === 0) { out[k] = v; n++; } });
        return out;
      }
      function photoCountInArch(arch) { return Object.keys(filterPhotoArchive(arch)).length; }
      function trashArchive() {
        try { return filterPhotoArchive(JSON.parse(localStorage.getItem(TRASH_KEY) || '{}')); } catch (e) { return {}; }
      }
      function backupArchive() {
        try {
          var b = JSON.parse(localStorage.getItem(BACKUP_KEY) || '{}');
          return filterPhotoArchive(b && b.photoArchive ? b.photoArchive : b);
        } catch (e) { return {}; }
      }
      function moveArchiveToTrash(src) {
        try {
          var arch = filterPhotoArchive(src || cleanArchive());
          var keys = Object.keys(arch);
          if (!keys.length) return 0;
          var prev = trashArchive();
          angular.forEach(arch, function (v, k) { prev[k] = v; });
          var all = Object.keys(prev);
          if (all.length > 80) {                       // mos e mbush memorien
            all.sort();
            all.slice(0, all.length - 80).forEach(function (k) { delete prev[k]; });
          }
          localStorage.setItem(TRASH_KEY, JSON.stringify(prev));
          return keys.length;
        } catch (e) { return 0; }
      }

      // ---------- v5.11.3: ARKIVA E LOGOVE (mos i humb kurrë) ----------
      function loadLogoArchive() {
        var out = {};
        try {
          var pa = JSON.parse(localStorage.getItem(LOGO_KEY) || '{}');
          angular.forEach(pa || {}, function (v, k) {
            if (v && String(v).indexOf('data:image') === 0) out[k] = v;
          });
        } catch (e) {}
        return out;
      }
      function logoArchiveCount() { return Object.keys(loadLogoArchive()).length; }
      function logoArchiveKB() {
        try { return Math.round(String(localStorage.getItem(LOGO_KEY) || '').length / 1024); } catch (e) { return 0; }
      }
      function saveLogoArchive() {
        try {
          var out = {}, n = 0, bytes = 0;
          angular.forEach(logoResolved, function (v, k) {
            if (!v || String(v).indexOf('data:image') !== 0) return;
            if (n >= 44 || bytes > 700000) return;          // kufi: mos e mush memorien
            out[k] = v; n++; bytes += String(v).length;
          });
          localStorage.setItem(LOGO_KEY, JSON.stringify(out));
        } catch (e) {}
      }
      // Kthen çdo foto (URL ose base64) ne base64 te vogel — kshtu s'varet ma prej file-it
      function shrinkAnyImage(src, maxPx, cb) {
        try {
          var im = new Image();
          im.onload = function () {
            try {
              var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
              if (!w || !h) { cb(null); return; }
              var sc = Math.min(1, Number(maxPx || 160) / Math.max(w, h));
              var c = document.createElement('canvas');
              c.width = Math.max(1, Math.round(w * sc));
              c.height = Math.max(1, Math.round(h * sc));
              var cx = c.getContext('2d');
              cx.clearRect(0, 0, c.width, c.height);
              cx.drawImage(im, 0, 0, c.width, c.height);
              var out = c.toDataURL('image/png');
              cb(out && out.length > 60 ? out : null);
            } catch (e) { cb(null); }
          };
          im.onerror = function () { cb(null); };
          im.src = src;
        } catch (e) { cb(null); }
      }
      function rememberLogo(key, src) {
        try {
          if (!key || !src) return;
          logoResolved[key] = src;
          if (String(src).indexOf('data:image') === 0) { saveLogoArchive(); return; }
          shrinkAnyImage(src, 160, function (small) {
            if (small) { logoResolved[key] = small; saveLogoArchive(); try { scope.$applyAsync(); } catch (e) {} }
          });
        } catch (e) {}
      }
      scope.clearLogoArchive = function () {
        try { localStorage.removeItem(LOGO_KEY); } catch (e) {}
        logoResolved = {}; logoFailNote = {}; logoTries = {}; logoLuaAsked = {}; logoLastTry = {};
        notify('🧹 Logot e ruajtura u fshinë — rikontrollohen prej folderit imazhet/');
        try { kickAllLogos(); } catch (e) {}
      };

      function stateStore() {
        var st = { v: 5111, i: {}, files: {}, info: brandInfoGlobal || null };
        angular.forEach(scope.cfg.items || [], function (it, i) {
          if (!it) return;
          if (it.brand) st.i[i] = { b: it.brand, l: it.brandLabel || '', m: it.imageModel || '' };
          if (it.imageFile) st.files[i] = it.imageFile;
        });
        return st;
      }
      function writeStateStore() {
        try {
          if (!iAmOwner()) return;
          localStorage.setItem(STATE_KEY, JSON.stringify(stateStore()));
        } catch (e) {}
      }
      function readStateStore() {
        try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; } catch (e) { return {}; }
      }
      function applyStateStore(cfg) {
        var st = readStateStore();
        angular.forEach(st.i || {}, function (v, k) {
          var it = (cfg.items || [])[+k];
          if (it && v && v.b) {
            it.brand = v.b;
            it.brandLabel = v.l || '';
            if (v.m) it.imageModel = v.m;
          }
        });
        angular.forEach(st.files || {}, function (v, k) {
          var it = (cfg.items || [])[+k];
          if (it && v) {
            it.imageFile = v;
            if (!it.image) it.image = v;      // file-i osht brenda modit -> del gjith herë
          }
        });
        if (st.info && st.info.brand) brandInfoGlobal = st.info;
      }
      // Rikthe markat prej mini-ruajtjes (per rrathët qe i kane humb)
      function reapplyStoredBrands() {
        var st = readStateStore(), changed = 0;
        angular.forEach(scope.cfg.items || [], function (it, i) {
          if (!it || it.brand) return;
          var v = (st.i || {})[String(i)];
          if (v && v.b) { it.brand = v.b; it.brandLabel = v.l || ''; changed++; }
        });
        if (st.info && st.info.brand) brandInfoGlobal = st.info;
        if (changed) { try { scope.persist(); } catch (e) {} }
        return changed;
      }
      function writeBackup() {
        try {
          if (!iAmOwner()) return;
          if (scope.loadState === 'corrupt') return;    // mos e prish kopjen e mire
          localStorage.setItem(BACKUP_KEY, JSON.stringify(configForSave(false)));
        } catch (e) {}
      }

      // Ruan vetem fotot (arkiven). Nese s'ruahen dot -> kompresim progresiv.
      function savePhotos(cb) {
        if (!iAmOwner()) { if (cb) cb(true); return; }    // v5.11.1: vetem instanca aktive shkruan
        if (photoSaveBusy) { if (cb) cb(true); return; }
        var json = JSON.stringify(cleanArchive());
        try {
          localStorage.setItem(PHOTO_KEY, json);
          scope.photoSaveState = 'ok';
          scope.photoSavedKB = Math.round(json.length / 1024);
          scope.photoSaveNote = '';
          if (cb) cb(true);
          return;
        } catch (e) { /* memoria plot -> provo me kompresim */ }
        photoSaveBusy = true;
        var i = 0;
        (function tryLevel() {
          if (i >= PHOTO_LEVELS.length) {
            photoSaveBusy = false;
            scope.photoSaveState = 'failed';
            scope.photoSaveNote = '⚠️ Memoria plot — fotot NUK u ruanen! Fshij disa foto ("🗑️ Fshi fotot") ose ul madhësinë.';
            try { scope.$evalAsync(); } catch (e) {}
            if (cb) cb(false);
            return;
          }
          var lvl = PHOTO_LEVELS[i++];
          scope.compressPhotos(lvl, function () {
            var j2 = JSON.stringify(cleanArchive());
            try {
              localStorage.setItem(PHOTO_KEY, j2);
              photoSaveBusy = false;
              scope.photoSaveState = 'compressed';
              scope.photoSavedKB = Math.round(j2.length / 1024);
              scope.photoSaveNote = '✓ Fotot u kompresuan vetë (' + lvl + 'px) që të mos humbin.';
              try { scope.$evalAsync(); } catch (e) {}
              if (cb) cb(true);
            } catch (e2) { tryLevel(); }
          });
        })();
      }

      scope.photoSaveText = function() {
        if (scope.photoSaveState === 'failed') return '⚠️ NUK ruanen — memoria plot!';
        if (scope.photoSaveState === 'compressed') return '✓ të ruejtura (kompresuar vetë · ' + scope.photoSavedKB + ' KB)';
        return '✓ të ruejtura (' + scope.photoSavedKB + ' KB)';
      };

      // Butoni "🧪 Testo ruajtjen": kontrollon a jon fotot vërtet në memorje
      scope.verifyPhotos = function() {
        var mem = 0;
        try {
          var raw = localStorage.getItem(PHOTO_KEY);
          if (raw) { var pa = JSON.parse(raw); angular.forEach(pa, function(v) { if (v && String(v).indexOf('data:image') === 0) mem++; }); }
        } catch (e) {}
        var inCircles = scope.photoCount();
        if (inCircles === 0) { notify('ℹ️ S\'ka foto në rrathë për me testo'); return; }
        if (mem >= inCircles) notify('✓ Ruajtja OK: ' + inCircles + ' foto në rrathë · ' + mem + ' në memorje — mbeten edhe kur mbyllet e hapet loja');
        else { notify('⚠️ Në rrathë: ' + inCircles + ' · në memorje: ' + mem + ' — shtyp "💾 Ruaj fotot tani"'); scope.persist(); }
      };

      scope.savePhotosNow = function() {
        (scope.cfg.items || []).forEach(function(x, i) { if (x && x.image) archivePhoto(i); });
        savePhotos(function (ok) {
          notify(ok ? ('💾 U ruanen ' + scope.photoCount() + ' foto (' + scope.photoSavedKB + ' KB) — nuk humbin kur mbyllet loja')
                     : '⚠️ Memoria plot — fotot nuk u ruanen! Fshij disa foto.');
        });
      };

      // Backup ne tekst (nese do me i ruejt edhe jashtë lojës)
      scope.photoBackupOpen = false;
      scope.photoBackupText = '';
      scope.makePhotoBackup = function() {
        try { scope.photoBackupText = JSON.stringify(cleanArchive()); scope.photoBackupOpen = true; notify('📋 Backup-u u ba — kopjo tekstin (Ctrl+C) e rueje ku të duash'); }
        catch (e) { notify('✗ Backup-i nuk u ba'); }
      };
      scope.loadPhotoBackup = function() {
        try {
          var pa = JSON.parse(scope.photoBackupText || '{}');
          if (!pa || typeof pa !== 'object') throw new Error('bad');
          var n = 0;
          if (!scope.cfg.photoArchive) scope.cfg.photoArchive = {};
          angular.forEach(pa, function(v, k) { if (v && String(v).indexOf('data:image') === 0) { scope.cfg.photoArchive[k] = v; n++; } });
          var back = restoreImagesFromArchive(scope.cfg, scope.cfg.photoArchive);
          savePhotos(function () {});
          scope.persist();
          notify('♻️ Nga backup-u: ' + n + ' foto (u rikthyen në rrathë: ' + back + ')');
        } catch (e) { notify('✗ Teksti i backup-ut nuk lexohet'); }
      };

      scope.photoCount = function() {
        var n = 0;
        angular.forEach(scope.cfg.items, function(it) { if (it && it.image) n++; });
        return n;
      };
      scope.storageKB = function() {
        try { return Math.round(JSON.stringify(configForSave(false)).length / 1024); } catch (e) { return 0; }
      };

      scope.persist = function() {
        if (!iAmOwner()) return;      // v5.11.1: instanca e vjeter s'ia prish te renë
        scope.cfg.currentIndex = scope.selected;
        // v5.10.2: konfigurimi ruahet PA foto (fotot shkojnë veçmas, në PHOTO_KEY),
        // kshtu konfigurimi rri i vogel e ruahet gjith herë pa problem.
        (scope.cfg.items || []).forEach(function(it, i) { if (it && it.image) archivePhoto(i); });
        writeStateStore();      // v5.11.1: markat/logot ruahen gjith herë (mini)
        writeBackup();          // v5.11.1: kopja e fundit e mire (para celesit kryesor)
        try {
          var cfgSmall = configForSave(false);
          cfgSmall.photoArchive = {};
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cfgSmall));
          scope.storageWarning = '';
          scope.loadState = 'ok';       // v5.11.1: shkrimi i mbaroi mire -> kopja rikthehet normalisht
        } catch (e) {
          // Fotot ruhen si base64 -> mund ta kalojne kuoten ~5MB.
          // Provo edhe njehere pa presets, qe te pakten HUD-i te mos humbase.
          try {
            var slim = configForSave(false);
            slim.photoArchive = {};
            slim.presets = [];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
            scope.storageWarning = 'Memoria u mbush - presets nuk u ruajten. Shtyp "🗜️ Kompreso fotot".';
          } catch (e2) {
            // v5.10.1: provo vetë kompresimin, pastaj rua prapë — fotot mos humbin.
            // autoCompressing = roje kundër ciklit (mos ringarko pa fund).
            if (autoCompressing) {
              scope.storageWarning = 'Memoria eshte krejt plot! Fshij disa foto ose rrathë me "🗑️ Fshi fotot".';
            } else {
              autoCompressing = true;
              scope.storageWarning = 'Memoria u mbush! Po i kompresoj fotot vetë…';
              scope.$evalAsync(function() {
                scope.compressPhotos(220, function() {
                  try {
                    var c3 = configForSave(false); c3.photoArchive = {};
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(c3));
                    scope.storageWarning = 'Memoria u mbush — fotot u kompresuan vetë (nuk u humb asnji).';
                  } catch (e3) {
                    scope.storageWarning = 'Memoria eshte krejt plot! Fshij disa foto ose rrathë me "🗑️ Fshi fotot".';
                  }
                  autoCompressing = false;      // v5.10.1: roja hiqet vetem në fund
                });
              });
            }
          }
        }
        savePhotos();     // v5.10.2: fotot ruahen gjith herë veçmas
      };

      // =====================================================
      // GUIDAT PER SHORTS / REELS (9:16)
      // =====================================================
      // U rikthyen ne v3.1 - u fshine gabimisht kur u hoqen statistikat.

      scope.viewport = { w: 1920, h: 1080 };

      function measureViewport() {
        try {
          var el = element && element[0] ? element[0] : null;
          var w = $window.innerWidth || (el && el.offsetWidth) || 1920;
          var h = $window.innerHeight || (el && el.offsetHeight) || 1080;
          if (w > 0 && h > 0) { scope.viewport.w = w; scope.viewport.h = h; }
        } catch (e) {}
      }
      measureViewport();

      function ratioValue(r) {
        switch (String(r)) {
          case '9:16': return 9 / 16;
          case '4:5':  return 4 / 5;
          case '1:1':  return 1;
          case '16:9': return 16 / 9;
          default:     return 9 / 16;
        }
      }

      scope.safeBox = function() {
        var vw = scope.viewport.w, vh = scope.viewport.h;
        var ar = ratioValue(scope.cfg.guideRatio);
        var boxH = vh, boxW = vh * ar;
        if (boxW > vw) { boxW = vw; boxH = vw / ar; }
        return { w:boxW, h:boxH, left:(vw-boxW)/2, top:(vh-boxH)/2, cx:vw/2, cy:vh/2 };
      };

      scope.guideFrameStyle = function() {
        var b = scope.safeBox();
        return { left:b.left+'px', top:b.top+'px', width:b.w+'px', height:b.h+'px',
                 borderColor: scope.cfg.guideColor };
      };
      scope.guideVStyle = function(){ return { left: scope.safeBox().cx+'px', background: scope.cfg.guideColor }; };
      scope.guideHStyle = function(){ return { top:  scope.safeBox().cy+'px', background: scope.cfg.guideColor }; };
      scope.guideThirdStyle = function(which, i) {
        var b = scope.safeBox();
        if (which === 'v') return { left:(b.left + b.w*(i/3))+'px', background: scope.cfg.guideColor };
        return { top:(b.top + b.h*(i/3))+'px', background: scope.cfg.guideColor };
      };
      scope.guideLabel = function() {
        var b = scope.safeBox();
        return Math.round(b.w)+' x '+Math.round(b.h)+'  ('+scope.cfg.guideRatio+')';
      };
      scope.guideLabelStyle = function() {
        var b = scope.safeBox();
        return { left:b.left+'px', top:Math.max(0,b.top-26)+'px', color: scope.cfg.guideColor };
      };

      scope.circleVisible = function(index) {
        return !scope.cfg.shortsMode || index < 4;
      };
      scope.visibleCircleCount = function() {
        var n = 0;
        angular.forEach(scope.cfg.items, function(it, i) {
          if (it && (scope.cfg.shortsMode || it.enabled !== false) && scope.circleVisible(i)) n++;
        });
        return n;
      };
      scope.enabledCount = scope.visibleCircleCount;
      scope.resultCount = function(state) {
        var n = 0;
        angular.forEach(scope.cfg.items, function(it, i) {
          if (it && it.state === state && (scope.cfg.shortsMode || it.enabled !== false) && scope.circleVisible(i)) n++;
        });
        return n;
      };

      function hudDims() {
        var n = Math.max(1, scope.visibleCircleCount());
        var lay = scope.cfg.shortsMode ? 'grid' : (scope.cfg.layout || 'row');
        var cols = n, rows = 1;
        if (lay === 'column') { cols = 1; rows = n; }
        else if (lay === 'grid') {
          cols = scope.cfg.shortsMode ? 2 : Math.max(1, Number(scope.cfg.gridCols) || 4);
          rows = Math.ceil(n / cols);
          if (n < cols) cols = n;
        }
        var size = Number(scope.cfg.itemSize) || 112;
        var gap = Number(scope.cfg.gap) || 0;
        var labelH = scope.cfg.showLabels ? (Number(scope.cfg.labelSize) || 13) + 12 : 0;
        return { w: cols * size + (cols - 1) * gap, h: rows * size + (rows - 1) * gap + labelH };
      }

      scope.shortsPlace = function(where) {
        if (!scope.cfg.shortsMode) return;
        measureViewport();
        var b = scope.safeBox(), d = hudDims();
        scope.cfg.positionX = Math.max(0, Math.round(b.left + (b.w - d.w) / 2));
        if (where === 'bottom') {
          // Keep the HUD above YouTube's title/caption area.
          scope.cfg.positionY = Math.round(b.top + b.h * 0.74 - d.h);
        } else if (where === 'center') {
          scope.cfg.positionY = Math.round(b.cy - d.h / 2 - b.h * 0.06);
        } else {
          scope.cfg.positionY = Math.round(b.top + b.h * 0.09);
        }
        scope.cfg.positionY = Math.max(0, scope.cfg.positionY);
        scope.persist();
      };

      function ensureFourCircles() {
        while (scope.cfg.items.length < 4) {
          var it = defaultItems(1)[0];
          it.label = 'Makina ' + (scope.cfg.items.length + 1);
          scope.cfg.items.push(it);
        }
        for (var i = 0; i < 4; i++) scope.cfg.items[i].enabled = true;
        if (scope.selected > 3) scope.selected = 3;
        scope.cfg.currentIndex = scope.selected;
      }

      function enforceShortsComposition() {
        if (!scope.cfg.shortsMode) return;
        scope.cfg.vehiclesOn = true;
        scope.cfg.layout = 'grid';
        scope.cfg.gridCols = 2;
        scope.cfg.showArrows = false;
        scope.cfg.guideRatio = '9:16';
        ensureFourCircles();
      }

      scope.setShortsMode = function(enabled) {
        enabled = enabled === true || enabled === 'true';
        if (enabled) {
          if (!scope.cfg.shortsMode || !scope.cfg.shortsRestore) {
            scope.cfg.shortsRestore = {
              positionX: scope.cfg.positionX, positionY: scope.cfg.positionY,
              itemSize: scope.cfg.itemSize, gap: scope.cfg.gap,
              layout: scope.cfg.layout, gridCols: scope.cfg.gridCols,
              guidesOn: scope.cfg.guidesOn, guideRatio: scope.cfg.guideRatio,
              guideCenterV: scope.cfg.guideCenterV, guideCenterH: scope.cfg.guideCenterH,
              guideThirds: scope.cfg.guideThirds, showArrows: scope.cfg.showArrows,
              vehiclesOn: scope.cfg.vehiclesOn,
              enabled: scope.cfg.items.map(function(it) { return it.enabled !== false; })
            };
          }
          scope.cfg.shortsMode = true;
          scope.cfg.vehiclesOn = true;
          scope.cfg.layout = 'grid';
          scope.cfg.gridCols = 2;
          scope.cfg.showArrows = false;
          scope.cfg.guidesOn = true;
          scope.cfg.guideRatio = '9:16';
          scope.cfg.guideCenterV = true;
          scope.cfg.guideCenterH = false;
          ensureFourCircles();
          measureViewport();
          var b = scope.safeBox();
          scope.cfg.gap = 18;
          scope.cfg.itemSize = Math.floor(Math.max(72, Math.min(160, b.w * 0.24, b.h * 0.14)));
          scope.shortsPlace('top');
          scope.$evalAsync(function() {
            if (scope.cfg.shortsMode) scope.shortsPlace('top');
          });
        } else {
          var r = scope.cfg.shortsRestore || {};
          scope.cfg.shortsMode = false;
          ['positionX','positionY','itemSize','gap','layout','gridCols','guidesOn','guideRatio',
           'guideCenterV','guideCenterH','guideThirds','showArrows','vehiclesOn'].forEach(function(k) {
            if (r[k] !== undefined && r[k] !== null) scope.cfg[k] = r[k];
          });
          if (r.enabled) {
            scope.cfg.items.forEach(function(it, i) {
              if (r.enabled[i] !== undefined) it.enabled = r.enabled[i];
            });
          }
          scope.cfg.shortsRestore = null;
          scope.persist();
        }
      };
      scope.toggleShorts = function() { scope.setShortsMode(!scope.cfg.shortsMode); };
      var captureRestore = null;
      function restoreAfterCapture() {
        if (!captureRestore) return;
        scope.cfg.guidesOn = captureRestore.guidesOn;
        captureRestore = null;
      }
      scope.cleanCapture = function() {
        if (!captureRestore) captureRestore = { guidesOn: !!scope.cfg.guidesOn };
        scope.cfg.guidesOn = false;
        scope.cfg.showPanel = false;
        scope.persist();
      };
      scope.showShortsGuides = function() {
        scope.cfg.guidesOn = true;
        scope.cfg.guideRatio = '9:16';
        scope.persist();
      };
      scope.shortsSafeRightStyle = function() {
        var b = scope.safeBox();
        return { left:(b.left + b.w * 0.84) + 'px', top:(b.top + b.h * 0.15) + 'px',
                 width:(b.w * 0.16) + 'px', height:(b.h * 0.60) + 'px' };
      };
      scope.shortsSafeBottomStyle = function() {
        var b = scope.safeBox();
        return { left:b.left + 'px', top:(b.top + b.h * 0.78) + 'px',
                 width:b.w + 'px', height:(b.h * 0.22) + 'px' };
      };

      var onResize = function() { scope.$applyAsync(measureViewport); };
      $window.addEventListener('resize', onResize);

      // =====================================================
      // PREVIEW I MADH RRETHOR NE EDITOR
      // =====================================================
      scope.thumbStyle = function(item) {
        var radius = '50%';
        var shape = String(scope.cfg.circleShape).toLowerCase();
        if (shape === 'rounded') radius = '22px';
        if (shape === 'square')  radius = '0px';

        var bc = 'rgba(255,255,255,0.14)';
        if (item.state === 'pass') bc = 'rgba(104,255,164,0.98)';
        else if (item.state === 'fail') bc = 'rgba(255,88,88,0.98)';

        return {
          borderRadius: radius,
          borderWidth: Math.max(3, Number(scope.cfg.outlineWidth || 4)) + 'px',
          borderColor: bc,
          background: 'rgba(0,0,0,' + Number(scope.cfg.pendingFillOpacity || 0.16) + ')'
        };
      };

      scope.thumbImgStyle = function(item) {
        var scale = item.imageScale != null ? item.imageScale : (scope.cfg.imageScale || 1.0);
        var ox = Number(item.imageOffsetX || 0);
        var oy = Number(item.imageOffsetY || 0);
        var rot = Number(item.imageRotation || 0);
        var k = 190 / (Number(scope.cfg.itemSize) || 112);

        return {
          backgroundImage: item.image ? ('url(' + item.image + ')') : 'none',
          backgroundSize: Math.round(scale * 1.55 * 100) + '%',
          backgroundPosition: 'calc(50% + ' + (ox * k) + 'px) calc(50% + ' + (oy * k) + 'px)',
          transform: 'rotate(' + rot + 'deg)'
        };
      };

      // =====================================================
      // v3.1 — ZGJEDHES NGJYRASH
      // =====================================================
      // CEF-i i BeamNG nuk e hap dialogun e sistemit per <input type="color">,
      // prandaj perdorim nje palete te vetendertuar + fushe hex.

      scope.palette = [
        '#ffffff', '#c8d2dc', '#8c99a6', '#3c4652', '#000000', '#ff3c3c', '#ff6b35', '#ffa726',
        '#ffd400', '#c6ff00', '#3dff88', '#00e5a0', '#00d4ff', '#2f9bff', '#5b6cff', '#9b5bff',
        '#e05bff', '#ff4fa3', '#8d5524', '#00ffc8', '#ff0080', '#7cfc00', '#ff2d55', '#40e0d0'
      ];

      scope.pickerOpen = null;

      scope.isPickerOpen = function(key) { return scope.pickerOpen === key; };

      scope.togglePicker = function(key, ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        scope.pickerOpen = (scope.pickerOpen === key) ? null : key;
      };

      scope.closePicker = function() { scope.pickerOpen = null; };

      var HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

      function normalizeHex(h, fallback) {
        if (typeof h !== 'string') return fallback;
        var v = h.trim();
        if (v.charAt(0) !== '#') v = '#' + v;
        if (!HEX_RE.test(v)) return fallback;
        v = v.toLowerCase();
        if (v.length === 4) {   // #abc -> #aabbcc
          v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
        }
        return v;
      }

      scope.sameColor = function(a, b) {
        return normalizeHex(a, 'x') === normalizeHex(b, 'y');
      };

      // Shkrimi manual: ruaj tekstin e papërpunuar qe perdoruesi te
      // mund te shkruaje lirshem, apliko vetem kur behet hex i vlefshem.
      scope.setColorField = function(target, key) {
        if (!target) return;
        var raw = target[key + '__raw'];
        var norm = normalizeHex(raw, null);
        if (norm) { target[key] = norm; scope.persist(); }
      };

      scope.pickColor = function(target, key, color) {
        if (!target) return;
        var norm = normalizeHex(color, null);
        if (!norm) return;
        target[key] = norm;
        target[key + '__raw'] = norm;
        scope.persist();
      };

      // mbylle popup-in kur klikohet jashte
      function onDocClickPicker() {
        if (scope.pickerOpen !== null) {
          scope.$applyAsync(function() { scope.pickerOpen = null; });
        }
      }
      $document.on('click', onDocClickPicker);

      // mbush fushat __raw kur ngarkohet konfigurimi
      scope.tab = 'kryesore';

      function engineLua(cmd) {
        // Always load the Lua bridge explicitly so manual photos,
        // logos and vehicle info reliable now that this mod is circles-only.
        cmd = "extensions.load('creatorpack'); " + cmd;
        try {
          if (window.bngApi && typeof window.bngApi.engineLua === 'function') {
            window.bngApi.engineLua(cmd); return true;
          }
          if (window.bngApi && typeof window.bngApi.engineLuaAsync === 'function') {
            window.bngApi.engineLuaAsync(cmd); return true;
          }
        } catch (e) {}
        return false;
      }

      // =====================================================
      // v5.1 — ON/OFF per rrumullakat e makinave
      // Fshehja eshte thjesht vizuale.
      // =====================================================
      scope.vehiclesVisible = function() {
        return scope.cfg.shortsMode || scope.cfg.vehiclesOn !== false;
      };
      scope.toggleVehicles = function() {
        if (scope.cfg.shortsMode) {
          // Shorts is a fixed four-circle composition, including via V/bindings.
          scope.cfg.vehiclesOn = true;
          notify('Shorts përdor gjithmonë 4 rrethe. Fike Shorts për të fshehur HUD-in.');
        } else {
          scope.cfg.vehiclesOn = !scope.vehiclesVisible();
        }
        scope.persist();
      };
      // =====================================================
      // UNDO (Ctrl+Z)
      // =====================================================
      var undoStack = [];
      var UNDO_MAX = 40;

      function pushUndo(label) {
        try {
          undoStack.push({
            label: label || 'veprim',
            states: scope.cfg.items.map(function(it) { return it.state; }),
            selected: scope.selected
          });
          if (undoStack.length > UNDO_MAX) undoStack.shift();
        } catch (e) {}
      }

      scope.canUndo = function() { return undoStack.length > 0; };

      scope.undo = function() {
        var snap = undoStack.pop();
        if (!snap) return;
        angular.forEach(scope.cfg.items, function(it, i) {
          if (snap.states[i] !== undefined) {
            it.state = snap.states[i];
          }
        });
        scope.selected = snap.selected;
        scope.persist();
      };

      // =====================================================
      // PRESETS
      // =====================================================
      scope.presetName = '';

      // Cka ruhet ne preset: pamja/stili, JO fotot dhe JO rezultatet
      var PRESET_FIELDS = [
        'positionX','positionY','panelX','panelY','itemSize','gap','imageScale',
        'showArrows','showMarks','markSize','markPos','markOffsetX','markOffsetY',
        'markSoundVolume','markGlow','markOutline','circleShape','outlineWidth','glow',
        'brandLogoOn','brandBadge','pendingFillOpacity','pendingOutlineOpacity',
        'theme','layout','gridCols','animLevel','showLabels','labelSize','hudDensity',
        'showMiniButton','soundOn','vehiclesOn','vehiclesKey',
        'guidesOn','guideRatio','guideCenterV','guideCenterH','guideThirds','guideColor',
        'shortsSafeAreas'
      ];

      scope.savePreset = function() {
        var name = (scope.presetName || '').trim();
        if (!name) { scope.storageWarning = 'Shkruaj nje emer per preset-in.'; return; }
        var data = {};
        angular.forEach(PRESET_FIELDS, function(k) { data[k] = scope.cfg[k]; });

        var existing = null;
        angular.forEach(scope.cfg.presets, function(p) { if (p.name === name) existing = p; });
        if (existing) { existing.data = data; existing.updatedAt = Date.now(); }
        else scope.cfg.presets.push({ name: name, data: data, updatedAt: Date.now() });

        scope.presetName = '';
        scope.persist();
      };

      scope.loadPreset = function(preset) {
        if (!preset || !preset.data) return;
        angular.forEach(preset.data, function(v, k) {
          // A preset changes style, never enters/leaves the active Shorts workspace.
          if (k === 'shortsMode' || k === 'shortsRestore') return;
          scope.cfg[k] = v;
        });
        enforceShortsComposition();
        scope.persist();
      };

      scope.deletePreset = function(preset) {
        var i = scope.cfg.presets.indexOf(preset);
        if (i >= 0) scope.cfg.presets.splice(i, 1);
        scope.persist();
      };

      // =====================================================
      // EXPORT / IMPORT
      // =====================================================
      scope.exportText = '';
      scope.importText = '';

      scope.buildExport = function() {
        var out = angular.extend({}, scope.cfg);
        // hiq fotot base64 qe teksti te mos jete gjigant
        out.items = (scope.cfg.items || []).map(function(it) {
          var c = angular.extend({}, it);
          c.image = it.image ? '[image]' : '';
          return c;
        });
        scope.exportText = JSON.stringify(out, null, 2);
      };

      scope.applyImport = function() {
        try {
          var parsed = JSON.parse(scope.importText);
          if (!parsed || typeof parsed !== 'object') throw new Error('bad');
          // ruaj fotot ekzistuese
          var oldImages = (scope.cfg.items || []).map(function(it) { return it.image; });
          scope.cfg = normalizeConfig(parsed, defaults());
          angular.forEach(scope.cfg.items, function(it, i) {
            if (it.image === '[image]' || !it.image) it.image = oldImages[i] || '';
          });
          scope.selected = 0;
          enforceShortsComposition();
          scope.persist();
          scope.storageWarning = 'Konfigurimi u importua.';
        } catch (e) {
          scope.storageWarning = 'Teksti nuk eshte JSON i vlefshem.';
        }
      };

      scope.exportResults = function() {
        var lines = ['#,Emri,Rezultati'];
        angular.forEach(scope.cfg.items, function(it, i) {
          if (it.enabled === false) return;
          lines.push((i + 1) + ',"' + String(it.label || '').replace(/"/g, '""') + '",' + (it.state || 'pending'));
        });
        lines.push('');
        var np = 0, nf = 0;
        angular.forEach(scope.cfg.items, function(it) {
          if (!it || it.enabled === false) return;
          if (it.state === 'pass') np++;
          else if (it.state === 'fail') nf++;
        });
        var done = np + nf;
        lines.push('PASS,' + np);
        lines.push('FAIL,' + nf);
        lines.push('Perqindja,' + (done > 0 ? Math.round((np / done) * 100) : 0) + '%');
        scope.exportText = lines.join('\n');
      };

      scope.select = function(i) {
        scope.selected = i;
        scope.persist();
      };

      scope.addItem = function() {
        var idx = scope.cfg.items.length + 1;
        scope.cfg.items.push({
          label: 'Makina ' + idx,
          image: '',
          enabled: true,
          state: 'pending',
          imageScale: scope.cfg.imageScale || 1.0,
          imageOffsetX: 0,
          imageOffsetY: 0,
          imageRotation: 0,
        });
        scope.selected = scope.cfg.items.length - 1;
        scope.persist();
      };

      scope.removeItem = function(index) {
        if (scope.cfg.items.length <= 1) return;
        scope.cfg.items.splice(index, 1);
        if (scope.selected >= scope.cfg.items.length) scope.selected = scope.cfg.items.length - 1;
        if (scope.cfg.shortsMode) ensureFourCircles();
        scope.persist();
      };

      scope.moveItem = function(index, delta) {
        var j = index + delta;
        if (j < 0 || j >= scope.cfg.items.length) return;
        var tmp = scope.cfg.items[index];
        scope.cfg.items[index] = scope.cfg.items[j];
        scope.cfg.items[j] = tmp;
        if (scope.selected === index) scope.selected = j;
        else if (scope.selected === j) scope.selected = index;
        scope.persist();
      };

      scope.resetStates = function() {
        pushUndo('reset');
        angular.forEach(scope.cfg.items, function(item, idx) {
          item.state = 'pending';
          item.markedAt = null;
        });
        scope.selected = 0;
        scope.persist();
      };

      // v5.9.10: "Fshi fotot" — dy klikime (pa dialog), pastron edhe modelin e ruajtur
      scope.clearArmed = false;
      scope.clearAllImages = function() {
        if (!scope.clearArmed) {
          scope.clearArmed = true;
          notify('🗑️ Kliko edhe njëherë për me i fshi TË GJITHA fotot e rrathëve');
          $timeout(function(){ scope.clearArmed = false; }, 5000);
          return;
        }
        scope.clearArmed = false;
        var n = 0;
        var inTrash = moveArchiveToTrash();       // v5.11.2: fotot shkojnë ne KOSH (mund t'i kthesh!)
        try { localStorage.setItem(WIPE_KEY, String(new Date().getTime())); } catch (e) {}   // mos i kthe vetë ne nisje
        angular.forEach(scope.cfg.items, function(item) {
          if (item && item.image) { item.image = ''; item.imageModel = ''; item.imageFile = ''; n++; }
        });
        try { angular.forEach(fileDataCache, function (v, k) { delete fileDataCache[k]; }); } catch (e) {}
        scope.cfg.photoArchive = {};                 // v5.10.1: fshij edhe arkiven
        scope.persist();
        notify(n ? ('🗑️ U fshinë ' + n + ' foto' + (inTrash ? ' (u ruajtën në KOSH — "♻️ Ktheji fotot e fshira" i kthen)' : '') +
                    ' — zgjidh fotot nga galeria')
                 : '🗑️ S\'kishte foto për me fshi');
      };

      scope.togglePanel = function() {
        scope.cfg.showPanel = !scope.cfg.showPanel;
        if (scope.cfg.showPanel) restoreAfterCapture();
        scope.persist();
      };

      scope.openPanel = function() {
        scope.cfg.showPanel = true;
        restoreAfterCapture();
        scope.persist();
      };

      scope.closePanel = function() {
        scope.cfg.showPanel = false;
        scope.persist();
      };

      scope.hudStyle = function() {
        var st = {
          left: Number(scope.cfg.positionX || 0) + 'px',
          top: Number(scope.cfg.positionY || 0) + 'px',
          gap: Number(scope.cfg.gap || 0) + 'px'
        };

        var lay = scope.cfg.shortsMode ? 'grid' : (scope.cfg.layout || 'row');
        if (lay === 'grid') {
          var cols = scope.cfg.shortsMode ? 2 : Math.max(1, Number(scope.cfg.gridCols) || 4);
          st.display = 'grid';
          st.gridTemplateColumns = 'repeat(' + cols + ', auto)';
          st.alignItems = 'center';
          st.justifyItems = 'center';
        } else if (lay === 'column') {
          st.display = 'flex';
          st.flexDirection = 'column';
          st.alignItems = 'center';
        } else {
          st.display = 'flex';
          st.flexDirection = 'row';
          st.alignItems = 'flex-start';
        }
        return st;
      };


      scope.panelStyle = function() {
        return {
          left: Number(scope.cfg.panelX || 18) + 'px',
          top: Number(scope.cfg.panelY || 112) + 'px'
        };
      };

      scope.startPanelDrag = function(evt) {
        if (!evt || (evt.target && evt.target.closest && evt.target.closest('button,input,select,label'))) return;
        var startX = evt.clientX;
        var startY = evt.clientY;
        var baseX = Number(scope.cfg.panelX || 18);
        var baseY = Number(scope.cfg.panelY || 112);
        function move(ev) {
          scope.$applyAsync(function() {
            scope.cfg.panelX = Math.max(0, baseX + (ev.clientX - startX));
            scope.cfg.panelY = Math.max(0, baseY + (ev.clientY - startY));
            scope.persist();
          });
        }
        function up() {
          $document.off('mousemove', move);
          $document.off('mouseup', up);
        }
        $document.on('mousemove', move);
        $document.on('mouseup', up);
        if (evt.preventDefault) evt.preventDefault();
      };

      scope.itemStyle = function(item) {
        var size = Number(scope.cfg.itemSize || 112);
        var radius = '50%';
        if (String(scope.cfg.circleShape).toLowerCase() === 'rounded') radius = '18px';
        if (String(scope.cfg.circleShape).toLowerCase() === 'square') radius = '0px';

        var borderColor = 'rgba(255,255,255,' + Number(scope.cfg.pendingOutlineOpacity || 0.08) + ')';
        var glow = Math.max(0, Math.min(30, Number(scope.cfg.glow) || 0));
        // No black drop-shadow around pending circles (clean screenshots).
        var boxShadow = 'none';

        if (item.state === 'pass') {
          borderColor = 'rgba(104,255,164,0.98)';
          boxShadow = glow > 0 ? ('0 0 ' + glow + 'px rgba(104,255,164,0.28)') : 'none';
        } else if (item.state === 'fail') {
          borderColor = 'rgba(255,88,88,0.98)';
          boxShadow = glow > 0 ? ('0 0 ' + glow + 'px rgba(255,88,88,0.25)') : 'none';
        }

        return {
          width: size + 'px',
          height: size + 'px',
          borderRadius: radius,
          borderWidth: Number(scope.cfg.outlineWidth || 4) + 'px',
          borderColor: borderColor,
          boxShadow: boxShadow,
          opacity: item.enabled === false ? 0.18 : 1,   // v5.9.8: fotot ne rrathë duken GJITHMONE (ma pare 0.38)
          background: 'rgba(0,0,0,' + Number(scope.cfg.pendingFillOpacity || 0.16) + ')'
        };
      };

      scope.imageStyle = function(item) {
        var scale = item.imageScale != null ? item.imageScale : scope.cfg.imageScale || 1.0;
        var percent = Math.round(scale * 100);
        var ox = Number(item.imageOffsetX || 0);
        var oy = Number(item.imageOffsetY || 0);
        return {
          width: percent + '%',
          height: percent + '%',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%) translate(' + ox + 'px,' + oy + 'px)'
        };
      };


      scope.imageBgStyle = function(item) {
        var scale = item.imageScale != null ? item.imageScale : scope.cfg.imageScale || 1.0;
        var ox = Number(item.imageOffsetX || 0);
        var oy = Number(item.imageOffsetY || 0);
        var rot = Number(item.imageRotation || 0);
        var idx = scope.cfg.items.indexOf(item);
        var active = idx === scope.selected;
        var finalScale = scale * 1.55 * (active ? 1.10 : 1.0);
        return {
          backgroundImage: item.image ? ('url(' + item.image + ')') : 'none',
          backgroundSize: Math.round(finalScale * 100) + '%',
          backgroundPosition: 'calc(50% + ' + ox + 'px) calc(50% + ' + oy + 'px)',
          opacity: 1,   // v5.9.7: fotot ne rrumullak duken GJITHMONE, jo vetem kur kalon mbi to
          transform: 'translateZ(0) rotate(' + rot + 'deg)'
        };
      };



      // v5.10: shenja ✓/✕ — pozicioni (mes / mbi / nen rreth) + zhvendosja
      scope.markPosClass = function() {
        var p = scope.cfg.markPos || 'center';
        return p === 'above' ? 'pos-above' : (p === 'under' ? 'pos-under' : 'pos-center');
      };
      scope.markStyle = function() {
        var base = Math.max(12, Math.round(Number(scope.cfg.itemSize || 112) * Number(scope.cfg.markSize || 0.82)));
        var glow = Math.max(0, Math.min(30, Number(scope.cfg.markGlow) || 0));
        var outline = Math.max(0, Math.min(4, Number(scope.cfg.markOutline) || 0));
        return {
          fontSize: base + 'px',
          transform: 'translate(' + Number(scope.cfg.markOffsetX || 0) + 'px,' + Number(scope.cfg.markOffsetY || 0) + 'px)',
          textShadow: glow > 0 ? ('0 0 ' + glow + 'px currentColor') : 'none',
          WebkitTextStroke: outline > 0 ? (outline + 'px rgba(0,0,0,0.88)') : '0px transparent',
          paintOrder: 'stroke fill'
        };
      };
      scope.adjustMarkGlow = function(delta) {
        scope.cfg.markGlow = Math.max(0, Math.min(30, Math.round((Number(scope.cfg.markGlow) || 0) + delta)));
        scope.persist();
      };
      scope.adjustMarkOutline = function(delta) {
        var value = Math.max(0, Math.min(4, (Number(scope.cfg.markOutline) || 0) + delta));
        scope.cfg.markOutline = Math.round(value * 10) / 10;
        scope.persist();
      };
      scope.setMarkPos = function(v) {
        scope.cfg.markPos = (v === 'above' || v === 'under') ? v : 'center';
        scope.persist();
      };
      scope.resetMarkOffset = function() {
        scope.cfg.markOffsetX = 0;
        scope.cfg.markOffsetY = 0;
        scope.persist();
      };

      scope.stateClass = function(item, index) {
        var cls = 'pf-item';
        cls += ' state-' + (item.state || 'pending');
        if (index === scope.selected) cls += ' is-selected';
        if (item && item.pulse) cls += ' pf-pulse';
        if (item.enabled === false) cls += ' is-disabled';
        return cls;
      };

      // v3.2.1 AUDIO FIX:
      // Perdoren skedaret MP3 te perfshire ne mod ne vend te WebAudio synth.
      // Kjo shmang problemet e AudioContext/autoplay ne CEF dhe ben qe
      // PASS/FAIL te kene efektet reale te zerit qe jane ne paket.
      // v5.10: zerat vijne TE PAKETUAR ne mod (sounds/pass.mp3 = ka-ching,
      // sounds/fail.mp3 = wrong-answer buzzer). Nese mungojne, provohen edhe
      // rruget e vjetra (ma heret pritej qe perdoruesi me i qit vete).
      var PF_SOUND_BASE = '/ui/modules/apps/CreatorPack/';
      var PF_SOUND_URLS = {
        pass: [PF_SOUND_BASE + 'sounds/pass.mp3', PF_SOUND_BASE + 'pass.mp3'],
        fail: [PF_SOUND_BASE + 'sounds/fail.mp3', PF_SOUND_BASE + 'fail.mp3']
      };
      var pfSounds = {}, pfSoundTry = { pass: 0, fail: 0 };

      var pfBuf = {}, pfLoading = {};
      var pfAudioState = { ctx:null };

      function audioCtx() {
        try {
          var C = $window.AudioContext || $window.webkitAudioContext;
          if (!C) return null;
          if (!pfAudioState.ctx) pfAudioState.ctx = new C();
          if (pfAudioState.ctx.state === 'suspended' && pfAudioState.ctx.resume) {
            var resumed = pfAudioState.ctx.resume();
            if (resumed && resumed.catch) resumed.catch(function() {});
          }
          return pfAudioState.ctx;
        } catch (e) { return null; }
      }

      function xhrBuf(url, ok, fail) {
        try {
          var XHR = $window.XMLHttpRequest;
          if (!XHR && typeof XMLHttpRequest !== 'undefined') XHR = XMLHttpRequest;
          if (!XHR) { fail(); return; }
          var x = new XHR();
          x.open('GET', url, true);
          x.responseType = 'arraybuffer';
          x.onload = function() {
            if ((x.status === 200 || x.status === 0) && x.response && x.response.byteLength > 200) ok(x.response);
            else fail();
          };
          x.onerror = fail;
          x.send();
        } catch (e) { fail(); }
      }

      // Decode each sound independently; a failure for PASS must never block FAIL.
      // ne BeamNG CEF ky osht ma i sigurt se elementi <audio>.
      function loadPFBuffer(kind, done) {
        if (pfBuf[kind]) return done(pfBuf[kind]);
        if (pfLoading[kind]) { pfLoading[kind].push(done); return; }
        pfLoading[kind] = [done];
        var list = PF_SOUND_URLS[kind], i = 0;
        function finish(buf) {
          pfBuf[kind] = buf || null;
          var cbs = pfLoading[kind]; delete pfLoading[kind];
          (cbs || []).forEach(function(cb) { try { cb(buf); } catch (e) {} });
        }
        function next() {
          if (i >= list.length) return finish(null);
          xhrBuf(list[i++], function(ab) {
            var ctx = audioCtx();
            if (!ctx) return finish(null);
            try { ctx.decodeAudioData(ab, function(buf) { finish(buf); }, function() { next(); }); }
            catch (e) { next(); }
          }, next);
        }
        next();
      }

      function playPFBuffer(kind) {
        var buf = pfBuf[kind];
        if (!buf) { loadPFBuffer(kind, function() {}); return false; }
        try {
          var ctx = audioCtx();
          if (!ctx) return false;
          var src = ctx.createBufferSource(), g = ctx.createGain();
          g.gain.value = markSoundVolume();
          src.buffer = buf; src.connect(g); g.connect(ctx.destination); src.start(0);
          return true;
        } catch (e) { return false; }
      }

      function markSoundVolume() {
        var v = Number(scope.cfg.markSoundVolume);
        if (isNaN(v)) v = 0.85;
        return Math.max(0, Math.min(1, v));
      }

      function initPFSounds() {
        if (!$window.Audio) return;
        angular.forEach(PF_SOUND_URLS, function(list, kind) {
          try {
            var a = new $window.Audio();
            a.preload = 'auto';
            a.volume = markSoundVolume();
            a.onerror = function() {
              var i = (pfSoundTry[kind] || 0) + 1;
              if (i < list.length) {
                pfSoundTry[kind] = i;
                try { a.src = list[i]; a.load(); } catch (e) {}
              }
            };
            a.src = list[0];
            try { a.load(); } catch (e) {}
            pfSounds[kind] = a;
          } catch (e) {}
          try { loadPFBuffer(kind, function() {}); } catch (e) {}
        });
      }

      initPFSounds();

      function playPFSound(kind) {
        // v5.10: provo pare buferin e dekoduar (WebAudio), pastaj elementin <audio>
        if (playPFBuffer(kind)) return true;
        try {
          var base = pfSounds[kind];
          if (!base) return false;

          // Klonimi lejon tingullin te rifilloje edhe nese nje efekt tjeter
          // eshte ende duke u luajtur.
          var audio = base.cloneNode(true);
          audio.volume = markSoundVolume();   // v5.10
          var p = audio.play();
          if (p && p.catch) p.catch(function() {
            // Fallback te objekti i preload-uar.
            try {
              base.currentTime = 0;
              base.volume = markSoundVolume();   // v5.10
              var bp = base.play();
              if (bp && bp.catch) bp.catch(function(){});
            } catch (x) {}
          });
          return true;
        } catch (e) {
          return false;
        }
      }

      function beep(kind) {
        if (!scope.cfg.soundOn) return;
        playPFSound(kind);
      }

      scope.testSound = function(kind) { return playPFSound(kind); };

      scope.markState = function(state, index) {
        if (index === undefined || index === null) index = scope.selected;
        var item = scope.cfg.items[index];
        if (!item || item.enabled === false) return;
        pushUndo('mark');
        item.state = state;
        item.markedAt = Date.now();
        beep(state);
        if (scope.cfg.animLevel !== 'off') {
          item.pulse = true;
          $timeout(function() { item.pulse = false; }, 420);
        }
        if (scope.cfg.autoAdvance) {
          var nextIdx = findNextPending(index);
          if (nextIdx !== -1) {
            scope.selected = nextIdx;
            scope.cfg.currentIndex = nextIdx;
          }
        }
        scope.persist();
      };

      function findNextPending(from) {
        var n = scope.cfg.items.length;
        for (var step = 1; step <= n; step++) {
          var i = (from + step) % n;
          var it = scope.cfg.items[i];
          if (!scope.circleVisible(i)) continue;
          if (it && it.enabled !== false && it.state === 'pending') return i;
        }
        return -1;
      }

      scope.prev = function() {
        scope.selected = Math.max(0, scope.selected - 1);
        scope.cfg.currentIndex = scope.selected;
        scope.persist();
      };

      scope.next = function() {
        scope.selected = Math.min(scope.cfg.shortsMode ? Math.min(3, scope.cfg.items.length - 1) : scope.cfg.items.length - 1, scope.selected + 1);
        scope.cfg.currentIndex = scope.selected;
        scope.persist();
      };

      scope.syncGlobalImageScale = function() {
        angular.forEach(scope.cfg.items, function(item) {
          if (item.imageScale === undefined || item.imageScale === null) item.imageScale = scope.cfg.imageScale;
        });
        scope.persist();
      };

      scope.clearSavedSettings = function() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
        try { localStorage.removeItem(PHOTO_KEY); } catch (e) {}   // v5.10.2: edhe fotot
        scope.cfg = defaults();
        scope.selected = 0;
        scope.persist();
      };

      scope.keySummary = function() {
        return 'PASS K · FAIL L · PREV PageUp / Numpad4 · NEXT PageDown / Numpad6 · RESET G · PANEL H · CIRCLES ' +
               (scope.cfg.vehiclesKey || 'V').toUpperCase();
      };



      var imageTargetIndex = null;
      scope.notice = '';
      function notify(t) {
        scope.notice = t;
        $timeout(function(){ if (scope.notice === t) scope.notice = ''; }, 3500);
      }

      // =====================================================
      // v5.10.1: FOTOT NUK HUMBIN — arkiva e fotove + kompresim
      // =====================================================
      // Pse: kur ka shume foto (14+), memoria e UI-se (localStorage) mbushet
      // dhe fotot e ruajtura humbnin kur ndrrohej makina / rihapej modi.
      // Tani: (a) fotot ruhen ne arkive te veçantë (cfg.photoArchive),
      //       (b) fotot kompresohen vetë (max 320px) para se me u ruejt,
      function archivePhoto(idx) {
        try {
          var it = scope.cfg.items[idx];
          if (!it || !it.image) return;
          if (String(it.image).indexOf('data:image') !== 0) return;   // v5.11.3: vetem base64 arkivohet
          if (!scope.cfg.photoArchive || typeof scope.cfg.photoArchive !== 'object') scope.cfg.photoArchive = {};
          scope.cfg.photoArchive['s' + idx] = it.image;
          if (it.imageModel) scope.cfg.photoArchive['m:' + it.imageModel] = it.image;
        } catch (e) {}
      }

      // v5.11.2: ktheji fotot e fshira (prej KOSHIT ose prej KOPJES se sigurt)
      scope.restoreTrash = function() {
        var cand = {};
        angular.forEach(trashArchive(), function (v, k) { cand[k] = v; });
        var bk = backupArchive();
        angular.forEach(bk, function (v, k) { if (!cand[k]) cand[k] = v; });
        var n = 0;
        if (!scope.cfg.photoArchive || typeof scope.cfg.photoArchive !== 'object') scope.cfg.photoArchive = {};
        angular.forEach(cand, function (v, k) { if (!scope.cfg.photoArchive[k]) { scope.cfg.photoArchive[k] = v; n++; } });
        var back = restoreImagesFromArchive(scope.cfg, scope.cfg.photoArchive);
        if (n || back) {
          angular.forEach(scope.cfg.items || [], function (it, i) {
            if (!it || !it.image) return;
            it.imageManual = true;
          });
          scope.persist();
        }
        try { localStorage.removeItem(WIPE_KEY); } catch (e) {}
        notify((n || back) ? ('♻️ U kthyen ' + n + ' foto prej KOSHIT/kopjes (në rrathë: ' + back + ')')
                            : '♻️ S\'ka foto t\'i kthej (koshi osht bosh)');
        return n;
      };

      scope.restorePhotos = function() {
        var n = 0, ar = scope.cfg.photoArchive || {};
        (scope.cfg.items || []).forEach(function(it, i) {
          if (!it || it.image) return;
          var v = ar['s' + i] || (it.imageModel ? ar['m:' + it.imageModel] : '');
          if (v) { it.image = v; n++; }
        });
        if (n) scope.persist();
        notify(n ? ('♻️ U rikthyen ' + n + ' foto nga arkiva') : '♻️ S\'ka foto për me rikthye');
        return n;
      };

      // Zvogëlon nje foto (dataURL) deri ne maxPx — ruan transparencën (PNG)
      function shrinkDataUrl(url, maxPx, cb) {
        try {
          if (!url || String(url).indexOf('data:image') !== 0) return cb(url);
          var img = new Image();
          img.onload = function() {
            try {
              var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
              var sc = Math.min(1, Number(maxPx || 320) / Math.max(w, h));
              if (!w || !h || sc >= 1) return cb(url);
              var c = document.createElement('canvas');
              c.width = Math.max(1, Math.round(w * sc));
              c.height = Math.max(1, Math.round(h * sc));
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              var out = c.toDataURL('image/png');
              cb(out && out.length > 100 ? out : url);
            } catch (e) { cb(url); }
          };
          img.onerror = function() { cb(url); };
          img.src = url;
        } catch (e) { cb(url); }
      }

      scope.compressPhotos = function(maxPx, done) {
        var max = Math.max(80, Number(maxPx) || Number(scope.cfg.photoMaxPx) || 300);
        var list = (scope.cfg.items || []).filter(function(it) { return it && it.image && String(it.image).indexOf('data:image') === 0; });
        if (!list.length) { if (done) done(0); return; }
        var left = list.length, changed = 0;
        list.forEach(function(it) {
          shrinkDataUrl(it.image, max, function(small) {
            if (small && small.length < it.image.length) { it.image = small; changed++; }
            if (--left === 0) {
              (scope.cfg.items || []).forEach(function(x, i) { if (x && x.image) archivePhoto(i); });
              scope.persist();
              if (done) done(changed);
            }
          });
        });
      };

      scope.removeItemPhoto = function(i) {
        var it = scope.cfg.items[i];
        if (!it) return;
        it.image = ''; it.imageModel = ''; it.imageFile = '';   // v5.11.1: fshij edhe rrugen e file-it
        // v5.11.2: FSHIJ EDHE LOGON — kjo ishte "stubborn": rrathullaku kishte markë,
        // logoja/badge kthehej vetë edhe pas fshirjes se fotos.
        it.brand = ''; it.brandLabel = ''; it.brandAuto = false;
        it.noLogo = true;                                        // s'kthehet ma vetë
        try { delete scope.cfg.photoArchive['s' + i]; } catch (e) {}
        try { if (it.imageModel && scope.cfg.photoArchive) delete scope.cfg.photoArchive['m:' + it.imageModel]; } catch (e) {}
        // v5.11.1: hiq 'm:' per modelet qe s'kane ma asnji foto (mos u rikthejne vetë)
        try {
          angular.forEach(scope.cfg.photoArchive || {}, function (v, k) {
            if (String(k).indexOf('m:') !== 0) return;
            var model = String(k).slice(2), used = false;
            angular.forEach(scope.cfg.items, function (o) {
              if (o && o.image && !o.imageFile && o.imageModel === model) used = true;
            });
            if (!used) delete scope.cfg.photoArchive[k];
          });
        } catch (e) {}
        try { clearItemState(i); } catch (e) {}
        try { localStorage.setItem(WIPE_KEY, String(new Date().getTime())); } catch (e) {}
        scope.persist();
        notify('🗑️ Rrathullaku ' + (i + 1) + ' u pastrua — fotoja E logoja u fshinë (nuk kthehen ma vetë)');
      };

      // v5.11.2: fshij vetem LOGON e nje rrathullaku
      scope.removeItemLogo = function(i) {
        var it = scope.cfg.items[i];
        if (!it) return;
        it.brand = ''; it.brandLabel = ''; it.brandAuto = false; it.noLogo = true;
        try { clearItemState(i); } catch (e) {}
        scope.persist();
        notify('🏷️ Logoja e rrathullakut ' + (i + 1) + ' u fshi (🚫 nuk kthehet ma vetë)');
      };
      // v5.11.2: lejo prapë logon automatike per nje rrathullak
      scope.allowItemLogo = function(i) {
        var it = scope.cfg.items[i];
        if (!it) return;
        it.noLogo = false;
        scope.persist();
        notify('🏷️ Rrathullaku ' + (i + 1) + ' e lejon prapë logon automatike');
      };
      // v5.11.2: fshij KREJT logot (nje klik, me njoftim)
      scope.clearAllBrands = function() {
        var n = 0;
        angular.forEach(scope.cfg.items || [], function (it, i) {
          if (it && (it.brand || it.brandLabel)) {
            it.brand = ''; it.brandLabel = ''; it.brandAuto = false; it.noLogo = true; n++;
            try { clearItemState(i); } catch (e) {}
          }
        });
        scope.persist();
        notify(n ? ('🏷️ U fshinë ' + n + ' logo — nuk kthehen ma vetë (ndize prapë me kutinë e logove ose me butonin per rrathullak)')
                  : '🏷️ S\'kishte logo për me fshi');
        return n;
      };
      function clearItemState(i) {
        try {
          var st = JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {};
          if (st.i) delete st.i[String(i)];
          if (st.files) delete st.files[String(i)];
          localStorage.setItem(STATE_KEY, JSON.stringify(st));
        } catch (e) {}
      }

      function placeCircleImage(dataUrl, name) {
        var items = scope.cfg.items || [];
        var idx = imageTargetIndex != null ? Number(imageTargetIndex) : (Number(scope.selected) || 0);
        imageTargetIndex = null;
        if (!items[idx]) { notify('✗ S\'ka rrumullak'); return; }
        items[idx].enabled = true;
        items[idx].imageScale = 0.62;
        items[idx].imageOffsetX = 0;
        items[idx].imageOffsetY = 0;
        items[idx].imageRotation = 0;
        items[idx].imageManual = true;
        
        if (name && (!items[idx].label || /^makina\s*\d+$/i.test(items[idx].label))) items[idx].label = String(name);
        shrinkDataUrl(dataUrl, scope.cfg.photoMaxPx || 320, function(small) {
          items[idx].image = small || dataUrl;
          archivePhoto(idx);
          scope.persist();
          notify('✓ Foto u vendos në rrumullakun ' + (idx + 1));
        });
      }
      // =====================================================
      // v5.11.0: LOGOT E MARKAVE + GALERIA E FOLDERIT imazhet/
      // - Logoja e markës del VETË në rrathullakun e makinës (pa foto, pa base64)
      // - File-t i qet në ui/modules/apps/CreatorPack/imazhet/ (shih README.txt aty)
      // - Logot: logo_bmw.png / bmw.png  ->  njihen vetë prej emrit
      // - Fotot e tjera: duken në galeri, klik -> shkon në rrathullak
      // =====================================================
      var IMG_DIR = '/ui/modules/apps/CreatorPack/imazhet/';
      var BRAND_ALIAS = { mercedesbenz: 'mercedes', volkswagen: 'vw', chevrolet: 'chevy', alfaromeo: 'alfa' };
      var BRAND_LABEL = {
        bmw: 'BMW', audi: 'Audi', mercedes: 'Mercedes', vw: 'VW', toyota: 'Toyota', nissan: 'Nissan',
        ford: 'Ford', gmc: 'GMC', peugeot: 'Peugeot', volvo: 'Volvo', chevy: 'Chevrolet', dodge: 'Dodge',
        honda: 'Honda', mazda: 'Mazda', subaru: 'Subaru', porsche: 'Porsche', jeep: 'Jeep', tesla: 'Tesla',
        lexus: 'Lexus', hyundai: 'Hyundai', kia: 'Kia', fiat: 'Fiat', renault: 'Renault', citroen: 'Citroën',
        skoda: 'Škoda', seat: 'SEAT', opel: 'Opel', mini: 'MINI', jaguar: 'Jaguar', maserati: 'Maserati',
        ferrari: 'Ferrari', lamborghini: 'Lamborghini', bugatti: 'Bugatti', bentley: 'Bentley', mclaren: 'McLaren',
        lancia: 'Lancia', alfa: 'Alfa Romeo', genesis: 'Genesis', suzuki: 'Suzuki', mitsubishi: 'Mitsubishi',
        cadillac: 'Cadillac', buick: 'Buick', chrysler: 'Chrysler', ram: 'RAM', hummer: 'Hummer', smart: 'Smart',
        rover: 'Rover', scania: 'Scania', man: 'MAN', iveco: 'Iveco', daihatsu: 'Daihatsu', gaz: 'GAZ', vaz: 'VAZ'
      };
      var logoResolved = {};      // v5.11.1: brand -> url ose dataURL (e gatshme)
      var logoTries = {};         // sa here u provu per URL
      var logoBusy = {};          // nje prove osht ne fluturim
      var logoLuaAsked = {};      // sa here e pyetem Lua-n
      var logoFailNote = {};      // arsyeja e fundit (per diagnose)
      var fileDataCache = {};     // v5.11.1: file-i i fotos si base64 (vetem ne memorie)
      var imgDataAsked = {};      // sa here e pyetem Lua-n per nje file te caktuar
      var logoLastTry = {};       // v5.11.3: koha e provimit te fundit (throttle, pa kufi provimesh)
      // v5.11.3: logot e gjetuna nje here ruahen edhe si base64 i vogel ne memorje.
      // Kshtu dalin GJITH HERË: pas ESC, pas rihapjes, edhe kur nderron zip-in e modit.
      angular.forEach(loadLogoArchive(), function (v, k) { logoResolved[k] = v; });
      scope.gallery = [];
      var bundledGallery = [];
      scope.galleryInfo = '';
      scope.galleryState = 'idle'; // idle | loading | ok | err
      scope.brandInfo = null;

      function brandKeyOf(v) { return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, ''); }

      function brandKeysOf(raw) {
        var k = brandKeyOf(raw);
        if (!k) return [];
        var out = [k];
        if (BRAND_ALIAS[k] && out.indexOf(BRAND_ALIAS[k]) < 0) out.push(BRAND_ALIAS[k]);
        angular.forEach(BRAND_ALIAS, function (v, kk) { if (v === k && out.indexOf(kk) < 0) out.push(kk); });
        return out;
      }

      scope.brandLabelOf = function (raw) {
        var k = brandKeyOf(raw);
        if (!k) return '';
        if (BRAND_LABEL[k]) return BRAND_LABEL[k];
        var al = BRAND_ALIAS[k];
        if (al && BRAND_LABEL[al]) return BRAND_LABEL[al];
        return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      };

      // Kerkon file-in e logos: ne galeri (nese u lexu folderi), pastaj me URL te njohura
      function logoFileFromGallery(key) {
        var ks = brandKeysOf(key), best = '';
        (scope.gallery || []).forEach(function (g) {
          var fk = brandKeyOf(String(g.name || '').replace(/\.[a-z0-9]+$/i, ''));
          if (!fk) return;
          for (var i = 0; i < ks.length; i++) {
            var k = ks[i];
            if (fk === 'logo' + k || fk === k) { best = g.url; return; }
            if (!best && (fk.indexOf('logo' + k) === 0 || fk.indexOf(k) === 0)) best = g.url;
          }
        });
        return best;
      }
      function logoCandidatesFor(key) {
        var out = [], ks = brandKeysOf(key);
        var dirs = [IMG_DIR, 'ui/modules/apps/CreatorPack/imazhet/', '/ui/modules/apps/CreatorPack/'];
        ks.forEach(function (k) {
          dirs.forEach(function (d) {
            ['logo_', 'logo-', ''].forEach(function (pre) {
              out.push(d + pre + k + '.png');
              out.push(d + pre + k + '.webp');
              out.push(d + pre + k + '.jpg');
            });
            out.push(d + k + '_logo.png');
          });
        });
        return out;
      }
      // Provon URL-te (e shpejte). Kur deshton, cb(null) -> pastaj kerkojme
      // base64 prej Lua-s (rruga e sigurt, pa varesi prej CEF-it).
      function probeLogoUrl(key, cb) {
        var fromGal = logoFileFromGallery(key);
        if (fromGal) { cb(fromGal); return; }
        var cands = logoCandidatesFor(key), i = 0;
        (function next() {
          if (i >= cands.length) { cb(null); return; }
          var url = cands[i++];
          try {
            var im = new Image();
            im.onload = function () {
              if (im.naturalWidth > 0) cb(url);
              else next();
            };
            im.onerror = function () { next(); };
            im.src = url;
          } catch (e) { next(); }
        })();
      }

      function askLuaLogo(k) {
        if (!k) return;
        if ((logoLuaAsked[k] || 0) >= 3) { logoFailNote[k] = 'lua'; return; }
        logoLuaAsked[k] = (logoLuaAsked[k] || 0) + 1;
        var safe = String(k).replace(/[^a-z0-9]/g, '');
        if (!safe) return;
        var cmd = "if extensions.creatorpack and extensions.creatorpack.pfhudLogoData then extensions.creatorpack.pfhudLogoData('" + safe + "') end";
        var sent = false;
        try {
          if (window.bngApi && typeof window.bngApi.engineLua === 'function') { window.bngApi.engineLua("extensions.load('creatorpack'); " + cmd); sent = true; }
        } catch (e) {}
        if (!sent) engineLua(cmd);
      }

      // Nje prove (ma s'pari URL, pastaj Lua). Deshtimi NUK cache-ohet ma kurrë.
      // v5.11.3: PA kufi provimesh — vetem throttle 2.5s per marke (ma pare
      // pas 16 provimesh ndalte pergjithmone, kshtu nje fillim i ngadalshem
      // e linte rrathullakun pa logo).
      function kickLogo(k, force) {
        if (!k || logoResolved[k] || logoBusy[k]) return;
        var now = new Date().getTime();
        if (!force && (now - (logoLastTry[k] || 0)) < 2500) return;
        logoLastTry[k] = now;
        logoBusy[k] = true;
        logoTries[k] = (logoTries[k] || 0) + 1;
        probeLogoUrl(k, function (url) {
          logoBusy[k] = false;
          if (url) {
            rememberLogo(k, url);            // ruan edhe si base64 (nuk humbet ma)
            logoFailNote[k] = '';
            logoTries[k] = 0;
            writeStateStore();
            try { scope.$applyAsync(); } catch (e) {}
          } else {
            logoFailNote[k] = 'url';
            askLuaLogo(k);
          }
        });
      }

      // v5.11.3: nje foto e folderit kthehet ne base64 (e ruajtur) — kshtu rri
      // edhe nese file-i s'lexohet ma (zip i re, folder i ndryshuar).
      function ensurePhotoData(url, idx) {
        if (!url) return;
        try {
          var it = scope.cfg.items[idx];
          if (!it) return;
          if (String(it.image || '').indexOf('data:image') === 0 && it.image.length > 100) return;
          shrinkAnyImage(url, Number(scope.cfg.photoMaxPx) || 320, function (data) {
            var t = scope.cfg.items[idx];
            if (!t) return;
            if (data) {
              t.image = data;
              try { scope.persist(); } catch (e) {}
              try { scope.$applyAsync(); } catch (e) {}
            } else {
              askLuaImage(url);            // rezervë: prej Lua-s si base64
            }
          });
        } catch (e) { try { askLuaImage(url); } catch (e2) {} }
      }

      function askLuaImage(path) {
        if (!path) return '';
        if ((imgDataAsked[path] || 0) >= 2) return path;
        imgDataAsked[path] = (imgDataAsked[path] || 0) + 1;
        var p = String(path).replace(/[^A-Za-z0-9_\/.:-]/g, '');
        var cmd = "if extensions.creatorpack and extensions.creatorpack.pfhudImageData then extensions.creatorpack.pfhudImageData('" + p + "') end";
        var sent = false;
        try {
          if (window.bngApi && typeof window.bngApi.engineLua === 'function') { window.bngApi.engineLua("extensions.load('creatorpack'); " + cmd); sent = true; }
        } catch (e) {}
        if (!sent) engineLua(cmd);
        return path;
      }

      // Kontrolli i vazhdueshem: thirret prej watcher-it / focus-it / butonit
      function kickAllLogos() {
        touchInstance();
        angular.forEach(scope.cfg.items || [], function (it) {
          if (!it || it.image || !it.brand) return;
          var k = brandKeyOf(it.brand);
          if (k && !logoResolved[k]) kickLogo(k, false);
        });
        angular.forEach(scope.cfg.items || [], function (it) {
          if (it && it.imageFile && !fileDataCache[it.imageFile] && (imgDataAsked[it.imageFile] || 0) < 2) {
            askLuaImage(it.imageFile);
          }
        });
      }

      function applyLogoData(res) {
        try {
          if (!res || !res.brand) return;
          var k = brandKeyOf(res.brand);
          if (!k) return;
          if (res.data && String(res.data).indexOf('data:image') === 0) {
            rememberLogo(k, res.data);
            logoFailNote[k] = '';
            logoTries[k] = 0;
          } else {
            logoFailNote[k] = res.err || 'lua';
          }
          try { scope.$applyAsync(); } catch (e) {}
        } catch (e) {}
      }

      function applyImageData(res) {
        try {
          if (!res || !res.path) return;
          if (!res.data) {
            if (res.err) notify('✗ Fotoja nuk u lexu: ' + res.err);
            return;
          }
          fileDataCache[res.path] = res.data;
          angular.forEach(scope.cfg.items || [], function (it) {
            if (it && it.imageFile === res.path) it.image = res.data;
          });
          try { scope.persist(); } catch (e) {}
          try { scope.$applyAsync(); } catch (e) {}
        } catch (e) {}
      }

      scope.circleLogo = function (item) {
        if (!item || item.image || !item.brand) return '';
        var k = brandKeyOf(item.brand);
        if (!k) return '';
        if (logoResolved[k]) return logoResolved[k];
        kickLogo(k);
        return '';
      };
      scope.circleBadge = function (item) {
        if (!item || item.image || scope.cfg.brandBadge === false) return '';
        if (scope.circleLogo(item)) return '';
        return item.brandLabel || '';
      };
      // v5.11.1: rifreskimi manual (butoni) + diagnostika
      scope.refreshLogos = function (silent) {
        angular.forEach(scope.cfg.items || [], function (it) {
          if (!it || it.image || !it.brand) return;
          var k = brandKeyOf(it.brand);
          if (!k) return;
          logoTries[k] = 0;
          logoLuaAsked[k] = 0;
          logoBusy[k] = false;
          logoLastTry[k] = 0;
          if (!logoResolved[k]) kickLogo(k, true);
        });
        try { if (!silent) notify('🔁 Logot u rikontrolluan — nëse s\'dalin, kontrollo emrat e file-ave'); } catch (e) {}
      };
      scope.logoDiag = function () {
        var items = scope.cfg.items || [], nB = 0, nI = 0, nFile = 0, nOk = 0, nNo = 0, nBadge = 0;
        angular.forEach(items, function (it) {
          if (!it) return;
          if (it.brand) nB++;
          if (it.image) nI++;
          if (it.imageFile) nFile++;
          if (it.brand && !it.image) {
            var k = brandKeyOf(it.brand);
            if (k && logoResolved[k]) nOk++;
            else { nNo++; if (it.brandLabel) nBadge++; }
          }
        });
        var stKB = 0;
        try { stKB = Math.round(String(localStorage.getItem(STATE_KEY) || '').length / 1024); } catch (e) {}
        var nTrash = 0, nBackup = 0;
        try { nTrash = photoCountInArch(trashArchive()); } catch (e) {}
        try { nBackup = photoCountInArch(backupArchive()); } catch (e) {}
        var msg = '🩺 rrathë:' + items.length + ' · marka:' + nB + ' · logo OK:' + nOk + ' · pa logo:' + nNo
                + ' · foto:' + scope.photoCount() + ' · prej folderit:' + nFile
                + ' · galeria:' + (scope.gallery || []).length + ' (provime:' + imgScanTries + ')'
                + ' · kosh:' + nTrash + ' · kopje:' + nBackup
                + ' · logo t\'ruajtura:' + logoArchiveCount() + '/' + logoArchiveKB() + 'KB'
                + (scope.galleryState === 'err' ? ' · ✗ ' + (scope.galleryInfo || '') : '')
                + ' · gjendja:' + scope.bootLoadState + '/' + scope.loadState
                + ' · ' + stKB + 'KB';
        notify(msg);
        try {
          engineLua("if extensions.creatorpack and extensions.creatorpack.pfhudNote then extensions.creatorpack.pfhudNote('DIAG " + String(msg).replace(/'/g, '') + "') end");
        } catch (e) {}
      };
      scope.logoStyle = function (item) {
        var url = scope.circleLogo(item);
        if (!url) return {};
        return { backgroundImage: 'url(' + url + ')', backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: '76%', height: '76%', pointerEvents: 'none' };
      };
      scope.badgeStyle = function () {
        return {
          fontSize: Math.max(10, Math.round(Number(scope.cfg.itemSize || 112) * 0.2)) + 'px',
          color: 'rgba(255,255,255,0.94)', fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase',
          textAlign: 'center', lineHeight: 1.15, padding: '4px 6px', maxWidth: '88%', textShadow: '0 2px 8px rgba(0,0,0,.75)'
        };
      };

      // Vendos logon e makinës ne rrathullak (kur ndërron makinën)
      function applyBrand(info) {
        try {
          if (scope.cfg.brandLogoOn === false) return;
          if (!info || !info.brand) return;
          var items = scope.cfg.items || [], i, t = null;
          if (info.model) {
            for (i = 0; i < items.length; i++) {
              if (items[i] && items[i].imageModel && items[i].imageModel === info.model) { t = items[i]; break; }
            }
          }
          if (!t) {
            var sel = items[scope.selected];
            if (sel && sel.enabled !== false && !sel.image && !sel.noLogo) t = sel;
          }
          if (!t) return;
          t.brand = brandKeyOf(info.brand);
          t.brandLabel = scope.brandLabelOf(info.brand);
          t.brandAuto = true;
          kickLogo(t.brand);
          scope.persist();
          try { scope.$applyAsync(); } catch (e) {}
        } catch (e) {}
      }
      scope.applyLogoToSelected = function () {
        var info = scope.brandInfo;
        if (!info || !info.brand) { notify('ℹ️ Nuk e njoh makinën — hyr në lojë e provo prapë'); return; }
        var t = scope.cfg.items[scope.selected];
        if (!t) return;
        t.brand = brandKeyOf(info.brand);
        t.brandLabel = scope.brandLabelOf(info.brand);
        kickLogo(t.brand);
        scope.persist();
        notify('🏷️ Logo ' + t.brandLabel + ' → rrumullaku ' + (scope.selected + 1));
      };

      // ---- Galeria: manifesti i paketës + skedaret e rinj nga Lua ----
      function mergeGalleryEntries() {
        var out = [], seen = {};
        angular.forEach(arguments, function(list) {
          angular.forEach(list || [], function(g) {
            if (!g || !g.url) return;
            var key = String(g.url).toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            out.push(g);
          });
        });
        return out;
      }

      function applyImageList(res, fromManifest) {
        cancelImageScanWatchdog();
        try { if (imgScanTimer) $timeout.cancel(imgScanTimer); } catch (e) {}
        imgScanTimer = null;
        try {
          if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e) {} }
          if (!res || typeof res !== 'object') { scope.galleryState = 'err'; scope.galleryInfo = 's\'u lexu lista e folderit'; return; }
          if (res.err) {
            scope.galleryState = 'err';
            scope.galleryInfo = 'gabim Lua: ' + res.err;
            scheduleImageScan();
            return;
          }
          var dir = res.dir || IMG_DIR;
          var files = res.files || [];
          if (files.length && typeof files[0] === 'object') {
            var tmp = []; angular.forEach(files, function (v) { if (v) tmp.push(String(v)); }); files = tmp;
          }
          if (typeof files.forEach !== 'function') {
            var tmp2 = [];
            angular.forEach(files, function (v) { if (v) tmp2.push(String(v)); });
            files = tmp2;
          }
          var out = [];
          files.forEach(function (f) {
            var str = String(f);
            var url = (str.charAt(0) === '/') ? str : (dir + str);
            var name = str.split('/').pop();
            if (!/\.(png|jpe?g|webp)$/i.test(name)) return;
            out.push({ name: name, url: url });
          });
          if (fromManifest) {
            bundledGallery = out;
            out = mergeGalleryEntries(bundledGallery, scope.gallery);
          } else {
            out = mergeGalleryEntries(bundledGallery, out);
          }
          scope.gallery = out;
          scope.galleryState = out.length ? 'ok' : 'err';
          scope.galleryInfo = out.length ? (out.length + ' imazhe në folder · ' + dir)
                                         : ('pa imazhe — vendosi file-at te ' + dir);
          if (out.length) { imgScanTries = 0; }
          else { scheduleImageScan(); }        // v5.11.2: provo prapë (lista s'osht e sigurt)
          // v5.11.1: mos i harro logot e gjetuna — vetem rikontrollo ato qe mungojne
          logoTries = {}; logoLuaAsked = {}; logoBusy = {};
          try { scope.$applyAsync(); } catch (e) {}
        } catch (e) {
          scope.galleryState = 'err';
          scope.galleryInfo = 'gabim: ' + ((e && e.message) || '');
        }
      }
      var imgScanTries = 0, imgScanTimer = null, imgScanWatchdog = null;
      function cancelImageScanWatchdog() {
        if (!imgScanWatchdog) return;
        try { $timeout.cancel(imgScanWatchdog); } catch (e) {}
        imgScanWatchdog = null;
      }
      function scheduleImageScan() {
        if (imgScanTries >= 12) return;               // ~2 minuta provime
        imgScanTries++;
        try { if (imgScanTimer) $timeout.cancel(imgScanTimer); } catch (e) {}
        try {
          imgScanTimer = $timeout(function () {
            imgScanTimer = null;
            try { scope.scanImages(true); } catch (e) {}
          }, 6000);
        } catch (e) {}
      }
      scope.scanImages = function (auto) {
        if (!auto) {
          imgScanTries = 0;
          try { if (imgScanTimer) $timeout.cancel(imgScanTimer); } catch (e) {}
          imgScanTimer = null;
          try { scope.refreshLogos(true); } catch (e) {}
        }
        cancelImageScanWatchdog();
        scope.galleryState = 'loading';
        scope.galleryInfo = 'duke lexu folderin…';
        // Never leave the gallery in an endless loading state when the Lua
        // extension is unavailable or a CEF callback is dropped.
        imgScanWatchdog = $timeout(function () {
          imgScanWatchdog = null;
          if (scope.galleryState !== 'loading') return;
          scope.galleryState = 'err';
          scope.galleryInfo = 'leximi nuk u përgjigj — provo Rifresko ose rihap panelin';
          scheduleImageScan();
        }, 8000);
        var sent = false;
        try {
          if (window.bngApi && typeof window.bngApi.engineLua === 'function') {
            window.bngApi.engineLua("extensions.load('creatorpack'); extensions.creatorpack.pfhudListImages()", function (res) {
              scope.$applyAsync(function () { applyImageList(res); });
            });
            sent = true;
          }
        } catch (e) {}
        if (!sent) { engineLua("extensions.creatorpack.pfhudListImages()"); }
      };
      // Every image shipped in imazhet/ appears immediately, even if the
      // BeamNG FS bridge is late or unavailable. Lua scans can still add new files.
      function loadBundledGallery() {
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', '/ui/modules/apps/CreatorPack/gallery.json', true);
          xhr.onload = function() {
            if (xhr.status !== 200 && xhr.status !== 0) return;
            var res = null;
            try { res = JSON.parse(xhr.responseText); } catch (e) {}
            if (!res) return;
            scope.$applyAsync(function() { applyImageList(res, true); });
          };
          xhr.send();
        } catch (e) {}
      }

      scope.useGalleryImage = function (g) {
        if (!g || !g.url) return;
        var idx = Number(scope.selected) || 0;
        imageTargetIndex = idx;                              // shkon ATY ku e ke zgjedh
        placeCircleImage(g.url, String(g.name || '').replace(/\.[a-z0-9]+$/i, ''));
        var it = scope.cfg.items[idx];
        if (it) {
          it.imageFile = g.url;                             // v5.11.1: rruga e file-it ruahet
          if (fileDataCache[g.url]) it.image = fileDataCache[g.url];
          else ensurePhotoData(g.url, idx);                 // v5.11.3: base64 i ruajtur
          scope.persist();
        }
      };

      var unsubVehicle = $rootScope.$on('creatorpack.vehicle', function (e, data) {
        scope.$applyAsync(function () {
          scope.brandInfo = data || null;
          applyBrand(data);
        });
      });
      var unsubImages = $rootScope.$on('creatorpack.images', function (e, data) {
        scope.$applyAsync(function () { applyImageList(data); });
      });
      // v5.11.1: te dhenat (base64) prej Lua-s — rruga e sigurt
      var unsubLogoData = $rootScope.$on('creatorpack.logodata', function (e, data) {
        scope.$applyAsync(function () { applyLogoData(data); });
      });
      var unsubImageData = $rootScope.$on('creatorpack.imagedata', function (e, data) {
        scope.$applyAsync(function () { applyImageData(data); });
      });

      // v5.11.1: KONTROLLUESI — logot rikontrollohen vetë (edhe pas kthimit prej menusë)
      var logoWatchTimer = null;
      try {
        logoWatchTimer = setInterval(function () {
          try { kickAllLogos(); } catch (e) {}
          try { if (scope.$root && !scope.$root.$$phase) scope.$applyAsync(); } catch (e) {}
        }, 4000);
      } catch (e) {}
      try {
        $window.addEventListener('focus', function () {
          try { reapplyStoredBrands(); } catch (e) {}
          try { kickAllLogos(); } catch (e) {}
        });
        var docEl = ($document && $document[0]) ? $document[0] : null;
        if (docEl && docEl.addEventListener) {
          docEl.addEventListener('visibilitychange', function () {
            try {
              if (!docEl.hidden) {
                reapplyStoredBrands();
                kickAllLogos();
                try { scope.scanImages(true); } catch (e) {}
                engineLua("if extensions.creatorpack and extensions.creatorpack.pfhudVehicle then extensions.creatorpack.pfhudVehicle() end");
                scope.persist();
              }
            } catch (e) {}
          });
        }
      } catch (e) {}

      scope.$on('$destroy', function(){
        try { unsubVehicle(); unsubImages(); unsubLogoData(); unsubImageData(); } catch (e) {}
        try { if (logoWatchTimer) clearInterval(logoWatchTimer); } catch (e) {}
        try { delete $window.__pfHudOwners[INSTANCE_ID]; } catch (e) {}
      });
      var unsubPfhudAction = $rootScope.$on('pfhud.action', function(e, data) {
        if (!data || !data.action) return;
        if (data.action === 'pass') scope.markState('pass');
        else if (data.action === 'fail') scope.markState('fail');
        else if (data.action === 'next') scope.next();
        else if (data.action === 'prev') scope.prev();
        else if (data.action === 'reset') scope.resetStates();
        else if (data.action === 'togglePanel') scope.togglePanel();
        // v2.1: veprime te reja nga bindings-at
        else if (data.action === 'undo') scope.undo();
        else if (data.action === 'toggleGuides') {
          scope.cfg.guidesOn = !scope.cfg.guidesOn;
          scope.persist();
        }
        // v5.1: ON/OFF i rrumullakateve nga bindings (Options -> Controls)
        else if (data.action === 'toggleVehicles') scope.toggleVehicles();
        else if (data.action === 'toggleShorts') scope.toggleShorts();
        scope.$applyAsync();
      });

      function isTypingTarget(target) {
        if (!target) return false;
        var tag = (target.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
      }

      function keyMatches(e, configured) {
        if (!configured) return false;
        var conf = String(configured).trim().toLowerCase();
        if (!conf) return false;

        var key = String(e.key || '').trim().toLowerCase();
        var code = String(e.code || '').trim().toLowerCase();
        var keyCode = e.keyCode || e.which;

        if (conf === key || conf === code) return true;

        if (conf.length === 1) {
          if (key === conf) return true;
          if (code === ('key' + conf)) return true;
          if (keyCode && String.fromCharCode(keyCode).toLowerCase() === conf) return true;
        }

        if (conf === 'arrowleft') return key === 'arrowleft' || code === 'arrowleft' || keyCode === 37;
        if (conf === 'arrowright') return key === 'arrowright' || code === 'arrowright' || keyCode === 39;
        if (conf === 'arrowup') return key === 'arrowup' || code === 'arrowup' || keyCode === 38;
        if (conf === 'arrowdown') return key === 'arrowdown' || code === 'arrowdown' || keyCode === 40;
        if (conf === 'pageup' || conf === 'pgup') return key === 'pageup' || code === 'pageup' || keyCode === 33;
        if (conf === 'pagedown' || conf === 'pgdn' || conf === 'pgdown') return key === 'pagedown' || code === 'pagedown' || keyCode === 34;
        if (conf === 'numpad4' || conf === 'num4') return key === '4' || code === 'numpad4' || keyCode === 100;
        if (conf === 'numpad6' || conf === 'num6') return key === '6' || code === 'numpad6' || keyCode === 102;

        return false;
      }

      function handleHotkey(e) {
        if (!scope.cfg.useHotkeys) return;
        if (isTypingTarget(e.target)) return;

        var handled = false;

          // Ctrl+Z = Undo
        if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'z') {
          scope.$applyAsync(function(){ scope.undo(); });
          e.preventDefault();
          e.stopPropagation();
          return false;
        }

        if (keyMatches(e, scope.cfg.togglePanelKey)) {
          scope.$applyAsync(function(){ scope.togglePanel(); });
          handled = true;
        } else if (keyMatches(e, scope.cfg.vehiclesKey)) {
          scope.$applyAsync(function(){ scope.toggleVehicles(); });
          handled = true;
        } else if (keyMatches(e, scope.cfg.passKey)) {
          scope.$applyAsync(function(){ scope.markState('pass'); });
          handled = true;
        } else if (keyMatches(e, scope.cfg.failKey)) {
          scope.$applyAsync(function(){ scope.markState('fail'); });
          handled = true;
        } else if (keyMatches(e, 'PageDown') || keyMatches(e, 'Numpad6') || keyMatches(e, scope.cfg.nextKey)) {
          scope.$applyAsync(function(){ scope.next(); });
          handled = true;
        } else if (keyMatches(e, 'PageUp') || keyMatches(e, 'Numpad4') || keyMatches(e, scope.cfg.prevKey)) {
          scope.$applyAsync(function(){ scope.prev(); });
          handled = true;
        } else if (keyMatches(e, scope.cfg.resetKey)) {
          scope.$applyAsync(function(){ scope.resetStates(); });
          handled = true;
        }

        if (handled) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }

      // FIX v2.0: me pare i njejti handler ishte i lidhur me keydown + keyup +
      // keypress njekohesisht, ne 3 target-e (node, $document, $window). Nje
      // shtypje e vetme e tastit e thirrte handler-in 2-3 here, keq per 'next'
      // (kercente 2 pozicione) dhe per markimet. Tani: VETEM keydown, dhe
      // vetem ne $document (qe i kap edhe eventet nga node-i permes bubbling).
      var node = element && element[0] ? element[0] : null;
      // v3.1.2: tastet dështonin sepse handler-i ishte VETËM në $document.
      // Kur fokusi shkon te canvas-i i lojës (pas rinisjes, ose pasi klikon
      // në botë), dokumenti i UI-së nuk i merr më eventet. Tani dëgjojmë në
      // document, window DHE në vetë node-in, me capture=true, dhe mbrohemi
      // nga dublikimi me një vulë kohore për event.
      var lastHotkeyStamp = 0;
      function hotkeyEntry(e) {
        var stamp = e.timeStamp || Date.now();
        if (stamp === lastHotkeyStamp) return;   // i njejti event nga 2 target-e
        lastHotkeyStamp = stamp;
        return handleHotkey(e);
      }

      $document.on('keydown', hotkeyEntry);
      try { $window.addEventListener('keydown', hotkeyEntry, true); } catch (e) {}
      try { if (node) node.addEventListener('keydown', hotkeyEntry, true); } catch (e) {}

      // Mbaj fokusin te UI-ja: bëje node-in të fokusueshëm dhe rimerre fokusin
      // sa herë përdoruesi prek HUD-in ose panelin.
      $timeout(function() {
        try {
          if (node) {
            node.setAttribute('tabindex', '0');
            node.addEventListener('mousedown', function() {
              try { node.focus({ preventScroll: true }); } catch (x) {}
            }, true);
          }
        } catch (e) {}
      }, 250);

      scope.$on('$destroy', function() {
        try { scope.persist(); } catch (e) {}     // v5.10.2: rua fotot para se me u mbyll modi
        try { writeStateStore(); writeBackup(); } catch (e) {}   // v5.11.1: markat gjith herë
        if (fxTimer) { try { $timeout.cancel(fxTimer); } catch (e) {} }
        if (unsubPfhudAction) unsubPfhudAction();
        $document.off('keydown', hotkeyEntry);
        try { $window.removeEventListener('keydown', hotkeyEntry, true); } catch (e) {}
        try { if (node) node.removeEventListener('keydown', hotkeyEntry, true); } catch (e) {}
        $window.removeEventListener('resize', onResize);
        $document.off('click', onDocClickPicker);
        try { if (pfAudioState.ctx && pfAudioState.ctx.close) pfAudioState.ctx.close(); } catch (e) {}
        cancelImageScanWatchdog();
        try { if (imgScanTimer) $timeout.cancel(imgScanTimer); } catch (e) {}
      });

      // =====================================================
      // v5.10.2: RUAJTJA E FOTOVE — garanci qe s'humbe kur mbyllet loja
      // =====================================================
      try {
        scope.photoSavedKB = Math.round(JSON.stringify(cleanArchive()).length / 1024);
      } catch (e) {}
      if (scope.cfg.shortsMode) {
        $timeout(function() { scope.setShortsMode(true); }, 0);
      }
      // rua nje here pas nisjes (i shkruan fotot qe jon ne memorje)
      $timeout(function() {
        try { savePhotos(); } catch (e) {}
        try { writeStateStore(); } catch (e) {}
        try { writeBackup(); } catch (e) {}
      }, 1200);
      // Show the complete bundled gallery immediately; Lua adds newly copied files.
      try { loadBundledGallery(); } catch (e) {}
      // v5.11.0: lexo folderin imazhet/ + markën e makinës aktuale
      $timeout(function() { try { scope.scanImages(); } catch (e) {} }, 1800);
      // Load Lua immediately so vehicle switches and gallery images work even
      // when the user never touches a Pass/Fail keybinding.
      try { engineLua("if extensions.creatorpack and extensions.creatorpack.pfhudVehicle then extensions.creatorpack.pfhudVehicle() end"); } catch (e) {}
      // rua edhe kur mbyllet faqja / loja (para se me u shkyç CEF-i)
      try {
        $window.addEventListener('beforeunload', function() {
          try { (scope.cfg.items || []).forEach(function(x, i) { if (x && x.image) archivePhoto(i); }); } catch (e) {}
          try { localStorage.setItem(PHOTO_KEY, JSON.stringify(cleanArchive())); } catch (e) {}
          try { scope.persist(); } catch (e) {}
        });
      } catch (e) {}
      // v5.11.2: njofto nese fotot u gjeten prej KOSHIT/kopjes se sigurt
      if (scope.recoveredPhotos > 0) {
        $timeout(function() {
          notify('♻️ U gjetën ' + scope.recoveredPhotos + ' foto prej kopjes së sigurt — u rikthyen në rrathë! (nëse s\'i do: "🗑️ Fshi fotot")');
        }, 2600);
      }
      // v5.11.1: rruga e logove nis menjeherë (pa prit me u hap paneli)
      $timeout(function() { try { reapplyStoredBrands(); } catch (e) {} try { kickAllLogos(); } catch (e) {} }, 2200);
      // v5.11.1: njofto nese konfigurimi i vjetër s'u lexu e u rikthye prej kopjes
      if (scope.bootLoadState === 'repaired') {
        $timeout(function() {
          notify('♻️ Konfigurimi i vjetër ishte dëmtu — u rikthye prej kopjes së sigurt (logot e fotot u ruajtën)');
        }, 2500);
      } else if (scope.bootLoadState === 'corrupt') {
        $timeout(function() {
          notify('⚠️ Konfigurimi s\'u lexu — u nis prej zeros, por logot/fotot u rikthyen prej mini-ruajtjes');
        }, 2500);
      }
      // njofto nese fotot u rikthyen (kjo osht prova qe nuk humbin)
      if (scope.restoredPhotos > 0) {
        $timeout(function() {
          notify('♻️ U rikthyen ' + scope.restoredPhotos + ' foto nga sesioni i kaluar — nuk humbin kur mbyllet loja');
        }, 2500);
      }
    }
  };
}]);
