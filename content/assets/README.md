# External meshes

Anything here came from outside the procedural pipeline: a generator, an asset
library, or somebody modelling it by hand. `content/blender/lib/ingest.py` is the
way in.

## The rule

**Generate offline, commit the result, treat it as source. Never fetch or
generate during a build.**

Generation is non-deterministic and takes about a minute per asset through an
async API. A build that could produce different geometry on different runs would
make "rebuild from source" meaningless — and that property is what the rest of
this project is organised around. Committing the file makes an external asset an
explicit, versioned exception rather than a hole in the guarantee.

## Before you download

**Remesh to 20,000 triangles or fewer.** A raw Meshy 6 export runs to about
600,000 faces and 20–50 MB; a handful of those would blow the repository size
budget on their own. 20k is the working master — `ingest()` decimates further to
800 triangles for a hero prop or 150 for set dressing, and doing that from a
20k master gives the same result as from 600k.

## Layout

```
content/assets/
  radio_1938/
    mesh.glb        the committed source
    source.json     where it came from
```

`source.json` records origin, prompt or search terms, task id, licence and the
date retrieved. This is not paperwork for its own sake: generator terms change,
and anything shipping publicly has to be able to answer where each mesh came
from.

## Using one

```python
from lib.ingest import ingest

radio = ingest(
    "content/assets/radio_1938/mesh.glb",
    naming.gate_name("radio"),
    collection,
    tier="hero",
    material=room.materials["timber_dark"],
    at=(-0.52, -1.16, BENCH_TOP + 0.12),
    longest=0.36,
)
```

`longest` is the size the object should end up, in metres, along its biggest
axis. State it — do not trust the file. An external mesh has no real-world
units, and this piece is built to centimetre-accurate metric, so a mesh off by
10× is either invisible or fills the room.

By the time `finalize()` sees the result it is indistinguishable from a scripted
box: one mesh, our material, our naming, within budget, and pivoted at its own
centre so a physics body lands where the object appears.

## Two things that will bite

**Style collision.** A photoreal asset next to flat-shaded boxes looks pasted
in. The shared Cycles bake helps — everything comes out with the same lighting —
but silhouette and detail density will not match. Decimating harder than the
tier suggests usually helps more than it costs, and "it looks too good for this
room" is a real failure.

**It stops being reproducible.** Every asset here is a thing no script can
rebuild. Two or three hero props is a fair trade for objects that have to read
as a specific real thing. A scene made mostly of them has given up the property
that made this pipeline worth having.

## Checking the path still works

```bash
blender --background --factory-startup --python content/blender/diag_ingest.py
```

Builds a source with every failure mode at once — several parts, ten times the
intended scale, its own PBR materials, far too many triangles, geometry nowhere
near its origin — ingests it, and checks the result. Exits non-zero on failure.
