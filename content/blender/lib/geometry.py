"""Procedural geometry primitives, built from explicit vertices.

Everything is authored Z-up (Blender convention). Rectangles are described in a
local (u, v) plane and then mapped onto a world axis, which keeps the fiddly
winding logic in one place instead of scattered through every wall.
"""

from __future__ import annotations

import bpy

from .blendutil import new_mesh_object

Vec3 = tuple[float, float, float]
Quad2 = tuple[tuple[float, float], tuple[float, float], tuple[float, float], tuple[float, float]]


# --- Boxes ------------------------------------------------------------------


def box_geometry(size: Vec3, center: Vec3, inward: bool = False):
    """Vertices and faces for an axis-aligned box.

    `inward=True` reverses every face so the box is visible from inside, which
    is what a room shell needs -- otherwise backface culling makes the room
    invisible from the one place the viewer actually stands.
    """
    hx, hy, hz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
    cx, cy, cz = center

    verts: list[Vec3] = [
        (cx - hx, cy - hy, cz - hz),  # 0
        (cx + hx, cy - hy, cz - hz),  # 1
        (cx + hx, cy + hy, cz - hz),  # 2
        (cx - hx, cy + hy, cz - hz),  # 3
        (cx - hx, cy - hy, cz + hz),  # 4
        (cx + hx, cy - hy, cz + hz),  # 5
        (cx + hx, cy + hy, cz + hz),  # 6
        (cx - hx, cy + hy, cz + hz),  # 7
    ]

    faces: list[tuple[int, ...]] = [
        (0, 3, 2, 1),  # bottom  (-Z)
        (4, 5, 6, 7),  # top     (+Z)
        (0, 1, 5, 4),  # front   (-Y)
        (1, 2, 6, 5),  # right   (+X)
        (2, 3, 7, 6),  # back    (+Y)
        (3, 0, 4, 7),  # left    (-X)
    ]

    if inward:
        faces = [tuple(reversed(face)) for face in faces]

    return verts, faces


def add_box(
    name: str,
    size: Vec3,
    center: Vec3,
    collection: bpy.types.Collection,
    inward: bool = False,
) -> bpy.types.Object:
    verts, faces = box_geometry(size, center, inward)
    return new_mesh_object(name, verts, faces, collection)


def add_prop(
    name: str,
    size: Vec3,
    at: Vec3,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """A box whose origin sits at its own centre.

    `add_box` writes vertices at absolute coordinates and leaves the object
    origin at the world origin. That is harmless for anything destined to be
    merged into one static mesh, where the transform is thrown away anyway --
    but it is fatal for a physics body. A rigid body is placed where its
    *transform* says, so a whole set of props built that way all report a
    position of (0, 0, 0): containment measures their distance from the origin
    rather than from where they appear, and a grab measures the reach to the
    origin instead of to the object.

    Anything that will move at runtime, or be positioned by the runtime at all,
    should be built with this.
    """
    obj = add_box(name, size, (0.0, 0.0, 0.0), collection)
    obj.location = at
    return obj


# --- Planar rectangles ------------------------------------------------------


def _map_uv(axis: str, offset: float, u: float, v: float) -> Vec3:
    """Map a local (u, v) point onto a world-space plane perpendicular to `axis`."""
    if axis == "Z":
        return (u, v, offset)
    if axis == "Y":
        return (u, offset, v)
    if axis == "X":
        return (offset, u, v)
    raise ValueError(f"axis must be one of X, Y, Z -- got {axis!r}")


# Which way a quad faces when its corners are wound (u0,v0) -> (u1,v0) ->
# (u1,v1) -> (u0,v1), for each plane orientation. Derived from the cross product
# of the u and v directions under _map_uv: Z gives X*Y = +Z, Y gives X*Z = -Y,
# X gives Y*Z = +X.
_NATURAL_NORMAL = {"Z": "+Z", "Y": "-Y", "X": "+X"}


def _needs_flip(axis: str, facing: str) -> bool:
    natural = _NATURAL_NORMAL[axis]
    if facing not in ("+X", "-X", "+Y", "-Y", "+Z", "-Z"):
        raise ValueError(f"facing must look like '+Y' -- got {facing!r}")
    if facing[1] != axis:
        raise ValueError(f"a plane on axis {axis} cannot face {facing}")
    return facing != natural


def rect_with_hole(
    u0: float,
    u1: float,
    v0: float,
    v1: float,
    hole: tuple[float, float, float, float] | None = None,
) -> list[Quad2]:
    """A rectangle in (u, v), optionally with a rectangular hole punched in it.

    Returns the four surrounding strips rather than an n-gon, so the result
    triangulates cleanly and bakes without artefacts across the opening.
    """
    if hole is None:
        return [((u0, v0), (u1, v0), (u1, v1), (u0, v1))]

    hu0, hu1, hv0, hv1 = hole
    return [
        ((u0, v0), (u1, v0), (u1, hv0), (u0, hv0)),      # below the hole
        ((u0, hv1), (u1, hv1), (u1, v1), (u0, v1)),      # above the hole
        ((u0, hv0), (hu0, hv0), (hu0, hv1), (u0, hv1)),  # left of the hole
        ((hu1, hv0), (u1, hv0), (u1, hv1), (hu1, hv1)),  # right of the hole
    ]


def add_plane(
    name: str,
    axis: str,
    offset: float,
    u_range: tuple[float, float],
    v_range: tuple[float, float],
    collection: bpy.types.Collection,
    facing: str,
    hole: tuple[float, float, float, float] | None = None,
) -> bpy.types.Object:
    """A flat surface on a world-axis-aligned plane, optionally with an opening.

    `facing` is the direction the surface's normal should point, written as
    "+Y", "-Z" and so on. Callers state the intent -- "this wall faces into the
    room" -- and the winding is derived, rather than callers reasoning about
    vertex order per orientation. An earlier version took a raw `flip` boolean
    and every one of the six room faces was set backwards: the room culled away
    from the inside, and the interior baked black because Cycles was shading
    backfaces.
    """
    flip = _needs_flip(axis, facing)
    quads = rect_with_hole(u_range[0], u_range[1], v_range[0], v_range[1], hole)

    verts: list[Vec3] = []
    faces: list[tuple[int, ...]] = []
    for quad in quads:
        base = len(verts)
        for u, v in quad:
            verts.append(_map_uv(axis, offset, u, v))
        face = (base, base + 1, base + 2, base + 3)
        faces.append(tuple(reversed(face)) if flip else face)

    return new_mesh_object(name, verts, faces, collection)


# --- Composite shapes -------------------------------------------------------


def add_room_shell(
    prefix: str,
    width: float,
    depth: float,
    height: float,
    collection: bpy.types.Collection,
    window: tuple[float, float, float, float] | None = None,
) -> dict[str, bpy.types.Object]:
    """Floor, ceiling and four walls, all facing inward.

    The room sits with its floor at z=0, centred on the x/y origin. `window` is
    a (u0, u1, v0, v1) opening punched into the -Y wall, in that wall's local
    coordinates (u along X, v along Z).

    Walls are separate objects so they can carry different materials during the
    bake. They get merged into a single mesh afterwards, so the object count
    here has no runtime cost.
    """
    hw, hd = width / 2.0, depth / 2.0

    # Every surface faces inward, toward the only place a viewer ever stands.
    parts = {
        "floor": add_plane(
            f"{prefix}_floor", "Z", 0.0, (-hw, hw), (-hd, hd), collection, facing="+Z"
        ),
        "ceiling": add_plane(
            f"{prefix}_ceiling", "Z", height, (-hw, hw), (-hd, hd), collection, facing="-Z"
        ),
        # The -Y wall is the one carrying the window.
        "wall_front": add_plane(
            f"{prefix}_wall_front", "Y", -hd, (-hw, hw), (0.0, height), collection,
            facing="+Y", hole=window,
        ),
        "wall_back": add_plane(
            f"{prefix}_wall_back", "Y", hd, (-hw, hw), (0.0, height), collection, facing="-Y"
        ),
        "wall_left": add_plane(
            f"{prefix}_wall_left", "X", -hw, (-hd, hd), (0.0, height), collection, facing="+X"
        ),
        "wall_right": add_plane(
            f"{prefix}_wall_right", "X", hw, (-hd, hd), (0.0, height), collection, facing="-X"
        ),
    }
    return parts
