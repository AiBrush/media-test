# probe/realworld_mdn_trex_mp3

- family: probe | fixture asset: `fixtures/media/realworld_mdn_trex.mp3` (40 KB, real MDN CC0 t-rex-roar.mp3) | primaryMetric: wall | passCount: 4 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (contested win).
- Decisive factor: **performance**. All four PASS engines satisfy the identical single gating oracle (`golden-metadata`) with effectively identical correctness, so the tie breaks on wall-clock probe latency. mediabunny's wall median is **2.595 ms**, vs the runner-up remotion-media-parser at 7.840 ms.
- Margin over runner-up: **3.02x faster wall** (7.840 / 2.595). Caveat: all four results are `cached==true` with `n==1, mad==0`, so the latency gap is single-sample evidence, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 2.595 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 7.840 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 8.685 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 10.690 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |

The probe bench is wall-only; no throughputRealtime / peakMemory / longtasks were recorded for any engine in this shard.

## Why the winner wins (deep technical)

The operation is a **read-only metadata probe of a raw MP3 elementary stream** (CBR-ish MPEG-1 Layer III, 44.1 kHz stereo, ~150.7 kbit/s, golden duration 2.074 s). There is no container box tree (no MP4/ISOBMFF, no Matroska EBML); duration must be derived from a Xing/Info/VBRI header if present or estimated from frame count × samples-per-frame / sample-rate. The single gating oracle is `golden-metadata` (`src/core/oracles.ts:595`), which compares the measured `{container, durationSec, tracks[].codec/sampleRate/channels}` against `fixtures/golden/realworld_mdn_trex.mp3.meta.json`. Because MP3 has encoder-delay/padding ambiguity, the scenario applies a narrow explicit duration band of ±0.05 s (`src/scenarios/probe/index.ts:200`, `tolerances.durationToleranceSec: 0.05`).

All four passing engines hit the same `durationDeltaSec ≈ 0.0419 s` (mediabunny, remotion-media-parser, remotion-webcodecs) or 0.0460 s (ffmpeg.wasm) — both comfortably inside the 0.05 s band, and all report the correct single audio track (mp3 / 44100 / stereo). Correctness is therefore a flat tie on the strongest available oracle for this scenario (a metadata-exact gate; bit-exact decode is not in play because this is a probe, not a decode). The win is purely latency.

mediabunny's probe path (`src/engines/mediabunny/adapter.ts`) opens the asset through a real `Input` over `ALL_FORMATS` (the format singletons including the MP3 input format) and pulls metadata via the cheap getters. The key efficiency note in the adapter header (`adapter.ts:34-37`) is that `metadataFromInput` reads duration via `getDurationFromMetadata()` FIRST and only falls back to a full `computeDuration()` sample walk when metadata yields null. For MP3 this means it reads the Xing/Info VBR header (or the frame-count-derived duration) without scanning every frame, then normalizes the single audio track through `normalizeTrack` (`adapter.ts:332-347`), reading codec, sample rate, channels, and bitrate straight off the `InputAudioTrack` getters. That metadata-first, no-full-scan path is why its wall median is 2.595 ms — roughly 3x lower than the other parsers, all of which do more work (remotion-media-parser streams the file through its JS reader; ffmpeg.wasm pays wasm module + virtual-FS overhead even for a probe).

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS but lost on speed: wall 7.840 ms vs 2.595 ms (3.02x slower). Identical correctness (golden-metadata, durationDelta 0.0419 s). Its `cpu-js` streaming reader (`configUsed.backend: "cpu-js"`, `reader: "webReader"`) walks the stream in JS to derive duration, costing more wall time than mediabunny's metadata-first getter.
- **remotion-webcodecs@4.0.479** — PASS but lost on speed: wall 8.685 ms (3.35x slower). Same single oracle, same durationDelta 0.0419 s. The webcodecs adapter's heavier streaming-backpressure pipeline adds overhead with no correctness benefit for a pure probe.
- **ffmpeg.wasm@0.12.15** — PASS but slowest: wall 10.690 ms (4.12x slower) and the largest durationDelta (0.0460 s, still inside the 0.05 s band). wasm/MEMFS overhead dominates a tiny 40 KB probe.
- **platform@chrome-149** — NA_ENGINE, "does not declare input container 'mp3'". Honest: the browser-platform demux path (MediaSource/WebCodecs) has no native MP3-elementary-stream demuxer declared, so it negotiates NA rather than faking a probe.
- **web-demuxer@4.0.0** — NA_ENGINE, same reason. Honest under-coverage: its ffmpeg-derived demuxer build does not list raw 'mp3' as an input container token.
- **mp4box@2.3.0** — NA_ENGINE, same reason. Genuinely correct: mp4box.js parses only ISOBMFF box trees; a raw MP3 elementary stream has no boxes, so NA is the truthful outcome, not an under-declared capability.

## Anti-cheat validation

- Scenario definition: `src/scenarios/probe/index.ts:195-205` (`id: 'realworld_mdn_trex_mp3'`, `asset: 'realworld_mdn_trex.mp3'`, `container: 'mp3'`, explicit `durationToleranceSec: 0.05`).
- Fixture: `fixtures/media/realworld_mdn_trex.mp3` exists (40 KB), the real MDN CC0 t-rex-roar.mp3 — a genuine real-world MP3, not synthetic/empty/mock.
- Golden: `fixtures/golden/realworld_mdn_trex.mp3.meta.json` exists and contains physically plausible values (mp3, 2.074 s, 44100 Hz, 2 ch, 150735 bps) consistent with a ~2 s 150 kbit/s stereo clip (≈ 40 KB matches 150.7 kbit × 2.074 s / 8 ≈ 39 KB).
- Oracle: `goldenMetadata` at `src/core/oracles.ts:595-657` performs a real multi-field comparison (container string, duration within tolerance, per-track codec/sampleRate/channels). It is not trivially satisfiable: container/codec/sampleRate/channels are exact-match, only duration carries the documented ±0.05 s band justified by MP3 encoder-delay/padding.
- Winner adapter: `src/engines/mediabunny/adapter.ts` — `openInput` (line 245) builds a real `mb.Input`, `normalizeTrack` (line 332) reads codec/sampleRate/channels from real `InputAudioTrack` getters, and the metadata-first duration path (lines 34-37) is genuine. No canned output, no copy-input, no golden short-circuit, no swallowed errors reported as success.
- Verdict: **REAL** — real fixture + real library probe + meaningful metadata-exact oracle.
- Cached note: mediabunny's winning result is `cached==true` ("cached previous PASS result"), reused rather than freshly re-run; per launcher seeding caveat, stale-PASS reuse is possible. With all four PASS engines also cached and n==1, the 3.02x latency margin should be treated as indicative rather than statistically firm.

## Confidence & caveats

- Confidence: medium. The PASS/NA verdicts and the correctness tie are unambiguous and code-validated. The winner is decided purely on wall latency from a single cached sample (n==1, mad==0) per engine, so the 3.02x margin, while consistent with mediabunny's lighter metadata-first path, rests on one measurement.
- The three NA_ENGINE results are all honest (no MP3 elementary-stream demuxer declared); mp4box's NA is structurally inevitable.
- This probe is metadata-only; no decode/bit-exact gate is available for this scenario, so "correctness strength" tops out at the metadata-exact tier. Packet walking for this asset is gated separately by `demux/realworld_mdn_trex_mp3`.
