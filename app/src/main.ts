import { createStage, EYE_HEIGHT } from './engine/bootstrap';
import { Fader } from './engine/comfort';
import { setupXR } from './engine/xr';
import { anchorPosition, loadChapter } from './assets/chapters';
import { GazeController } from './story/gaze';
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

function say(message: string): void {
  subtitles.textContent = message;
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
  const hub = await loadChapter(stage.scene, 'hub');
  hub.addToScene();

  // The viewer's vantage and heading are authored in Blender, not here. Hand
  // written coordinates would have to replicate the Z-up to Y-up conversion,
  // which is a reliable source of sign errors.
  const vantage = anchorPosition(hub, 'viewer');
  const focus = anchorPosition(hub, 'focus');
  if (vantage) stage.previewCamera.position = vantage.add(new Vector3(0, EYE_HEIGHT, 0));
  if (focus) stage.previewCamera.setTarget(focus);

  console.info(
    `[hub] ${hub.container.meshes.length} meshes, ` +
      `${hub.anchors.size} anchors, ${hub.gates.size} gates ` +
      `(${[...hub.gates.keys()].join(', ') || 'none'})`,
  );

  const gaze = new GazeController(stage.scene, {
    dwellMs: 1600,
    onHoverStart: (id) => {
      console.info(`[gaze] looking at ${id}`);
      // Where chapter prefetch will start, so the fetch overlaps the dwell.
    },
    onComplete: async (id) => {
      console.info(`[gaze] ${id} triggered`);
      say('');
      await fader.through(async () => {
        // Era chapters land here: swap the room, play the beat, come back.
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      say(`— ${id} —`);
      gaze.setArmed(true);
    },
  });
  gaze.register(hub.gates.values());

  const perf = new PerfMonitor(stage.scene, stage.engine, {
    overlay: params.has('hud'),
    logIntervalMs: params.has('hud') || params.has('perf') ? 5000 : 0,
  });

  const xr = await setupXR(stage.scene, {
    vantageFrom: stage.previewCamera,
    onEnter: () => {
      // The fader lives on the camera, and XR swaps in its own.
      const xrCamera = xr?.experience.baseExperience.camera;
      if (xrCamera) fader.attach(xrCamera);
      dismissGate();
    },
    onExit: () => fader.attach(stage.previewCamera),
  });

  exposeDebugHandle({ stage, hub, gaze, fader, perf, xr });

  enterDesktopButton.disabled = false;
  enterDesktopButton.addEventListener('click', () => {
    stage.previewCamera.attachControl(true);
    dismissGate();
    say('Look at the radio.');
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
