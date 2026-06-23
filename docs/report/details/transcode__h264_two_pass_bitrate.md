# transcode/h264_two_pass_bitrate

- family: transcode
- fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264/AVC 1080p ~30 s clip)
- primaryMetric: throughputRealtime (TC_METRICS; wall reported alongside)
- passCount: 1 of 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **Uncontested** — it is the only engine with status PASS. The other six are all NA_ENGINE (no FAILs, no other PASS).
- **Decisive factor:** ffmpeg.wasm is the only engine that *declares and implements* the `two-pass` feature. Two-pass average-bitrate (ABR) control needs a full encoder rate-control state file (the x264/x265 stat/mbtree passlog) carried from pass 1 into pass 2. Only the libx264 path inside ffmpeg.wasm provides this; every other engine either does not declare a `transcode` operation at all (parsers/demuxers) or declares `transcode` but not the `two-pass` feature (WebCodecs/wasm rewrap engines have no two-pass rate controller).
- **Margin over runner-up:** not applicable — there is no second PASS. Absolute performance: wall median 85,616 ms, throughputRealtime 0.350x, encodeFps 10.51, longtasks 1007 ms, n=1.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | ssim-psnr:pass, playback-smoke:pass | 85616.45 ms | 0.3504x | 0 (not sampled) | 1007 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'two-pass' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'two-pass' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'two-pass' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a real **re-encode** of H.264/AVC in MP4 to a new H.264 stream targeting an *average* bitrate of 2,000,000 bps using **two-pass ABR** (scenario `src/scenarios/transcode/index.ts:771-780`, options `video:{codec:'h264', bitrate:2_000_000, passes:2}`). Two-pass is fundamentally different from CRF or one-pass VBV: pass 1 analyses the entire clip and writes per-frame complexity statistics (and an mbtree macroblock-tree log), then pass 2 reads that log so the encoder can distribute the global bit budget to hit the target mean bitrate while spending bits where they matter. This requires a stateful encoder with a persistent stat file — a capability that browser WebCodecs `VideoEncoder` and the WebCodecs-rewrap engines simply do not expose, which is why only ffmpeg.wasm declares the `two-pass` feature.

ffmpeg.wasm’s adapter implements this concretely. It validates the request and only allows two-pass for libx264/libx265 with a target bitrate (`src/engines/ffmpeg-wasm/adapter.ts:2376-2389`): it rejects pass counts other than 1/2, requires `v.bitrate`, restricts to `libx264`/`libx265`, and provisions a MEMFS passlog path (`${base}.passlog`) plus cleanup of the `-0.log` and `-0.log.mbtree` artifacts. The actual two invocations are at `src/engines/ffmpeg-wasm/adapter.ts:2510-2514`: pass 1 runs with `-pass 1 -passlogfile <log> -an -sn -f null <null>` (audio/subtitles dropped, output discarded to the null muxer — the correct first-pass form), then pass 2 appends `-pass 2 -passlogfile <log>` to the real encode args, after which faststart muxing is applied (`+faststart`, lines 2517-2522). This is a genuine sum-then-copy NAL handling path (see the comment at adapter.ts:508) producing a real MP4.

The gating evidence is consistent with a real re-encode. The `ssim-psnr` oracle (`src/core/oracles.ts:1688-1832`) re-decodes the engine output with the platform decoder and compares against in-browser reference frames (no committed golden for transcode rows, the §5.2 reference path). It measured **pairs=12, ssimMean=0.99999704, ssimMin=0.99999579**, passing the scenario floor `ssimMin ≥ 0.95` (`index.ts:775`) on the *worst* frame (gate is `minSsim >= t.ssimMin`, oracles.ts:1823). The near-1.0 SSIM is physically plausible: a 2 Mbps two-pass H.264 re-encode of a 1080p clip is visually near-identical to source, so the downsampled-luma-signature SSIM is essentially 1.0. The second gate, `playback-smoke`, confirmed a real `<video>` element decoded and played frames of the output, proving the container/codec configuration record is valid and playable. Performance reflects a single-thread wasm software encoder doing two full passes over a 30 s 1080p clip: wall 85.6 s, encodeFps 10.5, throughput 0.350x realtime — slow but expected for libx264 in wasm with no hardware acceleration.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE, "engine does not declare feature 'two-pass'". Honest NA: mediabunny transcodes via WebCodecs `VideoEncoder`, which has no two-pass rate controller / stat-file mechanism, so it correctly does not advertise the feature.
- **platform@chrome-149** — NA_ENGINE, "engine does not declare feature 'two-pass'". Honest NA: the raw WebCodecs platform path supports CBR/VBR target bitrate but not two-pass ABR (`src/engines/platform/adapter.ts:272` feature list omits `two-pass`).
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "engine does not declare feature 'two-pass'". Honest NA: its declared features (`src/engines/remotion-webcodecs/adapter.ts:274`) are resize/rotate/resample/packet/metadata transforms over WebCodecs — no encoder two-pass support.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest NA: it is a demuxer; it cannot encode at all.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest NA: ISOBMFF box parser/muxer, no video encoder.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'transcode'". Honest NA: a parser; no encode capability.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:771-780` (id `h264_two_pass_bitrate`), built into a transcode scenario at `index.ts:783-804` with `input: 'h264_1080p_30s.mp4'`, op `transcode`, MP4→MP4 H.264.
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — a real, non-trivial H.264 1080p source (not synthetic/empty/mock). Confirmed via stat.
- **Oracle:** `ssim-psnr` at `src/core/oracles.ts:1688-1832` performs a real re-decode of the engine output and per-frame SSIM comparison against in-browser reference frames; the gate is on the worst-frame SSIM (`minSsim >= t.ssimMin`, line 1823) with a real measured value 0.999996. `playback-smoke` independently confirms playable output. Not trivially satisfiable.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2376-2389` (two-pass validation/provisioning) and `:2510-2514` (real `-pass 1` null-muxer pass + `-pass 2` encode). No canned output, no input→output copy, no golden short-circuit, no error swallowing — it shells real ffmpeg args twice through `this.run`.
- **Caveat on the gate (WEAK-GATE):** `measurements.exactFrames == 0`, so PSNR is reported via the digest proxy as "unavailable" and the gate rests entirely on the downsampled-luma SSIM with a relatively loose floor of 0.95 (the scenario notes acknowledge "quality loss is intentional"). The PASS is real and the SSIM (0.99999) is far above the floor, but it is a perceptual proxy, not a bit-exact or PSNR-dB-measured gate. This makes the strength of evidence WEAK-GATE rather than the strongest tier, though the verdict on *whether* it transcoded is solid.
- **Cached:** `cached == true` ("cached previous PASS result"), durationMs 261996, started 2026-06-22. The numbers are reused, not freshly re-run — minor staleness risk per the launcher-seeding caveat, but the underlying implementation and fixture are unchanged.
- **Verdict: WEAK-GATE.** Real fixture + genuine two-pass libx264 implementation + a meaningful (re-decode SSIM + playback) oracle, but the correctness gate is a perceptual proxy with exactFrames==0 and a 0.95 SSIM floor rather than a bit-exact/PSNR-measured check.

## Confidence & caveats

- Confidence: **high** on the winner selection (1 of 7 PASS, the other six are unambiguous NA_ENGINE with honest, capability-grounded reasons).
- Confidence on *strength* of the win is tempered: the gate is a perceptual proxy (WEAK-GATE), and the result is cached (n=1, mad=0, p95==median for every metric), so performance spread is unknown and the evidence is single-sample.
- peakMemory was not sampled (n=0, median 0) — no memory comparison possible.
- There is no contest, so no margin/ranking applies; the deep-technical comparison is necessarily about *why no other engine could even run* this two-pass ABR operation.
