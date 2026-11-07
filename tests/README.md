# DriftSketch 0.9.26 — validation & mock tests

The mod ships as `DriftSketch_v0.9.26.zip` (install it as a ZIP in BeamNG.drive's
Mods folder). This folder contains only the checks used to validate the release;
nothing here is loaded by the game.

## The regression this release fixes

The rig is **not** a World Editor object, a coupler or an `L`-key hitch. It is
attached with the **Node Grabber**: hold `CTRL`, grab a node with the left mouse
button, drop it on the other vehicle's node with the **middle mouse button**.
That joins two nodes with a soft physics constraint. There is no `couplerAttached`
event, no public GE API to enumerate such joints (`be.nodeGrabber` only exposes
`fixCurrentNode()` / `clearVehicleFixedNodes()`), and the relative pose swings by
metres and rotates independently at speed.

* 0.9.24 stored one scalar width at the **car's** station and applied it
  symmetrically to both cone lines → very wide road, cones still clipped.
* 0.9.25 added the correct **trailer centreline** (world centre, dimensions, own
  heading) and one-sided clearance, but still **detected** the rig by requiring a
  *stable relative pose* (1.5 m / 0.85 dot). A Node Grabber joint has no stable
  relative pose, so detection silently failed or dropped the rig mid-drift.
  Running this suite's Node Grabber scenario against the 0.9.25 Lua leaves **17
  cones inside the trailer footprint** and no rig registered.

0.9.26 detects the rig by **co-motion**: an object that travels with the player
car (comparable displacement, roughly aligned), even while swinging, is part of
the rig. A parked car or a car passing by never accumulates the score. Old saved
drives without a recorded centreline get a **swing envelope** (three rotated
rectangles at ±20° plus a small size allowance) instead of one exact pose —
still localised to the trailer side. A new **↻ RIPROVË ZBULIMIN** button
re-measures the live rig pose with no World Editor selection.

All clean-rollback properties remain exact 0.9.4: no topple/animation, no
`DriftSketch Counter` app, no HUD numbers, no sound, no JBeam-per-cone, no
per-frame cone scan. All optional extras (gates, rings, Solid collision) are OFF
by default; cones are lightweight `TSStatic` objects with `collisionType=None`.

## How the rig logic works

* `motionFollow(track, store, id, pose, cmx, cmy)` compares the object's world
  displacement with the player car's displacement between recorded stations.
  It uses a leaky integrator (one bad sample does not erase the evidence).
  Registration requires `track.follow >= 3`; `rigHints` (optional World Editor
  selection) lowers it to 2. Registrations are kept for the whole session.
* `sampleRig` writes `p.rigPoses = {{x,y,fx,fy,hl,hw}, ...}` at each recorded
  station. `copyRigPoses` / `interpRigPoses` preserve them through
  resample/smooth and serialization; `applyRigLag` only fills the lead-in/tail.
* `corridorNeeds` scans up to `RIG_REACH = 10.0` m along the line, projects each
  trailer rectangle onto the station's tangent/normal, and raises `needLeft` /
  `needRight` **independently**. `rigPad` (default **1.0 m**) is only a global
  safety floor; `rigMargin` is added to the trailer rectangle only.
* `buildRigProfile` synthesizes old drives from the current live rig pose
  (including its measured relative rotation) and emits 3 headings per station
  with `RIG_SWING_ANGLE = 0.35` / `RIG_SWING_GROW = 0.35`.
* The finish row is placed behind the trailer's rear (`rigRear`).
* `M.redetectRig()` resets the motion trackers, keeps existing registrations and
  rebuilds from the current live pose. No hitch, no `L`, no World Editor.
* Candidate enumeration is cached for 1.5 s against `clockTotal` and capped at
  32 objects; replay detection is 3 Hz for at most 90 s and only while the car
  moves. A 41-point drive reads the vehicle list twice.

## Run everything

```bash
# 0) one-time dependencies (the sandbox uses --target because of PEP 668)
pip install --target /home/user/work/pylib lupa
npm install --prefix /home/user/work/nodemod css-tree@3.2.1
export PYTHONPATH=/home/user/work/pylib
export CSSTREE=/home/user/work/nodemod/node_modules/css-tree

# 1) Lua behaviour against a mocked BeamNG GE environment (51 checks)
python3 tests/run_mock.py DriftSketch_v0.9.26.zip
#    -> geometric proof: NO cone inside any trailer footprint for rigid,
#       drifting, articulated, wobbling, 6 m-lagging AND swinging Node Grabber
#       rigs; the empty side stays at the 0.9.4 width; a parked car is never
#       adopted; redetectRig(); old-drive synthesis; replay observer;
#       serialization; migration; bounded enumeration.

# 2) UI controller + panel wiring (72 checks)
node tests/ui_mock_test.js ui/modules/apps/DriftSketch/app.js

# 3) static package validation (182 checks without a baseline, 197 with one)
python3 tests/validate.py DriftSketch_v0.9.26.zip
#    optionally add an extracted exact-0.9.4 folder for +15 byte comparisons:
python3 tests/validate.py DriftSketch_v0.9.26.zip /path/to/v094
```

`tests/validate.py` checks the 20-file 0.9.4 layout, Lua `loadfile`, `node
--check`, all JSON, version strings, css-tree CSS parsing, balanced HTML tags,
forbidden rollback residue, the top-of-panel rig section, the Node Grabber
re-scan button, co-motion-only detection, the swing envelope, cached/capped
candidates, observer throttling and SHA-256 hashes of every untouched art asset.

Running the same Node Grabber scenario against the 0.9.25 Lua fails 3 checks
(`swinging Node Grabber trailer detected`, `centreline recorded`, `NO cone
inside the swinging trailer footprint`) — that is the regression this release
targets. Running the 0.9.24 scenario fails the two asymmetry checks.

## Release notes

* New ZIP only — `DriftSketch_v0.9.1.zip`, `DriftSketch_v0.9.21.zip`,
  `DriftSketch_v0.9.22.zip`, `DriftSketch_v0.9.23.zip`,
  `DriftSketch_v0.9.24.zip`, `DriftSketch_v0.9.25.zip` and the other archives
  are untouched.
* Install one DriftSketch ZIP at a time and restart BeamNG.drive after swapping.
* Attach the rig as usual (CTRL + LMB → MMB), then press **↻ RIPROVË ZBULIMIN**
  or **REBUILD WITH CURRENT SETTINGS**; look for `✓ N pika të vijës së
  rimorkios`. If cones are still too close, raise **Margjinë sigurie** (trailer
  side only) or **Hapësira minimale** (both sides); lower both if they look far.
* No BeamNG in-game verification was possible here; the checks above are mock /
  static / geometric.
