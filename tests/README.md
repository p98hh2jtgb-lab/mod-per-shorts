# DriftSketch 0.9.25 — validation & mock tests

The mod ships as `DriftSketch_v0.9.25.zip` (install it as a ZIP in BeamNG.drive's
Mods folder). This folder contains only the checks used to validate the release;
nothing here is loaded by the game.

## The regression this release fixes

0.9.23 was rejected ("prap problemi njejt") and 0.9.24 was rejected with five
screenshots and *"rruga shum gjon ama prek, teper keq, rruga kaq gjon plus
trailerin spe llogarit prap"*: the panel showed `clone #2775 · Auto` (so detection
worked), `rigPad` 1.8 m then 0 m, 207 points / 226.4 m / 941 meshes — yet the
road was **far too wide** and the trailer **still touched** the cones at 0, 1, 29,
83 and 97 km/h.

Root cause: 0.9.24 stored a single scalar width at the **car's** station and
applied it **symmetrically to both cone lines**, with a ±6-sample "lag" guess. A
collision-glued trailer sits 4–5 m **behind** the car (≈18–20 stations at 0.25 m
resampling) and swings to one side in a drift. So the extra width landed on the
empty side (wide road) while the stations the trailer actually crossed stayed
narrow (clipping). The tight detection tolerance (0.60 m / 13°) also dropped the
rig during fast drifts.

0.9.25 replaces the scalar with a **second centreline**: at every path point the
real world centre, dimensions **and own heading** of the trailer are recorded as
a rotated rectangle. `corridorNeeds` then scans up to 10 m along the line and
raises `needLeft` / `needRight` **independently**, so cones move out only on the
side where the trailer passes. Drives saved by 0.9.4/0.9.23/0.9.24 have no such
data; `buildRigProfile` synthesizes it at build time from the current live
relative rig pose (including its articulation), projected onto each station's
own heading — so **REBUILD fixes old drives without re-recording**. A World Editor
selection alone is also sufficient at build time.

All clean-rollback properties remain exact 0.9.4: no topple/animation, no
`DriftSketch Counter` app, no HUD numbers, no sound, no JBeam-per-cone, no
per-frame cone scan. All optional extras (gates, rings, Solid collision) are OFF
by default; cones are lightweight `TSStatic` objects with `collisionType=None`.

## How the rig logic works

* `rigPad` (default **1.0 m**, 0–4 m) is now only a **global safety floor** added
  to both lines. The real clearance comes from `p.rigPoses`. Set it to 0 for
  fully tight lines.
* `rigMargin` is added to the trailer rectangle only — extra room on the trailer
  side, not a wider road everywhere.
* `sampleRig` writes `p.rigPoses = {{x,y,fx,fy,hl,hw}, ...}` at each recorded
  station; `copyRigPoses` / `interpRigPoses` preserve them through
  resample/smooth and serialization. `applyRigLag` only fills the short lead-in
  and tail.
* `corridorNeeds` uses `RIG_REACH = 10.0` m (not a fixed station count), projects
  each trailer rectangle onto the station's tangent/normal and takes
  `max(needLeft, rlat + extent)` / `max(needRight, extent - rlat)`.
* The finish row is placed behind the trailer's rear (`rigRear`), not just the
  car's rear.
* `Hapësira minimale` slider and `✓ N pika të vijës së rimorkios` indicator are
  in the rig section **at the top** of the panel.
* `Përdor rimorkion e zgjedhur` reads `editor.selection.object`, rejects our own
  generated cones and the player car, accepts vehicles *and* TSStatic props,
  measures the rig and calls `M.rebuild()` immediately.
* Auto-detection (relaxed to 1.50 m / 0.85 dot, registration never dropped
  mid-drive) runs at each recorded path point during FILLO **and** at 3 Hz during
  replay/idle until it finds a rig or 90 s elapse. The candidate list is cached
  for 1.5 s and capped at 32 objects: a 41-point drive reads the vehicle list
  **once**, never per frame and never over the cones.
* Coupler/hitch events (`onCouplerAttached` / `onCouplerDetached`) still register
  vehicles. All registrations are session-scoped.

## Run everything

```bash
# 0) one-time dependencies (the sandbox uses --target because of PEP 668)
pip install --target /home/user/work/pylib lupa
npm install --prefix /home/user/work/nodemod css-tree@3.2.1
export PYTHONPATH=/home/user/work/pylib
export CSSTREE=/home/user/work/nodemod/node_modules/css-tree

# 1) Lua behaviour against a mocked BeamNG GE environment (44 checks)
python3 tests/run_mock.py DriftSketch_v0.9.25.zip
#    -> geometric proof: NO cone sits inside any recorded trailer footprint,
#       the trailer side widens and the EMPTY side stays at the 0.9.4 width;
#       also drifting (heading != tangent), articulated (trailer's own heading),
#       wobbling collision-glued and 6 m-long trailers, old-drive synthesis,
#       World Editor selection, replay observer, serialization, migration and
#       bounded vehicle enumeration.

# 2) UI controller + panel wiring (63 checks)
node tests/ui_mock_test.js ui/modules/apps/DriftSketch/app.js

# 3) static package validation (166 checks without a baseline, 181 with one)
python3 tests/validate.py DriftSketch_v0.9.25.zip
#    optionally add an extracted exact-0.9.4 folder for +15 byte comparisons:
python3 tests/validate.py DriftSketch_v0.9.25.zip /path/to/v094
```

`tests/validate.py` checks the 20-file 0.9.4 layout, Lua `loadfile`, `node
--check`, all JSON, version strings, css-tree CSS parsing, balanced HTML tags,
forbidden rollback residue, the top-of-panel rig section, removal of the
symmetric scalar widening, one-sided clearance, cached/capped candidates,
observer throttling and SHA-256 hashes of every untouched art asset.

Running the same geometric suite against the 0.9.24 Lua fails the two asymmetry
checks (`empty side stays TIGHT` and `drift widens the TRAILER side`) — that is
the regression this release targets.

## Release notes

* New ZIP only — `DriftSketch_v0.9.1.zip`, `DriftSketch_v0.9.21.zip`,
  `DriftSketch_v0.9.22.zip`, `DriftSketch_v0.9.23.zip`,
  `DriftSketch_v0.9.24.zip` and the other archives are untouched.
* Install one DriftSketch ZIP at a time and restart BeamNG.drive after swapping.
* Old drives rebuild automatically; if cones still look too close, raise
  **Margjinë sigurie** (trailer side only) or **Hapësira minimale** (both sides).
  If they look too far, lower both. Raise **Performance cap** slightly if the
  wider finish row makes the side lines sparser.
* No BeamNG in-game verification was possible here; the checks above are mock /
  static / geometric.
