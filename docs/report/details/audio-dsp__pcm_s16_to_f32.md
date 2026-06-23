# audio-dsp/pcm_s16_to_f32

- family: audio-dsp
- fixture asset: `wav_s16.wav` (fixtures/media/wav_s16.wav, 960 KB — real PCM s16 WAV)
- primaryMetric: wall (config also reports throughputRealtime, peakMemory, longtasks)
- passCount: 2 of 7 (CONTESTED)
- operation: transcode WAV(pcm_s16le) -> WAV(pcm_f32le), no DSP filter (pure format normalization)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (contested — 2 engines PASS).
- Decisive factor: **performance**. Correctness is a tie (both pass the identical single oracle with
  identical measurements), so the win is on speed and main-thread responsiveness.
- Margin over runner-up (mediabunny): **1.64x faster wall** (30.75 ms vs 50.575 ms), **1.64x higher
  realtime throughput** (162.6x vs 98.86x), and **26.9x fewer long-task ms** (159 ms vs 4277 ms).
  mediabunny is the only metric winner on memory: ffmpeg uses **1.81x more peak memory**
  (69.01 MB vs 38.08 MB). On balance, the wall + longtask margins decide it for ffmpeg.wasm.
- Caveat: both results are `cached==true` and `n==1` (`mad==0`, `p95==median`) — single-sample
  evidence; the ranking is directionally clear but statistically thin.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | 30.75 ms | 162.60x | 69.01 MB | 159 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass | 50.575 ms | 98.86x | 38.08 MB | 4277 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-f32' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Both PASS engines reported the same oracle outcome: `property-invariant` =
`[invariant transcode output metadata] wav, 1 track(s) match requested output shape`,
measurements `{ durationDeltaSec: 0, durationToleranceSec: 0.041666..., audioTracks: 1 }`.

## Why the winner wins (deep technical)

This is a container-preserving, codec-changing audio transcode: RIFF/WAVE carrying `pcm_s16le`
(interleaved 16-bit little-endian PCM) -> RIFF/WAVE carrying `pcm_f32le` (32-bit IEEE float).
There is no compressed bitstream and no entropy coder involved; the only real work is decode-to-PCM
and a per-sample integer->float normalization (`sample/32768`) plus re-muxing a new WAV header. With
no `gainLinear`/`fade` in `opts.audio` (opts = `{ container: 'wav', audio: { codec: 'pcm-f32' } }`),
the operation is a straight format conversion, so both engines do essentially the same DSP and the
contest reduces to runtime efficiency.

ffmpeg.wasm runs the conversion as a genuine ffmpeg invocation. In
`src/engines/ffmpeg-wasm/adapter.ts:2461-2508` the audio branch resolves the encoder via
`audioEncoderName(a.codec)` — `pcm-f32` maps to `pcm_f32le` in `src/engines/ffmpeg-wasm/codecs.ts:42`
— and pushes `-c:a pcm_f32le` onto the arg list (`adapter.ts:2472`). No `-af` filter is added
(gain/fade absent), so ffmpeg's `swr`/PCM path does the s16->f32 normalization natively, writes a
real WAV, and the adapter reads the produced bytes back (`readBinary(outName)`), returning real
output — not a copy of the input and not a golden short-circuit. The config used
(`env.configUsed`) is the single-thread wasm core (the WAV/PCM path is cheap and CPU-light), and the
160 ms-class long-task figure (159 ms) shows the work is dominated by one short wasm exec. At
throughputRealtime 162.6x, a multi-second clip is reformatted in ~31 ms.

mediabunny also PASSes the same oracle with identical measurements, and per `env.configUsed` it runs
its pure-TS ESM core with `pipeline: streaming-lockstep`, `coopCoep: not-required`,
`sharedArrayBuffer: false`. Its correctness is indistinguishable here (durationDeltaSec 0, 1 audio
track, wav container). It even uses far less memory (38.08 MB vs 69.01 MB; ffmpeg's monolithic wasm
heap + FS scratch inflates RSS). But mediabunny's TS sample-conversion + WAV authoring spends
**4277 ms in long tasks** — 26.9x more main-thread blocking than ffmpeg's 159 ms — and is 1.64x
slower wall (50.575 ms). For a UI-facing browser transcode, that long-task gap is the most
consequential difference, and combined with the wall/throughput edge it makes ffmpeg.wasm the winner
despite its larger memory footprint.

The oracle that gated both engines is `property-invariant` -> `transcodeOutputMetadataInvariant`
(`src/core/oracles.ts:3626-3708`). It reference-probes the produced bytes and asserts: container ==
requested ('wav'), duration delta within tolerance (got 0 s, tol 0.0417 s), and the requested audio
track shape (1 audio track). It does NOT decode the PCM and compare samples, so it cannot
distinguish "correctly normalized f32" from "f32-labelled but wrong samples." That makes the PASS
real but shallow (see Anti-cheat).

## What each other framework did wrong

- **mediabunny@1.48.0 (PASS, lost on perf):** correctness identical (same oracle, same measurements),
  but 1.64x slower wall (50.575 vs 30.75 ms), 1.64x lower throughput (98.86x vs 162.6x), and
  26.9x more long-task time (4277 vs 159 ms). It wins only on peak memory (38.08 vs 69.01 MB, 0.55x).
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare output container 'wav'". Honest NA —
  the WebCodecs/MediaRecorder platform path has no WAV/RIFF muxer, so it cannot emit a WAV target.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare audio codec 'pcm-f32'".
  Honest NA — WebCodecs AudioEncoder does not expose linear-PCM f32 as an output codec.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'transcode'". Honest NA —
  it is a demuxer only; no encode/transcode capability.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'transcode'".
  Honest NA — it is a parser/probe-only engine.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare operation 'transcode'". Honest NA — an ISO
  BMFF box tool with no audio transcode and no WAV support.

## Anti-cheat validation

- Scenario definition: `src/scenarios/audio-dsp/index.ts:211-220` (case `pcm_s16_to_f32`,
  `asset: 'wav_s16.wav'`, `opts { container:'wav', audio:{ codec:'pcm-f32' } }`,
  `bitReproducible: true`). Oracle wired at `index.ts:293-296` (`conversionOracles` -> only
  `['property-invariant']`) and `index.ts:298-316` (op `transcode`, options tagged
  `invariant: 'transcode-output-metadata'`).
- Fixture: `fixtures/media/wav_s16.wav` exists (real, 960 KB). Not synthetic/empty/mock. No golden
  file exists for this scenario id (no `fixtures/golden/*pcm_s16_to_f32*`), consistent with a
  metadata-only invariant rather than a digest comparison.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2165` (transcode entry), `:2461-2508` (audio
  encoder selection + `-c:a pcm_f32le`), codec map `src/engines/ffmpeg-wasm/codecs.ts:42`. Genuine:
  invokes real ffmpeg wasm, reads back produced bytes, returns them. No canned output, no
  input->output copy, no golden short-circuit, no swallowed-error success.
- Gating oracle: `src/core/oracles.ts:3626-3708` (`transcodeOutputMetadataInvariant`), dispatched
  from `propertyInvariant` at `oracles.ts:2650-2651`. It performs a REAL reference-probe of the
  output and checks container/duration/track-shape. Measurements are physically plausible (duration
  exactly preserved for a lossless reformat; 1 audio track for a mono/stereo WAV).
- Verdict: **WEAK-GATE.** The scenario is *named* `pcm_s16_to_f32`, flagged `bitReproducible: true`,
  with notes "s16 -> f32 (sample/32768 normalization); exact, reproducible" — implying a bit-exact
  PCM digest. But the only oracle that runs verifies metadata (container='wav', durationDeltaSec=0,
  audioTracks=1), NOT the actual sample conversion. The code itself admits this at
  `src/scenarios/audio-dsp/index.ts:288-292`: "The `bitReproducible` flag remains as documentation
  for the future PCM-digest oracle; it does not drive a guaranteed-failing ... oracle today." An
  `audioPcmDigestInvariant` exists (`oracles.ts:2977`) but is not selected here. So the PASS is real
  (both engines genuinely emit f32 WAV of the right duration/shape) but the gate does not prove the
  s16->f32 normalization is numerically correct — a mislabeled or mis-scaled f32 stream of the right
  duration could also pass. Not CHEAT (no faked data; real fixture, real transcode), but the gate is
  looser than the scenario's name/intent.
- Cached note: both winning entries have `cached==true` ("cached previous PASS result"). Numbers were
  reused, not re-run this session — staleness risk for the perf margins specifically.

## Confidence & caveats

- Confidence: medium. The eligibility and ranking are unambiguous (only 2 PASS; correctness tied;
  ffmpeg wins wall/throughput/longtasks by clear margins). But (1) the oracle is metadata-only, so
  neither engine is proven bit-exact for the s16->f32 math, and (2) both results are cached with
  `n==1`/`mad==0`, so the performance margins are single-sample and could shift on a fresh run.
- mediabunny's large memory advantage (0.55x of ffmpeg) is a legitimate counter-argument if peak
  memory is the deployment constraint; the verdict assumes wall + main-thread responsiveness are the
  primary cost, as indicated by primaryMetric=wall.
