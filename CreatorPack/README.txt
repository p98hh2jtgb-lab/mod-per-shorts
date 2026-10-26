CREATORPACK STUDIO 6.1.0
========================
Panel me H · PASS/FAIL circles · Shorts 2×2 · Series 6 BMW test


INSTALIMI
---------
1. Çaktivizo ose hiq versionin e vjetër CreatorPack/HUD PRO që të mos ketë dy kopje aktive.
2. Kopjo CreatorPack_v6.1.0.zip pa e hapur te:
   Documents\BeamNG.drive\mods\
3. Nis lojën. Nëse overlay-i nuk shfaqet vetë:
   Esc → UI Apps → Add App → CreatorPack Studio.
4. H hap ose mbyll panelin. Paneli mund të zhvendoset duke e tërhequr nga header-i.


ÇKA KA KËTU
-----------
• Ridizajnim i panelit H: Kryesore, Shorts, Series 6, Rrethet, Stili, Fotot dhe Më shumë.
• Rrethet standard të makinave ruajnë pamjen dhe mënyrën ekzistuese të punës.
• ✓/✕ kanë glow të rregullueshëm nga 0 deri në 30. Me 0 glow-i hiqet plotësisht.
• Outline i zi i hollë për ✓/✕, i rregullueshëm nga 0 deri në 4 px.
• Nuk ka damage ring, përqindje damage-i apo tekst damage-i nën/mes rretheve.
• Nuk ka AutoFoto, foto LIVE, Ctrl+1/Ctrl+2 ose kapje automatike të makinës.
• Overlay full-screen; pa drop-shadow të zi rreth rretheve dhe pa zbehje të zeza anësore.


SHORTS STUDIO — SAKTËSISHT 4 RRETHE
-----------------------------------
1. H → Shorts → “Aktivizo Shorts · 4 rrethe”.
2. Modi aktivizon katër rrethet e para në layout 2×2 dhe kornizën 9:16.
3. Zgjidh pozicionin Lart / Mes / Poshtë. “Poshtë” e mban HUD-in mbi zonën e titullit.
4. Safe areas shënojnë zonën e butonave të YouTube në të djathtë dhe zonën e caption/title poshtë.
5. “Regjistrim i pastër” fshin panelin, guidat dhe safe-area markers; rrethet mbeten.
6. H rihap panelin dhe rikthen guidat. Mund të përdorësh edhe “Rikthe guidat 9:16”.

Katër rrethet mbeten fiks edhe nëse konfigurimi i vjetër kishte slot-e të çaktivizuara.
Rrethet shtesë nuk fshihen nga konfigurimi: vetëm nuk shfaqen gjatë Shorts dhe rikthehen më pas.
Layout-i, madhësia, pozicioni dhe gjendja e mëparshme rikthehen kur e fik Shorts.
Shorts standard mbetet plotësisht veçmas nga Series 6 dhe nuk zëvendësohet prej tij.


SERIES 6 — PRESET 1 BMW (TEST)
------------------------------
1. H → Series 6 → “Aktivizo BMW Series 6”.
2. Një HUD i veçantë transparent shfaq të njëjtën makinë BMW të inspiruar nga referenca,
   pa logo, në një rresht dhe me madhësi që rritet nga e majta në të djathtë.
3. Renditja fikse është:
   TINY CAR / e verdhë · SMALL CAR / blu · MEDIUM CAR / portokalli ·
   NORMAL CAR / e kuqe · BIG CAR / e gjelbër · GIANT CAR / rozë.
4. Titulli i variantit aktiv shfaqet poshtë makinave dhe ndryshon me zgjedhjen/auto-advance.
5. K jep PASS, L jep FAIL; shenja ✓/✕ del mbi variantin përkatës me glow/outline-in e zgjedhur.
6. PageUp/PageDown ose slotet në panel zgjedhin variantin. Auto-advance, Ctrl+Z,
   Reset dhe “Regjistrim i pastër” përdorin të njëjtat kontrolle të testuara të CreatorPack.
7. Pozicioni Lart / Mes / Poshtë e vendos serinë brenda kornizës 9:16.
8. “Kthehu te Shorts standard” rikthen saktësisht 4 rrethet në 2×2.

Ky release përmban vetëm preset-in e parë BMW për testim. Series 6 është overlay/panel;
nuk bën spawn dhe nuk ndryshon fizikën e makinave reale në lojë.


HOTKEYS
-------
H                 Paneli CreatorPack
K                 PASS për rrethin/slotin e zgjedhur
L                 FAIL për rrethin/slotin e zgjedhur
PageUp/Numpad4    Rrethi/sloti i mëparshëm
PageDown/Numpad6  Rrethi/sloti tjetër
G                 Reset PASS/FAIL marks
V                 Shfaq/fshih rrethet (jashtë Shorts/Series 6)
Ctrl+Z            Undo markimin/reset-in e fundit

Options → Controls përmban gjithashtu bindings për PASS, FAIL, Next, Previous,
Reset, Panel, Undo, Guides, Circles dhe Shorts 2×2. Nuk ka default binding të ri
që të përplaset me tastet e tua; mund ta caktoje Shorts vetë.


FOTOT DHE LOGOT — GALERI ME 1 KLIK
----------------------------------
• Të 87 imazhet e galerisë shfaqen automatikisht në Fotot → Galeria e mod-it.
• Zgjidh rrethin standard, kliko imazhin dhe fotoja vendoset menjëherë në atë rreth.
• Nuk ka Choose File dhe nuk duhet të shkruash emrin e file-it.
• “Rifresko galerinë” lexon edhe PNG/JPG/JPEG/WEBP të rinj në imazhet/ përmes Lua-s.
• Për folder-in brenda ZIP-it: hap ZIP-in, shto file-t dhe ripaketo, ose përdor instalim unpacked.
• Fotot/logot e përdorura ruhen në storage-in e UI-së; nuk merren screenshots vetë.
• gallery.json garanton që imazhet e paketës të dalin edhe kur FS/Lua nga BeamNG vonohet.
• Lua bridge ka lifecycle të plotë dhe fotot kanë URL + base64 fallback.
• Gjashtë render-et e Series 6 janë asset-e veçmas dhe nuk përzien galerinë 87-imazhëshe.


PASTRIMI I KONFIGURIMIT
-----------------------
Fushat repair cost/damage, AutoFoto, LIVE dhe stream të konfigurimeve të vjetra
pastrohen gjatë ngarkimit. Arkivat e fotove/logove të versionit 5.11.x nuk fshihen.
Nuk ka kontroll të errësimit jashtë kornizës: Shorts/Series nuk zbeh lojën apo screenshot-in.


VERIFIKIMI
----------
• JavaScript syntax dhe Lua 5.1 runtime me BeamNG API të simuluar.
• 12 runtime smoke checks me Angular/CEF të simuluar; 454 Angular expressions.
• Shorts/restore, BMW Series 6, PASS/FAIL, auto-advance, undo/reset, glow/outline,
  audio, 87 imazhe galerie, timeout dhe one-click placement kaluan.
• Lua lifecycle + FS/base64/path security me BeamNG API të simuluar kaloi.
• Render real në Chromium: 87/87 imazhe galerie dhe 6/6 variante BMW të ngarkuara,
  madhësi në rritje, titull aktiv, H/K/L/Ctrl+Z, clean capture dhe kthim në 4 rrethe 2×2.
• Pa JavaScript errors në render-in final.

Testimi është bërë me Lua mocks dhe Chromium/Angular. Verifikimi final në instalimin
real të BeamNG bëhet nga përdoruesi. Ky dokument përshkruan CreatorPack Studio 6.1.0.
