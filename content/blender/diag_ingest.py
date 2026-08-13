"""Diagnostic: prove ingest survives a deliberately hostile mesh.

    blender --background --factory-startup --python content/blender/diag_ingest.py

Builds a source file with every failure mode at once -- several separate parts,
ten times the intended scale, its own PBR materials, far too many triangles, and
geometry nowhere near its origin -- exports it, ingests it, and checks the
result is something the rest of the pipeline can use.

Not in scenes/, so the chapter build runner ignores it.
"""

from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from lib.blendutil import ensure_collection, reset_scene, use_cycles  # noqa: E402
from lib.ingest import TIERS, ingest  # noqa: E402
from lib.materials import flat_material  # noqa: E402

TARGET_LONGEST = 0.36
PLACE_AT = (0.4, -1.2, 0.95)


def build_hostile_source(path: str) -> None:
    """Everything that can be wrong with an imported mesh, in one file."""
    reset_scene()

    for index in range(3):
        # Dense on purpose: three of these land around 12,000 triangles, well
        # over even the hero budget.
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32)
        obj = bpy.context.view_layer.objects.active
        obj.name = f"hostile_part_{index}"
        # Far from the origin, and ten times the size it should be.
        obj.location = (14.0 + index * 3.0, -21.0, 8.5)
        obj.scale = (3.4, 2.1, 2.8)

        # Its own material, which ingest must discard.
        material = bpy.data.materials.new(f"hostile_pbr_{index}")
        material.use_nodes = True
        obj.data.materials.append(material)

    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False)


def main() -> None:
    source = os.path.join(tempfile.gettempdir(), "ingest_hostile.glb")
    build_hostile_source(source)

    # Fresh scene, as a real chapter build would be.
    reset_scene()
    use_cycles(samples=1)
    collection = ensure_collection("CH_diag")
    material = flat_material("diag_mat", (0.4, 0.3, 0.2))

    obj = ingest(
        source,
        "GATE_diag",
        collection,
        tier="hero",
        material=material,
        at=PLACE_AT,
        longest=TARGET_LONGEST,
    )

    obj.data.calc_loop_triangles()
    triangles = len(obj.data.loop_triangles)

    # Local-space bounding box centre. Should sit on the origin, because that is
    # what a physics body needs.
    corners = [tuple(corner) for corner in obj.bound_box]
    centre = [sum(c[axis] for c in corners) / 8.0 for axis in range(3)]

    meshes = [o for o in collection.objects if o.type == "MESH"]

    checks = {
        "one object": len(meshes) == 1,
        "named": obj.name == "GATE_diag",
        "within tier budget": triangles <= TIERS["hero"]["triangles"],
        "our material only": [m.name for m in obj.data.materials] == ["diag_mat"],
        "scaled to target": abs(max(obj.dimensions) - TARGET_LONGEST) < 0.005,
        "origin at geometry centre": all(abs(v) < 0.005 for v in centre),
        "placed where asked": all(
            abs(a - b) < 1e-4 for a, b in zip(tuple(obj.location), PLACE_AT)
        ),
        "no leftover parent": obj.parent is None,
        "scale applied": all(abs(s - 1.0) < 1e-4 for s in obj.scale),
    }

    print("", flush=True)
    for label, passed in checks.items():
        print(f"[diag] {'PASS' if passed else 'FAIL'}  {label}", flush=True)
    print(
        f"[diag] triangles={triangles} "
        f"dimensions=({obj.dimensions.x:.3f}, {obj.dimensions.y:.3f}, {obj.dimensions.z:.3f}) "
        f"localCentre=({centre[0]:.4f}, {centre[1]:.4f}, {centre[2]:.4f})",
        flush=True,
    )
    print(f"[diag] {'ALL PASS' if all(checks.values()) else 'FAILURES PRESENT'}", flush=True)

    sys.stdout.flush()
    os._exit(0 if all(checks.values()) else 1)


if __name__ == "__main__":
    main()
