# demux/wav_s16

- **family**: demux
- **fixture asset**: `fixtures/media/wav_s16.wav` (960 KB; WAV, PCM s16le, 48 kHz, 2 ch, 5.000 s, 1536 kbps)
- **golden**: `fixtures/golden/wav_s16.wav.meta.json` + `.packets.json` (59 golden chunks, 960000 PCM bytes)
- **primaryMetric**: wall (median ms, lower better)
- **passCount**: 5 / 7 (2 NA_ENGINE)

## Verdict

- **Best framework**: **mediabunny@1.48.0** — CONTESTED win (5 engines PASS the same oracle).
- **Decisive factor**: PERFORMANCE. All five PASS engines satisfy the identical, byte-exact `golden-packets` (PCM-aggregate variant) oracle with the same correctness strength; correctness is therefore a tie, so the `wall` primary metric breaks it.
- **Margin over runner-up** (wall median): mediabunny **5.62 ms** vs remotion-media-parser **7.54 ms** = **1.34x faster**. Versus the rest: 2.00x faster than remotion-webcodecs (11.24 ms), 2.79x faster than ffmpeg.wasm (15.67 ms), and ~1068x faster than the platform baseline (6000.71 ms). Evidence is weak in spread terms: every engine ran n=1, mad=0, p95==median (single-sample benches).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true | 5.62 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 7.54 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 11.24 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 15.67 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 6000.71 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

The scenario profile is `wall`-only (`src/scenarios/demux/index.ts:271`/`:416`), so throughputRealtime / peakMemory / longtasks are not collected for this small demux rung.

## Why the winner wins (deep technical)

This is the simplest possible container/codec combination: linear PCM s16le inside a RIFF/WAVE container. There is no entropy coding, no inter-frame prediction, no codec-private extradata — demuxing reduces to (1) parsing the RIFF chunk chain to find the `fmt ` chunk (sampleRate=48000, channels=2, bits=16) and the `data` chunk, and (2) slicing the contiguous `data` chunk payload (5 s × 48000 × 2 ch × 2 bytes = 960000 bytes) into packets. Because the underlying bytes are identical for everyone, the oracle here is the **PCM-aggregate** variant of `golden-packets` (`src/core/oracles.ts:798-867`, dispatched at `:709` because container=="wav" and codec starts with `pcm-`). That oracle deliberately does **not** compare packet count — it sums each track's packet sizes and checks the byte total, the first-packet PTS delta, and the duration delta. This is why engines emitting wildly different chunk granularities all pass:

- mediabunny: 118 measured chunks, track0 = 960000 / 960000 bytes, firstPtsΔ = 0 µs, durationΔ = 0 s.
- remotion-media-parser / remotion-webcodecs: 125 chunks, 960000 / 960000 bytes, ptsΔ 0, durΔ 0.
- ffmpeg.wasm: 235 chunks, 960000 / 960000 bytes, ptsΔ 0, durΔ 0.
- platform: 59 chunks (matches golden granularity exactly), 960000 / 960000 bytes, ptsΔ 0, durΔ 0.

So correctness strength is identical across all five: same byte-exact total, same zero PTS/duration deltas. Per the ranking ladder this is a tie at the structural/byte-exact tier (no bit-exact PCM-sample comparison is performed, and no SSIM is involved), so the tie falls through to the `wall` primary metric.

mediabunny wins `wall` at 5.62 ms. Its demux path (`src/engines/mediabunny/adapter.ts:1152-1183`) is a thin, real wrapper over the library's `EncodedPacketSink.packets()` iterator (`:1162-1176`): it opens the input via `openInput`, iterates packets with `verifyKeyPackets: true`, and pushes `{trackIndex, size=byteLength, ptsUs=microsecondTimestamp, dtsUs=ptsUs, keyframe}`. The backend is `coreBuild: "pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"` (from env.configUsed) — a pure-TypeScript RIFF reader running on the main thread with no wasm instantiation cost and no cross-origin-isolation requirement. For a 960 KB linear-PCM file that single-pass chunk walk is the cheapest possible route, which is why it edges out remotion-media-parser's `cpu-js` webReader full-parse (7.54 ms, 1.34x) and decisively beats the wasm-backed competitors.

The two wasm/heavier paths pay structural overhead that this trivial container does not amortize: ffmpeg.wasm (15.67 ms) carries the cost of feeding bytes through the libavformat WAV demuxer inside the wasm sandbox and marshalling 235 small chunks back across the JS boundary; remotion-webcodecs (11.24 ms) runs its streaming-backpressure conversion pipeline that is built for real codecs, overkill for raw PCM. The platform baseline at 6000.71 ms is a measurement artifact of its DOM-bound harness path (the `<video>`/MSE/MediaRecorder-oriented engine), not the cost of its inline `demux-wav.ts` reader itself — but on the headline `wall` metric it is still ~1068x slower and cannot win.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** (PASS, runner-up): correct and byte-exact (125 chunks, 960000 bytes, ptsΔ 0) but 7.54 ms vs 5.62 ms = **1.34x slower** on `wall`. Its `cpu-js` webReader does a `full-parse(demux)` (env.configUsed.fieldsTier), heavier than mediabunny's lean iterator for this trivial file.
- **remotion-webcodecs@4.0.479** (PASS): byte-exact (125 chunks, 960000 bytes) but **2.00x slower** (11.24 ms). Its `streaming-backpressure` conversion pipeline (`waitForQueueToBeLessThan`) is designed for real codecs and adds needless orchestration over linear PCM.
- **ffmpeg.wasm@0.12.15** (PASS): byte-exact (235 chunks, 960000 bytes) but **2.79x slower** (15.67 ms) — wasm sandbox entry + libavformat WAV demux + marshalling 235 small chunks across the JS/wasm boundary.
- **platform@chrome-149** (PASS): byte-exact and even chunk-count-exact with the golden (59 chunks, 960000 bytes), but `wall` median 6000.71 ms (~1068x slower) from its DOM-bound harness path. Loses purely on performance.
- **web-demuxer@4.0.0** (NA_ENGINE): "engine does not declare input container 'wav'". Honest NA — web-demuxer (ffmpeg-wasm based) does not register `wav` in its `containersIn`; the runner skips it before any oracle. Not an under-declared capability for this row.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare input container 'wav'". Honest NA — MP4Box.js is an ISO-BMFF (MP4/MOV) parser and structurally cannot read RIFF/WAVE; declaring `wav` would be a false capability.

## Anti-cheat validation

- **Scenario**: `src/scenarios/demux/index.ts:228-233` — `asset: 'wav_s16.wav'`, `container: 'wav'`, `audioCodecs: ['pcm-s16']`, notes: "WAV PCM s16le: the PCM data chunk must be sliced into the golden frame→packet boundaries." Id derived from asset at `:258` → `demux/wav_s16`.
- **Fixture**: `fixtures/media/wav_s16.wav` exists, 960 KB — a real RIFF/WAVE file whose 960000-byte PCM payload matches the physics (5 s × 48 kHz × 2 ch × 16-bit). Not synthetic/empty/mock.
- **Golden**: `fixtures/golden/wav_s16.wav.{meta,packets}.json` present; meta = 48 kHz / 2 ch / pcm-s16 / 5 s; packets = 59 chunks of 16384 bytes. Real ffprobe-style golden.
- **Oracle**: `golden-packets` → PCM-aggregate variant `pcmAggregatePackets` (`src/core/oracles.ts:807-867`, dispatched `:709`). Performs a real comparison: per-track summed PCM bytes vs golden bytes (must be exactly equal, `:838`), first-packet PTS delta vs tolerance (`:842`), duration delta vs tolerance (`:853`). Measurements (960000==960000, ptsΔ 0, durΔ 0) are physically plausible for this file.
- **Winner adapter**: `src/engines/mediabunny/adapter.ts:1152-1183` — genuine `EncodedPacketSink.packets()` iteration over the real opened input; no canned output, no input→output copy, no short-circuit to golden, no error swallowing.
- **Verdict**: **WEAK-GATE**. The implementations and fixture are real, but the gating oracle for WAV/PCM is intentionally chunk-count-agnostic and only checks aggregate byte total + first-PTS + duration — it does **not** compare PCM sample values bit-for-bit, so an engine could pass with correct byte total but corrupted/reordered sample content. PASS is genuine but not the strongest possible (no `decoded-audio-pcm` / bit-exact gate). The performance margin (1.34x) rests on single-sample benches (n=1, mad=0).
- **Cached note**: ALL five PASS results have `cached:true` ("cached previous PASS result"), including the winner. Numbers were reused, not re-run this session — staleness risk; the 5.62 ms figure is a prior single-sample measurement.

## Confidence & caveats

- Confidence: **medium**. The winner is clear on the declared `wall` metric and the implementation is genuine, but three things soften it: (1) every bench is n=1 (no spread, mad=0, p95==median) so the 1.34x margin is fragile; (2) all results are cached, not freshly measured; (3) the oracle is a WEAK-GATE (byte-aggregate, not bit-exact PCM), so the "correctness tie" among the five is itself shallow — none of them proves sample-accurate decode here.
- If a stronger PCM-content oracle were applied, the correctness ranking (and possibly the winner) could change; on the current evidence mediabunny is the fastest genuine WAV/PCM demuxer in the field.
