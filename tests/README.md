# DriftSketch 0.9.21 — validation & mock tests

The mod itself is shipped as `DriftSketch_v0.9.21.zip` (install it as a ZIP in
BeamNG.drive's Mods folder). This folder only holds the checks used to validate
the release; nothing here is loaded by the game.

## Run everything

```bash
# 1) Lua behaviour with a mocked BeamNG GE environment (needs `lupa`)
pip install lupa
python3 tests/run_mock.py DriftSketch_v0.9.21.zip

# 2) UI panel wiring with a mocked Angular/$window/bngApi (needs node)
node tests/ui_mock_test.js <extracted-mod>/ui/modules/apps/DriftSketch/app.js

# 3) Lua/JS/JSON/CSS/HTML static validation (needs node + optional css-tree)
CSSTREE=<path-to-css-tree> python3 tests/validate.py DriftSketch_v0.9.21.zip \
    DriftSketch_v0.9.20.zip
```

`validate.py` accepts either a ZIP or an extracted mod folder; the optional
second argument is the previous release, used to assert that counter/HUD, the
NEON BADGE/OUTLINE templates, artwork and sound are byte-identical.

## What the Lua mock proves

* `editor.selection.object` is read as an array of numeric World Editor object
  IDs; the selected object must be a `BeamNGVehicle` (a TSStatic cone is rejected).
* A World Editor-parented trailer with **no coupler** topples a cone and fires
  the counter hit event after “Përdor rimorkion e zgjedhur”.
* An unrelated, unlinked car sitting on the same cone topples nothing (there is
  no map-wide vehicle scan).
* “Hiq rimorkion e zgjedhur”, per-row × and “Hiq të gjitha” unregister; an
  unregistered trailer no longer topples cones.
* The 0.9.20 coupler path still works, and detaching it stops toppling.
* Path recording / build / rebuild / clear still behave as before; Clear still
  refreshes the collision world (0.9.19 fix).
* 0.9.20 settings migrate verbatim (including OFF switches, 300% sound gain and
  HUD size), while the 0.9.9 legacy conversions still apply.
* Defaults: topple ON, physical collision OFF, photo-card OFF, OUTLINE, 300% gain.

Results for this release: **74 Lua mock checks, 15 UI mock checks,
49 static checks — 0 failures.**
