"""Tile PNGs into one review image on a checkerboard (Blender image API + numpy, no PIL)."""
import os
import bpy
import numpy as np


def _load(path, t):
    im = bpy.data.images.load(path)
    im.colorspace_settings.name = "Non-Color"  # keep raw sRGB values
    im.alpha_mode = "STRAIGHT"
    w, h = im.size
    k = t / max(w, h)
    im.scale(max(1, round(w * k)), max(1, round(h * k)))
    w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    return px


def make(src_dir, names, out_path, tile=256, cols=5):
    rows = (len(names) + cols - 1) // cols
    W, H = cols * tile, rows * tile
    yy, xx = np.mgrid[0:H, 0:W]
    chk = (((xx // 16) + (yy // 16)) % 2).astype(np.float32)
    sheet = np.ones((H, W, 4), np.float32)
    sheet[..., :3] = (0.86 + 0.08 * chk)[..., None]
    for i, n in enumerate(names):
        px = _load(os.path.join(src_dir, n + ".png"), tile)
        h, w = px.shape[:2]
        r, c = i // cols, i % cols
        y0 = (rows - 1 - r) * tile + (tile - h) // 2  # image rows run bottom-up
        x0 = c * tile + (tile - w) // 2
        reg = sheet[y0:y0 + h, x0:x0 + w]
        a = px[..., 3:4]
        reg[..., :3] = px[..., :3] * a + reg[..., :3] * (1 - a)
    out = bpy.data.images.new("sheet", W, H, alpha=True)
    out.colorspace_settings.name = "Non-Color"
    out.alpha_mode = "STRAIGHT"
    out.pixels = sheet.ravel()
    out.filepath_raw = out_path
    out.file_format = "PNG"
    out.save()
