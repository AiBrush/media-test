# probe/pcm_s16be

- **Family:** probe
- **Fixture asset:** `pcm_s16be.aiff` (container `aiff`, codec `pcm-s16be`; ~960 KB) — exists in `fixtures/media/`
- **Golden:** `fixtures/golden/pcm_s16be.aiff.meta.json` (real, 225 bytes)
- **Primary metric:** wall (median ms)
- **passCount:** 1 of 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` — **uncontested** (the only engine with status=PASS).
- **Decisive factor:** AIFF container support. ffmpeg.wasm is the *only* engine in the matrix that declares
  the input container `aiff`; the other six engines were negotiated to `NA_ENGINE` ("engine does not declare
  input container 'aiff'") at runner Pass 1 before any oracle ran. With exactly one PASS there is no
  runner-up to compute a margin against.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 6.19 ms | — | — | — | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |

The shard's only bench block is ffmpeg.wasm's `wall` (n=1, warmup=1, median=p95=6.19 ms, mad=0). No
throughput/memory/longtask metrics were captured for a metadata-only probe.

## Why the winner wins (deep technical)

This scenario exercises the **AIFF container read (§A.2)** plus the **big-endian 16-bit PCM codec token
(`pcm-s16be`, §A.6)** — a deliberately niche audio path that most browser-oriented demuxers do not handle.
The fixture is a genuine Audio Interchange File Format file: the header (`xxd`) shows `FORM ....AIFF`, a
`COMM` chunk encoding 2 channels (`0x0002`), 16-bit samples (`0x0010`) and a 48000 Hz rate stored as an
80-bit IEEE extended float (`0x400e bb80`), followed by an `SSND` (sound-data) chunk of ~959 KB. At
2 ch × 2 bytes × 48000 Hz that data length yields ~5.0 s, exactly the golden `durationSec: 5`.

**Why only ffmpeg.wasm qualifies.** The runner's capability negotiation (`src/core/runner.ts:123-126`)
rejects any engine whose declared `containersIn` does not include the scenario's required container.
ffmpeg.wasm declares `aiff` both in its documented-build fallback set (`adapter.ts:173,187`) and via the
container→demuxer map `aiff: ['aiff']` in `src/engines/ffmpeg-wasm/codecs.ts:83`, and it maps the codec
token `pcm-s16be → pcm_s16be` (`codecs.ts:43,199-200`). The other six engines never declare `aiff`, so they
short-circuit to `NA_ENGINE` — an honest negotiation, not a failure.

**How the probe is actually computed.** ffmpeg.wasm does *not* use ffprobe: the vendored core's `_ffprobe`
entry aborts without setting the return code (`adapter.ts:262-268`), so probe() derives metadata by running
the real `ffmpeg -i <in>` program over the AIFF bytes and parsing its Input-block log. The container token
is resolved from the asset suffix (`containerFromInput`, `adapter.ts:799`: `.aiff → 'aiff'`); duration is
parsed from the `Duration: HH:MM:SS.ms` line (`parseDurationSecFromLog`, `adapter.ts:312-317`); the codec/
sampleRate/channels come from the stream line parser. This is a genuine demux of real bytes, not a canned
value.

**The oracle and its measurements.** The single gating oracle is `golden-metadata`
(`src/core/oracles.ts:595-657`). It compares the probed metadata field-by-field against the committed
golden: container string, per-track `type/codec/sampleRate/channels`, and duration within a tolerance band.
For a precise container like AIFF the band is the strict ±1-frame value — the shard records
`durationToleranceSec: 0.041666666666666664` (1/24 s) — and the measured `durationDeltaSec: 0`, i.e.
ffmpeg's parsed 5.0 s matched the golden exactly with zero error. The oracle's track comparison
(`compareTrack`, `oracles.ts:659-682`) also confirmed `codec='pcm-s16be'`, `sampleRate=48000`,
`channels=2` against the golden track, producing `detail: "metadata matches golden (1 track(s))"`. This is
a structural/metadata-exact oracle (mid-ladder), stronger than a smoke gate but not bit-exact decode.

## What each other framework did wrong

- **mediabunny@1.48.0** — `NA_ENGINE`: does not declare input container `aiff`. Honest; mediabunny targets
  MP4/WebM/MP3/WAV/etc., not AIFF.
- **platform@chrome-149** — `NA_ENGINE`: WebCodecs/`MediaSource` has no AIFF demuxer; the platform adapter
  correctly does not declare `aiff`. Honest.
- **mp4box@2.3.0** — `NA_ENGINE`: ISO-BMFF-only parser; cannot read the IFF/AIFF chunk format. Honest.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: does not declare `aiff` input. Honest.
- **web-demuxer@4.0.0** — `NA_ENGINE`: does not declare `aiff` input. Honest.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: does not declare `aiff` input. Honest.

All six NA_ENGINE results are genuine capability gaps (no AIFF demuxer), not under-declared capabilities —
AIFF (FORM/COMM/SSND) is unrelated to the MP4/WebM/MP3/WAV paths these engines implement.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/probe/index.ts:182-193` — `asset: 'pcm_s16be.aiff'`,
  `container: 'aiff'`, `audioCodecs: ['pcm-s16be']`, with notes documenting the §A.6 big-endian-PCM /
  §A.2 AIFF-read rationale and that engines without AIFF "negotiate NA honestly".
- **Fixture exists:** `fixtures/media/pcm_s16be.aiff` (~960 KB); header verified as real AIFF
  (FORM/AIFF/COMM/SSND, 2 ch, 16-bit, 48000 Hz). Not synthetic/empty/mock.
- **Golden exists:** `fixtures/golden/pcm_s16be.aiff.meta.json` — physically plausible (5 s, pcm-s16be,
  48000 Hz, 2 ch, 1,536,000 bps = 48000×2×16). Matches the SSND-chunk-derived duration.
- **Winner adapter is genuine:** probe runs the real `ffmpeg -i` program and parses its log
  (`src/engines/ffmpeg-wasm/adapter.ts:260-317`, `:799`). No hardcoded output, no copy-input-to-output,
  no short-circuit to the golden, no error-swallowing (read failures throw → graceful-failure handling).
- **Oracle is meaningful:** `golden-metadata` (`src/core/oracles.ts:595-657`) performs a real field-by-field
  comparison with a strict 1/24 s duration band for precise containers; measured Δ = 0 s. Not trivially
  satisfiable.
- **Cached note:** ffmpeg.wasm's result has `cached: true` ("cached previous PASS result"), so the bench
  (n=1, 6.19 ms) was reused, not re-run this pass — minor staleness risk on the timing number, but the
  PASS verdict and the deterministic golden-metadata comparison are not timing-dependent.
- **Verdict:** **REAL** — real AIFF fixture, genuine ffmpeg `-i` probe implementation, and a strict
  structural metadata oracle that matched the golden exactly (durationDeltaSec=0).

## Confidence & caveats

- **Confidence: high.** Single uncontested PASS; fixture, golden, adapter code path, and oracle all
  inspected and consistent.
- The wall figure (6.19 ms) is from a single cached sample (n=1, mad=0) and only reflects the metadata
  parse, not the heavy wasm core load/warm-up; it is not comparable to non-cached metrics and is not the
  basis of the verdict.
- Six engines are NA_ENGINE by honest container negotiation, so this scenario measures *coverage* (who can
  read AIFF at all) rather than a competitive performance/correctness race.
