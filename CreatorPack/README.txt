CREATORPACK STUDIO 6.0.3
========================
Panel i ri me H · PASS/FAIL circles · Shorts Studio 9:16


INSTALIMI
---------
1. Çaktivizo ose hiq versionin e vjetër CreatorPack/HUD PRO që të mos ketë dy kopje aktive.
2. Kopjo CreatorPack_v6.0.3.zip pa e hapur te:
   Documents\BeamNG.drive\mods\
3. Nis lojën. Nëse overlay-i nuk shfaqet vetë:
   Esc → UI Apps → Add App → CreatorPack Studio.
4. H hap ose mbyll panelin e ri. Paneli mund të zhvendoset duke e tërhequr nga header-i.


ÇKA KA KËTU
-----------
• Ridizajnim komplet vetëm i panelit H: Kryesore, Shorts, Rrethet, Stili, Fotot dhe Më shumë.
• Rrethet e makinave ruajnë pamjen dhe mënyrën e tyre të punës.
• ✓/✕ kanë glow të rregullueshëm nga 0 deri në 30. Me 0 glow-i hiqet plotësisht.
• Outline i zi i hollë për ✓/✕, i rregullueshëm nga 0 deri në 4 px.
• Nuk ka damage ring, përqindje damage-i apo tekst damage-i nën/mes rretheve.
• Nuk ka AutoFoto, foto LIVE, Ctrl+1/Ctrl+2 ose kapje automatike të makinës.
• Overlay full-screen; pa drop-shadow të zi rreth rretheve dhe pa zbehje të zeza anësore në Shorts.


SHORTS STUDIO — SAKTËSISHT 4 RRETHE
-----------------------------------
1. H → Shorts → “Aktivizo Shorts · 4 rrethe”.
2. Modi aktivizon katër rrethet e para në layout 2×2 dhe kornizën 9:16.
3. Zgjidh pozicionin Lart / Mes / Poshtë. “Poshtë” e mban HUD-in mbi zonën e titullit.
4. Safe areas shënojnë zonën e butonave të YouTube në të djathtë dhe zonën e caption/title poshtë.
5. “Regjistrim i pastër” fshin panelin, guidat dhe safe-area markers; rrethet mbeten për regjistrim.
6. H rihap panelin dhe rikthen guidat. Mund të përdorësh edhe “Rikthe guidat 9:16”.

Katër rrethet mbeten fiks edhe nëse konfigurimi i vjetër kishte slot-e të çaktivizuara.
Rrethet shtesë nuk fshihen nga konfigurimi: vetëm nuk shfaqen gjatë Shorts dhe rikthehen më pas.
Layout-i, madhësia, pozicioni dhe gjendja e mëparshme rikthehen kur e fik Shorts.
Layout-i 2×2 dhe shfaqja e 4 rretheve mbrohen edhe nga V, presets dhe kontrollet e Stilit.


HOTKEYS
-------
H                 Paneli CreatorPack
K                 PASS për rrethin e zgjedhur
L                 FAIL për rrethin e zgjedhur
PageUp/Numpad4    Rrethi i mëparshëm
PageDown/Numpad6  Rrethi tjetër
G                 Reset PASS/FAIL marks
V                 Shfaq/fshih rrethet (jashtë Shorts)
Ctrl+Z            Undo markimin/reset-in e fundit

Options → Controls përmban gjithashtu bindings për PASS, FAIL, Next, Previous,
Reset, Panel, Undo, Guides, Circles dhe Shorts 2×2. Nuk ka default binding të ri
që të përplaset me tastet e tua; mund ta caktoje Shorts vetë.


FOTOT DHE LOGOT — GALERI ME 1 KLIK
----------------------------------
• Të 87 imazhet e paketës shfaqen automatikisht në Fotot → Galeria e mod-it.
• Zgjidh rrethin, kliko imazhin dhe fotoja vendoset menjëherë në atë rreth.
• Nuk ka Choose File dhe nuk duhet të shkruash emrin e file-it.
• “Rifresko galerinë” lexon edhe PNG/JPG/JPEG/WEBP të rinj në imazhet/ përmes Lua-s.
• Për folder-in brenda ZIP-it: hap ZIP-in, shto file-t dhe ripaketo, ose përdor instalim unpacked.
• Fotot/logot e përdorura ruhen në storage-in e UI-së; nuk merren screenshots vetë.
• gallery.json garanton që imazhet e paketës të dalin edhe kur FS/Lua nga BeamNG vonohet.
• Lua bridge ka lifecycle të plotë dhe fotot kanë URL + base64 fallback.


HOTFIX 6.0.3
------------
• Galeria e integruar shfaq të 87 imazhet menjëherë dhe i bashkon me skedarët e rinj nga Lua.
• U hoqën Choose File, input-i manual i emrit dhe kodi i tyre i papërdorur.
• Rrethet → “Zgjidh foto nga galeria” zgjedh rrethin dhe hap bibliotekën.
• Mbeten lifecycle-n e BeamNG, timeout-i i galerisë dhe gabimet e dukshme nga 6.0.2.


PASTRIMI I KONFIGURIMIT
-----------------------
Fushat repair cost/damage, AutoFoto, LIVE dhe stream të konfigurimeve të vjetra
pastrohen gjatë ngarkimit. Arkivat e fotove/logove të versionit 5.11.x nuk fshihen.
Nuk ka kontroll të errësimit jashtë kornizës: Shorts nuk zbeh lojën apo screenshot-in.


VERIFIKIMI
----------
• JavaScript syntax dhe Lua 5.1 runtime me BeamNG API të simuluar.
• 11 runtime smoke checks me Angular/CEF të simuluar për boot, Shorts/restore, PASS/FAIL,
  undo/reset, glow/outline, audio, 87 imazhe, timeout, galeri me 1 klik dhe persistence.
• Lua lifecycle + FS/base64/path security me BeamNG API të simuluar.
• Render real në Chromium: 87/87 imazhe pa përgjigje nga Lua, zero file/name inputs,
  volvo.png me një klik në galeri, Lua/base64 event, H/K/L/Ctrl+Z, clean capture dhe 4 rrethe 2×2.
• Pa JavaScript errors në render-in final.

Ky dokument përshkruan CreatorPack Studio 6.0.3.
