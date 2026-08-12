import type { Scene } from '@babylonjs/core/scene';

import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import type { Chapter } from '../assets/chapters';
import { anchorPosition, loadChapter } from '../assets/chapters';
import type { Fader } from '../engine/comfort';
import type { VoicePlayer } from '../audio/voice';
import type { PhysicsWorld } from '../physics/world';
import type { Beat, Story } from './types';

/** Just enough of GrabController for the sequencer to start and stop one. */
export interface GrabLike {
  readonly holdingCount: number;
  dispose(): void;
}

export interface SequencerDeps {
  scene: Scene;
  fader: Fader;
  /** Builds the grab controller for a coda's world. Supplied by main so the
   *  sequencer never has to know about XR sessions or input sources. */
  makeGrabber: (world: PhysicsWorld) => GrabLike;
  /** Called when a coda's simulation starts and stops, for the perf readout. */
  onPhysics?: (world: PhysicsWorld | null, grab: GrabLike | null) => void;
  /** Fires whenever the visible chapter changes, including into and out of a
   *  coda -- which `onBeatStart` cannot report, since a coda is a second
   *  chapter inside one beat. */
  onChapter?: (chapterId: string) => void;
  /** Display a subtitle line, or clear it when passed an empty string. */
  onLine: (text: string) => void;
  /** Called when a beat begins, so input can be armed or disarmed. */
  onBeatStart?: (beat: Beat) => void;
  onBeatEnd?: (beat: Beat) => void;
  /** Voiceover playback. Absent before the first user gesture. */
  voice?: () => VoicePlayer | null;
  /** Base URL for voiceover files. */
  voiceBase?: string;
  /** Raised while a take is playing, so the ambience can duck under it. */
  onVoice?: (playing: boolean) => void;
}

/**
 * Hub-and-spoke playback.
 *
 * The viewer stands in the hub; gazing at a gate enters that gate's era, plays
 * it out, and returns. Structure lives in content/story.json, so cutting a
 * spoke is a JSON edit rather than a code change -- which is what makes the
 * runtime length adjustable late, when it is most likely to need adjusting.
 *
 * Chapters stream: the hub is resident throughout, at most one era joins it,
 * and the era is disposed on the way back out. Prefetch starts on gaze *hover*,
 * so the fetch overlaps the dwell and the load is invisible.
 */
export class Sequencer {
  private readonly chapters = new Map<string, Chapter>();
  private readonly inFlight = new Map<string, Promise<Chapter>>();
  private lineTimers: number[] = [];
  private hub: Chapter | null = null;
  private busy = false;

  constructor(
    private readonly story: Story,
    private readonly deps: SequencerDeps,
  ) {}

  get hubChapter(): Chapter | null {
    return this.hub;
  }

  /** Load the hub and play the opening beat. Resolves once the hub is visible. */
  async start(): Promise<Chapter> {
    const hub = await this.load(this.story.hub);
    hub.addToScene();
    hub.setVisible(true);
    this.hub = hub;

    return hub;
  }

  /**
   * Play the opening beat.
   *
   * Separate from `start()` because it cannot run until the viewer's first
   * gesture: there is no AudioContext before that, so the narration would be
   * silent while its subtitles played out regardless.
   */
  async playHubBeat(): Promise<void> {
    const arrival = this.story.beats.find((beat) => beat.kind === 'hub');
    if (!arrival) return;
    this.preloadVoice(this.story.beats.find((beat) => beat.kind === 'era'));
    await this.playLines(arrival);
    this.deps.onLine('');
  }

  /**
   * Begin loading the chapter behind a gate, without entering it.
   *
   * Called the instant the viewer's gaze lands, well before the dwell fills.
   * Safe to call repeatedly -- concurrent calls share one request.
   */
  prefetch(gateId: string): void {
    const beat = this.beatForGate(gateId);
    if (!beat) return;
    this.preloadVoice(beat);
    void this.load(beat.chapter).catch((error: unknown) => {
      console.warn(`[story] prefetch of ${beat.chapter} failed`, error);
    });
  }

  /** Enter a gate's era, play it, and return to the hub. */
  async enter(gateId: string): Promise<void> {
    const beat = this.beatForGate(gateId);
    if (!beat || this.busy || !this.hub) return;
    this.busy = true;

    const hub = this.hub;
    try {
      const era = await this.load(beat.chapter);
      era.addToScene();
      era.setVisible(false);

      const { fadeOutMs, fadeInMs } = this.story.settings;

        this.clearLines();
      this.deps.onLine('');
      await this.deps.fader.to(1, fadeOutMs);

      hub.setVisible(false);
      era.setVisible(true);
      this.deps.onBeatStart?.(beat);
      await this.deps.fader.to(0, fadeInMs);

      await this.playLines(beat);

      // The coda: gravity lets go and this era's things drift free.
      if (beat.coda) {
        await this.deps.fader.to(1, fadeOutMs);
        era.setVisible(false);
        await this.runCoda(beat.coda, beat.codaMs ?? 30000, fadeInMs);
      }

      await this.deps.fader.to(1, fadeOutMs);
      era.setVisible(false);
      hub.setVisible(true);
      this.deps.onLine('');

      // Streaming budget: the hub plus one era. Dropping the era here keeps
      // that true no matter how many spokes the piece grows.
      this.chapters.delete(beat.chapter);
      era.dispose();

      // Re-arm only once the room is fully back. Arming mid-fade would let a
      // viewer trigger the next era while still looking through black, which
      // reads as the piece jumping ahead of them.
      await this.deps.fader.to(0, fadeInMs);
      this.deps.onBeatEnd?.(beat);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Play a beat's voiceover and its subtitles, resolving when the beat ends.
   *
   * When there is a take, captions are driven from the audio's own playback
   * position rather than from timers started alongside it. Those two things
   * drift: audio can start late, stall while buffering, or be resumed by the
   * browser after a tab loses focus, and a timer knows none of it. Reading
   * `currentTime` means a caption cannot desynchronise from the voice it is
   * captioning, which is the one failure a viewer notices immediately.
   */
  private async playLines(beat: Beat): Promise<void> {
    this.clearLines();

    const player = this.deps.voice?.() ?? null;
    if (beat.voice && player) {
      const url = `${this.deps.voiceBase ?? '/'}vo/${beat.voice}`;
      let shown = -1;

      // Poll playback from the scene's render loop. Babylon drives that from
      // whichever frame source is live -- window.requestAnimationFrame on a
      // flat screen, the XR device's frame callback inside a session -- so
      // captions keep advancing in the headset. Polling rAF directly does not:
      // it is suspended for the duration of an immersive session, and the
      // symptom is a take that plays through while the caption sticks on its
      // first line.
      const observer = this.deps.scene.onBeforeRenderObservable.add(() => {
        const ms = player.position * 1000;
        let index = -1;
        for (let i = 0; i < beat.lines.length; i += 1) {
          if (beat.lines[i].atMs <= ms) index = i;
          else break;
        }
        if (index !== shown) {
          shown = index;
          this.deps.onLine(index >= 0 ? beat.lines[index].text : '');
        }
      });

      this.deps.onVoice?.(true);
      try {
        await player.play(url);
      } catch (error) {
        console.warn(`[story] voiceover for "${beat.id}" failed, falling back to timers`, error);
        this.deps.scene.onBeforeRenderObservable.remove(observer);
        await this.timedLines(beat);
        this.deps.onVoice?.(false);
        return;
      }
      this.deps.scene.onBeforeRenderObservable.remove(observer);
      this.deps.onVoice?.(false);
      return;
    }

    await this.timedLines(beat);
  }

  /**
   * Load a coda chapter, let the viewer handle it, then put it away.
   *
   * Physics is created here and torn down on the way out rather than living for
   * the whole piece: nothing outside a coda needs a simulation running, and a
   * standalone headset should not be paying for one through eleven minutes of
   * narration.
   */
  private async runCoda(chapterId: string, durationMs: number, fadeInMs: number): Promise<void> {
    const coda = await this.load(chapterId);
    coda.addToScene();
    coda.setVisible(true);

    // Drift is centred on an anchor authored in Blender, so the containment
    // radius and the composition cannot disagree with each other.
    const centre =
      anchorPosition(coda, 'drift') ?? anchorPosition(coda, 'focus') ?? Vector3.Zero();

    const { createPhysicsWorld, stir } = await import('../physics/world');
    const world = await createPhysicsWorld(this.deps.scene, centre);
    for (const loose of coda.loose) world.add(loose.mesh, loose.id, loose.mass);
    stir(world);

    const grab = this.deps.makeGrabber(world);
    this.deps.onPhysics?.(world, grab);
    this.deps.onChapter?.(chapterId);

    await this.deps.fader.to(0, fadeInMs);
    await new Promise<void>((resolve) => {
      this.lineTimers.push(window.setTimeout(resolve, durationMs));
    });

    grab.dispose();
    world.dispose();
    this.deps.onPhysics?.(null, null);

    this.chapters.delete(chapterId);
    coda.dispose();
  }

  /** Fallback when a beat has no take yet, or playback failed. */
  private timedLines(beat: Beat): Promise<void> {
    this.clearLines();
    for (const line of beat.lines) {
      this.lineTimers.push(window.setTimeout(() => this.deps.onLine(line.text), line.atMs));
    }
    return new Promise((resolve) => {
      this.lineTimers.push(window.setTimeout(resolve, beat.durationMs));
    });
  }

  /** Warm a beat's take so it starts the instant the beat does. */
  private preloadVoice(beat: Beat | undefined): void {
    if (!beat?.voice) return;
    const player = this.deps.voice?.();
    player?.preload(`${this.deps.voiceBase ?? '/'}vo/${beat.voice}`);
  }

  private clearLines(): void {
    for (const timer of this.lineTimers) window.clearTimeout(timer);
    this.lineTimers = [];
  }

  private beatForGate(gateId: string): Beat | undefined {
    return this.story.beats.find((beat) => beat.gate === gateId);
  }

  /** Load a chapter once, sharing the request between concurrent callers. */
  private load(id: string): Promise<Chapter> {
    const loaded = this.chapters.get(id);
    if (loaded) return Promise.resolve(loaded);

    const existing = this.inFlight.get(id);
    if (existing) return existing;

    const request = loadChapter(this.deps.scene, id)
      .then((chapter) => {
        this.chapters.set(id, chapter);
        this.inFlight.delete(id);
        return chapter;
      })
      .catch((error: unknown) => {
        this.inFlight.delete(id);
        throw error;
      });

    this.inFlight.set(id, request);
    return request;
  }

  dispose(): void {
    this.clearLines();
    for (const chapter of this.chapters.values()) chapter.dispose();
    this.chapters.clear();
  }
}
