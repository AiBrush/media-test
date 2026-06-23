# robustness/fuzz_mp4_tail_truncated_demux

family: robustness | fixture asset: `fuzz_mp4_tail_truncated.mp4` (17 MB, present in fixtures/media/) | primaryMetric: durationMs (no bench{} block in shard) | passCount: 6 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **YES** — 6 of 7 engines PASS, every one of them on the *same single* `graceful-failure` oracle with identical detail "operation returned partial/safe output and did not crash/hang". Correctness is therefore a flat tie; the decision falls entirely to performance.
- Decisive factor: wall time (durationMs, the only per-engine timing in this shard). mediabunny completed in **79 ms**, the fastest of all 6 passers.
- Margin over runner-up: runner-up by wall is mp4box@2.3.0 at **114 ms** → mediabunny is **1.44x faster**. Versus the slowest passer (web-demuxer, 2856 ms) it is **36x faster**. Caveat: all six results are `cached:true` and the shard reports a single `durationMs` per engine (effectively n==1), so the timing margin is weak evidence; the correctness verdict (all six are equivalent partial/graceful passes) is the robust part.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 79 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | graceful-failure:true | 114 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 203 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | 1660 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 1913 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | graceful-failure:true | 2856 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | (none) | 5549 | n/a | n/a | n/a | platform engine: demux is NA — sample extends past end of file (truncated) |

Note: this shard carries no `bench{}` object, no `throughputRealtime`/`peakMemory`/`longtasks` metrics, and no `oracleOutcomes.measurements` — every passer reports exactly one boolean oracle and a single durationMs.

## Why the winner wins (deep technical)

The container is **MP4 (ISO BMFF) carrying H.264**, deliberately corrupted by truncating the file at 55% of its length — the "interrupted download" failure mode (scenario notes: "File cut at 55% (interrupted download): demux either yields partial+EOF or rejects cleanly"). The operation under test is **demux** (emit a packet table). With `gracefulAllowOutput:true`, the contract is symmetric: an engine may either reject cleanly OR emit a partial packet table up to the EOF, as long as it does not crash, hang, or OOM. Because all six passers satisfy that same contract with the same outcome, there is no correctness separation on the oracle ladder — the gate is a single robustness `graceful-failure` check, which sits at the weakest (smoke/robustness) tier, not a bit-exact / structural / perceptual gate. So the win is a *performance* win on top of an *equivalent* correctness floor.

Mechanistically, mediabunny is fastest because its demux path is a lazy, streaming packet iterator that stops naturally at the truncation point. The adapter (src/engines/mediabunny/adapter.ts:1152-1183 `demux`) opens the input and, per track, drains `new EncodedPacketSink(track).packets(undefined, undefined, { verifyKeyPackets: true })` (adapter.ts:1162-1167), pushing `{ size, ptsUs, dtsUs, keyframe }` per packet (adapter.ts:1169-1175). On a tail-truncated MP4 the moov/sample-table at the front is intact, so the sample sizes/offsets are known, but the mdat is short; mediabunny's sink yields packets only while bytes are available and terminates the async iterator at the truncated boundary rather than faulting on the missing tail. The whole thing is wrapped in `try { ... } finally { mbInput.dispose() }` (adapter.ts:1153-1182), so resources are released regardless. Its WebCodecs-prefer-hardware config (env.configUsed.backend `webcodecs`, hwAccel `prefer-hardware`, coopCoep `not-required`, sharedArrayBuffer false) is largely irrelevant for demux (no decode happens here), but the pure-TS-ESM core and streaming-lockstep pipeline mean no wasm boot and no whole-file decode — hence 79 ms.

By contrast the two slow wasm/heavyweight passers pay fixed startup or full-buffer costs: ffmpeg.wasm (203 ms) boots a wasm demuxer; remotion-media-parser (1660 ms, `streaming` cpu-js `full-parse(demux)`) and remotion-webcodecs (1913 ms) do a full JS parse; web-demuxer (2856 ms) runs an FFmpeg-in-wasm libavformat demux. mp4box (114 ms, `pure-js` `whole-file-append`) is close because it is also pure-JS, but it appends and re-parses the whole buffer (`whole-file-append(MP4BoxBuffer+fileStart)`) rather than lazily iterating, leaving it 1.44x behind mediabunny's streaming sink.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS but lost on speed: 114 ms vs 79 ms (1.44x slower). Its `pure-js` `whole-file-append(MP4BoxBuffer+fileStart)` pipeline buffers and re-parses the entire 17 MB rather than lazily streaming packets to EOF. Correctness identical (graceful-failure:true).
- **ffmpeg.wasm@0.12.15** — PASS but 203 ms (2.6x slower); wasm demuxer boot cost dominates a sub-second demux. Same single oracle.
- **remotion-media-parser@4.0.479** — PASS but 1660 ms (21x slower); `cpu-js streaming full-parse(demux)` does a complete JS structural parse of the file.
- **remotion-webcodecs@4.0.479** — PASS but 1913 ms (24x slower); `streaming-backpressure` convert pipeline with worker setup overhead for what is just a demux.
- **web-demuxer@4.0.0** — PASS but 2856 ms (36x slower), the slowest passer; libavformat-in-wasm demux with heavy init/teardown.
- **platform@chrome-149** — NA_ENGINE: "demux is NA — sample extends past end of file (truncated)". This is an honest runtime limitation, not an under-declared capability: the WebCodecs/MediaSource-style platform demux path needs a fully-present sample whose declared size lies within the file; when the last sample's size runs past the truncated EOF it cannot satisfy that and declares NA rather than fabricate or fault. The other six engines win precisely because they stream packet-by-packet and stop at EOF. NA looks genuine.

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:266-274 — `id: 'fuzz_mp4_tail_truncated_demux'`, `asset: 'fuzz_mp4_tail_truncated.mp4'`, `op: 'demux'`, `containersIn:['mp4']`, `videoCodecs:['h264']`, `options:{ gracefulAllowOutput: true }`, notes "File cut at 55% (interrupted download): demux either yields partial+EOF or rejects cleanly." The notes are deliberately written to avoid the graceful/threw/rejected/errored "trap tokens" (per the §0.1 comment at index.ts:259-264), so the oracle cannot be passed by prose alone — the verdict rests on real output inference, not the case self-describing success.
- Fixture: `fuzz_mp4_tail_truncated.mp4` exists in fixtures/media/ at 17 MB (stat confirmed). It is a real truncated MP4 derived from a real asset, not synthetic/empty/mock.
- Oracle: src/core/oracles.ts:2586-2628 `gracefulFailure`. For a robustness scenario with `gracefulAllowOutput:true` it PASSes if the op either produced no output (caught throw) OR returned partial/safe output without crash/hang (oracles.ts:2607-2612). It is a real branch over `ctx.output/metadata/demux/frames`, not unconditional — it FAILs (oracles.ts:2614-2617) if malformed input yields output when `gracefulAllowOutput` is NOT set. The token-marker path (oracles.ts:2590-2600) is gated on an explicit `signal:` marker absent from this scenario's notes.
- Winner adapter: src/engines/mediabunny/adapter.ts:1152-1183 — genuine: opens input, drains real `EncodedPacketSink.packets(..., { verifyKeyPackets: true })`, builds the packet table from real `byteLength`/`microsecondTimestamp`/`type`, disposes in `finally`. No canned output, no copy-input-as-output, no golden short-circuit, no error-swallow-as-success (errors propagate to the runner, which routes them through the oracle).
- Cached note: ALL seven results are `cached:true` (mediabunny startedAt 2026-06-22T14:11:11Z). The PASS is reused, not re-run in this report pass — timing especially is stale. The correctness branch (graceful partial demux) is stable across runs, so staleness mainly weakens the speed margin, not the winner identity.
- Verdict: **WEAK-GATE**. The implementation, fixture, and oracle are all real (not a cheat), but the gate is a single smoke-tier `graceful-failure` boolean with `gracefulAllowOutput:true` — six engines pass it identically, so the "win" is decided by a single uncalibrated durationMs rather than any correctness-strength oracle. PASS is genuine but not strong.

## Confidence & caveats

- Confidence: **medium**. Winner identity (fastest of equivalently-correct passers) is clear, and the implementation/fixture/oracle are verified real. But: (1) the gate is smoke-tier and all six passers are tied on it; (2) the only discriminator is a single cached durationMs (n==1, no mad/p95/bench), so the 1.44x margin over mp4box is weak evidence; (3) all results are cached, so timings are stale. If re-run with proper bench sampling, mp4box (114 ms, also pure-JS) could plausibly close or invert the gap. The correctness conclusion (mediabunny demuxes truncated MP4 gracefully, platform honestly cannot) is solid; the "best" ranking among the six is performance-only and provisional.
