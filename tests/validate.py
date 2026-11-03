#!/usr/bin/env python3
"""Static validation for a DriftSketch mod tree. Usage: validate.py <root> [previous]"""
import json, re, subprocess, sys, hashlib
from html.parser import HTMLParser
from pathlib import Path

import tempfile, zipfile
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

# ---- JSON ------------------------------------------------------------------
json_files = sorted(root.rglob('*.json'))
check(len(json_files) == 4, 'exactly four JSON files in the mod (%d)' % len(json_files))
for p in json_files:
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        check(True, 'valid JSON: ' + str(p.relative_to(root)))
    except Exception as exc:
        check(False, 'valid JSON: %s (%s)' % (p.relative_to(root), exc))
        continue
    if p.name in ('mod.json', 'app.json'):
        check(data.get('version') == '0.9.21',
              '%s version is 0.9.21' % p.relative_to(root))

# ---- JavaScript syntax -----------------------------------------------------
js_files = sorted(root.rglob('*.js'))
for p in js_files:
    r = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
    check(r.returncode == 0, 'node --check: %s %s' % (p.relative_to(root), r.stderr.strip()))

# ---- Lua syntax ------------------------------------------------------------
lua_file = root / 'lua/ge/extensions/driftSketch.lua'
try:
    import lupa
    rt = lupa.LuaRuntime()
    res = rt.execute('return loadfile(%s)' % json.dumps(str(lua_file)))
    check(callable(res), 'Lua syntax OK (loadfile)')
except ImportError:
    r = subprocess.run(['luac', '-p', str(lua_file)], capture_output=True, text=True)
    check(r.returncode == 0, 'luac -p: %s %s' % (lua_file.name, r.stderr.strip()))
check("M.version = '0.9.21'" in lua_file.read_text(encoding='utf-8'), 'Lua reports v0.9.21')
check('editor.selection.object' in lua_file.read_text(encoding='utf-8'), 'Lua exposes editor.selection.object usage')
check('function M.useSelectedVehicle()' in lua_file.read_text(encoding='utf-8'), 'Lua exposes useSelectedVehicle')
check('function M.unregisterSelectedVehicle()' in lua_file.read_text(encoding='utf-8'), 'Lua exposes unregisterSelectedVehicle')

# ---- CSS -------------------------------------------------------------------
css_helper = Path(__file__).with_name('css_check.js')
import os
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
    check(r.returncode == 0, 'css-tree parses every embedded <style> without errors')
else:
    for p in html_files:
        css = ''.join(re.findall(r'<style>(.*?)</style>', p.read_text(encoding='utf-8'), re.S))
        check(css.count('{') == css.count('}') and css.count('(') == css.count(')'),
              'balanced CSS braces in ' + p.name)

# ---- HTML ------------------------------------------------------------------
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
class Balance(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []
    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append(tag)
    def handle_startendtag(self, tag, attrs):
        pass
    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            self.errors.append('unexpected </%s> (open: %s)' % (tag, self.stack[-3:]))
        else:
            self.stack.pop()

for p in html_files:
    parser = Balance()
    parser.feed(p.read_text(encoding='utf-8'))
    check(not parser.errors and not parser.stack,
          'balanced HTML tags in %s %s' % (p.relative_to(root), parser.errors[:2]))

panel_html = (root / 'ui/modules/apps/DriftSketch/app.html').read_text(encoding='utf-8')
panel_js = (root / 'ui/modules/apps/DriftSketch/app.js').read_text(encoding='utf-8')
for label in ['Përdor rimorkion e zgjedhur', 'Hiq rimorkion e zgjedhur', 'Hiq të gjitha',
              'RIMORKIO / AUTO SHTESË', 'Rrëzohen kur preken', 'Kontakt fizik me veturën',
              'NEON BADGE', 'OUTLINE', 'Kartela si në foto']:
    check(label in panel_html, 'panel contains "%s"' % label)
handlers = set()
for attr_value in re.findall(r'ng-(?:click|change|if|disabled|class|repeat)="([^"]*)"', panel_html):
    handlers.update(re.findall(r'\b([A-Za-z_][A-Za-z0-9_]*)\s*\(', attr_value))
for handler in sorted(handlers):
    check(('scope.%s =' % handler) in panel_js or ('scope.%s=' % handler) in panel_js,
          'Angular handler defined in app.js: %s' % handler)

# ---- Unchanged behaviour vs 0.9.20 ----------------------------------------
if previous:
    must_be_identical = [
        'ui/modules/apps/DriftSketchCounter/app.js',
        'ui/modules/apps/DriftSketchCounter/app.html',
        'ui/modules/apps/DriftSketchCounter/app.png',
        'ui/modules/apps/DriftSketchCounter/cone-hit.wav',
        'ui/modules/apps/DriftSketch/app.png',
        'art/shapes/driftsketch_v09/cone.dae',
        'art/shapes/driftsketch_v09/main.materials.json',
    ]
    for rel in must_be_identical:
        a, b = previous / rel, root / rel
        check(a.exists() and b.exists() and sha(a) == sha(b),
              'unchanged from 0.9.20: ' + rel)
    all_prev = {str(p.relative_to(previous)) for p in previous.rglob('*') if p.is_file()}
    all_new = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
    check(all_prev == all_new, '0.9.21 keeps the exact same file layout as 0.9.20')

print('== RESULT: %d checks, %d failed ==' % (checks, fails))
sys.exit(1 if fails else 0)
