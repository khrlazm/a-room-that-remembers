import '@babylonjs/loaders/glTF/2.0';

import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import { applyBakedMaterials, extraString, EXTRA_GATE_ID } from './materialFixup';

/** Prefixes from content/blender/lib/naming.py. */
const ANCHOR_PREFIX = 'ANCHOR_';

export interface Gate {
  id: string;
  mesh: AbstractMesh;
}

export interface Chapter {
  id: string;
  container: AssetContainer;
  /** Empties exported from Blender, keyed without the ANCHOR_ prefix. */
  anchors: Map<string, TransformNode>;
  /** Gaze targets, keyed by the `gateId` extra. */
  gates: Map<string, Gate>;
  addToScene(): void;
  /** Toggle visibility without unloading. Used to swap the hub for an era. */
  setVisible(visible: boolean): void;
  dispose(): void;
}

function chapterUrl(base: string, id: string): string {
  // import.meta.env.BASE_URL carries Vite's `base`, so this resolves correctly
  // both at the root locally and under /<repo>/ on GitHub Pages.
  return `${base}assets/chapters/${id}.glb`;
}

/**
 * Load one chapter as a detached AssetContainer.
 *
 * Containers rather than direct scene loads, because the piece streams: at most
 * the hub plus one era is resident at a time, and a container can be added and
 * removed from the scene without re-parsing the file.
 */
export async function loadChapter(scene: Scene, id: string): Promise<Chapter> {
  const container = await LoadAssetContainerAsync(chapterUrl(import.meta.env.BASE_URL, id), scene);

  applyBakedMaterials(container.meshes, scene);

  const anchors = new Map<string, TransformNode>();
  for (const node of [...container.transformNodes, ...container.meshes]) {
    if (node.name.startsWith(ANCHOR_PREFIX)) {
      anchors.set(node.name.slice(ANCHOR_PREFIX.length), node as TransformNode);
    }
  }

  const gates = new Map<string, Gate>();
  for (const mesh of container.meshes) {
    // Nothing is pickable unless it is a gate. The merged static mesh is the
    // entire room in one object, so leaving it pickable would make every gaze
    // ray test the whole room's geometry, every frame, for nothing.
    mesh.isPickable = false;

    const gateId = extraString(mesh, EXTRA_GATE_ID);
    if (gateId) {
      mesh.isPickable = true;
      gates.set(gateId, { id: gateId, mesh });
    }
  }

  let added = false;
  return {
    id,
    container,
    anchors,
    gates,
    addToScene() {
      if (added) return;
      container.addAllToScene();
      added = true;
    },
    setVisible(visible: boolean) {
      // Toggling enabled rather than adding and removing from the scene: the
      // hub is resident for the whole piece and re-adding a container re-runs
      // scene registration for no benefit. A disabled mesh costs nothing.
      for (const node of container.rootNodes) node.setEnabled(visible);
    },
    dispose() {
      if (added) container.removeAllFromScene();
      container.dispose();
      added = false;
    },
  };
}

/** World position of a named anchor, or null if the chapter did not export it. */
export function anchorPosition(chapter: Chapter, name: string): Vector3 | null {
  const node = chapter.anchors.get(name);
  if (!node) return null;
  node.computeWorldMatrix(true);
  return node.getAbsolutePosition().clone();
}
