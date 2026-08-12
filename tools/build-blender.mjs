#!/usr/bin/env node
/**
 * Runs each chapter's Blender script headlessly and writes raw .glb files.
 *
 * Baking dominates build time, so results are cached against a hash of the
 * inputs (the scene script, the whole authoring library, and the bake
 * settings). Editing one era does not re-bake the other seven.
 *
 *   node tools/build-blender.mjs                # draft quality, cached
 *   node tools/build-blender.mjs --release      # full-quality bake
 *   node tools/build-blender.mjs --scene hub    # one chapter
 *   node tools/build-blender.mjs --force        # ignore the cache
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCENES_DIR = join(ROOT, 'content', 'blender', 'scenes');
const LIB_DIR = join(ROOT, 'content', 'blender', 'lib');
const OUT_DIR = join(ROOT, 'build', 'raw');
const CACHE_DIR = join(ROOT, '.cache', 'blender');

// Draft settings keep the inner loop tolerable; release settings are what ships.
const QUALITY = {
  draft: { samples: 24, atlas: 1024 },
  release: { samples: 256, atlas: 2048 },
};

const CANDIDATE_BLENDER_PATHS = [
  process.env.BLENDER_PATH,
  'E:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
  '/Applications/Blender.app/Contents/MacOS/Blender',
  '/usr/bin/blender',
].filter(Boolean);

function findBlender() {
  for (const candidate of CANDIDATE_BLENDER_PATHS) {
    if (existsSync(candidate)) return candidate;
  }
  // Fall back to PATH and let spawn fail with a clear message if absent.
  return 'blender';
}

function parseArgs(argv) {
  const args = { release: false, force: false, scene: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--release') args.release = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--scene') args.scene = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

/** Hash every input that could change the bake, so the cache is never stale. */
function inputHash(scenePath, quality) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(quality));
  hash.update(readFileSync(scenePath));
  for (const file of readdirSync(LIB_DIR).sort()) {
    if (file.endsWith('.py')) hash.update(readFileSync(join(LIB_DIR, file)));
  }
  return hash.digest('hex');
}

function runBlender(blender, scenePath, quality) {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = [
      '--background',
      // Loads Blender's own defaults and skips the user's installed add-ons.
      // Without this the build inherits whatever is enabled in the local
      // Blender profile -- which on this machine meant Auto-Rig Pro throwing
      // errors and Needle Engine making an outbound analytics request on every
      // single build. Builds must not depend on someone's editor setup.
      '--factory-startup',
      '--python',
      scenePath,
      '--',
      '--out',
      OUT_DIR,
      '--samples',
      String(quality.samples),
      '--atlas',
      String(quality.atlas),
    ];

    const child = spawn(blender, args, { cwd: ROOT });
    // Any bracketed tag a scene script prints. Previously an explicit list of
    // prefixes, which silently swallowed every coda's own "wrote" line as soon
    // as chapters stopped being called hub or era.
    const interesting = /^\[[a-z_]+\]/i;
    let stderr = '';

    const forward = (chunk, isError) => {
      const text = chunk.toString();
      if (isError) stderr += text;
      for (const line of text.split(/\r?\n/)) {
        if (interesting.test(line)) console.log(`  ${line}`);
        else if (/Traceback|^\w*Error:/.test(line)) console.error(`  ${line}`);
      }
    };

    child.stdout.on('data', (chunk) => forward(chunk, false));
    child.stderr.on('data', (chunk) => forward(chunk, true));
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Blender exited ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const quality = args.release ? QUALITY.release : QUALITY.draft;
  const blender = findBlender();

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  let scenes = readdirSync(SCENES_DIR)
    .filter((file) => file.endsWith('.py'))
    .sort();
  if (args.scene) {
    const wanted = `${args.scene}.py`;
    scenes = scenes.filter((file) => file === wanted);
    if (scenes.length === 0) throw new Error(`No scene script named ${wanted}`);
  }

  console.log(
    `Blender: ${blender}\n` +
      `Quality: ${args.release ? 'release' : 'draft'} ` +
      `(${quality.samples} samples, ${quality.atlas}px atlas)\n`,
  );

  const started = Date.now();
  let built = 0;
  let skipped = 0;

  for (const scene of scenes) {
    const name = basename(scene, '.py');
    const scenePath = join(SCENES_DIR, scene);
    const cachePath = join(CACHE_DIR, `${name}.json`);
    const glbPath = join(OUT_DIR, `${name}.glb`);
    const hash = inputHash(scenePath, quality);

    if (!args.force && existsSync(glbPath) && existsSync(cachePath)) {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (cached.hash === hash) {
        console.log(`${name}: up to date, skipping bake`);
        skipped += 1;
        continue;
      }
    }

    console.log(`${name}: building`);
    await runBlender(blender, scenePath, quality);
    writeFileSync(cachePath, JSON.stringify({ hash, builtAt: new Date().toISOString() }, null, 2));
    built += 1;
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nBlender stage: ${built} built, ${skipped} cached, ${elapsed}s`);
}

main().catch((error) => {
  console.error(`\nbuild-blender failed: ${error.message}`);
  process.exit(1);
});
