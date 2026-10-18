"""One builder per asset. Each builder adds meshes to the (already reset) scene.
Buildings face -Y (toward camera). Add new assets to ASSETS at the bottom."""
import math
import random
import bpy
from mathutils import Euler, Vector
from common import _mats as _gm
from common import box, cyl, sph, cone, torus, prism, clay, bevel, smooth, lin, HEX

R = math.radians
WOOD = "#DDB985"
HEX["wood"] = WOOD
HEX["sun"] = "#FFB92E"
HEX["warm"] = "#F2A93B"
HEX["grass"] = "#6FD36F"
HEX["wood_dark"] = "#B98F5C"
HEX["stripe"] = "#F2786E"


# ---------- shared pieces ----------

def base(r=1.5):
    """Round sod tile every building stands on; top surface at z=0."""
    cyl((0, 0, -0.2), r, 0.4, "brown", bev=0.12)
    cyl((0, 0, -0.07), r + 0.06, 0.14, "grass", bev=0.07)


def bone(loc, length, thick, mat, rot=(0, 0, 0), plane="xy"):
    m = Euler(rot).to_matrix()
    cm = (m @ Euler((0, R(90), 0)).to_matrix()).to_euler()
    cyl(loc, thick, length, mat, bev=0.0, rot=cm, verts=24)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = Vector(loc) + m @ Vector((sx * length / 2, sy * thick * 0.85, 0) if plane == "xy" else (sx * length / 2, 0, sy * thick * 0.85))
            sph(p, thick * 0.95, mat)


def flower(loc, color, s=1.0, stem=0.35):
    x, y, z = loc
    cyl((x, y, z + stem * s / 2), 0.025 * s, stem * s, "grass_dark", bev=0, verts=12)
    top = z + stem * s
    for i in range(5):
        a = i * 2 * math.pi / 5
        sph((x + math.cos(a) * 0.1 * s, y + math.sin(a) * 0.1 * s, top), 0.085 * s, color, (1, 1, 0.55))
    sph((x, y, top + 0.03 * s), 0.065 * s, "yellow")


def bush(loc, r, mat="grass_dark"):
    x, y, z = loc
    sph((x, y, z + r * 0.7), r, mat, (1, 1, 0.8))
    sph((x + r * 0.7, y + r * 0.2, z + r * 0.5), r * 0.7, mat, (1, 1, 0.8))
    sph((x - r * 0.6, y - r * 0.1, z + r * 0.45), r * 0.65, mat, (1, 1, 0.8))


def heart(loc, s, mat="coral"):
    x, y, z = loc
    sph((x - 0.5 * s, y, z + 0.35 * s), 0.55 * s, mat, (1, 0.6, 1))
    sph((x + 0.5 * s, y, z + 0.35 * s), 0.55 * s, mat, (1, 0.6, 1))
    box((x, y, z - 0.05 * s), (0.98 * s, 0.6 * s, 0.98 * s), mat, bev=0.2 * s, rot=(0, R(45), 0))


def hut(w, d, h, rise, wall=WOOD, roof="coral", door=True, y0=0.0, z0=0.0, x0=0.0):
    """Gabled hut, ridge along Y, front at -Y. Returns front-face y."""
    box((x0, y0, z0 + h / 2), (w, d, h), wall, bev=0.05)
    prism((x0, y0, z0 + h - 0.01), w, d, rise, wall, bev=0.02)
    L = math.hypot(w / 2 + 0.12, rise)
    th = math.atan2(rise, w / 2)
    for s in (1, -1):
        box((x0 + s * (w / 2 + 0.12) / 2, y0, z0 + h + rise / 2 + 0.02), (L + 0.1, d + 0.3, 0.1), roof,
            bev=0.04, rot=(0, s * th, 0))
    box((x0, y0, z0 + h + rise + 0.05), (0.16, d + 0.32, 0.12), roof, bev=0.05)
    fy = y0 - d / 2
    if door:
        dw = w * 0.34
        box((x0, fy - 0.01, z0 + h * 0.28), (dw, 0.06, h * 0.56), "dark", bev=0.02)
        cyl((x0, fy - 0.01, z0 + h * 0.56), dw / 2, 0.06, "dark", bev=0.01, rot=(R(90), 0, 0))
    return fy


# ---------- shared building bits ----------

def flatbone(loc, length, thick, h, mat):
    """Bone-shaped slab (plan view), used for pool, bakery body and roof."""
    x, y, z = loc
    box((x, y, z), (length, thick * 1.0, h), mat, bev=0.04)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl((x + sx * length / 2, y + sy * thick * 0.7, z), thick * 0.75, h, mat, bev=min(0.06, h / 2.5))


def bunting(a, b, sag, n, size=0.13):
    cols = ["pink", "yellow", "mint", "lav", "coral", "sky"]
    for i in range(n):
        t = (i + 0.5) / n
        p = [a[k] + (b[k] - a[k]) * t for k in range(3)]
        p[2] -= sag * 4 * t * (1 - t)
        cone((p[0], p[1], p[2] - size * 1.0), size, size * 2, cols[i % 6], rot=(R(180), 0, 0), bev=0.0)


def string_lights(a, b, sag, n):
    for i in range(n):
        t = i / (n - 1)
        p = [a[k] + (b[k] - a[k]) * t for k in range(3)]
        p[2] -= sag * 4 * t * (1 - t)
        sph(p, 0.1, "yellow")


def duck(x, y, z):
    sph((x, y, z), 0.2, "yellow", (1.2, 1, 0.9))
    sph((x, y - 0.12, z + 0.2), 0.13, "yellow")
    box((x, y - 0.27, z + 0.17), (0.12, 0.1, 0.05), "warm", bev=0.02)
    sph((x - 0.2, y + 0.05, z + 0.1), 0.1, "yellow")


def fenced_bed():
    box((0, 0.1, 0.07), (2.2, 1.5, 0.16), "brown", bev=0.06)
    fence(-1.25, 1.25, -0.85, 8)
    for sx in (-1.25, 1.25):
        for i in range(5):
            box((sx, -0.85 + i * 0.45, 0.2), (0.08, 0.12, 0.4), "cream", bev=0.04)
        box((sx, 0.05, 0.3), (0.05, 1.8, 0.06), "cream", bev=0.02)


# ---------- doghouse ----------

def doghouse(stage):
    if stage == 3:
        return palace()
    base(1.5 if stage == 1 else 1.7)
    sizes = {1: (1.3, 1.2, 0.85, 0.55), 2: (1.6, 1.4, 1.0, 0.7)}
    w, d, h, rise = sizes[stage]
    y0 = 0.15 if stage > 1 else 0.0
    fy = hut(w, d, h, rise, y0=y0)
    if stage == 2:
        box((0, fy - 0.3, 0.05), (w * 0.8, 0.6, 0.1), "wood_dark", bev=0.04)
        for sx in (-1, 1):
            cyl((sx * w * 0.36, fy - 0.55, 0.45), 0.04, 0.8, "cream", bev=0.0, verts=12)
        cyl((0.38, fy - 0.42, 0.16), 0.17, 0.12, "blue", bev=0.04)
        sph((0.38, fy - 0.42, 0.24), 0.14, "cream", (1, 1, 0.4))
        bone((-0.3, fy - 0.38, 0.12), 0.3, 0.05, "cream", rot=(0, 0, R(20)))
        top = h + rise + 0.1
        cyl((0.0, y0, top + 0.25), 0.025, 0.5, "cream", bev=0, verts=12)
        prism((0, y0, top + 0.38), 0.24, 0.03, 0.16, "warm", bev=0.0)
        box((w / 2 + 0.12, y0 - 0.1, 0.45), (0.2, 0.5, 0.16), "wood_dark", bev=0.04)
        for i, c in enumerate(("pink", "yellow", "lav")):
            sph((w / 2 + 0.12, y0 - 0.25 + i * 0.15, 0.58), 0.08, c)
        bush((-w / 2 - 0.4, 0.3, 0), 0.25)


def palace():
    base(3.1)
    # ground floor
    box((0.3, 0.2, 0.6), (3.0, 2.0, 1.2), WOOD, bev=0.06)
    box((0.3, 0.2, 1.24), (3.2, 2.2, 0.14), "coral", bev=0.05)
    fy = -0.8
    box((0.3, fy - 0.01, 0.4), (0.7, 0.06, 0.8), "dark", bev=0.02)
    cyl((0.3, fy - 0.01, 0.8), 0.35, 0.06, "dark", bev=0.01, rot=(R(90), 0, 0))
    for x in (-0.7, 1.3):
        cyl((x, fy - 0.01, 0.72), 0.24, 0.06, "sky", bev=0.02, rot=(R(90), 0, 0))
    # upper floor
    hut(2.2, 1.6, 1.0, 0.8, WOOD, "coral", door=False, y0=0.2, z0=1.31, x0=0.3)
    uy = 0.2 - 0.8
    box((0.9, uy - 0.01, 1.31 + 0.35), (0.5, 0.06, 0.7), "dark", bev=0.02)
    cyl((0.9, uy - 0.01, 1.31 + 0.7), 0.25, 0.06, "dark", bev=0.01, rot=(R(90), 0, 0))
    cyl((-0.15, uy - 0.01, 1.31 + 0.5), 0.22, 0.06, "sky", bev=0.02, rot=(R(90), 0, 0))
    # slide from the upper door
    th = math.atan2(1.25, 1.6)
    L = math.hypot(1.25, 1.6)
    cy, cz = -0.95 - 0.8, 1.38 - 0.62
    box((0.9, cy, cz), (0.62, L, 0.1), "sky", bev=0.04, rot=(th, 0, 0))
    for sx in (-0.34, 0.34):
        box((0.9 + sx, cy, cz + 0.08), (0.07, L, 0.14), "cream", bev=0.03, rot=(th, 0, 0))
    # round tower + pennant
    cyl((-1.7, 0.6, 1.4), 0.78, 2.8, "cream", bev=0.06)
    cyl((-1.7, 0.6, 2.85), 0.88, 0.14, "coral", bev=0.05)
    cone((-1.7, 0.6, 3.5), 0.95, 1.1, "coral", bev=0.04)
    cyl((-1.7, 0.6, 4.3), 0.03, 0.7, "cream", bev=0, verts=12)
    prism((-1.55, 0.6, 4.35), 0.45, 0.03, 0.25, "warm", bev=0.0).rotation_euler = (0, R(-90), 0)
    cyl((-1.7, -0.17, 1.9), 0.17, 0.06, "sky", bev=0.02, rot=(R(90), 0, 0))
    cyl((-1.7, -0.17, 0.6), 0.2, 0.06, "dark", bev=0.02, rot=(R(90), 0, 0))
    # giant bone weathervane
    cyl((0.3, 0.2, 3.5), 0.04, 1.0, "wood_dark", bev=0, verts=12)
    bone((0.3, 0.2, 4.05), 1.1, 0.12, "warm", rot=(0, R(-8), 0), plane="xz")
    # bone-shaped pool with duck
    flatbone((-0.6, -2.15, 0.07), 1.9, 0.6, 0.14, "cream")
    flatbone((-0.6, -2.15, 0.1), 1.86, 0.5, 0.1, "sky")
    duck(-0.45, -2.15, 0.28)
    # bunting + string lights
    bunting((-1.2, -1.02, 1.1), (1.8, -1.02, 1.1), 0.2, 11)
    for (x, y) in ((2.3, -1.9), (2.5, 0.6)):
        cyl((x, y, 0.8), 0.05, 1.6, "wood_dark", bev=0, verts=12)
        sph((x, y, 1.62), 0.09, "yellow")
    string_lights((2.3, -1.9, 1.6), (2.5, 0.6, 1.6), 0.35, 9)


# ---------- bakery ----------

def awning(w, y_wall, z_top, n=6, depth=0.6, x0=0.0):
    th = math.atan2(0.22, depth)
    sw = w / n
    for i in range(n):
        x = x0 - w / 2 + sw * (i + 0.5)
        box((x, y_wall - depth / 2, z_top - 0.11), (sw, depth / math.cos(th), 0.06),
            "stripe" if i % 2 == 0 else "cream", bev=0.02, rot=(th, 0, 0))


def bakery(stage):
    if stage == 3:
        return bone_bakery()
    base(1.55 if stage == 1 else 1.8)
    if stage == 1:
        box((0, 0, 0.55), (1.5, 0.95, 0.7), "cream", bev=0.07)
        box((0, -0.05, 0.93), (1.65, 1.05, 0.1), "pink", bev=0.04)
        for sx in (-0.85, 0.85):
            cyl((sx, 0.0, 0.3), 0.3, 0.1, "wood_dark", bev=0.04, rot=(0, R(90), 0))
            cyl((sx + (0.07 if sx > 0 else -0.07), 0.0, 0.3), 0.1, 0.06, "warm", bev=0.02, rot=(0, R(90), 0))
        sph((-0.35, 0.1, 0.98), 0.45, "coral", (1, 0.9, 0.85))
        box((-0.35, -0.3, 1.1), (0.28, 0.1, 0.26), "dark", bev=0.04)
        cyl((-0.55, 0.25, 1.55), 0.1, 0.35, "wood_dark", bev=0.03)
        for (x, y, r) in ((0.35, -0.2, 20), (0.6, 0.1, -25), (0.2, 0.15, 60)):
            bone((x, y, 1.07), 0.3, 0.045, "warm", rot=(0, 0, R(r)))
        box((0.1, -0.55, 0.7), (1.0, 0.04, 0.3), "mint", bev=0.02)
        return
    w, d, h = 1.8, 1.4, 1.05
    box((0, 0, h / 2), (w, d, h), "cream", bev=0.06)
    fy = -d / 2
    box((0, 0, h + 0.08), (w + 0.2, d + 0.2, 0.18), "coral", bev=0.07)
    box((-w * 0.27, fy - 0.01, h * 0.38), (0.4, 0.05, 0.62), "dark", bev=0.03)
    box((w * 0.2, fy - 0.01, h * 0.55), (w * 0.4, 0.05, 0.42), "sky", bev=0.03)
    box((w * 0.2, fy - 0.2, h * 0.34), (w * 0.46, 0.4, 0.07), "wood_dark", bev=0.03)
    for i in range(3):
        bone((w * 0.07 + i * 0.28, fy - 0.2, h * 0.34 + 0.09), 0.2, 0.035, "warm", rot=(0, 0, R(10 - i * 25)))
    awning(w * 0.56, fy, h * 0.78, n=6)
    cyl((w / 2 + 0.45, fy - 0.25, 0.7), 0.04, 1.4, "wood_dark", bev=0, verts=12)
    box((w / 2 + 0.2, fy - 0.25, 1.35), (0.5, 0.05, 0.05), "wood_dark", bev=0.0)
    bone((w / 2 + 0.25, fy - 0.27, 1.05), 0.5, 0.09, "warm", rot=(0, 0, 0))
    bush((-w / 2 - 0.4, 0.2, 0), 0.25, "grass_dark")


def bone_bakery():
    base(3.6)
    H = 1.6
    flatbone((0, 0, H / 2), 3.6, 1.4, H, "cream")
    flatbone((0, 0, H + 0.09), 3.7, 1.45, 0.18, "coral")
    # window + conveyor belt of oversized cookies
    fy = -0.7
    box((0, fy - 0.01, 0.95), (1.1, 0.06, 0.6), "dark", bev=0.03)
    th = math.atan2(0.75, 1.9)
    L = math.hypot(0.75, 1.9)
    box((0, fy - 0.95, 0.43), (0.75, L, 0.12), "#8A7F78", bev=0.04, rot=(th, 0, 0))
    n = (0, -math.sin(th), math.cos(th))
    for t in (0.22, 0.52, 0.82):
        p = (0, fy - 1.9 * t, 0.8 - 0.75 * t)
        c = (p[0], p[1] + n[1] * 0.2, p[2] + n[2] * 0.2)
        cyl(c, 0.34, 0.14, "warm", bev=0.05, rot=(th, 0, 0))
        for dx, dy in ((-0.1, 0.05), (0.1, -0.08), (0.02, 0.12)):
            sph((c[0] + dx, c[1] + dy * n[2] + n[1] * 0.08, c[2] + 0.09), 0.055, "dark")
    # door on the left lobe
    box((-1.8, -2.04, 0.45), (0.6, 0.06, 0.9), "dark", bev=0.02)
    cyl((-1.8, -2.04, 0.9), 0.3, 0.06, "dark", bev=0.01, rot=(R(90), 0, 0))
    cyl((1.8, -2.04, 0.95), 0.26, 0.06, "sky", bev=0.02, rot=(R(90), 0, 0))
    # donut chimney + heart smoke
    cyl((1.8, 0.7, H + 0.7), 0.3, 1.2, "wood_dark", bev=0.04)
    torus((1.8, 0.7, H + 0.55), 0.55, 0.24, "pink")
    torus((1.8, 0.7, H + 0.62), 0.5, 0.2, "coral")
    for i in range(7):
        a = i * 2 * math.pi / 7
        box((1.8 + math.cos(a) * 0.5, 0.7 + math.sin(a) * 0.5, H + 0.84), (0.14, 0.04, 0.04),
            ("white", "yellow", "mint")[i % 3], bev=0.01, rot=(0, 0, a))
    for (dx, z, s, c) in ((0.05, 3.55, 0.22, "white"), (0.3, 4.05, 0.3, "pink"), (0.1, 4.7, 0.38, "white")):
        heart((1.8 + dx, 0.2, z), s, c)
    # cupcake on the roof
    cone((-0.3, 0.1, H + 0.42), 0.42, 0.5, "mint", rot=(R(180), 0, 0), bev=0.04)
    sph((-0.3, 0.1, H + 0.78), 0.45, "pink", (1, 1, 0.8))
    sph((-0.3, 0.1, H + 1.08), 0.28, "white", (1, 1, 0.8))
    sph((-0.3, 0.1, H + 1.3), 0.11, "coral")
    # queue of tiny bowls
    for (x, y, c) in ((-1.75, -2.55, "coral"), (-1.4, -2.9, "sky"), (-1.0, -3.2, "mint")):
        cyl((x, y, 0.07), 0.22, 0.14, c, bev=0.05)
        sph((x, y, 0.15), 0.17, "brown_dark", (1, 1, 0.5))


# ---------- garden ----------

def fence(x0, x1, y, n, mat="cream"):
    for i in range(n):
        x = x0 + (x1 - x0) * i / (n - 1)
        box((x, y, 0.2), (0.12, 0.08, 0.4), mat, bev=0.04)
    box(((x0 + x1) / 2, y, 0.3), (x1 - x0, 0.05, 0.06), mat, bev=0.02)


def garden(stage):
    if stage == 3:
        return jungle()
    base(1.5 if stage == 1 else 1.85)
    cols = ["pink", "yellow", "lav", "coral", "pink", "yellow"]
    if stage == 1:
        box((0, 0.1, 0.07), (1.7, 1.2, 0.16), "brown", bev=0.06)
        for i, (x, y) in enumerate([(-0.4, 0.0), (0.15, 0.2), (0.45, -0.1)]):
            flower((x, y, 0.15), cols[i], s=1.0, stem=0.3)
        return
    fenced_bed()
    pos = [(-0.8, 0.3), (-0.4, -0.2), (0.0, 0.4), (0.4, 0.0), (0.8, 0.35), (-0.1, -0.3)]
    for i, (x, y) in enumerate(pos):
        flower((x, y, 0.15), cols[i], s=1.0 + 0.1 * (i % 3), stem=0.3 + 0.08 * (i % 2))
    bush((-1.3, 0.7, 0), 0.3)
    bush((1.25, 0.8, 0), 0.34)
    bush((0.0, 1.15, 0), 0.28, "grass")
    # watering can
    cyl((1.0, -1.35, 0.17), 0.19, 0.34, "sky", bev=0.04)
    cyl((0.78, -1.35, 0.3), 0.03, 0.4, "sky", bev=0, rot=(0, R(-50), 0), verts=16)
    torus((1.2, -1.35, 0.2), 0.11, 0.025, "sky", rot=(R(90), 0, 0))


def jungle():
    base(3.3)
    fenced_bed()
    # rainbow arch (back right), lower halves sunk in the tile
    for i, c in enumerate(("coral", "warm", "yellow", "mint", "blue")):
        torus((1.2, 1.7, 0.0), 1.35 - i * 0.12, 0.085, c, rot=(R(90), 0, 0))
    # oversized flowers taller than the fence
    for (x, y, c, s) in ((-0.8, -0.1, "pink", 3.0), (0.2, 0.4, "lav", 3.5), (0.9, -0.2, "coral", 2.6),
                         (-0.2, -0.5, "yellow", 2.3), (-1.4, 0.7, "lav", 2.2)):
        flower((x, y, 0.15), c, s=s, stem=0.6)
    # sunflower big as a tree
    sx, sy = -0.9, 1.9
    cyl((sx, sy, 1.75), 0.13, 3.5, "grass_dark", bev=0.0, verts=16)
    sph((sx - 0.5, sy, 1.0), 0.45, "grass", (1.6, 0.6, 0.35))
    sph((sx + 0.5, sy, 1.7), 0.45, "grass", (1.6, 0.6, 0.35))
    hz = 3.7
    for i in range(14):
        a = i * 2 * math.pi / 14
        sph((sx + math.cos(a) * 0.95, sy - 0.12, hz + math.sin(a) * 0.95), 0.3, "sun", (0.8, 0.4, 1.6),
            rot=(0, math.pi / 2 - a, 0))
    cyl((sx, sy - 0.16, hz), 0.7, 0.3, "brown_dark", bev=0.08, rot=(R(90), 0, 0))
    # fountain with bone finial
    fx, fy = 1.9, -1.5
    cyl((fx, fy, 0.15), 0.85, 0.3, "cream", bev=0.07)
    cyl((fx, fy, 0.3), 0.7, 0.06, "sky", bev=0.01)
    cyl((fx, fy, 0.65), 0.15, 0.7, "cream", bev=0.03)
    cyl((fx, fy, 1.05), 0.42, 0.14, "cream", bev=0.05)
    cyl((fx, fy, 1.13), 0.34, 0.05, "sky", bev=0.01)
    bone((fx, fy, 1.5), 0.55, 0.07, "warm", rot=(0, R(90), 0), plane="xz")
    for a in (0, 2.1, 4.2):
        sph((fx + math.cos(a) * 0.55, fy + math.sin(a) * 0.55, 0.55), 0.06, "sky")
    # round bush-tree with treehouse
    tx, ty = -1.8, -0.4
    cyl((tx, ty, 0.6), 0.22, 1.2, "wood_dark", bev=0.03)
    sph((tx, ty + 0.3, 2.5), 1.25, "grass_dark")
    sph((tx + 0.7, ty + 0.5, 2.1), 0.8, "grass_dark")
    sph((tx - 0.7, ty + 0.5, 2.2), 0.85, "grass")
    box((tx, ty - 0.7, 1.35), (1.0, 0.9, 0.1), "wood_dark", bev=0.03)
    box((tx, ty - 0.75, 1.75), (0.7, 0.6, 0.62), "cream", bev=0.04)
    prism((tx, ty - 0.75, 2.05), 0.9, 0.75, 0.4, "coral", bev=0.03)
    box((tx, ty - 1.06, 1.7), (0.22, 0.04, 0.3), "dark", bev=0.02)
    for sxl in (-0.3, 0.3):
        box((tx + sxl, ty - 1.43, 0.65), (0.07, 0.07, 1.5), "wood_dark", bev=0.02, rot=(R(-30), 0, 0))
    for k in range(4):
        box((tx, ty - 1.2 - k * 0.2, 1.15 - k * 0.3), (0.6, 0.05, 0.05), "wood_dark", bev=0.01)
    # butterflies
    for (x, y, z, c) in ((-0.9, -1.4, 2.2, "lav"), (0.7, -1.2, 2.9, "warm"), (2.4, 0.6, 1.6, "pink"), (0.0, 0.3, 3.9, "mint")):
        sph((x, y, z), 0.05, "dark", (1, 1, 1.8))
        for s in (-1, 1):
            sph((x + s * 0.17, y, z + 0.04), 0.17, c, (1, 0.25, 0.8), rot=(0, s * R(20), 0))


# ---------- icons (facing -Y, built in the XZ plane) ----------

def icon_treat():
    bone((0, 0, 0), 1.6, 0.24, "warm", rot=(0, R(-35), 0), plane="xz")
    # a few dimples
    for p in ((-0.2, 0.3), (0.2, 0.3), (0.0, 0.3)):
        pass


def icon_paw():
    sph((0, 0, -0.25), 0.6, "brown", (1.1, 0.7, 0.9))
    for x, z, r in ((-0.72, 0.4, 0.26), (-0.28, 0.78, 0.28), (0.28, 0.78, 0.28), (0.72, 0.4, 0.26)):
        sph((x, 0, z), r, "brown", (0.85, 0.7, 1.1))
    for x, z in ((-0.0, -0.3),):
        sph((x, -0.3, z), 0.3, "pink", (1.1, 0.25, 0.7))


def icon_pin():
    sph((0, 0, 0.35), 0.75, "coral")
    cone((0, 0, -0.35), 0.62, 1.1, "coral", rot=(R(180), 0, 0), bev=0.05)
    sph((0, -0.7, 0.4), 0.3, "cream", (1, 0.4, 1))


def icon_badge():
    for s, (x, a) in enumerate(((-0.3, 12), (0.3, -12))):
        box((x, 0.1, -0.85), (0.38, 0.1, 1.0), "blue", bev=0.04, rot=(0, R(a), 0))
        box((x, 0.1, -1.28), (0.38, 0.1, 0.3), "blue", bev=0.04, rot=(0, R(a * 1.5), 0)) if False else None
    cyl((0, 0, 0.3), 0.95, 0.3, "warm", bev=0.1, rot=(R(90), 0, 0))
    torus((0, -0.16, 0.3), 0.72, 0.06, "yellow", rot=(R(90), 0, 0))
    cyl((0, -0.15, 0.3), 0.64, 0.12, "cream", bev=0.04, rot=(R(90), 0, 0))
    heart((0, -0.3, 0.18), 0.28, "coral")


def icon_home():
    hut(1.5, 1.1, 0.95, 0.7, wall="cream", roof="coral")
    box((0.45, 0.2, 1.55), (0.22, 0.22, 0.5), "wood_dark", bev=0.04)
    box((0.42, -0.56, 0.55), (0.32, 0.05, 0.32), "sky", bev=0.03)


def icon_settings():
    cyl((0, 0, 0), 0.8, 0.4, "blue", bev=0.12, rot=(R(90), 0, 0))
    for i in range(8):
        a = i * math.pi / 4
        box((math.cos(a) * 0.95, 0, math.sin(a) * 0.95), (0.4, 0.4, 0.4), "blue", bev=0.1, rot=(0, -a, 0))
    cyl((0, -0.22, 0), 0.5, 0.06, "sky", bev=0.02, rot=(R(90), 0, 0))
    cyl((0, -0.26, 0), 0.3, 0.1, "cream", bev=0.04, rot=(R(90), 0, 0))


def paw(cx, cz, ang, s, mat):
    c, sn = math.cos(R(ang)), math.sin(R(ang))

    def P(px, pz):
        return (cx + (px * c - pz * sn) * s, 0, cz + (px * sn + pz * c) * s)
    sph(P(0, -0.2), 0.5 * s, mat, (1.1, 0.7, 0.9), rot=(0, -R(ang), 0))
    for x, z, r in ((-0.62, 0.35, 0.22), (-0.24, 0.7, 0.24), (0.24, 0.7, 0.24), (0.62, 0.35, 0.22)):
        sph(P(x, z), r * s, mat, (0.85, 0.7, 1.1), rot=(0, -R(ang), 0))


def icon_walks():
    for x, z, a in ((-1.05, -0.95, -35), (0.0, 0.0, -25), (1.05, 0.95, -35)):
        paw(x, z, a, 0.8 + 0.1 * (x + 1.05) / 2.1, "grass_dark")


def icon_den():
    fy = hut(1.5, 1.2, 0.95, 0.7, wall=WOOD, roof="coral")
    heart((0, fy - 0.1, 1.2), 0.32, "pink")


# ---------- backdrops ----------

def cloud(x, z, s, y=-1.0):
    for dx, dz, r in ((0, 0, 1.0), (-0.9, -0.15, 0.7), (0.9, -0.12, 0.75), (0.35, 0.45, 0.7), (-0.4, 0.4, 0.55)):
        sph((x + dx * s, y, z + dz * s), r * s, "white", (1, 0.8, 0.85))


def doorstep_sky():
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 2, 0), rotation=(R(90), 0, 0))
    p = bpy.context.active_object
    p["nofit"] = True
    m = bpy.data.materials.new("sky")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    em = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    ramp.color_ramp.elements[0].color = lin_hex("#C9ECFF")
    ramp.color_ramp.elements[1].color = lin_hex("#3E9CEB")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs[0])
    em.inputs["Strength"].default_value = 1.4
    bpy.data.worlds[0].node_tree.nodes["Background"].inputs["Strength"].default_value = 1.3
    p.data.materials.append(m)
    cloud(-1.7, 1.9, 1.0)
    cloud(1.6, 0.3, 1.25)
    cloud(-0.9, -2.2, 0.8)


def lin_hex(h):
    from common import lin
    return lin(h)


def celebration_burst():
    rnd = random.Random(7)
    cols = ["pink", "yellow", "lav", "mint", "sky", "coral", "warm"]
    n = 44
    for i in range(n):
        a = i * 2.39996 + rnd.uniform(-0.2, 0.2)
        rad = 1.1 + 2.6 * math.sqrt((i + 0.5) / n) + rnd.uniform(-0.1, 0.1)
        x, z = math.cos(a) * rad, math.sin(a) * rad
        s = 1.5 + 0.28 * rad
        c = cols[i % len(cols)]
        kind = i % 4
        rot = (R(rnd.uniform(-35, 35)), R(rnd.uniform(0, 180)), R(rnd.uniform(-35, 35)))
        if kind in (0, 1):
            box((x, 0, z), (0.42 * s, 0.1 * s, 0.17 * s), c, bev=0.035, rot=rot)
        elif kind == 2:
            sph((x, 0, z), 0.11 * s, c)
        else:
            torus((x, 0, z), 0.13 * s, 0.045 * s, c, rot=(R(90 + rnd.uniform(-30, 30)), 0, R(rnd.uniform(0, 180))))


def yard_ground(hw=1.5):
    """Backdrop hill: huge flattened ellipsoid seen nearly straight on; grass fills the frame below a
    softly curved horizon (28% from top in the centre, ~40% at the sides). Frame is 2 units tall, 2*hw wide."""
    sc = bpy.context.scene
    cam = sc.camera
    cam.data.ortho_scale = 2 * hw
    cam.location = cam.rotation_euler.to_matrix() @ Vector((0, 0, 30)) + cam.rotation_euler.to_matrix() @ Vector((0, 0.0, 0))
    sc["manual"] = True
    A, B, C = 1.6 * hw, 1.1, 1.4
    ZC = 1.0 - 0.56 - B  # horizon peak at 28% from the top of a frame spanning z = -1..1
    sph((0, 0, ZC), 1.0, "grass", (A, C, B))
    rnd = random.Random(5)
    pts = []
    n = int(22 * hw / 1.5)
    tries = 0
    while len(pts) < n and tries < 5000:
        tries += 1
        x, z = rnd.uniform(-hw + 0.1, hw - 0.1), rnd.uniform(-0.95, -0.02)
        if all((x - p) ** 2 + (z - q) ** 2 > 0.1 for p, q in pts):
            pts.append((x, z))

    def surf(x, z):
        t = 1 - (x / A) ** 2 - ((z - ZC) / B) ** 2
        return -C * math.sqrt(max(t, 0.0))
    for i, (x, z) in enumerate(pts):
        y = surf(x, z) - 0.02
        if i % 4 == 0:
            for k in range(3):
                cone((x + (k - 1) * 0.03, y, z + 0.06), 0.03, 0.14, "grass_dark", rot=(0, R((k - 1) * 20), 0), bev=0.0)
        else:
            col = "white" if i % 5 else "pink"
            for k in range(6):
                ang = k * math.pi / 3
                sph((x + math.cos(ang) * 0.04, y, z + math.sin(ang) * 0.04), 0.03, col, (1, 0.5, 1))
            sph((x, y - 0.015, z), 0.028, "yellow", (1, 0.6, 1))


# ---------- weird-streak helpers ----------

HEX.update({"brass": "#E8B84A", "rock": "#C9BED3", "rock_dark": "#9D8FB3", "navy": "#38337A", "carrot": "#FF9A3C",
            "tentacle": "#F5A3D6", "gold": "#E9B65A", "cheese": "#FFD65A", "cheese_dark": "#F0B23C", "rain": "#FFD94D"})


def glow(color, strength=2.0):
    key = ("glow", color, strength)
    if key in _gm:
        return _gm[key]
    m = bpy.data.materials.new("glow_" + color)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(HEX.get(color, color))
    b.inputs["Roughness"].default_value = 0.5
    b.inputs["Emission Color"].default_value = lin(HEX.get(color, color))
    b.inputs["Emission Strength"].default_value = strength
    _gm[key] = m
    return m


def ghost(color, alpha, emit=0.0):
    key = ("ghost", color, alpha, emit)
    if key in _gm:
        return _gm[key]
    m = bpy.data.materials.new("ghost_" + color)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(HEX.get(color, color))
    b.inputs["Roughness"].default_value = 0.2
    b.inputs["Alpha"].default_value = alpha
    if emit:
        b.inputs["Emission Color"].default_value = lin(HEX.get(color, color))
        b.inputs["Emission Strength"].default_value = emit
    m.surface_render_method = "BLENDED"
    _gm[key] = m
    return m




def rod(a, b, r, mat, verts=16):
    a, b = Vector(a), Vector(b)
    d = b - a
    rot = d.to_track_quat("Z", "Y").to_euler()
    return cyl((a + b) / 2, r, d.length, mat, bev=0.0, rot=rot, verts=verts)


def chain(pts, r0, r1, mat):
    """Smooth tube of overlapping spheres along pts, radius r0 -> r1."""
    n = len(pts)
    dense = []
    for i in range(n - 1):  # ~sphere-radius spacing so the tube reads smooth
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        k = max(1, int((b - a).length / ((r0 + r1) * 0.15)))
        for j in range(k):
            dense.append(a.lerp(b, j / k))
    dense.append(Vector(pts[-1]))
    m = len(dense)
    for i, p in enumerate(dense):
        sph(p, r0 + (r1 - r0) * i / max(1, m - 1), mat)


def bez(p0, p1, p2, p3, n):
    out = []
    for i in range(n):
        t = i / (n - 1)
        u = 1 - t
        out.append(tuple(u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k] for k in range(3)))
    return out


def star4(loc, s, mat="yellow"):
    x, y, z = loc
    box((x, y, z), (s, 0.05, s * 0.2), mat, bev=0.02)
    box((x, y, z), (s * 0.2, 0.05, s), mat, bev=0.02)


def croissant(loc, s, rot_y=0.0):
    x, y, z = loc
    for i in range(7):
        a = R(-70 + i * 23.3)
        r = (0.2 + 0.16 * (1 - abs(i - 3) / 3.0)) * s
        px, pz = math.sin(a) * 0.75 * s * math.cos(rot_y), -math.cos(a) * 0.45 * s + 0.3 * s
        sph((x + px, y, z + pz), r, "warm", (1, 1, 1), rot=(0, 0, 0))
    for i in (1, 3, 5):
        a = R(-70 + i * 23.3)
        box((x + math.sin(a) * 0.75 * s, y - 0.02, -math.cos(a) * 0.45 * s + 0.3 * s + z + 0.0), (0.03 * s, 0.04, 0.5 * s * (1 if i == 3 else .7)), "wood_dark", bev=0.01, rot=(0, -a + 0, 0))


def sunflower(x, y, h, r, tilt=0.0):
    cyl((x, y, h / 2), 0.1 * r / 0.7 * 0.6 + 0.05, h, "grass_dark", bev=0.0, verts=16)
    sph((x - 0.4, y, h * 0.3), 0.4, "grass", (1.5, 0.55, 0.3))
    sph((x + 0.4, y, h * 0.5), 0.4, "grass", (1.5, 0.55, 0.3))
    for i in range(14):
        a = i * 2 * math.pi / 14
        sph((x + math.cos(a) * r * 1.35, y - 0.12, h + math.sin(a) * r * 1.35), r * 0.43, "sun", (0.8, 0.4, 1.6),
            rot=(0, math.pi / 2 - a, 0))
    cyl((x, y - 0.16, h), r, 0.28, "brown_dark", bev=0.08, rot=(R(90), 0, 0))
    for dx in (-0.25, 0.25):  # sleepy smile
        pass


def _upper_half(o):
    import bmesh as bm_
    b = bm_.new()
    b.from_mesh(o.data)
    bm_.ops.delete(b, geom=[v for v in b.verts if v.co.z < -0.01], context="VERTS")
    b.to_mesh(o.data)
    b.free()


def mushroom(x, y, s, cap="pink", gl=1.0, z=0.0):
    cyl((x, y, z + 0.18 * s), 0.1 * s, 0.4 * s, "cream", bev=0.03)
    sph((x, y, z + 0.4 * s), 0.3 * s, glow(cap, gl), (1, 1, 0.75))
    sph((x, y, z + 0.35 * s), 0.55 * s, ghost(cap, 0.14, gl), (1, 1, 0.8))
    for dx, dy in ((-0.12, -0.15), (0.13, -0.12), (0.0, -0.22)):
        sph((x + dx * s, y + dy * s, z + 0.5 * s - abs(dx) * 0.2 * s), 0.05 * s, "cream")


# ---------- doghouse 4 / 5 ----------

def doghouse_treehouse():
    base(2.8)
    # oak
    cyl((1.15, 0.95, 1.5), 0.5, 3.0, "wood_dark", bev=0.05)
    for a in (0, 2.2, 4.2):
        sph((1.15 + math.cos(a) * 0.5, 0.95 + math.sin(a) * 0.5, 0.15), 0.28, "wood_dark", (1.2, 1.2, 0.7))
    # platform + hut (same coral roof, chimney)
    cyl((-0.1, 0.25, 2.0), 1.75, 0.16, "wood_dark", bev=0.06)
    cyl((-0.1, 0.25, 1.85), 0.35, 0.3, "wood_dark", bev=0.04)
    z0 = 2.08
    fy = hut(1.9, 1.6, 1.1, 0.8, y0=0.35, z0=z0, x0=-0.4)
    box((0.1, 0.5, z0 + 1.9), (0.22, 0.22, 0.5), "wood_dark", bev=0.04)
    for i, c in enumerate(("white", "pink")):
        sph((0.12 + i * 0.1, 0.5, z0 + 2.3 + i * 0.3), 0.1 + 0.04 * i, c)
    # canopy behind and above
    for (x, y, z, r, c) in ((1.3, 1.3, 4.5, 1.35, "grass_dark"), (0.1, 1.9, 4.0, 1.05, "grass"), (2.2, 0.9, 3.8, 0.95, "grass"),
                            (1.4, 0.4, 5.1, 0.9, "grass"), (-0.8, 1.7, 3.6, 0.8, "grass_dark")):
        sph((x, y, z), r, c, (1, 1, 0.9))
    # ladder
    for sx in (-0.95, -0.45):
        rod((sx, -1.75, 0.05), (sx, -1.25, 2.05), 0.045, "wood_dark")
    for k in range(5):
        t = (k + 0.5) / 5
        box((-0.7, -1.75 + 0.5 * t, 0.05 + 2.0 * t), (0.55, 0.06, 0.06), "wood_dark", bev=0.02)
    # posts, fairy lights
    for sx in (-1.55, 1.3):
        cyl((sx, -0.75, z0 + 0.4), 0.05, 0.8, "cream", bev=0, verts=12)
        sph((sx, -0.75, z0 + 0.84), 0.09, "yellow")
    string_lights((-1.5, -0.75, z0 + 0.8), (1.2, -0.75, z0 + 0.8), 0.45, 9)
    string_lights((1.2, -0.75, z0 + 0.8), (1.15, 0.5, z0 + 1.5), 0.2, 5)
    # brass telescope on tripod
    tx, ty, tz = 1.0, -0.6, z0 + 0.7
    for a in (0, 2.1, 4.2):
        rod((tx, ty, tz), (tx + math.cos(a) * 0.3, ty + math.sin(a) * 0.3, z0), 0.03, "wood_dark")
    d = Vector((0.45, -0.25, 0.8)).normalized()
    p0 = Vector((tx, ty, tz)) - d * 0.3
    p1 = Vector((tx, ty, tz)) + d * 1.0
    rod(p0, p1, 0.1, "brass")
    rod(p1 - d * 0.1, p1 + d * 0.12, 0.14, "brass")
    sph(p1 + d * 0.13, 0.1, "sky", (1, 1, 0.5))
    rod(p0, p0 - d * 0.0 + d * 0.15, 0.14, "warm")
    # hammock between two posts, ground left
    for y in (-0.9, 0.9):
        cyl((-2.1, y, 0.7), 0.05, 1.4, "wood_dark", bev=0, verts=12)
    for i in range(9):
        t = i / 8
        y = -0.9 + 1.8 * t
        sph((-2.1, y, 1.3 - 0.45 * 4 * t * (1 - t)), 0.13, "lav", (1.3, 1, 0.6))
    sph((-2.1, -0.45, 0.98), 0.17, "cream", (1.1, 1, 0.7))
    # pennant
    cyl((-0.4, 0.35, z0 + 2.3), 0.025, 0.5, "cream", bev=0, verts=12)
    prism((-0.4 + 0.15, 0.35, z0 + 2.47), 0.3, 0.03, 0.2, "warm", bev=0.0).rotation_euler = (0, R(-90), 0)
    for (x, y, z) in ((-1.9, 1.8, 3.6), (2.8, -0.4, 4.2), (0.2, -1.8, 5.2), (-1.2, 0.2, 5.0)):
        star4((x, y, z), 0.28, glow("yellow", 1.2))


def doghouse_station():
    base(2.8)
    rock, rd = "rock", "rock_dark"
    sph((0, 0.1, 1.0), 2.1, rock, (1.0, 1.0, 0.6))
    for (x, y, z, r) in ((1.3, -0.9, 0.7, 0.9), (-1.6, -0.4, 0.8, 0.8), (0.3, 1.5, 0.8, 0.9), (-0.4, -1.7, 0.5, 0.6), (1.7, 0.7, 0.9, 0.7)):
        sph((x, y, z), r, rock, (1, 1, 0.8))
    # craters: dark dish with a raised rim, facing the camera
    for (x, y, z, r) in ((1.55, -1.25, 1.2, 0.34), (-1.55, -1.1, 1.3, 0.28), (-0.15, -1.95, 0.7, 0.24), (2.0, -0.2, 1.4, 0.24)):
        sph((x, y - 0.06, z), r, rd, (1, 0.3, 0.9), rot=(R(-35), 0, 0))
    cyl((0, 0.1, 2.05), 1.6, 0.25, "meadow", bev=0.1)
    z0 = 2.17
    y0 = 0.2
    fy = hut(2.0, 1.6, 1.1, 0.8, y0=y0, z0=z0, door=False)
    box((0.6, y0 + 0.3, z0 + 1.85), (0.22, 0.22, 0.5), "wood_dark", bev=0.04)
    heart((0.65, y0 + 0.3, z0 + 2.4), 0.18, "pink")
    # portal door
    pz = z0 + 0.5
    torus((0, fy - 0.03, pz), 0.48, 0.09, "lav", rot=(R(90), 0, 0))
    cyl((0, fy - 0.02, pz), 0.44, 0.06, glow("#7FD7FF", 1.3), bev=0.0, rot=(R(90), 0, 0))
    for i in range(14):
        a = i * 0.7
        r = 0.04 + 0.026 * i
        sph((math.cos(a) * r, fy - 0.07, pz + math.sin(a) * r), 0.04, glow("white", 2.0))
    # porthole with Buddy
    hz, hy = z0 + 1.1 + 0.3, fy - 0.2
    torus((0, hy, hz), 0.23, 0.045, "brass", rot=(R(90), 0, 0))
    cyl((0, hy + 0.02, hz), 0.22, 0.05, "sky", bev=0.0, rot=(R(90), 0, 0))
    sph((0, hy - 0.04, hz - 0.02), 0.14, "gold", (1, 0.5, 1))
    for sx in (-1, 1):
        sph((sx * 0.13, hy - 0.04, hz + 0.1), 0.06, "brown", (0.8, 0.4, 1.2), rot=(0, sx * R(25), 0))
        sph((sx * 0.05, hy - 0.1, hz), 0.022, "dark")
    sph((0, hy - 0.1, hz - 0.05), 0.035, "dark", (1, 0.6, 0.8))
    # satellite bone with panels
    sx_, sy_, sz_ = 2.5, 0.2, 4.6
    bone((sx_, sy_, sz_), 1.0, 0.1, "cream", rot=(0, R(-25), 0), plane="xz")
    for sgn in (-1, 1):
        box((sx_ + 0.0 + sgn * 0.0, sy_, sz_ + sgn * 0.5), (0.5, 0.05, 0.4), "blue", bev=0.03, rot=(0, R(-25), 0))
    sph((sx_, sy_, sz_), 0.14, "coral")
    for i in range(6):
        sph((sx_ - 0.7 - i * 0.28, sy_, sz_ - 0.35 - i * 0.12 + 0.0), 0.05 - 0.005 * i, glow("pink", 1.5))
    for (x, y, z, s) in ((-2.2, 0.8, 4.7, 0.3), (-0.3, 1.5, 5.4, 0.22), (2.9, -0.5, 3.4, 0.2), (-2.7, -0.5, 3.4, 0.2), (1.2, 1.2, 5.5, 0.16)):
        star4((x, y, z), s, glow("yellow", 1.2))
    # pebbles
    for (x, y, z, r) in ((-2.6, -1.0, 2.2, 0.17), (2.7, -1.0, 2.0, 0.22), (-2.8, 0.3, 2.8, 0.12)):
        sph((x, y, z), r, rd)


# ---------- bakery 4 / 5 ----------

def bakery_truck():
    base(3.2)
    bx = 0.45
    for sx in (-1.6, 0.9, 1.9):
        pass
    box((bx, 0, 1.05), (2.5, 1.4, 1.3), "cream", bev=0.07)
    box((bx, 0, 1.77), (2.7, 1.6, 0.16), "coral", bev=0.07)
    box((-1.5, 0, 0.88), (1.0, 1.3, 0.95), "pink", bev=0.09)
    box((-1.5, 0, 1.4), (0.9, 1.2, 0.16), "coral", bev=0.06)
    box((-2.03, 0, 1.05), (0.06, 0.9, 0.4), "sky", bev=0.03)
    box((-1.5, -0.66, 1.05), (0.6, 0.05, 0.4), "sky", bev=0.03)
    for sy in (-0.35, 0.35):
        sph((-2.05, sy, 0.62), 0.11, "yellow")
    # wheels
    for wx in (-1.5, 1.2):
        for sy in (-0.72, 0.72):
            cyl((wx, sy, 0.38), 0.38, 0.2, "wood_dark", bev=0.06, rot=(R(90), 0, 0))
            cyl((wx, sy * 1.12, 0.38), 0.15, 0.06, "warm", bev=0.02, rot=(R(90), 0, 0))
    # serving window + awning + counter
    fy = -0.7
    box((bx - 0.25, fy - 0.01, 1.1), (1.2, 0.05, 0.55), "dark", bev=0.03)
    box((bx - 0.25, fy - 0.2, 0.8), (1.4, 0.4, 0.07), "wood_dark", bev=0.03)
    awning(1.4, fy, 1.5, n=6, depth=0.55, x0=bx - 0.25)
    for i in range(3):
        bone((bx - 0.6 + i * 0.35, fy - 0.2, 0.9), 0.2, 0.035, "warm", rot=(0, 0, R(10 - i * 25)))
    box((bx + 0.75, fy - 0.01, 0.8), (0.36, 0.05, 0.3), "mint", bev=0.02)
    # roof oven dome + chimney with steam
    sph((bx - 0.5, 0.15, 1.85), 0.5, "coral", (1, 0.9, 0.8))
    cyl((bx - 0.8, 0.3, 2.45), 0.11, 0.45, "wood_dark", bev=0.03)
    for i, (dx, z, r) in enumerate(((0, 2.85, 0.14), (0.1, 3.15, 0.19), (0.0, 3.5, 0.24))):
        sph((bx - 0.8 + dx, 0.3, z), r, "white")
    # steam conveyor on the right: belt rising from the truck rear with croissants and steam
    th = math.atan2(1.0, 1.7)
    L = math.hypot(1.0, 1.7)
    cx, cz = 2.5, 1.0
    box((cx, -0.1, cz), (L, 0.5, 0.12), "#8A7F78", bev=0.04, rot=(0, -th, 0))
    for sgn in (-1, 1):
        cyl((cx + sgn * L / 2 * math.cos(th), -0.1, cz + sgn * L / 2 * math.sin(th)), 0.14, 0.52, "#6F6660", bev=0.04, rot=(R(90), 0, 0))
    for sx_ in (1.55, 3.35):
        pass
    for t in (-0.3, 0.05, 0.4):
        px = cx + t * L * math.cos(th)
        pz = cz + t * L * math.sin(th)
        croissant((px, -0.1, pz + 0.34), 0.38)
    for i, (x, z, r) in enumerate(((2.9, 2.3, 0.18), (3.05, 2.65, 0.24), (2.9, 3.05, 0.2), (3.1, 3.45, 0.27))):
        sph((x, -0.1, z), r, "white")
    # weathervane croissant
    cyl((bx + 0.6, 0.1, 2.35), 0.035, 1.0, "wood_dark", bev=0, verts=12)
    box((bx + 0.6, 0.1, 2.5), (0.7, 0.04, 0.04), "wood_dark", bev=0.0)
    croissant((bx + 0.6, 0.1, 2.85), 0.5)
    bush((-2.6, 1.3, 0), 0.28, "grass_dark")


def bakery_cosmic():
    base(3.6)
    H = 1.5
    flatbone((0, 0, H / 2), 3.6, 1.4, H, "cream")
    flatbone((0, 0, H + 0.09), 3.7, 1.45, 0.18, "coral")
    fy = -0.7
    # oven opening onto a star swirl
    cz = 0.75
    box((0, fy - 0.01, cz - 0.2), (1.3, 0.07, 0.9), "wood_dark", bev=0.03)
    cyl((0, fy - 0.01, cz + 0.25), 0.65, 0.07, "wood_dark", bev=0.02, rot=(R(90), 0, 0))
    box((0, fy - 0.05, cz - 0.2), (1.1, 0.07, 0.86), "navy", bev=0.02)
    cyl((0, fy - 0.05, cz + 0.23), 0.55, 0.07, "navy", bev=0.01, rot=(R(90), 0, 0))
    cols = ["white", "yellow", "pink", "lav", "mint"]
    for i in range(46):
        a = i * 0.46
        r = 0.04 + 0.0115 * i
        x, z = math.cos(a) * r, cz + 0.05 + math.sin(a) * r * 0.95
        if z < 0.12:
            continue
        sph((x, fy - 0.1, z), 0.025 + 0.012 * (1 - i / 46), glow(cols[i % 5], 2.2))
    # friendly tentacle handing over a bone treat
    pts = bez((-0.1, fy - 0.1, 0.3), (-0.2, fy - 1.7, 0.15), (-1.3, fy - 1.4, 0.5), (-1.0, fy - 2.2, 1.5), 18)
    chain(pts, 0.27, 0.12, "tentacle")
    for k in (3, 6, 9, 12):
        p = pts[k]
        sph((p[0], p[1] - 0.12, p[2] - 0.05), 0.06, "pink", (1, 1, 0.8))
    e = pts[-1]
    sph((e[0], e[1] - 0.05, e[2] + 0.1), 0.13, "tentacle")
    bone((e[0] - 0.05, e[1] - 0.2, e[2] + 0.4), 0.55, 0.08, "warm", rot=(0, R(-20), 0), plane="xz")
    # right lobe window, donut chimney with sparkles
    cyl((1.8, fy - 0.04 - 0.0, 0.95), 0.26, 0.06, "sky", bev=0.02, rot=(R(90), 0, 0))
    cyl((-1.8, fy - 0.0, 0.9), 0.26, 0.06, "sky", bev=0.02, rot=(R(90), 0, 0))
    cyl((1.8, 0.7, H + 0.55), 0.3, 1.0, "wood_dark", bev=0.04)
    torus((1.8, 0.7, H + 0.4), 0.55, 0.24, "pink")
    torus((1.8, 0.7, H + 0.47), 0.5, 0.2, "coral")
    star4((1.9, 0.2, 4.0), 0.4, glow("yellow", 1.4))
    star4((2.3, 0.2, 4.6), 0.26, glow("pink", 1.4))
    # orbiting bones with sparkle trails
    for k, (x, y, z, c, r) in enumerate(((-2.3, -0.2, 3.5, "warm", 20), (2.2, -0.6, 3.0, "cream", -25), (0.0, 0.8, 4.5, "warm", 5))):
        bone((x, y, z), 0.7, 0.11, c, rot=(0, R(r), R(10 * k)), plane="xz")
        for i in range(3):
            sph((x - 0.55 - i * 0.2, y, z - 0.2 + i * 0.1 * 0 - i * 0.05), 0.05 - 0.01 * i, glow("lav", 1.5))
    cone((-0.3, 0.1, H + 0.42), 0.42, 0.5, "mint", rot=(R(180), 0, 0), bev=0.04)
    sph((-0.3, 0.1, H + 0.78), 0.45, "pink", (1, 1, 0.8))
    sph((-0.3, 0.1, H + 1.08), 0.28, "white", (1, 1, 0.8))
    sph((-0.3, 0.1, H + 1.3), 0.11, "coral")


# ---------- garden 4 / 5 ----------

def garden_greenhouse():
    base(3.4)
    cx, cy, rr = 0.2, 0.3, 2.3
    # warm glow inside
    sph((cx, cy, 0.9), 0.8, ghost("#FFE9A0", 0.55, 1.0))
    for (x, y, c, s) in ((-0.7, 0.3, "pink", 2.0), (1.0, 0.8, "yellow", 2.4), (0.0, 1.1, "lav", 2.6), (0.9, -0.2, "coral", 1.8), (-0.9, 1.0, "yellow", 2.2)):
        flower((x + 0.0, y, 0.0), c, s=s, stem=0.3)
    mushroom(-0.2, -0.1, 1.2, "mint", 0.6)
    mushroom(0.35, 0.05, 0.9, "pink", 0.6)
    # glass dome
    d = sph((cx, cy, 0.0), rr, ghost("#CFF0EE", 0.3), (1, 1, 1))
    _upper_half(d)
    torus((cx, cy, 0.04), rr, 0.09, "cream")
    for ang in (0, 60, 120):
        torus((cx, cy, 0.0), rr, 0.05, "cream", rot=(R(90), 0, R(ang)))
    for z in (0.75, 1.35):
        torus((cx, cy, z), math.sqrt(rr * rr - z * z), 0.045, "cream")
    sph((cx, cy, rr + 0.05), 0.2, "coral")
    cone((cx, cy, rr + 0.38), 0.2, 0.45, "coral", bev=0.02)
    # porch with coral roof
    pxl = cx
    py = cy - rr - 0.1
    box((pxl, py, 0.42), (0.95, 0.55, 0.84), "cream", bev=0.05)
    prism((pxl, py, 0.82), 1.1, 0.7, 0.5, "coral", bev=0.03)
    box((pxl, py - 0.28, 0.32), (0.4, 0.05, 0.62), "dark", bev=0.02)
    cyl((pxl, py - 0.28, 0.62), 0.2, 0.05, "dark", bev=0.01, rot=(R(90), 0, 0))
    # giant sunflowers flanking
    sunflower(-2.7, 0.9, 3.1, 0.6)
    sunflower(3.0, 1.0, 2.7, 0.52)
    # glowing mushrooms front left
    for (x, y, s, c) in ((-2.0, -1.7, 1.8, "pink"), (-1.5, -2.1, 1.3, "lav"), (-2.5, -1.2, 1.1, "mint"), (2.3, -1.6, 1.4, "lav"), (1.9, -2.1, 1.0, "pink")):
        mushroom(x, y, s, c, 0.5)
    fence(-3.0, -1.2, -2.5, 5)
    flower((1.2, -2.5, 0.0), "pink", s=1.1, stem=0.3)


def garden_floating():
    base(2.9)
    # cloud pillar resting on the tile
    puffs = []
    for i in range(10):
        a = i * 2 * math.pi / 10
        puffs.append((math.cos(a) * 1.9, math.sin(a) * 1.9, 1.5, 0.85))
    for i in range(8):
        a = i * 2 * math.pi / 8 + 0.3
        puffs.append((math.cos(a) * 1.4, math.sin(a) * 1.4, 0.7, 0.85))
    puffs += [(0, 0, 1.0, 1.4), (0.3, -0.3, 0.2, 1.1), (-0.3, 0.3, 0.3, 1.1)]
    for (x, y, z, r) in puffs:
        sph((x, y, z), r, "white", (1, 1, 0.85))
    z0 = 2.0
    cyl((0, 0, z0 - 0.05), 1.75, 0.3, "grass", bev=0.1)
    box((-0.2, -0.1, z0 + 0.1), (1.7, 1.0, 0.16), "brown", bev=0.06)
    # upside-down carrots (tip up, leaves in soil, a couple levitating)
    for (x, y, lift) in ((-0.8, -0.25, 0.0), (-0.35, -0.1, 0.35), (0.1, -0.3, 0.0), (0.4, 0.05, 0.55)):
        zz = z0 + 0.18 + lift
        cone((x, y, zz + 0.5), 0.2, 1.0, "carrot", bev=0.02)
        for k in range(3):
            a = k * 2.1
            rod((x, y, zz), (x + math.cos(a) * 0.14, y + math.sin(a) * 0.14, zz - 0.2), 0.035, "grass_dark", verts=8)
    # rainbow sprinkler
    rx, ry = 1.0, -0.5
    cyl((rx, ry, z0 + 0.4), 0.05, 0.7, "cream", bev=0, verts=12)
    sph((rx, ry, z0 + 0.8), 0.14, "sky")
    for i, c in enumerate(("coral", "warm", "yellow", "mint", "blue")):
        torus((rx + 0.0, ry + 1.0, z0 + 0.0), 1.0 - i * 0.11, 0.075, c, rot=(R(90), 0, R(25)))
    for (dx, dz) in ((0.2, 0.9), (0.4, 1.0), (0.55, 0.85)):
        sph((rx + dx, ry, z0 + dz), 0.05, "sky", (1, 1, 1.4))
    # gravity-defying tree: upside down, hovering
    tx, ty = -0.9, 0.7
    rod((tx, ty, 5.3), (tx, ty, 3.7), 0.2, "wood_dark")
    for k in range(5):
        a = k * 1.26
        rod((tx, ty, 5.2), (tx + math.cos(a) * 0.6, ty + math.sin(a) * 0.6, 5.8), 0.07, "wood_dark", verts=10)
    for (dx, dy, z, r, c) in ((0, 0, 3.2, 1.0, "grass_dark"), (0.6, 0.3, 2.9, 0.7, "grass"), (-0.6, 0.2, 3.0, 0.75, "grass"), (0, -0.4, 3.6, 0.7, "grass_dark")):
        sph((tx + dx, ty + dy, z), r, c)
    for (x, y, z) in ((0.2, -0.6, 2.6), (-0.4, 0.5, 2.4)):
        sph((x + tx, y + ty, z), 0.12, "grass", (1, 0.4, 1))
    star4((1.3, 0.6, 5.0), 0.3, glow("yellow", 1.2))
    for (x, y, z, c) in ((1.6, 0.9, 3.6, "pink"), (1.9, 0.3, 4.4, "lav")):
        sph((x, y, z), 0.12, c, (1, 0.5, 1))


# ---------- Wild Extras props (side/front view, built in the XZ plane facing -Y) ----------

def prop_ufo():
    sph((0, 0, 0), 1.0, "lav", (1.0, 1.0, 0.32))
    torus((0, 0, -0.02), 1.0, 0.13, "mint", scale=(1, 1, 1))
    sph((0, 0, 0.18), 0.55, ghost("#CFEFFF", 0.55), (1, 1, 0.95))
    sph((0, 0.0, 0.1), 0.34, "sky", (1, 1, 0.8))
    for sx in (-0.13, 0.13):
        sph((sx, -0.22, 0.15), 0.045, "dark")
    sph((0, -0.27, 0.07), 0.04, "coral", (1.6, 0.6, 0.6))
    for i in range(7):
        a = math.pi + (i - 3) * 0.33
        sph(((i - 3) * 0.28, -0.8 + abs(i - 3) * 0.1, 0.05), 0.085, glow("#FFD23A", 1.2))
    sph((0, 0, -0.3), 0.36, "rock", (1, 1, 0.45))


def prop_beam():
    for r_top, r_bot, a in ((0.42, 1.0, 0.3), (0.32, 0.78, 0.3), (0.22, 0.56, 0.3), (0.12, 0.34, 0.3)):
        bpy.ops.mesh.primitive_cone_add(radius1=r_bot, radius2=r_top, depth=2.4, location=(0, 0, 0), vertices=64)
        o = bpy.context.active_object
        o.data.materials.append(ghost("#FFE680", a, 1.0))
        bpy.ops.object.shade_smooth()


def prop_comet_bone():
    d = Vector((1, 0, -0.55)).normalized()
    bone((0.7, 0, 0.35), 0.9, 0.14, "warm", rot=(0, R(-30), 0), plane="xz")
    cols = ["yellow", "pink", "white", "lav", "mint"]
    for i in range(16):
        t = i / 15
        p = (0.3 - 0.65 * t * 1.9 - 0.0, 0, 0.55 + 0.85 * t * 0.6)
        p = (0.5 - 1.9 * t, 0, 0.3 + 0.95 * t)
        sph(p, 0.2 * (1 - 0.8 * t), glow(cols[i % 5], 0.8))
    for (x, z, s) in ((-0.7, 1.2, 0.3), (-1.2, 0.45, 0.22), (-0.2, 0.95, 0.2), (-1.5, 1.2, 0.16)):
        star4((x, 0, z), s, glow("yellow", 1.8))


def prop_duck_party():
    # facing left (-X), walking
    sph((0, 0, 0.5), 0.6, "yellow", (1.15, 0.8, 0.85))
    sph((-0.62, 0, 1.1), 0.36, "yellow")
    box((-0.98, 0, 1.03), (0.3, 0.2, 0.09), "warm", bev=0.04)
    sph((-0.78, -0.3, 1.18), 0.055, "dark")
    sph((0.62, 0, 0.72), 0.26, "yellow", (1.2, 0.7, 0.8), rot=(0, R(-25), 0))
    sph((-0.1, -0.4, 0.5), 0.3, "warm", (1.2, 0.3, 0.7), rot=(0, R(10), 0))
    sph((-0.62, -0.28, 0.95), 0.07, "pink", (1, 0.4, 0.8))
    cone((-0.62, 0, 1.6), 0.26, 0.6, "coral", bev=0.02, rot=(0, R(-8), 0))
    for k, c in enumerate(("yellow", "lav")):
        torus((-0.62 + 0.0 + 0.02 * k, 0, 1.43 + 0.14 * k), 0.2 - 0.07 * k, 0.03, c, rot=(0, R(-8), 0))
    sph((-0.6, 0, 1.93), 0.09, "pink")
    # legs mid-stride
    for (x, a) in ((-0.2, 22), (0.2, -22)):
        rod((x, 0, 0.2), (x - math.sin(R(a)) * 0.2, 0, -0.18), 0.05, "warm")
        box((x - math.sin(R(a)) * 0.2 - 0.12, 0, -0.2), (0.34, 0.2, 0.06), "warm", bev=0.03)


def prop_squirrel_raincoat():
    sph((0, 0, 0.7), 0.5, "brown", (0.85, 0.75, 1.15))
    sph((0.0, 0, 0.62), 0.54, "rain", (0.92, 0.82, 1.1))
    sph((0, -0.28, 0.5), 0.2, "cream", (0.9, 0.3, 1.1))
    sph((0, 0, 1.5), 0.42, "brown", (1, 0.9, 0.95))
    sph((0, 0, 1.58), 0.5, "rain", (1, 0.9, 0.8))  # hood
    sph((0, -0.22, 1.42), 0.3, "brown", (1, 0.6, 0.85))
    sph((0, -0.45, 1.4), 0.07, "dark")
    for sx in (-1, 1):
        sph((sx * 0.17, -0.34, 1.52), 0.05, "dark")
    sph((0, -0.38, 1.3), 0.05, "pink", (1.6, 0.6, 0.6))
    # tail
    chain(bez((0.4, 0.2, 0.2), (1.1, 0.3, 0.3), (1.0, 0.3, 1.3), (0.55, 0.2, 1.7), 10), 0.2, 0.3, "brown")
    # feet
    for sx in (-0.2, 0.2):
        sph((sx, -0.2, 0.08), 0.15, "brown", (1, 1.3, 0.6))
    # umbrella
    ux = -0.55
    rod((ux, -0.3, 0.55), (ux, -0.3, 2.3), 0.03, "wood_dark")
    sph((ux, -0.3, 2.25), 0.9, "coral", (1, 1, 0.55))
    for i in range(6):
        a = i * math.pi / 3
        sph((ux + math.cos(a) * 0.82, -0.3 + math.sin(a) * 0.82, 2.15), 0.14, "coral" if i % 2 else "cream")
    sph((ux, -0.3, 2.82), 0.07, "cream")
    sph((-0.3, -0.3, 0.95), 0.1, "brown")
    for (x, z) in ((-1.0, 1.2), (0.8, 2.5), (1.1, 1.2)):
        sph((x, -0.3, z), 0.06, "sky", (1, 1, 1.5))


def prop_mailbox():
    cyl((0, 0, 0.7), 0.12, 1.4, "wood_dark", bev=0.03)
    box((0, 0, 1.45), (1.2, 0.8, 0.5), "sky", bev=0.1)
    cyl((0, 0, 1.7), 0.4, 1.2, "sky", bev=0.04, rot=(0, R(90), 0))
    box((0, -0.41, 1.5), (0.7, 0.05, 0.3), "dark", bev=0.03)
    box((0.7, 0, 1.75), (0.06, 0.12, 0.5), "coral", bev=0.02)
    box((0.7, 0, 1.97), (0.28, 0.12, 0.2), "coral", bev=0.04)
    # periscope
    rod((-0.2, 0.0, 2.0), (-0.2, 0.0, 2.9), 0.1, "brass")
    sph((-0.2, 0, 2.95), 0.12, "brass")
    cyl((-0.33, 0, 3.0), 0.1, 0.35, "brass", bev=0.02, rot=(0, R(90), 0))
    sph((-0.52, 0, 3.0), 0.13, "sky", (0.5, 1, 1))
    sph((-0.6, -0.05, 3.0), 0.06, "white")
    cyl((-0.2, 0, 2.05), 0.16, 0.12, "brass", bev=0.03)
    for sx in (-0.2, 0.2):
        pass


def prop_sock():
    # soggy sock: foot lying in a puddle, leg rising from the heel and drooping over
    cyl((0, 0, 0.02), 1.3, 0.05, "sky", bev=0.02)
    chain([(-0.75, 0, 0.3), (-0.2, 0, 0.3), (0.35, 0, 0.32)], 0.34, 0.4, "cream")
    sph((-0.97, 0, 0.3), 0.32, "coral", (1, 1, 0.95))   # toe
    sph((0.05, 0, 0.3), 0.42, "cream", (1.5, 0.95, 0.9))
    chain(bez((0.45, 0, 0.35), (0.8, 0, 0.7), (0.8, 0, 1.3), (0.4, 0, 1.55), 8), 0.4, 0.38, "cream")
    chain(bez((0.4, 0, 1.55), (0.05, 0, 1.8), (-0.35, 0, 1.6), (-0.4, 0, 1.2), 6), 0.38, 0.36, "cream")
    for zz, rr_ in ((1.05, 0.33), (1.25, 0.36)):  # cuff stripes at the drooping end
        torus((-0.4, 0, zz), rr_, 0.075, "lav")
    sph((0.62, 0, 0.18), 0.28, "coral", (1, 0.9, 0.8))  # heel patch
    for (x, z, s_) in ((-0.1, 0.95, 1.0), (-0.4, 0.75, 0.8), (1.25, 0.6, 0.8), (0.0, 0.6, 0.7)):
        sph((x, 0, z), 0.1 * s_, "sky", (0.8, 0.8, 1.5))
    sph((-1.2, -0.4, 0.12), 0.12, "sky", (1.2, 1.2, 0.6))
    sph((1.1, -0.5, 0.1), 0.1, "sky", (1.2, 1.2, 0.6))


def prop_gnome():
    box((0.0, 0, 0.62), (2.0, 1.0, 0.1), "wood_dark", bev=0.04)
    cyl((0, 0, 0.3), 0.12, 0.6, "wood_dark", bev=0.02)
    cyl((0, 0, 0.04), 0.4, 0.08, "wood_dark", bev=0.03)
    # cloth
    box((0, 0, 0.69), (1.6, 0.9, 0.05), "cream", bev=0.02)
    # gnome (left), seated behind table edge
    sph((-0.7, 0.15, 1.2), 0.42, "blue", (1, 0.85, 1.1))
    sph((-0.7, -0.08, 0.95), 0.42, "white", (0.9, 0.5, 1.0))
    sph((-0.7, 0.0, 1.78), 0.32, "pink")
    sph((-0.7, -0.3, 1.72), 0.1, "pink", (1, 1, 1))
    sph((-0.7, -0.36, 1.7), 0.09, "coral")
    for sx in (-0.12, 0.12):
        sph((-0.7 + sx, -0.3, 1.82), 0.04, "dark")
    cone((-0.7, 0.0, 2.2), 0.4, 1.0, "coral", bev=0.02)
    torus((-0.7, 0, 1.98), 0.37, 0.05, "cream")
    sph((-0.45, -0.3, 1.1), 0.13, "pink")
    # teacup
    cyl((0.4, 0, 0.78), 0.34, 0.06, "cream", bev=0.02)
    cyl((0.4, 0, 0.98), 0.25, 0.34, "cream", bev=0.07)
    cyl((0.4, 0, 1.12), 0.2, 0.05, "brown_dark", bev=0.01)
    torus((0.68, 0, 0.98), 0.12, 0.035, "cream", rot=(R(90), 0, 0))
    for dz in (0.0,):
        sph((0.4, -0.25, 0.95), 0.06, "sky", (1, 0.3, 1))
    heart((0.45, 0, 1.5), 0.14, "pink")


def prop_cloud_tea():
    for dx, dz, r in ((0, 0, 1.0), (-0.9, -0.15, 0.7), (0.95, -0.12, 0.75), (0.35, 0.45, 0.65), (-0.4, 0.4, 0.55)):
        sph((dx, 0, dz), r, "white", (1, 0.75, 0.85))
    for sx in (-1, 1):
        sph((sx * 0.35, -0.76, 0.08), 0.075, "dark", (0.9, 0.5, 1.2))
        sph((sx * 0.6, -0.7, -0.08), 0.11, "pink", (1, 0.4, 0.7))
    sph((0, -0.78, -0.02), 0.05, "coral", (1.5, 0.5, 0.8))
    cyl((0.3, 0.0, 0.88), 0.35, 0.06, "cream", bev=0.02)
    cyl((0.3, 0, 1.12), 0.25, 0.4, "sky", bev=0.07)
    cyl((0.3, 0, 1.3), 0.2, 0.05, "brown_dark", bev=0.01)
    torus((0.58, 0, 1.12), 0.12, 0.035, "sky", rot=(R(90), 0, 0))
    heart((0.3, 0, 1.75), 0.14, "pink")


def _crescent():
    cyl((0, 0, 0), 1.0, 0.45, "cheese", bev=0.06, rot=(R(90), 0, 0), verts=64)
    o = bpy.context.active_object
    cut = cyl((0.55, -0.1, 0.12), 0.85, 0.9, "cheese", bev=0.0, rot=(R(90), 0, 0), verts=64)
    mod = o.modifiers.new("bool", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cut
    mod.solver = "EXACT"
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier="bool")
    bpy.data.objects.remove(cut)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    return o


def prop_moon_cheese():
    _crescent()
    for (x, z, r) in ((-0.78, 0.35, 0.12), (-0.6, -0.4, 0.15), (-0.92, -0.1, 0.09), (-0.25, 0.8, 0.1), (-0.28, -0.82, 0.11)):
        sph((x, -0.18, z), r, "cheese_dark", (1, 0.45, 1))
    # wink
    sph((-0.45, -0.22, 0.2), 0.055, "dark", (1, 0.5, 1.3))
    box((-0.55, -0.22, -0.06), (0.17, 0.04, 0.045), "dark", bev=0.02, rot=(0, R(-12), 0))
    sph((-0.62, -0.22, -0.2), 0.06, "pink", (1.3, 0.4, 0.8))
    sph((-0.35, -0.22, -0.07), 0.025, "coral", (1.4, 0.5, 0.8))


def prop_firefly():
    sph((0, 0, 0), 0.3, glow("#FFD43A", 2.5))
    for r, a in ((0.4, 0.4), (0.6, 0.3), (0.8, 0.22), (1.0, 0.14)):
        sph((0, 0, 0), r, ghost("#FFD43A", a * 1.5, 2.0))


def prop_lightbulb():
    sph((0, 0, 0.35), 0.62, glow("#FFD64A", 0.9))
    cone((0, 0, -0.18), 0.28, 0.4, glow("#FFD64A", 0.9), rot=(R(180), 0, 0), bev=0.0)
    for i, z in enumerate((-0.38, -0.55)):
        cyl((0, 0, z), 0.23, 0.12, "#B8B2AA", bev=0.04)
    sph((0, 0, -0.7), 0.15, "#8A7F78", (1, 1, 0.6))
    for i in range(7):
        a = R(-70 + i * 23.3) + math.pi / 2 * 0 
        pass
    for a in range(0, 360, 45):
        if a in (225, 270, 315):
            continue
        rr = R(a)
        box((math.cos(rr) * 1.0, -0.05, 0.35 + math.sin(rr) * 1.0), (0.3, 0.1, 0.1), "yellow", bev=0.04, rot=(0, -rr, 0))


def prop_question():
    pts = []
    for i in range(24):
        a = R(170 - i * (260 / 23))
        pts.append((math.cos(a) * 0.55, 0, 1.15 + math.sin(a) * 0.55))
    pts += [(0.2, 0, 0.55 - 0.04 * i) for i in range(0)]
    pts += [(0, 0, 0.6), (0, 0, 0.45)]
    chain(pts, 0.17, 0.17, "lav")
    sph((0, 0, -0.1), 0.2, "lav")
    for (x, z) in ((0.85, 1.8), (-0.9, 0.2)):
        star4((x, 0, z), 0.3, glow("yellow", 1.2))



# name -> (builder, w, h, camera(rx, rz), fill, opaque)
ISO = (62, 30)
FRONT = (90, 0)
ICON = (72, 18)
ASSETS = {}
for fam, fn in (("doghouse", doghouse), ("bakery", bakery), ("garden", garden)):
    for st in (1, 2, 3):
        ASSETS[f"{fam}-{st}"] = (lambda f=fn, s=st: f(s), 1024, 1024, ISO, {1: 0.5, 2: 0.72, 3: 0.92}[st], False)
for n, fn in (("icon-treat", icon_treat), ("icon-paw", icon_paw), ("icon-pin", icon_pin), ("icon-badge", icon_badge),
              ("icon-home", icon_home), ("icon-settings", icon_settings), ("icon-walks", icon_walks),
              ("icon-den", icon_den)):
    ASSETS[n] = (fn, 1024, 1024, ICON, 0.8, False)
BACK = (78, 0)
ASSETS["yard-ground"] = (yard_ground, 1536, 1024, BACK, None, False)
ASSETS["yard-ground-wide"] = (lambda: yard_ground(2.0), 2048, 1024, BACK, None, False)
ASSETS["doorstep-sky"] = (doorstep_sky, 1024, 1024, FRONT, None, True)
ASSETS["celebration-burst"] = (celebration_burst, 1024, 1024, FRONT, 0.9, False)

# weird-streak stages 4-5 (fill ~93%) and Wild Extras props (256px, front-ish camera)
for n, fn in (("doghouse-4", doghouse_treehouse), ("doghouse-5", doghouse_station), ("bakery-4", bakery_truck),
              ("bakery-5", bakery_cosmic), ("garden-4", garden_greenhouse), ("garden-5", garden_floating)):
    ASSETS[n] = (fn, 1024, 1024, ISO, 0.93, False)
PROP = (80, 8)
for n, fn in (("prop-ufo", prop_ufo), ("prop-beam", prop_beam), ("prop-comet-bone", prop_comet_bone),
              ("prop-duck-party", prop_duck_party), ("prop-squirrel-raincoat", prop_squirrel_raincoat),
              ("prop-mailbox", prop_mailbox), ("prop-sock", prop_sock), ("prop-gnome", prop_gnome),
              ("prop-cloud-tea", prop_cloud_tea), ("prop-moon-cheese", prop_moon_cheese),
              ("prop-firefly", prop_firefly), ("prop-lightbulb", prop_lightbulb), ("prop-question", prop_question)):
    ASSETS[n] = (fn, 512, 512, PROP, 0.88, False)
