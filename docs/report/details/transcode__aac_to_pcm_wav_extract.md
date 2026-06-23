# transcode/aac_to_pcm_wav_extract

- **Family:** transcode
- **Fixture asset:** `fixtures/media/aac_adts.aac` (164 KB; `file`: MPEG ADTS, AAC, v4 LC, 48 kHz, stereo)
- **Operation:** transcode `adts/aac` → `wav/pcm-s16` (lossless decode-to-PCM extract); options `{ container: 'wav', audio: { codec: 'pcm-s16' } }`
- **primaryMetric:** none declared → defaults to `wall` (lower-is-better)
- **passCount:** 3 / 7 (ffmpeg.wasm, remotion-webcodecs, mediabunny)
- **Gating oracle:** `property-invariant` (variant `transcode-output-metadata`) only

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` — **CONTESTED** (3 engines PASS the identical oracle).
- **Decisive factor:** PERFORMANCE on the primary metric `wall`. Correctness is a dead heat — all three pass the *same single* `property-invariant` oracle with *identical* measurements (`durationDeltaSec=0.004333s`, `durationToleranceSec=0.041667s`, `audioTracks=1`). With correctness tied, the tie breaks on wall time and realtime throughput.
- **Margin over runner-up:** ffmpeg.wasm wall median **19.60 ms** vs mediabunny **49.81 ms** → **2.54× faster wall**; throughput **511.66×-realtime** vs **201.41×** → **2.54× higher**. Over the third engine (remotion-webcodecs, 158.81 ms) ffmpeg.wasm is **8.10× faster**. Evidence is weak in absolute terms: every engine ran with **n=1** (single sample, mad=0), so spread is unknown.

## Per-engine results

| Engine | Status | Oracles passed (name:pass) | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | property-invariant:true | **19.60 ms** | **511.66×** | not measured (n=0) | 4924 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 49.81 ms | 201.41× | 68,231,386 B (~68.2 MB) | 4410 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true | 158.81 ms | 63.16× | not measured (n=0) | 4410 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

**The job.** The source is a raw **ADTS AAC-LC elementary stream** (48 kHz stereo, 164 KB) — there is no MP4/MOV box structure, just back-to-back ADTS frames each with a 7-byte header. The target is **WAV/PCM-s16**, i.e. *fully decode* every AAC frame to linear PCM and wrap the interleaved samples in a RIFF/WAVE `fmt ` + `data` container. This is a true transcode (decode + re-mux), not a copy.

**Why ffmpeg.wasm is fastest here.** ffmpeg.wasm runs libavformat's ADTS demuxer and the libavcodec AAC decoder, then `pcm_s16le` muxed into WAV, entirely inside a single WASM module — *no WebCodecs round-trip, no GPU, no JS↔codec marshaling per frame*. For a 164 KB elementary stream the whole decode-to-PCM pipeline lives in one linear-memory buffer that ffmpeg processes in a tight C loop; that is why it posts the lowest `wall` (**19.60 ms**) and the highest realtime ratio (**511.66×**). Crucially, AAC-LC decode is *not* something WebCodecs hardware acceleration helps with at this size — the per-frame WebCodecs dispatch overhead (decoder config, EncodedAudioChunk wrapping, async callbacks) dominates for sub-second audio, which is exactly the penalty the two WebCodecs-backed engines pay.

**Why mediabunny is correct but slower.** mediabunny's adapter genuinely runs the Conversion pipeline — `mb.Conversion.init(opts)` then `conversion.execute()` (`src/engines/mediabunny/adapter.ts:848` and `:855`), reading the WAV bytes off its `bufferWriter`. Its `env.configUsed` shows `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`. For the **PCM-s16 *encode* side** mediabunny uses its pure-TS PCM path (token `audio:pcm-native`, adapter.ts:1083-1088), so it does not pay a WebCodecs encode round-trip — but the **AAC *decode* side** still goes through a WebCodecs AudioDecoder (`getDecoderConfig()`/AudioSampleSink, adapter.ts:940-967). That async per-chunk decode dispatch is why it lands at 49.81 ms (2.54× ffmpeg.wasm) despite a clean streaming-lockstep pipeline. It is the only engine that actually *measured* peak memory: 68.2 MB.

**Why remotion-webcodecs is slowest.** Its `configUsed` is `backend: "webcodecs"`, `pipeline: "streaming-backpressure"`, `worker: "convert=main-thread"`. The transcode runs on the **main thread** through the WebCodecs decode→encode→mux chain with `waitForQueueToBeLessThan` backpressure; for a tiny audio stream the queue/backpressure bookkeeping and main-thread scheduling dominate, giving 158.81 ms (8.10× ffmpeg.wasm) and only 63.16× realtime.

**The oracle measurements are identical across all three winners** because the gate (`transcode-output-metadata`, `src/core/oracles.ts:3631-3707`) only probes the *output container shape*: container must be `wav`, the requested audio codec `pcm-s16` must be present (`compareRequestedTrack`, oracles.ts:3778-3821 — note no `sampleRate`/`channels` were requested, so only codec + track-count are checked), and the duration must be within band. All three produced a structurally-correct WAV with one PCM track and a 0.0043 s duration delta (well inside the 0.0417 s tolerance). The gate cannot distinguish them on fidelity, so the win is purely on speed.

## What each other framework did wrong

- **mediabunny@1.48.0 (PASS, lost on perf):** correct WAV/PCM output, identical oracle measurements, but **2.54× slower wall** (49.81 vs 19.60 ms) and **2.54× lower throughput** (201.41× vs 511.66×) — the AAC decode goes through an async WebCodecs AudioDecoder rather than a single in-WASM C loop. (It did, uniquely, report 68.2 MB peak memory.)
- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** correct output, identical oracle measurements, but **8.10× slower wall** (158.81 ms) and lowest throughput (63.16×) — main-thread WebCodecs decode→encode→mux with backpressure queues, the heaviest path for a tiny audio stream.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare input container 'adts'". **Honest NA** — Chrome's built-in WebCodecs/MediaSource path has no raw-ADTS demuxer; the adapter correctly declines the input container rather than faking a parse.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare operation 'transcode'". **Honest NA** — mp4box.js is an ISO-BMFF (MP4) box parser/segmenter; it neither decodes AAC nor encodes PCM, and declares no `transcode` op.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'transcode'". **Honest NA** — it is a demux-only WASM wrapper (extracts packets); no decode/encode/transcode capability.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'transcode'". **Honest NA** — a metadata/sample parser, not a transcoder.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:1075-1086` (`id: 'aac_to_pcm_wav_extract'`, `asset: 'aac_adts.aac'`, `fromContainer: 'adts'`, `fromAudio: 'aac'`, `toContainer: 'wav'`, `toAudio: 'pcm-s16'`, `lossless: true`). Built via `audioEncodeScenarios.map` at index.ts:1089-1111, which attaches `oracles: ['property-invariant']` (no `playback-smoke`, since WAV is not browser-playable).
- **Fixture exists & is real:** `fixtures/media/aac_adts.aac`, 164 KB, `file` → "MPEG ADTS, AAC, v4 LC, 48 kHz, stereo". Genuine compressed AAC elementary stream — not synthetic/empty/mock. A 164 KB AAC-LC stream decoding to a sub-second-duration PCM is physically plausible (matches `durationDeltaSec=0.0043` against the source duration).
- **Winner adapter is genuine:** `src/engines/ffmpeg-wasm` runs libavcodec AAC decode + WAV `pcm_s16le` mux in WASM (no canned output, no input→output copy, no golden short-circuit). For corroboration, the mediabunny path genuinely calls `mb.Conversion.init` / `conversion.execute()` at `src/engines/mediabunny/adapter.ts:848,855`.
- **Oracle is real but WEAK:** `src/core/oracles.ts:3631-3707` (`transcode-output-metadata`) probes the actual emitted bytes via `ctx.referenceEngine.probe(...)` (oracles.ts:3641) and compares container, track count, requested codec, and duration band — a *structural/metadata-exact* check, not a perceptual proxy or smoke gate. **However**, it does **not** verify the decoded PCM samples. The scenario `notes` (index.ts:1083-1085) explicitly admit this: *"PCM bit-exactness needs a dedicated audio decode oracle before it can be asserted here."* So a structurally-correct WAV with garbage samples could still pass. The gate is not trivially-satisfiable (wrong container/codec/track-count/duration all fail), but for a `lossless: true` scenario it stops short of the bit-exact `decoded-audio-pcm` gate the operation deserves.
- **Cached note:** **all three PASS results have `cached: true`** ("cached previous PASS result"). The numbers were *reused, not re-run* — staleness risk applies to the entire ranking, and with n=1 there is no spread to corroborate them.
- **Verdict: WEAK-GATE.** Real fixture + real ffmpeg.wasm/mediabunny implementations + a real (probing) oracle, but the only gate is a metadata-shape invariant that does not assert PCM bit-exactness on a scenario flagged `lossless`. PASS is genuine; it is just not strong enough to call the transcode *correct* at sample level.

## Confidence & caveats

- **Confidence: medium.** The winner selection is unambiguous on the declared primary metric (wall) with a clean 2.54× margin, and the implementations/fixture are verified real. Confidence is held back by: (1) **n=1 everywhere** — single-sample medians, mad=0, so the perf gap could shift on re-run; (2) **all results cached** — not freshly re-run; (3) **ffmpeg.wasm's peakMemory is unmeasured (n=0)**, so a memory-based tiebreak is impossible (mediabunny's 68.2 MB is the only data point); (4) the gate is a **WEAK-GATE** — correctness is "right shape," not "right samples," so the three-way correctness tie that forces the perf tiebreak is itself only shape-deep.
- ffmpeg.wasm also posts the *worst* `longtasks` (4924 ms vs 4410 ms for the other two) — its WASM module monopolizes the main thread longer, a real responsiveness cost that does not change the wall/throughput verdict but is worth noting for UI-blocking-sensitive callers.
