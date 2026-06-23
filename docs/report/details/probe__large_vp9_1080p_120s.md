# probe/large_vp9_1080p_120s

family: probe | fixture asset: `large_vp9_1080p_120s.webm` (102 MB, real) | primaryMetric: wall | passCount: 6/7

## Verdict

**Best framework: mediabunny@1.48.0** — CONTESTED (6 of 7 engines PASS the same single oracle).
Decisive factor: **wall-clock median**. mediabunny probes the 102 MB VP9/WebM in **15.07 ms**, vs the
runner-up web-demuxer at **41.76 ms** — a **2.77x** margin. All six passers satisfy the identical
`golden-metadata` oracle with no correctness gap, so ranking falls to performance (decision rule 4b), and
mediabunny is dominant on every probe in this family. The next-fastest WebCodecs engine (remotion-webcodecs,
198.64 ms) is **13.2x** slower; the platform baseline (5999.55 ms) is **398x** slower.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 15.07 | n/a | n/a | n/a | cached previous PASS |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 41.76 | n/a | n/a | n/a | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 160.25 | n/a | n/a | n/a | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 198.64 | n/a | n/a | n/a | cached previous PASS |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 207.66 | n/a | n/a | n/a | cached previous PASS |
| platform@chrome-149 | PASS | golden-metadata:true | 5999.55 | n/a | n/a | n/a | cached previous PASS |
| mp4box@2.3.0 | NA_ENGINE | (none) | — | — | — | — | engine does not declare input container 'webm' |

Note: the shard records only the `wall` metric for these per-container probes (metrics: ['wall'] at
src/scenarios/probe/index.ts:349). throughputRealtime / peakMemory / longtasks are not collected for this
scenario, hence n/a. Every passing engine measured `durationDeltaSec` well inside the strict
±0.0417 s (±1-frame at 30 fps after / actually ±1/24) tolerance; mediabunny, web-demuxer reported Δ=0,
remotion engines Δ≈1.4e-14 s, ffmpeg.wasm Δ=0.002 s, platform Δ=0.007 s.

## Why the winner wins (deep technical)

The asset is a 102 MB Matroska/WebM file: a VP9 1080p video track (1920x1080, 30 fps, ~6.82 Mbit/s) plus a
stereo Opus track at 48 kHz, duration 120.008 s (golden meta at fixtures/golden/large_vp9_1080p_120s.webm.meta.json).
The operation is a pure *probe*: read normalized container/track metadata and assert it against the committed
golden. There is no decode and no transcode, so the entire contest is about how cheaply each engine can crack
the Matroska Segment/SeekHead/Info/Tracks elements and surface duration + per-track codec/dims/fps/channels.

mediabunny used `backend: webcodecs`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`,
`sharedArrayBuffer: false`, `wasmThreads: 0` (shard env.configUsed). Crucially, for a *probe* the WebCodecs
decoder is never invoked — the win comes from its pure-TypeScript Matroska reader. The adapter's
`metadataFromInput` (src/engines/mediabunny/adapter.ts:417) takes the cheap path by design: it calls
`input.getDurationFromMetadata()` FIRST (adapter.ts:429), which reads the Segment Info `Duration` element
directly, and only falls back to the full `computeDuration()` sample/cluster walk when metadata yields
null (adapter.ts:434-441). For this WebM the EBML `Duration` is present, so mediabunny never scans the
hundreds of VP9 SimpleBlocks across the file — it reads the header region and returns. That is exactly why its
wall is 15.07 ms: a near-front-of-file read with no cluster traversal. The measured `durationDeltaSec` is 0
(exact match to golden 120.008 s) at tolerance 0.0417 s, and `getTracks()`/`normalizeTrack` (adapter.ts:443-447)
returns both the VP9 video and Opus audio tracks, satisfying the "2 track(s)" golden compare.

web-demuxer (41.76 ms) is the runner-up. It is a WASM (FFmpeg-libav-based) demuxer; it parses the same
Matroska header correctly (Δ=0) but pays WASM module/avformat-context overhead that mediabunny's native-TS
EBML reader avoids — a 2.77x gap on identical correctness. ffmpeg.wasm (160.25 ms) carries the full
libavformat probe machinery plus the heavier ffmpeg.wasm bridge, ~10.6x slower than mediabunny. The two
Remotion engines (remotion-webcodecs 198.64 ms, `backend: webcodecs`; remotion-media-parser 207.66 ms,
`backend: cpu-js`, `fieldsTier: metadata-only`) both parse correctly (Δ≈1.4e-14 s, essentially exact) but are
~13x slower — remotion-media-parser is a streaming JS parser whose metadata-only tier still walks more of the
container than mediabunny's single Duration-element read. The platform baseline at 5999.55 ms is pathological
for a probe: its config (`encode: <video>→canvas→MediaRecorder`, `decode: VideoDecoder`) shows it routes
metadata extraction through a real media element / WebCodecs setup rather than a lightweight header parse,
so even a "probe" pays media-pipeline initialization — 398x slower while still landing inside tolerance
(Δ=0.007 s).

## What each other framework did wrong

- **web-demuxer@4.0.0** — PASS, but 41.76 ms vs 15.07 ms = **2.77x slower**. Correct (Δ=0) but pays
  WASM/libavformat-context setup overhead the pure-TS EBML reader avoids.
- **ffmpeg.wasm@0.12.15** — PASS, 160.25 ms = **10.6x slower**. Full libavformat probe + ffmpeg.wasm bridge;
  correctness fine (Δ=0.002 s) but heavyweight for a header read.
- **remotion-webcodecs@4.0.479** — PASS, 198.64 ms = **13.2x slower**. Correct (Δ≈1.4e-14 s) but its parser
  path is far heavier than a single Duration-element read.
- **remotion-media-parser@4.0.479** — PASS, 207.66 ms = **13.8x slower** (slowest passer). `cpu-js` streaming
  parser, metadata-only tier; correct (Δ≈1.4e-14 s) but no front-of-file fast path comparable to mediabunny.
- **platform@chrome-149** — PASS, 5999.55 ms = **398x slower**. Routes probe through media-element/WebCodecs
  init instead of a cheap demux; correct (Δ=0.007 s) but unusable as a fast probe.
- **mp4box@2.3.0** — NA_ENGINE. Declares `containersIn: ['mp4','mov']` only (src/engines/mp4box/adapter.ts:645);
  it is an ISOBMFF-only parser and genuinely cannot read Matroska/WebM. NA is **honest**, not under-declared.

## Anti-cheat validation

- **Scenario**: src/scenarios/probe/index.ts:280-286 (ProbeCase) built into a Scenario at index.ts:335-354.
  op=`probe`, oracles=`['golden-metadata']`, metrics=`['wall']`. notes confirm the gating rationale:
  "large bucket (~100 MB) 1080p VP9 WebM — pairs with large_h264 so the large rung crosses families."
- **Fixture**: `fixtures/media/large_vp9_1080p_120s.webm` exists and is **102 MB** real media (stat'd). Not
  synthetic/empty/mock. Golden present: fixtures/golden/large_vp9_1080p_120s.webm.meta.json (real values:
  webm, 120.008 s, VP9 1920x1080@30, Opus 48 kHz/2ch).
- **Oracle**: `golden-metadata` at src/core/oracles.ts:593-657 — performs a REAL comparison: container string,
  duration within a per-container tolerance (src/core/oracles.ts:614-637), and positional per-track
  codec/width/height/fps/sampleRate/channels diffs (compareTrack, oracles.ts:659-686). Any mismatch returns
  `fail`. Not trivially satisfiable — duration band is the strict ±0.0417 s here (not the loose estimate band),
  and every track field is checked. Measurements are physically plausible (Δ in microseconds-to-milliseconds).
- **Winner adapter**: src/engines/mediabunny/adapter.ts:417-474 (`metadataFromInput`) genuinely opens the file
  via `mb.Input`, reads `getDurationFromMetadata()` (line 429) and `getTracks()` (line 443) from the real
  library. No canned output, no golden short-circuit, no input→output copy, no error-swallow-as-success (the
  catch blocks set duration to null and fall back, they do not fake a pass).
- **Cached note**: ALL seven entries have `cached: true` ("cached previous PASS result"). Evidence is reused,
  not freshly re-run this session — per memory note on launcher seeding, stale-PASS reuse is a known risk.
  The relative wall ordering is consistent across the probe family and physically plausible, so the ranking is
  trustworthy, but absolute numbers (esp. n==1 samples, mad=0) are single-shot and not re-validated.

**Verdict: REAL.** Real 102 MB fixture + real golden + a genuine metadata comparison oracle + a real
library-backed adapter. The PASS is genuine and the ranking is sound. Caveat: gate strength is metadata-only
(no bit-exact decode), and all results are cached single-shot (n=1, mad=0).

## Confidence & caveats

- Confidence: **high** on the winner identity and decisive factor (2.77x wall margin over a correct runner-up,
  consistent with mediabunny's documented cheap-duration fast path).
- The oracle is metadata-exact (structural/metadata tier), not bit-exact — a fast-but-correct probe is all
  that is being measured; this is the appropriate gate for a probe op, so not a weak gate, just not the
  strongest tier.
- All seven results are `cached:true` with n=1 / mad=0 / p95==median: single-shot timings, no spread evidence.
  A win on n=1 is weaker statistical evidence, but the 2.77x gap is large relative to typical jitter.
- mp4box NA is honest (ISOBMFF-only); no engine looks like it under-declared WebM probe capability.
