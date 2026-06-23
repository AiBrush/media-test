# metadata/read_no_tags_wav

- **Family:** metadata
- **Fixture asset:** `fixtures/media/wav_s16.wav` (RIFF/WAVE, PCM-S16, 48 kHz, 2ch, ~5 s, 960 KB on disk)
- **Operation:** `probe` (read container/track metadata; no decode required)
- **Primary metric:** wall (ms)
- **Oracles:** `golden-metadata` (single gate)
- **passCount:** 5 of 7 (2 NA_ENGINE)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — 5 engines PASS, all satisfying the same single oracle (`golden-metadata`) with identical correctness (durationDeltaSec=0). Correctness is a tie, so the decision falls to **performance (wall median)**.
- **Decisive factor:** lowest wall median, **4.38 ms**, beating the runner-up `remotion-media-parser` at 6.70 ms.
- **Margin over runner-up:** **1.53x faster** wall (6.70 / 4.38). Against `platform` (5918.46 ms) the margin is **~1351x**. Note: n=1 sample per engine (warmup=1, mad=0), so these are single-shot timings — evidence is directional, not statistically robust.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 4.38 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 6.70 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 7.58 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 11.39 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 5918.46 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

(The shard's `bench` block contains only the `wall` metric for every engine; throughputRealtime/peakMemory/longtasks were not collected for this probe-only scenario.)

## Why the winner wins (deep technical)

This scenario is a pure **metadata read** of a bare RIFF/WAVE file carrying **uncompressed PCM-S16** audio and **no semantic tag chunks** (no LIST/INFO/id3). The correct behavior is to parse the `fmt ` chunk for codec/sample-rate/channels, derive duration from `data` chunk size ÷ byte rate, and return a sane metadata object with an empty/absent tag map — never null-deref, never fabricate tags. The golden requires `container=wav`, `durationSec=5`, one audio track `codec=pcm-s16, sampleRate=48000, channels=2`.

All five passing engines parsed those structural fields exactly (`durationDeltaSec=0`, tolerance band ±0.0417 s = one frame at 24 fps), so correctness is a flat tie and the ladder collapses to performance.

**mediabunny (winner, 4.38 ms wall).** Its adapter opens the file with a real `mediabunny.Input` over a `BlobSource` and reads metadata through `metadataFromInput()` (`src/engines/mediabunny/adapter.ts:417`). The duration is taken via the **cheap header path**: `input.getDurationFromMetadata()` (`adapter.ts:429`), which for WAV reads the `data`/`fmt ` chunk sizes from the RIFF header rather than scanning samples; only on null does it fall back to `computeDuration()` (`adapter.ts:436`). Tracks come from `input.getTracks()` and each is normalized in `normalizeTrack()` (`adapter.ts:297`); for the audio track it calls the real library getters `a.getCodec()`, `a.getSampleRate()`, `a.getNumberOfChannels()` (`adapter.ts:334-338`) and maps the codec to the canonical `pcm-s16` token. WAV is uncompressed, so there is no demux/decode and no WebCodecs involvement on the metadata path — `env.configUsed` reports `backend:webcodecs`, `coopCoep:not-required`, `sharedArrayBuffer:false`, but for this probe the work is a pure-TS RIFF header read (`coreBuild:pure-ts-esm`). That header-only parse with no wasm instantiation and no sample scan is why it lands at 4.38 ms, the floor of the field.

**Why each rival is slower for THIS path:** `remotion-media-parser` (6.70 ms, `backend:cpu-js`, `fieldsTier:metadata-only`, `reader:webReader`) is also a header-only JS parse but carries a heavier streaming-reader scaffold, costing ~1.53x. `remotion-webcodecs` (7.58 ms) wraps the same parser plus the webcodecs conversion shell. `ffmpeg-wasm` (11.39 ms) must marshal the file into the wasm FS and run an avformat probe — the wasm boundary and ffprobe-style open dominate a trivial RIFF header. `platform` (5918.46 ms) is the outlier: its config drives metadata through a media-element/`VideoDecoder` pipeline (`decode:VideoDecoder`, `encode:<video>→canvas→MediaRecorder`), which for a 5 s clip pays element load + decode-graph setup — ~1351x the cost of a header read, and the wrong tool for a tagless probe.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS but lost on speed: 6.70 ms vs 4.38 ms (**1.53x slower**). Same correct golden-metadata result (durationDelta=0); heavier `webReader`/streaming scaffold over the same header-only parse.
- **remotion-webcodecs@4.0.479** — PASS but lost on speed: 7.58 ms (**1.73x slower**). Same correctness; adds the webcodecs wrapper layer over the parser for a job that needs no decode.
- **ffmpeg.wasm@0.12.15** — PASS but lost on speed: 11.39 ms (**2.60x slower**). Correct metadata, but the wasm-FS round trip and avformat open are pure overhead for a trivial RIFF header.
- **platform@chrome-149** — PASS but catastrophically slow: 5918.46 ms (**~1351x slower**). Routes a tagless probe through a decode/media-element pipeline; correct result, wrong cost profile.
- **mp4box@2.3.0** — NA_ENGINE, honest. Declares `containersIn: ['mp4','mov']` (`src/engines/mp4box/adapter.ts:645`); it is an ISOBMFF-only box parser and genuinely cannot read a RIFF/WAVE container. The NA is correct, not an under-declared capability.
- **web-demuxer@4.0.0** — NA_ENGINE, honest. Declares `containersIn: ['mp4','mov','mkv','webm','ts']` (`src/engines/web-demuxer/adapter.ts:639`); WAV is not in its enabled ffmpeg-wasm demuxer set. NA is correct.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/metadata/write-roundtrip.ts:179-195` (`noTagsAudioRead`, id `metadata/read_no_tags_wav`, op `probe`, input `wav_s16.wav`, oracle `golden-metadata`). Notes confirm the intent: a bare WAV with no semantic tags must probe to a sane object, never null-deref, never fabricate tags.
- **Fixture exists & is real:** `fixtures/media/wav_s16.wav` present, 960 KB — a real PCM-S16 RIFF file, not synthetic/empty/mock.
- **Golden:** `fixtures/golden/wav_s16.wav.meta.json` — `container:wav, durationSec:5, audio pcm-s16/48000/2ch/1536000 bps`. Physically consistent: 48000 × 2ch × 16 bit = 1,536,000 bps, and 5 s × that ÷ 8 ≈ 960 KB, matching the on-disk size exactly. The numbers are plausible for real media.
- **Oracle:** `goldenMetadata()` at `src/core/oracles.ts:595-657`. It performs a REAL structural comparison: container match (`:606`), duration within a per-container tolerance band (`:614-637`, here strict ±0.0417 s), and positional per-track codec/sampleRate/channels equality (`:642-657`, via `compareTrack` `:659`). It is NOT trivially satisfiable — it fails on any container/codec/sr/channel mismatch or out-of-band duration. The measured `durationDeltaSec=0` against a 0.0417 s band is a genuine exact-duration pass.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts` — `metadataFromInput` (`:417`), cheap-duration path `getDurationFromMetadata` (`:429`) with `computeDuration` fallback (`:436`), `getTracks` (`:443`), audio normalization via real library getters (`:332-346`). No canned output, no copy-input-to-output, no short-circuit to the golden, no error-swallow-as-success. Genuine library calls.
- **Cached note:** ALL 7 entries have `cached:true` ("cached previous PASS result"). The wall numbers were reused from a prior run, not freshly measured here. Per the launcher seeding caveat, single-shot cached timings carry staleness risk; the correctness verdict is unaffected (oracle + golden are deterministic) but the 1.53x margin should be treated as directional.
- **Verdict:** **REAL** — real fixture, real library implementation, meaningful exact-match oracle with physically plausible measurements. The only caveats are evidentiary (cached, n=1), not integrity.

## Confidence & caveats

- **Confidence: medium.** Correctness is unambiguous and the implementation/oracle are sound (REAL). The winner ordering, however, rests on **n=1, cached** wall timings (mad=0, single sample), so the 1.53x lead over remotion-media-parser is plausible but not statistically firm — a fresh multi-sample re-run could narrow it.
- The 5918 ms platform outlier is structural (decode-pipeline routing of a probe), not noise, and is safe to treat as a true loss.
- `bench` exposes only `wall` for this scenario; peakMemory/longtasks/throughput were unavailable, so the performance comparison is wall-only.
- NA verdicts for mp4box and web-demuxer were validated against their declared `containersIn` lists and reflect genuine format scope, not under-declaration.
