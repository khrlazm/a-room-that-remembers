"""Diagnostic: report UV bounds per object after unwrapping. No bake.

    blender --background --factory-startup --python content/blender/diag_uv.py

Not in scenes/ so the chapter build runner ignores it.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "scenes"))

import bpy  # noqa: E402

from lib.bake import unwrap_shared_atlas  # noqa: E402
from lib.blendutil import reset_scene, use_cycles  # noqa: E402


def uv_bounds(obj):
    layer = obj.data.uv_layers.active
    if layer is None or len(layer.data) == 0:
        return None
    us = [datum.uv[0] for datum in layer.data]
    vs = [datum.uv[1] for datum in layer.data]
    return min(us), max(us), min(vs), max(vs)


def main() -> None:
    reset_scene()
    use_cycles(samples=1)

    import hub  # noqa: E402

    chapter = hub.build()
    objects = chapter.bakeable

    print(f"[diag] multi-object edit support check: {len(objects)} objects", flush=True)
    unwrap_shared_atlas(objects)

    covered = 0.0
    for obj in objects:
        bounds = uv_bounds(obj)
        if bounds is None:
            print(f"[diag] {obj.name:32s} NO UVs", flush=True)
            continue
        u0, u1, v0, v1 = bounds
        area = (u1 - u0) * (v1 - v0)
        covered += area
        print(
            f"[diag] {obj.name:32s} u[{u0:6.3f},{u1:6.3f}] v[{v0:6.3f},{v1:6.3f}] bboxArea={area:6.4f}",
            flush=True,
        )

    print(f"[diag] summed bbox area = {covered:.3f} (1.0 would be a full sheet)", flush=True)
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
