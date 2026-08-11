"""The Blender -> glTF -> Babylon naming contract.

These prefixes and keys are the API between the authoring scripts here and the
runtime in app/src/. `tools/validate.mjs` enforces them against the exported
glTF, so renaming something here without updating both sides fails the build
rather than shipping a scene the runtime cannot address.
"""

# --- Node name prefixes -----------------------------------------------------

# One collection per chapter; one .glb per chapter; one AssetContainer per .glb.
CHAPTER_PREFIX = "CH_"

# Empties marking positions the runtime needs to know about (viewer vantage,
# audio emitters, where an era's props converge).
ANCHOR_PREFIX = "ANCHOR_"

# Objects the viewer can gaze-dwell on to trigger a chapter transition.
GATE_PREFIX = "GATE_"

# Animation names, read back as Babylon AnimationGroups.
ANIM_PREFIX = "ANIM_"

# Everything static in a chapter is merged into one object under this name so
# it draws in a single call. Gates stay separate -- they must be individually
# addressable for gaze picking and highlight animation.
STATIC_SUFFIX = "_static"


# --- glTF `extras` keys -----------------------------------------------------
# Blender custom properties land in glTF `extras`, which Babylon exposes at
# `node.metadata.gltf.extras`. This is the seam that lets content gain
# behaviour by being tagged in Blender, with no runtime code change.

# Marks a material whose lighting is already baked into its base colour, so the
# runtime should disable lighting entirely (PBRMaterial.unlit = true).
EXTRA_UNLIT = "unlit"

# Stable identifier tying a gate object to its era chapter in content/story.json.
EXTRA_GATE_ID = "gateId"

# Free-form role tag ("bench", "window", "floor") for anything that needs
# special handling without relying on a fragile name match.
EXTRA_ROLE = "role"


# --- Well-known names -------------------------------------------------------

# The viewer's fixed vantage point. The XR reference space is offset so this
# empty sits under the viewer's feet -- the piece is a stationary diorama, so
# this is authored once in Blender and never moved at runtime.
VIEWER_ANCHOR = ANCHOR_PREFIX + "viewer"


def chapter_name(chapter_id: str) -> str:
    return f"{CHAPTER_PREFIX}{chapter_id}"


def gate_name(gate_id: str) -> str:
    return f"{GATE_PREFIX}{gate_id}"


def anchor_name(anchor_id: str) -> str:
    return f"{ANCHOR_PREFIX}{anchor_id}"


def static_name(chapter_id: str) -> str:
    return f"{CHAPTER_PREFIX}{chapter_id}{STATIC_SUFFIX}"
