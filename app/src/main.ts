import { createStage, EYE_HEIGHT } from './engine/bootstrap';
import { Fader } from './engine/comfort';
import { setupXR } from './engine/xr';
import { anchorPosition } from './assets/chapters';
import { GazeController } from './story/gaze';
import { Sequencer } from './story/sequencer';
import { loadStory } from './story/types';
import { GazeReticle } from './ui/gazeReticle';
import { DriftingSubtitles, mirrorToDom } from './ui/subtitles';
import { HUB_SOUND, Soundscape, WORKING_YEARS_SOUND } from './audio/procedural';
import { exposeDebugHandle, PerfMonitor } from './dev/debug';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

const params = new URLSearchParams(window.location.search);

const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
const gate = document.getElementById('gate') as HTMLDivElement;
const enterVrButton = document.getElementById('enter-vr') as HTMLButtonElement;
const enterDesktopButton = document.getElementById('enter-desktop') as HTMLButtonElement;
const statusLine = document.getElementById('status') as HTMLParagraphElement;
const subtitleElement = document.getElementById('subtitles') as HTMLDivElement;

/** Which soundscape belongs to which chapter. */
const SOUND_BY_CHAPTER: Record<string, typeof HUB_SOUND> = {
  hub: HUB_SOUND,
  era_radio: WORKING_YEARS_SOUND,
};

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

  const captions = new DriftingSubtitles(stage.scene);
  const reticle = new GazeReticle(stage.scene);

  setStatus('Loading the room…');
  const story = await loadStory(import.meta.env.BASE_URL);

  // Created on the first user gesture: browsers will not start an AudioContext
  // before one, and a silently mute experience is a miserable thing to debug.
  let soundscape: Soundscape | null = null;

  let gaze: GazeController;

  const sequencer = new Sequencer(story, {
    scene: stage.scene,
    fader,
    onLine: (text) => {
      captions.say(text);
      mirrorToDom(subtitleElement, text);
    },
    onBeatStart: (beat) => {
      gaze.setArmed(false);
      reticle.hide();
      soundscape?.apply(SOUND_BY_CHAPTER[beat.chapter] ?? HUB_SOUND);
    },
    onBeatEnd: () => {
      gaze.setArmed(true);
      soundscape?.apply(HUB_SOUND);
    },
  });

  const hub = await sequencer.start();

  // Vantage and heading come from anchors authored in Blender; writing them
  // here would mean replicating the Z-up to Y-up conversion by hand.
  const vantage = anchorPosition(hub, 'viewer');
  const focus = anchorPosition(hub, 'focus');
  if (vantage) stage.previewCamera.position = vantage.add(new Vector3(0, EYE_HEIGHT, 0));
  if (focus) stage.previewCamera.setTarget(focus);

  gaze = new GazeController(stage.scene, {
    dwellMs: story.settings.dwellMs,
    onHoverStart: (id, mesh) => {
      reticle.show(mesh);
      // Fetch overlaps the dwell, so the load hides inside the interaction.
      sequencer.prefetch(id);
    },
    onProgress: (_id, progress) => reticle.update(progress),
    onHoverEnd: () => reticle.hide(),
    onComplete: (id) => {
      reticle.hide();
      void sequencer.enter(id).catch((error: unknown) => {
        console.error(`[story] entering ${id} failed`, error);
        gaze.setArmed(true);
      });
    },
  });
  gaze.register(hub.gates.values());

  // Spatial audio has to track the head, not the rig, so this reads the active
  // camera every frame -- which is the XR camera once a session starts.
  const forward = new Vector3();
  const up = new Vector3();
  stage.scene.onBeforeRenderObservable.add(() => {
    const camera = stage.scene.activeCamera;
    if (!soundscape || !camera) return;
    forward.copyFrom(camera.getForwardRay(1).direction);
    up.copyFrom(camera.upVector);
    soundscape.updateListener(camera, forward, up);
  });

  const beginAudio = () => {
    if (soundscape) return;
    soundscape = Soundscape.create();
    void soundscape.start(HUB_SOUND).catch((error: unknown) => {
      console.warn('[audio] could not start', error);
    });
  };

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
      // Put the caption where the viewer is actually facing when they arrive,
      // rather than leaving it behind them from the desktop heading.
      captions.recentre();
      dismissGate();
    },
    onExit: () => fader.attach(stage.previewCamera),
  });

  exposeDebugHandle({ stage, story, sequencer, gaze, fader, captions, reticle, perf, xr, audio: () => soundscape });

  enterDesktopButton.disabled = false;
  enterDesktopButton.addEventListener('click', () => {
    beginAudio();
    stage.previewCamera.attachControl(true);
    dismissGate();
  });

  if (xr) {
    enterVrButton.disabled = false;
    setStatus('Headset ready.');
    enterVrButton.addEventListener('click', () => {
      beginAudio();
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
