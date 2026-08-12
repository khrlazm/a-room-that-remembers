# Voiceover script

For ElevenLabs v3. Two beats written here — `arrival` and `radio` — out of an
eventual seven or eight.

## The voice

**Who:** the man whose workshop this is. Speaking from somewhere after, though
never explained and never spooky. He is not addressing a crowd; he is thinking
out loud in a room he knows better than his own hands.

**Age and grain:** late seventies. A working voice, not a broadcast one. Some
gravel, some breath. He has smoked or he has worked around dust; either reads.

**Accent:** northern English, lightly. Avoid anything performed. If the voice
model can only do RP, keep it low and unhurried rather than crisp.

**Delivery:** the hardest note, and the one worth protecting — **he is not sad
about it.** He is matter-of-fact about grief because he has had a long time to
get used to it, and matter-of-fact is what makes it land. Any take that sounds
like it is *asking* to be moving should be rejected and re-rolled.

He talks about objects because that is how he talks about people. He never
names the feeling. Neither should the read.

**Pacing:** slow. Slower than feels correct in the booth. The viewer is standing
still in a room with nothing demanding their attention; there is no competition
for the line and no reason to hurry it. Long gaps are content here, not dead air.

## ElevenLabs v3 settings

| Setting | Value | Why |
| --- | --- | --- |
| Model | Eleven v3 | Audio tags only work here |
| Stability | **Natural** | Creative over-emotes and starts performing the grief; Robust flattens the tags out entirely |
| Similarity | 70–80 | High enough to hold the character across takes |
| Speed | 0.9 | The room is slow; the voice should be slower |

Tags in square brackets are v3 audio tags. Ellipses and line breaks carry the
timing — v3 responds to punctuation, so the layout below **is** the direction.
If a gap is not landing long enough, `<break time="1.2s" />` is available, but
try the punctuation first; explicit breaks tend to sound mechanical.

Render each beat as **one continuous take**, not line by line. Continuity of
breath across the pauses is most of what sells it.

---

## Beat: `arrival` — the hub

Plays once when the viewer arrives. Its last line is also the tutorial: it tells
them that looking is the verb, without a single word of interface.

> [softly] Mind the step.
>
> There's always been a step.
>
> …
>
> Forty-one years, this room. [exhales] Forty-one years of other people's broken things.
>
> They'd come in under an arm. In a carrier bag. Wrapped in a tea towel like something that had died.
>
> And I'd say — leave it with me. [warmly] I always said that. Leave it with me.
>
> …
>
> [quietly] I never once said I can't.
>
> Not out loud.
>
> …
>
> Have a look round. Go on.
>
> [softly] Look at a thing long enough, and it'll tell you when.

**Target length:** 42–50s.

| Line lands at | Subtitle |
| --- | --- |
| 0:01 | Mind the step. There's always been a step. |
| 0:09 | Forty-one years, this room. Forty-one years of other people's broken things. |
| 0:18 | They'd come in under an arm. Wrapped in a tea towel like something that had died. |
| 0:26 | And I'd say — leave it with me. I always said that. |
| 0:33 | I never once said I can't. Not out loud. |
| 0:42 | Look at a thing long enough, and it'll tell you when. |

---

## Beat: `radio` — the working years

Entered by holding a gaze on the radio. The reveal is late and deliberately
underplayed: the emotional weight sits in "nobody was listening", and the last
line names the theme of the whole piece without ever touching the word.

> [warmly] Ah. That one.
>
> That one was Mrs Ellery's. Two streets over.
>
> Came in with a crack down the back and a hum you could feel in your teeth.
>
> …
>
> Four evenings, that took me. A valve. A dry joint on the transformer.
>
> And a screw — [chuckles softly] — a screw I had to cut myself. They'd stopped making that thread. Nobody made it. So I made it.
>
> …
>
> She couldn't pay. I knew that when she walked in.
>
> [softly] She brought bread instead. Every Friday for a year. A loaf on that bench, still warm.
>
> …
>
> She died in the spring of eighty-six.
>
> …
>
> [quietly] And I kept it working.
>
> Thirty years, I kept that radio working. New valves when I could find them. Tuned it every winter.
>
> [exhales] Nobody was listening to it. I knew that. I'm not daft.
>
> …
>
> [softly] But it's a small thing, isn't it. To keep something going. After.
>
> …
>
> [whispers] It's the only kind of mending I was ever any good at.

**Target length:** 85–95s.

| Line lands at | Subtitle |
| --- | --- |
| 0:01 | Ah. That one. That one was Mrs Ellery's, two streets over. |
| 0:08 | Came in with a crack down the back and a hum you could feel in your teeth. |
| 0:17 | Four evenings, that took me. A valve. A dry joint on the transformer. |
| 0:26 | And a screw I had to cut myself. They'd stopped making that thread. So I made it. |
| 0:38 | She couldn't pay. I knew that when she walked in. |
| 0:45 | She brought bread instead. Every Friday for a year. A loaf on that bench, still warm. |
| 0:56 | She died in the spring of eighty-six. |
| 1:04 | And I kept it working. Thirty years, I kept that radio working. |
| 1:14 | Nobody was listening to it. I knew that. I'm not daft. |
| 1:23 | But it's a small thing, isn't it. To keep something going. After. |
| 1:33 | It's the only kind of mending I was ever any good at. |

---

## Producing the files

Export each beat as `content/vo/<beat-id>.mp3`, mono, 128kbps — it is a single
close voice, stereo buys nothing and doubles the payload.

Then reconcile `content/story.json`: the `atMs` values there are the timings
above in milliseconds, and `durationMs` should be the rendered file's length
plus about 1500ms of room to let the last line sit before the fade starts.

The timings above are written to the script, not measured from audio. Once a
take exists, trust the take: re-time the subtitles to it rather than asking the
performance to hit marks.

---

## Beat: `clock` — the long night

Deep winter, small hours. He is being careful, and the care is the tell.

> [softly] A mantel clock. Eighteen-nineties, and not a good one even then.
>
> Fellow brought it in on the Thursday. His father had just died. Wanted it going again for the Saturday.
>
> …
>
> I said I'd try.
>
> I didn't say I'd manage it.
>
> …
>
> It wanted a mainspring, and there was no mainspring to be had. Not that size. Not by Saturday.
>
> …
>
> So I sat here all Friday night, and I made one. Out of another clock that wasn't worth the mending.
>
> [exhales] Robbed one dead clock to wake another. That's most of this trade, if I'm honest about it.
>
> …
>
> [quietly] It chimed at four in the morning, and I sat in the dark and listened to it do it.
>
> Nobody heard that but me.
>
> …
>
> [softly] He cried when he collected it. Grown man, stood in that doorway.
>
> I put the kettle on and looked out the window till he'd finished.

**Target:** 70–80s.

---

## Beat: `toolbox` — what he was given

The earliest era, and the only one about being on the receiving end.

> This was my father's. Everything in it, his.
>
> …
>
> He put it on this bench the week I turned fourteen, and he said — right.
>
> That was the apprenticeship. That was all of it.
>
> …
>
> He'd been a joiner. Good one. Hands like shovels, and he could take a shaving off you could read a newspaper through.
>
> …
>
> Then they went. Sixty-one, sixty-two years old. Shook so bad he couldn't hold a chisel square.
>
> …
>
> [quietly] He never said one word about it. He just started handing me things.
>
> A job at a time. A bit at a time. Till there was nothing left that he was doing, and I'd never noticed him stop.
>
> …
>
> [softly] I've sharpened these ten thousand times. There's barely a chisel left on some of them.
>
> [exhales] I never bought new ones.
>
> Couldn't tell you why.

**Target:** 80–90s.

---

## Beat: `chair` — the one he made

The only warm beat, and the only thing in the room he built rather than mended.
It introduces the daughter, and with her the possibility that the viewer is her.
Never state it.

> [warmly] Now this. This I made.
>
> Only thing in this room I ever made. Everything else came in broken and I put it right. This came out of nothing.
>
> …
>
> She was two. Wanted to be up at the bench with me, and she wasn't tall enough, and she was not having that.
>
> [chuckles softly] Screamed the place down.
>
> …
>
> Took me a fortnight. A fortnight — for a chair a joiner would knock out in an afternoon.
>
> I kept starting it again. Kept finding things wrong with it that weren't wrong with it.
>
> [softly] I think I didn't want to be finished.
>
> …
>
> She sat in it every day for three years, and then one day she was too big for it, and that was that.
>
> …
>
> [quietly] It's still got the marks where she kicked it.
>
> I'd not sand those out. Not for anything.

**Target:** 70–80s.

---

## Beat: `window` — weather

The loneliest beat. Nobody else is in it, and the coda has no figures at all.

> Eighty-nine. That storm. Took the pane clean out.
>
> Two in the morning, glass all over the bench, rain coming in sideways.
>
> …
>
> I boarded it, and I swept it, and I sat down there and waited for it to be light.
>
> …
>
> [quietly] Nobody to ring.
>
> That's what I remember about it. Not the glass.
>
> Stood there with a dustpan at two in the morning, and there was nobody in the world to ring about it.
>
> …
>
> [exhales] Reglazed it myself on the Monday. Made a poor job of it, and I've looked at it every day since.
>
> [softly] Some things you leave. So you remember you were on your own that night.

**Target:** 60–70s.

---

## Beat: `spectacles` — her glasses

The shortest beat and the whole point of the piece. **The repetition is the
performance** — the second "I could mend these" should be quieter and slower
than the first, and the gap before it is long enough to be uncomfortable. If a
take rushes that gap, reject it however good the rest is.

He never says what he couldn't mend. He never says her name. Do not let a take
add either.

> [softly] Her glasses.
>
> …
>
> Arm's bent. She sat on them. She was forever sitting on them.
>
> …
>
> Four minutes, that is. Little screwdriver. Warm the arm, ease it back. Four minutes and it's right.
>
> …
>
> [quietly] I could mend these.
>
> …
>
> …
>
> [whispers] I could mend these.
>
> …
>
> [softly] They've been on this bench eleven years and I've not touched them.

**Target:** 45–55s. Do not speed it up to fit.

---

## Beat: `departure` — the finale

Plays when the last object resolves. The callback carries it: "leave it with me"
has been what he said to customers about broken things, and now he says it to
the viewer about everything else.

> [softly] That's the lot.
>
> …
>
> Forty-one years, and it comes down to a bench, and a bulb, and a window that wants cleaning.
>
> …
>
> People used to say — you must be able to fix anything, you.
>
> [exhales] And I'd say: no. I can fix *things*.
>
> …
>
> [quietly] Leave it with me. That's what I always said, isn't it. Leave it with me and I'll see what I can do.
>
> …
>
> [softly] Go on, then.
>
> …
>
> [whispers] Leave it with me.

**Target:** 55–65s.

---

## Timing, once takes exist

Do not trust the timings in `content/story.json` for any beat until its take is
recorded. The first two were written against the script and came out badly
wrong — `arrival` was scripted for 50s and delivered in 36.75s, `radio` for 96s
and delivered in 66.19s — which left the last line of `radio` cued at 93000ms on
a 66-second take, where it would simply never have appeared.

Record the take, then re-time by ear: run with `?capture=1`, tap **C** as each
line begins, and **P** prints a `lines` array to paste back. `npm run validate`
fails the build if any cue lands at or after the end of its take, so the
mistake cannot ship twice — but it will not tell you a cue is merely early.
