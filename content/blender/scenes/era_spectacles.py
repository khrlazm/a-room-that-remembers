"""CH_era_spectacles -- her glasses.

Almost the present. Late, thin, tidy: by now he was keeping the place rather
than working in it. The stillest era and the shortest, and the only one where
the bench is clear except for one small thing.

Everything else in the piece has a bench mid-repair. This one has a job that was
never started -- a four-minute job -- and the emptiness around it is the point.

    blender --background --factory-startup --python content/blender/scenes/era_spectacles.py \
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
    HER_GLASSES,
    VIEWER_AT,
    add_anchors,
    add_spectacles,
    build_room,
)

CHAPTER_ID = "era_spectacles"


def build() -> Chapter:
    collection = ensure_collection(chapter_name(CHAPTER_ID))
    room = build_room(CHAPTER_ID, HER_GLASSES, collection)

    room.static.extend(
        add_spectacles(CHAPTER_ID, collection, room.materials["metal"], as_gate=False)
    )

    # The screwdriver. Set down beside them, pointing at the work, never picked
    # up again. It is the only other thing on the bench and it should read as
    # intent rather than as clutter.
    driver = add_box(
        f"{CHAPTER_ID}_screwdriver", (0.015, 0.10, 0.015), (0.10, -1.30, BENCH_TOP + 0.008), collection
    )
    assign(driver, room.materials["metal"])
    room.static.append(driver)

    handle = add_box(
        f"{CHAPTER_ID}_screwdriver_grip", (0.022, 0.05, 0.022), (0.10, -1.22, BENCH_TOP + 0.011), collection
    )
    assign(handle, room.materials["timber_dark"])
    room.static.append(handle)

    # The chair, pushed right in. Nobody has sat here in a long time.
    seat = add_box(f"{CHAPTER_ID}_chair_seat", (0.40, 0.38, 0.05), (0.02, -0.72, 0.45), collection)
    assign(seat, room.materials["timber"])
    room.static.append(seat)
    back = add_box(f"{CHAPTER_ID}_chair_back", (0.40, 0.05, 0.42), (0.02, -0.54, 0.70), collection)
    assign(back, room.materials["timber"])
    room.static.append(back)
    for index, (x, y) in enumerate([(-0.16, -0.88), (0.20, -0.88), (-0.16, -0.56), (0.20, -0.56)]):
        leg = add_box(f"{CHAPTER_ID}_chair_leg_{index}", (0.05, 0.05, 0.43), (x, y, 0.215), collection)
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
        print(f"[era_spectacles] preview {path}", flush=True)
        if args.preview_only:
            finish()

    written = finalize(chapter, out_dir=args.out, atlas_size=args.atlas)
    print(f"[era_spectacles] wrote {written}", flush=True)
    finish()


if __name__ == "__main__":
    main()
