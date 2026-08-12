import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';

import { UI_RENDER_GROUP } from '../engine/comfort';
import { FrameClock } from '../engine/clock';

const CANVAS = 128;
/** How far in front of the object the ring floats, in metres. */
const STANDOFF = 0.26;
/** Redraw threshold. Repainting a canvas every frame is wasted GPU upload. */
const REDRAW_STEP = 0.02;

/**
 * Palette: a dark ring carried by a light halo.
 *
 * Any single tone fails somewhere in this room. A pale ring blew out against
 * the window; a dark one vanished into the unlit corners, and a faint rim was
 * not enough to rescue it. So every stroke is drawn twice -- a soft light halo
 * underneath, a dark core on top. Against the bright window the dark core
 * reads; against shadow the halo does. Neither ever glows, which is what kept
 * the first version from feeling like part of the room.
 *
 * This is the standard trick for UI that cannot know its background, and it is
 * worth the two extra strokes on a 128px canvas that repaints at most fifty
 * times across a dwell.
 */
const RETICLE = {
  /** Drawn under everything, wider, to lift the dark strokes off dark scenery. */
  halo: 'rgba(248, 244, 236, 0.5)',
  /** The unfilled ring. Near-opaque so it holds against the window. */
  track: 'rgba(10, 8, 6, 0.82)',
  /** The dwell fill. Warm and solid, but not a light source. */
  progress: 'rgba(206, 152, 78, 1)',
};

/**
 * The dwell indicator.
 *
 * Deliberately *contextual* rather than a fixed centre-screen crosshair: it
 * appears at the object being looked at and nowhere else. A permanent reticle
 * would put a piece of interface in the middle of every view in a piece whose
 * whole job is to feel like a room, and it would keep suggesting the viewer
 * should be aiming at things when almost nothing here is aimable.
 *
 * Billboarded so it faces the viewer from any angle, and drawn in the UI
 * rendering group with depth cleared first, so it is never half-buried in the
 * object it belongs to.
 */
export class GazeReticle {
  private readonly mesh: Mesh;
  private readonly texture: DynamicTexture;
  private readonly material: StandardMaterial;
  private lastDrawn = -1;
  private target: AbstractMesh | null = null;
  private visibility = 0;
  private readonly clock = new FrameClock();

  constructor(private readonly scene: Scene) {
    this.texture = new DynamicTexture(
      'reticle-texture',
      { width: CANVAS, height: CANVAS },
      scene,
      true,
    );
    this.texture.hasAlpha = true;
    // Same V flip as the captions -- see ui/subtitles.ts. Invisible on the ring
    // itself, which is symmetric, but without it the progress arc fills
    // anticlockwise from twelve instead of clockwise, which reads as time
    // running backwards.
    this.texture.vScale = -1;
    this.texture.vOffset = 1;

    // Same unlit setup as the captions: emissive carries the colour, the same
    // canvas carries the alpha, and nothing else contributes.
    this.material = new StandardMaterial('reticle-mat', scene);
    this.material.emissiveTexture = this.texture;
    this.material.opacityTexture = this.texture;
    this.material.emissiveColor = Color3.White();
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.material.disableLighting = true;
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;

    this.mesh = CreatePlane('reticle', { size: 0.16 }, scene);
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.billboardMode = 7; // BILLBOARDMODE_ALL
    this.mesh.renderingGroupId = UI_RENDER_GROUP;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.setEnabled(false);

    // Clear depth before the UI group so the ring is never occluded by the
    // object it is annotating.
    scene.setRenderingAutoClearDepthStencil(UI_RENDER_GROUP, true, true, false);

    this.draw(0);
    scene.onBeforeRenderObservable.add(() => this.follow());
  }

  show(mesh: AbstractMesh): void {
    this.target = mesh;
    this.mesh.setEnabled(true);
  }

  update(progress: number): void {
    if (Math.abs(progress - this.lastDrawn) >= REDRAW_STEP || progress >= 1) {
      this.draw(progress);
    }
  }

  hide(): void {
    this.target = null;
    this.visibility = 0;
    this.mesh.setEnabled(false);
    this.lastDrawn = -1;
    this.draw(0);
  }

  /** Sit between the object and the viewer, easing in rather than popping. */
  private follow(): void {
    if (!this.target) return;
    const camera = this.scene.activeCamera;
    if (!camera) return;

    const centre = this.target.getBoundingInfo().boundingSphere.centerWorld;
    const toViewer = camera.globalPosition.subtract(centre);
    const distance = toViewer.length();
    if (distance > 0.001) {
      toViewer.scaleInPlace(1 / distance);
      this.mesh.position.copyFrom(centre.add(toViewer.scale(STANDOFF)));
    }

    // Fade up over a few frames so a glance that skims an object does not
    // flash a ring at the edge of vision.
    this.visibility = Math.min(this.visibility + this.clock.tick() / 0.18, 1);
    this.material.alpha = this.visibility;
    // Slight scale-in reads as the ring settling onto the object.
    const scale = 0.85 + this.visibility * 0.15;
    this.mesh.scaling.set(scale, scale, scale);
  }

  private draw(progress: number): void {
    this.lastDrawn = progress;
    const ctx = this.texture.getContext() as CanvasRenderingContext2D;
    const c = CANVAS / 2;
    const radius = CANVAS * 0.36;

    ctx.clearRect(0, 0, CANVAS, CANVAS);
    ctx.lineCap = 'round';

    const ring = (from: number, to: number, colour: string, width: number) => {
      // Halo first, wider and underneath.
      ctx.beginPath();
      ctx.arc(c, c, radius, from, to);
      ctx.strokeStyle = RETICLE.halo;
      ctx.lineWidth = width + 5;
      ctx.stroke();
      // Core on top.
      ctx.beginPath();
      ctx.arc(c, c, radius, from, to);
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    // Track: says "this is lookable" the moment the gaze lands.
    ring(0, Math.PI * 2, RETICLE.track, 5);

    if (progress > 0) {
      // Fill clockwise from twelve o'clock, which reads as time passing.
      ring(-Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, RETICLE.progress, 7);
    }

    this.texture.update(false);
  }

  dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/** Small helper so callers can position by world point rather than a mesh. */
export function worldCentre(mesh: AbstractMesh): Vector3 {
  return mesh.getBoundingInfo().boundingSphere.centerWorld.clone();
}
