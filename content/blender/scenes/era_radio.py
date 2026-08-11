"""CH_era_radio -- the workshop in its working years.

The era the radio belongs to. Same room, same vantage, everything else warmer
and busier: the bulb is doing the lighting, the window has gone to evening, and
the shelves are full rather than half-empty.

The radio is present but is *not* a gate here. While its story is playing there
is nothing to trigger -- the viewer just watches.

    blender --background --factory-startup --python content/blender/scenes/era_radio.py \
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
from lib.materials import assign, emission_material  # noqa: E402
from lib.naming import chapter_name  # noqa: E402
from lib.preview import render_from  # noqa: E402
from lib.workshop import (  # noqa: E402
    BENCH_TOP,
    FOCUS_AT,
    VIEWER_AT,
    WORKING_YEARS,
    add_anchors,
    add_radio,
    build_room,
)

CHAPTER_ID = "era_radio"


def build() -> Chapter:
    collection = ensure_collection(chapter_name(CHAPTER_ID))
    room = build_room(CHAPTER_ID, WORKING_YEARS, collection)

    # The dial is brighter here than in the present-day hub: the radio is on,
    # and it is the thing being worked on rather than the thing left behind.
    dial = emission_material(f"{CHAPTER_ID}_dial", (1.0, 0.71, 0.32), strength=11.0)
    radio, face = add_radio(
        CHAPTER_ID, collection, room.materials["timber"], dial, as_gate=False
    )
    room.static.extend([radio, face])

    # Work in progress on the bench. Tools, a part tray, the radio's back panel
    # off to one side -- the room reads as mid-repair rather than tidy.
    bench_clutter = [
        ("panel", (0.30, 0.02, 0.22), (-0.10, -1.30, BENCH_TOP + 0.11), "timber_dark"),
        ("tray", (0.26, 0.18, 0.05), (0.28, -1.14, BENCH_TOP + 0.03), "metal"),
        ("tool_0", (0.18, 0.03, 0.03), (0.62, -1.06, BENCH_TOP + 0.02), "metal"),
        ("tool_1", (0.14, 0.03, 0.03), (0.68, -1.24, BENCH_TOP + 0.02), "metal"),
        ("cloth", (0.34, 0.26, 0.02), (0.86, -1.34, BENCH_TOP + 0.01), "timber_dark"),
    ]
    for name, size, position, material_key in bench_clutter:
        piece = add_box(f"{CHAPTER_ID}_{name}", size, position, collection)
        assign(piece, room.materials[material_key])
        room.static.append(piece)

    # A chair, pulled out. Nobody is in it, which is the point.
    #
    # Kept off to the left rather than centred: the viewer's sightline runs
    # straight from their vantage to the radio, and anything parked in it reads
    # as an obstacle instead of set dressing.
    chair_x, chair_y = -1.42, -0.72
    seat = add_box(f"{CHAPTER_ID}_chair_seat", (0.42, 0.40, 0.06), (chair_x, chair_y, 0.46), collection)
    assign(seat, room.materials["timber"])
    room.static.append(seat)
    back = add_box(
        f"{CHAPTER_ID}_chair_back", (0.42, 0.05, 0.44), (chair_x, chair_y + 0.18, 0.71), collection
    )
    assign(back, room.materials["timber"])
    room.static.append(back)
    for index, (dx, dy) in enumerate([(-0.18, -0.18), (0.18, -0.18), (-0.18, 0.18), (0.18, 0.18)]):
        leg = add_box(
            f"{CHAPTER_ID}_chair_leg_{index}", (0.05, 0.05, 0.43),
            (chair_x + dx, chair_y + dy, 0.215), collection,
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
        print(f"[era_radio] preview {path}", flush=True)
        if args.preview_only:
            finish()

    written = finalize(chapter, out_dir=args.out, atlas_size=args.atlas)
    print(f"[era_radio] wrote {written}", flush=True)
    finish()


if __name__ == "__main__":
    main()
