"""Shared scene setup for the Dog Territory Defender pre-rendered sprites (Blender 5.x, EEVEE)."""
import math
import bmesh
import bpy
from mathutils import Vector

# Pastel palette derived from the visual-design Design Tokens (green, meadow, sky, warm, brown, cream).
HEX = {
    "grass": "#7FD67F", "grass_dark": "#4FBF6B", "meadow": "#DCE8BE", "sky": "#8CCBF2",
    "warm": "#F7B84B", "brown": "#B08D5E", "brown_dark": "#7A5C3A", "cream": "#FAF6EA",
    "coral": "#F2786E", "pink": "#F8A9C4", "lav": "#B9A8EA", "yellow": "#FFDA6A",
    "white": "#FFFFFF", "dark": "#4A3A2C", "blue": "#5DADE8", "mint": "#9BE3C0",
}


def lin(hexstr):
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


_mats = {}


def clay(color, roughness=0.6, subsurface=0.1):
    """Soft clay Principled BSDF with a faint fingerprint bump. color: palette key or hex."""
    key = (color, roughness, subsurface)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(f"clay_{color}")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = lin(HEX.get(color, color))
    bsdf.inputs["Roughness"].default_value = roughness
    for name, val in (("Subsurface Weight", subsurface), ("Subsurface Scale", 0.05)):
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = val
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 90
    noise.inputs["Detail"].default_value = 3
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06
    bump.inputs["Distance"].default_value = 0.02
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    _mats[key] = m
    return m


def bevel(obj, width=0.04, segments=3):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    return obj


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()


def setup_camera(rx=62, rz=30, dist=30):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.clip_start, cam_data.clip_end = 0.1, 200
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(rx), 0, math.radians(rz))
    cam.location = cam.rotation_euler.to_matrix() @ Vector((0, 0, dist))
    bpy.context.scene.camera = cam
    return cam


def _area(name, loc, color, energy, size, target=(0, 0, 0.5)):
    d = bpy.data.lights.new(name, "AREA")
    d.color, d.energy, d.size = color, energy, size
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    direction = Vector(target) - Vector(loc)
    o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return o


def setup_lights():
    """Three-point soft light: warm key, cool fill, rim, plus soft world ambient."""
    _area("key", (6, -7, 9), (1.0, 0.93, 0.82), 900, 7)
    _area("fill", (-8, -4, 5), (0.82, 0.9, 1.0), 380, 8)
    _area("rim", (-3, 8, 7), (1.0, 1.0, 1.0), 450, 5)
    w = bpy.data.worlds.new("world")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = lin("#F4F8FF")
    bg.inputs["Strength"].default_value = 0.5
    bpy.context.scene.world = w


def setup_scene(rx=62, rz=30):
    reset()
    setup_camera(rx, rz)
    setup_lights()
    bpy.context.scene.render.engine = "BLENDER_EEVEE"


def fit(fill=0.82, w=1024, h=1024, extra=()):
    """Centre all meshes in frame and set ortho scale so the subject fills `fill` of the larger side."""
    sc = bpy.context.scene
    cam = sc.camera
    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for o in sc.objects:
        if o.type != "MESH" or o.get("nofit"):
            continue
        mw = inv @ o.matrix_world
        for vert in o.data.vertices:
            v = mw @ vert.co
            xs.append(v.x)
            ys.append(v.y)
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    ew, eh = max(xs) - min(xs), max(ys) - min(ys)
    if w >= h:
        scale = max(ew / fill, eh / fill * w / h)
    else:
        scale = max(ew / fill * h / w, eh / fill)
    cam.data.ortho_scale = scale
    cam.location += cam.matrix_world.to_3x3() @ Vector((cx, cy, 0))


def render(path, w=1024, h=1024, samples=32, transparent=True):
    sc = bpy.context.scene
    r = sc.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
    r.film_transparent = transparent
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    sc.eevee.taa_render_samples = samples
    sc.eevee.use_raytracing = True
    sc.eevee.use_fast_gi = True
    sc.view_settings.view_transform = sc.get("view_transform", "AgX")  # AgX is the 5.x default; keeps pastels from clipping
    sc.view_settings.exposure = sc.get("exposure", 0.4)  # flat sign/paper assets set Standard + 0 to hit exact design colours
    r.filepath = path
    bpy.ops.render.render(write_still=True)


# ---- primitive helpers (scale applied so bevels are absolute) ----

def _finish(o, mat, bev, seg=3):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.select_set(False)
    o.data.materials.append(clay(mat) if isinstance(mat, str) else mat)
    if bev:
        bevel(o, bev, seg)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier="bevel")
    o.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    o.select_set(False)
    return o


def box(loc, size, mat, bev=0.04, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return _finish(o, mat, min(bev, min(size) / 2.2))


def cyl(loc, r, h, mat, bev=0.03, rot=(0, 0, 0), verts=48):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    return _finish(bpy.context.active_object, mat, min(bev, r * 0.9, h / 2.2))


def sph(loc, r, mat, scale=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, rotation=rot, segments=40, ring_count=20)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o, mat, 0)


def cone(loc, r, h, mat, rot=(0, 0, 0), bev=0.03):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0, depth=h, location=loc, rotation=rot, vertices=48)
    return _finish(bpy.context.active_object, mat, bev)


def torus(loc, major, minor, mat, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot,
                                     major_segments=64, minor_segments=24)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o, mat, 0)


def prism(loc, w, d, h, mat, bev=0.03):
    """Triangular prism: base width w (X), depth d (Y), apex height h (Z)."""
    me = bpy.data.meshes.new("prism")
    bm = bmesh.new()
    pts = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (0, -d / 2, h), (-w / 2, d / 2, 0), (w / 2, d / 2, 0), (0, d / 2, h)]
    v = [bm.verts.new(p) for p in pts]
    for f in ([0, 1, 2], [5, 4, 3], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]):
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("prism", me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    return _finish(o, mat, bev)
