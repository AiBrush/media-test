# audio-dsp/throughput_encode_s24

family: audio-dsp | fixture asset: `fixtures/media/wav_f32.wav` (1.9 MB, real) | primaryMetric: framesPerSec | passCount: 2 / 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- **CONTESTED**: 2 engines PASS (`ffmpeg-wasm`, `mediabunny`). Both satisfy the *exact same* gating oracle (`property-invariant` / `transcode-output-metadata`) with *identical* measurements (`durationDeltaSec=0`, `audioTracks=1`, container `wav`). Correctness is therefore a tie.
- **Decisive factor: performance (wall time)**. The primary metric `framesPerSec` was never sampled (n=0, median 0) for either engine on this encode case, so the decision falls to `wall` median. ffmpeg-wasm = **20.57 ms** vs mediabunny = **41.27 ms** → **ffmpeg-wasm is ~2.01x faster on wall**. (mediabunny did not sample peakMemory at all, n=0; ffmpeg-wasm reports 71.7 MB peak — that is the one axis where mediabunny would have an *unmeasured* advantage, so the win rests on wall time.)
- **Margin: 1.99x–2.01x faster wall** (41.275 ms / 20.570 ms = 2.007). Evidence strength is **weak on sample count**: both engines have `wall.n == 1` and `mad == 0` (single timed iteration), and both results are `cached==true`.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory (bytes) | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 20.570 | n/a (not collected) | 71,746,855 | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 41.275 | n/a (not collected) | 0 (n=0, unmeasured) | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-f32' |

(throughputRealtime / longtasks are not present in this shard's bench block; bench carries `framesPerSec`, `decodeFps`, `wall`, `peakMemory` only.)

## Why the winner wins (deep technical)

This scenario is a **standalone ENCODE throughput probe** (`kind:'encode'`, op `transcode`): take a real **32-bit float PCM WAV** (`wav_f32.wav`, codec `pcm-f32`) and re-encode it to **24-bit signed PCM in a WAV container** (`opts: { container:'wav', audio:{ codec:'pcm-s24' } }`, `src/scenarios/audio-dsp/index.ts:367-377`). There is no video, no perceptual codec — the work is purely a sample-format conversion (f32 → s24) and a WAV header/`data`-chunk rewrite. The gate is structural: output container == `wav`, exactly 1 audio track, and output duration within ±1 frame of the source.

**ffmpeg.wasm path (genuine encode).** The adapter's `transcode()` writes the real fixture bytes into MEMFS, probes the input, then for an audio-only request builds a true encode command line: `-c:a` is set to the encoder resolved from the canonical codec map (`pcm-s24` → `pcm_s24le`, `src/engines/ffmpeg-wasm/codecs.ts:41`) at `src/engines/ffmpeg-wasm/adapter.ts:2468-2472`, with `-map 0` selecting the source audio track. The command runs through the single-thread wasm core (`coreBuild` single-thread default per the adapter header note at lines 10-39), and the output WAV bytes are read back from MEMFS via `readBinary(outName)` and returned as a real `MediaBytes` (line 2257-2258 / 2202). Nothing is copied or canned — this is libavformat WAV muxing of a libavcodec `pcm_s24le`-encoded stream. Because the conversion is integer-format-narrowing PCM (no entropy coder, no psychoacoustic model), the wasm CPU cost is dominated by a linear pass over the 1.9 MB sample buffer; ffmpeg's tight C inner loop in wasm finishes the timed iteration in **20.57 ms**.

**mediabunny path (also genuine).** mediabunny uses its high-level `Conversion` API (`Conversion.init/.execute`, `src/engines/mediabunny/adapter.ts:80-127, 841-861`), building `ConversionAudioOptions` from the audio block (`buildAudioOptions`, lines 672-692): the canonical `pcm-s24` is mapped through `canonicalToMediabunnyAudio` and the WAV `OutputFormat` is selected with a `BufferTarget`. env.configUsed shows backend `webcodecs`, `pipeline:'streaming-lockstep'`, `coopCoep:'not-required'`, `sharedArrayBuffer:false`. For PCM there is no WebCodecs encoder involved (PCM is not a WebCodecs audio codec), so mediabunny does the f32→s24 conversion in its own TS/JS sample path and muxes via its pure-TS-ESM core. That JS-side per-sample conversion and buffering is why mediabunny's wall (**41.275 ms**) is ~2x the ffmpeg.wasm C-in-wasm time, even though mediabunny avoids a MEMFS round-trip and a separate process model.

**Net:** identical correctness verdict (the oracle only checks shape/duration/track-count, which both hit exactly — `durationDeltaSec=0`), so the C-optimized PCM rewrite in ffmpeg.wasm wins purely on the **2.01x wall margin**. The peakMemory comparison is unusable here because mediabunny reported `peakMemory.n==0` (not sampled); ffmpeg.wasm's 71.7 MB is the only memory number on record and counts mildly *against* it, but wall time is the decisive, measured axis.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed, lost on performance only: **2.01x slower wall** (41.275 ms vs 20.570 ms). Its JS-side f32→s24 sample conversion plus pure-TS WAV muxing is slower than ffmpeg's wasm C loop for this format-narrowing PCM job. Correctness is a genuine tie (same oracle, same measurements). Caveat: peakMemory unmeasured, so a memory-based reversal cannot be ruled out.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest: mp4box.js is an ISO-BMFF box parser/segmenter, not an encoder; it cannot produce a WAV PCM stream.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'". Honest: the WebCodecs/MediaRecorder platform path has no WAV muxer; it cannot emit a WAV `data` chunk for PCM-s24.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest: it is a media *parser/demuxer*, read-only, no encode/mux.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest: a demux-only wasm wrapper; no encoder surface.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare audio codec 'pcm-f32'". Honest: PCM is not a WebCodecs audio codec, so a WebCodecs-based engine cannot decode the f32 PCM *input*; the NA is on the input codec, which is correct.

## Anti-cheat validation

- **Scenario**: `src/scenarios/audio-dsp/index.ts:367-377` (case `throughput_encode_s24` in `THROUGHPUT_CASES`, materialized at lines 392-414 with op `transcode`, `invariant:'transcode-output-metadata'`).
- **Fixture**: `asset: 'wav_f32.wav'` → `fixtures/media/wav_f32.wav` **exists**, 1.9 MB real PCM WAV. Not synthetic/empty/mock.
- **Oracle**: `property-invariant` `transcode-output-metadata`, `src/core/oracles.ts:3631-3708`. It re-probes the ACTUAL output via the reference engine (line 3641), checks container == requested (3655), output duration vs source within a real tolerance band (`durationToleranceSec ≈ 0.0417 s`, 3659-3677), and audio-track presence/shape (3692-3700). It is a REAL comparison, not trivially true. Measured outcome: `durationDeltaSec=0`, `durationToleranceSec≈0.04167`, `audioTracks=1` — physically plausible for a sample-format-only re-encode (duration must be preserved exactly).
- **Winner adapter**: `src/engines/ffmpeg-wasm/adapter.ts:2165` (`transcode`), audio encoder selection at `2461-2472` (`-c:a pcm_s24le`), output readback at `2257`. Codec map at `src/engines/ffmpeg-wasm/codecs.ts:41` (`pcm-s24 → pcm_s24le`). Genuine wasm encode + real byte readback; no canned output, no input→output copy, no golden short-circuit, no error-swallowing (non-zero exec exits throw via `run()`).
- **Verdict: WEAK-GATE.** Implementation and fixture are real, but the gating oracle is a *structural/metadata* invariant (container + duration + track count). It does **NOT** verify the decoded PCM samples (no bit-exact / `decoded-audio-pcm` digest on the OUTPUT), so a wrong-but-well-shaped s24 stream could in principle still pass. The decode-side sibling case (`throughput_decode_s24`) IS gated by a PCM digest; this encode case deliberately is not. PASS is real but correctness is shape-only, not fidelity. Note: both winning results are `cached==true` (reused from a prior run started 2026-06-22T16:35:32Z for ffmpeg-wasm; 2026-06-22T14:02:21Z for mediabunny) — staleness risk, not re-run this session.

## Confidence & caveats

- **Confidence: medium.** The win direction (ffmpeg.wasm faster) is clear and ~2x, but both timing samples are **n=1, mad=0** (single timed iteration) and **cached**, so the margin could shift on a fresh multi-sample run.
- The headline `primaryMetric` (framesPerSec) is **not collected** for this encode case (median 0, n=0 for both), so the documented primary axis is inert; the comparison necessarily uses `wall`. 
- peakMemory is unmeasured for mediabunny (n=0), so a memory-based ranking is impossible; ffmpeg.wasm's 71.7 MB is the only datum.
- The gate is structural only (WEAK-GATE): a fidelity reversal between the two PASS engines cannot be detected by this oracle.
