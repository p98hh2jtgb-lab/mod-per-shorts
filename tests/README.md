# DriftSketch 0.9.28 — validation & mock tests

The mod ships as `DriftSketch_v0.9.28.zip` (install it as a ZIP in BeamNG.drive's
Mods folder). This folder contains only the checks used to validate the release;
nothing here is loaded by the game.

## What each release fixed

The rig is **not** a World Editor object, a coupler or an `L`-key hitch. It is
attached with the **Node Grabber**: hold `CTRL`, grab a node with the left mouse
button, drop it on the other vehicle's node with the **middle mouse button**.
There is no `couplerAttached` event, no public GE API to enumerate such joints
(`be.nodeGrabber` only exposes `fixCurrentNode()` / `clearVehicleFixedNodes()`),
and the relative pose swings by metres and rotates independently at speed.

* 0.9.24/0.9.25/0.9.26 kept `rigPad` as a **global floor** fed into `math.max()`
  together with the trailer need. Six in-game screenshots showed the safety
  slider 4 → 0 m widening the **empty** side while the trailer side never moved.
  Reproduced exactly: `0→1 m: empty 1.54→2.54 m, trailer 2.99→2.99 m`.
  Detection / manual registration also silently overwrote the user's slider with
  an auto-computed `rigPadFor()`.
* 0.9.27 made `rigPad` an addition **on top of** the trailer-side requirement,
  only on the side where the trailer centre lies; removed both slider
  overwrites; projected the trailer OOBB onto the trailer's **own** heading.
  `0→1 m: trailer 2.99→3.99 m, empty 1.54→1.54 m`.
* 0.9.28 fixes the remaining failure shown in two 0.9.27 screenshots (3 km/h
  slow turn, jackknifed trailer, `✓ 2256 pika të vijës së rimorkios`, both rig
  sliders at 0 m): a **comb of cones in the middle of the road and inside the
  trailer**. When the path overlaps itself (slow spin / donut / hairpin), the
  stations that are close **in space** are far apart **in path index**.
  `markFolds()` only compares stations close along the path index, so cones from
  one lap land inside another lap's corridor; the **finish cross-row** cuts
  across the jackknifed trailer too. Reproduced with a spiral in the Lua mock:

```
0.9.27  spiral N=200 : 23 cones inside the corridor · 212 trailer-rectangle hits
        spiral N=320 : 38 cones inside the corridor · 397 hits
        clean circle : 0 / 0
0.9.28  spiral N=200 : 0 inside · 3 hits · 43 cones removed · 76 remain
        spiral N=320 : 0 inside · 3 hits · 45 cones removed · 70 remain
        clean circle : 0 / 0 · 50 / 78 cones (unchanged)
        straight drive: 0 cones removed
```

The fix is a **single build-time spatial-hash keep-out**: every final cone (both
offset lines, the side extensions and the finish cross-row) is checked against
every path station's car body disc and every recorded / synthesized rotated
trailer rectangle. Cones inside any of them are **removed**. It never widens the
corridor, never touches physics, never scans cones per frame. The panel reports
`✓ N konë u hoqën nga mbivendosja` (`state.trimmedCones`) so the user can see
it working; a normal straight drive removes 0 cones.

**Honest limit:** cones are static and built from the recorded drive. If the
user drives a different manoeuvre afterwards, the trailer can reach a place it
never occupied during recording — no offline corridor can cover that. Re-record
the manoeuvre (`START → drive → STOP & BUILD`) or add a little
`Hapësira shtesë` / `Margjinë sigurie` and `REBUILD`. This is documented in
`README.txt`.

## Running the checks

```bash
PYTHONPATH=/home/user/work/pylib python3 tests/run_mock.py DriftSketch_v0.9.28.zip
node tests/ui_mock_test.js /path/to/extracted/ui/modules/apps/DriftSketch/app.js
PYTHONPATH=/home/user/work/pylib python3 tests/validate.py /path/to/extracted /path/to/0.9.4
python3 tests/validate.py /path/to/extracted          # without the 0.9.4 baseline
node tests/css_check.js /path/to/css-tree /path/to/extracted/ui/modules/apps/DriftSketch/app.html
```

`lupa` provides a real Lua 5.x VM with a mocked BeamNG GE environment. The mock
drives a virtual car along a path, spawns TSStatic cones and checks their world
positions against the recorded trailer poses. `css-tree` is optional.

## What is asserted

* **89 Lua checks**: 0.9.4 tight corridor (1.54 m) with no rig; co-motion
  detection of a swinging Node Grabber rig; a parked car is not adopted; no
  per-frame vehicle enumeration; cones outside the trailer's **rotated
  rectangle** for rigid / drift / curved-wobble / 6 m long / articulated rigs;
  old-drive synthesis and REBUILD; replay observer; optional World Editor /
  TSStatic path; serialization, migration, unregister, coupler hooks; no topple
  / collision / HUD residue.
* **The slider sweep** (0…4 m): the empty side stays at 1.54 m, the trailer side
  gains exactly 1 m per step. Against 0.9.26 this fails.
* **Section 7 — self-overlap**: two spirals must leave 0 cones inside the
  corridor, ≤5 rectangle hits, >20 removed cones reported in the panel and >40
  outer cones still built; two clean circles must be unchanged; a straight drive
  must remove 0 cones. Against 0.9.27 this section fails (23 inside, 212 hits).
* **86 UI checks**, **217 / 202 static checks** (with / without the pristine
  0.9.4 baseline): versions, exact 0.9.4 asset SHA-256 matches, no forbidden
  rollback residue, panel ordering, CSS parse, `loadfile` and `node --check`.

No in-game verification has been performed by the test suite's author; the
screenshots that drove these fixes came from the user.
