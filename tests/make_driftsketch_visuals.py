#!/usr/bin/env python3
"""Rebuild DriftSketch 0.8.0 materials, painted tires and textured gates.

Original procedural geometry only. Requires Pillow just for the two original
banner PNGs; all DAE/material generation otherwise uses the standard library.
"""
from pathlib import Path
import json
import math
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "DriftSketch" / "art" / "shapes" / "driftsketch"
NS = "http://www.collada.org/2005/11/COLLADASchema"
N = {"c": NS}
ET.register_namespace("", NS)

COLORS = {
    "driftsketch_rubber": (0.018, 0.023, 0.030, 1),
    "driftsketch_tread": (0.050, 0.060, 0.072, 1),
    "driftsketch_metal": (0.16, 0.19, 0.22, 1),
    "driftsketch_frame": (0.025, 0.035, 0.045, 1),
    "driftsketch_black": (0.008, 0.012, 0.018, 1),
    "driftsketch_orange": (0.95, 0.16, 0.025, 1),
    "driftsketch_cyan": (0.00, 0.62, 0.78, 1),
    "driftsketch_white": (0.88, 0.92, 0.94, 1),
    "driftsketch_red": (0.86, 0.025, 0.045, 1),
    "driftsketch_start_banner": (1, 1, 1, 1),
    "driftsketch_finish_banner": (1, 1, 1, 1),
}
PBR = {
    "driftsketch_rubber": (0.0, 0.92),
    "driftsketch_tread": (0.0, 0.88),
    "driftsketch_metal": (0.65, 0.38),
    "driftsketch_frame": (0.55, 0.42),
    "driftsketch_black": (0.15, 0.62),
    "driftsketch_orange": (0.10, 0.50),
    "driftsketch_cyan": (0.10, 0.45),
    "driftsketch_white": (0.05, 0.58),
    "driftsketch_red": (0.10, 0.48),
    "driftsketch_start_banner": (0.05, 0.58),
    "driftsketch_finish_banner": (0.05, 0.58),
}
ORDER = list(COLORS)
TEXTURES = {
    "driftsketch_start_banner": "gate_start.png",
    "driftsketch_finish_banner": "gate_finish.png",
}
RENAME = {
    "rubber": "driftsketch_rubber",
    "orange": "driftsketch_orange",
    "white": "driftsketch_white",
    "metal": "driftsketch_metal",
    "metalLight": "driftsketch_metal_light",
    "frame": "driftsketch_frame",
    "black": "driftsketch_black",
}


def E(parent, tag, attrib=None, text=None):
    node = ET.SubElement(parent, f"{{{NS}}}{tag}", attrib or {})
    if text is not None:
        node.text = text
    return node


def color_text(color):
    return " ".join(f"{value:.6f}" for value in color)


def positions_of(root):
    source = next(s for s in root.findall(".//c:source", N) if s.attrib["id"].endswith("-positions"))
    return [float(v) for v in source.find("c:float_array", N).text.split()]


def triangle_centroid(positions, indices, offset):
    verts = [indices[offset + delta] for delta in (0, 2, 4)]
    return [sum(positions[3 * v + k] for v in verts) / 3 for k in range(3)]


def classify_single(positions, indices, offset):
    x, y, z = triangle_centroid(positions, indices, offset)
    radius = math.hypot(x, y)
    sector = int((math.atan2(y, x) + math.pi) / (2 * math.pi) * 16) % 16
    if radius < 0.31 and z > 0.185:
        return "driftsketch_cyan"
    if radius > 0.39 and sector % 2 == 0:
        return "driftsketch_tread"
    return "driftsketch_rubber"


def classify_stack(positions, indices, offset):
    z = triangle_centroid(positions, indices, offset)[2]
    if z < 0.21:
        return "driftsketch_orange"
    if z < 0.42:
        return "driftsketch_white"
    return "driftsketch_cyan"


def classify_rim(positions, indices, offset):
    verts = [indices[offset + delta] for delta in (0, 2, 4)]
    zs = [positions[3 * v + 2] for v in verts]
    if max(zs) - min(zs) < 0.000001:
        x, y, _ = triangle_centroid(positions, indices, offset)
        sector = int((math.atan2(y, x) + math.pi) / (2 * math.pi) * 8) % 8
        return "driftsketch_metal" if sector % 2 == 0 else "driftsketch_black"
    return "driftsketch_metal"


def rewrite_plain_triangles(mesh, groups):
    for old in list(mesh.findall("c:triangles", N)):
        mesh.remove(old)
    for material in ORDER:
        if material not in groups:
            continue
        indices = groups[material]
        triangles = E(mesh, "triangles", {"material": material, "count": str(len(indices) // 6)})
        E(triangles, "input", {"semantic": "VERTEX", "source": f"#{mesh.find('c:vertices', N).attrib['id']}", "offset": "0"})
        # The existing assets always use the second source for normals.
        sources = mesh.findall("c:source", N)
        normal_id = next(s.attrib["id"] for s in sources if s.attrib["id"].endswith("-normals"))
        E(triangles, "input", {"semantic": "NORMAL", "source": f"#{normal_id}", "offset": "1"})
        E(triangles, "p", text=" ".join(str(v) for v in indices))


def rewrite_materials(root, used, textured=()):
    for tag in ("library_images", "library_effects", "library_materials"):
        for old in list(root.findall(f"c:{tag}", N)):
            root.remove(old)
    geometry_library = root.find("c:library_geometries", N)
    insert_at = list(root).index(geometry_library)
    used = [name for name in ORDER if name in used]
    textured = set(textured)

    images = None
    if textured:
        images = ET.Element(f"{{{NS}}}library_images")
        root.insert(insert_at, images)
        insert_at += 1
        for name in used:
            if name in textured:
                image = E(images, "image", {"id": name + "_image"})
                E(image, "init_from", text=TEXTURES[name])

    effects = ET.Element(f"{{{NS}}}library_effects")
    root.insert(insert_at, effects)
    insert_at += 1
    materials = ET.Element(f"{{{NS}}}library_materials")
    root.insert(insert_at, materials)

    for name in used:
        material = E(materials, "material", {"id": name, "name": name})
        E(material, "instance_effect", {"url": f"#{name}-effect"})
        effect = E(effects, "effect", {"id": name + "-effect"})
        profile = E(effect, "profile_COMMON")
        if name in textured:
            surface = E(E(profile, "newparam", {"sid": name + "_surface"}), "surface", {"type": "2D"})
            E(surface, "init_from", text=name + "_image")
            sampler = E(E(profile, "newparam", {"sid": name + "_sampler"}), "sampler2D")
            E(sampler, "source", text=name + "_surface")
        technique = E(profile, "technique", {"sid": "common"})
        phong = E(technique, "phong")
        E(E(phong, "ambient"), "color", {"sid": "ambient"}, color_text(tuple(v * 0.16 if i < 3 else 1 for i, v in enumerate(COLORS[name]))))
        diffuse = E(phong, "diffuse")
        if name in textured:
            E(diffuse, "texture", {"texture": name + "_sampler", "texcoord": "UVMap"})
        else:
            E(diffuse, "color", {"sid": "diffuse"}, color_text(COLORS[name]))
        E(E(phong, "specular"), "color", {"sid": "specular"}, "0.12 0.12 0.12 1")
        E(E(phong, "shininess"), "float", text="28")

    bindings = root.findall(".//c:instance_geometry/c:bind_material/c:technique_common", N)
    for binding in bindings:
        binding.clear()
        for name in used:
            instance = E(binding, "instance_material", {"symbol": name, "target": f"#{name}"})
            if name in textured:
                E(instance, "bind_vertex_input", {"semantic": "UVMap", "input_semantic": "TEXCOORD", "input_set": "0"})


def update_existing(filename):
    path = OUT / filename
    tree = ET.parse(path)
    root = tree.getroot()
    positions = positions_of(root)
    mesh = root.find(".//c:geometry/c:mesh", N)
    groups = {}
    already_new = all(t.attrib["material"].startswith("driftsketch_") for t in mesh.findall("c:triangles", N))

    for triangles in mesh.findall("c:triangles", N):
        old = triangles.attrib["material"]
        indices = [int(v) for v in triangles.find("c:p", N).text.split()]
        for offset in range(0, len(indices), 6):
            if already_new:
                material = old
            elif filename == "tire.dae" and old == "rubber":
                material = classify_single(positions, indices, offset)
            elif filename == "tire.dae" and old == "metalLight":
                material = "driftsketch_orange"
            elif filename == "tire.dae" and old == "metal":
                material = classify_rim(positions, indices, offset)
            elif filename == "tire_stack.dae" and old == "rubber":
                material = classify_stack(positions, indices, offset)
            else:
                material = RENAME.get(old, old)
            groups.setdefault(material, []).extend(indices[offset:offset + 6])

    rewrite_plain_triangles(mesh, groups)
    rewrite_materials(root, set(groups))
    comment = root.find(".//c:asset/c:contributor/c:comments", N)
    if comment is not None:
        comment.text = "Original DriftSketch 0.8.0 mesh with unique BeamNG material slots; no extracted game assets"
    tree.write(path, encoding="utf-8", xml_declaration=True)
    print(filename, "materials", {key: len(value) // 6 for key, value in groups.items()})


def subtract(a, b):
    return tuple(x - y for x, y in zip(a, b))


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def multiply(a, value):
    return tuple(x * value for x in a)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def normalize(a):
    length = math.sqrt(dot(a, a))
    return tuple(v / length for v in a)


class Mesh:
    def __init__(self):
        self.positions = []
        self.normals = []
        self.uvs = []
        self.groups = {}

    def vertex(self, position, normal, uv=(0, 0)):
        self.positions.append(position)
        self.normals.append(normal)
        self.uvs.append(uv)
        return len(self.positions) - 1

    def face(self, material, points, uvs=None, center=None):
        points = list(points)
        uvs = list(uvs or [(0, 0)] * len(points))
        normal = normalize(cross(subtract(points[1], points[0]), subtract(points[2], points[0])))
        if center is not None:
            face_center = tuple(sum(p[k] for p in points) / len(points) for k in range(3))
            if dot(normal, subtract(face_center, center)) < 0:
                points.reverse()
                uvs.reverse()
                normal = multiply(normal, -1)
        ids = [self.vertex(p, normal, uv) for p, uv in zip(points, uvs)]
        group = self.groups.setdefault(material, [])
        for index in range(1, len(ids) - 1):
            group.append((ids[0], ids[index], ids[index + 1]))

    def box(self, center, dimensions, material):
        dx, dy, dz = (v / 2 for v in dimensions)
        cx, cy, cz = center
        p = [
            (cx - dx, cy - dy, cz - dz), (cx + dx, cy - dy, cz - dz),
            (cx + dx, cy + dy, cz - dz), (cx - dx, cy + dy, cz - dz),
            (cx - dx, cy - dy, cz + dz), (cx + dx, cy - dy, cz + dz),
            (cx + dx, cy + dy, cz + dz), (cx - dx, cy + dy, cz + dz),
        ]
        for face in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.face(material, [p[i] for i in face], center=center)

    def beam(self, a, b, width, depth, material):
        direction = normalize(subtract(b, a))
        side = normalize(cross(direction, (0, 1, 0)))
        up = (0, 1, 0)
        corners = []
        for endpoint in (a, b):
            for sign_side, sign_up in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                corners.append(add(endpoint, add(multiply(side, sign_side * width / 2), multiply(up, sign_up * depth / 2))))
        center = multiply(add(a, b), 0.5)
        for face in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.face(material, [corners[i] for i in face], center=center)

    def front_quad(self, x, z, width, height, y, material, textured=False):
        points = [(x - width / 2, y, z - height / 2), (x + width / 2, y, z - height / 2),
                  (x + width / 2, y, z + height / 2), (x - width / 2, y, z + height / 2)]
        uvs = [(0, 0), (1, 0), (1, 1), (0, 1)] if textured else None
        self.face(material, points, uvs)


def make_gate(text):
    mesh = Mesh()
    accent = "driftsketch_cyan" if text == "START" else "driftsketch_red"
    banner = "driftsketch_start_banner" if text == "START" else "driftsketch_finish_banner"
    for x in (-2.82, 2.82):
        sign = -1 if x < 0 else 1
        mesh.box((x, 0, 0.06), (0.56, 0.56, 0.12), "driftsketch_frame")
        mesh.box((x, 0, 1.40), (0.24, 0.32, 2.80), "driftsketch_frame")
        for index, z in enumerate((0.42, 1.02, 1.62, 2.22)):
            mesh.box((x, -0.005, z), (0.26, 0.34, 0.28), accent if index % 2 == 0 else "driftsketch_white")
        mesh.box((x + sign * 0.18, 0, 2.25), (0.12, 0.38, 1.10), accent)
        mesh.beam((x, 0, 2.55), (x * 0.72, 0, 3.38), 0.12, 0.26, "driftsketch_frame")
    mesh.box((0, 0, 3.40), (5.90, 0.34, 0.20), "driftsketch_frame")
    mesh.front_quad(0, 3.40, 5.50, 0.055, -0.176, accent)
    mesh.box((0, -0.03, 2.85), (4.80, 0.14, 0.90), "driftsketch_black")
    mesh.front_quad(0, 2.85, 4.72, 0.82, -0.106, banner, textured=True)
    return mesh


def write_gate(mesh, name, text):
    path = OUT / f"{name}.dae"
    gid = name.replace("_", "-") + "-geometry"
    banner = "driftsketch_start_banner" if text == "START" else "driftsketch_finish_banner"
    root = ET.Element(f"{{{NS}}}COLLADA", {"version": "1.4.1"})
    asset = E(root, "asset")
    contributor = E(asset, "contributor")
    E(contributor, "author", text="daimy")
    E(contributor, "comments", text="Original DriftSketch 0.8.0 motorsport gate; procedural mesh and original PNG banner")
    E(asset, "created", text="2026-10-27T00:00:00Z")
    E(asset, "modified", text="2026-10-27T00:00:00Z")
    E(asset, "unit", {"meter": "1", "name": "meter"})
    E(asset, "up_axis", text="Z_UP")
    library = E(root, "library_geometries")
    geometry = E(library, "geometry", {"id": gid, "name": name})
    xml_mesh = E(geometry, "mesh")

    def source(kind, values, stride, params):
        node = E(xml_mesh, "source", {"id": f"{gid}-{kind}"})
        array = E(node, "float_array", {"id": f"{gid}-{kind}-array", "count": str(len(values))},
                  " ".join(f"{value:.6f}" for value in values))
        accessor = E(E(node, "technique_common"), "accessor", {"source": f"#{array.attrib['id']}", "count": str(len(values) // stride), "stride": str(stride)})
        for param in params:
            E(accessor, "param", {"name": param, "type": "float"})

    source("positions", [v for p in mesh.positions for v in p], 3, "XYZ")
    source("normals", [v for n in mesh.normals for v in n], 3, "XYZ")
    source("uv", [v for uv in mesh.uvs for v in uv], 2, "ST")
    vertices = E(xml_mesh, "vertices", {"id": gid + "-vertices"})
    E(vertices, "input", {"semantic": "POSITION", "source": f"#{gid}-positions"})

    for material in ORDER:
        triangles_data = mesh.groups.get(material)
        if not triangles_data:
            continue
        textured = material == banner
        stride = 3 if textured else 2
        triangles = E(xml_mesh, "triangles", {"material": material, "count": str(len(triangles_data))})
        E(triangles, "input", {"semantic": "VERTEX", "source": f"#{gid}-vertices", "offset": "0"})
        E(triangles, "input", {"semantic": "NORMAL", "source": f"#{gid}-normals", "offset": "1"})
        if textured:
            E(triangles, "input", {"semantic": "TEXCOORD", "source": f"#{gid}-uv", "offset": "2", "set": "0"})
        E(triangles, "p", text=" ".join(str(index) for triangle in triangles_data for index in ((triangle[0],) * stride + (triangle[1],) * stride + (triangle[2],) * stride)))

    scenes = E(root, "library_visual_scenes")
    scene = E(scenes, "visual_scene", {"id": "Scene", "name": "Scene"})
    node = E(scene, "node", {"id": name, "name": name})
    instance = E(node, "instance_geometry", {"url": f"#{gid}"})
    E(E(instance, "bind_material"), "technique_common")
    E(E(root, "scene"), "instance_visual_scene", {"url": "#Scene"})
    rewrite_materials(root, set(mesh.groups), {banner})
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    count = sum(len(v) for v in mesh.groups.values())
    print(path.name, "triangles", count, "vertices", len(mesh.positions), "bytes", path.stat().st_size)


def tracked_text(draw, center, y, text, font, fill, spacing=8):
    widths = [draw.textlength(char, font=font) for char in text]
    x = center - (sum(widths) + spacing * (len(text) - 1)) / 2
    for char, width in zip(text, widths):
        draw.text((x, y), char, font=font, fill=fill)
        x += width + spacing


def make_banner(text, accent, filename):
    width, height = 1536, 288
    image = Image.new("RGB", (width, height), (8, 13, 20))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        factor = y / height
        draw.line((0, y, width, y), fill=(int(13 - 5 * factor), int(22 - 8 * factor), int(31 - 10 * factor)))
    # Subtle diagonal motorsport stripes in the background.
    for x in range(-300, width + 300, 190):
        draw.polygon(((x, 0), (x + 65, 0), (x - 120, height), (x - 185, height)), fill=(13, 22, 31))
    # Checker strips are crisp texture geometry, not dozens of DAE faces.
    size = 32
    for row, y in enumerate((0, height - 24)):
        for col in range(width // 24):
            shade = (222, 230, 234) if (col + row) % 2 == 0 else (22, 30, 38)
            draw.rectangle((col * 24, y, col * 24 + 24, y + 24), fill=shade)
    draw.rectangle((0, 24, 14, height - 24), fill=accent)
    draw.rectangle((width - 15, 24, width, height - 24), fill=accent)
    draw.rectangle((26, 34, width - 26, 38), fill=accent)
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
    tracked_text(draw, width / 2, 49, "DRIFTSKETCH  //  DRIFT TRACK", small, accent, 7)
    font_size = 184
    while font_size > 100:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        box = draw.textbbox((0, 0), text, font=font, stroke_width=1)
        if box[2] - box[0] <= 900 and box[3] - box[1] <= 148:
            break
        font_size -= 4
    draw.text((width / 2, 167), text, font=font, anchor="mm", fill=(245, 249, 250), stroke_width=2, stroke_fill=(3, 7, 11))
    # Large inward chevrons frame the wordmark without cluttering it.
    for side in (-1, 1):
        base = 158 if side < 0 else width - 158
        for index in range(3):
            x = base + side * index * 34
            points = ((x - side * 18, 120), (x + side * 10, 160), (x - side * 18, 200),
                      (x - side * 2, 200), (x + side * 26, 160), (x - side * 2, 120))
            draw.polygon(points, fill=accent)
    image.save(OUT / filename, optimize=True)
    print(filename, image.size, (OUT / filename).stat().st_size, "bytes")


def write_material_json():
    data = {}
    for name in ORDER:
        metallic, roughness = PBR[name]
        stage = {
            "baseColorFactor": list(COLORS[name]),
            "metallicFactor": metallic,
            "roughnessFactor": roughness,
        }
        if name in TEXTURES:
            stage["baseColorMap"] = "/art/shapes/driftsketch/" + TEXTURES[name]
            stage["useAnisotropic"] = True
        data[name] = {
            "name": name,
            "mapTo": name,
            "class": "Material",
            "version": 1.5,
            "Stages": [stage, {}, {}, {}],
            "doubleSided": False,
        }
    path = OUT / "main.materials.json"
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(path.name, len(data), "unique materials")


def main():
    make_banner("START", (16, 199, 190), "gate_start.png")
    make_banner("FINISH", (239, 45, 65), "gate_finish.png")
    for filename in ("cone.dae", "pylon.dae", "tire.dae", "tire_stack.dae"):
        update_existing(filename)
    write_gate(make_gate("START"), "gate_start", "START")
    write_gate(make_gate("FINISH"), "gate_finish", "FINISH")
    write_material_json()


if __name__ == "__main__":
    main()
