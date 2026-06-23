# transcode/gapless_pcm_to_opus_priming

family: transcode | fixture asset: `wav_s16.wav` (PCM s16 WAV, 960,044 bytes) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- Best framework: **remotion-webcodecs@4.0.479** (CONTESTED — 2 engines PASS).
- Correctness is a dead tie: both passing engines satisfied the identical oracle set (`property-invariant` transcode-output-metadata + `playback-smoke`) with the identical measured `durationDeltaSec = 0.0200s` against a `durationToleranceSec = 0.12s` band, and identical `audioTracks = 1`. No bit-exact / PCM-decode oracle gates this scenario, so correctness cannot separate them.
- Decisive factor: **performance / main-thread responsiveness**. remotion-webcodecs wins on wall median (63.885 ms vs 67.395 ms = **1.06x faster**) and decisively on long-task blocking time (1007 ms vs 2907 ms = **2.89x lower / 0.35x**). mediabunny's `peakMemory` was not sampled (n=0), so it cannot claim a memory win; remotion-webcodecs reported a real `peakMemory = 40.6 MB`.
- Margin over runner-up (mediabunny): wall 1.06x, longtasks 2.89x.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true, playback-smoke:true | 63.885 ms | n/a | 40,617,630 B | 1007 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 67.395 ms | n/a | 0 (n=0, unmeasured) | 2907 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | transcode NA: MediaRecorder canvas-capture path is video-only, drops audio, cannot produce the requested audio track |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode NA: libopus encode in vendored wasm traps/exceeds timeout; Opus encode not declared reliable |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' (parser-only) |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' (demux/box-only) |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' (demux-only) |

## Why the winner wins (deep technical)

This scenario is a **gapless PCM→Opus re-encode with container change**: input is interleaved PCM s16 in a RIFF/WAV container; output is Opus in a WebM (Matroska) container at a requested 128 kbps. Opus is a CELT/SILK hybrid codec that mandates a fixed encoder pre-skip (the ~6.5 ms / 312-sample priming at 48 kHz declared in the WebM `CodecDelay`/`SeekPreRoll` and OpusHead pre-skip). That priming shifts the decoded-sample duration of any correct Opus encode relative to the source PCM duration, which is exactly why the scenario pins a relaxed `durationToleranceSec = 0.12s` band (`src/scenarios/transcode/index.ts:1659-1660`) instead of the strict per-frame duration check. Both winners produced output whose probed duration sat only `0.0200s` off the source — comfortably inside the band — proving the priming was emitted and accounted for, not silently truncated.

remotion-webcodecs reaches the output through `@remotion/webcodecs` `convertMedia()` (`src/engines/remotion-webcodecs/adapter.ts:615-627`), which parses the WAV with media-parser, decodes PCM, and drives a real `AudioEncoder` for `audioCodec: 'opus'` (the canonical→remotion audio map at `adapter.ts:549-551`, encode union limited to aac/opus/pcm at `adapter.ts:265`), muxing into WebM via the `bufferWriter` in-memory writer (`adapter.ts:624`). Its `configUsed` is `backend: webcodecs`, `pipeline: streaming-backpressure`, `queueDepth: waitForQueueToBeLessThan`, `worker: convert=main-thread; extractFrames/parse=worker-capable`. The decisive mechanism is the **back-pressure pump**: `waitForQueueToBeLessThan` throttles how many AudioData frames are queued into the encoder per macrotask, so the encode work is sliced into many short tasks. That is precisely why its `longtasks` total is only **1007 ms** — the main thread is yielded between chunks even though the convert runs on the main thread.

mediabunny reaches the same output through its `Conversion` API (read→decode→encode→mux, `src/engines/mediabunny/adapter.ts:49`), `configUsed.pipeline: streaming-lockstep`, `backend: webcodecs`, `coopCoep: not-required`. Its audio-options builder deliberately does NOT pin `bitrate=QUALITY_HIGH` for same-codec audio (`adapter.ts:26-28`) — but here the codec changes (PCM→Opus), so mediabunny's re-encode branch supplies its own QUALITY_HIGH-derived Opus bitrate and runs a genuine AudioEncoder. mediabunny's correctness is identical; it loses only on the lockstep pump, which interleaves decode/encode/mux in larger synchronous bursts. The result is `longtasks = 2907 ms` — **2.89x** more main-thread blocking than remotion-webcodecs — and a slightly higher wall median (67.395 vs 63.885 ms). Note this is a PCM source, so neither engine could take an Opus copy fast-path; both did equal real encode work, isolating scheduling as the differentiator. Evidence quality caveat: every passing run is `n=1` (single sample, `mad=0`, `p95==median`), and both results are `cached==true`, so the wall gap (1.06x) is within plausible single-sample noise; the longtasks gap (2.89x) is large enough to be the credible decider.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost): correctness tied (same two oracles, same `durationDeltaSec=0.0200`), but its `streaming-lockstep` Conversion pump produced 2907 ms of long tasks vs remotion's 1007 ms (2.89x worse) and a 67.395 ms wall vs 63.885 ms (1.06x slower). Its `peakMemory` is `0` with `n=0` (unsampled), so it cannot even claim the memory dimension.
- **platform@chrome-149** (NA_ENGINE): honest NA. The platform transcode path encodes via `<video>→canvas→MediaRecorder`, a video-only capture pipeline that drops the audio track; it physically cannot emit the requested single Opus audio track. NA is correct, not an under-declared capability.
- **ffmpeg.wasm@0.12.15** (NA_ENGINE): honest NA. The vendored wasm core's libopus encode path traps or blows the suite timeout, so Opus encode is not declared as a reliable transcode target. This is a real runtime limitation of the build, not a missing declaration to game.
- **remotion-media-parser@4.0.479** (NA_ENGINE): honest NA — a demux/parse-only engine that does not declare the `transcode` operation. No encoder exists.
- **mp4box@2.3.0** (NA_ENGINE): honest NA — box/demux-only library, no transcode operation. (Also could not write WebM/Opus anyway.)
- **web-demuxer@4.0.0** (NA_ENGINE): honest NA — demux-only, no `transcode` operation declared.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:1646-1661` (`id: 'transcode/gapless_pcm_to_opus_priming'`, `op: 'transcode'`, `input: 'wav_s16.wav'`, `options: withOutputMetadataInvariant({ container: 'webm', audio: { codec: 'opus', bitrate: 128000 } })`, tolerance `TC_AUDIO_PRIMING_TOLERANCE_SEC = 0.12` at line 28).
- Fixture: `fixtures/media/wav_s16.wav` — EXISTS, 960,044 bytes. A real PCM s16 WAV, not synthetic/empty/mock.
- Gating oracle: `src/core/oracles.ts:3631-3708` (transcode-output-metadata branch of `property-invariant`). It re-probes the produced bytes with the reference engine (`oracles.ts:3641`), compares container (`:3655`), duration against the source with the priming-relaxed band (`:3659-3677`), and the requested audio track shape (`:3692-3699`). `playback-smoke` (`oracles.ts:1572-1578`) actually plays a few frames of the output `<video>`. Measurements are physically plausible: `durationDeltaSec=0.0200` is a textbook Opus-priming offset, `audioTracks=1` matches the request.
- Winner adapter: `src/engines/remotion-webcodecs/adapter.ts:521-576` (transcode entry) → `:579-635` (`convert()` calling real `wc.convertMedia({ container:'webm', audioCodec:'opus', ... })`). This is a genuine WebCodecs AudioEncoder Opus encode + WebM mux; no canned output, no input→output copy (PCM cannot be copied into Opus), no golden short-circuit, no error swallowing (errors throw, e.g. `adapter.ts:550`).
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the encode is genuine, but the gate is structural-metadata + smoke only — there is NO decoded-audio-PCM / bit-exact oracle verifying the Opus samples actually reconstruct the source signal. The duration band (0.12s) is wide by design (to absorb priming), so a structurally-correct-but-degraded encode would still pass. PASS is real; correctness strength is the second-weakest rung (structural + smoke), not bit-exact.
- Cached note: BOTH passing results are `cached==true` ("cached previous PASS result"). Numbers were reused, not re-run; staleness risk applies, and per the launcher-seeding caveat, raw + .browser-cache should be cleared for an honest fresh re-measure before trusting the 1.06x wall margin.

## Confidence & caveats

- Correctness ordering between the two PASS engines is genuinely indistinguishable; the win rests entirely on performance, and specifically on the 2.89x longtasks margin (the wall 1.06x margin is within single-sample noise).
- Every bench is `n=1` with `mad=0` and both results cached — low statistical weight. A fresh, multi-sample re-run could narrow or flip the wall ordering, though the longtasks gap is large enough to likely persist.
- mediabunny's `peakMemory` is unmeasured (n=0); a memory comparison is impossible.
- The scenario is a WEAK-GATE: no signal-level audio fidelity check, so neither engine's Opus quality at 128 kbps is actually verified beyond duration + playability.
