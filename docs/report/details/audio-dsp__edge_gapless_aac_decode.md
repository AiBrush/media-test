# audio-dsp/edge_gapless_aac_decode

family: audio-dsp | fixture asset: `fixtures/media/gapless_aac.m4a` (real, 13504 bytes, AAC-LC in MP4/isom, 44100 Hz stereo) | primaryMetric: wall | passCount: 1 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Uncontested.** Exactly one engine reached `status==PASS`; the other six are `NA_ENGINE`.
- **Decisive factor:** mediabunny is the *only* engine that declares both the `trim` operation **and** the `audio-samples:gapless-priming` feature/capability that this scenario requires (`requires.features = ['trim:frame-accurate', 'audio-samples:gapless-priming']`, defined in `src/scenarios/audio-dsp/index.ts:515`). Every other engine was gated out at the capability-registry stage before any media was touched.
- **Margin over runner-up:** none — no other engine ran. mediabunny's absolute numbers: wall median 10.615 ms, peakMemory 34,443,833 bytes (~32.8 MB), longtasks 19,963 ms (instrumentation window), single sample (n=1).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass | 10.615 ms | n/a (not measured) | 34,443,833 B | 19,963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'audio-samples:gapless-priming' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

(throughputRealtime is not in this scenario's metric set — scenario declares `metrics: ['wall', 'peakMemory', 'longtasks']`, `index.ts:556`.)

## Why the winner wins (deep technical)

The operation is a *full-range frame-accurate trim* of an **AAC-LC elementary stream carried in an MP4 (isom/iso2/mp41) container** — `startUs:0 .. endUs:1_012_993` (`index.ts:521`). AAC encoders prepend **encoder delay (priming)** samples and append **padding** to fill the last 1024-sample frame; a correct gapless pipeline must strip both so the *decoded* sample count equals the true media duration, not the raw frame-aligned count. The fixture's `mdhd` timescale is `0xac44` = 44100 Hz (confirmed by hexdump of `gapless_aac.m4a`), and it carries an `edts/elst` edit list — the exact mechanism browsers use to express priming removal.

mediabunny's trim path (`src/engines/mediabunny/adapter.ts:1445-1500`) opens the input, and because `opts.frameAccurate===true` it does **not** take the lossless audio-only packet-copy shortcut (`adapter.ts:1479-1482` is skipped). Instead it runs the real `Conversion` with `trim: { start: 0, end: 1.012993 }` (`adapter.ts:1485-1496`) through `runConversion`, re-muxing into a fresh MP4 `Output`/`BufferTarget`. The capability that lets it claim correctness is declared at `adapter.ts:1069` — `'audio-samples:gapless-priming'` with the comment "full-range AAC trims preserve priming/padding-stripped decode length" — and `'trim:frame-accurate'` at `adapter.ts:1051`. Those two tokens are exactly what the scenario's `requires.features` demands, so the runner admits mediabunny and gates everyone else.

The proof of correctness is in the oracle. `gaplessDecodedSampleCountInvariant` (`src/core/oracles.ts:2902-2975`) takes mediabunny's trimmed output bytes and feeds them to a **real browser `AudioContext.decodeAudioData`** via `decodeAudioSampleCount` (`oracles.ts:3280-3300`) — this is genuine PCM rendering, not a metadata read. The shard measurements:

- `decodedSamples = 44673`, `expectedDecodedRateSamples = 44673`, `sampleDelta = 0` — exact match (the gate allows delta ≤ 1, `oracles.ts:2959`).
- `decodedSampleRate = 44100`, `decodedChannels = 2` — matches golden.
- `goldenDurationSec = 1.013`, `decodedDurationSec = 1.0129931972789115`, `durationDeltaSec = 6.8e-6` s — i.e. sub-one-sample (tolerance is `1/sampleRate ≈ 2.27e-5` s, `oracles.ts:2962`).
- `rawAacFrameSamples = 46080` (45 packets × 1024), `primingSamples = 1024`, `rawMinusExpectedSourceRateSamples = 1407`.

The arithmetic is internally consistent and physically real: 46080 raw frame samples − 1024 priming − 383 trailing padding = 44673 decoded samples; the 1407 = 1024 priming + 383 padding gap between raw frames and true duration is precisely the gapless delta. Critically the oracle's anti-trivial guard at `oracles.ts:2965-2966` would have *failed* the engine if `decodedSamples === rawAacFrameSamples` (44673 ≠ 46080), so the PASS demonstrates priming/padding was actually stripped — not merely re-containerized. This is a strong, structural/metadata-exact correctness gate (property-invariant on decoded PCM count), well above smoke level.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'audio-samples:gapless-priming'". It declares `trim` but not the gapless-priming capability. Honest NA: ffmpeg.wasm trims AAC at the packet/frame level via its CLI without applying the MP4 edit-list priming removal in this adapter, so it correctly abstains rather than risk an off-by-1024-sample failure.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". MP4Box is a demuxer/box-layout tool; it does not expose a sample-accurate trim/transcode op. Honest NA.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". The bare WebCodecs/MSE platform adapter offers decode/demux primitives but no packaged trim operation. Honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". A parser-only engine; no encode/mux/trim path. Honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Demux-only (ffmpeg-wasm demuxer wrapper); no trim. Honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Despite being a transcode-capable WebCodecs engine, it does not declare the `trim` op in its capability set, so it is gated out. Honest NA (under-declaration is plausible but not exploited — no PASS claimed).

## Anti-cheat validation

- **Scenario:** `src/scenarios/audio-dsp/index.ts:509-528` (`id: 'edge_gapless_aac_decode'`), op `trim`, `frameAccurate:true`, `invariant:'gapless-decoded-sample-count-priming-removed'`, full range `0..1_012_993` us.
- **Fixture exists & is real:** `fixtures/media/gapless_aac.m4a`, 13504 bytes. Hexdump confirms a valid MP4: `ftyp isom/iso2/mp41`, `moov/trak/mdia/mdhd` with timescale `0xac44`=44100, and an `edts/elst` edit list (the priming-removal carrier). Not synthetic/empty/mock.
- **Winner adapter genuinely implements the op:** `src/engines/mediabunny/adapter.ts:1445-1500` runs a real mediabunny `Conversion` with a `trim` range (`adapter.ts:1485-1496`); it does not return canned bytes, does not short-circuit to the golden, and the no-op identity shortcut (`adapter.ts:1468-1477`) is bypassed because `startUs===0` only triggers `isNoopTrim` when the range equals the *whole* duration AND container matches — here the frame-accurate transcode branch is taken. No error swallowing (it throws on bad ranges, `adapter.ts:1450-1455`).
- **Oracle is a real, non-trivial comparison:** `src/core/oracles.ts:2902-2975`. It decodes the output PCM with a real `AudioContext.decodeAudioData` (`oracles.ts:3280-3300`), enforces `sampleDelta ≤ 1`, channel match, sub-sample duration tolerance, AND an explicit "priming not stripped" failure if decoded count equals raw frame count (`oracles.ts:2965-2966`). Tolerance is tight (1 sample / 22.7 µs), not "anything passes". Measurements (44673 / 46080 / 1024 priming / 1407 gap) are physically plausible for 1.013 s of 44.1 kHz stereo AAC.
- **Cached note:** mediabunny's result has `cached==true` ("cached previous PASS result"), durationMs 2343. The PASS evidence is reused, not freshly re-run this cycle — minor staleness risk, but the cached measurements are self-consistent and the fixture/adapter/oracle code all check out.
- **Verdict: REAL.** Real fixture + real Conversion-based trim implementation + a meaningful decoded-PCM-count oracle with a built-in anti-trivial guard.

## Confidence & caveats

- **Confidence: high** on the correctness story (oracle decodes real PCM; numbers are exact and self-consistent; fixture verified on disk).
- **Caveats:** (1) Single PASS engine means there is no competitive ranking — "best" here is "only eligible". (2) Six NA_ENGINE outcomes rest on capability declarations; ffmpeg.wasm's and remotion-webcodecs' abstentions could in principle be under-declared capabilities, but neither claims a (possibly wrong) PASS, so the gate is conservative and honest. (3) mediabunny's bench is `n==1` (no spread; mad=0, p95==median), so the 10.615 ms wall is weak performance evidence — though performance is moot with no contender. (4) Result is cached, so absolute timing reflects a prior run, not the current environment.
