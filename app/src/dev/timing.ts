import type { VoicePlayer } from '../audio/voice';

/**
 * Re-time subtitle cues by ear.
 *
 * Subtitle timings written against a script are guesses; the delivered take is
 * the truth. Rather than nudging numbers in JSON and re-listening each time,
 * enable this with `?capture=1`, play a beat, and tap **C** as each line
 * begins. Pressing **P** prints a ready-made `lines` array with the captured
 * cues substituted in, to paste straight into content/story.json.
 *
 * Desktop-only, and deliberately so -- there is no keyboard in a headset, and
 * this is an authoring tool rather than part of the piece.
 */
export class TimingCapture {
  private marks: number[] = [];
  private readonly onKey: (event: KeyboardEvent) => void;

  constructor(
    private readonly voice: () => VoicePlayer | null,
    private readonly lines: () => string[],
  ) {
    this.onKey = (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'c') this.mark();
      else if (key === 'p') this.print();
      else if (key === 'x') this.reset();
    };
    window.addEventListener('keydown', this.onKey);
    console.info('[capture] C marks a line, P prints the array, X resets.');
  }

  private mark(): void {
    const player = this.voice();
    if (!player || !player.playing) {
      console.warn('[capture] nothing is playing');
      return;
    }
    const ms = Math.round(player.position * 1000);
    this.marks.push(ms);
    console.info(`[capture] line ${this.marks.length} at ${ms}ms`);
  }

  private print(): void {
    const texts = this.lines();
    if (this.marks.length === 0) {
      console.warn('[capture] no marks yet');
      return;
    }
    if (this.marks.length !== texts.length) {
      console.warn(
        `[capture] ${this.marks.length} marks for ${texts.length} lines — ` +
          `printing what there is, check the pairing`,
      );
    }
    const rows = this.marks.map((atMs, index) => {
      const text = (texts[index] ?? '').replace(/"/g, '\\"');
      return `        { "atMs": ${atMs}, "text": "${text}" }`;
    });
    console.info(`"lines": [\n${rows.join(',\n')}\n      ]`);
  }

  private reset(): void {
    this.marks = [];
    console.info('[capture] cleared');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
  }
}
