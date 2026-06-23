# demux/h264_vfr

- family: demux
- fixture asset: `fixtures/media/h264_vfr.mp4` (2.3 MB, H.264 1280x720 @ 8.856 fps VFR + AAC 48kHz stereo, 12.533 s)
- primaryMetric: wall (ms)
- passCount: 5 of 7 (2 NA_ENGINE, 0 FAIL)

## Verdict

- **Best framework: remotion-media-parser@4.0.479** (engineId `remotion-media-parser@4.0.479`).
- **Contested**: 5 engines PASS the single gating oracle (`golden-packets`) with byte-identical results — 581/581 packets, 2 tracks, maxPtsDriftUs <= 1 across all. Correctness is therefore a dead heat, so the decision falls to performance.
- **Decisive factor**: wall median. remotion-media-parser parsed the full packet table in **7.235 ms**, the fastest of all 5 PASS engines.
- **Margin over runner-up** (mp4box, 12.395 ms): **1.71x faster wall**. Versus the WebCodecs engines it is ~2.3x faster than remotion-webcodecs (16.98 ms) and ffmpeg.wasm (17.23 ms), and **784x faster** than platform/Chrome (5676.67 ms).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (581/581, drift<=1us) | 7.235 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:pass (581/581, drift<=1us) | 12.395 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (581/581, drift<=1us) | 16.980 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (581/581, drift=0us) | 17.230 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass (581/581, drift<=1us) | 5676.670 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'packets:dts' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'packets:dts' |

(No `throughputRealtime`, `peakMemory`, or `longtasks` were recorded in the shard bench block for this scenario; only `wall` is present, n=1, warmup=1, mad=0.)

## Why the winner wins (deep technical)

The operation here is a pure **container demux** of an H.264-in-MP4 file with **variable frame rate**: the gate (`demux/index.ts:86-93`) requires the engine to reproduce ffprobe's per-sample packet table verbatim, with the explicit note "VFR: uneven inter-packet pts deltas; demux must preserve per-sample timestamps verbatim." The golden (`fixtures/golden/h264_vfr.mp4.packets.json`) confirms the irregular spacing — video pts run 0, 33333, 66667, then jump to 133333 µs — so a demuxer that synthesizes timestamps from a single nominal frame duration would drift and fail. This is a read-side, CPU-bound problem; there is no decode, no encode, and no pixel work. That framing is what makes remotion-media-parser dominant.

remotion-media-parser runs on `backend: cpu-js`, `pipeline: streaming`, `reader: webReader`, `fieldsTier: full-parse(demux)` (from `env.configUsed`). Its adapter (`src/engines/remotion-media-parser/adapter.ts`) drives the real `parseMedia()` API: `onVideoTrack`/`onAudioTrack` return per-sample callbacks (`adapter.ts:458-480`) that push each elementary sample into a `tagged[]` array, mapping `size = data.byteLength`, `ptsUs = timestamp`, `dtsUs = sample.decodingTimestamp`, `keyframe = type === 'key'` (documented at `adapter.ts:421-434`, executed via `sampleToPacket` at `adapter.ts:464/475`). Crucially, it reads `decodingTimestamp` straight from the MP4 sample tables (stts/ctts) rather than recomputing it, so the uneven VFR deltas survive untouched — hence `maxPtsDriftUs: 1` against ffprobe. trackIndex is assigned via a canonical stream-index map (video before audio, `adapter.ts:511-526`) so the order-independent per-track comparison in the oracle lines up. Because it only parses the moov/sample-table structure (it never decodes pixels), the whole job is a tight pass over the box hierarchy — 7.235 ms — beating the next-fastest pure parser, mp4box, by 1.71x.

The oracle itself (`src/core/oracles.ts:703-796`, `goldenPackets`) is strong for a demux gate: it checks exact packet count (581), exact per-track trackIndex layout multiset, exact per-packet `size` and `keyframe` flag, and per-track timestamp residuals after removing only a *constant* origin offset (`oracles.ts:761-785`). A constant edit-list/priming shift is tolerated (ffprobe reports raw pts like -21333 µs on the audio track, visible in the golden), but any *varying* residual beyond 1 ms (`tsTolUs = seekToleranceUs`) is flagged as `ptsDrift`/`dtsDrift`. remotion-media-parser reported `maxPtsDriftUs: 1`, i.e. essentially perfect VFR timestamp fidelity. ffmpeg.wasm did marginally better at `maxPtsDriftUs: 0` (it shares ffprobe's exact arithmetic), but since the oracle threshold is 1000 µs both are full passes and the 1-µs difference is immaterial to correctness ranking — performance is the tiebreaker, and there ffmpeg.wasm is 2.38x slower (17.23 ms vs 7.235 ms) due to wasm module overhead and the FS round-trip.

## What each other framework did wrong

- **mp4box@2.3.0** (PASS, runner-up): correct (581/581, drift<=1 µs) but 1.71x slower at 12.395 ms. Its `whole-file-append(MP4BoxBuffer+fileStart)` pipeline with `rangeReads:false` buffers the entire 2.3 MB file and re-parses on append, costing more than remotion's streaming reader for this size. No correctness deficit, just a metric gap.
- **remotion-webcodecs@4.0.479** (PASS): correct and identical packet table, but 16.98 ms — 2.35x slower. Its `streaming-backpressure` + WebCodecs-oriented pipeline carries setup overhead that a pure demux does not benefit from (no decode is needed here).
- **ffmpeg.wasm@0.12.15** (PASS): correct with the tightest timestamps (drift=0 µs) but 17.23 ms — 2.38x slower. The wasm transcoder/probe path and virtual-FS staging dominate cost for a read-only demux.
- **platform@chrome-149** (PASS): correct (581/581, drift<=1 µs) but **5676.67 ms** — 784x slower. The platform adapter has no native packet-table API, so it reconstructs packets through a heavyweight `VideoDecoder` / `<video>` pipeline (`decode: VideoDecoder`, hwAccel:true), an enormous penalty for an operation that needs only container parsing.
- **web-demuxer@4.0.0** (NA_ENGINE): does not declare feature `packets:dts`. The scenario requires `features: ['packets:dts']` (`demux/index.ts:91`); without a declared DTS-bearing packet API the runner skips it. NA looks **honest** — web-demuxer surfaces frames/streams but not a per-sample dts table matching this gate's contract.
- **mediabunny@1.48.0** (NA_ENGINE): same cause — does not declare `packets:dts`. Mediabunny exposes packet sinks but the suite gates `packets:dts` capability; NA looks **honest** given the declared-capability model in `src/core/registry.ts`/`runner.ts` (capability gating, not a silent failure).

## Anti-cheat validation

- **Scenario**: `src/scenarios/demux/index.ts:86-93` — entry `{ asset: 'h264_vfr.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], features: ['packets:dts'] }`, note explicitly demands verbatim VFR timestamp preservation.
- **Fixture exists, real**: `fixtures/media/h264_vfr.mp4` present, 2.3 MB — a genuine encoded H.264/AAC MP4, not synthetic/empty/mock. Golden `fixtures/golden/h264_vfr.mp4.packets.json` contains 581 real packets with physically plausible values (25381-byte keyframe, declining inter-frame sizes, negative edit-list pts on audio, uneven VFR video pts). Metadata golden agrees (1280x720, 8.856 fps, 12.533 s).
- **Oracle is meaningful**: `src/core/oracles.ts:703-796` performs an exact count + layout + size + keyframe comparison and a per-track 1-ms timestamp-residual check after constant-offset removal. Not trivially satisfiable; not a smoke gate; not ssim with exactFrames==0. The reported `measuredCount:581 == goldenCount:581`, `comparedTracks:2`, `maxPtsDriftUs:1` are consistent with a real demux.
- **Winner adapter is genuine**: `src/engines/remotion-media-parser/adapter.ts:458-526` calls the real `parseMedia()` with per-sample `onVideoTrack`/`onAudioTrack` callbacks and maps actual sample bytes/timestamps to PacketInfo. No canned output, no copy-of-golden, no error-swallowing, no input->output passthrough.
- **Cached note**: the winner's result has `cached:true` ("cached previous PASS result"). All 5 PASS entries are cached, so the 7.235 ms wall is a reused prior measurement (n=1, mad=0), not a fresh re-run — minor staleness risk, but the cross-engine ranking margin (1.71x over mp4box) is wide enough to be robust.
- **Verdict: REAL** — real fixture + real `parseMedia` implementation + a meaningful exact-packet oracle.

## Confidence & caveats

- **Confidence: high** on correctness (5 engines independently reproduce the identical 581-packet table, the oracle is strict, both NAs are honest capability gates).
- **Confidence: medium** on the performance ordering: all wall numbers are n==1, warmup==1, mad==0, and cached. Single-sample timing is weak evidence in absolute terms, but the 1.71x gap over the runner-up and the 784x gap over platform are large relative to any plausible single-run jitter, so the ranking conclusion holds.
- ffmpeg.wasm's drift=0 µs is marginally tighter than the winner's drift=1 µs; under a hypothetical "tightest-timestamp" tiebreak it would lead, but the oracle's 1000-µs tolerance makes both full passes, so performance correctly decides.
