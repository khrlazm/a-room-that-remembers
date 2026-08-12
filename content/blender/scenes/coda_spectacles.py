"""CH_coda_spectacles -- one object, and she is close.

The last coda, and the one that breaks its own pattern. Nine things drifted in
the radio's, seven in the clock's; here there is one. The count has been falling
all along and this is where it lands.

She is **inside** the drift rather than beyond it -- the only figure in the piece
the viewer can reach. She is still a figure, so she still cannot be moved. That
is the difference between this beat and every other one: everywhere else the
objects were near and the people were far, and being able to touch the object
was enough. Here it is not.

    blender --background --factory-startup --python content/blender/scenes/coda_spectacles.py \
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

CHAPTER_ID = "coda_spectacles"

DRIFT_AT = (0.0, -0.62, 1.42)


def build() -> Chapter:
    collection = ensure_collection(chapter_name(CHAPTER_ID))
    static: list = []
    dynamic: list = []

    metal = occluded_material(f"{CHAPTER_ID}_metal", (0.40, 0.39, 0.37), distance=0.08, roughness=0.45)
    # She is lighter than the figures in the other codas. Not glowing, not
    # ghostly -- just not receding, because for once she is the near thing.
    flesh = occluded_material(f"{CHAPTER_ID}_figure", (0.29, 0.27, 0.26), distance=0.5)

    dx, dy, dz = DRIFT_AT

    # One object. Turning very slowly, at eye height, right in front of you.
    props = [
        ("frame", (0.14, 0.012, 0.035), (0.0, 0.0, 0.02), 0.12),
        ("arm_r", (0.012, 0.11, 0.008), (0.062, 0.058, 0.02), 0.05),
        ("arm_l", (0.012, 0.11, 0.008), (-0.058, 0.052, 0.03), 0.05),
    ]
    for name, size, (ox, oy, oz), mass in props:
        obj = add_prop(f"{CHAPTER_ID}_{name}", size, (dx + ox, dy + oy, dz + oz), collection)
        assign(obj, metal)
        set_extras(obj, **{EXTRA_GRAB: 1, EXTRA_MASS: mass, EXTRA_ROLE: name})
        dynamic.append(obj)

    # Close, and off to one side. Every other coda puts its figures two metres
    # or more away; she is at roughly one and a half.
    #
    # Not centred, though. Placed directly behind the drift she simply swallows
    # it -- a body at that distance against a fourteen-centimetre object leaves
    # nothing to see but a pale sliver at her chest. Set to the side she reads
    # as present without competing with the one thing the viewer is meant to
    # reach for, and she is still nearer than any figure has been.
    static.extend(
        add_figure(
            f"{CHAPTER_ID}_her", collection, flesh,
            at=(0.82, -1.62, 0.0), facing=-0.62, height=1.62,
            arm_swing=(0.10, -0.05), lean=0.02,
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
        print(f"[coda_spectacles] preview {path}", flush=True)
        if args.preview_only:
            finish()

    written = finalize(chapter, out_dir=args.out, atlas_size=args.atlas)
    print(f"[coda_spectacles] wrote {written}", flush=True)
    finish()


if __name__ == "__main__":
    main()
