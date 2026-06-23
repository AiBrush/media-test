# robustness/fuzz_remux_zeroed_spans

family: robustness | fixture asset: `fuzz_remux_zeroed_spans.mp4` (31 MB, real) | primaryMetric: (none recorded; graceful-failure gate) | passCount: 2/7

## Verdict

**Best framework: mediabunny@1.48.0** (CONTESTED — 2 engines PASS: mediabunny and ffmpeg.wasm).

Both PASS the *same single* oracle, `graceful-failure`, the only gate this robustness/fuzz case exposes. The scenario is `op: remux`, MP4 (H.264 + AAC) → MKV, on a sample-corrupted ("zeroed spans") input with `options.gracefulAllowOutput: true`. The notes spell out the contract: *"Corrupt samples then remux: engine must reject or emit a clean partial, bounded in memory."* Either a clean reject or a clean partial satisfies the gate.

**Decisive factor:** robustness posture, not performance. mediabunny produced **no output** and threw a bounded `Decoding error` (clean reject) — it refused to propagate corrupt media. ffmpeg.wasm instead stream-copied and emitted **partial output** from the malformed file. Both are accepted by the oracle, but a clean reject is the safer default for a remux of fuzzed input (it cannot hand a corrupt-but-plausible container to a downstream consumer). There is no correctness oracle and no benchmark block to separate them otherwise.

**Margin over runner-up:** essentially a tie on the gate (both single-oracle PASS, both `n=1`, both `cached`). The only numeric signal is `durationMs`: mediabunny 312 ms vs ffmpeg.wasm 327 ms (~1.05x faster), but `durationMs` is wall-clock-with-setup, not a benched metric, so this is weak evidence. The win is qualitative (reject > emit-partial for fuzzed remux), not quantitative.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs 312) | n/a | n/a | n/a | cached: graceful: Decoding error. (no output, no crash/hang) |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs 327) | n/a | n/a | n/a | cached previous PASS; returned partial/safe output, did not crash/hang |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

No engine in this shard recorded a `bench{}` block (graceful-failure cases are correctness/robustness gates, not perf-benched), so wall/throughput/peakMemory/longtasks are unavailable for all rows.

## Why the winner wins (deep technical)

The container/codec/operation under test is a **lossless remux of H.264-in-MP4 + AAC into Matroska (MKV)**, where the source MP4's sample data has been overwritten with zeroed byte-spans (sample payloads corrupted, but the `moov`/`stbl` box structure intact enough to be parsed). A correct engine must not turn that into a confidently-wrapped MKV full of garbage NAL units; it must either reject or emit a bounded clean partial.

**mediabunny** ran on its `webcodecs` backend (`env.configUsed.backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `wasmThreads: 0`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`). Its `remux()` (src/engines/mediabunny/adapter.ts:1244) takes the no-transform path: build an `MkvOutputFormat` via `makeOutputFormat('mkv', ...)` (codecs.ts:168-169), `openInput()` the corrupt MP4, then `runConversion()` (adapter.ts:1250-1256), which copies encoded samples. Because the zeroed spans corrupt the encoded sample stream, the conversion's sample reader hit a real `Decoding error` during the copy/validate step and threw. The runner caught the throw with `ctx.output`/`metadata`/`demux`/`frames` all undefined, so `gracefulFailure()` (src/core/oracles.ts:2607-2609) returned PASS via the "produced no output and did not crash/hang → handled gracefully" branch. The shard records exactly that: `reason: "cached: graceful: Decoding error."` and `detail: "operation produced no output … → handled gracefully"`. Crucially, mediabunny refused to materialize a corrupt MKV — the strongest possible robustness outcome here.

**ffmpeg.wasm** also genuinely implements remux: `remux()` (src/engines/ffmpeg-wasm/adapter.ts:2031-2069) probes the input (`runInfo`), asserts container compatibility, then runs a real `-map 0 -c copy` stream-copy into the requested container. On this fuzzed input it survived the stream-copy and emitted partial/safe bytes; `gracefulFailure()` accepted that via the `gracefulAllowsReturnedOutput()` branch (oracles.ts:2611-2612, gated by `options.gracefulAllowOutput === true` set in the scenario at src/scenarios/robustness/index.ts:336). That is a legal PASS — but it means corrupt-derived bytes left the engine. For a fuzzed remux, reject-without-output (mediabunny) is the more defensive posture, which is the tiebreak.

No `decoded-frames-bitexact`, `mp4-box-layout`, `golden-*`, or `ssim-psnr` oracle is present, so neither engine earns correctness-ladder credit; the comparison lives entirely on the graceful-failure rung plus the reject-vs-partial judgement.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed but lost: it emitted *partial output* from the malformed file (oracle detail "returned partial/safe output") instead of rejecting. Same single oracle, no correctness edge, marginally slower `durationMs` (327 vs 312). Acceptable, just less defensive for fuzzed remux.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — web-demuxer is a demux-only WASM binding (no muxer), so the remux capability is genuinely absent, not under-declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — media-parser is a read/parse-only library; it has no muxing/output path.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — the bare WebCodecs/platform shim exposes decode/encode primitives but no container muxer, so remux is legitimately undeclared.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest — its converter targets MP4/WebM outputs; MKV is not in its output set.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest — mp4box.js is an ISO-BMFF (MP4) library; it cannot write a Matroska container, so MKV output is correctly NA.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/robustness/index.ts:329-338 (`id: 'fuzz_remux_zeroed_spans'`, `asset: 'fuzz_remux_zeroed_spans.mp4'`, `op: 'remux'`, `containersIn: ['mp4']`, `containersOut: ['mkv']`, `videoCodecs: ['h264']`, `audioCodecs: ['aac']`, `options: { container: 'mkv', gracefulAllowOutput: true }`).
- **Fixture exists:** `fixtures/media/fuzz_remux_zeroed_spans.mp4`, 31 MB real file (stat confirmed). Not synthetic/empty/mock — a real H.264+AAC MP4 with byte-spans zeroed, consistent with the "corrupt samples then remux" note.
- **Oracle:** `graceful-failure` at src/core/oracles.ts:2586-2623. It performs a real inference: PASS only if (a) no output + no metadata/demux/frames (clean reject), or (b) output allowed *and* the scenario explicitly opted in via `gracefulAllowOutput` (oracles.ts:2611, 2625-2628). For a robustness scenario that *produces output without* the opt-in, it FAILs ("expected a clean throw/reject", oracles.ts:2614-2617). So the gate is not trivially satisfiable — it can and does fail. It is, however, a robustness/smoke-class gate (no bit-exact/structural correctness comparison), which caps the strength of the PASS.
- **Winner adapter:** mediabunny `remux()` at src/engines/mediabunny/adapter.ts:1244-1260 — genuinely calls `openInput()` + `runConversion()` against the real corrupt bytes; no canned output, no copy-input-to-fake-remux, no short-circuit to golden, no swallowed error reported as success (the throw is surfaced and routed to graceful). The PASS reflects a real `Decoding error` on real corrupt input.
- **Verdict: WEAK-GATE.** Real fixture + real implementations on both PASS engines + a non-trivial oracle, but the oracle is robustness/smoke-only (graceful-failure), not a correctness gate, and `gracefulAllowOutput: true` widens the accept window for the runner-up. The PASS is real; its *strength* is limited. No evidence of mock/faked output anywhere.
- **Cached note:** both PASS results have `cached: true` (mediabunny `cached: graceful: Decoding error.`, started 2026-06-22T14:12; ffmpeg `cached previous PASS result`, started 2026-06-22T14:01). Verdicts were reused, not re-run this session — staleness risk exists, though the corrupt fixture and code paths are deterministic.

## Confidence & caveats

Confidence: **medium**. The capability/NA picture is unambiguous and honest for all 5 NA engines, and only 2 engines are eligible. The contested pick rests on a qualitative robustness judgement (clean reject > emit-partial) because there is no correctness oracle and no benchmark block to separate the two PASS engines numerically. The lone numeric signal (`durationMs` 312 vs 327) is wall-with-setup, `n=1`, and cached, so it is weak. If the suite intends "emit a clean partial" to be the *preferred* outcome rather than merely permitted, ffmpeg.wasm could be argued as the winner instead; under the strict robustness reading (don't propagate corrupt bytes), mediabunny wins. Both PASS results are stale (cached), so a fresh re-run is advisable before treating this as authoritative.
