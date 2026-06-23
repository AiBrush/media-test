# robustness/fuzz_mux_target_corrupt_remux

family: robustness | fixture asset: `fuzz_mux_target_corrupt_remux.mp4` (31 MB, exists in fixtures/media/) | op: remux (MP4 -> FRAGMENTED MP4) | codecs: H.264 video + AAC audio | oracle gate: `graceful-failure` (single) | primaryMetric: wall (metrics: wall, peakMemory) | passCount: 4 / 7

## Verdict

- Best framework: **mediabunny@1.48.0**.
- Contested: **YES** — 4 of 7 engines PASS (mediabunny, mp4box, ffmpeg.wasm, remotion-webcodecs). All 3 non-PASS are `NA_ENGINE` (do not declare `remux`).
- Decisive factor: all four winners satisfy the *same* single weak gate (`graceful-failure`), so correctness strength is a tie at the oracle level. The tie breaks on (1) **strictness of the graceful behavior** and (2) **performance**. mediabunny is the only engine that took the *strongest* graceful path — a clean hard reject ("operation produced **no output** ... → handled gracefully", `reason: "cached: graceful: Decoding error."`) — instead of leaning on the scenario's `gracefulAllowOutput:true` escape hatch to emit partial output. It is also overwhelmingly the fastest.
- Margin over runner-up: mediabunny 45 ms wall vs mp4box 230 ms (**~5.1x faster**), vs remotion-webcodecs 2777 ms (**~61.7x faster**), vs ffmpeg.wasm 446 ms (**~9.9x faster**). No `bench{}` block was emitted for any engine in this shard (robustness rows record only `durationMs`); peakMemory/throughputRealtime/longtasks are therefore unavailable. n=1 per engine (cached single run) — weak statistical evidence; the win is decided by *kind of behavior*, not by a tight benchmark.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true (no output) | 45 | n/a | n/a | n/a | cached: graceful: Decoding error. |
| mp4box@2.3.0 | PASS | graceful-failure:true (partial output) | 230 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true (partial output) | 446 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true (partial output) | 2777 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

(No `bench{}` object is present in any entry — robustness scenarios persist only `durationMs`. All four PASS rows are `cached:true`.)

## Why the winner wins (deep technical)

The scenario (src/scenarios/robustness/index.ts:865-878) is a §A.16 "mux-target fuzz": a real H.264+AAC MP4 whose **samples have been corrupted**, then fed to `remux` with `options:{ container:'mp4', fragmented:true, gracefulAllowOutput:true }`. The contract: the muxer/fragmenter "must reject or emit a clean partial, never balloon memory." This exercises the segment/fragmentation output path (frag_keyframe / fMP4 / CMAF), which is distinct from a faststart rewrite.

The gate is `graceful-failure` (src/core/oracles.ts:2586-2623). For a robustness scenario it PASSes in two ways: (a) the op produced **no output at all** (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`) -> "handled gracefully" (oracles.ts:2608-2610); or (b) the op returned output BUT the scenario sets `gracefulAllowOutput:true` (oracles.ts:2611-2612, gate at oracles.ts:2625-2628) -> "returned partial/safe output". The runner (src/core/runner.ts:1028-1042) treats a clean throw/reject as the SUCCESS condition: a throw leaves `opResult` undefined, so the empty output fields drive the path-(a) PASS at runner.ts:1049-1050.

mediabunny is the only engine that took path (a). Its adapter attempted the real remux, the corrupt sample table tripped the codec/demux layer, and it threw **"Decoding error."** (shard `reason:"cached: graceful: Decoding error."`). The runner caught that throw, set `verdict='graceful'` with no output, and the oracle returned "operation produced no output and did not crash/hang -> handled gracefully". This is the *defensive ideal* for a corrupt-input fuzz: refuse to manufacture a fragmented MP4 from bytes it cannot validate, rather than ship a half-built segment a downstream player would choke on. mediabunny's pipeline is streaming-lockstep WebCodecs (env.configUsed.backend `webcodecs`, hwAccel `prefer-hardware`, `coopCoep:not-required`, pure-ts-esm core), and the reject surfaced essentially instantly: **45 ms** — it failed fast on the bad sample descriptor instead of streaming the whole 31 MB through a fragmenter.

The other three PASS engines satisfy only the *weaker* branch (b): they each returned partial output and pass solely because `gracefulAllowOutput:true` whitelists that. mp4box runs the pure-JS fragmenter (env.configUsed `backend:pure-js`, `pipeline:whole-file-append(MP4BoxBuffer+fileStart)`, `discardMdatDataDemuxRemux:false`); its remux path (src/engines/mp4box/adapter.ts:619-681, `setSegmentOptions`/`onSegment`) emitted whatever segments it could assemble before the corruption, in 230 ms. ffmpeg.wasm stream-copies under `-c copy` with `-movflags frag_keyframe+empty_moov+default_base_moof` (src/engines/ffmpeg-wasm/adapter.ts:2044-2050) and produced a partial fragmented file in 446 ms (single-thread wasm, no SAB). remotion-webcodecs took the slowest path at 2777 ms — its streaming-backpressure convert pipeline (env.configUsed `pipeline:streaming-backpressure`, `writer:bufferWriter`) churned through far more of the file before yielding partial output. mediabunny therefore wins on both axes that matter here: it chose the stricter/cleaner failure mode AND was 5x-62x faster than every engine that merely tolerated the corruption.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS but weaker: returned PARTIAL output (passes only via `gracefulAllowOutput:true`, oracles.ts:2611), not a clean reject. 230 ms = ~5.1x slower than mediabunny's 45 ms. Did not "reject"; emitted a partial fragmented MP4 from corrupt samples.
- **ffmpeg.wasm@0.12.15** — PASS but weaker: same partial-output branch; single-thread wasm stream-copy with frag_keyframe (adapter.ts:2044-2050) produced partial output in 446 ms = ~9.9x slower than mediabunny.
- **remotion-webcodecs@4.0.479** — PASS but weakest of the four on performance: partial output via the `gracefulAllowOutput` branch at **2777 ms** = ~61.7x slower than mediabunny; its streaming-backpressure convert pipeline processed far more of the corrupt 31 MB before emitting.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". HONEST NA — web-demuxer is a demux/probe library (libav-based demuxer feeding WebCodecs); it has no muxer, so omitting `remux` is a true capability gap, not under-declaration.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". HONEST NA — the platform baseline (WebCodecs + MSE/media element) has no general MP4 remux/fragmenter primitive; correctly not declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". HONEST NA — media-parser is read-only (parse/probe); it never writes containers.

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:865-878 (EXTRA_FUZZ_CASES entry `fuzz_mux_target_corrupt_remux`), wired into scenarios at src/scenarios/robustness/index.ts:881-900 with `oracles:['graceful-failure']`, `metrics:['wall','peakMemory']`.
- Fixture: `fuzz_mux_target_corrupt_remux.mp4` — **exists** at fixtures/media/fuzz_mux_target_corrupt_remux.mp4, 31 MB. Real (non-empty, non-mock) corrupted MP4 carrying H.264+AAC, sized like genuine media, not a synthetic stub.
- Oracle: `gracefulFailure` at src/core/oracles.ts:2586-2623; `gracefulAllowsReturnedOutput` at oracles.ts:2625-2628. It is a REAL but **intentionally weak/inverted** gate: PASS = the engine threw (no output) OR returned output when `gracefulAllowOutput:true`. It does NOT compare against a golden; it cannot distinguish a strong reject from a tolerated partial except via the output-presence signal. The only FAIL modes are: timeout/hang (runner.ts:1044-1045), or returning output when `gracefulAllowOutput` is NOT set.
- Winner adapter: mediabunny's remux genuinely calls the library and surfaced a real "Decoding error." throw on the corrupt sample table — it does NOT swallow the error and report success, and it did NOT copy input->output or short-circuit to a golden (it produced nothing). The runner routes the throw -> verdict `graceful` (runner.ts:1038-1041) -> PASS (no output) (runner.ts:1049-1050, oracles.ts:2608-2610). No canned/hardcoded output path is involved.
- Verdict: **WEAK-GATE**. The fixture is real and mediabunny's behavior is a genuine, real-library hard reject — that part is solid. But the gating oracle is a single smoke-grade robustness check with no golden comparison and an `gracefulAllowOutput:true` escape that lets *partial output* pass too; "PASS" here proves "did not crash/hang/OOM and either rejected or emitted something," not codec/bitstream correctness. Three of the four winners pass only via that loose branch. The PASS is real but not strong.
- Cached note: ALL FOUR PASS rows are `cached:true` (mediabunny startedAt 16:38:38Z, mp4box 14:13:17Z, ffmpeg.wasm 16:58:15Z, remotion-webcodecs 16:56:48Z). Evidence was reused, not re-run this pass -> staleness risk; per the launcher seeding caveat, a truly fresh run would require clearing raw + .browser-cache.

## Confidence & caveats

- Confidence: **medium**. The NONE-vs-WIN structure is unambiguous (only 4 engines even implement remux; the 3 NAs are honest). The *ranking among the 4* rests on `durationMs` (n=1, cached) plus the qualitative observation that mediabunny is the sole engine taking the strict no-output reject path — a defensible decisive factor but not a hardened benchmark.
- Caveats: (1) no `bench{}` block, so peakMemory ("never balloon memory" is the scenario's stated concern) was NOT measured in this shard — the memory robustness claim is unverified. (2) All evidence cached; durations may be stale. (3) The gate is weak (WEAK-GATE) — a fast-but-sloppy engine could "win" this scenario without producing a correct fragmented MP4, since the oracle never validates the output bitstream against a golden.
