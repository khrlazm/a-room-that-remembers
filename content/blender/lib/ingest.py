"""Make an external mesh pipeline-legal.

Everything else here is authored as code, which buys reproducibility and makes
eight eras cost about one room. It is weakest at exactly one thing: objects that
have to read as a specific real thing. A radio built from four boxes reads as a
radio only because the narration says so.

This is the way in for a mesh from anywhere else -- a generator, an asset
library, something modelled by hand. It does not care which. By the time
`finalize()` sees the result it is indistinguishable from a scripted box: one
mesh, our material, our naming, our triangle budget, and its origin where a
physics body needs it.

**Generated assets are committed as source and never fetched at build time.**
Generation is non-deterministic and slow; a build that could produce different
geometry each run would make "rebuild from source" meaningless, which is the
property this whole pipeline is organised around. See content/assets/README.md.
"""

from __future__ import annotations

import os

import bpy

from .blendutil import select_only

Vec3 = tuple[float, float, float]

#: Triangle budgets by role. Conservative against `validate`'s 60,000 ceiling,
#: because chapters currently run 180-480 triangles in total and the single
#: draw call per chapter is worth more than the detail.
TIERS = {
    # Held in a coda and seen from a few centimetres away.
    "hero": {"triangles": 800},
    # Background, merged into the chapter's static mesh, never inspected.
    "dressing": {"triangles": 150},
}


def _triangle_count(obj: bpy.types.Object) -> int:
    mesh = obj.data
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def _import(path: str) -> list[bpy.types.Object]:
    """Import a file and return only what it added."""
    before = set(bpy.data.objects)

    extension = os.path.splitext(path)[1].lower()
    if extension in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif extension == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif extension == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        raise ValueError(f"ingest does not handle {extension!r} files: {path}")

    return [obj for obj in bpy.data.objects if obj not in before]


def ingest(
    path: str,
    name: str,
    collection: bpy.types.Collection,
    *,
    tier: str,
    material: bpy.types.Material,
    at: Vec3,
    rotation: Vec3 = (0.0, 0.0, 0.0),
    longest: float = 0.30,
) -> bpy.types.Object:
    """Bring an external mesh in as a single, budgeted, correctly-pivoted object.

    `longest` is the size the object should end up, in metres, along whichever
    axis is biggest. It is stated by the caller rather than read from the file
    because **an external mesh has no real-world units**: it arrives at whatever
    scale its author or generator felt like. This piece is built to
    centimetre-accurate metric -- a bench at 0.92m, eye height at 1.6m, a grab
    reach of 0.20m -- so a mesh off by 10x is not subtly wrong, it is either
    invisible or filling the room.
    """
    if tier not in TIERS:
        raise ValueError(f"unknown tier {tier!r}; expected one of {sorted(TIERS)}")
    if not os.path.exists(path):
        raise FileNotFoundError(f"ingest source missing: {path}")

    imported = _import(path)
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise ValueError(f"no mesh objects in {path}")

    # Importers add empties as parents -- glTF always does. Drop everything that
    # is not geometry before joining, or the join drags a transform hierarchy in
    # with it.
    for obj in imported:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    # --- One object ---------------------------------------------------------
    # Generators routinely emit several parts. Both the chapter's static merge
    # and per-object physics assume one mesh per thing.
    select_only(meshes)
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active

    # Clear any parent while keeping the object where it appears, so nothing
    # upstream is left applying a transform we cannot see.
    if obj.parent is not None:
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")

    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)

    # --- Its materials are dead weight --------------------------------------
    # A generated mesh ships Diffuse, Roughness, Metallic and Normal. This
    # pipeline bakes lighting into base colour and renders unlit, so every one
    # of them is discarded and the caller's material is used instead.
    obj.data.materials.clear()
    obj.data.materials.append(material)

    # --- Scale, before decimating -------------------------------------------
    # Decimation error is proportional to feature size, so normalise first and
    # the budget then means the same thing for every asset.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    dimensions = max(obj.dimensions)
    if dimensions <= 1e-9:
        raise ValueError(f"{path} has no measurable size")
    factor = longest / dimensions
    obj.scale = (factor, factor, factor)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # --- Triangle budget ----------------------------------------------------
    budget = TIERS[tier]["triangles"]
    before = _triangle_count(obj)
    if before > budget:
        decimate = obj.modifiers.new(name="IngestDecimate", type="DECIMATE")
        decimate.decimate_type = "COLLAPSE"
        decimate.ratio = budget / before
        bpy.ops.object.modifier_apply(modifier=decimate.name)

    # --- Origin at the geometry centre --------------------------------------
    # The lesson from add_prop(), and the one that fails silently: a rigid body
    # is placed where its *transform* says. An imported mesh carries its
    # position in its vertices, so left alone it reports (0, 0, 0) to physics --
    # containment measures from the origin and grab reach measures to it,
    # however right it looks on screen. `tools/validate.mjs` rejects any
    # grabbable with an identity transform, so getting this wrong fails the
    # build rather than shipping.
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")

    obj.name = name
    obj.data.name = name
    obj.location = at
    obj.rotation_euler = rotation

    print(
        f"[ingest] {os.path.basename(path)} -> {name}: "
        f"{before} tris to {_triangle_count(obj)} ({tier}), "
        f"scaled to {longest:.3f}m",
        flush=True,
    )
    return obj
