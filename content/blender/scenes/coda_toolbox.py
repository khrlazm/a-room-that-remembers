"""CH_coda_toolbox -- what he was given, adrift.

Six things: the box, three chisels, the whetstone, the oil tin.

Two figures, and the only child in the piece. A tall one standing and a much
smaller one close beside it, both fixed. The child is him, and the viewer works
that out or does not -- nothing says so.

    blender --background --factory-startup --python content/blender/scenes/coda_toolbox.py \
        -- --out build/raw
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.bake import ensure_uv_layer  # noqa: E402
from lib.blendutil import ensure_collection, new_empty, reset_scene, set_extras, use_cycles  # noqa: E402
from lib.build import Chapter, finalize  # noqa: E402
from lib.cli import finish, parse  # noqa: E402
from lib.dome import set_dome  # noqa: E402
from lib.figure import add_figure  # noqa: E402
from lib.geometry import add_prop  # noqa: E402
from lib.materials import assign, occluded_material  # noqa: E402
from lib.naming import EXTRA_GRAB, EXTRA_MASS, EXTRA_ROLE, anchor_name, chapter_name  # noqa: E402
from lib.preview import render_from  # noqa: E402
from lib.workshop import VIEWER_AT, add_anchors  # noqa: E402

CHAPTER_ID = "coda_toolbox"

DRIFT_AT = (0.0, -0.62, 1.42)


def build() -> Chapter:
    collection = ensure_collection(chapter_name(CHAPTER_ID))
    static: list = []
    dynamic: list = []

    timber = occluded_material(f"{CHAPTER_ID}_timber", (0.48, 0.35, 0.20), distance=0.18)
    steel = occluded_material(f"{CHAPTER_ID}_steel", (0.42, 0.42, 0.40), distance=0.09, roughness=0.4)
    stone = occluded_material(f"{CHAPTER_ID}_stone", (0.44, 0.42, 0.38), distance=0.12)
    flesh = occluded_material(f"{CHAPTER_ID}_figure", (0.20, 0.185, 0.175), distance=0.5)

    dx, dy, dz = DRIFT_AT

    props = [
        ("toolbox", (0.36, 0.22, 0.15), (-0.14, 0.02, 0.04), timber, 1.6),
        ("chisel_0", (0.016, 0.16, 0.012), (0.20, -0.10, 0.16), steel, 0.2),
        ("chisel_1", (0.016, 0.19, 0.012), (0.26, 0.12, -0.02), steel, 0.2),
        ("chisel_2", (0.016, 0.22, 0.012), (-0.24, 0.16, -0.14), steel, 0.25),
        ("whetstone", (0.20, 0.07, 0.03), (0.06, 0.18, 0.20), stone, 0.6),
        ("oil_tin", (0.07, 0.07, 0.11), (-0.28, -0.12, 0.18), steel, 0.35),
    ]

    for name, size, (ox, oy, oz), material, mass in props:
        obj = add_prop(f"{CHAPTER_ID}_{name}", size, (dx + ox, dy + oy, dz + oz), collection)
        assign(obj, material)
        set_extras(obj, **{EXTRA_GRAB: 1, EXTRA_MASS: mass, EXTRA_ROLE: name})
        dynamic.append(obj)

    # The father, standing, turned toward the drift. Arms down and still: he is
    # not demonstrating anything, he is watching.
    static.extend(
        add_figure(
            f"{CHAPTER_ID}_father", collection, flesh,
            at=(0.72, -2.10, 0.0), facing=-0.48, height=1.78,
            arm_swing=(0.08, -0.05), lean=0.03,
        )
    )
    # The boy, close beside him and shorter by a third. Turned the same way.
    static.extend(
        add_figure(
            f"{CHAPTER_ID}_boy", collection, flesh,
            at=(0.34, -2.02, 0.0), facing=-0.44, height=1.18,
            arm_swing=(0.14, 0.02), lean=0.05,
        )
    )

    add_anchors(collection)
    new_empty(anchor_name("drift"), DRIFT_AT, collection)

    for obj in [*static, *dynamic]:
        ensure_uv_layer(obj)

    return Chapter(chapter_id=CHAPTER_ID, collection=collection, static=static, dynamic=dynamic)


def main() -> None:
    args = parse()
    reset_scene()
    use_cycles(samples=args.samples)
    set_dome()
    chapter = build()

    if args.preview or args.preview_only:
        path = os.path.join(args.out, f"{CHAPTER_ID}_preview.png")
        render_from(path, location=(VIEWER_AT[0], VIEWER_AT[1], 1.6), look_at=DRIFT_AT)
        print(f"[coda_toolbox] preview {path}", flush=True)
        if args.preview_only:
            finish()

    written = finalize(chapter, out_dir=args.out, atlas_size=args.atlas)
    print(f"[coda_toolbox] wrote {written}", flush=True)
    finish()


if __name__ == "__main__":
    main()
