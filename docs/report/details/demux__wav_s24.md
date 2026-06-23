# demux/wav_s24

family: demux | fixture asset: `wav_s24.wav` (1.4 MB RIFF/WAV, PCM s24, 48 kHz, 2 ch, 5 s) | primaryMetric: wall | passCount: 5 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (5 of 7 engines PASS).
- **Decisive factor: performance.** All five passing engines clear the *same* gating oracle (`golden-packets`, PCM-aggregate mode) with *identical* correctness: each reproduces exactly `track0MeasuredBytes = 1440000` = `track0GoldenBytes`, `track0FirstPtsDeltaUs = 0`, `durationDeltaSec = 0`. Correctness is a tie, so the tiebreak is wall-clock demux time, where mediabunny is fastest.
- **Margin over runner-up:** mediabunny wall median **3.035 ms** vs next-fastest remotion-webcodecs **5.570 ms** = **1.84x faster**; vs ffmpeg.wasm (6.885 ms) 2.27x; vs remotion-media-parser (7.965 ms) 2.62x; vs platform (5999.745 ms) ~1977x. Caveat: all benches are n=1 (mad=0, p95=median), so the ordering is weak single-shot evidence, but the mediabunny lead is consistent with its pure-TS streaming RIFF reader.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true | 3.035 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 5.570 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 5999.745 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 6.885 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 7.965 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'wav' |

(The shard's `bench` block only contains the `wall` metric for every engine; throughputRealtime / peakMemory / longtasks were not measured for this demux row, hence n/a.)

## Why the winner wins (deep technical)

The container is RIFF/WAV and the codec is **PCM s24** (3-byte little-endian packed samples, 48 kHz, stereo). Total payload = 48000 × 5 × 2 × 3 = **1,440,000 bytes** in a single `data` chunk. Unlike a frame-based codec (AAC/Opus/H.264), WAV has no intrinsic packet boundaries — the demuxer must *slice* the contiguous PCM `data` chunk into chunks. The scenario note (`src/scenarios/demux/index.ts:238`) is explicit: "3-byte sample packing must not corrupt packet size boundaries." That is the actual hazard: a demuxer that mis-aligns a chunk on a non-3-byte boundary would split a 24-bit sample and the *total* aggregated byte count could still match while individual sizes would be wrong — but the PCM-aggregate oracle deliberately compares total bytes and duration, so any byte loss/duplication is caught. Every passing engine produced exactly 1,440,000 bytes, proving the s24 slicing was lossless.

Because chunking is implementation-defined, the engines legitimately emit different chunk *counts* (mediabunny 118, ffmpeg.wasm 352, remotion-webcodecs 125, remotion-media-parser 125, platform 88) all against golden's 59 — the oracle (`src/core/oracles.ts:807-867`, `pcmAggregatePackets`) sums `p.size` per track rather than matching counts, so all are equally correct.

mediabunny's demux path (`src/engines/mediabunny/adapter.ts:1152-1183`) opens the file with `openInput` (BlobSource + ALL_FORMATS, no container hint), enumerates tracks, and drains a real `EncodedPacketSink.packets(undefined, undefined, { verifyKeyPackets: true })` (line 1162-1167), pushing each packet's `byteLength` and `microsecondTimestamp`. This is its native pure-TS ESM RIFF reader (`coreBuild: "pure-ts-esm"`, `backend: "webcodecs"` per `env.configUsed`) running in-process with zero wasm boundary and no thread spin-up — which is why it posts the lowest wall (3.035 ms). It does not invoke WebCodecs for the demux itself (PCM needs no decoder to slice), so the "webcodecs" backend label is incidental here; the win comes from a tight native byte-slicing loop over an already-buffered blob.

The runner-up, remotion-webcodecs (5.570 ms), and remotion-media-parser (7.965 ms, `backend: "cpu-js"`) use the same family parser and land correct but slower. ffmpeg.wasm (6.885 ms) pays the wasm-call and FS-marshalling overhead and additionally fragments the stream into 352 small chunks. platform@chrome-149 is the outlier at **5999.745 ms** — its `configUsed` shows an `encode:"<video>→canvas→MediaRecorder"` MediaElement-driven pipeline; for a raw WAV demux it is forced through a media-element load/probe path that is ~1977x slower than mediabunny, though it still produces the byte-exact 1,440,000.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS but lost on speed: wall 5.570 ms vs 3.035 ms (1.84x slower). Same byte-exact correctness (1,440,000 / 0 pts delta / 0 dur delta); no correctness deficit, pure perf gap.
- **platform@chrome-149** — PASS but catastrophically slow: wall 5999.745 ms (~1977x slower). Correctness identical, but the MediaElement/MediaRecorder-oriented platform pipeline is the wrong tool for raw PCM demux.
- **ffmpeg.wasm@0.12.15** — PASS but 6.885 ms (2.27x slower) due to wasm + virtual-FS overhead; also emits 352 chunks (most fragmented). Byte-exact, just slower.
- **remotion-media-parser@4.0.479** — PASS but slowest of the passers, 7.965 ms (2.62x slower), pure cpu-js full-parse demux. Byte-exact.
- **mp4box@2.3.0** — NA_ENGINE (honest): declares `containersIn: ['mp4','mov']` (`src/engines/mp4box/adapter.ts:645`). It is an ISO-BMFF-only parser; it genuinely cannot read RIFF/WAV. Not an under-declared capability.
- **web-demuxer@4.0.0** — NA_ENGINE (honest): declares `containersIn: ['mp4','mov','mkv','webm','ts']` (`src/engines/web-demuxer/adapter.ts:639')`. No WAV/RIFF support declared; clean NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:235-239` (asset `wav_s24.wav`, container `wav`, audioCodecs `pcm-s24`), materialized into id `demux/wav_s24` at line 256-269.
- **Fixture exists & is real:** `fixtures/media/wav_s24.wav`, 1.4 MB on disk — a genuine RIFF/WAV PCM file, not synthetic/empty. Golden present: `fixtures/golden/wav_s24.wav.meta.json` (container wav, pcm-s24, 48000 Hz, 2 ch, 5 s) and `fixtures/golden/wav_s24.wav.packets.json` (6.7 KB).
- **Oracle is real & non-trivial:** `golden-packets` routes to `pcmAggregatePackets` (`src/core/oracles.ts:709`, `798-805`, `807-867`). It sums per-track packet bytes and compares against golden bytes exactly (line 838), checks first-pts within tolerance (842), and duration within tolerance (853). The match here is *exact* (1,440,000 == 1,440,000, delta 0), not a wide-tolerance pass. This is structural/metadata-exact strength on the ladder — well above smoke/perceptual.
- **Winner implementation is genuine:** `src/engines/mediabunny/adapter.ts:1152-1183` — real `openInput` + `EncodedPacketSink.packets()` with `verifyKeyPackets`. No canned output, no input→output copy, no golden short-circuit, no swallowed errors (errors propagate; `mbInput.dispose()` in finally). Container support declared at line 1036, pcm-s24 codec at line 1041.
- **Cached note:** the winner's result has `cached: true` (`reason: "cached previous PASS result"`). All 5 PASS rows are cached, so the 3.035 ms timing was reused, not re-measured this run — staleness risk on the *numbers*, though the correctness verdict (byte-exact) is robust to that.
- **Verdict: REAL.** Real RIFF fixture + genuine pure-TS demux implementation + byte-exact aggregate oracle. The only soft spot is n=1 cached benches.

## Confidence & caveats

- **Confidence: high** on the verdict (mediabunny wins). Correctness is a true tie (5 byte-exact passes), and mediabunny has the lowest wall by a clear 1.84x margin over the runner-up.
- **Caveats:** (1) All benches are n=1 (mad=0, p95==median) and `cached:true`, so the timing margin is single-shot evidence — directionally trustworthy (matches mediabunny's lightweight pure-TS RIFF path) but not statistically tight. (2) The shard exposes only the `wall` metric; throughputRealtime/peakMemory/longtasks were not recorded, so the perf comparison rests on wall alone. (3) Differing chunk counts are expected and oracle-irrelevant; correctness rests on total PCM bytes, which all passers nailed.
