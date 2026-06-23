# mux/pcm_s16_to_wav

family: mux | fixture asset: `fixtures/media/wav_s16.wav` (real RIFF/WAVE, PCM s16le, 48000 Hz, 2ch, ~960 KB) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Decisive factor: **performance**. Both PASS engines satisfy the identical (and only) gate, `property-invariant` / probe-duration, with the same measurement (Δ 0.0000s ≤ 0.0417s, outDur=5s, goldenDur=5s). Correctness is a dead tie, so the win is on speed.
- Margin over runner-up (ffmpeg.wasm@0.12.15): **10.92x faster wall** (3.975 ms vs 43.425 ms median), **10.92x higher throughputRealtime** (1257.86x vs 115.14x), and **9.67x fewer long-task ms** (315 ms vs 3045 ms). Both on n=1 samples (weak statistical evidence; see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 3.975 ms | 1257.86x | 0 (n=0) | 315 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 43.425 ms | 115.14x | 0 (n=0) | 3045 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is a pure-PCM remux: demux 16-bit little-endian PCM samples out of a source RIFF/WAVE container and author a fresh WAV (RIFF header + `fmt ` chunk + `data` chunk). There is no codec involved — PCM is uncompressed — so the entire cost is container parsing plus RIFF chunk authoring. There is no decode/encode, no entropy coding, no SIMD-amenable inner loop; this is byte-shuffling around a 12-byte RIFF header, a 16-byte PCM `fmt ` chunk, and a `data` chunk.

mediabunny ran on its `pure-ts-esm` core (`env.configUsed.coreBuild`, `backend: webcodecs`, but for PCM-WAV no WebCodecs codec is engaged — `coopCoep: not-required`, `sharedArrayBuffer: false`, `wasmThreads: 0`). Its mux path is genuine: `src/engines/mediabunny/adapter.ts:1508` `mux()` builds the output format via `makeOutputFormat('wav')`, which returns `new WavOutputFormat()` (`src/engines/mediabunny/codecs.ts:174-175`), constructs `new Output({ format, target })` (`adapter.ts:1514`), adds the audio track through an `EncodedAudioPacketSource` (`adapter.ts:1539-1540`), feeds each chunk as an `EncodedPacket` carrying the source PTS/duration (`adapter.ts:1562-1569`), attaches the decoder config on the first packet so the muxer can write codec-private/format fields (`adapter.ts:1582-1589`), then `output.start()` / `output.finalize()` (`adapter.ts:1553, 1598`). For PCM that authoring is a tight in-process TypeScript RIFF writer — it just lays down `RIFF`/`WAVE`/`fmt `/`data` and copies the sample bytes. That explains the 3.975 ms wall and 1257.86x-realtime number for a 5-second clip: essentially memcpy-bound chunk authoring in the same JS heap, no worker hop.

ffmpeg.wasm produced a correct WAV too (`adapter.ts:2899` `mux()` materializes each track as an elementary stream into MEMFS, then runs `-i ... -map 0 -c copy -avoid_negative_ts make_zero out.wav` at `adapter.ts:2925-2941`), but it pays the WebAssembly tax: writing the elementary stream into MEMFS, spawning the ffmpeg command, the libavformat WAV demuxer/muxer round-trip, and reading the result back. That overhead dominates a trivial PCM remux — 43.425 ms wall (10.92x slower) and, critically, 3045 ms of long-tasks vs mediabunny's 315 ms. The 3045 ms long-task figure reflects the synchronous wasm execution blocking the main thread (single-threaded build, `wasmThreads` effectively 1), which is a real UX cost beyond the wall number.

Both engines clear the gate identically: the `propertyInvariant` dispatcher (`src/core/oracles.ts:2709`) takes the cross-container probe branch (op is `mux`, not `probe`), reference-probes the authored output, and compares its duration to the golden source duration with a 0.041666s band (`oracles.ts:2744-2758`). Both report `outDurationSec: 5, goldenDurationSec: 5, deltaSec: 0` — the authored WAVs materialize exactly the right sample count / duration. Since correctness ladder position (structural/metadata-exact property-invariant) and measurement are equal, performance is the sole differentiator, and mediabunny wins decisively.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost on perf): correct WAV via `-c copy` mux, but 10.92x slower wall (43.425 vs 3.975 ms), 10.92x lower throughput (115.14x vs 1257.86x), and 9.67x more main-thread blocking (3045 vs 315 ms long-tasks) due to the wasm/MEMFS round-trip for a trivial PCM RIFF rewrite.
- **web-demuxer@4.0.0** (NA_ENGINE): does not declare operation 'mux' — honest NA; web-demuxer is a read/demux-only wrapper around the libav demuxer, it has no muxing/authoring path.
- **platform@chrome-149** (NA_ENGINE): does not declare operation 'mux' — honest NA; the browser exposes WebCodecs (codec) but no general container muxer, and there is no Web API to author a WAV file as a mux operation here.
- **mp4box@2.3.0** (NA_ENGINE): does not declare input container 'wav' — honest NA; mp4box.js is ISO-BMFF-only (mp4/mov), it cannot read a RIFF/WAVE source.
- **remotion-media-parser@4.0.479** (NA_ENGINE): does not declare operation 'mux' — honest NA; it is a parser/demuxer, not a muxer.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): does not declare operation 'mux' — honest NA; its mux/write path targets MP4/WebM via its converter, not raw PCM→WAV, and it is not declared for the 'mux' op here.

All five NAs look genuine (capability/container gating in `registry.ts`/`runner.ts`), not under-declared: none of these libraries has a real PCM→WAV authoring path.

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/write-targets.ts:77` (`id: 'pcm_s16_to_wav'`, `input: 'wav_s16.wav'`, `to: 'wav'`, `audioCodecs: ['pcm-s16']`). Notes (lines 82-84) describe RIFF header + data-chunk authoring; wav is the only writeable PCM container; probe-duration gates the materialized sample count.
- Fixture exists and is real: `fixtures/media/wav_s16.wav` (~960 KB). Header dump confirms `RIFF....WAVE fmt ` with `audioFormat=1` (PCM), 2 channels, sample rate 0x0000BB80 = 48000 Hz, 16 bits/sample, followed by a real `data` chunk. Not synthetic/empty/mock.
- Oracle: `src/core/oracles.ts:2645` `propertyInvariant`, cross-container probe-duration branch at `oracles.ts:2709-2758`. It reference-probes the AUTHORED output and compares duration to the golden source duration within 0.041666s. This is a real structural comparison against an independent probe, not trivially satisfiable: an empty/zero-length or wrong-sample-count WAV would fail the band. Measurements (outDur=5, goldenDur=5, Δ=0) are physically plausible for a 5-second PCM clip.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508-1600` (`mux()`), format mapping `src/engines/mediabunny/codecs.ts:174-175` (`wav -> new WavOutputFormat()`). Genuine mediabunny `Output`/`EncodedAudioPacketSource`/`finalize()` authoring — no canned output, no input→output copy fake, no golden short-circuit, no swallowed errors.
- Verdict: **REAL**. Real fixture, real muxer implementation on both PASS engines, meaningful structural oracle.
- Caveat note: this is a single, structural (duration) gate, not a bit-exact sample comparison — see confidence below.
- Cached: **both PASS results have `cached: true`** ("cached previous PASS result"). Numbers were reused, not freshly re-run; staleness risk applies if the adapters changed since the cached run (mediabunny adapter.ts mtime ~13h, ffmpeg adapter.ts ~22h).

## Confidence & caveats

- Confidence: **medium**. The win direction (mediabunny ~11x faster, far fewer long-tasks) is large and robust to noise, and both correctness outcomes are identical, so the ranking is safe. But: (1) only ONE oracle gates this scenario, and it is a structural duration check, not a PCM bit-exact / sample-digest comparison — a muxer that produced correct duration but corrupted/byte-shifted sample data would still PASS (WEAK relative to a bit-exact gate, though REAL). (2) Both benches are n=1 (mad=0, p95==median), so the absolute millisecond figures are single-shot; the 10.92x margin is far larger than plausible single-shot jitter, but treat the exact numbers as point estimates. (3) Both results are cached, so they reflect a prior run, not a fresh execution. (4) peakMemory and targetWrites were not measured (n=0) for either engine, so the perf comparison rests on wall/throughput/longtasks only.
