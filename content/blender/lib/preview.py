"""Render a still from the viewer's vantage.

Art direction on a stationary diorama is mostly a question of "what does it look
like from the one place someone stands", and that question should be answerable
without putting on a headset. This renders exactly that view with Cycles, using
the same lighting the bake will capture.
"""

from __future__ import annotations

import bpy
from mathutils import Vector

Vec3 = tuple[float, float, float]


def render_from(
    filepath: str,
    location: Vec3,
    look_at: Vec3,
    resolution: tuple[int, int] = (960, 720),
    samples: int = 48,
    lens_mm: float = 20.0,
) -> None:
    """Render one frame from `location` aimed at `look_at`.

    A wide lens approximates the sense of a headset's field of view -- a default
    50mm reads far tighter than what the viewer actually experiences, which
    makes rooms look larger and better-composed than they are.
    """
    camera_data = bpy.data.cameras.new("preview_camera")
    camera_data.lens = lens_mm
    camera = bpy.data.objects.new("preview_camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)

    camera.location = location
    direction = Vector(look_at) - Vector(location)
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    scene = bpy.context.scene
    previous_camera = scene.camera
    previous_samples = scene.cycles.samples
    scene.camera = camera
    scene.cycles.samples = samples
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = filepath

    bpy.ops.render.render(write_still=True)

    # Leave the scene as we found it: this runs mid-build, before the bake.
    scene.camera = previous_camera
    scene.cycles.samples = previous_samples
    bpy.data.objects.remove(camera, do_unlink=True)
