# DriftSketch 0.9.27 — validation & mock tests

The mod ships as `DriftSketch_v0.9.27.zip` (install it as a ZIP in BeamNG.drive's
Mods folder). This folder contains only the checks used to validate the release;
nothing here is loaded by the game.

## The regression this release fixes

The rig is **not** a World Editor object, a coupler or an `L`-key hitch. It is
attached with the **Node Grabber**: hold `CTRL`, grab a node with the left mouse
button, drop it on the other vehicle's node with the **middle mouse button**.
That joins two nodes with a soft physics constraint. There is no
`couplerAttached` event, no public GE API to enumerate such joints
(`be.nodeGrabber` only exposes `fixCurrentNode()` / `clearVehicleFixedNodes()`),
and the relative pose swings by metres and rotates independently at speed.

* 0.9.24 stored one scalar width at the **car's** station and applied it
  symmetrically to both cone lines → very wide road, cones still clipped.
* 0.9.25 added the trailer centreline and one-sided clearance, but required a
  *stable relative pose*. A Node Grabber joint has no stable relative pose.
* 0.9.26 detects the rig by **co-motion**, adds a swing envelope for old drives
  and a `↻ RIPROVË ZBULIMIN` button — but kept `rigPad` as a **global floor**
  (`base = halfWidth + margin + pad`) fed into `math.max()` together with the
  trailer need.

The six in-game screenshots (v0.9.25 panel, 275 points / 408.9 m, 118 km/h,
`✓ 1788 pika të vijës së rimorkios`) showed the user dragging the safety slider
4 → 3.3 → 2.4 → 1 → 0 → 1.7 m. Pixel measurement: **the left line that touches
the trailer never moves**; the change appears on the other side and at the kink
ahead. Reproduced exactly in the mock, with the 0.9.26 Lua:

```
pad 0 m : trailer side 2.99 m  ·  EMPTY side 1.54 m
pad 1 m : trailer side 2.99 m  ·  EMPTY side 2.54 m   <-- extra metre went wrong
pad 2 m : trailer side 3.54 m  ·  EMPTY side 3.54 m
pad 4 m : trailer side 5.54 m  ·  EMPTY side 5.54 m
```

Because the trailer side was already wider than `base`, `math.max()` swallowed
the increase and every extra metre landed on the **empty** side. A second bug:
`useSelectedVehicle()` and auto-detection **silently overwrote the user's
slider** with `rigPadFor()` (a leftover from the symmetric-pad era).

0.9.27 fixes both:

* `base = halfWidth + margin` — the tight 0.9.4 lines; `rigPad` is added **on
  top** of the trailer-side requirement, **only** on the side where the trailer
  centre lies at that station (chosen from `rlat` with a 0.15 m dead zone), and
  only where a trailer pose actually contributes.
* Detection / manual registration no longer touch `SETTINGS.rigPad`.
* The trailer OOBB half axes are projected onto **the trailer's own heading**
  (`fx2, fy2`), not the car's, so a rotated trailer is not underestimated.
* Slider renamed **"Hapësira shtesë e rimorkios / Trailer extra room"**.

```
pad 0 m : trailer side 2.99 m  ·  EMPTY side 1.54 m
pad 1 m : trailer side 3.99 m  ·  EMPTY side 1.54 m
pad 4 m : trailer side 6.99 m  ·  EMPTY side 1.54 m
```

Everything else from 0.9.26 is retained: co-motion detection, recorded trailer
centreline, rotated rectangles, ±20° swing envelope for old drives, the re-scan
button, the `✓ N pika të vijës së rimorkios` indicator and the cached/capped
candidate scan.

## Running the checks

```bash
PYTHONPATH=/home/user/work/pylib python3 tests/run_mock.py DriftSketch_v0.9.27.zip
node tests/ui_mock_test.js /path/to/extracted/ui/modules/apps/DriftSketch/app.js
PYTHONPATH=/home/user/work/pylib python3 tests/validate.py /path/to/extracted /path/to/0.9.4
python3 tests/validate.py /path/to/extracted          # without the 0.9.4 baseline
node tests/css_check.js /path/to/extracted/ui/modules/apps/DriftSketch/app.html
```

`lupa` provides a real Lua 5.x VM with a mocked BeamNG GE environment
(`be`, `scenetree`, `obj`, `extensions`, `json`, ...). The mock drives a virtual
car along a path, spawns TSStatic cones and checks their world positions against
the recorded trailer poses. `css-tree` is optional; `css_check.js` falls back to
a bracket/token check.

## What is asserted

* **74 Lua checks**: 0.9.4 tight corridor (1.54 m) with no rig; co-motion
  detection of a swinging Node Grabber rig; a parked car is not adopted; no
  per-frame vehicle enumeration; the vehicle list is read only twice in a
  41-point drive; centreline station counts; cones outside the trailer's
  **rotated rectangle** (not just a circle around its centre); one-sided
  clearance for rigid, drift, curved-wobble, 6 m long and articulated rigs;
  old-drive synthesis and REBUILD; replay observer; optional World Editor /
  TSStatic prop path; serialization, migration, unregister and coupler hooks;
  no topple / collision / HUD residue.
* **The slider sweep** (0, 1, 2, 3, 4 m): every step must keep the empty side at
  1.54 m and add exactly 1 m to the trailer side. Against 0.9.26 this fails.
* **The slider is never overwritten** by auto-detection or manual registration.
* **79 UI checks** and **204 / 189 static checks** (with / without the pristine
  0.9.4 baseline): versions, exact 0.9.4 asset SHA-256 matches, no forbidden
  rollback residue, panel ordering, CSS parse, `loadfile` and `node --check`.

No in-game verification has been performed by the test suite's author; the
screenshots that drove this fix came from the user.
