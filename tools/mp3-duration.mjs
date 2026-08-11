/**
 * Measure an MP3's duration by walking its frame headers.
 *
 * Avoids depending on ffprobe, which is not installed here and would be one
 * more thing a contributor has to have. Counting frames handles VBR correctly,
 * which a size-over-bitrate estimate does not.
 */

import { readFileSync } from 'node:fs';

// [MPEG1, MPEG2/2.5] Layer III bitrates in kbps, indexed by the header's
// 4-bit bitrate field. Index 0 is "free" and 15 is invalid.
const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};

const SAMPLE_RATES = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000],  // MPEG2.5
};

/** Skip an ID3v2 tag if present; its size is a 28-bit synchsafe integer. */
function audioStart(buffer) {
  if (buffer.length > 10 && buffer.toString('ascii', 0, 3) === 'ID3') {
    const size =
      (buffer[6] & 0x7f) * 0x200000 +
      (buffer[7] & 0x7f) * 0x4000 +
      (buffer[8] & 0x7f) * 0x80 +
      (buffer[9] & 0x7f);
    return 10 + size;
  }
  return 0;
}

export function mp3DurationSeconds(path) {
  const buffer = readFileSync(path);
  let offset = audioStart(buffer);
  let samples = 0;
  let sampleRate = 0;

  while (offset + 4 <= buffer.length) {
    // Frame sync: eleven set bits.
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const versionBits = (buffer[offset + 1] >> 3) & 0x03;
    const layerBits = (buffer[offset + 1] >> 1) & 0x03;
    const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
    const rateIndex = (buffer[offset + 2] >> 2) & 0x03;
    const padding = (buffer[offset + 2] >> 1) & 0x01;

    // Layer III only (layerBits === 1); reject reserved version/rate values.
    if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      offset += 1;
      continue;
    }

    const isMpeg1 = versionBits === 3;
    const bitrate = BITRATES[isMpeg1 ? 1 : 2][bitrateIndex] * 1000;
    const rate = SAMPLE_RATES[versionBits][rateIndex];
    if (!bitrate || !rate) {
      offset += 1;
      continue;
    }

    const samplesPerFrame = isMpeg1 ? 1152 : 576;
    const frameLength = Math.floor((samplesPerFrame / 8) * (bitrate / rate)) + padding;
    if (frameLength <= 4) {
      offset += 1;
      continue;
    }

    samples += samplesPerFrame;
    sampleRate = rate;
    offset += frameLength;
  }

  if (!sampleRate || !samples) throw new Error(`no MP3 frames found in ${path}`);
  return samples / sampleRate;
}
