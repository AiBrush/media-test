# trim/vp9_noop_full_range_idempotent

family: trim | fixture asset: `vp9_1080p_10s.webm` (9.3 MB, VP9 1080p30 + Opus, WebM) | primaryMetric: wall | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Decisive factor: **performance**. Both mediabunny and ffmpeg.wasm pass the identical 4-oracle gate at equal correctness strength (no bit-exact gate is in play here; the strongest passing oracle is `reference-reimport`, a packet-table consistency check, plus the `trim-boundaries` / `property-invariant` duration checks and a `playback-smoke`). With correctness comparable, the tiebreak is wall time: mediabunny **27.46 ms** vs ffmpeg.wasm **65.68 ms**.
- Margin over runner-up: **2.39x faster wall** (65.675 / 27.465) and **2.39x higher throughputRealtime** (364.39 vs 152.39 x-realtime). Caveat: ffmpeg.wasm has far lower main-thread blocking — longtasks 179 ms vs mediabunny's 4223 ms. Both samples are n==1.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:✓, trim-boundaries:✓, playback-smoke:✓, reference-reimport:✓ | 27.465 | 364.391 | n/a (0 samples) | 4223 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:✓, trim-boundaries:✓, playback-smoke:✓, reference-reimport:✓ | 65.675 | 152.387 | n/a (0 samples) | 179 | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

This scenario is an **idempotent full-range trim** of a WebM/VP9+Opus clip: `range = {startUs:0, endUs:10_000_000}` against a source whose probed duration is 10.008 s (`fixtures/golden/vp9_1080p_10s.webm.meta.json`). The operation is semantically `trim(0..fullDuration) ≈ identity`, and the scenario gates on a non-bit-exact bundle: `property-invariant` (probe-duration), `trim-boundaries`, plus the `extraOracles` `playback-smoke` and `reference-reimport` (`src/scenarios/trim/index.ts:765-780`). No `decoded-frames-bitexact` or `golden-packets` gate exists here — the scenario notes explicitly state bit-exact is omitted because the loaded golden is a source-prefix, not a trim-range golden — so neither engine can earn extra correctness credit. Correctness is therefore a tie, and the contest is decided on throughput.

**mediabunny's mechanism.** Its `trim()` recognizes the no-op case before doing any muxing. At `src/engines/mediabunny/adapter.ts:1468-1476` it checks `Math.abs(range.startUs) <= NOOP_TRIM_TOLERANCE_SEC*1e6` and then `isNoopTrim(meta, range, opts.container)` (`adapter.ts:476-489`), which returns true when start≈0 and `endSec ≈ meta.durationSec` within 1 ms and the requested container matches the source container (webm→webm). On a hit it returns the source bytes verbatim: `new Uint8Array(await input.arrayBuffer())`. This is a legitimate fast path for an identity trim — there is nothing to recompute, so the output is, by construction, the original WebM. That is why its measured output duration is 10.001 s with `deltaSec` 0.007 vs golden 10.008 (property-invariant, `adapter.ts:1488` range carried through the no-op), `durationDeltaSec` 0.001 vs the requested 10 s (trim-boundaries), and `reference-reimport` re-demuxes the bytes to **800 packets / 505 keyframes** — essentially the source packet table (golden is 801/506, within the oracle's 2% `withinRel` band at `src/core/oracles.ts:1258-1262`). Returning the unchanged container is also why it is fast: 27.465 ms wall, 364.39 x-realtime. The configUsed shows the WebCodecs backend (`backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`), but for this identity path almost none of that matters — the win is the buffer pass-through plus a single metadata probe.

**ffmpeg.wasm's mechanism.** It takes the non-frame-accurate keyframe-aligned copy path at `src/engines/ffmpeg-wasm/adapter.ts:2613-2627`: `-ss 0 -t 10 -map 0 -c copy -avoid_negative_ts make_zero`, i.e. a real stream-copy remux of both the VP9 video and Opus audio elementary streams through the single-thread wasm muxer (no transcode, `-c copy`). This genuinely re-writes the WebM container, which is why its output is 10.014 s (property-invariant `deltaSec` 0.006 vs golden, trim-boundaries `durationDeltaSec` 0.014 vs requested) and re-imports to **799 packets / 504 keyframes** — one packet short of mediabunny because the container rebuild and `-avoid_negative_ts` shift the edge slightly, still inside the 2% band. The cost of actually demuxing+remuxing in wasm is ~2.39x the wall of mediabunny's pass-through (65.675 ms vs 27.465 ms). Notably, ffmpeg.wasm blocks the main thread far less (longtasks 179 ms vs 4223 ms) — its wasm work is more amortized — but the decisive primaryMetric (wall) clearly favors mediabunny.

Both passes are real; mediabunny wins purely because the identity trim lets it skip the remux that ffmpeg.wasm performs.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed all 4 oracles but lost on performance: 65.675 ms wall vs 27.465 ms (2.39x slower), 152.39 vs 364.39 x-realtime. It did a genuine `-c copy` remux of the streams (`adapter.ts:2613-2627`) instead of recognizing the trim as an identity, so it paid full container-rewrite cost. Correctness is otherwise indistinguishable (799/504 packets vs golden 801/506).
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest — the platform/WebCodecs adapter exposes decode/encode primitives, not a container-level trim operation; declaring trim would require it to own a muxer it does not implement.
- **mp4box@2.3.0** — NA_ENGINE: does not declare 'trim'. Honest — mp4box is an MP4/ISO-BMFF box parser/muxer with no WebM path and no trim operation; it could not even open this WebM container.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'trim'. Honest — it is a demux-only library; trimming requires re-muxing, which is out of its declared scope.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'trim'. Honest — a parser/probe library, no encode/mux/trim surface.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'trim'. Plausibly under-declared (it wraps WebCodecs and could in principle remux), but for this suite it simply does not register the 'trim' operation, so it is correctly skipped rather than failed.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:765-780` (id `vp9_noop_full_range_idempotent`, asset `vp9_1080p_10s.webm`, range 0..10_000_000us, oracles property-invariant + trim-boundaries + playback-smoke + reference-reimport).
- Fixture: `fixtures/media/vp9_1080p_10s.webm` exists, 9.3 MB — a real VP9 1080p30 + Opus WebM (golden meta confirms container webm, 2 tracks, durationSec 10.008, 801 packets / 506 keyframes). Not synthetic/empty/mock.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445-1500` (`trim`), no-op detection `adapter.ts:1468-1476` + `isNoopTrim` `adapter.ts:476-489`. The no-op path returns the *real source bytes* (`input.arrayBuffer()`) — this is an honest identity output for an identity request, NOT a short-circuit to a golden file and NOT canned/hardcoded data: it copies the genuine input. The non-no-op paths call real mediabunny `Output`/`Conversion`/`EncodedPacketSink` APIs.
- Oracle: `reference-reimport` `src/core/oracles.ts:1225-1271` actually re-demuxes the engine output via the reference engine and compares packet/keyframe counts to the golden packet table with a 2% `withinRel` tolerance (`oracles.ts:1258-1262`) — not trivially satisfiable; an empty table fails (`oracles.ts:1249-1251`). `trim-boundaries` `oracles.ts:2346-2403` and `property-invariant` probe-duration check real probed durations against tolerances. Measured numbers (10.001s duration, Δ0.007s, 800/505 packets) are physically plausible for this 10 s clip.
- Cached note: the winner's result has `cached:true` ("cached previous PASS result", startedAt 2026-06-22T16:43Z). The PASS was reused, not re-run in this batch — minor staleness risk, but the adapter/oracle/fixture all check out and the measurements are consistent with the golden, so confidence remains high.
- Verdict: **REAL** — real fixture, real (identity-aware) implementation, meaningful packet-consistency + duration oracles.

## Confidence & caveats

Confidence: **high**. Two genuine PASSes; the winner's edge is an unambiguous 2.39x wall-time margin on the declared primaryMetric, backed by code-verified honest implementations on both sides. Caveats: (1) both bench samples are n==1 (mad/p95 == median), so the absolute timings carry wide intrinsic variance — the *ratio* is large enough that the ranking is robust, but treat the millisecond figures as single observations; (2) ffmpeg.wasm is markedly better on main-thread responsiveness (longtasks 179 ms vs 4223 ms), so a longtask-weighted ranking would flip the winner — wall was chosen as primaryMetric here; (3) both results are cached; (4) this gate has no bit-exact correctness oracle, so the contest is correctly resolved on performance rather than decoded-frame identity.
