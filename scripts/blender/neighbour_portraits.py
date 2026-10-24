"""Neighbour-dog portraits: one transparent clay cut-out per bot dog and pose (sit, trot), 384 px, into assets/art/
as `dog-<dog>-<pose>.png`. Uses the Buddy rig (buddy.py) with the legacy coat/marking/ear/tail/size look of each archetype.
Usage: Blender -b --python scripts/blender/neighbour_portraits.py -- [--fast] [--out dir] [--only momo,keks] [--sheet path]
Deterministic. LOOKS mirrors server/src/neighbours/archetypes.ts (keep in sync by hand, like buddy.COATS)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np

import buddy
import buddy_zones
import common

OUT_PX = 384
RENDER_PX = 768
K = 0.5            # render px -> output px; medium dog is ~315 px wide in the 384 canvas
SIZE_K = {"small": 0.86, "medium": 1.0, "large": 1.1}
ACCENTS = {"cream": "#FBEFD5", "white": "#FFFDF7", "tan": "#E8C99A"}   # BUDDY_PALETTE.accents
LOOKS = {
    "momo": dict(coat="cream", markings="none", ear="floppy", tail="curly", size="medium", accent="cream"),
    "pfote": dict(coat="golden", markings="none", ear="floppy", tail="straight", size="large", accent="tan"),
    "bruno": dict(coat="ginger", markings="none", ear="folded", tail="stubby", size="large", accent="cream"),
    "keks": dict(coat="white", markings="patch", ear="pointy", tail="straight", size="small", accent="white"),
    "lotte": dict(coat="chocolate", markings="none", ear="floppy", tail="straight", size="small", accent="tan"),
    "nebel": dict(coat="grey", markings="mask", ear="pointy", tail="curly", size="medium", accent="white"),
}
POSES = ("sit", "trot")


def render_px(parts, coat, tmp):
    buddy.show(parts, coat)
    common.render(tmp, RENDER_PX, RENDER_PX, SAMPLES)
    return buddy_zones.read(tmp)


def over(under, top):
    a = top[..., 3:4]
    out = under.copy()
    out[..., :3] = top[..., :3] * a + under[..., :3] * (1 - a)
    out[..., 3:4] = a + under[..., 3:4] * (1 - a)
    return out


def dog_pixels(look, pose, tmp):
    coat = look["coat"]
    buddy.set_coat(coat)
    buddy.set_color("accent", ACCENTS[look["accent"]])
    legs = "front-legs" if pose == "sit" else "front-legs-walk-a"
    mouth = [] if pose == "sit" else ["mouth-happy"]
    head = ["body", legs, "head", f"tail-{look['tail']}", f"ear-right-{look['ear']}"]
    top = mouth + ["eyes-open", f"ear-left-{look['ear']}"]
    if look["markings"] == "none":
        return render_px(head + top, coat, tmp)
    # Markings sit between the head and the eyes/near ear, exactly like the layered Buddy in the app.
    base = render_px(head, coat, tmp)
    buddy.set_color("mark", buddy.mark_colour(coat, look["markings"]))
    buddy.show([f"markings-{look['markings']}", "body", "head", "front-legs"], coat)
    buddy.holdout(True)
    common.render(tmp, RENDER_PX, RENDER_PX, SAMPLES)
    buddy.holdout(False)
    marks = buddy_zones.read(tmp)
    return over(over(base, marks), render_px(top, coat, tmp))


def resize(px, w, h):
    im = bpy.data.images.new("rs", px.shape[1], px.shape[0], alpha=True)
    im.colorspace_settings.name = "Non-Color"
    im.alpha_mode = "STRAIGHT"
    im.pixels = px[::-1].ravel()      # read() returns top row first, Blender wants bottom-up
    im.scale(w, h)
    out = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(im)
    return out


def to_canvas(px, size_k):
    """Tight crop, scale by K * size, stand it bottom-centre on the OUT_PX canvas (feet on the same line for every dog)."""
    ys, xs = np.where(px[..., 3] > 0.02)
    crop = px[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    s = K * size_k
    w, h = max(1, round(crop.shape[1] * s)), max(1, round(crop.shape[0] * s))
    small = resize(crop, w, h)
    canvas = np.zeros((OUT_PX, OUT_PX, 4), np.float32)
    x0, y0 = (OUT_PX - w) // 2, OUT_PX - 8 - h
    canvas[y0:y0 + h, x0:x0 + w] = small
    return canvas


def main(argv):
    global SAMPLES
    arg = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    out = arg("--out", os.path.join(root, "assets", "art"))
    only = arg("--only")
    dogs = [d for d in LOOKS if not only or d in only.split(",")]
    SAMPLES = 16 if "--fast" in argv else 48
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(out, "_portrait_tmp.png")
    common.setup_scene(*buddy.CAM)
    buddy.build()
    buddy.build_extras()
    buddy.frame(RENDER_PX, RENDER_PX)
    tiles = []
    for dog in dogs:
        for pose in POSES:
            look = LOOKS[dog]
            canvas = to_canvas(dog_pixels(look, pose, tmp), SIZE_K[look["size"]])
            arr = np.round(np.clip(canvas, 0, 1) * 255).astype(np.uint8)
            buddy_zones.write_png(os.path.join(out, f"dog-{dog}-{pose}.png"), arr)
            tiles.append(canvas)
            print(f"[portrait] {dog}-{pose}", flush=True)
    os.remove(tmp)
    sheet = arg("--sheet")
    if sheet:
        cols = len(POSES) * 3
        rows = (len(tiles) + cols - 1) // cols
        S = np.ones((rows * OUT_PX, cols * OUT_PX, 4), np.float32)
        S[..., :3] = np.array([0.96, 0.95, 0.88], np.float32)
        for i, t in enumerate(tiles):
            r, c = divmod(i, cols)
            reg = S[r * OUT_PX:(r + 1) * OUT_PX, c * OUT_PX:(c + 1) * OUT_PX]
            a = t[..., 3:4]
            reg[..., :3] = t[..., :3] * a + reg[..., :3] * (1 - a)
        im = bpy.data.images.new("sheet", S.shape[1], S.shape[0], alpha=True)
        im.colorspace_settings.name = "Non-Color"
        im.alpha_mode = "STRAIGHT"
        im.pixels = S[::-1].ravel()
        im.filepath_raw, im.file_format = sheet, "PNG"
        im.save()


main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
