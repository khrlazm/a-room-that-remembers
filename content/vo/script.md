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

## Remaining beats

Five or six more objects, each its own repair and its own person: a clock, a
chair, a toolbox, the window, a photograph. The through-line is that every
object is really about someone he could help, arranged around the one he
couldn't — which should be the last beat, and should be the shortest.

He should never say her name.
