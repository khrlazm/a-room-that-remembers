import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';

import { UI_RENDER_GROUP } from '../engine/comfort';

/** Reading distance. Close enough to read, far enough not to strain focus. */
const DISTANCE = 1.9;
/** Below the eye line: reading slightly downward is more comfortable, and it
 *  keeps the caption clear of whatever the viewer is actually looking at. */
const DROP = 0.42;
/** Head movement smaller than this leaves the panel entirely alone. */
const DEAD_ZONE_RADIANS = 0.28; // ~16 degrees
/** Fraction of the surplus angle closed per second once drifting starts. */
const DRIFT_RATE = 1.8;

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 320;
const FONT = '46px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const LINE_HEIGHT = 58;
const MARGIN = 60;

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Greedy word wrap against real measured glyph widths. */
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

/**
 * In-world captions that lag behind the head.
 *
 * A caption rigidly locked to the view is among the least comfortable things
 * you can put in VR: it never moves relative to the eye, so it reads as
 * something stuck to your face rather than something in the room. Locking it to
 * the world instead means it is simply gone the moment you look away.
 *
 * So: yaw-only following with a dead zone. Small head movements leave the panel
 * completely alone, which is what makes it feel like an object rather than a
 * HUD; larger turns let it drift after you, easing rather than snapping. Pitch
 * is ignored deliberately -- a caption that bobs as you nod is far more
 * distracting than one sitting at a steady height.
 *
 * Drawn on a canvas rather than with @babylonjs/gui. That saves about 100 KB of
 * bundle (23 KB gzipped) -- worthwhile but not dramatic; the stronger reason is
 * that it needs no dependency and matches how the gaze reticle already draws
 * itself, so there is one way to put pixels in front of the viewer rather than
 * two.
 */
export class DriftingSubtitles {
  private readonly mesh: Mesh;
  private readonly texture: DynamicTexture;
  private readonly material: StandardMaterial;
  private yaw = 0;
  private opacity = 0;
  private targetOpacity = 0;
  private initialised = false;

  constructor(private readonly scene: Scene) {
    this.texture = new DynamicTexture(
      'subtitle-texture',
      { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      scene,
      true,
    );
    this.texture.hasAlpha = true;

    this.material = new StandardMaterial('subtitle-mat', scene);
    this.material.diffuseTexture = this.texture;
    this.material.opacityTexture = this.texture;
    this.material.emissiveTexture = this.texture;
    this.material.emissiveColor = Color3.White();
    this.material.disableLighting = true;
    this.material.backFaceCulling = false;

    this.mesh = CreatePlane('subtitles', { width: 1.45, height: 0.45 }, scene);
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.renderingGroupId = UI_RENDER_GROUP;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.setEnabled(false);

    scene.onBeforeRenderObservable.add(() => this.update());
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

  /** Snap to the current head direction, e.g. on entering a session. */
  recentre(): void {
    this.initialised = false;
  }

  private draw(text: string): void {
    const ctx = this.texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = wrap(ctx, text, CANVAS_WIDTH - MARGIN * 2);
    const startY = CANVAS_HEIGHT / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2;

    lines.forEach((line, index) => {
      const y = startY + index * LINE_HEIGHT;
      // Shadow rather than a panel background: legible against both the bright
      // window and the dark corners without putting a slab in the room.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#f2ece1';
      ctx.fillText(line, CANVAS_WIDTH / 2, y);
    });

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    this.texture.update(false);
  }

  private update(): void {
    const camera = this.scene.activeCamera;
    if (!camera) return;

    const deltaSeconds = this.scene.getEngine().getDeltaTime() / 1000;
    const forward = camera.getForwardRay(1).direction;
    const headYaw = Math.atan2(forward.x, forward.z);

    if (!this.initialised) {
      this.yaw = headYaw;
      this.initialised = true;
    }

    const offset = shortestAngle(this.yaw, headYaw);
    if (Math.abs(offset) > DEAD_ZONE_RADIANS) {
      // Chase only the part of the turn beyond the dead zone, so the panel
      // settles at its edge rather than re-centring itself every time.
      const surplus = offset - Math.sign(offset) * DEAD_ZONE_RADIANS;
      this.yaw += surplus * Math.min(DRIFT_RATE * deltaSeconds, 1);
    }

    const eye = camera.globalPosition;
    this.mesh.position.set(
      eye.x + Math.sin(this.yaw) * DISTANCE,
      eye.y - DROP,
      eye.z + Math.cos(this.yaw) * DISTANCE,
    );
    this.mesh.rotation.set(0, this.yaw, 0);

    const difference = this.targetOpacity - this.opacity;
    const step = deltaSeconds * 3.2;
    this.opacity += Math.sign(difference) * Math.min(step, Math.abs(difference));
    this.material.alpha = this.opacity;
    if (this.opacity <= 0.001 && this.targetOpacity === 0) this.mesh.setEnabled(false);
  }

  dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/** Keep the DOM caption in sync alongside the in-world one. */
export function mirrorToDom(element: HTMLElement, line: string): void {
  // Updated even in VR, where it is not visible: it is the accessible text, and
  // it is what a flat-screen viewer or a screen reader gets.
  element.textContent = line;
}
