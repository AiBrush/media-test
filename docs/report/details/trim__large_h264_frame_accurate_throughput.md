# trim/large_h264_frame_accurate_throughput

family: trim | fixture asset: `large_h264_1080p_120s.mp4` (~90 MB real file, H.264/AAC in MP4) | primaryMetric: throughputRealtime | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Decisive factor: **sustained re-encode throughput**. Both passing engines clear the identical correctness gate (trim-boundaries duration check + playback-smoke); the headline `primaryMetric` is `throughputRealtime`, where mediabunny wins decisively.
- Margin over runner-up (ffmpeg.wasm): **33.3x faster throughput** (162.55 x-realtime vs 4.885 x-realtime) and **33.3x lower wall** (738.2 ms vs 24,563.3 ms median). Both n==1 (single sample, mad=0), so spread cannot be assessed — but the gap is two orders of magnitude wide and structurally explained (hardware WebCodecs vs single-/multi-thread wasm libx264), so the ranking is not fragile.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 738.215 ms | 162.554 x | 0 (not sampled) | 4223 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 24563.310 ms | 4.885 x | 0 (not sampled) | 4223 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The operation is a **frame-accurate trim** of the span 60.0s..66.0s out of a 120s, ~90 MB 1080p H.264-in-MP4 file (`startUs: 60_000_000, endUs: 66_000_000, frameAccurate: true`, `tolerances.durationToleranceSec: 0.1`). Frame accuracy means the boundary GOP cannot be stream-copied: the requested in/out points fall mid-GOP, so the engine must decode the leading GOP and re-encode it to land on exact frames. The scenario notes call this out explicitly: "Re-encode path: sustained throughput is the headline number," with `primaryMetric: 'throughputRealtime'`.

mediabunny ran this through its Conversion pipeline in `src/engines/mediabunny/adapter.ts:1484-1496`: it builds an `Output` with a `BufferTarget`, sets `convOpts.trim = { start: range.startUs/1e6, end: range.endUs/1e6 }`, and because `opts.frameAccurate` is true it sets `convOpts.video = { forceTranscode: true, hardwareAcceleration: HW_ACCEL }` (adapter.ts:1493-1495). `HW_ACCEL` derives from `env.configUsed.hwAccel = "prefer-hardware"`, and `configUsed.backend = "webcodecs"` with `pipeline = "streaming-lockstep"`. So the re-encode runs on the **Apple M1 Max hardware H.264 encoder via the browser's WebCodecs VideoEncoder**, in a streaming read->decode->encode->mux lockstep that keeps memory bounded. That is why wall is **738 ms** and throughput is **162.55x realtime** for a 6-second output cut from a 90 MB source.

ffmpeg.wasm took the genuine but far slower software path in `src/engines/ffmpeg-wasm/adapter.ts:2574-2604`: for `frameAccurate`, it places `-ss`/`-t` AFTER `-i` (forcing decode+re-encode rather than a keyframe copy), maps `-c:v libx264 -pix_fmt yuv420p -preset veryfast` plus `...this.threadArgs()`, and `-movflags +faststart`. This is a correct frame-accurate trim, but libx264 inside WebAssembly cannot touch the GPU encoder; even with the mt core it is a software x264 encode, which is why wall is **24,563 ms** and throughput is **4.885x realtime** — a 33.3x deficit driven entirely by hardware WebCodecs vs wasm-libx264, not by any correctness difference.

Both engines satisfied the **same two oracles with effectively identical correctness**. The gating oracle is `trim-boundaries` (`src/core/oracles.ts:2348-2434`). It probes output duration via the reference engine / decoded-frame PTS span and checks `|outDuration - requestedDuration| <= durationToleranceSec`. mediabunny measured `outDurationSec: 6.08, requestedDurationSec: 6, durationDeltaSec: 0.080` (< 0.1 tol); ffmpeg.wasm measured `outDurationSec: 6.0663, durationDeltaSec: 0.0663` (also < 0.1). Notably **`boundaryFrameComparisons: 0` for both** — the per-frame SHA-256 boundary digest is deliberately skipped because the loaded golden is a source-prefix, not a trim-range golden (oracles.ts:2405-2431). So correctness here is duration-within-100ms plus playback-smoke (`<video> played a few frames`), identical for both engines. Correctness being a tie, performance is the tiebreaker, and mediabunny wins on the declared primary metric by 33.3x.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed with identical oracle outcomes but lost on throughput: 4.885x realtime vs mediabunny's 162.554x (33.3x slower), 24,563 ms wall vs 738 ms (33.3x slower). Cause: its frame-accurate trim is a software libx264 re-encode in wasm (`adapter.ts:2592-2594`), with no access to the M1 Max hardware encoder that mediabunny reaches via WebCodecs `prefer-hardware`.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: mp4box.js is a demux/segment/box parser, not a transcoder; it cannot re-encode a boundary GOP, so it correctly does not claim frame-accurate trim.
- **platform@chrome-149** — NA_ENGINE: does not declare 'trim'. Honest: the raw platform engine (MediaSource/`<video>`/WebCodecs primitives) has no single trim entry point; building a trim would require an ad-hoc decode+encode pipeline it does not expose as an operation.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'trim'. Plausibly honest at the adapter level (no trim operation registered), though the underlying lib could in principle re-encode; declared scope omits trim.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'trim'. Honest: web-demuxer is a demux-only wasm wrapper (no encoder), so a frame-accurate (re-encoding) trim is genuinely out of scope.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'trim'. Honest: a media parser reads structure/metadata; it has no encode path for the re-encode boundary GOP.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:607-624` (`id: 'large_h264_frame_accurate_throughput'`, asset `large_h264_1080p_120s.mp4`, `frameAccurate: true`, range 60s..66s, `primaryMetric: 'throughputRealtime'`).
- Fixture: `fixtures/media/large_h264_1080p_120s.mp4` exists, ~90 MB real H.264/AAC MP4 (verified via stat). Not synthetic/empty/mock.
- Oracle: `trim-boundaries` at `src/core/oracles.ts:2348-2434`; `playback-smoke` set via `PLAYABLE_AV` (`src/scenarios/trim/index.ts:125`).
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445-1500` — genuine Conversion with `forceTranscode: true` + `hardwareAcceleration` for the frame-accurate path; no canned output, no input->output copy (the noop-trim short-circuit at 1468-1477 only fires for a true 0..duration identity request, which does not apply to a 60..66s sub-range), no golden short-circuit, no error swallowing.
- Verdict: **WEAK-GATE**. The implementation and fixture are fully real and the win is real, BUT the gating oracle for this rung reduces to a duration-within-100ms tolerance plus playback-smoke: `boundaryFrameComparisons: 0` means the per-frame bit-exact boundary digest is intentionally disabled (golden is a source-prefix, not a trim-range golden — oracles.ts:2405-2431). A frame-accurate trim is therefore NOT verified to be frame-accurate at the pixel level; the durationDeltaSec values (0.080s and 0.066s) prove only approximate boundary placement within the 0.1s tolerance. The PASS is genuine but the correctness gate is weaker than the scenario's "frame-accurate" name implies.
- Cached note: BOTH passing results have `cached==true` ("cached previous PASS result"). Numbers were reused, not re-run this cycle; per the launcher-seeding caveat there is mild staleness risk, but the 33.3x margin is far larger than any plausible cache drift.

## Confidence & caveats

- Confidence: **medium**. The winner is unambiguous (only 2 eligible, identical oracle outcomes, 33.3x performance margin on the declared primary metric, structurally explained by hardware-WebCodecs vs wasm-libx264).
- Caveats: (1) both bench samples are n==1 (mad=0, no spread visible), so the absolute numbers are point estimates — the ordering is safe but the precise 33.3x figure could shift on re-run. (2) Both results are cached. (3) The correctness gate is duration+smoke only (boundary-frame digest disabled), so "frame-accurate" is asserted by the adapter (`forceTranscode`) but not pixel-verified by the oracle — hence the WEAK-GATE verdict. (4) `peakMemory` was not sampled (n=0) for either engine, so the scenario's secondary "must not balloon memory" concern is unverified from this shard.
