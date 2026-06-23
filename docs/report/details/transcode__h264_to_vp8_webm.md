# transcode/h264_to_vp8_webm

- family: transcode
- fixture asset: `tiny_h264_360p_2s.mp4` (MP4 / H.264 video + AAC audio, 172,807 bytes, exists in `fixtures/media/`)
- target: WebM / VP8 video + Vorbis audio (`opts: { container: 'webm', video: { codec: 'vp8' }, audio: { codec: 'vorbis' } }`)
- primaryMetric: wall (TC_METRICS = wall, throughputRealtime, peakMemory, decodeFps, encodeFps, longtasks)
- oracles (default list): `ssim-psnr` then `playback-smoke` (order significant)
- passCount: 0

## Verdict

**Best framework: NONE.** No engine reached status=PASS, so by the decision procedure (only PASS engines are eligible) there is no winner — uncontested or otherwise.

- ffmpeg.wasm@0.12.15 is the *only* engine that actually executed the transcode. It produced a real VP8/Vorbis WebM whose pixels matched the reference (SSIM min 0.9701 ≥ 0.97 over 12 frames) but then **FAILED the second gate**: Chromium's `<video>` element could not play the resulting WebM/Vorbis file (`playback-smoke` failed). Because `playback-smoke` is a hard gate, the cell is FAIL despite the correct pixels.
- The three WebCodecs-class engines (mediabunny, platform, remotion-webcodecs) returned **NA_BROWSER**: Chrome 149's `WebCodecs AudioEncoder.isConfigSupported('vorbis')` returns false — the browser ships no Vorbis encoder, so the Vorbis-audio target is unreachable for any WebCodecs muxer.
- The three demux/parse-only engines (remotion-media-parser, web-demuxer, mp4box) returned **NA_ENGINE**: none declares the `transcode` operation at all.

Decisive factor: the scenario forces audio re-encode to **Vorbis**, which no in-browser WebCodecs path supports, and the one software (wasm) engine that *can* encode VP8+Vorbis emits a WebM that this Chromium build refuses to play back — so every path is blocked by either a missing capability or a playback-gate failure. No runner-up margin applies (0 PASS).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | FAIL | ssim-psnr:true, playback-smoke:false | n/a (no bench; durationMs=6924) | n/a | n/a | n/a | oracle 'playback-smoke' failed: `<video>` playback did not advance / failed to play the output |
| mediabunny@1.48.0 | NA_BROWSER | (none) | — | — | — | — | browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false) |
| platform@chrome-149 | NA_BROWSER | (none) | — | — | — | — | browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false) |
| remotion-webcodecs@4.0.479 | NA_BROWSER | (none) | — | — | — | — | browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false) |
| remotion-media-parser@4.0.479 | NA_ENGINE | (none) | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | (none) | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | (none) | — | — | — | — | engine does not declare operation 'transcode' |

Note: ffmpeg.wasm produced no `bench{}` block in this shard — the cell aborted on the failing gate, so only `durationMs` (6924 ms wall for the whole attempt, including the VP8/Vorbis encode) is recorded. No per-metric medians/p95 exist to rank.

## Why there is no winner (deep technical)

This scenario is a fully lossy A/V re-encode: H.264 (MP4) → VP8 (WebM) for video AND AAC → **Vorbis** for audio, because the WebM container cannot legally carry AAC (`assertRemuxContainerCompatible`, adapter.ts:903-914, only allows vp8/vp9/av1 video and opus/vorbis audio in WebM). The Vorbis audio requirement is the structural trap that eliminates every browser-native path.

- **WebCodecs engines (mediabunny, platform, remotion-webcodecs) — NA_BROWSER.** These engines mux through `AudioEncoder`/`VideoEncoder`. The runner negotiates capability up front, and Chrome 149's `AudioEncoder.isConfigSupported({ codec: 'vorbis' })` resolves with `supported=false` — Chromium ships an Opus encoder for WebM but no Vorbis encoder. The shard's identical reason string across all three (`browser cannot encode audio codec 'vorbis' (WebCodecs AudioEncoder.isConfigSupported=false)`) is the honest capability negotiation result, not a bug. Even though VP8 video *is* encodable via WebCodecs, the audio leg fails the config probe, so the whole transcode is declared NA_BROWSER before any work runs.

- **ffmpeg.wasm@0.12.15 — FAIL on playback-smoke.** This is the only engine with a software encoder for both legs: `libvpx` (VP8) and `libvorbis` (Vorbis) are in the vendored single-thread core (`FALLBACK_VIDEO` includes 'vp8', the audio fallback list includes 'vorbis', adapter.ts:147,154; WebM is in the container lists at 165/180). The real transcode path (`async transcode`, adapter.ts:2165) runs: it probes the input, maps tracks (`-map 0`), and execs ffmpeg to write `<scratch>.out.webm`. The budget-NA guard (`isSuiteBudgetTranscodeNa`, adapter.ts:851-893) only NAs the *large* `h264_1080p_30s.mp4` → VP8/Vorbis case (adapter.ts:875-882); this scenario deliberately uses the *tiny* `tiny_h264_360p_2s.mp4` (scenario note: "keeps the VP8/Vorbis output row inside the browser-wasm budget"), so the real encode proceeds. The output is correct in the pixel domain: `ssim-psnr` measured SSIM min 0.9701, mean 0.9708 over 12 sampled frame pairs (≥ the scenario's per-case override floor of 0.97), so the VP8 frames are perceptually faithful to the reference. But the second gate, `playback-smoke` (oracles.ts:1572-1580), feeds the produced bytes into a real `<video>` element via `ctx.playbackSmoke(ctx.output)`; the element never advanced its currentTime — Chromium failed to *play* the WebM/Vorbis blob ffmpeg.wasm produced. The most likely mechanisms: a WebM that this Chromium build's media pipeline rejects/stalls (Vorbis-in-WebM demux/decode quirk, or a muxer detail ffmpeg.wasm emits that Chrome's parser dislikes). Because `playback-smoke` is a non-negotiable gate in the default oracle list, a perfect-pixel but unplayable output is correctly scored FAIL.

- **Parse/demux engines (remotion-media-parser, web-demuxer, mp4box) — NA_ENGINE.** These libraries are parsers/demuxers, not encoders; they never declare the `transcode` operation in their capability registry, so the runner emits the honest `engine does not declare operation 'transcode'` and runs nothing.

Net: correctness exists (ffmpeg.wasm's SSIM gate passed) but is not enough to win, because no engine cleared *both* gates. The exercise's "best framework" is genuinely NONE for this codec/container/audio combination in Chrome 149.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_BROWSER. Honest: relies on WebCodecs `AudioEncoder`, and Chrome 149 reports `isConfigSupported('vorbis')=false`. No Vorbis encoder in the runtime; not an under-declaration.
- **platform@chrome-149** — NA_BROWSER. Same honest cause; the raw platform WebCodecs path has no Vorbis audio encoder.
- **remotion-webcodecs@4.0.479** — NA_BROWSER. Same honest WebCodecs Vorbis-encoder gap.
- **remotion-media-parser@4.0.479** — NA_ENGINE. Honest: a parser only, no transcode operation declared.
- **web-demuxer@4.0.0** — NA_ENGINE. Honest: a demuxer only, no transcode operation declared.
- **mp4box@2.3.0** — NA_ENGINE. Honest: an MP4 box parser/builder, no encode/transcode operation declared.
- **ffmpeg.wasm@0.12.15** — FAIL. Did the real work (VP8+Vorbis encode, SSIM min 0.9701/mean 0.9708 over 12 frames PASS), but its WebM output failed `playback-smoke`: Chromium `<video>` did not advance on the file. Pixel-correct, playback-broken.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:99-111` — `id: 'h264_to_vp8_webm'`, `asset: 'tiny_h264_360p_2s.mp4'`, real H.264/AAC → WebM/VP8/Vorbis, tolerances `{ ssimMin: 0.97, psnrMinDb: 36 }` (a per-case override of the family default 0.99/40, intentionally relaxed for VP8). Note explains the tiny asset choice to stay inside the wasm budget.
- **Fixture:** `fixtures/media/tiny_h264_360p_2s.mp4` exists, 172,807 bytes — a real, non-empty MP4. Not synthetic/mock.
- **Winner adapter (the only engine that ran):** ffmpeg.wasm `transcode()` at `src/engines/ffmpeg-wasm/adapter.ts:2165` execs a genuine ffmpeg encode (`-map 0`, real `libvpx`/`libvorbis` via the vendored wasm core) writing `<scratch>.out.webm`, then `readBinary(outName)`. No canned output, no input→output copy, no golden short-circuit — and the budget-NA guard (adapter.ts:851-893) explicitly does NOT apply to this tiny asset, confirming a real encode took place (6924 ms, plausible for a 2s 360p VP8 SW encode).
- **Oracles:** `ssim-psnr` (oracles.ts:1686+) does a real reference-frame SSIM comparison — measured SSIM mean 0.9708, min 0.9701 over 12 pairs (physically plausible for a VP8 re-encode of a real clip; not a wide-open tolerance). Note: `exactFrames=0` because no committed golden pixels exist for this lossy case, so SSIM alone is a *perceptual proxy* — but here it is backed by the second hard gate. `playback-smoke` (oracles.ts:1572-1580) feeds output bytes to a real `<video>` element; it correctly failed because the file would not play.
- **Cached:** ffmpeg.wasm result `cached` field is absent/false in the shard (no staleness risk); the run carries `startedAtIso` 2026-06-22T17:37:22Z and `durationMs` 6924, consistent with a fresh execution.

**validationVerdict: REAL.** Real fixture, real ffmpeg.wasm encode path, meaningful dual-gate oracle. The FAIL is a genuine playback failure on a pixel-correct file, and the four NA results are honest capability declarations (no Vorbis WebCodecs encoder; parsers don't declare transcode). No mock data, faked output, or unfailable oracle anywhere. The outcome (0 PASS) is a true reflection of Chrome 149's inability to either encode Vorbis (WebCodecs) or play back ffmpeg.wasm's VP8/Vorbis WebM.

## Confidence & caveats

- **Confidence: high.** Every status is explained by code I read: the Vorbis WebCodecs gap (NA_BROWSER), undeclared transcode op (NA_ENGINE), and the ssim-pass/playback-fail split (FAIL) are all consistent with the adapter and oracle implementations.
- Caveat: the playback failure root cause is inferred (Chromium rejecting ffmpeg.wasm's VP8/Vorbis WebM) — the shard records only "playback did not advance", not the decoder-level error. A deeper diagnosis would require the browser media-pipeline log.
- Caveat: ffmpeg.wasm produced no `bench{}` block (the cell aborted on the failing gate), so no performance ranking is possible — moot here since passCount=0.
- The SSIM gate uses a reference-frame proxy (`exactFrames=0`, expected for a lossy transcode with no committed golden); it is meaningful but not bit-exact, by design for this family.
