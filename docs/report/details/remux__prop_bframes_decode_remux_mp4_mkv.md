# remux/prop_bframes_decode_remux_mp4_mkv

family: remux | fixture asset: `h264_bframes_1080p.mp4` (11 MB, exists in `fixtures/media/`) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 2 engines PASS: mediabunny and ffmpeg.wasm).
- **Decisive factor: performance.** Both PASS engines satisfied the *identical* gating oracle (`property-invariant` / decode-remux) with *identical* correctness measurements — 12/12 frames bit-exact vs golden, 0 mismatches. Correctness is therefore a dead tie, so the contest falls through to the primaryMetric `wall`.
- **Margin over runner-up:** mediabunny **139.47 ms** wall median vs ffmpeg.wasm **179.20 ms** → mediabunny is **~1.29x faster wall** (Δ ≈ 39.7 ms). Both samples are **n==1** (no spread; mad==0, p95==median), so this is weak statistical evidence — a single-shot timing difference, not a distribution. peakMemory was not captured for either engine (n==0). A secondary tiebreaker (backend) reinforces the choice: mediabunny ran on **hardware WebCodecs** (`backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `coopCoep:"not-required"`, `sharedArrayBuffer:false`) while ffmpeg.wasm is single-thread wasm.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 139.47 ms | n/a | 0 (n=0) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 179.20 ms | n/a | 0 (n=0) | 4924 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

Note: no engine reported `throughputRealtime` in this shard; only `wall`, `peakMemory` (uncaptured, n=0), and `longtasks` are present.

## Why the winner wins (deep technical)

The operation is a **lossless container rewrap of H.264 with B-frames from MP4 (ISOBMFF) to MKV (Matroska)** — no pixel re-encode. The codec payload (H.264 Annex-B/AVCC NAL units) is copied verbatim; the only work is parsing the source's sample tables (`stbl`/`stts`/`ctts`/`stss`) and re-emitting the same access units into Matroska clusters/`SimpleBlock`s with correct timestamps. The non-trivial correctness risk for this fixture is **B-frame reordering**: H.264 with B-frames stores frames in *decode* order with a `ctts` composition-time offset table giving the *presentation* PTS ≠ DTS. A naive remux that drops or mis-maps the `ctts` offsets (MKV expresses reordering via per-block `BlockDuration`/relative timecodes and the codec's own POC, not a ctts box) would produce frames that decode in the wrong presentation order → frame-digest mismatch.

The gating oracle (`src/core/oracles.ts:2686`) implements decode(remux(x))==decode(x): it takes the engine's actual output bytes (`ctx.output`), decodes them with the platform WebCodecs decoder (`ctx.decodeWithPlatform`, oracles.ts:2697), and SHA-256-compares the decoded RGBA frame digests against the committed golden `fixtures/golden/h264_bframes_1080p.mp4.frames.json`. The shard records `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` for both engines — i.e. all 12 baked presentation-ordered frames (PTS 0, 33333us, ... at 30fps) round-trip bit-exact. This proves both engines preserved the dts/pts reorder across the wrapper change.

**Mediabunny's path:** `MediabunnyEngine.remux()` at `src/engines/mediabunny/adapter.ts:1244` builds the MKV `OutputFormat` (`makeOutputFormat`, adapter.ts:1250), opens the source via `openInput`, and runs the streaming Conversion (`runConversion`, adapter.ts:842 → `mb.Conversion.init`/execute) with `pipeline:"streaming-lockstep"`. Because the codecs already match the target container, mediabunny's Conversion stays in stream-copy mode (no transcode), and the WebCodecs backend never has to spin up an encoder. Crucially, the *oracle's* decode of the output uses the **hardware WebCodecs** decoder on the Apple M1 Max (ANGLE Metal), which is what made the end-to-end wall the fastest at 139.47 ms. mediabunny carries the timestamp/reorder metadata through its packet-source path rather than re-deriving it, so the 12-frame digest set matches exactly.

**Why it beat ffmpeg.wasm:** ffmpeg.wasm (`src/engines/ffmpeg-wasm/adapter.ts:2031`) does the genuine, correct thing — `-i in -map 0 -c copy out.mkv` (adapter.ts:2044), a true elementary-stream copy that also preserves B-frame timing — but it must (a) write the 11 MB input into MEMFS, (b) run the single-thread libavformat demux→remux in wasm, and (c) read the output back out of MEMFS. That fixed wasm/MEMFS overhead is why its wall is 179.20 ms (1.29x slower) despite doing strictly less GPU work. Interestingly its `longtasks` (4924 ms) is *lower* than mediabunny's (19963 ms) — mediabunny's WebCodecs/canvas decode path during oracle verification produced longer main-thread tasks — but `longtasks` is the secondary metric; the primaryMetric `wall` governs and favors mediabunny.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — PASS but lost on speed.** Identical correctness (12/12 bit-exact). Gap: +39.7 ms wall (0.78x of mediabunny's speed, i.e. mediabunny 1.29x faster), attributable to MEMFS write/read + single-thread wasm libavformat vs mediabunny's hardware-WebCodecs/streaming path. Evidence weak (n==1 each).
- **web-demuxer@4.0.0 — NA_ENGINE:** "engine does not declare operation 'remux'". Honest NA — web-demuxer is a read-side demux/probe library (libavformat-via-wasm read path); it has no muxer/output capability, so it cannot author an MKV file. Not under-declared.
- **platform@chrome-149 — NA_ENGINE:** "engine does not declare operation 'remux'". Honest. The raw browser platform (WebCodecs + MediaSource) exposes decode/encode but no container muxer API; a from-scratch MKV writer is out of scope for the platform baseline.
- **remotion-media-parser@4.0.479 — NA_ENGINE:** "engine does not declare operation 'remux'". Honest — it is a parser/probe library, read-only, no mux/output side.
- **mp4box@2.3.0 — NA_ENGINE:** "engine does not declare output container 'mkv'". Honest and structurally correct: MP4Box.js is an ISOBMFF (MP4/MOV/fMP4) tool only; it has no Matroska/MKV muxer, so MP4->MKV is genuinely impossible for it. (It could likely do MP4->MP4 remux, but the requested target is MKV.)
- **remotion-webcodecs@4.0.479 — NA_ENGINE:** "engine does not declare output container 'mkv'". Honest — Remotion's WebCodecs converter targets MP4/WebM outputs; MKV is not in its declared `containersOut`.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/metamorphic.ts:41` (`id: 'prop_bframes_decode_remux_mp4_mkv'`), invariant `decode(remux(x))==decode(x)` (`DECODE_REMUX`, metamorphic.ts:33), input `h264_bframes_1080p.mp4`, from `mp4` to `mkv`. Notes (metamorphic.ts:48-50) state the gating rationale: prove the dts/pts reorder survives the container change.
- **Fixture exists & is real:** `fixtures/media/h264_bframes_1080p.mp4`, 11 MB, real H.264-with-B-frames 1080p MP4 (not synthetic/empty/mock).
- **Golden is real, not a placeholder:** `fixtures/golden/h264_bframes_1080p.mp4.frames.json` has `"pending": false` and committed sha256 RGBA frame digests (e.g. frame 0 `d26decaba424936...`, frame 1 `1a9d7baf4e544e...`), 1920x1080, browser-baked by the platform decoder — exactly what the oracle compares against. Plausible for real media (12 frames at 30fps, monotonic ptsUs 0/33333/...).
- **Oracle is a real comparison:** `src/core/oracles.ts:2686` (decode-remux branch) decodes the engine's actual output via `ctx.decodeWithPlatform` (oracles.ts:2697) and `compareDigests` against golden frames (oracles.ts:2702). Not trivially satisfiable — it requires a real container parse + real WebCodecs decode + sha256 match of every frame; a dropped track or mangled B-frame reorder would mismatch. Measurements `mismatchedFrames:0` over `comparedFrames:12` are physically consistent.
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts:1244` `remux()` calls `makeOutputFormat` + real `mb.Output`/`BufferTarget` + `runConversion` (adapter.ts:842, real `mb.Conversion.init`/execute). No canned output, no input->output copy faking a remux, no short-circuit to the golden, no swallowed errors (it throws loudly if the format is unsupported or no output buffer is produced, adapter.ts:1251 / runConversion). Runner-up ffmpeg.wasm path (`-c copy`, adapter.ts:2044) is likewise genuine.
- **Cached note:** Both PASS results have **cached==true** ("cached previous PASS result"). Per the launcher seeding caveat, cached PASS evidence carries staleness risk — these were reused, not freshly re-run. The correctness verdict is robust (golden + real oracle), but the 139.47 vs 179.20 ms timing is a single cached sample and should not be over-weighted.
- **Verdict: REAL.** Real fixture + real golden (pending:false, committed sha256) + real bit-exact decode-remux oracle + genuine library-backed remux in the winner.

## Confidence & caveats

- Confidence: **high** on the *winner identity* (REAL gate, genuine implementations, honest NAs across the 5 non-PASS engines) — but **medium** on the *margin*, because: (1) both PASS results are cached (staleness risk), (2) wall n==1 for each (no distribution; mad==0/p95==median is an artifact of a single sample), and (3) the 1.29x gap is modest and could invert under re-run jitter.
- peakMemory and throughputRealtime were not captured (n=0 / absent), so the secondary performance ladder could not be exercised beyond wall and longtasks.
- longtasks actually favors ffmpeg.wasm (4924 ms vs mediabunny 19963 ms); if main-thread responsiveness were the primaryMetric the verdict could flip. The primaryMetric here is `wall`, which favors mediabunny.
