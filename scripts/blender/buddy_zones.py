"""Fur-zone Buddy layers (free colours). For every Buddy unit (body, head, ears, ...) render
  * `<unit>-mask-<zone>.png`  flat white + alpha, one per fur zone (the app tints it with Image tintColor),
  * `<unit>-shade.png`        neutral shading as black/white with alpha (stacked over the tinted masks),
  * `<unit>-detail.png`       untinted real-colour details (nose, mouth line, eyelid) for head units.
Masks and shade share the canvas, camera and pivots of the layered Buddy (buddy.frame), at ZSIZE px (LA / RGBA PNG written
here, no PIL). Writes assets/buddy/zones/ and a `zones` block in manifest.json (consumed by scripts/genBuddyZoneSources.mjs).
Usage: Blender -b --python scripts/blender/render_buddy.py -- --zones [--fast] [--only head,body] [--out dir]
       ... -- --zones-sheet /path/sheet.png      (contact sheet of 4 sample dogs, idle pose, no re-render)"""
import json
import os
import struct
import zlib

import bpy
import numpy as np

import buddy
import common

ZSIZE = 384
ZONES = ("head", "muzzle", "eyepatch", "ears", "back", "belly", "chest", "legs", "paws", "tail")
SHADE_GREY = "#8A8A8A"
DARK_K, LIGHT_K = 1.0, 0.75     # strength of the black / white shade overlay

UNITS = []


def unit(name, base, subs=(), detail=False, parts=None):
    UNITS.append({"name": name, "parts": parts or [name], "base": base, "subs": list(subs), "detail": detail})


unit("body", "back", ("chest", "legs", "paws", "belly"))
unit("front-legs", "legs", ("paws",))
for _st in ("a", "b"):
    unit(f"front-legs-walk-{_st}", "legs", ("paws",))
for _sfx in ("", "-short", "-long"):
    unit(f"head{_sfx}", "head", ("muzzle", "eyepatch"), detail=True)
for _side in ("left", "right"):
    for _st in buddy.EARS:
        unit(f"ear-{_side}-{_st}", "ears")
for _st in buddy.TAILS:
    unit(f"tail-{_st}", "tail")
    unit(f"tail-{_st}-fluffy", "tail", parts=[f"tail-{_st}", f"tail-{_st}-fluffy"])
for _lvl in ("medium", "fluffy"):
    unit(f"fluff-{_lvl}", "chest")
unit("pose-lying", "back", ("head", "muzzle", "eyepatch", "ears", "chest", "legs", "paws", "tail"), detail=True)

_MATS = {}


def mat(name):
    if name in _MATS:
        return _MATS[name]
    if name == "grey":
        m = common.clay(SHADE_GREY, 0.6, 0.1)
    else:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        node = nt.nodes.new("ShaderNodeEmission" if name == "emit" else "ShaderNodeHoldout")
        if name == "emit":
            node.inputs["Color"].default_value = (1, 1, 1, 1)
            node.inputs["Strength"].default_value = 1.0
        nt.links.new(node.outputs[0], out.inputs["Surface"])
    _MATS[name] = m
    return m


def kind(o):
    """'shell' (zone-only overlay), 'detail' (untinted), 'body' (tinted/shaded) or None (not in any zone)."""
    if o["only"] == "__zone":
        return "shell"
    if o["only"] or not o["zone"]:
        return None
    return "detail" if o["zone"] == "detail" else "body"


def render_objs(part, plan):
    """plan: {object: material name or None (keep)}. Everything else hidden. Returns after rendering via caller."""
    keep = []
    for o in buddy.OBJS:
        o.hide_render = True
    for o, mname in plan.items():
        o.hide_render = False
        slot = o.material_slots[0]
        keep.append((slot, slot.link, slot.material))
        if mname:
            slot.link = "OBJECT"
            slot.material = mat(mname)
            o.visible_shadow = mname != "hold"
    return keep


def restore(keep, plan):
    for slot, link, m in keep:
        slot.link = link
        slot.material = m
    for o in plan:
        o.visible_shadow = True


def shoot(path, plan, standard, samples):
    sc = bpy.context.scene
    sc["view_transform"], sc["exposure"] = ("Standard", 0.0) if standard else ("AgX", 0.4)
    keep = render_objs(None, plan)
    common.render(path, ZSIZE, ZSIZE, samples)
    restore(keep, plan)


def read(path):
    im = bpy.data.images.load(path)
    im.colorspace_settings.name = "Non-Color"
    im.alpha_mode = "STRAIGHT"
    w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]   # top row first
    bpy.data.images.remove(im)
    return px


def write_png(path, arr):
    """arr: uint8 (h, w, C) with C = 2 (gray+alpha) or 4 (RGBA), straight alpha."""
    h, w, c = arr.shape
    arr = arr.copy()
    arr[arr[..., -1] == 0] = 0
    raw = np.concatenate([np.zeros((h, 1), np.uint8), arr.reshape(h, w * c)], axis=1).tobytes()

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 4 if c == 2 else 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def lum(px):
    return 0.2126 * px[..., 0] + 0.7152 * px[..., 1] + 0.0722 * px[..., 2]


def shade_overlay(px, ref):
    """Rendered grey clay -> black/white overlay with alpha; pixels at the reference level stay transparent."""
    a = px[..., 3]
    d = lum(px) - ref
    dark = np.clip(-d / ref * DARK_K, 0, 1)
    light = np.clip(d / (1 - ref) * LIGHT_K, 0, 1)
    ov_a = np.where(d < 0, dark, light) * a
    g = np.where(d < 0, 0, 255).astype(np.uint8)
    return np.stack([g, np.round(ov_a * 255).astype(np.uint8)], -1)


def mask_la(px):
    a = np.round(px[..., 3] * 255).astype(np.uint8)
    return np.stack([np.full_like(a, 255), a], -1)


SOFT_SIGMA = {"eyepatch": 3.0, "muzzle": 2.5, "belly": 5.0, "chest": 2.0}   # px at ZSIZE; legs/paws/ears keep crisp edges


def blur(a, sigma):
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(v, k, mode="same"), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="same"), 1, a)


def soften(alpha, base_alpha, sigma):
    """Soft rounded edge inside the silhouette: normalised blur, so the outline keeps full coverage (no halo)."""
    num, den = blur(alpha * base_alpha, sigma), blur(base_alpha, sigma)
    return np.clip(num / np.maximum(den, 1e-4), 0, 1) * base_alpha


def run_unit(u, zdir, tmp, samples, ref):
    objs = [o for o in buddy.OBJS if o["part"] in u["parts"]]
    bodies = [o for o in objs if kind(o) == "body"]
    shells = [o for o in objs if kind(o) == "shell"]
    details = [o for o in objs if kind(o) == "detail"]
    rec = {"base": u["base"], "masks": {}, "shade": None, "detail": None}
    name = u["name"]

    base_alpha = []

    def save_mask(zone, plan):
        shoot(tmp, plan, True, samples)
        px = read(tmp)
        if px[..., 3].max() < 0.02:
            return
        if zone == u["base"]:
            base_alpha.append(px[..., 3].copy())
        elif zone in SOFT_SIGMA:
            px[..., 3] = soften(px[..., 3], base_alpha[0], SOFT_SIGMA[zone])
        rel = f"zones/{name}-mask-{zone}.png"
        write_png(os.path.join(zdir, f"{name}-mask-{zone}.png"), mask_la(px))
        rec["masks"][zone] = rel

    save_mask(u["base"], {o: "emit" for o in bodies})
    for zone in u["subs"]:
        sel = [o for o in bodies if o["zone"] == zone]
        sh = [o for o in shells if o["zone"] == zone]
        if not sel and not sh:
            continue
        plan = {o: "hold" for o in bodies}
        plan.update({o: "emit" for o in sel + sh})
        save_mask(zone, plan)
    if ref is None:
        return rec
    shoot(tmp, {o: "grey" for o in bodies}, False, samples)
    write_png(os.path.join(zdir, f"{name}-shade.png"), shade_overlay(read(tmp), ref))
    rec["shade"] = f"zones/{name}-shade.png"
    if u["detail"] and details:
        plan = {o: "hold" for o in bodies}
        plan.update({o: None for o in details})
        shoot(tmp, plan, False, samples)
        px = read(tmp)
        write_png(os.path.join(zdir, f"{name}-detail.png"), np.round(px * 255).astype(np.uint8))
        rec["detail"] = f"zones/{name}-detail.png"
    return rec


def calibrate(tmp, samples):
    """Reference luminance = 70th percentile of the lit grey body, so most of the lit fur stays at the tint colour."""
    bodies = [o for o in buddy.OBJS if o["part"] == "body" and kind(o) == "body"]
    shoot(tmp, {o: "grey" for o in bodies}, False, samples)
    px = read(tmp)
    return float(np.percentile(lum(px)[px[..., 3] > 0.99], 70))


def main(argv):
    import time
    arg = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    out = arg("--out", os.path.join(root, "assets", "buddy"))
    if "--zones-sheet" in argv:
        return sheet(arg("--zones-sheet"), out)
    only = arg("--only")
    only = only.split(",") if only else None
    samples = 8 if "--fast" in argv else 24
    zdir = os.path.join(out, "zones")
    os.makedirs(zdir, exist_ok=True)
    tmp = os.path.join(out, "zones", "_tmp.png")
    t0 = time.time()
    common.setup_scene(*buddy.CAM)
    buddy.build()
    buddy.build_extras()
    sc, cam, wcv = buddy.frame(512, 512)      # same framing as the legacy layers
    ground = 1 - wcv(sc, cam, buddy.YAW @ buddy.Vector((0, 0, 0))).y
    print("framing groundY", round(ground, 4), "head pivot", buddy.pivot(wcv, sc, cam, buddy.NECK))
    buddy.set_coat("golden")
    ref = calibrate(tmp, samples)
    print("shade reference luminance", round(ref, 3))
    mp = os.path.join(out, "manifest.json")
    man = json.load(open(mp)) if os.path.exists(mp) else {"files": []}
    zones = man.get("zones", {}).get("units", {})
    for u in UNITS:
        if only and not any(u["name"] == n or u["name"].startswith(n) for n in only):
            continue
        zones[u["name"]] = run_unit(u, zdir, tmp, samples, ref)
        print(f"[zones] {u['name']} {time.time() - t0:.0f}s", flush=True)
    # mouth-happy for the other muzzle lengths (untinted, 512 like the other common layers)
    new_files = []
    if not only or "mouth" in only:
        for sfx in buddy.MUZZLES:
            rel = f"common/mouth-happy-{sfx}.png"
            keep_plan = {o: None for o in buddy.OBJS if o["part"] == f"mouth-happy-{sfx}"}
            sc["view_transform"], sc["exposure"] = "AgX", 0.4
            keep = render_objs(None, keep_plan)
            common.render(os.path.join(out, rel), 512, 512, samples * 2)
            restore(keep, keep_plan)
            new_files.append({"file": rel, "part": "mouthHappy", "coat": None, "style": sfx})
    if os.path.exists(tmp):
        os.remove(tmp)
    names = {e["file"] for e in new_files}
    man["files"] = [e for e in man.get("files", []) if e["file"] not in names] + new_files
    man["zones"] = {"size": ZSIZE, "zoneNames": list(ZONES), "units": zones}
    with open(mp, "w") as f:
        json.dump(man, f, indent=2)
    print(f"[zones] total {time.time() - t0:.0f}s")


# ---------- review contact sheet (mirrors the app's stacking: tinted masks, shade, detail, common layers) ----------

SAMPLE_DOGS = [  # name, zones, muzzle, furLength  (hexes are already inside the clay pastel range)
    ("border collie", dict(head="#4A423E", muzzle="#F7F2EA", eyepatch="#4A423E", ears="#4A423E", back="#4A423E", belly="#F7F2EA",
                           chest="#F7F2EA", legs="#4A423E", paws="#F7F2EA", tail="#4A423E"), "medium", "medium"),
    ("tan, dark mask", dict(head="#D8B07A", muzzle="#8A6240", eyepatch="#6B4429", ears="#6B4429", back="#D8B07A", belly="#E8D2A8",
                             chest="#E8D2A8", legs="#D8B07A", paws="#D8B07A", tail="#D8B07A"), "long", "short"),
    ("white fluffy", dict(head="#F7F2EA", muzzle="#F7F2EA", eyepatch="#F7F2EA", ears="#EBDDC4", back="#F7F2EA", belly="#F7F2EA",
                          chest="#F7F2EA", legs="#F7F2EA", paws="#F7F2EA", tail="#F7F2EA"), "short", "fluffy"),
    ("black and tan", dict(head="#4A423E", muzzle="#C98B4F", eyepatch="#C98B4F", ears="#4A423E", back="#4A423E", belly="#C98B4F",
                           chest="#C98B4F", legs="#C98B4F", paws="#C98B4F", tail="#4A423E"), "medium", "short"),
    ("brindle-ish", dict(head="#9A6B43", muzzle="#6B4429", eyepatch="#9A6B43", ears="#6B4429", back="#7A5233", belly="#C9A57A",
                         chest="#E8D2A8", legs="#9A6B43", paws="#E8D2A8", tail="#6B4429"), "medium", "short"),
]


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def load_scaled(path, size):
    im = bpy.data.images.load(path)
    im.colorspace_settings.name = "Non-Color"
    im.alpha_mode = "STRAIGHT"
    im.scale(size, size)
    px = np.array(im.pixels[:], dtype=np.float32).reshape(size, size, 4)
    bpy.data.images.remove(im)
    return px


def over(acc, rgb, a):
    acc[..., :3] = rgb * a[..., None] + acc[..., :3] * (1 - a[..., None])
    acc[..., 3:4] = a[..., None] + acc[..., 3:4] * (1 - a[..., None])


def stack_unit(acc, root, man, name, zones, size):
    u = man["zones"]["units"][name]
    base_col = zones[u["base"]]
    for zone, rel in u["masks"].items():
        if zone != u["base"] and zones[zone].lower() == base_col.lower():
            continue
        px = load_scaled(os.path.join(root, rel), size)
        over(acc, hex_rgb(zones[zone]), px[..., 3])
    if u["shade"]:
        px = load_scaled(os.path.join(root, u["shade"]), size)
        over(acc, px[..., :3], px[..., 3])
    if u["detail"]:
        px = load_scaled(os.path.join(root, u["detail"]), size)
        over(acc, px[..., :3], px[..., 3])


def sheet(path, root, size=512):
    man = json.load(open(os.path.join(root, "manifest.json")))
    tiles = []
    for _, zones, muzzle, fur in SAMPLE_DOGS:
        acc = np.zeros((size, size, 4), np.float32)
        head = "head" if muzzle == "medium" else f"head-{muzzle}"
        order = ["tail-curly-fluffy" if fur == "fluffy" else "tail-curly", "ear-right-floppy", "body", "front-legs"]
        if fur != "short":
            order.append(f"fluff-{'medium' if fur == 'medium' else 'fluffy'}")
        order.append(head)
        for n in order:
            stack_unit(acc, root, man, n, zones, size)
        for rel in ("common/eyes-open.png",):
            px = load_scaled(os.path.join(root, rel), size)
            over(acc, px[..., :3], px[..., 3])
        stack_unit(acc, root, man, "ear-left-floppy", zones, size)
        tiles.append(acc)
    cols = len(tiles)
    W, H = cols * size, size
    yy, xx = np.mgrid[0:H, 0:W]
    sheet_px = np.ones((H, W, 4), np.float32)
    sheet_px[..., :3] = np.array([0.96, 0.95, 0.88], np.float32)
    for i, t in enumerate(tiles):
        reg = sheet_px[:, i * size:(i + 1) * size]
        a = t[..., 3:4]
        reg[..., :3] = t[..., :3] * a + reg[..., :3] * (1 - a)
    im = bpy.data.images.new("sheet", W, H, alpha=True)
    im.colorspace_settings.name = "Non-Color"
    im.alpha_mode = "STRAIGHT"
    im.pixels = sheet_px.ravel()
    im.filepath_raw, im.file_format = path, "PNG"
    im.save()
    print("sheet written", path)
