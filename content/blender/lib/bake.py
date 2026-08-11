"""Lightmap UV layout and Cycles baking.

The two steps are in one module because they are tightly coupled: the bake
writes into whatever UV layout the unwrap produced, and both must run across the
whole chapter at once so every surface lands in one shared atlas.
"""

from __future__ import annotations

import bpy

from .atlas import pack_into_atlas
from .blendutil import select_only
from .materials import attach_bake_target

# Single UV set. The plan originally called for UV0 (tiling albedo) plus UV1
# (lightmap), but with lighting baked directly into base colour there is no
# separate albedo layer to tile -- so one unique unwrap does both jobs, and each
# vertex carries one fewer attribute.
UV_LAYER = "UVMap"


def ensure_uv_layer(obj: bpy.types.Object) -> None:
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name=UV_LAYER)


def unwrap_shared_atlas(
    objects: list[bpy.types.Object],
    island_margin: float = 0.015,
    angle_limit_degrees: float = 66.0,
) -> float:
    """Unwrap every object into one shared, non-overlapping UV sheet.

    Delegates the packing to lib/atlas.py rather than Blender's own
    `pack_islands` -- see that module for why the built-in path cannot be used
    headlessly. Returns the fraction of the sheet covered.
    """
    if not objects:
        return 0.0

    for obj in objects:
        ensure_uv_layer(obj)

    return pack_into_atlas(objects, angle_limit_degrees=angle_limit_degrees, gutter=island_margin)


def bake_combined(
    objects: list[bpy.types.Object],
    image: bpy.types.Image,
    margin_pixels: int = 8,
) -> None:
    """Bake the fully-lit appearance of `objects` into `image`.

    Uses COMBINED rather than DIFFUSE so emission is included -- in this piece
    the light *is* emissive geometry (windows, lamp shades, a radio dial), so a
    diffuse-only bake would come out unlit and black.
    """
    if not objects:
        return

    materials: set[bpy.types.Material] = set()
    for obj in objects:
        for slot in obj.material_slots:
            if slot.material is not None:
                materials.add(slot.material)

    # Every material needs an active image-texture node pointing at the atlas.
    # Miss one and that surface bakes nowhere, silently, leaving a hole.
    for material in materials:
        attach_bake_target(material, image)

    settings = bpy.context.scene.render.bake
    settings.margin = margin_pixels
    settings.margin_type = "ADJACENT_FACES"
    settings.use_clear = True
    settings.use_selected_to_active = False

    select_only(objects)
    bpy.ops.object.bake(type="COMBINED")


def save_atlas(image: bpy.types.Image, filepath: str) -> None:
    """Write the baked atlas to disk so the glTF exporter can embed it."""
    image.filepath_raw = filepath
    image.file_format = "PNG"
    image.save()
