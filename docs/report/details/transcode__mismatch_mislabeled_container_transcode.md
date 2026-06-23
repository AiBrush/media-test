# transcode/mismatch_mislabeled_container_transcode

family: transcode | fixture asset: `h264_ts.ts` (MPEG-TS payload deliberately mislabeled as `mp4` input) | primaryMetric: wall | passCount: 3/7

## Verdict

- Best framework: **mediabunny@1.48.0** (engineId `mediabunny`).
- **CONTESTED**: 3 engines PASS (mediabunny, remotion-webcodecs, ffmpeg.wasm), all on the SAME single oracle `graceful-failure`. No correctness-strength separation exists between them (identical oracle ladder position: smoke/robustness gate), so the decision falls to **performance / wall**.
- Decisive factor: **wall median**. mediabunny `durationMs=701` vs remotion-webcodecs `932` vs ffmpeg.wasm `12157`.
- Margin over runner-up (remotion-webcodecs): **1.33x faster wall** (932/701). Over ffmpeg.wasm: **17.3x faster wall** (12157/701).
- Caveat: all three PASS results are `cached==true` (reused, not freshly re-run); and wall here is `durationMs` (n is not exposed as a bench distribution in this shard), so the perf margin is single-observation evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 701 (cached) | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 932 (cached) | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 12157 (cached) | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | 3 | n/a | n/a | n/a | platform engine: transcode is NA — source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve/copy audio |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare operation 'transcode' |

(No `bench{}` block is present for any engine in this shard; `throughputRealtime`/`peakMemory`/`longtasks` were not collected — the scenario declares only `metrics: ['wall']`. Values shown are `durationMs`.)

## Why the winner wins (deep technical)

This is a **robustness / negative** scenario, not a fidelity transcode. The input `h264_ts.ts` is a 4.6 MB real MPEG-2 Transport Stream (verified: 0x47 sync byte at offsets 0, 188, 376, 564, 752 — canonical 188-byte TS packetization; PMT/PES carry H.264 video + AAC audio) that is **deliberately presented to the engine as `containersIn: ['mp4']`** (`src/scenarios/transcode/index.ts:1591-1595`). The scenario sets `options.gracefulAllowOutput: true`, so the contract (per `notes`, index.ts:1596-1599) is: detect the container/codec mismatch and **fail gracefully — or correctly transcode if it sniffs the real format — but never crash/hang/OOM**. The only gate is `graceful-failure`.

The `graceful-failure` oracle (`src/core/oracles.ts:2586-2628`) PASSes here via the `gracefulAllowsReturnedOutput` branch (oracles.ts:2611-2612, 2625-2628): because the scenario sets `gracefulAllowOutput===true`, an engine that returns *partial/safe* output without crashing is accepted ("operation returned partial/safe output and did not crash/hang"). All three winners hit exactly that branch — the oracle detail string in the shard is verbatim that message for all three.

Mechanistically, why mediabunny is fastest: its `transcode` (`src/engines/mediabunny/adapter.ts:1271-1322`) opens the input through `openInput` and drives mediabunny's `Conversion` over a **streaming-lockstep WebCodecs pipeline** with `hwAccel: 'prefer-hardware'` on the Apple M1 Max VideoToolbox path (env.configUsed: `backend: 'webcodecs'`, `pipeline: 'streaming-lockstep'`, `coreBuild: 'pure-ts-esm'`, `coopCoep: 'not-required'`). When the input bytes do not parse as the declared MP4 (no `ftyp`/`moov`; the bytes are TS), mediabunny's demux short-circuits quickly and the conversion yields safe partial output rather than grinding — landing at **701 ms**. There is no `wasm` codec bootstrap on the critical path (`wasmThreads: 0`, pure-TS ESM core), so there is no multi-MB module fetch/instantiate tax.

remotion-webcodecs (`932 ms`) takes essentially the same WebCodecs route (env: `backend: 'webcodecs'`, `pipeline: 'streaming-backpressure'`, `hwAccel: 'prefer-hardware(+software fallback)'`) and also produces safe partial output, but pays ~231 ms more — consistent with its backpressure queue (`waitForQueueToBeLessThan`) and offscreencanvas-2d pixel path plus its adapter fast-path probing (it even advertises a `compatible MOV->MP4 ftyp rewrite` fast path that does not apply to a TS payload, so it falls through to the slower generic path).

ffmpeg.wasm (`12157 ms`) is **17.3x slower** because it must instantiate the single-threaded WASM core (`wasmThreads: 0`, no SharedArrayBuffer/COOP-COEP), write the 4.6 MB fixture into the MEMFS virtual filesystem, and let libavformat probe/attempt demux of the mislabeled stream — the full wasm cold-start + FS round-trip dominates even though the operation correctly degrades to a graceful result. Same oracle, same correctness rung; it simply loses decisively on wall.

Since correctness strength is identical (one smoke-tier oracle each), perf is the tiebreak and mediabunny wins on wall by 1.33x over the runner-up; the WebCodecs/hardware backend with no wasm bootstrap is the concrete reason.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, but lost on perf: wall `932 ms` vs `701 ms` (**1.33x slower**). Same `graceful-failure` oracle, same WebCodecs backend; extra cost from streaming-backpressure queue + offscreen-2d pixel path and inapplicable MOV->MP4 fast-path probing on a TS payload.
- **ffmpeg.wasm@0.12.15** — PASS, but lost on perf badly: wall `12157 ms` vs `701 ms` (**17.3x slower**). Single-thread WASM cold-start + MEMFS write of the 4.6 MB fixture + libavformat probe dominate wall.
- **platform@chrome-149** — NA_ENGINE (honest). Reason: the MediaRecorder canvas-capture encode path (`encode: <video>→canvas→MediaRecorder(out)`) cannot preserve/copy the source's audio track, so transcode is declared NA for any audio-bearing input. This is a real architectural limitation of the canvas-capture approach, not an under-declared capability.
- **web-demuxer@4.0.0** — NA_ENGINE (honest). Does not declare the `transcode` operation; it is a demux-only engine. Genuine capability gap.
- **remotion-media-parser@4.0.479** — NA_ENGINE (honest). Parser-only; does not declare `transcode`. Genuine.
- **mp4box@2.3.0** — NA_ENGINE (honest). MP4 box parsing/remux library; does not declare `transcode`. Genuine.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:1590-1600` (id `mismatch_mislabeled_container_transcode`); generic negative-scenario builder at `index.ts:1603-1620` (op `transcode`, oracle `graceful-failure`, metric `wall`).
- Fixture: `fixtures/media/h264_ts.ts` — **EXISTS**, 4.6 MB, REAL MPEG-TS (verified 0x47 sync bytes at 188-byte cadence; not synthetic/empty/mock). The mislabel is intentional: `containersIn: ['mp4']` over a TS payload (index.ts:1592), which IS the test.
- Oracle: `graceful-failure` at `src/core/oracles.ts:2586-2628`; PASS branch for this scenario is `gracefulAllowsReturnedOutput` (oracles.ts:2611-2612, 2625-2628), enabled by `options.gracefulAllowOutput: true`.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1271-1322` (`transcode`) — genuinely calls `openInput`, constructs a real `Output` + `Conversion`, and runs `runConversion` (adapter.ts:1307). It does NOT return canned output, copy input→output, short-circuit to a golden, or swallow errors to fake success; it throws on truly invalid dimensions/missing tracks (adapter.ts:1280, 1295, 1298).
- Verdict: **WEAK-GATE**. The implementation and fixture are real, but the gating oracle is a robustness smoke gate: with `gracefulAllowOutput: true`, ANY non-crashing return passes (oracles.ts:2611-2612). It does not assert that the produced bytes are a correct H.264-in-MP4 transcode of the TS source, nor that the engine actually detected the mismatch — only that it didn't crash/hang. So the PASS is genuine but correctness-weak. This is by design for an A.16 negative case (it is correct that there is no golden-fidelity assertion), but it means the winner is decided purely on wall time, not transcode quality.
- Cached note: **all 3 PASS results are `cached==true`** (mediabunny "cached previous PASS result", same for remotion-webcodecs and ffmpeg.wasm). Evidence was reused, not freshly re-run; staleness risk applies to both the PASS verdicts and the wall numbers used for the tiebreak.

## Confidence & caveats

- Confidence: **medium**. The winner pick is unambiguous on the stated decision procedure (correctness tied → wall median, mediabunny clearly lowest), and the fixture+adapter+oracle are real.
- Caveats: (1) the gate is a robustness smoke oracle (WEAK-GATE) — no fidelity/correctness comparison, so the "win" is a perf win on a degenerate-input path, not a quality win; (2) all three PASS rows are cached, so the 1.33x/17.3x wall margins are single-observation, possibly-stale numbers with no `bench` distribution (no n/mad/p95) to gauge spread; (3) `peakMemory`/`longtasks`/`throughputRealtime` were never collected for this scenario (metrics: ['wall'] only), so no secondary perf tiebreak is available; (4) the platform NA and the three engine NAs are all honest capability gaps, not suppressed wins.
