/**
 * Voiceover playback, routed through the same graph as the procedural bed.
 *
 * Uses a streaming `<audio>` element rather than a decoded AudioBuffer: the
 * takes are a minute or more each, and decoding those to raw PCM costs tens of
 * megabytes of memory on a standalone headset for no benefit. Streaming also
 * gives an honest `currentTime`, which is what the sequencer drives subtitles
 * from -- so captions stay locked to the performance even if playback starts
 * late or stalls on a slow connection.
 */

export interface VoiceHandle {
  /** Seconds elapsed in the current take. */
  readonly position: number;
  readonly duration: number;
  readonly ended: boolean;
  stop(): void;
}

export class VoicePlayer {
  private element: HTMLAudioElement | null = null;
  private readonly gain: GainNode;
  /** Cached per URL: re-creating a MediaElementAudioSourceNode for an element
   *  that already has one throws, and browsers refuse to re-route it. */
  private readonly sources = new Map<string, { element: HTMLAudioElement; node: MediaElementAudioSourceNode }>();

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(destination);
  }

  /**
   * Play a take and resolve when it finishes.
   *
   * The voice is deliberately *not* spatialised. He is not standing in the
   * corner of the room -- he is the room's memory of itself, and a positioned
   * voice would invite the viewer to turn and look for a body that is not
   * there. Everything else in the mix is panned; this is the one thing that
   * should follow you.
   */
  async play(url: string, onProgress?: (seconds: number) => void): Promise<void> {
    this.stop();

    const { element } = this.acquire(url);
    this.element = element;
    element.currentTime = 0;

    await this.ctx.resume().catch(() => undefined);

    return new Promise<void>((resolve, reject) => {
      let frame = 0;

      const tick = () => {
        if (this.element !== element) return; // superseded by another take
        onProgress?.(element.currentTime);
        frame = requestAnimationFrame(tick);
      };

      const finish = () => {
        cancelAnimationFrame(frame);
        element.removeEventListener('ended', finish);
        element.removeEventListener('error', fail);
        resolve();
      };

      const fail = () => {
        cancelAnimationFrame(frame);
        element.removeEventListener('ended', finish);
        element.removeEventListener('error', fail);
        reject(new Error(`voiceover failed to play: ${url}`));
      };

      element.addEventListener('ended', finish);
      element.addEventListener('error', fail);

      element.play().then(
        () => {
          frame = requestAnimationFrame(tick);
        },
        (error: unknown) => {
          cancelAnimationFrame(frame);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  /** Warm the cache so a take starts instantly when its beat begins. */
  preload(url: string): void {
    this.acquire(url);
  }

  private acquire(url: string): { element: HTMLAudioElement; node: MediaElementAudioSourceNode } {
    const cached = this.sources.get(url);
    if (cached) return cached;

    const element = new Audio(url);
    element.preload = 'auto';
    element.crossOrigin = 'anonymous';
    const node = this.ctx.createMediaElementSource(element);
    node.connect(this.gain);

    const entry = { element, node };
    this.sources.set(url, entry);
    return entry;
  }

  stop(): void {
    if (this.element) {
      this.element.pause();
      this.element = null;
    }
  }

  get position(): number {
    return this.element?.currentTime ?? 0;
  }

  get playing(): boolean {
    return this.element !== null && !this.element.paused;
  }

  dispose(): void {
    this.stop();
    for (const { element } of this.sources.values()) element.src = '';
    this.sources.clear();
  }
}
