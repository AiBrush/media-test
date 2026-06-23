# trim/robust_zero_length_range

family: trim · fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4) · primaryMetric: (none recorded; durationMs used) · passCount: 2 / 7

This is a **robustness** trim case: trim range `[5_000_000us, 5_000_000us)` — a **zero-length range** (`endUs == startUs`) on a *valid* 30s H.264/AAC MP4. The correct behavior is NOT to transcode anything; it is to **reject cleanly** (throw/reject) and emit no output, never fabricate a 0-frame file or hang. The only oracle is `graceful-failure`.

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED win.
- Two engines PASS (mediabunny, ffmpeg.wasm). Both pass the *same single* smoke-level oracle (`graceful-failure`) by throwing a pre-flight domain error before touching the media, so **correctness is a tie**.
- **Decisive factor: performance / reject latency.** mediabunny rejected in `durationMs=9` vs ffmpeg.wasm `durationMs=111` — a **~12.3x faster** graceful reject. mediabunny's rejection is a synchronous JS bounds check that runs before any wasm/WebCodecs boot; ffmpeg.wasm carries higher fixed overhead.
- **Margin over runner-up: ~12.3x lower wall (9ms vs 111ms).** Both results are `cached:true`; neither shard entry carries a `bench{}` block, so this is single-sample evidence (weak spread data).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 9ms (durationMs) | n/a | n/a | n/a | cached: graceful: mediabunny trim rejected invalid range 5000000..5000000us |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 111ms (durationMs) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: trim range is outside the supported domain |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |

No `bench{}` metrics (throughputRealtime/peakMemory/longtasks) are present in this shard; only `durationMs` was recorded, shown in the wall column.

## Why the winner wins (deep technical)

The operation here is degenerate by construction: `startUs == endUs == 5_000_000`. There is no codec work to do — no H.264 GOP to re-time, no AAC packet to copy, no MP4 box to rewrite. The entire test is about whether the adapter's trim entry point **validates its domain before doing I/O** and surfaces a clean throw that the runner can route to `graceful-failure`.

mediabunny's `trim()` (`src/engines/mediabunny/adapter.ts:1445-1455`) performs an explicit ordered pre-flight: first `range.startUs < 0` (line 1450-1451), then `range.endUs <= range.startUs` (line 1453-1454). For this case the second check fires (`5000000 <= 5000000` is true) and it throws `mediabunny trim rejected invalid range 5000000..5000000us` **before** `openInput(this.lib, input)` at line 1460 — i.e. before any MP4 demux, before any WebCodecs decoder is created (the configUsed backend is `webcodecs`/`prefer-hardware`, but none of that machinery is reached). That is why it costs only 9ms: it is a pure synchronous numeric comparison on the JS side.

The runner converts that throw into a PASS: `src/core/runner.ts:1031-1039` catches the engine throw inside the robustness path, classifies it as `verdict = 'graceful'`, and routes to the oracle with no output populated. `gracefulFailure()` in `src/core/oracles.ts:2586-2610` then sees `hasGracefulSignal` true (the scenario lists `graceful-failure`) and `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`, returning PASS at line 2609 with detail "operation produced no output and did not crash/hang → handled gracefully" — exactly the `oracleOutcomes[0].detail` in the shard.

ffmpeg.wasm reaches the *same logical outcome* via `src/engines/ffmpeg-wasm/adapter.ts:2559-2560`: `range.startUs < 0 || range.endUs <= range.startUs` throws `ffmpeg.wasm@0.12.15: trim range is outside the supported domain`, also before `writeInput`/`runInfo` (line 2565+). So ffmpeg's reject is *also* genuine and pre-I/O. The 111ms vs 9ms gap is therefore not algorithmic — it is fixed adapter/runtime overhead (ffmpeg.wasm's heavier per-op harness path and module accounting) versus mediabunny's near-zero pure-TS path (`coreBuild: pure-ts-esm`, `sharedArrayBuffer:false`, `coopCoep: not-required`). For a *reject-only* scenario, the lighter engine wins purely on latency, and mediabunny needs no COOP/COEP and no SharedArrayBuffer to do it.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correct and genuine graceful reject (`adapter.ts:2559-2560`), but 111ms vs mediabunny's 9ms — ~12.3x slower reject latency. No correctness deficit; it simply pays more fixed overhead per op.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare operation 'trim'". Honest NA — remotion-webcodecs is a transcode/conversion wrapper and does not expose a trim op in the registry.
- **mp4box@2.3.0 (NA_ENGINE):** "does not declare operation 'trim'". Honest — MP4Box.js is a demux/parse/segment library, not a trimmer.
- **platform@chrome-149 (NA_ENGINE):** "does not declare operation 'trim'". Honest — the raw WebCodecs/platform path has no trim primitive.
- **web-demuxer@4.0.0 (NA_ENGINE):** "does not declare operation 'trim'". Honest — it is a demuxer only.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "does not declare operation 'trim'". Honest — it is a parser/probe library, no trim op.

All five NAs are `NA_ENGINE` (capability not declared), not `NA_BROWSER`, and look honest: none of these five frameworks ship a trim/cut primitive, so they cannot be faulted for declining a trim robustness case.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/trim/index.ts:843-854` (`id: 'robust_zero_length_range'`), part of `ROBUSTNESS_CASES`. notes: "Zero-length range (end==start): either a clean empty-trim reject or graceful throw." Range `startUs:5_000_000, endUs:5_000_000`.
- **Fixture:** `asset: 'h264_1080p_30s.mp4'` → `fixtures/media/h264_1080p_30s.mp4` **exists, 31MB**, a real H.264/AAC MP4. Not synthetic/empty/mock. The degeneracy is in the *range argument*, not in the bytes — the file itself is valid real media.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1453-1454` — a real ordered numeric domain check that throws before `openInput` (line 1460). No canned output, no input→output copy, no golden short-circuit, no swallowed error. The throw propagates to the runner.
- **Oracle:** `graceful-failure` at `src/core/oracles.ts:2586-2623`. It does NOT do a golden comparison (none is appropriate for a reject case); it asserts **absence of output plus no crash/hang**. Runner classifies the throw as `graceful` at `runner.ts:1031-1039`. The measurement is physically plausible: no output bytes, no frames, no metadata, reject in single-digit ms.
- **Verdict: WEAK-GATE.** Everything is REAL (real fixture, real pre-flight validation in both engines, oracle does a meaningful no-output/no-crash assertion), but the gate is a *smoke-level* `graceful-failure` oracle — it confirms the engine doesn't fabricate output or hang, not any bit-exact/structural correctness. The PASS is honest but intrinsically weak, and the winner is decided on a single-sample latency margin.
- **Cached note:** Both PASS entries are `cached:true` with no `bench{}` block. Evidence is reused single-sample timing (9ms / 111ms), not a fresh re-run — staleness risk applies to the timing margin, though the deterministic logical outcome (both reject pre-flight) is robust to re-run.

## Confidence & caveats

- The correctness tie is unambiguous and code-verified: both winners throw on `endUs <= startUs` before any media work.
- The performance margin (12.3x) rests on `durationMs` only — no `bench` median/p95/mad and no sample count `n`. A 9-vs-111ms gap is large enough that the ordering is unlikely to invert, but the precise ratio is single-sample and `cached`, so treat the exact number as soft.
- This gate is smoke-level (graceful-failure); a stronger suite would be impossible here because the correct output is "no output". The win is real but the scenario cannot exercise bit-exact/structural oracles.
- Confidence: medium (logical outcome high-confidence; numeric margin cached/single-sample).
