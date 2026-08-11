"""Deterministic atlas packing.

Blender's own `pack_islands` operates across a multi-object edit session, which
does not work reliably in `--background`: only the active object actually enters
edit mode, so every object gets unwrapped into its own full 0-1 square and they
all land on top of each other. The failure is silent -- the bake succeeds and
writes several surfaces into the same texels.

So we unwrap one object at a time (which is reliable) and then place each
object's UVs into its own rectangle of the sheet ourselves. Rectangle area is
proportional to world-space surface area, which keeps texel density roughly
uniform: a 4m wall gets more of the atlas than a 20cm crate.
"""

from __future__ import annotations

import math

import bpy

from .blendutil import select_only

# Fraction of the sheet to fill. The remainder absorbs shelf-packing waste and
# keeps islands clear of the edge, where bilinear filtering would bleed.
TARGET_COVERAGE = 0.82


def _smart_project_single(obj: bpy.types.Object, angle_limit_degrees: float) -> None:
    """Unwrap exactly one object. Single-object edit mode is headless-safe."""
    select_only([obj])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(angle_limit_degrees),
        island_margin=0.02,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")


def _uv_bounds(obj: bpy.types.Object) -> tuple[float, float, float, float]:
    layer = obj.data.uv_layers.active
    us = [datum.uv[0] for datum in layer.data]
    vs = [datum.uv[1] for datum in layer.data]
    return min(us), max(us), min(vs), max(vs)


def _world_area(obj: bpy.types.Object) -> float:
    """Total surface area in square metres, accounting for object scale."""
    scale = obj.scale
    factor = abs(scale[0] * scale[1])  # procedural objects are unscaled; guard anyway
    factor = factor if factor > 0 else 1.0
    return sum(polygon.area for polygon in obj.data.polygons) * factor


def _remap_uvs(
    obj: bpy.types.Object,
    rect: tuple[float, float, float, float],
) -> None:
    """Squeeze an object's existing UVs into `rect` = (x, y, width, height)."""
    x, y, width, height = rect
    u0, u1, v0, v1 = _uv_bounds(obj)
    span_u = max(u1 - u0, 1e-6)
    span_v = max(v1 - v0, 1e-6)

    for datum in obj.data.uv_layers.active.data:
        u, v = datum.uv
        datum.uv = (
            x + ((u - u0) / span_u) * width,
            y + ((v - v0) / span_v) * height,
        )


def _shelf_pack(sizes: list[tuple[float, float]]) -> list[tuple[float, float, float, float]] | None:
    """Place rectangles in rows, tallest first. Returns None if they overflow.

    A full bin-packer would fit marginally more, but shelf packing is a handful
    of lines and the leftover waste is already absorbed by TARGET_COVERAGE.
    """
    order = sorted(range(len(sizes)), key=lambda i: sizes[i][1], reverse=True)
    placed: list[tuple[float, float, float, float] | None] = [None] * len(sizes)

    cursor_x = 0.0
    cursor_y = 0.0
    row_height = 0.0

    for index in order:
        width, height = sizes[index]
        if width > 1.0 or height > 1.0:
            return None
        if cursor_x + width > 1.0:
            # Start a new shelf.
            cursor_y += row_height
            cursor_x = 0.0
            row_height = 0.0
        if cursor_y + height > 1.0:
            return None
        placed[index] = (cursor_x, cursor_y, width, height)
        cursor_x += width
        row_height = max(row_height, height)

    return [rect for rect in placed if rect is not None] if all(
        rect is not None for rect in placed
    ) else None


def pack_into_atlas(
    objects: list[bpy.types.Object],
    angle_limit_degrees: float = 66.0,
    gutter: float = 0.004,
) -> float:
    """Unwrap every object and give each a non-overlapping slice of one sheet.

    Returns the fraction of the sheet covered, so the caller can report it and
    a regression in packing quality is visible rather than silent.
    """
    if not objects:
        return 0.0

    for obj in objects:
        _smart_project_single(obj, angle_limit_degrees)

    areas = [max(_world_area(obj), 1e-6) for obj in objects]
    total_area = sum(areas)

    # Preserve each object's UV aspect ratio so remapping does not stretch texel
    # density along one axis.
    aspects = []
    for obj in objects:
        u0, u1, v0, v1 = _uv_bounds(obj)
        span_u = max(u1 - u0, 1e-6)
        span_v = max(v1 - v0, 1e-6)
        aspects.append(span_u / span_v)

    coverage = TARGET_COVERAGE
    for _ in range(24):
        scale = coverage / total_area
        sizes = []
        for area, aspect in zip(areas, aspects):
            height = math.sqrt((area * scale) / aspect)
            width = aspect * height
            sizes.append((width + gutter, height + gutter))

        rects = _shelf_pack(sizes)
        if rects is not None:
            for obj, (x, y, width, height) in zip(objects, rects):
                _remap_uvs(obj, (x + gutter / 2, y + gutter / 2, width - gutter, height - gutter))
            return sum(w * h for _, _, w, h in rects)

        # Did not fit; shrink and try again.
        coverage *= 0.85

    raise RuntimeError("atlas packing failed to converge -- too many objects for one sheet?")
