import type { Scene } from '@babylonjs/core/scene';

import type { Chapter } from '../assets/chapters';
import { loadChapter } from '../assets/chapters';
import type { Fader } from '../engine/comfort';
import type { Beat, Story } from './types';

export interface SequencerDeps {
  scene: Scene;
  fader: Fader;
  /** Display a subtitle line, or clear it when passed an empty string. */
  onLine: (text: string) => void;
  /** Called when a beat begins, so input can be armed or disarmed. */
  onBeatStart?: (beat: Beat) => void;
  onBeatEnd?: (beat: Beat) => void;
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

    const arrival = this.story.beats.find((beat) => beat.kind === 'hub');
    if (arrival) void this.playLines(arrival);

    return hub;
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

  /** Schedule a beat's subtitles and resolve when the beat's time is up. */
  private playLines(beat: Beat): Promise<void> {
    this.clearLines();
    for (const line of beat.lines) {
      this.lineTimers.push(
        window.setTimeout(() => this.deps.onLine(line.text), line.atMs),
      );
    }
    return new Promise((resolve) => {
      this.lineTimers.push(window.setTimeout(resolve, beat.durationMs));
    });
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
