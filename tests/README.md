# DriftSketch 0.9.22 — validation & mock tests

The mod itself is shipped as `DriftSketch_v0.9.22.zip` (install it as a ZIP in
BeamNG.drive's Mods folder). This folder only holds the checks used to validate
the clean rollback; nothing here is loaded by the game.

## Why this release exists

Versions 0.9.17–0.9.21 dropped to 2–3 FPS with physical cone contact + topple
enabled, and the counter numbers in the middle of the screen did not look right.
0.9.22 removes all of it: no topple/animation, no `DriftSketch Counter` app,
no HUD numbers, no sound, no physical collision option, no Coupler/World Editor
trailer registration, and no per-frame cone scan. Cones are static, lightweight
`TSStatic` objects with `collisionType=None` — exactly the 0.9.4/0.9.6–0.9.7
behaviour that worked best, without the 0.9.5 JBeam-per-cone mistake.

## Run everything

```bash
# 1) Lua behaviour with a mocked BeamNG GE environment (needs `lupa`)
pip install lupa
python3 tests/run_mock.py DriftSketch_v0.9.22.zip

# 2) UI panel wiring with a mocked Angular/$window/bngApi (needs node)
node tests/ui_mock_test.js <extracted-mod>/ui/modules/apps/DriftSketch/app.js

# 3) Lua/JS/JSON/CSS/HTML static validation (needs node + optional css-tree)
CSSTREE=<path-to-css-tree> python3 tests/validate.py DriftSketch_v0.9.22.zip \
    DriftSketch_v0.9.21.zip
```

`validate.py` and `run_mock.py` accept either a ZIP or an extracted mod folder.
The optional second argument to `validate.py` is the previous release, used to
assert the cone artwork/material/app icon are byte-identical.

## What the Lua mock proves

* The module is 0.9.22 and exposes **no** `topple`, `coneCollision`, `hud*`,
  `sound*` settings and no `toppledCount` / `displayTotal` / `extraVehicles` state.
* Stop & Build creates cones that are all `TSStatic` with `collisionType=None`.
* Driving the car straight through a cone does **not** delete, replace, rotate
  or move it; no hit/counter event is fired; no OOBB scan runs while idle.
* Rebuild restores cones, Clear removes cones and drives and still refreshes the
  collision world, Start / Stop & Build works again afterwards, settings work.
* 0.9.20/0.9.21 core settings (spacing, gap, groundOffset, maxCones, smooth,
  keepBuilds, driftWidth) migrate verbatim; removed settings are ignored and
  cannot bring topple/counter/physics back. Legacy 0.9.5 cap 500 → 2000.

Results for this release: **50 Lua mock checks, 30 UI mock checks,
67 static checks — 0 failures.**
