#!/usr/bin/env python3
"""Static package validation for DriftSketch 0.9.26 (Node Grabber co-motion).

Usage: PYTHONPATH=/home/user/work/pylib CSSTREE=/home/user/work/nodemod/node_modules/css-tree \
       python3 validate.py <dir-or-zip> [baseline-0.9.4-dir-or-zip]

The optional baseline argument adds a byte-for-byte comparison against an
extracted exact 0.9.4 package; the built-in SHA-256 table always runs.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

total = failed = 0
def check(cond, msg):
    global total, failed
    total += 1
    if not cond:
        failed += 1
        print('FAIL: ' + msg)
    else:
        print('ok  : ' + msg)

def load(target):
    p = Path(target)
    if p.is_dir():
        return p, None
    if p.is_file() and zipfile.is_zipfile(p):
        tmp = tempfile.mkdtemp(prefix='ds0924_')
        with zipfile.ZipFile(p) as z:
            z.extractall(tmp)
        return Path(tmp), tmp
    raise SystemExit('Not a directory or ZIP: ' + str(p))

src, tmp1 = load(sys.argv[1])
base, tmp2 = (load(sys.argv[2]) if len(sys.argv) > 2 else (None, None))
CSSTREE = os.environ.get('CSSTREE', '/home/user/work/nodemod/node_modules/css-tree')

# SHA-256 of every art asset in the exact 0.9.4 ZIP (c3c4c457...). Keeping them
# here means the check is self-contained and needs no baseline download.
import hashlib
ASSET_HASHES = {
    'art/shapes/driftsketch_v09/apex_bump.dae': '572e51f09fbb6fff8d942f75f518671026fad1e71f36ec5f8e3e506e41fb51e5',
    'art/shapes/driftsketch_v09/brake_board_100.dae': 'b3e9ba1f4d85728a8f4e3379f5a807bc387e525d9c0aebc050b281601a6f477f',
    'art/shapes/driftsketch_v09/brake_board_50.dae': 'd36a8c0bfc1c4c79db375ade5029c4942892e9ab43fb4e7c09de2907641640c7',
    'art/shapes/driftsketch_v09/checkered_flag.dae': 'dbdefa98c09aaf6148b3c3b1c9ae71bfd14ea5fb4142093d982b93e170f945cf',
    'art/shapes/driftsketch_v09/cone.dae': 'af2ac877add00116b98be7abe2536d0fe1a4cc2db2ce078b6e2ff61ac314eed6',
    'art/shapes/driftsketch_v09/gate_finish.dae': '0bc965c371f88c76a6246c8a0b42baad86853a60e5566e703e0a7c080e2a50d9',
    'art/shapes/driftsketch_v09/gate_start.dae': '244ef26810c21e0e5abae44409c7d412d54718a203d98ba75e8e2353c1acf448',
    'art/shapes/driftsketch_v09/main.materials.json': 'b7801a122f2701f5366b9d8220072d2dabca37836a8acac8bca9a3563763b77b',
    'art/shapes/driftsketch_v09/race_curb.dae': 'f93e022c1924d2940475595233dae7d8c79ce18b9fcfd5fc934ec4611660faf1',
    'art/shapes/driftsketch_v09/ring.dae': 'a601bac3c35954761d645f6f8f9edf629d8de95954fe9a6b3f2f29500a8f8cf0',
    'art/shapes/driftsketch_v09/tire_stack_blue.dae': '1e151c02bba247fba8ce6107cdf7c6443e6052de4a9fa5f5d57a690d1e1f7a45',
    'art/shapes/driftsketch_v09/tire_stack_red.dae': 'f3cd6d4ecee26fe489c4155ca895360b6245f8657eb7eeb6bf0e73bd8b2bf3ee',
    'art/shapes/driftsketch_v09/tire_stack_white.dae': 'cd6e0edb14a8d6fd77842e685abdf1abec718562b68aa9dae4206709692efcb6',
    'ui/modules/apps/DriftSketch/app.png': '12dcaf4577a664d00b3b63a25f82fd5d4bacd58e1f44bae68c176177ab4d2f04',
}

files = sorted(str(f.relative_to(src)) for f in src.rglob('*') if f.is_file())
basefiles = (sorted(str(f.relative_to(base)) for f in base.rglob('*') if f.is_file())
             if base is not None else files)
EXPECTED_FILES = sorted([
    'README.txt', 'mod.json', 'lua/ge/extensions/driftSketch.lua',
    'ui/modules/apps/DriftSketch/app.html', 'ui/modules/apps/DriftSketch/app.js',
    'ui/modules/apps/DriftSketch/app.json',
] + [p for p in ASSET_HASHES])
print('== files ==')
check(len(files) == 20, 'package has the 20 expected 0.9.4-layout files (got %d)' % len(files))
check(files == EXPECTED_FILES, 'exact 0.9.4 file layout, no files added or removed')
if base is not None:
    check(files == basefiles, 'no files added or removed vs supplied baseline')
for rel in ['mod.json', 'README.txt', 'lua/ge/extensions/driftSketch.lua',
            'ui/modules/apps/DriftSketch/app.html', 'ui/modules/apps/DriftSketch/app.js',
            'ui/modules/apps/DriftSketch/app.json', 'ui/modules/apps/DriftSketch/app.png',
            'art/shapes/driftsketch_v09/cone.dae', 'art/shapes/driftsketch_v09/main.materials.json']:
    check(rel in files, 'present: ' + rel)
check(not any(n.startswith('DriftSketch_v') and n.endswith('.zip') for n in files),
      'no nested ZIP')

print('== JSON ==')
for rel in ['mod.json', 'ui/modules/apps/DriftSketch/app.json',
            'art/shapes/driftsketch_v09/main.materials.json']:
    try:
        data = json.loads((src / rel).read_text())
        check(True, 'valid JSON: ' + rel)
    except Exception as e:
        data = {}
        check(False, 'valid JSON: ' + rel + ' — ' + str(e))
    if rel != 'art/shapes/driftsketch_v09/main.materials.json':
        check(data.get('version') == '0.9.26', rel + ' version 0.9.26')
check('DriftSketch' in json.loads((src / 'mod.json').read_text()).get('name', '') or
      'DriftSketch' in json.loads((src / 'mod.json').read_text()).get('description', ''),
      'mod.json identifies DriftSketch')

print('== scripts ==')
lua_rel = 'lua/ge/extensions/driftSketch.lua'
lua = (src / lua_rel).read_text()
js = (src / 'ui/modules/apps/DriftSketch/app.js').read_text()
html = (src / 'ui/modules/apps/DriftSketch/app.html').read_text()
readme = (src / 'README.txt').read_text()
try:
    from lupa import LuaRuntime
    l = LuaRuntime()
    res = l.execute('return loadfile(%s)' % json.dumps(str(src / lua_rel)))
    check(callable(res), 'Lua core compiles (loadfile)')
except Exception as e:
    check(False, 'Lua core compiles — ' + str(e))
for rel in [p for p in files if p.endswith('.js')]:
    r = subprocess.run(['node', '--check', str(src / rel)], capture_output=True, text=True)
    check(r.returncode == 0, 'node --check: ' + rel + ((' — ' + r.stderr.strip()) if r.returncode else ''))

print('== versions ==')
check("M.version = '0.9.26'" in lua or 'M.version="0.9.26"' in lua, 'Lua module version 0.9.26')
check("scope.modVersion = '0.9.26';" in js, 'UI modVersion 0.9.26')
check('v{{modVersion}}' in html, 'HTML footer shows modVersion')
check('0.9.26' in readme and 'NODE GRABBER' in readme, 'README documents 0.9.26 + Node Grabber')
check('ÇFARË ISHTE GABIM' in readme and '17 konë' in readme,
      'README explains the 0.9.25 Node Grabber detection failure')
check('0.9.4' not in re.findall(r'version\s*=\s*[\'"]?([\d.]+)', lua), 'no stale Lua version string')

print('== rig-aware core ==')
for token in ['motionFollow', 'rigMotion', 'RIG_COMOVE_MIN_DOT', 'RIG_COMOVE_STREAK',
              'RIG_SWING_ANGLE', 'RIG_SWING_GROW', 'M.redetectRig',
              'rigPoses', 'rigPoseCount', 'buildRigProfile', 'copyRigPoses',
              'interpRigPoses', 'RIG_REACH', 'lastRigPoseCount', 'rigRear',
              'rigPad', 'playerFrame', 'rigPadFor', 'isGeneratedMarker',
              'RIG_OBSERVE_INTERVAL', 'observeRig', 'resetRigObserver',
              'rigAware', 'rigMargin', 'RIG_MAX_DIST', 'RIG_MIN_STREAK',
              'RIG_LAG_SAMPLES', 'rigHalfWidth', 'sampleRig', 'applyRigLag',
              'activeRigEntries', 'nearbyVehicles', 'editorSelectionEntries',
              'editor.selection.object', 'rigEnabled', 'rigVehicles', 'rigCount',
              'M.useSelectedVehicle', 'M.unregisterSelectedVehicle',
              'M.unregisterVehicle', 'M.clearSelectedVehicles',
              'M.onCouplerAttached', 'M.onCouplerDetached']:
    check(token in lua, 'Lua core has ' + token)
for token in ['rigPad', 'rigPoseCount', 'rigAware', 'rigMargin', 'redetectRig',
              'useSelectedTrailer', 'unregisterSelectedTrailer',
              'unregisterTrailer', 'clearTrailers', 'rigVehicles', 'rigCount']:
    check(token in js and token in html, 'UI JS + HTML wire ' + token)
check('(Opsionale) Objekti i zgjedhur në World Editor' in html,
      'optional World Editor button (NOT required for Node Grabber)')
check('↻ RIPROVË ZBULIMIN' in html, 'Albanian Node Grabber re-scan button')
check('RIMORKIO / TRAILER' in html, 'rig section visible in panel')
check(html.index('RIMORKIO / TRAILER') < html.index('MESH &amp; TRACK SETTINGS'),
      'rig section is ABOVE the mesh settings (visible without scrolling)')
check('NODE GRABBER · NO HITCH · NO L' in html, 'panel states Node Grabber / no hitch / no L key')
check('RIPROVË ZBULIMIN' in html and 'redetectRig()' in html,
      'Node Grabber re-scan button wired to M.redetectRig()')
check('Nuk duhet ta zgjedhësh në World Editor' in html,
      'panel states World Editor selection is NOT required')
check(html.index('RIPROVË ZBULIMIN') < html.index('(Opsionale)'),
      'Node Grabber re-scan precedes the optional World Editor button')
check('Hapësira minimale' in html and 'settings.rigPad' in html, 'safety floor slider present')
check('state.rigPoseCount' in html and 'vijës së rimorkios' in html,
      'panel shows how many trailer-centreline stations were used')
check('co-motion' in readme.lower(), 'README documents co-motion detection')
check('be.nodeGrabber' in readme and 'fixCurrentNode()' in readme,
      'README documents the missing BeamNG API for node-to-node joints')
check('sampleRig(id, pos, p)' in lua, 'onUpdate samples the rig at each path point')
check('applyRigLag(points)' in lua, 'stop applies the trailer lag before building')
check('local pad = math.max(0, tonumber(SETTINGS.rigPad) or 0)' in lua,
      'corridor uses build-time rigPad (fixes old saved drives)')
check('local base = halfWidth + margin + pad' in lua,
      'build-time pad is added to BOTH cone lines')
check('stationBase = math.max(stationBase, w + margin)' not in lua,
      'symmetric scalar rig widening REMOVED (the 0.9.24 bug)')
check('needLeft = math.max(needLeft, rlat + extent)' in lua and
      'needRight = math.max(needRight, extent - rlat)' in lua,
      'one-sided clearance computed from the trailer rectangle')
check('SETTINGS.rigPad' in lua and "key == 'rigPad'" in lua,
      'rigPad is a normalised / rebuildable setting')
check('observeRig()' in lua and 'rigObserver.done' in lua,
      'replay observer exists and stops after one detection')
check('rigEnabled()' in lua, 'rig width gated by auto/manual/coupler state')

print('== clean-rollback guarantees ==')
lua_code = '\n'.join(line for line in lua.splitlines()
                     if not line.lstrip().startswith('--'))
for token in ['updateTumbles', 'movingCones', 'toppled', 'toppling', 'tumble',
              'spawn.spawnVehicle', 'spawnVehicle', 'DriftSketchCounter',
              'cone-hit.wav', '.wav', 'playSound', 'onContact', 'hudCard',
              'soundVolume', 'photoCard', 'NEON BADGE', 'outlineStyle']:
    check(token.lower() not in lua_code.lower(), 'no rollback residue: ' + token)
for token in ['topple', 'tumble', 'counter', 'hud', 'sound', 'wav']:
    check(token.lower() not in html.lower(), 'HTML free of ' + token)
    check(token.lower() not in js.lower(), 'app.js free of ' + token)
check("collisionType" in lua, 'TSStatic cones still spawned with collisionType')
check("SETTINGS.collision and 'Visible Mesh Final' or 'None'" in lua,
      'physical collision off unless explicitly enabled')
check('collision:false' in js.replace(' ', ''), 'Solid / car damage defaults OFF')
check('gates:false' in js.replace(' ', ''), 'optional gates default OFF')
check('rings:false' in js.replace(' ', ''), 'optional rings default OFF')

print('== no per-frame / map-wide work ==')
check(lua.count('sampleRig(') <= 6, 'rig sampling called only at path-recording points')
check('function M.onUpdate' in lua, 'onUpdate present')
check('be.getObjectCount' in lua, 'nearby vehicle list available for detection')
check('RIG_OBSERVE_INTERVAL = 0.30' in lua, 'replay observer is throttled to 3 Hz')
check('RIG_COMOVE_STREAK = 3' in lua and 'track.follow >= RIG_COMOVE_STREAK' in lua,
      'detection now REQUIRES co-motion, not a fixed relative pose')
check('track.follow >= need' in lua and 'motionFollow(track, rigMotion.prev' in lua,
      'sampleRig uses the co-motion score (Node Grabber)')
check('RIG_SWING_ANGLE = 0.35' in lua and 'for k = -1, 1 do' in lua,
      'old-drive synthesis emits a swing envelope of rotated rectangles')
check('rigCandidatesCache.at, rigCandidatesCache.list = clockTotal, out' in lua,
      'candidate cache TTL uses real accumulated time')
check('rigAttached[cid] = nil' not in lua, 'detected rig is never dropped mid-drive')
check('p.rigPoses = #poses > 0 and poses or nil' in lua,
      'sampleRig records the real trailer world centre')
check('buildRigProfile(path)' in lua, 'build time synthesizes a centreline for old drives')
check('RIG_OBSERVE_BUDGET = 90.0' in lua, 'replay observer has a 90 s budget')
check('rigObserver.lastAt >= RIG_OBSERVE_INTERVAL' in lua,
      'observer condition is time-based, not per frame')
check('RIG_MAX_DIST' in lua and 'pose.dist <= RIG_MAX_DIST' in lua,
      'only vehicles within the 12 m rig radius are considered')
check('RIG_CANDIDATE_TTL = 1.5' in lua and 'RIG_CANDIDATE_MAX = 32' in lua and
      'rigCandidatesCache' in lua,
      'vehicle list is cached / capped, never re-scanned per recorded point')
check('loadJsonMaterialsFile' in lua and 'useInstanceRenderData' in lua,
      'lightweight TSStatic meshes + instance rendering retained')

print('== HTML / CSS ==')
r = subprocess.run(['node', str(Path(__file__).parent / 'css_check.js'), CSSTREE,
                    str(src / 'ui/modules/apps/DriftSketch/app.html')],
                   capture_output=True, text=True)
print(r.stdout.strip())
check(r.returncode == 0, 'css-tree parse of embedded CSS')
for tag in ['div', 'label', 'button', 'details', 'summary', 'p', 'b', 'small', 'span']:
    opens = len(re.findall(r'<%s[\s>]' % tag, html))
    closes = len(re.findall(r'</%s>' % tag, html))
    check(opens == closes, 'balanced <%s> (%d/%d)' % (tag, opens, closes))
check('<style>' in html and '</style>' in html, 'single style block present')
check(html.count('<style>') == 1, 'exactly one style block')
check('ng-click="start()"' in html and 'ng-click="stop()"' in html, 'START / STOP wired')
check('ng-click="rebuild()"' in html and 'ng-click="clear()"' in html, 'Rebuild / Clear wired')

print('== unchanged assets ==')
for rel, digest in sorted(ASSET_HASHES.items()):
    f = src / rel
    check(f.is_file() and hashlib.sha256(f.read_bytes()).hexdigest() == digest,
          'byte-identical to exact 0.9.4: ' + rel)
if base is not None:
    for rel in basefiles:
        if rel.endswith(('.dae', '.png', '.materials.json')):
            check((src / rel).read_bytes() == (base / rel).read_bytes(),
                  'matches supplied baseline: ' + rel)

print('== no network / external refs ==')
for rel in [p for p in files if p.endswith(('.js', '.html', '.lua'))]:
    t = (src / rel).read_text()
    check('localhost' not in t and '127.0.0.1' not in t and 'http://' not in t,
          'no hardcoded external address in ' + rel)

print('== RESULT: %d checks, %d failed ==' % (total, failed))
for t in (tmp1, tmp2):
    if t:
        shutil.rmtree(t, ignore_errors=True)
sys.exit(1 if failed else 0)
