"""CH_coda_radio -- after the radio's story, gravity lets go.

The workshop's things, unmoored and turning slowly in a void, with two figures
frozen among them. The viewer can catch an object and turn it over. They cannot
mend it, and they cannot move the figures.

Lit by a neutral dome rather than the era's warm window, because a moving object
must not carry shading that argues with where it now is. Form comes from baked
ambient occlusion, which is orientation-independent. See lib/dome.py.

    blender --background --factory-startup --python content/blender/scenes/coda_radio.py \
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

CHAPTER_ID = "coda_radio"

# Where the drift is centred: in front of the viewer, a little below eye level.
# The runtime reads this and contains everything within reach of it, so the
# number lives here rather than being written twice.
DRIFT_AT = (0.0, -0.62, 1.42)


def build() -> Chapter:
    collection = ensure_collection(chapter_name(CHAPTER_ID))
    static: list = []
    dynamic: list = []

    # Distance is the main AO control: wide on big soft forms, tight on props so
    # occlusion tucks into their seams rather than smothering them.
    timber = occluded_material(f"{CHAPTER_ID}_timber", (0.47, 0.33, 0.19), distance=0.16)
    timber_dark = occluded_material(f"{CHAPTER_ID}_timber_dark", (0.27, 0.19, 0.12), distance=0.16)
    metal = occluded_material(f"{CHAPTER_ID}_metal", (0.38, 0.37, 0.35), distance=0.12, roughness=0.55)
    cloth = occluded_material(f"{CHAPTER_ID}_cloth", (0.42, 0.36, 0.30), distance=0.14)
    # Figures read as one soft mass, so their occlusion reaches further. Darker
    # than the props too: they belong to the far field and should recede, and a
    # bright mannequin pulls the eye away from the thing in your hands.
    flesh = occluded_material(f"{CHAPTER_ID}_figure", (0.20, 0.185, 0.175), distance=0.5)

    dx, dy, dz = DRIFT_AT

    # --- The things, adrift -------------------------------------------------
    # (name, size, offset from drift centre, material, mass)
    props = [
        ("radio", (0.36, 0.22, 0.24), (-0.18, 0.02, 0.10), timber_dark, 1.2),
        ("panel", (0.30, 0.02, 0.22), (0.22, -0.10, 0.16), timber_dark, 0.4),
        ("tray", (0.26, 0.18, 0.05), (0.14, 0.16, -0.14), metal, 0.6),
        ("tool_0", (0.19, 0.03, 0.03), (-0.26, -0.14, -0.08), metal, 0.3),
        ("tool_1", (0.14, 0.03, 0.03), (0.02, 0.20, 0.20), metal, 0.3),
        ("tool_2", (0.11, 0.026, 0.026), (0.30, 0.04, -0.04), metal, 0.25),
        ("cloth", (0.28, 0.22, 0.02), (-0.10, 0.18, -0.20), cloth, 0.2),
        ("crate", (0.22, 0.26, 0.20), (0.28, -0.20, -0.18), timber, 1.0),
        ("valve", (0.07, 0.07, 0.12), (-0.30, 0.10, 0.20), metal, 0.2),
    ]

    for name, size, (ox, oy, oz), material, mass in props:
        # add_prop, not add_box: these get rigid bodies, and a body is placed by
        # its transform. Built the other way every prop reports a position of
        # (0, 0, 0) and both containment and grab reach measure to the origin.
        obj = add_prop(f"{CHAPTER_ID}_{name}", size, (dx + ox, dy + oy, dz + oz), collection)
        assign(obj, material)
        set_extras(obj, **{EXTRA_GRAB: 1, EXTRA_MASS: mass, EXTRA_ROLE: name})
        dynamic.append(obj)

    # --- The figures, fixed -------------------------------------------------
    # He is at the bench that is no longer there, still working. She is further
    # back and to one side, turned toward him. Neither can be moved, which is
    # the whole point of their being here.
    #
    # Both sit well beyond the drift. The objects are the near field and the
    # figures the far one: pushed any closer they tangle with the props, and the
    # viewer ends up reaching through someone to pick up a screwdriver.
    static.extend(
        add_figure(
            f"{CHAPTER_ID}_him", collection, flesh,
            at=(0.62, -2.05, 0.0), facing=2.35, height=1.70,
            seated=True, arm_swing=(0.85, 0.72), lean=0.16,
        )
    )
    static.extend(
        add_figure(
            f"{CHAPTER_ID}_her", collection, flesh,
            at=(-1.45, -1.85, 0.0), facing=-0.55, height=1.62,
            arm_swing=(0.12, -0.06), lean=0.04,
        )
    )

    # --- Anchors ------------------------------------------------------------
    add_anchors(collection)
    new_empty(anchor_name("drift"), DRIFT_AT, collection)

    for obj in [*static, *dynamic]:
        ensure_uv_layer(obj)

    return Chapter(chapter_id=CHAPTER_ID, collection=collection, static=static, dynamic=dynamic)


def main() -> None:
    args = parse()
    reset_scene()
    use_cycles(samples=args.samples)
    # Even light from every direction, so nothing carries a shadow that could
    # contradict where it drifts to.
    set_dome()
    chapter = build()

    if args.preview or args.preview_only:
        path = os.path.join(args.out, f"{CHAPTER_ID}_preview.png")
        # Aimed at the drift, not at the bench the era used -- there is no bench
        # here any more.
        render_from(path, location=(VIEWER_AT[0], VIEWER_AT[1], 1.6), look_at=DRIFT_AT)
        print(f"[coda_radio] preview {path}", flush=True)
        if args.preview_only:
            finish()

    written = finalize(chapter, out_dir=args.out, atlas_size=args.atlas)
    print(f"[coda_radio] wrote {written}", flush=True)
    finish()


if __name__ == "__main__":
    main()
