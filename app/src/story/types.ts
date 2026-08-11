/**
 * Shape of content/story.json.
 *
 * The manifest is data on purpose: adding an era, retiming a line, or cutting a
 * beat should be a JSON edit, not a TypeScript one. `tools/validate.mjs`
 * cross-checks every `gate` and `chapter` named here against what Blender
 * actually exported, so a typo fails the build rather than dead-ending a viewer
 * halfway through the piece.
 */

export interface Line {
  /** Milliseconds from the start of the beat. */
  atMs: number;
  text: string;
}

export interface Beat {
  id: string;
  /** `hub` plays on return; `era` is entered by gazing at its gate. */
  kind: 'hub' | 'era';
  chapter: string;
  /** Gate id that enters this beat. Absent for the hub. */
  gate?: string;
  /** Voiceover filename under /vo/. Beats without one fall back to timers. */
  voice?: string;
  durationMs: number;
  lines: Line[];
}

export interface StorySettings {
  dwellMs: number;
  fadeOutMs: number;
  fadeInMs: number;
}

export interface Story {
  title: string;
  hub: string;
  settings: StorySettings;
  beats: Beat[];
}

export async function loadStory(baseUrl: string): Promise<Story> {
  const response = await fetch(`${baseUrl}story.json`);
  if (!response.ok) throw new Error(`story.json: ${response.status} ${response.statusText}`);
  return (await response.json()) as Story;
}
