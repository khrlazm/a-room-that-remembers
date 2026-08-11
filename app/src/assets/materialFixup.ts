import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';

/** Keys written by content/blender/lib/naming.py. Keep the two in step. */
export const EXTRA_UNLIT = 'unlit';
export const EXTRA_GATE_ID = 'gateId';
export const EXTRA_ROLE = 'role';

type GltfExtras = Record<string, unknown> | undefined;

/** Read the glTF `extras` object Blender attached to a node, if any. */
export function extrasOf(node: { metadata?: unknown }): GltfExtras {
  const metadata = node.metadata as { gltf?: { extras?: Record<string, unknown> } } | undefined;
  return metadata?.gltf?.extras;
}

export function extraString(node: { metadata?: unknown }, key: string): string | undefined {
  const value = extrasOf(node)?.[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Apply the consequences of the Blender tags, then lock the materials down.
 *
 * Lighting for this piece is baked into base colour in Blender, so every
 * surface tagged `unlit` should skip lighting maths entirely. On a standalone
 * headset that is the single biggest per-fragment saving available -- and it is
 * free, because there is no dynamic light in the scene for it to lose.
 */
export function applyBakedMaterials(meshes: AbstractMesh[], scene: Scene): void {
  const seen = new Set<string>();

  for (const mesh of meshes) {
    const material = mesh.material;
    if (!material) continue;

    const unlit = extrasOf(mesh)?.[EXTRA_UNLIT];
    if (unlit && material instanceof PBRMaterial) {
      material.unlit = true;
    }

    if (seen.has(material.uniqueId.toString())) continue;
    seen.add(material.uniqueId.toString());

    if (material instanceof PBRMaterial) {
      // Nothing in a baked scene needs image-processing or fog work per pixel.
      material.disableLighting = true;
      material.environmentIntensity = 0;
    }

    // Freeze once the material is fully configured: this stops Babylon
    // re-evaluating the shader definition every frame. It must come *after*
    // every property assignment above, or those assignments are ignored.
    material.freeze();
  }

  // The scene is static geometry with baked light, so material state cannot
  // change after load. Blocking the dirty mechanism avoids per-frame checks.
  scene.blockMaterialDirtyMechanism = true;
}
