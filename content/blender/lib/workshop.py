"""The workshop, as a kit of parts.

Every era is the same room re-dressed, which is the entire economic argument for
this piece: eight chapters cost roughly one room plus eight prop sets, not eight
rooms. So the shell, bench, shelving and lamp live here, parameterised by an
`Era`, and each scene script only describes what makes its era different.

Adding era seven should be a palette, a light, and a handful of props.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import bpy

from .blendutil import new_empty, set_extras
from .geometry import add_box, add_plane, add_prop, add_room_shell
from .materials import assign, emission_material, flat_material
from .naming import VIEWER_ANCHOR, anchor_name, gate_name

Color = tuple[float, float, float]

# Room dimensions in metres. Blender is Z-up: X wide, Y deep, Z high.
WIDTH, DEPTH, HEIGHT = 4.4, 3.6, 2.7

# Window opening in the -Y wall, in that wall's local (u along X, v along Z).
WINDOW = (-0.95, 0.95, 1.05, 2.05)

BENCH_TOP = 0.92

# The viewer stands here, on the floor, facing the bench and the window beyond.
# Authored once and shared by every chapter so eras cut together without the
# viewpoint shifting under the viewer -- which reads as being shoved.
VIEWER_AT = (0.0, 0.75, 0.0)
FOCUS_AT = (0.0, -1.18, BENCH_TOP + 0.15)


@dataclass
class Era:
    """Everything that distinguishes one era of the room from another."""

    plaster: Color
    floor: Color
    timber: Color
    timber_dark: Color
    metal: Color

    daylight: Color
    daylight_strength: float

    bulb: Color
    bulb_strength: float
    #: Whether the ceiling bulb is switched on at all.
    bulb_on: bool = True

    #: An anglepoise on the bench. When set, this is the only warm light in the
    #: room and it throws one hard pool rather than filling the space -- which
    #: is what a night shift looks like, and what the ceiling bulb cannot do
    #: however far it is dimmed.
    lamp: Color | None = None
    lamp_strength: float = 24.0

    #: Boxes on the shelves: (x_inset, y, z, size). Clutter is era-specific.
    shelf_load: list[tuple[float, float, float, tuple[float, float, float]]] = field(
        default_factory=list
    )


@dataclass
class Room:
    """What a scene script gets back, ready to extend."""

    static: list[bpy.types.Object]
    dynamic: list[bpy.types.Object]
    materials: dict[str, bpy.types.Material]


def build_room(prefix: str, era: Era, collection: bpy.types.Collection) -> Room:
    static: list[bpy.types.Object] = []
    dynamic: list[bpy.types.Object] = []

    plaster = flat_material(f"{prefix}_plaster", era.plaster)
    floorboard = flat_material(f"{prefix}_floor", era.floor)
    timber = flat_material(f"{prefix}_timber", era.timber)
    timber_dark = flat_material(f"{prefix}_timber_dark", era.timber_dark)
    metal = flat_material(f"{prefix}_metal", era.metal, roughness=0.55)
    daylight = emission_material(f"{prefix}_daylight", era.daylight, era.daylight_strength)
    bulb = emission_material(f"{prefix}_bulb", era.bulb, era.bulb_strength)

    materials = {
        "plaster": plaster,
        "floor": floorboard,
        "timber": timber,
        "timber_dark": timber_dark,
        "metal": metal,
        "daylight": daylight,
        "bulb": bulb,
    }

    # --- Shell --------------------------------------------------------------
    shell = add_room_shell(prefix, WIDTH, DEPTH, HEIGHT, collection, window=WINDOW)
    assign(shell["floor"], floorboard)
    assign(shell["ceiling"], plaster)
    for key in ("wall_front", "wall_back", "wall_left", "wall_right"):
        assign(shell[key], plaster)
    static.extend(shell.values())

    # A glowing plane behind the opening rather than a sun lamp aimed through
    # it: far easier to art-direct, and it bakes as a soft daylight wash.
    sky = add_plane(
        f"{prefix}_daylight", "Y", -(DEPTH / 2.0) - 0.06,
        (WINDOW[0] - 0.1, WINDOW[1] + 0.1), (WINDOW[2] - 0.1, WINDOW[3] + 0.1),
        collection, facing="+Y",
    )
    assign(sky, daylight)
    static.append(sky)

    # --- Bench --------------------------------------------------------------
    bench_top = add_box(
        f"{prefix}_bench_top", (2.2, 0.72, 0.08), (0.0, -1.18, BENCH_TOP - 0.04), collection
    )
    assign(bench_top, timber)
    static.append(bench_top)

    for index, x in enumerate((-0.98, 0.98)):
        for depth_index, y in enumerate((-1.48, -0.88)):
            leg = add_box(
                f"{prefix}_bench_leg_{index}{depth_index}",
                (0.08, 0.08, BENCH_TOP - 0.08),
                (x, y, (BENCH_TOP - 0.08) / 2.0),
                collection,
            )
            assign(leg, timber_dark)
            static.append(leg)

    # --- Shelving on the right wall -----------------------------------------
    for index, z in enumerate((1.35, 1.85)):
        plank = add_box(
            f"{prefix}_shelf_{index}", (0.30, 1.9, 0.05), (WIDTH / 2 - 0.16, 0.35, z), collection
        )
        assign(plank, timber)
        static.append(plank)

    for index, (x_inset, y, z, size) in enumerate(era.shelf_load):
        crate = add_box(f"{prefix}_crate_{index}", size, (WIDTH / 2 - x_inset, y, z), collection)
        assign(crate, timber_dark if index % 2 else timber)
        static.append(crate)

    # --- Ceiling lamp -------------------------------------------------------
    flex = add_box(f"{prefix}_lamp_flex", (0.03, 0.03, 0.42), (0.0, -0.6, HEIGHT - 0.21), collection)
    assign(flex, metal)
    static.append(flex)

    shade = add_box(f"{prefix}_lamp_shade", (0.30, 0.30, 0.14), (0.0, -0.6, HEIGHT - 0.49), collection)
    assign(shade, metal)
    static.append(shade)

    if era.bulb_on:
        filament = add_plane(
            f"{prefix}_lamp_light", "Z", HEIGHT - 0.56, (-0.13, 0.13), (-0.73, -0.47),
            collection, facing="-Z",
        )
        assign(filament, bulb)
        static.append(filament)

    # --- Bench lamp ---------------------------------------------------------
    if era.lamp is not None:
        lamp_material = emission_material(f"{prefix}_worklamp", era.lamp, era.lamp_strength)
        materials["lamp"] = lamp_material

        # Clamped to the bench end, reaching over the work. Sits to the right so
        # it lights the bench without standing between the viewer and it.
        base = add_box(
            f"{prefix}_worklamp_base", (0.14, 0.14, 0.03), (0.86, -1.30, BENCH_TOP + 0.015), collection
        )
        assign(base, metal)
        static.append(base)

        post = add_box(
            f"{prefix}_worklamp_post", (0.03, 0.03, 0.44), (0.86, -1.30, BENCH_TOP + 0.24), collection
        )
        assign(post, metal)
        static.append(post)

        # The arm reaches most of the way across the bench, so the pool lands on
        # the work rather than beside it. A shorter arm put the light onto the
        # clock case and left the movement -- the thing the beat is about --
        # lit only by the window.
        arm = add_box(
            f"{prefix}_worklamp_arm", (1.00, 0.03, 0.03), (0.36, -1.24, BENCH_TOP + 0.45), collection
        )
        assign(arm, metal)
        static.append(arm)

        shade = add_box(
            f"{prefix}_worklamp_shade", (0.22, 0.22, 0.11), (-0.12, -1.20, BENCH_TOP + 0.39), collection
        )
        assign(shade, metal)
        static.append(shade)

        # The emitter faces straight down out of the shade, so the pool has a
        # hard edge and the rest of the room stays where it belongs: dark.
        #
        # Hung clear below the shade's underside rather than flush with it. Sat
        # coplanar the shade occludes its own bulb and the lamp contributes
        # nothing at all -- the fixture renders, the room stays lit only by the
        # window, and nothing about the image says why.
        glow = add_plane(
            f"{prefix}_worklamp_glow", "Z", BENCH_TOP + 0.30,
            (-0.22, -0.02), (-1.30, -1.10), collection, facing="-Z",
        )
        assign(glow, lamp_material)
        static.append(glow)

    return Room(static=static, dynamic=dynamic, materials=materials)


def add_anchors(collection: bpy.types.Collection) -> None:
    """Place the viewer vantage and what they face.

    Authored in Blender rather than hard-coded in TypeScript because the Z-up to
    Y-up conversion makes hand-written runtime coordinates a reliable source of
    sign errors.
    """
    new_empty(VIEWER_ANCHOR, VIEWER_AT, collection)
    new_empty(anchor_name("focus"), FOCUS_AT, collection)


def add_radio(
    prefix: str,
    collection: bpy.types.Collection,
    body: bpy.types.Material,
    dial: bpy.types.Material,
    as_gate: bool,
) -> tuple[bpy.types.Object, bpy.types.Object]:
    """The radio on the bench: the object this era belongs to.

    In the hub it is a gate the viewer can look at. Inside its own era it is
    just a radio -- same geometry, no gate tag, so the runtime does not offer
    it as something to trigger while its story is already playing.
    """
    name = gate_name("radio") if as_gate else f"{prefix}_radio"
    radio = add_box(name, (0.36, 0.22, 0.24), (-0.52, -1.16, BENCH_TOP + 0.12), collection)
    assign(radio, body)
    if as_gate:
        set_extras(radio, gateId="radio", role="gate")

    # Sits just proud of the radio's +Y face -- the side the viewer stands on.
    face = add_plane(
        f"{prefix}_radio_dial", "Y", -1.16 + 0.111,
        (-0.66, -0.38), (BENCH_TOP + 0.06, BENCH_TOP + 0.18), collection, facing="+Y",
    )
    assign(face, dial)
    return radio, face


def add_clock(
    prefix: str,
    collection: bpy.types.Collection,
    case: bpy.types.Material,
    face: bpy.types.Material,
    as_gate: bool,
) -> tuple[bpy.types.Object, bpy.types.Object]:
    """A mantel clock on the bench, right of centre.

    Sits opposite the radio so the two gates never crowd each other, and far
    enough apart that a gaze dwelling on one cannot be caught by the other.
    """
    name = gate_name("clock") if as_gate else f"{prefix}_clock"
    body = add_box(name, (0.26, 0.18, 0.34), (0.52, -1.16, BENCH_TOP + 0.17), collection)
    assign(body, case)
    if as_gate:
        set_extras(body, gateId="clock", role="gate")

    # The dial, proud of the +Y face -- the side the viewer stands on.
    dial = add_plane(
        f"{prefix}_clock_face", "Y", -1.16 + 0.091,
        (0.42, 0.62), (BENCH_TOP + 0.16, BENCH_TOP + 0.30), collection, facing="+Y",
    )
    assign(dial, face)
    return body, dial


def add_spectacles(
    prefix: str,
    collection: bpy.types.Collection,
    metal: bpy.types.Material,
    as_gate: bool,
    at: tuple[float, float, float] | None = None,
) -> list[bpy.types.Object]:
    """A pair of spectacles, left arm bent.

    Built from four small pieces rather than one box because the bend is the
    entire point: it is the fault he could have put right in four minutes, and
    it has to be visible enough to read as damage from where the viewer stands.

    Small, so as a gate it sits closer to the front of the bench than the radio
    or the clock -- a thing you have to lean toward rather than one that
    announces itself.
    """
    x, y, z = at if at is not None else (-0.06, -1.32, BENCH_TOP + 0.02)
    parts: list[bpy.types.Object] = []

    name = gate_name("spectacles") if as_gate else f"{prefix}_spectacles"
    front = add_prop(name, (0.14, 0.012, 0.035), (x, y, z), collection)
    assign(front, metal)
    if as_gate:
        set_extras(front, gateId="spectacles", role="gate")
    parts.append(front)

    # Right arm, folded flat along the bench as it should be.
    right = add_prop(f"{prefix}_spec_arm_r", (0.012, 0.11, 0.008), (x + 0.062, y + 0.058, z), collection)
    assign(right, metal)
    parts.append(right)

    # Left arm, splayed out and lifted. She sat on them.
    left = add_prop(f"{prefix}_spec_arm_l", (0.012, 0.11, 0.008), (x - 0.058, y + 0.052, z + 0.012), collection)
    left.rotation_euler = (0.0, -0.42, 0.30)
    assign(left, metal)
    parts.append(left)

    return parts


def add_toolbox(
    prefix: str,
    collection: bpy.types.Collection,
    timber: bpy.types.Material,
    metal: bpy.types.Material,
    as_gate: bool,
) -> list[bpy.types.Object]:
    """His father's toolbox, lid up, at the left rear of the bench.

    Set apart from the other gates: it is the oldest thing in the room and the
    only one that was never a customer's, so it sits where the bench meets the
    wall rather than out at the front with the work.
    """
    x, y, z = -0.86, -1.10, BENCH_TOP
    parts: list[bpy.types.Object] = []

    name = gate_name("toolbox") if as_gate else f"{prefix}_toolbox"
    body = add_box(name, (0.36, 0.22, 0.15), (x, y, z + 0.075), collection)
    assign(body, timber)
    if as_gate:
        set_extras(body, gateId="toolbox", role="gate")
    parts.append(body)

    # Lid, hinged back and standing open.
    lid = add_prop(f"{prefix}_toolbox_lid", (0.36, 0.02, 0.20), (x, y + 0.10, z + 0.24), collection)
    lid.rotation_euler = (0.30, 0.0, 0.0)
    assign(lid, timber)
    parts.append(lid)

    # Chisels laid out by size along the front of the box. The ordering is the
    # characterisation again -- he was taught by someone who did this.
    for index in range(3):
        length = 0.16 + index * 0.03
        chisel = add_box(
            f"{prefix}_chisel_{index}",
            (0.016, length, 0.012),
            (x - 0.10 + index * 0.10, y - 0.24, z + 0.006),
            collection,
        )
        assign(chisel, metal)
        parts.append(chisel)

    return parts


# --- Era presets ------------------------------------------------------------

PRESENT = Era(
    plaster=(0.58, 0.53, 0.45),
    floor=(0.29, 0.20, 0.13),
    timber=(0.42, 0.29, 0.17),
    timber_dark=(0.24, 0.17, 0.11),
    metal=(0.32, 0.31, 0.30),
    # Above roughly 5 the window clips to flat white and loses its shape.
    daylight=(0.72, 0.82, 1.0),
    daylight_strength=3.6,
    bulb=(1.0, 0.79, 0.48),
    bulb_strength=18.0,
    shelf_load=[
        (0.20, 0.95, 1.50, (0.22, 0.30, 0.24)),
        (0.18, 0.52, 1.46, (0.20, 0.22, 0.16)),
        (0.20, -0.15, 1.99, (0.24, 0.34, 0.22)),
    ],
)

#: The earliest era, and the only one lit by nothing but morning. Everything is
#: younger: paler timber, fewer marks, shelves half-stocked because he had not
#: filled them yet. The bulb is off -- it is daylight, and he could not afford
#: the electricity. Hard, clean, and slightly too bright, the way early mornings
#: are when you have been up for hours.
WHAT_HE_WAS_GIVEN = Era(
    plaster=(0.68, 0.65, 0.58),
    floor=(0.38, 0.28, 0.19),
    timber=(0.56, 0.41, 0.24),
    timber_dark=(0.32, 0.23, 0.14),
    metal=(0.40, 0.39, 0.37),
    daylight=(0.92, 0.94, 1.0),
    daylight_strength=5.5,
    bulb=(1.0, 0.79, 0.48),
    bulb_strength=0.0,
    bulb_on=False,
    # Half-stocked. He had not filled them yet.
    shelf_load=[
        (0.20, 0.72, 1.49, (0.22, 0.28, 0.22)),
        (0.19, -0.10, 1.97, (0.20, 0.26, 0.18)),
    ],
)

#: Almost the present. Late, thin, tidy -- by now he was keeping the place
#: rather than working in it. Deliberately within a few percent of PRESENT: the
#: viewer should not be able to say what changed, only that this is nearly now.
#: One notch warmer, and the bulb a little brighter, because he was still here.
HER_GLASSES = Era(
    plaster=(0.59, 0.53, 0.44),
    floor=(0.30, 0.21, 0.13),
    timber=(0.43, 0.30, 0.17),
    timber_dark=(0.25, 0.18, 0.11),
    metal=(0.34, 0.33, 0.32),
    daylight=(0.78, 0.80, 0.94),
    daylight_strength=3.2,
    bulb=(1.0, 0.78, 0.46),
    bulb_strength=21.0,
    shelf_load=[
        (0.20, 0.95, 1.50, (0.22, 0.30, 0.24)),
        (0.18, 0.52, 1.46, (0.20, 0.22, 0.16)),
        (0.20, -0.15, 1.99, (0.24, 0.34, 0.22)),
    ],
)

#: Deep winter, small hours, and the coldest the room ever gets. The ceiling
#: bulb is off entirely: the bench lamp makes one hard pool and everything
#: outside it belongs to the window, which is moonlit snow and the brightest
#: thing anywhere in the piece. It should feel like the only lit place for miles.
THE_LONG_NIGHT = Era(
    plaster=(0.42, 0.44, 0.50),
    floor=(0.20, 0.19, 0.20),
    timber=(0.30, 0.26, 0.22),
    timber_dark=(0.18, 0.16, 0.14),
    metal=(0.34, 0.35, 0.37),
    # Bright, but not so bright it clips to a flat white rectangle and stops
    # reading as snow.
    daylight=(0.62, 0.74, 1.0),
    daylight_strength=1.7,
    bulb=(1.0, 0.79, 0.48),
    bulb_strength=0.0,
    bulb_on=False,
    lamp=(1.0, 0.86, 0.62),
    lamp_strength=42.0,
    shelf_load=[
        (0.20, 0.88, 1.50, (0.22, 0.28, 0.22)),
        (0.19, 0.30, 1.47, (0.20, 0.24, 0.18)),
        (0.20, -0.30, 1.98, (0.22, 0.32, 0.20)),
    ],
)

#: The room when the radio was new: warmer, busier, lit by the bulb rather than
#: by a cold afternoon. The daylight is dimmed and pushed amber so the era reads
#: as evening the moment it cuts in, before any prop registers.
WORKING_YEARS = Era(
    plaster=(0.62, 0.52, 0.38),
    floor=(0.33, 0.22, 0.13),
    timber=(0.50, 0.34, 0.18),
    timber_dark=(0.28, 0.19, 0.11),
    metal=(0.38, 0.35, 0.31),
    daylight=(1.0, 0.68, 0.34),
    # Dim: at evening the bulb should be the brightest thing in the room, and
    # the window a warm rectangle rather than a light source competing with it.
    daylight_strength=0.7,
    bulb=(1.0, 0.72, 0.38),
    bulb_strength=34.0,
    shelf_load=[
        (0.20, 1.05, 1.49, (0.22, 0.26, 0.22)),
        (0.19, 0.72, 1.47, (0.20, 0.24, 0.18)),
        (0.20, 0.36, 1.48, (0.22, 0.28, 0.20)),
        (0.18, -0.05, 1.97, (0.20, 0.30, 0.18)),
        (0.20, -0.42, 1.99, (0.24, 0.30, 0.22)),
    ],
)
