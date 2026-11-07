#!/usr/bin/env python3
"""Static validation for the DriftSketch 0.9.22 clean-rollback package.

Usage: validate.py <mod-folder-or-zip> [previous-package-folder-or-zip]
Optional: CSSTREE=<path to css-tree> for full CSS parsing with node.
"""
import json, re, subprocess, sys, os, hashlib, tempfile, zipfile
from html.parser import HTMLParser
from pathlib import Path

_keep = []
def resolve_tree(value):
    path = Path(value).resolve()
    if path.is_file() and path.suffix.lower() == '.zip':
        holder = tempfile.TemporaryDirectory()
        _keep.append(holder)
        zipfile.ZipFile(path).extractall(holder.name)
        return Path(holder.name)
    return path

root = resolve_tree(sys.argv[1])
previous = resolve_tree(sys.argv[2]) if len(sys.argv) > 2 else None
checks = fails = 0

def check(cond, msg):
    global checks, fails
    checks += 1
    if not cond:
        fails += 1
        print('FAIL: ' + msg)
    else:
        print('ok  : ' + msg)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

all_files = sorted(str(p.relative_to(root)) for p in root.rglob('*') if p.is_file())
expected = sorted([
    'README.txt', 'mod.json',
    'art/shapes/driftsketch_v09/cone.dae',
    'art/shapes/driftsketch_v09/main.materials.json',
    'lua/ge/extensions/driftSketch.lua',
    'ui/modules/apps/DriftSketch/app.html',
    'ui/modules/apps/DriftSketch/app.js',
    'ui/modules/apps/DriftSketch/app.json',
    'ui/modules/apps/DriftSketch/app.png',
])
check(all_files == expected, 'mod contains exactly the 9 clean-rollback files')
check(not any('DriftSketchCounter' in f for f in all_files), 'NO DriftSketch Counter app in the ZIP')

# ---- JSON ------------------------------------------------------------------
json_files = sorted(root.rglob('*.json'))
check(len(json_files) == 3, 'exactly three JSON files (%d)' % len(json_files))
for p in json_files:
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        check(True, 'valid JSON: ' + str(p.relative_to(root)))
    except Exception as exc:
        check(False, 'valid JSON: %s (%s)' % (p.relative_to(root), exc))
        continue
    if p.name in ('mod.json', 'app.json'):
        check(data.get('version') == '0.9.22', '%s version is 0.9.22' % p.relative_to(root))

# ---- JavaScript ------------------------------------------------------------
js_files = sorted(root.rglob('*.js'))
check(len(js_files) == 1, 'only one app.js (no counter app JS)')
for p in js_files:
    r = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
    check(r.returncode == 0, 'node --check: %s %s' % (p.relative_to(root), r.stderr.strip()))

# ---- Lua -------------------------------------------------------------------
lua_path = root / 'lua/ge/extensions/driftSketch.lua'
lua_src = lua_path.read_text(encoding='utf-8')
try:
    import lupa
    rt = lupa.LuaRuntime()
    res = rt.execute('return loadfile(%s)' % json.dumps(str(lua_path)))
    check(callable(res), 'Lua syntax OK (loadfile)')
except ImportError:
    r = subprocess.run(['luac', '-p', str(lua_path)], capture_output=True, text=True)
    check(r.returncode == 0, 'luac -p: %s' % r.stderr.strip())
check("M.version = '0.9.22'" in lua_src, 'Lua reports v0.9.22')

# Code (not comments) must contain NONE of the removed features.
lua_code = '\n'.join(line for line in lua_src.splitlines() if not line.lstrip().startswith('--'))
forbidden_code = ['updateTumbles(', 'tumbleCones', 'movingCones', 'makeConeMovable',
                  'toppleRotation', 'notifyConeToppled', 'SETTINGS.topple',
                  'SETTINGS.coneCollision', 'coneCollision', 'hudTotal', 'hudLabel',
                  'hudStyle', 'soundVolume', 'soundEnabled', 'driftSketch.hit',
                  'editor.selection.object', 'onCouplerAttached', 'useSelectedVehicle',
                  'Visible Mesh', 'toppledCount']
for snippet in forbidden_code:
    check(snippet not in lua_code, 'removed code absent from Lua: ' + snippet)
check("obj:setField('collisionType', 0, 'None')" in lua_code, 'cones always spawn with collision=None')
check("pcall(createObject, 'TSStatic')" in lua_code, 'cones are TSStatic objects')
check('spawnVehicle' not in lua_code and 'spawn.spawnVehicle' not in lua_code,
      'no JBeam vehicle is spawned for a cone')

panel_js = (root / 'ui/modules/apps/DriftSketch/app.js').read_text(encoding='utf-8')
for snippet in ['Audio', 'playHitSound', 'hud', 'topple', 'sound', 'Counter', 'extraVehicles']:
    check(snippet not in panel_js, 'removed code absent from app.js: ' + snippet)

# ---- CSS -------------------------------------------------------------------
css_helper = Path(__file__).parent / 'css_check.js'
csstree = None
for candidate in [os.environ.get('CSSTREE'),
                  str(Path(__file__).parent / 'nodemod/node_modules/css-tree'),
                  str(Path(__file__).parent.parent / 'work/nodemod/node_modules/css-tree')]:
    if candidate and Path(candidate).exists():
        csstree = Path(candidate)
        break
html_files = sorted(root.rglob('*.html'))
if csstree:
    r = subprocess.run(['node', str(css_helper), str(csstree)] + [str(p) for p in html_files],
                       capture_output=True, text=True)
    print(r.stdout.strip())
    if r.stderr.strip():
        print(r.stderr.strip())
    check(r.returncode == 0, 'css-tree parses the embedded <style> without errors')
else:
    for p in html_files:
        css = ''.join(re.findall(r'<style>(.*?)</style>', p.read_text(encoding='utf-8'), re.S))
        check(css.count('{') == css.count('}') and css.count('(') == css.count(')'),
              'balanced CSS braces in ' + p.name)

# ---- HTML ------------------------------------------------------------------
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
class Balance(HTMLParser):
    def __init__(self):
        super().__init__(); self.stack = []; self.errors = []
    def handle_starttag(self, tag, attrs):
        if tag not in VOID: self.stack.append(tag)
    def handle_startendtag(self, tag, attrs): pass
    def handle_endtag(self, tag):
        if tag in VOID: return
        if not self.stack or self.stack[-1] != tag:
            self.errors.append('unexpected </%s>' % tag)
        else: self.stack.pop()

panel_html_path = root / 'ui/modules/apps/DriftSketch/app.html'
panel_html = panel_html_path.read_text(encoding='utf-8')
for p in html_files:
    parser = Balance(); parser.feed(p.read_text(encoding='utf-8'))
    check(not parser.errors and not parser.stack,
          'balanced HTML tags in %s %s' % (p.relative_to(root), parser.errors[:2]))
check('ng-model="settings.topple"' not in panel_html, 'no topple checkbox in the panel')
for label in ['● FILLO', 'NDALO', 'RINDËRTO', 'PASTRO', 'KONAT &amp; PISTA',
              'Hapësira', 'Kufiri total i konave', 'Zgjero në drift']:
    check(label in panel_html, 'panel keeps core control "%s"' % label)
for label in ['DriftSketch Counter', 'NEON BADGE', 'OUTLINE', 'Kartela si në foto',
              'Kontakt fizik me veturën']:
    check(label not in panel_html, 'panel no longer offers "%s"' % label)
handlers = set()
for attr_value in re.findall(r'ng-(?:click|change|if|disabled|class)="([^"]*)"', panel_html):
    handlers.update(re.findall(r'\b([A-Za-z_][A-Za-z0-9_]*)\s*\(', attr_value))
for handler in sorted(handlers):
    check(('scope.%s =' % handler) in panel_js or ('scope.%s=' % handler) in panel_js,
          'Angular handler defined in app.js: ' + handler)

# ---- Assets unchanged vs previous release ---------------------------------
if previous:
    for rel in ['art/shapes/driftsketch_v09/cone.dae',
                'art/shapes/driftsketch_v09/main.materials.json',
                'ui/modules/apps/DriftSketch/app.png']:
        a, b = previous / rel, root / rel
        check(a.exists() and b.exists() and sha(a) == sha(b),
              'cone artwork/icon unchanged from 0.9.21: ' + rel)

print('== RESULT: %d checks, %d failed ==' % (checks, fails))
sys.exit(1 if fails else 0)
