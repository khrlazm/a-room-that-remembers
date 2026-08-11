import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';

import { UI_RENDER_GROUP } from '../engine/comfort';
import { FrameClock } from '../engine/clock';

/** Reading distance. Close enough to read, far enough not to strain focus. */
const DISTANCE = 1.85;
/** How far below eye level the panel sits. Low enough to stay clear of what
 *  the viewer is looking at, high enough not to need a neck movement. */
const DROP = 0.68;
/** Head movement smaller than this leaves the panel entirely alone. */
const DEAD_ZONE_RADIANS = 0.28; // ~16 degrees
/** Fraction of the surplus angle closed per second once drifting starts. */
const DRIFT_RATE = 1.8;

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 288;
const FONT_SIZE = 44;
const FONT = `${FONT_SIZE}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
const LINE_HEIGHT = 56;
const MARGIN = 72;
const PAD = 26;

/** Y-axis billboarding: Babylon computes the facing, so nothing here has to
 *  reason about handedness. Manual yaw was the source of the panel rendering
 *  mirrored, and then edge-on. */
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
 * A caption rigidly locked to the view is among the least comfortable things
 * you can put in VR: it never moves relative to the eye, so it reads as
 * something stuck to your face. Locking it to the world instead means it is
 * gone the moment you look away.
 *
 * So: yaw-only following with a dead zone. Small head movements leave the panel
 * completely alone, which is what makes it feel like an object rather than a
 * HUD; larger turns let it drift after you, easing rather than snapping. Pitch
 * is ignored deliberately -- a caption that bobs as you nod is far more
 * distracting than one sitting at a steady height.
 *
 * Orientation is handled by Y-billboarding rather than by setting rotation from
 * a computed yaw. The scene is right-handed to match glTF, and the hand-rolled
 * version used the left-handed sign convention: the panel rendered mirrored,
 * and once the viewer turned at all it swung edge-on and vanished.
 */
export class DriftingSubtitles {
  private readonly mesh: Mesh;
  private readonly texture: DynamicTexture;
  private readonly material: StandardMaterial;
  private yaw = 0;
  private opacity = 0;
  private targetOpacity = 0;
  private initialised = false;
  private drop = DROP;
  private readonly clock = new FrameClock();

  constructor(private readonly scene: Scene) {
    this.texture = new DynamicTexture(
      'subtitle-texture',
      { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      scene,
      true,
    );
    this.texture.hasAlpha = true;
    // Flip V. The scene is right-handed to match glTF, which inverts how a
    // plane's UVs run relative to the canvas: without this the caption renders
    // with its lines in reverse order and its glyphs upside down, while
    // horizontal reading order stays correct -- the signature of a V flip
    // rather than a rotation. Checking the mesh's world axes does not catch it,
    // because the mesh is oriented correctly; it is the texture's mapping onto
    // the mesh that is inverted.
    this.texture.vScale = -1;
    this.texture.vOffset = 1;

    // Unlit text: everything comes from emissive, alpha from the same canvas.
    // Deliberately does not also assign diffuseTexture -- with disableLighting
    // the diffuse term contributes nothing, and having the texture bound to
    // three slots at once made the earlier version's alpha behaviour hard to
    // reason about when it stopped drawing entirely.
    this.material = new StandardMaterial('subtitle-mat', scene);
    this.material.emissiveTexture = this.texture;
    this.material.opacityTexture = this.texture;
    this.material.emissiveColor = Color3.White();
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.material.disableLighting = true;
    this.material.backFaceCulling = false;
    // UI is drawn after the room with depth already cleared, so depth writes
    // would only let one UI element occlude another.
    this.material.disableDepthWrite = true;

    this.mesh = CreatePlane(
      'subtitles',
      { width: 1.5, height: 1.5 * (CANVAS_HEIGHT / CANVAS_WIDTH) },
      scene,
    );
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.billboardMode = BILLBOARDMODE_Y;
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

  /** Live adjustment while wearing the headset, via the debug handle. */
  setDrop(metres: number): void {
    this.drop = metres;
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
    if (!camera) return;

    const deltaSeconds = this.clock.tick();
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

    // Position only. Facing is billboarded, so no rotation is set here.
    const eye = camera.globalPosition;
    this.mesh.position.set(
      eye.x + Math.sin(this.yaw) * DISTANCE,
      eye.y - this.drop,
      eye.z + Math.cos(this.yaw) * DISTANCE,
    );

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
