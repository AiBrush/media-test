# robustness/edge_seek_negative

family: robustness | fixture asset: `h264_1080p_30s.mp4` (H.264 High, 1080p30, ~30s, MP4/faststart, 31 MB) | primaryMetric: wall (`durationMs`) | passCount: 5/7

This scenario issues a `seek` to `tUs = -5_000_000` (−5 s) on the 30-second H.264/MP4 workhorse. Per §A.16 the engine MUST clamp the negative target to 0 / first frame OR error cleanly; it must NOT fault on the sign or attempt to seek before the start. The only gating oracle is `graceful-failure`, and the verdict is decided by the runner's output-absence / no-crash-within-budget, not by the notes (see `src/scenarios/robustness/index.ts:555-565`).

## Verdict

- Best framework: **mediabunny@1.48.0** (PASS).
- Contested: **YES** — 5 engines PASS the identical single oracle (`graceful-failure`), so correctness is tied at the same rung of the ladder. The decision falls entirely to performance.
- Decisive factor: **wall time (`durationMs`)**. mediabunny completed in **56 ms**, the fastest of all 5 passers.
- Margin over runner-up (platform, 162 ms): **~2.9x faster wall** (162/56). Versus the field: web-demuxer 265 ms (~4.7x), ffmpeg-wasm 357 ms (~6.4x), remotion-webcodecs 5201 ms (~93x). Evidence is weaker than usual: every PASS row is `cached==true` and the shard carries no `bench{}` block (no median/p95/mad/n), so the single `durationMs` is point-in-time, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 56 | n/a (not in shard) | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | graceful-failure:true | 162 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | graceful-failure:true | 265 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 357 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 5201 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

Note: the shard's per-engine objects contain no `bench{}` map and no `primaryMetric`/`throughputRealtime`/`peakMemory`/`longtasks` fields for this scenario; only `durationMs` is present. The metric columns are therefore "n/a". The scenario declares `metrics: ['wall', 'peakMemory', 'longtasks']` (`src/scenarios/robustness/index.ts:580`) but those were not emitted into this shard.

## Why the winner wins (deep technical)

This is a robustness edge case, not a fidelity test, so all five passers satisfy the same correctness bar (`graceful-failure`) and the win is mechanistic-performance, not pixel quality. The deciding mechanism is how cheaply each engine reaches a defensible "negative target handled" state on a 31 MB H.264/MP4 file.

mediabunny's seek path (`src/engines/mediabunny/adapter.ts:1415-1436`) opens the input, grabs the primary video track, builds a `VideoSampleSink`, and calls `sink.getSample(targetSec)` where `targetSec = Math.max(0, tUs / 1e6)` (line 1422). The `Math.max(0, …)` collapses −5 s to 0 **before** any I/O on the sample table, so the engine never tries to index a negative time — it resolves the first GOP / first decodable frame. Because mediabunny uses a pure-TS ESM demuxer with a streaming-lockstep WebCodecs pipeline (`env.configUsed`: `backend=webcodecs`, `hwAccel=prefer-hardware`, `coreBuild=pure-ts-esm`, `coopCoep=not-required`, `sharedArrayBuffer=false`), it parses only the moov/sample-table and decodes a single keyframe on Apple-M1-Max hardware VideoToolbox. That is why the wall is **56 ms** — essentially moov parse + one hardware-decoded keyframe, with no wasm module instantiation and no whole-file buffering.

The `graceful-failure` oracle (`src/core/oracles.ts:2586-2623`) PASSes when, for a robustness scenario, the operation produced **no output that reached the oracle context** and did not crash/hang/OOM (`ctx.output/metadata/demux/frames` all undefined → line 2608-2609). The recorded outcome for all five is exactly `"operation produced no output and did not crash/hang → handled gracefully"`. So the bar is "the runner returned or threw cleanly inside the fuzz timeout (`FUZZ_TIMEOUT_MS`)" — a smoke-tier robustness gate. mediabunny clears it the fastest, hence the win.

Contrast the runner-up backends. `platform@chrome-149` (162 ms) drives `VideoDecoder` directly with a `webgpu>webgl>offscreen2d` pixel backend and `<video>→canvas→MediaRecorder` plumbing; its seek path carries more browser-element overhead than mediabunny's direct sample-sink, giving ~2.9x more wall. `web-demuxer@4.0.0` (265 ms) routes through an Emscripten/wasm FFmpeg demuxer: its seek (`src/engines/web-demuxer/adapter.ts:957-973`) also clamps with `Math.max(0, tUs/1e6)` (line 972) then `VideoDecoder.isConfigSupported` + a `read(...AV_SEEK_FLAG_BACKWARD)` keyframe decode, but it pays wasm-module + AVFormat open cost. `ffmpeg.wasm@0.12.15` (357 ms) pays the heaviest fixed cost — single-thread wasm FFmpeg CLI invocation. `remotion-webcodecs@4.0.479` (5201 ms, ~93x slower) is an outlier: its convert pipeline (`pipeline=streaming-backpressure`, `writer=bufferWriter`, `convert=main-thread`) spins up its full conversion/extract machinery even for a single-frame seek, dwarfing every other path.

## What each other framework did wrong

- **platform@chrome-149** — PASS but lost on speed: 162 ms vs 56 ms = **~2.9x slower wall**. Correctness identical (graceful-failure:true). Extra cost from the `<video>/MediaRecorder` + multi-tier pixel backend wiring around `VideoDecoder`.
- **web-demuxer@4.0.0** — PASS but lost: 265 ms = **~4.7x slower**. wasm AVFormat open + `isConfigSupported` + backward-keyframe read/decode add fixed overhead over mediabunny's native sample-sink. (Its negative clamp at `adapter.ts:972` is honest — same `Math.max(0,…)` strategy.)
- **ffmpeg.wasm@0.12.15** — PASS but lost: 357 ms = **~6.4x slower**. Single-thread wasm FFmpeg CLI startup dominates a one-frame seek; no hardware decode.
- **remotion-webcodecs@4.0.479** — PASS but lost badly: 5201 ms = **~93x slower**. Runs its full main-thread conversion/extract pipeline (bufferWriter, streaming-backpressure) for what should be a single-frame resolve; massive fixed overhead.
- **remotion-media-parser@4.0.479** — NA_ENGINE: `reason: "engine does not declare operation 'seek'"`. This is an **honest** NA: the adapter documents that media-parser can resolve a read-side keyframe but cannot decode it to pixels, so `seek` is deliberately undeclared and its method throws rather than fabricate (`src/engines/remotion-media-parser/adapter.ts:12,563`). Not an under-declared capability.
- **mp4box@2.3.0** — NA_ENGINE: `reason: "engine does not declare operation 'seek'"`. mp4box.js is a pure ISO-BMFF parser/segmenter with no decoder, so an honest NA (no pixel output to land a seek on). Not under-declared.

## Anti-cheat validation

- Scenario definition: `src/scenarios/robustness/index.ts:555-565` (`id: 'edge_seek_negative'`), generated via `seekEdgeScenarios.map` at `:568-584`. `op: 'seek'`, `options: { tUs: -5_000_000, seekEdge: 'negative' }`, `oracles: ['graceful-failure']`, `timeoutMs: FUZZ_TIMEOUT_MS`.
- Fixture: `asset: 'h264_1080p_30s.mp4'` → `fixtures/media/h264_1080p_30s.mp4` exists, **31 MB**, last modified 5 days ago. A REAL, non-synthetic H.264/MP4 file (also the shared workhorse used across the suite). Not empty/mock.
- Oracle: `graceful-failure` at `src/core/oracles.ts:2586-2623`. It performs a real check — for a robustness scenario it requires `ctx.output && ctx.metadata && ctx.demux && ctx.frames` all absent (no fabricated output reached the oracle) AND no crash/hang/OOM signal, else FAIL. It is genuine but **loose by design**: it is the smoke/robustness tier of the ladder and cannot grade seek accuracy or pixel fidelity. For a negative-seek edge case this is the correct and only sensible gate (there is no canonical "frame" to assert), but it is not a strong correctness oracle.
- Winner adapter: mediabunny `seek` at `src/engines/mediabunny/adapter.ts:1415-1436`. Genuinely implemented against the real library — `openInput`, `getPrimaryVideoTrack`, `VideoSampleSink`, `getSample(Math.max(0, tUs/1e6))`. No canned output, no golden short-circuit, no input→output copy, no error-swallow-as-success. The negative target is clamped to 0 (line 1422), matching the §A.16 spec.
- Cached note: **all 5 PASS rows are `cached==true`** ("cached previous PASS result"). The results were reused, not re-run for this report. Staleness risk is real for the absolute `durationMs` values, but the PASS verdict for a deterministic clamp-or-throw edge case is stable across runs. The ordering (mediabunny < platform < web-demuxer < ffmpeg-wasm < remotion-webcodecs) is consistent with each engine's architectural fixed cost.
- Verdict: **WEAK-GATE**. Real fixture + real mediabunny implementation + a real-but-loose oracle. The PASS is genuine, but `graceful-failure` is a smoke-tier robustness gate (it grades only "didn't fault / produced no rogue output"), so the win is decided by performance among engines that all clear the same low bar — not by a strong correctness oracle.

## Confidence & caveats

- Confidence: **medium**. The winner (lowest wall, real implementation, honest NAs for the two non-passers) is clear, but: (1) all evidence is cached, (2) the shard carries no `bench{}` distribution — only a single `durationMs` per engine, so margins lack n/mad/p95 and a 56-ms vs 162-ms gap on a single sample is suggestive rather than statistically firm, (3) the gating oracle is the weakest tier, so "best" here means "cheapest correct edge-case handler", not "most accurate seeker".
- Caveat: mediabunny, web-demuxer (and others) handle the negative target by **clamping to 0** rather than erroring; both behaviors are accepted by §A.16 and by the oracle. The oracle's recorded "produced no output" detail reflects the runner routing (output not surfaced to the oracle context), not necessarily a thrown error.
