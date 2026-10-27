#!/usr/bin/env python3
"""Validate DriftSketch 0.9.0 COLLADA shapes, materials and Lua/geometry agreement.

Standard library only. Checks every DAE in art/shapes/driftsketch_v09:
Collada header, sources, material slots and bindings, index bounds,
non-degenerate triangles, unit normals that agree with the winding, sizes, ground
contact, and that no shape or material uses a texture. Also checks the material
JSON (colours, unique names/ids) and that the gate/ring/marker constants in the
Lua extension match the real geometry.
"""
from pathlib import Path
import json
import math
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / "DriftSketch"
ASSETS = MOD / "art" / "shapes" / "driftsketch_v09"
MATERIALS = ASSETS / "main.materials.json"
LUA = MOD / "lua" / "ge" / "extensions" / "driftSketch.lua"
NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}
P = "driftsketch09_"

EXPECTED = {
    "cone.dae": 608,
    "tire_stack_red.dae": 1184,
    "tire_stack_white.dae": 1184,
    "tire_stack_blue.dae": 1184,
    "gate_start.dae": 4270,
    "gate_finish.dae": 1872,
    "ring.dae": 1536,
}
EXPECTED_SLOTS = {
    "cone.dae": {"cone_orange", "cone_white", "cone_inner"},
    "tire_stack_red.dae": {"tire_red", "tire_red_groove", "tire_inner"},
    "tire_stack_white.dae": {"tire_white", "tire_white_groove", "tire_inner"},
    "tire_stack_blue.dae": {"tire_blue", "tire_blue_groove", "tire_inner"},
    "gate_start.dae": {"plate_dark", "truss_blue", "banner_frame", "banner_red", "check_black", "check_white",
                       "text_dark", "sponsor_blue", "sponsor_teal", "sponsor_green"},
    "gate_finish.dae": {"plate_dark", "truss_steel", "check_black", "check_white", "finish_red"},
    "ring.dae": {"ring_red", "ring_white"},
}
# (min x, max x, min y, max y, min z, max z) with a small tolerance.
EXPECTED_BOUNDS = {
    "cone.dae": (-0.205, 0.205, -0.205, 0.205, 0.0, 0.66),
    "tire_stack_red.dae": (-0.3355, 0.3355, -0.3355, 0.3355, 0.0, 0.846),
    "gate_start.dae": (-5.15, 5.15, -0.40, 0.40, 0.0, 5.95),
    "gate_finish.dae": (-5.35, 5.35, -0.45, 0.45, 0.0, 5.77),
    "ring.dae": (-3.6, 3.6, -0.3, 0.3, -0.6, 6.6),
}
MAX_BYTES = 400_000


def floats(text):
    return [float(value) for value in text.split()]


def load(name):
    root = ET.parse(ASSETS / name).getroot()
    assert root.tag == "{http://www.collada.org/2005/11/COLLADASchema}COLLADA", name
    assert root.find(".//c:unit", NS).attrib["meter"] == "1", name
    assert root.find(".//c:up_axis", NS).text == "Z_UP", name
    assert root.find(".//c:library_images", NS) is None, name + ": no textures allowed"
    assert not root.findall(".//c:texture", NS), name + ": no texture samplers allowed"
    sources = {}
    for source in root.findall(".//c:geometry/c:mesh/c:source", NS):
        array = source.find("c:float_array", NS)
        values = floats(array.text)
        assert len(values) == int(array.attrib["count"]), (name, source.attrib["id"])
        assert all(math.isfinite(v) for v in values), name
        accessor = source.find(".//c:accessor", NS)
        stride = int(accessor.attrib["stride"])
        assert int(accessor.attrib["count"]) * stride == len(values), (name, source.attrib["id"])
        sources[source.attrib["id"]] = [tuple(values[i:i + stride]) for i in range(0, len(values), stride)]
    return root, sources


def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def validate(name):
    assert (ASSETS / name).stat().st_size < MAX_BYTES, name + " is too large"
    root, sources = load(name)
    positions = next(v for k, v in sources.items() if k.endswith("-positions"))
    normals = next(v for k, v in sources.items() if k.endswith("-normals"))
    uvs = next(v for k, v in sources.items() if k.endswith("-uv"))
    for n in normals:
        assert abs(math.sqrt(dot(n, n)) - 1.0) < 2e-3, (name, "normal not unit length", n)

    material_nodes = root.findall(".//c:library_materials/c:material", NS)
    slots = {node.attrib.get("name", node.attrib["id"]) for node in material_nodes}
    assert all(slot.startswith(P) for slot in slots), (name, slots)
    assert slots == {P + s for s in EXPECTED_SLOTS[name]}, (name, sorted(slots))
    bindings = {node.attrib["symbol"]: node.attrib["target"].lstrip("#")
                for node in root.findall(".//c:instance_material", NS)}
    ids = {node.attrib["id"] for node in material_nodes}

    triangles = 0
    per_material = {}
    by_material_points = {}
    for group in root.findall(".//c:triangles", NS):
        material = group.attrib["material"]
        assert material in bindings and bindings[material] in ids, (name, material)
        inputs = {i.attrib["semantic"]: int(i.attrib["offset"]) for i in group.findall("c:input", NS)}
        assert set(inputs) == {"VERTEX", "NORMAL", "TEXCOORD"}, (name, inputs)
        stride = max(inputs.values()) + 1
        count = int(group.attrib["count"])
        idx = [int(v) for v in group.find("c:p", NS).text.split()]
        assert len(idx) == count * 3 * stride, (name, material)
        triangles += count
        per_material[material] = per_material.get(material, 0) + count
        pts = by_material_points.setdefault(material, [])
        for t in range(count):
            corners = []
            for k in range(3):
                base = (t * 3 + k) * stride
                vi, ni, ti = idx[base + inputs["VERTEX"]], idx[base + inputs["NORMAL"]], idx[base + inputs["TEXCOORD"]]
                assert 0 <= vi < len(positions) and 0 <= ni < len(normals) and 0 <= ti < len(uvs), (name, t)
                corners.append((positions[vi], normals[ni]))
            face = cross(sub(corners[1][0], corners[0][0]), sub(corners[2][0], corners[0][0]))
            area2 = math.sqrt(dot(face, face))
            assert area2 > 1e-9, (name, material, "degenerate triangle", t)
            for p, n in corners:
                assert dot(face, n) > 0, (name, material, "normal opposes winding", t)
                pts.append(p)
    assert triangles == EXPECTED[name], (name, triangles)
    assert set(per_material) == set(bindings), (name, "unused material binding")

    xs, ys, zs = [p[0] for p in positions], [p[1] for p in positions], [p[2] for p in positions]
    bounds = (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
    key = "tire_stack_red.dae" if name.startswith("tire_stack_") else name
    for got, want in zip(bounds, EXPECTED_BOUNDS[key]):
        assert abs(got - want) < 0.003, (name, bounds, EXPECTED_BOUNDS[key])
    print("OK %s: %d triangles, %d materials, bounds %s" % (
        name, triangles, len(slots), " ".join("%.3f" % b for b in bounds)))
    return by_material_points


def lua_number(source, name):
    """Value of a numeric top-level `local A, B = 1, 2` declaration."""
    for line in source.splitlines():
        stripped = line.strip()
        if not stripped.startswith("local ") or "=" not in stripped:
            continue
        lhs, rhs = stripped[6:].split("=", 1)
        names = [n.strip() for n in lhs.split(",")]
        if name not in names:
            continue
        values = [v.strip() for v in rhs.split("--")[0].split(",")]
        return float(values[names.index(name)])
    raise AssertionError("Lua constant %s not found" % name)


def check_lua_geometry(points):
    source = LUA.read_text(encoding="utf-8")
    assert "'/art/shapes/driftsketch_v09/'" in source
    assert "driftsketch_yw" not in source, "Lua must not reference the 0.8.1 asset folder"
    for shape in ("cone.dae", "gate_start.dae", "gate_finish.dae", "ring.dae"):
        assert ("'" + shape + "'") in source or ("'" + shape.replace(".dae", "") in source), shape
        assert (ASSETS / shape).exists()
    for color in re.findall(r"'(red|white|blue)'", source):
        assert (ASSETS / ("tire_stack_%s.dae" % color)).exists(), color
    for legacy in ("pylon.dae", "tire.dae'", "tire_stack.dae"):
        assert legacy not in source, legacy

    # Gate base plates: inner/outer edge and depth used by gate sizing and trimming.
    clear_half = lua_number(source, "GATE_CLEAR_HALF")
    foot_outer = lua_number(source, "GATE_FOOT_OUTER")
    foot_along = lua_number(source, "GATE_FOOT_ALONG")
    tower_center = lua_number(source, "GATE_TOWER_CENTER")
    for gate in ("gate_start.dae", "gate_finish.dae"):
        plate = points[gate][P + "plate_dark"]
        inner = min(abs(p[0]) for p in plate)
        outer = max(abs(p[0]) for p in plate)
        along = max(abs(p[1]) for p in plate)
        assert abs(inner - clear_half) < 0.011, (gate, inner, clear_half)
        assert outer <= foot_outer + 0.001 and along <= foot_along + 0.001, (gate, outer, along)
        assert abs((inner + outer) * 0.5 - tower_center) < 0.06, (gate, inner, outer)
        towers = [p for mat, pts in points[gate].items() if "truss" in mat for p in pts if p[2] < 4.0]
        assert min(abs(p[0]) for p in towers) >= clear_half, gate + ": tower inside the clear width"

    # Ring: origin is the lowest point of the clear opening; opening and tube match.
    opening = lua_number(source, "RING_OPENING")
    tube = lua_number(source, "RING_TUBE")
    ring = [p for pts in points["ring.dae"].values() for p in pts]
    zc = opening * 0.5
    radii = [math.hypot(p[0], p[2] - zc) for p in ring]
    assert abs(min(radii) - opening * 0.5) < 0.02, (min(radii), opening)
    assert abs(max(radii) - (opening * 0.5 + 2 * tube)) < 0.02, (max(radii), tube)
    assert max(abs(p[1]) for p in ring) <= tube + 1e-6

    # Marker radius/height used for clearance.
    cone_radius = lua_number(source, "CONE_RADIUS")
    tire_radius = lua_number(source, "TIRE_RADIUS")
    cone = [p for pts in points["cone.dae"].values() for p in pts]
    tire = [p for pts in points["tire_stack_red.dae"].values() for p in pts]
    assert max(math.hypot(p[0], p[1]) for p in cone) <= cone_radius + 0.03
    assert max(math.hypot(p[0], p[1]) for p in tire) <= tire_radius + 0.001
    assert abs(max(p[2] for p in cone) - lua_number(source, "CONE_HEIGHT")) < 0.01
    assert abs(max(p[2] for p in tire) - lua_number(source, "TIRE_HEIGHT")) < 0.01
    print("OK Lua constants match gate plates, ring opening/tube and marker sizes")


def check_materials(used):
    data = json.loads(MATERIALS.read_text(encoding="utf-8"))
    assert set(data) == used, ("defined vs used", sorted(set(data) ^ used))
    ids = set()
    for key, material in data.items():
        assert material["name"] == key and material["mapTo"] == key, key
        assert material["class"] == "Material" and material["version"] == 1.5, key
        assert material.get("doubleSided") is False, key
        assert material["persistentId"] not in ids, key
        ids.add(material["persistentId"])
        stages = material["Stages"]
        assert len(stages) == 4 and all(stage == {} for stage in stages[1:]), key
        stage = stages[0]
        assert not any(k.lower().endswith("map") for k in stage), key + ": textures are not used"
        color = stage["baseColorFactor"]
        assert len(color) == 4 and color[3] == 1 and all(0.0 <= c <= 1.0 for c in color), key
        assert 0.0 <= stage["roughnessFactor"] <= 1.0 and 0.0 <= stage["metallicFactor"] <= 1.0, key
        r, g, b = color[:3]
        assert not (r > 0.75 and g > 0.55 and b < 0.35), key + ": no yellow"
    def rgb(short):
        return data[P + short]["Stages"][0]["baseColorFactor"][:3]
    r, g, b = rgb("cone_orange")
    assert r > 0.9 and 0.12 < g < 0.35 and b < 0.08, "traffic orange"
    for short in ("cone_white", "tire_white", "check_white", "ring_white"):
        assert min(rgb(short)) > 0.75, short
    for short in ("tire_red", "ring_red", "banner_red", "finish_red"):
        r, g, b = rgb(short)
        assert r > 0.3 and g < 0.06 and b < 0.06, short
    r, g, b = rgb("tire_blue")
    assert b > 0.5 and r < 0.1 and g < 0.2, "tire blue"
    assert max(rgb("check_black")) < 0.03 and max(rgb("tire_inner")) < 0.05
    print("OK main.materials.json: %d flat PBR materials, unique ids, no textures, no yellow" % len(data))


def main():
    assert not (MOD / "art" / "shapes" / "driftsketch_yw").exists(), "remove the 0.8.1 asset folder"
    files = sorted(p.name for p in ASSETS.iterdir())
    assert files == sorted(list(EXPECTED) + ["main.materials.json"]), files
    used = set()
    points = {}
    for name in EXPECTED:
        points[name] = validate(name)
        used.update(points[name])
    check_materials(used)
    check_lua_geometry(points)


if __name__ == "__main__":
    main()
