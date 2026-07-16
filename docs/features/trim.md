# Trim

> Scope: Fast copy trim, frame-accurate trim, range-boundary correctness, no-op invariants, scale behavior, and trim-specific negative cases; general runner, [oracle](../glossary.md#oracle), fixture, and [adapter](../glossary.md#adapter) mechanics belong to their subsystem or engine pages.
> Phase-2 owner: p2_feature_trim.

## Purpose

The trim family asks whether a browser media framework can cut a requested presentation interval while preserving a valid, synchronized result. It distinguishes a fast coded-sample copy at safe random-access boundaries from a frame-accurate path that may decode and re-encode a boundary region. Its readers are benchmark maintainers, adapter authors, and later cleanup agents who need an executable contract for each engine × [scenario](../glossary.md#scenario) × browser [cell](../glossary.md#cell).

This page specifies what the registered family measures today and what must change before a green result proves the requested interval, rather than merely a plausible duration. Shared terms such as [oracle](../glossary.md#oracle) and [golden](../glossary.md#golden) follow the glossary; cross-cutting mechanics are owned by the [scenario DSL and registry](../subsystems/scenario-dsl-registry.md), [runner and capability negotiation](../subsystems/runner-capability-negotiation.md), [oracle system](../subsystems/oracle-system.md), [fixtures and golden baking](../subsystems/golden-baking-fixtures.md), [reporting and aggregation](../subsystems/reporting-aggregation.md), and the [engine-adapter contract](../subsystems/engine-adapter-contract.md). The adapter table below links each engine page.

## As-built

### Registration and execution path

`trimScenarios` is imported into the canonical family map and is also lazy-loaded by the app; duplicate scenario ids are rejected by the registry. [src/scenarios/index.ts:30-40](../../src/scenarios/index.ts#L30-L40) [src/app/register.ts:100-113](../../src/app/register.ts#L100-L113) [src/core/registry.ts:43-52](../../src/core/registry.ts#L43-L52)

The family exports 42 scenarios: 29 ordinary functional rows, four size-ladder rows, two no-op invariant rows, and seven graceful-failure rows. The export concatenates those three constructed groups in that order. [src/scenarios/trim/index.ts:135-577](../../src/scenarios/trim/index.ts#L135-L577) [src/scenarios/trim/index.ts:588-665](../../src/scenarios/trim/index.ts#L588-L665) [src/scenarios/trim/index.ts:738-807](../../src/scenarios/trim/index.ts#L738-L807) [src/scenarios/trim/index.ts:829-951](../../src/scenarios/trim/index.ts#L829-L951)

Every ordinary and ladder row becomes `op: 'trim'` with `{container, frameAccurate, range: {startUs, endUs}}`; it requires the same input and output container, its declared codecs, `trim:frame-accurate` when applicable, and any row-specific feature token. `trim-boundaries` is always first, followed by the row's extra oracles. [src/scenarios/trim/index.ts:669-701](../../src/scenarios/trim/index.ts#L669-L701)

The runner extracts only the range, container, and `frameAccurate` flag and invokes `engine.trim(input, range, opts)`. This means arbitrary scenario options are not forwarded to the adapter's trim options. [src/core/runner.ts:750-765](../../src/core/runner.ts#L750-L765) [src/core/runner.ts:794-820](../../src/core/runner.ts#L794-L820)

### Functional scenario inventory

“Playback” below means `trim-boundaries` plus `playback-smoke`; “boundary only” means no extra oracle. The ordinary rows all record wall time, real-time throughput, peak memory, target writes, and long tasks. [src/scenarios/trim/index.ts:64-80](../../src/scenarios/trim/index.ts#L64-L80) [src/scenarios/trim/index.ts:124-133](../../src/scenarios/trim/index.ts#L124-L133)

| Scenario | Input and requested range | Mode and special gate | Live oracle set; duration tolerance |
| --- | --- | --- | --- |
| `trim/h264_keyframe_aligned` [src/scenarios/trim/index.ts:139-151](../../src/scenarios/trim/index.ts#L139-L151) | H.264/AAC MP4, 2–8 s | copy | playback; 1.1 s |
| `trim/h264_keyframe_aligned_short` [src/scenarios/trim/index.ts:153-164](../../src/scenarios/trim/index.ts#L153-L164) | H.264/AAC MP4, 10–12 s | copy | playback; 1.1 s |
| `trim/vp9_keyframe_aligned` [src/scenarios/trim/index.ts:166-177](../../src/scenarios/trim/index.ts#L166-L177) | VP9/Opus WebM, 1–5 s | copy | playback; 1.1 s |
| `trim/audio_mp3_copy` [src/scenarios/trim/index.ts:179-189](../../src/scenarios/trim/index.ts#L179-L189) | MP3/Xing, 5–10 s | copy | boundary only; 0.1 s |
| `trim/h264_frame_accurate` [src/scenarios/trim/index.ts:193-205](../../src/scenarios/trim/index.ts#L193-L205) | H.264/AAC MP4, 2.033–7.966 s | frame-accurate | playback; 0.1 s |
| `trim/h264_bframes_frame_accurate` [src/scenarios/trim/index.ts:207-218](../../src/scenarios/trim/index.ts#L207-L218) | H.264/AAC MP4 with B-frames, 1.5–4.5 s | frame-accurate | playback; 0.1 s |
| `trim/h264_vfr_frame_accurate` [src/scenarios/trim/index.ts:220-232](../../src/scenarios/trim/index.ts#L220-L232) | H.264/AAC [VFR](../glossary.md#vfr) MP4, 3–6 s | frame-accurate | playback; 0.1 s |
| `trim/hevc_keyframe_aligned` [src/scenarios/trim/index.ts:239-250](../../src/scenarios/trim/index.ts#L239-L250) | HEVC/AAC MP4, 2–6 s | copy | playback; 1.1 s |
| `trim/hevc_frame_accurate` [src/scenarios/trim/index.ts:252-264](../../src/scenarios/trim/index.ts#L252-L264) | HEVC/AAC MP4, 2.5–6.5 s | frame-accurate; `trim:frame-accurate-hevc` | playback; 0.1 s |
| `trim/mov_keyframe_aligned` [src/scenarios/trim/index.ts:268-279](../../src/scenarios/trim/index.ts#L268-L279) | H.264/AAC MOV, 1–4 s | copy | playback; 1.1 s |
| `trim/mkv_keyframe_aligned` [src/scenarios/trim/index.ts:284-295](../../src/scenarios/trim/index.ts#L284-L295) | H.264/AAC Matroska, 1–5 s | copy | boundary only; 1.1 s |
| `trim/av1_keyframe_aligned` [src/scenarios/trim/index.ts:299-310](../../src/scenarios/trim/index.ts#L299-L310) | AV1/Opus WebM, 1–4 s | copy | playback; 0.5 s |
| `trim/vp8_keyframe_aligned` [src/scenarios/trim/index.ts:312-325](../../src/scenarios/trim/index.ts#L312-L325) | VP8/Vorbis WebM, 1–5 s | copy; Vorbis is deliberately absent from the requirement | playback; 1.1 s |
| `trim/vp9_alpha_keyframe_aligned` [src/scenarios/trim/index.ts:330-341](../../src/scenarios/trim/index.ts#L330-L341) | VP9-alpha WebM, 1–3 s | copy; `alpha` | playback; 0.5 s |
| `trim/audio_opus_ogg_copy` [src/scenarios/trim/index.ts:345-355](../../src/scenarios/trim/index.ts#L345-L355) | Opus/Ogg, 2–7 s | copy | boundary only; 0.1 s |
| `trim/audio_aac_adts_copy` [src/scenarios/trim/index.ts:357-368](../../src/scenarios/trim/index.ts#L357-L368) | AAC/ADTS, 2–7 s | copy | boundary only; 0.1 s |
| `trim/audio_flac_seektable_copy` [src/scenarios/trim/index.ts:370-384](../../src/scenarios/trim/index.ts#L370-L384) | FLAC with seek table, 2–7 s | copy; `trim:flac-seektable-copy` | boundary only; 0.1 s |
| `trim/audio_flac_noseektable_copy` [src/scenarios/trim/index.ts:386-397](../../src/scenarios/trim/index.ts#L386-L397) | FLAC without seek table, 2–7 s | copy; `trim:flac-no-seektable-frame-scan` | boundary only; 0.1 s |
| `trim/audio_wav_pcm_copy` [src/scenarios/trim/index.ts:399-411](../../src/scenarios/trim/index.ts#L399-L411) | PCM-s16/WAV, 1–4 s | copy | boundary only; 0.09 s |
| `trim/audio_aiff_pcm_be_copy` [src/scenarios/trim/index.ts:413-424](../../src/scenarios/trim/index.ts#L413-L424) | PCM-s16be/AIFF, 1–4 s | copy | boundary only; 0.02 s |
| `trim/ts_keyframe_aligned` [src/scenarios/trim/index.ts:429-441](../../src/scenarios/trim/index.ts#L429-L441) | H.264/AAC MPEG-TS, 2–6 s | copy | boundary only; 1.0 s |
| `trim/h264_start_zero_copy` [src/scenarios/trim/index.ts:446-457](../../src/scenarios/trim/index.ts#L446-L457) | H.264/AAC MP4, 0–5 s | copy | playback; 0.5 s |
| `trim/h264_to_eof_copy` [src/scenarios/trim/index.ts:462-473](../../src/scenarios/trim/index.ts#L462-L473) | H.264/AAC MP4, 27–30 s | copy | playback; 1.1 s |
| `trim/h264_open_gop_frame_accurate` [src/scenarios/trim/index.ts:480-491](../../src/scenarios/trim/index.ts#L480-L491) | open-GOP H.264/AAC MP4, 2.7–6.3 s | frame-accurate | playback; 0.1 s |
| `trim/h264_rotated_keyframe_aligned` [src/scenarios/trim/index.ts:496-508](../../src/scenarios/trim/index.ts#L496-L508) | rotated H.264/AAC MP4, 1–5 s | copy; `rotate` | playback; 1.1 s |
| `trim/h264_multitrack_keyframe_aligned` [src/scenarios/trim/index.ts:513-524](../../src/scenarios/trim/index.ts#L513-L524) | one-video/two-audio MP4, 1–5 s | copy | playback; 1.1 s |
| `trim/fmp4_fragment_boundary_copy` [src/scenarios/trim/index.ts:529-541](../../src/scenarios/trim/index.ts#L529-L541) | H.264/AAC MP4, 4–10 s | copy; `fragmented` | playback; 0.5 s |
| `trim/h264_single_gop_frame_accurate` [src/scenarios/trim/index.ts:546-557](../../src/scenarios/trim/index.ts#L546-L557) | H.264/AAC MP4, 5–5.1 s | frame-accurate | boundary only; 0.1 s |
| `trim/h264_subframe_range_frame_accurate` [src/scenarios/trim/index.ts:562-576](../../src/scenarios/trim/index.ts#L562-L576) | H.264/AAC MP4, 6–6.01 s | frame-accurate | boundary only; 0.1 s |

### Scale, identity, and malformed-input inventory

The ladder adds `sourceReads` and assigns a row-specific primary metric; the massive row also raises the operation timeout to 300 seconds. [src/scenarios/trim/index.ts:579-665](../../src/scenarios/trim/index.ts#L579-L665)

| Scenario | Input and requested range | Mode | Primary metric and extra gate |
| --- | --- | --- | --- |
| `trim/large_h264_copy_lazyread` [src/scenarios/trim/index.ts:590-606](../../src/scenarios/trim/index.ts#L590-L606) | large 120 s MP4, 60–66 s | copy | `sourceReads`; playback |
| `trim/large_h264_frame_accurate_throughput` [src/scenarios/trim/index.ts:608-624](../../src/scenarios/trim/index.ts#L608-L624) | large 120 s MP4, 60–66 s | frame-accurate | `throughputRealtime`; playback |
| `trim/huge_h264_mov_copy_peakmem` [src/scenarios/trim/index.ts:626-641](../../src/scenarios/trim/index.ts#L626-L641) | huge 600 s MOV, 300–306 s | copy | `peakMemory`; playback |
| `trim/massive_h264_copy_sustained` [src/scenarios/trim/index.ts:643-664](../../src/scenarios/trim/index.ts#L643-L664) | massive two-hour MP4, 3600–3660 s | copy; `trim:massive-lazy-read` | `sourceReads`; playback; 300 s timeout |

The two full-range rows register `property-invariant`, `trim-boundaries`, `playback-smoke`, and `reference-reimport`, with a 0.05 s duration tolerance. [src/scenarios/trim/index.ts:738-807](../../src/scenarios/trim/index.ts#L738-L807)

| Scenario | Identity request | Implemented invariant |
| --- | --- | --- |
| `trim/h264_noop_full_range_idempotent` [src/scenarios/trim/index.ts:745-763](../../src/scenarios/trim/index.ts#L745-L763) | H.264/AAC MP4, 0–30 s | output duration against source-golden duration |
| `trim/vp9_noop_full_range_idempotent` [src/scenarios/trim/index.ts:765-780](../../src/scenarios/trim/index.ts#L765-L780) | VP9/Opus WebM, 0–10 s | output duration against source-golden duration |

All seven negative rows use only `graceful-failure`, record wall time and peak memory, and impose 15 seconds. Their ordinary throw/reject is treated as graceful; timeout is a [FAIL](../glossary.md#fail). [src/scenarios/trim/index.ts:809-943](../../src/scenarios/trim/index.ts#L809-L943) [src/core/runner.ts:1522-1569](../../src/core/runner.ts#L1522-L1569)

| Scenario | Stimulus | Accepted present behavior |
| --- | --- | --- |
| `trim/robust_inverted_range` [src/scenarios/trim/index.ts:833-842](../../src/scenarios/trim/index.ts#L833-L842) | valid MP4, 8–2 s | clean rejection/no output |
| `trim/robust_zero_length_range` [src/scenarios/trim/index.ts:845-854](../../src/scenarios/trim/index.ts#L845-L854) | valid MP4, 5–5 s | clean rejection/no output |
| `trim/robust_negative_start` [src/scenarios/trim/index.ts:857-866](../../src/scenarios/trim/index.ts#L857-L866) | valid MP4, −2–4 s | clean rejection/no output |
| `trim/robust_start_past_eof` [src/scenarios/trim/index.ts:869-878](../../src/scenarios/trim/index.ts#L869-L878) | valid 30 s MP4, 40–45 s | clean rejection/no output |
| `trim/robust_end_far_past_eof` [src/scenarios/trim/index.ts:882-891](../../src/scenarios/trim/index.ts#L882-L891) | valid 30 s MP4, 50–9999 s | clean rejection/no output |
| `trim/robust_truncated_source` [src/scenarios/trim/index.ts:894-904](../../src/scenarios/trim/index.ts#L894-L904) | truncated MP4, 2–8 s | safe returned output is explicitly allowed |
| `trim/robust_bitflipped_source` [src/scenarios/trim/index.ts:907-916](../../src/scenarios/trim/index.ts#L907-L916) | seeded bit-flipped MP4, 2–8 s | clean rejection/no output |

### What the current oracles actually prove

`trim-boundaries` first reads duration from an engine-independent MP4/MOV or WebM/MKV byte parser, then tries a platform decode frame-span proxy, then parses WAV or AIFF. If none yields duration, it returns a non-passing “golden absent” outcome, which the runner classifies as [`NA_ASSET`](../glossary.md#na_asset). [src/core/oracles.ts:2418-2473](../../src/core/oracles.ts#L2418-L2473) [src/core/oracles.ts:2518-2523](../../src/core/oracles.ts#L2518-L2523) [src/core/oracles.ts:306-313](../../src/core/oracles.ts#L306-L313)

For an available duration, the oracle compares `abs(outputDuration − (endUs − startUs))` with the row's tolerance. It does not currently prove that the retained content begins or ends at the requested source presentation time. [src/core/oracles.ts:2454-2465](../../src/core/oracles.ts#L2454-L2465)

Boundary frame hashes are used only if a loaded golden declares the exact same trim range. The present source-keyed golden is explicitly skipped, so the registered subrange rows are duration-gated rather than boundary-image-gated. [src/core/oracles.ts:2476-2505](../../src/core/oracles.ts#L2476-L2505)

`playback-smoke` proves only that the output media element reaches current data and advances twice; it does not inspect source-boundary identity, track synchronization, alpha, rotation, or frame accuracy. [src/core/oracles.ts:1631-1638](../../src/core/oracles.ts#L1631-L1638) [src/engines/platform/oracle-helpers.ts:167-215](../../src/engines/platform/oracle-helpers.ts#L167-L215)

The no-op `probe-duration` invariant reads output duration and compares it with source golden duration. Although both no-op scenarios also register `reference-reimport`, that oracle currently performs packet comparison only for `remux` and `mux`; a `trim` operation returns an unavailable outcome instead. [src/core/oracles.ts:2797-2847](../../src/core/oracles.ts#L2797-L2847) [src/core/oracles.ts:1299-1325](../../src/core/oracles.ts#L1299-L1325)

`graceful-failure` passes when a robustness-routed operation leaves no output; `gracefulAllowOutput: true` also passes a returned output without validating its media semantics. Otherwise returned output is a failure. [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705)

### Capability and adapter behavior

The [capability gate](../glossary.md#capability-gate) independently checks operation, input/output containers, codecs, and features, then applies browser codec support. It does not model an operation × container × codec × mode tuple. [src/core/runner.ts:113-200](../../src/core/runner.ts#L113-L200)

Trim is always classified as needing browser decode configuration, including copy-only rows. Conversely, only transcode is classified as producing encoded output, so frame-accurate trim does not receive a browser encoder-support preflight. [src/core/runner.ts:204-260](../../src/core/runner.ts#L204-L260) [src/core/runner.ts:264-313](../../src/core/runner.ts#L264-L313)

At runtime an error named [`NotApplicableError`](../glossary.md#notapplicableerror) maps to [`NA_ENGINE`](../glossary.md#na_engine); a timeout becomes FAIL and an ordinary operation exception reaches the outer [`ERROR`](../glossary.md#error) path. Oracle outcomes are boolean, and the first real non-passing outcome makes the cell FAIL; there is no current [DIFF](../glossary.md#diff) status. [src/core/runner.ts:686-693](../../src/core/runner.ts#L686-L693) [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393) [src/core/runner.ts:1411-1468](../../src/core/runner.ts#L1411-L1468) [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221)

The six scored adapters currently divide as follows:

| Engine | Declared trim support and implementation |
| --- | --- |
| [Mediabunny](../engines/mediabunny.md) | Declares trim, broad containers/codecs, frame-accurate HEVC, and massive lazy-read tokens. Audio-only same-container copy iterates overlapping encoded packets and rebases them; other paths use `Conversion`, with `forceTranscode` for frame accuracy. Invalid ranges and unavailable output formats currently throw ordinary `Error`. [src/engines/mediabunny/adapter.ts:921-1002](../../src/engines/mediabunny/adapter.ts#L921-L1002) [src/engines/mediabunny/adapter.ts:1029-1062](../../src/engines/mediabunny/adapter.ts#L1029-L1062) [src/engines/mediabunny/adapter.ts:1454-1508](../../src/engines/mediabunny/adapter.ts#L1454-L1508) |
| [ffmpeg.wasm](../engines/ffmpeg-wasm.md) | Declares trim and frame-accurate/FLAC/fragmented feature tokens. Copy mode places `-ss` before input and uses stream copy; accurate mode places `-ss` after input and selects encoders. Several concrete misses already throw `NotApplicableError`, while invalid ranges throw ordinary `Error`. [src/engines/ffmpeg-wasm/adapter.ts:1452-1502](../../src/engines/ffmpeg-wasm/adapter.ts#L1452-L1502) [src/engines/ffmpeg-wasm/adapter.ts:2538-2644](../../src/engines/ffmpeg-wasm/adapter.ts#L2538-L2644) |
| [aibrush-media](../engines/aibrush-media.md) | Declares trim across its advertised input/output sets and trim feature tokens. It has direct ADTS and WAV copy paths, otherwise calls the engine with `mode: 'accurate'` or `'keyframe'`; recognized capability misses are translated to `NotApplicableError`. [src/engines/aibrush-media/adapter.ts:92-159](../../src/engines/aibrush-media/adapter.ts#L92-L159) [src/engines/aibrush-media/adapter.ts:3752-3801](../../src/engines/aibrush-media/adapter.ts#L3752-L3801) [src/engines/aibrush-media/adapter.ts:3840-3898](../../src/engines/aibrush-media/adapter.ts#L3840-L3898) [src/engines/aibrush-media/adapter.ts:4294-4344](../../src/engines/aibrush-media/adapter.ts#L4294-L4344) |
| [Remotion](../engines/remotion.md) | Neither the [WebCodecs](../glossary.md#webcodecs) layer nor Media Parser declares trim. The composite therefore negotiates `NA_ENGINE`; required interface stubs throw if miscalled. [src/engines/remotion-webcodecs/adapter.ts:222-233](../../src/engines/remotion-webcodecs/adapter.ts#L222-L233) [src/engines/remotion-webcodecs/adapter.ts:814-827](../../src/engines/remotion-webcodecs/adapter.ts#L814-L827) [src/engines/remotion-media-parser/adapter.ts:179-192](../../src/engines/remotion-media-parser/adapter.ts#L179-L192) [src/engines/remotion-media-parser/adapter.ts:525-530](../../src/engines/remotion-media-parser/adapter.ts#L525-L530) [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91) |
| [MP4Box](../engines/mp4box.md) | Declares [ISO BMFF](../glossary.md#iso-bmff) parse/demux/remux/mux operations but not trim; its trim stub throws. [src/engines/mp4box/adapter.ts:630-650](../../src/engines/mp4box/adapter.ts#L630-L650) [src/engines/mp4box/adapter.ts:962-967](../../src/engines/mp4box/adapter.ts#L962-L967) |
| [web-demuxer](../engines/web-demuxer.md) | Declares read/decode operations and no output containers, not trim; its trim stub throws. [src/engines/web-demuxer/adapter.ts:618-645](../../src/engines/web-demuxer/adapter.ts#L618-L645) [src/engines/web-demuxer/adapter.ts:1055-1060](../../src/engines/web-demuxer/adapter.ts#L1055-L1060) |

### Measurement behavior

Correctness runs before measurement. Once all live oracles pass, every measured iteration rebuilds the input, reruns trim, and records all requested metrics from the same operation. [src/core/runner.ts:1445-1463](../../src/core/runner.ts#L1445-L1463) [src/core/runner.ts:1628-1708](../../src/core/runner.ts#L1628-L1708)

`throughputRealtime` uses source-golden duration, not the requested trim duration, and encoded-output frame estimates likewise use source fps × full source duration. Consequently, the current real-time and frame-rate numerators overstate work represented by a subrange trim. [src/core/runner.ts:849-855](../../src/core/runner.ts#L849-L855) [src/core/runner.ts:1660-1689](../../src/core/runner.ts#L1660-L1689) [src/core/runner.ts:1713-1723](../../src/core/runner.ts#L1713-L1723) [src/core/measure.ts:14-16](../../src/core/measure.ts#L14-L16) [src/core/measure.ts:76-83](../../src/core/measure.ts#L76-L83)

## Contracts and invariants

### Enforced today

- A trim scenario has a finite microsecond range in declaration data, a same-container output request, required [capability tokens](../glossary.md#capability-token), at least one oracle, and an operation timeout where declared; `defineScenario` enforces only the id, operation requirement, and non-empty oracle list. [src/scenarios/trim/index.ts:669-698](../../src/scenarios/trim/index.ts#L669-L698) [src/core/scenario.ts:145-176](../../src/core/scenario.ts#L145-L176) [src/core/scenario.ts:193-203](../../src/core/scenario.ts#L193-L203)
- Ordinary output must exist. If its duration is observable, it must fall inside the scenario's absolute tolerance around `endUs − startUs`; otherwise the family can become `NA_ASSET` rather than [PASS](../glossary.md#pass). [src/core/oracles.ts:2418-2473](../../src/core/oracles.ts#L2418-L2473)
- A video row with `playback-smoke` additionally requires the browser media element to obtain current data and advance twice. [src/core/oracles.ts:1631-1638](../../src/core/oracles.ts#L1631-L1638) [src/engines/platform/oracle-helpers.ts:167-215](../../src/engines/platform/oracle-helpers.ts#L167-L215)
- A no-op row separately requires output duration to approximate source golden duration. It does not currently enforce source packet identity because `reference-reimport` retires for `trim`. [src/scenarios/trim/index.ts:738-807](../../src/scenarios/trim/index.ts#L738-L807) [src/core/oracles.ts:1299-1325](../../src/core/oracles.ts#L1299-L1325) [src/core/oracles.ts:2797-2847](../../src/core/oracles.ts#L2797-L2847)
- A malformed/range-negative row passes on a timely throw/reject; a timeout fails. Returned output normally fails, except the truncated-source row explicitly permits it without further media validation. [src/core/runner.ts:1522-1569](../../src/core/runner.ts#L1522-L1569) [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705) [src/scenarios/trim/index.ts:894-904](../../src/scenarios/trim/index.ts#L894-L904)
- Performance is eligible only after correctness PASS, and `NA_ENGINE`, [`NA_BROWSER`](../glossary.md#na_browser), and `NA_ASSET` remain distinct result statuses. [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463) [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221)

### Declared intent that is not enforced

- `frameAccurate: false` is described as a keyframe-aligned copy and `true` as an exact cut that re-encodes the leading GOP, but the common oracle checks duration, not copied bytes, source landing points, or decoded boundary identity. [src/scenarios/trim/index.ts:1-13](../../src/scenarios/trim/index.ts#L1-L13) [src/core/oracles.ts:2454-2505](../../src/core/oracles.ts#L2454-L2505)
- The rotated, alpha, multitrack, fragmented, open-GOP, single-GOP, and subframe rows describe corresponding preservation obligations, yet their registered oracle sets add only playback or nothing beyond duration. [src/scenarios/trim/index.ts:327-341](../../src/scenarios/trim/index.ts#L327-L341) [src/scenarios/trim/index.ts:475-576](../../src/scenarios/trim/index.ts#L475-L576) [src/scenarios/trim/index.ts:669-698](../../src/scenarios/trim/index.ts#L669-L698)
- The family comments identify trim-concat as a desired metamorphic property but state that the required runner-side splice machinery does not exist here; only full-range duration idempotence is registered. [src/scenarios/trim/index.ts:703-719](../../src/scenarios/trim/index.ts#L703-L719) [src/scenarios/trim/index.ts:738-807](../../src/scenarios/trim/index.ts#L738-L807)

## Target design and known gaps

### Target design

#### Presentation-range semantics

Treat `range` as a half-open interval `[startUs, endUs)` on the source presentation timeline. Reject non-finite values, `startUs < 0`, `endUs <= startUs`, and `startUs >= presentedDuration`; allow a valid start with an end beyond EOF by clamping the end to the last presented sample. Report the requested interval, effective source interval, first/last retained presentation timestamps, and output origin. In [ISO BMFF](../glossary.md#iso-bmff), derive that timeline through movie/media timescales and [edit lists](../glossary.md#edit-list), not `mvhd` duration alone: W3C's ISO BMFF byte-stream rules explicitly define `elst` as the media-composition-to-movie-presentation mapping, and Apple's seeking procedure applies the edit list before converting to media time. [W3C ISO BMFF initialization segments §3](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments) [Apple, “Seeking with a QuickTime file”](https://developer.apple.com/documentation/quicktime-file-format/seeking_with_a_quicktime_file)

Translate that contract explicitly at framework boundaries. Mediabunny's official `Conversion` API takes trim start/end in seconds and normally rebases the result to timestamp zero; the adapter's microsecond conversion and chosen origin must therefore be observable in the result evidence. [Mediabunny, “Converting media files — Trimming”](https://mediabunny.dev/guide/converting-media-files#trimming)

Acceptance criteria:

- For copy mode, retain complete coded samples from a decoder-safe random access point at or before the requested start through the last sample overlapping the requested end, rebase timestamps monotonically, and expose the landed presentation interval. FFmpeg's official `-ss` behavior distinguishes input seeking to the nearest earlier seek point from accurate transcoding that decodes and discards the gap; the benchmark must judge the declared mode against that distinction. [FFmpeg, main options: `-ss`](https://ffmpeg.org/ffmpeg.html#Main-options)
- For frame-accurate mode, the first displayed video frame must be the first source frame whose presentation interval intersects the request, and no displayed frame may begin at or beyond `endUs`; any dependency frames before the boundary are decode-only. Open-GOP acceptance must be proven by a neutral decode, not only a keyframe flag, because H.264 defines reference-picture and random-access semantics beyond a container boolean. [ITU-T H.264](https://www.itu.int/rec/T-REC-H.264)
- Normalize output presentation origin to zero unless a scenario explicitly requests source timestamps. Preserve per-track A/V alignment using presentation timestamps, not track index or packet ordinal. `WebCodecs` timestamps and durations are microsecond presentation values, so target boundary observations should retain those values without a frame-index surrogate. [W3C WebCodecs, `VideoFrame` and `EncodedVideoChunk`](https://www.w3.org/TR/webcodecs/)
- For [VFR](../glossary.md#vfr), compare actual frame intervals. For [CFR](../glossary.md#cfr) and an [NTSC rate](../glossary.md#ntsc-rate), use rational timestamp bands rather than rounded fps or an assumed 33.333 ms step. Apple's time-to-sample model permits runs of differing sample durations, and its 29.97 fps guidance represents the cadence exactly as a timescale/duration ratio. [Apple, “Time-to-sample atom”](https://developer.apple.com/documentation/quicktime-file-format/time-to-sample_atom) [Apple, “Creating video tracks at 29.97 frames per second”](https://developer.apple.com/documentation/quicktime-file-format/creating_video_tracks_at_2997_frames_per_second)

#### Boundary evidence and verdicts

Bake range-specific evidence keyed by source asset, normalized range, mode, relevant output representation, and browser-reference provenance. Decode a window on both sides of each requested boundary through the neutral platform [reference decode](../glossary.md#reference-decode); pair frames by presentation timestamp/time window and compare first/last retained content, not array index. Keep container readability and timeline structure as separate oracle observations. WebCodecs leaves codec availability runtime-dependent, so a missing neutral reference decoder must yield `NA_BROWSER`, not an output correctness FAIL. [W3C WebCodecs abstract and codec support model](https://www.w3.org/TR/webcodecs/#abstract)

Oracle verdicts must become three-way PASS / DIFF / FAIL. PASS means the required [semantic equivalence](../glossary.md#semantic-equivalence), synchronization, properties, and structural validity hold. DIFF means a valid output has only a permitted [representation difference](../glossary.md#representation-difference) from the ffmpeg-baked golden. FAIL is reserved for a truly wrong boundary, missing/extra program content outside tolerance, broken dependency chain, track loss/desynchronization, invalid container, or undecodable required output. The current boolean outcome and binary collapse must be replaced in the shared oracle/result/report model, not simulated with prose details.

For copied H.264/H.265, compare semantic access units, decoded pictures, ordering, timestamps, and random-access safety. Do not demand byte-exact packet sizes, identical keyframe labels, or identical grouping: the WebCodecs AVC registration permits both [Annex B](../glossary.md#annex-b) and `avc`/length-prefixed forms, places SPS/PPS in-band for Annex B and out-of-band in the decoder configuration for `avc`, and defines a chunk as an access unit. A legal [AVCC](../glossary.md#avcc) versus Annex B, inline-parameter-set, or NAL-grouping difference is DIFF unless it changes decode semantics. [W3C AVC WebCodecs registration §§2–5](https://www.w3.org/TR/webcodecs-avc-codec-registration/)

Acceptance criteria:

- A same-duration cut from the wrong source interval fails on boundary evidence.
- A correct cut whose H.264 representation changes between Annex B and AVCC remains valid and reports DIFF, with the exact representational reason.
- A frame-accurate VFR cut with a changed frame count pairs by timestamp windows and passes when the requested presentation content matches.
- Missing range-specific evidence yields `NA_ASSET`; inability of the neutral browser reference path yields `NA_BROWSER`; neither is coerced to FAIL.

#### Audio, multitrack, and container-specific rules

Judge audio boundaries in decoded sample time. AAC output must account for [priming](../glossary.md#priming) and tail padding rather than treating container duration or packet count as program-audio length; Apple's AAC guidance describes mandatory encoder priming and padding. Ogg Opus must honor pre-skip and EOS granule end trimming, both of which RFC 7845 defines for sample-accurate presentation. [Apple, “AAC encoding background”](https://developer.apple.com/documentation/quicktime-file-format/background_aac_encoding) [RFC 7845 §4.2, Pre-skip](https://datatracker.ietf.org/doc/html/rfc7845#section-4.2) [RFC 7845 §4.4, End Trimming](https://datatracker.ietf.org/doc/html/rfc7845#section-4.4)

For FLAC, make the with-SEEKTABLE and without-SEEKTABLE rows semantically equivalent: a seek table is optional location metadata, while frame/sample numbering supplies the coded timeline. Recompute STREAMINFO total samples, seek points, and checksums as required; verify decoded PCM and sample count. [RFC 9639 §8.5, Seek Table](https://www.rfc-editor.org/rfc/rfc9639.html#section-8.5) [RFC 9639 §9.1, Frame Header](https://www.rfc-editor.org/rfc/rfc9639.html#section-9.1)

For every multitrack trim, match tracks by stable identity/type, retain every required track, apply the same presentation interval, and verify per-track start/end alignment within a declared sample/frame band. For rotation and alpha rows, assert the display transform and decoded alpha plane independently of playback. For MPEG-TS, preserve 188-byte transport-packet structure and validate PTS continuity around the cut; container packet alignment alone is not presentation correctness. [ITU-T H.222.0](https://www.itu.int/rec/T-REC-H.222.0)

The fragmented row must use the actual fragmented fixture and verify an initialization segment plus valid `moof`/`mdat` media fragments with a `tfdt` in every track fragment and rebased decode time. These are explicit W3C ISO BMFF media-segment requirements. [W3C ISO BMFF media segments §4](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#media-segments)

#### Applicability, robustness, and measurement

Retain the cheap per-[capability token](../glossary.md#capability-token) preflight, but require every adapter that passes it to translate a concrete unsupported trim tuple into `NotApplicableError`; the runner must map that signal to `NA_ENGINE`. Tuple diagnostics must name operation, input/output container, codecs, mode, and limiting feature. A real malformed input or invalid range remains a graceful negative-test rejection, and an implementation defect remains ERROR.

Concretely, a Mediabunny container/codec/mode miss that survives token preflight must use `NotApplicableError`, while its invalid-range rejection remains an ordinary graceful-test error. Remotion and Remotion Media Parser should keep trim undeclared until they implement it; if a future declaration exposes only some trim tuples, runtime misses must use `NotApplicableError` rather than their current ordinary-error stubs.

Copy-only trim must not be browser-codec-gated when the adapter only parses and copies packets. Frame-accurate trim must preflight both decode and encode support for the actual source and target codec, then allow an adapter runtime miss to refine that coarse decision. `WebCodecs` explicitly permits implementations to support any codec combination or none, which is why configuration support is a runtime property rather than a global codec label. [W3C WebCodecs abstract](https://www.w3.org/TR/webcodecs/#abstract)

Robustness rotations must preserve every per-file verdict and expose passed/admissible/total coverage. “File 01 passes, files 02/03 fail” is [partial coverage](../glossary.md#partial-coverage), not ERROR and not a discarded pass. A returned partial output for a corrupt input must be parsed/decoded and labeled as validated salvage, invalid output, or unavailable evidence; a flag alone cannot grant PASS.

Measure trim throughput against the effective processed interval, and report both source bytes read and output duration. Copy trim should additionally report read amplification (`sourceBytesRead / bytesNeededForRetainedSamples`) where byte-range evidence exists; frame-accurate trim should report decoded/encoded boundary frames rather than full-source estimates. A ladder row passes correctness first, then ranks only comparable executions.

Finally, implement the real metamorphic relation `trim(a..b) ++ trim(b..c) ≈ trim(a..c)` with semantic comparison after concatenation. Boundary representation changes may be DIFF; missing/duplicated decoded content, timestamp discontinuity, or A/V drift is FAIL.

### Known gaps

#### 1. Duration can green the wrong interval

**Current.** The boundary oracle compares only output duration unless exact range-specific frame golden exists, and none is loaded by the current source-keyed path. [src/core/oracles.ts:2454-2505](../../src/core/oracles.ts#L2454-L2505)

**Consequence.** Output from a different source interval with the same duration can PASS; frame-accurate, open-GOP, subframe, and VFR claims are not proven.

**Target.** Add presentation-timestamp-windowed, neutral-decode boundary evidence as specified above, following `WebCodecs` microsecond timestamp semantics. [W3C WebCodecs](https://www.w3.org/TR/webcodecs/)

**Verification.** Deliberately shift an otherwise valid output by one GOP and one VFR frame interval: both must FAIL while an exact semantic cut passes.

#### 2. Several audio rows have no reachable positive oracle

**Current.** The no-engine duration reader covers MP4/MOV and WebM/MKV; the final simple-audio fallback covers only WAV and AIFF. MP3, Ogg/Opus, ADTS, and FLAC rows register no extra oracle, so an undecodable or empty platform-frame path ends in `NA_ASSET`. [src/core/box-readers.ts:1-6](../../src/core/box-readers.ts#L1-L6) [src/core/oracles.ts:2427-2473](../../src/core/oracles.ts#L2427-L2473) [src/core/oracles.ts:2518-2523](../../src/core/oracles.ts#L2518-L2523) [src/scenarios/trim/index.ts:343-397](../../src/scenarios/trim/index.ts#L343-L397)

**Consequence.** Registered audio coverage can be structurally present yet produce no correctness score.

**Target.** Add container-specific duration/sample readers and decoded-PCM boundary checks, including AAC priming, Opus pre-skip/end trim, and FLAC total-sample semantics. [RFC 7845 §§4.2–4.4](https://datatracker.ietf.org/doc/html/rfc7845#section-4.2) [RFC 9639 §§8.2, 8.5, 9.1](https://www.rfc-editor.org/rfc/rfc9639.html#section-8.2)

**Verification.** Each audio scenario must produce PASS/DIFF/FAIL on a baked asset; one-sample deletion, duplicated edge frame, wrong pre-skip, and stale FLAC total-samples metadata must fail.

#### 3. ISO BMFF duration ignores edit-list presentation mapping

**Current.** The byte reader computes MP4/MOV duration solely from `mvhd.duration / mvhd.timescale`; it does not parse `edts/elst`. [src/core/box-readers.ts:210-227](../../src/core/box-readers.ts#L210-L227) [src/core/box-readers.ts:348-377](../../src/core/box-readers.ts#L348-L377)

**Consequence.** A valid edit list, priming offset, empty edit, or differing media/movie timebase can make a correct trim look long/short or hide an incorrect presented interval.

**Target.** Resolve per-track presentation spans through edit lists and sample timing, widening only documented rounding/priming bands. W3C requires support for the single-edit mapping, and ISO/IEC 14496-12 defines the format's timing model. [W3C ISO BMFF §3](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments) [ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html)

**Verification.** Fixtures with an empty leading edit, non-zero media time, AAC priming, and two distinct movie/media timescales must all be judged by presented content rather than raw `mvhd` duration.

#### 4. The fragmented scenario is progressive in practice

**Current.** `trim/fmp4_fragment_boundary_copy` selects `h264_1080p_30s.mp4`, whose manifest recipe is progressive MP4, even though the corpus contains `fragmented_cmaf.mp4`; the generic builder forwards no fragmentation output option. [src/scenarios/trim/index.ts:526-541](../../src/scenarios/trim/index.ts#L526-L541) [src/scenarios/trim/index.ts:669-680](../../src/scenarios/trim/index.ts#L669-L680) [fixtures/manifest.json:6-18](../../fixtures/manifest.json#L6-L18) [fixtures/manifest.json:791-803](../../fixtures/manifest.json#L791-L803)

**Consequence.** The row's feature token gates contestants, but the bytes and oracle do not prove fragment-boundary trimming or `tfdt` rewriting.

**Target.** Use the fragmented fixture, request/retain fragmented output explicitly, and assert the required `moof`/`mdat`, `traf`, and `tfdt` structure. [W3C ISO BMFF §4](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#media-segments)

**Verification.** A progressive output, missing `tfdt`, non-rebased fragment timeline, or fragment that references absent samples must FAIL.

#### 5. Feature-labelled rows do not assert their feature

**Current.** Alpha, rotation, multitrack, open-GOP, very-short, and subframe rows attach only duration and sometimes generic playback. [src/scenarios/trim/index.ts:327-341](../../src/scenarios/trim/index.ts#L327-L341) [src/scenarios/trim/index.ts:475-576](../../src/scenarios/trim/index.ts#L475-L576) [src/scenarios/trim/index.ts:669-698](../../src/scenarios/trim/index.ts#L669-L698)

**Consequence.** Dropped alpha, lost rotation, omitted secondary audio, A/V drift, corrupt first open-GOP frame, or an empty subframe request can escape the named contract.

**Target.** Attach property-specific oracles: alpha-plane decode, display-matrix observation, type/identity-based track retention and sync, dependency-safe first-frame decode, and explicit one-frame/subframe policy. ISO BMFF carries timing, structure, and media information rather than duration alone. [ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html)

**Verification.** Mutate each property independently while keeping duration and playback valid; every mutation must FAIL its dedicated oracle.

#### 6. No-op identity is weaker than its declaration

**Current.** The no-op rows register `reference-reimport`, but that oracle returns unavailable for `trim`; only duration and playback can pass. [src/scenarios/trim/index.ts:738-807](../../src/scenarios/trim/index.ts#L738-L807) [src/core/oracles.ts:1299-1325](../../src/core/oracles.ts#L1299-L1325)

**Consequence.** A full-range trim can drop/reorder content yet retain a plausible duration and playback.

**Target.** Define no-op identity semantically: same required tracks, presentation timeline, decoded video/audio, and metadata properties. Legal packetization changes are DIFF rather than FAIL. [W3C AVC WebCodecs registration §§2–5](https://www.w3.org/TR/webcodecs-avc-codec-registration/)

**Verification.** Packet regrouping with identical decode reports DIFF; a dropped access unit, shifted audio, or lost track reports FAIL.

#### 7. Byte-exact packet comparison would be unfair if added directly

**Current.** The shared packet comparator matches tracks by index and requires exact packet size and keyframe flags; its comments also describe exact sample grouping. Trim currently avoids this comparator for subranges. [src/core/oracles.ts:835-926](../../src/core/oracles.ts#L835-L926)

**Consequence.** Reusing it as the missing copy-trim oracle would falsely fail legal Annex B versus AVCC framing, inline SPS/PPS, or different NAL/access-unit grouping.

**Target.** Split semantic packet invariants from representation diagnostics, producing DIFF for legal form changes and FAIL only for semantic loss/corruption. The AVC registration explicitly distinguishes Annex B and `avc` configuration placement. [W3C AVC WebCodecs registration §5.2](https://www.w3.org/TR/webcodecs-avc-codec-registration/#avcbitstreamformat)

**Verification.** Compare semantically identical outputs in both framing forms and with legal parameter-set placement; they must not FAIL, while an absent reference picture or broken access unit must.

#### 8. Capability preflight is both over- and under-inclusive

**Current.** Flat tokens admit no tuple test. All trim rows require browser decode even for copy-only paths, while frame-accurate trim receives no encode preflight. Adapter misses expressed as ordinary `Error` become ERROR rather than `NA_ENGINE`. [src/core/runner.ts:113-227](../../src/core/runner.ts#L113-L227) [src/core/runner.ts:237-313](../../src/core/runner.ts#L237-L313) [src/core/runner.ts:1382-1468](../../src/core/runner.ts#L1382-L1468) [src/engines/mediabunny/adapter.ts:1454-1508](../../src/engines/mediabunny/adapter.ts#L1454-L1508)

**Consequence.** Parser/copy-capable cells can become false `NA_BROWSER`, while unsupported frame-accurate codec/container combinations can leak into FAIL or ERROR.

**Target.** Make preflight mode-aware and require runtime tuple misses to throw `NotApplicableError`, shrinking any manually disabled-cell exceptions. Runtime codec support must be queried at the actual configuration boundary. [W3C WebCodecs](https://www.w3.org/TR/webcodecs/)

**Verification.** A copy-only trim runs without decoder support when its adapter needs none; a missing frame-accurate encoder becomes `NA_BROWSER` or `NA_ENGINE` according to ownership, never ERROR.

#### 9. Composition is documented but not exercised

**Current.** The family states that runner-side splice machinery for `trim(a..b) ++ trim(b..c)` is absent and registers only full-range duration idempotence. [src/scenarios/trim/index.ts:703-719](../../src/scenarios/trim/index.ts#L703-L719) [src/scenarios/trim/index.ts:738-807](../../src/scenarios/trim/index.ts#L738-L807)

**Consequence.** Duplicate/missing seam content, timestamp discontinuity, and boundary A/V drift have no metamorphic detector.

**Target.** Build both sides from the same source timeline, concatenate through an engine-independent harness path, and compare decoded time windows and track alignment; permit only declared representation DIFF.

**Verification.** Adjacent cuts reproduce the direct cut; deliberate one-frame overlap and one-frame hole each FAIL with seam-local detail.

#### 10. Robustness aggregation loses partial support

**Current.** Exhaustive aggregation preserves per-file records and coverage, but any FAIL/ERROR produces a single aggregate FAIL/ERROR status; it does not grade partial coverage. [src/core/runner.ts:1120-1179](../../src/core/runner.ts#L1120-L1179)

**Consequence.** “Passes file 01, fails 02/03” is flattened instead of becoming an actionable support boundary; a plain ERROR can obscure valid survivors.

**Target.** Preserve per-file PASS/DIFF/FAIL/NA outcomes and report partial coverage with the denominator and failing files, reserving ERROR for the harness/adapter execution defect itself.

**Verification.** A synthetic three-file trim rotation with one success and two true failures renders partial coverage `1/3`, lists both failures, and retains the successful file's evidence.

#### 11. Trim throughput uses the wrong numerator

**Current.** Real-time throughput and estimated encoded frames use the full source duration/fps even for a short subrange. [src/core/runner.ts:849-855](../../src/core/runner.ts#L849-L855) [src/core/runner.ts:1660-1689](../../src/core/runner.ts#L1660-L1689) [src/core/runner.ts:1713-1723](../../src/core/runner.ts#L1713-L1723)

**Consequence.** A six-second cut from a two-hour source can be reported as though two hours of media were processed, making engines and modes incomparable.

**Target.** Use the effective trim interval and observed boundary work, while reporting source-read amplification separately.

**Verification.** The 60–66 s rows use six seconds as the throughput numerator; the massive 3600–3660 s row uses 60 seconds, and measured source reads remain independently visible.

## Sources

### Repository evidence

- [src/scenarios/trim/index.ts:1-80](../../src/scenarios/trim/index.ts#L1-L80) — family modes, oracle intent, and metric sets.
- [src/scenarios/trim/index.ts:135-577](../../src/scenarios/trim/index.ts#L135-L577) — all 29 ordinary functional scenarios.
- [src/scenarios/trim/index.ts:579-701](../../src/scenarios/trim/index.ts#L579-L701) — ladder scenarios and common builder.
- [src/scenarios/trim/index.ts:703-807](../../src/scenarios/trim/index.ts#L703-L807) — missing composition machinery and two no-op invariant scenarios.
- [src/scenarios/trim/index.ts:809-951](../../src/scenarios/trim/index.ts#L809-L951) — seven negative scenarios and final export.
- [src/core/oracles.ts:2416-2523](../../src/core/oracles.ts#L2416-L2523) — live trim duration/boundary oracle and its container coverage.
- [src/core/oracles.ts:1299-1325](../../src/core/oracles.ts#L1299-L1325) — `reference-reimport` excludes trim.
- [src/core/oracles.ts:835-984](../../src/core/oracles.ts#L835-L984) — exact packet-layout comparator.
- [src/core/oracles.ts:1631-1638](../../src/core/oracles.ts#L1631-L1638) — playback-smoke verdict.
- [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705) — graceful-failure semantics.
- [src/core/oracles.ts:2797-2847](../../src/core/oracles.ts#L2797-L2847) — duration property invariant.
- [src/core/box-readers.ts:1-24](../../src/core/box-readers.ts#L1-L24) — no-engine reader scope.
- [src/core/box-readers.ts:210-227](../../src/core/box-readers.ts#L210-L227) and [src/core/box-readers.ts:348-377](../../src/core/box-readers.ts#L348-L377) — MP4 duration comes from `mvhd` only.
- [src/core/runner.ts:113-313](../../src/core/runner.ts#L113-L313) — flat token and browser-codec negotiation.
- [src/core/runner.ts:686-820](../../src/core/runner.ts#L686-L820) — applicability recognition and trim dispatch.
- [src/core/runner.ts:1237-1468](../../src/core/runner.ts#L1237-L1468) — cell execution, boolean oracle collapse, status mapping, and correctness-before-benchmark.
- [src/core/runner.ts:1120-1179](../../src/core/runner.ts#L1120-L1179) — exhaustive coverage records and current aggregate failure collapse.
- [src/core/runner.ts:1522-1625](../../src/core/runner.ts#L1522-L1625) — robustness execution.
- [src/core/runner.ts:1628-1723](../../src/core/runner.ts#L1628-L1723) — benchmark context and full-source numerators.
- [src/core/scenario.ts:145-221](../../src/core/scenario.ts#L145-L221) — scenario, result status, and boolean oracle types.
- [src/engines/mediabunny/adapter.ts:921-1002](../../src/engines/mediabunny/adapter.ts#L921-L1002) and [src/engines/mediabunny/adapter.ts:1447-1508](../../src/engines/mediabunny/adapter.ts#L1447-L1508) — Mediabunny audio-copy and Conversion trim paths.
- [src/engines/ffmpeg-wasm/adapter.ts:2536-2644](../../src/engines/ffmpeg-wasm/adapter.ts#L2536-L2644) — ffmpeg.wasm trim modes and runtime applicability decisions.
- [src/engines/aibrush-media/adapter.ts:4294-4344](../../src/engines/aibrush-media/adapter.ts#L4294-L4344) — aibrush-media trim dispatch and error translation.
- [src/engines/remotion-webcodecs/adapter.ts:222-233](../../src/engines/remotion-webcodecs/adapter.ts#L222-L233), [src/engines/remotion-media-parser/adapter.ts:179-192](../../src/engines/remotion-media-parser/adapter.ts#L179-L192), [src/engines/mp4box/adapter.ts:630-650](../../src/engines/mp4box/adapter.ts#L630-L650), and [src/engines/web-demuxer/adapter.ts:618-645](../../src/engines/web-demuxer/adapter.ts#L618-L645) — adapters that do not declare trim.
- [fixtures/manifest.json:6-18](../../fixtures/manifest.json#L6-L18) and [fixtures/manifest.json:791-803](../../fixtures/manifest.json#L791-L803) — progressive baseline and actual fragmented CMAF fixture provenance.

### External authorities

- ISO/IEC, [ISO/IEC 14496-12:2026 — ISO base media file format](https://www.iso.org/standard/85596.html), accessed 2026-07-16 — authoritative format/timing/structure scope for MP4-family presentation.
- W3C, [ISO BMFF Byte Stream Format §§3–5](https://www.w3.org/TR/mse-byte-stream-format-isobmff/), accessed 2026-07-16 — edit-list mapping, in/out-of-band codec configuration, fragment structure, `tfdt`, and random-access requirements.
- W3C, [WebCodecs](https://www.w3.org/TR/webcodecs/), accessed 2026-07-16 — microsecond presentation timestamps/durations and runtime-dependent codec support.
- W3C, [AVC (H.264) WebCodecs Registration §§2–5](https://www.w3.org/TR/webcodecs-avc-codec-registration/), accessed 2026-07-16 — access units, Annex B versus `avc` framing, decoder configuration, and SPS/PPS placement.
- ITU-T, [Recommendation H.264 — Advanced video coding for generic audiovisual services](https://www.itu.int/rec/T-REC-H.264), accessed 2026-07-16 — coded-picture dependencies and random-access semantics.
- ITU-T/ISO/IEC, [Recommendation H.222.0 — Generic coding of moving pictures and associated audio information: Systems](https://www.itu.int/rec/T-REC-H.222.0), accessed 2026-07-16 — MPEG transport-stream and presentation-timestamp structure.
- FFmpeg Project, [ffmpeg Documentation, Main options (`-ss`, timestamp options)](https://ffmpeg.org/ffmpeg.html#Main-options), accessed 2026-07-16 — input seeking, accurate seek/discard, stream-copy, and timestamp behavior.
- Mediabunny, [Converting media files](https://mediabunny.dev/guide/converting-media-files), accessed 2026-07-16 — official Conversion trim range, zero-based output, copy-when-possible, and transcode behavior.
- Apple, [Seeking with a QuickTime file](https://developer.apple.com/documentation/quicktime-file-format/seeking_with_a_quicktime_file), accessed 2026-07-16 — edit-list application and movie-to-media time conversion.
- Apple, [Time-to-sample atom](https://developer.apple.com/documentation/quicktime-file-format/time-to-sample_atom), accessed 2026-07-16 — sample-duration runs and timeline derivation.
- Apple, [Creating video tracks at 29.97 frames per second](https://developer.apple.com/documentation/quicktime-file-format/creating_video_tracks_at_2997_frames_per_second), accessed 2026-07-16 — rational NTSC rate timing representation.
- Apple, [AAC encoding background](https://developer.apple.com/documentation/quicktime-file-format/background_aac_encoding), accessed 2026-07-16 — AAC encoder priming and tail padding.
- IETF, [RFC 7845 — Ogg Encapsulation for the Opus Audio Codec §§4.2–4.4](https://datatracker.ietf.org/doc/html/rfc7845#section-4.2), accessed 2026-07-16 — pre-skip, PCM position, and end trimming.
- IETF, [RFC 9639 — Free Lossless Audio Codec (FLAC) §§8.2, 8.5, 9.1](https://www.rfc-editor.org/rfc/rfc9639.html#section-8.5), accessed 2026-07-16 — total samples, optional seek points, and frame/sample numbering.
- IETF, [RFC 9559 — Matroska Media Container Format Specification §6.4](https://datatracker.ietf.org/doc/html/rfc9559#section-6.4), accessed 2026-07-16 — Cue-based random-access indexing for Matroska/WebM.
