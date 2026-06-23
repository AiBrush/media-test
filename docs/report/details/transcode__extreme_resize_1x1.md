# transcode/extreme_resize_1x1

**family:** transcode | **fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264/AAC in MP4) | **primaryMetric:** wall | **passCount:** 3 / 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (CONTESTED — 3 engines PASS the single `graceful-failure` oracle).
- **Decisive factor:** correctness strength is identical across the three PASS engines (all pass exactly the one oracle, `graceful-failure`, by issuing a clean throw before any encode), so the tie breaks on the *quality and intentionality of the rejection* and on wall time. ffmpeg.wasm rejects the degenerate target with a **purpose-written, dimension-specific guard** (`adapter.ts:2188-2189`) that throws *before touching the wasm core* — a deterministic, source-portable rejection that does not depend on a browser quirk. The two WebCodecs-based engines pass only incidentally, by relaying the Chrome `VideoEncoder` "size must be > 0" exception.
- **Margin over runner-up:** the WebCodecs engines are nominally faster to throw (remotion-webcodecs 15 ms, mediabunny 20 ms vs ffmpeg.wasm 144 ms ≈ **9.6x / 7.2x slower** wall), but all three are `cached`, single-sample (`n` effectively 1), and the durations measure only "time to reach a throw," not real transcode work — so the wall gap is **not load-bearing** for correctness. ffmpeg.wasm wins on rejection robustness, not speed.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | graceful-failure:pass | 144 ms (durationMs; no bench) | n/a | n/a | n/a | cached: graceful: transcode rejected degenerate video dimensions |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 15 ms (durationMs; no bench) | n/a | n/a | n/a | cached: graceful: VideoEncoder.isConfigSupported — height/width must be > 0 |
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 20 ms (durationMs; no bench) | n/a | n/a | n/a | cached: graceful: browser cannot encode avc at 1x1 (isConfigSupported=false) → NA(browser) |
| platform@chrome-149 | NA_ENGINE | — | 4 ms | n/a | n/a | n/a | transcode NA — source carries audio; MediaRecorder canvas-capture path cannot preserve/copy audio |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare operation 'transcode' |

Note: the shard carries no `bench{}` block for any engine here (the only metric requested is `wall`, and the values shown are `durationMs` from the cached graceful run). No throughputRealtime / peakMemory / longtasks were recorded.

## Why the winner wins (deep technical)

This scenario (`src/scenarios/transcode/index.ts:1462-1483`) is the A.16 "1×1 video" degenerate-target case. The input is the real 31 MB `h264_1080p_30s.mp4` (H.264 video + AAC audio in a plain MP4), and the requested operation is a full **re-encode** to MP4/H.264 at `width:1, height:1`. A 1×1 target is *valid-but-degenerate*: the option `gracefulAllowOutput: true` (`index.ts:1466`) means the scenario accepts EITHER a clean throw OR a sane minimal frame — what it forbids is a crash/hang/OOM. The gating oracle is `graceful-failure` only; there is no SSIM, no bit-exact, no metadata comparison, because there is no meaningful "correct" 1×1 transcode to compare against. So correctness here = "handle the degenerate target without blowing up."

ffmpeg.wasm wins because its rejection is the most *engineered* and least incidental. The adapter's `transcode()` runs an ordered series of pre-flight guards (`src/engines/ffmpeg-wasm/adapter.ts:2165-2190`). The specific guard that fires is:

```
if (opts.video && ((opts.video.width !== undefined && opts.video.width <= 1) ||
    (opts.video.height !== undefined && opts.video.height <= 1)))
  throw new Error(`${ENGINE_ID}: transcode rejected degenerate video dimensions`);   // adapter.ts:2188-2189
```

Critically this throws a **plain `Error`, not a `NotApplicableError`**. That distinction is the whole game: the runner's graceful path (`src/core/runner.ts:1028-1042`) maps a `NotApplicableError` to `NA_ENGINE` (line 1032-1033) but treats any *other* clean throw/reject as `verdict='graceful'` (line 1038-1040). The `graceful-failure` oracle (`src/core/oracles.ts:2586-2618`) then sees the scenario declares `graceful-failure` (`hasGracefulSignal` true, line 2603-2606), finds no output/metadata/demux/frames populated (line 2608), and returns PASS with "operation produced no output and did not crash/hang → handled gracefully" — exactly the `detail` recorded in the shard. The rejection is deterministic and backend-independent: it does not depend on whether Chrome's hardware/software AVC encoder happens to reject a zero-area config, so it would behave identically on any runtime. The throw also happens before the vendored single-thread wasm core (`coreBuild` is intentionally single-thread per the adapter header note about COOP/COEP-free operation) is ever invoked for an encode, so there is zero risk of a wasm trap/OOM on the degenerate geometry.

The two WebCodecs engines also PASS, but mechanistically their PASS is *incidental*. Mediabunny (`configUsed.backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `coopCoep: "not-required"`) calls `VideoEncoder.isConfigSupported` for AVC at 1×1 @ 300000 bps, gets `false`/throws, and surfaces a plain Error whose prose says "NA(browser)"; because it is a plain throw (not a thrown `NotApplicableError`), the runner routes it to graceful → PASS (shard durationMs 20 ms). Remotion-webcodecs (`configUsed.backend: "webcodecs"`, `hwAccel: "prefer-hardware(+software fallback)"`) hits the browser exception directly: "Failed to execute 'isConfigSupported' on 'VideoEncoder': Invalid size; height and width must be greater than zero." (shard durationMs 15 ms). Both rely on the Chromium `VideoEncoder` rejecting zero-area dimensions — correct here, but coupled to a platform behavior rather than an explicit contract in the adapter. On correctness strength all three are tied at one passed oracle of the same (smoke-grade robustness) tier, so the tie breaks to ffmpeg.wasm's intentional, portable guard.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS but lost the tiebreak. Its graceful reject is a *relayed* Chrome `VideoEncoder.isConfigSupported` exception ("height and width must be greater than zero"), not a deliberate degenerate-dimension contract; equal oracle strength, so it loses on rejection-robustness/intentionality. Faster to throw (15 ms vs 144 ms) but the wall figure is cached, single-sample, and only measures "time to throw," so it is not decisive.
- **mediabunny@1.48.0** — PASS but lost the tiebreak. Same incidental mechanism (WebCodecs `isConfigSupported=false` for AVC 1×1); its own prose even labels it "NA(browser)", yet it surfaces as a plain throw → graceful PASS. Equal oracle strength; 20 ms vs 144 ms wall, again non-load-bearing (cached/single-sample).
- **platform@chrome-149** — NA_ENGINE. Reason: "the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio." This NA is **honest**: platform's encode path is `<video>→canvas→MediaRecorder` (`configUsed.encode`), which has no way to mux the input AAC track, so it correctly declines a transcode of an audio-bearing source rather than silently dropping audio. It does not even reach the 1×1 question.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest — it is a parser/demuxer, not an encoder.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest — mp4box is a box-level MP4 (de)muxer with no encode capability.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest — it is a wasm demuxer only.

## Anti-cheat validation

- **Scenario:** `src/scenarios/transcode/index.ts:1462-1483` (`id: 'transcode/extreme_resize_1x1'`). Input field `input: 'h264_1080p_30s.mp4'`; target `video: { codec: 'h264', width: 1, height: 1 }`, `gracefulAllowOutput: true`. Notes confirm A.16 degenerate-dimension rationale: "Must handle gracefully or correctly — a clean throw or a sane minimal frame, never a crash/hang/OOM."
- **Fixture exists:** `fixtures/media/h264_1080p_30s.mp4` present, 31 MB — a real, full-size H.264/AAC MP4, not synthetic/empty/mock.
- **Oracle:** `src/core/oracles.ts:2586-2628` (`gracefulFailure`). It is a *robustness/smoke-tier* gate by design (there is no golden for a 1×1 frame), so PASS here is genuine but inherently weak: it only asserts "no output AND no crash/hang" (line 2608) or, under `gracefulAllowOutput`, "partial/safe output without crash" (line 2611, `gracefulAllowsReturnedOutput` at 2625-2627). It is NOT trivially-always-pass: it FAILs on timeout (`runner.ts:1044-1045`) and FAILs if a known-malformed input yields disallowed output (oracle line 2614-2617).
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2165-2190`, specifically the degenerate-dimension guard at **2188-2189**. This is a genuine, intentional rejection in the real adapter — it does not fabricate output, does not copy input→output, does not short-circuit to a golden, and does not swallow an error to fake success. It throws a plain `Error` that the runner maps to graceful (`runner.ts:1038-1040`).
- **Measurements plausibility:** the recorded `detail` "operation produced no output and did not crash/hang → handled gracefully" matches the oracle's no-output branch exactly; durationMs (144/20/15 ms) are physically plausible for "reach a pre-flight throw." No fabricated packet/SSIM/byte numbers are claimed.
- **Cached note:** all three PASS results are `cached:true` (ffmpeg run startedAt 2026-06-22T16:58Z; mediabunny 16:52Z; remotion-webcodecs 14:08Z). They were reused, not re-run in this pass — minor staleness risk, but the verdict is a deterministic code-path guard, not a numeric measurement, so reuse does not undermine it.
- **Verdict: WEAK-GATE.** Real fixture + real, intentional adapter implementation, but the gating oracle is smoke/robustness-tier (a single `graceful-failure` that asserts only "did not crash") — the PASS is real yet not a strong correctness signal. No evidence of mocking or faked output (so not CHEAT/SUSPECT); cached-only is a caveat, not a blocker.

## Confidence & caveats

- **Confidence: high** on the structural facts (which engines PASS/NA and why, the exact guard, the oracle mechanics) — all read directly from the shard and source.
- The "win" is a tiebreak among three engines that all clear the *same* weak oracle; the choice of ffmpeg.wasm rests on rejection intentionality/portability rather than a measured correctness or performance delta. Reasonable observers could rank any of the three first since the oracle does not distinguish them.
- All evidence is from `cached` runs; a fresh re-run is recommended for the launcher-seeding/stale-PASS caveat, though the deterministic guard makes regression unlikely.
- No `bench{}` data exists for this scenario, so peakMemory/throughput/longtasks comparisons are unavailable; only `durationMs` (time-to-throw) is present and is not a meaningful performance signal here.
