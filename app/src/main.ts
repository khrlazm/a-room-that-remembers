import { createStage, EYE_HEIGHT } from './engine/bootstrap';
import { Fader } from './engine/comfort';
import { setupXR } from './engine/xr';
import { anchorPosition } from './assets/chapters';
import { GazeController } from './story/gaze';
import { GrabController } from './story/grab';
import { Sequencer } from './story/sequencer';
import { loadStory } from './story/types';
import { GazeReticle } from './ui/gazeReticle';
import { DriftingSubtitles, mirrorToDom } from './ui/subtitles';
import {
  CODA_SOUND,
  HER_GLASSES_SOUND,
  HUB_SOUND,
  Soundscape,
  THE_LONG_NIGHT_SOUND,
  WHAT_HE_WAS_GIVEN_SOUND,
  WORKING_YEARS_SOUND,
} from './audio/procedural';
import { VoicePlayer } from './audio/voice';
import type { Beat } from './story/types';
import { exposeDebugHandle, PerfMonitor } from './dev/debug';
import { TimingCapture } from './dev/timing';
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
  coda_radio: CODA_SOUND,
  era_clock: THE_LONG_NIGHT_SOUND,
  coda_clock: CODA_SOUND,
  era_spectacles: HER_GLASSES_SOUND,
  coda_spectacles: CODA_SOUND,
  era_toolbox: WHAT_HE_WAS_GIVEN_SOUND,
  coda_toolbox: CODA_SOUND,
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
  captions.attach(stage.previewCamera);
  const reticle = new GazeReticle(stage.scene);

  setStatus('Loading the room…');
  const story = await loadStory(import.meta.env.BASE_URL);

  // Warm the opening take's HTTP cache now. The AudioContext cannot exist
  // before the viewer's first gesture, and that same gesture starts playback --
  // so without this the first line waits on a cold download of half a megabyte
  // while the viewer stands in a silent room wondering if it is broken.
  const opening = story.beats.find((beat) => beat.kind === 'hub');
  if (opening?.voice) {
    void fetch(`${import.meta.env.BASE_URL}vo/${opening.voice}`).catch(() => undefined);
  }

  // Created on the first user gesture: browsers will not start an AudioContext
  // before one, and a silently mute experience is a miserable thing to debug.
  let soundscape: Soundscape | null = null;
  let voice: VoicePlayer | null = null;

  let gaze: GazeController;
  let currentBeat: Beat | null = null;

  const sequencer = new Sequencer(story, {
    scene: stage.scene,
    fader,
    voice: () => voice,
    voiceBase: import.meta.env.BASE_URL,
    // The sequencer runs codas but knows nothing about XR sessions or input
    // sources; it asks for a grabber and gets one wired to whatever is here.
    makeGrabber: (world) => new GrabController(stage.scene, world, xr),
    onPhysics: (world, grab) => {
      perf.watchPhysics(
        world && grab
          ? { activeCount: () => world.activeCount(), holdingCount: () => grab.holdingCount }
          : null,
      );
    },
    onLine: (text) => {
      captions.say(text);
      mirrorToDom(subtitleElement, text);
    },
    onVoice: (playing) => {
      // Pull the room down under the voice. Only the ambience moves -- the
      // voice sits on its own bus for exactly this reason.
      soundscape?.duck(playing ? 0.4 : 1, playing ? 0.8 : 1.6);
    },
    onChapter: (chapterId) => soundscape?.apply(SOUND_BY_CHAPTER[chapterId] ?? HUB_SOUND),
    onBeatStart: (beat) => {
      currentBeat = beat;
      gaze.setArmed(false);
      reticle.hide();
      soundscape?.apply(SOUND_BY_CHAPTER[beat.chapter] ?? HUB_SOUND);
    },
    onBeatEnd: () => {
      currentBeat = null;
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
    voice = new VoicePlayer(soundscape.context, soundscape.voiceBus);
    void soundscape.start(HUB_SOUND).catch((error: unknown) => {
      console.warn('[audio] could not start', error);
    });

    if (params.has('capture')) {
      new TimingCapture(
        () => voice,
        () => (currentBeat ?? story.beats[0]).lines.map((line) => line.text),
      );
    }

    // The opening beat could not play before this gesture, since there was no
    // audio context to play it into. Start it now.
    //
    // The gaze stays disarmed until it finishes. The viewer's vantage faces the
    // bench and the radio sits right there, so the dwell would otherwise
    // complete on its own within seconds and cut the narration off mid-sentence
    // with an era nobody chose. The last line of the opening is also the only
    // instruction the piece gives -- "look at a thing long enough and it'll
    // tell you when" -- which does not work if it never gets to finish saying it.
    gaze.setArmed(false);
    void sequencer
      .playHubBeat()
      .catch((error: unknown) => console.warn('[story] opening beat failed', error))
      .finally(() => gaze.setArmed(true));
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
      if (xrCamera) {
        fader.attach(xrCamera);
        // Captions are parented to the camera, so this is what actually puts
        // them in front of the viewer in the headset rather than leaving them
        // attached to the idle desktop camera.
        captions.attach(xrCamera);
      }
      dismissGate();
    },
    onExit: () => {
      fader.attach(stage.previewCamera);
      captions.attach(stage.previewCamera);
    },
  });

  // `?physics=1` is the Phase A proving ground: real room, real vantage, real
  // lighting, a handful of catchable boxes. Loads Havok on demand, so its
  // absence from every other path is itself part of what this verifies.
  if (params.has('physics')) {
    const { startPhysicsHarness } = await import('./dev/physicsHarness');
    const anchor = vantage ?? Vector3.Zero();
    void startPhysicsHarness(stage.scene, anchor, xr)
      .then((harness) => {
        perf.watchPhysics({
          activeCount: () => harness.world.activeCount(),
          holdingCount: () => harness.grab.holdingCount,
        });
        (window as unknown as Record<string, unknown>).__harness = harness;
      })
      .catch((error: unknown) => {
        console.error('[harness] physics failed to start', error);
        setStatus(`Physics failed: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  exposeDebugHandle({ stage, story, sequencer, gaze, fader, captions, reticle, perf, xr, audio: () => soundscape });

  // `?subtest=1` pins a caption up immediately, so the panel can be checked and
  // adjusted while wearing the headset without sitting through a beat first.
  if (params.has('subtest')) {
    captions.say('The quick brown fox — if you can read this the right way up, the caption is correct.');
    console.info(
      '[subtest] adjust live from the console:\n' +
        '  __room.captions.setDrop(0.9)       // lower the panel\n' +
        '  __room.captions.setDistance(1.5)   // bring it closer\n' +
        "  __room.captions.say('text')        // change the line",
    );
  }

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
