import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

import { UI_RENDER_GROUP } from '../engine/comfort';
import { FrameClock } from '../engine/clock';

/** Reading distance. Close enough to read, far enough not to strain focus. */
const DISTANCE = 1.45;
/** How far below eye level the panel sits. */
const DROP = 0.52;
/** Head movement smaller than this leaves the panel alone entirely. */
const DEAD_ZONE_RADIANS = 0.32; // ~18 degrees
/** Hard limit on how far behind the head the panel may fall, so it can never be
 *  lost off to one side. Generous: the lag is the whole point, and clamping it
 *  tightly is what made an earlier version read as merely head-locked. */
const MAX_LAG_RADIANS = 1.05; // ~60 degrees
/** Fraction of the surplus angle closed per second once drifting starts. Low
 *  enough that the panel visibly trails the head rather than snapping after it. */
const DRIFT_RATE = 1.1;

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 288;
const FONT = '44px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const LINE_HEIGHT = 56;
const MARGIN = 72;
const PAD = 26;

const BILLBOARDMODE_Y = 2;

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
}

/**
 * In-world captions that lag behind the head.
 *
 * **Parented to the camera, not placed in world space.** The previous version
 * computed a world position from `activeCamera.globalPosition` each frame,
 * which works on a desktop camera and fails in an immersive session: the XR
 * camera is a rig whose pose is updated from the device's own frame callback,
 * and a position derived in `onBeforeRender` could land somewhere the viewer
 * never looked. The caption was correct in every respect except being on
 * screen. Parenting makes placement structural -- there is no pose maths left
 * to get wrong, and the worst possible failure is a caption that sits directly
 * ahead instead of drifting.
 *
 * The lazy drift is then a rotation of a pivot node between the camera and the
 * panel. A caption rigidly locked to the view is among the least comfortable
 * things in VR -- it never moves relative to the eye, so it reads as something
 * stuck to your face. Here the panel holds still in the world while the head
 * moves within a dead zone, and only eases after you past it. The lag is
 * clamped, so it always stays inside the forward cone.
 *
 * Pitch is deliberately ignored: a caption that bobs as you nod is far more
 * distracting than one at a steady height.
 */
export class DriftingSubtitles {
  private readonly pivot: TransformNode;
  private readonly mesh: Mesh;
  private readonly texture: DynamicTexture;
  private readonly material: StandardMaterial;
  private readonly clock = new FrameClock();

  /** Signed lag, in radians, of the panel behind the head's yaw. */
  private lag = 0;
  private lastHeadYaw = 0;
  private haveHeadYaw = false;
  private opacity = 0;
  private targetOpacity = 0;
  private drop = DROP;
  private forwardSign = 1;
  private needsMeasure = true;

  // Scratch quaternions, reused each frame rather than allocated.
  private readonly cameraRotation = new Quaternion();
  private readonly desiredRotation = new Quaternion();
  private readonly inverseRotation = new Quaternion();
  private readonly localRotation = new Quaternion();

  constructor(private readonly scene: Scene) {
    this.texture = new DynamicTexture(
      'subtitle-texture',
      { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      scene,
      true,
    );
    this.texture.hasAlpha = true;
    // Flip V: the scene is right-handed to match glTF, which inverts how a
    // plane's UVs run relative to the canvas. Without this the lines come out
    // in reverse order with inverted glyphs, while horizontal reading order
    // stays correct -- the signature of a V flip rather than a rotation.
    this.texture.vScale = -1;
    this.texture.vOffset = 1;

    this.material = new StandardMaterial('subtitle-mat', scene);
    this.material.emissiveTexture = this.texture;
    this.material.opacityTexture = this.texture;
    this.material.emissiveColor = Color3.White();
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.material.disableLighting = true;
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;

    this.pivot = new TransformNode('subtitle-pivot', scene);

    this.mesh = CreatePlane(
      'subtitles',
      { width: 1.5, height: 1.5 * (CANVAS_HEIGHT / CANVAS_WIDTH) },
      scene,
    );
    this.mesh.material = this.material;
    this.mesh.parent = this.pivot;
    this.mesh.isPickable = false;
    this.mesh.billboardMode = BILLBOARDMODE_Y;
    this.mesh.renderingGroupId = UI_RENDER_GROUP;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.setEnabled(false);

    scene.onBeforeRenderObservable.add(() => this.update());
  }

  /**
   * Follow a camera. Called again when XR swaps in its own, exactly as the
   * fader is -- which is the one piece of camera-attached UI that has been
   * visible in the headset all along.
   */
  attach(camera: Camera): void {
    this.pivot.parent = camera;
    this.pivot.position.setAll(0);
    this.pivot.rotation.set(0, 0, 0);

    // Deferred to the first rendered frame rather than measured now: attach
    // happens during setup, before the camera has been aimed or had a world
    // matrix computed, so probing here reads stale values and reliably picks
    // the wrong direction.
    this.needsMeasure = true;
    this.place();
    this.haveHeadYaw = false;
    this.lag = 0;
  }

  /** Show a line, or clear the caption when passed an empty string. */
  say(line: string): void {
    if (line) {
      this.draw(line);
      this.mesh.setEnabled(true);
      this.targetOpacity = 1;
    } else {
      this.targetOpacity = 0;
    }
  }

  /** Drop the lag so the panel snaps in front, e.g. on entering a session. */
  recentre(): void {
    this.lag = 0;
    this.haveHeadYaw = false;
    this.pivot.rotation.y = 0;
  }

  /** Live adjustment while wearing the headset, via the debug handle. */
  setDrop(metres: number): void {
    this.drop = metres;
    this.place();
  }

  /** Live adjustment: how far in front the panel sits. */
  setDistance(metres: number): void {
    this.mesh.position.z = metres * this.forwardSign;
  }

  /**
   * Work out which way is forward by trying it, rather than by reasoning.
   *
   * Comparing `camera.getDirection(Axis.Z)` against the forward ray gives the
   * *opposite* answer to what a camera-parented child actually inherits, which
   * put the caption exactly behind the viewer -- measured at 146 degrees
   * off-axis while the maths said it was in front. Rather than encode a
   * Babylon quirk as a constant and hope it holds across versions, camera
   * types and XR rigs, this places a probe one metre along local +Z and checks
   * where it lands.
   */
  private measureForwardSign(camera: Camera): number {
    const previous = this.mesh.position.clone();

    this.mesh.position.set(0, 0, 1);
    this.mesh.computeWorldMatrix(true);
    const offset = this.mesh.getAbsolutePosition().subtract(camera.globalPosition);
    const sign = Vector3.Dot(offset, camera.getForwardRay(1).direction) >= 0 ? 1 : -1;

    this.mesh.position.copyFrom(previous);
    this.mesh.computeWorldMatrix(true);
    return sign;
  }

  private place(): void {
    this.mesh.position.set(0, -this.drop, DISTANCE * this.forwardSign);
  }

  /**
   * Hold the panel level and at a chosen world yaw, despite being parented to
   * the camera.
   *
   * Parenting is what makes the caption reliably present in an XR session, but
   * it means inheriting the head's pitch and roll too -- so the panel tipped
   * and swung with every nod, which is exactly the head-locked feel a drifting
   * caption is meant to avoid. Cancelling the camera's rotation and
   * substituting a yaw-only one keeps the placement structural while making the
   * orientation behave as though the panel were sitting in the room.
   */
  private orient(camera: Camera, worldYaw: number): void {
    camera.getWorldMatrix().decompose(undefined, this.cameraRotation, undefined);
    Quaternion.RotationYawPitchRollToRef(worldYaw, 0, 0, this.desiredRotation);

    // local = inverse(parent world) * desired world
    Quaternion.InverseToRef(this.cameraRotation, this.inverseRotation);
    this.inverseRotation.multiplyToRef(this.desiredRotation, this.localRotation);

    if (!this.pivot.rotationQuaternion) {
      this.pivot.rotationQuaternion = this.localRotation.clone();
    } else {
      this.pivot.rotationQuaternion.copyFrom(this.localRotation);
    }
  }

  private draw(text: string): void {
    const ctx = this.texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = wrap(ctx, text, CANVAS_WIDTH - MARGIN * 2);
    const blockHeight = lines.length * LINE_HEIGHT;
    const startY = CANVAS_HEIGHT / 2 - (blockHeight - LINE_HEIGHT) / 2;

    // A soft backing plate. Shadow alone was not enough against the bright
    // window, and a faint slab reads as a caption card rather than as text
    // floating unattached in the middle of the room.
    let widest = 0;
    for (const line of lines) widest = Math.max(widest, ctx.measureText(line).width);
    const boxWidth = Math.min(widest + PAD * 2.4, CANVAS_WIDTH - 8);
    const boxHeight = blockHeight + PAD * 1.4;
    ctx.fillStyle = 'rgba(8, 7, 6, 0.46)';
    roundedRect(
      ctx,
      (CANVAS_WIDTH - boxWidth) / 2,
      startY - LINE_HEIGHT / 2 - PAD * 0.7,
      boxWidth,
      boxHeight,
      26,
    );

    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#f4efe6';
    lines.forEach((line, index) => {
      ctx.fillText(line, CANVAS_WIDTH / 2, startY + index * LINE_HEIGHT);
    });

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    this.texture.update(false);
  }

  private update(): void {
    const camera = this.scene.activeCamera;
    const deltaSeconds = this.clock.tick();

    if (camera) {
      if (this.needsMeasure) {
        this.needsMeasure = false;
        this.forwardSign = this.measureForwardSign(camera);
        this.place();
      }

      const forward = camera.getForwardRay(1).direction;
      const headYaw = Math.atan2(forward.x, forward.z);

      if (this.haveHeadYaw) {
        // The panel holds still in the world, so a head turn shows up as lag
        // in the opposite direction.
        this.lag -= shortestAngle(this.lastHeadYaw, headYaw);
      }
      this.lastHeadYaw = headYaw;
      this.haveHeadYaw = true;

      // Past the dead zone, ease back toward it -- not to zero, so the panel
      // settles at the edge rather than re-centring itself on every glance.
      const magnitude = Math.abs(this.lag);
      if (magnitude > DEAD_ZONE_RADIANS) {
        const surplus = magnitude - DEAD_ZONE_RADIANS;
        this.lag -= Math.sign(this.lag) * surplus * Math.min(DRIFT_RATE * deltaSeconds, 1);
      }
      // Never let it fall outside the forward cone, whatever happens above.
      this.lag = Math.max(-MAX_LAG_RADIANS, Math.min(MAX_LAG_RADIANS, this.lag));

      this.orient(camera, headYaw + this.lag);
    }

    const difference = this.targetOpacity - this.opacity;
    const step = deltaSeconds * 3.2;
    this.opacity += Math.sign(difference) * Math.min(step, Math.abs(difference));
    this.material.alpha = this.opacity;
    if (this.opacity <= 0.001 && this.targetOpacity === 0) this.mesh.setEnabled(false);
  }

  dispose(): void {
    this.mesh.dispose();
    this.pivot.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/** Keep the DOM caption in sync alongside the in-world one. */
export function mirrorToDom(element: HTMLElement, line: string): void {
  // Visually hidden, but kept current: it is the accessible text for screen
  // readers and the transcript a flat-screen viewer can select.
  element.textContent = line;
}
