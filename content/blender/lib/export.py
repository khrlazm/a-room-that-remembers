"""glTF export settings.

Deliberately explicit rather than relying on exporter defaults, which change
between Blender releases and would otherwise silently alter what the runtime
receives after a version bump.
"""

from __future__ import annotations

import os

import bpy


def export_glb(filepath: str) -> None:
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        # Without this, every custom property set by set_extras() is dropped and
        # the runtime sees untagged nodes it cannot identify.
        export_extras=True,
        # Bake modifiers into the exported mesh (Smooth by Angle, in our case).
        export_apply=True,
        # glTF is Y-up; Blender authors Z-up. This is the conversion.
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        # Tangents are only needed for normal maps, which a flat stylised look
        # has none of. They would add a vec4 per vertex for nothing.
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        # Cameras and lights are authoring aids. The runtime supplies its own
        # camera via WebXR, and the lighting is already baked into pixels.
        export_cameras=False,
        export_lights=False,
        export_skins=False,
        export_morph=False,
        export_animations=True,
        export_frame_range=False,
        export_optimize_animation_size=True,
        use_selection=False,
        use_visible=False,
        use_renderable=False,
    )
