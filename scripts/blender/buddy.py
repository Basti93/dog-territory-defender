"""Buddy dog as layered clay parts. Model + per-part render. Local frame: dog faces -X, +Z up, near side is -Y.
Everything is built in that frame then yawed toward the camera (three-quarter). Camera is fixed for ALL parts."""
import json
import math
import os

import bpy
from mathutils import Euler, Matrix, Vector

import common

COATS = {  # mirrors BUDDY_PALETTE.coats in src/buddy/buddyAppearance.ts
    "cream": "#F3E3C3", "golden": "#E0A94E", "ginger": "#C8672E", "chocolate": "#6B4429",
    "charcoal": "#4A423E", "grey": "#A9A8A2", "white": "#F7F2EA", "tricolour": "#F7F2EA",
}
GINGER, CHARCOAL, CREAM_ACCENT, WHITE_ACCENT = "#C8672E", "#4A423E", "#FBEFD5", "#FFFDF7"
EARS, TAILS = ("floppy", "pointy", "folded"), ("curly", "straight", "stubby")
MARKS = ("patch", "socks", "mask")
YAW = Matrix.Rotation(math.radians(32), 4, "Z")  # positive yaw turns the left-facing dog toward the camera
CAM = (75, 0)

HC, HR = Vector((-0.75, 0, 2.85)), Vector((1.0, 1.0, 0.95))   # head centre / radii
MC, MR = Vector((-1.62, 0, 2.6)), Vector((0.66, 0.5, 0.42))   # snout (rear half)
M2C, M2R = Vector((-1.9, 0, 2.58)), Vector((0.5, 0.5, 0.45))  # snout (front half)
EYES = [(44, 30), (14, 30)]
TILT = Matrix.Translation(Vector((-0.55, 0, 1.95))) @ Matrix.Rotation(math.radians(6), 4, 'Y') @ Matrix.Translation(-Vector((-0.55, 0, 1.95)))
TAIL_BASE = Vector((1.2, 0, 0.95))
NECK = Vector((-0.55, 0, 1.95))

OBJS = []
M = {}
BASE = {}            # object name -> matrix_world before head tilt / yaw (to re-pose copies)
EXTRA = Matrix.Identity(4)   # extra dog-frame transform applied by add() (walk-leg swing, lying-pose scale)
HOLD = None
NOFIT_PREFIX = ("pose-", "markings-", "front-legs-walk", "head-", "mouth-happy-", "fluff-")


def mat(key, hexcol, rough=0.6, sss=0.1):
    M[key] = common.clay(hexcol, rough, sss).copy()  # own copy so per-coat recolouring is independent
    return M[key]


def set_color(key, hexcol):
    b = M[key].node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = common.lin(hexcol)


def mix(h1, h2, t):
    a, b = common.lin(h1), common.lin(h2)
    def s(c):
        return round(255 * (c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055))
    return "#%02X%02X%02X" % tuple(s(a[i] * (1 - t) + b[i] * t) for i in range(3))


def default_zone(part):
    """Fur zone of an object when none is given (see buddy_zones.py). '' = not part of any zone (eyes, zzz...)."""
    for prefix, zone in (("body", "back"), ("head", "head"), ("front-legs", "legs"), ("ear-", "ears"), ("tail", "tail"),
                         ("fluff-", "chest"), ("pose-lying", "back"), ("eyes-closed", "head")):
        if part.startswith(prefix):
            return zone
    return ""


def add(part, o, only=None, head=None, zone=None, nofit=False):
    o["part"], o["only"] = part, only or ""
    o["zone"] = zone or default_zone(part)   # 'detail' = untinted real-colour layer (nose, mouth line, eyelid)
    if nofit:
        o["nofit"] = True
    if head is None:
        head = part in ("head", "eyes-open", "eyes-closed", "mouth-happy") or part.startswith("ear-")
    if part.startswith(NOFIT_PREFIX):
        o["nofit"] = True
    BASE[o.name] = o.matrix_world.copy()
    o.matrix_world = YAW @ EXTRA @ (TILT if head else Matrix.Identity(4)) @ o.matrix_world
    OBJS.append(o)
    return o


def ell(part, loc, rad, key, rot=(0, 0, 0), only=None, head=None, zone=None, nofit=False):
    return add(part, common.sph(loc, 1.0, M[key], scale=tuple(rad), rot=rot), only, head, zone, nofit)


def on(c, r, phi, e, k=1.0):
    """Point on an ellipsoid; phi toward the near (-Y) side, e elevation (deg)."""
    p, el = math.radians(phi), math.radians(e)
    return Vector((c.x - r.x * math.cos(p) * math.cos(el) * k, c.y - r.y * math.sin(p) * math.cos(el) * k,
                   c.z + r.z * math.sin(el) * k))


def cone_ear(part, loc, r, h, side, tilt):
    import bmesh as _b
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0.1, depth=h, location=loc, vertices=40,
                                    rotation=(math.radians(tilt * side), 0, 0))
    o = bpy.context.active_object
    o.scale = (1, 0.42, 1)
    common._finish(o, M["ear"], 0.08, 4)
    return add(part, o)


def tube(part, pts, radii, key, only=None, zone=None):
    cu = bpy.data.curves.new("t", "CURVE")
    cu.dimensions, cu.bevel_depth, cu.bevel_resolution, cu.use_fill_caps = "3D", 1.0, 5, True
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for i, (p, r) in enumerate(zip(pts, radii)):
        sp.points[i].co = (p[0], p[1], p[2], 1)
        sp.points[i].radius = r
    o = bpy.data.objects.new("tube", cu)
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.active_object
    o.select_set(False)
    o.data.materials.append(M[key])
    for p in o.data.polygons:
        p.use_smooth = True
    return add(part, o, only, zone=zone)


def lerp3(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


def patch(part, loc, rad, shell_loc, shell_rad, key, only, head=None, k=1.02, rot=(0, 0, 0), zone=None, nofit=False):
    """Blob intersected with a slightly inflated copy of the underlying ellipsoid -> flat painted patch."""
    shell = common.sph(shell_loc, 1.0, M[key], scale=tuple(v * k for v in shell_rad))
    blob = common.sph(loc, 1.0, M[key], scale=tuple(rad), rot=rot)
    md = blob.modifiers.new("i", "BOOLEAN")
    md.operation, md.object = "INTERSECT", shell
    bpy.context.view_layer.objects.active = blob
    bpy.ops.object.modifier_apply(modifier="i")
    bpy.data.objects.remove(shell)
    return add(part, blob, only, head, zone, nofit)


# Muzzle length variants for the fur-zone Buddy (medium = the original model). (MC, MR, M2C, M2R, nose)
MUZZLES = {
    "short": (Vector((-1.45, 0, 2.6)), Vector((0.55, 0.5, 0.42)), Vector((-1.62, 0, 2.58)), Vector((0.42, 0.5, 0.45)), Vector((-2.02, 0, 2.78))),
    "long": (Vector((-1.55, 0, 2.62)), Vector((0.85, 0.54, 0.46)), Vector((-2.02, 0, 2.55)), Vector((0.58, 0.36, 0.34)), Vector((-2.6, 0, 2.7))),
}


def head_block(sfx, mc, mr, m2c, m2r, nz):
    """Skull + muzzle + nose + mouth lines. sfx '' = the original (medium) head; others are nofit zone variants."""
    P, nf = f"head{'-' + sfx if sfx else ''}", bool(sfx)
    ell(P, HC, HR, "coat", nofit=nf)
    ell(P, mc, mr, "accent", zone="muzzle", nofit=nf)
    ell(P, m2c, m2r, "accent", zone="muzzle", nofit=nf)
    ell(P, nz, (0.23, 0.33, 0.24), "nose", zone="detail", nofit=nf)
    ell(P, nz + Vector((-0.1, -0.06, 0.1)), (0.06, 0.1, 0.05), "shine", zone="detail", nofit=nf)
    for s_ in (-1, 1):
        ell(P, on(HC, HR, 42 * s_, 0, 0.96), (0.19, 0.19, 0.12), "blush", rot=(0, 0, math.radians(-42 * s_)), zone="detail", nofit=nf)
    pts = [list(on(m2c, m2r, 0, e, 1.0)) for e in (-2, -5, -9, -13)]
    o = tube(P, pts, [0.05] * 4, "mline", zone="detail")
    o["nofit"] = nf
    for sg in (-1, 1):
        sp = []
        for i in range(9):
            u = i / 8
            sp.append(list(on(m2c, m2r, sg * 52 * u, -13 - 17 * math.sin(math.pi * u) + 9 * u, 1.0)))
        o = tube(P, sp, [0.05] * 9, "mline", zone="detail")
        o["nofit"] = nf
    # eye patch: a shell around each eye (zone render only; hidden from legacy renders by only="__zone")
    for ph, e in EYES:
        patch(P, on(HC, HR, ph, e, 0.97), (0.46, 0.46, 0.58), HC, HR, "coat", "__zone", head=True, k=1.035,
              rot=(0, 0, math.radians(ph)), zone="eyepatch", nofit=True)


def mouth_block(part, m2c, m2r, nofit):
    mp = on(m2c, m2r, 0, -24, 0.98)
    ell(part, mp, (0.11, 0.27, 0.13), "mouth", nofit=nofit)
    ell(part, on(m2c, m2r, 0, -36, 1.0) + Vector((-0.04, 0, 0)), (0.1, 0.15, 0.2), "tongue", nofit=nofit)


def build():
    mat("coat", "#E0A94E"); mat("accent", CREAM_ACCENT); mat("ear", "#E0A94E"); mat("tail", "#E0A94E")
    mat("nose", "#2B2523", 0.3, 0.0); mat("line", "#5A3A28", 0.5, 0.0); mat("mline", "#3A2218", 0.5, 0.0)
    mat("eyewhite", "#FFFFFF", 0.25, 0.0); mat("pupil", "#1E1412", 0.1, 0.0); mat("shine", "#FFFFFF", 0.1, 0.0)
    mat("tongue", "#E59A9A", 0.45); mat("mouth", "#4A2A2A", 0.5, 0.0); mat("blush", "#F2A0A0", 0.7)
    mat("rim", "#9A8070", 0.5, 0.0); mat("lid", "#2B2523", 0.5, 0.0); mat("ginger", GINGER); mat("charcoal", CHARCOAL); mat("zzz", common.HEX["blue"])

    # ---- body: torso, both haunches, hind paw, far front leg, chest bib
    T_L, T_R = Vector((0.35, 0, 1.25)), (1.0, 0.9, 1.25)
    ell("body", T_L, T_R, "coat")
    ell("body", (-0.62, 0, 1.15), (0.3, 0.55, 0.85), "accent", zone="chest")
    for s in (-1, 1):
        ell("body", (0.75, s * 0.68, 0.8), (0.8, 0.62, 0.8), "coat", zone="legs")
    ell("body", (-0.05, -0.78, 0.17), (0.5, 0.3, 0.19), "coat", zone="paws")    # near hind paw
    ell("body", (-0.45, 0.5, 0.62), (0.27, 0.27, 0.65), "coat", zone="legs")    # far front leg
    ell("body", (-0.58, 0.5, 0.15), (0.4, 0.32, 0.17), "coat", zone="paws")
    # fur-zone shell on the underside (hidden in legacy renders by only="__zone", never part of the framing)
    patch("body", (0.25, -0.62, 0.4), (1.5, 0.8, 0.7), T_L, T_R, "coat", "__zone", head=False, k=1.035, zone="belly", nofit=True)
    patch("body", (0.5, 0, 2.2), (0.9, 0.85, 0.55), T_L, T_R, "charcoal", "tricolour")
    patch("body", (0.8, -0.85, 0.85), (0.6, 0.5, 0.6), (0.75, -0.68, 0.8), (0.8, 0.62, 0.8), "ginger", "tricolour")

    # ---- near front leg
    ell("front-legs", (-0.4, -0.52, 0.62), (0.28, 0.28, 0.68), "coat")
    ell("front-legs", (-0.55, -0.52, 0.15), (0.42, 0.34, 0.18), "coat", zone="paws")

    # ---- head (no eyes, no ears): skull, forward snout (capsule), big nose, brows, blush, "w" mouth
    head_block("", MC, MR, M2C, M2R, Vector((-2.4, 0, 2.8)))
    patch("head", (-0.95, 0.05, 3.5), (0.8, 0.7, 0.6), HC, HR, "ginger", "tricolour")
    for sfx, (mc, mr, m2c, m2r, nz) in MUZZLES.items():
        head_block(sfx, mc, mr, m2c, m2r, nz)

    # ---- eyes: big glossy ovals on the FRONT of the face, above the muzzle
    for ph, e in EYES:
        p = on(HC, HR, ph, e, 0.97)
        n = (on(HC, HR, ph, e, 1.0) - HC).normalized()
        t = Vector((-n.y, n.x, 0)).normalized()
        rz = (0, 0, math.radians(ph))
        ell("eyes-open", p, (0.14, 0.2, 0.27), "pupil", rot=rz)
        ell("eyes-open", p - n * 0.02, (0.15, 0.225, 0.3), "rim", rot=rz, only="charcoal,chocolate")
        ell("eyes-open", p + n * 0.1 + t * 0.06 + Vector((0, 0, 0.1)), (0.06, 0.06, 0.06), "shine")
        ell("eyes-open", p + n * 0.11 - t * 0.07 + Vector((0, 0, -0.1)), (0.03, 0.03, 0.03), "shine")
        # closed: coat cover + thick gentle curve
        ell("eyes-closed", p, (0.2, 0.26, 0.33), "coat", rot=rz)
        arc = [list(p + n * (0.17 - 0.03 * u * u) + t * (u * 0.2) + Vector((0, 0, 0.04 - 0.08 * (1 - u * u))))
               for u in [i / 4 - 1 for i in range(9)]]
        tube("eyes-closed", arc, [0.05] * 9, "lid", zone="detail")

    # ---- open happy mouth + tongue coming out of the "w" mouth
    mouth_block("mouth-happy", M2C, M2R, False)
    for sfx, (_, _, m2c, m2r, _) in MUZZLES.items():
        mouth_block(f"mouth-happy-{sfx}", m2c, m2r, True)

    # ---- ears (bigger, higher). root on the top sides of the head; left = near (-Y), right = far (+Y)
    for side, name in ((1, "left"), (-1, "right")):
        root = on(HC, HR, 88 * side, 56, 0.96)
        part = lambda st: f"ear-{name}-{st}"
        ell(part("floppy"), root + Vector((0.12, -0.28 * side, -0.62)), (0.44, 0.17, 0.82), "ear",
            rot=(math.radians(-14 * side), 0, 0))
        cone_ear(part("pointy"), root + Vector((0.05, -0.1 * side, 0.28)), 0.44, 0.78, side, 16)
        cone_ear(part("folded"), root + Vector((0.05, -0.1 * side, 0.3)), 0.46, 0.8, side, 10)
        ell(part("folded"), root + Vector((-0.36, -0.2 * side, 0.55)), (0.28, 0.17, 0.2), "ear",
            rot=(math.radians(-10 * side), math.radians(35), 0))

    # ---- tails (base is TAIL_BASE for all)
    tb = TAIL_BASE
    pts = []
    for i in range(41):
        t = i / 40
        a = math.radians(215 + 330 * t)
        rr = 0.78 - 0.38 * t
        pts.append([1.95 + rr * math.cos(a), 0, 1.75 + rr * math.sin(a)])
    pts[0] = list(tb)
    pts = [lerp3(list(tb), p, min(1, i / 4)) for i, p in enumerate(pts)]
    rd = [0.23 - 0.1 * i / 40 for i in range(41)]
    tube("tail-curly", pts, rd, "tail")
    ell("tail-curly", Vector(pts[-1]), (rd[-1],) * 3, "tail")
    ps = [[tb.x + 1.25 * t + 0.1 * t * t, 0, tb.z + 1.3 * t + 0.55 * t * t] for t in [i / 24 for i in range(25)]]
    tube("tail-straight", ps, [0.24 - 0.09 * i / 24 for i in range(25)], "tail")
    ell("tail-straight", Vector(ps[-1]), (0.15,) * 3, "tail")
    ell("tail-stubby", tb + Vector((0.2, 0, 0.18)), (0.34, 0.3, 0.3), "tail", rot=(0, math.radians(30), 0))
    # fluffy tails: small soft tufts along the tail only (zone render only, nofit)
    ctr = Vector((1.95, 0, 1.75))
    for st, seq in (("curly", pts), ("straight", ps)):
        for i in range(5, len(seq) - 1, 2 if st == "curly" else 2):
            cur, nxt = Vector(seq[i]), Vector(seq[min(i + 1, len(seq) - 1)])
            tan = (nxt - cur).normalized()
            out = (cur - ctr).normalized() if st == "curly" else Vector((0, 0, 1))
            tuft(f"tail-{st}-fluffy", list(cur), 0.13, 0.42, tan * 1.2 + out * (0.45 if (i // 2) % 2 else 0.2), "tail")
        tuft(f"tail-{st}-fluffy", list(seq[-1]), 0.15, 0.4, (tan * 1.0 + out * 0.3), "tail")
    for d in ((0.6, 0, 0.8), (1, 0, 0.2), (0.4, 0, -0.9)):
        tuft("tail-stubby-fluffy", list(tb + Vector((0.25, 0, 0.25))), 0.14, 0.4, d, "tail")

    # ---- zzz: three small clay Z's, rising up-right of the head (face the camera, no yaw)
    for (zx, zz, s) in ((-1.7, 4.0, 0.2), (-0.95, 4.2, 0.25), (-0.2, 4.4, 0.3)):
        for loc, size, rot in (((zx, -0.4, zz + s), (s * 1.8, 0.3, s * 0.6), 0),
                               ((zx, -0.4, zz - s), (s * 1.8, 0.3, s * 0.6), 0),
                               ((zx, -0.4, zz), (s * 2.3, 0.3, s * 0.6), -math.atan2(2 * s, 1.8 * s))):
            b = common.box(loc, size, M["zzz"], bev=0.04, rot=(0, rot, 0))
            b["part"], b["only"], b["nofit"] = "zzz", "", True
            OBJS.append(b)


T_L, T_R = Vector((0.35, 0, 1.25)), (1.0, 0.9, 1.25)
SH = Vector((-0.4, -0.52, 1.3))   # near shoulder: top of the near front leg (walk frames swing about it)
MK = 1.035                        # marking shell inflation (clears the 1.02 tricolour patches)
LS = 0.8                         # lying pose scale (keeps it inside the sitting canvas)
HEAD_PARTS = ("head", "eyes-closed", "ear-left-floppy", "ear-right-floppy")


def swing(deg, lift):
    return Matrix.Translation(SH + Vector((0, 0, lift))) @ Matrix.Rotation(math.radians(deg), 4, "Y") @ Matrix.Translation(-SH)


def build_extras():
    global EXTRA
    mat("mark", "#888888")
    # ---- walking legs: the near leg swung about the shoulder, same shapes as front-legs
    for name, deg, lift in (("a", 26, 0.0), ("b", -18, 0.06)):
        EXTRA = swing(deg, lift)
        ell(f"front-legs-walk-{name}", (-0.4, -0.52, 0.62), (0.28, 0.28, 0.68), "coat")
        ell(f"front-legs-walk-{name}", (-0.55, -0.52, 0.15), (0.42, 0.34, 0.18), "coat")
    EXTRA = Matrix.Identity(4)

    # ---- markings: thin shells on the surface, rendered with the base parts as holdouts
    P = "markings-patch"
    for loc, rad in (((0.55, -0.1, 2.3), (1.0, 0.75, 0.6)), ((0.0, 0.35, 2.1), (0.6, 0.5, 0.5)),
                     ((1.05, -0.45, 1.9), (0.55, 0.5, 0.45)), ((0.3, -0.75, 1.75), (0.4, 0.35, 0.35)),
                     ((1.3, 0.3, 2.0), (0.4, 0.4, 0.4))):
        patch(P, loc, rad, T_L, T_R, "mark", None, head=False, k=MK)
    e1 = on(HC, HR, 44, 30)
    for loc, rad in ((e1, (0.58, 0.5, 0.6)), (on(HC, HR, 66, 52), (0.42, 0.4, 0.4)), (on(HC, HR, 30, 12), (0.3, 0.28, 0.32)), (on(HC, HR, 48, 8), (0.4, 0.4, 0.3))):
        patch(P, loc, rad, HC, HR, "mark", None, head=True, k=MK)

    S = "markings-socks"
    for blob, rad, shells in (
            (Vector((-0.5, -0.52, 0.1)), (0.62, 0.5, 0.44), [((-0.4, -0.52, 0.62), (0.28, 0.28, 0.68)), ((-0.55, -0.52, 0.15), (0.42, 0.34, 0.18))]),
            (Vector((-0.55, 0.5, 0.1)), (0.62, 0.5, 0.42), [((-0.45, 0.5, 0.62), (0.27, 0.27, 0.65)), ((-0.58, 0.5, 0.15), (0.4, 0.32, 0.17))]),
            (Vector((-0.05, -0.78, 0.1)), (0.62, 0.5, 0.3), [((-0.05, -0.78, 0.17), (0.5, 0.3, 0.19))])):
        for sl, sr in shells:
            patch(S, blob, rad, sl, sr, "mark", None, head=False, k=MK)

    Mk = "markings-mask"
    for sl, sr in ((MC, MR), (M2C, M2R)):
        patch(Mk, (-1.95, 0, 2.72), (1.0, 0.9, 0.3), sl, sr, "mark", None, head=True, k=MK)
    patch(Mk, (-1.35, 0, 3.05), (0.55, 0.3, 0.3), HC, HR, "mark", None, head=True, k=MK)
    for ph, e in EYES:
        patch(Mk, on(HC, HR, ph, e, 0.97), (0.3, 0.34, 0.42), HC, HR, "mark", None, head=True, k=MK, rot=(0, 0, math.radians(ph)))

    build_fluff()
    build_lying()
    build_back()


def tuft(part, loc, r, h, direction, key, zone=None):
    """Soft fur tuft: an elongated rounded blob along `direction`, base near `loc` (zone render only, nofit)."""
    d = Vector(direction).normalized()
    rot = Vector((0, 0, 1)).rotation_difference(d).to_euler()
    o = common.sph(tuple(Vector(loc) + d * (h * 0.4)), 1.0, M[key], scale=(r, r * 0.8, h * 0.5), rot=tuple(rot))
    return add(part, o, zone=zone, nofit=True)


def build_fluff():
    """Fur length for the fur-zone Buddy, zone chest, drawn between body and head. short = none; medium = a subtle
    chest ruff; fluffy = a fuller ruff plus many small soft tufts on chest and neck (kept at the silhouette edge)."""
    BIB, BIBR = Vector((-0.62, 0, 1.15)), Vector((0.3, 0.55, 0.85))
    for level, k in (("medium", 1.1), ("fluffy", 1.3)):
        P = f"fluff-{level}"
        for loc, rad in (((-0.78, 0, 1.55), (0.36, 0.62, 0.62)), ((-0.62, -0.5, 1.75), (0.34, 0.3, 0.42)),
                         ((-0.62, 0.5, 1.75), (0.34, 0.3, 0.42)), ((-0.92, 0, 1.15), (0.3, 0.45, 0.4))):
            ell(P, (loc[0] - 0.08 * (k - 1), loc[1] * k, loc[2] + 0.05 * (k - 1)), tuple(r * k for r in rad), "accent")
    P = "fluff-fluffy"
    for e in (-35, -10, 15, 40, 65):
        for phi in (-75, -40, -5, 30, 65):
            p0 = on(BIB, BIBR, phi, e, 1.0)
            d = (p0 - BIB).normalized() + Vector((0, 0, -0.35))
            tuft(P, p0 - d.normalized() * 0.1, 0.14, 0.45, d, "accent")
    for ph in (-80, -50, 50, 80):   # neck / cheek line
        p0 = on(Vector((-0.6, 0, 2.0)), Vector((0.35, 0.8, 0.3)), ph, 10, 1.0)
        tuft(P, p0, 0.11, 0.38, (p0 - Vector((-0.6, 0, 2.0))).normalized() + Vector((0, 0, -0.5)), "accent")


def build_lying():
    """Sphinx pose, head resting on the front paws, eyes shut. Body built in the dog frame, head parts are
    copies of the sitting ones re-posed. Everything is nofit so the shared canvas is unchanged."""
    global EXTRA
    EXTRA = Matrix.Translation((0.35, 0, 0)) @ Matrix.Scale(LS, 4)
    L = "pose-lying"
    ell(L, (0.35, 0, 0.78), (1.3, 0.92, 0.78), "coat")
    ell(L, (-0.75, 0, 0.7), (0.32, 0.6, 0.55), "accent", zone="chest")
    for sg in (-1, 1):
        ell(L, (0.95, sg * 0.74, 0.5), (0.85, 0.6, 0.5), "coat", zone="legs")
        ell(L, (-0.5, sg * 0.55, 0.4), (0.5, 0.3, 0.4), "coat", zone="legs")
        ell(L, (-1.95, sg * 0.5, 0.2), (0.95, 0.3, 0.2), "coat", zone="paws")
    ell(L, (0.1, -1.05, 0.17), (0.6, 0.3, 0.19), "coat", zone="paws")
    T = (0.35, 0, 0.78)
    patch(L, (0.5, 0, 1.4), (0.9, 0.85, 0.5), T, (1.3, 0.92, 0.78), "charcoal", "tricolour", head=False)
    patch(L, (1.0, -0.85, 0.55), (0.6, 0.5, 0.5), (0.95, -0.74, 0.5), (0.85, 0.6, 0.5), "ginger", "tricolour", head=False)
    # head copies
    tgt = Vector((-1.55, 0, 1.12))
    hx = Matrix.Translation(tgt) @ Matrix.Rotation(math.radians(-12), 4, "Y") @ Matrix.Translation(-HC)
    src = [o for o in OBJS if o["part"] in HEAD_PARTS]
    for o in src:
        n = o.copy()
        bpy.context.scene.collection.objects.link(n)
        n["part"], n["nofit"] = L, True
        n.matrix_world = YAW @ EXTRA @ hx @ BASE[o.name]
        OBJS.append(n)
    tb = Vector((1.6, 0, 0.32))
    tx = Matrix.Translation(tb) @ Matrix.Rotation(math.radians(90), 4, "X") @ Matrix.Translation(-TAIL_BASE)
    for o in [o for o in OBJS if o["part"] == "tail-curly"]:
        n = o.copy()
        bpy.context.scene.collection.objects.link(n)
        n["part"], n["nofit"] = L, True
        n.matrix_world = YAW @ EXTRA @ tx @ BASE[o.name]
        OBJS.append(n)
    EXTRA = Matrix.Identity(4)


# ---------- seen from behind (gate walk + "looking back" sit) ----------

def rz(deg, pivot=(0, 0, 0)):
    p = Vector(pivot)
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, "Z") @ Matrix.Translation(-p)


def _near(o, loc, tol=0.02):
    return (BASE[o.name].translation - Vector(loc)).length < tol


def clone(o, mw, part):
    n = o.copy()
    bpy.context.scene.collection.objects.link(n)
    n["part"], n["nofit"] = part, True
    n.matrix_world = mw @ BASE[o.name]
    OBJS.append(n)
    return n


def free_ell(part, loc, rad, key, mw):
    o = common.sph(loc, 1.0, M[key], scale=tuple(rad))
    o["part"], o["only"], o["nofit"] = part, "", True
    o.matrix_world = mw @ o.matrix_world
    OBJS.append(o)
    return o


BACK_POSES = ("walk-back-a", "walk-back-b", "sit-back")
BACK_PART = {"walk-back-a": ("poseWalkBack", "a"), "walk-back-b": ("poseWalkBack", "b"), "sit-back": ("poseSitBack", "sit-back")}
FACE_AWAY = -90          # dog faces -X; this turns it to face away from the camera (+Y)


def build_back():
    """Walk-back a/b: dog trotting away (hind paws alternate, head glances sideways); sit-back: sitting with its back
    to us, head turned over the shoulder looking at the viewer. All nofit, copies of the sitting parts re-posed."""
    ORIG = list(OBJS)
    body = [o for o in ORIG if o["part"] == "body"]
    legs = [o for o in ORIG if o["part"] == "front-legs"]
    head = [o for o in ORIG if o["part"] in ("head", "ear-left-floppy", "ear-right-floppy")]
    tail = [o for o in ORIG if o["part"] == "tail-curly"]
    eyes = [o for o in ORIG if o["part"] == "eyes-open"]
    tail_m = lambda ang: rz(ang, TAIL_BASE)            # turn the curl so it shows from behind

    for name, near_back, bob, hy in (("a", True, 0.0, 22), ("b", False, 0.05, -22)):
        P = f"pose-walk-back-{name}"
        G = Matrix.Translation((0.0, 0.0, 0.0)) @ rz(FACE_AWAY + (8 if near_back else -8))
        for o in body:
            if _near(o, (0.35, 0, 1.25)) or _near(o, (0.5, 0, 2.2)):           # torso + back patch
                clone(o, G @ Matrix.Translation((0, 0, bob)), P)
            for s in (-1, 1):
                if _near(o, (0.75, s * 0.68, 0.8)) or (s < 0 and _near(o, (0.8, -0.85, 0.85))):
                    back = (s < 0) == near_back          # this haunch is the one pushed back (planted)
                    off = Vector((0.18, 0, 0.0)) if back else Vector((-0.28, 0, 0.26))
                    clone(o, G @ Matrix.Translation(off + Vector((0, 0, bob))), P)
        for s in (-1, 1):
            back = (s < 0) == near_back
            loc = (1.62, s * 0.68, 0.19) if back else (1.5, s * 0.68, 0.62)
            free_ell(P, loc, (0.5, 0.31, 0.2), "coat", G @ Matrix.Translation((0, 0, bob)))
        hm = G @ Matrix.Translation((0, 0, bob)) @ rz(hy, HC)
        for o in head:
            clone(o, hm, P)
        for o in tail:
            clone(o, G @ Matrix.Translation((0, 0, bob)) @ tail_m(75), P)

    P = "pose-sit-back"
    G = rz(FACE_AWAY + 14)
    for o in body + legs:
        clone(o, G, P)
    for o in tail:
        clone(o, G @ tail_m(70), P)
    hm = Matrix.Translation((0.55, -0.55, 0.12)) @ G @ rz(150, HC)
    for o in head + eyes:
        clone(o, hm, P)


def set_coat(coat):
    c = COATS[coat]
    acc = WHITE_ACCENT if coat in ("white", "tricolour") else mix(c, CREAM_ACCENT, 0.65)
    set_color("coat", c)
    set_color("accent", acc)
    set_color("ear", CHARCOAL if coat == "tricolour" else mix(c, "#5A3A28", 0.16))
    set_color("tail", CHARCOAL if coat == "tricolour" else c)
    dark = coat in ("charcoal", "chocolate")
    set_color("rim", mix(c, "#FFFFFF", 0.5)); set_color("lid", mix(c, "#FFFFFF", 0.7) if dark else "#2B2523")
    set_color("nose", "#5A3A28" if coat == "chocolate" else "#2B2523")
    set_color("mark", mark_colour(coat))


def mark_colour(coat, style="patch"):
    """Light coats get a darker tone (35% toward brown), dark coats cream. Socks are cream wherever cream reads."""
    c = COATS[coat]
    light = coat in ("cream", "white", "tricolour")
    if style == "socks" and not light:
        return CREAM_ACCENT
    return CREAM_ACCENT if coat in ("charcoal", "chocolate", "ginger") else mix(c, "#5A3A28", 0.5 if style == "patch" else 0.35)


def show(parts, coat=None):
    for o in OBJS:
        ok = o["part"] in parts and (not o["only"] or coat in o["only"].split(","))
        o.hide_render = not ok


def holdout(on_):
    """Turn the base body/head/legs into holdouts (they occlude but paint nothing, cast no shadow)."""
    global HOLD
    if HOLD is None:
        HOLD = bpy.data.materials.new("hold")
        HOLD.use_nodes = True
        nt = HOLD.node_tree
        nt.nodes.clear()
        h = nt.nodes.new("ShaderNodeHoldout")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(h.outputs[0], out.inputs["Surface"])
    for o in OBJS:
        if o["part"] in ("body", "head", "front-legs") and not o.hide_render:
            if on_:
                o["_mat"] = o.material_slots[0].material.name
                o.material_slots[0].material = HOLD
            elif "_mat" in o:
                o.material_slots[0].material = bpy.data.materials[o["_mat"]]
                del o["_mat"]
            o.visible_shadow = not on_


def composite(out, layers, dst, ground):
    """Alpha-stack PNG layers over a light backdrop with a thin groundY line (review aid)."""
    import numpy as np
    def load(p):
        im = bpy.data.images.load(p)
        a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)
        bpy.data.images.remove(im)
        return a
    acc = None
    for p in layers:
        a = load(os.path.join(out, p))
        if acc is None:
            acc = np.zeros_like(a)
            acc[..., :3], acc[..., 3] = 0.93, 1.0
            hh = a.shape[0]
            acc[hh - int(ground * hh), :, :3] = (0.85, 0.3, 0.3)  # image rows are bottom-up
        al = a[..., 3:4]
        acc[..., :3] = a[..., :3] * al + acc[..., :3] * (1 - al)
    im = bpy.data.images.new("pv", acc.shape[1], acc.shape[0], alpha=True)
    im.pixels = acc.ravel().tolist()
    im.filepath_raw, im.file_format = os.path.join(out, dst), "PNG"
    im.save()
    bpy.data.images.remove(im)


def frame(w, h):
    """Fit using ALL meshes once (variants included), then drop the dog so its feet sit near the bottom."""
    sc = bpy.context.scene
    for o in OBJS:
        o.hide_render = False
    common.fit(0.82, w, h)
    cam = sc.camera
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    bpy.context.view_layer.update()
    from bpy_extras.object_utils import world_to_camera_view as wcv
    ys = [1 - wcv(sc, cam, o.matrix_world @ v.co).y for o in OBJS if o["part"] != "zzz" and not o.get("nofit") for v in o.data.vertices]
    shift = (max(ys) - 0.9) * cam.data.ortho_scale   # >0 means dog too low -> move camera down
    cam.location -= cam.matrix_world.to_3x3() @ Vector((0, shift, 0))
    bpy.context.view_layer.update()
    return sc, cam, wcv


def pivot(wcv, sc, cam, p, tilted=False):
    v = wcv(sc, cam, YAW @ (TILT if tilted else Matrix.Identity(4)) @ Vector(p))
    return {"x": round(v.x, 4), "y": round(1 - v.y, 4)}


def gold_previews(out, ground):
        st = ["golden/tail-curly.png", "golden/ear-right-floppy.png", "golden/body.png"]
        hd = ["golden/head.png"]
        top = ["common/eyes-open.png", "golden/ear-left-floppy.png"]
        composite(out, st + ["golden/front-legs.png"] + hd + ["golden/markings-patch.png"] + top, "_preview-golden-markings-patch.png", ground)
        composite(out, st + ["golden/front-legs.png", "golden/markings-socks.png"] + hd + top, "_preview-golden-markings-socks.png", ground)
        composite(out, st + ["golden/front-legs.png"] + hd + ["golden/markings-mask.png"] + top, "_preview-golden-markings-mask.png", ground)
        composite(out, st + ["golden/front-legs-walk-a.png"] + hd + top, "_preview-golden-walk-a.png", ground)
        composite(out, st + ["golden/front-legs-walk-b.png"] + hd + top, "_preview-golden-walk-b.png", ground)
        composite(out, ["golden/pose-lying.png"], "_preview-golden-lying.png", ground)


def sheet(out, coats):
    import contact_sheet
    names = [f"_preview-{c}" for c in coats] + [f"{c}/pose-lying" for c in coats]
    names += [f"{c}/pose-{nm}" for nm in BACK_POSES for c in coats]
    contact_sheet.make(out, names, os.path.join(out, "_contact-sheet.png"), tile=256, cols=len(coats))


def main(argv):
    if "--zones" in argv or "--zones-sheet" in argv:   # fur-zone layers: see buddy_zones.py
        import buddy_zones
        return buddy_zones.main(argv)
    fast = "--fast" in argv
    arg = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    out = arg("--out", os.path.join(root, "assets", "buddy"))
    coats = arg("--coats", ",".join(COATS)).split(",")
    preview_only = "--preview-only" in argv
    only_marks = "--only-markings" in argv
    only_back = "--only-back" in argv      # render just the from-behind poses and merge them into manifest.json
    w = h = int(arg("--size", 512))
    samples = 16 if fast else 32
    import time
    t0 = time.time()
    common.setup_scene(*CAM)
    build()
    build_extras()
    sc, cam, wcv = frame(w, h)
    pv = {
        "tail": pivot(wcv, sc, cam, TAIL_BASE),
        "head": pivot(wcv, sc, cam, NECK),
        "headCenter": pivot(wcv, sc, cam, HC, True),
        "earLeft": pivot(wcv, sc, cam, on(HC, HR, 88, 56, 0.96), True),
        "earRight": pivot(wcv, sc, cam, on(HC, HR, -88, 56, 0.96), True),
    }
    ground = 1 - wcv(sc, cam, YAW @ Vector((0, 0, 0))).y
    entries = []
    def rnd(rel, parts, coat, part, style=None, pivot_key=None):
        path = os.path.join(out, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        show(parts, coat)
        common.render(path, w, h, samples)
        e = {"file": rel, "part": part, "coat": coat, "style": style}
        if pivot_key:
            e["pivot"] = pv[pivot_key]
        entries.append(e)
    base = ["body", "front-legs", "head", "ear-left-floppy", "ear-right-floppy", "tail-curly", "eyes-open"]
    for coat in coats:
        set_coat(coat)
        if only_marks:
            for st in MARKS:
                set_color("mark", mark_colour(coat, st))
                show([f"markings-{st}", "body", "head", "front-legs"], coat)
                holdout(True)
                common.render(os.path.join(out, f"{coat}/markings-{st}.png"), w, h, samples)
                holdout(False)
            print(f"[buddy] {coat} markings {time.time() - t0:.0f}s", flush=True)
            continue
        if only_back:
            for nm in BACK_POSES:
                rnd(f"{coat}/pose-{nm}.png", [f"pose-{nm}"], coat, *BACK_PART[nm])
            print(f"[buddy] {coat} back poses {time.time() - t0:.0f}s", flush=True)
            continue
        if preview_only:
            show(base, coat); common.render(os.path.join(out, f"_preview-{coat}.png"), w, h, samples); continue
        for p, part in (("body", "body"), ("head", "head"), ("front-legs", "frontLegs")):
            rnd(f"{coat}/{p}.png", [p], coat, part, None, "head" if p == "head" else None)
        for st in EARS:
            rnd(f"{coat}/ear-left-{st}.png", [f"ear-left-{st}"], coat, "earLeft", st, "earLeft")
            rnd(f"{coat}/ear-right-{st}.png", [f"ear-right-{st}"], coat, "earRight", st, "earRight")
        for st in TAILS:
            rnd(f"{coat}/tail-{st}.png", [f"tail-{st}"], coat, "tail", st, "tail")
        for st in MARKS:
            set_color("mark", mark_colour(coat, st))
            show([f"markings-{st}", "body", "head", "front-legs"], coat)
            holdout(True)
            rnd_path = f"{coat}/markings-{st}.png"
            common.render(os.path.join(out, rnd_path), w, h, samples)
            holdout(False)
            entries.append({"file": rnd_path, "part": "markings", "coat": coat, "style": st})
        for st in ("a", "b"):
            rnd(f"{coat}/front-legs-walk-{st}.png", [f"front-legs-walk-{st}"], coat, "frontLegs", f"walk-{st}")
        rnd(f"{coat}/pose-lying.png", ["pose-lying"], coat, "poseLying", "lying")
        for nm in BACK_POSES:
            rnd(f"{coat}/pose-{nm}.png", [f"pose-{nm}"], coat, *BACK_PART[nm])
        show(base, coat)
        common.render(os.path.join(out, f"_preview-{coat}.png"), w, h, samples)
        if "--variants" in argv:  # extra check renders: happy + sleepy faces
            show([b for b in base if b != "eyes-open"] + ["eyes-closed", "mouth-happy"], coat)
            common.render(os.path.join(out, f"_preview-{coat}-sleepy.png"), w, h, samples)
            show([b for b in base if b not in ("eyes-open", "tail-curly", "ear-left-floppy")] + ["mouth-happy", "eyes-open", "ear-left-pointy", "tail-straight"], coat)
            common.render(os.path.join(out, f"_preview-{coat}-happy.png"), w, h, samples)
        print(f"[buddy] {coat} done {time.time() - t0:.0f}s", flush=True)
    if only_back:
        mp = os.path.join(out, "manifest.json")
        with open(mp) as f:
            man = json.load(f)
        new = {e["file"] for e in entries}
        man["files"] = [e for e in man["files"] if e["file"] not in new] + entries
        with open(mp, "w") as f:
            json.dump(man, f, indent=2)
        sheet(out, coats)
        return
    if only_marks:
        if "golden" in coats:
            gold_previews(out, ground)
        sheet(out, coats)
        return
    if not preview_only:
        set_coat("golden")
        for rel, parts, part in (("common/eyes-open.png", ["eyes-open"], "eyesOpen"),
                                 ("common/eyes-closed.png", ["eyes-closed"], "eyesClosed"),
                                 ("common/mouth-happy.png", ["mouth-happy"], "mouthHappy"),
                                 ("common/zzz.png", ["zzz"], "zzz")):
            rnd(rel, parts, None, part)
        if "golden" in coats:
            gold_previews(out, ground)
        sheet(out, coats)
        man = {"canvas": 1024, "facing": "left", "groundY": round(ground, 4), "pivots": pv, "files": entries}
        with open(os.path.join(out, "manifest.json"), "w") as f:
            json.dump(man, f, indent=2)
        print("pivots", pv, "groundY", ground)
    print(f"[buddy] total {time.time() - t0:.0f}s")
