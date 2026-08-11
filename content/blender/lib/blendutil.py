"""Scene plumbing: resetting state, creating objects, tagging extras.

Coordinate note that matters everywhere downstream: **Blender is Z-up**, glTF is
Y-up, and the exporter converts on the way out. So authoring code here uses
(x, y, z) with Z as height, and the same object arrives in Babylon with those
axes swapped. Anchor positions in particular are easy to get wrong if you forget
this, which is why the runtime reads them from exported empties instead of
hard-coding numbers on the TypeScript side.
"""

from __future__ import annotations

import bpy


def reset_scene() -> None:
    """Wipe the file back to an empty scene.

    Blender's default startup file ships a cube, a camera and a light. Headless
    runs inherit them, and they would silently end up in the export.
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # read_factory_settings(use_empty=True) clears objects but orphaned datablocks
    # can survive across scene builds within one process. Purging keeps repeated
    # builds deterministic. It needs an outliner context that background mode
    # does not always provide, and it is only a hygiene step, so a failure here
    # must not take the build down.
    try:
        for _ in range(3):
            bpy.ops.outliner.orphans_purge(
                do_local_ids=True, do_linked_ids=True, do_recursive=True
            )
    except RuntimeError:
        pass


def use_cycles(samples: int, denoise: bool = True) -> None:
    """Switch to Cycles, which is the only Blender engine that can bake GI."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = denoise
    # CPU is the reliable default headless; GPU needs per-machine device config
    # and silently falls back to CPU anyway when unavailable.
    scene.cycles.device = "CPU"
    # Bounces low enough to stay fast, high enough that a room reads as lit
    # rather than as flat ambient.
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 2
    scene.cycles.transmission_bounces = 2


def ensure_collection(name: str) -> bpy.types.Collection:
    """Get or create a collection linked to the scene root."""
    existing = bpy.data.collections.get(name)
    if existing is not None:
        return existing
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def link_to(collection: bpy.types.Collection, obj: bpy.types.Object) -> None:
    """Move `obj` so it lives only in `collection`."""
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)


def new_mesh_object(
    name: str,
    verts: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """Build a mesh from explicit geometry.

    Deliberately uses `from_pydata` rather than `bpy.ops.mesh.primitive_*`.
    Operators depend on context (an active object, a particular mode) that is
    fragile in headless runs, and they leave the result wherever the 3D cursor
    happens to be. Explicit vertices are deterministic.
    """
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def new_empty(
    name: str,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    size: float = 0.15,
) -> bpy.types.Object:
    """Create an empty. These export as plain glTF nodes the runtime can look up."""
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = size
    empty.location = location
    collection.objects.link(empty)
    return empty


def set_extras(obj: bpy.types.Object, **values: object) -> None:
    """Attach custom properties, which the exporter writes into glTF `extras`.

    Requires `export_extras=True` on the exporter (see lib/export.py) -- without
    it these are silently dropped and the runtime sees untagged nodes.
    """
    for key, value in values.items():
        obj[key] = value


def shade_smooth(obj: bpy.types.Object, angle_degrees: float = 30.0) -> None:
    """Smooth shading with an autosmooth angle, preserving hard edges.

    Blender 4.1 removed `mesh.use_auto_smooth` in favour of a modifier, so this
    sets per-face smoothing plus a Smooth by Angle modifier -- the 4.2-correct
    equivalent of what used to be a single checkbox.
    """
    import math

    for polygon in obj.data.polygons:
        polygon.use_smooth = True

    modifier = obj.modifiers.new(name="SmoothByAngle", type="SMOOTH_BY_ANGLE")
    modifier["Input_1"] = math.radians(angle_degrees)


def select_only(objects: list[bpy.types.Object]) -> None:
    """Make exactly `objects` selected, with the first one active.

    Several operators (unwrap, bake, join) act on the selection, so getting this
    wrong quietly operates on the wrong set rather than erroring.
    """
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0] if objects else None
