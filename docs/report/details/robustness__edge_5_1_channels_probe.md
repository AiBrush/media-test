# robustness/edge_5_1_channels_probe

- **Family:** robustness
- **Fixture asset:** `fixtures/media/wav_5_1.wav` (5.8 MB, real RIFF/WAVE WAVE_FORMAT_EXTENSIBLE, 6 ch / 48000 Hz / PCM-S16)
- **Operation:** `probe`
- **Primary metric:** wall (scenario metrics: `wall`, `peakMemory`, `longtasks`); only `durationMs` present per entry (no `bench{}` block in this shard)
- **Gating oracle:** `golden-metadata`
- **Pass count:** 4 of 7 (mediabunny, remotion-webcodecs, platform, remotion-media-parser); 2 NA_ENGINE; 0 FAIL

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — 4 engines PASS, all satisfying the same single oracle (`golden-metadata`) with identical correctness (`durationDeltaSec: 0`).
- **Decisive factor:** PERFORMANCE on wall time. Correctness is a tie (all 4 report container=wav, 1 audio track, channels=6, sampleRate=48000, codec=pcm-s16, duration Δ=0s). mediabunny wins on wall (`durationMs: 8`).
- **Margin over runner-up:** runner-up is a tie between remotion-webcodecs and remotion-media-parser at `16 ms` each → mediabunny is **2.0x faster wall**. vs platform (30 ms) = **3.75x**; vs ffmpeg.wasm (157 ms) = **19.6x**. Caveat: all four results are `cached:true`, n is effectively 1 (single `durationMs`, no median/mad/p95 spread), so the margin is weak single-sample evidence and the deltas are within tens of milliseconds.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 8 | n/a (not in shard) | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 16 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 16 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 30 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 157 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

All four PASS entries report the same `golden-metadata` measurements: `durationDeltaSec: 0`, `durationToleranceSec: 0.041666…` (±1 frame at 24fps band), detail "metadata matches golden (1 track(s))".

## Why the winner wins (deep technical)

The operation is a pure **probe** of an uncompressed **PCM-S16 5.1 stream in a RIFF/WAVE container**. The forensic point of this scenario (`src/scenarios/robustness/index.ts:778-788`, note: "§A.16 non-stereo channel count: a 5.1 PCM WAV must report channel layout without assuming stereo") is whether a demuxer reads the real `fmt ` chunk channel count rather than defaulting to stereo. The fixture is genuinely 5.1: its WAVE_FORMAT_EXTENSIBLE header (tag `0xFFFE`) declares `nChannels = 0x0006` and `nSamplesPerSec = 0x0000BB80 = 48000` (verified by hexdump of `fixtures/media/wav_5_1.wav`). The golden (`fixtures/golden/wav_5_1.wav.meta.json`) encodes exactly that: `channels: 6`, `sampleRate: 48000`, `codec: pcm-s16`, `durationSec: 10`.

Correctness is a 4-way tie because `golden-metadata` (`src/core/oracles.ts:595-657`) performs a strict positional track comparison — `compareTrack` (`src/core/oracles.ts:659-686`) flags any mismatch on `channels` (`a.channels !== b.channels`, line 682-684), `sampleRate`, `codec`, and container, with duration only within ±tolerance. All four engines reproduced channels=6 and duration Δ=0, so none "assumed stereo." For an uncompressed PCM WAV there is no decode/transcode work; the entire cost is parse-the-header. Hence the differentiator collapses to parse efficiency, and the verdict is performance.

mediabunny's probe path is genuinely implemented and cheap: `metadataFromInput` (`src/engines/mediabunny/adapter.ts:417-474`) takes the **cheap metadata duration path first** via `input.getDurationFromMetadata()` (line 429) — which reads the container's declared duration without scanning samples — and only falls back to `computeDuration()` on null. For WAV the `data` chunk size + `fmt ` byte-rate give duration directly, so no sample walk occurs. Channels come from the real demuxer: `normalizeTrack` (`src/engines/mediabunny/adapter.ts:332-347`) calls `a.getNumberOfChannels()` and `a.getSampleRate()` on the `InputAudioTrack` (lines 335-338), i.e. straight from the parsed `fmt ` chunk. mediabunny's adapter declares `wav` in `containersIn` (`src/engines/mediabunny/adapter.ts:1036`) and uses a `pure-ts-esm` core with `coopCoep: not-required`, `sharedArrayBuffer: false` (env.configUsed) — a single-pass TypeScript RIFF reader with no wasm boot and no worker/COOP-COEP requirement, which is why its wall (8 ms) beats the others.

The losers' overhead is structural. ffmpeg.wasm (157 ms, ~19.6x slower) pays wasm module instantiation + FS staging + a full libavformat open for a job that is a 44-byte header read. platform@chrome-149 (30 ms) routes a WebCodecs/`<video>` pipeline (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`) whose probe of an audio-only WAV still spins up more machinery than a direct RIFF parse. remotion-media-parser (16 ms, `backend: cpu-js`, `fieldsTier: metadata-only`) and remotion-webcodecs (16 ms) are both fast pure-JS/streaming readers but still 2x mediabunny's header-only path.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, but lost on wall: `durationMs: 16` vs mediabunny 8 (2.0x slower). Same oracle, same `durationDeltaSec: 0`; no correctness edge to break the tie. No defect.
- **remotion-media-parser@4.0.479** — PASS, but lost on wall: `durationMs: 16` vs 8 (2.0x slower). `backend: cpu-js`, `fieldsTier: metadata-only` — correct but a hair slower than mediabunny's header-only read. No defect.
- **platform@chrome-149** — PASS, but lost on wall: `durationMs: 30` vs 8 (3.75x slower). The WebCodecs/`<video>`+MediaRecorder pipeline is heavier than a direct RIFF parse for an audio-only probe. No defect.
- **ffmpeg.wasm@0.12.15** — PASS, but slowest: `durationMs: 157` vs 8 (19.6x slower) from wasm instantiation + virtual-FS staging + full libavformat open. No defect.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'wav'". HONEST NA — web-demuxer's capability registry does not list `wav`; it is an MP4/MKV/WebM-oriented FFmpeg-wasm demuxer and does not advertise RIFF/WAVE probe support. Not an under-declared capability.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'wav'". HONEST NA — mp4box.js is an ISO-BMFF (MP4/MOV/fragmented) parser by design and genuinely cannot read RIFF/WAVE. Correct exclusion.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:780-788` (id `edge_5_1_channels_probe`, op `probe`, asset `wav_5_1.wav`, containersIn `['wav']`, audioCodecs `['pcm-s16']`, oracle `golden-metadata`). Registered via `shapeEdgeScenarios` map at `src/scenarios/robustness/index.ts:791-808`.
- **Fixture:** `fixtures/media/wav_5_1.wav` EXISTS, 5.8 MB. Header verified by hexdump: `RIFF…WAVE fmt ` with WAVE_FORMAT_EXTENSIBLE tag `0xFFFE`, **6 channels**, 48000 Hz, 16-bit, `data` chunk follows — a real, non-synthetic 5.1 PCM file. NOT empty/mock.
- **Oracle:** `golden-metadata` at `src/core/oracles.ts:595-657`; strict track comparison `compareTrack` at `src/core/oracles.ts:659-686`. It performs a REAL field-by-field comparison vs `fixtures/golden/wav_5_1.wav.meta.json` (container, duration±tol, per-track codec/sampleRate/channels). The `channels` check is exact (line 682), so a stereo-assuming demuxer would FAIL — the gate genuinely tests the scenario's intent. Not trivially satisfiable for channels/codec/sampleRate (duration alone has a ±tolerance, but the categorical fields do not).
- **Winner adapter:** mediabunny probe — `metadataFromInput` `src/engines/mediabunny/adapter.ts:417-474`, audio track normalization `src/engines/mediabunny/adapter.ts:332-347` (real `getNumberOfChannels()`/`getSampleRate()` calls). No canned output, no golden short-circuit, no input→output copy, no swallowed error reported as success. `wav` declared at `src/engines/mediabunny/adapter.ts:1036`.
- **Measurements plausibility:** golden meta (6ch/48kHz/pcm-s16/10s) implies bitrate 48000×6×16 = 4,608,000 bps, matching golden `bitrate: 4608000`; 10s × 4.608 Mbps / 8 ≈ 5.76 MB ≈ the 5.8 MB file size. Physically consistent with a real 5.1 PCM WAV. `durationDeltaSec: 0` is plausible (declared header duration == golden).
- **Cached note:** ALL FOUR PASS results have `cached: true` ("cached previous PASS result"). The evidence is reused, not freshly re-run; staleness risk applies and the wall margins (8 vs 16 ms) are single-sample, no median/mad/p95. The PASS itself is structurally sound, but the performance ranking rests on cached single durations.
- **Verdict:** **REAL** — real 5.1 fixture, genuine library probe implementation, and a meaningful exact-channels oracle that would catch a stereo-assumption bug. The only weakness is cached-only timing evidence (noted), which affects the strength of the performance margin, not the validity of the PASS.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict (REAL, exact channels gate) is high-confidence; the winner choice rests entirely on wall time because correctness is a 4-way tie.
- All four PASS entries are `cached:true` with no `bench{}` block — only a single `durationMs` each. No median/mad/p95/n spread is available, so the 2.0x margin over the runners-up is weak single-sample evidence and could shuffle on a fresh re-run (per the launcher seeding caveat: clear raw + `.browser-cache` for an honest fresh timing).
- `throughputRealtime`, `peakMemory`, `longtasks` are not present in this shard's entries, so the perf tiebreak used only wall.
- Tiebreaker corroboration favors mediabunny anyway: pure-TS ESM, `coopCoep: not-required`, `sharedArrayBuffer: false`, no wasm boot — the lightest probe path for a header-only RIFF read.
