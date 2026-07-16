# Remux

> Scope: This page owns the remux scenario family—container matrices, audio re-wrapping, scale, metamorphic properties, and malformed inputs—and defers general runner, oracle, and adapter mechanics to their subsystem and engine pages.
> Phase-2 owner: p2_feature_remux.

## Purpose

The remux family asks whether an engine can change a media wrapper while preserving the coded program: all required tracks, coded pictures or audio frames, presentation order, timing, and required container metadata. Each registered [scenario](../glossary.md) is an engine-independent cell specification; the scored operation is the adapter's `remux()` implementation, not a decode-and-re-encode shortcut.

The page is the remux specification for later runner, oracle, and adapter cleanup. It inventories every current scenario, states what the harness actually observes, and separates those facts from the stricter semantic-equivalence model the benchmark still needs.

## As-built

### Registration and execution path

The browser app lazy-loads `remuxScenarios`, while the aggregate registry places `remux` third in canonical family order. [src/app/register.ts:94-103](../../src/app/register.ts#L94-L103) [src/scenarios/index.ts:32-50](../../src/scenarios/index.ts#L32-L50)

The family export concatenates the base list, matrix completion, audio expansion, size ladder, metamorphic properties, and negative inputs. The resulting runtime inventory is 49 scenarios: 33 ordinary remuxes, four scale rows, nine property rows, and three negative rows. [src/scenarios/remux/index.ts:144-154](../../src/scenarios/remux/index.ts#L144-L154)

An ordinary row derives its stable id from `asset + from + to`, sets `op: 'remux'`, passes only the requested output container in `options`, declares flat operation/container/codec/feature requirements, attaches `reference-reimport` by default, and asks for wall time, realtime throughput, peak memory, read/write counts, and long-task observations. [src/scenarios/remux/_shared.ts:72-103](../../src/scenarios/remux/_shared.ts#L72-L103)

At runtime, the runner calls `engine.remux(input, options)` exactly once and puts only the returned `MediaBytes` in the oracle context; it does not automatically probe or demux that output. [src/core/runner.ts:789-810](../../src/core/runner.ts#L789-L810)

### Video and container matrix: 24 scenarios

The ordinary video matrix spans MP4, MOV, Matroska, WebM, and MPEG-TS inputs or targets. H.264 rows cover B-frame reorder, rotation, and multiple tracks; HEVC, VP8, VP9, and AV1 rows expand codec/container reach. The table inventories the generated ids; the declarations, rather than their optimistic notes, are the as-built requirements. [src/scenarios/remux/index.ts:38-104](../../src/scenarios/remux/index.ts#L38-L104) [src/scenarios/remux/matrix.ts:30-138](../../src/scenarios/remux/matrix.ts#L30-L138)

| Scenario id | Declared transition or edge | Evidence |
| --- | --- | --- |
| `remux/h264_1080p_30s_mp4_to_mov` | MP4 → MOV, H.264 + AAC | [src/scenarios/remux/index.ts:40](../../src/scenarios/remux/index.ts#L40) |
| `remux/h264_1080p_30s_mp4_to_mkv` | MP4 → MKV, H.264 + AAC | [src/scenarios/remux/index.ts:41](../../src/scenarios/remux/index.ts#L41) |
| `remux/h264_1080p_30s_mp4_to_ts` | MP4 → TS, H.264 + AAC | [src/scenarios/remux/index.ts:42](../../src/scenarios/remux/index.ts#L42) |
| `remux/h264_1080p_5s_mov_to_mp4` | MOV → MP4, H.264 + AAC | [src/scenarios/remux/index.ts:43](../../src/scenarios/remux/index.ts#L43) |
| `remux/h264_in_mkv_mkv_to_mp4` | MKV → MP4, H.264 + AAC | [src/scenarios/remux/index.ts:44](../../src/scenarios/remux/index.ts#L44) |
| `remux/h264_ts_ts_to_mp4` | TS → MP4; declared Annex B-to-length-prefix edge | [src/scenarios/remux/index.ts:45-52](../../src/scenarios/remux/index.ts#L45-L52) |
| `remux/h264_bframes_1080p_mp4_to_mkv` | MP4 → MKV; B-frame timestamps | [src/scenarios/remux/index.ts:53-60](../../src/scenarios/remux/index.ts#L53-L60) |
| `remux/h264_rotated90_mp4_to_mov` | MP4 → MOV; display rotation | [src/scenarios/remux/index.ts:61-68](../../src/scenarios/remux/index.ts#L61-L68) |
| `remux/h264_multitrack_mp4_to_mkv` | MP4 → MKV; multiple media tracks | [src/scenarios/remux/index.ts:69-76](../../src/scenarios/remux/index.ts#L69-L76) |
| `remux/hevc_1080p_10s_mp4_to_mkv` | MP4 → MKV, HEVC + AAC | [src/scenarios/remux/index.ts:77-84](../../src/scenarios/remux/index.ts#L77-L84) |
| `remux/vp9_1080p_10s_webm_to_mkv` | WebM → MKV, VP9 + Opus | [src/scenarios/remux/index.ts:86-87](../../src/scenarios/remux/index.ts#L86-L87) |
| `remux/vp8_720p_10s_webm_to_mkv` | WebM → MKV, VP8 + Vorbis | [src/scenarios/remux/index.ts:87-88](../../src/scenarios/remux/index.ts#L87-L88) |
| `remux/av1_720p_5s_webm_to_mkv` | WebM → MKV, AV1 input + Opus | [src/scenarios/remux/index.ts:89-96](../../src/scenarios/remux/index.ts#L89-L96) |
| `remux/av1_720p_5s_webm_to_mp4` | WebM → MP4 behind `remux:av1-opus-in-mp4` | [src/scenarios/remux/index.ts:97-105](../../src/scenarios/remux/index.ts#L97-L105) |
| `remux/h264_1080p_5s_mov_to_mkv` | MOV → MKV, H.264 + AAC | [src/scenarios/remux/matrix.ts:37-44](../../src/scenarios/remux/matrix.ts#L37-L44) |
| `remux/h264_1080p_5s_mov_to_ts` | MOV → TS; length-prefix-to-Annex B edge | [src/scenarios/remux/matrix.ts:45-52](../../src/scenarios/remux/matrix.ts#L45-L52) |
| `remux/h264_in_mkv_mkv_to_mov` | MKV → MOV, H.264 + AAC | [src/scenarios/remux/matrix.ts:53-60](../../src/scenarios/remux/matrix.ts#L53-L60) |
| `remux/h264_in_mkv_mkv_to_ts` | MKV → TS, H.264 + AAC | [src/scenarios/remux/matrix.ts:61-68](../../src/scenarios/remux/matrix.ts#L61-L68) |
| `remux/h264_ts_ts_to_mkv` | TS → MKV, H.264 + AAC | [src/scenarios/remux/matrix.ts:69-76](../../src/scenarios/remux/matrix.ts#L69-L76) |
| `remux/h264_ts_ts_to_mov` | TS → MOV, H.264 + AAC | [src/scenarios/remux/matrix.ts:77-84](../../src/scenarios/remux/matrix.ts#L77-L84) |
| `remux/vp9_1080p_10s_webm_to_webm` | WebM identity re-mux, VP9 + Opus | [src/scenarios/remux/matrix.ts:91-100](../../src/scenarios/remux/matrix.ts#L91-L100) |
| `remux/av1_720p_5s_webm_to_webm` | WebM identity re-mux behind `remux:av1-opus-in-webm` | [src/scenarios/remux/matrix.ts:101-109](../../src/scenarios/remux/matrix.ts#L101-L109) |
| `remux/hevc_1080p_10s_mp4_to_mov` | MP4 → MOV, HEVC + AAC | [src/scenarios/remux/matrix.ts:111-120](../../src/scenarios/remux/matrix.ts#L111-L120) |
| `remux/vp9_1080p_10s_webm_to_mp4` | WebM → MP4 behind `remux:vp9-opus-in-mp4` | [src/scenarios/remux/matrix.ts:122-135](../../src/scenarios/remux/matrix.ts#L122-L135) |

These are declarations of benchmark intent, not proof that every framework can copy every tuple. The capability gate tests each token independently, and the actual adapter may still reject or transform a concrete combination at runtime. [src/core/runner.ts:124-189](../../src/core/runner.ts#L124-L189)

### Audio re-wrapping: nine scenarios

Four audio rows live in the base file and five in the expansion. They cover AAC between ADTS, MP4, and TS; MP3 into MP4 or MKV; FLAC into MKV or Ogg; and Opus from Ogg into WebM or MKV. [src/scenarios/remux/index.ts:107-141](../../src/scenarios/remux/index.ts#L107-L141) [src/scenarios/remux/audio.ts:31-91](../../src/scenarios/remux/audio.ts#L31-L91)

| Scenario id | Declared transition | Evidence |
| --- | --- | --- |
| `remux/aac_adts_adts_to_mp4` | ADTS AAC → MP4 | [src/scenarios/remux/index.ts:113-119](../../src/scenarios/remux/index.ts#L113-L119) |
| `remux/mp3_xing_mp3_to_mp4` | MP3 → MP4 behind `remux:mp3-in-mp4` | [src/scenarios/remux/index.ts:120-127](../../src/scenarios/remux/index.ts#L120-L127) |
| `remux/flac_seektable_flac_to_mkv` | native FLAC → MKV | [src/scenarios/remux/index.ts:128-134](../../src/scenarios/remux/index.ts#L128-L134) |
| `remux/opus_ogg_to_webm` | Ogg Opus → WebM | [src/scenarios/remux/index.ts:135-141](../../src/scenarios/remux/index.ts#L135-L141) |
| `remux/micro_audio_short_mp4_to_adts` | MP4 AAC → ADTS | [src/scenarios/remux/audio.ts:31-42](../../src/scenarios/remux/audio.ts#L31-L42) |
| `remux/opus_ogg_to_mkv` | Ogg Opus → MKV | [src/scenarios/remux/audio.ts:44-51](../../src/scenarios/remux/audio.ts#L44-L51) |
| `remux/flac_seektable_flac_to_ogg` | native FLAC → Ogg behind `remux:flac-in-ogg` | [src/scenarios/remux/audio.ts:53-65](../../src/scenarios/remux/audio.ts#L53-L65) |
| `remux/aac_adts_adts_to_ts` | ADTS AAC → MPEG-TS | [src/scenarios/remux/audio.ts:67-78](../../src/scenarios/remux/audio.ts#L67-L78) |
| `remux/mp3_xing_mp3_to_mkv` | MP3 → MKV | [src/scenarios/remux/audio.ts:80-88](../../src/scenarios/remux/audio.ts#L80-L88) |

No ordinary audio row has a decoded-PCM fidelity oracle. Its default is the same structural `reference-reimport` check as video; duration-only audio properties supply a weaker, sample-derived proxy for three transitions. [src/scenarios/remux/_shared.ts:77-80](../../src/scenarios/remux/_shared.ts#L77-L80) [src/scenarios/remux/metamorphic.ts:63-98](../../src/scenarios/remux/metamorphic.ts#L63-L98)

### Scale ladder: four scenarios

Each scale row uses a two-minute operation timeout, inherits the ordinary remux metrics, and sets `throughputRealtime` as its primary metric. [src/scenarios/remux/size-ladder.ts:29](../../src/scenarios/remux/size-ladder.ts#L29) [src/scenarios/remux/size-ladder.ts:82-86](../../src/scenarios/remux/size-ladder.ts#L82-L86)

| Scenario id | Declared rung and transition | Evidence |
| --- | --- | --- |
| `remux/large_h264_1080p_120s_mp4_to_mkv` | large, MP4 → MKV | [src/scenarios/remux/size-ladder.ts:33-45](../../src/scenarios/remux/size-ladder.ts#L33-L45) |
| `remux/large_vp9_1080p_120s_webm_to_mkv` | large, WebM → MKV | [src/scenarios/remux/size-ladder.ts:46-55](../../src/scenarios/remux/size-ladder.ts#L46-L55) |
| `remux/huge_h264_1080p_600s_mov_to_mp4` | huge, MOV → MP4 | [src/scenarios/remux/size-ladder.ts:56-67](../../src/scenarios/remux/size-ladder.ts#L56-L67) |
| `remux/massive_h264_1080p_2h_mp4_to_mkv` | massive, MP4 → MKV | [src/scenarios/remux/size-ladder.ts:68-80](../../src/scenarios/remux/size-ladder.ts#L68-L80) |

Contrary to the stale header comment in `size-ladder.ts`, all four referenced long-form fixtures now have committed hashes and byte sizes in the manifest. [fixtures/manifest.json:600-642](../../fixtures/manifest.json#L600-L642) [fixtures/manifest.json:692-704](../../fixtures/manifest.json#L692-L704)

The remux-specific entry in the hand-maintained disabled list skips Remotion on the 600-second MOV → MP4 row because its conversion path exceeds the practical run budget. [src/core/disabled-cells.ts:173-178](../../src/core/disabled-cells.ts#L173-L178)

### Metamorphic properties: nine scenarios

Property rows remain `op: 'remux'`, add an `options.invariant` selector, use `property-invariant` by default, and measure wall time, peak memory, and long tasks. [src/scenarios/remux/_shared.ts:112-157](../../src/scenarios/remux/_shared.ts#L112-L157)

| Scenario id | Intended property | Evidence |
| --- | --- | --- |
| `remux/prop_bframes_decode_remux_mp4_mkv` | decoded video equality after MP4 → MKV | [src/scenarios/remux/metamorphic.ts:40-51](../../src/scenarios/remux/metamorphic.ts#L40-L51) |
| `remux/prop_bframes_decode_remux_mp4_mov` | decoded video equality after MP4 → MOV | [src/scenarios/remux/metamorphic.ts:52-61](../../src/scenarios/remux/metamorphic.ts#L52-L61) |
| `remux/prop_ts_to_mp4_duration_materialized` | output duration versus source golden | [src/scenarios/remux/metamorphic.ts:66-77](../../src/scenarios/remux/metamorphic.ts#L66-L77) |
| `remux/prop_adts_to_mp4_duration_invariant` | AAC duration after ADTS → MP4 | [src/scenarios/remux/metamorphic.ts:78-88](../../src/scenarios/remux/metamorphic.ts#L78-L88) |
| `remux/prop_mp3_to_mp4_duration_invariant` | MP3 duration after MP3 → MP4 | [src/scenarios/remux/metamorphic.ts:89-98](../../src/scenarios/remux/metamorphic.ts#L89-L98) |
| `remux/prop_roundtrip_mp4_mkv_mp4` | named MP4 → MKV → MP4 round trip | [src/scenarios/remux/metamorphic.ts:100-116](../../src/scenarios/remux/metamorphic.ts#L100-L116) |
| `remux/prop_multitrack_survives_mp4_mkv` | video decode equality plus structural re-import | [src/scenarios/remux/metamorphic.ts:118-135](../../src/scenarios/remux/metamorphic.ts#L118-L135) |
| `remux/prop_rotation_survives_mp4_mov` | decoded presentation equality after rotation metadata transfer | [src/scenarios/remux/metamorphic.ts:137-153](../../src/scenarios/remux/metamorphic.ts#L137-L153) |
| `remux/prop_recorder_headerless_duration_materialized` | duration materialized from headerless WebM | [src/scenarios/remux/metamorphic.ts:155-169](../../src/scenarios/remux/metamorphic.ts#L155-L169) |

The decode branch uses the unscored platform decoder on candidate output and compares its frame digests with source golden frames. It matches by frame index first, then accepts a nearest-PTS fallback only within 21 ms; an output decode exception is a boolean oracle failure. [src/core/oracles.ts:1241-1297](../../src/core/oracles.ts#L1241-L1297) [src/core/oracles.ts:2774-2795](../../src/core/oracles.ts#L2774-L2795)

The duration branch reads MP4/WebM structure, otherwise tries the decoded-frame span or a simple PCM parser, and returns an unavailable outcome if none can determine duration. [src/core/oracles.ts:2797-2847](../../src/core/oracles.ts#L2797-L2847)

The named round-trip scenario stores `roundTrip: ['mkv', 'mp4']` in options, but `executeOp()` performs only the first remux and no runner code consumes `roundTrip`. The current observation is therefore decoded equality after MP4 → MKV, not MP4 → MKV → MP4. [src/scenarios/remux/metamorphic.ts:103-116](../../src/scenarios/remux/metamorphic.ts#L103-L116) [src/core/runner.ts:794-810](../../src/core/runner.ts#L794-L810)

### Malformed inputs: three scenarios

Negative rows run through `graceful-failure`, keep a 15-second timeout, and record wall time plus peak memory. Their fixtures are committed generated artifacts with hashes and sizes. [src/scenarios/remux/negative.ts:27](../../src/scenarios/remux/negative.ts#L27) [src/scenarios/remux/negative.ts:78-96](../../src/scenarios/remux/negative.ts#L78-L96) [fixtures/manifest.json:1093-1135](../../fixtures/manifest.json#L1093-L1135)

| Scenario id | Malformation and accepted current behavior | Evidence |
| --- | --- | --- |
| `remux/neg_zeroed_mp4_to_mkv` | zeroed MP4; clean rejection/no output | [src/scenarios/remux/negative.ts:42-52](../../src/scenarios/remux/negative.ts#L42-L52) |
| `remux/neg_truncated_mp4_to_mkv` | 50%-truncated MP4; clean rejection or returned output | [src/scenarios/remux/negative.ts:53-64](../../src/scenarios/remux/negative.ts#L53-L64) |
| `remux/neg_headerless_webm_to_mkv` | destroyed EBML header; clean rejection/no output | [src/scenarios/remux/negative.ts:65-75](../../src/scenarios/remux/negative.ts#L65-L75) |

A clean throw is treated as graceful; timeout is `FAIL`; `NotApplicableError` is `NA_ENGINE`. For the truncated row, `gracefulAllowOutput: true` makes any returned output pass without parsing it or proving that it is safe. [src/core/runner.ts:1552-1569](../../src/core/runner.ts#L1552-L1569) [src/core/oracles.ts:2680-2705](../../src/core/oracles.ts#L2680-L2705)

### Current oracle and status behavior

The default `reference-reimport` path is not a second scored engine. For remux it byte-reads candidate output, compares media-track type counts and same-type ordinal codec tokens against golden metadata, and compares duration with a minimum 100 ms tolerance; Ogg-FLAC has a special STREAMINFO/granule proof. [src/core/oracles.ts:1301-1309](../../src/core/oracles.ts#L1301-L1309) [src/core/oracles.ts:1328-1442](../../src/core/oracles.ts#L1328-L1442)

The structural reader canonicalizes `avc1`/`avc3` to `h264`, `hev1`/`hvc1` to `hevc`, `mp4a` to `aac`, and Matroska `V_MPEG4/ISO/AVC` to `h264`. Track counts are compared by type, but multiple tracks of one type are still paired by ordinal. [src/core/box-readers.ts:46-117](../../src/core/box-readers.ts#L46-L117) [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375)

Generic structural re-import only understands ISO BMFF-family and Matroska/WebM output. TS, ADTS, MP3, and ordinary Ogg outputs have no generic structure reader, so many declared audio/TS rows can finish the operation yet yield `NA_ASSET` because no oracle check ran; Ogg-FLAC is the explicit exception. [src/core/box-readers.ts:1006-1030](../../src/core/box-readers.ts#L1006-L1030) [src/core/oracles.ts:306-313](../../src/core/oracles.ts#L306-L313) [src/core/oracles.ts:1342-1349](../../src/core/oracles.ts#L1342-L1349) [src/core/oracles.ts:1428-1435](../../src/core/oracles.ts#L1428-L1435) [src/core/runner.ts:1437-1442](../../src/core/runner.ts#L1437-L1442)

The current result type has `PASS`, `FAIL`, the three NA statuses, `ERROR`, and `SKIPPED`; it has no `DIFF`. Each oracle emits only `pass: boolean`. [src/core/scenario.ts:206-222](../../src/core/scenario.ts#L206-L222)

After execution, any real boolean oracle failure becomes `FAIL`; otherwise any passing oracle makes the cell `PASS`, and an all-unavailable set becomes `NA_ASSET`. Performance runs only after this binary functional gate. [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447)

### Adapter behavior that changes remux meaning

- FFmpeg.wasm probes the input, rejects incompatible WebM codec tuples with `NotApplicableError`, and invokes FFmpeg with `-map 0 -c copy`, so secondary tracks are selected and no codec is intentionally re-encoded. [src/engines/ffmpeg-wasm/adapter.ts:903-920](../../src/engines/ffmpeg-wasm/adapter.ts#L903-L920) [src/engines/ffmpeg-wasm/adapter.ts:2031-2065](../../src/engines/ffmpeg-wasm/adapter.ts#L2031-L2065)
- Mediabunny declares broad independent input-container, output-container, and codec sets. Its remux path creates an unconfigured `Conversion`, rejects only `isValid === false`, and executes even when `discardedTracks` is nonempty. [src/engines/mediabunny/adapter.ts:1029-1050](../../src/engines/mediabunny/adapter.ts#L1029-L1050) [src/engines/mediabunny/adapter.ts:850-877](../../src/engines/mediabunny/adapter.ts#L850-L877) [src/engines/mediabunny/adapter.ts:1251-1268](../../src/engines/mediabunny/adapter.ts#L1251-L1268)
- The composite Remotion adapter unions the parser and WebCodecs capability sets and routes remux to the WebCodecs package. That remux calls `convertMedia()` without strict per-track handlers, so the package's default copy-or-reencode policy remains active. [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91) [src/engines/remotion/adapter.ts:115-117](../../src/engines/remotion/adapter.ts#L115-L117) [src/engines/remotion-webcodecs/adapter.ts:462-474](../../src/engines/remotion-webcodecs/adapter.ts#L462-L474) [src/engines/remotion-webcodecs/adapter.ts:543-603](../../src/engines/remotion-webcodecs/adapter.ts#L543-L603)
- MP4Box declares only MP4/MOV input and MP4 output for remux; its implementation fragments every track into a concatenated init segment plus media segments. [src/engines/mp4box/adapter.ts:630-680](../../src/engines/mp4box/adapter.ts#L630-L680) [src/engines/mp4box/adapter.ts:905-943](../../src/engines/mp4box/adapter.ts#L905-L943)
- Remotion Media Parser and web-demuxer declare no remux operation and expose throwing stubs that should be unreachable after negotiation. [src/engines/remotion-media-parser/adapter.ts:179-214](../../src/engines/remotion-media-parser/adapter.ts#L179-L214) [src/engines/remotion-media-parser/adapter.ts:500-505](../../src/engines/remotion-media-parser/adapter.ts#L500-L505) [src/engines/web-demuxer/adapter.ts:1043-1049](../../src/engines/web-demuxer/adapter.ts#L1043-L1049)
- Aibrush Media declares broad remux reach, rejects unsupported output-shape combinations with `NotApplicableError`, and maps nested capability misses through its adapter translation path. [src/engines/aibrush-media/adapter.ts:3752-3801](../../src/engines/aibrush-media/adapter.ts#L3752-L3801) [src/engines/aibrush-media/adapter.ts:4064-4113](../../src/engines/aibrush-media/adapter.ts#L4064-L4113)

The full adapter contracts are detailed in the [Aibrush Media](../engines/aibrush-media.md), [FFmpeg.wasm](../engines/ffmpeg-wasm.md), [Mediabunny](../engines/mediabunny.md), [MP4Box](../engines/mp4box.md), [Remotion](../engines/remotion.md), and [web-demuxer](../engines/web-demuxer.md) pages. The general boundary belongs to [Engine adapter contract](../subsystems/engine-adapter-contract.md), and status routing belongs to [Runner and capability negotiation](../subsystems/runner-capability-negotiation.md).

## Contracts and invariants

- **Scenario shape.** Every ordinary and property row has one stable `remux/...` id, one logical input, a target `container`, declared capability requirements, at least one oracle, and metrics. `defineScenario()` enforces only the id namespace, a nonempty operation requirement, and a nonempty oracle list; it does not validate tuple legality or semantic remux intent. [src/scenarios/remux/_shared.ts:83-103](../../src/scenarios/remux/_shared.ts#L83-L103) [src/core/scenario.ts:190-204](../../src/core/scenario.ts#L190-L204)
- **Engine boundary.** `MediaEngine.remux()` receives a `MediaInput` plus a `RemuxOptions` bag whose only mandatory field is the target container, and returns `MediaBytes`. The interface has no field that proves every track was copied rather than re-encoded. [src/core/engine.ts:187-190](../../src/core/engine.ts#L187-L190) [src/core/engine.ts:201-219](../../src/core/engine.ts#L201-L219)
- **Capability preflight.** The current capability gate independently intersects operation, input/output container, codec, encryption, and feature tokens. Remux copy is treated as parser-only, so browser codec configuration is not required at preflight. [src/core/runner.ts:124-189](../../src/core/runner.ts#L124-L189) [src/core/runner.ts:209-227](../../src/core/runner.ts#L209-L227)
- **Runtime applicability.** An adapter-thrown error whose name is exactly `NotApplicableError` maps to `NA_ENGINE`; a different operation error escapes to the outer handler and maps to `ERROR`. A timeout maps to `FAIL`. [src/core/runner.ts:686-693](../../src/core/runner.ts#L686-L693) [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393) [src/core/runner.ts:1464-1468](../../src/core/runner.ts#L1464-L1468)
- **Current default correctness gate.** Ordinary rows pass only structural `reference-reimport`; the operation itself does not populate `metadata` or `demux`, so direct `golden-metadata` and `golden-packets` are not attached. [src/scenarios/remux/_shared.ts:9-34](../../src/scenarios/remux/_shared.ts#L9-L34) [src/scenarios/remux/_shared.ts:77-80](../../src/scenarios/remux/_shared.ts#L77-L80)
- **Current structural invariant.** Where the byte reader has coverage, media-track type counts, canonical codec tokens within same-type ordinal positions, and duration within a format-aware band plus a 100 ms floor are enforced. Packet-byte identity, language, dispositions, rotation values, edit lists, priming, chapters, tags, and coded-sample hashes are not part of this default gate. [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375) [src/core/oracles.ts:1357-1393](../../src/core/oracles.ts#L1357-L1393)
- **Current decoded-video invariant.** Selected property rows require candidate output to decode through the neutral platform path to exactly the source golden frame digests under index-first pairing. This check observes decoded video only; it does not prove audio preservation. [src/core/oracles.ts:2774-2795](../../src/core/oracles.ts#L2774-L2795)
- **Current audio invariant.** Three audio-adjacent property rows compare output duration with source golden duration. There is no remux-wide decoded-PCM content check, so equal duration does not prove preservation of every audio access unit. [src/scenarios/remux/metamorphic.ts:63-98](../../src/scenarios/remux/metamorphic.ts#L63-L98) [src/core/oracles.ts:2797-2847](../../src/core/oracles.ts#L2797-L2847)
- **Negative-input invariant.** A clean rejection within 15 seconds passes; a hang fails. The truncated-input opt-in currently treats returned bytes as safe without validating them. [src/scenarios/remux/negative.ts:53-64](../../src/scenarios/remux/negative.ts#L53-L64) [src/core/oracles.ts:2680-2705](../../src/core/oracles.ts#L2680-L2705)
- **Correctness before performance.** A cell is benchmarked only after at least one oracle passes and no real oracle fails. Scale rows rank on realtime throughput only after that gate. [src/core/runner.ts:1411-1455](../../src/core/runner.ts#L1411-L1455) [src/scenarios/remux/size-ladder.ts:82-86](../../src/scenarios/remux/size-ladder.ts#L82-L86)

## Target design and known gaps

### Target design

1. **Define remux as strict stream copy with format-required reframing.** A conforming adapter must preserve every required coded track and must not decode/re-encode it; it may rewrite container structure, timestamps into the target timebase, codec configuration placement, and elementary-stream framing required by the target. This matches FFmpeg's official definition of [streamcopy](https://ffmpeg.org/ffmpeg.html#Streamcopy): container and metadata can change without decoding or encoding, while some source/target pairs remain impossible. Acceptance requires per-track evidence that codec identity, access-unit content, and program membership survived; a target that cannot copy any required track must be `NA_ENGINE`, not a lossy `PASS`.

2. **Use a three-way semantic oracle verdict.** `PASS` means all required semantic and structural invariants hold after documented normalization; `DIFF` means the output is valid and preserves the program but differs from the ffmpeg-baked golden's legal representation; `FAIL` is reserved for invalid output, lost/extra required content, actual coded-content change, broken decode/playback, or timing outside the documented band. ISO BMFF explicitly stores timing, structure, and media information rather than prescribing one byte layout ([ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html)), and Matroska permits multiple block-lacing representations ([RFC 9559, Section 10.3](https://www.rfc-editor.org/rfc/rfc9559.html#section-10.3)). Acceptance requires structured oracle outcomes capable of `PASS | DIFF | FAIL`; a representation diagnostic must not flip a semantically valid cell to `FAIL`.

3. **Separate semantic packet invariants from representation diagnostics.** For AVC, normalize Annex B start codes and length-prefixed AVCC samples into access units and NAL-unit sequences; treat in-band versus out-of-band SPS/PPS, legal parameter-set repetition, and legal NAL grouping as representation. The W3C AVC registration distinguishes Annex B with in-band parameter sets from `avc`/AVCC configuration records and defines an encoded chunk as an access unit ([AVC WebCodecs Registration, Sections 2–4](https://www.w3.org/TR/webcodecs-avc-codec-registration/)); FFmpeg documents the lossless [H.264/HEVC length-prefix-to-Annex B bitstream filters](https://ffmpeg.org/ffmpeg-bitstream-filters.html#h264_005fmp4toannexb) used for MPEG-TS. ISO/IEC 14496-15 is the governing NAL-carriage specification for AVC and HEVC in ISO BMFF ([ISO/IEC 14496-15:2024](https://www.iso.org/standard/89118.html)). Acceptance compares normalized coded access-unit content, presentation/decode order, random-access semantics, and track identity; raw packet size, exact keyframe-flag placement, and packet grouping remain diagnostics and produce `DIFF` when legal.

4. **Make track and timeline comparison semantic.** Match tracks by type plus stable discriminators such as codec, language, role/disposition, and source identity rather than raw index or same-type ordinal. Compare timestamps after explicit timebase conversion, preserve relative PTS/DTS ordering, and allow documented edit-list, priming, and rounding effects. ISO BMFF clients are required to handle a common `edts/elst` presentation offset ([W3C ISO BMFF Byte Stream Format, initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#init-segments)); Matroska timestamps are expressed in track/segment ticks and lacing can place multiple frames in one block ([RFC 9559](https://www.rfc-editor.org/rfc/rfc9559.html)). Acceptance includes B-frame, rotation, multi-audio, edit-list/priming, VFR, and NTSC rate fixtures with explicitly measured tolerance reasons.

5. **Give every declared output format a neutral validation path.** Add independent readers or reference probes for MPEG-TS, ADTS, MP3, and Ogg/Opus, not just ISO BMFF, Matroska/WebM, and Ogg-FLAC. ADTS carries codec metadata in each AAC frame while raw AAC carries it out of band ([AAC WebCodecs Registration, Sections 2–5](https://www.w3.org/TR/webcodecs-aac-codec-registration/)); Ogg pages and packets have codec-specific granule semantics rather than one universal time unit ([RFC 3533, Sections 4–6](https://www.rfc-editor.org/rfc/rfc3533.html#section-4)); Ogg-FLAC has a defined STREAMINFO mapping ([RFC 9639, Section 10.1](https://www.rfc-editor.org/rfc/rfc9639.html#section-10.1)). Acceptance requires every ordinary remux scenario either to emit a semantic verdict or a specific applicability reason—never `NA_ASSET` merely because the harness lacks a reader for a committed fixture.

6. **Enforce strict-copy behavior in conversion-style adapters.** Mediabunny must reject any nonempty `discardedTracks`, prove all input media tracks are utilized exactly once, and avoid a path that silently transcodes; its official conversion guide says the default [copies when possible, otherwise transcodes, and can drop unsupported tracks](https://mediabunny.dev/guide/converting-media-files). Remotion must install `onVideoTrack` and `onAudioTrack` handlers that return copy only when `canCopyTrack` is true, because its official defaults otherwise [re-encode video](https://www.remotion.dev/docs/webcodecs/default-on-video-track-handler) or [re-encode audio](https://www.remotion.dev/docs/webcodecs/default-on-audio-track-handler). If a framework cannot expose a trustworthy copy plan, the adapter must use a lower-level packet-copy API or throw `NotApplicableError`. Acceptance includes a source encoded so a fallback transcode is detectable by codec/extradata/content hashes and a multi-track source where any drop fails.

7. **Route concrete unsupported tuples to `NA_ENGINE`.** Keep the fast token gate, but require every adapter to validate the full operation × source container × track codecs × target container × options tuple before doing work. Runtime inability must throw exact-cased `NotApplicableError`, which the runner already maps to `NA_ENGINE`; ordinary framework or harness faults remain `ERROR`. This is especially important for the broad Mediabunny lists and the composite Remotion union. Acceptance removes tuple workarounds from the hand-kept disabled list unless they are genuine benchmark-budget exclusions, and adds contract tests for representative unsupported combinations.

8. **Execute the property named by each scenario.** The round-trip row must actually run MP4 → MKV → MP4 through the same candidate adapter and validate the final output, or be renamed to a single-remux property. Decode-based properties must keep their neutral, unscored WebCodecs reference path—WebCodecs codec support is runtime-dependent ([WebCodecs, configuration support](https://www.w3.org/TR/webcodecs/))—but output validity and reference decoder applicability must be reported separately. Acceptance observes two adapter calls for the round trip and maps a reference-only decode limitation to `NA_BROWSER`, not `FAIL`.

9. **Validate safe partial output, not mere output presence.** The truncated-input scenario may pass with a partial file only if the result is structurally valid, bounded to complete samples, has no impossible offsets or unbounded allocation hints, and decodes/probes through the last retained sample. Otherwise it must cleanly reject. Acceptance records `rejected`, `valid-partial`, `invalid-output`, or `timeout` as distinct observations and never treats `gracefulAllowOutput: true` alone as proof.

### Known gaps

1. **Binary verdict conflates representation with wrongness.**
   - **Current:** `ResultStatus` has no `DIFF`, `OracleOutcome` is boolean, and any real oracle mismatch collapses to `FAIL`. [src/core/scenario.ts:206-222](../../src/core/scenario.ts#L206-L222) [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447)
   - **Consequence:** A legal representation change can be reported exactly like lost or corrupt media, so remux results cannot distinguish interoperability from golden mimicry.
   - **Target:** Implement the three-way model above, consistent with the representational freedom in [ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html) and [RFC 9559](https://www.rfc-editor.org/rfc/rfc9559.html).
   - **Verification:** Feed equivalent outputs with different box order, fragmentation, track numbers, parameter-set placement, or lacing; they report `DIFF`, while deletion or corruption reports `FAIL`.

2. **Golden packet equality is unfair across legal reframing.**
   - **Current:** The shared comparator requires exact packet count, track-index layout, packet size, and keyframe flag, then compares timestamps position-by-position after only a constant origin shift. [src/core/oracles.ts:835-927](../../src/core/oracles.ts#L835-L927)
   - **Consequence:** Annex B versus AVCC, inline SPS/PPS, different legal NAL grouping, and Matroska lacing can change packet sizes or grouping without changing coded pictures. Conversely, byte-size equality does not prove the same coded content.
   - **Target:** Normalize AVC/HEVC access units and separate semantic equality from framing diagnostics, following the [AVC registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/), [ISO/IEC 14496-15](https://www.iso.org/standard/89118.html), and [Matroska lacing rules](https://www.rfc-editor.org/rfc/rfc9559.html#section-10.3). Legal representation-only changes become `DIFF`.
   - **Verification:** Compare MP4→TS→MP4 fixtures whose NAL bytes are equivalent after normalization but whose raw packet tables differ; the semantic layer passes, the representation layer reports the difference, and a modified slice NAL fails.

3. **The ordinary oracle is shallow and format-limited.**
   - **Current:** `reference-reimport` checks track type/count, canonical codec by same-type ordinal, and duration for MP4/WebM-family outputs; Ogg-FLAC alone has a dedicated alternate proof. [src/core/oracles.ts:1328-1442](../../src/core/oracles.ts#L1328-L1442) [src/core/box-readers.ts:1006-1030](../../src/core/box-readers.ts#L1006-L1030)
   - **Consequence:** TS, ADTS, MP3, and Ogg/Opus scenarios can become `NA_ASSET` despite committed inputs, while readable outputs can pass after an audio-track substitution, metadata loss, or coded-content change not exposed by count/codec/duration.
   - **Target:** Add the format-aware readers and semantic track/content matching described above, grounded in [RFC 3533](https://www.rfc-editor.org/rfc/rfc3533.html), [RFC 9639](https://www.rfc-editor.org/rfc/rfc9639.html#section-10.1), and the [AAC registration](https://www.w3.org/TR/webcodecs-aac-codec-registration/).
   - **Verification:** Every one of the 33 ordinary rows produces a non-harness-gap verdict with a fully baked fixture; intentionally drop, swap, or alter each track and observe `FAIL`.

4. **Conversion adapters can transcode or drop while claiming remux.**
   - **Current:** Mediabunny executes an unconfigured `Conversion` when it is merely valid, and Remotion calls its default conversion handlers. [src/engines/mediabunny/adapter.ts:850-877](../../src/engines/mediabunny/adapter.ts#L850-L877) [src/engines/mediabunny/adapter.ts:1251-1268](../../src/engines/mediabunny/adapter.ts#L1251-L1268) [src/engines/remotion-webcodecs/adapter.ts:462-474](../../src/engines/remotion-webcodecs/adapter.ts#L462-L474)
   - **Consequence:** The framework may return a playable file after recoding or discarding a track, violating the family purpose; a shallow structural oracle may still pass it.
   - **Target:** Enforce all-track strict copy, using Mediabunny's documented [`discardedTracks`/`utilizedTracks`](https://mediabunny.dev/api/Conversion) and Remotion's documented strict track-handler decisions ([video](https://www.remotion.dev/docs/webcodecs/default-on-video-track-handler), [audio](https://www.remotion.dev/docs/webcodecs/default-on-audio-track-handler)). Unsupported copy plans throw `NotApplicableError`.
   - **Verification:** A tuple that defaults to re-encode or track drop returns `NA_ENGINE`; a supported tuple retains all access-unit content and track identities.

5. **Flat capability tokens overstate combinatorial support.**
   - **Current:** Negotiation checks operation, containers, codecs, and feature strings independently; Mediabunny and Remotion declare broad unions, so passing preflight does not establish that the concrete copy tuple is supported. [src/core/runner.ts:124-189](../../src/core/runner.ts#L124-L189) [src/engines/mediabunny/adapter.ts:1029-1085](../../src/engines/mediabunny/adapter.ts#L1029-L1085) [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91)
   - **Consequence:** Combinatorially unsupported cells leak into `FAIL` or `ERROR`, and maintainers compensate with feature tokens or disabled cells.
   - **Target:** Add tuple-aware preflight where practical and require runtime `NotApplicableError` everywhere else; preserve true budget skips as `SKIPPED` rather than disguising them as capability absence.
   - **Verification:** Unsupported codec/container pairs consistently become `NA_ENGINE`, genuine malformed-output defects remain `FAIL`, harness faults remain `ERROR`, and the disabled list contains only measured budget exceptions.

6. **The advertised round trip is not executed.**
   - **Current:** The scenario stores a two-container `roundTrip` option, but `executeOp()` invokes one remux and ignores the option. [src/scenarios/remux/metamorphic.ts:103-116](../../src/scenarios/remux/metamorphic.ts#L103-L116) [src/core/runner.ts:794-810](../../src/core/runner.ts#L794-L810)
   - **Consequence:** Asymmetric edit-list, parameter-set, or codec-configuration damage on the return leg is invisible even though the scenario id claims to test it.
   - **Target:** Execute both legs and compare the final presentation/content under the [ISO BMFF timing model](https://www.iso.org/standard/85596.html) and [Matroska container model](https://www.rfc-editor.org/rfc/rfc9559.html), or rename the scenario honestly.
   - **Verification:** Instrumented adapters observe two remux calls; a fault injected only on MKV→MP4 makes the property fail.

7. **Decode properties mix candidate validity with reference applicability.**
   - **Current:** Any platform-decode exception becomes a boolean property failure, and frame matching is index-first with a narrow 21 ms PTS fallback. [src/core/oracles.ts:1241-1297](../../src/core/oracles.ts#L1241-L1297) [src/core/oracles.ts:2774-2795](../../src/core/oracles.ts#L2774-L2795)
   - **Consequence:** A valid output outside this browser's decoder support can look like an engine defect; a representation that changes frame enumeration can false-fail despite equivalent presentation. The neutral WebCodecs reference itself remains fair by design—the conflation is in verdict routing and pairing.
   - **Target:** Keep the unscored reference decode, detect browser configuration support separately under the [WebCodecs configuration-support algorithm](https://www.w3.org/TR/webcodecs/), and pair frames by presentation-time windows when index/count changes are allowed.
   - **Verification:** Unsupported reference decode reports `NA_BROWSER`; a valid timing-represented output pairs by PTS; a real pixel change remains `FAIL`.

8. **Returned partial output is accepted without safety evidence.**
   - **Current:** The truncated MP4 row sets `gracefulAllowOutput`, and the oracle passes any returned output solely because that flag is true. [src/scenarios/remux/negative.ts:53-64](../../src/scenarios/remux/negative.ts#L53-L64) [src/core/oracles.ts:2680-2705](../../src/core/oracles.ts#L2680-L2705)
   - **Consequence:** Corrupt, unbounded, or misleading output can receive `PASS` as long as the adapter returns before timeout.
   - **Target:** Parse and bound partial output, then require complete retained samples and a coherent terminal timeline; ISO BMFF parsers must respect declared box sizes and timing structure ([ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html)).
   - **Verification:** Valid prefix recovery passes with a `valid-partial` detail; corrupt offsets or incomplete samples fail; clean rejection also passes with a distinct detail.

9. **Source comments and fixture state have drifted.**
   - **Current:** The size-ladder header says long-form hashes and sizes are null, while the manifest contains concrete hashes and sizes for every referenced row. [src/scenarios/remux/size-ladder.ts:13-19](../../src/scenarios/remux/size-ladder.ts#L13-L19) [fixtures/manifest.json:600-642](../../fixtures/manifest.json#L600-L642) [fixtures/manifest.json:692-704](../../fixtures/manifest.json#L692-L704)
   - **Consequence:** Readers can infer `NA_ASSET` behavior that no longer follows from the repository state, obscuring actual engine or oracle gaps.
   - **Target:** Generate scenario availability descriptions from the manifest or validate comments against it during CI; fixture evidence remains source-of-truth data rather than copied prose.
   - **Verification:** A docs/scenario audit resolves every remux input to its current manifest record and fails when an availability assertion disagrees with hash/size state.

## Sources

### Repository evidence

- [src/app/register.ts:94-103](../../src/app/register.ts#L94-L103) — lazy family registration.
- [src/scenarios/index.ts:32-50](../../src/scenarios/index.ts#L32-L50) — canonical family aggregation order.
- [src/scenarios/remux/index.ts:38-154](../../src/scenarios/remux/index.ts#L38-L154) — base matrix and final family concatenation.
- [src/scenarios/remux/_shared.ts:40-161](../../src/scenarios/remux/_shared.ts#L40-L161) — ordinary/property builders, defaults, requirements, and metrics.
- [src/scenarios/remux/matrix.ts:30-138](../../src/scenarios/remux/matrix.ts#L30-L138) — expanded video/container matrix.
- [src/scenarios/remux/audio.ts:31-91](../../src/scenarios/remux/audio.ts#L31-L91) — expanded audio remux rows.
- [src/scenarios/remux/size-ladder.ts:29-86](../../src/scenarios/remux/size-ladder.ts#L29-L86) — scale rows, timeout, and primary metric.
- [src/scenarios/remux/metamorphic.ts:28-171](../../src/scenarios/remux/metamorphic.ts#L28-L171) — property selectors and nine property rows.
- [src/scenarios/remux/negative.ts:27-96](../../src/scenarios/remux/negative.ts#L27-L96) — malformed rows and graceful-output option.
- [src/core/scenario.ts:190-222](../../src/core/scenario.ts#L190-L222) — definition validation and current result/oracle types.
- [src/core/engine.ts:115-137](../../src/core/engine.ts#L115-L137) — flat capability schema.
- [src/core/engine.ts:187-219](../../src/core/engine.ts#L187-L219) — remux options and adapter method contract.
- [src/core/runner.ts:112-227](../../src/core/runner.ts#L112-L227) — token negotiation and remux's parser-only browser gate.
- [src/core/runner.ts:686-693](../../src/core/runner.ts#L686-L693) — exact `NotApplicableError` recognition.
- [src/core/runner.ts:789-810](../../src/core/runner.ts#L789-L810) — one-call remux dispatch.
- [src/core/runner.ts:1331-1468](../../src/core/runner.ts#L1331-L1468) — negotiation, operation, oracle, status, and benchmark flow.
- [src/core/runner.ts:1522-1625](../../src/core/runner.ts#L1522-L1625) — robustness execution and status mapping.
- [src/core/oracles.ts:306-323](../../src/core/oracles.ts#L306-L323) — unavailable oracle outcome markers consumed as asset/evidence gaps.
- [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375) — structural track comparison.
- [src/core/oracles.ts:835-985](../../src/core/oracles.ts#L835-L985) — exact packet-table comparator and golden-packets path.
- [src/core/oracles.ts:1241-1297](../../src/core/oracles.ts#L1241-L1297) — current frame pairing.
- [src/core/oracles.ts:1301-1442](../../src/core/oracles.ts#L1301-L1442) — remux reference re-import implementation.
- [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705) — graceful-failure semantics.
- [src/core/oracles.ts:2774-2847](../../src/core/oracles.ts#L2774-L2847) — decode and duration property branches.
- [src/core/box-readers.ts:46-117](../../src/core/box-readers.ts#L46-L117) — current codec canonicalization.
- [src/core/box-readers.ts:1006-1057](../../src/core/box-readers.ts#L1006-L1057) — structural/packet reader coverage and bailout behavior.
- [src/core/disabled-cells.ts:173-178](../../src/core/disabled-cells.ts#L173-L178) — sole remux-specific disabled cell.
- [src/engines/ffmpeg-wasm/adapter.ts:903-920](../../src/engines/ffmpeg-wasm/adapter.ts#L903-L920) and [src/engines/ffmpeg-wasm/adapter.ts:2031-2068](../../src/engines/ffmpeg-wasm/adapter.ts#L2031-L2068) — tuple rejection and stream-copy command.
- [src/engines/mediabunny/adapter.ts:850-877](../../src/engines/mediabunny/adapter.ts#L850-L877), [src/engines/mediabunny/adapter.ts:1029-1085](../../src/engines/mediabunny/adapter.ts#L1029-L1085), and [src/engines/mediabunny/adapter.ts:1251-1268](../../src/engines/mediabunny/adapter.ts#L1251-L1268) — conversion validation, capability breadth, and remux path.
- [src/engines/remotion/adapter.ts:71-117](../../src/engines/remotion/adapter.ts#L71-L117) and [src/engines/remotion-webcodecs/adapter.ts:462-474](../../src/engines/remotion-webcodecs/adapter.ts#L462-L474) — composite capabilities and default conversion remux.
- [src/engines/mp4box/adapter.ts:630-680](../../src/engines/mp4box/adapter.ts#L630-L680) and [src/engines/mp4box/adapter.ts:905-943](../../src/engines/mp4box/adapter.ts#L905-L943) — ISO BMFF-only fragmented remux.
- [src/engines/remotion-media-parser/adapter.ts:179-214](../../src/engines/remotion-media-parser/adapter.ts#L179-L214) and [src/engines/web-demuxer/adapter.ts:1043-1049](../../src/engines/web-demuxer/adapter.ts#L1043-L1049) — parser-only engines do not declare remux.
- [src/engines/aibrush-media/adapter.ts:3752-3899](../../src/engines/aibrush-media/adapter.ts#L3752-L3899) and [src/engines/aibrush-media/adapter.ts:4064-4113](../../src/engines/aibrush-media/adapter.ts#L4064-L4113) — declared reach and runtime applicability translation.
- [fixtures/manifest.json:600-642](../../fixtures/manifest.json#L600-L642), [fixtures/manifest.json:692-704](../../fixtures/manifest.json#L692-L704), and [fixtures/manifest.json:1093-1135](../../fixtures/manifest.json#L1093-L1135) — baked scale and negative fixture records.

### External authorities

- International Organization for Standardization, [ISO/IEC 14496-12:2026 — ISO base media file format](https://www.iso.org/standard/85596.html), accessed 2026-07-16 — defines the timing, structure, and media-information role of ISO BMFF.
- International Organization for Standardization, [ISO/IEC 14496-15:2024 — Carriage of NAL unit structured video in ISO BMFF](https://www.iso.org/standard/89118.html), accessed 2026-07-16 — governs AVC/HEVC NAL-unit storage and configuration in ISO BMFF.
- W3C Media Working Group, [AVC (H.264) WebCodecs Registration, Sections 2–4](https://www.w3.org/TR/webcodecs-avc-codec-registration/), accessed 2026-07-16 — distinguishes Annex B from `avc`/AVCC configuration and defines access-unit chunk semantics.
- W3C, [ISO BMFF Byte Stream Format, initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#init-segments), accessed 2026-07-16 — requires common edit-list offset handling and recognizes in-band versus out-of-band parameter-set storage.
- IETF, [RFC 9559 — Matroska Media Container Format Specification](https://www.rfc-editor.org/rfc/rfc9559.html), especially [Section 10.3, Block Lacing](https://www.rfc-editor.org/rfc/rfc9559.html#section-10.3), accessed 2026-07-16 — defines Matroska tracks, timestamps, blocks, and legal lacing representations.
- IETF, [RFC 3533 — The Ogg Encapsulation Format Version 0](https://www.rfc-editor.org/rfc/rfc3533.html), especially [Section 4, The Ogg bitstream format](https://www.rfc-editor.org/rfc/rfc3533.html#section-4), accessed 2026-07-16 — defines Ogg logical streams, packets, pages, granule positions, and framing.
- IETF, [RFC 9639, Section 10.1 — FLAC Ogg Mapping](https://www.rfc-editor.org/rfc/rfc9639.html#section-10.1), accessed 2026-07-16 — defines Ogg-FLAC identification and STREAMINFO carriage.
- W3C Media Working Group, [AAC WebCodecs Registration](https://www.w3.org/TR/webcodecs-aac-codec-registration/), accessed 2026-07-16 — documents raw AAC versus ADTS framing and AudioSpecificConfig placement; the page is a 2026 Group Note Draft and is used here as current W3C codec-registration guidance.
- W3C Media Working Group, [WebCodecs, Section 7.1 configuration support](https://www.w3.org/TR/webcodecs/), accessed 2026-07-16 — establishes best-effort, runtime-dependent codec-configuration support for the neutral browser reference path.
- FFmpeg project, [FFmpeg Documentation — Streamcopy](https://ffmpeg.org/ffmpeg.html#Streamcopy), accessed 2026-07-16 — defines copy-without-decode/encode behavior and its compatibility limits.
- FFmpeg project, [FFmpeg Bitstream Filters — h264_mp4toannexb and hevc_mp4toannexb](https://ffmpeg.org/ffmpeg-bitstream-filters.html#h264_005fmp4toannexb), accessed 2026-07-16 — documents lossless length-prefix-to-Annex B conversion for MPEG-TS-style targets.
- Mediabunny, [Converting media files](https://mediabunny.dev/guide/converting-media-files), accessed 2026-07-16 — documents default copy-otherwise-transcode behavior and possible track dropping.
- Mediabunny, [Conversion API](https://mediabunny.dev/api/Conversion), accessed 2026-07-16 — documents `discardedTracks`, `utilizedTracks`, and the fact that discarded tracks do not necessarily invalidate a conversion.
- Remotion, [`defaultOnVideoTrackHandler()`](https://www.remotion.dev/docs/webcodecs/default-on-video-track-handler) and [`defaultOnAudioTrackHandler()`](https://www.remotion.dev/docs/webcodecs/default-on-audio-track-handler), accessed 2026-07-16 — show copy-when-possible followed by re-encode fallback, motivating strict remux handlers.
