"""CH_hub -- the workshop, present day.

The room the viewer returns to between eras. Sparse, cool, quiet: whatever the
eras turn out to be, the hub has to read as *after* them.

    blender --background --factory-startup --python content/blender/scenes/hub.py \
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
from lib.materials import emission_material, flat_material  # noqa: E402
from lib.naming import chapter_name  # noqa: E402
from lib.preview import render_from  # noqa: E402
from lib.workshop import (  # noqa: E402
    FOCUS_AT,
    PRESENT,
    VIEWER_AT,
    add_anchors,
    add_clock,
    add_radio,
    add_spectacles,
    add_toolbox,
    build_room,
)

CHAPTER_ID = "hub"


def build() -> Chapter:
    collection = ensure_collection(chapter_name(CHAPTER_ID))
    room = build_room(CHAPTER_ID, PRESENT, collection)

    # The radio still works. It is the warmest thing in the present-day room,
    # which is what makes it the object the eye goes to first.
    dial = emission_material(f"{CHAPTER_ID}_dial", (1.0, 0.63, 0.24), strength=6.0)
    radio, face = add_radio(
        CHAPTER_ID, collection, room.materials["timber_dark"], dial, as_gate=True
    )
    room.dynamic.append(radio)
    room.static.append(face)

    # The clock does not. Its dial catches the window rather than lighting
    # itself -- a gate the eye finds second, which is the right order.
    clock_face = flat_material(f"{CHAPTER_ID}_clock_face", (0.74, 0.71, 0.64), roughness=0.4)
    clock, dial_plate = add_clock(
        CHAPTER_ID, collection, room.materials["timber"], clock_face, as_gate=True
    )
    room.dynamic.append(clock)
    room.static.append(dial_plate)

    # And her glasses, near the front edge, small. The last gate the eye finds,
    # which is the right order: it is the one he never got to.
    spectacles = add_spectacles(CHAPTER_ID, collection, room.materials["metal"], as_gate=True)
    room.dynamic.append(spectacles[0])
    room.static.extend(spectacles[1:])

    # His father's toolbox, back against the wall. The oldest thing here.
    toolbox = add_toolbox(
        CHAPTER_ID, collection, room.materials["timber"], room.materials["metal"], as_gate=True
    )
    room.dynamic.append(toolbox[0])
    room.static.extend(toolbox[1:])

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

    # Preview runs before finalize because finalize is destructive -- it merges
    # the static objects into one mesh and replaces every material with the
    # baked one. render_from restores the scene state it touches.
    if args.preview or args.preview_only:
        path = os.path.join(args.out, f"{CHAPTER_ID}_preview.png")
        render_from(path, location=(VIEWER_AT[0], VIEWER_AT[1], 1.6), look_at=FOCUS_AT)
        print(f"[hub] preview {path}", flush=True)
        if args.preview_only:
            finish()

    written = finalize(chapter, out_dir=args.out, atlas_size=args.atlas)
    print(f"[hub] wrote {written}", flush=True)
    finish()


if __name__ == "__main__":
    main()
