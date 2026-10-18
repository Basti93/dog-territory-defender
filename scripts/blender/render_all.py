"""Render all sprites. Usage: Blender -b --python render_all.py -- [--only name ...] [--fast] [--out dir]"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import common
import assets
import contact_sheet


# Output px per asset (on-screen use, keeps decoded memory low); anything else uses the registry size.
SIZES = {"celebration-burst": (768, 768), "doorstep-sky": (1024, 1024), "yard-ground": (1536, 1024), "yard-ground-wide": (2048, 1024)}


def out_size(name, w, h):
    if name.startswith("icon-"):
        return 256, 256
    if name.startswith("prop-"):
        return 256, 256
    if name.startswith(("doghouse-", "bakery-", "garden-")):
        return 512, 512
    return SIZES.get(name, (w, h))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    fast = "--fast" in argv
    only = [argv[i + 1] for i, a in enumerate(argv) if a == "--only"]
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    out = os.path.join(root, "assets", "art")
    if "--out" in argv:
        out = argv[argv.index("--out") + 1]
    os.makedirs(out, exist_ok=True)
    if "--sheet-only" in argv:
        contact_sheet.make(out, list(assets.ASSETS), os.path.join(out, "_contact-sheet.png"))
        return
    for name, (fn, w, h, cam, fill, opaque) in assets.ASSETS.items():
        if only and not any(name == o or name.startswith(o) for o in only):
            continue
        t = time.time()
        w, h = out_size(name, w, h)
        if fast:
            w, h = w // 2, h // 2
        common.setup_scene(*cam)
        fn()
        if fill:
            common.fit(fill, w, h)
        elif not bpy.context.scene.get("manual"):
            bpy.context.scene.camera.data.ortho_scale = 8
        common.render(os.path.join(out, name + ".png"), w, h, samples=16 if fast else 64, transparent=not opaque)
        print(f"[art] {name} {time.time() - t:.1f}s")
    if not only:
        contact_sheet.make(out, list(assets.ASSETS), os.path.join(out, "_contact-sheet.png"))


main()
