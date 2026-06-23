# probe/micro_audio_short

family: probe | fixture asset: `micro_audio_short.m4a` (1.4 KB AAC-LC in MP4/ISOBMFF, mono 44100 Hz, ~0.1 s) | primaryMetric: wall (metrics:['wall']) | passCount: 7/7

## Verdict

- Best framework: **remotion-media-parser@4.0.479** (engineId `remotion-media-parser`).
- Contest status: **CONTESTED** — all 7 engines PASS, and all pass the SAME single oracle (`golden-metadata`) with identical correctness strength (track count = 1, container=mp4, codec=aac, sampleRate=44100, channels=1, duration Δ ≈ 0). Correctness is a dead heat, so the decision falls to PERFORMANCE.
- Decisive factor: **lowest wall-clock probe latency**. remotion-media-parser median wall = **2.35 ms**, beating runner-up mp4box (3.605 ms).
- Margin over runner-up: **1.53× faster wall** vs mp4box (3.605/2.350); 2.27× faster than platform (5.335 ms); 6.79× faster than the slowest PASS, mediabunny (15.955 ms).
- Evidence strength caveat: this is a micro (~1.4 KB) init-overhead-dominated probe with n==1 / mad==0 per engine, so the absolute gaps are tiny (~1.25 ms) and noise-sensitive; the ordering is plausible but the margin is small-sample.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 2.350 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 3.605 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 5.335 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 5.920 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 7.015 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 11.165 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 15.955 | n/a | n/a | n/a | cached previous PASS result |

(The scenario declares only `metrics: ['wall']`; throughputRealtime / peakMemory / longtasks were not collected for this probe case and are absent from every engine's bench block.)

## Why the winner wins (deep technical)

The operation under test is a **metadata-tier probe of an audio-only ISOBMFF/MP4 (`.m4a`) file** holding a handful of AAC-LC frames (golden: container `mp4`, one `audio` track, `aac`, 44100 Hz, mono, bitrate 36033, ~0.1 s duration). For a 1.4 KB file the answer lives entirely in the `moov`/`trak`/`stsd`/`esds` (AudioSpecificConfig) and `mvhd`/`mdhd` timescale boxes; there is essentially no media payload to scan. The contest is therefore purely about **how little work each engine does to reach the header**, i.e. init/parse overhead — exactly what the scenario notes call out ("micro bucket audio (~1-2 KB): few AAC frames; init-overhead-dominated probe latency").

remotion-media-parser wins because its adapter runs a **pure-JS streaming header parse that requests only the cheapest metadata fields and stops**. In `src/engines/remotion-media-parser/adapter.ts:348` the `probe()` method calls `runParse(...)` (adapter.ts:363) with `fields: { durationInSeconds, container, tracks, metadata, rotation }` and the explicit `'metadata-only'` tier (adapter.ts:383). The underlying `parseMedia` (imported at adapter.ts:70, invoked at adapter.ts:335) reads the box tree lazily and returns as soon as those fields are resolvable — it never decodes a single AAC frame and never walks a sample table. The recorded `env.configUsed` confirms this lightweight path: `backend:"cpu-js"`, `hwAccel:false`, `wasmThreads:0`, `worker:false`, `reader:"webReader"`, `fieldsTier:"metadata-only"`. No WebCodecs decoder is instantiated and no wasm module is loaded, so there is **zero codec/runtime warm-up tax** — the dominant cost for the other engines at this file size. The result: golden-metadata passes with `durationDeltaSec: 0` against a tolerance of `0.0417 s` (the strict ±1-frame band), at a 2.35 ms median.

The structural reason the rivals are slower maps directly to their backends (from each `env.configUsed`):

- **mp4box (3.605 ms, runner-up)** is also pure-JS and header-only, but its config shows `pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"` with `rangeReads:false` — it appends the entire buffer through its ISO parser before exposing `moov` info. For 1.4 KB that is cheap, hence it lands close, but it still does marginally more buffer plumbing than media-parser's streaming reader, costing ~1.25 ms.
- **platform / remotion-webcodecs / mediabunny** all carry `backend:"webcodecs"`. Even though a metadata probe should not need a decoder, their pipelines pay WebCodecs/canvas setup overhead (`pixelBackend`, `queueDepth`, canvas pools), which is pure tax on a 0.1 s audio clip. mediabunny's `streaming-lockstep` + `canvasPoolSize:4` path is the heaviest (15.955 ms, 6.79× the winner).
- **ffmpeg.wasm (7.015 ms)** must drive a wasm transcoder/probe core; even a metadata read goes through the wasm FS + `ffprobe`-style invocation, an order of magnitude more setup than a JS header read.
- **web-demuxer (11.165 ms)** wraps a wasm (FFmpeg-derived) demuxer; module/worker bootstrap dominates for a micro file.

So the decisive mechanism is: **media-parser reaches the AAC `esds`/`mvhd` metadata with a no-decoder, no-wasm, metadata-only streaming JS parse, eliminating the warm-up overhead that everything else pays at this size**.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS, but lost on performance: 3.605 ms vs 2.350 ms (1.53× slower). Its `whole-file-append(MP4BoxBuffer+fileStart)` buffering does slightly more work than media-parser's streaming reader before yielding `moov` metadata.
- **platform@chrome-149** — PASS, lost: 5.335 ms (2.27× slower). `backend:"webcodecs"` + canvas/decoder pipeline setup is overhead the metadata probe does not need.
- **remotion-webcodecs@4.0.479** — PASS, lost: 5.920 ms (2.52× slower). Same WebCodecs/offscreencanvas warm-up tax on a tiny audio-only file.
- **ffmpeg.wasm@0.12.15** — PASS, lost: 7.015 ms (2.99× slower). wasm FS + ffprobe-path bootstrap dominates for a 1.4 KB read.
- **web-demuxer@4.0.0** — PASS, lost: 11.165 ms (4.75× slower). wasm demuxer/worker module bootstrap is heavy relative to the header read.
- **mediabunny@1.48.0** — PASS, lost: 15.955 ms (6.79× slower), the slowest. `streaming-lockstep` WebCodecs pipeline with a 4-canvas pool is maximal setup overhead for a metadata-only audio probe.

No engine was NA or FAIL — the `aac`/`mp4` probe capability is broadly and honestly supported across the field.

## Anti-cheat validation

- Scenario definition: `src/scenarios/probe/index.ts:250-256` (PROBE_CASES entry, `asset: 'micro_audio_short.m4a'`, container `mp4`, audioCodecs `['aac']`), wired into a scenario at `src/scenarios/probe/index.ts:335-353` with `op:'probe'`, `oracles:['golden-metadata']`, `metrics:['wall']`.
- Fixture: `fixtures/media/micro_audio_short.m4a` EXISTS and is a real 1.4 KB MP4/AAC file (`stat` confirms 1.4k). Golden present: `fixtures/golden/micro_audio_short.m4a.meta.json` (container mp4, 1 aac audio track, 44100 Hz, mono, durationSec 0.1) and `.packets.json`. Not synthetic, not empty, not mock.
- Oracle: `golden-metadata` at `src/core/oracles.ts:595-657`. It performs a REAL comparison — container string match (oracles.ts:606), duration within a per-container tolerance band (here the strict ±1-frame ≈ 0.0417 s, oracles.ts:614-637), and per-track positional codec/sampleRate/channels comparison (compareTrack, oracles.ts:659-686). It is not trivially satisfiable: any wrong codec/sampleRate/channel/track-count or duration drift > tol yields FAIL. Measured `durationDeltaSec` values (0 for media-parser/mp4box/platform/webcodecs/ffmpeg; ~1.39e-17 for web-demuxer/mediabunny) are physically plausible for an exact moov-derived duration.
- Winner adapter: `src/engines/remotion-media-parser/adapter.ts:348` (`probe`), real `parseMedia` call at adapter.ts:335 with metadata-only `fields` (adapter.ts:374-381). No canned output, no input→output copy, no golden short-circuit, no error swallowing — it returns whatever the parser reads, then normalizes via `toNormalizedMetadata`.
- Cached note: the winner's result (and all 7) have `cached==true` ("cached previous PASS result"), reused from a 2026-06-22 run. Staleness risk: the ranking depends on sub-millisecond wall deltas measured at n==1; a fresh re-run could reorder the top three given the tiny ~1.25 ms gaps. Correctness (PASS) is not at risk, only the precise perf ordering.
- Verdict: **REAL** — real fixture, real golden, real metadata-only parse, meaningful (codec/rate/channel/duration/track-count) oracle. The only weakness is that the WINNING criterion is a tiny, single-sample, cached wall measurement, not a correctness differentiator.

## Confidence & caveats

- Confidence: **medium**. The PASS/correctness verdict is solid and uncontested on strength; the *winner* identity rests on a 1.53× wall margin derived from n==1, mad==0, cached measurements on a sub-4-ms init-dominated micro probe — inherently noisy. mp4box (3.605 ms) is close enough that a fresh re-run could plausibly flip first place.
- All engines pass the identical single oracle, so there is no correctness tiebreaker; performance is the sole axis, and the throughput/memory/longtask columns were not collected for this case.
- Architecturally, remotion-media-parser's no-decoder/no-wasm metadata-only JS path is the principled reason it should win micro probes regardless of run-to-run jitter; that mechanism, not the exact millisecond, is the durable finding.
