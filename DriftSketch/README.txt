DRIFTSKETCH 0.8.1 — RUNTIME MATERIAL FIX / YELLOW-WHITE
================================

Record a real drive, then build an object-marked path from your actual trajectory.
DriftSketch is a standalone mod. It does not require CreatorPack.

INSTALL
-------
1. Open BeamNG.drive > Mods > Open Mod Folder (or your user mods folder).
2. Remove older DriftSketch ZIP versions so two copies cannot load together.
3. Copy DriftSketch_v0.8.1.zip there without extracting it.
4. Enable DriftSketch in the Mod Manager if needed.
5. Restart BeamNG after replacing an older version so DAEs and materials reload.
6. In a map, open the top app menu > Add App > DriftSketch.

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

HOTFIX 0.8.1 — REAL RUNTIME MATERIAL LOADING / YELLOW-WHITE
----------------------------------------------------------
- The 0.8.0 material JSON existed but was not explicitly loaded before runtime
  TSStatic creation. BeamNG could therefore show its orange No Texture material.
  DriftSketch now calls loadJsonMaterialsFile once before the first TSStatic,
  after checking that the material file exists in the packed mod VFS.
- The complete asset folder moved to art/shapes/driftsketch_yw/. This fresh path
  prevents an older cached Collada shape from reusing the previous material slots.
- Gate textures now use BeamNG's recommended *.color.png source naming. Unique
  driftsketch_* Material names and mapTo entries remain covered by asset tests.
- Yellow/white is consistent across the track set: cones and pylons have yellow
  bodies with white bands; Tire Stack is yellow/white/yellow; Single Tire keeps
  black rubber and metal spokes but adds a yellow sidewall ring and white hub.
- Start and Finish use the same deliberate yellow/white motorsport language,
  with diagonal braces, post bands and crisp original 1536x288 banner textures.
  START and FINISH retain large white typography on dark, yellow-accent panels.
- Geometry budgets are unchanged: Single Tire 352 triangles, Tire Stack 768,
  each gate 220. No JBeam props or live-driving physics queries were added.

HOTFIX 0.7.1 — ONE-CLICK MESH BUTTONS
------------------------------------
- Removed the native Mesh dropdown, whose popup could not open reliably inside
  the BeamNG app viewport.
- Traffic Cone, Tall Pylon, Single Tire and Tire Stack are now four visible
  buttons. One click selects the mesh and sends the real GE setting command;
  there is no dropdown or second confirmation step.
- The active button is highlighted immediately. New selections apply to the next
  Stop & Build; use Rebuild to update an already saved drive.

NEW IN 0.7.0
------------
- Added real Start and Finish gates at the ends of the recorded path. They are
  original low-poly TSStatic meshes, not an overlay, JBeam props or extracted
  BeamNG assets. Start / Finish gates is ON by default and can be switched OFF.
- Each gate follows the local path tangent through a quaternion and TSStatic
  setPosRot. The local +Y axis faces along the path, so the frame crosses the
  driving line instead of remaining aligned to the world axes.
- Gate width adapts to the vehicle footprint, Drift widen and nearby swept or
  curved marker positions. The inner edges of the complete posts and feet stay
  at least one metre outside nearby marker lines, including after width scaling.
- Gates work with cone, pylon, Single Tire and Tire Stack paths, Both sides,
  Rebuild/Clear, replay object retention and optional Solid / car damage.
  Both gates count toward the performance cap. Turning gates OFF rebuilds saved
  drives without them and returns those two slots to the path markers.
- A closed loop whose endpoints are within 1.5 m gets a Start gate but suppresses
  an overlapping Finish gate. This keeps donut/closed-loop geometry clean.

EXISTING CLEARANCE AND TIRE PROPS
---------------------------------
- Single Tire and Tire Stack are original TSStatic meshes for light path markers
  and visible clipping points. Tire radius is included in Drift widen and swept
  turn clearance. Single Tire is 352 triangles; Tire Stack is 768 triangles.
- Swept turn clearance checks markers against the full oriented vehicle
  rectangle at nearby recorded poses and at intermediate poses between them.
  This protects the side, rear bumper and rear wing during a turn.
- When available, real OOBB half axes are projected onto the vehicle basis, so
  accessories such as a rear wing can contribute to the footprint. Vehicles
  without initialized OOBB data use the safe initial-dimension fallback.
- If a marker is inside that swept footprint, it is pushed outward along its
  path normal. In extreme turns where no reasonable outward position is safe,
  that marker is skipped instead of being placed inside the car or forming a
  large distorted loop. Nearly stacked markers are thinned after correction.
- The clearance pass runs only while building/rebuilding, not while driving.
  It uses a spatial grid and the existing performance cap; it does not create
  JBeam props or perform per-frame physics queries.
- Drift widen OFF bypasses this automatic marker adjustment and preserves exact
  fixed manual width as requested.

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
Mesh: four always-visible one-click buttons, with no dropdown: original low-poly
Traffic Cone or Tall Pylon (256 triangles each), Single Tire (352 triangles)
or Tire Stack (768 triangles).
Layout: Both sides, always.
Spacing: approximate distance between cones on the same line; lower means more
cones. Inner and outer curves are sampled independently.
Base width: manual distance between the two lines; the minimum with Drift
widen ON, or the exact fixed distance with it OFF.
Drift widen: automatic extra lateral clearance for sideways driving, the rear
of the car and neighboring poses in turns. Both sides remain equal.
Start / Finish gates: ON creates the two aligned endpoint frames and reserves
their places in the object cap; OFF removes them from saved builds.
Mesh scale: visual object size. Clearance includes the scaled base radius.
Ground fallback: height relative to the recorded point only when no ground
raycast hits. -0.55 m is the normal starting value.
Performance cap: maximum total generated objects, including endpoint gates.
Excess points are sampled more sparsely instead of creating unlimited objects.
Smooth path: light path and heading smoothing to reduce small kinks.
Keep builds: preserve previous runs when starting a new recording.
Solid / car damage: OFF uses collisionType=None for visual-only objects. ON uses
Visible Mesh Final static collision, so impacts can stop or damage the car.
Changing this, Drift widen or Start / Finish gates automatically rebuilds saved
drives when stopped.
Rebuild: regenerate saved paths with current settings.
Clear: remove generated objects and saved drives only.

BEHAVIOR AND SAFETY
-------------------
- Uses real TSStatic meshes, not hundreds of JBeam cone vehicles.
- Endpoint gates share the same tracked-object lifecycle and collision setting;
  they are rebuilt or cleared with the path and remain for replay like markers.
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
stationary spins, collision switching and replay-object retention. A runtime
regression also requires the material JSON to load exactly once before the first
TSStatic and to stay loaded across all mesh/gate rebuilds. Gate tests
cover default ON, mesh paths, endpoint positions, +Y quaternion alignment,
adaptive sideways clearance, collision/toggle rebuilds and cap reservation.
A dedicated drifting-bend regression checks every generated cone against
nearby and intermediate vehicle poses; the old 0.4.0 algorithm fails that test.
A separate check covers real OOBB half-axis/rear-wing clearance and fallback
behavior. Mesh selection tests cover cone, pylon, Single Tire and Tire Stack,
including tire-specific clearance. A long-run stress case covers roughly 700
points and 1,500+ objects.
COLLADA asset tests cover triangle counts, normals, winding, ground contact,
UV indices, packed texture paths and unique Material/mapTo resolution for every
used slot. Angular runtime and Chromium interaction tests cover the panel and
commands,
including four visible mesh buttons, no native select and one-click Tire Stack.
A real BeamNG pass is still recommended for each vehicle/map to tune width,
ground fallback, collision behavior and performance for your driving style.

PROTOTYPE ASSETS
----------------
The cone, pylon, tire and gate meshes plus both banner textures were created
specifically for DriftSketch. They are original assets, not extracted BeamNG
content. Replace or license assets appropriately before commercial redistribution.
