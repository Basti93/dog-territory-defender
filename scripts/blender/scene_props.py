"""Scene props for the 'Unser Viertel' redesign (fence, gate, bench, bowl, signs, doormat, pennant, postcard)
plus flat cloth/paper textures (patches, linen). Spatial things are clay (same rig as the buildings), signs/card are
clean flat-faced wood/paper, textures are generated with numpy so they tile exactly.
Imported by render_all.py; adds itself to assets.ASSETS / assets.TEXTURES."""
import math
import bmesh
import bpy
import numpy as np
from mathutils import Vector

import assets
import common
from common import box, cyl, sph, torus, prism, HEX
from assets import bone

R = math.radians
HEX.update({"picket": "#FFFDF7", "gate": "#F2786E", "gate_rail": "#E0645A", "sign_face": "#E9C98E",
            "sign_rim": "#B08D5E", "sign_edge": "#7A5C3A", "paper": "#FFFBF0", "mat": "#F3E9D2",
            "mat_dark": "#E4D5B3", "bone2": "#E5C79A", "bowl_in": "#D9EEF9", "post": "#B08D5E"})

def standard():
    """Exact design colours for flat, front-facing assets (no AgX desaturation)."""
    bpy.context.scene["view_transform"], bpy.context.scene["exposure"] = "Standard", 0.0


def lit(strength, *keys, diffuse=1.0):
    """Flat, front-facing things get no key light from above, so add a little emission of their own colour
    (keeps bevel shading, makes the face read as its design colour)."""
    for k in keys:
        b = common.clay(k).node_tree.nodes["Principled BSDF"]
        b.inputs["Emission Color"].default_value = common.lin(HEX.get(k, k))
        b.inputs["Emission Strength"].default_value = strength
        if diffuse != 1.0:
            c = common.lin(HEX.get(k, k))
            b.inputs["Base Color"].default_value = (c[0] * diffuse, c[1] * diffuse, c[2] * diffuse, 1)


import os
EM = float(os.environ.get("EM", "0.55"))
DF = float(os.environ.get("DF", "0.5"))
PX_UNIT = 256   # fence family: 1 world unit = 256 px (512 px = 2 units)


def manual_cam(ortho, center):
    cam = bpy.context.scene.camera
    cam.data.ortho_scale = ortho
    cam.location = Vector(center) + cam.rotation_euler.to_matrix() @ Vector((0, 0, 30))
    bpy.context.scene["manual"] = True


# ---------- fence family (camera FENCE = (80, 0), 256 px per unit) ----------

PITCH, PW = 0.5, 0.34          # picket pitch / width; 4 pickets = 2.0 units = 512 px


def picket(x, y, mat="picket", h=0.7, w=PW, d=0.07, tip=0.17, rot=0.0, z0=0.03, along=None):
    box((x, y, z0 + h / 2), (w, d, h), mat, bev=0.035, rot=(0, 0, rot))
    p = prism((x, y, z0 + h - 0.005), w, d, tip, mat, bev=0.03)
    p.rotation_euler = (0, 0, rot)


def fence_segment():
    standard()
    lit(0.5, "picket", diffuse=0.6)
    for i in range(4):
        picket((i - 1.5) * PITCH, -0.04)
    for z in (0.22, 0.52):  # rails run past the frame so copies butt seamlessly
        box((0, 0.04, z), (2.0 + 0.6, 0.05, 0.075), "picket", bev=0.02)
    manual_cam(2.0, (0, 0, 0.45))


def post(x=0.0, h=0.9, w=0.2, mat="post"):
    box((x, 0, h / 2), (w, w, h), mat, bev=0.035)
    box((x, 0, h + 0.03), (w + 0.06, w + 0.06, 0.07), mat, bev=0.03)
    sph((x, 0, h + 0.1), w * 0.38, mat, (1, 1, 0.8))


def fence_post_end():
    standard()
    lit(0.3, "post", diffuse=0.7)
    post(0.0, 0.76, 0.24)
    manual_cam(1.0, (0, 0, 0.5))   # 128 x 256 canvas -> ortho refers to the long side (256 px = 1 unit)


def gate(swing_deg):
    standard()
    lit(0.3, "gate", "gate_rail", "post", diffuse=0.7)
    a = R(swing_deg)
    hx = 0.75
    for sgn in (-1, 1):
        post(sgn * 0.88, 1.0, 0.18)
    for sgn in (-1, 1):                       # sgn=-1 left leaf (hinge on left post), +1 right
        dx, dy = -sgn * math.cos(a), -math.sin(a)
        hinge = (sgn * hx, -0.04 if swing_deg else 0.0)
        rz = -a if sgn < 0 else a
        for k in range(3):
            u = 0.125 + 0.25 * k + (0.0 if k == 0 else 0.0)
            picket(hinge[0] + dx * u, hinge[1] + dy * u, "gate", h=0.78, w=0.21, d=0.07, tip=0.2, rot=rz, z0=0.04)
        for z in (0.25, 0.58):
            box((hinge[0] + dx * 0.375, hinge[1] + dy * 0.375 + (0.05 * math.cos(a)), z), (0.74, 0.05, 0.08),
                "gate_rail", bev=0.02, rot=(0, 0, rz))
    manual_cam(2.0, (0, 0, 0.93))


# ---------- bench ----------

def bench(cards=True):
    lit(0.6, "paper", "wood")
    w = 2.3
    for sx in (-1, 1):
        for sy in (-1, 1):
            box((sx * (w / 2 - 0.12), sy * 0.28, 0.28), (0.12, 0.12, 0.56), "wood_dark", bev=0.03)
        box((sx * (w / 2 - 0.12), 0.34, 0.95), (0.12, 0.1, 0.8), "wood_dark", bev=0.03)
    for y in (-0.24, 0.1):                       # seat slats
        box((0, y, 0.58), (w, 0.3, 0.09), "wood", bev=0.04)
    for z in (0.95, 1.22):                       # back slats
        box((0, 0.36, z), (w - 0.1, 0.07, 0.22), "wood", bev=0.03)
    if cards:
        top = 0.625
        for i, (x, y, rz) in enumerate([(0.15, -0.05, R(-14)), (0.35, 0.02, R(9)), (0.28, -0.1, R(-3))]):
            z = top + 0.014 + i * 0.03
            box((x, y, z), (1.0, 0.68, 0.028), "paper", bev=0.01, rot=(0, 0, rz))
        z = top + 0.028 + 3 * 0.03
        box((0.28, -0.1, z), (0.86, 0.52, 0.01), "paper", bev=0.005, rot=(0, 0, R(-3)))
        box((0.2, -0.04, z + 0.008), (0.36, 0.26, 0.01), "grass_dark", bev=0.005, rot=(0, 0, R(-3)))
        for j in range(3):
            box((0.5, -0.1 + 0.04 - j * 0.07 + 0.0, z + 0.008), (0.32, 0.018, 0.008), "brown", bev=0.003, rot=(0, 0, R(-3)))


# ---------- bowl ----------

def bowl(bones=True):
    cyl((0, 0, 0.11), 0.78, 0.22, "blue", bev=0.07)
    cyl((0, 0, 0.35), 1.0, 0.3, "blue", bev=0.09)
    torus((0, 0, 0.5), 0.94, 0.07, "blue")
    cyl((0, 0, 0.47), 0.92, 0.05, "bowl_in", bev=0.01)
    if bones:
        bone((-0.1, -0.2, 0.62), 0.62, 0.075, "bone2", rot=(0, 0, R(-18)))
        bone((0.2, 0.2, 0.62), 0.55, 0.07, "bone2", rot=(0, 0, R(24)))
        bone((0.3, -0.25, 0.7), 0.5, 0.065, "bone2", rot=(0, 0, R(8)))


# ---------- signs (straight-on, pixel-exact; capInsets in README) ----------

SIGN_M, SIGN_T, SIGN_E, SIGN_D = 4, 12, 6, 0.32   # outer margin, rim width, dark bottom edge, thickness (px / units)


def sign(W, H):
    standard()
    lit(EM, "sign_face", "sign_rim", "sign_edge", diffuse=DF)
    u = lambda px: px / 100.0
    X = lambda px: (px - W / 2) / 100.0
    m, t, e = SIGN_M, SIGN_T, SIGN_E
    cw = W - 2 * m
    box((0, 0, u(m + (H - 2 * m) / 2)), (u(cw), SIGN_D, u(H - 2 * m)), "sign_edge", bev=0.145)
    box((0, 0, u(m + e + (H - 2 * m - e) / 2)), (u(cw), SIGN_D, u(H - 2 * m - e)), "sign_rim", bev=0.145)
    fh = H - 2 * m - e - 2 * t
    box((0, -0.03, u(m + e + t + fh / 2)), (u(cw - 2 * t), SIGN_D, u(fh)), "sign_face", bev=0.03)
    manual_cam(W / 100.0, (0, 0, H / 200.0))


# ---------- mat, pennant, postcard ----------

def doormat():
    standard()
    lit(0.55, "mat", "mat_dark", diffuse=0.6)
    box((0, 0, 0.06), (2.4, 1.4, 0.12), "mat", bev=0.05)
    for i in range(13):                                    # woven ridges
        box((0, -0.62 + i * 0.1033, 0.135), (2.2, 0.05, 0.05), "mat" if i % 2 else "mat_dark", bev=0.02)
    for sy in (-1, 1):                                     # border
        box((0, sy * 0.62, 0.15), (2.28, 0.07, 0.06), "mat_dark", bev=0.025)
    for sx in (-1, 1):
        box((sx * 1.1, 0, 0.15), (0.07, 1.27, 0.06), "mat_dark", bev=0.025)


def pennant():
    standard()
    lit(EM, "yellow", "wood_dark", diffuse=DF)
    cyl((0, 0, 0.9), 0.045, 1.8, "wood_dark", bev=0.015, verts=16)
    sph((0, 0, 1.82), 0.08, "warm")
    me = bpy.data.meshes.new("flag")
    bm = bmesh.new()
    t = 0.035
    pts = [(0.03, 0.9), (0.03, 1.55), (0.95, 1.3)]
    vs = [[bm.verts.new((x, s * t, z)) for x, z in pts] for s in (-1, 1)]
    bm.faces.new(vs[0][::-1]); bm.faces.new(vs[1])
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new([vs[0][i], vs[0][j], vs[1][j], vs[1][i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("flag", me)
    bpy.context.scene.collection.objects.link(o)
    common._finish(o, "yellow", 0.015)


def postcard_blank():
    standard()
    lit(EM, "paper", "#EAE5D2", "#F7F3E6", diffuse=DF)
    box((0, 0, 0), (3.2, 0.03, 2.0), "paper", bev=0.012)
    box((0, -0.018, 0.2), (2.72, 0.01, 1.44), "#EAE5D2", bev=0.004)
    box((0, -0.026, 0.2), (2.6, 0.01, 1.32), "#F7F3E6", bev=0.004)


# ---------- flat textures (256 px, opaque, tile exactly) ----------

TEX = 256


def _hex(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def _dots(radius, cell=16):
    y, x = np.mgrid[0:TEX, 0:TEX].astype(np.float32)
    a = np.zeros((TEX, TEX), np.float32)
    for (cx, cy) in ((cell * 0.25, cell * 0.25), (cell * 0.75, cell * 0.75)):
        dx = (x % cell) - cx
        dy = (y % cell) - cy
        d = np.sqrt(dx * dx + dy * dy)
        a = np.maximum(a, np.clip(radius + 0.5 - d, 0, 1))
    return a


def _finish_tex(img, seed, grain=0.012):
    rng = np.random.RandomState(seed)
    img = img + rng.uniform(-grain, grain, (TEX, TEX, 1)).astype(np.float32)
    return np.clip(img, 0, 1)


def tex_patch(base, dot, seed):
    a = _dots(2.4)[..., None]
    return _finish_tex(_hex(base) * (1 - a) + _hex(dot) * a, seed)


def tex_wild():
    img = np.tile(_hex("#DCE8BE"), (TEX, TEX, 1))
    rng = np.random.RandomState(7)
    col = _hex("#C6D6A0")
    yy, xx = np.mgrid[0:TEX, 0:TEX]
    cov = np.zeros((TEX, TEX), np.float32)
    for _ in range(26):
        bx, by = rng.uniform(0, TEX), rng.uniform(0, TEX)
        for k in range(3):
            lean = rng.uniform(-0.35, 0.35)
            hgt = rng.uniform(9, 16)
            for s in np.linspace(0, 1, 40):
                px = bx + (k - 1) * 4 + lean * hgt * s * s * 2 + (k - 1) * s * 2
                py = by + hgt * s
                r = 1.5 * (1 - s) + 0.35
                dx = np.minimum(np.abs(xx - px), TEX - np.abs(xx - px))
                dy = np.minimum(np.abs(yy - py), TEX - np.abs(yy - py))
                cov = np.maximum(cov, np.clip(r + 0.5 - np.sqrt(dx * dx + dy * dy), 0, 1))
    img = img * (1 - cov[..., None]) + col * cov[..., None]
    return _finish_tex(img, 8)


def tex_linen():
    y, x = np.mgrid[0:TEX, 0:TEX]
    cx, cy = x // 4, y // 4
    vert = ((cx + cy) % 2) == 0
    fx, fy = (x % 4).astype(np.float32), (y % 4).astype(np.float32)
    thread = np.where(vert, np.abs(fx - 1.5), np.abs(fy - 1.5)) / 1.5     # 0 centre .. 1 edge
    shade = (thread * 0.5 - 0.25)[..., None]
    base = _hex("#EFE7D6")
    dark = _hex("#DDD1B8")
    img = base + (dark - base) * np.clip(shade * 2 + 0.3, 0, 1) * 0.9
    return _finish_tex(img.astype(np.float32), 9, 0.008)


def write_texture(name, arr, out_dir):
    im = bpy.data.images.new(name, TEX, TEX, alpha=True)
    im.colorspace_settings.name = "Non-Color"   # raw sRGB values, like contact_sheet.py
    im.alpha_mode = "STRAIGHT"
    rgba = np.ones((TEX, TEX, 4), np.float32)
    rgba[..., :3] = arr
    im.pixels = rgba.ravel()
    im.filepath_raw = f"{out_dir}/{name}.png"
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)


TEXTURES = {
    "patch-usual": lambda: tex_patch("#9FD79A", "#8CCB88", 1),
    "patch-fresh": lambda: tex_patch("#4FBF6B", "#45B261", 2),
    "patch-wild": tex_wild,
    "linen": tex_linen,
}

# ---------- registry ----------
FENCE = (80, 0)
PROPCAM = (62, 12)
ASSETS = {
    "fence-segment": (fence_segment, 512, 256, FENCE, None, False),
    "fence-post-end": (fence_post_end, 128, 256, FENCE, None, False),
    "gate-closed": (lambda: gate(0), 512, 512, FENCE, None, False),
    "gate-open": (lambda: gate(46), 512, 512, FENCE, None, False),
    "bench": (lambda: bench(True), 512, 512, (66, 12), 0.92, False),
    "bench-empty": (lambda: bench(False), 512, 512, (66, 12), 0.92, False),
    "bowl": (lambda: bowl(True), 256, 256, (58, 22), 0.9, False),
    "bowl-empty": (lambda: bowl(False), 256, 256, (58, 22), 0.9, False),
    "sign-small": (lambda: sign(256, 128), 256, 128, (90, 0), None, False),
    "sign-medium": (lambda: sign(512, 192), 512, 192, (90, 0), None, False),
    "sign-wide": (lambda: sign(768, 224), 768, 224, (90, 0), None, False),
    "doormat": (doormat, 512, 256, (60, 0), 0.94, False),
    "pennant": (pennant, 128, 256, (80, 8), 0.92, False),
    "postcard-blank": (postcard_blank, 512, 320, (90, 0), 0.97, False),
}
assets.ASSETS.update(ASSETS)
assets.TEXTURES = TEXTURES
