#!/usr/bin/env python3
"""Run the DriftSketch Lua mock test (real Lua VM, mocked BeamNG GE environment).

Usage:
    python3 tests/run_mock.py DriftSketch_v0.9.27.zip
    python3 tests/run_mock.py <extracted mod folder>

Requires: pip install lupa  (a Lua 5.x runtime embedded in Python).
"""
import sys
import tempfile
import zipfile
from pathlib import Path

try:
    from lupa import LuaRuntime
except ImportError:
    sys.exit('Missing dependency: pip install lupa')

source = Path(sys.argv[1] if len(sys.argv) > 1 else '../DriftSketch_v0.9.27.zip').resolve()
if not source.exists():
    sys.exit('Not found: ' + str(source))

holder = None
if source.is_file() and source.suffix.lower() == '.zip':
    holder = tempfile.TemporaryDirectory()
    zipfile.ZipFile(source).extractall(holder.name)
    root = Path(holder.name)
else:
    root = source

lua_file = root / 'lua/ge/extensions/driftSketch.lua'
if not lua_file.exists():
    sys.exit('Missing: ' + str(lua_file))

lua = LuaRuntime()
lua.globals().EXTENSION_PATH = str(lua_file)
lua.execute((Path(__file__).parent / 'driftSketch_mock_test.lua').read_text(encoding='utf-8'))
failed = lua.globals().TEST_FAILED or 0
total = lua.globals().TEST_TOTAL or 0
print('run_mock.py: %s checks, %s failed' % (total, failed))
sys.exit(1 if failed else 0)
