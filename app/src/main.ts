import { createStage, EYE_HEIGHT } from './engine/bootstrap';
import { Fader } from './engine/comfort';
import { setupXR } from './engine/xr';
import { anchorPosition } from './assets/chapters';
import { GazeController } from './story/gaze';
import { Sequencer } from './story/sequencer';
import { loadStory } from './story/types';
import { exposeDebugHandle, PerfMonitor } from './dev/debug';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

const params = new URLSearchParams(window.location.search);

const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
const gate = document.getElementById('gate') as HTMLDivElement;
const enterVrButton = document.getElementById('enter-vr') as HTMLButtonElement;
const enterDesktopButton = document.getElementById('enter-desktop') as HTMLButtonElement;
const statusLine = document.getElementById('status') as HTMLParagraphElement;
const subtitles = document.getElementById('subtitles') as HTMLDivElement;

function setStatus(message: string): void {
  statusLine.textContent = message;
}

function dismissGate(): void {
  gate.classList.add('fading');
  window.setTimeout(() => gate.setAttribute('hidden', ''), 650);
}

async function main(): Promise<void> {
  const stage = createStage(canvas);

  const fader = new Fader(stage.scene);
  fader.attach(stage.previewCamera);

  setStatus('Loading the room…');
  const story = await loadStory(import.meta.env.BASE_URL);

  let gaze: GazeController;

  const sequencer = new Sequencer(story, {
    scene: stage.scene,
    fader,
    onLine: (text) => {
      subtitles.textContent = text;
    },
    // Nothing is gaze-triggerable while a beat plays: the viewer is watching,
    // not choosing, and a stray glance should not stack another era on top.
    onBeatStart: () => gaze.setArmed(false),
    onBeatEnd: () => gaze.setArmed(true),
  });

  const hub = await sequencer.start();

  // The vantage and heading come from anchors authored in Blender. Writing
  // them here would mean replicating the Z-up to Y-up conversion by hand,
  // which is a reliable source of sign errors.
  const vantage = anchorPosition(hub, 'viewer');
  const focus = anchorPosition(hub, 'focus');
  if (vantage) stage.previewCamera.position = vantage.add(new Vector3(0, EYE_HEIGHT, 0));
  if (focus) stage.previewCamera.setTarget(focus);

  gaze = new GazeController(stage.scene, {
    dwellMs: story.settings.dwellMs,
    // Hover fires long before the dwell fills, so the fetch hides inside the
    // interaction rather than showing up as a pause after it.
    onHoverStart: (id) => sequencer.prefetch(id),
    onComplete: (id) => {
      void sequencer.enter(id).catch((error: unknown) => {
        console.error(`[story] entering ${id} failed`, error);
        gaze.setArmed(true);
      });
    },
  });
  gaze.register(hub.gates.values());

  console.info(
    `[story] "${story.title}" — ${story.beats.length} beats, ` +
      `gates: ${[...hub.gates.keys()].join(', ') || 'none'}`,
  );

  const perf = new PerfMonitor(stage.scene, stage.engine, {
    overlay: params.has('hud'),
    logIntervalMs: params.has('hud') || params.has('perf') ? 5000 : 0,
  });

  const xr = await setupXR(stage.scene, {
    vantageFrom: stage.previewCamera,
    onEnter: () => {
      const xrCamera = xr?.experience.baseExperience.camera;
      if (xrCamera) fader.attach(xrCamera);
      dismissGate();
    },
    onExit: () => fader.attach(stage.previewCamera),
  });

  exposeDebugHandle({ stage, story, sequencer, gaze, fader, perf, xr });

  enterDesktopButton.disabled = false;
  enterDesktopButton.addEventListener('click', () => {
    stage.previewCamera.attachControl(true);
    dismissGate();
  });

  if (xr) {
    enterVrButton.disabled = false;
    setStatus('Headset ready.');
    enterVrButton.addEventListener('click', () => {
      void xr.enter().catch((error: unknown) => {
        console.error(error);
        setStatus(`Could not enter VR: ${error instanceof Error ? error.message : String(error)}`);
      });
    });
  } else {
    setStatus('No headset here — desktop preview available.');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  setStatus(`Failed to start: ${error instanceof Error ? error.message : String(error)}`);
});
