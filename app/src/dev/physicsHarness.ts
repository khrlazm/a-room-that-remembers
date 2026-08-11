import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';

import type { XrSession } from '../engine/xr';
import { GrabController } from '../story/grab';
import type { PhysicsWorld } from '../physics/world';

/**
 * Phase A proving ground: a handful of boxes you can catch.
 *
 * Exists so grab can be verified on the headset before any coda content is
 * authored. Deliberately placed in the real room at the real vantage, under the
 * room's real lighting -- hand tracking degrades in dim conditions and this
 * piece is set in a dim room, so testing the gesture in a bright scratch scene
 * would prove nothing about whether it works here.
 */
export interface Harness {
  world: PhysicsWorld;
  grab: GrabController;
  dispose(): void;
}

export async function startPhysicsHarness(
  scene: Scene,
  vantage: Vector3,
  xr: XrSession | null,
): Promise<Harness> {
  // Dynamic import: this is what keeps the 2 MB Havok wasm off the initial
  // load for every viewer who never reaches a coda.
  const { createPhysicsWorld, stir } = await import('../physics/world');

  const centre = vantage.add(new Vector3(0, 1.35, 0.55));
  const world = await createPhysicsWorld(scene, centre);

  const palette = [
    new Color3(0.52, 0.36, 0.2),
    new Color3(0.34, 0.3, 0.27),
    new Color3(0.46, 0.42, 0.34),
  ];

  const sizes = [0.16, 0.12, 0.2, 0.14, 0.1, 0.18];
  sizes.forEach((size, index) => {
    const material = new StandardMaterial(`harness-mat-${index}`, scene);
    const tint = palette[index % palette.length];
    material.diffuseColor = tint;
    // Unlit and self-coloured, matching how every baked surface in the piece
    // behaves, so these read against the room rather than floating over it.
    material.emissiveColor = tint.scale(0.55);
    material.specularColor = Color3.Black();

    const box = CreateBox(`harness-box-${index}`, { size }, scene);
    box.material = material;
    const angle = (index / sizes.length) * Math.PI * 2;
    box.position = centre.add(
      new Vector3(Math.cos(angle) * 0.4, (index % 3) * 0.12 - 0.12, Math.sin(angle) * 0.34),
    );

    world.add(box, `harness-${index}`, 0.4);
  });

  stir(world);
  const grab = new GrabController(scene, world, xr);

  console.info(`[harness] ${sizes.length} bodies at ${centre.toString()}`);

  return {
    world,
    grab,
    dispose() {
      grab.dispose();
      world.dispose();
    },
  };
}
