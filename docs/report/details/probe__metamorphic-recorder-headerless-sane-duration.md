# probe/metamorphic-recorder-headerless-sane-duration

family: probe | fixture asset: `recorder_headerless.webm` (VP8 video + Opus audio, 320x240@30fps, golden durationSec 3.084) | primaryMetric: wall | passCount: 6 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`), backend `webcodecs` (`coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`).
- **Contested**: 6 of 7 engines PASS. mp4box is the only non-PASS (NA_ENGINE).
- **Decisive factor: performance (wall median).** Every passing engine satisfies the SAME single oracle (`property-invariant` / `probe-duration` branch) at the SAME loose 0.5s tolerance band — correctness is comparable across the field, so the tiebreak falls to wall-clock probe latency.
- **Margin over runner-up**: mediabunny 3.495 ms vs ffmpeg-wasm 5.235 ms = **1.50x faster wall**; vs the slowest passer (platform) 6001.4 ms = **~1717x faster**. All on n=1 (mad=0), so the margin is weak evidence (see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true (Δ0.3762s ≤ 0.5s) | 3.495 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (Δ0.0040s ≤ 0.5s) | 5.235 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | property-invariant:true (Δ0.0000s ≤ 0.5s) | 6001.435 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true (Δ0.000173s ≤ 0.5s) | 15.580 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | property-invariant:true (Δ0.000173s ≤ 0.5s) | 32.765 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | property-invariant:true (Δ0.000173s ≤ 0.5s) | 47.350 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

(No throughputRealtime / peakMemory / longtasks were collected for this scenario — `metrics: ['wall']` only; bench carries the single `wall` metric per engine.)

## Why the winner wins (deep technical)

The operation is a pure metadata **probe** of a MediaRecorder-origin WebM. The key container property is that a MediaRecorder/headerless WebM is written live and therefore carries **no authoritative Segment `Duration`** in the EBML header — `§A.16`'s "sane duration" gate exists precisely because such a stream legitimately may report null, and IF it reports non-null the value must land in an estimate-only band rather than be exact. The scenario routes through the `property-invariant` oracle's `probe-duration` branch (`src/core/oracles.ts:2709-2711` → `probeDurationInvariant`, `src/core/oracles.ts:3823-3880`). For this asset the band is selected by `isLooseRecorderWebm` (`src/core/oracles.ts:226-230` — the id contains `recorder`/`headerless`), so `durationToleranceFor` (`src/core/oracles.ts:240-254`) returns the loose band and the effective tolerance is `max(LOOSE_DURATION_ABS_SEC 0.5, LOOSE_DURATION_REL 0.15 × 3.084) = max(0.5, 0.4626) = 0.5s`. The shard confirms every passing engine reports `durationToleranceSec0 = 0.5`.

Because all six passers clear the identical single oracle at the identical 0.5s band, correctness is "comparable" per the decision ladder — there is no stronger oracle (no bit-exact, golden-packets, or structural gate) to separate them — so the win is decided on wall-clock latency. mediabunny posts **3.495 ms**, the lowest in the field. Mechanistically this comes from its cheap-first duration path: `metadataFromInput` (`src/engines/mediabunny/adapter.ts:417-441`) calls `input.getDurationFromMetadata()` FIRST (`adapter.ts:429`), which reads the container's declared duration without scanning samples, and only falls back to the full `computeDuration()` fragment walk when metadata yields null/non-finite (`adapter.ts:434-441`). For a small 192 KB clip this is a near-trivial header read plus a `getTracks()` walk, executed on the pure-TS ESM core with no COOP/COEP and no SharedArrayBuffer overhead.

There is an important nuance the numbers expose: mediabunny's `durationDeltaSec0 = 0.3762s` is by far the LARGEST delta in the field — it consumes ~75% of the 0.5s budget — whereas ffmpeg-wasm sits at 0.0040s and the parser-class engines (remotion-webcodecs, remotion-media-parser, web-demuxer) all land at exactly 0.000173s and platform at 0.0s. The 0.000173s cluster strongly implies those engines reproduce the golden's estimated duration almost identically (the golden was baked from a browser-capture estimate). mediabunny's 0.3762s offset means it derives a coarser duration estimate for the headerless stream (likely from the cheap metadata path / last-cluster timestamp rather than a precise last-frame scan) — it is "sane" (inside the band, hence PASS) but it is the least accurate duration in the cohort. The loose band is exactly what permits this: under a strict per-frame band mediabunny would have been the only engine at risk. So mediabunny wins on the chosen metric (wall) but is the weakest on the underlying property; this is the cost-vs-accuracy tradeoff its adapter deliberately makes (`adapter.ts:421-426` comment: read declared duration "cheaply, not by scanning every sample").

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, runner-up): correct and far more accurate (Δ0.0040s vs mediabunny's 0.3762s) but slower at 5.235 ms — **1.50x** mediabunny's wall. Loses purely on latency; the wasm demux/probe path carries fixed module-call overhead a native-TS reader avoids.
- **platform@chrome-149** (PASS): most ACCURATE (Δ0.0s exact) but catastrophically slow at **6001.435 ms** (~1717x mediabunny). Its config encodes a full `<video>→canvas→MediaRecorder` pipeline (`encode: "<video>→canvas→MediaRecorder(out)"`) and a `VideoDecoder` decode path — it effectively plays/decodes the clip to derive duration rather than reading metadata. Correct but the wrong tool for a probe.
- **remotion-webcodecs@4.0.479** (PASS): correct, Δ0.000173s, but 15.580 ms — ~4.5x mediabunny. Streaming-backpressure WebCodecs convert pipeline has more setup than a flat probe.
- **remotion-media-parser@4.0.479** (PASS): correct, Δ0.000173s, but 32.765 ms — ~9.4x mediabunny. `fieldsTier: full-parse(fps)` on a `cpu-js`/`webReader` streaming parser pays a full structural parse to recover fps, inflating probe latency.
- **web-demuxer@4.0.0** (PASS): correct, Δ0.000173s, but slowest passer at 47.350 ms (~13.5x mediabunny). wasm (libav-class) demuxer init/probe overhead dominates for a tiny file.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare input container 'webm'". This NA is HONEST — MP4Box.js is an ISO-BMFF (MP4/MOV/fragmented-MP4) parser and genuinely has no Matroska/WebM (EBML) demuxer, so it correctly declines the `containersIn: ['webm']` requirement rather than under-declaring a real capability.

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/probe/index.ts:478-495` — `id: 'probe/metamorphic-recorder-headerless-sane-duration'`, `op: 'probe'`, `input: 'recorder_headerless.webm'`, `requires.containersIn: ['webm']`, `videoCodecs: ['vp8']`, `audioCodecs: ['opus']`, `oracles: ['property-invariant']`, `options: { invariant: ..., property: 'probe-duration' }`.
- **Fixture exists and is real**: `fixtures/media/recorder_headerless.webm` = 192 KB on disk (not synthetic/empty/0-byte). Golden present: `fixtures/golden/recorder_headerless.webm.meta.json` (durationSec 3.084, webm/vp8/opus, `tags.encoder: "Chrome"` — consistent with a real MediaRecorder capture), plus `.frames.json`, `.packets.json`, `.ssim.json`.
- **Oracle is a real comparison**: `src/core/oracles.ts:3823-3880` (`probeDurationInvariant`) computes `delta = |gotDur − wantDur|` against the golden duration and fails when `delta > tolSec`. It is NOT trivially satisfiable across the board: ffmpeg-wasm/parser engines land at 0.000173–0.0040s and mediabunny at 0.3762s — a real spread, with mediabunny consuming 75% of the budget, proving the gate measures something physical. The band is intentionally loose (0.5s) for a headerless recorder WebM per `isLooseRecorderWebm` (`oracles.ts:226-230`) — this is documented `§A.16` behaviour, not a hidden wide tolerance.
- **Winner adapter is genuine**: `src/engines/mediabunny/adapter.ts:417-453` (`metadataFromInput`) calls the real mediabunny `Input` API (`getFormat`, `getDurationFromMetadata`, `computeDuration` fallback, `getTracks`, `getMetadataTags`). No canned output, no copy-input-to-output, no short-circuit to the golden file, no error-swallow-as-success (failures null the duration, which would surface as a measured-null fail in the oracle).
- **Cached note**: ALL seven entries have `cached: true` ("cached previous PASS result"). This evidence was REUSED, not freshly re-run — staleness risk per the launcher-seeding caveat. The verdict rests on cached medians; a fresh run could shift the sub-50ms wall ordering.
- **Verdict: WEAK-GATE.** The fixture and the winner's implementation are real, but the gating oracle is a single loose duration-proxy (0.5s band, no bit-exact/structural/packet check). The PASS is real but not strong, and notably the winner is the LEAST accurate engine on the very property being gated — it wins only because the band is wide and it is fastest.

## Confidence & caveats

- **Confidence: medium.** The PASS/NA outcomes and the wall ordering are unambiguous from the shard; the winner determination (fastest among comparable-correctness passers) is sound.
- **n=1 fragility**: every wall figure is a single sample (`n:1`, `mad:0`). The 1.50x mediabunny-over-ffmpeg margin rests on one timing each at the sub-6ms scale and could reorder on re-measurement.
- **All results cached**: nothing was re-run; if raw caches are stale the numbers are stale.
- **Accuracy vs speed inversion**: the metric that decides (wall) favours mediabunny, but the property under test (duration accuracy) favours essentially every other passer. If this scenario's intent is "most-correct sane duration," ffmpeg-wasm or the 0.000173s parser cluster would be the stronger pick; the current decision procedure ranks on speed because all passers clear the identical loose oracle.
