CREATORPACK STUDIO 6.3.0
========================
Panel me H · PASS/FAIL circles · Shorts 2×2 · Series Studio me 10 preset-e ·
Fotot e tua · Ngarko nga kompjuteri · Hap folderin


INSTALIMI
---------
1. Çaktivizo ose hiq versionin e vjetër CreatorPack/HUD PRO që të mos ketë dy kopje aktive.
2. Kopjo CreatorPack_v6.3.0.zip pa e hapur në folderin mods të BeamNG
   (në lojë: Repository/Mod Manager → Open Mod Folder).
3. Nis lojën. Nëse overlay-i nuk shfaqet vetë:
   Esc → UI Apps → Add App → CreatorPack Studio.
4. H hap ose mbyll panelin. Paneli mund të zhvendoset duke e tërhequr nga header-i.


ÇKA U RREGULLUA NË 6.3.0
------------------------
1) FOTOT E REJA NUK DILNIN NË PANEL — U RREGULLUA
   • Butoni “Rifresko galerinë” i dërgonte lojës një komandë që BeamNG e fut
     brenda guihooks.trigger(..., komanda). Komanda kishte dy pjesë me “;”,
     prandaj në lojë jepte gabim sintakse dhe folderi nuk lexohej KURRË
     (që nga 6.0.0). Dilnin vetëm 87 imazhet e listës gallery.json.
   • Rruga rezervë base64 përdorte FS:readFile, që nuk ekziston në BeamNG —
     tash përdoret io.readFileToBuffer (si vetë loja), pa kufirin 900 KB.
   • Emrat si “foto (2).png”, “IMG 2024.JPG” ose me ë/ç prisheshin para se të
     shkonin te Lua (hapësirat, kllapat dhe ë-të fshiheshin). Tash shkojnë saktë.
   • Pranohen edhe .jfif, .gif, .bmp, .avif dhe zgjatimet me shkronja të mëdha
     (.JPG, .PNG). HEIC (iPhone) nuk lexohet nga loja — paneli ta tregon emrin.
2) “ZGJIDH FOTO NGA GALERIA” NUK HAPEJ — U RREGULLUA
   • Butoni ndryshonte vetëm një kopje lokale të tab-it. Tash e zgjedh rrethin
     dhe e hap galerinë menjëherë.
3) E RE: NGARKO NGA KOMPJUTERI (Choose File)
   • Fotot → “Ngarko nga kompjuteri” (ose te Rrethet, për secilin rreth).
   • Fotoja e parë shkon menjëherë në rrethin e zgjedhur; të gjitha ruhen edhe
     në folderin tënd (max 1024 px), që t’i kesh në galeri edhe herë tjetër.
   • Nëse në kompjuterin tënd dritarja e Windows nuk hapet (p.sh. fullscreen),
     përdor “Hap folderin” — punon gjithmonë.
4) E RE: FOLDERI YT + “HAP FOLDERIN”
   • <BeamNG user folder>\CreatorPack\imazhet — jashtë ZIP-it, prandaj fotot
     NUK humbin kur e përditëson modin. S’ka më nevojë ta hapësh ZIP-in.
   • “Hap folderin” e krijon dhe e hap në Windows Explorer. Kopjo fotot aty
     dhe kthehu në lojë: galeria i shton vetë (fotot e tua dalin të parat).
   • Nëse i kishe shtuar fotot brenda ZIP-it të vjetër, kopjoji në këtë folder.


ÇKA KA KËTU
-----------
• Panel i ridizajnuar: Kryesore, Shorts, Series, Rrethet, Stili, Fotot dhe Më shumë.
• Fotot e tua: Ngarko nga kompjuteri, Hap folderin, galeria rifreskohet vetë.
• Series Studio me 10 preset-e dhe 60 PNG transparente: 6 variante për secilin model.
• Shorts 9:16 dhe Full Size për Series, pozicion Lart/Mes/Poshtë dhe X/Y manual.
• Shenja ✓/✕ si SVG: shfaqen pa u varur nga glifet e fontit të sistemit.
• Auto-fit jo-linear i shenjave, manual scale 50–200% dhe fixed-size me Auto fikur.
• Rrethet standard ruajnë pamjen dhe mënyrën ekzistuese të punës.
• Glow i shenjave 0–30 dhe outline i zi 0–4 px. Me 0, glow-i/outline-i hiqet.
• Nuk ka damage ring, përqindje damage-i apo tekst damage-i nën/mes rretheve.
• Nuk ka AutoFoto, foto LIVE, Ctrl+1/Ctrl+2 ose kapje automatike të makinës.
• Overlay full-screen; pa drop-shadow të zi rreth rretheve dhe pa zbehje anësore.


SHORTS STUDIO — SAKTËSISHT 4 RRETHE
-----------------------------------
1. H → Shorts → “Aktivizo Shorts · 4 rrethe”.
2. Modi aktivizon katër rrethet e para në layout 2×2 dhe kornizën 9:16.
3. Zgjidh pozicionin Lart / Mes / Poshtë. “Poshtë” e mban HUD-in mbi zonën e titullit.
4. Safe areas shënojnë zonën e butonave të YouTube në të djathtë dhe caption/title poshtë.
5. “Regjistrim i pastër” fshin panelin, guidat dhe safe-area markers; rrethet mbeten.
6. H rihap panelin dhe rikthen guidat. Mund të përdorësh edhe “Rikthe guidat 9:16”.

Katër rrethet mbeten fiks edhe nëse konfigurimi i vjetër kishte slot-e të çaktivizuara.
Rrethet shtesë vetëm nuk shfaqen gjatë Shorts dhe rikthehen më pas.
Layout-i, madhësia, pozicioni dhe gjendja e mëparshme rikthehen kur e fik Shorts.
Shorts standard mbetet plotësisht veçmas nga Series dhe nuk zëvendësohet prej tij.


SERIES STUDIO — 10 PRESET-E / 60 VARIANTE
-----------------------------------------
Preset-et në galeri:
  01 BMW
  02 Toyota LC300
  03 Lightning McQueen
  04 Mercedes G-Class
  05 Lamborghini Huracán
  06 Nissan GT-R R34
  07 Toyota Supra MK4
  08 Ford Mustang GT
  09 Jeep Wrangler
  10 Semi Truck

1. H → Series → zgjidh preset-in në galeri → “Aktivizo [modeli] Series”.
2. Secili preset ka të njëjtin model në gjashtë variante transparente, pa logo.
3. Renditja dhe paleta është e njëjtë për të 10 preset-et:
   TINY CAR / e verdhë · SMALL CAR / blu · MEDIUM CAR / portokalli ·
   NORMAL CAR / e kuqe · BIG CAR / e gjelbër · GIANT CAR / rozë.
4. Scales e variantëve janë: 0.46 / 0.58 / 0.70 / 0.82 / 0.94 / 1.06.
5. Titulli sportiv i variantit aktiv shfaqet poshtë makinave dhe ndryshon me
   zgjedhjen/auto-advance. Madhësia 70–140% dhe outline-i i zi 0–5 px rregullohen.
6. K jep PASS dhe L jep FAIL. PageUp/PageDown ose slotet në panel zgjedhin variantin.
   Auto-advance, Ctrl+Z, Reset dhe clean capture përdorin kontrollet e CreatorPack.


PAMJA SHORTS 9:16 / FULL SIZE
-----------------------------
• “Shorts 9:16” e mban serinë brenda safe-box-it vertical ekzistues.
• “Full Size” përdor gjithë viewport-in. Me global scale 100%, slot scale 100%,
  X=0 dhe hapësirë default, gjerësia reale e 6 veturave + 5 hapësirat mbushin
  ekranin nga skaji i majtë në të djathtë; nuk ngushtohet brenda kornizës 9:16.
• Lart / Mes / Poshtë e vendosin serinë në canvas-in e zgjedhur.
• Zhvendosja X -600…+600 px dhe Y -500…+500 px rregullohet me sliders.
  “Qendro X / Y” i kthen të dyja në zero pa ndryshuar pamjen Shorts/Full Size.
• Korniza 9:16 dhe safe-area guides mbeten opsionale; clean capture i fsheh.


MADHËSITË, HAPËSIRA DHE SHENJAT
-------------------------------
• Hapësira default është 14 px dhe rregullohet -24…+36 px.
• Global scale 70–130% ndryshon të gjashtë veturat njëherësh.
• Për secilin slot: X -60…+60 px dhe scale 70–130%, me reset veçmas.
• Slotet përdorin gjerësinë dhe raportin real të çdo modeli; fundi i veturave
  rrihet në të njëjtin vijë edhe për SUV, Jeep ose Semi Truck.
• Auto-fit i ri është jo-linear: TINY nis nga 40% e gjerësisë së veturës
  (më e vogël se fit-i linear 62%), ndërsa BIG/GIANT rriten gradualisht deri
  GIANT te 82%. Shenja ndjek klasën e veturës, jo vetëm një bazë të përbashkët.
• “Madhësia manuale e shenjave” 50–200% shkallëzon edhe Auto-fit-in.
  Me Auto fikur, të gjitha shenjat përdorin të njëjtën madhësi fikse.
• ✓/✕ janë SVG me outline të zi dhe glow opsional, në Series dhe rrethet standard.
• “Rikthe të gjithë pamjen” kthen hapësirën, scales, X/Y, shenjat dhe titullin
  në default. “Kthehu te Shorts standard” rikthen saktësisht 4 rrethet në 2×2.

Series është overlay/panel: nuk bën spawn dhe nuk ndryshon fizikën e makinave reale.


HOTKEYS
-------
H                 Paneli CreatorPack
K                 PASS për rrethin/slotin e zgjedhur
L                 FAIL për rrethin/slotin e zgjedhur
PageUp/Numpad4    Rrethi/sloti i mëparshëm
PageDown/Numpad6  Rrethi/sloti tjetër
G                 Reset PASS/FAIL marks
V                 Shfaq/fshih rrethet (jashtë Shorts/Series)
Ctrl+Z            Undo markimin/reset-in e fundit

Options → Controls përmban bindings për PASS, FAIL, Next, Previous, Reset, Panel,
Undo, Guides, Circles dhe Shorts 2×2. Nuk ka default binding të ri që të përplaset
me tastet e tua; mund ta caktosh Shorts vetë.


FOTOT DHE LOGOT — GALERI ME 1 KLIK
----------------------------------
• H → Fotot: zgjidh rrethin, pastaj kliko një foto në galeri.
• Rrethet → “Zgjidh foto nga galeria” e zgjedh rrethin dhe hap galerinë.
• “Ngarko nga kompjuteri” (Fotot ose Rrethet): fotoja shkon në rreth dhe ruhet
  në folderin tënd. Mund të zgjedhësh disa foto njëherësh.
• “Hap folderin”: <BeamNG user folder>\CreatorPack\imazhet. Kopjo PNG, JPG,
  JFIF, WEBP, GIF, BMP ose AVIF aty; galeria i shton vetë kur kthehesh në lojë.
  “Rifresko” i lexon menjëherë.
• Fotot e tua dalin të parat (më e reja lart) me shenjën “E JOTJA”.
• 87 imazhet e paketës (ui/modules/apps/CreatorPack/imazhet/) dalin gjithmonë,
  edhe para se të përgjigjet Lua (gallery.json).
• Logot automatike njihen nga emri i file-it (bmw.png, logo_audi.png …), edhe
  në folderin tënd — ai kontrollohet i pari.
• Fotot në rrathë ruhen si PNG të vogël (320 px) në storage-in e UI-së, prandaj
  mbeten edhe nëse file-i fshihet më vonë. Nuk merren screenshots vetë.
• Nëse CEF-i nuk e hap një file si URL, Lua e lexon dhe e dërgon në copa
  (base64), edhe për foto të mëdha (deri 24 MB).


PASTRIMI I KONFIGURIMIT
-----------------------
Fushat repair cost/damage, AutoFoto, LIVE dhe stream të konfigurimeve të vjetra
pastrohen gjatë ngarkimit. Arkivat e fotove/logove të versionit 5.11.x nuk fshihen.
Nuk ka kontroll të errësimit jashtë kornizës: Shorts/Series nuk zbeh lojën apo screenshot-in.


VERIFIKIMI
----------
• Lua në LuaJIT 2.1 të vërtetë (si loja) dhe në Lua 5.3, me API-në reale të
  BeamNG: FS:findFiles/stat/directoryCreate, io.readFileToBuffer, io.open i
  izoluar, Engine.Platform.exploreFolder, onFilesChanged. 11 kontrolle: lista,
  base64 me çdo madhësi, foto 2.4 MB në copa, emra me ë/(2)/#/%, siguria e
  rrugëve, ngarkimi, “Hap folderin” dhe rifreskimi automatik.
• Çdo komandë që paneli i dërgon Lua-s kompilohet saktësisht si në lojë
  (me callback: guihooks.trigger("onBNGAPICallback", id, komanda)).
• 20 runtime smoke checks me Angular/CEF të simuluar; 525 Angular expressions.
• End-to-end në Chromium + Lua e vërtetë e modit: klikime reale në Fotot,
  Rrethet → “Zgjidh foto nga galeria”, foto me ë/(2), “Hap folderin”,
  “Ngarko nga kompjuteri” me file chooser real, ruajtja në folder (1024 px),
  rifreskimi vetë kur kopjohet një foto, dhe një CEF “strict” që s’i hap URL-të
  e user folder-it (të gjitha fotot vijnë përmes Lua base64).
• Testet ekzistuese: Shorts/restore, 10 preset-e/60 asset-e, Full Size, X/Y,
  PASS/FAIL, auto-advance, undo/reset, glow/outline, audio dhe 87 imazhe.
• Pa JavaScript errors.

Testimi është bërë me Lua mocks dhe Chromium/Angular. Verifikimi final në instalimin
real të BeamNG bëhet nga përdoruesi. Ky dokument përshkruan CreatorPack Studio 6.3.0.
