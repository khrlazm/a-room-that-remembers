#!/usr/bin/env node
/**
 * Build gate. Enforces the Blender -> Babylon naming contract and the
 * performance budget against the *compressed output*, not the source.
 *
 * This runs before `vite build` in CI, so a chapter that breaks the contract or
 * blows the budget fails the deploy instead of shipping. Most of what it checks
 * fails silently at runtime otherwise: a missing `unlit` tag just makes a room
 * look wrong, and a missing anchor puts the viewer at the origin facing a wall.
 */

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

import { mp3DurationSeconds } from './mp3-duration.mjs';

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHAPTERS_DIR = join(ROOT, 'app', 'public', 'assets', 'chapters');
const STORY_PATH = join(ROOT, 'content', 'story.json');
const VO_DIR = join(ROOT, 'content', 'vo');

// Per chapter. Generous against current usage -- these exist to catch a
// regression (someone subdividing a mesh, or dropping in a 4K texture), not to
// squeeze the last byte.
const BUDGET = {
  primitives: 40, // proxy for draw calls
  triangles: 60_000,
  bytes: 4 * 1024 * 1024,
  // Every grabbable becomes a rigid body plus a convex hull. Havok handles far
  // more than this on desktop, but a Quest 2 has to hold 72fps while also
  // drawing the room, so the ceiling is deliberately low.
  grabbables: 18,
};

const ANCHOR_PREFIX = 'ANCHOR_';
const GATE_PREFIX = 'GATE_';
const STATIC_SUFFIX = '_static';

const problems = [];
const notes = [];

function fail(chapter, message) {
  problems.push(`${chapter}: ${message}`);
}

async function main() {
  if (!existsSync(CHAPTERS_DIR)) {
    throw new Error(
      `No chapters at ${CHAPTERS_DIR} -- run "npm run build:blender && npm run build:assets" first.`,
    );
  }

  const files = readdirSync(CHAPTERS_DIR).filter((f) => f.endsWith('.glb')).sort();
  if (files.length === 0) throw new Error(`No .glb chapters found in ${CHAPTERS_DIR}`);

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const story = existsSync(STORY_PATH) ? JSON.parse(readFileSync(STORY_PATH, 'utf8')) : null;
  const foundGates = new Map();

  for (const file of files) {
    const chapterId = basename(file, '.glb');
    const filePath = join(CHAPTERS_DIR, file);
    const document = await io.read(filePath);
    const root = document.getRoot();

    const nodes = root.listNodes();
    const nodeNames = nodes.map((node) => node.getName());

    // --- Contract ---------------------------------------------------------
    const staticName = `CH_${chapterId}${STATIC_SUFFIX}`;
    if (!nodeNames.includes(staticName)) {
      fail(chapterId, `missing merged static mesh "${staticName}" (did finalize() run?)`);
    }

    const gates = [];
    let grabbables = 0;
    for (const node of nodes) {
      const name = node.getName();
      const extras = node.getExtras() ?? {};

      if (extras.grab) {
        grabbables += 1;
        if (!node.getMesh()) {
          fail(chapterId, `"${name}" is tagged grab but has no mesh, so it cannot be caught`);
        }
        if (extras.mass !== undefined && typeof extras.mass !== 'number') {
          fail(chapterId, `"${name}" has a non-numeric mass extra (${typeof extras.mass})`);
        }

        // A grabbable must carry its position in its transform, not baked into
        // its vertices. A rigid body is placed where the transform says, so a
        // prop authored the other way sits at the origin as far as physics is
        // concerned: containment measures from there and grab reach measures to
        // there, however correct it looks on screen. Use add_prop(), not
        // add_box(), in the scene script.
        const translation = node.getTranslation();
        const atOrigin =
          Math.abs(translation[0]) < 1e-6 &&
          Math.abs(translation[1]) < 1e-6 &&
          Math.abs(translation[2]) < 1e-6;
        if (atOrigin) {
          fail(
            chapterId,
            `grabbable "${name}" has an identity transform -- its position is baked into ` +
              `its vertices, so physics will treat it as sitting at the origin`,
          );
        }
      }

      if (node.getMesh() && !extras.unlit) {
        fail(
          chapterId,
          `mesh node "${name}" has no "unlit" extra -- the runtime will light a ` +
            `surface whose lighting is already baked in, washing it out`,
        );
      }

      if (name.startsWith(GATE_PREFIX)) {
        if (typeof extras.gateId !== 'string') {
          fail(chapterId, `"${name}" is named as a gate but carries no gateId extra`);
        } else {
          gates.push(extras.gateId);
          foundGates.set(extras.gateId, chapterId);
        }
        if (!node.getMesh()) {
          fail(chapterId, `gate "${name}" has no mesh, so it cannot be gazed at`);
        }
      }
    }

    const anchors = nodeNames
      .filter((name) => name.startsWith(ANCHOR_PREFIX))
      .map((name) => name.slice(ANCHOR_PREFIX.length));

    // Only the hub places the viewer; era chapters inherit that vantage.
    if (chapterId === 'hub') {
      for (const required of ['viewer', 'focus']) {
        if (!anchors.includes(required)) {
          fail(chapterId, `missing ${ANCHOR_PREFIX}${required} -- the runtime cannot place the camera`);
        }
      }
    }

    // --- Budget -----------------------------------------------------------
    let primitives = 0;
    let triangles = 0;
    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        primitives += 1;
        const indices = primitive.getIndices();
        const count = indices ? indices.getCount() : (primitive.getAttribute('POSITION')?.getCount() ?? 0);
        triangles += count / 3;
      }
    }

    const bytes = statSync(filePath).size;

    if (primitives > BUDGET.primitives) {
      fail(chapterId, `${primitives} primitives exceeds budget of ${BUDGET.primitives}`);
    }
    if (triangles > BUDGET.triangles) {
      fail(chapterId, `${triangles} triangles exceeds budget of ${BUDGET.triangles}`);
    }
    if (grabbables > BUDGET.grabbables) {
      fail(chapterId, `${grabbables} grabbables exceeds the physics budget of ${BUDGET.grabbables}`);
    }
    if (bytes > BUDGET.bytes) {
      fail(chapterId, `${(bytes / 1024 / 1024).toFixed(2)} MB exceeds budget of ${BUDGET.bytes / 1024 / 1024} MB`);
    }

    // Textures should have come out of build-assets as WebP. A PNG here means
    // the compression step was skipped, which quietly multiplies payload size.
    for (const texture of root.listTextures()) {
      const mime = texture.getMimeType();
      if (mime !== 'image/webp') {
        fail(chapterId, `texture "${texture.getName() || 'unnamed'}" is ${mime}, expected image/webp`);
      }
    }

    notes.push(
      `  ${chapterId.padEnd(10)} ${String(primitives).padStart(3)} prim  ` +
        `${String(triangles).padStart(6)} tris  ` +
        `${(bytes / 1024).toFixed(1).padStart(7)} KB  ` +
        `gates: ${gates.length ? gates.join(', ') : '-'}  ` +
        `grab: ${grabbables || '-'}  ` +
        `anchors: ${anchors.length ? anchors.join(', ') : '-'}`,
    );
  }

  // --- Cross-check against the story manifest ------------------------------
  if (story) {
    for (const beat of story.beats ?? []) {
      if (beat.gate && !foundGates.has(beat.gate)) {
        problems.push(
          `story.json: beat "${beat.id}" waits on gate "${beat.gate}", ` +
            `which no chapter exports`,
        );
      }
      if (beat.chapter && !files.includes(`${beat.chapter}.glb`)) {
        problems.push(`story.json: beat "${beat.id}" needs chapter "${beat.chapter}", which is not built`);
      }
      if (beat.coda && !files.includes(`${beat.coda}.glb`)) {
        problems.push(`story.json: beat "${beat.id}" drifts into coda "${beat.coda}", which is not built`);
      }

      // Subtitle cues against the real length of the take. Timings written
      // against a script are guesses -- a performer who reads faster than
      // expected leaves the last lines scheduled past the end of the audio,
      // where they simply never appear. That is invisible until someone
      // watches the whole beat, so the build checks it instead.
      if (beat.voice) {
        const takePath = join(VO_DIR, beat.voice);
        if (!existsSync(takePath)) {
          problems.push(`story.json: beat "${beat.id}" names voice "${beat.voice}", which is missing`);
          continue;
        }

        const seconds = mp3DurationSeconds(takePath);
        const audioMs = seconds * 1000;
        const late = (beat.lines ?? []).filter((line) => line.atMs >= audioMs);
        if (late.length > 0) {
          problems.push(
            `story.json: beat "${beat.id}" has ${late.length} line(s) cued at or after ` +
              `the end of ${beat.voice} (${seconds.toFixed(2)}s) — they would never show. ` +
              `Latest cue is ${Math.max(...late.map((l) => l.atMs))}ms.`,
          );
        }
        if (beat.durationMs < audioMs) {
          problems.push(
            `story.json: beat "${beat.id}" durationMs ${beat.durationMs} is shorter than ` +
              `${beat.voice} (${Math.round(audioMs)}ms) — the beat would cut the voice off.`,
          );
        }
        notes.push(
          `  ${('vo:' + beat.id).padEnd(14)} ${seconds.toFixed(2).padStart(6)}s  ` +
            `${(beat.lines ?? []).length} lines  last cue ` +
            `${Math.max(0, ...(beat.lines ?? []).map((l) => l.atMs))}ms`,
        );
      }
    }
  } else {
    console.log('note: content/story.json not present yet, skipping manifest cross-check\n');
  }

  console.log('Chapters:');
  console.log(notes.join('\n'));

  if (problems.length > 0) {
    console.error(`\nvalidate: ${problems.length} problem(s)\n`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    console.error('');
    process.exit(1);
  }

  console.log('\nvalidate: contract and budget OK');
}

main().catch((error) => {
  console.error(`\nvalidate failed: ${error.message}`);
  process.exit(1);
});
