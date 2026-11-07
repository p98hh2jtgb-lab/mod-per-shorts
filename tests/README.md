# DriftSketch 0.9.24 — validation & mock tests

The mod ships as `DriftSketch_v0.9.24.zip` (install it as a ZIP in BeamNG.drive's
Mods folder). This folder contains only the checks used to validate the release;
nothing here is loaded by the game.

## The regression this release fixes

Screenshots after 0.9.23 showed the trailer still clipping the cones. The panel
read **v0.9.23**, `Rebuilt: gap 0.00 m, spacing 0.5 m`, 434 path points /
496.5 m / 1992 meshes: an **old saved drive**, not a new recording. 0.9.23 only
detected the trailer while recording, so a rebuilt old drive had no rig data and
stayed narrow. The new controls were also at the bottom of the panel, below the
visible area.

0.9.24 fixes it by applying a **build-time trailer width** (`rigPad`, default
2.0 m, slider 0–4 m) to *every* drive at build/rebuild time — including old
saves. The trailer section is now at the **top** of the panel, World Editor
selection sizes the corridor and rebuilds immediately (vehicles *and* TSStatic
prop trailers accepted), and detection also runs during replay / idle.

All clean-rollback properties remain: no topple/animation, no `DriftSketch
Counter` app, no HUD numbers, no sound, no JBeam-per-cone, no per-frame cone
scan. All optional extras (gates, rings, Solid collision) are OFF by default;
cones are lightweight `TSStatic` objects with `collisionType=None`.

## How the rig logic works

* `rigPad` is added to the corridor half-width in `corridorNeeds` **whenever the
  track is built**. Setting it to 0 restores the exact 0.9.4 lines. Changing the
  slider schedules a rebuild, so existing saved drives widen with no new run.
* `Përdor rimorkion e zgjedhur` reads `editor.selection.object`, rejects our own
  generated cones and the player car, accepts any other object, measures its
  lateral envelope with `rigPadFor()` and calls `M.rebuild()` immediately.
* Auto-detection (3 consecutive stable relative poses within 12 m) runs at each
  recorded path point during FILLO **and** at 3 Hz during replay/idle until it
  finds a rig or 90 s elapse. It never enumerates cones and never runs per frame.
* Coupler/hitch events (`onCouplerAttached` / `onCouplerDetached`) still register
  vehicles. All registrations are session-scoped.

## Run everything

```bash
# 0) one-time dependencies (the sandbox uses --target because of PEP 668)
pip install --target /home/user/work/pylib lupa
npm install --prefix /home/user/work/nodemod css-tree@3.2.1
export PYTHONPATH=/home/user/work/pylib
export CSSTREE=/home/user/work/nodemod/node_modules/css-tree

# 1) Lua behaviour against a mocked BeamNG GE environment (56 checks)
python3 tests/run_mock.py DriftSketch_v0.9.24.zip
#    -> proves an old 0.9.4 saved drive widens 1.54 m -> 3.54 m on restore,
#       slider rebuild and setting 0 m both work, hitch-less trailer detection,
#       a TSStatic prop trailer is accepted, replay observer is throttled,
#       plus coupler hooks, serialization and 0.9.4/0.9.2x settings migration
#       without topple/counter/sound.

# 2) UI controller + panel wiring (59 checks)
node tests/ui_mock_test.js ui/modules/apps/DriftSketch/app.js

# 3) static package validation (149 checks without a baseline)
python3 tests/validate.py DriftSketch_v0.9.24.zip
#    optionally add an extracted exact-0.9.4 folder for +15 byte comparisons:
python3 tests/validate.py DriftSketch_v0.9.24.zip /path/to/v094
```

`tests/validate.py` checks the 20-file 0.9.4 layout, Lua `loadfile`, `node
--check`, all JSON, version strings, css-tree CSS parsing, balanced HTML tags,
forbidden rollback residue, the top-of-panel rig section, build-time `rigPad`,
observer throttling and SHA-256 hashes of every untouched art asset.

## Release notes

* New ZIP only — `DriftSketch_v0.9.1.zip`, `DriftSketch_v0.9.21.zip`,
  `DriftSketch_v0.9.22.zip`, `DriftSketch_v0.9.23.zip` and the other archives
  are untouched.
* Install one DriftSketch ZIP at a time and restart BeamNG.drive after swapping.
* Old drives rebuild wider automatically; if the cones now look too far away,
  lower **Gjerësia shtesë** (1.0–1.5 m) or set 0 m when driving without a
  trailer. Raise **Performance cap** slightly if the wider finish row makes the
  side lines sparser.
