"""Abstract mannequin figures for the codas.

Faceless and simplified on purpose. They are not portraits: the piece never
names the people it is about, and a figure detailed enough to have a face
invites the viewer to decide whether it looks like anyone. Blank forms let them
supply the person themselves.

Built from the same boxes as everything else, so they cost nothing new in the
pipeline, and they never move -- no armature, no skinning, and the bake works on
them exactly as it does on a bench. In a coda the objects drift and can be
caught; the figures do not and cannot. You can rearrange the props of a memory,
not the people in it.
"""

from __future__ import annotations

import math

import bpy

from .geometry import add_box
from .materials import assign

Vec3 = tuple[float, float, float]


def _limb(
    name: str,
    size: tuple[float, float, float],
    pivot: Vec3,
    rotation: Vec3,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """A box that hangs from `pivot` and rotates about it.

    Geometry is built with its top face on the object's own origin so rotation
    happens at the joint.
    """
    length = size[2]
    obj = add_box(name, size, (0.0, 0.0, -length / 2.0), collection)
    obj.location = pivot
    obj.rotation_euler = rotation
    return obj


def _part(
    name: str,
    size: tuple[float, float, float],
    at: Vec3,
    rotation: Vec3,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """A box centred on `at`, rotating about its own middle.

    `add_box` writes vertices at absolute coordinates while the object's origin
    stays at the world origin, so anything built in place and then rotated
    swings around the world origin instead of itself -- which scattered the
    first set of figures across the room. Building at the local origin and
    moving the object afterwards keeps the pivot where a body part's pivot
    should be.
    """
    obj = add_box(name, size, (0.0, 0.0, 0.0), collection)
    obj.location = at
    obj.rotation_euler = rotation
    return obj


def add_figure(
    prefix: str,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    at: Vec3,
    facing: float = 0.0,
    height: float = 1.72,
    *,
    seated: bool = False,
    arm_swing: tuple[float, float] = (0.25, -0.15),
    lean: float = 0.0,
) -> list[bpy.types.Object]:
    """One standing or seated figure. Returns its parts, all static.

    `facing` is a yaw in radians; `arm_swing` pitches each arm forward or back
    so a group of figures does not read as a rank of identical dummies. `lean`
    tips the whole torso, which is most of what makes a figure look like it is
    attending to something rather than standing to attention.
    """
    parts: list[bpy.types.Object] = []
    x, y, z = at

    # Proportions as fractions of total height, roughly classical.
    head_h = height * 0.13
    torso_h = height * 0.30
    hip_h = height * 0.09
    leg_h = height * 0.48
    shoulder_w = height * 0.23
    arm_len = height * 0.30

    hip_z = z + (leg_h if not seated else leg_h * 0.52)
    torso_z = hip_z + hip_h
    shoulder_z = torso_z + torso_h

    def place(obj: bpy.types.Object) -> bpy.types.Object:
        assign(obj, material)
        parts.append(obj)
        return obj

    # --- Torso -------------------------------------------------------------
    place(
        _part(
            f"{prefix}_chest",
            (shoulder_w, height * 0.13, torso_h),
            (x, y, torso_z + torso_h / 2.0),
            (lean, 0.0, facing),
            collection,
        )
    )
    place(
        _part(
            f"{prefix}_hips",
            (shoulder_w * 0.82, height * 0.12, hip_h),
            (x, y, hip_z + hip_h / 2.0),
            (0.0, 0.0, facing),
            collection,
        )
    )

    # --- Head --------------------------------------------------------------
    place(
        _limb(
            f"{prefix}_neck", (height * 0.045, height * 0.045, height * 0.05),
            (x, y, shoulder_z + height * 0.05), (0.0, 0.0, facing), collection,
        )
    )
    place(
        _part(
            f"{prefix}_head",
            (height * 0.10, height * 0.11, head_h),
            (x, y, shoulder_z + height * 0.05 + head_h / 2.0),
            (lean * 0.5, 0.0, facing),
            collection,
        )
    )

    # --- Arms --------------------------------------------------------------
    for side, (sign, swing) in enumerate(zip((-1.0, 1.0), arm_swing)):
        offset_x = math.cos(facing) * sign * shoulder_w * 0.58
        offset_y = math.sin(facing) * sign * shoulder_w * 0.58
        upper = _limb(
            f"{prefix}_arm_upper_{side}",
            (height * 0.05, height * 0.05, arm_len * 0.52),
            (x + offset_x, y + offset_y, shoulder_z),
            (swing, 0.0, facing),
            collection,
        )
        place(upper)

        # Forearm hangs from the elbow, which is wherever the upper arm ended.
        elbow_drop = arm_len * 0.52
        lower = _limb(
            f"{prefix}_arm_lower_{side}",
            (height * 0.042, height * 0.042, arm_len * 0.48),
            (
                x + offset_x + math.sin(swing) * elbow_drop * math.cos(facing),
                y + offset_y + math.sin(swing) * elbow_drop * math.sin(facing),
                shoulder_z - math.cos(swing) * elbow_drop,
            ),
            (swing * 0.4, 0.0, facing),
            collection,
        )
        place(lower)

    # --- Legs --------------------------------------------------------------
    for side, sign in enumerate((-1.0, 1.0)):
        offset_x = math.cos(facing) * sign * shoulder_w * 0.26
        offset_y = math.sin(facing) * sign * shoulder_w * 0.26
        # Seated: thighs forward and level, shins down. Standing: both vertical.
        thigh_pitch = math.radians(88.0) if seated else 0.0
        thigh = _limb(
            f"{prefix}_leg_upper_{side}",
            (height * 0.062, height * 0.062, leg_h * 0.5),
            (x + offset_x, y + offset_y, hip_z),
            (thigh_pitch, 0.0, facing),
            collection,
        )
        place(thigh)

        knee_z = hip_z - (0.0 if seated else leg_h * 0.5)
        knee_forward = leg_h * 0.5 if seated else 0.0
        shin = _limb(
            f"{prefix}_leg_lower_{side}",
            (height * 0.055, height * 0.055, leg_h * 0.5),
            (
                x + offset_x + math.sin(facing) * knee_forward,
                y + offset_y - math.cos(facing) * knee_forward,
                knee_z,
            ),
            (0.0, 0.0, facing),
            collection,
        )
        place(shin)

    return parts
