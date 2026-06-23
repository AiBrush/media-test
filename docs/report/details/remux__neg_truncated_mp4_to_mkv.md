# remux/neg_truncated_mp4_to_mkv

- **family:** remux (a robustness/negative probe authored under `src/scenarios/remux/negative.ts`)
- **fixture asset:** `fixtures/media/remux_truncated_h264_50p.mp4` (16 MB; valid H.264/AAC MP4 cut at 50% → incomplete moov/mdat)
- **operation:** `remux` mp4 → mkv (container rewrap), `gracefulAllowOutput: true`
- **primaryMetric:** none — robustness path never benches (runner.ts:1093); only `durationMs` recorded
- **oracle:** `graceful-failure` (single gate)
- **passCount:** 2 of 7 (ffmpeg.wasm, mediabunny)

## Verdict

**Best framework: mediabunny@1.48.0** — CONTESTED (2 engines PASS, both satisfying the identical single oracle `graceful-failure`).

Because this is a negative/robustness scenario, correctness strength is a tie: both passing engines satisfy exactly the same gate via the same `gracefulAllowOutput` branch ("operation returned partial/safe output and did not crash/hang"). There is no goldens comparison and no bench data (robustness never benches). The decisive factor is therefore the **tiebreaker ladder (decision step 4c)**: mediabunny ran on a hardware WebCodecs / pure-TS-ESM streaming pipeline that requires **no COOP/COEP and no SharedArrayBuffer**, whereas ffmpeg.wasm carries a heavyweight wasm core. Secondary signal agrees: mediabunny `durationMs=208` vs ffmpeg-wasm `durationMs=280` (≈1.35x faster wall on the cached single-shot), though both are `cached:true` and durationMs is not a measured bench metric so this is weak evidence.

Margin over runner-up (ffmpeg.wasm): ~1.35x on recorded durationMs (208 vs 280 ms), plus the architectural tiebreaker (no cross-origin-isolation requirement, streaming-lockstep pipeline).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | graceful-failure:true | n/a (no bench; durationMs=208) | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (no bench; durationMs=280) | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

(No engine reports a `bench` block: `runRobustness` finalizes PASS without benching, runner.ts:1093. The only timing signal is `durationMs`.)

## Why the winner wins (deep technical)

This scenario does not test transcode fidelity; it tests **failure surface hygiene** on a structurally-broken ISO-BMFF. The fixture `remux_truncated_h264_50p.mp4` is a real H.264-in-MP4 / AAC clip cut at the byte midpoint, so the `moov` sample table and/or `mdat` are incomplete. A lossless mp4→mkv remux copies coded samples, so it must parse the (partial) sample table and then drive a Matroska/EBML writer. The danger modes are: looping on a bogus box/atom size, indexing past a half-present `stsz`/`stco` table (OOM), or hanging. The gate requires the engine to either reject cleanly, emit nothing, or emit a **safe partial** output within the 15 s timeout — and `gracefulAllowOutput:true` (negative.ts:60) makes the safe-partial path acceptable for this specific case (notes: "emit a safe partial output, within the timeout — no OOM on a half-present sample table").

**mediabunny (winner).** Its `remux()` (src/engines/mediabunny/adapter.ts:1244) is a genuine library call: it builds a real `Output` with a real mkv `format` (`makeOutputFormat`, line 1250-1255), opens the truncated bytes via `openInput` (line 1252), and runs `runConversion` (line 1256) inside a `try/finally` that always `dispose()`s the input (line 1258). There is no canned output, no input→output copy, no golden short-circuit. The env shows `backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `wasmThreads:0`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`, `coreBuild:"pure-ts-esm"`. The streaming-lockstep reader walks atoms incrementally rather than indexing a whole sample table up front, so a half-present table surfaces as a bounded read error / early EOF and the Conversion returns a partial result without OOM. The shard records the graceful branch firing: `graceful-failure: pass=true, detail="operation returned partial/safe output and did not crash/hang"`, with `durationMs=208`. The runner reached this via `runRobustness`: the op did not throw and did not hang, so `verdict="graceful"` (runner.ts:1030), and the oracle then took the `gracefulAllowsReturnedOutput` branch (oracles.ts:2611-2612) because the scenario options carry `gracefulAllowOutput:true`.

**ffmpeg.wasm (passes, loses on tiebreaker).** Its `remux()` (src/engines/ffmpeg-wasm/adapter.ts:2031) is also genuine: it writes the input to MEMFS (line 2037), probes via `runInfo`, asserts container compatibility, then stream-copies with real ffmpeg args `['-i', name, '-map','0','-c','copy', out]` (line 2044), reads the output binary, and cleans up. ffmpeg's robust demuxer likewise survives the truncation and emits a partial mkv, scoring the same `graceful-failure: pass=true` with `durationMs=280`. It loses only because the correctness gate is identical (a tie on step 4a) and ffmpeg.wasm carries the heavier wasm core and the broader cross-origin-isolation footprint, while mediabunny clears step 4c (no COOP/COEP, no SAB, streaming, pure-TS-ESM) and is ~1.35x faster on the recorded duration.

The win is therefore architectural, not correctness-magnitude: on a malformed-input liveness gate both engines are equally "correct," and the tiebreaker is the lighter, isolation-free, streaming runtime.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed the same `graceful-failure` gate (partial/safe mkv, durationMs=280) but lost the contest: identical oracle strength (tie on 4a), heavier wasm core and COOP/COEP footprint, and ~1.35x slower recorded duration than mediabunny's 208 ms. A correct loser, not a defect.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest — its capabilities declare `containersOut:['mp4']` (adapter.ts:647); mp4box.js only remuxes to fragmented MP4, it has no Matroska writer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare output container 'mkv'". Honest — `containersOut:['mp4','webm','wav']` (adapter.ts:248,254); it can read matroska but cannot WRITE mkv.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'remux'". Honest — it is a parser/demuxer only with no muxer/remux op.
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'remux'". Honest — `remux:false` (adapter.ts:233); raw browser platform cannot losslessly rewrap encoded samples.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'remux'". Honest — demuxer/parser only; its `remux()` throws "no muxer" (adapter.ts:1047-1048).

All five NA verdicts are genuine capability gating (requires.containersOut/operations vs declared capabilities in registry.ts/runner.ts), not under-declaration to dodge a hard input.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/negative.ts:54-64` (case `neg_truncated_mp4_to_mkv`), materialized at lines 78-96. Options set `container:'mkv'` + `gracefulAllowOutput:true`; oracle `['graceful-failure']`; `timeoutMs=15_000`.
- **Fixture exists & is real:** `fixtures/media/remux_truncated_h264_50p.mp4`, 16 MB, present on disk — a real H.264/AAC MP4 truncated at 50%, not synthetic/empty/mock.
- **Oracle:** `gracefulFailure` at `src/core/oracles.ts:2586-2623`. For this scenario the relevant branch is 2611-2612 (`gracefulAllowsReturnedOutput` → PASS) gated by `options.gracefulAllowOutput===true` (2625-2628). The oracle is NOT trivially-always-pass: with `gracefulAllowOutput` absent, returning output for malformed input FAILs (2614-2617), and a timeout/hang FAILs in the runner (runner.ts:1044-1045). It is, however, a **liveness/robustness gate, not a goldens comparison** — no bit-exact, SSIM, or structural check.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1244-1260` — real `Output`+`runConversion` on `openInput(truncatedBytes)`; no canned output, no input→output passthrough, no golden short-circuit, no error-swallow (errors propagate; `finally` only disposes).
- **Verdict: WEAK-GATE.** Real fixture + real implementation, but the gate is a single robustness liveness check that explicitly permits ANY non-crashing partial output (`gracefulAllowOutput:true`). The PASS is genuine but weak: it proves "did not crash/hang/OOM and produced safe partial bytes," not that the mkv is correct. Both PASS engines clear it identically, so the winner is chosen on architectural tiebreakers, not correctness margin.
- **Cached note:** Both PASS results are `cached:true` ("cached previous PASS result"). Neither was re-run in this batch, so the timing (durationMs 208/280) and the partial-output behavior are reused, not freshly observed — staleness risk applies to both, symmetrically.

## Confidence & caveats

- **Confidence: medium.** The winner selection is sound under the decision procedure, but it rests on a tiebreaker rather than a correctness gap, because the gate is a robustness liveness check both engines pass equally.
- No `bench` block exists for any engine (robustness never benches), so the only timing signal is `durationMs`, which is not a measured median and is itself cached — treat the 1.35x duration gap as weak corroboration only.
- Both PASS results are cached; a fresh re-run could in principle shift the durationMs ordering, though the architectural tiebreaker (no COOP/COEP, streaming, hardware WebCodecs) would still favor mediabunny.
- The five NA_ENGINE verdicts were each cross-checked against the adapters' declared capabilities and found honest (no under-declaration).
