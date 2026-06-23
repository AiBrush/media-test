# probe/cenc_cbcs

family: probe | fixture asset: `cenc_cbcs.mp4` (2.2 MB, fixtures/media/) | primaryMetric: wall (ms) | passCount: 7/7

## Verdict

- Best framework: **mediabunny@1.48.0** (engineId `mediabunny`).
- **Contested**: all 7 engines PASS the single gating oracle (`golden-metadata`). Correctness is identical (everyone matches the 2-track golden exactly), so the decision falls to performance.
- Decisive factor: **wall median**. mediabunny is 6.565 ms vs runner-up remotion-media-parser 8.960 ms.
- Margin over runner-up: **1.37x faster wall** (8.960 / 6.565). Over the slowest real-demuxer (mp4box 23.095 ms) it is **3.52x** faster; over the platform/`<video>` path (6000.69 ms) it is **~914x** faster. All measurements are **n==1** (single sample, mad==0), so the perf margin is weak evidence — see caveats.

## Per-engine results

All engines passed only `golden-metadata`. No throughputRealtime / peakMemory / longtasks were emitted for this probe (bench carries `wall` only).

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 6.565 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 8.960 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 12.340 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 16.475 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 19.430 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 23.095 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 6000.690 | n/a | n/a | n/a | cached previous PASS result |

Oracle measurements (golden-metadata): durationToleranceSec = 0.041667 (±1 frame @ 24 fps) for every engine. durationDeltaSec = 0 for all except platform (0.021333 s, still inside band). Golden truth: container `mp4`, durationSec 5, track[0] video h264 1280x720 @30fps, track[1] audio aac 48000 Hz / 2 ch.

## Why the winner wins (deep technical)

This is a **metadata-only probe of a CENC `cbcs`-encrypted fragmented-style MP4**. The crucial property of CENC is that the **moov/track headers (mvhd, tkhd, mdhd, stsd sample entries, esds/avcC) are left in the clear** — only the media sample payloads in mdat are AES-CBC-encrypted (cbcs = pattern-block CBC). So a probe never needs the key: every engine just has to parse box headers and report container/duration/track shape. The golden gate (`fixtures/golden/cenc_cbcs.mp4.meta.json`) asserts exactly that clear-text shape: mp4 / 5 s / h264 1280x720@30 / aac 48 kHz stereo.

mediabunny used `backend: webcodecs`, but for a probe the WebCodecs decoder is irrelevant — the win comes from its **container parsing path**, not pixel work. In `src/engines/mediabunny/adapter.ts:417` `metadataFromInput()` resolves duration via the **cheap declared-duration path first**: `input.getDurationFromMetadata()` (adapter.ts:429) reads the mvhd/track-header duration directly and only falls back to the expensive `computeDuration()` sample-walk (adapter.ts:436) when that returns null. For this MP4 the mvhd carries a finite duration, so mediabunny never walks samples or touches the encrypted mdat at all — it reads a handful of clear-text boxes and returns. Track normalization (`input.getTracks()` → `normalizeTrack`, adapter.ts:443-447) pulls codec/dims/fps/sampleRate/channels straight from the stsd sample entries. That short, header-only read on a 2.2 MB buffer is why it lands at **6.565 ms** — the leanest of all engines.

Why each rival is slower while still correct:
- **remotion-media-parser (8.96 ms)** is the closest. Its config is `backend: cpu-js, fieldsTier: metadata-only, reader: webReader, streaming` — a pure-JS streaming box parser that stops at metadata. It does essentially the same header-only work but in JS without mediabunny's memoized format singletons, costing ~1.37x.
- **ffmpeg.wasm (12.34 ms)** must boot/marshal through the wasm FS and run libavformat's full `avformat_find_stream_info` probe over the buffer; that is heavier than a targeted box read even though no decoding happens (1.88x).
- **remotion-webcodecs (16.48 ms)** routes through its convert/extract pipeline (`streaming-backpressure`, bufferWriter) which carries more setup than a bare probe (2.51x).
- **web-demuxer (19.43 ms)** is a wasm (libav-based) demuxer; like ffmpeg.wasm it pays wasm instantiation + a fuller stream-info scan (2.96x).
- **mp4box (23.09 ms)** uses `pipeline: whole-file-append(MP4BoxBuffer+fileStart)` — it appends the entire 2.2 MB file and fires the full box-tree parse before exposing `onReady`, the slowest real-demuxer path (3.52x).
- **platform (6000.69 ms)** is the `<video>`-element/WebCodecs path; it loads the asset into a media element and waits on `loadedmetadata`/readyState transitions. Its durationDeltaSec of 0.021333 s (vs 0 for the box-parsers) reflects the media stack rounding the reported duration. ~914x slower — element-driven metadata is not a parsing race, it is a full media-pipeline spin-up.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — nothing wrong; correct, but 1.37x slower wall (8.960 vs 6.565 ms).
- **ffmpeg.wasm@0.12.15** — correct, 1.88x slower (12.340 ms); wasm boot + libavformat full stream-info probe.
- **remotion-webcodecs@4.0.479** — correct, 2.51x slower (16.475 ms); convert pipeline overhead for a probe-only task.
- **web-demuxer@4.0.0** — correct, 2.96x slower (19.430 ms); wasm instantiation + fuller scan.
- **mp4box@2.3.0** — correct, 3.52x slower (23.095 ms); whole-file append before parse.
- **platform@chrome-149** — correct, ~914x slower (6000.690 ms); `<video>` media-element metadata load instead of byte-level box parse. durationDelta 0.021333 s (within ±0.041667 s band).

## Anti-cheat validation

- Scenario definition: `src/scenarios/probe/index.ts:167-176` (PROBE_CASES entry `asset: 'cenc_cbcs.mp4'`, container mp4, features `['metadata:protected-tracks']`). Id derived at `src/scenarios/probe/index.ts:335-339` (`probe/${asset without ext}` → `probe/cenc_cbcs`).
- Fixture: `fixtures/media/cenc_cbcs.mp4` **exists**, 2.2 MB — a real encrypted MP4, not synthetic/empty. Golden ground truth present: `cenc_cbcs.mp4.meta.json` (container mp4, 5 s, h264 1280x720@30, aac 48k/2ch), plus `.keys.json` (cbcs key/KID/IV for the separate decrypt op), `.packets.json` (43k), `.ssim.json`, `.frames.json`.
- Gating oracle: `golden-metadata` at `src/core/oracles.ts:595-657`. It performs a **real field-by-field comparison** of measured metadata against the golden: container string (line 606), duration within ±tolerance (lines 614-637, tol 0.041667 s = ±1 frame), and per-track codec/width/height/fps/sampleRate/channels via `compareTrack` (lines 659-686). Not trivially satisfiable on these fields.
- Winner adapter: `src/engines/mediabunny/adapter.ts:417-474` (`metadataFromInput`) calls the real mediabunny `Input` API (`getFormat`, `getDurationFromMetadata`, `computeDuration`, `getTracks`, `normalizeTrack`, `getMetadataTags`). No canned output, no input→output copy, no golden short-circuit, no error-swallow-as-success (catch blocks set null, which would then fail the oracle).
- **Verdict: WEAK-GATE.** The implementation and fixture are real, but the gate is metadata-only and **does NOT assert the encryption scheme**. The scenario's own notes (`src/scenarios/probe/index.ts:615` and the cbcs note at 173-175) confirm: "goldenMetadata never asserts an encryption scheme" and "Encryption-scheme assertions wait until the normalized metadata shape carries it." So for THIS encrypted-MP4 case the PASS is identical to passing on a plain clear MP4 — no engine is forced to recognize that the tracks are cbcs-protected. The PASS is real (everyone genuinely parses the clear box headers correctly) but not strong for an "encryption probe": it is a structural metadata gate, one rung below crypto/bit-exact. No SSIM/decode/decrypt oracle gates this row.
- Cached note: **every engine's result has `cached: true` ("cached previous PASS result")**. None was re-run in this batch — the wall numbers and the PASS verdicts are reused, so the perf ranking is stale snapshot evidence, not a fresh measurement.

## Confidence & caveats

- Confidence: **medium**. The winner choice is correct under the decision procedure (lowest wall among correctness-tied PASS engines) and the implementation/fixture are verified real, but two things soften it:
  1. **All results are cached and n==1** (single sample, mad==0, warmup==1). A 1.37x wall gap on one cached sample is fragile; mediabunny and remotion-media-parser could plausibly swap on a fresh multi-sample run.
  2. **WEAK-GATE**: the only oracle is metadata-structural and explicitly ignores the cbcs encryption scheme, so this row does not actually test encryption handling — it tests clear-header MP4 parsing on an encrypted asset. A true encryption-aware probe would need the normalized metadata to carry a protection-scheme field (the scenario acknowledges this is deferred).
  3. No throughputRealtime/peakMemory/longtasks were emitted, so the perf tiebreak rests on wall alone.
