"""CH_era_toolbox -- what he was given.

The earliest era and the only one about being on the receiving end. Hard clean
morning light, no bulb, shelves half-stocked because he had not filled them yet.

Everything reads younger. That is entirely in the preset -- paler timber, fewer
marks, a brighter and cooler window -- and the dressing only has to stay out of
its way.

    blender --background --factory-startup --python content/blender/scenes/era_toolbox.py \
        -- --out build/raw
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.bake import ensure_uv_layer  # noqa: E402
from lib.blendutil import ensure_collection, reset_scene, use_cycles  # noqa: E402
from lib.build import Chapter, finalize  # noqa: E402
from lib.cli import finish, parse  # noqa: E402
from lib.geometry import add_box  # noqa: E402
from lib.materials import assign  # noqa: E402
from lib.naming import chapter_name  # noqa: E402
from lib.preview import render_from  # noqa: E402
from lib.workshop import (  # noqa: E402
    BENCH_TOP,
    FOCUS_AT,
    VIEWER_AT,
    WHAT_HE_WAS_GIVEN,
    add_anchors,
    add_toolbox,
    build_room,
)

CHAPTER_ID = "era_toolbox"


def build() -> Chapter:
    collection = ensure_collection(chapter_name(CHAPTER_ID))
    room = build_room(CHAPTER_ID, WHAT_HE_WAS_GIVEN, collection)

    room.static.extend(
        add_toolbox(
            CHAPTER_ID, collection, room.materials["timber"], room.materials["metal"], as_gate=False
        )
    )

    # A whetstone and a tin of oil, the two things you need before you can use
    # any of it. Set out at the front, where the teaching would have happened.
    stone = add_box(
        f"{CHAPTER_ID}_whetstone", (0.20, 0.07, 0.03), (0.10, -1.30, BENCH_TOP + 0.015), collection
    )
    assign(stone, room.materials["metal"])
    room.static.append(stone)

    tin = add_box(
        f"{CHAPTER_ID}_oil_tin", (0.07, 0.07, 0.11), (0.34, -1.26, BENCH_TOP + 0.055), collection
    )
    assign(tin, room.materials["metal"])
    room.static.append(tin)

    # A shaving, curled off and left. The only thing on this bench that is not
    # a tool: proof that somebody just used one.
    shaving = add_box(
        f"{CHAPTER_ID}_shaving", (0.13, 0.05, 0.006), (0.56, -1.34, BENCH_TOP + 0.004), collection
    )
    assign(shaving, room.materials["timber"])
    room.static.append(shaving)

    # Two stools rather than a chair. Somebody was sitting beside him.
    for index, x in enumerate((-0.24, 0.30)):
        seat = add_box(f"{CHAPTER_ID}_stool_{index}", (0.30, 0.30, 0.05), (x, -0.74, 0.47), collection)
        assign(seat, room.materials["timber"])
        room.static.append(seat)
        for leg_index, (lx, ly) in enumerate(
            [(x - 0.11, -0.85), (x + 0.11, -0.85), (x - 0.11, -0.63), (x + 0.11, -0.63)]
        ):
            leg = add_box(
                f"{CHAPTER_ID}_stool_{index}_leg_{leg_index}", (0.04, 0.04, 0.45), (lx, ly, 0.225), collection
            )
            assign(leg, room.materials["timber_dark"])
            room.static.append(leg)

    add_anchors(collection)

    for obj in [*room.static, *room.dynamic]:
        ensure_uv_layer(obj)

    return Chapter(
        chapter_id=CHAPTER_ID, collection=collection, static=room.static, dynamic=room.dynamic
    )


def main() -> None:
    args = parse()
    reset_scene()
    use_cycles(samples=args.samples)
    chapter = build()

    if args.preview or args.preview_only:
        path = os.path.join(args.out, f"{CHAPTER_ID}_preview.png")
        render_from(path, location=(VIEWER_AT[0], VIEWER_AT[1], 1.6), look_at=FOCUS_AT)
        print(f"[era_toolbox] preview {path}", flush=True)
        if args.preview_only:
            finish()

    written = finalize(chapter, out_dir=args.out, atlas_size=args.atlas)
    print(f"[era_toolbox] wrote {written}", flush=True)
    finish()


if __name__ == "__main__":
    main()
