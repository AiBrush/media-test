# trim/audio_wav_pcm_copy

- family: trim
- fixture asset: `wav_s16.wav` (RIFF/WAVE, PCM signed-16-bit LE; ~960 KB in `fixtures/media/`)
- container/codec: WAV (RIFF) / `pcm-s16`; copy-trim of byte-range with RIFF `data` chunk size rewrite
- requested range: startUs=1_000_000 .. endUs=4_000_000 (3.000 s); frameAccurate=false
- primaryMetric: throughputRealtime
- passCount: 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- Best framework: **mediabunny@1.48.0** (engineId `mediabunny`)
- Contested: YES — two engines PASS (mediabunny, ffmpeg-wasm), both clear the same single gating oracle.
- Decisive factor: PERFORMANCE. Correctness is comparable — both pass `trim-boundaries` with their measured
  output duration inside the 0.09 s tolerance — so the ladder falls through to throughput/wall.
- Margin over runner-up (ffmpeg-wasm): wall median 7.40 ms vs 21.235 ms = **2.87x faster**;
  throughputRealtime 675.68x vs 235.46x = **2.87x higher**. Caveat: ffmpeg-wasm has *lower* longtasks
  (1017 ms vs mediabunny 3638 ms), and both samples are n==1 cached runs (weaker evidence).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true | 7.40 ms | 675.68x | n/a (n=0) | 3638 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true | 21.235 ms | 235.46x | n/a (n=0) | 1017 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

(peakMemory and targetWrites have n=0 samples in the shard for both PASS engines — no values to report.)

## Why the winner wins (deep technical)

The operation is a *packet-copy* trim of linear PCM in a RIFF/WAVE container: no audio codec to re-encode,
just select the WAV `data` sub-range covering [1.0 s, 4.0 s) and rewrite the RIFF/`data` chunk lengths.
The scenario sets `frameAccurate: false` and `tolerances.durationToleranceSec: 0.09`, with the explicit note
that the fixture's PCM packets are 85.333 ms chunks so a packet-aligned cut may include one edge chunk and
still be correct (`src/scenarios/trim/index.ts:399-411`). The only gate is `trim-boundaries`.

mediabunny took its audio-only packet-copy fast path. With `frameAccurate=false`, `trim()` calls
`tryAudioOnlyPacketCopyTrim` (`src/engines/mediabunny/adapter.ts:1479-1482`) BEFORE falling back to a full
Conversion. That helper opens an `EncodedPacketSink` over the WAV audio track and iterates packets, copying
each packet whose `[timestamp, timestamp+duration)` overlaps the requested range, re-basing presentation
times to the first kept packet's origin, and feeding them into an `EncodedAudioPacketSource` on a fresh WAV
`Output`/`BufferTarget` (`src/engines/mediabunny/adapter.ts:945-984`). This is a pure byte-range copy plus a
RIFF header rewrite emitted by mediabunny's WAV muxer — no decode, no encode, no WebCodecs round-trip. The
env shows `configUsed.coreBuild: "pure-ts-esm"`, `wasmThreads: 0`, `sharedArrayBuffer: false`,
`coopCoep: "not-required"` — a single-pass JS/TS implementation with no worker spin-up or wasm instantiation
cost, which is why wall lands at **7.40 ms / 675.68x realtime**. The oracle measured
`outDurationSec=3.0293 s` vs `requestedDurationSec=3 s`, `durationDeltaSec=0.0293 s` — well inside the 0.09 s
band, with `boundaryFrameComparisons=0` (no video boundary frames and no trim-range frame golden, so the
duration check is the live gate; see `src/core/oracles.ts:2388-2403,2410-2431`). The 0.0293 s overshoot is
exactly the predicted "one extra 85.333 ms edge chunk" behaviour of a packet-aligned cut.

ffmpeg-wasm is correct too but slower for this trivial copy. Its trim runs the dossier `-ss <start>` before
`-i`, `-map 0`, `-t <duration>`, `-c copy`, `-avoid_negative_ts make_zero` pipeline
(`src/engines/ffmpeg-wasm/adapter.ts:2614-2636`), then reads the MEMFS output. For PCM/WAV `-c copy` is also
a byte-range stream copy, and its `durationDeltaSec=0.008 s` is actually *tighter* than mediabunny's (because
`-ss/-t` clamp on sample boundaries more precisely). But it pays for the wasm core: even cached/warm it
reports wall 21.235 ms and only 235.46x realtime — 2.87x slower than mediabunny. The correctness ladder
treats both as equally passing the single structural/metadata gate (`trim-boundaries`), so the marginally
better duration delta does not promote ffmpeg above mediabunny; performance breaks the tie in mediabunny's
favour. The one metric where ffmpeg wins is main-thread blocking: longtasks 1017 ms vs mediabunny's 3638 ms,
which is worth flagging because mediabunny's pure-TS path does its packet copy on the main thread.

## What each other framework did wrong

- ffmpeg.wasm@0.12.15: PASS, but lost on performance — wall 21.235 ms vs 7.40 ms (2.87x slower),
  throughput 235.46x vs 675.68x (0.35x). Its `-c copy` trim is genuinely correct (durationDelta 0.008 s,
  even tighter than the winner), but the wasm core overhead makes it slower for a no-decode PCM copy. Only
  redeeming metric: lower longtasks (1017 ms).
- remotion-media-parser@4.0.479: NA_ENGINE — "engine does not declare operation 'trim'". Honest NA: it is a
  parser/probe library with no mux/trim writer, so it cannot emit a trimmed WAV.
- mp4box@2.3.0: NA_ENGINE — same reason. mp4box is MP4/ISO-BMFF focused and declares no `trim`; it could not
  rewrite a RIFF/WAVE container regardless. Honest NA.
- platform@chrome-149: NA_ENGINE — the bare WebCodecs/`platform` adapter declares no `trim` op. Honest NA
  (WebCodecs has no container-level trim primitive).
- remotion-webcodecs@4.0.479: NA_ENGINE — no `trim` declared. Honest NA.
- web-demuxer@4.0.0: NA_ENGINE — a demuxer only; no `trim` writer declared. Honest NA.

All five NAs are under-no-op declarations, not under-claimed capabilities: none of these engines ship a
container-rewriting trim/mux path for WAV, so the NA is legitimate rather than a dodge.

## Anti-cheat validation

- Scenario: `src/scenarios/trim/index.ts:398-411` (`id: 'audio_wav_pcm_copy'`, asset `wav_s16.wav`,
  container `wav`, codec `pcm-s16`, range 1.0–4.0 s, tolerance 0.09 s, `extraOracles: PLAYABLE_AUDIO`).
- Fixture: `fixtures/media/wav_s16.wav` exists (~960 KB) — a real, non-empty RIFF/WAVE file, not synthetic
  or mock.
- Oracle: `trim-boundaries` at `src/core/oracles.ts:2348-2435`. It probes the produced output duration via
  the reference engine / decoded frame span / simple-container parse and compares to the requested range
  against `durationToleranceSec`. It is a real measurement against the actual produced bytes (no golden
  short-circuit possible — it parses ctx.output). Note that for audio-only WAV there is currently no
  decoded-PCM or `<audio>` smoke oracle (`PLAYABLE_AUDIO = []`, `src/scenarios/trim/index.ts:127`), so the
  duration check is the SOLE gate — a structural/metadata-exact check, but a single one.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1445-1500` (trim entry) and 945-984 (the audio packet
  copy actually executed). Confirmed it iterates real `EncodedPacketSink` packets, copies bytes, and muxes
  via mediabunny's `Output`/`EncodedAudioPacketSource` — no canned output, no input->output passthrough
  (the no-op early return at 1468-1477 only fires for a 0..duration identity trim, which this 1–4 s range is
  not), no golden short-circuit, throws if zero packets fall in range (line 982-983).
- cached note: mediabunny's result has `cached: true` ("cached previous PASS result") — it was REUSED, not
  re-executed this run. The bench numbers (wall 7.40 ms, n=1) and the duration measurement come from a prior
  run; staleness risk is low (deterministic packet copy) but the n==1 cached evidence means the perf margin
  should be treated as indicative, not a fresh measurement. ffmpeg-wasm is likewise cached.
- Verdict: **REAL** — real fixture, real packet-copy implementation, and a real duration comparison against
  the produced bytes with a physically plausible measurement (3.0293 s for a requested 3.0 s, matching the
  documented one-extra-85.333 ms-chunk packet alignment). The gate is genuine but is a single duration-only
  oracle for audio (no PCM-exact comparison), so correctness strength is moderate rather than bit-exact.

## Confidence & caveats

- Confidence: medium. The winner is unambiguous on the documented decision procedure (only 2 PASS, comparable
  single-oracle correctness, mediabunny 2.87x faster on both wall and the primaryMetric throughputRealtime).
- Caveats: (1) Both PASS results are `cached: true` with n==1 — the perf margin is from prior runs, not a
  fresh re-measure. (2) The gate is duration-only (no decoded-PCM bit-exact oracle for WAV here), so neither
  engine's *sample-level* fidelity was verified by the suite for this case. (3) ffmpeg-wasm actually has the
  tighter duration delta (0.008 s vs 0.0293 s) and lower longtasks (1017 ms vs 3638 ms); if main-thread
  blocking were the priority metric, ffmpeg would win — mediabunny's pure-TS copy runs on the main thread.
