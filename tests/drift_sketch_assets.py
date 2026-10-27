#!/usr/bin/env python3
"""Validate DriftSketch COLLADA, UVs and BeamNG material definitions."""
from pathlib import Path
import json
import math
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "DriftSketch" / "art" / "shapes" / "driftsketch_yw"
MATERIALS = ASSETS / "main.materials.json"
NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}
EXPECTED = {
    "cone.dae": 256,
    "pylon.dae": 256,
    "tire.dae": 352,
    "tire_stack.dae": 768,
    "gate_start.dae": 220,
    "gate_finish.dae": 220,
}
EXPECTED_SLOTS = {
    "cone.dae": {"driftsketch_rubber", "driftsketch_yellow", "driftsketch_white"},
    "pylon.dae": {"driftsketch_rubber", "driftsketch_yellow", "driftsketch_white"},
    "tire.dae": {"driftsketch_rubber", "driftsketch_tread", "driftsketch_yellow", "driftsketch_white", "driftsketch_metal", "driftsketch_black"},
    "tire_stack.dae": {"driftsketch_yellow", "driftsketch_white"},
    "gate_start.dae": {"driftsketch_start_banner", "driftsketch_yellow", "driftsketch_white", "driftsketch_frame", "driftsketch_black"},
    "gate_finish.dae": {"driftsketch_finish_banner", "driftsketch_yellow", "driftsketch_white", "driftsketch_frame", "driftsketch_black"},
}


def validate(name, expected_triangles):
    root = ET.parse(ASSETS / name).getroot()
    assert root.tag == "{http://www.collada.org/2005/11/COLLADASchema}COLLADA"
    assert root.find(".//c:unit", NS).attrib["meter"] == "1"
    assert root.find(".//c:up_axis", NS).text == "Z_UP"

    sources = {}
    for source in root.findall(".//c:geometry/c:mesh/c:source", NS):
        array = source.find("c:float_array", NS)
        values = [float(value) for value in array.text.split()]
        assert len(values) == int(array.attrib["count"])
        assert all(math.isfinite(value) for value in values)
        sources[source.attrib["id"]] = values

    positions = next(v for k, v in sources.items() if k.endswith("-positions"))
    normals = next(v for k, v in sources.items() if k.endswith("-normals"))
    uvs = next((v for k, v in sources.items() if k.endswith("-uv")), None)
    assert len(positions) % 3 == 0 and len(normals) % 3 == 0
    if uvs is not None:
        assert len(uvs) % 2 == 0

    material_nodes = root.findall(".//c:library_materials/c:material", NS)
    materials = {node.attrib["id"] for node in material_nodes}
    slot_names = {node.attrib.get("name", node.attrib["id"]) for node in material_nodes}
    assert all(slot.startswith("driftsketch_") for slot in slot_names)
    assert slot_names == EXPECTED_SLOTS[name], (name, slot_names)
    bindings = {
        node.attrib["symbol"]: node.attrib["target"].lstrip("#")
        for node in root.findall(".//c:instance_material", NS)
    }
    assert bindings and set(bindings.values()) <= materials

    image_files = [node.text for node in root.findall("c:library_images/c:image/c:init_from", NS)]
    for image in image_files:
        assert image and (ASSETS / image).is_file(), (name, image)
    assert len(image_files) == (1 if name.startswith("gate_") else 0)

    total = 0
    minimum_z = math.inf
    for triangles in root.findall(".//c:triangles", NS):
        count = int(triangles.attrib["count"])
        total += count
        material = triangles.attrib["material"]
        assert material in bindings
        inputs = {node.attrib["semantic"]: int(node.attrib["offset"]) for node in triangles.findall("c:input", NS)}
        assert "VERTEX" in inputs and "NORMAL" in inputs
        stride = max(inputs.values()) + 1
        indices = [int(value) for value in triangles.find("c:p", NS).text.split()]
        assert len(indices) == count * 3 * stride
        if material.endswith("_banner"):
            assert "TEXCOORD" in inputs and uvs is not None

        for offset in range(0, len(indices), stride * 3):
            verts = [indices[offset + stride * index + inputs["VERTEX"]] for index in range(3)]
            normal_indices = [indices[offset + stride * index + inputs["NORMAL"]] for index in range(3)]
            assert all(0 <= v < len(positions) // 3 for v in verts)
            assert all(0 <= n < len(normals) // 3 for n in normal_indices)
            if "TEXCOORD" in inputs:
                uv_indices = [indices[offset + stride * index + inputs["TEXCOORD"]] for index in range(3)]
                assert all(0 <= uv < len(uvs) // 2 for uv in uv_indices)

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
    print(f"OK {name}: {total} triangles, {len(slot_names)} unique materials, UV/index/normals/winding/ground valid")
    return slot_names


def validate_material_definitions(used_slots):
    data = json.loads(MATERIALS.read_text())
    assert used_slots == set(data)
    for name in sorted(used_slots):
        material = data[name]
        assert material["name"] == name and material["mapTo"] == name
        assert material["class"] == "Material" and material["version"] == 1.5
        assert len(material["Stages"]) == 4
        stage = material["Stages"][0]
        assert len(stage["baseColorFactor"]) == 4
        assert all(0 <= value <= 1 for value in stage["baseColorFactor"])
        assert 0 <= stage["metallicFactor"] <= 1
        assert 0 <= stage["roughnessFactor"] <= 1
        if "baseColorMap" in stage:
            path = stage["baseColorMap"]
            prefix = "/art/shapes/driftsketch_yw/"
            assert path.startswith(prefix)
            texture = ASSETS / path[len(prefix):]
            assert texture.is_file() and texture.name.endswith(".color.png")
            payload = texture.read_bytes()
            assert payload[:8] == b"\x89PNG\r\n\x1a\n"
            assert struct.unpack(">II", payload[16:24]) == (1536, 288)
    assert data["driftsketch_yellow"]["Stages"][0]["baseColorFactor"] == [1.0, 0.78, 0.02, 1]
    assert not {"driftsketch_orange", "driftsketch_cyan", "driftsketch_red"} & set(data)
    print(f"OK main.materials.json: {len(used_slots)} yellow/white slots resolve with mapTo and .color.png textures")


if __name__ == "__main__":
    used = set()
    for filename, triangle_count in EXPECTED.items():
        used |= validate(filename, triangle_count)
    validate_material_definitions(used)
