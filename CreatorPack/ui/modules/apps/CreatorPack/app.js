
angular.module('beamng.apps')

// v6.3.0: "Ngarko nga kompjuteri" — <input type="file" cp-file-pick="fn($files)">.
// Klikimi bie direkt mbi input-in (jo .click() programatik), siç e do CEF-i.
.directive('cpFilePick', function() {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      element.on('change', function(evt) {
        var input = evt.target, list = [];
        for (var i = 0; input && input.files && i < input.files.length; i++) list.push(input.files[i]);
        scope.$applyAsync(function() { scope.$eval(attrs.cpFilePick, { $files: list }); });
        try { input.value = ''; } catch (e) {}            // e njëjta foto mund të zgjidhet prapë
      });
    }
  };
})

// v6.3.0: miniaturat e galerisë — nëse CEF-i s'e hap URL-në, kërkohet nga Lua.
.directive('cpImgEvents', function() {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      element.on('error', function() {
        if (attrs.cpImgError) scope.$applyAsync(function() { scope.$eval(attrs.cpImgError); });
      });
      element.on('load', function() {
        if (attrs.cpImgLoad) scope.$applyAsync(function() { scope.$eval(attrs.cpImgLoad); });
      });
    }
  };
})

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
      var MOD_VERSION = '6.3.0';
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
          series6Mode: false,
          seriesPreset: 'bmw',
          seriesView: 'shorts',       // shorts = safe-box 9:16 | full = gjithë ekrani
          seriesOffsetX: 0,
          seriesOffsetY: 0,
          seriesLayoutVersion: 2,
          seriesGap: 14,
          seriesCarScale: 100,
          seriesSlotX: [0, 0, 0, 0, 0, 0],
          seriesSlotScale: [100, 100, 100, 100, 100, 100],
          seriesMarkAuto: true,
          seriesMarkScale: 100,
          seriesTitleSize: 100,
          seriesTitleOutline: 2.5,
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
        if (cfg.series6Mode == null) cfg.series6Mode = false;
        if (!cfg.seriesPreset) cfg.seriesPreset = 'bmw';
        if (cfg.seriesView !== 'full') cfg.seriesView = 'shorts';
        if (cfg.seriesOffsetX == null) cfg.seriesOffsetX = 0;
        if (cfg.seriesOffsetY == null) cfg.seriesOffsetY = 0;
        if (saved && Number(saved.seriesLayoutVersion) !== 2) cfg.seriesGap = 14;
        cfg.seriesLayoutVersion = 2;
        if (cfg.seriesGap == null) cfg.seriesGap = 14;
        if (cfg.seriesCarScale == null) cfg.seriesCarScale = 100;
        if (!angular.isArray(cfg.seriesSlotX)) cfg.seriesSlotX = [0, 0, 0, 0, 0, 0];
        if (!angular.isArray(cfg.seriesSlotScale)) cfg.seriesSlotScale = [100, 100, 100, 100, 100, 100];
        if (cfg.seriesMarkAuto == null) cfg.seriesMarkAuto = true;
        if (cfg.seriesMarkScale == null) cfg.seriesMarkScale = 100;
        if (cfg.seriesTitleSize == null) cfg.seriesTitleSize = 100;
        if (cfg.seriesTitleOutline == null) cfg.seriesTitleOutline = 2.5;
        if (cfg.series6Mode) cfg.shortsMode = true;
        cfg.seriesGap = Math.max(-24, Math.min(36, Number(cfg.seriesGap) || 0));
        cfg.seriesCarScale = Math.max(70, Math.min(130, Number(cfg.seriesCarScale) || 100));
        for (var seriesIdx = 0; seriesIdx < 6; seriesIdx++) {
          cfg.seriesSlotX[seriesIdx] = Math.max(-60, Math.min(60, Number(cfg.seriesSlotX[seriesIdx]) || 0));
          cfg.seriesSlotScale[seriesIdx] = Math.max(70, Math.min(130, Number(cfg.seriesSlotScale[seriesIdx]) || 100));
        }
        cfg.seriesOffsetX = Math.max(-600, Math.min(600, Number(cfg.seriesOffsetX) || 0));
        cfg.seriesOffsetY = Math.max(-500, Math.min(500, Number(cfg.seriesOffsetY) || 0));
        cfg.seriesMarkAuto = !(cfg.seriesMarkAuto === false || cfg.seriesMarkAuto === 'false');
        cfg.seriesMarkScale = Math.max(50, Math.min(200, Number(cfg.seriesMarkScale) || 100));
        cfg.seriesTitleSize = Math.max(70, Math.min(140, Number(cfg.seriesTitleSize) || 100));
        cfg.seriesTitleOutline = Math.max(0, Math.min(5, Number(cfg.seriesTitleOutline) || 0));
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
          // v6.3.0: edhe base64 nga Lua zvogëlohet në 160 px para ruajtjes
          shrinkAnyImage(src, 160, function (small) {
            if (small) { logoResolved[key] = small; saveLogoArchive(); try { scope.$applyAsync(); } catch (e) {} }
            else if (String(src).indexOf('data:image') === 0 && String(src).length < 300000) saveLogoArchive();
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

      var SERIES6_VARIANTS = [
        { key:'tiny',   label:'TINY CAR',   short:'TINY',   color:'#f4df28', scale:0.46 },
        { key:'small',  label:'SMALL CAR',  short:'SMALL',  color:'#3978f6', scale:0.58 },
        { key:'medium', label:'MEDIUM CAR', short:'MEDIUM', color:'#ff8a32', scale:0.70 },
        { key:'normal', label:'NORMAL CAR', short:'NORMAL', color:'#f04444', scale:0.82 },
        { key:'big',    label:'BIG CAR',    short:'BIG',    color:'#58d83e', scale:0.94 },
        { key:'giant',  label:'GIANT CAR',  short:'GIANT',  color:'#f45bd5', scale:1.06 }
      ];
      function makeSeriesPreset(id, name, ratio) {
        return {
          id:id, name:name, ratio:ratio,
          slots:SERIES6_VARIANTS.map(function(variant) {
            return {
              label:variant.label, short:variant.short, color:variant.color,
              scale:variant.scale, ratio:ratio,
              image:'/ui/modules/apps/CreatorPack/series/' + id + '_' + variant.key + '.png'
            };
          })
        };
      }
      var SERIES6_PRESETS = [
        makeSeriesPreset('bmw', 'BMW', 0.6891),
        makeSeriesPreset('toyota_lc300', 'Toyota LC300', 0.8609),
        makeSeriesPreset('mcqueen', 'Lightning McQueen', 0.6188),
        makeSeriesPreset('gclass', 'Mercedes G-Class', 0.8797),
        makeSeriesPreset('lamborghini', 'Lamborghini Huracán', 0.5531),
        makeSeriesPreset('gtr_r34', 'Nissan GT-R R34', 0.7594),
        makeSeriesPreset('supra', 'Toyota Supra MK4', 0.6234),
        makeSeriesPreset('mustang', 'Ford Mustang GT', 0.6969),
        makeSeriesPreset('jeep', 'Jeep Wrangler', 0.9391),
        makeSeriesPreset('semi_truck', 'Semi Truck', 0.9703)
      ];
      scope.seriesPresets = SERIES6_PRESETS;
      function seriesPresetById(id) {
        for (var i = 0; i < SERIES6_PRESETS.length; i++) {
          if (SERIES6_PRESETS[i].id === id) return SERIES6_PRESETS[i];
        }
        return SERIES6_PRESETS[0];
      }
      scope.cfg.seriesPreset = seriesPresetById(scope.cfg.seriesPreset).id;
      scope.seriesSlots = seriesPresetById(scope.cfg.seriesPreset).slots;
      scope.seriesPresetName = function() { return seriesPresetById(scope.cfg.seriesPreset).name; };
      scope.seriesActiveTitle = function() {
        var idx = Math.max(0, Math.min(5, Number(scope.selected) || 0));
        return scope.seriesSlots[idx] ? scope.seriesSlots[idx].label : '';
      };

      // Shorts përdor safe-box-in 9:16; Full Size përdor realisht gjithë viewport-in.
      scope.seriesCanvas = function() {
        if (scope.cfg.seriesView === 'full') {
          return { w:scope.viewport.w, h:scope.viewport.h, left:0, top:0,
                   cx:scope.viewport.w / 2, cy:scope.viewport.h / 2 };
        }
        return scope.safeBox();
      };
      function seriesGapValue() {
        return Math.max(-24, Math.min(36, Number(scope.cfg.seriesGap) || 0));
      }
      function seriesUnit() {
        var canvas = scope.seriesCanvas();
        if (scope.cfg.seriesView === 'full') {
          // Shuma 0.46+0.58+0.70+0.82+0.94+1.06 = 4.56.
          // Me scale 100%, gjerësia e veturave + 5 hapësirat mbushin saktë ekranin.
          return Math.max(60, canvas.w - 5 * seriesGapValue()) / 4.56;
        }
        return canvas.w / 6;
      }
      scope.seriesHudStyle = function() {
        return {
          left:(Number(scope.cfg.positionX || 0) + Number(scope.cfg.seriesOffsetX || 0)) + 'px',
          top:(Number(scope.cfg.positionY || 0) + Number(scope.cfg.seriesOffsetY || 0)) + 'px',
          width:scope.seriesCanvas().w + 'px'
        };
      };
      function seriesCarWidth(index) {
        var slot = scope.seriesSlots[index] || scope.seriesSlots[0];
        var globalScale = Math.max(70, Math.min(130, Number(scope.cfg.seriesCarScale) || 100)) / 100;
        var ownScale = Math.max(70, Math.min(130, Number(scope.cfg.seriesSlotScale[index]) || 100)) / 100;
        return Math.round(seriesUnit() * Number(slot.scale || 1) * globalScale * ownScale);
      }
      function seriesCarHeight(index) {
        var slot = scope.seriesSlots[index] || scope.seriesSlots[0];
        return Math.round(seriesCarWidth(index) * Number(slot.ratio || 0.70));
      }
      scope.seriesSlotStyle = function(index) {
        var gap = seriesGapValue();
        var offsetX = Math.max(-60, Math.min(60, Number(scope.cfg.seriesSlotX[index]) || 0));
        return {
          width:seriesCarWidth(index) + 'px',
          height:seriesCarHeight(index) + 'px',
          marginLeft:index > 0 ? gap + 'px' : '0px',
          transform:'translateX(' + offsetX + 'px)'
        };
      };
      scope.seriesImageStyle = function(slot, index) {
        if (index === undefined || index === null) index = scope.seriesSlots.indexOf(slot);
        if (index < 0) index = 0;
        return { width:seriesCarWidth(index) + 'px' };
      };
      function seriesAutoMarkRatio(index) {
        var slot = scope.seriesSlots[index] || scope.seriesSlots[0];
        var progress = (Number(slot.scale || 0.46) - 0.46) / 0.60;
        progress = Math.max(0, Math.min(1, progress));
        // Kurvë jo-lineare: TINY 40% e gjerësisë (më pak se 62% e vjetër),
        // BIG rritet gradualisht dhe GIANT arrin 82% (më shumë se 62% e vjetër).
        return 0.40 + 0.42 * Math.pow(progress, 1.35);
      }
      scope.seriesMarkStyle = function(index) {
        if (index === undefined || index === null) index = 0;
        var glow = Math.max(0, Math.min(30, Number(scope.cfg.markGlow) || 0));
        var outline = Math.max(0, Math.min(4, Number(scope.cfg.markOutline) || 0));
        var manualScale = Math.max(50, Math.min(200, Number(scope.cfg.seriesMarkScale) || 100)) / 100;
        var autoBase = scope.cfg.seriesMarkAuto ? seriesCarWidth(index) : seriesUnit();
        var fitRatio = scope.cfg.seriesMarkAuto ? seriesAutoMarkRatio(index) : 0.62;
        return {
          fontSize:Math.max(12, Math.round(autoBase * fitRatio * manualScale)) + 'px',
          textShadow:glow > 0 ? ('0 0 ' + glow + 'px currentColor') : 'none',
          filter:glow > 0 ? ('drop-shadow(0 0 ' + glow + 'px currentColor)') : 'none',
          WebkitTextStroke:outline > 0 ? (outline + 'px rgba(0,0,0,.88)') : '0px transparent',
          paintOrder:'stroke fill'
        };
      };
      scope.seriesMarkSvgOutline = function(index) {
        var fontSize = parseFloat(scope.seriesMarkStyle(index).fontSize) || 12;
        var outline = Math.max(0, Math.min(4, Number(scope.cfg.markOutline) || 0));
        return { strokeWidth:outline > 0 ? String(15 + 200 * outline / fontSize) : '0', opacity:outline > 0 ? 1 : 0 };
      };
      scope.seriesTitleStyle = function() {
        var scale = Math.max(70, Math.min(140, Number(scope.cfg.seriesTitleSize) || 100)) / 100;
        var outline = Math.max(0, Math.min(5, Number(scope.cfg.seriesTitleOutline) || 0));
        var canvas = scope.seriesCanvas();
        var base = Math.min(canvas.w * 0.056, canvas.h * 0.065);
        return {
          fontSize:Math.max(22, Math.round(base * scale)) + 'px',
          WebkitTextStroke:outline > 0 ? (outline + 'px rgba(0,0,0,.96)') : '0px transparent',
          paintOrder:'stroke fill',
          textShadow:'none'
        };
      };
      function seriesContentHeight() {
        var maxCar = 0;
        for (var i = 0; i < 6; i++) maxCar = Math.max(maxCar, seriesCarHeight(i));
        return maxCar + parseFloat(scope.seriesTitleStyle().fontSize) * 1.16;
      }
      var seriesAnchor = 'top';
      scope.resetSeriesSelected = function() {
        var idx = Math.max(0, Math.min(5, Number(scope.selected) || 0));
        scope.cfg.seriesSlotX[idx] = 0;
        scope.cfg.seriesSlotScale[idx] = 100;
        scope.persist();
      };
      scope.resetSeriesPosition = function() {
        scope.cfg.seriesOffsetX = 0;
        scope.cfg.seriesOffsetY = 0;
        scope.persist();
      };
      scope.setSeriesView = function(view) {
        scope.cfg.seriesView = view === 'full' ? 'full' : 'shorts';
        scope.seriesPlace(seriesAnchor);
        scope.persist();
      };
      scope.resetSeriesAppearance = function() {
        scope.cfg.seriesGap = 14;
        scope.cfg.seriesCarScale = 100;
        scope.cfg.seriesSlotX = [0, 0, 0, 0, 0, 0];
        scope.cfg.seriesSlotScale = [100, 100, 100, 100, 100, 100];
        scope.cfg.seriesOffsetX = 0;
        scope.cfg.seriesOffsetY = 0;
        scope.cfg.seriesMarkAuto = true;
        scope.cfg.seriesMarkScale = 100;
        scope.cfg.seriesTitleSize = 100;
        scope.cfg.seriesTitleOutline = 2.5;
        scope.persist();
      };

      scope.circleVisible = function(index) {
        if (scope.cfg.series6Mode) return index < 6;
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

      scope.seriesPlace = function(where) {
        if (!scope.cfg.series6Mode) return;
        measureViewport();
        seriesAnchor = where === 'bottom' || where === 'center' ? where : 'top';
        var b = scope.seriesCanvas();
        var h = seriesContentHeight();
        scope.cfg.positionX = Math.max(0, Math.round(b.left));
        if (seriesAnchor === 'bottom') {
          scope.cfg.positionY = scope.cfg.seriesView === 'full'
            ? Math.round(b.top + b.h - h - Math.max(24, b.h * 0.05))
            : Math.round(b.top + b.h * 0.74 - h);
        } else if (seriesAnchor === 'center') {
          scope.cfg.positionY = Math.round(b.cy - h / 2 - (scope.cfg.seriesView === 'full' ? 0 : b.h * 0.06));
        } else {
          scope.cfg.positionY = Math.round(b.top + b.h * 0.035);
        }
        scope.cfg.positionY = Math.max(0, scope.cfg.positionY);
        scope.persist();
      };

      scope.shortsPlace = function(where) {
        if (scope.cfg.series6Mode) { scope.seriesPlace(where); return; }
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

      function ensureSeriesItems() {
        while (scope.cfg.items.length < 6) {
          var it = defaultItems(1)[0];
          it.label = 'Makina ' + (scope.cfg.items.length + 1);
          scope.cfg.items.push(it);
        }
        for (var i = 0; i < 6; i++) scope.cfg.items[i].enabled = true;
        if (scope.selected > 5) scope.selected = 5;
        scope.cfg.currentIndex = scope.selected;
      }

      function enforceShortsComposition() {
        if (!scope.cfg.shortsMode) return;
        scope.cfg.vehiclesOn = true;
        scope.cfg.showArrows = false;
        scope.cfg.guideRatio = '9:16';
        if (scope.cfg.series6Mode) {
          scope.cfg.layout = 'row';
          ensureSeriesItems();
          return;
        }
        scope.cfg.layout = 'grid';
        scope.cfg.gridCols = 2;
        ensureFourCircles();
      }

      scope.setShortsMode = function(enabled) {
        enabled = enabled === true || enabled === 'true';
        if (enabled) {
          scope.cfg.series6Mode = false;
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
          scope.cfg.series6Mode = false;
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
      scope.setSeriesPreset = function(id) {
        var preset = seriesPresetById(id);
        scope.cfg.seriesPreset = preset.id;
        scope.seriesSlots = preset.slots;
        if (scope.cfg.series6Mode) scope.seriesPlace(seriesAnchor);
        scope.persist();
      };
      scope.setSeries6Mode = function(enabled) {
        enabled = enabled === true || enabled === 'true';
        if (enabled) {
          if (!scope.cfg.shortsMode || !scope.cfg.shortsRestore) scope.setShortsMode(true);
          scope.cfg.shortsMode = true;
          scope.cfg.series6Mode = true;
          scope.cfg.seriesPreset = seriesPresetById(scope.cfg.seriesPreset).id;
          scope.seriesSlots = seriesPresetById(scope.cfg.seriesPreset).slots;
          if (scope.selected > 5) scope.selected = 0;
          enforceShortsComposition();
          scope.seriesPlace('top');
          scope.$evalAsync(function() {
            if (scope.cfg.series6Mode) scope.seriesPlace('top');
          });
        } else {
          scope.cfg.series6Mode = false;
          scope.setShortsMode(true);
        }
        scope.persist();
      };
      scope.toggleSeries6 = function() { scope.setSeries6Mode(!scope.cfg.series6Mode); };
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
          backgroundImage: item.image ? cssUrl(displaySrc(item.image)) : 'none',
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

      // v6.3.0: tab-i mbahet në një OBJEKT (ui.tab). Paneli është brenda ng-if dhe
      // rrathët brenda ng-repeat: me një variabël të thjeshtë "tab", butoni
      // "Zgjidh foto nga galeria" ndryshonte vetëm një kopje lokale dhe galeria
      // nuk hapej kurrë. Me ui.tab të gjithë butonat ndryshojnë të njëjtin tab.
      scope.ui = { tab: 'kryesore' };
      scope.setTab = function(t) {
        scope.ui.tab = String(t || 'kryesore');
        if (scope.ui.tab === 'fotot') { try { scope.scanImages(true); } catch (e) {} }
      };
      // Rrethet → "Zgjidh foto nga galeria": zgjedh rrethin dhe hap galerinë.
      scope.openGalleryFor = function(i) {
        scope.select(i);
        scope.setTab('fotot');
      };

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
          scope.cfg.vehiclesOn = true;
          notify(scope.cfg.series6Mode ?
            'Series 6 përdor gjithmonë 6 variante. Çaktivizo Series për HUD-in standard.' :
            'Shorts përdor gjithmonë 4 rrethe. Fike Shorts për të fshehur HUD-in.');
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
        'shortsSafeAreas','seriesPreset','seriesView','seriesOffsetX','seriesOffsetY',
        'seriesGap','seriesCarScale','seriesSlotX','seriesSlotScale',
        'seriesMarkAuto','seriesMarkScale','seriesTitleSize','seriesTitleOutline'
      ];

      scope.savePreset = function() {
        var name = (scope.presetName || '').trim();
        if (!name) { scope.storageWarning = 'Shkruaj nje emer per preset-in.'; return; }
        var data = {};
        angular.forEach(PRESET_FIELDS, function(k) { data[k] = angular.copy(scope.cfg[k]); });

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
          scope.cfg[k] = angular.copy(v);
        });
        scope.cfg.seriesPreset = seriesPresetById(scope.cfg.seriesPreset).id;
        scope.seriesSlots = seriesPresetById(scope.cfg.seriesPreset).slots;
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
          scope.cfg.seriesPreset = seriesPresetById(scope.cfg.seriesPreset).id;
          scope.seriesSlots = seriesPresetById(scope.cfg.seriesPreset).slots;
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
        i = Number(i) || 0;
        if (scope.cfg.series6Mode) i = Math.max(0, Math.min(5, i));
        else if (scope.cfg.shortsMode) i = Math.max(0, Math.min(3, i));
        scope.selected = i;
        scope.persist();
      };

      scope.addItem = function() {
        if (scope.cfg.series6Mode) { notify('Series 6 ka fiks 6 slot-e. Çaktivizoje për të ndryshuar rrethet.'); return; }
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
        if (scope.cfg.series6Mode) { notify('Series 6 ka fiks 6 slot-e. Çaktivizoje për të ndryshuar rrethet.'); return; }
        if (scope.cfg.items.length <= 1) return;
        scope.cfg.items.splice(index, 1);
        if (scope.selected >= scope.cfg.items.length) scope.selected = scope.cfg.items.length - 1;
        if (scope.cfg.shortsMode) ensureFourCircles();
        scope.persist();
      };

      scope.moveItem = function(index, delta) {
        if (scope.cfg.series6Mode) return;
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
          backgroundImage: item.image ? cssUrl(displaySrc(item.image)) : 'none',
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
          filter: glow > 0 ? ('drop-shadow(0 0 ' + glow + 'px currentColor)') : 'none',
          WebkitTextStroke: outline > 0 ? (outline + 'px rgba(0,0,0,0.88)') : '0px transparent',
          paintOrder: 'stroke fill'
        };
      };
      scope.markSvgOutline = function() {
        var fontSize = parseFloat(scope.markStyle().fontSize) || 12;
        var outline = Math.max(0, Math.min(4, Number(scope.cfg.markOutline) || 0));
        return { strokeWidth:outline > 0 ? String(15 + 200 * outline / fontSize) : '0', opacity:outline > 0 ? 1 : 0 };
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
        var last = scope.cfg.items.length - 1;
        if (scope.cfg.series6Mode) last = Math.min(5, last);
        else if (scope.cfg.shortsMode) last = Math.min(3, last);
        scope.selected = Math.min(last, scope.selected + 1);
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
      // v6.3.0: folderi YT në BeamNG user folder — jashtë ZIP-it, prandaj fotot
      // nuk humbin kur përditëson modin. "Hap folderin" e krijon dhe e hap.
      var USER_IMG_DIR = '/CreatorPack/imazhet/';
      var IMAGE_EXT_RE = /\.(png|jpe?g|jpe|jfif|pjpeg|pjp|webp|gif|bmp|avif|svg)$/i;
      var UNSUPPORTED_EXT_RE = /\.(heic|heif|tiff?|psd)$/i;
      // v6.3.0: string-u për Lua. Si BeamNG (GE-3042): escape vetëm \ " \n \r \t,
      // karakteret UTF-8 (ë, ç) mbeten. Më parë emri pastrohej nga hapësirat,
      // kllapat dhe ë-të, prandaj "foto (2).png" kërkohej si "foto2.png".
      function luaStr(v) {
        return '"' + String(v == null ? '' : v)
          .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
          .replace(/\u0000/g, '') + '"';
      }
      // v6.3.0: URL për <img>/CSS — çdo pjesë e rrugës kodohet (hapësira, (1), #, %, ë).
      function vfsUrl(path) {
        var p = String(path || '');
        if (!p || /^(data:|blob:|https?:|local:)/i.test(p)) return p;
        return p.split('/').map(function (seg) { return encodeURIComponent(seg); }).join('/');
      }
      function displaySrc(v) { return vfsUrl(v); }
      // CSS url("...") me thonjëza — pa to, "toyota-logo (1).png" e prishte background-image.
      function cssUrl(u) {
        if (!u) return 'none';
        return 'url("' + String(u).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r]/g, '') + '")';
      }
      function listOf(v) {
        if (!v) return [];
        if (Array.isArray(v)) return v;
        var out = [];
        angular.forEach(v, function (x) { if (x) out.push(x); });
        return out;
      }
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

      // =====================================================
      // v6.3.0: FOTOT NGA LUA — rezerva kur CEF-i s'e hap file-in si URL.
      // Lua e lexon me io.readFileToBuffer (edhe brenda ZIP-it) dhe e dërgon si
      // base64 në copa ('creatorpack.filedata'), pa kufirin e vjetër 900 KB.
      // Këtu copat bashkohen; kërkesat për të njëjtin file bashkohen në një.
      // =====================================================
      var fileReqs = {};
      var FILE_REQ_TIMEOUT = 25000;

      function finishFileReq(id, dataUrl, err) {
        var r = fileReqs[id];
        if (!r) return;
        delete fileReqs[id];
        try { if (r.timer) $timeout.cancel(r.timer); } catch (e) {}
        (r.cbs || []).forEach(function (cb) { try { cb(dataUrl || null, err || null); } catch (e) {} });
      }
      function armFileReqTimer(id, msg) {
        var r = fileReqs[id];
        if (!r) return;
        try { if (r.timer) $timeout.cancel(r.timer); } catch (e) {}
        r.timer = $timeout(function () { finishFileReq(id, null, msg); }, FILE_REQ_TIMEOUT);
      }
      // kind: 'img' (rruga e file-it) ose 'logo' (marka). cb(dataUrl|null, err)
      function requestLuaFile(kind, arg, cb) {
        var id = kind + ':' + String(arg);
        if (fileReqs[id]) { if (cb) fileReqs[id].cbs.push(cb); return id; }
        fileReqs[id] = { parts: [], got: 0, n: 0, mime: '', cbs: cb ? [cb] : [], timer: null };
        armFileReqTimer(id, 'Lua nuk u përgjigj');
        var fn = kind === 'logo' ? 'pfhudLogoData' : 'pfhudImageData';
        var sent = engineLua('if extensions.creatorpack and extensions.creatorpack.' + fn +
          ' then extensions.creatorpack.' + fn + '(' + luaStr(arg) + ',' + luaStr(id) + ') end');
        if (!sent) finishFileReq(id, null, 'Lua nuk është gati');
        return id;
      }
      function onFileData(res) {
        if (!res || !res.id) return;
        var r = fileReqs[res.id];
        if (!r) return;
        if (res.err) { finishFileReq(res.id, null, String(res.err)); return; }
        var n = Math.max(1, Number(res.n) || 1), i = Math.max(1, Number(res.i) || 1);
        r.n = n;
        r.mime = String(res.mime || r.mime || 'image/png');
        if (r.parts[i - 1] === undefined) { r.parts[i - 1] = String(res.data || ''); r.got++; }
        if (r.got >= r.n) {
          var b64 = r.parts.join('');
          finishFileReq(res.id, b64.indexOf('data:') === 0 ? b64 : ('data:' + r.mime + ';base64,' + b64), null);
        } else {
          armFileReqTimer(res.id, 'Lua nuk e dërgoi foton e plotë');
        }
      }

      function askLuaLogo(k) {
        if (!k) return;
        if ((logoLuaAsked[k] || 0) >= 3) { logoFailNote[k] = 'lua'; return; }
        logoLuaAsked[k] = (logoLuaAsked[k] || 0) + 1;
        requestLuaFile('logo', k, function (dataUrl, err) {
          applyLogoData({ brand: k, data: dataUrl, err: err });
        });
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

      // v6.3.0: fotoja e rrethit kthehet në base64 të zvogëluar (ruhet në HUD),
      // që të mbetet edhe kur file-i s'lexohet më. Rruga: URL (e shpejtë) →
      // nëse s'hapet, Lua base64 (e sigurt, edhe për emra me hapësira/ë/(1)).
      function loadPhotoAsDataUrl(path, maxPx, cb) {
        shrinkAnyImage(vfsUrl(path), maxPx, function (data) {
          if (data) { cb(data, null); return; }
          requestLuaFile('img', path, function (full, err) {
            if (!full) { cb(null, err || 'nuk u lexua'); return; }
            shrinkAnyImage(full, maxPx, function (small) {
              cb(small || null, small ? null : 'formati nuk lexohet nga loja');
            });
          });
        });
      }

      function ensurePhotoData(path, idx) {
        if (!path) return;
        var it = scope.cfg.items[idx];
        if (!it) return;
        if (String(it.image || '').indexOf('data:image') === 0 && it.image.length > 100) return;
        loadPhotoAsDataUrl(path, Number(scope.cfg.photoMaxPx) || 320, function (data, err) {
          var t = scope.cfg.items[idx];
          if (!t || t.imageFile !== path) return;          // ndërkohë u zgjodh një foto tjetër
          if (data) {
            t.image = data;
            fileDataCache[path] = data;
            archivePhoto(idx);
            try { scope.persist(); } catch (e) {}
          } else {
            notify('✗ Fotoja nuk u lexua (' + String(path).split('/').pop() + '): ' + (err || 'gabim'));
          }
          try { scope.$applyAsync(); } catch (e) {}
        });
      }

      // Kontrolli i vazhdueshem: thirret prej watcher-it / focus-it / butonit
      function kickAllLogos() {
        touchInstance();
        angular.forEach(scope.cfg.items || [], function (it) {
          if (!it || it.image || !it.brand) return;
          var k = brandKeyOf(it.brand);
          if (k && !logoResolved[k]) kickLogo(k, false);
        });
        // v6.3.0: vetëm rrathët që NUK e kanë ende foton si base64
        angular.forEach(scope.cfg.items || [], function (it, idx) {
          if (!it || !it.imageFile) return;
          if (String(it.image || '').indexOf('data:image') === 0) return;
          if (fileDataCache[it.imageFile]) { it.image = fileDataCache[it.imageFile]; return; }
          if ((imgDataAsked[it.imageFile] || 0) >= 2) return;
          imgDataAsked[it.imageFile] = (imgDataAsked[it.imageFile] || 0) + 1;
          ensurePhotoData(it.imageFile, idx);
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
        return { backgroundImage: cssUrl(url), backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: '76%', height: '76%', pointerEvents: 'none' };
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

      // =====================================================
      // v6.3.0: GALERIA — manifesti i paketës + folderi yt + file-t e rinj nga Lua
      // =====================================================
      var galleryCache = {};          // path (lowercase) -> entry (ruan miniaturat/gjendjen)
      var luaGallery = [];            // lista e fundit nga Lua (folderi yt + folderi i modit)
      var scanPending = false, lastScanAt = 0;
      scope.gallerySkipped = [];
      scope.galleryUserCount = 0;
      scope.galleryLuaOk = false;
      scope.userFolder = { dir: USER_IMG_DIR, real: '' };
      scope.folderNote = '';
      scope.uploadNote = '';
      scope.uploadBusy = 0;

      function galleryEntry(raw, dir) {
        var meta = (raw && typeof raw === 'object') ? raw : {};
        var str = String((raw && typeof raw === 'object') ? (raw.path || raw.name || '') : (raw || ''));
        if (!str) return null;
        var path = str.charAt(0) === '/' ? str : ((dir || IMG_DIR) + str);
        var name = path.split('/').pop();
        if (!IMAGE_EXT_RE.test(name)) return null;
        var key = path.toLowerCase();
        var user = meta.user === true || key.indexOf(USER_IMG_DIR.toLowerCase()) === 0;
        var g = galleryCache[key];
        if (!g) {
          g = galleryCache[key] = {
            name: name, path: path, url: vfsUrl(path), src: vfsUrl(path),
            user: user, size: 0, mtime: 0, state: 'idle', err: '', fallbackTried: false
          };
        }
        g.user = user;
        if (Number(meta.size)) g.size = Number(meta.size);
        if (Number(meta.mtime)) g.mtime = Number(meta.mtime);
        return g;
      }
      function mergeGalleryEntries() {
        var out = [], seen = {};
        angular.forEach(arguments, function (list) {
          angular.forEach(list || [], function (g) {
            if (!g || !g.path) return;
            var key = String(g.path).toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            out.push(g);
          });
        });
        // Fotot e tua lart (më e reja e para), pastaj ato të modit në renditjen e tyre.
        var indexed = out.map(function (g, i) { return { g: g, i: i }; });
        indexed.sort(function (a, b) {
          if (a.g.user !== b.g.user) return a.g.user ? -1 : 1;
          if (a.g.user && (b.g.mtime || 0) !== (a.g.mtime || 0)) return (b.g.mtime || 0) - (a.g.mtime || 0);
          return a.i - b.i;
        });
        return indexed.map(function (x) { return x.g; });
      }
      function rebuildGallery() {
        scope.gallery = mergeGalleryEntries(luaGallery, bundledGallery);
        scope.galleryUserCount = scope.gallery.filter(function (g) { return g.user; }).length;
      }
      function galleryInfoText() {
        var n = scope.gallery.length, u = scope.galleryUserCount;
        return n + ' imazhe' + (u ? (' · ' + u + ' nga folderi yt') : ' · folderi yt është bosh');
      }

      function applyImageList(res, fromManifest) {
        if (!fromManifest) {
          scanPending = false;
          cancelImageScanWatchdog();
          try { if (imgScanTimer) $timeout.cancel(imgScanTimer); } catch (e) {}
          imgScanTimer = null;
        }
        try {
          if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e) {} }
          if (!res || typeof res !== 'object') {
            if (!fromManifest) { scope.galleryState = 'err'; scope.galleryInfo = 'lista e folderave nuk u lexua'; }
            return;
          }
          if (res.err && !res.files) {
            if (!fromManifest) {
              scope.galleryState = 'err';
              scope.galleryInfo = 'gabim Lua: ' + res.err;
              scheduleImageScan();
            }
            return;
          }
          var entries = [];
          listOf(res.files).forEach(function (f) {
            var g = galleryEntry(f, fromManifest ? (res.dir || IMG_DIR) : IMG_DIR);
            if (g) entries.push(g);
          });
          if (fromManifest) {
            bundledGallery = entries;
          } else {
            luaGallery = entries;
            scope.galleryLuaOk = true;
            scope.gallerySkipped = listOf(res.skipped).map(function (s) { return String((s && s.name) || s); });
            if (res.userReal) scope.userFolder.real = String(res.userReal);
            if (res.userDir) scope.userFolder.dir = String(res.userDir);
          }
          rebuildGallery();
          if (fromManifest && !scope.galleryLuaOk) {
            if (scope.galleryState !== 'loading') scope.galleryState = scope.gallery.length ? 'ok' : 'idle';
            if (!scope.galleryInfo) scope.galleryInfo = scope.gallery.length + ' imazhe të modit';
          } else if (!fromManifest) {
            scope.galleryState = 'ok';
            scope.galleryInfo = galleryInfoText();
            imgScanTries = 0;
          }
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
        if (imgScanTries >= 12) return;               // ~1 minutë provime
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
        if (auto && scanPending) return;               // një lexim në një kohë
        if (!auto) {
          imgScanTries = 0;
          try { if (imgScanTimer) $timeout.cancel(imgScanTimer); } catch (e) {}
          imgScanTimer = null;
          try { scope.refreshLogos(true); } catch (e) {}
          // rifreskim manual: provo prapë miniaturat që kishin dështuar
          angular.forEach(scope.gallery || [], function (g) {
            if (g && g.state === 'err') { g.state = 'idle'; g.err = ''; g.fallbackTried = false; g.src = g.url; }
          });
        }
        cancelImageScanWatchdog();
        scanPending = true;
        lastScanAt = new Date().getTime();
        if (!auto || !scope.galleryLuaOk) {
          scope.galleryState = 'loading';
          scope.galleryInfo = 'duke lexuar folderat…';
        }
        // Never leave the gallery in an endless loading state when the Lua
        // extension is unavailable or an event is dropped.
        imgScanWatchdog = $timeout(function () {
          imgScanWatchdog = null;
          if (!scanPending) return;
          scanPending = false;
          scope.galleryState = 'err';
          scope.galleryInfo = 'leximi nuk u përgjigj — provo Rifresko ose rihap panelin (H)';
          scheduleImageScan();
        }, 8000);
        // v6.3.0: PA callback. bngApi.engineLua(cmd, callback) e fut cmd-në brenda
        // guihooks.trigger("onBNGAPICallback", id, cmd): komanda e vjetër me
        // "extensions.load(...); ..." jepte gabim sintakse dhe folderi nuk lexohej
        // KURRË. Tani Lua e dërgon listën me event-in 'creatorpack.images'.
        var sent = engineLua('if extensions.creatorpack and extensions.creatorpack.pfhudListImages then ' +
          'extensions.creatorpack.pfhudListImages(' + luaStr(auto ? 'auto' : 'manual') + ') end');
        if (!sent) {
          scanPending = false;
          cancelImageScanWatchdog();
          scope.galleryState = scope.gallery.length ? 'ok' : 'err';
          scope.galleryInfo = 'Lua nuk është gati — shfaqen vetëm imazhet e modit';
        }
      };
      // Every image shipped in imazhet/ appears immediately, even if the
      // BeamNG FS bridge is late or unavailable. Lua scans add your own files.
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

      // Miniaturat: nëse CEF-i s'e hap URL-në, merret nga Lua (2 njëherësh).
      var thumbQueue = [], thumbBusy = 0;
      function pumpThumbs() {
        while (thumbBusy < 2 && thumbQueue.length) {
          (function (g) {
            thumbBusy++;
            requestLuaFile('img', g.path, function (full, err) {
              if (!full) {
                thumbBusy--;
                g.state = 'err'; g.err = err || 'nuk u lexua';
                try { scope.$applyAsync(); } catch (e) {}
                pumpThumbs();
                return;
              }
              shrinkAnyImage(full, 160, function (small) {
                thumbBusy--;
                if (small) { g.src = small; g.state = 'ok'; g.err = ''; }
                else { g.state = 'err'; g.err = 'formati nuk lexohet nga loja'; }
                try { scope.$applyAsync(); } catch (e) {}
                pumpThumbs();
              });
            });
          })(thumbQueue.shift());
        }
      }
      scope.galleryImgError = function (g) {
        if (!g) return;
        if (g.fallbackTried || String(g.src || '').indexOf('data:') === 0) {
          g.state = 'err';
          if (!g.err) g.err = 'formati nuk lexohet';
          return;
        }
        g.fallbackTried = true;
        g.state = 'loading';
        thumbQueue.push(g);
        pumpThumbs();
      };
      scope.galleryImgLoaded = function (g) {
        if (g && g.state !== 'err') g.state = 'ok';
      };
      scope.galleryTitle = function (g) {
        if (!g) return '';
        var t = g.name + (g.user ? ' · folderi yt' : ' · moda');
        if (g.size) t += ' · ' + (g.size >= 1048576 ? (g.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(g.size / 1024)) + ' KB');
        if (g.state === 'err') t += ' · ✗ ' + (g.err || 'nuk lexohet');
        return t;
      };

      scope.useGalleryImage = function (g) {
        if (!g || !g.path) return;
        var idx = Number(scope.selected) || 0;
        var it = scope.cfg.items[idx];
        if (!it) { notify('✗ S\'ka rreth të zgjedhur'); return; }
        imageTargetIndex = idx;                              // shkon ATY ku e ke zgjedh
        placeCircleImage(fileDataCache[g.path] || g.path, String(g.name || '').replace(/\.[a-z0-9]+$/i, ''));
        it.imageFile = g.path;                              // v5.11.1: rruga e file-it ruhet
        if (fileDataCache[g.path]) it.image = fileDataCache[g.path];
        else ensurePhotoData(g.path, idx);                  // base64 i ruajtur (URL → Lua)
        scope.persist();
      };

      // =====================================================
      // v6.3.0: "NGARKO NGA KOMPJUTERI" (Choose File)
      // Fotoja shkon menjëherë në rreth dhe ruhet edhe në folderin tënd
      // (CreatorPack/imazhet), që të dalë në galeri edhe herë tjetër.
      // =====================================================
      var UPLOAD_CHUNK = 120000;
      var UPLOAD_MAX_PX = 1024;
      var uploadWaiters = {}, uploadSeq = 0;

      function readFileAsDataUrl(file, cb) {
        try {
          var reader = new FileReader();
          reader.onload = function (e) { cb(e && e.target ? e.target.result : null); };
          reader.onerror = function () { cb(null); };
          reader.readAsDataURL(file);
        } catch (e) { cb(null); }
      }
      function loadImageEl(src, cb) {
        try {
          var im = new Image();
          im.onload = function () { cb((im.naturalWidth || im.width) ? im : null); };
          im.onerror = function () { cb(null); };
          im.src = src;
        } catch (e) { cb(null); }
      }
      function drawScaled(im, maxPx, type, quality) {
        try {
          var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
          if (!w || !h) return null;
          var sc = Math.min(1, maxPx / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * sc));
          c.height = Math.max(1, Math.round(h * sc));
          var cx = c.getContext('2d');
          if (type === 'image/jpeg') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, c.width, c.height); }
          cx.drawImage(im, 0, 0, c.width, c.height);
          var out = c.toDataURL(type || 'image/png', quality);
          return out && out.length > 60 ? out : null;
        } catch (e) { return null; }
      }
      function sendUploadToLua(dataUrl, fileName, cb) {
        var m = /^data:([^;,]+);base64,(.*)$/.exec(String(dataUrl || ''));
        if (!m) { cb({ ok: false, err: 'të dhëna të pavlefshme' }); return; }
        var b64 = m[2];
        var id = 'up' + (++uploadSeq) + '-' + new Date().getTime().toString(36);
        var n = Math.max(1, Math.ceil(b64.length / UPLOAD_CHUNK));
        uploadWaiters[id] = {
          cb: cb,
          timer: $timeout(function () {
            var w = uploadWaiters[id];
            delete uploadWaiters[id];
            if (w) w.cb({ ok: false, err: 'Lua nuk u përgjigj' });
          }, 30000)
        };
        for (var i = 0; i < n; i++) {
          var ok = engineLua('if extensions.creatorpack and extensions.creatorpack.pfhudUploadChunk then ' +
            'extensions.creatorpack.pfhudUploadChunk(' + luaStr(id) + ',' + luaStr(fileName) + ',' + (i + 1) + ',' + n +
            ',"' + b64.substr(i * UPLOAD_CHUNK, UPLOAD_CHUNK) + '") end');
          if (!ok) {
            var w = uploadWaiters[id];
            delete uploadWaiters[id];
            if (w) { try { $timeout.cancel(w.timer); } catch (e) {} w.cb({ ok: false, err: 'Lua nuk është gati' }); }
            return;
          }
        }
      }
      function onUploaded(res) {
        if (!res || !res.id) return;
        var w = uploadWaiters[res.id];
        if (!w) return;
        delete uploadWaiters[res.id];
        try { $timeout.cancel(w.timer); } catch (e) {}
        w.cb(res);
      }

      scope.onPickedFiles = function (files, targetIdx) {
        files = listOf(files).slice(0, 12);
        if (!files.length) return;
        if (targetIdx !== undefined && targetIdx !== null) scope.select(targetIdx);
        var idx = Number(scope.selected) || 0;
        var placed = false, placedK = -1, saved = 0, problems = [];
        scope.uploadBusy += files.length;
        scope.uploadNote = 'Duke ngarkuar ' + files.length + ' foto…';
        function finishOne(file, problem) {
          if (problem) problems.push(String(file && file.name || 'foto') + ': ' + problem);
          scope.uploadBusy = Math.max(0, scope.uploadBusy - 1);
          try { scope.$applyAsync(); } catch (e) {}
        }
        function summary() {
          var parts = [];
          if (placed) parts.push('✓ Fotoja u vendos në rrethin #' + (idx + 1));
          if (saved) parts.push(saved + (saved === 1 ? ' foto u ruajt' : ' foto u ruajtën') + ' në galeri (CreatorPack/imazhet)');
          if (problems.length) parts.push('✗ ' + problems.join(' · '));
          scope.uploadNote = parts.join(' · ') || 'Asnjë foto nuk u ngarkua';
          notify(scope.uploadNote);
          try { scope.$applyAsync(); } catch (e) {}
        }
        (function next(k) {
          if (k >= files.length) { summary(); return; }
          var file = files[k];
          var name = String((file && file.name) || 'foto.png');
          var type = String((file && file.type) || '');
          if (UNSUPPORTED_EXT_RE.test(name) || /heic|heif|tiff/i.test(type)) {
            finishOne(file, 'HEIC/TIFF nuk lexohet nga loja — ruaje si JPG ose PNG');
            next(k + 1); return;
          }
          readFileAsDataUrl(file, function (dataUrl) {
            if (!dataUrl) { finishOne(file, 'nuk u lexua'); next(k + 1); return; }
            loadImageEl(dataUrl, function (im) {
              if (!im) { finishOne(file, 'formati nuk lexohet'); next(k + 1); return; }
              var baseName = name.replace(/\.[a-z0-9]+$/i, '') || 'foto';
              if (!placed) {
                var circle = drawScaled(im, Number(scope.cfg.photoMaxPx) || 320, 'image/png');
                if (circle) {
                  placed = true; placedK = k;
                  imageTargetIndex = idx;
                  placeCircleImage(circle, baseName);
                  var it0 = scope.cfg.items[idx];
                  if (it0) { it0.imageFile = ''; it0.imageManual = true; }
                }
              }
              var alpha = /png|webp|gif|svg|avif/i.test(type) || /\.(png|webp|gif|svg|avif)$/i.test(name);
              var outType = alpha ? 'image/png' : 'image/jpeg';
              var store = drawScaled(im, UPLOAD_MAX_PX, outType, 0.92);
              if (!store) { finishOne(file, 'nuk u përgatit për ruajtje'); next(k + 1); return; }
              sendUploadToLua(store, baseName + (alpha ? '.png' : '.jpg'), function (res) {
                if (res && res.ok) {
                  saved++;
                  if (k === placedK && res.path) {
                    var it1 = scope.cfg.items[idx];
                    if (it1 && String(it1.image || '').indexOf('data:image') === 0) { it1.imageFile = String(res.path); fileDataCache[res.path] = it1.image; }
                    try { scope.persist(); } catch (e) {}
                  }
                  finishOne(file, null);
                } else {
                  finishOne(file, 'nuk u ruajt në folder (' + ((res && res.err) || 'gabim') + ')');
                }
                next(k + 1);
              });
            });
          });
        })(0);
      };

      // =====================================================
      // v6.3.0: "HAP FOLDERIN" — <user folder>/CreatorPack/imazhet në Windows
      // =====================================================
      scope.userFolderLabel = function () {
        var real = scope.userFolder && scope.userFolder.real;
        if (real) return String(real).replace(/\//g, '\\').replace(/\\+$/, '');
        return 'BeamNG user folder\\CreatorPack\\imazhet';
      };
      scope.openImageFolder = function () {
        scope.folderNote = 'Duke hapur folderin…';
        var ok = engineLua('if extensions.creatorpack and extensions.creatorpack.pfhudOpenImageFolder then extensions.creatorpack.pfhudOpenImageFolder() end');
        if (!ok) scope.folderNote = '✗ Lua nuk është gati — rihap panelin (H) dhe provo prapë.';
      };
      function onFolder(res) {
        if (!res || typeof res !== 'object') return;
        if (res.real) scope.userFolder.real = String(res.real);
        if (res.dir) scope.userFolder.dir = String(res.dir);
        if (res.created === undefined) return;               // vetëm info
        if (res.ok === false || res.err) {
          scope.folderNote = '✗ Folderi nuk u hap automatikisht (' + (res.err || 'gabim') + '). Hape vetë: ' + scope.userFolderLabel();
        } else {
          scope.folderNote = '📂 U hap: ' + scope.userFolderLabel() + ' — kopjo fotot aty dhe kthehu në lojë (Alt+Tab). Galeria rifreskohet vetë.';
        }
      }

      var unsubVehicle = $rootScope.$on('creatorpack.vehicle', function (e, data) {
        scope.$applyAsync(function () {
          scope.brandInfo = data || null;
          applyBrand(data);
        });
      });
      var unsubImages = $rootScope.$on('creatorpack.images', function (e, data) {
        scope.$applyAsync(function () { applyImageList(data); });
      });
      // v6.3.0: fotot/logot nga Lua (në copa), ngarkimet dhe "Hap folderin"
      var unsubFileData = $rootScope.$on('creatorpack.filedata', function (e, data) {
        scope.$applyAsync(function () { onFileData(data); });
      });
      var unsubUploaded = $rootScope.$on('creatorpack.uploaded', function (e, data) {
        scope.$applyAsync(function () { onUploaded(data); });
      });
      var unsubFolder = $rootScope.$on('creatorpack.folder', function (e, data) {
        scope.$applyAsync(function () { onFolder(data); });
      });

      // v5.11.1: KONTROLLUESI — logot rikontrollohen vetë (edhe pas kthimit prej menusë)
      var logoWatchTimer = null;
      try {
        logoWatchTimer = setInterval(function () {
          try { kickAllLogos(); } catch (e) {}
          // v6.3.0: sa është hapur tab-i Fotot, folderat rikontrollohen çdo ~5 s
          try {
            if (scope.cfg.showPanel && scope.ui && scope.ui.tab === 'fotot' && !scanPending &&
                (new Date().getTime() - lastScanAt) > 4500) scope.scanImages(true);
          } catch (e) {}
          try { if (scope.$root && !scope.$root.$$phase) scope.$applyAsync(); } catch (e) {}
        }, 4000);
      } catch (e) {}
      try {
        $window.addEventListener('focus', function () {
          try { reapplyStoredBrands(); } catch (e) {}
          try { kickAllLogos(); } catch (e) {}
          // v6.3.0: kthehesh nga Windows Explorer → fotot e reja dalin vetë
          try { if (scope.ui && scope.ui.tab === 'fotot') scope.scanImages(true); } catch (e) {}
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
        try { unsubVehicle(); unsubImages(); unsubFileData(); unsubUploaded(); unsubFolder(); } catch (e) {}
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
        $timeout(function() {
          if (scope.cfg.series6Mode) scope.setSeries6Mode(true);
          else scope.setShortsMode(true);
        }, 0);
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
