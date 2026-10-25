"""Meadow props for the buildings page (bush, hedge, tree, flower clump, stones, grass tuft; the worn paths are drawn in code).
Registers `meadow-*` into assets.ASSETS (camera MEADOWCAM, fill per asset). Deterministic: fixed coordinates, no randomness.
Imported by render_all.py. Every sprite is centred in its canvas; its ground point is the canvas bottom third (see README)."""
import math
import bpy

import assets
import common
from assets import base, flower
from common import box, cyl, sph, cone, torus, HEX

R = math.radians
HEX.update({"stone": "#CFC8BA", "stone_dark": "#B3AB9B", "bark": "#A27B52", "leaf_light": "#98E08F"})
MEADOWCAM = (62, 12)


def _shadow(r):
    base(r)
    o = bpy.data.objects["contact_shadow"]
    o["nofit"] = True
    for c in [c for c in bpy.context.scene.objects if c.name.startswith("Cone")]:
        c["nofit"] = True


def _blobs(cx, r, mat="grass_dark"):
    """One round bush: a main ball plus two side balls and a lighter cap (clay-soft)."""
    sph((cx, 0, r * 0.75), r, mat, (1, 1, 0.82))
    sph((cx + r * 0.72, 0.1, r * 0.5), r * 0.68, mat, (1, 1, 0.8))
    sph((cx - r * 0.7, -0.05, r * 0.46), r * 0.62, mat, (1, 1, 0.8))
    sph((cx + r * 0.1, -0.1, r * 1.25), r * 0.55, "leaf_light", (1, 1, 0.7))


def _dots(cx, r, colours):
    for i, c in enumerate(colours):
        a = R(200 + i * 55)
        sph((cx + math.cos(a) * r * 0.85, -r * 0.62 + math.sin(a) * 0.1, r * (0.55 + 0.22 * (i % 3))), 0.09, c)


def bush():
    _shadow(1.3)
    _blobs(0, 0.8)
    _dots(0, 0.8, ["pink", "yellow", "white", "pink", "yellow"])


def hedge():
    """A low row of three joined bushes with flowers: the soft edge between the Hof and the meadow."""
    _shadow(2.4)
    for cx, r in ((-1.5, 0.62), (0.0, 0.72), (1.45, 0.64)):
        _blobs(cx, r)
    _dots(-1.5, 0.62, ["white", "yellow", "pink"])
    _dots(0.0, 0.72, ["pink", "white", "lav", "yellow"])
    _dots(1.45, 0.64, ["yellow", "pink", "white"])


def tree():
    _shadow(1.5)
    cyl((0, 0, 0.8), 0.2, 1.6, "bark", bev=0.05)
    sph((0, 0, 2.15), 1.15, "grass", (1, 1, 0.9))
    sph((0.85, 0.05, 1.8), 0.8, "grass", (1, 1, 0.9))
    sph((-0.85, -0.05, 1.75), 0.75, "grass", (1, 1, 0.9))
    sph((0.1, -0.1, 2.85), 0.7, "leaf_light", (1, 1, 0.85))
    for x, z, c in ((-0.6, 2.3, "pink"), (0.7, 2.6, "white"), (0.2, 1.7, "pink"), (-1.1, 1.8, "white"), (1.3, 1.9, "pink")):
        sph((x, -0.75, z), 0.1, c)


def flowers():
    for x, y, c, s in ((-0.5, 0.1, "pink", 1.0), (0.0, -0.1, "yellow", 1.2), (0.5, 0.05, "white", 0.95),
                       (0.2, 0.3, "lav", 0.85), (-0.25, -0.3, "coral", 0.9)):
        flower((x, y, 0), c, s, 0.4)
    for x in (-0.75, 0.05, 0.75):
        cone((x, 0.15, 0.13), 0.06, 0.28, "grass", bev=0.01)


def stones():
    _shadow(1.0)
    sph((-0.3, 0, 0.2), 0.42, "stone", (1.15, 1, 0.65))
    sph((0.35, 0.1, 0.15), 0.3, "stone_dark", (1.1, 1, 0.6))
    sph((0.05, -0.35, 0.1), 0.2, "stone", (1.1, 1, 0.6))


def tuft():
    for i, x in enumerate((-0.45, -0.22, 0, 0.22, 0.45)):
        h = 0.55 + 0.2 * (i % 2)
        cone((x, 0, h / 2), 0.1, h, "grass" if i % 2 else "grass_dark", rot=(0, R((i - 2) * 9), 0), bev=0.01)
    flower((0.55, 0.05, 0), "white", 0.7, 0.3)


def diary():
    """Buddy's walk diary: a coral notebook with a ribbon and a pencil lying on a low tree stump (opens the diary screen in the Hof)."""
    _shadow(1.0)
    cyl((0, 0, 0.3), 0.62, 0.6, "bark", bev=0.06)
    cyl((0, 0, 0.62), 0.56, 0.06, "yellow", bev=0.02)  # the sawn top
    torus((0, 0, 0.66), 0.3, 0.012, "bark", scale=(1, 1, 0.6))
    # notebook: cream pages block, coral cover, a lighter spine; tilted a little on the stump
    nb = (0, 0, R(-14))
    box((0, 0, 0.78), (0.74, 0.54, 0.17), "cream", bev=0.03, rot=nb)
    box((0, 0, 0.88), (0.78, 0.58, 0.07), "coral", bev=0.03, rot=nb)
    box((-0.36 * math.cos(nb[2]), 0.36 * math.sin(nb[2]) * -1, 0.8), (0.09, 0.58, 0.22), "brown_dark", bev=0.03, rot=nb)
    sph((0.12, -0.02, 0.93), 0.08, "yellow", (1, 1, 0.5), rot=nb)  # a little paw-print stamp
    for dx, dz in ((-0.07, 0.0), (0.0, 0.05), (0.07, 0.0)):
        sph((0.12 + dx, -0.02 + dz - 0.1, 0.93), 0.03, "yellow", (1, 1, 0.5), rot=nb)
    # ribbon bookmark hanging over the front edge
    box((0.28, -0.3, 0.8), (0.07, 0.04, 0.3), "lav", bev=0.01, rot=nb)
    # pencil resting beside it on the stump
    cyl((0.38, 0.12, 0.7), 0.04, 0.5, "warm", bev=0.01, rot=(0, R(90), R(25)))
    cone((0.54, 0.17, 0.7), 0.04, 0.1, "cream", rot=(0, R(90), R(25)), bev=0.005)


assets.ASSETS.update({
    "meadow-bush": (bush, 384, 256, MEADOWCAM, 0.92, False),
    "meadow-hedge": (hedge, 768, 256, MEADOWCAM, 0.96, False),
    "meadow-tree": (tree, 384, 512, MEADOWCAM, 0.92, False),
    "meadow-flowers": (flowers, 256, 192, MEADOWCAM, 0.9, False),
    "meadow-stones": (stones, 256, 160, MEADOWCAM, 0.9, False),
    "meadow-tuft": (tuft, 256, 192, MEADOWCAM, 0.9, False),
    "meadow-diary": (diary, 256, 256, MEADOWCAM, 0.9, False),
})
