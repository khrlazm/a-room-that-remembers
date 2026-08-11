import type { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';

export interface Stats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  activeMeshes: number;
  totalVertices: number;
  materials: number;
  textures: number;
  /** Awake physics bodies, and how many are currently held. Absent outside codas. */
  bodies?: number;
  held?: number;
}

/** Supplied by the coda so physics cost shows up in the headset console. */
export interface PhysicsProbe {
  activeCount(): number;
  holdingCount(): number;
}

/**
 * Performance readout.
 *
 * Reports to two places on purpose. The DOM overlay is for desktop work; the
 * periodic console line is for the headset, where there is no overlay to look
 * at but `chrome://inspect` gives a live console over adb. Frame rate on the
 * actual device is the only number that decides whether this piece ships, and
 * it has to be readable while wearing the thing.
 */
export class PerfMonitor {
  private readonly instrumentation: SceneInstrumentation;
  private element: HTMLDivElement | null = null;
  private lastLog = 0;
  private physics: PhysicsProbe | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly engine: Engine,
    options: { overlay: boolean; logIntervalMs: number },
  ) {
    this.instrumentation = new SceneInstrumentation(scene);
    this.instrumentation.captureFrameTime = true;

    if (options.overlay) this.element = createOverlay();

    const logInterval = options.logIntervalMs;
    scene.onAfterRenderObservable.add(() => {
      const stats = this.read();
      if (this.element) this.element.textContent = format(stats);

      if (logInterval > 0) {
        const now = performance.now();
        if (now - this.lastLog >= logInterval) {
          this.lastLog = now;
          console.info(`[perf] ${format(stats).replace(/\n/g, '  ')}`);
        }
      }
    });
  }

  /** Attach or clear the physics readout when a coda starts and ends. */
  watchPhysics(probe: PhysicsProbe | null): void {
    this.physics = probe;
  }

  read(): Stats {
    return {
      fps: Math.round(this.engine.getFps()),
      frameMs: Number(this.instrumentation.frameTimeCounter.current.toFixed(2)),
      drawCalls: this.instrumentation.drawCallsCounter.current,
      activeMeshes: this.scene.getActiveMeshes().length,
      totalVertices: this.scene.getTotalVertices(),
      materials: this.scene.materials.length,
      textures: this.scene.textures.length,
      bodies: this.physics?.activeCount(),
      held: this.physics?.holdingCount(),
    };
  }

  dispose(): void {
    this.instrumentation.dispose();
    this.element?.remove();
  }
}

function format(stats: Stats): string {
  const physics =
    stats.bodies === undefined ? '' : `\n${stats.bodies} bodies  ${stats.held ?? 0} held`;
  return (
    `${stats.fps} fps  ${stats.frameMs}ms\n` +
    `${stats.drawCalls} draws  ${stats.activeMeshes} meshes\n` +
    `${stats.totalVertices} verts  ${stats.materials} mat  ${stats.textures} tex` +
    physics
  );
}

function createOverlay(): HTMLDivElement {
  const element = document.createElement('div');
  element.id = 'perf-hud';
  Object.assign(element.style, {
    position: 'fixed',
    top: '0.75rem',
    left: '0.75rem',
    zIndex: '20',
    padding: '0.5rem 0.7rem',
    borderRadius: '0.4rem',
    background: 'rgba(0,0,0,0.62)',
    color: '#9fe6b0',
    font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
    whiteSpace: 'pre',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(element);
  return element;
}

/**
 * Expose the running scene for console inspection.
 *
 * Deliberately available in production too: the deployed build is where device
 * problems actually appear, and being able to query the live scene from a
 * remote-debugged headset is worth far more than hiding a global.
 */
export function exposeDebugHandle(handle: Record<string, unknown>): void {
  (window as unknown as Record<string, unknown>).__room = handle;
}
