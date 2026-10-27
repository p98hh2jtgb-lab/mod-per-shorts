DRIFTSKETCH 0.6.0 — PROTOTYPE
================================

Record a real drive, then build an object-marked path from your actual trajectory.
DriftSketch is a standalone mod. It does not require CreatorPack.

INSTALL
-------
1. Open BeamNG.drive > Mods > Open Mod Folder (or your user mods folder).
2. Copy DriftSketch_v0.6.0.zip there without extracting it.
3. Enable DriftSketch in the Mod Manager if needed.
4. In a map, open the top app menu > Add App > DriftSketch.

WORKFLOW
--------
1. Choose Mesh, Spacing, Base width and the other settings.
2. Press Start and drive the line you want.
3. Press Stop & Build. Both sides are always generated.
4. Drive the generated path or open BeamNG's replay; the generated TSStatic
   objects are designed to remain in the scene for replay.
5. Change settings and use Rebuild to regenerate saved drives without recording
   again. Keep builds controls whether a new run preserves older runs.
6. Clear generated objects & saved drives deletes only this mod's generated
   objects and saved paths. It does not clear map objects or other mods.

NEW IN 0.6.0
------------
- Added two original tire meshes: Single Tire for light path markers and Tire
  Stack (three stacked tires) for visible clipping points. Both are real
  TSStatic meshes, work on both sides, support Rebuild/Clear and use the same
  optional Solid / car damage mode as the cones.
- Tire radius is included in Drift widen and swept turn clearance. Drift widen
  OFF still preserves exact manual width.
- Single Tire is 352 triangles; Tire Stack is 768 triangles. No JBeam tire
  vehicles or extracted BeamNG assets are used.

- Added swept turn clearance. Cones are now checked against the full oriented
  vehicle rectangle at nearby recorded poses and at intermediate poses between
  them. This catches cones from adjacent path points that could otherwise end
  up under the side, rear bumper or rear wing during a turn.
- When available, the real OOBB half axes are projected onto the vehicle basis,
  so accessories such as a rear wing can contribute to the footprint. Vehicles
  without initialized OOBB data use the safe initial-dimension fallback.
- If a cone is inside that swept footprint, it is pushed outward along its
  path normal. In extreme turns where no reasonable outward position is safe,
  that cone is skipped instead of being placed inside the car or forming a
  large distorted loop. Both sides are still generated wherever space allows.
  Nearly stacked cones are also thinned after an outward correction.
- The clearance pass runs only while building/rebuilding, not while driving.
  It uses a spatial grid and the existing performance cap; it does not create
  JBeam props or perform per-frame physics queries.
- Drift widen OFF bypasses this automatic adjustment and preserves exact fixed
  manual width as requested.

DRIFT WIDTH / REAR CLEARANCE
----------------------------
- Drift widen is ON by default. Base width is the manual minimum: a car
  driving straight keeps that base width, while a sideways car gets extra room.
- Clearance uses the vehicle's real OOBB half axes when available (with its
  initial length/width as fallback) plus its forward direction relative to the
  path normal. The full oriented footprint is used, including the rear overhang,
  rather than only protecting the front.
- Recording prefers the real vehicle OOBB center instead of assuming the JBeam
  reference node is the center of the car.
- Default base width is 4.2 m. For example, a typical 4.8 m car needs about
  6 m total width when fully sideways, including cone and safety clearance.
- The swept pass adds protection against neighboring poses during bends; it is
  not a promise that a different, arbitrary driving line can never intersect a
  static cone. Solid / car damage remains the option for physical impacts.

PANEL SETTINGS
--------------
Mesh: original low-poly Traffic Cone or Tall Pylon (256 triangles each),
Single Tire (352 triangles) or Tire Stack (768 triangles).
Layout: Both sides, always.
Spacing: approximate distance between cones on the same line; lower means more
cones. Inner and outer curves are sampled independently.
Base width: manual distance between the two lines; the minimum with Drift
widen ON, or the exact fixed distance with it OFF.
Drift widen: automatic extra lateral clearance for sideways driving, the rear
of the car and neighboring poses in turns. Both sides remain equal.
Mesh scale: visual object size. Clearance includes the scaled base radius.
Ground fallback: height relative to the recorded point only when no ground
raycast hits. -0.55 m is the normal starting value.
Performance cap: maximum total generated objects. Excess points are sampled
more sparsely instead of creating unlimited objects.
Smooth path: light path and heading smoothing to reduce small kinks.
Keep builds: preserve previous runs when starting a new recording.
Solid / car damage: OFF uses collisionType=None for visual-only objects. ON uses
Visible Mesh Final static collision, so impacts can stop or damage the car.
Changing this or Drift widen automatically rebuilds saved drives when stopped.
Rebuild: regenerate saved paths with current settings.
Clear: remove generated objects and saved drives only.

BEHAVIOR AND SAFETY
-------------------
- Uses real TSStatic meshes, not hundreds of JBeam cone vehicles.
- Pure rotation in place does not create a fake path.
- Smooth path keeps tight bends and independent inner/outer cone spacing.
- Swept turn clearance uses oriented 2D rectangle/ray tests and a spatial grid;
  it runs during Stop & Build or Rebuild, never in the live recording loop.
- Collision reloads happen only when switching between visual and solid modes.
- Generated objects are tagged DriftSketch_Cones and tracked individually.
- Vehicle-specific settings are not required; dimensions and direction are
  read from the active vehicle while recording.

VALIDATION
----------
Automated Lua smoke tests cover straight versus sideways clearance, full rear
footprint allowance, exact fixed width with Drift widen OFF, curved spacing,
stationary spins, collision switching and replay-object retention.
A dedicated drifting-bend regression checks every generated cone against
nearby and intermediate vehicle poses; the old 0.4.0 algorithm fails that test.
A separate check covers real OOBB half-axis/rear-wing clearance and fallback
behavior. Mesh selection tests cover cone, pylon, Single Tire and Tire Stack,
including tire-specific clearance. A long-run stress case covers roughly 700
points and 1,500+ objects.
Angular runtime and Chromium interaction tests cover the panel and commands.
A real BeamNG pass is still recommended for each vehicle/map to tune width,
ground fallback, collision behavior and performance for your driving style.

PROTOTYPE ASSETS
----------------
The cone, pylon and tire meshes were created specifically for DriftSketch. They
are original low-poly placeholder assets, not extracted BeamNG content. Replace or
license assets appropriately before using them in a commercial redistribution.
