import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';

/**
 * The room's ambience, synthesised rather than streamed.
 *
 * Nothing here is a file. A workshop's sound is mains hum, a filament buzz,
 * weather through glass and the near-silence of a room with hard surfaces --
 * all of which are cheaper and more controllable as a handful of oscillators
 * and filtered noise than as loops. It costs no payload, never audibly repeats
 * the way a short loop does, and each layer can be moved, tuned and crossfaded
 * per era from the same code.
 *
 * Positional layers use HRTF panners driven from the Babylon camera, so the
 * radio genuinely sounds like it is on the bench to your left.
 */

export interface EraSound {
  /** Overall loudness of the room tone bed, 0..1. */
  roomTone: number;
  /** Mains hum from the radio. 0 when it is not powered. */
  radioHum: number;
  /** Band-limited hiss between stations. */
  radioStatic: number;
  /** Weather and street through the window. */
  outside: number;
  /** Filament buzz from the ceiling bulb. */
  filament: number;
  /** Hz of the mains supply. 50 reads as European, 60 as North American. */
  mainsHz: number;
}

export const HUB_SOUND: EraSound = {
  roomTone: 0.5,
  radioHum: 0.12,
  radioStatic: 0.05,
  outside: 0.35,
  filament: 0.08,
  mainsHz: 50,
};

/**
 * The coda: the room has let go.
 *
 * Almost everything falls away. No weather, because there is no window any
 * more; barely any room tone, because there is barely any room. What is left is
 * the radio's hum, close and steady -- the one thing in the piece that never
 * stopped working.
 */
export const CODA_SOUND: EraSound = {
  roomTone: 0.12,
  radioHum: 0.55,
  radioStatic: 0.08,
  outside: 0.0,
  filament: 0.0,
  mainsHz: 50,
};

/**
 * The long night: a winter room at four in the morning.
 *
 * Almost nothing. The radio is off, the ceiling bulb is off, and what is left is
 * a thin room tone and the faintest filament buzz from a single bench lamp. The
 * outside is snow, which absorbs rather than carries sound -- so the window
 * layer, which is weather everywhere else, is nearly silent here.
 */
export const THE_LONG_NIGHT_SOUND: EraSound = {
  roomTone: 0.4,
  radioHum: 0.0,
  radioStatic: 0.0,
  outside: 0.06,
  filament: 0.22,
  mainsHz: 50,
};

/**
 * Her glasses: nearly the present, and quieter than it.
 *
 * Almost identical to the hub, which is the point -- the viewer should not be
 * able to say what changed. The radio is on but turned right down, because he
 * still switched it on out of habit; the weather is thinner. Nothing here
 * announces itself.
 */
export const HER_GLASSES_SOUND: EraSound = {
  roomTone: 0.46,
  radioHum: 0.16,
  radioStatic: 0.04,
  outside: 0.22,
  filament: 0.12,
  mainsHz: 50,
};

/**
 * What he was given: an early morning, decades before any of the rest.
 *
 * No radio at all -- he did not own one yet, and the one this piece is named
 * for has not arrived. No bulb either. What is left is a room with hard
 * surfaces and a street waking up outside, which is the only era where the
 * window carries more than the room does.
 */
export const WHAT_HE_WAS_GIVEN_SOUND: EraSound = {
  roomTone: 0.55,
  radioHum: 0.0,
  radioStatic: 0.0,
  outside: 0.5,
  filament: 0.0,
  mainsHz: 50,
};

/** Warmer, louder, working: the radio is on and the room is occupied. */
export const WORKING_YEARS_SOUND: EraSound = {
  roomTone: 0.62,
  radioHum: 0.4,
  radioStatic: 0.22,
  outside: 0.14,
  filament: 0.3,
  mainsHz: 50,
};

const FADE_SECONDS = 1.4;

function noiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (brown) {
    // Integrated white noise, leaked back toward zero so it cannot wander off.
    // Brown noise has far more low-end than white, which is what makes a room
    // sound like it has air in it rather than like a hiss.
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

interface Layer {
  gain: GainNode;
  panner?: PannerNode;
  level: number;
}

export class Soundscape {
  private readonly layers = new Map<string, Layer>();
  private readonly master: GainNode;
  private readonly humOscillators: OscillatorNode[] = [];
  private started = false;

  /** Where voiceover joins the graph. Kept out of `master` on purpose, so the
   *  ambience can duck underneath the voice without ducking the voice too. */
  readonly voiceBus: GainNode;

  private constructor(private readonly ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1;
    this.voiceBus.connect(ctx.destination);
  }

  /**
   * Build the graph. Must be called from a user gesture -- browsers refuse to
   * start an AudioContext otherwise, and a silent experience is a confusing
   * bug to chase later.
   */
  static create(): Soundscape {
    const ctx = new AudioContext();
    const scape = new Soundscape(ctx);
    scape.build();
    return scape;
  }

  get context(): AudioContext {
    return this.ctx;
  }

  private build(): void {
    const { ctx } = this;

    // --- Room tone: brown noise, heavily damped ---------------------------
    const room = this.addLayer('roomTone');
    const roomSource = ctx.createBufferSource();
    roomSource.buffer = noiseBuffer(ctx, 6, true);
    roomSource.loop = true;
    const roomFilter = ctx.createBiquadFilter();
    roomFilter.type = 'lowpass';
    roomFilter.frequency.value = 320;
    roomSource.connect(roomFilter).connect(room.gain);
    roomSource.start();

    // --- Outside: weather through glass, slowly breathing -----------------
    const outside = this.addLayer('outside', [0, 1.55, -1.86]);
    const outsideSource = ctx.createBufferSource();
    outsideSource.buffer = noiseBuffer(ctx, 8, false);
    outsideSource.loop = true;
    const outsideFilter = ctx.createBiquadFilter();
    outsideFilter.type = 'lowpass';
    outsideFilter.frequency.value = 760;
    const outsideSwell = ctx.createGain();
    outsideSwell.gain.value = 0.7;
    // A slow LFO stops it sitting as a flat wall of hiss; wind is never steady.
    const swellLfo = ctx.createOscillator();
    swellLfo.frequency.value = 0.06;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.3;
    swellLfo.connect(swellDepth).connect(outsideSwell.gain);
    swellLfo.start();
    outsideSource.connect(outsideFilter).connect(outsideSwell).connect(outside.gain);
    outsideSource.start();

    // --- Radio: mains hum plus its odd harmonics --------------------------
    // Positioned to match GATE_radio on the bench: left of centre, in front.
    const hum = this.addLayer('radioHum', [-0.52, 1.04, 1.16]);
    for (const [multiple, level] of [
      [1, 0.5],
      [2, 0.3],
      [3, 0.14],
      [5, 0.06],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = multiple === 1 ? 'sine' : 'triangle';
      const partial = ctx.createGain();
      partial.gain.value = level;
      osc.connect(partial).connect(hum.gain);
      osc.start();
      this.humOscillators.push(osc);
    }

    // --- Radio static: narrow band, so it reads as a speaker not a hiss ----
    const staticLayer = this.addLayer('radioStatic', [-0.52, 1.04, 1.16]);
    const staticSource = ctx.createBufferSource();
    staticSource.buffer = noiseBuffer(ctx, 5, false);
    staticSource.loop = true;
    const staticBand = ctx.createBiquadFilter();
    staticBand.type = 'bandpass';
    staticBand.frequency.value = 1500;
    // A small speaker in a wooden box has a narrow, peaky response. Q is doing
    // the work of making this sound like it comes *out of* something.
    staticBand.Q.value = 1.6;
    staticSource.connect(staticBand).connect(staticLayer.gain);
    staticSource.start();

    // --- Filament buzz: twice mains, very quiet ---------------------------
    const filament = this.addLayer('filament', [0, 2.14, 0.6]);
    const buzz = ctx.createOscillator();
    buzz.type = 'sawtooth';
    const buzzFilter = ctx.createBiquadFilter();
    buzzFilter.type = 'lowpass';
    buzzFilter.frequency.value = 1800;
    const buzzTrim = ctx.createGain();
    buzzTrim.gain.value = 0.05;
    buzz.connect(buzzFilter).connect(buzzTrim).connect(filament.gain);
    buzz.start();
    this.humOscillators.push(buzz);

    this.setMains(50);
  }

  private addLayer(name: string, position?: [number, number, number]): Layer {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    let panner: PannerNode | undefined;
    if (position) {
      panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 0.8;
      panner.maxDistance = 12;
      panner.rolloffFactor = 1.1;
      panner.positionX.value = position[0];
      panner.positionY.value = position[1];
      panner.positionZ.value = position[2];
      gain.connect(panner).connect(this.master);
    } else {
      gain.connect(this.master);
    }

    const layer: Layer = { gain, panner, level: 0 };
    this.layers.set(name, layer);
    return layer;
  }

  private setMains(hz: number): void {
    // Oscillators were created in fixed harmonic order: 1x, 2x, 3x, 5x, then
    // the filament at 2x.
    const multiples = [1, 2, 3, 5, 2];
    this.humOscillators.forEach((osc, index) => {
      osc.frequency.setValueAtTime(hz * multiples[index], this.ctx.currentTime);
    });
  }

  /** Bring the whole bed up. Call once, from the same gesture that starts XR. */
  async start(era: EraSound): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.apply(era, this.started ? FADE_SECONDS : 3.2);
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, this.ctx.currentTime);
    // A long first fade: the room should seem to have been quietly humming
    // before the viewer arrived, not to switch on around them.
    this.master.gain.linearRampToValueAtTime(1, this.ctx.currentTime + (this.started ? 0.4 : 3.2));
    this.started = true;
  }

  /** Crossfade to another era's mix. */
  apply(era: EraSound, seconds = FADE_SECONDS): void {
    this.setMains(era.mainsHz);
    this.ramp('roomTone', era.roomTone * 0.35, seconds);
    this.ramp('outside', era.outside * 0.3, seconds);
    this.ramp('radioHum', era.radioHum * 0.22, seconds);
    this.ramp('radioStatic', era.radioStatic * 0.1, seconds);
    this.ramp('filament', era.filament * 0.25, seconds);
  }

  /**
   * Pull the ambience down, typically under a fade or beneath the voice.
   *
   * Only the bed moves -- `voiceBus` is deliberately outside `master`, because
   * ducking a mix that includes the thing you are ducking *for* achieves
   * nothing.
   */
  duck(amount: number, seconds = 0.5): void {
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(amount, this.ctx.currentTime + seconds);
  }

  private ramp(name: string, value: number, seconds: number): void {
    const layer = this.layers.get(name);
    if (!layer) return;
    layer.level = value;
    const now = this.ctx.currentTime;
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
    layer.gain.gain.linearRampToValueAtTime(value, now + seconds);
  }

  /**
   * Point the Web Audio listener wherever the viewer is looking.
   *
   * Babylon's scene is right-handed here to match glTF, and Web Audio is
   * right-handed too, so directions carry across without conversion.
   */
  updateListener(camera: Camera, forward: Vector3, up: Vector3): void {
    const { listener } = this.ctx;
    const position = camera.globalPosition;
    const when = this.ctx.currentTime;

    if (listener.positionX) {
      listener.positionX.setValueAtTime(position.x, when);
      listener.positionY.setValueAtTime(position.y, when);
      listener.positionZ.setValueAtTime(position.z, when);
      listener.forwardX.setValueAtTime(forward.x, when);
      listener.forwardY.setValueAtTime(forward.y, when);
      listener.forwardZ.setValueAtTime(forward.z, when);
      listener.upX.setValueAtTime(up.x, when);
      listener.upY.setValueAtTime(up.y, when);
      listener.upZ.setValueAtTime(up.z, when);
    } else {
      // Older Safari and some standalone-headset browsers still ship the
      // deprecated setter-based listener API.
      const legacy = listener as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
      };
      legacy.setPosition(position.x, position.y, position.z);
      legacy.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  async dispose(): Promise<void> {
    for (const osc of this.humOscillators) osc.stop();
    await this.ctx.close();
  }
}
