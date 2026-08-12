"""CH_coda_clock -- after the long night, gravity lets go.

Seven things adrift, two fewer than the radio's coda. The count falls with every
beat: a memory with less and less in it.

One figure only, and standing rather than working -- the man who came to collect
his father's clock and is still in the doorway. He is set well back, because the
viewer should notice him a moment after the objects rather than before them.

    blender --background --factory-startup --python content/blender/scenes/coda_clock.py \
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

CHAPTER_ID = "coda_clock"

DRIFT_AT = (0.0, -0.62, 1.42)


def build() -> Chapter:
    collection = ensure_collection(chapter_name(CHAPTER_ID))
    static: list = []
    dynamic: list = []

    timber = occluded_material(f"{CHAPTER_ID}_timber", (0.34, 0.28, 0.22), distance=0.16)
    brass = occluded_material(f"{CHAPTER_ID}_brass", (0.44, 0.38, 0.24), distance=0.10, roughness=0.5)
    steel = occluded_material(f"{CHAPTER_ID}_steel", (0.40, 0.41, 0.43), distance=0.10, roughness=0.45)
    glass = occluded_material(f"{CHAPTER_ID}_glass", (0.62, 0.66, 0.70), distance=0.14, roughness=0.25)
    china = occluded_material(f"{CHAPTER_ID}_china", (0.56, 0.54, 0.50), distance=0.12)
    flesh = occluded_material(f"{CHAPTER_ID}_figure", (0.20, 0.185, 0.175), distance=0.5)

    dx, dy, dz = DRIFT_AT

    props = [
        ("case", (0.26, 0.18, 0.34), (-0.16, 0.00, 0.06), timber, 1.4),
        ("movement", (0.13, 0.13, 0.05), (0.14, -0.06, 0.14), brass, 0.5),
        ("hand_hour", (0.10, 0.012, 0.012), (0.26, 0.14, -0.06), steel, 0.15),
        ("hand_minute", (0.15, 0.012, 0.012), (-0.28, 0.12, -0.10), steel, 0.15),
        ("mainspring", (0.09, 0.09, 0.014), (0.04, 0.18, 0.20), steel, 0.3),
        ("dome", (0.20, 0.20, 0.22), (0.30, -0.16, 0.16), glass, 0.5),
        ("cup", (0.08, 0.08, 0.09), (-0.30, -0.14, -0.16), china, 0.4),
    ]

    for name, size, (ox, oy, oz), material, mass in props:
        obj = add_prop(f"{CHAPTER_ID}_{name}", size, (dx + ox, dy + oy, dz + oz), collection)
        assign(obj, material)
        set_extras(obj, **{EXTRA_GRAB: 1, EXTRA_MASS: mass, EXTRA_ROLE: name})
        dynamic.append(obj)

    # Standing, arms down, turned toward the bench that is not there. Waiting is
    # the whole pose: no lean, no swing, nothing to do with his hands.
    static.extend(
        add_figure(
            f"{CHAPTER_ID}_caller", collection, flesh,
            at=(-0.95, -2.25, 0.0), facing=-0.35, height=1.74,
            arm_swing=(0.06, -0.04), lean=0.0,
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
        print(f"[coda_clock] preview {path}", flush=True)
        if args.preview_only:
            finish()

    written = finalize(chapter, out_dir=args.out, atlas_size=args.atlas)
    print(f"[coda_clock] wrote {written}", flush=True)
    finish()


if __name__ == "__main__":
    main()
