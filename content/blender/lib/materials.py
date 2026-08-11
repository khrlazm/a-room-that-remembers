"""Material construction, and the plumbing Cycles baking requires.

The pipeline uses materials twice, for two different purposes:

1. **During the bake** they describe how surfaces respond to light -- albedo,
   roughness, emission. Cycles reads these to compute the lighting.
2. **After the bake** they are all thrown away and replaced by a single shared
   material whose base colour *is* the baked result. Lighting has become pixels,
   so nothing needs to respond to light any more.

That second step is why the whole chapter can collapse to one draw call.
"""

from __future__ import annotations

import bpy

Color = tuple[float, float, float]

# Name of the image-texture node the baker targets. Cycles bakes into whichever
# image-texture node is *active* in each material, so every material must carry
# one and it must be selected -- a step that fails silently if missed, producing
# a blank atlas rather than an error.
BAKE_NODE_NAME = "BakeTarget"


def _clear_nodes(material: bpy.types.Material) -> bpy.types.NodeTree:
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    return tree


def flat_material(name: str, color: Color, roughness: float = 0.85) -> bpy.types.Material:
    """A plain matte surface. Stylised look: no metal, no specular highlights."""
    material = bpy.data.materials.new(name)
    tree = _clear_nodes(material)

    output = tree.nodes.new("ShaderNodeOutputMaterial")
    output.location = (300, 0)

    principled = tree.nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (0, 0)
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = 0.0

    tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


def emission_material(name: str, color: Color, strength: float = 4.0) -> bpy.types.Material:
    """A surface that emits light -- window glow, lamp shades, the radio dial.

    Emissive surfaces are how this pipeline lights a room: there are few or no
    lamp objects, because area lights are harder to art-direct than a glowing
    plane you can see and position.
    """
    material = bpy.data.materials.new(name)
    tree = _clear_nodes(material)

    output = tree.nodes.new("ShaderNodeOutputMaterial")
    output.location = (300, 0)

    emission = tree.nodes.new("ShaderNodeEmission")
    emission.location = (0, 0)
    emission.inputs["Color"].default_value = (*color, 1.0)
    emission.inputs["Strength"].default_value = strength

    tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def attach_bake_target(material: bpy.types.Material, image: bpy.types.Image) -> None:
    """Give a material somewhere for Cycles to bake into.

    The node is added but left unconnected: it is a *destination*, not part of
    the shading graph. Cycles picks it because it is the active node.
    """
    tree = material.node_tree
    node = tree.nodes.get(BAKE_NODE_NAME)
    if node is None:
        node = tree.nodes.new("ShaderNodeTexImage")
        node.name = BAKE_NODE_NAME
        node.label = BAKE_NODE_NAME
        node.location = (-400, -300)

    node.image = image
    node.select = True
    tree.nodes.active = node


def baked_material(name: str, image: bpy.types.Image) -> bpy.types.Material:
    """The post-bake replacement material: baked pixels straight to base colour.

    Exported as an ordinary Principled material so it round-trips through glTF
    without relying on exporter-specific unlit detection. The runtime switches
    it to `PBRMaterial.unlit` based on the `unlit` extra tag, which is
    deterministic in a way that guessing from the node graph is not.
    """
    material = bpy.data.materials.new(name)
    tree = _clear_nodes(material)

    # Blender materials default to double-sided, which exports as
    # `doubleSided: true` and doubles fragment work on a mobile GPU for surfaces
    # the viewer can never see the back of. The room is watertight from the one
    # vantage that exists, so culling is free performance.
    material.use_backface_culling = True

    output = tree.nodes.new("ShaderNodeOutputMaterial")
    output.location = (300, 0)

    principled = tree.nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (0, 0)
    principled.inputs["Roughness"].default_value = 1.0
    principled.inputs["Metallic"].default_value = 0.0

    texture = tree.nodes.new("ShaderNodeTexImage")
    texture.location = (-350, 0)
    texture.image = image
    texture.interpolation = "Linear"

    tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


def assign(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    """Replace every material slot on `obj` with a single material."""
    obj.data.materials.clear()
    obj.data.materials.append(material)


def new_bake_image(name: str, size: int) -> bpy.types.Image:
    """Create the atlas a chapter bakes into.

    Non-colour data is *not* wanted here: this holds final visible colour, so it
    stays in sRGB and reads back correctly as a base-colour texture.
    """
    image = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=False)
    image.colorspace_settings.name = "sRGB"
    return image
