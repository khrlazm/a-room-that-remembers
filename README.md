# A Room That Remembers

A 10–15 minute narrative experience in WebXR, built for the Quest standalone
browser. The viewer stands in one fixed corner of a workshop; gazing at an
object collapses the room into the era that object belongs to.

Three stacks, one pipeline: **Blender** authors the content procedurally,
**glTF** carries it, **Babylon.js** runs it.

## How this is put together

Assets are **code**. Every chapter is a Python script driving Blender headlessly
— geometry, materials, lighting, the Cycles bake, and the glTF export. Nothing
is hand-modelled, so builds are reproducible and the naming contract between
Blender and the runtime is enforced by construction rather than by discipline.

Lighting is **baked into base colour** and materials are marked unlit. glTF has
no ratified lightmap extension, so the alternative was a custom `extras` hack;
baking into albedo means one texture per chapter, no lighting maths on a mobile
GPU, and — since every static surface can then share one material — the entire
room merges into a single draw call.

### The contract

Blender custom properties become glTF `extras`, which Babylon exposes at
`node.metadata.gltf.extras`. That seam is how content gains behaviour without a
runtime code change. `tools/validate.mjs` enforces it on the compressed output.

| Blender | glTF | Babylon |
| --- | --- | --- |
| collection `CH_<id>` | one `.glb` per chapter | one `AssetContainer` |
| empty `ANCHOR_<name>` | node | camera placement, audio emitters |
| mesh `GATE_<id>` + `gateId` extra | node + extras | gaze-dwell target |
| `unlit` extra | extras | `PBRMaterial.unlit = true` |

### Sound

Ambience is **synthesised, not streamed**: brown-noise room tone, mains hum and
its odd harmonics from the radio, band-limited static through a narrow filter so
it reads as coming out of a small wooden box, weather through the window on a
slow LFO, filament buzz at twice mains. No payload, never audibly loops, and
every layer is HRTF-panned from the camera and crossfaded per era.

Voiceover is the exception — a real performance, streamed. It is deliberately
**not** spatialised: he is the room's memory of itself, not a man in the corner,
and a positioned voice would invite the viewer to turn and look for a body that
is not there. It sits on its own bus so the ambience can duck beneath it.

Subtitles are driven from the audio's own `currentTime`, never from timers
started alongside it. Those drift — playback can start late, stall, or be
resumed by the browser after focus loss — and a caption out of step with the
voice is the first thing a viewer notices.

## Layout

```
app/          Vite + TypeScript runtime
content/
  blender/    procedural authoring: lib/ helpers, scenes/ one per chapter
  story.json  the narrative manifest (beats, gates, timings)
  vo/         voiceover takes and the script they were recorded from
tools/        build-blender, build-assets, validate, mp3-duration
```

## Re-timing subtitles

Cues in `story.json` were written against the script, then scaled to the
delivered takes. Scaling assumes even pacing, which speech is not. To fix them
by ear, run with `?capture=1`, play a beat, and tap **C** as each line begins;
**P** prints a ready-made `lines` array to paste back.

`npm run validate` fails the build if any cue lands at or after the end of its
take — a line scheduled past the audio never appears, and that is invisible
until somebody watches the whole beat.

## Building

```bash
npm install
npm run build:content
npm run dev
```

`build:content` runs Blender, compresses to WebP, then validates. Bakes are
cached against a hash of the scene script and the authoring library, so editing
one chapter does not re-bake the others. Add `--release` for a full-quality bake.

Blender is found via `BLENDER_PATH`, or the usual install locations. It runs
with `--factory-startup` so the build never inherits locally installed add-ons.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages. Blender does **not** run
in CI — bakes are slow and GPU-less on runners, so compressed chapter assets are
built locally and committed, and CI only builds the web app. `validate` runs
before the build, so a broken contract or a blown budget fails the deploy rather
than shipping.

## Testing on a headset

WebXR needs a secure context. `adb reverse tcp:5173 tcp:5173` makes the Quest
browser see the dev server as `http://localhost:5173`, which counts as secure —
no TLS certificate required. The deployed Pages URL works over HTTPS directly.
