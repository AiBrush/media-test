# audio-dsp/aiff_container_probe

- **Family:** audio-dsp
- **Fixture asset:** `fixtures/media/pcm_s16be.aiff` (~960 KB, real big-endian PCM AIFF; 5s stereo, 48 kHz)
- **Golden:** `fixtures/golden/pcm_s16be.aiff.meta.json` (container=aiff, durationSec=5, 1 audio track pcm-s16be / 48000 Hz / 2ch / 1.536 Mbps)
- **Operation:** `probe` (container detection + big-endian PCM codec identification)
- **primaryMetric:** wall
- **passCount:** 1 / 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` (engineId `ffmpeg-wasm`).
- **Contested?** No — **uncontested**. Exactly 1 engine reached PASS; the other 6 returned `NA_ENGINE`.
- **Decisive factor:** It is the only engine that **declares the `aiff` input container** in its capability set. All six competitors short-circuit to `NA_ENGINE` with the identical reason `engine does not declare input container 'aiff'`, so they never run an oracle.
- **Margin over runner-up:** N/A — no second engine produced any oracle result; there is no performance contest to measure. ffmpeg.wasm passed `golden-metadata` with `durationDeltaSec=0` (exact, against a ±0.04167 s = 1-frame tolerance), wall median 9.55 ms (n=1), 104.7 ops/s.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 9.55 ms | n/a (opsPerSec 104.7) | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |

(The shard reports only `wall` and `opsPerSec` bench metrics for this probe scenario — no throughputRealtime/peakMemory/longtasks were collected, consistent with `metrics: ['wall','opsPerSec']` in the scenario definition.)

## Why the winner wins (deep technical)

This scenario pins **AIFF container detection plus big-endian linear-PCM codec identification** — the Apple/SGI IFF-based `FORM…AIFF` container carrying an `SSND` chunk of two's-complement, network-byte-order 16-bit samples (`pcm_s16be`), as opposed to the little-endian `pcm_s16le` that dominates WAV/RIFF. AIFF is a comparatively rare container in the web-media world: the browser `MediaSource`/WebCodecs demuxers and the JS-native demuxers in this suite simply do not implement an AIFF parser. The gate is therefore won at the **capability-negotiation** layer, not at a performance shoot-out.

ffmpeg.wasm is the only engine whose declared `containersIn` includes `aiff`. The adapter lists `aiff` explicitly in both its capability sets (`src/engines/ffmpeg-wasm/adapter.ts:173` and `:187`) and declares `pcm-s16be` among its audio codecs (`adapter.ts:158`), so the runner's `requires: { containersIn:['aiff'], audioCodecs:['pcm-s16be'] }` (scenario at `src/scenarios/audio-dsp/index.ts:431-462`) is satisfiable and the scenario is actually executed rather than negotiated away.

Mechanistically, the probe does not rely on a separate `ffprobe` binary. The vendored `@ffmpeg/core` 0.12.10 has a broken `_ffprobe` entry (documented at `adapter.ts:262-268`: it surfaces "ffprobe exited -1" for every probe). Instead `probe()` (`adapter.ts:1892-1904`) writes the input to the WASM FS and calls `runInfo()` (`adapter.ts:1912-1930`), which runs `ffmpeg -hide_banner -i <in>` with **no output file**. ffmpeg prints the full Input block to the log, then exits non-zero on "At least one output file must be specified" — an *expected* abort, guarded by the `^Input #\d+` regex check. `metadataFromLog()` (`adapter.ts:1946+`) then parses duration, tracks (codec → canonical via the mapper at `adapter.ts:319`, which maps the log token `pcm_s16be` to `pcm-s16be`), sample rate and channels straight from ffmpeg's libavformat AIFF demuxer output. Container is normalized from the `.aiff`/`.aif` extension at `adapter.ts:799`. This is a genuine demux/parse of the real bytes — ffmpeg's own AIFF reader interprets the `COMM` chunk (sample rate as 80-bit IEEE-754 extended, channel count, bit depth) and the `SSND` chunk.

The gating oracle `golden-metadata` (`src/core/oracles.ts:595-657`) performs a real structural comparison against the committed golden: container string, duration within a strict ±1-frame band, track count, and per-track `type/codec/sampleRate/channels` (`compareTrack`, `oracles.ts:659+`). The shard's measurements — `durationDeltaSec: 0` against `durationToleranceSec: 0.04167` — show ffmpeg's parsed duration matched the golden's 5 s **exactly** (delta 0), and the `pcm-s16be`/48000/2ch track matched, yielding `metadata matches golden (1 track(s))`. These are physically plausible for the real 960 KB fixture (5 s × 48000 × 2ch × 16 bit ≈ 960 KB of PCM, consistent with the 1.536 Mbps golden bitrate). This is a structural/metadata-exact oracle (mid-ladder), stronger than a smoke gate.

## What each other framework did wrong

- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare input container 'aiff'". Honest NA. web-demuxer's bundled ffmpeg demuxer build does not expose AIFF as a registered input container in its declared caps.
- **platform@chrome-149** — `NA_ENGINE`: same reason. Honest NA. Chrome WebCodecs/`MediaSource` has no AIFF demuxer; the platform adapter correctly does not claim it.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: same reason. Honest NA. The Remotion media parser supports MP4/WebM/MKV/etc. but not the IFF/AIFF container family.
- **mediabunny@1.48.0** — `NA_ENGINE`: same reason. Honest NA. mediabunny's input demuxers cover ISOBMFF/Matroska/WAV/etc., not AIFF.
- **mp4box@2.3.0** — `NA_ENGINE`: same reason. Honest NA. mp4box is strictly an ISOBMFF (MP4/MOV) box parser; AIFF is an unrelated IFF chunk format and is correctly out of scope.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: same reason. Honest NA. Inherits Remotion/WebCodecs demuxing scope, which excludes AIFF.

All six NAs are genuine capability gaps (the AIFF/IFF container is not supported by these libraries/runtime), not under-declared capabilities being hidden to dodge the test.

## Anti-cheat validation

- **Scenario:** `src/scenarios/audio-dsp/index.ts:431-446` (`id: 'aiff_container_probe'`, `asset: 'pcm_s16be.aiff'`, `container: 'aiff'`, `audioCodecs: ['pcm-s16be']`), built into a Scenario at `:448-462` with `op:'probe'`, `oracles:['golden-metadata']`. Notes (`:437`) state it pins AIFF detection + big-endian PCM identification.
- **Fixture:** `fixtures/media/pcm_s16be.aiff` exists, ~960 KB — a real big-endian PCM AIFF file, not synthetic/empty/mock. Golden `fixtures/golden/pcm_s16be.aiff.meta.json` exists and contains plausible real metadata.
- **Oracle:** `golden-metadata` at `src/core/oracles.ts:595-657` — real field-by-field comparison (container, duration within ±0.04167 s, track count, codec/sampleRate/channels). Not trivially satisfiable: a wrong container, wrong codec token, wrong sample rate or a >1-frame duration error would all fail. Measured `durationDeltaSec=0` is an exact match, not a slack pass.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts` — `probe()` `:1892`, `runInfo()` `:1912` (real `ffmpeg -i` exec), `metadataFromLog()` `:1946`, codec map `:319`, container norm `:799`, declared `aiff` `:173/:187`, `pcm-s16be` `:158`. Genuinely demuxes the real bytes via the vendored WASM core; no canned output, no input→output copy, no golden short-circuit, no swallowed error reported as success (failure to find an Input block throws).
- **Verdict:** **REAL** — real fixture + real ffmpeg.wasm demux implementation + meaningful structural oracle with an exact (Δ=0) measurement.
- **Cached note:** ffmpeg.wasm's entry has `cached:true` ("cached previous PASS result"); the PASS was reused from a prior run, not re-executed in this run. The implementation/oracle/fixture all check out, so staleness risk is low, but the 9.55 ms wall / 104.7 ops/s numbers come from an earlier execution (n=1) and should be treated as indicative, not freshly measured.

## Confidence & caveats

- **Confidence:** high. The win is structural (only engine declaring AIFF) and the oracle measurement is an exact metadata match against a real fixture and golden.
- **Caveats:** (1) Uncontested — there is no performance comparison; "best" here means "only engine that can read AIFF at all." (2) bench is `n=1` and `cached:true`, so timing is single-sample and reused. (3) The six NAs are correctly honest, but they are capability declarations, not runtime failures — none of these libraries was forced to attempt and fail on AIFF, so the NA reflects declared scope rather than a proven parse error.
