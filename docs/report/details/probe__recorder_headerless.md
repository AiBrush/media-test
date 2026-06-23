# probe/recorder_headerless

family: probe · fixture asset: `recorder_headerless.webm` (VP8 video + Opus audio in a headerless MediaRecorder WebM) · primaryMetric: wall · passCount: 6 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** — **CONTESTED** (6 of 7 engines PASS the same single oracle).
- **Decisive factor: performance (wall median), correctness being a tie.** All 6 passing engines satisfy the identical correctness gate (`golden-metadata`, 2 tracks matched), so the ladder falls through to performance. Mediabunny posts the lowest wall median at **5.53 ms**.
- **Margin over runner-up:** vs ffmpeg.wasm (8.64 ms) → **1.56x faster wall**. vs remotion-media-parser (17.94 ms) → 3.24x. vs remotion-webcodecs (30.41 ms) → 5.50x. vs web-demuxer (110.46 ms) → 19.97x. vs platform/chrome-149 (6000.76 ms) → **1085x**.
- Evidence is **weak per-engine** (every bench is `n==1`, `mad==0`, `cached==true`); the ranking is directionally clear because the gaps are orders of magnitude, but the head-to-head with ffmpeg.wasm (5.53 vs 8.64 ms, both single-sample) is a soft margin.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 5.530 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 6000.760 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 8.640 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 17.935 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 110.455 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 30.405 | n/a | n/a | n/a | cached previous PASS result |

Per-engine duration deltas vs golden (`durationSec`=3.084 s, loose band ±0.5 s for headerless WebM): platform Δ0.0000 s, web-demuxer Δ0.000173 s, remotion-media-parser Δ0.000173 s, remotion-webcodecs Δ0.000173 s, ffmpeg.wasm Δ0.004 s, mediabunny Δ0.3762 s. All within tolerance.

## Why the winner wins (deep technical)

**The operation.** This is a *probe* (metadata read) of a MediaRecorder-origin WebM/Matroska container holding a **VP8** video track (320x240, 30 fps) and an **Opus** stereo track (48 kHz). The defining trait of this fixture (scenario `notes`, src/scenarios/probe/index.ts:229) is that it is *headerless*: a live MediaRecorder capture writes no/sparse Cues and no reliable Segment `Duration` element. So the engine cannot read a single declared global duration; it must estimate from the last block timestamp. The gating oracle is `golden-metadata` (src/scenarios/probe/index.ts:348), which compares container token, per-track codec/dims/fps/sampleRate/channels positionally, and duration within a tolerance band.

**Why duration is forgiving here.** The oracle resolves a *loose* duration band for this asset. `isLooseRecorderWebm` (src/core/oracles.ts:226-230) matches the id substring `recorder`/`headerless`, and `durationToleranceFor` (src/core/oracles.ts:240-254) returns `max(±0.5 s, ±15%)` instead of the strict ±1-frame band. This is the *correct* gate per the design comment at src/core/oracles.ts:199-202 (a headerless recorder WebM legitimately has no precise duration). The numbers confirm it is exercised, not waived: mediabunny's reported duration is Δ0.3762 s off golden 3.084 s — it would FAIL a strict band but PASSES the documented ±0.5 s loose band (src/core/oracles.ts:614-637). So mediabunny's win is on *speed*, and its correctness, while the loosest of the field, is genuinely inside the gate.

**The winning code path (mediabunny).** Mediabunny opens a real `Input` over the WebM and probes via `metadataFromInput` (src/engines/mediabunny/adapter.ts:416-474). The decisive design is the **metadata-first duration strategy** at src/engines/mediabunny/adapter.ts:421-441: it calls `getDurationFromMetadata()` first (a cheap header read), and only falls back to the expensive `computeDuration()` sample-walk when metadata yields null. For a headerless WebM with no Segment Duration, that fallback returns an estimate from the last block timestamp without forcing a full sample scan — yielding the 5.53 ms wall. Track normalization (`normalizeTrack`, src/engines/mediabunny/adapter.ts:297+) reads codec/dims/fps/sampleRate/channels directly from `InputVideoTrack`/`InputAudioTrack` getters, producing the exact `{vp8 320x240@30, opus 48000/2}` shape the golden expects. The backend (`env.configUsed`) is `pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false` — no WASM init cost, no cross-origin-isolation requirement; for a pure metadata read this is the lightest possible path, which is exactly why it beats the WASM and platform competitors.

**Why ffmpeg.wasm (8.64 ms) loses despite the smallest duration error.** ffmpeg.wasm reports Δ0.004 s — far more accurate than mediabunny's Δ0.3762 s. But correctness is a *tie* (both PASS the same single oracle), so the rule (4a→4b) drops to performance, where ffmpeg.wasm is 1.56x slower wall. The slowdown is structural: even a probe pays for the wasm core's `ffprobe`/demux invocation overhead vs mediabunny's native-TS header read. The accuracy advantage does not change the verdict because the oracle does not reward tighter-than-tolerance duration.

**Why platform/chrome-149 (6000.76 ms) is the worst PASS.** Its `env.configUsed` shows the platform probe routes through `decode: VideoDecoder` and `encode: <video>→canvas→MediaRecorder`. For a probe it relies on the `<video>` element's metadata/loadedmetadata path, and the headerless WebM forces the media element to buffer/parse far more before emitting `durationchange`/`loadedmetadata`, producing a 6.0 s wall — 1085x mediabunny. It is correct (Δ0.0000 s) but catastrophically slow for pure metadata.

## What each other framework did wrong

- **platform@chrome-149 (PASS, lost):** correct (golden-metadata Δ0.0000 s) but 6000.76 ms wall = **1085x slower** than mediabunny. Its `<video>`-element/MediaRecorder-based probe path materializes and parses the headerless stream rather than doing a cheap header read.
- **ffmpeg.wasm@0.12.15 (PASS, lost):** correct and most accurate (Δ0.004 s) but 8.64 ms = **1.56x slower**. WASM core demux/ffprobe overhead exceeds mediabunny's native-TS header parse.
- **mp4box@2.3.0 (NA_ENGINE):** `reason: engine does not declare input container 'webm'`. **Honest NA** — mp4box.js is an ISO-BMFF-only parser (MP4/MOV/fragmented-MP4, per src/engines/mp4box/adapter.ts:2-4); it structurally cannot read a Matroska/WebM container, so not declaring `webm` is correct, not an under-declared capability.
- **remotion-media-parser@4.0.479 (PASS, lost):** correct (Δ0.000173 s) but 17.94 ms = **3.24x slower**; `cpu-js` streaming `full-parse(fps)` reader does more work to derive fps than mediabunny's getter read.
- **remotion-webcodecs@4.0.479 (PASS, lost):** correct (Δ0.000173 s) but 30.41 ms = **5.50x slower**; the webcodecs-oriented streaming-backpressure pipeline carries setup cost a bare metadata probe does not need.
- **web-demuxer@4.0.0 (PASS, lost):** correct (Δ0.000173 s) but 110.46 ms = **19.97x slower**, the slowest non-platform engine; its wasm demuxer spin-up dominates a tiny 192 KB probe.

## Anti-cheat validation

- **Scenario definition:** generated by the `PROBE_CASES` table entry at src/scenarios/probe/index.ts:223-230 (asset `recorder_headerless.webm`, container `webm`, video `vp8`, audio `opus`, `fpsTolerance: 0.25`), mapped to id `probe/recorder_headerless` by the factory at src/scenarios/probe/index.ts:335-353 (`probe/${c.asset.replace(/\.[^.]+$/, '')}`). Oracle declared: `golden-metadata` (line 348).
- **Fixture exists and is real:** `fixtures/media/recorder_headerless.webm` — **192 KB** on disk (not synthetic/empty/mock). Golden `fixtures/golden/recorder_headerless.webm.meta.json` lists the exact `{container:webm, durationSec:3.084, vp8 320x240@30 + opus 48000/2, tags.encoder:Chrome}` — consistent with a genuine Chrome MediaRecorder capture.
- **Oracle is real:** `goldenMetadata` (src/core/oracles.ts:595-657) performs a genuine field-by-field comparison: container (line 606), duration within a per-container-resolved tolerance (lines 614-637), and positional per-track codec/dims/fps/sampleRate/channels (`compareTrack`, lines 659-686). Not trivially satisfiable — any track-count/codec/dim mismatch fails. The loose duration band is documented and asset-scoped (src/core/oracles.ts:199-254), and is *actually tested* here (mediabunny's Δ0.3762 s sits at 75% of the 0.5 s band, not a free pass).
- **Winner implementation is genuine:** mediabunny `metadataFromInput` (src/engines/mediabunny/adapter.ts:416-474) opens a real `Input`, reads duration via `getDurationFromMetadata()`/`computeDuration()` (lines 428-441), and normalizes real track getters (lines 443-447). No canned output, no short-circuit to the golden, no swallowed-error-as-success (failures null the field, they do not fabricate a pass).
- **Measurements physically plausible:** durations cluster at 3.084 s ±sub-ms for 5 engines and Δ0.376 s for mediabunny's estimate; 2 tracks matched; 192 KB fixture probed in 5.5–110 ms (CPU paths) — all realistic for a small WebM header read.
- **Cached note:** **ALL 7 entries have `cached==true`** (`reason: "cached previous PASS result"`). Results were reused, not re-run this session; bench is `n==1`/`mad==0` per engine. Ranking direction is safe (orders-of-magnitude gaps) but the 5.53 vs 8.64 ms mediabunny-vs-ffmpeg margin is single-sample and could shift on a fresh run.
- **Verdict: REAL.** Real 192 KB fixture + real mediabunny library probe + a meaningful positional golden-metadata oracle with an asset-justified (and actually-exercised) loose duration band. The only caveat is staleness (cached) and thin single-sample benches.

## Confidence & caveats

- **Confidence: medium.** The correctness gate is real but is a *single metadata oracle* (no packets/SSIM/bit-exact), so all 6 PASSes are correctness-equivalent and the winner is decided purely on wall time.
- Every bench is `n==1, mad==0, cached==true`. The large gaps (platform 1085x, web-demuxer 20x) are robust to single-sample noise; the mediabunny-vs-ffmpeg.wasm 1.56x is not — a fresh multi-sample run could narrow or flip it.
- Mediabunny has the *loosest* duration accuracy of the field (Δ0.3762 s vs ffmpeg's Δ0.004 s); it wins only because the headerless-WebM loose band makes that acceptable and the oracle does not reward tighter duration. If a future strict-duration metamorphic gate (probe/metamorphic-recorder-headerless-sane-duration, src/scenarios/probe/index.ts:478) is scored alongside, the ranking could change.
