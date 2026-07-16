# Decode and seek

> Scope: Owns decoded-frame correctness, presentation timing, visual normalization, random access, and the decode/seek property scenarios; general runner, oracle, and adapter mechanics belong to their subsystem and engine pages.
> Phase-2 owner: p2_feature_decode_seek.

## Purpose

This family asks two observable questions: does an engine expose the right displayed frames in presentation time, and does random access land on the right real frame? Its 46 registered [scenarios](../glossary.md#scenario) cover codec and container breadth, B-frame reordering, [VFR](../glossary.md#vfr), extreme cadence, rotation, alpha, still images, size, seek boundaries, and four cross-operation properties. The results are inputs to conformance decisions and to performance comparisons; an [oracle](../glossary.md#oracle) must establish correctness before decode or seek measurements are admitted.

The page traces family-specific behavior. The shared execution state machine is specified by [runner and capability negotiation](../subsystems/runner-capability-negotiation.md), normalized frame and seek types by the [engine-adapter contract](../subsystems/engine-adapter-contract.md), reference comparisons by the [oracle system](../subsystems/oracle-system.md), and measurement aggregation by [reporting and aggregation](../subsystems/reporting-aggregation.md).

## As-built

### Registration and execution path

The module builds four arrays—22 general decode scenarios, six decode size-ladder scenarios, 14 seek scenarios, and four property scenarios—and exports their concatenation in that order. The family registry imports that array, includes it in the global scenario list, and groups it under **decode-seek**. [src/scenarios/decode-seek/index.ts:56-338](../../src/scenarios/decode-seek/index.ts#L56-L338) [src/scenarios/decode-seek/index.ts:361-450](../../src/scenarios/decode-seek/index.ts#L361-L450) [src/scenarios/decode-seek/index.ts:471-671](../../src/scenarios/decode-seek/index.ts#L471-L671) [src/scenarios/decode-seek/index.ts:699-785](../../src/scenarios/decode-seek/index.ts#L699-L785) [src/scenarios/index.ts:18-20](../../src/scenarios/index.ts#L18-L20) [src/scenarios/index.ts:69-72](../../src/scenarios/index.ts#L69-L72)

For a decode [cell](../glossary.md#cell), the runner first requires a complete frame/SSIM [golden](../glossary.md#golden), applies declared and browser gates, calls **decodeFrames(input, { maxFrames })**, runs every declared oracle, and benchmarks only after functional success. For seek it calls **seek(input, tUs)** once. A thrown [NotApplicableError](../glossary.md#notapplicableerror) maps to [NA_ENGINE](../glossary.md#na_engine); other uncaught execution exceptions map to [ERROR](../glossary.md#error). [src/core/runner.ts:1324-1356](../../src/core/runner.ts#L1324-L1356) [src/core/runner.ts:794-817](../../src/core/runner.ts#L794-L817) [src/core/runner.ts:1382-1468](../../src/core/runner.ts#L1382-L1468)

### Decode: codecs, containers, and timing

Every row below is a distinct **decodeFrames** scenario. Unless noted, it compares decoded frames with **ssim-psnr**, requests the listed leading-frame limit, reports decodeFps/timeToFirstFrame/wall/peakMemory/longtasks, and ranks on decodeFps. Alpha adds **alpha-plane**. [src/scenarios/decode-seek/index.ts:308-337](../../src/scenarios/decode-seek/index.ts#L308-L337)

| Scenario | Input contract | Frames | Special assertion or tolerance | Evidence |
| --- | --- | ---: | --- | --- |
| decode_h264_first_frames | H.264 in MP4 | 60 | leading presentation sequence | [src/scenarios/decode-seek/index.ts:59-66](../../src/scenarios/decode-seek/index.ts#L59-L66) |
| decode_bframes_reorder | H.264 B-frames in MP4 | 60 | output in PTS order, not decode order | [src/scenarios/decode-seek/index.ts:68-75](../../src/scenarios/decode-seek/index.ts#L68-L75) |
| decode_vfr_timing | H.264 VFR in MP4 | 60 | scenario note requires uneven true PTS | [src/scenarios/decode-seek/index.ts:77-84](../../src/scenarios/decode-seek/index.ts#L77-L84) |
| decode_hevc | HEVC/hvc1 in MP4 | 30 | browser-dependent configuration | [src/scenarios/decode-seek/index.ts:86-93](../../src/scenarios/decode-seek/index.ts#L86-L93) |
| decode_vp9 | VP9 in WebM | 30 | default SSIM floor | [src/scenarios/decode-seek/index.ts:95-101](../../src/scenarios/decode-seek/index.ts#L95-L101) |
| decode_vp8 | VP8 in WebM | 30 | SSIM ≥ 0.96 | [src/scenarios/decode-seek/index.ts:103-113](../../src/scenarios/decode-seek/index.ts#L103-L113) |
| decode_av1 | AV1 in WebM | 30 | SSIM ≥ 0.96; browser-dependent | [src/scenarios/decode-seek/index.ts:115-123](../../src/scenarios/decode-seek/index.ts#L115-L123) |
| decode_vp9_alpha | VP9 with alpha in WebM | 30 | ssim-psnr plus alpha-plane | [src/scenarios/decode-seek/index.ts:125-131](../../src/scenarios/decode-seek/index.ts#L125-L131) |
| decode_mov_h264 | H.264 in QuickTime MOV | 60 | MOV sample-table path | [src/scenarios/decode-seek/index.ts:164-173](../../src/scenarios/decode-seek/index.ts#L164-L173) |
| decode_mkv_h264 | H.264 in Matroska | 60 | Cluster/SimpleBlock path | [src/scenarios/decode-seek/index.ts:175-184](../../src/scenarios/decode-seek/index.ts#L175-L184) |
| decode_h264_4k | 3840×2160 H.264 in MP4 | 30 | large-resolution capability point | [src/scenarios/decode-seek/index.ts:188-197](../../src/scenarios/decode-seek/index.ts#L188-L197) |
| decode_h264_10bit | High-10 H.264 in MP4 | 30 | SSIM ≥ 0.96 after RGBA conversion | [src/scenarios/decode-seek/index.ts:231-242](../../src/scenarios/decode-seek/index.ts#L231-L242) |
| decode_open_gop_first_frame | open-GOP H.264 in MP4 | 16 | first displayed frame despite leading B-frames | [src/scenarios/decode-seek/index.ts:246-255](../../src/scenarios/decode-seek/index.ts#L246-L255) |
| decode_extreme_fps_1 | one-frame/s H.264 | 30 | sparse timestamps; SSIM ≥ 0.96 | [src/scenarios/decode-seek/index.ts:259-269](../../src/scenarios/decode-seek/index.ts#L259-L269) |
| decode_extreme_fps_240 | 240-frame/s H.264 | 240 | dense timestamps; SSIM ≥ 0.96 | [src/scenarios/decode-seek/index.ts:271-281](../../src/scenarios/decode-seek/index.ts#L271-L281) |

The scenario declarations distinguish [CFR](../glossary.md#cfr) extremes from the VFR clip, but the pixel oracle does not currently test candidate timestamps against reference timestamps: it pairs frames by array position. The separate monotonic-PTS and VFR-seek property rows supply some timing signal, but do not make **decode_vfr_timing** itself a true-PTS assertion. [src/core/oracles.ts:1811-1860](../../src/core/oracles.ts#L1811-L1860) [src/core/oracles.ts:3644-3680](../../src/core/oracles.ts#L3644-L3680) [src/core/oracles.ts:3683-3726](../../src/core/oracles.ts#L3683-L3726)

### Decode: still images, display semantics, and edge geometry

| Scenario | Input contract | Frames | Intended display property | Evidence |
| --- | --- | ---: | --- | --- |
| decode_image_jpeg | JPEG still image | 1 | browser-baked displayed pixels | [src/scenarios/decode-seek/index.ts:135-142](../../src/scenarios/decode-seek/index.ts#L135-L142) |
| decode_image_png | PNG still image | 1 | browser-baked displayed pixels | [src/scenarios/decode-seek/index.ts:144-151](../../src/scenarios/decode-seek/index.ts#L144-L151) |
| decode_image_webp | WebP still image | 1 | browser-baked displayed pixels | [src/scenarios/decode-seek/index.ts:153-160](../../src/scenarios/decode-seek/index.ts#L153-L160) |
| decode_rotated_display_matrix | rotated H.264 MP4 | 30 | requires **rotate**; compare displayed, dimension-swapped pixels | [src/scenarios/decode-seek/index.ts:201-212](../../src/scenarios/decode-seek/index.ts#L201-L212) |
| decode_multitrack_select_video | video plus two audio tracks | 30 | request the video track | [src/scenarios/decode-seek/index.ts:216-227](../../src/scenarios/decode-seek/index.ts#L216-L227) |
| decode_tiny_dims_1x1 | 1×1 VP9/WebM | 8 | legal minimum-dimension path | [src/scenarios/decode-seek/index.ts:285-292](../../src/scenarios/decode-seek/index.ts#L285-L292) |
| decode_tiny_dims_2x2_h264 | 2×2 H.264/MP4 | 8 | smallest honest yuv420p fixture; SSIM ≥ 0.97 | [src/scenarios/decode-seek/index.ts:294-305](../../src/scenarios/decode-seek/index.ts#L294-L305) |

Decoded pixels are normalized as tight, top-left, straight-alpha RGBA. The platform raster path uses VideoFrame display dimensions and falls back to canvas presentation when direct copy cannot represent crop/rotation. [src/engines/platform/raster.ts:1-8](../../src/engines/platform/raster.ts#L1-L8) [src/engines/platform/raster.ts:51-79](../../src/engines/platform/raster.ts#L51-L79)

The multi-track scenario stores **selectTrackType: video** in scenario options, but the runner forwards only **maxFrames** to adapters. The row therefore verifies whichever track an adapter selects by its own policy; it does not currently exercise an adapter track-selection parameter. [src/scenarios/decode-seek/index.ts:314-325](../../src/scenarios/decode-seek/index.ts#L314-L325) [src/core/runner.ts:811-815](../../src/core/runner.ts#L811-L815)

The alpha oracle reads candidate pixels, requires at least one non-opaque frame, and compares a dedicated alpha digest only if a golden frame exposes one of three optional alpha-digest fields. With no such field, a non-opaque plane is sufficient for [PASS](../glossary.md#pass). It also pairs candidate and golden entries by index. [src/core/oracles.ts:2160-2202](../../src/core/oracles.ts#L2160-L2202) [src/core/oracles.ts:2202-2254](../../src/core/oracles.ts#L2202-L2254)

### Decode throughput size ladder

These six additional decode scenarios reuse the same correctness and metric wiring. The source definitions carry **sizeBucket** and **heavyBake** annotations, but the mapping copies neither field into the resulting Scenario; only the asset, maximum frame count, requirements, tolerance, and notes survive. [src/scenarios/decode-seek/index.ts:348-359](../../src/scenarios/decode-seek/index.ts#L348-L359) [src/scenarios/decode-seek/index.ts:433-450](../../src/scenarios/decode-seek/index.ts#L433-L450)

| Scenario | Input | Frames | Declared source bucket | Evidence |
| --- | --- | ---: | --- | --- |
| decode_size_micro_h264_1frame | one-frame H.264 MP4 | 1 | micro; SSIM ≥ 0.96 | [src/scenarios/decode-seek/index.ts:363-373](../../src/scenarios/decode-seek/index.ts#L363-L373) |
| decode_size_tiny_h264_360p | 2 s 360p H.264 MP4 | 30 | tiny | [src/scenarios/decode-seek/index.ts:375-382](../../src/scenarios/decode-seek/index.ts#L375-L382) |
| decode_size_tiny_vp9_360p | 2 s 360p VP9 WebM | 30 | tiny; SSIM ≥ 0.96 | [src/scenarios/decode-seek/index.ts:384-394](../../src/scenarios/decode-seek/index.ts#L384-L394) |
| decode_size_large_h264_120s | 120 s 1080p H.264 MP4 | 60 | large; heavy bake | [src/scenarios/decode-seek/index.ts:396-406](../../src/scenarios/decode-seek/index.ts#L396-L406) |
| decode_size_large_vp9_120s | 120 s 1080p VP9 WebM | 60 | large; heavy bake | [src/scenarios/decode-seek/index.ts:408-418](../../src/scenarios/decode-seek/index.ts#L408-L418) |
| decode_size_huge_h264_600s | 600 s 1080p H.264 MOV | 60 | huge; heavy bake | [src/scenarios/decode-seek/index.ts:420-430](../../src/scenarios/decode-seek/index.ts#L420-L430) |

### Seek: codec, container, and landing matrix

Each seek scenario declares **seek-accuracy**, reports seekMs/wall/longtasks, and ranks on seekMs. The requested time, keyframe expectation, edge marker, and optional prior time are retained in scenario options. [src/scenarios/decode-seek/index.ts:647-670](../../src/scenarios/decode-seek/index.ts#L647-L670)

| Scenario | Target | Expected landing and tolerance | Evidence |
| --- | ---: | --- | --- |
| seek_h264_keyframe | 4.000 s | prior/at keyframe; exact | [src/scenarios/decode-seek/index.ts:474-482](../../src/scenarios/decode-seek/index.ts#L474-L482) |
| seek_h264_nonkeyframe | 7.333 s | nearest real PTS; ±100 ms | [src/scenarios/decode-seek/index.ts:484-493](../../src/scenarios/decode-seek/index.ts#L484-L493) |
| seek_bframes_midgop | 3.500 s | reordered real PTS; ±100 ms | [src/scenarios/decode-seek/index.ts:495-503](../../src/scenarios/decode-seek/index.ts#L495-L503) |
| seek_vfr_arbitrary | 4.250 s | nearest uneven real PTS; ±250 ms | [src/scenarios/decode-seek/index.ts:505-514](../../src/scenarios/decode-seek/index.ts#L505-L514) |
| seek_vp9_keyframe | 4.000 s | WebM keyframe; exact | [src/scenarios/decode-seek/index.ts:516-524](../../src/scenarios/decode-seek/index.ts#L516-L524) |
| seek_hevc_keyframe | 4.000 s | HEVC keyframe; exact | [src/scenarios/decode-seek/index.ts:528-538](../../src/scenarios/decode-seek/index.ts#L528-L538) |
| seek_av1_keyframe | 2.000 s | AV1 keyframe; exact | [src/scenarios/decode-seek/index.ts:540-548](../../src/scenarios/decode-seek/index.ts#L540-L548) |
| seek_vp8_keyframe | 4.003 s | actual VP8 keyframe; ±50 ms | [src/scenarios/decode-seek/index.ts:550-558](../../src/scenarios/decode-seek/index.ts#L550-L558) |
| seek_mkv_h264_keyframe | 4.000 s | Matroska keyframe; exact | [src/scenarios/decode-seek/index.ts:560-570](../../src/scenarios/decode-seek/index.ts#L560-L570) |

The seek oracle is timestamp-based, not pixel-based. It resolves keyframe expectations to the last golden keyframe at or before the target and arbitrary expectations to the nearest golden video packet PTS, with frame PTS fallback when packet evidence is absent. It then compares the adapter’s **landedPtsUs** to that expected PTS using the scenario tolerance. [src/core/oracles.ts:2269-2304](../../src/core/oracles.ts#L2269-L2304) [src/core/oracles.ts:2306-2358](../../src/core/oracles.ts#L2306-L2358)

### Seek: operation edges

| Scenario | Requested sequence | Declared acceptance | Runtime reality | Evidence |
| --- | --- | --- | --- | --- |
| seek_past_eof | one seek to 300 s on a 30 s source | final decodable region; ±2 s | one adapter call | [src/scenarios/decode-seek/index.ts:574-588](../../src/scenarios/decode-seek/index.ts#L574-L588) |
| seek_negative | one seek to −5 s | clamp to first frame; exact | one adapter call | [src/scenarios/decode-seek/index.ts:590-602](../../src/scenarios/decode-seek/index.ts#L590-L602) |
| seek_zero | one seek to 0 | first frame; exact | one adapter call | [src/scenarios/decode-seek/index.ts:604-613](../../src/scenarios/decode-seek/index.ts#L604-L613) |
| seek_repeated_same_target | 4 s, then 4 s again | identical landing | only the final target is represented; one adapter call | [src/scenarios/decode-seek/index.ts:615-627](../../src/scenarios/decode-seek/index.ts#L615-L627) |
| seek_backward_then_forward | 8 s, then back to 2 s | reset state and land exactly at 2 s | **priorSeekUs** is stored but not executed; one adapter call to 2 s | [src/scenarios/decode-seek/index.ts:629-644](../../src/scenarios/decode-seek/index.ts#L629-L644) |

The mismatch in the last two rows is in runner dispatch: it reads only **tUs** and calls **engine.seek** exactly once, ignoring **seekEdge** and **priorSeekUs**. Their names and notes currently overstate the behavior under test. [src/core/runner.ts:816-817](../../src/core/runner.ts#L816-L817)

### Property scenarios

| Scenario | Operation | Implemented property evaluator | Evidence |
| --- | --- | --- | --- |
| meta_decode_remux_eq_decode_anchored | remux MP4→MKV | platform-decode remux output and compare with source frame golden | [src/scenarios/decode-seek/index.ts:701-715](../../src/scenarios/decode-seek/index.ts#L701-L715) [src/core/oracles.ts:2774-2794](../../src/core/oracles.ts#L2774-L2794) |
| meta_seek_vs_linear_decode | seek to 4 s | compare landed PTS with golden-derived linear-decode PTS | [src/scenarios/decode-seek/index.ts:717-729](../../src/scenarios/decode-seek/index.ts#L717-L729) [src/core/oracles.ts:3613-3641](../../src/core/oracles.ts#L3613-L3641) |
| meta_pts_monotonic_after_reorder | decode B-frame clip | require every successive FrameDigest PTS to increase strictly | [src/scenarios/decode-seek/index.ts:731-743](../../src/scenarios/decode-seek/index.ts#L731-L743) [src/core/oracles.ts:3644-3680](../../src/core/oracles.ts#L3644-L3680) |
| meta_vfr_seek_lands_on_true_pts | seek VFR clip at 4.25 s | require proximity to the nearest golden packet PTS and to some real packet PTS | [src/scenarios/decode-seek/index.ts:745-758](../../src/scenarios/decode-seek/index.ts#L745-L758) [src/core/oracles.ts:3683-3726](../../src/core/oracles.ts#L3683-L3726) |

The property dispatcher recognizes these tokens before its generic decode/remux branches. The remux property is not wholly self-derived: it treats the platform-decoded output and committed source frame golden as the two sides. [src/core/oracles.ts:2710-2752](../../src/core/oracles.ts#L2710-L2752) [src/core/oracles.ts:2774-2794](../../src/core/oracles.ts#L2774-L2794)

### Candidate adapters and neutral reference decode

The six scored engine adapters do not implement identical strategies:

| Engine | Decode and seek behavior in this family | Declared boundary | Evidence |
| --- | --- | --- | --- |
| [aibrush-media](../engines/aibrush-media.md) | normalizes decoded samples and reports actual selected frame PTS; negative seek is clamped | declares decode, seek, video codecs, and JPEG/PNG/WebP inputs; translates known runtime capability failures to NotApplicableError | [src/engines/aibrush-media/adapter.ts:92-159](../../src/engines/aibrush-media/adapter.ts#L92-L159) [src/engines/aibrush-media/adapter.ts:3752-3801](../../src/engines/aibrush-media/adapter.ts#L3752-L3801) [src/engines/aibrush-media/adapter.ts:4207-4291](../../src/engines/aibrush-media/adapter.ts#L4207-L4291) |
| [ffmpeg.wasm](../engines/ffmpeg-wasm.md) | decodes raw RGBA, but derives each PTS as index divided by a probed nominal fps; seek reports the requested/clamped target rather than an observed decoded-frame PTS | declares decode and seek over its supported token lists | [src/engines/ffmpeg-wasm/adapter.ts:1452-1477](../../src/engines/ffmpeg-wasm/adapter.ts#L1452-L1477) [src/engines/ffmpeg-wasm/adapter.ts:2649-2731](../../src/engines/ffmpeg-wasm/adapter.ts#L2649-L2731) [src/engines/ffmpeg-wasm/adapter.ts:2739-2770](../../src/engines/ffmpeg-wasm/adapter.ts#L2739-L2770) |
| [mediabunny](../engines/mediabunny.md) | iterates VideoSampleSink samples in presentation order; seek asks for the sample at the target and returns its microsecond timestamp | declares decode/seek for MP4/MOV/MKV/WebM and its codec list | [src/engines/mediabunny/adapter.ts:1029-1111](../../src/engines/mediabunny/adapter.ts#L1029-L1111) [src/engines/mediabunny/adapter.ts:1333-1445](../../src/engines/mediabunny/adapter.ts#L1333-L1445) |
| [Remotion](../engines/remotion.md) | the composite delegates decode/seek to its WebCodecs adapter, which decodes parsed samples, sorts PTS, and seeks from a keyframe while retaining the last PTS at/before target | the media-parser half is probe/demux oriented; decode/seek use remotion-webcodecs | [src/engines/remotion/adapter.ts:125-135](../../src/engines/remotion/adapter.ts#L125-L135) [src/engines/remotion-webcodecs/adapter.ts:605-791](../../src/engines/remotion-webcodecs/adapter.ts#L605-L791) [src/engines/remotion-media-parser/adapter.ts:500-523](../../src/engines/remotion-media-parser/adapter.ts#L500-L523) |
| [web-demuxer](../engines/web-demuxer.md) | feeds demuxed chunks to VideoDecoder, sorts frames by PTS, and decodes forward from a backward packet cursor for seek | declares **webcodecs:independent** but runtime config rejection throws ordinary Error | [src/engines/web-demuxer/adapter.ts:618-665](../../src/engines/web-demuxer/adapter.ts#L618-L665) [src/engines/web-demuxer/adapter.ts:831-947](../../src/engines/web-demuxer/adapter.ts#L831-L947) [src/engines/web-demuxer/adapter.ts:949-1041](../../src/engines/web-demuxer/adapter.ts#L949-L1041) |
| [MP4Box](../engines/mp4box.md) | no pixel decoder and no seek implementation | explicitly declares both operations false; stub methods throw | [src/engines/mp4box/adapter.ts:630-681](../../src/engines/mp4box/adapter.ts#L630-L681) [src/engines/mp4box/adapter.ts:946-960](../../src/engines/mp4box/adapter.ts#L946-L960) |

The unscored platform instrument is the neutral [reference decode](../glossary.md#reference-decode), not a seventh competing engine. It demuxes supported MP4/WebM bytes and feeds timestamped chunks to [WebCodecs](../glossary.md#webcodecs), with page-only video-element fallback; decoded frames are sorted by PTS. Its registration excludes it from scored engine listings. [src/engines/platform/oracle-helpers.ts:108-165](../../src/engines/platform/oracle-helpers.ts#L108-L165) [src/engines/platform/decode.ts:85-223](../../src/engines/platform/decode.ts#L85-L223) [src/engines/platform/adapter.ts:521-528](../../src/engines/platform/adapter.ts#L521-L528) [src/core/registry.ts:63-70](../../src/core/registry.ts#L63-L70)

When **ssim-psnr** has no committed frame golden or a scenario requests a transform reference, it decodes the source through that platform path and compares up to eight source/candidate frame pairs. This is fair by design because the candidate is not judged by another scored framework. The present implementation pairs by array index, however, and a failure to decode either the candidate output or source reference is emitted as the same boolean [FAIL](../glossary.md#fail) as a real visual mismatch. [src/core/oracles.ts:1758-1809](../../src/core/oracles.ts#L1758-L1809) [src/core/oracles.ts:1905-1995](../../src/core/oracles.ts#L1905-L1995)

### Measurement behavior

Decode rows declare **decodeFps** and **timeToFirstFrame**. Bench iterations set decodedFrames and frames from the returned sink, so decodeFps is populated. They never set **MeasureContext.firstFrameMs**, so Meter cannot emit timeToFirstFrameMs and the aggregator records an empty summary with **n = 0** and zero-valued statistics. [src/scenarios/decode-seek/index.ts:308-312](../../src/scenarios/decode-seek/index.ts#L308-L312) [src/core/runner.ts:1675-1681](../../src/core/runner.ts#L1675-L1681) [src/core/measure.ts:13-28](../../src/core/measure.ts#L13-L28) [src/core/measure.ts:77-102](../../src/core/measure.ts#L77-L102) [src/core/bench.ts:127-151](../../src/core/bench.ts#L127-L151)

Seek bench iterations set **seeks = 1**, making seekMs the full wall time of the one adapter invocation. It does not measure a multi-step repeated/backward sequence, even where scenario metadata describes one. [src/core/runner.ts:1674-1679](../../src/core/runner.ts#L1674-L1679) [src/core/measure.ts:96-101](../../src/core/measure.ts#L96-L101)

## Contracts and invariants

- A decoded frame sequence is represented by indexed FrameDigest entries with microsecond **ptsUs**, dimensions, and an RGBA digest; pixel-bearing sinks may expose **getPixels(index)**. This makes displayed pixels and presentation time observable without standardizing an adapter’s internal frame object. [src/core/engine.ts:76-94](../../src/core/engine.ts#L76-L94)

- A seek adapter returns **landedPtsUs** and the landed frame. Correctness is defined against observed landing time, not merely successful completion. [src/core/engine.ts:196-221](../../src/core/engine.ts#L196-L221) [src/core/oracles.ts:2269-2304](../../src/core/oracles.ts#L2269-L2304)

- General decode rows require a complete browser-baked frame/SSIM artifact before capability negotiation; missing or pending evidence yields **NA_ASSET**, not an unverified PASS. The browser baker fills only PTS-matched frames and keeps partial output pending. [src/core/runner.ts:1324-1329](../../src/core/runner.ts#L1324-L1329) [src/core/frame-bake.ts:15-24](../../src/core/frame-bake.ts#L15-L24) [src/core/frame-bake.ts:111-124](../../src/core/frame-bake.ts#L111-L124)

- B-frame correctness requires strictly increasing presentation timestamps after adapter reordering. One dedicated property oracle enforces this directly; normal ssim-psnr rows only inherit adapter ordering and compare by array index. [src/core/oracles.ts:1811-1836](../../src/core/oracles.ts#L1811-L1836) [src/core/oracles.ts:3644-3680](../../src/core/oracles.ts#L3644-L3680)

- A keyframe seek expects the last known keyframe at or before the requested time; an arbitrary seek expects the nearest known real packet PTS. The scenario’s **seekToleranceUs** is the only landing band. [src/core/oracles.ts:2282-2304](../../src/core/oracles.ts#L2282-L2304) [src/core/oracles.ts:2306-2358](../../src/core/oracles.ts#L2306-L2358)

- Visual comparison is in normalized displayed RGBA, so rotation, crop, display size, and alpha normalization are part of the observable result rather than metadata-only details. [src/engines/platform/raster.ts:1-8](../../src/engines/platform/raster.ts#L1-L8) [src/engines/platform/raster.ts:51-79](../../src/engines/platform/raster.ts#L51-L79)

- The current [capability gate](../glossary.md#capability-gate) intersects operation, container, codec, feature, and representative browser-support tokens independently. The browser video probe uses representative 1920×1080 configurations rather than the concrete asset profile, level, bit depth, dimensions, and decoder description tuple. [src/core/runner.ts:112-189](../../src/core/runner.ts#L112-L189) [src/core/feature-detect.ts:319-353](../../src/core/feature-detect.ts#L319-L353)

- Functional oracles gate performance: a real oracle failure prevents benchmark execution. A timed-out benchmark after correctness succeeds preserves PASS without a number. [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463)

- Current oracle outcomes are boolean and ResultStatus contains PASS/FAIL plus NA/ERROR/SKIPPED states; [DIFF](../glossary.md#diff) is not representable. Thus a legal but different representation and a truly wrong result can collapse into the same FAIL. [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221)

- Adapters must release framework/browser frame resources after extraction. The platform implementation closes VideoFrame objects after hashing/raster access, matching WebCodecs’ resource-lifetime requirement. [src/engines/platform/decode.ts:165-223](../../src/engines/platform/decode.ts#L165-L223)

## Target design and known gaps

### Target design

Every item in this subsection is a required end state and is **not implemented**.

1. **Not implemented — timestamp-aware frame matching.** Represent every candidate and reference frame by its PTS and presentation interval, sort by PTS, and match by interval overlap or nearest PTS within **max(1 ms, half of the shorter adjacent frame interval)**. Use a deterministic earlier-PTS tie break. Compare pixels only after temporal matching; report unmatched leading, interior, and trailing frames separately. The model follows Media Source Extensions’ definitions of a coded frame, presentation interval, PTS, and presentation order, rather than assuming equal array indexes ([W3C Media Source Extensions 2, definitions](https://www.w3.org/TR/media-source-2/#definitions)). Acceptance: a fixture whose candidate inserts or drops one frame must not shift every subsequent comparison, and a legal fps-changing scenario must pair frames by the requested output timeline.

2. **Not implemented — separate reference applicability from candidate correctness.** Preserve the neutral browser WebCodecs source decode, because it is deliberately unscored and independent. Add a structured **reference unavailable/undecodable** outcome: inability of the browser reference path to configure or decode the source becomes **NA_BROWSER** or **NA_ASSET** as appropriate; inability to decode bytes that the scenario requires to be browser-playable remains FAIL; inability to browser-decode otherwise valid output becomes DIFF or NA for that oracle and must be corroborated by reference re-import. WebCodecs makes support explicitly configuration-dependent through **isConfigSupported** ([W3C WebCodecs, VideoDecoder interface and configuration support](https://w3c.github.io/webcodecs/#videodecoder-interface)). Acceptance: the result record distinguishes “candidate pixels differ,” “candidate output invalid,” and “reference decoder cannot evaluate this valid output.”

3. **Not implemented — three-way oracle verdicts.** Decode/seek oracles emit **PASS**, **DIFF**, or **FAIL**. PASS means the semantic/timing/display contract is satisfied after documented tolerance; DIFF means a valid representation differs from the ffmpeg-baked golden; FAIL means wrong pixels, invalid required output, lost frames, non-monotonic presentation time, or landing outside tolerance. The family must propagate all three through cell/report status. For AVC, for example, **avc1/avc3** and Annex B versus length-prefixed access units are legal alternative representations, and parameter sets may be out-of-band or in-band ([W3C AVC WebCodecs Registration, sections 1–4](https://w3c.github.io/webcodecs/avc_codec_registration.html)). Acceptance: a valid alias/framing-only difference produces DIFF while a corrupted frame produces FAIL.

4. **Not implemented — execute stateful seek sequences.** Extend family execution to issue the declared sequence on the same initialized adapter instance: 4 s twice for repeated seek and 8 s then 2 s for backward seek. Store both landings and per-step latency. The final landing still uses seek-accuracy; repeated seek additionally requires equal PTS and frame identity, while backward seek requires a fresh 2 s frame with no stale 8 s state. Exact seeking commonly requires starting from an earlier random-access point and decoding forward; FFmpeg documents this distinction explicitly ([FFmpeg documentation, -ss accurate seek](https://www.ffmpeg.org/ffmpeg-all.html#Main-options)). Acceptance: a deliberately stateful adapter that returns its previous frame on the second call fails both edge rows.

5. **Not implemented — require observed seek timestamps.** Adapters return the selected decoded sample’s actual PTS, never the requested time copied into **landedPtsUs**. A seek algorithm may choose a prior random-access point and decode to the target; Media Source Extensions defines a random-access point as where decoding can begin without previous data ([W3C Media Source Extensions 2, random access point](https://www.w3.org/TR/media-source-2/#random-access-point)). Mediabunny’s corresponding framework contract is concrete: **getSample(timestamp)** returns the last presentation-order sample whose start is at or before the timestamp ([Mediabunny VideoSampleSink](https://mediabunny.dev/api/VideoSampleSink)). Acceptance: a target between frames records one real sample PTS from the demux table; copying the target fails the VFR true-PTS property.

6. **Not implemented — semantic VFR, NTSC, and metadata timing.** Golden metadata must canonicalize codec aliases (**avc1/avc3→h264**, **hev1/hvc1→hevc**, **V_MPEG4/ISO/AVC→h264**, **mp4a→aac**), match tracks by type before ordinal position, band VFR and [NTSC rate](../glossary.md#ntsc-rate) values, and widen duration for [edit lists](../glossary.md#edit-list), [priming](../glossary.md#priming), and [timebase](../glossary.md#timebase) rounding. The shared comparator must also accept [HE-AAC/SBR](../glossary.md#he-aacsbr) core rate versus 2× reconstructed output rate and [Parametric Stereo](../glossary.md#parametric-stereo) mono-core versus stereo-output views; ETSI describes both transformations explicitly ([ETSI TS 102 005 V1.2.1, Annex A](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf)). Compare a VFR timeline using frame/packet intervals instead of treating one scalar fps as exact. ISO BMFF explicitly maps media composition time to movie presentation time through **edts/elst** ([W3C ISO BMFF Byte Stream Format, initialization segments](https://w3c.github.io/mse-byte-stream-format-isobmff/#init-segments)), and broadcast-family rates include rational 30000/1001 rather than an integer 30 ([ITU-T H.262 Amendment 1](https://www.itu.int/rec/dologin_pub.asp?id=T-REC-H.262-200011-S%21Amd1%21PDF-E&lang=e&type=items)). Acceptance: codec aliases and equivalent timeline/audio-core reports do not FAIL; a VFR adapter that fabricates a nominal grid does.

7. **Not implemented — tuple-aware applicability.** Negotiate operation × container × codec × profile/level/bit depth × dimensions × decoder configuration × options, then require all adapters—including Mediabunny, Remotion, Remotion Media Parser, and web-demuxer—to throw NotApplicableError when a runtime combination falls outside their implementation. Map that to **NA_ENGINE**; reserve **NA_BROWSER** for an actual browser configuration rejection and ERROR for harness defects. WebCodecs exposes per-configuration support rather than a global codec guarantee ([W3C WebCodecs, check configuration support](https://w3c.github.io/webcodecs/#check-configuration-support)). Acceptance: unsupported HEVC/10-bit/4K tuples and framework/runtime configuration rejection never leak into FAIL or ERROR, reducing the disabled-cell list.

8. **Not implemented — first-frame and size measurements with provenance.** Add an adapter/runner callback at the first decoded frame, record time relative to Meter.begin, and reject a timeToFirstFrame summary with **n = 0**. Preserve size bucket, actual input bytes, resolution, codec, and heavy-bake provenance in the scenario/result so curves are grouped by a real axis rather than scenario naming. Acceptance: every eligible decode cell has finite decodeFps and timeToFirstFrame samples, and a report can plot actual bytes/resolution without parsing IDs.

9. **Not implemented — enforce requested track selection.** Add normalized track selectors to DecodeOptions and forward them unchanged. The multi-track row must identify the selected video track in its result and prove that an intentionally selected alternate track can be decoded. Acceptance: an adapter hard-coded to the first video track fails a fixture whose requested video track is not first.

10. **Not implemented — complete display evidence.** Rotation rows compare display-space dimensions and pixels after applying crop/rotation/flip; alpha rows bake and compare dedicated alpha-plane evidence at timestamp-matched frames; still-image rows negotiate ImageDecoder MIME support separately from VideoDecoder. WebCodecs defines frame rotation/flip/display dimensions and alpha metadata, while ImageDecoder has its own support surface ([W3C WebCodecs, VideoFrame](https://w3c.github.io/webcodecs/#videoframe-interface), [ImageDecoder](https://w3c.github.io/webcodecs/#image-decoder-interface)); Matroska’s VP9 mapping identifies BlockAdditions as the alpha side-data carrier ([Matroska Codec Mappings, VP9](https://www.matroska.org/technical/codec_specs.html#v_vp9)). Acceptance: metadata-only dimension swapping, opaque VP9 output, wrong alpha at one timestamp, or absent still-image support cannot pass.

11. **Not implemented — semantic packet evidence for seeking.** Seek may use golden packet PTS and random-access markers, but byte-exact packet size, keyframe placement, or grouping must remain representation diagnostics. [Annex B](../glossary.md#annex-b) versus [AVCC](../glossary.md#avcc), inline SPS/PPS, and legal NAL aggregation can change bytes and grouping without changing decodability; the AVC registration defines access-unit payloads and both configuration forms ([W3C AVC WebCodecs Registration, sections 2–4](https://w3c.github.io/webcodecs/avc_codec_registration.html)). HEVC has the analogous hvcC/length-prefix versus Annex B distinction ([W3C HEVC WebCodecs Registration, sections 2–4](https://w3c.github.io/webcodecs/hevc_codec_registration.html)). Acceptance: the same decoded timeline expressed with length-prefixed NAL units or Annex B start codes yields PASS or DIFF, never FAIL solely for packet size/grouping, while a missing random-access dependency or wrong PTS fails seek semantics.

### Known gaps

#### Frame pairing is positional

**Current.** Both golden-backed ssim-psnr and neutral source-reference comparison iterate **candidate[i] ↔ reference[i]**; alpha does the same. [src/core/oracles.ts:1811-1860](../../src/core/oracles.ts#L1811-L1860) [src/core/oracles.ts:1933-1979](../../src/core/oracles.ts#L1933-L1979) [src/core/oracles.ts:2195-2228](../../src/core/oracles.ts#L2195-L2228)

**Consequence.** A legitimate fps/frame-count transform, a dropped/duplicated leading frame, or unequal decoder flush behavior shifts all later comparisons and can create a false FAIL unrelated to visual quality. Conversely, **decode_vfr_timing** can pass visually while reporting fabricated timestamps.

**Target.** Match presentation intervals by PTS, as defined by [Media Source Extensions](https://www.w3.org/TR/media-source-2/#presentation-interval), before computing pixel similarity.

**Verification.** Add a controlled duplicate/drop fixture and a VFR fixture with identical images at irregular PTS; assert localized unmatched-frame diagnostics and correct timestamp pairing.

#### Reference decode failure is conflated with wrong output

**Current.** Any platform decode exception, null sink, zero frames, source decode failure, or missing pixels returns boolean FAIL from ssim-psnr. [src/core/oracles.ts:1776-1808](../../src/core/oracles.ts#L1776-L1808) [src/core/oracles.ts:1919-1945](../../src/core/oracles.ts#L1919-L1945)

**Consequence.** A valid output that this browser cannot decode is indistinguishable from corrupt output. This is one named source of current false failures even though source-reference WebCodecs decode is neutral and fair by design.

**Target.** Classify reference applicability with actual **isConfigSupported** evidence and use independent structural re-import before deciding FAIL, following [WebCodecs configuration support](https://w3c.github.io/webcodecs/#dom-videodecoder-isconfigsupported).

**Verification.** Feed a structurally valid codec/profile unavailable to the current browser and a corrupted file; the former routes to NA_BROWSER or DIFF, the latter to FAIL.

#### FFmpeg frame and seek timestamps are synthesized

**Current.** The ffmpeg.wasm decoder computes PTS as frame index divided by a probed fps, and its seek result labels the extracted frame with the requested/clamped target time. [src/engines/ffmpeg-wasm/adapter.ts:2690-2718](../../src/engines/ffmpeg-wasm/adapter.ts#L2690-L2718) [src/engines/ffmpeg-wasm/adapter.ts:2739-2770](../../src/engines/ffmpeg-wasm/adapter.ts#L2739-L2770)

**Consequence.** VFR decode becomes a nominal CFR grid and VFR seek can appear accurate without observing the selected sample. The VFR property catches some seek cases but normal pixel rows do not catch synthesized PTS.

**Target.** Export per-frame timestamps from ffmpeg and report the chosen decoded frame. FFmpeg’s own documentation distinguishes timestamp-preserving VFR behavior from frame-rate conversion and documents accurate seeking through decode/discard ([FFmpeg documentation](https://www.ffmpeg.org/ffmpeg-all.html#Main-options)).

**Verification.** Compare every returned PTS against fixture packet/frame PTS; no synthetic-grid point may pass unless it is a real timestamp.

#### Repeated and backward seek rows do not execute their sequence

**Current.** Scenario options retain **seekEdge** and **priorSeekUs**, but executeOp calls seek once with only **tUs**. [src/scenarios/decode-seek/index.ts:647-657](../../src/scenarios/decode-seek/index.ts#L647-L657) [src/core/runner.ts:816-817](../../src/core/runner.ts#L816-L817)

**Consequence.** Idempotency, decoder reset, and stale-reference behavior are untested while row names imply coverage.

**Target.** Execute and record each step on one adapter instance; seeking precisely versus snapping to a nearby fast point is an explicit distinction in the [HTML Standard seeking API](https://html.spec.whatwg.org/multipage/media.html#seeking).

**Verification.** Instrument an adapter with call count and intentional stale state; require two calls and fail on stale second landing.

#### Platform video-element seek reports playback position, not decoded sample PTS

**Current.** The fallback assigns **currentTime**, waits for **seeked**, and returns that value as landedPtsUs. [src/engines/platform/decode.ts:310-338](../../src/engines/platform/decode.ts#L310-L338) [src/engines/platform/decode.ts:410-445](../../src/engines/platform/decode.ts#L410-L445)

**Consequence.** That path cannot prove the timestamp of the rasterized frame and should not be used as exact VFR/keyframe evidence.

**Target.** Use demuxed sample PTS or frame-callback media time; the [HTML Standard](https://html.spec.whatwg.org/multipage/media.html#seeking) defines currentTime seeking behavior but does not make currentTime a decoded sample identifier.

**Verification.** On a sparse VFR fixture, assert returned landings are members of the real sample-PTS set.

#### Capability negotiation is coarser than decode reality

**Current.** The runner tests independent capability tokens and representative 1080p browser configs. web-demuxer declares **webcodecs:independent**, then throws ordinary Error when its concrete VideoDecoder config is unsupported. [src/core/runner.ts:112-189](../../src/core/runner.ts#L112-L189) [src/core/feature-detect.ts:333-353](../../src/core/feature-detect.ts#L333-L353) [src/engines/web-demuxer/adapter.ts:848-858](../../src/engines/web-demuxer/adapter.ts#L848-L858) [src/engines/web-demuxer/adapter.ts:957-967](../../src/engines/web-demuxer/adapter.ts#L957-L967)

**Consequence.** Unsupported profile/dimension/container combinations can leak through to FAIL or ERROR, inflating defects and encouraging a hand-maintained disabled-cell list.

**Target.** Probe the actual configuration where browser decoding is used and translate adapter/framework “cannot do this tuple” signals into NotApplicableError, consistent with [WebCodecs per-configuration support](https://w3c.github.io/webcodecs/#check-configuration-support).

**Verification.** Run a matrix with known unsupported HEVC, 10-bit, alpha, and 4K tuples; every ordinary unsupported tuple is NA_ENGINE or NA_BROWSER, never ERROR.

#### Metadata tolerance does not model semantic timing

**Current.** golden-metadata compares filtered track arrays positionally, compares codec strings literally, uses a single scalar fps tolerance, and requires exact sample rate/channel values; duration has only explicit/container heuristic bands. By contrast, reference re-import already canonicalizes known codec tokens before comparison. [src/core/oracles.ts:736-779](../../src/core/oracles.ts#L736-L779) [src/core/oracles.ts:785-811](../../src/core/oracles.ts#L785-L811) [src/core/oracles.ts:350-375](../../src/core/oracles.ts#L350-L375) [src/core/box-readers.ts:52-95](../../src/core/box-readers.ts#L52-L95)

**Consequence.** Alias, VFR/NTSC rounding, edit-list/timebase, and audio priming views can be reported as wrong even when the presentation is equivalent. Decode/seek depends on that timing evidence when deriving expected PTS and duration.

**Target.** Apply the semantic canonicalization and tolerance design above, including HE-AAC/SBR 1×/2× rate and Parametric Stereo 1/2-channel equivalence. ISO BMFF explicitly carries presentation timing and structure ([ISO/IEC 14496-12:2026 catalogue](https://www.iso.org/standard/85596.html)), its edit-list mapping is required by the [W3C ISO BMFF byte-stream format](https://w3c.github.io/mse-byte-stream-format-isobmff/#init-segments), and [ETSI TS 102 005 Annex A](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf) specifies the SBR/Parametric Stereo output views.

**Verification.** Add paired goldens exposing alias codecs, 30000/1001 versus rounded fps, edit-list offsets, and timebase rounding; equivalent pairs PASS or DIFF while actual track/timeline loss FAILs.

#### Track selection and size annotations are declarative only

**Current.** Decode mapping writes **selectTrackType**, while runner dispatch drops it. Size-case source objects hold bucket/heavy-bake fields, while scenario mapping drops them. [src/scenarios/decode-seek/index.ts:314-325](../../src/scenarios/decode-seek/index.ts#L314-L325) [src/core/runner.ts:811-815](../../src/core/runner.ts#L811-L815) [src/scenarios/decode-seek/index.ts:348-359](../../src/scenarios/decode-seek/index.ts#L348-L359) [src/scenarios/decode-seek/index.ts:433-450](../../src/scenarios/decode-seek/index.ts#L433-L450)

**Consequence.** The named multi-track contract is not exercised, and size-curve grouping depends on IDs/notes rather than structured data.

**Target.** Make both fields part of normalized scenario/result contracts and adapter calls.

**Verification.** Select a non-first video track and generate size plots solely from structured fields.

#### timeToFirstFrame is declared but unmeasured

**Current.** The metric is registered, but runner bench context never sets **firstFrameMs**; empty aggregation returns n=0 and zeros. [src/scenarios/decode-seek/index.ts:308-312](../../src/scenarios/decode-seek/index.ts#L308-L312) [src/core/runner.ts:1675-1681](../../src/core/runner.ts#L1675-L1681) [src/core/measure.ts:96-102](../../src/core/measure.ts#L96-L102) [src/core/bench.ts:127-151](../../src/core/bench.ts#L127-L151)

**Consequence.** A zero-looking latency summary can be mistaken for excellent performance although no sample exists.

**Target.** Record first-frame delivery at the frame sink boundary and render n=0 as unavailable, never zero.

**Verification.** Every eligible decode bench produces one finite marker per measured iteration; a missing marker fails metric validation.

#### Alpha can pass on presence alone

**Current.** If no dedicated golden alpha digest exists, alpha-plane passes when any readable candidate frame is non-opaque. [src/core/oracles.ts:2214-2254](../../src/core/oracles.ts#L2214-L2254)

**Consequence.** Wrong alpha values, timing, or placement can pass.

**Target.** Bake timestamp-keyed alpha-plane signatures and compare them after temporal matching. WebCodecs carries explicit alpha-side data and frame alpha semantics ([W3C WebCodecs, EncodedVideoChunkMetadata](https://w3c.github.io/webcodecs/#encodedvideochunkmetadata)).

**Verification.** Perturb alpha values or shift the alpha stream by one frame while preserving non-opacity; both mutations fail.

#### Binary verdicts cannot preserve representation signal

**Current.** OracleOutcome has **pass: boolean** and ResultStatus has no DIFF. [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221)

**Consequence.** Valid representation differences can be reported as FAIL; downstream cleanup cannot distinguish normalization needs from true media defects.

**Target.** Adopt PASS/DIFF/FAIL and retain per-oracle diagnostic evidence. AVC’s legal **avc1/avc3** and in-band/out-of-band parameter-set forms demonstrate why byte representation is not semantic identity ([W3C AVC WebCodecs Registration](https://w3c.github.io/webcodecs/avc_codec_registration.html)).

**Verification.** Run alias/framing-equivalent and corrupted samples side by side; require DIFF and FAIL respectively.

## Sources

### Repository evidence

- [src/scenarios/decode-seek/index.ts:56-337](../../src/scenarios/decode-seek/index.ts#L56-L337) — all 22 general decode declarations and their scenario mapping.
- [src/scenarios/decode-seek/index.ts:348-450](../../src/scenarios/decode-seek/index.ts#L348-L450) — all six size-ladder declarations and mapping.
- [src/scenarios/decode-seek/index.ts:454-671](../../src/scenarios/decode-seek/index.ts#L454-L671) — all 14 seek declarations, tolerances, options, and metric wiring.
- [src/scenarios/decode-seek/index.ts:683-785](../../src/scenarios/decode-seek/index.ts#L683-L785) — four property declarations and complete family export.
- [src/core/runner.ts:112-189](../../src/core/runner.ts#L112-L189) — independent-token capability negotiation.
- [src/core/runner.ts:794-817](../../src/core/runner.ts#L794-L817) — decode/seek adapter dispatch and dropped family options.
- [src/core/runner.ts:1324-1468](../../src/core/runner.ts#L1324-L1468) — golden preflight, negotiation, oracle gating, status mapping, and benchmark ordering.
- [src/core/runner.ts:1637-1710](../../src/core/runner.ts#L1637-L1710) — benchmark context construction.
- [src/core/oracles.ts:719-825](../../src/core/oracles.ts#L719-L825) — current golden-metadata comparison.
- [src/core/oracles.ts:1758-1995](../../src/core/oracles.ts#L1758-L1995) — ssim-psnr golden and neutral source-reference branches.
- [src/core/oracles.ts:2160-2254](../../src/core/oracles.ts#L2160-L2254) — alpha-plane behavior and optional alpha digests.
- [src/core/oracles.ts:2269-2358](../../src/core/oracles.ts#L2269-L2358) — seek-accuracy and expected-PTS resolution.
- [src/core/oracles.ts:2708-2795](../../src/core/oracles.ts#L2708-L2795) — property-invariant dispatch and remux/decode comparison.
- [src/core/oracles.ts:3613-3726](../../src/core/oracles.ts#L3613-L3726) — seek-vs-linear, monotonic-PTS, and VFR true-PTS evaluators.
- [src/core/box-readers.ts:52-95](../../src/core/box-readers.ts#L52-L95) — codec alias canonicalization already used by reference re-import.
- [src/core/engine.ts:76-94](../../src/core/engine.ts#L76-L94) and [src/core/engine.ts:196-221](../../src/core/engine.ts#L196-L221) — normalized frame sink and seek result.
- [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221) — current binary oracle and result status model.
- [src/core/frame-bake.ts:1-35](../../src/core/frame-bake.ts#L1-L35) — browser frame-bake provenance and index-pairing contract.
- [src/core/frame-bake.ts:111-124](../../src/core/frame-bake.ts#L111-L124) — bake-time PTS honesty gate.
- [src/core/feature-detect.ts:319-399](../../src/core/feature-detect.ts#L319-L399) — representative WebCodecs support probes.
- [src/core/measure.ts:13-28](../../src/core/measure.ts#L13-L28) — optional first-frame marker.
- [src/core/measure.ts:77-102](../../src/core/measure.ts#L77-L102) — derived decodeFps, seekMs, and first-frame metric.
- [src/core/bench.ts:127-151](../../src/core/bench.ts#L127-L151) — n=0 summary behavior.
- [src/engines/platform/oracle-helpers.ts:108-165](../../src/engines/platform/oracle-helpers.ts#L108-L165) — neutral platform decode routing.
- [src/engines/platform/decode.ts:85-223](../../src/engines/platform/decode.ts#L85-L223) — inline WebCodecs decode, timestamps, sorting, and resource closure.
- [src/engines/platform/decode.ts:310-338](../../src/engines/platform/decode.ts#L310-L338) — video-element seek result.
- [src/engines/platform/raster.ts:1-79](../../src/engines/platform/raster.ts#L1-L79) — displayed-frame RGBA normalization.
- [src/engines/platform/adapter.ts:521-528](../../src/engines/platform/adapter.ts#L521-L528) — platform registration as an instrument.
- [src/engines/aibrush-media/adapter.ts:4207-4291](../../src/engines/aibrush-media/adapter.ts#L4207-L4291) — aibrush-media decode and seek.
- [src/engines/ffmpeg-wasm/adapter.ts:2649-2770](../../src/engines/ffmpeg-wasm/adapter.ts#L2649-L2770) — ffmpeg.wasm decode/seek and synthesized timestamps.
- [src/engines/mediabunny/adapter.ts:1333-1445](../../src/engines/mediabunny/adapter.ts#L1333-L1445) — Mediabunny sample decode and seek.
- [src/engines/remotion-webcodecs/adapter.ts:605-791](../../src/engines/remotion-webcodecs/adapter.ts#L605-L791) — Remotion WebCodecs decode and seek.
- [src/engines/web-demuxer/adapter.ts:831-1041](../../src/engines/web-demuxer/adapter.ts#L831-L1041) — web-demuxer decode/seek and runtime config errors.
- [src/engines/mp4box/adapter.ts:630-681](../../src/engines/mp4box/adapter.ts#L630-L681) — MP4Box capability exclusions.

### External authorities

- W3C Media Working Group, [WebCodecs](https://w3c.github.io/webcodecs/), Editor’s Draft, accessed 2026-07-16 — configuration support, presentation timestamps, VideoFrame display/orientation/alpha, image decoding, and resource release.
- W3C Media Working Group, [AVC (H.264) WebCodecs Registration](https://w3c.github.io/webcodecs/avc_codec_registration.html), sections 1–4, accessed 2026-07-16 — avc1/avc3 codec strings, access units, AVC length-prefix versus Annex B framing, and parameter-set placement.
- W3C Media Working Group, [HEVC (H.265) WebCodecs Registration](https://w3c.github.io/webcodecs/hevc_codec_registration.html), sections 1–4, accessed 2026-07-16 — hev1/hvc1 strings and HEVC length-prefix/Annex B configuration forms.
- W3C, [Media Source Extensions 2](https://www.w3.org/TR/media-source-2/#definitions), definitions, accessed 2026-07-16 — coded-frame PTS/DTS/duration, presentation intervals/order, and random-access points.
- WHATWG, [HTML Standard: Seeking](https://html.spec.whatwg.org/multipage/media.html#seeking), accessed 2026-07-16 — precise currentTime seeking, fastSeek behavior, and seek completion.
- W3C Media Working Group, [ISO BMFF Byte Stream Format](https://w3c.github.io/mse-byte-stream-format-isobmff/), initialization segments and random-access points, accessed 2026-07-16 — edit-list presentation mapping and in-band/out-of-band codec configuration.
- ISO/IEC JTC 1/SC 29, [ISO/IEC 14496-12:2026 catalogue entry](https://www.iso.org/standard/85596.html), accessed 2026-07-16 — ISO Base Media File Format timing, structure, and media information.
- ITU-T, [H.262 Amendment 1](https://www.itu.int/rec/dologin_pub.asp?id=T-REC-H.262-200011-S%21Amd1%21PDF-E&lang=e&type=items), accessed 2026-07-16 — 30000/1001 broadcast frame cadence.
- ETSI, [TS 102 005 V1.2.1: Digital Radio Mondiale; Monomedia data and multimedia services](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf), Annex A, accessed 2026-07-16 — HE-AAC SBR output at twice the AAC-core rate and Parametric Stereo mono-to-stereo reconstruction.
- FFmpeg Project, [ffmpeg Documentation: Main options](https://www.ffmpeg.org/ffmpeg-all.html#Main-options), accessed 2026-07-16 — seeks normally start at a prior seek point and accurate seek decodes/discards to the target.
- Mediabunny, [VideoSampleSink API](https://mediabunny.dev/api/VideoSampleSink), accessed 2026-07-16 — presentation-order iteration and last sample at or before a timestamp.
- Matroska Project, [Codec Mappings: VP9](https://www.matroska.org/technical/codec_specs.html#v_vp9), accessed 2026-07-16 — VP9 alpha side data carried through BlockAdditions.
