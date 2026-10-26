CREATORPACK STUDIO 6.0.1
========================
Panel i ri me H · PASS/FAIL circles · Shorts Studio 9:16


INSTALIMI
---------
1. Çaktivizo ose hiq versionin e vjetër CreatorPack/HUD PRO që të mos ketë dy kopje aktive.
2. Kopjo CreatorPack_v6.0.1.zip pa e hapur te:
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


FOTOT DHE LOGOT — VETËM MANUALE
-------------------------------
• Choose File: zgjidh foto nga PC-ja në tab-in Fotot ose Rrethet.
• Galeria e mod-it: lexon ui/modules/apps/CreatorPack/imazhet/ brenda modit.
• Mund të shtosh PNG, JPG, JPEG ose WEBP në atë folder dhe të klikosh “Rifresko galerinë”.
• Për folder-in brenda ZIP-it: hap ZIP-in, shto file-t dhe ripaketo, ose përdor instalim unpacked.
• Logot e markave dhe fotot manuale ruhen në storage-in e UI-së; nuk merren screenshots vetë.
• Lua bridge ngarkohet explicitly që galeria, logot dhe info e markës të punojnë edhe pa
  prekur ndonjë binding PASS/FAIL.


PASTRIMI I KONFIGURIMIT
-----------------------
Fushat repair cost/damage, AutoFoto, LIVE dhe stream të konfigurimeve të vjetra
pastrohen gjatë ngarkimit. Arkivat e fotove/logove të versionit 5.11.x nuk fshihen.
Nuk ka kontroll të errësimit jashtë kornizës: Shorts nuk zbeh lojën apo screenshot-in.


VERIFIKIMI
----------
• JavaScript syntax dhe Lua 5.1 runtime me BeamNG API të simuluar.
• Runtime smoke me Angular/CEF të simuluar për boot, Shorts/restore, PASS/FAIL,
  undo/reset, glow/outline, audio, galeri, path security dhe persistence.
• Render real në Chromium për çdo tab, H/K/Ctrl+Z, clean capture dhe 4 rrethe 2×2.
• Pa JavaScript errors në render-in final.

Ky dokument përshkruan CreatorPack Studio 6.0.1.
