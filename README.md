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

## Layout

```
app/          Vite + TypeScript runtime
content/
  blender/    procedural authoring: lib/ helpers, scenes/ one per chapter
  story.json  the narrative manifest (beats, gates, timings)
tools/        build-blender, build-assets, validate
```

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
