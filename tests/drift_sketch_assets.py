#!/usr/bin/env python3
"""Validate DriftSketch's original COLLADA meshes with only the stdlib."""
from pathlib import Path
import math
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "DriftSketch" / "art" / "shapes" / "driftsketch"
NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}
EXPECTED = {
    "cone.dae": 256,
    "pylon.dae": 256,
    "tire.dae": 352,
    "tire_stack.dae": 768,
    "gate_start.dae": 378,
    "gate_finish.dae": 418,
}


def validate(name, expected_triangles):
    root = ET.parse(ASSETS / name).getroot()
    assert root.tag == "{http://www.collada.org/2005/11/COLLADASchema}COLLADA"
    assert root.find(".//c:unit", NS).attrib["meter"] == "1"
    assert root.find(".//c:up_axis", NS).text == "Z_UP"

    sources = {}
    for source in root.findall(".//c:source", NS):
        array = source.find("c:float_array", NS)
        values = [float(value) for value in array.text.split()]
        assert len(values) == int(array.attrib["count"])
        assert all(math.isfinite(value) for value in values)
        sources[source.attrib["id"]] = values

    positions = next(v for k, v in sources.items() if k.endswith("-positions"))
    normals = next(v for k, v in sources.items() if k.endswith("-normals"))
    assert len(positions) % 3 == 0 and len(normals) % 3 == 0

    materials = {
        node.attrib["id"]
        for node in root.findall(".//c:library_materials/c:material", NS)
    }
    bindings = {
        node.attrib["symbol"]: node.attrib["target"].lstrip("#")
        for node in root.findall(".//c:instance_material", NS)
    }
    assert bindings and set(bindings.values()) <= materials

    total = 0
    minimum_z = math.inf
    for triangles in root.findall(".//c:triangles", NS):
        count = int(triangles.attrib["count"])
        total += count
        assert triangles.attrib["material"] in bindings
        indices = [int(value) for value in triangles.find("c:p", NS).text.split()]
        assert len(indices) == count * 6  # VERTEX/NORMAL pairs, three per triangle

        for offset in range(0, len(indices), 6):
            verts = [indices[offset + delta] for delta in (0, 2, 4)]
            normal_indices = [indices[offset + delta + 1] for delta in (0, 2, 4)]
            assert all(0 <= v < len(positions) // 3 for v in verts)
            assert all(0 <= n < len(normals) // 3 for n in normal_indices)
            a, b, c = ([positions[3 * v + k] for k in range(3)] for v in verts)
            u = [b[k] - a[k] for k in range(3)]
            v = [c[k] - a[k] for k in range(3)]
            cross = [
                u[1] * v[2] - u[2] * v[1],
                u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0],
            ]
            assert math.sqrt(sum(value * value for value in cross)) > 1e-10
            for normal_index in normal_indices:
                normal = normals[3 * normal_index:3 * normal_index + 3]
                assert sum(cross[k] * normal[k] for k in range(3)) > 0
            minimum_z = min(minimum_z, a[2], b[2], c[2])

    assert total == expected_triangles, (name, total, expected_triangles)
    assert abs(minimum_z) < 1e-5, (name, minimum_z)
    assert root.find("c:library_images", NS) is None
    print(
        f"OK {name}: {total} triangles, ground z={minimum_z:.6f}, "
        "indices/normals/materials/winding valid"
    )


if __name__ == "__main__":
    for filename, triangle_count in EXPECTED.items():
        validate(filename, triangle_count)
