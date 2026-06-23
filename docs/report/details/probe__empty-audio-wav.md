# probe/empty-audio-wav

family: probe | fixture asset: `empty_audio.wav` (44-byte RIFF/WAVE, 0-length data chunk) | primaryMetric: wall | passCount: 5 (of 7 engines; 2 NA_ENGINE)

## Verdict

- Best framework: **remotion-webcodecs@4.0.479** (status PASS).
- Contested: **YES** — five engines PASS (mediabunny, remotion-webcodecs, remotion-media-parser, ffmpeg.wasm, platform) on the identical `golden-metadata` oracle. Correctness is indistinguishable (all four light-weight parsers report the same single pcm-s16 track and the oracle records no measurements), so the decision falls to performance.
- Decisive factor: **wall-clock median**. remotion-webcodecs probes the empty WAV in **2.795 ms** vs mediabunny's **2.99 ms** — a **1.07x** edge over the runner-up.
- Margin over runner-up: 2.795 ms vs 2.99 ms = 1.07x faster wall; vs remotion-media-parser 4.24 ms = 1.52x; vs ffmpeg.wasm 4.325 ms = 1.55x; vs platform 6000.6 ms = ~2147x. The win is **weak evidence**: n=1, mad=0, and every result is `cached==true`. The 0.195 ms gap is within timer noise for a 44-byte header parse, so the contest between the two pure parsers is effectively a statistical tie.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 2.795 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 2.99 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 4.24 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 4.325 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 6000.635 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

(No `throughputRealtime`, `peakMemory`, or `longtasks` are recorded in this shard — the only metric the scenario declares is `wall`, see `src/scenarios/probe/index.ts:518`.)

## Why the winner wins (deep technical)

The fixture is a structurally-valid but zero-media container: 44 bytes of `RIFF$\0\0\0 WAVE fmt␣ (16) | PCM(1) | 2ch | 48000Hz | 16-bit | data | length=0`. Hexdump confirms `5249 4646 2400` (RIFF, riff-size 0x24=36), `666d 7420 1000` (fmt chunk, 16 bytes), `0100 0200` (format tag 1 = PCM, 2 channels), `80bb 0000` (0xBB80 = 48000 Hz), `0400 1000` (block align 4, 16 bits), `6461 7461 0000 0000` (data chunk, length 0). There are no audio samples and no derivable global duration, so the golden (`fixtures/golden/empty_audio.wav.meta.json`) lists `durationSec: null` plus one `audio / pcm-s16 / 48000 / 2ch / bitrate 1536000` track. The whole operation is a pure header parse — no decode, no sample scan, no WebCodecs work.

`golden-metadata` (`src/core/oracles.ts:595`) compares container, then per-track type/codec/sampleRate/channels. Critically, the duration branch at `oracles.ts:614` only fires `if (got.durationSec != null && want.durationSec != null)`; since the golden duration is `null`, duration is **not** asserted, and the `else if (want.durationSec != null && got.durationSec == null)` branch at `:638` is also skipped (golden is null). So the gate reduces to: report `container:wav` and exactly one `pcm-s16 / 48000 / 2-channel` audio track without throwing on the empty `data` chunk. All five PASS engines satisfy this; the oracle emitted `measurements:{}` for every one, meaning there is no numeric strength differentiator on the correctness axis. Per the decision ladder this is a structural/metadata-exact gate (above perceptual/smoke), so all five wins are genuine — but tied.

remotion-webcodecs reaches the answer via @remotion/media-parser's `parseMedia({ fields: container/tracks/metadata })` (`src/engines/remotion-webcodecs/adapter.ts:332` probe, `:346` the `parseMedia` call), a streaming CPU-JS parser that stops as soon as the requested fields are resolved. For a 44-byte WAV the `fmt ` chunk gives every track field immediately and the `data` chunk header (length 0) is read without iterating samples, so the parser returns essentially after the first read. This is why it lands at 2.795 ms — fractionally ahead of mediabunny.

mediabunny (`src/engines/mediabunny/adapter.ts:417` `metadataFromInput`) is mechanistically near-identical: `getDurationFromMetadata()` first (`:429`, the cheap container-declared duration path), falling back to `computeDuration()` (`:436`) only when metadata yields null, then `getTracks()` (`:443`). For an empty WAV the metadata duration is null/0 and the track list comes straight from the `fmt ` chunk, so mediabunny pays one extra `computeDuration()` round-trip on the zero-sample container before settling — plausibly the source of the ~0.2 ms it trails by. That is the only mechanistic distinction, and it is well inside measurement noise (mad=0 because n=1; there is no spread to confirm the ordering is stable).

So the "win" is real in the sense that remotion-webcodecs recorded the lowest wall time on a real, honestly-gated parse — but it is a coin-flip-grade margin between two functionally equivalent pure-TS/JS header parsers. The genuinely decisive performance fact in this shard is the **gap to platform (6000.6 ms, ~2147x slower)**: the platform adapter routes probe through a `<video>`/MediaSource element load (`configUsed.encode: "<video>→canvas→MediaRecorder"`, decode via `VideoDecoder`), which incurs a full element-attach/metadata-loaded round-trip even for a 44-byte audio-only file, and ffmpeg.wasm (4.325 ms) pays its FS-write + `ffprobe`-style invocation overhead. The two streaming parsers sidestep both.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, runner-up): correct in every field, but 2.99 ms vs 2.795 ms = 1.07x slower wall. Likely cause: an extra `computeDuration()` fallback pass (`adapter.ts:434-441`) after `getDurationFromMetadata()` returns null on the zero-sample data chunk. Margin is within timer noise (n=1, cached).
- **remotion-media-parser@4.0.479** (PASS): same `parseMedia` read core as the winner but configured `fieldsTier: metadata-only` over `webReader`; 4.24 ms = 1.52x slower than the winner. No correctness deficit.
- **ffmpeg.wasm@0.12.15** (PASS): 4.325 ms = 1.55x slower. Correct metadata, but the wasm FS-stage + probe invocation overhead dominates a trivial 44-byte parse.
- **platform@chrome-149** (PASS): correct metadata but 6000.635 ms (durationMs 21999) = ~2147x slower. The browser-native path drags a `<video>`/element-load pipeline through a header-only audio file; massively overpriced for a probe.
- **mp4box@2.3.0** (NA_ENGINE): honest NA — declares `containersIn: ['mp4','mov']` (`src/engines/mp4box/adapter.ts:645`); mp4box.js is an ISOBMFF-only parser and genuinely cannot read RIFF/WAVE. Not under-declared.
- **web-demuxer@4.0.0** (NA_ENGINE): honest NA — declares `containersIn: ['mp4','mov','mkv','webm','ts']` (`src/engines/web-demuxer/adapter.ts:639`); WAV is not in its exposed ffmpeg demuxer set. Not under-declared.

## Anti-cheat validation

- Scenario definition: `src/scenarios/probe/index.ts:508-523` (`id: 'probe/empty-audio-wav'`, `input: 'empty_audio.wav'`, `op: 'probe'`, oracle `golden-metadata`, metric `wall`).
- Fixture: `fixtures/media/empty_audio.wav` **exists**, 44 bytes. Hexdump verified a real, structurally-valid RIFF/WAVE header (PCM, 2ch, 48000 Hz, 16-bit, 0-length `data`). This is a real edge fixture, not a synthetic/mock or empty 0-byte file (it is deliberately the "valid-but-empty twin" of `zero_length.mp4`, per the scenario notes).
- Oracle: `golden-metadata` at `src/core/oracles.ts:595`. Performs a real field-by-field comparison against `fixtures/golden/empty_audio.wav.meta.json` (container + per-track type/codec/sampleRate/channels). Not trivially satisfiable — wrong codec/container/sampleRate/channel count would diff and fail (`:606`, `:667-684`). The duration check is correctly skipped only because the golden duration is intentionally `null` for a 0-sample container (`:614`); the gate still enforces the track shape.
- Winner adapter: remotion-webcodecs `probe()` at `src/engines/remotion-webcodecs/adapter.ts:332`, calling `mp.parseMedia({ container, tracks, metadata })` at `:346`. Genuine @remotion/media-parser invocation — no canned output, no copy-input, no golden short-circuit, no error swallowing (errors would propagate and fail the run).
- Cached note: the winner's result is `cached==true` ("cached previous PASS result"), as are ALL five PASS results. This is reused evidence, not a fresh re-run — staleness risk applies, and combined with n=1 it makes the 2.795-vs-2.99 ms ordering low-confidence.
- Verdict: **REAL** — real fixture, real library implementations on both top engines, meaningful structural oracle. The PASS is real and the gate is a legitimate metadata-exact check (not smoke, not a loose proxy).

## Confidence & caveats

- Confidence in "PASS is correct": high. The fixture, golden, and oracle are all real and the implementations are genuine.
- Confidence in "remotion-webcodecs is THE best": low. The 1.07x wall margin over mediabunny is n=1, mad=0, cached, and ~0.2 ms — indistinguishable from timer jitter on a 44-byte header parse. mediabunny is a co-winner for practical purposes. A fresh, multi-sample re-run could flip the ordering.
- The only robust performance signal here is the ordinal gap to the heavyweight paths (platform ~2147x, ffmpeg.wasm/remotion-media-parser ~1.5x). Both NA_ENGINE verdicts (mp4box, web-demuxer) are honest container-declaration gaps, not under-declared capability.
- No `peakMemory`/`throughput`/`longtasks` were measured (scenario declares only `wall`), so secondary tiebreakers could not be applied.
