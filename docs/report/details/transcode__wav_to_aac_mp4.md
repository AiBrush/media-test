# transcode/wav_to_aac_mp4

family: transcode | fixture asset: fixtures/media/wav_s16.wav (PCM s16 WAV, ~960 KiB, exists) | primaryMetric: wall (ms, lower better) | passCount: 3 of 7

## Verdict

Best framework: **mediabunny@1.48.0** — CONTESTED (3 of 7 engines PASS: mediabunny, remotion-webcodecs, ffmpeg-wasm; all three pass the identical oracle pair).

Decisive factor: correctness is a tie (all three pass exactly `property-invariant` [transcode-output-metadata] + `playback-smoke`, with no stronger oracle on this audio row), so the win goes to **performance**. mediabunny has the lowest wall and highest realtime throughput.

Margin over runner-up (remotion-webcodecs): **1.11x faster wall** (39.865 ms vs 44.315 ms) and **1.11x higher realtime throughput** (125.42x vs 112.83x). Against ffmpeg-wasm the gap is large: **4.56x faster wall** (39.865 ms vs 181.74 ms) and **4.56x throughput** (125.42x vs 27.51x). Note: all benches are n==1 (single sample, mad==0), so the wall/throughput ranking is weak-evidence on spread, but the ordering is monotone and the ffmpeg gap is far outside any plausible single-sample noise.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 39.865 ms | 125.42x | 31,511,557 B | 12,909 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true, playback-smoke:true | 44.315 ms | 112.83x | 0 (n=0) | 1,192 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | 181.740 ms | 27.51x | 0 (n=0) | 12,909 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | MediaRecorder canvas-capture path is video-only and drops audio; cannot produce the requested audio track |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Oracle measurements (property-invariant durationDeltaSec vs tolerance 0.12 s, all PASS, audioTracks==1):
- mediabunny: durationDeltaSec 0.0773 s
- remotion-webcodecs: durationDeltaSec 0.0560 s
- ffmpeg-wasm: durationDeltaSec 0.0000 s (exact duration)

## Why the winner wins (deep technical)

The operation is a **container+codec transcode**: decode PCM-s16 from a RIFF/WAVE container and re-encode to **AAC-LC in an MP4 (faststart) container at 192 kbps** (`opts: { container:'mp4', audio:{ codec:'aac', bitrate:192000 } }`, src/scenarios/transcode/index.ts:344-351). Because the source is uncompressed PCM, there is no demux-decode cost on the read side worth speaking of — the whole cost is (a) feeding f32/s16 samples into an encoder and (b) muxing AAC access units into an MP4 `moov`/`mdat`.

mediabunny ran on the **WebCodecs backend with `hwAccel: prefer-hardware`, a pure-TS ESM core, `pipeline: streaming-lockstep`, no SharedArrayBuffer and `coopCoep: not-required`** (env.configUsed). Its transcode path is the mediabunny `Conversion` API: `mb.Conversion.init(opts)` → `conversion.isValid` guard → `conversion.execute()` → bytes pulled from a `BufferTarget` (src/engines/mediabunny/adapter.ts:842-868). The audio options are built honestly in `buildAudioOptions` (src/engines/mediabunny/adapter.ts:672-692): codec mapped through `canonicalToMediabunnyAudio`, and `opts.bitrate = 192000` set because the caller pinned it — which forces mediabunny's genuine AAC **re-encode** branch (`trackOptions.bitrate ?? QUALITY_HIGH`) rather than a same-codec copy fast-path (copy is impossible here anyway: PCM-s16 → AAC). The AAC encode itself is the browser's native AudioEncoder running on M1 Max hardware, so the encoder is essentially free; mediabunny's advantage is the thin, allocation-light streaming muxer that writes the AAC frames straight into the MP4 `BufferTarget` without an extra wasm FS round-trip. Result: **wall 39.865 ms, 125.42x realtime**, the fastest of the three.

remotion-webcodecs uses the same native WebCodecs encoder (env.configUsed backend `webcodecs`, `hwAccel: prefer-hardware(+software fallback)`, `pipeline: streaming-backpressure`, `bufferWriter`) and lands essentially the same correctness (durationDelta 0.0560 s, even tighter than mediabunny's 0.0773 s). It is only **1.11x slower** on wall (44.315 ms) — a near-tie that on n==1 is within the realm of scheduling noise, but mediabunny is consistently ahead and also reports the lower longtask budget is the only knock against it (mediabunny 12,909 ms longtasks vs remotion 1,192 ms). On the primary metric (wall) mediabunny wins; remotion-webcodecs is the legitimate runner-up.

ffmpeg.wasm is correct (durationDelta exactly 0.0000 s — the most accurate duration of the three) but pays the **single-thread wasm tax**: no WebCodecs/no hardware AAC encoder, the AAC encode runs entirely in scalar wasm inside the Emscripten VM, plus a virtual-FS write/read of the input WAV and output MP4. That makes it **4.56x slower** (181.74 ms, 27.51x realtime) and gives it the same heavy 12,909 ms longtask budget as mediabunny but with one quarter the throughput. Strong correctness, weak performance — loses on the decisive metric.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** (PASS, runner-up): correct (property-invariant + playback-smoke, durationDelta 0.0560 s) but 1.11x slower wall (44.315 ms vs 39.865 ms) and 1.11x lower throughput (112.83x vs 125.42x). Lost on the primary metric by a thin, single-sample margin.
- **ffmpeg.wasm@0.12.15** (PASS): correct and most duration-accurate (durationDelta 0.0000 s) but 4.56x slower wall (181.74 ms) and 4.56x lower throughput (27.51x) because the AAC encode + muxing run in single-thread wasm with no hardware encoder and a virtual-FS round-trip. Lost on performance.
- **platform@chrome-149** (NA_ENGINE): honest NA. Its only transcode path is `<video>→canvas→MediaRecorder`, which is video-only and structurally drops audio (src/engines/platform/adapter.ts:14, :24, :232 — "LIMITED … lossy/real-time/video-only"). It physically cannot emit the requested AAC audio track, so it declines rather than fake an audio output. NOT an under-declared capability.
- **mp4box@2.3.0** (NA_ENGINE): honest. mp4box.js is an ISOBMFF box parser/segmenter/remuxer with no encoder; it does not declare the `transcode` operation. PCM→AAC re-encode is genuinely out of scope.
- **web-demuxer@4.0.0** (NA_ENGINE): honest. A demux-only (ffmpeg-wasm-backed) reader; does not declare `transcode` — no encode/mux side.
- **remotion-media-parser@4.0.479** (NA_ENGINE): honest. A parser/probe library; does not declare `transcode` — no encoder.

## Anti-cheat validation

- Scenario: src/scenarios/transcode/index.ts:344-351 (`id: 'wav_to_aac_mp4'`, asset `wav_s16.wav`, from wav/pcm-s16 → mp4/aac @192 kbps). The shared builder for audio cases documents the gating rationale at src/scenarios/transcode/index.ts:324-329 ("reference-probe the produced bytes, assert the requested container/codec/channel shape, keep duration within a small priming band for lossy targets" + playback smoke).
- Fixture: `fixtures/media/wav_s16.wav` exists (~960 KiB, real PCM-s16 RIFF/WAVE). Not synthetic/empty/mock.
- Gating oracle: `transcodeOutputMetadataInvariant` at src/core/oracles.ts:3626-3708. It is REAL: it reference-probes the actual produced `ctx.output` bytes via `ctx.referenceEngine.probe(...)` (oracles.ts:3641), asserts output container == requested (mp4), checks duration delta against a tolerance band (here 0.12 s) using the source golden duration, and asserts the requested audio track exists with matching shape (oracles.ts:3692-3700). It cannot pass on a container/codec mismatch or on a missing audio track. `playback-smoke` (oracles.ts:1574-1580) additionally loads the output in a real `<video>` element and confirms playback advances.
- Winner adapter: src/engines/mediabunny/adapter.ts:842-868 (`runConversion`: real `mb.Conversion.init/execute`, isValid guard, BufferTarget bytes) and :672-692 (`buildAudioOptions`: real codec map + 192 kbps re-encode, no copy short-circuit possible PCM→AAC). No canned output, no input→output copy, no golden short-circuit, no swallowed errors.
- Measurements are physically plausible: audioTracks==1, durationDelta 0.0773 s (mediabunny) / 0.0560 s (remotion) / 0.0000 s (ffmpeg) all within the 0.12 s priming band expected for a lossy AAC encoder's encoder-delay/priming.
- Cached note: the winner's result has **cached==true** ("cached previous PASS result") — all three PASS rows are cached, re-used not re-run, so there is staleness risk on the exact wall/throughput numbers. The ranking is robust to this since the ffmpeg gap is 4.56x and the correctness verdicts do not depend on timing.

Verdict: **WEAK-GATE**. The implementation, fixture, and oracle are all REAL (genuine `Conversion`-based AAC re-encode, real WAV fixture, real reference-probe of output bytes), but the strongest gate on this audio row is a metadata/duration invariant plus a playback smoke check — there is **no decoded-audio-PCM bit-exact or golden-packet oracle** asserting the AAC payload is actually a faithful re-encode of the PCM source. A transcode that produced silent or garbled AAC of the right duration/container/track-shape would still pass. The PASS is genuine but not a strong correctness proof.

## Confidence & caveats

Confidence: **medium**. The NA/PASS partition is unambiguous and the engine ranking is clear (mediabunny fastest, remotion next, ffmpeg far behind). Caveats: (1) all benches are n==1 with mad==0, so the mediabunny-vs-remotion margin (1.11x) is within single-sample noise — these two are effectively co-leaders on correctness and near-tied on speed, mediabunny edging it on the primary wall metric; (2) all PASS results are cached, so the precise timing numbers may be stale; (3) the gate is a metadata/duration invariant + smoke, not an audio-fidelity oracle (WEAK-GATE), so "best" here means "fastest engine that produces a correctly-shaped, playable mp4/aac", not "produces the most faithful AAC".
