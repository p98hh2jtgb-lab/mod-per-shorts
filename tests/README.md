# DriftSketch 0.9.23 — validation & mock tests

The mod ships as `DriftSketch_v0.9.23.zip` (install it as a ZIP in BeamNG.drive's
Mods folder). This folder contains only the checks used to validate the release;
nothing here is loaded by the game.

## Why this release exists

Screenshots showed a trailer glued to the car with World Editor / collision
(**no coupler, no hitch, no `L` key**) clipping the cone lines: the corridor was
computed from the car footprint alone. 0.9.23 puts the cones around **both
vehicles together**. It is built on the exact 0.9.4 panel/engine, so it keeps the
clean behaviour: no topple/animation, no `DriftSketch Counter` app, no HUD
numbers, no sound, no JBeam-per-cone, no per-frame cone scan. All optional extras
(gates, rings, Solid collision) are OFF by default; cones are lightweight
`TSStatic` objects with `collisionType=None`.

## How the rig detection works

* During **FILLO** only, at each recorded path point (every ≥ 0.75 m, not every
  frame), vehicles within 12 m get their pose expressed in the car's frame.
* A vehicle is adopted after 3 consecutive samples with a fixed relative
  position (±0.60 m) and heading (~13°). A parked car or a car driving past
  cannot hold that pose, so it is rejected. A World Editor selection at FILLO is
  used as a hint but still has to pass the pose test.
* The corridor, finish row and drift widening use the maximum lateral envelope
  of car + attached vehicles, plus `Extra rig clearance` (default 0.25 m).
  `RIG_LAG_SAMPLES` smears the width ±6 stations because a trailer sits behind
  the car and cuts inside in corners.
* A normal coupler/hitch is still recognised through `onCouplerAttached` /
  `onCouplerDetached`.
* Manual fallback: `Përdor rimorkion e zgjedhur` reads `editor.selection.object`,
  accepts only `BeamNGVehicle` objects, and `Hiq të zgjedhurën` / per-row `×` /
  `Hiq të gjitha` remove them. All registrations are session-scoped.

## Run everything

```bash
# 0) one-time dependencies (the sandbox uses --target because of PEP 668)
pip install --target /home/user/work/pylib lupa
npm install --prefix /home/user/work/nodemod css-tree@3.2.1
export PYTHONPATH=/home/user/work/pylib
export CSSTREE=/home/user/work/nodemod/node_modules/css-tree

# 1) Lua behaviour against a mocked BeamNG GE environment (48 checks)
python3 tests/run_mock.py DriftSketch_v0.9.23.zip
#    -> proves 1.54 m corridor (car only) becomes 2.99 m with a glued trailer,
#       an unlinked parked car is never adopted, no enumeration while idle,
#       manual World Editor selection, coupler hooks, rebuild, serialization
#       and 0.9.4/0.9.2x settings migration without topple/counter/sound.

# 2) UI controller + panel wiring (53 checks)
node tests/ui_mock_test.js ui/modules/apps/DriftSketch/app.js

# 3) static package validation (131 checks without a baseline)
python3 tests/validate.py DriftSketch_v0.9.23.zip
#    optionally add an extracted exact-0.9.4 folder for +14 byte comparisons:
python3 tests/validate.py DriftSketch_v0.9.23.zip /path/to/v094
```

`tests/validate.py` checks the 20-file 0.9.4 layout, Lua `loadfile`, `node
--check`, all JSON, version strings, css-tree CSS parsing, balanced HTML tags,
forbidden rollback residue and SHA-256 hashes of every untouched art asset.

## Release notes

* New ZIP only — `DriftSketch_v0.9.1.zip`, `DriftSketch_v0.9.21.zip`,
  `DriftSketch_v0.9.22.zip` and the other archives are untouched.
* Install one DriftSketch ZIP at a time and restart BeamNG.drive after swapping.
* Old drives without rig data rebuild exactly as before; record a new run to get
  the car + trailer clearance.
