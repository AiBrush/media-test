# trim/ts_keyframe_aligned

family: trim | fixture asset: `fixtures/media/h264_ts.ts` (H.264 video + AAC audio in MPEG-TS, 4.6 MB) | primaryMetric: wall (throughputRealtime reported) | passCount: 2 / 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **CONTESTED**: 2 engines PASS (ffmpeg.wasm, mediabunny@1.48.0); the other 5 are NA_ENGINE.
- **Decisive factor: performance.** Correctness is a tie — both engines pass the *same* gating oracle (`trim-boundaries`) at the *same* strictness (duration within the wide 1.0 s TS band, with `boundaryFrameComparisons: 0` for both, i.e. no frame-digest comparison occurred). With correctness comparable, the ranking falls to performance per the decision ladder.
- **Margin over runner-up (mediabunny):** wall median **83.69 ms vs 452.69 ms = 5.41x faster**; throughputRealtime **119.75x vs 22.14x = 5.41x higher**. Caveat: both samples are **n=1** (single timed run, both `cached:true`), so the magnitude is weak evidence; and mediabunny is actually the *more accurate* cut (duration Δ 0.0747 s vs ffmpeg's 0.144 s) and incurs far fewer long-tasks (234 ms vs 3391 ms). The win is a raw-throughput win, not a quality win.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true | 83.69 ms | 119.75x | 0 (n=0) | 3391 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | trim-boundaries:true | 452.69 ms | 22.14x | 0 (n=0) | 234 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

(peakMemory and targetWrites have n=0 samples for both PASS engines — not measured in this scenario, so excluded from the ranking.)

## Why the winner wins (deep technical)

The operation is a **keyframe-aligned (non-frame-accurate) copy-trim of MPEG-TS** carrying H.264 video and AAC audio, request range 2.0 s..6.0 s (`startUs: 2_000_000`, `endUs: 6_000_000`, `frameAccurate: false`; src/scenarios/trim/index.ts:429-441). MPEG-TS is the hard container here: there is **no global index/header**, timestamps are PTS-estimated, and any cut must preserve **188-byte TS packet alignment** (scenario `notes`). That is precisely why the scenario uses `BOUNDARIES_ONLY` (src/scenarios/trim/index.ts:439, an *empty* extra-oracle list) plus a deliberately wide `durationToleranceSec: 1.0` (src/scenarios/trim/index.ts:438) — a tight boundary digest is unsound on estimate-only PTS.

ffmpeg.wasm executes the canonical fast copy-trim. In `trim()` with `frameAccurate:false` it builds `-ss <start> ... -i <in> -map 0 -t <dur> -c copy` — `-ss` placed **before** `-i` so FFmpeg input-seeks to the nearest *preceding* keyframe and stream-copies from there (src/engines/ffmpeg-wasm/adapter.ts:2613-2627). For the TS container it then appends the TS-specific `-muxdelay 0 -muxpreload 0` (src/engines/ffmpeg-wasm/adapter.ts:2632-2634) and the universal `-avoid_negative_ts make_zero` (line 2629) to normalize the PTS origin of the cut segment, before `-map 0` keeps both the H.264 and AAC elementary streams. The bytes come from a real wasm exec: `await this.run(args)` then `this.readBinary(outName)` (lines 2636-2637) — no canned data, no copy of input to output, no golden short-circuit. Because `-c copy` does **zero decode/re-encode** (it demuxes TS packets and remuxes them), the work is dominated by I/O, which is why wall is only **83.69 ms** and throughput **119.75x realtime**. The trimmed output measured `outDurationSec: 4.144 s` vs requested 4.0 s (Δ 0.144 s) — comfortably inside the 1.0 s TS band; the 0.144 s overrun is the expected artifact of snapping back to the preceding keyframe and the leading GOP it carries.

mediabunny passes the identical oracle but uses a fundamentally different, decode-touching pipeline: its `configUsed` shows `backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`. Its measured cut is *tighter* — `outDurationSec: 4.0747 s` (Δ 0.0747 s) — and it runs far gentler on the main thread (longtasks 234 ms vs ffmpeg's 3391 ms, because the multi-thread wasm core stalls the worker during init/demux). But mediabunny's wall is **452.69 ms** (5.41x slower) and throughput **22.14x** (5.41x lower). With both engines flat-equal on the only correctness gate (`trim-boundaries`, both `pass:true`, both `boundaryFrameComparisons:0`), step 4(b) of the decision procedure ranks on the primaryMetric (wall) and ffmpeg.wasm takes it decisively on raw speed.

The gating oracle itself (`trimBoundaries`, src/core/oracles.ts:2348-2435) probes output duration via the reference engine / decoded-frame PTS span and compares to the requested span against `durationToleranceSec`. The boundary-frame digest block (lines 2410-2431) is intentionally inert unless a *trim-range* golden exists; here only source-prefix golden exists, so `boundaryFrameComparisons` is 0 for both engines and the live gate is duration only. This is a real comparison (real probed duration vs real requested span), but it is a **structural/duration gate with no frame-exactness** — strong enough to catch a wrong-length cut, not strong enough to separate two correct cuts on quality, which is exactly why this scenario is contested on performance.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on performance only. Same `trim-boundaries:true`, actually a *better* cut (Δ 0.0747 s vs 0.144 s) and fewer longtasks (234 ms vs 3391 ms), but 5.41x slower wall (452.69 ms vs 83.69 ms) and 5.41x lower throughput. The metric gap, not any defect, is the loss.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: the raw browser/WebCodecs platform exposes decode/encode/probe primitives but no container-level trim/remux operation, so it cannot copy-trim a TS file.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'trim'. Honest; it is a transcode/decode-encode wrapper, not a stream-copy trimmer.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'trim'. Honest; it is a read-only parser/probe library with no muxing/writing path.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'trim'. Honest; demux-only (no remux/write), so it cannot emit a trimmed file.
- **mp4box@2.3.0** — NA_ENGINE: does not declare 'trim'. Plausibly honest for *this* input: mp4box is an ISOBMFF tool and the fixture is MPEG-TS (not MP4), so even if it had a trim op it could not handle a `.ts` container; not declaring 'trim' is consistent.

## Anti-cheat validation

- **Scenario**: src/scenarios/trim/index.ts:429-441 (`id: 'ts_keyframe_aligned'`, asset `h264_ts.ts`, container `ts`, h264/aac, range 2..6 s, frameAccurate false, durationToleranceSec 1.0, extraOracles `BOUNDARIES_ONLY`).
- **Fixture**: `fixtures/media/h264_ts.ts` exists, 4.6 MB real MPEG-TS file — not synthetic/empty/mock. Confirmed via stat.
- **Oracle**: `trimBoundaries` at src/core/oracles.ts:2348-2435 performs a real duration comparison (probed/decoded output duration vs requested span) and fails on `d > t.durationToleranceSec`. Measurements are physically plausible: ffmpeg out 4.144 s, mediabunny 4.0747 s vs requested 4.0 s. The frame-digest path is correctly gated off (no trim-range golden) → `boundaryFrameComparisons: 0`.
- **Winner adapter**: src/engines/ffmpeg-wasm/adapter.ts:2538-2645 (`trim`); the copy-trim path at lines 2613-2636 issues real FFmpeg args (`-ss` pre-`-i`, `-c copy`, TS `-muxdelay/-muxpreload`, `-avoid_negative_ts make_zero`) and runs `this.run(args)` → `readBinary(outName)`. No hardcoded output, no input->output passthrough, no golden short-circuit, no error swallowing (it throws on malformed/mutated/out-of-domain inputs, lines 2550-2561).
- **Cached note**: both PASS results are `cached:true` ("cached previous PASS result"). The evidence was reused, not freshly re-run in this report pass — staleness/seeding risk applies to the exact wall/throughput numbers, but the implementation and oracle inspected here are real.
- **Verdict: REAL.** Real MPEG-TS fixture + genuine FFmpeg `-c copy` keyframe-aligned trim + a real (if loose, duration-only) oracle. The gate is structural/proxy strength, so the *win margin* is performance-only, but nothing is faked.

## Confidence & caveats

- **Confidence: medium.** Code paths, fixture, and oracle are all verified REAL and the speed gap (5.41x) is large.
- Both bench samples are **n=1, mad=0, cached:true** — the precise wall/throughput values are single-shot and reused; treat the 5.41x as directional, not a hardened benchmark.
- The gating oracle is a **duration-tolerance gate with a wide 1.0 s TS band and no frame-exactness** (boundaryFrameComparisons=0). Correctness between the two PASS engines is therefore indistinguishable at the oracle level; the winner is chosen purely on throughput.
- Worth noting against the winner: mediabunny produced the tighter cut (Δ 0.0747 s) and far fewer main-thread longtasks (234 ms vs 3391 ms) on hardware WebCodecs with no COOP/COEP requirement — if main-thread responsiveness or boundary precision were the metric, mediabunny would win.
