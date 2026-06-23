# probe/wav_s24

- family: probe | fixture asset: `fixtures/media/wav_s24.wav` (1.4 MB, exists) | golden: `fixtures/golden/wav_s24.wav.meta.json` | primaryMetric: wall (ms) | passCount: 5 / 7

## Verdict

- Best framework: **remotion-webcodecs@4.0.479** (env.engineId `remotion-webcodecs@4.0.479`).
- **CONTESTED**: 5 engines PASS (remotion-webcodecs, remotion-media-parser, mediabunny, platform, ffmpeg-wasm). All five pass the **identical** single oracle `golden-metadata` with **identical measurements** (`durationDeltaSec: 0`, tolerance `0.041666…s` = 1 frame @ 24fps). Correctness is therefore a dead tie, so the decision falls to **performance (primaryMetric = wall median)**.
- Decisive factor: lowest wall median. remotion-webcodecs 4.185 ms vs runner-up remotion-media-parser 5.760 ms → **1.38x faster wall**; vs mediabunny 6.245 ms → 1.49x; vs platform 6.285 ms → 1.50x; vs ffmpeg-wasm 15.29 ms → 3.65x.
- Margin caveat: every bench has **n==1, mad==0** (single sample, p95==median). The ~1.6 ms gap over the runner-up is within plausible single-shot jitter for a sub-7 ms header parse, so the perf win is **weak evidence**. All results are **cached==true** (reused, not re-run this session).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 4.185 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 5.760 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 6.245 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 6.285 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 15.29 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

(The shard's bench block contains only `wall`; throughputRealtime/peakMemory/longtasks were not recorded for this probe scenario.)

## Why the winner wins (deep technical)

The asset is `wav_s24.wav`: a RIFF/WAVE container carrying 24-bit signed little-endian linear PCM (`pcm-s24`), 48000 Hz, 2 channels, 5.000 s, ~2.304 Mbit/s (golden meta). There is no compressed bitstream — "probe" here means reading the RIFF chunk structure (`fmt ` chunk: format tag, channels, sample rate, bits-per-sample; `data` chunk size → duration). This is pure header arithmetic; no decoder, no GPU, no WebCodecs path is actually exercised despite the engine's `backend: webcodecs` config tag (that label describes the converter's general pipeline, not this read-only probe).

Because the work is a tiny header walk, the winner's edge is dominated by parse-path overhead, not codec work. remotion-webcodecs' probe (`src/engines/remotion-webcodecs/adapter.ts:332-377`) calls `@remotion/media-parser` `mp.parseMedia({ fields: { container, durationInSeconds, tracks, metadata } })` (adapter.ts:346-355) — a streaming header read that stops once the requested fields resolve. For WAV none of the heavier fallbacks fire: `isHlsInput` is false, `shouldUseHeaderOnlyWebmProbe`/`needsWebmFamilyFpsFallback`/`needsPacketProbeFallback` are video/webm-specific and skip for an audio-only WAV, so the function returns immediately after `normalizeMetadata(container, durationInSeconds, tracks, metadata)` (adapter.ts:357-362). The codec token is mapped `wav → pcm-s24`-family canonicalization via `src/engines/remotion-webcodecs/codecs.ts` (the `wav`/PCM mapping table around codecs.ts:54-88,134), so sampleRate=48000, channels=2 and duration=5 s match the golden positionally.

The runner-up, **remotion-media-parser** (5.760 ms), drives the *identical* `parseMedia` read path (the webcodecs adapter explicitly notes it shares media-parser's READ reach), so it produces byte-identical metadata and the same `durationDeltaSec: 0`. Its slightly higher wall (1.38x) is plausibly the `backend: cpu-js`, `fieldsTier: metadata-only`, `webReader` framing overhead vs the webcodecs adapter's reader options — but on n==1 this is within noise. mediabunny (6.245 ms) and platform (6.285 ms) parse the RIFF header through their own demuxers and also land `durationDeltaSec: 0`; their ~1.5 ms deficit is again single-sample. ffmpeg-wasm (15.29 ms) is 3.65x slower — the only statistically meaningful gap — because every probe routes through the WASM FS write + `avformat_open_input`/`avformat_find_stream_info` cycle, which carries fixed wasm-boundary and demuxer-probe cost far exceeding a JS RIFF header read; correctness is still perfect (`durationDeltaSec: 0`).

Decisive factor restated: with correctness tied at the strongest available rung for this scenario (metadata-exact, zero duration delta, exact codec/sampleRate/channels), `wall` median selects remotion-webcodecs, with the only robust margin being its 3.65x lead over ffmpeg-wasm.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, lost on perf only: wall 5.760 ms vs winner 4.185 ms (winner 1.38x faster). Same `golden-metadata` pass, identical `durationDeltaSec: 0`. Weak margin (n==1, mad==0).
- **mediabunny@1.48.0** — PASS, lost on perf: wall 6.245 ms (winner 1.49x faster). Identical oracle outcome; gap is single-sample noise.
- **platform@chrome-149** — PASS, lost on perf: wall 6.285 ms (winner 1.50x faster). Identical oracle outcome.
- **ffmpeg.wasm@0.12.15** — PASS, lost on perf: wall 15.29 ms (winner 3.65x faster). Only clearly significant gap, attributable to WASM FS + libavformat probe overhead. Correctness identical (`durationDeltaSec: 0`).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'wav'". Honest-but-conservative: its `canonicalContainer` actually maps `wav` (`src/engines/web-demuxer/adapter.ts:252`), but `containersIn` is declared `['mp4','mov','mkv','webm','ts']` (adapter.ts:639), so negotiation NAs. Under-declared capability (the bundled FFmpeg could likely probe WAV), but the NA is consistent with its registry declaration, not a failure.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'wav'". Honest: MP4Box.js is an ISO-BMFF (MP4/MOV/fMP4) parser and has no RIFF/WAVE reader, so declining WAV is correct.

## Anti-cheat validation

- Scenario definition: `src/scenarios/probe/index.ts:180` → `{ asset: 'wav_s24.wav', container: 'wav', audioCodecs: ['pcm-s24'] }`, part of the `PROBE_CASES` per-container golden probe family (header comment lines 36-50). operations: ['probe'].
- Fixture: `fixtures/media/wav_s24.wav` exists, 1.4 MB — a real, non-empty PCM WAV, not synthetic/mock/empty. Size is consistent with 5 s × 48000 Hz × 2 ch × 3 bytes ≈ 1.37 MB of PCM data plus header.
- Golden: `fixtures/golden/wav_s24.wav.meta.json` present (container wav, durationSec 5, one audio track pcm-s24/48000/2ch/2304000 bps). A separate `wav_s24.wav.packets.json` exists but is not consumed by this probe scenario.
- Oracle: `golden-metadata` at `src/core/oracles.ts:595-657`. It performs a REAL comparison — container string, duration within a per-container tolerance band (here strict ±0.04167 s, the precise/non-loose path), and positional per-track codec/sampleRate/channels (`compareTrack`, oracles.ts:659-682). It is not trivially satisfiable: any codec, sampleRate, or channel mismatch, or duration drift >1 frame, FAILs. Measured `durationDeltaSec: 0` against a 5 s asset is physically plausible (PCM duration is exactly `dataChunkBytes / byteRate`, computable to the sample).
- Winner adapter: `src/engines/remotion-webcodecs/adapter.ts:332-377` (`probe`) genuinely calls `@remotion/media-parser parseMedia` requesting container/duration/tracks/metadata; codec normalization in `src/engines/remotion-webcodecs/codecs.ts`. No hardcoded output, no copy-input, no short-circuit to golden, no error-swallowing.
- Verdict: **WEAK-GATE**. The fixture and implementation are real and the oracle is a genuine metadata comparison, but the scenario gates probe with a SINGLE metadata oracle (no bit-exact/packet check is applied here even though a packets golden exists). PASS is real but sits at the metadata-exact rung, not the strongest bit-exact rung — and the perf win that decides the contest rests on n==1, mad==0 single samples.
- Cached note: ALL 7 entries are `cached==true` ("cached previous PASS result"). Evidence is reused, not freshly re-run this session — staleness risk per the launcher-seeding caveat. The relative ranking would need a fresh multi-sample run to be high-confidence.

## Confidence & caveats

- Confidence: **medium**. Winner selection is correct under the decision procedure (correctness tied → wall median), and the implementation/fixture/oracle are validated as real.
- Caveats: (1) The 1.38x margin over the runner-up is within single-shot jitter (n==1, mad==0); only the 3.65x lead over ffmpeg-wasm is robust. (2) remotion-webcodecs and remotion-media-parser share the same parseMedia read path, so their ordering is essentially a coin-flip on this asset. (3) All results cached — re-run for honest fresh timings. (4) web-demuxer's NA is an under-declared capability (its FFmpeg core can likely probe WAV), not a true incapacity.
