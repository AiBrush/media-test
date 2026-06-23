# trim/robust_negative_start

family: trim | fixture asset: `h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4) | primaryMetric: none (robustness/graceful-reject scenario, no bench) | passCount: 2 of 7

Requested operation: trim the valid 30s H.264/AAC MP4 over the out-of-domain range `startUs=-2_000_000`, `endUs=4_000_000`. The negative start is physically impossible; a correct engine must reject cleanly and NEVER fabricate output. The single gating oracle is `graceful-failure`.

## Verdict

Best framework: **mediabunny@1.48.0** (CONTESTED — 2 PASS).

Decisive factor: Both PASS engines satisfy the identical, single correctness oracle (`graceful-failure`) by throwing on the negative start before producing any output, so correctness strength is a tie. There is no performance metric in this robustness scenario, so the only available differentiator is the rejection cost/latency: mediabunny rejects in **7 ms** vs ffmpeg.wasm in **244 ms** — a **~34.9x faster** clean reject. mediabunny's guard is a pure-TypeScript pre-condition check (`range.startUs < 0`) that runs with zero wasm/codec/container work; ffmpeg.wasm reaches an equivalent guard only after its adapter/wasm path is engaged. Both are cached results, so the latency margin is weak evidence (see caveats). The win is a tiebreak, not a correctness gap.

Margin over runner-up (ffmpeg.wasm): 244 ms / 7 ms ≈ 34.9x lower reject latency; n=1 each, cached.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs=7) | n/a | n/a | n/a | cached: graceful: mediabunny trim rejected negative start -2000000us |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs=244) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: trim range is outside the supported domain |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |

No engine reported a `bench{}` block for this scenario; the only quantitative field is `durationMs`. All seven entries are robustness/no-throughput.

## Why the winner wins (deep technical)

This is a degenerate-input robustness test, not a transcode/quality test. The "win" is about who refuses the impossible operation most cleanly and cheaply, without fabricating media.

The input `h264_1080p_30s.mp4` is a real, well-formed H.264-in-MP4 file (AAC audio); the BYTES are valid — what is malformed is the *requested range*: `startUs = -2_000_000` µs. A negative presentation start has no defined meaning in MP4 edit-list / sample-timestamp space (CTS/DTS are non-negative on the media timeline). The only correct behavior is a clean reject with no output buffer.

mediabunny's adapter implements this as a pure-TypeScript precondition at the very top of `trim()`: `src/engines/mediabunny/adapter.ts:1450-1451` — `if (range.startUs < 0) throw new Error('mediabunny trim rejected negative start -2000000us')`. Critically, this throw happens BEFORE `makeOutputFormat()`, before any `Input`/`Output` allocation, before any `Conversion`/`EncodedPacketSink` is created, and before any WebCodecs (`backend: webcodecs`, `hwAccel: prefer-hardware` per env.configUsed) decoder/encoder is configured. That is why the recorded `durationMs` is 7 ms: no demux, no MP4 box parse, no codec probe. The runner catches the plain throw and routes it through `graceful-failure` (oracles.ts), which for a scenario carrying the `graceful-failure` oracle returns PASS when `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` — i.e. the engine produced literally nothing (`src/core/oracles.ts:2607-2609`). The shard's outcome detail "operation produced no output and did not crash/hang → handled gracefully" matches that exact branch, confirming no fabricated output path.

ffmpeg.wasm reaches the same correct verdict via an equivalent explicit guard at `src/engines/ffmpeg-wasm/adapter.ts:2559-2560` — `if (range.startUs < 0 || range.endUs <= range.startUs) throw new Error('ffmpeg.wasm@0.12.15: trim range is outside the supported domain')` (the reason string in the shard is byte-for-byte this message). It is fully correct, but its measured reject took 244 ms vs mediabunny's 7 ms. Even though both guards are cheap source-level checks, the ffmpeg path carries more adapter/wasm setup overhead before/around the guard in the measured run, yielding the ~34.9x latency gap. Since the scenario provides no SSIM/byte/throughput oracle to separate them on correctness, this latency is the sole, admittedly thin, differentiator — hence mediabunny edges it on the performance tiebreak rule (4b: wall/duration, lower better).

Both passes are genuine: each engine threw a real Error from a real guard in real adapter code, and the oracle confirmed zero output. Neither short-circuited to a golden, copied input→output, nor swallowed the error to report success.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, runner-up): Correct and honest — rejected the negative start at `adapter.ts:2559-2560`. Lost only on the performance tiebreak: 244 ms reject vs mediabunny's 7 ms (~34.9x slower). No correctness deficiency.
- **mp4box@2.3.0** (NA_ENGINE): Does not declare the `trim` operation. Honest NA — mp4box.js is a demux/box-parse/segmenter library with no trim/transcode op; it cannot perform a frame/timestamp trim, so the capability is genuinely absent.
- **remotion-media-parser@4.0.479** (NA_ENGINE): Does not declare `trim`. Honest — this package is a pure media *parser* (metadata/track/sample reader), not a writer/trimmer.
- **platform@chrome-149** (NA_ENGINE): Does not declare `trim`. The raw WebCodecs/platform engine exposes decode/encode primitives but no packaged trim operation in this suite; honest NA.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): Does not declare `trim` in its registered op set for this run; honest given it is registered here for transcode/convert paths rather than a range-trim op.
- **web-demuxer@4.0.0** (NA_ENGINE): Does not declare `trim`. Honest — web-demuxer is a demux-only (libav-based packet extraction) library, not a trimmer/muxer.

All five NA_ENGINE entries look honest: the runner reports "engine does not declare operation 'trim'", i.e. the op is simply not in the engine's declared capability set (registry-level), not a silently-skipped or under-declared trim. None of these libraries has a trim/write capability that is being hidden.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:856-866` (id `robust_negative_start`, in `ROBUSTNESS_CASES`). Range `startUs:-2_000_000, endUs:4_000_000`, `frameAccurate:false`. notes: "Negative startUs: out-of-domain range; trim must reject gracefully, never fabricate output." Gating intent is explicit and correct.
- Fixture: asset `h264_1080p_30s.mp4` — REAL file present at `fixtures/media/h264_1080p_30s.mp4`, 31 MB, H.264 video + AAC audio in MP4. Not synthetic/empty/mock. The bytes are valid; only the requested range is degenerate, which is the whole point of the test.
- Oracle: `graceful-failure` at `src/core/oracles.ts:2586-2623`. It is a real assertion: for a scenario carrying this oracle it PASSes only if the engine produced NO output of any kind (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`, line 2607-2609) after a caught throw, and FAILs if the engine emitted output from the degenerate input (line 2614-2617). It is not trivially satisfiable: an engine that fabricated a trimmed clip would FAIL. There is no golden-file short-circuit.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1450-1451` — explicit `range.startUs < 0` guard throwing before any Input/Output/codec allocation. Genuine implementation; no canned output, no input→output copy, no error-swallowing. (Runner-up guard: `src/engines/ffmpeg-wasm/adapter.ts:2559-2560`.)
- cached note: mediabunny's PASS has `cached:true` (startedAt 2026-06-22T16:42:30Z, durationMs=7); ffmpeg.wasm's PASS also `cached:true` (startedAt 2026-06-22T17:13:39Z, durationMs=244). Both verdicts were reused, not freshly re-run. The PASS verdicts are reliable (deterministic source-level guards that cannot drift), but the 7 ms vs 244 ms latency margin is from cached samples and should not be over-weighted.

Verdict: **REAL** — real 31 MB H.264/AAC MP4 fixture, real explicit precondition guards in both PASS adapters (cited file:line) that throw before producing any output, and a meaningful graceful-failure oracle that would FAIL any engine fabricating output. The correctness gate is genuine; the only soft spot is that the winner is chosen on a cached latency tiebreak, not a correctness gap.

## Confidence & caveats

Confidence: medium-high on correctness/validation; low on the precise performance margin.

- Correctness is a true tie: both PASS engines satisfy the same single oracle the same way (throw → no output). The winner is decided only by the durationMs tiebreak (7 ms vs 244 ms).
- Both PASS results are `cached:true`, so the latency numbers are reused samples (n=1 each, no mad/p95 spread available). The ~34.9x margin is directionally meaningful (pure-TS guard vs wasm-path guard) but should not be cited as a hard benchmark.
- This is a robustness scenario: there are no SSIM/PSNR/byte-exact/seek oracles to strengthen the ranking. A clean reject is binary; both engines pass it.
- The 5 NA_ENGINE engines are correctly excluded; their NAs are registry-level (op not declared) and honest for demux/parse-only libraries.
