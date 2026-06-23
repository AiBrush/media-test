# robustness/edge_flac_with_seektable_probe

- family: robustness
- fixture asset: `flac_seektable.flac` (fixtures/media/flac_seektable.flac, 143 KB, real FLAC)
- primaryMetric: wall (metrics declared: wall, peakMemory)
- passCount: 4 of 7

## Verdict

- best framework: **remotion-media-parser@4.0.479** (env.engineId `remotion-media-parser@4.0.479`)
- CONTESTED: 4 engines PASS (remotion-media-parser, mediabunny, remotion-webcodecs, ffmpeg.wasm).
- decisive factor: correctness is a dead heat (all four pass the single gating oracle `golden-metadata` with the identical measurement `durationDeltaSec = 0` inside `durationToleranceSec = 0.041667s`), so the tie breaks on PERFORMANCE. The only timing signal present in the shard is `durationMs` (no `bench{}` block was emitted for this probe scenario). remotion-media-parser is fastest at 9 ms.
- margin over runner-up: 9 ms vs mediabunny 11 ms = **1.22x faster** wall (next: remotion-webcodecs 14 ms = 1.56x; ffmpeg.wasm 122 ms = 13.6x). NOTE: this is a single observation per engine (cached, no MAD/p95/n in shard), so the margin is weak evidence and could invert on re-run.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | n/a (durationMs 9) | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | n/a (durationMs 11) | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | n/a (durationMs 14) | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | n/a (durationMs 122) | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |
| platform@chrome-149 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |
| web-demuxer@4.0.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |

No `bench{}` object was present in the shard for any engine; only `durationMs` is available, used here as the wall proxy. `throughputRealtime`, `peakMemory`, and `longtasks` were not recorded for this probe scenario.

## Why the winner wins (deep technical)

The operation is `op: 'probe'` on a raw native-FLAC stream (container `flac`, codec `flac`, 48 kHz / 2 ch / 10 s, golden bitrate 114346) that carries a SEEKTABLE metadata block. The scenario (src/scenarios/robustness/index.ts:991-1006) requires `operations:['probe']`, `containersIn:['flac']`, `audioCodecs:['flac']`, gates on the single oracle `golden-metadata`, and declares metrics `wall, peakMemory`. The metamorphic point (notes, index.ts:976-980) is that the SEEKTABLE is only an index block: duration/codec/sampleRate/channels must come from STREAMINFO and must equal the golden — confirmed because the two sibling goldens (`flac_seektable.flac.meta.json` and `flac_noseektable.flac.meta.json`) are byte-identical.

All four passers satisfy `goldenMetadata()` (src/core/oracles.ts:595-657): same container `flac`, `durationDeltaSec = 0` well inside the strict per-frame tolerance `0.041667s` (≈1/24 frame band), and a single audio track whose codec/sampleRate/channels match. Because every passer reports duration straight from STREAMINFO total-samples (not the SEEKTABLE), correctness is genuinely tied — there is no stronger oracle (no golden-packets, no decode oracle) to separate them, so the ladder cannot promote anyone on strictness.

remotion-media-parser wins on the only available performance axis. Its `env.configUsed` is `backend:'cpu-js'`, `pipeline:'streaming'`, `reader:'webReader'`, `fieldsTier:'metadata-only'`, `worker:false`. For a probe, "metadata-only streaming" is the ideal shape: it reads just the FLAC header chain (STREAMINFO + SEEKTABLE) off the front of the file and stops, never decoding audio, which is why it lands at 9 ms. mediabunny (11 ms) is a pure-TS streaming-lockstep reader as well but its WebCodecs-oriented config (`backend:'webcodecs'`, canvas pool size 4) carries setup overhead irrelevant to a header probe. remotion-webcodecs (14 ms) is similar with extra backpressure/queue machinery. ffmpeg.wasm is 13.6x slower (122 ms) for a structural reason documented in its adapter: it has NO working ffprobe in the vendored core, so probe metadata is derived by parsing the textual `ffmpeg -i` log (src/engines/ffmpeg-wasm/adapter.ts:260-275, parser at adapter.ts:311-348) after spinning up the wasm core — correct, but heavyweight versus a JS header read.

## What each other framework did wrong

- mediabunny@1.48.0 — PASS, but lost on wall: 11 ms vs 9 ms (1.22x slower). Same single oracle, same `durationDeltaSec=0`. WebCodecs/canvas-pool config adds overhead unneeded for a header-only probe.
- remotion-webcodecs@4.0.479 — PASS, but lost on wall: 14 ms vs 9 ms (1.56x slower). Streaming-backpressure + queue-depth machinery is overhead for probe.
- ffmpeg.wasm@0.12.15 — PASS, but lost on wall: 122 ms vs 9 ms (13.6x slower). Derives metadata by parsing `ffmpeg -i` log because the vendored core's ffprobe aborts (adapter.ts:262-267); booting the wasm core dominates a trivial probe.
- mp4box@2.3.0 — NA_ENGINE: "engine does not declare input container 'flac'". Honest: mp4box is an ISO-BMFF (MP4/MOV) box parser and genuinely cannot parse a native FLAC stream; not an under-declared capability.
- platform@chrome-149 — NA_ENGINE: "engine does not declare input container 'flac'". Honest: the WebCodecs/platform demux path has no native FLAC container demuxer surface.
- web-demuxer@4.0.0 — NA_ENGINE: "engine does not declare input container 'flac'". Honest: its registered container set does not include raw FLAC.

## Anti-cheat validation

- scenario: src/scenarios/robustness/index.ts:974 (`id: 'edge_flac_with_seektable_probe'`), built via `flacSeektableScenarios` map at index.ts:991-1006 with `op:'probe'`, `oracles:['golden-metadata']`.
- fixture: `flac_seektable.flac` EXISTS at fixtures/media/flac_seektable.flac (143 KB). Verified real: magic bytes `66 4c 61 43` ("fLaC") at offset 0, valid 34-byte STREAMINFO block. Not synthetic/empty/mock.
- golden: fixtures/golden/flac_seektable.flac.meta.json — container flac, durationSec 10, one audio track flac/48000/2ch/bitrate 114346. Plausible for a 10 s stereo FLAC. It is byte-identical to the no-seektable sibling golden, which is exactly the metamorphic invariant the scenario asserts.
- oracle: `goldenMetadata()` src/core/oracles.ts:595-657 — performs a REAL field-by-field comparison (container, duration within strict per-frame tolerance, per-track codec/sampleRate/channels via compareTrack at oracles.ts:659-686). Not trivially satisfiable: any container/codec/rate/channel/duration mismatch produces a diff and FAILs. Measurement `durationDeltaSec=0` is physically consistent with STREAMINFO total-samples being exact.
- winner adapter: remotion-media-parser probe path (src/engines/remotion-media-parser). Config `backend:'cpu-js'`, `fieldsTier:'metadata-only'`, `pipeline:'streaming'` indicates a genuine header parse, not a canned/golden short-circuit. (Winner adapter source was not opened line-by-line in this pass; the cross-engine agreement on the same measured values is the corroborating signal.)
- verdict: **REAL** — real fixture + meaningful field-comparison oracle + four independent engines converge on the same measured metadata. The gate is a single metadata-equality oracle (no packet/decode oracle), so the PASS is real but not the strongest possible class; this keeps confidence at medium.
- cached note: ALL seven entries have `cached:true` ("cached previous PASS result"). No engine was re-run for this shard, so the timing margins (9/11/14/122 ms) are reused single-observation values with no MAD/p95/n — staleness and ranking-inversion risk is real for the contested perf decision.

## Confidence & caveats

- Correctness verdict (which engines pass) is HIGH confidence: oracle is real, fixture is real, four engines agree, three NAs are honest container-support gaps.
- Winner selection is MEDIUM/LOW confidence: it rests entirely on `durationMs` (no `bench{}`), every value is cached and single-sample, and the top three are within 5 ms of each other — a re-run could reorder remotion-media-parser / mediabunny / remotion-webcodecs.
- The gate is metadata-only; there is no golden-packets or decode oracle here, so "best" means best at correctly probing header metadata, not best at decoding the FLAC stream.
