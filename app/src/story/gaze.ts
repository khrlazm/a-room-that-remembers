// Side-effect import. In Babylon's modular build `camera.getForwardRay` and
// `scene.pickWithRay` are augmentations that only exist once the Ray module is
// loaded; without this the first gaze update throws "Ray needs to be imported
// before as it contains a side-effect required by your code". It typechecks
// either way, so nothing catches this until the ray is actually cast.
import '@babylonjs/core/Culling/ray';

import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Nullable } from '@babylonjs/core/types';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Observer } from '@babylonjs/core/Misc/observable';

import type { Gate } from '../assets/chapters';

export interface GazeOptions {
  /** How long the viewer must hold their gaze before a gate fires. */
  dwellMs: number;
  /** Fires as soon as the gaze lands, before the dwell completes. */
  onHoverStart?: (id: string) => void;
  onHoverEnd?: (id: string) => void;
  onComplete?: (id: string) => void;
}

interface Target {
  id: string;
  mesh: AbstractMesh;
  material: PBRMaterial | null;
  baseColor: Color3;
}

/**
 * Gaze-dwell input.
 *
 * Looking is the only verb in this piece, so hovering a gate has to be legible
 * without any HUD furniture: the object itself brightens, and keeps brightening
 * as the dwell fills. A reticle would work too, but it puts a permanent piece
 * of interface in the middle of a view whose whole job is to feel like a room.
 *
 * The hover callback fires immediately on look, well before the dwell
 * completes. That is what hides chapter loading: the dwell time and the fetch
 * happen at once, so by the time the viewer has committed, the era is resident.
 */
export class GazeController {
  private readonly targets = new Map<string, Target>();
  private observer: Nullable<Observer<Scene>> = null;
  private hovered: Target | null = null;
  private dwellStartedAt = 0;
  private armed = true;

  constructor(
    private readonly scene: Scene,
    private readonly options: GazeOptions,
  ) {
    this.observer = scene.onBeforeRenderObservable.add(() => this.update());
  }

  /**
   * Track a set of gates.
   *
   * Each gate gets its own cloned material so it can be brightened without
   * touching the shared baked material -- which every other surface in the
   * chapter also uses, and which is frozen for performance.
   */
  register(gates: Iterable<Gate>): void {
    for (const gate of gates) {
      const source = gate.mesh.material;
      let material: PBRMaterial | null = null;
      let baseColor = Color3.White();

      if (source instanceof PBRMaterial) {
        material = source.clone(`${source.name}_gate_${gate.id}`) as PBRMaterial;
        // Left deliberately unfrozen: this one gets animated every frame while
        // the viewer looks at it.
        material.unfreeze();
        gate.mesh.material = material;
        baseColor = material.albedoColor.clone();
      }

      gate.mesh.isPickable = true;
      this.targets.set(gate.id, { id: gate.id, mesh: gate.mesh, material, baseColor });
    }
  }

  /** Stop responding to gaze, e.g. while a beat is playing out. */
  setArmed(armed: boolean): void {
    this.armed = armed;
    if (!armed) this.clearHover();
  }

  private update(): void {
    if (!this.armed || this.targets.size === 0) return;

    const camera = this.scene.activeCamera;
    if (!camera) return;

    // Reading activeCamera each frame rather than caching it means this keeps
    // working across the switch into and out of an XR session, where Babylon
    // swaps in its own camera.
    const ray = camera.getForwardRay(6);
    const pick = this.scene.pickWithRay(ray, (mesh) => this.isTarget(mesh));
    const hitId = pick?.hit && pick.pickedMesh ? this.idOf(pick.pickedMesh) : null;

    if (hitId !== (this.hovered?.id ?? null)) {
      this.clearHover();
      if (hitId) {
        this.hovered = this.targets.get(hitId) ?? null;
        this.dwellStartedAt = performance.now();
        if (this.hovered) this.options.onHoverStart?.(this.hovered.id);
      }
    }

    if (!this.hovered) return;

    const progress = Math.min((performance.now() - this.dwellStartedAt) / this.options.dwellMs, 1);
    this.applyHighlight(this.hovered, progress);

    if (progress >= 1) {
      const { id } = this.hovered;
      this.clearHover();
      // Disarm so a lingering gaze cannot re-fire the same gate while the beat
      // it just triggered is still playing.
      this.armed = false;
      this.options.onComplete?.(id);
    }
  }

  private applyHighlight(target: Target, progress: number): void {
    if (!target.material) return;
    // Ease in, so a glance that passes across an object barely registers but a
    // deliberate look builds visibly.
    const amount = 1 + progress * progress * 1.6;
    target.material.albedoColor.copyFrom(target.baseColor).scaleInPlace(amount);
  }

  private clearHover(): void {
    if (!this.hovered) return;
    const previous = this.hovered;
    this.hovered = null;
    if (previous.material) previous.material.albedoColor.copyFrom(previous.baseColor);
    this.options.onHoverEnd?.(previous.id);
  }

  private isTarget(mesh: AbstractMesh): boolean {
    return this.idOf(mesh) !== null;
  }

  private idOf(mesh: AbstractMesh): string | null {
    for (const target of this.targets.values()) {
      if (target.mesh === mesh) return target.id;
    }
    return null;
  }

  dispose(): void {
    this.clearHover();
    if (this.observer) this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    this.targets.clear();
  }
}
