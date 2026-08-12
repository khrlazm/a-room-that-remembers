# Scene bible

What each beat looks like, and what its coda leaves behind. This is the document
`content/blender/scenes/*.py` gets built from; the voiceover lives in
`content/vo/script.md`, and the two are written to fit each other.

## The shape of it

Eight beats. One room, re-dressed. Roughly fourteen minutes with codas.

| # | Beat | Object | Era length | Coda | Objects adrift |
| --- | --- | --- | --- | --- | --- |
| 0 | arrival | — | 0:40 | — | — |
| 1 | radio | a wireless set | 1:06 | 0:30 | 9 |
| 2 | clock | a mantel clock | 1:15 | 0:30 | 7 |
| 3 | toolbox | his father's tools | 1:20 | 0:30 | 6 |
| 4 | chair | a child's chair | 1:10 | 0:25 | 4 |
| 5 | window | the shop window | 1:00 | 0:25 | 3 |
| 6 | spectacles | her glasses | 0:50 | 0:20 | 1 |
| 7 | departure | — | 1:00 | — | — |

**The codas empty out.** Nine objects drift in the first, one in the last. Nobody
will consciously notice the count, but the feeling of a memory with less and
less in it is the whole shape of the piece, and it costs nothing to build —
later codas are cheaper than earlier ones.

**The spoke count is still the descope dial.** Cut `window` and `chair` and it
runs eleven minutes with the arc intact. Cut `spectacles` and it does not: that
one is the point.

---

## 0. Arrival — the hub

Present day. Cool, still, under-dressed. Half the shelves empty, the bench clear
except for the radio. Daylight does the work; the bulb is on but weak.

Already built: `scenes/hub.py`, preset `PRESENT` in `lib/workshop.py`.

The only warm thing in the room is the radio's dial. That is what makes the eye
go to it, and it is the whole tutorial.

---

## 1. Radio — the working years

Built: `scenes/era_radio.py`, preset `WORKING_YEARS`.

Evening. The bulb is the light now and the window has gone amber and dim.
Shelves full, bench mid-repair: the radio's back panel off, a parts tray, tools,
a cloth. A chair pulled out, empty.

**Coda** (built): radio, back panel, tray, three tools, cloth, a crate, a valve.
Two figures well beyond the drift — him seated at a bench that is no longer
there, her turned toward him.

---

## 2. Clock — the long night

Built: `scenes/era_clock.py` and `scenes/coda_clock.py`, preset `THE_LONG_NIGHT`.

Two things learned building it, both now in the kit:

- The bench lamp is a new `Era` field (`lamp`, `lamp_strength`) rather than the
  ceiling bulb dimmed. A bulb at the ceiling fills a room however low you take
  it; only a lamp on the bench gives one hard pool with dark around it.
- Its emitter hangs clear **below** the shade. Sat flush with the underside, the
  shade occludes its own bulb: the fixture renders, the room stays lit by the
  window alone, and nothing in the image explains why. The arm also has to reach
  most of the way over the bench, or the pool lands on the clock case instead of
  on the work the beat is about.

**Era.** Deep winter, small hours. The coldest the room ever gets. The bulb is
off; a single work lamp on the bench makes one hard pool of light and leaves the
rest of the room to the window, which is moonlit snow — near-white, blue, and
the brightest thing in the piece.

> Preset `THE_LONG_NIGHT`: plaster (0.42, 0.44, 0.50), floor (0.20, 0.19, 0.20),
> timber (0.30, 0.26, 0.22), daylight (0.62, 0.74, 1.0) at 2.4, bulb off,
> a lamp emitter (1.0, 0.86, 0.62) at 26 aimed down at the bench.

**Props.** A mantel clock, case open, on the bench. Its movement laid out on a
cloth in careful rows — this is the tidiest bench in the piece, because he was
being careful. A magnifier on a stand. A cup, gone cold.

**Coda** (7): the clock case, the movement, two hands, a mainspring, the glass
dome, the cup. One figure only, standing back near the door, waiting — not
seated, not working. Someone who came to collect something and is still there.

---

## 3. Toolbox — what he was given

**Era.** The earliest. Hard clean morning light, everything younger: paler
timber, fewer marks, shelves half-stocked because he had not filled them yet.
Bulb off — it is daylight and he cannot afford the electricity.

> Preset `WHAT_HE_WAS_GIVEN`: plaster (0.68, 0.65, 0.58), floor (0.38, 0.28, 0.19),
> timber (0.56, 0.41, 0.24), daylight (0.92, 0.94, 1.0) at 5.5, bulb off.

**Props.** A wooden toolbox, lid up, on the bench — older and better made than
anything else in the room. Chisels laid out by size. A whetstone. A tin of oil.

**Coda** (6): the toolbox, three chisels, the whetstone, the oil tin. Two
figures: a tall one standing, and a much smaller one beside it, close. The only
coda with a child in it.

---

## 4. Chair — the one he made

**Era.** Warm afternoon, and the room is a home rather than a shop for the only
time. Something domestic on the shelves, a cloth on the bench end, the window
open — the piece's only open window.

> Preset `THE_ONE_HE_MADE`: plaster (0.66, 0.58, 0.46), floor (0.34, 0.24, 0.15),
> timber (0.54, 0.38, 0.21), daylight (1.0, 0.92, 0.74) at 4.2,
> bulb (1.0, 0.82, 0.52) at 12.

**Props.** A child's chair, half-built, clamped. Shavings on the floor — the
only mess in the piece, and it should read as good mess. A drawknife. A glue pot.

This is the one object in the room he made rather than mended. Everything about
the dressing should say *making*, not *repair*.

**Coda** (4): the chair, two of its legs, the drawknife. One small figure,
seated on nothing, at the height the chair was built for.

---

## 5. Window — weather

**Era.** A storm at night. The loneliest beat and the emptiest. Bench nearly
bare. The window is broken — a pane out, boarded from outside, rain getting in.
The bulb swings, so the light is unsteady.

> Preset `WEATHER`: plaster (0.44, 0.44, 0.42), floor (0.22, 0.19, 0.16),
> timber (0.34, 0.26, 0.18), daylight (0.46, 0.52, 0.60) at 1.1,
> bulb (1.0, 0.78, 0.46) at 22.

A swinging bulb cannot be baked as motion, so the swing lives in the *bake*: the
shadows are thrown hard and off-axis, as though caught mid-swing. One frame of a
moving light, frozen.

**Props.** A boarded pane, putty knife, a bucket catching drips, glass swept
into a corner.

**Coda** (3): the putty knife, a pane of glass, the bucket. **No figures.** The
only coda with nobody in it, and the only one where the viewer is alone.

---

## 6. Spectacles — her glasses

**Era.** Almost the hub. Late, thin, tidy. Everything put away, because by now
he was keeping the place rather than working in it. The shortest era and the
stillest: nothing is mid-repair except one small thing.

> Preset `HER_GLASSES`: within a few percent of `PRESENT`, one notch warmer and
> the bulb a little brighter. The viewer should not be able to say what changed,
> only that this is nearly now.

**Props.** A pair of spectacles on the bench, one arm bent. A tiny screwdriver
beside them. Nothing else on the bench at all.

**Coda** (1): the spectacles. Nothing else drifts. One figure, and for the only
time she is **close** — inside the drift rather than beyond it, near enough to
reach and impossible to move.

---

## 7. Departure — the finale

No gate; it plays when the last object resolves.

The room comes back as the hub, and then everything he ever mended is on the
bench at once — every object from every era, in its place, briefly. Then they go
out one at a time, in the order the viewer met them.

The last thing to go is the bulb. Then the window, which has been the brightest
thing in the room all along, fades up rather than down, and holds.

Buildable as a single chapter with per-object animations, or — cheaper, and
probably better — as a short chain of chapters with the fader between them. Try
the cheap version first.

---

## Building a new era

1. Add the preset to `lib/workshop.py` beside `PRESENT` and `WORKING_YEARS`.
2. Copy `scenes/era_radio.py`, swap the preset and the bench dressing.
3. Copy `scenes/coda_radio.py`, swap the prop list and the figures. Use
   `add_prop()` for anything grabbable — `add_box()` bakes position into
   vertices and physics will treat the object as sitting at the origin.
4. Add the gate object to `scenes/hub.py` with a `gateId`.
5. Add the beat to `content/story.json` with its `coda` and `codaMs`.
6. `npm run build:content`. Validation will catch a gate with no object, a coda
   that is not built, a cue past the end of its take, and a grabbable with an
   identity transform.
