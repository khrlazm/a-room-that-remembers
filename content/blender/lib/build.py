"""Chapter finalisation: unwrap, bake, flatten, export.

Scene scripts describe *what is in* a chapter. This module turns that into
something a mobile GPU can draw cheaply, and it is the same for every chapter --
which is what makes adding the seventh era no harder than adding the second.
"""

from __future__ import annotations

import contextlib
import os
import sys
import time
from dataclasses import dataclass, field

import bpy

from . import naming
from .bake import bake_combined, save_atlas, unwrap_shared_atlas
from .blendutil import select_only, set_extras
from .export import export_glb
from .materials import assign, baked_material, new_bake_image


@contextlib.contextmanager
def _step(label: str):
    """Time and announce a build step.

    Bake time is the pipeline's dominant cost, and it is worth knowing which
    step is responsible when a chapter suddenly takes four minutes.
    """
    start = time.perf_counter()
    print(f"[build]   {label} ...", flush=True)
    yield
    print(f"[build]   {label} done in {time.perf_counter() - start:.1f}s", flush=True)
    sys.stdout.flush()


@dataclass
class Chapter:
    """Everything a scene script hands back for finalisation."""

    chapter_id: str
    collection: bpy.types.Collection
    #: Merged into one mesh. Anything the runtime never addresses individually.
    static: list[bpy.types.Object] = field(default_factory=list)
    #: Kept as separate nodes: gaze targets, animated props, anything picked.
    dynamic: list[bpy.types.Object] = field(default_factory=list)

    @property
    def bakeable(self) -> list[bpy.types.Object]:
        return [*self.static, *self.dynamic]


def finalize(
    chapter: Chapter,
    out_dir: str,
    atlas_size: int = 2048,
    island_margin: float = 0.015,
) -> str:
    """Bake, flatten and export a chapter. Returns the written .glb path."""
    bakeables = chapter.bakeable
    if not bakeables:
        raise ValueError(f"chapter {chapter.chapter_id!r} has no geometry to bake")

    print(
        f"[build] {chapter.chapter_id}: "
        f"{len(chapter.static)} static + {len(chapter.dynamic)} dynamic objects",
        flush=True,
    )

    # 1. One shared UV layout across the whole chapter.
    with _step(f"unwrap ({len(bakeables)} objects)"):
        coverage = unwrap_shared_atlas(bakeables, island_margin=island_margin)
    print(f"[build]   atlas coverage {coverage * 100:.1f}%", flush=True)

    # 2. Bake the lit appearance into a single atlas.
    atlas = new_bake_image(f"{chapter.chapter_id}_atlas", atlas_size)
    with _step(f"bake {atlas_size}x{atlas_size}"):
        bake_combined(bakeables, atlas)

    os.makedirs(out_dir, exist_ok=True)
    atlas_path = os.path.join(out_dir, f"{chapter.chapter_id}_atlas.png")
    with _step("save atlas"):
        save_atlas(atlas, atlas_path)

    # 3. Replace every shading material with one that just shows the bake.
    #    From here on the chapter is a single texture and a single material.
    final_material = baked_material(f"{chapter.chapter_id}_baked", atlas)
    for obj in bakeables:
        assign(obj, final_material)

    # 4. Merge the static set into one mesh. Sharing a material is what makes
    #    this legal -- and it collapses the room to a single draw call.
    with _step(f"merge {len(chapter.static)} static objects"):
        if len(chapter.static) > 1:
            select_only(chapter.static)
            bpy.ops.object.join()
            merged = bpy.context.view_layer.objects.active
        elif chapter.static:
            merged = chapter.static[0]
        else:
            merged = None

    if merged is not None:
        merged.name = naming.static_name(chapter.chapter_id)
        merged.data.name = merged.name
        set_extras(merged, **{naming.EXTRA_UNLIT: 1})

    # Dynamic objects keep their identity but still need the unlit tag.
    for obj in chapter.dynamic:
        set_extras(obj, **{naming.EXTRA_UNLIT: 1})

    # 5. Export.
    glb_path = os.path.join(out_dir, f"{chapter.chapter_id}.glb")
    with _step("export glb"):
        export_glb(glb_path)
    return glb_path
