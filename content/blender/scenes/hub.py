"""CH_hub -- the workshop, present day.

The one room the viewer ever physically stands in. Every era chapter is a
re-dress of this same space, which is the whole reason the piece can afford
eight of them.

Run via `npm run build:blender`, or directly:
    blender --background --python content/blender/scenes/hub.py -- --out build/raw
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import naming  # noqa: E402
from lib.bake import ensure_uv_layer  # noqa: E402
from lib.blendutil import (  # noqa: E402
    ensure_collection,
    new_empty,
    reset_scene,
    set_extras,
    use_cycles,
)
from lib.build import Chapter, finalize  # noqa: E402
from lib.cli import finish, parse  # noqa: E402
from lib.geometry import add_box, add_plane, add_room_shell  # noqa: E402
from lib.materials import assign, emission_material, flat_material  # noqa: E402
from lib.preview import render_from  # noqa: E402

CHAPTER_ID = "hub"

# Room dimensions in metres (Blender is Z-up: X wide, Y deep, Z high).
WIDTH, DEPTH, HEIGHT = 4.4, 3.6, 2.7

# Window opening in the -Y wall, in that wall's local (u along X, v along Z).
WINDOW = (-0.95, 0.95, 1.05, 2.05)

BENCH_TOP = 0.92


def build() -> Chapter:
    collection = ensure_collection(naming.chapter_name(CHAPTER_ID))
    static: list = []
    dynamic: list = []

    # --- Palette ------------------------------------------------------------
    # Warm, desaturated, low contrast. The bake supplies all the depth, so these
    # only need to be plausible surface colours, not finished-looking ones.
    plaster = flat_material("mat_plaster", (0.58, 0.53, 0.45))
    floorboard = flat_material("mat_floorboard", (0.29, 0.20, 0.13))
    timber = flat_material("mat_timber", (0.42, 0.29, 0.17))
    dark_timber = flat_material("mat_timber_dark", (0.24, 0.17, 0.11))
    metal = flat_material("mat_metal", (0.32, 0.31, 0.30), roughness=0.55)

    # Daylight through the window does most of the lighting work. Cool, so the
    # warm interior surfaces read against it.
    # Strength is tuned so the window reads as bright but keeps some tone --
    # above roughly 5 it clips to flat white and the frame loses its shape.
    daylight = emission_material("mat_daylight", (0.72, 0.82, 1.0), strength=3.6)
    # A single warm bulb keeps the corners from going muddy.
    bulb = emission_material("mat_bulb", (1.0, 0.79, 0.48), strength=18.0)
    dial = emission_material("mat_dial", (1.0, 0.63, 0.24), strength=6.0)

    # --- Room shell ---------------------------------------------------------
    shell = add_room_shell(
        prefix=CHAPTER_ID, width=WIDTH, depth=DEPTH, height=HEIGHT,
        collection=collection, window=WINDOW,
    )
    assign(shell["floor"], floorboard)
    assign(shell["ceiling"], plaster)
    for key in ("wall_front", "wall_back", "wall_left", "wall_right"):
        assign(shell[key], plaster)
    static.extend(shell.values())

    # Glowing plane just outside the opening. Cheaper and far easier to
    # art-direct than a sun lamp aimed through a hole, and it bakes as a
    # believable soft daylight wash across the bench.
    sky = add_plane(
        f"{CHAPTER_ID}_daylight", "Y", -(DEPTH / 2.0) - 0.06,
        (WINDOW[0] - 0.1, WINDOW[1] + 0.1), (WINDOW[2] - 0.1, WINDOW[3] + 0.1),
        collection, facing="+Y",
    )
    assign(sky, daylight)
    static.append(sky)

    # --- Workbench ----------------------------------------------------------
    bench_top = add_box(
        f"{CHAPTER_ID}_bench_top", (2.2, 0.72, 0.08), (0.0, -1.18, BENCH_TOP - 0.04), collection
    )
    assign(bench_top, timber)
    static.append(bench_top)

    for index, x in enumerate((-0.98, 0.98)):
        for depth_index, y in enumerate((-1.48, -0.88)):
            leg = add_box(
                f"{CHAPTER_ID}_bench_leg_{index}{depth_index}",
                (0.08, 0.08, BENCH_TOP - 0.08),
                (x, y, (BENCH_TOP - 0.08) / 2.0),
                collection,
            )
            assign(leg, dark_timber)
            static.append(leg)

    # --- Shelving on the right wall -----------------------------------------
    for index, z in enumerate((1.35, 1.85)):
        plank = add_box(
            f"{CHAPTER_ID}_shelf_{index}", (0.30, 1.9, 0.05), (WIDTH / 2 - 0.16, 0.35, z), collection
        )
        assign(plank, timber)
        static.append(plank)

    # A few boxes on the shelves. Deliberately plain -- they exist to break up
    # the light and give the bake something to cast shadows with.
    for index, (x, y, z, size) in enumerate(
        [
            (WIDTH / 2 - 0.20, 0.95, 1.50, (0.22, 0.30, 0.24)),
            (WIDTH / 2 - 0.18, 0.52, 1.46, (0.20, 0.22, 0.16)),
            (WIDTH / 2 - 0.20, -0.15, 1.99, (0.24, 0.34, 0.22)),
        ]
    ):
        crate = add_box(f"{CHAPTER_ID}_crate_{index}", size, (x, y, z), collection)
        assign(crate, dark_timber if index % 2 else timber)
        static.append(crate)

    # --- Ceiling lamp -------------------------------------------------------
    flex = add_box(f"{CHAPTER_ID}_lamp_flex", (0.03, 0.03, 0.42), (0.0, -0.6, HEIGHT - 0.21), collection)
    assign(flex, metal)
    static.append(flex)

    shade = add_box(f"{CHAPTER_ID}_lamp_shade", (0.30, 0.30, 0.14), (0.0, -0.6, HEIGHT - 0.49), collection)
    assign(shade, metal)
    static.append(shade)

    filament = add_plane(
        f"{CHAPTER_ID}_lamp_light", "Z", HEIGHT - 0.56, (-0.13, 0.13), (-0.73, -0.47),
        collection, facing="-Z",
    )
    assign(filament, bulb)
    static.append(filament)

    # --- Gate: the radio ----------------------------------------------------
    # Kept out of the static merge so the runtime can pick it, highlight it and
    # animate it independently.
    radio = add_box(
        naming.gate_name("radio"), (0.36, 0.22, 0.24), (-0.52, -1.16, BENCH_TOP + 0.12), collection
    )
    assign(radio, dark_timber)
    set_extras(radio, **{naming.EXTRA_GATE_ID: "radio", naming.EXTRA_ROLE: "gate"})
    dynamic.append(radio)

    # Sits just proud of the radio's front face, which is the +Y side -- the
    # side the viewer is standing on.
    radio_dial = add_plane(
        f"{CHAPTER_ID}_radio_dial", "Y", -1.16 + 0.111,
        (-0.66, -0.38), (BENCH_TOP + 0.06, BENCH_TOP + 0.18), collection, facing="+Y",
    )
    assign(radio_dial, dial)
    static.append(radio_dial)

    # --- Anchors ------------------------------------------------------------
    # Authored here rather than hard-coded in TypeScript, because the Blender
    # Z-up to glTF Y-up conversion makes hand-written runtime coordinates a
    # reliable source of sign errors.
    new_empty(naming.VIEWER_ANCHOR, (0.0, 0.75, 0.0), collection)
    # What the viewer faces from that vantage: the bench, under the window.
    new_empty(naming.anchor_name("focus"), (0.0, -1.18, BENCH_TOP + 0.15), collection)

    for obj in [*static, *dynamic]:
        ensure_uv_layer(obj)

    return Chapter(chapter_id=CHAPTER_ID, collection=collection, static=static, dynamic=dynamic)


def main() -> None:
    args = parse()
    reset_scene()
    use_cycles(samples=args.samples)
    chapter = build()

    if args.preview or args.preview_only:
        # Eye height above the authored floor-level vantage.
        preview_path = os.path.join(args.out, f"{CHAPTER_ID}_preview.png")
        render_from(
            preview_path,
            location=(0.0, 0.75, 1.6),
            look_at=(0.0, -1.18, BENCH_TOP + 0.15),
        )
        print(f"[hub] preview {preview_path}", flush=True)
        if args.preview_only:
            finish()

    path = finalize(chapter, out_dir=args.out, atlas_size=args.atlas)
    print(f"[hub] wrote {path}", flush=True)
    finish()


if __name__ == "__main__":
    main()
