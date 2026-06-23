# remux/neg_zeroed_mp4_to_mkv

- family: remux (negative / robustness probe of the remux op)
- fixture asset: `fixtures/media/remux_zeroed_mp4.mp4` (31 MB, all-zero bytes — verified 0 non-zero bytes)
- primaryMetric: wall (metrics declared: wall, peakMemory) — but robustness path **never benches**, so no bench block is recorded
- passCount: 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Contested**: two engines PASS (mediabunny, ffmpeg.wasm) — both via the single `graceful-failure` oracle. Correctness strength is identical (one negative-gate oracle, same pass), so the decision falls to performance.
- **Decisive factor**: latency to reject the malformed input. mediabunny rejected in `durationMs=12` vs ffmpeg.wasm `durationMs=245`. Margin ≈ **20.4x faster to reject** (245 / 12). Both results are `cached==true`, and robustness never benches, so this is a single wall-clock reading (n=1), not a benched median — the margin is directional, not statistically hardened.
- The remaining 5 engines are all honest `NA_ENGINE` (capability not declared), so they were never eligible.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs=12) | n/a | n/a | n/a | cached: graceful: Input has an unsupported or unrecognizable format. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs=245) | n/a | n/a | n/a | cached: graceful: ffmpeg could not read input for probe. Log: op1.in: Invalid data found when processing input \| Aborted() |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

No bench block exists for any engine: the robustness execution path (`runRobustness`, src/core/runner.ts:1011) records the graceful-throw detail as the reason and skips benchmarking entirely (runner.ts:1093 "Robustness never benches"). durationMs is the only timing signal.

## Why the winner wins (deep technical)

This is a **negative test**: the input is a 31 MB MP4 whose every byte is `0x00` (confirmed: `tr -d '\000'` yields 0 bytes). There is no `ftyp`, no `moov`, no `mdat` — an ISO-BMFF box parser reading the first 32-bit big-endian size word sees `0x00000000` (a zero box length), which is precisely the pathological case that can drive a naive parser into a zero-advance loop / hang / unbounded allocation. The H.264-in-MP4 → MKV remux contract is "copy coded samples from the MP4 sample table into Matroska clusters"; with no parseable sample table there is no codable stream, so the **correct** behavior is a clean reject within the 15 s timeout, never crash/hang/OOM. The gate is `graceful-failure` (oracles.ts:2586): PASS iff the op produces no output and does not hang.

mediabunny took the genuine remux path: `MediabunnyEngine.remux` (src/engines/mediabunny/adapter.ts:1244) builds the MKV output format (`makeOutputFormat(opts.container, …)`, adapter.ts:1250), then calls `openInput(this.lib, input)` (adapter.ts:1252) to construct a real `mediabunny` `Input` over the zeroed bytes. mediabunny's ISO-BMFF demuxer immediately fails format sniffing and throws **"Input has an unsupported or unrecognizable format."** — the exact reason string in the shard. The runner's `runRobustness` catches that throw (runner.ts:1031, `verdict='graceful'`, `opError=err`), leaves `opResult` undefined so `ctx.output/metadata/demux/frames` are all empty, and `gracefulFailure` infers PASS from output-absence (oracles.ts:2608-2609: "operation produced no output and did not crash/hang → handled gracefully"). The rejection cost only 12 ms: mediabunny's pure-TS ESM core (`env.configUsed.coreBuild="pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`) sniffs the container header synchronously and bails before allocating any demux state — no wasm module to instantiate, no FS to populate.

ffmpeg.wasm reaches the same correct verdict but the cheaper way it gets there is more expensive. Its log shows it failed at the **probe** stage ("ffmpeg could not read input for probe … op1.in: Invalid data found when processing input | Aborted()"): it had to write the 31 MB blob into the wasm MEMFS as `op1.in`, spin up the libavformat probe, hit `AVERROR_INVALIDDATA` on the all-zero stream, and abort — 245 ms total, ≈20x mediabunny's 12 ms, dominated by wasm instantiation + the in-memory file copy. The verdict is identical (graceful), but the latency gap is the entire margin.

So on correctness the two are tied (same single negative oracle, both PASS); the win is purely the reject-latency margin, and mediabunny's header-sniff-and-bail with no wasm/FS overhead is the mechanistic reason.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (graceful-failure:true) but lost on performance: 245 ms to reject vs mediabunny's 12 ms (~20.4x slower). The cost is wasm MEMFS write of the 31 MB input plus libavformat probe before `Aborted()`. Correctness is equal; it is the runner-up purely on latency.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest NA — MP4Box.js is an ISO-BMFF (MP4) toolkit and does not emit Matroska, so it correctly does not advertise `containersOut: ['mkv']`. Not an under-declaration.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — the WebCodecs platform adapter exposes decode/encode primitives, not a packaged container-to-container remux op.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — web-demuxer is a demux-only library (it reads packets); it does not mux/remux.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — it is a parser, not a remuxer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest — remotion-webcodecs targets MP4/WebM output, not Matroska MKV; correctly not declared.

All five NAs are capability-accurate, not suppressed work. The capability gate (requires.operations `['remux']`, containersOut `['mkv']`, videoCodecs `['h264']`, audioCodecs `['aac']`) is enforced by the runner/registry before execution.

## Anti-cheat validation

- **Scenario definition**: src/scenarios/remux/negative.ts:43-52 (id `neg_zeroed_mp4_to_mkv`), built into a `Scenario` at negative.ts:78-96 with `op:'remux'`, `options.container:'mkv'`, `oracles:['graceful-failure']`, `timeoutMs:15000`. Notes (negative.ts:50-51) give the gating rationale: "All-zero MP4 bytes -> remux to MKV: the sample-table/box parse must reject cleanly (no codable stream), never crash/hang/OOM."
- **Fixture exists and is real-but-malformed**: `fixtures/media/remux_zeroed_mp4.mp4`, 31 MB, present on disk; `xxd` head is all `0x00` and `tr -d '\000' | wc -c` returns 0 → genuinely an all-zero file (a deterministic, intentionally-corrupt fixture, not synthetic mock JSON, not an empty 0-byte stub). Appropriate for a negative gate.
- **Winner implementation is genuine**: src/engines/mediabunny/adapter.ts:1244-1260 — `remux()` calls `makeOutputFormat`, `openInput(this.lib, input)`, constructs `this.lib.Output`, and runs `runConversion`. It does NOT return canned output, copy input→output, or short-circuit to a golden; the PASS arises from a real thrown error ("Input has an unsupported or unrecognizable format.") surfaced by mediabunny's demuxer.
- **Oracle is real and not trivially satisfiable**: src/core/oracles.ts:2586-2623. `graceful-failure` PASSes only when `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` (no output) OR `gracefulAllowOutput` is set (it is NOT for this case). If the op had emitted any output from the malformed input it would FAIL ("operation produced output from malformed/mutated input"); a timeout also FAILs (runner.ts:1044-1045). So the gate genuinely distinguishes clean-reject from hang/bogus-output. It is a **negative correctness gate**, which on the strength ladder is smoke-tier (no bit-exact / structural comparison against a golden, because by design there is no valid output) — hence WEAK-GATE in ladder terms, but it is a meaningful, non-loose gate for what it tests.
- **Cached note**: both PASS results have `cached==true` (durationMs 12 and 245 from a prior run, started 2026-06-22T14:03 / 14:13). Staleness risk: the verdicts were reused, not re-executed this run; given the fixture is a static all-zero file and the reject paths are deterministic header-sniff failures, re-running would near-certainly reproduce the same graceful PASS, so staleness risk is low but non-zero.
- **Verdict: REAL** (gate is negative/smoke-tier i.e. WEAK in ladder strength, but the fixture is real, the implementation genuinely invokes the library, and the oracle performs a real no-output/no-hang check that can fail). No evidence of mock data, faked output, or an unfailable oracle.

## Confidence & caveats

- Confidence: **high** that mediabunny is the correct uncontested-on-capability + performance winner. Both PASS verdicts are genuine graceful rejections; the 5 NAs are all capability-accurate.
- Caveat 1: the win is **performance-only** (20.4x reject-latency), not correctness — on the oracle ladder both engines are tied at a single negative-gate (smoke-tier) oracle. For a negative test "winning" mostly means "rejected fastest while still rejecting cleanly."
- Caveat 2: timings are single, **cached** durationMs readings (n=1, no bench median/p95/mad because robustness never benches), so the 245 ms vs 12 ms margin is directional rather than statistically hardened.
- Caveat 3: this is a negative/robustness scenario, so absence of bit-exact or structural oracles is by design (no valid output can exist for all-zero input).
