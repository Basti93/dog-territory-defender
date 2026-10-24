"""Stock-Regal sticks: one clay stick per Nachbarhund (momo, pfote, bruno, keks, lotte, nebel), 256 px, lying on the grass.
Registers `stick-<dog>` into assets.ASSETS (camera STICKCAM, fill 0.88). Deterministic: no randomness.
Imported by render_all.py. Look per dog: wood colour, shape and one small detail that says who left it."""
import math
import bpy
from mathutils import Vector

import assets
import assets as _a
import common as _c
from assets import bez, base
from common import box, HEX

R = math.radians
HEX.update({
    "birch": "#F1E8D4", "birch_mark": "#6B5A48", "oak": "#C98E3E", "oak_dark": "#9C6A2A", "log": "#7E5230",
    "log_cut": "#E8C48A", "twig": "#FBF7EC", "choc": "#6A4128", "leaf": "#7FD67F", "drift": "#B7B3C9",
    "drift_dark": "#8F8AA8",
})
SPIN = R(-18)  # every stick lies at the same slant so the contact sheet reads as one family
T = 1.5  # chunkiness: radii, heights above the grass and sideways offsets are all scaled by this (clay, not twigs)


def sph(loc, r, mat, scale=(1, 1, 1), rot=(0, 0, 0)):
    return _c.sph(loc, r * T, mat, scale, rot)


def cyl(loc, r, h, mat, bev=0.03, rot=(0, 0, 0)):
    return _c.cyl(loc, r * T, h, mat, bev, rot)


def torus(loc, major, minor, mat, rot=(0, 0, 0)):
    return _c.torus(loc, major * T, minor * T, mat, rot)


def chain(pts, r0, r1, mat):
    return _a.chain(pts, r0 * T, r1 * T, mat)


def rod(a, b, r, mat):
    return _a.rod(a, b, r * T, mat)


def P(x, y, z=0.0):
    """Stick-local point (x along the stick) -> world, spun about Z."""
    c, s = math.cos(SPIN), math.sin(SPIN)
    return ((x * c - y * s * T), (x * s + y * c * T), z * T)


def straight(a, b, r, mat):
    """Round-ended straight piece from stick-local a to b (x, y, z)."""
    rod(P(*a), P(*b), r, mat)
    sph(P(*a), r, mat)
    sph(P(*b), r, mat)


def shadow(r):
    base(r)
    bpy.data.objects["contact_shadow"]["nofit"] = True  # the shadow must not shrink the stick in the frame
    for o in [o for o in bpy.context.scene.objects if o.name.startswith("Cone")]:
        bpy.data.objects.remove(o, do_unlink=True)  # the building tufts do not belong under a stick


def stick_momo():
    """Pale birch, straight, dark dashes, a small pink bow: gentle Momo."""
    shadow(1.5)
    straight((-1.15, 0, 0.17), (1.15, 0, 0.17), 0.15, "birch")
    for x in (-0.7, -0.15, 0.5):
        box(P(x, -0.12, 0.2), (0.16, 0.05, 0.06), "birch_mark", bev=0.015, rot=(0, 0, SPIN))
    chain([P(1.0, 0.1, 0.2), P(1.25, 0.28, 0.22)], 0.06, 0.04, "birch")
    sph(P(-0.55, 0, 0.3), 0.1, "pink")
    sph(P(-0.7, 0.1, 0.3), 0.14, "pink", (1, 0.6, 0.8))
    sph(P(-0.4, -0.1, 0.3), 0.14, "pink", (1, 0.6, 0.8))


def stick_pfote():
    """Chunky golden-oak fork, 'sometimes the wrong one': a Y-shaped branch with two knots."""
    shadow(1.6)
    straight((-1.2, 0, 0.2), (0.5, 0, 0.2), 0.19, "oak")
    straight((0.5, 0, 0.2), (1.25, 0.5, 0.2), 0.14, "oak")
    straight((0.5, 0, 0.2), (1.2, -0.35, 0.2), 0.13, "oak")
    for x, y in ((-0.5, -0.17), (0.1, 0.17)):
        sph(P(x, y, 0.28), 0.09, "oak_dark", (1, 0.6, 0.9))
    cyl(P(-1.33, 0, 0.2), 0.18, 0.06, "log_cut", bev=0.01, rot=(0, R(90), SPIN))


def stick_bruno():
    """Short stout log with a pale cut end and a coral band: sturdy Bruno."""
    shadow(1.4)
    cyl(P(0, 0, 0.3), 0.3, 1.5, "log", bev=0.05, rot=(0, R(90), SPIN))
    cyl(P(0.76, 0, 0.3), 0.27, 0.06, "log_cut", bev=0.01, rot=(0, R(90), SPIN))
    torus(P(0.76, 0, 0.3), 0.15, 0.025, "oak_dark", rot=(0, R(90), SPIN))
    cyl(P(-0.3, 0, 0.3), 0.325, 0.22, "coral", bev=0.03, rot=(0, R(90), SPIN))
    sph(P(0.1, -0.28, 0.45), 0.08, "oak_dark", (1, 0.6, 0.9))


def stick_keks():
    """Small white twig with mint candy stripes and a curl at the end: quick little Keks."""
    shadow(1.3)
    pts = bez(P(-1.0, -0.1, 0.12), P(-0.4, 0.2, 0.12), P(0.3, -0.25, 0.12), P(0.9, 0.05, 0.12), 12)
    chain(pts, 0.09, 0.07, "twig")
    for i in (2, 4, 6, 8):
        x, y, z = pts[i]
        sph((x, y, z + 0.02), 0.1, "mint", (1, 1, 0.9))
    chain(bez(P(0.9, 0.05, 0.12), P(1.1, 0.15, 0.14), P(1.2, 0.35, 0.14), P(1.0, 0.4, 0.14), 6), 0.07, 0.05, "twig")
    sph(P(-1.0, -0.1, 0.12), 0.1, "twig")


def stick_lotte():
    """Smooth chocolate-brown stick with two fresh leaves: Lotte rates the view."""
    shadow(1.5)
    straight((-1.1, 0, 0.16), (1.1, 0.0, 0.16), 0.13, "choc")
    stalk = P(0.6, 0.0, 0.2)
    for sx, sy, rz in ((0.85, 0.38, R(35)), (0.85, -0.3, R(-30))):
        x, y, z = P(sx, sy * 0.6, 0.2)
        sph((x, y, z), 0.26, "leaf", (1.0, 0.5, 0.18), rot=(0, 0, SPIN + rz))
    sph(stalk, 0.07, "leaf")
    sph(P(-1.15, 0, 0.16), 0.12, "choc")


def stick_nebel():
    """Grey-lilac driftwood with a gentle bend and a tiny moon-yellow star: mysterious Nebel."""
    shadow(1.6)
    pts = bez(P(-1.2, 0.15, 0.17), P(-0.5, -0.3, 0.17), P(0.5, 0.3, 0.17), P(1.2, -0.1, 0.17), 14)
    chain(pts, 0.16, 0.12, "drift")
    for i in (3, 7, 10):
        x, y, z = pts[i]
        sph((x, y - 0.05, z + 0.05), 0.07, "drift_dark", (1.4, 0.7, 0.8))
    x, y, z = pts[9]
    box((x, y - 0.05, z + 0.28), (0.5, 0.06, 0.12), "yellow", bev=0.02, rot=(0, 0, SPIN))
    box((x, y - 0.05, z + 0.28), (0.12, 0.06, 0.5), "yellow", bev=0.02, rot=(0, 0, SPIN))


STICKCAM = (62, 12)
STICK_DOGS = ("momo", "pfote", "bruno", "keks", "lotte", "nebel")
for _dog, _fn in zip(STICK_DOGS, (stick_momo, stick_pfote, stick_bruno, stick_keks, stick_lotte, stick_nebel)):
    assets.ASSETS[f"stick-{_dog}"] = (_fn, 512, 512, STICKCAM, 0.88, False)
