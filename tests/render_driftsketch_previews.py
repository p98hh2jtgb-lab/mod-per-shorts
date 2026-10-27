#!/usr/bin/env python3
"""Render DriftSketch asset previews with Blender (bpy) + Cycles.

Optional tool: imports the real COLLADA files through Blender's Collada importer
(an independent parser check) and shades them with the colours from
main.materials.json.  Usage:

    python3 -m pip install bpy==4.2.0
    python3 tests/render_driftsketch_previews.py OUT_DIR [shot ...]

Shots: cone, tires, start, finish, ring, track, track_tires, backs (default: all).
DriftSketch_previews/0.9.0 was rendered with this script (JPEG-converted).
"""
import json
import math
import sys
from pathlib import Path

import bpy
import mathutils

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "DriftSketch" / "art" / "shapes" / "driftsketch_v09"
MATERIALS = json.loads((ASSETS / "main.materials.json").read_text())


def reset(width, height, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.35
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    nodes.clear()
    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(38)
    sky.sun_rotation = math.radians(135)
    sky.sun_disc = False
    sky.air_density = 1.0
    sky.dust_density = 2.0
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.16
    out = nodes.new("ShaderNodeOutputWorld")
    world.node_tree.links.new(sky.outputs["Color"], bg.inputs["Color"])
    world.node_tree.links.new(bg.outputs["Background"], out.inputs["Surface"])
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 2.2
    sun_data.angle = math.radians(1.2)
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(52), 0.0, math.radians(135 + 180))
    scene.collection.objects.link(sun)
    return scene


def ground(size=400.0, color=(0.30, 0.235, 0.16), road=None):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    plane = bpy.context.active_object
    material = bpy.data.materials.new("ground")
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.95
    noise = material.node_tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.6
    noise.inputs["Detail"].default_value = 8
    ramp = material.node_tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (color[0] * 0.82, color[1] * 0.82, color[2] * 0.82, 1)
    ramp.color_ramp.elements[1].color = (min(1, color[0] * 1.12), min(1, color[1] * 1.12), min(1, color[2] * 1.12), 1)
    material.node_tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    material.node_tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    plane.data.materials.append(material)
    if road:
        bpy.ops.mesh.primitive_plane_add(size=1.0, location=(road[0], road[1], 0.004))
        strip = bpy.context.active_object
        strip.scale = (road[2], road[3], 1)
        strip.rotation_euler = (0, 0, road[4] if len(road) > 4 else 0)
        rmat = bpy.data.materials.new("asphalt")
        rmat.use_nodes = True
        rb = rmat.node_tree.nodes["Principled BSDF"]
        rb.inputs["Base Color"].default_value = (0.045, 0.045, 0.05, 1)
        rb.inputs["Roughness"].default_value = 0.8
        strip.data.materials.append(rmat)


_TEMPLATES = {}


def import_dae(file_name):
    """Import once, then return linked duplicates (cheap instances)."""
    if file_name not in _TEMPLATES:
        before = set(bpy.data.objects)
        bpy.ops.wm.collada_import(filepath=str(ASSETS / file_name))
        new = [o for o in bpy.data.objects if o not in before]
        assert len(new) == 1, (file_name, new)
        obj = new[0]
        for slot in obj.material_slots:
            apply_material(slot.material)
        obj.hide_render = True
        obj.hide_viewport = True
        _TEMPLATES[file_name] = obj
    template = _TEMPLATES[file_name]
    copy = template.copy()
    copy.hide_render = False
    copy.hide_viewport = False
    bpy.context.scene.collection.objects.link(copy)
    return copy


def apply_material(material):
    name = material.name.split(".")[0]
    if name.endswith("-material"):
        name = name[: -len("-material")]
    data = MATERIALS[name]
    stage = data["Stages"][0]
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        material.node_tree.nodes.clear()
        bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        out = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = tuple(stage["baseColorFactor"])
    bsdf.inputs["Roughness"].default_value = stage["roughnessFactor"]
    bsdf.inputs["Metallic"].default_value = stage["metallicFactor"]


def place(obj, x, y, z=0.0, yaw=0.0, scale=1.0):
    obj.location = (x, y, z)
    obj.rotation_euler = (0, 0, yaw)
    obj.scale = (scale, scale, scale)
    return obj


def camera(location, target, lens=50):
    data = bpy.data.cameras.new("Camera")
    data.lens = lens
    data.clip_end = 2000
    cam = bpy.data.objects.new("Camera", data)
    cam.location = location
    direction = mathutils.Vector(target) - mathutils.Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def render(path):
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("wrote", path)


def heading_yaw(dx, dy):
    # Assets face +Y; Blender yaw rotates +Y toward the travel direction.
    return math.atan2(-dx, dy)


def shot_cone(out):
    reset(960, 720, 40)
    ground()
    place(import_dae("cone.dae"), 0, 0)
    place(import_dae("cone.dae"), 0.85, 1.2, yaw=0.4)
    place(import_dae("cone.dae"), -0.9, 1.6, yaw=1.1)
    camera((1.15, -1.55, 0.78), (0.0, 0.25, 0.30), lens=42)
    render(out / "cone.png")


def shot_tires(out):
    reset(1120, 720, 40)
    ground()
    colors = ["red", "red", "white", "white", "blue", "blue", "red", "red"]
    for i, color in enumerate(colors):
        place(import_dae("tire_stack_%s.dae" % color), -2.3 + i * 0.68, 0.0, yaw=i * 0.7)
    for i, color in enumerate(["white", "red", "white", "red"]):
        place(import_dae("tire_stack_%s.dae" % color), -1.0 + i * 0.68, 1.6, yaw=i * 0.9)
    camera((1.6, -3.1, 1.45), (-0.25, 0.4, 0.38), lens=40)
    render(out / "tire_stacks.png")


def shot_gate(out, file_name, png):
    reset(1200, 800, 40)
    ground(road=(0, 0, 7.0, 60.0))
    place(import_dae(file_name), 0, 0)
    for side in (-1, 1):
        for k in range(-6, 7):
            place(import_dae("cone.dae"), side * 3.4, k * 1.0)
    camera((5.5, -14.5, 2.4), (0.0, 0.0, 3.4), lens=36)
    render(out / png)


def shot_ring(out):
    reset(1200, 800, 40)
    ground(road=(0, 20, 5.0, 90.0))
    for k in range(5):
        place(import_dae("ring.dae"), 0, k * 12.0, scale=7.0 / 6.0)
    camera((6.0, -13.0, 3.2), (0.0, 12.0, 3.2), lens=32)
    render(out / "rings.png")


def showcase_path():
    """Straight start, a wide S-bend, straight finish (points every 0.5 m)."""
    pts = [(0.0, y * 0.5) for y in range(0, 60)]
    for i in range(0, 401):
        t = i / 400.0
        y = 30.0 + 100.0 * t
        pts.append((14.0 * (1.0 - math.cos(2.0 * math.pi * t)) * 0.5, y))
    pts += [(0.0, 130.0 + k * 0.5) for k in range(1, 41)]
    return pts


def resample(line, spacing):
    out = [line[0]]
    acc = 0.0
    for a, b in zip(line, line[1:]):
        seg = math.hypot(b[0] - a[0], b[1] - a[1])
        acc += seg
        while acc >= spacing:
            acc -= spacing
            t = 1.0 - acc / seg
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def tangent_at(pts, i, span=4):
    a, b = pts[max(0, i - span)], pts[min(len(pts) - 1, i + span)]
    dx, dy = b[0] - a[0], b[1] - a[1]
    size = math.hypot(dx, dy)
    return dx / size, dy / size


def showcase(out, png, marker, colors, gate_kinds, ring_distances, cam, target, lens, half_width=2.6, spacing=1.0):
    reset(1280, 800, 48)
    ground()
    pts = showcase_path()
    lines = [[], []]
    for i, p in enumerate(pts):
        tx, ty = tangent_at(pts, i)
        nx, ny = -ty, tx
        lines[0].append((p[0] - nx * half_width, p[1] - ny * half_width))
        lines[1].append((p[0] + nx * half_width, p[1] + ny * half_width))
    rings = []
    for d in ring_distances:
        i = int(d / 0.5)
        tx, ty = tangent_at(pts, i)
        rings.append((pts[i], tx, ty))
    for line in lines:
        for k, q in enumerate(resample(line, spacing)):
            blocked = False
            for (rp, tx, ty) in rings:
                dx, dy = q[0] - rp[0], q[1] - rp[1]
                if abs(dx * tx + dy * ty) <= 0.84 and abs(dy * tx - dx * ty) <= 4.8:
                    blocked = True
            if blocked:
                continue
            if marker == "cone":
                place(import_dae("cone.dae"), q[0], q[1], yaw=heading_yaw(*tangent_at(pts, min(len(pts) - 1, int(k * spacing / 0.5)))))
            else:
                color = colors[k % len(colors)]
                place(import_dae("tire_stack_%s.dae" % color), q[0], q[1], yaw=k * 2.39996)
    if "start" in gate_kinds:
        tx, ty = tangent_at(pts, 0)
        place(import_dae("gate_start.dae"), pts[0][0], pts[0][1], yaw=heading_yaw(tx, ty), scale=0.85)
    if "finish" in gate_kinds:
        tx, ty = tangent_at(pts, len(pts) - 1)
        place(import_dae("gate_finish.dae"), pts[-1][0], pts[-1][1], yaw=heading_yaw(tx, ty), scale=0.85)
    for (rp, tx, ty) in rings:
        place(import_dae("ring.dae"), rp[0], rp[1], yaw=heading_yaw(tx, ty), scale=7.0 / 6.0)
    camera(cam, target, lens=lens)
    render(out / png)


def shot_track(out):
    showcase(out, "track_cones.png", "cone", None, ("start", "finish"), (45, 60, 75, 90),
             cam=(-6.5, -15.0, 6.2), target=(4.0, 32.0, 2.0), lens=30)


def shot_track_tires(out):
    showcase(out, "track_tires.png", "tires", ["red", "red", "white", "white", "blue", "blue"], ("finish",), (),
             cam=(16.0, 118.0, 5.0), target=(-1.5, 152.0, 2.2), lens=32, spacing=0.7)


def shot_backs(out):
    reset(1200, 700, 32)
    ground()
    place(import_dae("gate_start.dae"), -6.0, 0.0)
    place(import_dae("gate_finish.dae"), 7.0, -12.0)
    camera((0.5, 26.0, 4.2), (0.5, -4.0, 4.4), lens=30)
    render(out / "gates_back.png")


SHOTS = {
    "backs": shot_backs,
    "cone": shot_cone,
    "tires": shot_tires,
    "start": lambda out: shot_gate(out, "gate_start.dae", "gate_start.png"),
    "finish": lambda out: shot_gate(out, "gate_finish.dae", "gate_finish.png"),
    "ring": shot_ring,
    "track": shot_track,
    "track_tires": shot_track_tires,
}


def main(argv):
    out = Path(argv[1] if len(argv) > 1 else "/tmp/driftsketch_previews")
    out.mkdir(parents=True, exist_ok=True)
    names = argv[2:] or list(SHOTS)
    for name in names:
        _TEMPLATES.clear()
        SHOTS[name](out)


if __name__ == "__main__":
    main(sys.argv)
