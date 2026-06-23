# robustness/fuzz_ts_zeroed_spans_demux

family: robustness | fixture asset: `fuzz_ts_zeroed_spans.ts` (4.6 MB, exists in fixtures/media/) | primaryMetric: none in shard (only durationMs) | passCount: 4 / 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Contested: YES — 4 engines reached status=PASS (ffmpeg-wasm, remotion-media-parser, mediabunny, remotion-webcodecs), all on the single `graceful-failure` oracle.
- Decisive factor: **strength of the robustness behavior, not speed.** The scenario note demands "demux must resync or reject, never fault." ffmpeg-wasm is the ONLY engine that actually *resynchronized* past the six zeroed 188-byte TS packet spans, opened the stream, built metadata, and returned partial/safe packets (oracle detail: "operation returned partial/safe output and did not crash/hang"). The other three PASSed only by *rejecting* on the first invalid sync byte ("produced no output"). Resync-and-recover is the strictly stronger graceful outcome for a sync-byte-loss fuzz case.
- Margin over runner-up: not a performance margin (no bench/primaryMetric in shard; durations are cached n=1: mediabunny 35ms < remotion-media-parser 80ms < ffmpeg-wasm 343ms < remotion-webcodecs 512ms). ffmpeg-wasm is in fact the SLOWEST of the PASS group, but it wins on robustness quality: partial-recovery vs bare-rejection. The margin is qualitative/behavioral, not numeric.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 343ms (durationMs) | n/a | n/a | n/a | cached previous PASS; returned partial/safe output (resynced) |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | 80ms (durationMs) | n/a | n/a | n/a | cached: graceful: "Invalid sync byte" (rejected, no output) |
| mediabunny@1.48.0 | PASS | graceful-failure:true | 35ms (durationMs) | n/a | n/a | n/a | cached: graceful: "Invalid TS packet sync byte..." (rejected, no output) |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 512ms (durationMs) | n/a | n/a | n/a | cached: graceful: "Invalid sync byte" (rejected, no output) |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ts' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | 1152ms (durationMs) | — | — | — | cannot construct an AVPacketReader for MPEG-TS packet streams |

Note: this shard carries NO `bench{}` block and NO `primaryMetric`; throughputRealtime/peakMemory/longtasks were never recorded for any engine. Only `durationMs` exists, and every PASS is `cached==true`, so these are stale-reuse wall numbers (n=1), not fresh benchmark medians.

## Why the winner wins (deep technical)

The fixture is a real MPEG-TS file carrying H.264 video. The fuzz mutation zeroes six whole 188-byte transport packets, destroying their 0x47 sync bytes (scenario note: "Zero whole 188-byte TS packets: sync-byte loss; demux must resync or reject, never fault"). MPEG-TS is a fixed-188-byte packet stream with a 0x47 sync byte at the head of every packet, so a robust demuxer can re-establish packet alignment after corruption by scanning forward to the next 0x47 at a 188-byte cadence — exactly the recovery the note rewards.

ffmpeg-wasm's `demux()` (src/engines/ffmpeg-wasm/adapter.ts:1961) runs a single `-hide_banner -i <in> -map 0 -c copy -f framecrc <crc>` pass (adapter.ts:1980-1995) under a bounded `READ_EXEC_TIMEOUT_MS` exec guard. On a fuzzed TS input, FFmpeg's `mpegts` demuxer resynchronizes over the zeroed spans, still emits an `Input #0` block to the log, and writes a framecrc packet table. The adapter then gates on `if (!/^Input #\d+/m.test(log))` (adapter.ts:2002) and on a readable framecrc file (adapter.ts:2011-2019); because both succeed here, it builds metadata via `metadataFromLog` and returns `{ metadata, packets }` from `parseFramecrcPackets` (adapter.ts:2009-2023). That non-empty result hits the oracle's `gracefulAllowsReturnedOutput` branch (oracles.ts:2611-2612, enabled because the scenario sets `options.gracefulAllowOutput: true`) → PASS with detail "returned partial/safe output and did not crash/hang." The exec timeout guard (adapter.ts:1978-1998, and the design note at adapter.ts:284-289) is what guarantees a pathological TS walk cannot wedge the wasm worker — it converts a hang into a clean throw, satisfying the "never fault" half of the requirement while the resync satisfies the "resync" half.

The three other PASS engines satisfy only the "reject" branch. Their cached reasons are explicit: mediabunny "Invalid TS packet sync byte. Likely an internal bug, please report this file." and both Remotion engines "Invalid sync byte." Each threw on the first non-0x47 packet rather than scanning forward, so the runner left output undefined and the oracle took the `!ctx.output` no-output branch (oracles.ts:2608-2609) → PASS-by-rejection. Per the §B robustness reading, rejecting is acceptable but resync-and-recover is the stronger behavior the note explicitly lists first ("resync or reject"), and only ffmpeg-wasm demonstrated it. Backends are irrelevant to the gate here (mediabunny `webcodecs`/prefer-hardware, remotion-media-parser `cpu-js` streaming, remotion-webcodecs `webcodecs`) because the failure is at the container layer before any decode; the differentiator is purely TS demuxer resilience.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS but weaker: rejected on first bad sync byte ("Invalid sync byte"), produced no output. Passed graceful-failure by the no-output branch, but did not attempt TS resync, so it loses the robustness-quality contest. cached==true (80ms, n=1).
- **mediabunny@1.48.0** — PASS but weaker: threw "Invalid TS packet sync byte. Likely an internal bug, please report this file." — bare rejection, no resync, no partial recovery. Fastest cached wall (35ms) but speed is not the deciding axis and there is no real bench. cached==true.
- **remotion-webcodecs@4.0.479** — PASS but weaker: same "Invalid sync byte" rejection, no output, no resync. Slowest PASS at 512ms (cached, n=1). Its MP4/MOV fast-paths in configUsed do not help an MPEG-TS sync-loss case.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'ts'." Honest NA — WebCodecs/the platform demux surface has no MPEG-TS container parser, so it legitimately cannot run this op.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ts'." Honest NA — MP4Box.js parses ISO-BMFF (MP4) boxes only, not MPEG-TS packet streams.
- **web-demuxer@4.0.0** — NA_ENGINE: "web-demuxer v4.0.0 cannot construct an AVPacketReader for MPEG-TS packet streams." Honest NA reflecting a real v4.0.0 limitation (it took 1152ms to determine this, suggesting it tried before declining).

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:301-309 (`id: 'fuzz_ts_zeroed_spans_demux'`, `asset: 'fuzz_ts_zeroed_spans.ts'`, `op: 'demux'`, `containersIn: ['ts']`, `videoCodecs: ['h264']`, `options: { gracefulAllowOutput: true }`).
- Fixture asset: `fixtures/media/fuzz_ts_zeroed_spans.ts` EXISTS, 4.6 MB — a real (mutated) MPEG-TS file, not synthetic/empty/mock.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:1961-2027 (demux). Genuine implementation — calls the real vendored FFmpeg wasm core via `ff.exec([... '-c','copy','-f','framecrc' ...], READ_EXEC_TIMEOUT_MS)`, gates on the real `Input #` log block and a readable framecrc table, and parses actual packets. It does NOT return canned output, does NOT copy input->output to fake a result, does NOT short-circuit to a golden, and does NOT blanket-swallow errors (the catch at adapter.ts:1996 is re-surfaced as a clean throw at adapter.ts:2002-2007 if no input block appears).
- Oracle: src/core/oracles.ts:2586-2628 (`gracefulFailure`). Real behavioral comparison — distinguishes no-output (rejection) from allowed partial output (oracles.ts:2608-2612) and FAILS if a malformed input yields output WITHOUT `gracefulAllowOutput` (oracles.ts:2614-2617). It is not trivially "always pass": output on a malformed input without the allow-flag is a FAIL. Measurements are plausible (real reject messages naming the invalid sync byte; ffmpeg-wasm's partial output path).
- cached note: ALL four PASS results have `cached==true`, reused from earlier runs (ffmpeg-wasm 2026-06-22T16:57, others 14:01-17:34). Verdicts were not re-run for this report; staleness risk applies to all PASS rows and to the absence of bench data.
- validationVerdict: **WEAK-GATE**. The fixture, implementation, and oracle are all REAL, but the gating oracle is `graceful-failure` — a robustness/smoke-tier gate, not a correctness gate (no golden-packet comparison, no decoded-frame check). All four engines pass it; the winner is chosen on the qualitative resync-vs-reject distinction the oracle records in `detail`, not on a strict measured threshold. PASS is genuine but not strong.

## Confidence & caveats

- Confidence: medium. The winner selection is well-grounded in the oracle's own `detail` strings (partial-output recovery vs bare rejection) and the scenario note's stated preference for resync. But it rests on a single robustness oracle with no correctness or performance gate to corroborate.
- Caveats: (1) No `bench{}`/`primaryMetric` in this shard — performance tiebreakers are unusable; reported numbers are cached `durationMs` at n=1. (2) All PASS rows are `cached==true` (stale-reuse risk; per the launcher seeding caveat, a fresh run could differ). (3) The contest is decided on a graceful-failure quality nuance, so a stricter reading that treats all four "graceful" outcomes as equal would make this a 4-way tie with no correctness separator. (4) The three NA_ENGINE results all look honest (platform/mp4box lack TS; web-demuxer v4.0.0 genuinely lacks an MPEG-TS AVPacketReader).
