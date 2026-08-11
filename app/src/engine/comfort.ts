import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Nullable } from '@babylonjs/core/types';
import type { Observer } from '@babylonjs/core/Misc/observable';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';

import { FrameClock } from './clock';

/**
 * Rendering groups. In-world UI draws above the room; the fader draws above
 * everything, because a fade that anything can show through is not a fade.
 */
export const UI_RENDER_GROUP = 2;
export const FADER_RENDER_GROUP = 3;

/**
 * Fade to black between beats.
 *
 * Has to be geometry, not a DOM overlay: in an immersive session the page is
 * not what the viewer sees, so CSS cannot dim anything. This is a small sphere
 * around the camera, drawn last, with animated opacity.
 *
 * Fades are the main comfort tool in a piece where the world changes around a
 * stationary viewer. Cutting straight from one era to another is disorienting
 * in a way it simply is not on a flat screen -- the viewer's own body stays
 * put while everything else teleports.
 */
export class Fader {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly scene: Scene;
  private current = 0;
  private observer: Nullable<Observer<Scene>> = null;
  private readonly clock = new FrameClock();

  constructor(scene: Scene) {
    this.scene = scene;
    this.material = new StandardMaterial('fader-mat', scene);
    this.material.diffuseColor = Color3.Black();
    this.material.emissiveColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.material.disableLighting = true;
    // Seen from the inside, so keep the far side.
    this.material.backFaceCulling = false;
    this.material.alpha = 0;

    // Sized generously on purpose. In an immersive session each eye renders
    // from roughly +/-32mm either side of the rig origin this is parented to,
    // and the XR camera's near plane sits at 0.1 -- a tight sphere clips into
    // the near plane at the edges and leaves the fade visibly incomplete in
    // peripheral vision. 0.6m of radius clears both comfortably while staying
    // well inside the nearest scene geometry.
    this.mesh = CreateSphere('fader', { diameter: 1.2, segments: 12 }, scene);
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.infiniteDistance = false;
    this.mesh.renderingGroupId = FADER_RENDER_GROUP;
    // Parented to a camera and always on-screen: skip the culling test that
    // would otherwise be computed from a bounding box moving every frame.
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.setEnabled(false);

    // Clear depth before this group renders. Without it the sphere is
    // depth-tested against the room and anything nearer than 0.6m punches
    // straight through the fade -- so the "black" would have furniture in it.
    scene.setRenderingAutoClearDepthStencil(FADER_RENDER_GROUP, true, true, false);
  }

  /** Follow a camera. Called again when the active camera changes for XR. */
  attach(camera: Camera): void {
    this.mesh.parent = camera;
    this.mesh.position.setAll(0);
  }

  get opacity(): number {
    return this.current;
  }

  /**
   * Animate opacity to `target` over `durationMs`. Resolves when it lands.
   *
   * Driven by the scene's render loop rather than `requestAnimationFrame`.
   * Inside an immersive session Babylon renders from the XR device's frame
   * callback, not from `rAF` -- so an rAF-based fade freezes in VR, which is
   * the one place a fade actually has a job to do. Accumulating engine delta
   * time also keeps the fade honest if the frame rate drops.
   */
  to(target: number, durationMs: number): Promise<void> {
    this.cancel();

    const from = this.current;
    const delta = target - from;
    if (Math.abs(delta) < 0.001 || durationMs <= 0) {
      this.set(target);
      return Promise.resolve();
    }

    let elapsed = 0;
    this.clock.reset();
    return new Promise((resolve) => {
      this.observer = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.clock.tick() * 1000;
        const t = Math.min(elapsed / durationMs, 1);
        // Smoothstep: a linear fade reads as a mechanical wipe, and the eye
        // notices the abrupt start and stop.
        this.set(from + delta * (t * t * (3 - 2 * t)));
        if (t >= 1) {
          this.cancel();
          resolve();
        }
      });
    });
  }

  private cancel(): void {
    if (this.observer) {
      this.scene.onBeforeRenderObservable.remove(this.observer);
      this.observer = null;
    }
  }

  /** Fade out, run `during`, fade back in. The workhorse for beat changes. */
  async through(during: () => void | Promise<void>, outMs = 700, inMs = 900): Promise<void> {
    await this.to(1, outMs);
    await during();
    await this.to(0, inMs);
  }

  private set(alpha: number): void {
    this.current = alpha;
    this.material.alpha = alpha;
    this.mesh.setEnabled(alpha > 0.001);
  }

  dispose(): void {
    this.cancel();
    this.mesh.dispose();
    this.material.dispose();
  }
}
