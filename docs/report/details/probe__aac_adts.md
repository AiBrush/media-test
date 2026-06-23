# probe/aac_adts

family: probe | fixture asset: `fixtures/media/aac_adts.aac` (164 KB, real AAC-LC in raw ADTS) | primaryMetric: wall | passCount: 4 / 7

## Verdict

**Best framework: mediabunny@1.48.0** — CONTESTED (4 engines PASS: mediabunny, ffmpeg.wasm, remotion-media-parser, remotion-webcodecs).

All four passers satisfy the identical single gate (`golden-metadata`) with essentially the same correctness: container `adts`, 1 audio track, codec `aac`, sampleRate 48000, channels 2, and duration well inside the loose ADTS band (Δ ≈ 0.0043 s vs tol 1.50465 s). Because correctness is a tie, the decision falls to **PERFORMANCE (wall median)**.

Decisive factor: **wall median**. mediabunny 4.22 ms beats the runner-up ffmpeg.wasm 4.725 ms by **1.12x**, and beats remotion-media-parser (13.595 ms, **3.22x**) and remotion-webcodecs (23.785 ms, **5.64x**) decisively. Caveat: every bench is **n=1** (mad=0, p95==median), so the 1.12x edge over ffmpeg.wasm is weak evidence; the multi-x gaps over the remotion engines are robust.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 4.22 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 4.725 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 13.595 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 23.785 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |

No engine reported throughputRealtime / peakMemory / longtasks for this probe; only `wall` is present in `bench{}`.

## Why the winner wins (deep technical)

The input is a **raw ADTS stream** (`aac_adts.aac`): AAC-LC frames each prefixed with a 7-byte ADTS header, with **no container index, no `mvhd`/`moov`, no global duration box, and no sample table**. A prober must (a) recognize the ADTS sync word (0xFFFx) and parse the first header to recover `sampling_frequency_index` → 48000 Hz and `channel_configuration` → 2, and (b) produce a duration without a real container timeline. There is no exact global duration in raw ADTS, which is exactly why the oracle places `adts` in the loose-band, estimate-only set (oracles.ts:610-637).

mediabunny took the WebCodecs-config row (`env.configUsed.backend: "webcodecs"`, `coopCoep: "not-required"`, `wasmThreads: 0`, `sharedArrayBuffer: false`), but the probe path itself is **pure-TS demux** and never touches a hardware decoder — it only reads headers. The concrete code path:

- Container is bound to the ADTS singleton via `CANONICAL_TO_INPUT_FORMAT['adts'] = ADTS_FORMAT` (codecs.ts:138), so `openInput()` constructs an `mb.Input` restricted to the ADTS parser rather than sniffing all formats.
- `metadataFromInput()` (adapter.ts:417-453) resolves duration on the **cheap path first**: `input.getDurationFromMetadata()` (adapter.ts:429), and only falls back to `input.computeDuration()` (adapter.ts:436) if that yields null. For ADTS the duration is necessarily an estimate; the measured Δ of 0.0043 s against the 10.031 s golden shows mediabunny's frame-count × frame-duration estimate is nearly exact.
- Track normalization (`normalizeTrack`, adapter.ts:332-347) reads `getCodec()` → `aac`, `getSampleRate()` → 48000, `getNumberOfChannels()` → 2 directly from the parsed ADTS header — all real getter calls, no hardcoding.

This header-only parse over a 164 KB file finishing in **4.22 ms** is the lowest wall of the four passers. ffmpeg.wasm does the same metadata extraction but inside the wasm module (probe-only, no transcode), landing at 4.725 ms — just behind. The two remotion engines pay extra: remotion-media-parser runs a `cpu-js` `full-parse(demux)` streaming reader (`env.configUsed.fieldsTier: "full-parse(demux)"`) at 13.595 ms, and remotion-webcodecs adds its streaming-backpressure/WebCodecs scaffolding (23.785 ms) that is pure overhead for a header probe.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on perf only. Identical correctness (golden-metadata, Δ 0.001 s — actually the tightest duration estimate of the four) but wall 4.725 ms vs mediabunny 4.22 ms = **1.12x slower**. n=1 so this margin is thin.
- **remotion-media-parser@4.0.479** — PASS, lost on perf. `cpu-js` full demux parse, wall 13.595 ms = **3.22x slower** than mediabunny for the same single-oracle result.
- **remotion-webcodecs@4.0.479** — PASS, lost on perf. Streaming-backpressure WebCodecs pipeline is overkill for a header-only probe; wall 23.785 ms = **5.64x slower**.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'adts'". Honest NA — `WebCodecs`/`MediaSource` in Chrome has no demuxer for raw ADTS; the platform adapter correctly does not claim the `adts` container.
- **web-demuxer@4.0.0** — NA_ENGINE: same reason. Honest; web-demuxer's declared container set excludes raw ADTS.
- **mp4box@2.3.0** — NA_ENGINE: same reason. Honest and expected — mp4box parses ISOBMFF only and cannot read a raw elementary AAC stream.

## Anti-cheat validation

- **Scenario**: `src/scenarios/probe/index.ts:219` — `{ asset: 'aac_adts.aac', container: 'adts', audioCodecs: ['aac'] }`. Family header (index.ts:1-31) documents one golden-gated probe per container; codecs are declared so a non-parsing engine negotiates NA honestly.
- **Fixture**: `fixtures/media/aac_adts.aac` exists, **164 KB**, a real raw AAC ADTS elementary stream — not synthetic/empty/mock.
- **Golden**: `fixtures/golden/aac_adts.aac.meta.json` (223 B): container `adts`, durationSec 10.031, 1 audio track aac / 48000 / 2ch / 130650 bps. Physically plausible for a ~10 s stereo 48 kHz ~130 kbps AAC clip (130650 bps × 10.031 s / 8 ≈ 164 KB — matches the file size).
- **Oracle**: `goldenMetadata` at `src/core/oracles.ts:595-657` performs a real field-by-field comparison (container string, per-track type/codec/sampleRate/channels, track count) plus a duration band. Duration uses the loose estimate-only band for `adts` (oracles.ts:610-637) — appropriate because raw ADTS has no exact global duration. The codec/sampleRate/channels/track-count checks are exact and not trivially satisfiable, so a wrong probe would FAIL.
- **Winner adapter**: `src/engines/mediabunny/codecs.ts:138` (real ADTS_FORMAT binding) and `src/engines/mediabunny/adapter.ts:417-453` + `:332-347` — genuine `mb.Input` open, real getter calls, no canned output, no golden short-circuit, errors mapped (`.catch`) to nulls rather than swallowed-as-success.
- **Verdict: WEAK-GATE.** Implementation, fixture, and oracle are all real, but the only gate is `golden-metadata` and its load-bearing duration check runs in the **loose 1.50465 s band**; the strong sub-checks (codec/sampleRate/channels/count) are exact but lightweight. PASS is genuine and the perf ranking is real, just not a strong-correctness contest. No bit-exact / packet-level gate is applied here.
- **Cached note**: All four PASS rows have `cached: true` ("cached previous PASS result"). Numbers were reused, not re-run this pass — staleness risk on the wall medians (n=1) is real; the 1.12x mediabunny-over-ffmpeg.wasm edge in particular should be treated as indicative, not definitive.

## Confidence & caveats

- Winner correct (mediabunny genuinely lowest wall among 4 correct passers); confidence **medium**.
- Every bench is n=1 (mad=0), and all rows are cached — the top-two gap (mediabunny vs ffmpeg.wasm, 1.12x) is within noise; the gaps over the remotion engines (3.22x / 5.64x) are large enough to trust.
- The contest is a perf tiebreak on a WEAK-GATE oracle; if a packet-level golden (`aac_adts.aac.packets.json` exists in goldens) were applied, ranking could shift. Here only metadata was gated.
- All three NA_ENGINE verdicts (platform, web-demuxer, mp4box) look honest, not under-declared: none of those three ships a raw-ADTS demuxer.
