# robustness/edge_extreme_fps_240_probe

- Family: robustness
- Fixture asset: `fixtures/media/video_240fps.mp4` (real file, 153 KB on disk)
- primaryMetric: wall median (probe latency; reported as `durationMs` per engine)
- passCount: 7 of 7

## Verdict

- Best framework: **mediabunny@1.48.0**
- CONTESTED — all 7 engines PASS the single gating oracle (`golden-metadata`) with identical correctness: every engine reports `durationDeltaSec = 0` against the golden (mp4, 2.000s, h264, 320x240, **240 fps**, 1 track).
- Decisive factor: PERFORMANCE. Correctness is a tie (one oracle, all exact, same measurements), so the win is decided on probe wall time. mediabunny is the fastest at **9 ms**.
- Margin over runner-up: mp4box@2.3.0 at 17 ms -> **1.9x faster wall**. Against the WebCodecs peer remotion-webcodecs (39 ms) it is ~4.3x faster; against the heaviest passing engine, platform/chrome-149 (5913 ms), ~657x faster.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 9 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:true | 17 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 28 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 39 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 268 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 612 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 5913 ms | n/a | n/a | n/a | cached previous PASS result |

(The shard carries no `bench{}` block for this scenario; throughputRealtime / peakMemory / longtasks are not recorded. `durationMs` is the only timing signal and serves as the wall-median proxy. Every entry has `cached: true`.)

## Why the winner wins (deep technical)

This is a **probe** scenario over **H.264 in a plain (faststart) MP4** whose only unusual property is an extreme frame rate: 240 fps packed into a 2-second clip = ~480 densely-spaced presentation timestamps. The gate (`src/scenarios/robustness/index.ts:721`) requires the probe to recover **~240 fps under dense timestamps** and the ~2 s duration, both encoded in the golden `fixtures/golden/video_240fps.mp4.meta.json`.

The robustness risk here is fps derivation, not decoding. An engine that trusts a single header field, or that divides total samples by a mis-read timescale, will land outside the strict **±0.05 fps** band (`src/core/oracles.ts:160`, applied at `:673`) and FAIL. The duration must also fall inside the strict **±1-frame** band (`durationToleranceSec = 1/24 ≈ 0.0417 s`, `src/core/oracles.ts:159`); the shard shows `durationToleranceSec = 0.041666...` confirming the strict (non-loose) MP4 band was selected.

mediabunny computes fps the right way: in `normalizeTrack` it calls `v.computePacketStats(120)` and takes `stats.averagePacketRate` as the frame rate (`src/engines/mediabunny/adapter.ts:312-314`). Averaging the packet rate over a 120-packet prefix is exactly what makes a 240 fps stream report 240 fps regardless of a possibly-misleading header — it measures real inter-frame timing rather than trusting metadata. For duration it uses the cheap path first: `metadataFromInput` reads `getDurationFromMetadata()` and only falls back to the full `computeDuration()` scan when that yields null/non-finite (`src/engines/mediabunny/adapter.ts:417-434`, design note at `:34-36`). For a faststart MP4 the moov-level duration is present, so mediabunny gets 2.000 s without walking every sample — that cheap path is precisely why its wall time is 9 ms.

The backend (`env.configUsed`) is `backend: webcodecs`, `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required`. Note that for a metadata probe WebCodecs decoders are never instantiated on the hot path — the win is pure-JS box parsing plus a 120-packet timing scan, with no wasm module instantiation and no COOP/COEP requirement. That is the structural advantage over the wasm engines and over the platform path, which pays heavy fixed costs.

mp4box (the 17 ms runner-up) is also pure-JS but uses a `whole-file-append (MP4BoxBuffer + fileStart)` pipeline with `rangeReads: false` (`env.configUsed`), so it buffers and appends the entire 153 KB before yielding metadata; mediabunny's `BlobSource` + cheap-duration path avoids that whole-file marshaling, giving the ~1.9x edge. Both are correct; the gap is fixed parsing overhead.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS, lost on speed only: 17 ms vs 9 ms (1.9x slower). Whole-file `MP4BoxBuffer + fileStart` append with `rangeReads:false` pays a full-buffer marshal before metadata is available.
- **remotion-media-parser@4.0.479** — PASS, 28 ms (3.1x slower). `backend: cpu-js`, `fieldsTier: metadata-only` streaming parse; correct fps/duration but slower than mediabunny's cheap path.
- **remotion-webcodecs@4.0.479** — PASS, 39 ms (4.3x slower). WebCodecs-oriented adapter; carries more setup cost for what is a metadata-only probe.
- **ffmpeg.wasm@0.12.15** — PASS, 268 ms (~30x slower). wasm module + libav probe overhead dominates for a tiny clip; correct but far heavier.
- **web-demuxer@4.0.0** — PASS, 612 ms (~68x slower). wasm demuxer init/teardown cost dwarfs the actual parse of a 153 KB file.
- **platform@chrome-149** — PASS, 5913 ms (~657x slower). `decode: VideoDecoder`, `encode: <video>->canvas->MediaRecorder` config; the platform path spins up media-element/WebCodecs machinery, an enormous fixed cost for a metadata probe. Correct, but the slowest by three orders of magnitude.

## Anti-cheat validation

- Scenario definition: `src/scenarios/robustness/index.ts:721` (`id: 'edge_extreme_fps_240_probe'`, `op: 'probe'`, `asset: 'video_240fps.mp4'`, `oracles: ['golden-metadata']`, notes: "probe must report ~240 fps under dense timestamps (golden)").
- Fixture: `fixtures/media/video_240fps.mp4` exists, 153 KB — a real H.264/MP4 file, not synthetic/empty/mock.
- Golden: `fixtures/golden/video_240fps.mp4.meta.json` declares mp4 / 2.0 s / h264 / 320x240 / fps 240 / bitrate 599600 — physically plausible for a 2 s 320x240 240 fps clip (~480 frames). Companion `.packets.json` (54 KB), `.frames.json`, and `.ssim.json` goldens also exist, consistent with a genuinely-encoded asset.
- Oracle: `golden-metadata` at `src/core/oracles.ts:595-657`. Performs a real field-by-field comparison: container (`:606`), duration within a resolved tolerance band (`:614-637`), and per-track codec/width/height/fps/sampleRate/channels via `compareTrack` (`:659-686`). fps band is a strict ±0.05 (`:160`,`:673`); duration band is strict ±1-frame here (shard `durationToleranceSec = 0.041666...`). This is NOT trivially satisfiable: a wrong fps or duration FAILs. It is a structural/metadata-exact gate, not smoke and not a wide-open SSIM proxy.
- Winner adapter: `src/engines/mediabunny/adapter.ts` — fps from `v.computePacketStats(120).averagePacketRate` (`:312-314`); duration via cheap `getDurationFromMetadata()` then `computeDuration()` fallback (`:417-434`). It opens a real mediabunny `Input` over a `BlobSource` and reads real track getters; it does not return canned output, copy input to output, short-circuit to the golden, or swallow errors as success.
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the oracle is a genuine, strict metadata comparison — but it is a metadata-only probe gate (container/duration/codec/dims/fps). It does not verify decoded pixels or per-packet timing bit-exactly, so a PASS proves correct fps/duration recovery, not full demux/decode fidelity. The PASS is real and the strict ±0.05 fps band makes it meaningful for THIS extreme-fps risk; it is simply not a bit-exact correctness gate.
- Cached note: ALL 7 entries have `cached: true` ("cached previous PASS result"); the winner's 9 ms was reused, not re-run in this batch. Timing margins are single-sample (no n / mad / p95), so the speed ranking is directional evidence, not a tight statistical win — staleness/measurement-noise risk applies.

## Confidence & caveats

- Confidence: medium. Correctness verdict (7/7 PASS, identical exact measurements) is solid and code-verified. The performance ranking that decides the contest rests on single-sample `durationMs` values with no spread statistics and all cached, so the 1.9x margin over mp4box is plausible but not robustly measured.
- The scenario exposes only one oracle; there is no decode/packet bit-exact gate in this row, so "best" means "fastest correct metadata probe", not "most faithful decoder".
- If a fresh, uncached re-run is required for ship-grade timing, clear the raw + .browser-cache before re-running (per launcher seeding caveat).
