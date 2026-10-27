#!/usr/bin/env python3
"""Generate every DriftSketch 0.9.0 shape from scratch.

Original low-poly geometry only (no extracted game assets):

* cone.dae               orange traffic cone, two white bands, rounded square base,
                         open tip
* tire_stack_red/white/blue.dae
                         four stacked tyres with rounded shoulders, raised chevron
                         tread blocks and a dark hollow centre
* gate_start.dae         blue box-truss towers, red-framed banner, checker blocks,
                         START lettering and two generic sponsor panels
* gate_finish.dae        grey steel lattice towers, checkered banner, dark-red
                         FINISH panel
* ring.dae               red/white striped stunt hoop (16 segments)

Every material is a flat PBR colour. There are no texture files, so no shape can
fall back to BeamNG's "No Texture" material. Lettering and checker squares are
real geometry. Glyph outlines come from three SIL OFL fonts stored in
tests/fonts (Open Sans ExtraBold, Oswald Bold, Racing Sans One).

Generation needs fontTools, numpy and mapbox_earcut. The mod and its tests do not:

    python3 -m pip install fonttools numpy mapbox_earcut
    python3 tests/make_driftsketch_assets.py
"""
from collections import OrderedDict
from pathlib import Path
import json
import math
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR_NAME = "driftsketch_v09"
OUT = ROOT / "DriftSketch" / "art" / "shapes" / ASSET_DIR_NAME
FONTS = Path(__file__).resolve().parent / "fonts"
MAT = "driftsketch09_"
AUTHOR = "daimy"
STAMP = "2026-10-27T00:00:00Z"

# ---------------------------------------------------------------------------
# Materials: flat PBR factors.  The values read as the intended colour whether
# BeamNG treats baseColorFactor as linear or as sRGB.
# ---------------------------------------------------------------------------
MATERIALS = OrderedDict([
    ("cone_orange",        ((1.000, 0.200, 0.016), 0.36, 0.0)),
    ("cone_white",         ((0.880, 0.885, 0.880), 0.28, 0.0)),
    ("cone_inner",         ((0.050, 0.022, 0.010), 0.80, 0.0)),
    ("tire_red",           ((0.700, 0.036, 0.030), 0.70, 0.0)),
    ("tire_red_groove",    ((0.250, 0.014, 0.012), 0.86, 0.0)),
    ("tire_white",         ((0.800, 0.800, 0.780), 0.70, 0.0)),
    ("tire_white_groove",  ((0.300, 0.300, 0.292), 0.86, 0.0)),
    ("tire_blue",          ((0.024, 0.110, 0.620), 0.70, 0.0)),
    ("tire_blue_groove",   ((0.010, 0.040, 0.220), 0.86, 0.0)),
    ("tire_inner",         ((0.030, 0.030, 0.030), 0.92, 0.0)),
    ("truss_blue",         ((0.020, 0.090, 0.720), 0.34, 0.15)),
    ("truss_steel",        ((0.560, 0.575, 0.590), 0.38, 0.65)),
    ("plate_dark",         ((0.060, 0.062, 0.066), 0.62, 0.30)),
    ("banner_frame",       ((0.140, 0.145, 0.155), 0.48, 0.35)),
    ("banner_red",         ((0.700, 0.025, 0.020), 0.45, 0.0)),
    ("finish_red",         ((0.360, 0.022, 0.018), 0.50, 0.0)),
    ("check_black",        ((0.016, 0.016, 0.017), 0.55, 0.0)),
    ("check_white",        ((0.860, 0.860, 0.850), 0.55, 0.0)),
    ("text_dark",          ((0.050, 0.052, 0.058), 0.50, 0.0)),
    ("sponsor_blue",       ((0.018, 0.120, 0.620), 0.45, 0.0)),
    ("sponsor_teal",       ((0.000, 0.330, 0.380), 0.45, 0.0)),
    ("sponsor_green",      ((0.030, 0.430, 0.100), 0.45, 0.0)),
    ("ring_red",           ((0.800, 0.030, 0.025), 0.30, 0.0)),
    ("ring_white",         ((0.880, 0.880, 0.880), 0.30, 0.0)),
])


def mat(short):
    if short not in MATERIALS:
        raise KeyError(short)
    return MAT + short


# ---------------------------------------------------------------------------
# Vector helpers
# ---------------------------------------------------------------------------
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def mul(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def length(a): return math.sqrt(dot(a, a))


def unit(a):
    size = length(a)
    if size < 1e-12:
        raise ValueError("zero-length vector")
    return (a[0] / size, a[1] / size, a[2] / size)


class Mesh:
    """Triangle soup grouped by material; every corner carries a normal."""

    def __init__(self, name):
        self.name = name
        self.groups = OrderedDict()

    def tri(self, material, p0, p1, p2, n0=None, n1=None, n2=None):
        # Round now, so the winding/normal checks see exactly what is written.
        p0, p1, p2 = (tuple(round(c, 5) + 0.0 for c in p) for p in (p0, p1, p2))
        face = cross(sub(p1, p0), sub(p2, p0))
        area2 = length(face)
        if area2 < 1e-8:  # degenerate: revolved apex or a glyph sliver
            return False
        face = mul(face, 1.0 / area2)
        if n0 is None:
            n0 = n1 = n2 = face
        else:
            n0, n1, n2 = unit(n0), unit(n1), unit(n2)
            for normal in (n0, n1, n2):
                if dot(normal, face) <= 0.05:
                    raise ValueError("%s/%s: vertex normal opposes the winding" % (self.name, material))
        self.groups.setdefault(material, []).append((p0, p1, p2, n0, n1, n2))
        return True

    def quad(self, material, a, b, c, d, na=None, nb=None, nc=None, nd=None):
        """a-b-c-d counter-clockwise when seen from the outside."""
        if na is None:
            self.tri(material, a, b, c)
            self.tri(material, a, c, d)
        else:
            self.tri(material, a, b, c, na, nb, nc)
            self.tri(material, a, c, d, na, nc, nd)

    def triangle_count(self):
        return sum(len(tris) for tris in self.groups.values())

    def bounds(self):
        points = [p for tris in self.groups.values() for t in tris for p in t[:3]]
        return ([min(p[i] for p in points) for i in range(3)],
                [max(p[i] for p in points) for i in range(3)])


# ---------------------------------------------------------------------------
# Primitive builders
# ---------------------------------------------------------------------------
def revolve(mesh, specs, thetas):
    """Revolve profile strips around +Z.

    specs: [((r0, z0), (r1, z1), (nr0, nz0), (nr1, nz1), material)].  The
    outward side of a strip is (dz, -dr) -- walk outer surfaces upward and
    inner surfaces downward.  Profile normals are given per strip end, so
    strips can be smooth or creased independently.
    """
    count = len(thetas)
    trig = [(math.cos(t), math.sin(t)) for t in thetas]
    for (p0, p1, n0, n1, material) in specs:
        dr, dz = p1[0] - p0[0], p1[1] - p0[1]
        for normal in (n0, n1):
            if normal[0] * dz - normal[1] * dr <= 0:
                raise ValueError("%s/%s: profile normal points inward" % (mesh.name, material))
        for j in range(count):
            ca, sa = trig[j]
            cb, sb = trig[(j + 1) % count]
            a = (p0[0] * ca, p0[0] * sa, p0[1])
            b = (p0[0] * cb, p0[0] * sb, p0[1])
            c = (p1[0] * cb, p1[0] * sb, p1[1])
            d = (p1[0] * ca, p1[0] * sa, p1[1])
            na = (n0[0] * ca, n0[0] * sa, n0[1])
            nb = (n0[0] * cb, n0[0] * sb, n0[1])
            nc = (n1[0] * cb, n1[0] * sb, n1[1])
            nd = (n1[0] * ca, n1[0] * sa, n1[1])
            mesh.quad(material, a, b, c, d, na, nb, nc, nd)


def box(mesh, material, x0, y0, z0, x1, y1, z1, faces="xXyYzZ"):
    """Axis aligned box. Face letters: x/X = -X/+X, y/Y, z/Z."""
    if "X" in faces:
        mesh.quad(material, (x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1))
    if "x" in faces:
        mesh.quad(material, (x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1))
    if "Y" in faces:
        mesh.quad(material, (x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1))
    if "y" in faces:
        mesh.quad(material, (x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1))
    if "Z" in faces:
        mesh.quad(material, (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))
    if "z" in faces:
        mesh.quad(material, (x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0))


def prism(mesh, material, p0, p1, radius, sides=4, smooth=False, roll=math.pi / 4):
    """Open tube/prism from p0 to p1 (truss members; ends hide in chords)."""
    w = unit(sub(p1, p0))
    ref = (0.0, 0.0, 1.0) if abs(w[2]) < 0.9 else (1.0, 0.0, 0.0)
    u = unit(cross(ref, w))
    v = cross(w, u)
    dirs = []
    for k in range(sides):
        angle = roll + 2.0 * math.pi * k / sides
        dirs.append(add(mul(u, math.cos(angle)), mul(v, math.sin(angle))))
    for k in range(sides):
        da, db = dirs[k], dirs[(k + 1) % sides]
        a, b = add(p0, mul(da, radius)), add(p0, mul(db, radius))
        c, d = add(p1, mul(db, radius)), add(p1, mul(da, radius))
        if smooth:
            mesh.quad(material, a, b, c, d, da, db, db, da)
        else:
            mesh.quad(material, a, b, c, d)


class Face:
    """2D drawing frame on a planar face: u = reading direction, v = up."""

    def __init__(self, mesh, origin, u, v, layer_step=0.010):
        self.mesh = mesh
        self.origin = origin
        self.u = u
        self.v = v
        self.n = unit(cross(u, v))
        self.layer_step = layer_step

    def point(self, uu, vv, layer):
        return add(add(add(self.origin, mul(self.u, uu)), mul(self.v, vv)), mul(self.n, layer * self.layer_step))

    def rect(self, material, u0, v0, u1, v1, layer=1):
        p = self.point
        self.mesh.quad(material, p(u0, v0, layer), p(u1, v0, layer), p(u1, v1, layer), p(u0, v1, layer))

    def poly(self, material, points, layer=1):
        """Convex polygon given counter-clockwise in (u, v)."""
        p = [self.point(x, y, layer) for x, y in points]
        for i in range(1, len(p) - 1):
            self.mesh.tri(material, p[0], p[i], p[i + 1])

    def triangles(self, material, tris2d, layer=2):
        for a, b, c in tris2d:
            self.mesh.tri(material, self.point(a[0], a[1], layer), self.point(b[0], b[1], layer),
                          self.point(c[0], c[1], layer))


# ---------------------------------------------------------------------------
# Lettering: glyph outline -> polygons with holes -> earcut triangles
# ---------------------------------------------------------------------------
_FONT_CACHE = {}


def _font(path):
    if path not in _FONT_CACHE:
        from fontTools.ttLib import TTFont
        _FONT_CACHE[path] = TTFont(str(path))
    return _FONT_CACHE[path]


def _flatten_glyph(font, glyph_name, steps):
    from fontTools.pens.basePen import BasePen

    class FlattenPen(BasePen):
        def __init__(self, glyph_set):
            super().__init__(glyph_set)
            self.contours = []
            self.current = None

        def _moveTo(self, p):
            self.current = [tuple(p)]

        def _lineTo(self, p):
            self.current.append(tuple(p))

        def _qCurveToOne(self, p1, p2):
            p0 = self.current[-1]
            for i in range(1, steps + 1):
                t = i / steps
                m = 1.0 - t
                self.current.append((m * m * p0[0] + 2 * m * t * p1[0] + t * t * p2[0],
                                     m * m * p0[1] + 2 * m * t * p1[1] + t * t * p2[1]))

        def _curveToOne(self, p1, p2, p3):
            p0 = self.current[-1]
            for i in range(1, steps + 1):
                t = i / steps
                m = 1.0 - t
                self.current.append((m ** 3 * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t ** 3 * p3[0],
                                     m ** 3 * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t ** 3 * p3[1]))

        def _closePath(self):
            contour = self.current or []
            if len(contour) > 1 and contour[0] == contour[-1]:
                contour.pop()
            cleaned = []
            for point in contour:
                if not cleaned or (abs(point[0] - cleaned[-1][0]) + abs(point[1] - cleaned[-1][1])) > 1e-6:
                    cleaned.append(point)
            if len(cleaned) >= 3:
                self.contours.append(cleaned)
            self.current = None

        _endPath = _closePath

    glyph_set = font.getGlyphSet()
    pen = FlattenPen(glyph_set)
    glyph_set[glyph_name].draw(pen)
    return pen.contours


def _area(poly):
    total = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        total += x0 * y1 - x1 * y0
    return total * 0.5


def _inside(point, poly):
    x, y = point
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def _triangulate_contours(contours):
    import numpy as np
    import mapbox_earcut as earcut

    info = []
    for contour in contours:
        info.append({"pts": contour, "area": abs(_area(contour)), "holes": []})
    # A contour inside an odd number of others is a hole of its smallest container.
    for item in info:
        containers = [other for other in info if other is not item and other["area"] > item["area"]
                      and _inside(item["pts"][0], other["pts"])]
        item["depth"] = len(containers)
        item["parent"] = min(containers, key=lambda c: c["area"]) if containers else None
    triangles = []
    for item in info:
        if item["depth"] % 2 == 1:
            item["parent"]["holes"].append(item["pts"])
    for item in info:
        if item["depth"] % 2 == 1:
            continue
        rings = [item["pts"]] + item["holes"]
        verts = [p for ring in rings for p in ring]
        ends = []
        total = 0
        for ring in rings:
            total += len(ring)
            ends.append(total)
        indices = earcut.triangulate_float64(np.array(verts, dtype=np.float64), np.array(ends, dtype=np.uint32))
        for i in range(0, len(indices), 3):
            a, b, c = verts[indices[i]], verts[indices[i + 1]], verts[indices[i + 2]]
            signed = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])
            if abs(signed) < 1e-9:
                continue
            triangles.append((a, b, c) if signed > 0 else (a, c, b))
    return triangles


def text_triangles(text, font_file, box_w, box_h, steps=5, tracking=0.0):
    """Triangles of `text` fitted (centred) into a box_w x box_h box at (0, 0)."""
    font = _font(FONTS / font_file)
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    em = font["head"].unitsPerEm
    pen_x = 0.0
    tris = []
    for char in text:
        glyph = cmap[ord(char)]
        if char != " ":
            for a, b, c in _triangulate_contours(_flatten_glyph(font, glyph, steps)):
                tris.append(((a[0] + pen_x, a[1]), (b[0] + pen_x, b[1]), (c[0] + pen_x, c[1])))
        pen_x += hmtx[glyph][0] + tracking * em
    xs = [p[0] for t in tris for p in t]
    ys = [p[1] for t in tris for p in t]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    scale = min(box_w / (max_x - min_x), box_h / (max_y - min_y))
    off_x = -(min_x + max_x) * 0.5 * scale
    off_y = -(min_y + max_y) * 0.5 * scale
    out = []
    for t in tris:
        out.append(tuple((p[0] * scale + off_x, p[1] * scale + off_y) for p in t))
    return out, (max_x - min_x) * scale, (max_y - min_y) * scale


def place(tris, du, dv, mirror=False):
    out = []
    for a, b, c in tris:
        if mirror:
            out.append(((-a[0] + du, a[1] + dv), (-c[0] + du, c[1] + dv), (-b[0] + du, b[1] + dv)))
        else:
            out.append(((a[0] + du, a[1] + dv), (b[0] + du, b[1] + dv), (c[0] + du, c[1] + dv)))
    return out


# ---------------------------------------------------------------------------
# Traffic cone
# ---------------------------------------------------------------------------
CONE = {"base_half": 0.205, "corner": 0.075, "height": 0.66}


def rounded_square(theta, half, corner):
    """Ray from the centre at angle theta hits a rounded square: point, normal."""
    c, s = math.cos(theta), math.sin(theta)
    ac, as_ = abs(c), abs(s)
    flat = half - corner
    if ac > 1e-9 and (half / ac) * as_ <= flat + 1e-12:
        t = half / ac
        normal = (math.copysign(1.0, c), 0.0)
    elif as_ > 1e-9 and (half / as_) * ac <= flat + 1e-12:
        t = half / as_
        normal = (0.0, math.copysign(1.0, s))
    else:
        cx, cy = flat, flat
        b = ac * cx + as_ * cy
        t = b + math.sqrt(max(0.0, b * b - (cx * cx + cy * cy) + corner * corner))
        nx, ny = (t * ac - cx) / corner, (t * as_ - cy) / corner
        normal = (math.copysign(nx, c), math.copysign(ny, s))
    return (t * c, t * s), normal


def build_cone():
    mesh = Mesh("cone")
    segments = 32
    thetas = [2.0 * math.pi * j / segments for j in range(segments)]
    half, corner, height = CONE["base_half"], CONE["corner"], CONE["height"]
    z_wall, z_top = 0.024, 0.036
    body_r0, body_z0 = 0.150, 0.050
    tip_r, tip_z = 0.024, height - 0.004
    orange, white, inner = mat("cone_orange"), mat("cone_white"), mat("cone_inner")

    outline = [rounded_square(t, half, corner) for t in thetas]
    for j in range(segments):
        k = (j + 1) % segments
        (pa, na), (pb, nb) = outline[j], outline[k]
        # Base side wall with smooth horizontal normals around the rounded corners.
        mesh.quad(orange, (pa[0], pa[1], 0.0), (pb[0], pb[1], 0.0), (pb[0], pb[1], z_wall), (pa[0], pa[1], z_wall),
                  (na[0], na[1], 0.0), (nb[0], nb[1], 0.0), (nb[0], nb[1], 0.0), (na[0], na[1], 0.0))
        # Sloped top: rounded square edge -> round collar at the body foot.
        ca, sa = math.cos(thetas[j]), math.sin(thetas[j])
        cb, sb = math.cos(thetas[k]), math.sin(thetas[k])
        ia = (body_r0 * ca, body_r0 * sa, body_z0)
        ib = (body_r0 * cb, body_r0 * sb, body_z0)
        oa = (pa[0], pa[1], z_wall)
        ob = (pb[0], pb[1], z_wall)

        def slope_normal(outer, inner_pt, n2):
            run = math.hypot(outer[0] - inner_pt[0], outer[1] - inner_pt[1])
            rise = inner_pt[2] - outer[2]
            return unit((n2[0] * rise * 1.6, n2[1] * rise * 1.6, run))

        mesh.quad(orange, oa, ob, ib, ia,
                  slope_normal(oa, ia, na), slope_normal(ob, ib, nb), slope_normal(ob, ib, nb), slope_normal(oa, ia, na))

    # Body: five bands like the reference cone (two white reflective bands).
    body_h = tip_z - body_z0
    normal = (body_h, body_r0 - tip_r)
    fractions = [0.0, 0.22, 0.42, 0.58, 0.78, 1.0]
    band_mats = [orange, white, orange, white, orange]
    specs = []
    for i, material in enumerate(band_mats):
        f0, f1 = fractions[i], fractions[i + 1]
        r0 = body_r0 + (tip_r - body_r0) * f0
        r1 = body_r0 + (tip_r - body_r0) * f1
        specs.append(((r0, body_z0 + body_h * f0), (r1, body_z0 + body_h * f1), normal, normal, material))
    # Open tip: rounded rim, dark inner wall and a dark floor.
    rim_in = 0.0135
    specs.append(((tip_r, tip_z), (rim_in, height), (0.55, 0.835), (-0.25, 0.97), orange))
    specs.append(((rim_in, height), (0.0105, height - 0.075), (-1.0, 0.04), (-1.0, 0.04), inner))
    specs.append(((0.0105, height - 0.075), (0.0, height - 0.075), (0.0, 1.0), (0.0, 1.0), inner))
    revolve(mesh, specs, thetas)
    return mesh


# ---------------------------------------------------------------------------
# Tyre stack (four tyres)
# ---------------------------------------------------------------------------
TIRE = {"outer": 0.330, "shoulder": 0.298, "inner": 0.188, "height": 0.210, "tread_edge": 0.040, "count": 4}


def build_tire_stack(color):
    mesh = Mesh("tire_stack_" + color)
    segments = 24
    ro, rsh, ri = TIRE["outer"], TIRE["shoulder"], TIRE["inner"]
    h, zs, count = TIRE["height"], TIRE["tread_edge"], TIRE["count"]
    body, groove, inner = mat("tire_" + color), mat("tire_" + color + "_groove"), mat("tire_inner")
    step = 2.0 * math.pi / segments
    blocks = 20
    period = 2.0 * math.pi / blocks
    block_len = period * 0.74
    skew = math.radians(3.2)
    rb = ro + 0.0055
    rotations = [0, 2, 1, 3]  # whole segments: tyre seams stay watertight
    for k in range(count):
        z0 = k * h
        th0 = rotations[k % len(rotations)] * step
        thetas = [th0 + step * j for j in range(segments)]
        specs = [
            ((rsh, z0), (ro, z0 + zs), (0.30, -0.954), (0.978, -0.208), body),
            ((ro, z0 + zs), (ro, z0 + h - zs), (1.0, 0.0), (1.0, 0.0), groove),
            ((ro, z0 + h - zs), (rsh, z0 + h), (0.978, 0.208), (0.30, 0.954), body),
            ((ri, z0 + h), (ri, z0), (-1.0, 0.0), (-1.0, 0.0), inner),
        ]
        revolve(mesh, specs, thetas)
        # Raised chevron tread blocks, 5.5 mm proud of the darker groove band.
        rows = [
            (z0 + zs + 0.006, z0 + h * 0.5 - 0.0055, 0.0, skew),
            (z0 + h * 0.5 + 0.0055, z0 + h - zs - 0.006, period * 0.5, -skew),
        ]
        for za, zb, phase, row_skew in rows:
            for b in range(blocks):
                a0 = th0 + phase + b * period
                corners = [(a0, za), (a0 + block_len, za), (a0 + block_len + row_skew, zb), (a0 + row_skew, zb)]
                pts = [(rb * math.cos(a), rb * math.sin(a), z) for a, z in corners]
                nrm = [(math.cos(a), math.sin(a), 0.0) for a, _ in corners]
                mesh.quad(body, pts[0], pts[1], pts[2], pts[3], nrm[0], nrm[1], nrm[2], nrm[3])
    # Visible top sidewall of the top tyre, slightly crowned.
    zt = count * h
    mid = (rsh + ri) * 0.5
    thetas = [rotations[(count - 1) % len(rotations)] * step + step * j for j in range(segments)]
    revolve(mesh, [
        ((rsh, zt), (mid, zt + 0.006), (0.16, 0.987), (0.0, 1.0), body),
        ((mid, zt + 0.006), (ri, zt), (0.0, 1.0), (-0.16, 0.987), body),
    ], thetas)
    return mesh


# ---------------------------------------------------------------------------
# Truss towers and banners
# ---------------------------------------------------------------------------
GATE = {
    "inner": 9.0,           # clear width between tower faces at scale 1
    "start_tower": 0.50,
    "finish_tower": 0.60,
}


def truss_tower(mesh, chord_mat, lace_mat, cx, cy, half, z0, z1, chord_r, lace_r, panel, pattern):
    corners = [(cx - half, cy - half), (cx + half, cy - half), (cx + half, cy + half), (cx - half, cy + half)]
    for x, y in corners:
        prism(mesh, chord_mat, (x, y, z0), (x, y, z1), chord_r, sides=6, smooth=True, roll=0.0)
    levels = max(1, int(round((z1 - z0) / panel)))
    dz = (z1 - z0) / levels
    for level in range(levels + 1):
        z = z0 + level * dz
        z = min(max(z, z0 + lace_r * 2.0), z1 - lace_r * 2.0)
        for f in range(4):
            a, b = corners[f], corners[(f + 1) % 4]
            prism(mesh, lace_mat, (a[0], a[1], z), (b[0], b[1], z), lace_r)
    for level in range(levels):
        za, zb = z0 + level * dz, z0 + (level + 1) * dz
        for f in range(4):
            a, b = corners[f], corners[(f + 1) % 4]
            if pattern == "x":
                prism(mesh, lace_mat, (a[0], a[1], za), (b[0], b[1], zb), lace_r)
                prism(mesh, lace_mat, (b[0], b[1], za), (a[0], a[1], zb), lace_r)
            elif (level + f) % 2 == 0:
                prism(mesh, lace_mat, (a[0], a[1], za), (b[0], b[1], zb), lace_r)
            else:
                prism(mesh, lace_mat, (b[0], b[1], za), (a[0], a[1], zb), lace_r)


def banner_faces(mesh, x0, x1, y0, y1, z0, z1):
    """Front face looks toward -Y (approaching car), back face toward +Y.

    Both frames read left-to-right for a viewer standing in front of them.
    u = 0 is the banner centre, v = 0 is the banner bottom edge.
    """
    cx = (x0 + x1) * 0.5
    front = Face(mesh, (cx, y0, z0), (1.0, 0.0, 0.0), (0.0, 0.0, 1.0))
    back = Face(mesh, (cx, y1, z0), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0))
    return front, back


def checker(face, u0, v0, u1, v1, cols, rows, layer=1, black_first=True):
    cw, rh = (u1 - u0) / cols, (v1 - v0) / rows
    for i in range(cols):
        for j in range(rows):
            black = ((i + j) % 2 == 0) == black_first
            face.rect(mat("check_black") if black else mat("check_white"),
                      u0 + i * cw, v0 + j * rh, u0 + (i + 1) * cw, v0 + (j + 1) * rh, layer)


def build_gate_start():
    mesh = Mesh("gate_start")
    inner, tw = GATE["inner"], GATE["start_tower"]
    top = 5.90
    banner_z0, banner_z1 = 4.62, 5.78
    depth = 0.20
    for side in (-1, 1):
        cx = side * (inner * 0.5 + tw * 0.5)
        box(mesh, mat("plate_dark"), cx - 0.40, -0.40, 0.0, cx + 0.40, 0.40, 0.06, faces="xXyYZ")
        truss_tower(mesh, mat("truss_blue"), mat("truss_blue"), cx, 0.0, tw * 0.5 - 0.03, 0.06, top,
                    0.030, 0.012, 0.56, "x")
        box(mesh, mat("truss_blue"), cx - 0.27, -0.27, top, cx + 0.27, 0.27, top + 0.05)
    # Banner box spans the clear width; its ends sit against the tower chords.
    x0, x1 = -inner * 0.5 - 0.02, inner * 0.5 + 0.02
    box(mesh, mat("banner_frame"), x0, -depth * 0.5, banner_z0, x1, depth * 0.5, banner_z1)
    h = banner_z1 - banner_z0
    start_text, _, _ = text_triangles("START", "open-sans-latin-800-normal.woff", 2.18, 0.50)
    drift_text, _, _ = text_triangles("DRIFT", "racing-sans-one-latin-400-normal.woff", 1.62, 0.46)
    sketch_text, _, _ = text_triangles("SKETCH", "racing-sans-one-latin-400-normal.woff", 1.62, 0.40)
    for face in banner_faces(mesh, x0, x1, -depth * 0.5, depth * 0.5, banner_z0, banner_z1):
        # Left sponsor panel: white with blue lettering and a red swoosh.
        lu0, lu1 = -4.44, -2.46
        face.rect(mat("check_white"), lu0, 0.07, lu1, h - 0.07, 1)
        lc = (lu0 + lu1) * 0.5
        face.triangles(mat("sponsor_blue"), place(drift_text, lc, h * 0.58), 2)
        face.poly(mat("banner_red"), [(lu0 + 0.18, 0.20), (lu1 - 0.26, 0.20), (lu1 - 0.12, 0.29), (lu0 + 0.32, 0.29)], 2)
        # Centre: red frame, checker blocks and the white START panel.
        cu = 2.36
        face.rect(mat("banner_red"), -cu, 0.03, cu, 0.11, 1)
        face.rect(mat("banner_red"), -cu, h - 0.11, cu, h - 0.03, 1)
        face.rect(mat("banner_red"), -cu, 0.11, -cu + 0.08, h - 0.11, 1)
        face.rect(mat("banner_red"), cu - 0.08, 0.11, cu, h - 0.11, 1)
        inner_u = cu - 0.08
        panel_u = 1.30
        checker(face, -inner_u, 0.11, -panel_u, h - 0.11, 6, 6, 1)
        checker(face, panel_u, 0.11, inner_u, h - 0.11, 6, 6, 1, black_first=False)
        face.rect(mat("check_white"), -panel_u, 0.11, panel_u, h - 0.11, 1)
        face.triangles(mat("text_dark"), place(start_text, 0.0, h * 0.5), 2)
        # Right sponsor panel: blue -> teal -> green bands, white lettering.
        ru0, ru1 = 2.46, 4.44
        band = (h - 0.14) / 3.0
        face.rect(mat("sponsor_blue"), ru0, h - 0.07 - band, ru1, h - 0.07, 1)
        face.rect(mat("sponsor_teal"), ru0, 0.07 + band, ru1, h - 0.07 - band, 1)
        face.rect(mat("sponsor_green"), ru0, 0.07, ru1, 0.07 + band, 1)
        face.triangles(mat("check_white"), place(sketch_text, (ru0 + ru1) * 0.5, h * 0.5), 2)
    return mesh


def build_gate_finish():
    mesh = Mesh("gate_finish")
    inner, tw = GATE["inner"], GATE["finish_tower"]
    top = 4.70
    banner_z0, banner_z1 = 4.75, 5.77
    depth = 0.24
    for side in (-1, 1):
        cx = side * (inner * 0.5 + tw * 0.5)
        box(mesh, mat("plate_dark"), cx - 0.45, -0.45, 0.0, cx + 0.45, 0.45, 0.06, faces="xXyYZ")
        truss_tower(mesh, mat("truss_steel"), mat("truss_steel"), cx, 0.0, tw * 0.5 - 0.035, 0.06, top,
                    0.034, 0.014, 0.58, "z")
        box(mesh, mat("truss_steel"), cx - 0.36, -0.36, top, cx + 0.36, 0.36, banner_z0)
    half = inner * 0.5 + tw + 0.25
    box(mesh, mat("truss_steel"), -half, -depth * 0.5, banner_z0, half, depth * 0.5, banner_z1)
    h = banner_z1 - banner_z0
    finish_text, _, _ = text_triangles("FINISH", "oswald-latin-700-normal.woff", 3.05, 0.64)
    panel = 1.95
    rows = 3
    v0, v1 = 0.06, h - 0.06
    square = (v1 - v0) / rows
    width = half - 0.06 - panel
    cols = max(2, int(round(width / square)))
    for face in banner_faces(mesh, -half, half, -depth * 0.5, depth * 0.5, banner_z0, banner_z1):
        checker(face, -half + 0.06, v0, -panel, v1, cols, rows, 1, black_first=True)
        checker(face, panel, v0, half - 0.06, v1, cols, rows, 1, black_first=(cols % 2 == 1))
        face.rect(mat("finish_red"), -panel, v0, panel, v1, 1)
        face.triangles(mat("check_white"), place(finish_text, 0.0, h * 0.5), 2)
    return mesh


# ---------------------------------------------------------------------------
# Stunt ring
# ---------------------------------------------------------------------------
RING = {"major": 3.3, "tube": 0.3}   # clear opening 6.0 m, outer diameter 7.2 m


def build_ring():
    """Hoop in the local XZ plane (cars drive along +Y through it).

    The origin is the lowest point of the clear opening, so with no lift the
    opening starts at ground level and the bottom tube is below ground.
    """
    mesh = Mesh("ring")
    major, tube = RING["major"], RING["tube"]
    zc = major - tube
    nm, nt = 64, 12
    red, white = mat("ring_red"), mat("ring_white")

    def frame(phi, psi):
        e = (math.sin(phi), 0.0, math.cos(phi))
        normal = add(mul(e, math.cos(psi)), (0.0, math.sin(psi), 0.0))
        centre = (major * e[0], 0.0, zc + major * e[2])
        return add(centre, mul(normal, tube)), normal

    for i in range(nm):
        pa = -math.pi / 16 + 2.0 * math.pi * i / nm
        pb = -math.pi / 16 + 2.0 * math.pi * (i + 1) / nm
        material = red if (i // 4) % 2 == 0 else white
        for j in range(nt):
            sa = 2.0 * math.pi * j / nt
            sb = 2.0 * math.pi * (j + 1) / nt
            a, na = frame(pa, sa)
            b, nb = frame(pb, sa)
            c, nc = frame(pb, sb)
            d, nd = frame(pa, sb)
            mesh.quad(material, a, b, c, d, na, nb, nc, nd)
    return mesh


# ---------------------------------------------------------------------------
# COLLADA + material JSON writers
# ---------------------------------------------------------------------------
def fmt(value, digits=5):
    text = ("%." + str(digits) + "f") % value
    text = text.rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def uv_for(point, face_normal):
    ax, ay, az = abs(face_normal[0]), abs(face_normal[1]), abs(face_normal[2])
    if az >= ax and az >= ay:
        return point[0], point[1]
    if ax >= ay:
        return point[1], point[2]
    return point[0], point[2]


def write_dae(mesh, path, comment):
    positions, normals, uvs = [], [], []
    pos_index, nrm_index, uv_index = {}, {}, {}

    def index_of(table, store, key):
        found = table.get(key)
        if found is None:
            found = len(store)
            table[key] = found
            store.append(key)
        return found

    groups = []
    for material, tris in mesh.groups.items():
        indices = []
        for p0, p1, p2, n0, n1, n2 in tris:
            face = unit(cross(sub(p1, p0), sub(p2, p0)))
            for p, n in ((p0, n0), (p1, n1), (p2, n2)):
                pk = tuple(round(c, 5) + 0.0 for c in p)
                nk = tuple(round(c, 5) + 0.0 for c in n)
                u, v = uv_for(p, face)
                uk = (round(u, 4) + 0.0, round(v, 4) + 0.0)
                indices.extend((index_of(pos_index, positions, pk), index_of(nrm_index, normals, nk),
                                index_of(uv_index, uvs, uk)))
        groups.append((material, len(tris), indices))

    name = mesh.name
    lines = ["<?xml version='1.0' encoding='utf-8'?>",
             '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
             "<asset><contributor><author>%s</author><comments>%s</comments></contributor>" % (AUTHOR, comment),
             "<created>%s</created><modified>%s</modified>" % (STAMP, STAMP),
             '<unit meter="1" name="meter" /><up_axis>Z_UP</up_axis></asset>',
             "<library_effects>"]
    for material, _, _ in groups:
        color, roughness, _metal = MATERIALS[material[len(MAT):]]
        shininess = max(4, int(round((1.0 - roughness) * 64)))
        lines.append('<effect id="%s-effect"><profile_COMMON><technique sid="common"><phong>'
                     '<diffuse><color sid="diffuse">%s %s %s 1</color></diffuse>'
                     '<specular><color sid="specular">0.12 0.12 0.12 1</color></specular>'
                     '<shininess><float>%d</float></shininess></phong></technique></profile_COMMON></effect>'
                     % (material, fmt(color[0], 4), fmt(color[1], 4), fmt(color[2], 4), shininess))
    lines.append("</library_effects><library_materials>")
    for material, _, _ in groups:
        lines.append('<material id="%s" name="%s"><instance_effect url="#%s-effect" /></material>'
                     % (material, material, material))
    lines.append("</library_materials><library_geometries>")
    lines.append('<geometry id="%s-geometry" name="%s"><mesh>' % (name, name))

    def source(kind, values, stride, params):
        flat = " ".join(fmt(c) for value in values for c in value)
        count = len(values)
        param_xml = "".join('<param name="%s" type="float" />' % p for p in params)
        return ('<source id="%s-%s"><float_array id="%s-%s-array" count="%d">%s</float_array>'
                '<technique_common><accessor source="#%s-%s-array" count="%d" stride="%d">%s</accessor>'
                '</technique_common></source>'
                % (name, kind, name, kind, count * stride, flat, name, kind, count, stride, param_xml))

    lines.append(source("positions", positions, 3, "XYZ"))
    lines.append(source("normals", normals, 3, "XYZ"))
    lines.append(source("uv", uvs, 2, "ST"))
    lines.append('<vertices id="%s-vertices"><input semantic="POSITION" source="#%s-positions" /></vertices>'
                 % (name, name))
    for material, count, indices in groups:
        lines.append('<triangles material="%s" count="%d">'
                     '<input semantic="VERTEX" source="#%s-vertices" offset="0" />'
                     '<input semantic="NORMAL" source="#%s-normals" offset="1" />'
                     '<input semantic="TEXCOORD" source="#%s-uv" offset="2" set="0" />'
                     '<p>%s</p></triangles>'
                     % (material, count, name, name, name, " ".join(str(i) for i in indices)))
    lines.append("</mesh></geometry></library_geometries>")
    lines.append('<library_visual_scenes><visual_scene id="Scene" name="Scene">'
                 '<node id="%s" name="%s"><instance_geometry url="#%s-geometry"><bind_material><technique_common>'
                 % (name, name, name))
    for material, _, _ in groups:
        lines.append('<instance_material symbol="%s" target="#%s" />' % (material, material))
    lines.append("</technique_common></bind_material></instance_geometry></node></visual_scene>"
                 "</library_visual_scenes>")
    lines.append('<scene><instance_visual_scene url="#Scene" /></scene></COLLADA>')
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_materials(path, used):
    namespace = uuid.UUID("5d0c6f3e-7c5b-4f43-9c1f-d81f75a0a909")
    data = OrderedDict()
    for short, (color, roughness, metal) in MATERIALS.items():
        name = MAT + short
        if name not in used:
            continue
        data[name] = OrderedDict([
            ("name", name),
            ("mapTo", name),
            ("class", "Material"),
            ("persistentId", str(uuid.uuid5(namespace, name))),
            ("version", 1.5),
            ("Stages", [OrderedDict([
                ("baseColorFactor", [round(color[0], 4), round(color[1], 4), round(color[2], 4), 1]),
                ("metallicFactor", metal),
                ("roughnessFactor", roughness),
            ]), {}, {}, {}]),
            ("translucentBlendOp", "None"),
            ("doubleSided", False),
        ])
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def build_all():
    return OrderedDict([
        ("cone.dae", (build_cone(), "Original DriftSketch 0.9.0 traffic cone: orange body, two white bands, open tip")),
        ("tire_stack_red.dae", (build_tire_stack("red"), "Original DriftSketch 0.9.0 four-tyre barrier stack, red")),
        ("tire_stack_white.dae", (build_tire_stack("white"), "Original DriftSketch 0.9.0 four-tyre barrier stack, white")),
        ("tire_stack_blue.dae", (build_tire_stack("blue"), "Original DriftSketch 0.9.0 four-tyre barrier stack, blue")),
        ("gate_start.dae", (build_gate_start(), "Original DriftSketch 0.9.0 START truss gate; geometric lettering, no textures")),
        ("gate_finish.dae", (build_gate_finish(), "Original DriftSketch 0.9.0 FINISH truss gate; geometric checker, no textures")),
        ("ring.dae", (build_ring(), "Original DriftSketch 0.9.0 red/white stunt ring")),
    ])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meshes = build_all()
    used = set()
    for file_name, (mesh, comment) in meshes.items():
        write_dae(mesh, OUT / file_name, comment)
        used.update(mesh.groups.keys())
        low, high = mesh.bounds()
        print("%-22s %6d tris  %d materials  x %.3f..%.3f  y %.3f..%.3f  z %.3f..%.3f" % (
            file_name, mesh.triangle_count(), len(mesh.groups), low[0], high[0], low[1], high[1], low[2], high[2]))
    write_materials(OUT / "main.materials.json", used)
    print("materials: %d -> %s" % (len(used), OUT / "main.materials.json"))
    print("EXPECTED = {%s}" % ", ".join('"%s": %d' % (k, m.triangle_count()) for k, (m, _) in meshes.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
