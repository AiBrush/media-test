# transcode/mismatch_video_only_to_audio_target

family: transcode | fixture asset: `micro_h264_1frame.mp4` (real MP4, ftyp isom/avc1, single H.264 video stream, no audio track) | primaryMetric: wall | passCount: 3

## Verdict

Best framework: **mediabunny@1.48.0** — CONTESTED (3 of 7 engines PASS: mediabunny, remotion-webcodecs, ffmpeg-wasm).

This is a NEGATIVE / robustness scenario: a video-only input is fed to a transcode that requests an AAC **audio** output (`options.container='mp4', audio.codec='aac'`). The single gating oracle is `graceful-failure`; the correct behavior is a clean throw (no audio track to encode), not a crash and not a silently-emitted degenerate file. All three winners satisfy the SAME oracle with the SAME strength (a plain `Error` thrown after genuinely demuxing the input and finding zero audio tracks → "operation produced no output and did not crash/hang"). Correctness is therefore a three-way tie, so the decision falls to performance (primaryMetric = wall).

Decisive factor: **detection latency** to reach the graceful throw. mediabunny resolves in `durationMs=9`, vs remotion-webcodecs `29ms` and ffmpeg-wasm `201ms`. Margin over runner-up (remotion-webcodecs): **~3.2x faster** wall; **~22x faster** than ffmpeg-wasm. mediabunny avoids any wasm-core boot (pure-TS ESM parser, `coopCoep: not-required`), so it reads the MP4 `moov` track table and short-circuits almost immediately.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 9ms (durationMs; no bench) | n/a | n/a | n/a | cached: graceful: requested audio output but input has no audio track |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 29ms (durationMs; no bench) | n/a | n/a | n/a | cached: graceful: requested audio output but input has no audio track |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 201ms (durationMs; no bench) | n/a | n/a | n/a | cached: graceful: requested an audio output but the input has no audio track |
| platform@chrome-149 | NA_ENGINE | — | 2ms | n/a | n/a | n/a | MediaRecorder canvas-capture path is video-only, drops audio; cannot produce requested audio track |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |

Note: these are negative/robustness entries with `metrics:['wall']` only; the cached graceful results carry no `bench{}` medians, so wall is reported from `durationMs`. peakMemory/longtasks/throughput were not captured for the graceful path.

## Why the winner wins (deep technical)

For this codec/container/operation — a single-frame H.264 elementary stream in an `isom` MP4 with no `soun` (audio) track — the "transcode to AAC audio" request is logically impossible: there is no source PCM/compressed audio to feed an AAC encoder. The contest is therefore not about encode quality (no bytes are ever encoded); it is about which engine detects the impossibility correctly (a plain throw, not NA, not crash, not a fake output) and how fast.

All three winners implement the identical guard and reach the same oracle verdict:
- mediabunny: `src/engines/mediabunny/adapter.ts:1297-1298` — `if (opts.audio && !tracks.some((track) => track.isAudioTrack())) throw new Error('mediabunny transcode: requested audio output but input has no audio track')`. This runs AFTER the library has parsed the MP4 track table, so the `!isAudioTrack` test is a real inspection of the demuxed `moov`, not a static assumption.
- remotion-webcodecs: `src/engines/remotion-webcodecs/adapter.ts:845-846` — same shape, `if (opts.audio && !result.tracks.some((track) => track.type === 'audio')) throw new Error(...)`.
- ffmpeg-wasm: `src/engines/ffmpeg-wasm/adapter.ts:2208-2217` — derives `hasAudio` from `inputMetadata.tracks` produced by `runInfo` (an ffprobe-style pass over the file), then `if (opts.audio && !hasAudio) throw new Error('requested an audio output but the input has no audio track')`. The adapter comment (lines 2209-2211) is explicit that this must be a PLAIN throw, not a `NotApplicableError`, otherwise the runner would map it to NA_ENGINE and miss the graceful-reject assertion — i.e. the engine deliberately chooses to be GRADED on this case rather than opting out.

The `graceful-failure` oracle (`src/core/oracles.ts:2586-2623`) confirms PASS because (a) the scenario lists `graceful-failure` in its oracles so `hasGracefulSignal` is true, and (b) `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` — the throw left no output behind (oracles.ts:2608-2609). A silently-emitted degenerate MP4 would instead hit oracles.ts:2614-2617 and FAIL, so this gate is meaningful for the negative case.

Given identical correctness, performance decides. mediabunny's `env.configUsed` shows `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required` — there is no wasm module to instantiate and no probe subprocess; it parses the `moov` box and the missing-audio guard fires almost immediately, hence `9ms`. remotion-webcodecs (`backend: webcodecs`, streaming-backpressure) is slightly heavier on init at `29ms` (~3.2x slower). ffmpeg-wasm pays the dominant cost: it must boot the ffmpeg wasm core and run `runInfo` (a full probe pass writing the input into the MEMFS and reading log output) before it even knows there is no audio track, landing at `201ms` (~22x slower than mediabunny). For a guard that only needs the track list, that wasm-boot + MEMFS round-trip is pure overhead.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** (PASS, lost on perf): correct graceful throw at `adapter.ts:845-846`, but `29ms` vs mediabunny `9ms` — ~3.2x slower to reach the same verdict due to heavier WebCodecs/streaming init for a guard that never needs to decode.
- **ffmpeg.wasm@0.12.15** (PASS, lost on perf): correct graceful throw at `adapter.ts:2215-2216`, but `201ms` vs `9ms` — ~22x slower because it boots the wasm core and runs a full `runInfo` probe before evaluating `hasAudio`. The work is real, just unnecessary for a track-presence check.
- **platform@chrome-149** (NA_BROWSER-style NA_ENGINE): honest NA. `reason`: the platform transcode path is `<video>→canvas→MediaRecorder`, which is video-only and cannot synthesize/emit an audio track. Since the target IS an audio track, the runtime genuinely lacks the capability — this is a truthful capability gap, not an under-declaration.
- **mp4box@2.3.0** (NA_ENGINE): honest — mp4box is a parser/remuxer and does not declare the `transcode` operation at all.
- **web-demuxer@4.0.0** (NA_ENGINE): honest — a demuxer; does not declare `transcode`.
- **remotion-media-parser@4.0.479** (NA_ENGINE): honest — a parser; does not declare `transcode`.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:1578-1588` (NEGATIVE_CASES entry `mismatch_video_only_to_audio_target`), mapped via `src/scenarios/transcode/index.ts:1603-1620` (`op:'transcode'`, `oracles:['graceful-failure']`, `metrics:['wall']`).
- Fixture: `fixtures/media/micro_h264_1frame.mp4` EXISTS (5.5 KB). ffprobe confirms a single stream `index 0, codec_type=video, codec_name=h264` and NO audio stream; header is a real `ftyp isom/iso2/avc1/mp41` MP4 with a `moov` box. This is a genuine, non-synthetic, non-empty file and exactly matches the scenario's premise (video-only input).
- Oracle: `graceful-failure` at `src/core/oracles.ts:2586-2623`. It is NOT trivially satisfiable: it PASSes only on no-output-after-throw (2608-2609) or on `gracefulAllowOutput===true` (not set here), and FAILs if any output is produced (2614-2617). For this negative case it is the correct and meaningful gate.
- Winner adapter: mediabunny `src/engines/mediabunny/adapter.ts:1297-1298` — the guard inspects real demuxed tracks (`tracks.some(t => t.isAudioTrack())`) and throws a plain Error; it does NOT copy input→output, return canned bytes, short-circuit to a golden, or swallow the error as success. The throw propagates to the runner which records the graceful verdict.
- Cached note: ALL three PASS entries have `cached:true` (mediabunny startedAt 13:52Z, remotion-webcodecs 13:58Z, ffmpeg-wasm 16:48Z). The evidence is reused, not freshly re-run, so there is a staleness risk; however, the code paths are static guards (track-presence test) whose outcome cannot drift for this fixture, which limits the risk.
- Verdict: **REAL** — real video-only fixture, real demux-then-guard implementation in all three winners, and a meaningful graceful-failure oracle that would FAIL a silent degenerate output. The only caveat is cached evidence and the absence of bench medians (wall taken from durationMs).

## Confidence & caveats

Confidence: high on correctness (identical, code-verified graceful throws; meaningful oracle; real fixture). Medium on the performance ranking: the win rests on `durationMs` (9 vs 29 vs 201) because no `bench{}` block was captured for these negative entries, so there is no median/p95/mad/n spread to assess variance — single-sample timing on a graceful path is weaker evidence than a benched metric. All three PASS results are cached, adding a minor staleness caveat, though the deterministic track-presence guard makes a different outcome on re-run highly unlikely. The four NA engines all look honest (three never declare `transcode`; platform has a true video-only MediaRecorder limitation).
