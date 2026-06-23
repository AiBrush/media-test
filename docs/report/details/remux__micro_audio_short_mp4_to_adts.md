# remux/micro_audio_short_mp4_to_adts

family: remux | fixture asset: `micro_audio_short.m4a` (MP4/AAC, 1.4 KB) → ADTS | primaryMetric: wall (ms) | passCount: 2 of 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 2 PASS: mediabunny, ffmpeg.wasm@0.12.15).
- **Decisive factor: PERFORMANCE.** Both engines pass the *only* gating oracle (`reference-reimport`) on identical structural criteria (1 media track, AAC, duration within tolerance), so correctness strength is a tie. mediabunny wins on every speed/memory axis.
- **Margin over runner-up (ffmpeg.wasm):** wall 11.73 ms vs 13.645 ms = **1.16x faster**; throughputRealtime 8.525x vs 7.329x = **1.16x higher**; peakMemory 30.33 MB vs 35.96 MB = **0.84x (16% lower)**; longtasks 9925 ms vs 19963 ms = **0.50x (half the main-thread blocking)**. Both measured at n==1 — see caveats.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 11.73 ms | 8.525 x | 30,328,375 B | 9925 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 13.645 ms | 7.329 x | 35,957,040 B | 19963 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'adts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'adts' |

## Why the winner wins (deep technical)

**The operation.** This is a *lossless audio re-wrap*: the source is AAC-LC access units carried inside an ISOBMFF (MP4) `mdat`, indexed by `stsz/stco/stts`. The target is ADTS — a header-framed elementary stream where each AAC AU is prefixed with a 7-byte ADTS header (ISO 13818-7) carrying sampling-frequency index, channel config, and frame length. No decode/re-encode is needed; the coded bytes are identical and only the framing/container changes. The scenario notes (src/scenarios/remux/audio.ts:39-41) describe exactly this: "Re-emit ADTS frame headers around the raw AAC access units; coded samples identical. (mediabunny AdtsOutputFormat.)"

**mediabunny's path.** `remux()` (src/engines/mediabunny/adapter.ts:1244-1260) builds the ADTS `OutputFormat` via `makeOutputFormat('adts', …)`, opens the MP4 input, and runs the streaming Conversion pipeline `runConversion()` (adapter.ts:841-865 → `Conversion.init` / `conversion.execute`). Because no bitrate is requested, mediabunny takes its lossless audio COPY fast-path (the adapter header documents this requires `!trackOptions.bitrate`, adapter.ts:27/665) — the AAC AUs are demuxed and re-muxed into ADTS without touching a WebCodecs AudioDecoder/Encoder. Per env.configUsed, the engine ran backend `webcodecs`, `coreBuild: pure-ts-esm`, `sharedArrayBuffer:false`, `coopCoep: not-required`, single-threaded (`wasmThreads:0`). The whole job is pure-TS byte shuffling, which is why wall is 11.73 ms and longtasks only 9925 ms.

**Why it beats ffmpeg.wasm mechanistically.** ffmpeg.wasm produces a *correct* ADTS file (it has a dedicated `adtsWrap()` that synthesizes the 7-byte ISO-13818-7 header per AU, src/engines/ffmpeg-wasm/adapter.ts:646-685, plus AAC params parsed from the ASC, adapter.ts:616-646) and stream-copies via `-c copy` into MEMFS. But it pays the WASM tax: bootstrapping the emscripten module, MEMFS round-trips, and the framecrc/copy machinery. The shard shows this as **2x the main-thread blocking (longtasks 19963 ms vs 9925 ms)** and **16% more peak memory (35.96 MB vs 30.33 MB)** for the same 1.4 KB input. mediabunny's streaming pure-TS muxer has no module bootstrap and no virtual-FS copy, yielding the 1.16x wall edge and half the longtask budget.

**The oracle measurements (real numbers).** Both passed `reference-reimport` (the remux variant `semanticRemuxReimport`, src/core/oracles.ts:1273-1324). mediabunny: `reimportPackets:8, reimportKeyframes:8, reimportMediaTracks:1, goldenMediaTracks:1, durationDeltaSec:0.0858 (tol 0.5)`. ffmpeg.wasm: `reimportPackets:6, reimportKeyframes:6, reimportMediaTracks:1, goldenMediaTracks:1, durationDeltaSec:0.0393 (tol 0.5)`. The golden (fixtures/golden/micro_audio_short.m4a.packets.json) has **6 packets** — so ffmpeg.wasm's packet count matches the golden exactly, while mediabunny re-emits 8 (it materializes the encoder-priming/negative-PTS frames the MP4 edit list hid). **However, the semantic remux gate deliberately does NOT compare packet count** (oracles.ts:1287-1324 checks media-track count, per-type track layout, and duration only — packet count is ignored for the `op === 'remux'` branch). So this difference is not scored; correctness is a genuine tie under the gate that actually runs. The performance margin is therefore the only decisive axis.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — PASS but lost on perf.** Correct ADTS output (6 packets matching golden), but slower wall (13.645 vs 11.73 ms = 0.86x), 2x longtasks (19963 vs 9925 ms), and 16% more peak memory (35.96 vs 30.33 MB) due to WASM module + MEMFS overhead.
- **platform@chrome-149 — NA_ENGINE (honest).** "engine does not declare operation 'remux'." The browser has no general container-remux API (MediaRecorder is encode-only, no demux-to-ADTS path); honest non-declaration, not an under-claim.
- **mp4box@2.3.0 — NA_ENGINE (honest).** "engine does not declare output container 'adts'." MP4Box is an ISOBMFF (MP4/fragmented-MP4) muxer; it cannot emit a bare ADTS elementary stream. Correct refusal.
- **web-demuxer@4.0.0 — NA_ENGINE (honest).** "engine does not declare operation 'remux'." It is a demux-only library (FFmpeg-WASM demuxer surface); no mux/remux path. Honest.
- **remotion-media-parser@4.0.479 — NA_ENGINE (honest).** "engine does not declare operation 'remux'." It is a read/parse-only library. Honest.
- **remotion-webcodecs@4.0.479 — NA_ENGINE (honest).** "engine does not declare output container 'adts'." Its converter targets MP4/WebM containers, not bare ADTS. Honest non-declaration.

## Anti-cheat validation

- **Scenario:** src/scenarios/remux/audio.ts:34-42 (RemuxCase `asset:'micro_audio_short.m4a', from:'mp4', to:'adts', audioCodecs:['aac']`). The file documents the oracle-honesty rationale (audio.ts:12-25): the legacy `decoded-frames-bitexact`/`golden-metadata` oracles were inapplicable to audio remux and were *removed* in favor of `reference-reimport` (the oracle that actually observes the output) — a deliberate de-faking, not a loosening.
- **Fixture exists & is real:** `fixtures/media/micro_audio_short.m4a` present, 1.4 KB, real MP4/AAC (golden meta: container mp4, codec aac, 44100 Hz, 1 ch, 36033 bps, durationSec 0.1). Tiny but a genuine coded asset, not synthetic/empty.
- **Winner implementation is genuine:** src/engines/mediabunny/adapter.ts:1244-1260 calls the real `Conversion` API with a real `AdtsOutputFormat` and `BufferTarget`; no canned bytes, no input→output copy, no short-circuit to golden, no error-swallowing (`runConversion` throws on invalid/empty output, adapter.ts:849-862).
- **Oracle is real:** `reference-reimport` (src/core/oracles.ts:1225-1271) re-parses the engine's actual output bytes with the injected reference engine and, for remux, `semanticRemuxReimport` (oracles.ts:1273-1324) diffs media-track count/layout and duration against the golden. Measurements are physically plausible (1 audio track, ~0.04–0.09 s duration delta vs a 0.1 s clip, within 0.5 s tol). Not trivially satisfiable: an empty packet table fails (oracles.ts:1244-1246), a wrong track count/layout fails (oracles.ts:1289-1298), duration drift > tol fails (oracles.ts:1321-1323).
- **Caveat — gate strength:** the running oracle is *structural/semantic*, not bit-exact. It does NOT verify the ADTS AAC payload is byte-identical to the source AUs, nor that packet count matches golden. So PASS is real but proxy-grade for a "lossless copy" claim. Hence WEAK-GATE leaning, but the implementation and fixture are real.
- **Cached:** BOTH PASS results have `cached==true` ("cached previous PASS result"). Numbers were reused, not re-run this session — staleness risk on the perf margin specifically.
- **Verdict: WEAK-GATE.** Real fixture + real mediabunny/ffmpeg implementations + a real comparison oracle, but the only gate is structural/duration (no bit-exact or golden-packet-count check), so it cannot distinguish a perfect lossless re-wrap from a structurally-correct one. No evidence of mock/faked output.

## Confidence & caveats

- **Confidence: medium.** Two genuine implementations, honest NAs for the other five, real fixture and oracle code inspected.
- The win is **performance-only**; correctness is a tie under the gate that runs. The packet-count divergence (mediabunny 8 vs golden 6 vs ffmpeg 6) is intriguing — ffmpeg matches golden exactly — but is not scored, so it does not change the verdict.
- All bench metrics are **n==1** (no warm-up spread; mad==0, p95==median), and **both results are cached** — the 1.16x wall / 0.50x longtasks margins are single-sample and stale; treat as directional, not statistically robust.
- A stronger gate (golden-packet-count or decoded-PCM bit-exact) would better separate these two; the suite's own scenario notes acknowledge no decoded-PCM oracle exists yet.
