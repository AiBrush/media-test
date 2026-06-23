# probe/h264_multitrack

family: probe | fixture asset: `fixtures/media/h264_multitrack.mp4` (4.5 MB, real) | golden: `fixtures/golden/h264_multitrack.mp4.meta.json` | primaryMetric: wall (ms) | passCount: 7/7

## Verdict

- **Best framework: remotion-media-parser@4.0.479 / remotion-webcodecs@4.0.479 — CONTESTED (7-way tie on correctness).**
- This is a pure metadata probe: every one of the 7 engines satisfies the *only* gating oracle, `golden-metadata`, with an identical result — "metadata matches golden (3 track(s))". Correctness is therefore indistinguishable; the decision falls entirely to **performance (wall median)**.
- Raw wall-median ranking: remotion-webcodecs 13.125 ms < remotion-media-parser 15.935 ms < platform 23.635 ms < mp4box 31.0 ms < ffmpeg-wasm 32.59 ms < mediabunny 40.925 ms < web-demuxer 42.46 ms.
- **Nominal winner by primaryMetric: remotion-webcodecs (13.125 ms)**, margin **1.21x faster** than the runner-up remotion-media-parser (15.935 ms) and **1.80x faster** than the fastest non-remotion engine (platform, 23.635 ms).
- **Decisive caveat:** the two "winners" share the same engine — `@remotion/media-parser`'s `parseMedia` header-tier read. remotion-webcodecs simply wraps the same call. With `n==1` per engine and `mad==0` (single sample, no spread), the 13.125 vs 15.935 ms gap (~2.8 ms) is within noise for a header parse; the win is **directional, not statistically decisive**. I therefore name remotion-webcodecs as the primaryMetric winner but treat the remotion media-parser family as co-best.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 13.125 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 15.935 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 23.635 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 31.0 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 32.59 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 40.925 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 42.46 | n/a | n/a | n/a | cached previous PASS result |

Notes: the shard's only bench metric is `wall` (n=1, warmup=1, mad=0, p95==median for all 7). No throughputRealtime / peakMemory / longtasks were captured for this probe scenario. Only `platform` shows a nonzero `durationDeltaSec` (0.021333 s, well under the 0.041667 s = ±1-frame@30fps tolerance); all other engines report durationDeltaSec=0.

## Why the winner wins (deep technical)

**The operation.** `probe/h264_multitrack` is wired with `op: 'probe'`, `operations: ['probe']`, `oracles: ['golden-metadata']` (src/scenarios/probe/index.ts:337-348), against the asset `h264_multitrack.mp4` (src/scenarios/probe/index.ts:92). The fixture is a faststart-style MP4 (ISOBMFF, `major_brand: isom`) carrying **3 tracks**: one H.264 video (1280x720, 30 fps) and **two AAC-LC audio tracks** (both 48000 Hz, stereo) — confirmed by the golden meta (fixtures/golden/h264_multitrack.mp4.meta.json:1-34). The gating challenge per the scenario `notes` is positional track ordering: "golden lists every track; order/language must match (positional compare)" (src/scenarios/probe/index.ts:96). No decoding is required — all the answer lives in the `moov` (mvhd duration + 3x trak/mdia/stsd).

**Why the metadata is enough.** `goldenMetadata` (src/core/oracles.ts:595-657) compares container, duration (within a per-container tolerance — here the strict ±1-frame band, 0.041667 s for 30 fps), and then walks tracks **positionally** via `compareTrack` (src/core/oracles.ts:659-686): type, codec (normalized), width/height, fps (±fpsTolerance), sampleRate, channels. The track-count diff at oracles.ts:645-647 is what actually gates the multitrack case — an engine that drops or merges the second AAC track would report 2 tracks and FAIL. All 7 engines returned 3 tracks in the right order, so the structural gate is genuinely exercised and genuinely passed.

**Why remotion wins on speed.** Both remotion engines drive `@remotion/media-parser`'s `parseMedia` with a **header-only field set** — `{ container, durationInSeconds, tracks, metadata }` for remotion-webcodecs (src/engines/remotion-webcodecs/adapter.ts:346-355) and the same set plus `rotation`/conditional `fps` for remotion-media-parser (src/engines/remotion-media-parser/adapter.ts:363-384), both tagged `'metadata-only'`. Because no per-track sample callback is attached, the parser reads only the `ftyp`+`moov` prefix and stops — it never streams the `mdat`. For a faststart MP4 with the `moov` near the front, that is a few-kilobyte read, which is why the two remotion paths land at 13-16 ms versus the 23-42 ms of engines that spin up heavier machinery. remotion-webcodecs (env.configUsed.backend `webcodecs`, but for *probe* it does not touch the WebCodecs decoder) edges remotion-media-parser by 2.8 ms (1.21x); since both call the identical parseMedia header path, the gap is attributable to per-run jitter on a single sample, not an architectural advantage.

**Why the others are slower (still correct).** `platform` (Chrome 149, env.configUsed.backend `webcodecs`, hwAccel true) gets the metadata via the browser's native demuxer path; at 23.635 ms it is the fastest non-remotion engine but carries browser-pipeline setup overhead and is the only engine with a nonzero duration delta (0.021333 s — still inside tolerance, plausibly a 90 kHz mvhd-vs-track-timescale rounding). `mp4box@2.3.0` (env.configUsed.backend `pure-js`, `whole-file-append(MP4BoxBuffer+fileStart)`) is a pure-JS ISOBMFF box parser at 31.0 ms. `ffmpeg.wasm@0.12.15` at 32.59 ms pays the wasm `ffprobe` invocation + FS staging cost. `mediabunny@1.48.0` (40.925 ms) and `web-demuxer@4.0.0` (42.46 ms) are the slowest, consistent with heavier init for libraries oriented at full demux/decode rather than a header sniff. None of these gaps changes the correctness verdict — they all return the exact same 3-track golden match.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — Nothing wrong; PASS, golden-metadata matched (3 tracks). Lost the primaryMetric by 2.8 ms / 1.21x on wall median (15.935 vs 13.125). Same parseMedia engine as the winner; the gap is single-sample noise (n=1, mad=0).
- **platform@chrome-149** — PASS, golden-metadata matched. Slower wall (23.635 ms, 1.80x the winner). Only engine with nonzero durationDeltaSec (0.021333 s) but still well within the ±0.041667 s band.
- **mp4box@2.3.0** — PASS, golden-metadata matched. Pure-JS box parse; 31.0 ms wall (2.36x the winner).
- **ffmpeg.wasm@0.12.15** — PASS, golden-metadata matched. wasm ffprobe overhead; 32.59 ms (2.48x the winner).
- **mediabunny@1.48.0** — PASS, golden-metadata matched. 40.925 ms (3.12x the winner).
- **web-demuxer@4.0.0** — PASS, golden-metadata matched. Slowest at 42.46 ms (3.23x the winner).

No engine returned NA or FAIL; the multitrack probe is universally supported, so there is no under-declared capability to flag.

## Anti-cheat validation

- **Scenario:** src/scenarios/probe/index.ts:92-97 (asset entry) + :337-348 (id `probe/h264_multitrack`, `op: 'probe'`, `oracles: ['golden-metadata']`). Notes document the positional-track gating rationale.
- **Fixture:** `fixtures/media/h264_multitrack.mp4` exists and is a real 4.5 MB H.264+2xAAC MP4 (verified via stat). Not synthetic/empty/mock.
- **Golden:** `fixtures/golden/h264_multitrack.mp4.meta.json` is an independent committed golden listing all 3 tracks with concrete codec/dims/fps/sampleRate/channels/bitrate values; companion packets.json (139 KB) and ssim.json (77 KB) exist, so the golden was generated from real decoded media.
- **Oracle:** `goldenMetadata` at src/core/oracles.ts:595-657 performs a real field-by-field + positional per-track comparison (count, type, codec, width, height, fps±tol, sampleRate, channels) with a tight ±1-frame duration band (0.041667 s here). It is not trivially satisfiable: a wrong track count, missing 2nd audio track, or wrong dims/codec/rate would FAIL. This is structural/metadata-exact, the appropriate correctness tier for a probe (no decode is meaningful here).
- **Winner adapter:** remotion-webcodecs probe at src/engines/remotion-webcodecs/adapter.ts:332-377 calls `mp.parseMedia({ fields: { container, durationInSeconds, tracks, metadata } })` and normalizes the real result — no canned output, no golden short-circuit, no copy-input trick. (Co-best remotion-media-parser: src/engines/remotion-media-parser/adapter.ts:348-404, same parseMedia metadata-tier path.)
- **Verdict: REAL.** Real fixture + real parseMedia implementation + meaningful structural oracle with physically plausible measurements (3 tracks, durationDelta 0/0.021333 s within tolerance).
- **Cached note:** ALL 7 entries have `cached==true` ("cached previous PASS result"). The evidence was reused, not freshly re-run; per the launcher-seeding caveat this carries staleness risk. The single-sample (n=1, mad=0) timings should be treated as indicative only.

## Confidence & caveats

- **Confidence: medium.** Correctness is unambiguous (real fixture, real oracle, 7/7 PASS, plausible numbers). The *winner selection* is weak: it rests on a 2.8 ms / 1.21x wall gap between two engines that call the same parseMedia code, measured at n=1 with mad=0 and all results cached.
- This is a metadata-only probe, so no throughputRealtime / peakMemory / longtasks were available to break the tie on a more robust axis.
- A fresh, multi-sample re-run (clearing raw + .browser-cache) could reorder remotion-webcodecs vs remotion-media-parser; their correctness parity would not change.
