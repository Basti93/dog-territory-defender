"""One builder per asset. Each builder adds meshes to the (already reset) scene.
Buildings face -Y (toward camera). Add new assets to ASSETS at the bottom."""
import math
import random
import bpy
from mathutils import Euler, Vector
from common import box, cyl, sph, cone, torus, prism, clay, bevel, smooth, HEX

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

def awning(w, y_wall, z_top, n=6, depth=0.6):
    th = math.atan2(0.22, depth)
    sw = w / n
    for i in range(n):
        x = -w / 2 + sw * (i + 0.5)
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
