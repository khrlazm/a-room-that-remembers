"""Neutral lighting for the codas.

Uses the world background rather than a dome of geometry. Cycles treats the
world as light arriving from every direction, which is exactly what a dome mesh
would have been built to fake -- and it needs no sphere, no flipped normals, and
no object sitting in the export waiting to be excluded from it.

The point is directionlessness. Everything in the era chapters is lit warmly
from a window and baked with that direction fixed in place; the moment such an
object floats and turns, its shading argues with where it now is. A coda is
lit from nowhere in particular, so nothing it contains can contradict its own
orientation, and the form is carried by baked ambient occlusion instead. See
`occluded_material()` in lib/materials.py.

The world is not exported. In the runtime these objects sit against the scene's
own dark clear colour, so the coda reads as a void with the room's things
suspended in it.
"""

from __future__ import annotations

import bpy

Color = tuple[float, float, float]


def set_dome(color: Color = (0.55, 0.57, 0.62), strength: float = 1.5) -> None:
    """Light the scene evenly from all directions.

    A touch cool by default, so a coda reads as a different kind of light from
    the era it follows rather than as the same room with the lamp turned up.
    """
    scene = bpy.context.scene
    world = scene.world
    if world is None:
        world = bpy.data.worlds.new("coda_dome")
        scene.world = world

    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()

    output = tree.nodes.new("ShaderNodeOutputWorld")
    output.location = (400, 0)

    lit = tree.nodes.new("ShaderNodeBackground")
    lit.location = (0, 60)
    lit.inputs["Color"].default_value = (*color, 1.0)
    lit.inputs["Strength"].default_value = strength

    # Black to the camera, bright to everything else. Rays that bounce off
    # geometry still see the dome, so the lighting is unchanged -- but the
    # preview renders against the void the runtime actually shows, instead of a
    # bright grey field that exists only inside Blender.
    void = tree.nodes.new("ShaderNodeBackground")
    void.location = (0, -120)
    void.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    void.inputs["Strength"].default_value = 1.0

    light_path = tree.nodes.new("ShaderNodeLightPath")
    light_path.location = (0, 320)

    mix = tree.nodes.new("ShaderNodeMixShader")
    mix.location = (200, 0)

    tree.links.new(light_path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    tree.links.new(lit.outputs["Background"], mix.inputs[1])
    tree.links.new(void.outputs["Background"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], output.inputs["Surface"])


def clear_dome() -> None:
    """Return the world to black, for chapters lit by their own emitters.

    The era and hub chapters light themselves from a window and a bulb; leaving
    a bright world in place would wash out the very contrast their bakes depend
    on.
    """
    scene = bpy.context.scene
    if scene.world is None:
        return
    scene.world.use_nodes = True
    tree = scene.world.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputWorld")
    background = tree.nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    background.inputs["Strength"].default_value = 0.0
    tree.links.new(background.outputs["Background"], output.inputs["Surface"])
