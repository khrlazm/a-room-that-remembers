#!/usr/bin/env node
/**
 * Compress raw Blender exports into the deployable assets.
 *
 * Textures become WebP, which Babylon reads natively via EXT_texture_webp.
 * That is deliberate: KTX2/Basis stays GPU-compressed in VRAM and is the usual
 * recommendation for standalone headsets, but it needs transcoder binaries that
 * Babylon only publishes on its CDN, and this piece has exactly one 2048 atlas
 * per chapter with at most two chapters resident -- roughly 32 MB of VRAM,
 * which a Quest 3 does not notice. WebP measured *smaller* on disk than KTX2
 * here (37 KB vs 80 KB) and needs no decoder, so it removes an entire class of
 * deploy-only failure. Revisit if texture upload stutter ever shows up on device.
 *
 * Deliberately does NOT use `gltf-transform optimize`: its defaults include
 * --flatten and --join-named, which merge distinct meshes and would silently
 * fold GATE_ nodes into the static mesh, breaking the naming contract.
 */

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'build', 'raw');
const OUT_DIR = join(ROOT, 'app', 'public', 'assets', 'chapters');

const WEBP_QUALITY = 90;

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  if (!existsSync(RAW_DIR)) {
    throw new Error(`No raw exports at ${RAW_DIR} -- run "npm run build:blender" first.`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  const inputs = readdirSync(RAW_DIR).filter((file) => file.endsWith('.glb')).sort();
  if (inputs.length === 0) throw new Error(`No .glb files in ${RAW_DIR}`);

  let totalBefore = 0;
  let totalAfter = 0;

  for (const input of inputs) {
    const name = basename(input, '.glb');
    const inputPath = join(RAW_DIR, input);
    const outputPath = join(OUT_DIR, input);

    const document = await io.read(inputPath);
    await document.transform(
      textureCompress({ encoder: sharp, targetFormat: 'webp', quality: WEBP_QUALITY }),
    );
    await io.write(outputPath, document);

    const before = statSync(inputPath).size;
    const after = statSync(outputPath).size;
    totalBefore += before;
    totalAfter += after;

    const saved = ((1 - after / before) * 100).toFixed(0);
    console.log(`${name}: ${kb(before)} → ${kb(after)}  (-${saved}%)`);
  }

  console.log(
    `\nAsset stage: ${inputs.length} chapter(s), ` +
      `${kb(totalBefore)} → ${kb(totalAfter)} total`,
  );
}

main().catch((error) => {
  console.error(`\nbuild-assets failed: ${error.message}`);
  process.exit(1);
});
