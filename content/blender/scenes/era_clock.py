"""CH_era_clock -- the long night.

Deep winter, small hours, and the coldest the room ever gets. The ceiling bulb
is off; a bench lamp makes one hard pool and everything outside it belongs to
the window, which is moonlit snow and the brightest thing anywhere in the piece.

The bench is the tidiest in the whole piece. That is the tell: he was being
careful, because he had promised a man he would try and had not promised he
could manage it.

    blender --background --factory-startup --python content/blender/scenes/era_clock.py \
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
from lib.materials import assign, flat_material  # noqa: E402
from lib.naming import chapter_name  # noqa: E402
from lib.preview import render_from  # noqa: E402
from lib.workshop import (  # noqa: E402
    BENCH_TOP,
    FOCUS_AT,
    THE_LONG_NIGHT,
    VIEWER_AT,
    add_anchors,
    add_clock,
    build_room,
)

CHAPTER_ID = "era_clock"


def build() -> Chapter:
    collection = ensure_collection(chapter_name(CHAPTER_ID))
    room = build_room(CHAPTER_ID, THE_LONG_NIGHT, collection)

    # A pale dial, catching the lamp. The only bright thing on the bench.
    face = flat_material(f"{CHAPTER_ID}_clock_face", (0.80, 0.77, 0.70), roughness=0.35)
    clock, dial = add_clock(CHAPTER_ID, collection, room.materials["timber"], face, as_gate=False)
    room.static.extend([clock, dial])

    # The movement, laid out in rows on a cloth. Deliberately regular: every
    # other bench in this piece is scattered, and this one is not, because the
    # care is the whole characterisation.
    cloth = add_box(f"{CHAPTER_ID}_cloth", (0.52, 0.34, 0.01), (-0.14, -1.18, BENCH_TOP + 0.005), collection)
    assign(cloth, room.materials["timber_dark"])
    room.static.append(cloth)

    for row in range(2):
        for column in range(5):
            size = 0.028 if (row + column) % 2 else 0.020
            part = add_box(
                f"{CHAPTER_ID}_part_{row}{column}",
                (size, size, 0.012),
                (-0.34 + column * 0.10, -1.28 + row * 0.16, BENCH_TOP + 0.017),
                collection,
            )
            assign(part, room.materials["metal"])
            room.static.append(part)

    # The mainspring he robbed from a clock not worth mending, coiled flat.
    spring = add_box(f"{CHAPTER_ID}_spring", (0.09, 0.09, 0.014), (0.20, -1.34, BENCH_TOP + 0.018), collection)
    assign(spring, room.materials["metal"])
    room.static.append(spring)

    # A magnifier on a stand, angled over the work.
    stand = add_box(f"{CHAPTER_ID}_glass_post", (0.02, 0.02, 0.22), (-0.62, -1.08, BENCH_TOP + 0.11), collection)
    assign(stand, room.materials["metal"])
    room.static.append(stand)
    lens = add_box(f"{CHAPTER_ID}_glass_lens", (0.11, 0.02, 0.11), (-0.62, -1.14, BENCH_TOP + 0.24), collection)
    assign(lens, room.materials["metal"])
    room.static.append(lens)

    # A cup, gone cold hours ago.
    cup = add_box(f"{CHAPTER_ID}_cup", (0.08, 0.08, 0.09), (0.80, -0.98, BENCH_TOP + 0.045), collection)
    assign(cup, room.materials["plaster"])
    room.static.append(cup)

    # The chair is pushed in. Nobody has got up from this bench in hours.
    seat = add_box(f"{CHAPTER_ID}_chair_seat", (0.40, 0.38, 0.05), (0.02, -0.76, 0.45), collection)
    assign(seat, room.materials["timber"])
    room.static.append(seat)
    back = add_box(f"{CHAPTER_ID}_chair_back", (0.40, 0.05, 0.42), (0.02, -0.58, 0.70), collection)
    assign(back, room.materials["timber"])
    room.static.append(back)
    for index, (x, y) in enumerate([(-0.16, -0.92), (0.20, -0.92), (-0.16, -0.60), (0.20, -0.60)]):
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
        print(f"[era_clock] preview {path}", flush=True)
        if args.preview_only:
            finish()

    written = finalize(chapter, out_dir=args.out, atlas_size=args.atlas)
    print(f"[era_clock] wrote {written}", flush=True)
    finish()


if __name__ == "__main__":
    main()
