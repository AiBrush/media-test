# transcode/mismatch_audio_only_to_video_target

family: transcode | fixture asset: `wav_s16.wav` (audio-only PCM, exists in fixtures/media/, ~960 KB) | primaryMetric: (none in shard; durationMs only) | passCount: 3 / 7

## Verdict

Best framework: **remotion-webcodecs@4.0.479** (CONTESTED — 3 engines PASS).

This is a *negative / robustness* scenario: the input is an audio-only WAV and the requested operation is a **video-targeting transcode** (`options: { container: 'mp4', video: { codec: 'h264' } }`). The correct behaviour is a clean throw (no video track to encode); silently emitting a degenerate file is a FAIL. All three winners pass the single gating oracle `graceful-failure` with identical strictness (each: "operation produced no output and did not crash/hang"). Because correctness strength is a dead tie (one and the same oracle, same detail string), the tiebreak falls to **performance / latency to reject**.

Decisive factor: latency-to-reject. remotion-webcodecs returns its graceful throw in **durationMs = 8 ms**, vs mediabunny **10 ms** and ffmpeg-wasm **155 ms**. Margin over runner-up: **1.25x faster than mediabunny** (10/8), and **19.4x faster than ffmpeg-wasm** (155/8). All three results are `cached==true`; there is no `bench{}` block for this scenario, so the margin rests on single cached `durationMs` samples (weak evidence — see caveats).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | — (durationMs 8) | — | — | — | cached: graceful: requested video output but input has no video track |
| mediabunny@1.48.0 | PASS | graceful-failure:pass | — (durationMs 10) | — | — | — | cached: graceful: requested video output but input has no video track |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | — (durationMs 155) | — | — | — | cached: graceful: requested a video output but the input has no video track |
| platform@chrome-149 | NA_ENGINE | — | — (durationMs 21) | — | — | — | transcode is NA — source carries audio; MediaRecorder canvas-capture path cannot preserve/copy audio |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

No `bench{}` object is present in any engine entry for this scenario; the only timing signal is `durationMs`. throughputRealtime / peakMemory / longtasks are unavailable.

## Why the winner wins (deep technical)

The fixture `wav_s16.wav` is a genuine RIFF/WAVE file: header bytes `52 49 46 46 ... 57 41 56 45 66 6d 74 20`, `fmt ` chunk = PCM (audioFormat 0x0001), 2 channels, sample rate 0x0000BB80 = 48000 Hz, 16-bit (`s16`), followed by a `data` chunk. There is **no video track and no codec-config that any H.264 encoder could draw frames from**. The operation asks for an MP4 with an H.264 *video* stream, so a faithful engine must detect "video requested, no video source" and refuse.

remotion-webcodecs implements exactly that guard. In `src/engines/remotion-webcodecs/adapter.ts:843` the transcode path throws a plain `Error("...transcode: requested video output but input has no video track")` once track detection finds no video stream — *before* spinning up a `VideoEncoder` or writing any container bytes. Because it is a plain `Error` (not a `NotApplicableError`), the runner catches it and routes to the `graceful-failure` oracle, which returns PASS via the `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` branch (`src/core/oracles.ts:2608-2609`). The shard records `durationMs: 8`, the lowest of the three — the rejection happens on the parse/track-enumeration step before any encoder/muxer allocation. The adapter's configured backend (`env.configUsed.backend: "webcodecs"`, `pipeline: "streaming-backpressure"`, `worker: "convert=main-thread"`) never gets exercised here because the guard fires first; the speed advantage is precisely that the track check short-circuits ahead of any WebCodecs/worker setup.

mediabunny does the same thing but a hair slower (10 ms). In `src/engines/mediabunny/adapter.ts:1293-1296` it calls `await mbInput.getTracks()` and throws `"mediabunny transcode: requested video output but input has no video track"` when `!tracks.some(t => t.isVideoTrack())`. Note it pays a small extra cost relative to remotion-webcodecs: it first constructs the output format/`Output` object (`adapter.ts:1285-1289`) and *then* opens the input and enumerates tracks inside the try block, so the extra ~2 ms is plausibly the format/output allocation done before the guard.

ffmpeg-wasm is correct but an order of magnitude slower (155 ms). In `src/engines/ffmpeg-wasm/adapter.ts:2206-2214` it runs `runInfo(...)` (an ffprobe-equivalent log scrape) to build `inputMetadata.tracks`, computes `hasVideo`, and throws `"requested a video output but the input has no video track"`. The 155 ms is dominated by the wasm round-trip: it must `writeInput` the ~960 KB WAV into the MEMFS scratch filesystem and invoke the ffmpeg binary to probe it (`runInfo`) before the guard can evaluate `hasVideo`. That FS write + wasm probe is exactly the ~19x latency gap over the pure-JS track enumeration the two WebCodecs-family engines use.

So the mechanistic story for THIS case is not about transcode quality (no output is ever produced) but about *how cheaply each engine can prove the input has no video track*: pure-JS demuxer track enumeration (remotion-webcodecs, mediabunny) beats a wasm filesystem-write + ffprobe pass (ffmpeg-wasm). remotion-webcodecs edges mediabunny by deferring all allocation until after the guard.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, but lost on latency: 10 ms vs 8 ms (0.8x the speed of the winner). Functionally identical correct guard at `adapter.ts:1294-1296`; the ~2 ms gap is plausibly the `Output`/format object built at `adapter.ts:1285-1289` before the track check. Weak basis for the loss (cached n=1).
- **ffmpeg.wasm@0.12.15** — PASS, but 155 ms (19.4x slower than winner). Correct guard at `adapter.ts:2212-2213`, but it must write the 960 KB WAV into MEMFS and run an ffprobe-style pass (`runInfo`) to enumerate tracks before rejecting — wasm FS + probe overhead.
- **platform@chrome-149** — NA_ENGINE (`durationMs 21`). Reason: "transcode is NA — the source fixture carries audio and the MediaRecorder canvas-capture path cannot preserve or copy audio." This NA looks **honest**: the platform encode path is `<video>→canvas→MediaRecorder` (`env.configUsed.encode`), which is video-only by construction and cannot represent audio; declaring NA rather than fabricating a degenerate video is the correct, non-cheating choice.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest — a parser-only library, no encode/mux capability.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest — a demuxer, no transcode op.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'." Honest — a box parser/segmenter, no transcode op.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:1568-1577` (`id: 'mismatch_audio_only_to_video_target'`, `asset: 'wav_s16.wav'`, `options: { container: 'mp4', video: { codec: 'h264' } }`, notes: "Audio-only input → VIDEO-targeting transcode … Expect a clean throw … throw=PASS; silently emitting a degenerate file=FAIL").
- Fixture: `fixtures/media/wav_s16.wav` exists (~960 KB) and is a real RIFF/WAVE PCM file (header verified: `RIFF…WAVE`, fmt PCM, 2ch, 48 kHz, s16, real `data` chunk). Not synthetic/empty/mock.
- Gating oracle: `graceful-failure` at `src/core/oracles.ts:2586-2623`. It PASSes only when the op produced no output AND did not crash/hang (line 2608-2609), and explicitly FAILs if a malformed/mismatched input *produced* output (line 2614-2617). It is not trivially satisfiable — emitting a degenerate MP4 would FAIL.
- Winner adapter: `src/engines/remotion-webcodecs/adapter.ts:843` throws a real plain `Error` after genuine track detection, before any encoder/muxer runs. Verified the other two PASS guards are equally real: mediabunny `adapter.ts:1294-1296` (`getTracks()` + `isVideoTrack()`), ffmpeg-wasm `adapter.ts:2206-2213` (real ffprobe-style `runInfo` track scrape). No canned output, no input→output copy, no golden short-circuit, no swallowed error reported as success.
- Verdict: **REAL**. Real fixture + real implemented rejection paths + a meaningful, non-trivial oracle that would FAIL on a fabricated output. The only soft spot is evidentiary, not behavioural: all three PASS results are `cached==true` (reused, not re-run this session), and there is no `bench{}`, so the perf tiebreak rests on single cached `durationMs` values.

## Confidence & caveats

- Confidence: **medium**. The correctness verdict (all three correctly reject) is high-confidence and code-verified. The *ranking* among the three is low-confidence: it is a perf tiebreak on a negative-path scenario where all three do essentially the same cheap thing, decided by 8 ms vs 10 ms vs 155 ms.
- All three winners are `cached==true`: the durations are reused from prior runs (remotion-webcodecs startedAt 2026-06-22T16:43, mediabunny 14:03, ffmpeg-wasm 16:34) and were not re-measured together under identical conditions. Treat the 8-vs-10 ms gap as within noise; the 155 ms vs ~9 ms gap (ffmpeg-wasm) is large enough to be real and is mechanistically explained (wasm FS + probe).
- No `bench{}` / throughputRealtime / peakMemory / longtasks are recorded for this scenario, so the standard performance ladder could not be applied beyond `durationMs`.
- This scenario tests *graceful rejection*, not transcode quality — the "winner" is the engine that refuses fastest and cleanest, not the best transcoder.
