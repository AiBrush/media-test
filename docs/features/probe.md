# Probe

> Scope: This page owns the probe scenario family—container and track metadata discovery, at-scale probe performance, duration properties, and probe-specific malformed-input behavior—and delegates adapter internals, fixture production, and general verdict machinery to their subsystem pages.
> Phase-2 owner: p2_feature_probe.

## Purpose

Probe asks the cheapest broad compatibility question in the benchmark: can an engine recognize a media input and describe it consistently enough for later operations and comparisons? Each registered [scenario](../glossary.md#scenario) supplies an input, capability requirements, one or more oracles, and metrics without naming an engine. The family covers ordinary and protected containers, audio-only and video-only media, real-world samples, a size ladder through multi-gigabyte assets, and malformed or incomplete inputs.

The page is the probe-family specification for fixture authors, adapter owners, and later code-cleanup agents. The normalized metadata model is shared with [metadata scenarios](metadata.md); generic execution and availability belong to [runner and capability negotiation](../subsystems/runner-capability-negotiation.md); comparison semantics belong to the [oracle system](../subsystems/oracle-system.md); and per-framework behavior belongs to the six [engine pages](../engines/mediabunny.md).

## As-built

### Registration and execution path

`probeScenarios` is imported into the canonical family map, flattened with every other family, checked for duplicate ids, and then registered in the shared scenario registry. The registry itself rejects a duplicate id and preserves insertion order when listing scenarios. [src/scenarios/index.ts:18-50](../../src/scenarios/index.ts#L18-L50) [src/scenarios/index.ts:52-71](../../src/scenarios/index.ts#L52-L71) [src/core/registry.ts:29-52](../../src/core/registry.ts#L29-L52)

The family currently exports 51 scenarios: 44 generated golden-metadata probes, three correctness-gated throughput probes, two duration-property probes, one valid-but-empty WAV probe, and one truncated-header graceful-failure probe. The generated rows all declare `op: 'probe'`, the input container and codec tokens, `golden-metadata`, and `wall`; optional features, track filters, tolerances, and notes are copied from the case declaration. [src/scenarios/probe/index.ts:52-354](../../src/scenarios/probe/index.ts#L52-L354) [src/scenarios/probe/index.ts:356-428](../../src/scenarios/probe/index.ts#L356-L428) [src/scenarios/probe/index.ts:430-564](../../src/scenarios/probe/index.ts#L430-L564)

After capability negotiation and untimed engine initialization, the runner builds each `MediaInput`, calls `engine.probe()` once per input, and retains both the first metadata result and the per-input list for a multi-input scenario. A `NotApplicableError` becomes `NA_ENGINE`; a timeout in the normal path becomes `FAIL`; another operation exception falls through to `ERROR`. [src/core/runner.ts:1331-1394](../../src/core/runner.ts#L1331-L1394) [src/core/runner.ts:794-805](../../src/core/runner.ts#L794-L805) [src/core/runner.ts:1464-1468](../../src/core/runner.ts#L1464-L1468)

### Registered golden-metadata scenarios: ISO BMFF and video containers

Scenario ids are `probe/<explicit id>` when supplied and otherwise `probe/<asset basename>`. The first nine rows exercise MP4/MOV H.264, HEVC, B-frames, VFR, rotation, multiple tracks, two fetched MDN samples, and a 4K sample. [src/scenarios/probe/index.ts:52-98](../../src/scenarios/probe/index.ts#L52-L98) [src/scenarios/probe/index.ts:335-354](../../src/scenarios/probe/index.ts#L335-L354)

| Scenario id | Input and intended observable | Repository evidence |
| --- | --- | --- |
| `probe/h264_1080p_30s` | MP4; H.264 video and AAC audio baseline | [src/scenarios/probe/index.ts:54](../../src/scenarios/probe/index.ts#L54) |
| `probe/realworld_mdn_flower_mp4` | fetched real-world MP4 smoke | [src/scenarios/probe/index.ts:55-64](../../src/scenarios/probe/index.ts#L55-L64) |
| `probe/h264_4k_10s` | 4K H.264/AAC MP4 | [src/scenarios/probe/index.ts:65](../../src/scenarios/probe/index.ts#L65) |
| `probe/hevc_1080p_10s` | HEVC/AAC MP4 | [src/scenarios/probe/index.ts:66](../../src/scenarios/probe/index.ts#L66) |
| `probe/h264_bframes_1080p` | B-frame stream; metadata must not depend on decode order | [src/scenarios/probe/index.ts:67-73](../../src/scenarios/probe/index.ts#L67-L73) |
| `probe/h264_vfr` | VFR MP4 with a scenario-local `fpsTolerance` of `0.1` | [src/scenarios/probe/index.ts:74-81](../../src/scenarios/probe/index.ts#L74-L81) |
| `probe/h264_rotated90` | display-matrix rotation and coded dimensions | [src/scenarios/probe/index.ts:82-90](../../src/scenarios/probe/index.ts#L82-L90) |
| `probe/h264_multitrack` | multiple media tracks | [src/scenarios/probe/index.ts:91-97](../../src/scenarios/probe/index.ts#L91-L97) |
| `probe/h264_1080p_5s` | QuickTime MOV container | [src/scenarios/probe/index.ts:98](../../src/scenarios/probe/index.ts#L98) |

Six further video-container rows cover WebM/Matroska codec mappings, a video-only alpha asset, and a second fetched sample. AV1 uses the read-side `videoCodecsIn` requirement rather than implying encoder support. [src/scenarios/probe/index.ts:100-131](../../src/scenarios/probe/index.ts#L100-L131)

| Scenario id | Input and intended observable | Repository evidence |
| --- | --- | --- |
| `probe/vp9_1080p_10s` | VP9/Opus WebM | [src/scenarios/probe/index.ts:101](../../src/scenarios/probe/index.ts#L101) |
| `probe/realworld_mdn_flower_webm` | fetched real-world VP8/Vorbis WebM | [src/scenarios/probe/index.ts:102-111](../../src/scenarios/probe/index.ts#L102-L111) |
| `probe/vp8_720p_10s` | VP8/Vorbis WebM | [src/scenarios/probe/index.ts:112](../../src/scenarios/probe/index.ts#L112) |
| `probe/av1_720p_5s` | read-side AV1/Opus WebM | [src/scenarios/probe/index.ts:113-121](../../src/scenarios/probe/index.ts#L113-L121) |
| `probe/vp9_alpha` | one VP9 video track and no audio track | [src/scenarios/probe/index.ts:122-130](../../src/scenarios/probe/index.ts#L122-L130) |
| `probe/h264_in_mkv` | H.264/AAC Matroska | [src/scenarios/probe/index.ts:131](../../src/scenarios/probe/index.ts#L131) |

### Registered golden-metadata scenarios: transport and protected media

Five rows cover MPEG-TS, clear and AES-128 HLS, and CENC-CTR/CBCS MP4 metadata. The HLS protected row requires `hls:aes128`; the CENC rows require `metadata:protected-tracks`, not the decrypt operation. [src/scenarios/probe/index.ts:133-176](../../src/scenarios/probe/index.ts#L133-L176)

| Scenario id | Input and intended observable | Repository evidence |
| --- | --- | --- |
| `probe/h264_ts` | H.264/AAC MPEG-TS | [src/scenarios/probe/index.ts:134](../../src/scenarios/probe/index.ts#L134) |
| `probe/hls_vod` | VOD playlist, segment-summed duration, H.264/AAC tracks | [src/scenarios/probe/index.ts:135-141](../../src/scenarios/probe/index.ts#L135-L141) |
| `probe/hls_aes128` | AES-128 VOD playlist under the `hls:aes128` feature | [src/scenarios/probe/index.ts:142-154](../../src/scenarios/probe/index.ts#L142-L154) |
| `probe/cenc_ctr` | metadata from CENC-CTR protected MP4 | [src/scenarios/probe/index.ts:156-166](../../src/scenarios/probe/index.ts#L156-L166) |
| `probe/cenc_cbcs` | metadata from CENC-CBCS protected MP4 | [src/scenarios/probe/index.ts:167-176](../../src/scenarios/probe/index.ts#L167-L176) |

### Registered golden-metadata scenarios: audio and header edge cases

Eleven audio rows span PCM width and endianness, MP3 duration headers, FLAC seek-table presence, raw ADTS AAC, and Ogg Opus. The real-world MP3 row alone fixes its duration band to 50 ms; the CBR-without-TOC row relies on the shared estimate-only duration class. [src/scenarios/probe/index.ts:178-220](../../src/scenarios/probe/index.ts#L178-L220)

| Scenario id | Input and intended observable | Repository evidence |
| --- | --- | --- |
| `probe/wav_s16` | 16-bit little-endian PCM WAV | [src/scenarios/probe/index.ts:179](../../src/scenarios/probe/index.ts#L179) |
| `probe/wav_s24` | 24-bit little-endian PCM WAV | [src/scenarios/probe/index.ts:180](../../src/scenarios/probe/index.ts#L180) |
| `probe/wav_f32` | 32-bit float PCM WAV | [src/scenarios/probe/index.ts:181](../../src/scenarios/probe/index.ts#L181) |
| `probe/pcm_s16be` | 16-bit big-endian PCM AIFF | [src/scenarios/probe/index.ts:182-193](../../src/scenarios/probe/index.ts#L182-L193) |
| `probe/mp3_xing` | MP3 with Xing/Info duration metadata | [src/scenarios/probe/index.ts:194](../../src/scenarios/probe/index.ts#L194) |
| `probe/realworld_mdn_trex_mp3` | fetched MP3 with explicit 50 ms duration tolerance | [src/scenarios/probe/index.ts:195-205](../../src/scenarios/probe/index.ts#L195-L205) |
| `probe/mp3_cbr_notoc` | CBR MP3 with no Xing TOC | [src/scenarios/probe/index.ts:206-211](../../src/scenarios/probe/index.ts#L206-L211) |
| `probe/flac_seektable` | FLAC with SEEKTABLE | [src/scenarios/probe/index.ts:212](../../src/scenarios/probe/index.ts#L212) |
| `probe/flac_noseektable` | FLAC duration from STREAMINFO without SEEKTABLE | [src/scenarios/probe/index.ts:213-218](../../src/scenarios/probe/index.ts#L213-L218) |
| `probe/aac_adts` | raw AAC with ADTS framing | [src/scenarios/probe/index.ts:219](../../src/scenarios/probe/index.ts#L219) |
| `probe/opus` | Opus in Ogg | [src/scenarios/probe/index.ts:220](../../src/scenarios/probe/index.ts#L220) |

The remaining two non-scale golden rows cover a headerless MediaRecorder WebM whose duration may be absent and a one-hour audio-only M4A. [src/scenarios/probe/index.ts:222-240](../../src/scenarios/probe/index.ts#L222-L240)

| Scenario id | Input and intended observable | Repository evidence |
| --- | --- | --- |
| `probe/recorder_headerless` | VP8/Opus recorder-origin WebM, sparse/no Cues, possibly null duration | [src/scenarios/probe/index.ts:223-230](../../src/scenarios/probe/index.ts#L223-L230) |
| `probe/longform_1h_audio` | audio-only AAC MP4, one track, inexpensive duration lookup | [src/scenarios/probe/index.ts:231-240](../../src/scenarios/probe/index.ts#L231-L240) |

### Registered golden-metadata scenarios: size ladder

Eleven rows form the probe-specific size ladder: two micro, two tiny, two large, two huge, one optional Big Buck Bunny parity asset, and two massive two-hour inputs. The scenario declarations expect metadata correctness at every rung; they do not themselves impose an I/O-complexity assertion. [src/scenarios/probe/index.ts:242-332](../../src/scenarios/probe/index.ts#L242-L332)

| Scenario id | Size/format role | Repository evidence |
| --- | --- | --- |
| `probe/micro_h264_1frame` | single-frame, video-only micro MP4 | [src/scenarios/probe/index.ts:243-249](../../src/scenarios/probe/index.ts#L243-L249) |
| `probe/micro_audio_short` | few-frame AAC micro M4A | [src/scenarios/probe/index.ts:250-256](../../src/scenarios/probe/index.ts#L250-L256) |
| `probe/tiny_h264_360p_2s` | tiny H.264/AAC MP4 | [src/scenarios/probe/index.ts:257-263](../../src/scenarios/probe/index.ts#L257-L263) |
| `probe/tiny_vp9_360p_2s` | tiny VP9/Opus WebM | [src/scenarios/probe/index.ts:264-270](../../src/scenarios/probe/index.ts#L264-L270) |
| `probe/large_h264_1080p_120s` | large H.264/AAC MP4 | [src/scenarios/probe/index.ts:271-279](../../src/scenarios/probe/index.ts#L271-L279) |
| `probe/large_vp9_1080p_120s` | large VP9/Opus WebM | [src/scenarios/probe/index.ts:280-286](../../src/scenarios/probe/index.ts#L280-L286) |
| `probe/huge_h264_1080p_600s` | huge H.264/AAC MOV | [src/scenarios/probe/index.ts:287-295](../../src/scenarios/probe/index.ts#L287-L295) |
| `probe/huge_vp9_1080p_240s` | huge VP9/Opus WebM | [src/scenarios/probe/index.ts:296-302](../../src/scenarios/probe/index.ts#L296-L302) |
| `probe/big_buck_bunny_1080p_h264` | optional real MOV parity asset; only audio/video tracks compared | [src/scenarios/probe/index.ts:303-315](../../src/scenarios/probe/index.ts#L303-L315) |
| `probe/massive_h264_1080p_2h` | two-hour, many-sample MP4 | [src/scenarios/probe/index.ts:316-325](../../src/scenarios/probe/index.ts#L316-L325) |
| `probe/massive_vp9_1080p_2h` | two-hour VP9/Opus WebM | [src/scenarios/probe/index.ts:326-332](../../src/scenarios/probe/index.ts#L326-L332) |

### Performance, property, and robustness-flavored scenarios

The three performance rows repeat probe on the large, huge, and massive H.264 assets. They use `opsPerSec` as the primary metric and `wall` as context; the runner counts one operation per measured execution. Benchmarking starts only after the functional oracle passes. [src/scenarios/probe/index.ts:356-428](../../src/scenarios/probe/index.ts#L356-L428) [src/core/runner.ts:1445-1463](../../src/core/runner.ts#L1445-L1463) [src/core/runner.ts:1651-1667](../../src/core/runner.ts#L1651-L1667)

| Scenario id | Behavior | Repository evidence |
| --- | --- | --- |
| `probe/perf-extract-metadata-large` | probes/s on large MP4 | [src/scenarios/probe/index.ts:375-385](../../src/scenarios/probe/index.ts#L375-L385) |
| `probe/perf-extract-metadata-huge` | probes/s on huge MOV | [src/scenarios/probe/index.ts:386-396](../../src/scenarios/probe/index.ts#L386-L396) |
| `probe/perf-extract-metadata-massive` | probes/s on massive MP4 | [src/scenarios/probe/index.ts:397-407](../../src/scenarios/probe/index.ts#L397-L407) |

The nominal cross-container duration scenario probes MP4 and MKV and invokes `property-invariant`; in the implemented oracle, however, each measured duration is compared only with that input's own golden duration. There is no direct MP4-versus-MKV comparison. [src/scenarios/probe/index.ts:430-464](../../src/scenarios/probe/index.ts#L430-L464) [src/core/oracles.ts:3942-3998](../../src/core/oracles.ts#L3942-L3998)

The headerless-recorder property row uses the same duration property, but its committed golden duration is `null`; the property oracle reports “no golden/source duration to compare,” which the runner classifies as an absent-golden signal and therefore `NA_ASSET`. The scenario comment's promised conditional range check is not implemented. [src/scenarios/probe/index.ts:466-495](../../src/scenarios/probe/index.ts#L466-L495) [fixtures/golden/recorder_headerless.webm.meta.json:1-17](../../fixtures/golden/recorder_headerless.webm.meta.json#L1-L17) [src/core/oracles.ts:3961-3967](../../src/core/oracles.ts#L3961-L3967) [src/core/runner.ts:858-888](../../src/core/runner.ts#L858-L888)

The valid empty WAV uses `golden-metadata`. The truncated MP4 instead uses `graceful-failure`, allows partial safe metadata, records wall and peak memory, and has a 15-second scenario timeout. A clean rejection or safe return passes; an overrun fails. [src/scenarios/probe/index.ts:497-553](../../src/scenarios/probe/index.ts#L497-L553) [src/core/runner.ts:1522-1569](../../src/core/runner.ts#L1522-L1569) [src/core/oracles.ts:2664-2705](../../src/core/oracles.ts#L2664-L2705)

| Scenario id | Behavior | Repository evidence |
| --- | --- | --- |
| `probe/metamorphic-duration-across-containers` | two inputs, each checked against its own duration golden | [src/scenarios/probe/index.ts:447-464](../../src/scenarios/probe/index.ts#L447-L464) |
| `probe/metamorphic-recorder-headerless-sane-duration` | currently retires to `NA_ASSET` because the reference duration is null | [src/scenarios/probe/index.ts:478-495](../../src/scenarios/probe/index.ts#L478-L495) |
| `probe/empty-audio-wav` | structurally valid zero-sample PCM WAV | [src/scenarios/probe/index.ts:508-523](../../src/scenarios/probe/index.ts#L508-L523) |
| `probe/truncated-header-graceful` | clean reject or partial safe metadata within 15 seconds | [src/scenarios/probe/index.ts:533-553](../../src/scenarios/probe/index.ts#L533-L553) |

### Metadata normalization and golden comparison

Every adapter must return `NormalizedMetadata`: a container token, nullable seconds duration, ordered tracks, and optional string tags. A track carries a type and codec plus optional dimensions, fps, rotation, sample rate, channel count, bitrate, and language. The type can represent video, audio, subtitle, or other. [src/core/engine.ts:41-61](../../src/core/engine.ts#L41-L61)

The committed metadata goldens are derived with ffprobe. Baking canonicalizes ffprobe codec names such as `h264`, `hevc`, `aac`, and PCM variants, derives a container token partly from the asset suffix, chooses `avg_frame_rate` before `r_frame_rate`, rounds fps and duration to milliseconds, retains ffprobe stream order, and stores rotation, language, bitrate, and selected tags. HLS baking explicitly permits opening the playlist's sibling key and encrypted segments. [fixtures/bake.mjs:1587-1655](../../fixtures/bake.mjs#L1587-L1655) [fixtures/bake.mjs:1657-1711](../../fixtures/bake.mjs#L1657-L1711)

At comparison time, `golden-metadata` lowercases and trims the two container strings, applies a duration band, filters tracks only when scenario options request it, then pairs measured and golden tracks by absolute array position. It compares track type, raw normalized codec string, dimensions, fps, sample rate, and channels. It does not compare rotation, bitrate, language, tags, encryption scheme, or a measured duration when the golden duration is null. [src/core/oracles.ts:719-825](../../src/core/oracles.ts#L719-L825)

The default duration band is `1/24` second and the default fps band is `0.05`. TS, ADTS, HLS, specifically identified CBR/no-TOC MP3, and specifically identified recorder/headerless WebM use `max(0.5 s, 15% of golden duration)` unless a scenario explicitly supplies its own duration tolerance. [src/core/oracles.ts:154-178](../../src/core/oracles.ts#L154-L178) [src/core/oracles.ts:180-259](../../src/core/oracles.ts#L180-L259)

There is already a stronger codec vocabulary elsewhere: `canonicalCodecToken()` maps `avc1`/`avc3` to `h264`, `hev1`/`hvc1` to `hevc`, `mp4a` to `aac`, and Matroska `V_MPEG4/ISO/AVC` to `h264`. The reference-reimport structural comparator buckets tracks by type and applies that canonicalizer, but `golden-metadata` does neither. [src/core/box-readers.ts:46-115](../../src/core/box-readers.ts#L46-L115) [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375)

### Adapter probe paths

The scored engines all expose `probe`, but their cost and metadata source differ. See the linked engine pages for the full capability inventories.

| Engine | Implemented probe path | Repository evidence |
| --- | --- | --- |
| [Mediabunny](../engines/mediabunny.md) | opens an `Input`; tries header metadata duration before `computeDuration()`, enumerates tracks and tags, and disposes the input | [src/engines/mediabunny/adapter.ts:425-482](../../src/engines/mediabunny/adapter.ts#L425-L482) [src/engines/mediabunny/adapter.ts:1142-1150](../../src/engines/mediabunny/adapter.ts#L1142-L1150) |
| [ffmpeg.wasm](../engines/ffmpeg-wasm.md) | materializes input in MEMFS, runs `ffmpeg -i`, parses the logged Input block, and rounds duration to milliseconds | [src/engines/ffmpeg-wasm/adapter.ts:1890-1957](../../src/engines/ffmpeg-wasm/adapter.ts#L1890-L1957) |
| [Remotion](../engines/remotion.md) | the composite delegates probe to `@remotion/media-parser`; it requests metadata-only fields, but HLS, TS/ADTS fallbacks, or missing single-video fps can trigger demux/full parsing | [src/engines/remotion/adapter.ts:71-108](../../src/engines/remotion/adapter.ts#L71-L108) [src/engines/remotion-media-parser/adapter.ts:330-391](../../src/engines/remotion-media-parser/adapter.ts#L330-L391) |
| [MP4Box.js](../engines/mp4box.md) | accepts MP4/MOV only; reads the full `ArrayBuffer`, parses `moov` without retaining `mdat`, and normalizes the `onReady` info | [src/engines/mp4box/adapter.ts:630-681](../../src/engines/mp4box/adapter.ts#L630-L681) [src/engines/mp4box/adapter.ts:707-755](../../src/engines/mp4box/adapter.ts#L707-L755) |
| [web-demuxer](../engines/web-demuxer.md) | loads the unmutated URL into the worker, calls `getMediaInfo()` and `getAVStreams()`, then supplements TS AAC fields | [src/engines/web-demuxer/adapter.ts:618-665](../../src/engines/web-demuxer/adapter.ts#L618-L665) [src/engines/web-demuxer/adapter.ts:714-739](../../src/engines/web-demuxer/adapter.ts#L714-L739) |
| [aibrush-media](../engines/aibrush-media.md) | uses a fast HLS plan when applicable, otherwise selects a known-container or generic probe, maps capability misses to `NotApplicableError`, and canonicalizes common codec strings | [src/engines/aibrush-media/adapter.ts:92-159](../../src/engines/aibrush-media/adapter.ts#L92-L159) [src/engines/aibrush-media/adapter.ts:1153-1173](../../src/engines/aibrush-media/adapter.ts#L1153-L1173) [src/engines/aibrush-media/adapter.ts:3902-3921](../../src/engines/aibrush-media/adapter.ts#L3902-L3921) |

The capability gate checks each required operation, container, codec, encryption scheme, and feature token independently. Probe is deliberately parser-only, so its codec requirements do not invoke the browser WebCodecs configuration gate. This admits an engine whenever every token appears, even if the concrete combination is unsupported. [src/core/runner.ts:112-190](../../src/core/runner.ts#L112-L190) [src/core/runner.ts:191-227](../../src/core/runner.ts#L191-L227)

The hand-maintained disabled-cell list currently skips Remotion's large, huge, and massive VP9/WebM probes because fps extraction scans too much media, and skips Mediabunny's CENC-CTR probe because this build aborts on that fixture. These cells become `SKIPPED` before the adapter can communicate runtime applicability. [src/core/disabled-cells.ts:121-140](../../src/core/disabled-cells.ts#L121-L140) [src/core/disabled-cells.ts:209-217](../../src/core/disabled-cells.ts#L209-L217)

### Current verdict semantics

`OracleOutcome` is boolean (`pass`) and the result status union contains `PASS` and `FAIL` but no `DIFF`. The runner collapses the first non-bake-gap oracle mismatch to `FAIL`, maps all recognized golden gaps to `NA_ASSET`, and otherwise emits `PASS`. A valid representation that differs from ffprobe's baked representation therefore has no dedicated verdict. [src/core/scenario.ts:206-222](../../src/core/scenario.ts#L206-L222) [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463)

## Contracts and invariants

- **Engine independence.** A probe scenario declares operation, input, requirements, oracles, metrics, and tolerances; it never selects an engine. `defineScenario()` requires a namespaced id, at least one required operation, and at least one oracle. [src/core/scenario.ts:154-204](../../src/core/scenario.ts#L154-L204)
- **One normalized result per input.** A single-input probe returns one `NormalizedMetadata`; a multi-input probe executes inputs sequentially and preserves every `(input, metadata)` pair for property evaluation. [src/core/runner.ts:794-805](../../src/core/runner.ts#L794-L805)
- **Availability before execution.** Missing declared operation/container/codec/feature tokens short-circuit as `NA_ENGINE`. Because probe does not configure a codec, browser codec absence does not by itself produce `NA_BROWSER` for probe. [src/core/runner.ts:124-190](../../src/core/runner.ts#L124-L190) [src/core/runner.ts:209-227](../../src/core/runner.ts#L209-L227)
- **Runtime applicability signal.** An adapter error whose `name` is exactly `NotApplicableError` maps to `NA_ENGINE` in normal and graceful-failure execution. Other normal-path exceptions are `ERROR`, while normal-path timeouts are `FAIL`. [src/core/runner.ts:675-693](../../src/core/runner.ts#L675-L693) [src/core/runner.ts:1382-1394](../../src/core/runner.ts#L1382-L1394) [src/core/runner.ts:1552-1569](../../src/core/runner.ts#L1552-L1569)
- **Golden provenance and absence.** Metadata goldens are ffprobe-derived and loaded by asset id. A missing or unparsable metadata artifact leaves `golden.meta` undefined; the resulting canonical “no golden meta” outcome is translated to `NA_ASSET`, not treated as an engine defect. [fixtures/bake.mjs:1587-1711](../../fixtures/bake.mjs#L1587-L1711) [src/core/oracles.ts:52-116](../../src/core/oracles.ts#L52-L116) [src/core/runner.ts:858-888](../../src/core/runner.ts#L858-L888)
- **Current metadata equality.** Container tokens are case/whitespace normalized; track order is significant; codecs are only case/whitespace normalized; dimensions, sample rate, and channels are exact; fps and duration use the documented bands. Rotation, bitrate, language, tags, protection scheme, and golden-null/measured-present duration are not enforced. [src/core/oracles.ts:719-825](../../src/core/oracles.ts#L719-L825)
- **Correctness before speed.** The three probe throughput scenarios can benchmark only after their functional oracle has no real failure. One execution contributes one `ops` numerator. [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463) [src/core/runner.ts:1651-1667](../../src/core/runner.ts#L1651-L1667)
- **Graceful malformed input.** The truncated-header row passes on a clean rejection or on returned metadata because it explicitly sets `gracefulAllowOutput`; a timeout fails. This is probe-specific negative-test behavior, not permission for ordinary probe errors. [src/scenarios/probe/index.ts:525-553](../../src/scenarios/probe/index.ts#L525-L553) [src/core/oracles.ts:2664-2705](../../src/core/oracles.ts#L2664-L2705)
- **Declared coverage is not implemented coverage.** The source records absent assets for fragmented MP4/CMAF, AVI, FLV, 3GP/3G2, CAF, OGV, GIF-as-video, degenerate dimensions/rates, mislabeled content, 5.1 audio, and TS discontinuities. No scenario is registered for those entries today. [src/scenarios/probe/index.ts:568-604](../../src/scenarios/probe/index.ts#L568-L604)

## Target design and known gaps

### Target design

#### Three-way correctness

Replace the boolean oracle result with `PASS | DIFF | FAIL`. `PASS` means the observation meets the semantic and structural contract after documented normalization. `DIFF` means the output is valid but retains a legal representation difference from the ffmpeg-baked golden. `FAIL` is reserved for invalid, unusable, missing, or tolerance-violating metadata. Aggregation is `FAIL` if any oracle fails, otherwise `DIFF` if any oracle differs, otherwise `PASS`; `NA_ENGINE`, `NA_BROWSER`, and `NA_ASSET` remain cell availability states rather than oracle verdicts. Performance is allowed for `PASS` and `DIFF` because both are semantically valid, but reporting must preserve the `DIFF` badge and its raw observations.

Acceptance requires fixtures demonstrating all three paths: an exact canonical match is `PASS`; an `avc1` versus `h264` label or another legal presentation difference is `DIFF`; a wrong codec family, missing required track, impossible dimension, or excessive timing error is `FAIL`. The target must update the result schema, oracle return helpers, runner reduction, JSON serialization, and report/UI together; the current binary types prove that none of this is implemented yet. [src/core/scenario.ts:206-222](../../src/core/scenario.ts#L206-L222)

#### Semantic golden-metadata comparison

The target comparator first canonicalizes the codec family while preserving the raw label for `DIFF` diagnostics. It must map `avc1` and `avc3` to `h264`, `hev1` and `hvc1` to `hevc`, Matroska `V_MPEG4/ISO/AVC` to `h264`, and `mp4a` to `aac`. These aliases are supported by the [W3C WebCodecs Codec Registry](https://www.w3.org/TR/webcodecs-codec-registry/#video-codec-registry), while the Matroska codec id is defined by the [IETF CELLAR codec mapping](https://datatracker.ietf.org/doc/html/draft-ietf-cellar-codec-19#section-3.3.13). The repository's `canonicalCodecToken()` already implements these family mappings and should become the shared comparator boundary instead of remaining confined to output structure checks. [src/core/box-readers.ts:46-115](../../src/core/box-readers.ts#L46-L115)

Tracks must be matched within type buckets, not by absolute array index. Within a bucket, use deterministic minimum-cost matching over canonical codec, dimensions or audio properties, language when present, and then stable ordinal as a tie-breaker. A reordered video/audio list is therefore `DIFF` at most; a missing audio track, extra media track, or incompatible same-type track is `FAIL`. This reflects the fact that ISO BMFF and Matroska model independent typed tracks, and Matroska identifies the codec on each `TrackEntry` rather than imposing ffprobe's stream-array order. See [ISO/IEC 14496-12](https://www.iso.org/standard/85596.html) and the [Matroska Codec Mapping introduction](https://datatracker.ietf.org/doc/html/draft-ietf-cellar-codec-19#section-3).

AAC comparison must distinguish decoder output properties from core coding properties. When AudioSpecificConfig or equivalent parsed signaling proves SBR, base sample rate and twice-base output rate are semantically equal; when it proves Parametric Stereo, a mono core and stereo reconstructed output are semantically equal. The target normalized track therefore needs explicit AAC profile/SBR/PS evidence rather than applying a blanket `×2` or `1↔2` exception to every AAC file. ETSI documents that Parametric Stereo carries a mono HE-AAC signal plus stereo-image data and that SBR output can be twice the AAC-core sampling rate in [TS 102 005, Annex A.4.1](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf). A signaled HE-AAC fixture must yield `DIFF`, not `FAIL`, for those two legal observation pairs; an unsignaled arbitrary sample-rate or channel mismatch must still fail.

Frame-rate comparison must preserve rational/measurement context. Recognize the exact NTSC families `24000/1001`, `30000/1001`, and `60000/1001` and their conventional rounded decimals; Apple explicitly distinguishes `30/1.001` from the approximation `29.97` in [TN2162](https://developer.apple.com/library/archive/technotes/tn2162/_index.html). Mark a track as CFR or VFR when the parser can establish it. For CFR, compare rational rates or use a narrow rounding band. For VFR, compare duration-weighted average rate with `max(0.1 fps, 0.5% of the golden average)` while requiring both observations to remain VFR; FFmpeg itself documents `avg_frame_rate` separately and warns that `r_frame_rate` is a guess in [`AVStream`](https://ffmpeg.org/doxygen/trunk/structAVStream.html). A rate inside the semantic band but represented differently is `DIFF`; outside it is `FAIL`.

Duration must compare the presented timeline, not blindly compare one rounded format duration. Preserve the existing estimate-only treatment for TS, ADTS, HLS, no-TOC MP3, and headerless WebM, but attach the reason to the result. For ISO BMFF/MOV, normalize edit lists, AAC priming/remainder, and movie/media timebase conversion before comparison; if full normalization is unavailable, use a narrowly derived band of at least one display-frame duration, the signaled priming/remainder duration, and one tick of each participating timebase. W3C's ISO BMFF byte-stream note requires handling a single `edts/elst` mapping and recognizes in-band versus out-of-band codec configuration in [Initialization Segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#init-segments). Apple explains that AAC edit lists exclude encoder delay/remainder and that differing movie and media timescales may not be sample-accurate in [Using track structures to represent encoder delay explicitly](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly). This is a targeted widening, not a global relaxation.

The comparator must also enforce fields that the golden already carries: rotation, language, and selected tags when the scenario declares them; protection scheme when the normalized schema is extended to carry it; and both directions of nullable duration. If a scenario intentionally accepts “unknown duration,” that policy must be explicit in its options, not an accidental consequence of a null golden.

#### Applicability and scalable probing

Keep the cheap token gate, then require each adapter to reject a known unsupported concrete tuple with `NotApplicableError`. The tuple includes operation, container, codec/profile, protection scheme, required metadata fields, and an adapter-declared practical size/read mode. The runner already maps this signal to `NA_ENGINE`; target work is mainly adapter preflight and deletion of matching disabled cells. [src/core/runner.ts:686-693](../../src/core/runner.ts#L686-L693) [src/core/runner.ts:1382-1394](../../src/core/runner.ts#L1382-L1394)

Concretely, Mediabunny must recognize this build's unsupported CENC-CTR probe before its parser abort and throw `NotApplicableError`; Remotion's composite and `remotion-media-parser` layer must throw it when the requested probe fields force an unsupported full scan at the declared scale. Once runtime routing is verified as `NA_ENGINE`, remove `probe/cenc_ctr` and the three VP9/WebM scale rows from `disabled-cells.ts`. The official Remotion documentation distinguishes metadata-only fields from full-file `slowFps` and advises reading as little as possible in [Fast and slow operations](https://www.remotion.dev/docs/media-parser/fast-and-slow); the adapter currently crosses that boundary when metadata fps is absent. [src/engines/remotion-media-parser/adapter.ts:340-391](../../src/engines/remotion-media-parser/adapter.ts#L340-L391)

Probe at scale should be range/progressive by contract, with actual source-read telemetry or an explicit complexity assertion. Mediabunny's metadata-first duration path follows the official distinction between approximate metadata duration and full `computeDuration()` in [Reading media files](https://mediabunny.dev/guide/reading-media-files#reading-file-metadata). MP4Box.js officially supports progressive parsing and calls `onReady` once `moov` is parsed in [Getting Information](https://github.com/gpac/mp4box.js#getting-information); the adapter should stop materializing a multi-gigabyte `ArrayBuffer` merely to discard `mdat`. The scale scenarios pass only when required fields are correct and the adapter stays within its declared range-read/byte budget; an engine that fundamentally lacks that probe mode is `NA_ENGINE`, not `SKIPPED`, `ERROR`, or a timeout.

#### Property and HLS contracts

Replace `metamorphic-duration-across-containers` with genuinely content-equivalent wrappers and compare each engine's measured durations to each other as well as to their own goldens. Verification records both per-input golden deltas and the maximum cross-wrapper delta. The current 30-second MP4 and 10-second MKV are not equivalent, so the target fixture bake must produce wrappers from one elementary-stream source before this scenario can claim a container invariant. [src/scenarios/probe/index.ts:430-464](../../src/scenarios/probe/index.ts#L430-L464)

Define headerless duration explicitly: `null` is `PASS` when the scenario permits unknown duration; a finite value is `PASS` or `DIFF` only when non-negative, finite, and within a content-derived bound; NaN, infinity, a negative value, or a value outside that bound is `FAIL`. This removes the impossible dependency on a null golden and directly verifies “sane if present.”

Split HLS observations by what the playlist itself can prove. The VOD duration is the sum of media-segment durations according to [RFC 8216 §4.1](https://www.rfc-editor.org/rfc/rfc8216.html#section-4.1), and `EXT-X-KEY` identifies encryption according to [§4.3.2.4](https://www.rfc-editor.org/rfc/rfc8216.html#section-4.3.2.4); codec and track details generally require a master-playlist declaration or parsing media segments. If AES-128 media must be decrypted to inspect the first segment, call that a protected-segment probe and require the key. If a row is intended to be key-free, restrict it to playlist-derived duration and protection signaling. Verification must deny key access and prove that only the key-free contract remains asserted.

### Known gaps

1. **Binary verdict conflates difference and wrongness.** Current: `OracleOutcome.pass` is boolean and `ResultStatus` has no `DIFF`; every non-bake mismatch becomes `FAIL`. Consequence: legal codec labels, rate representations, track order, or timing expressions can look truly wrong. Target: implement the three-way reducer above and retain raw-versus-canonical details. Verification: exact, legal-different, and invalid fixtures produce `PASS`, `DIFF`, and `FAIL` respectively. [src/core/scenario.ts:206-222](../../src/core/scenario.ts#L206-L222) [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463)

2. **Golden metadata uses raw, positional equality.** Current: codecs are compared as lowercased strings, tracks by array index, sample rate/channels exactly, and fps with one absolute scalar band. Consequence: `avc1`/`avc3`, `hev1`/`hvc1`, Matroska codec ids, `mp4a`, reordered typed tracks, HE-AAC/SBR rates, Parametric Stereo channel observations, VFR, and NTSC rounding can false-fail. Target: use shared codec canonicalization, type-bucket matching, signaled AAC equivalence, and rational/VFR-aware bands following the [WebCodecs codec registry](https://www.w3.org/TR/webcodecs-codec-registry/), [ETSI HE-AAC description](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf), and [FFmpeg `AVStream`](https://ffmpeg.org/doxygen/trunk/structAVStream.html). Verification: focused comparator tests cover every required alias and equivalence without accepting an unrelated mismatch. [src/core/oracles.ts:768-812](../../src/core/oracles.ts#L768-L812) [src/core/box-readers.ts:46-115](../../src/core/box-readers.ts#L46-L115)

3. **Duration tolerance lacks edit-list, priming, and timebase semantics.** Current: precise containers receive a fixed `1/24` second band while a named loose set receives `max(0.5 s, 15%)`. Consequence: a legal presented duration can differ because of an edit list, AAC priming/remainder, or timescale rounding without belonging to the loose container set. Target: compare the presented timeline and derive a narrow evidence-based band using edit/priming/timebase facts, as described by [W3C ISO BMFF initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#init-segments) and [Apple's AAC encoder-delay guidance](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly). Verification: paired MP4s with and without a semantically equivalent edit/priming representation do not `FAIL`, while a duration beyond the derived band does. [src/core/oracles.ts:154-259](../../src/core/oracles.ts#L154-L259)

4. **The advertised cross-container property is not cross-container.** Current: the scenario inputs differ in duration and the oracle independently compares each to its own golden. Consequence: the row can pass without establishing wrapper invariance. Target: bake identical-content wrappers and compute an explicit inter-input delta. Verification: deliberately shift one wrapper's presented duration while updating neither source nor golden; the cross-wrapper comparison must fail. [src/scenarios/probe/index.ts:430-464](../../src/scenarios/probe/index.ts#L430-L464) [src/core/oracles.ts:3942-3998](../../src/core/oracles.ts#L3942-L3998)

5. **The headerless “sane duration” property has no reference.** Current: its golden duration is null and the property oracle rejects a null reference, which the runner maps to `NA_ASSET`. Consequence: neither a sane finite estimate nor an absurd one is graded. Target: implement the explicit unknown-or-finite predicate above. Verification: null and a bounded finite duration pass, while NaN, negative, infinite, and out-of-bound values fail. [fixtures/golden/recorder_headerless.webm.meta.json:1-17](../../fixtures/golden/recorder_headerless.webm.meta.json#L1-L17) [src/core/oracles.ts:3961-3967](../../src/core/oracles.ts#L3961-L3967)

6. **Declared metadata fields are not all asserted.** Current: baking retains rotation, language, bitrate, and selected tags, but `compareTrack()` omits rotation, bitrate, and language; the outer comparator omits tags and protection scheme and accepts golden-null/measured-present duration. Consequence: rotation, language, tag, encryption, or fabricated-duration defects can pass. Target: scenario-declared field policies plus a normalized protection field; compare both nullability directions. Verification: mutate each golden-backed field independently and observe `FAIL`; omit an undeclared optional field and observe no false failure. [fixtures/bake.mjs:1671-1711](../../fixtures/bake.mjs#L1671-L1711) [src/core/oracles.ts:719-825](../../src/core/oracles.ts#L719-L825)

7. **Coarse capability tokens leak concrete misses into disabled cells or failures.** Current: negotiation intersects independent token lists; Remotion's three VP9/WebM scale rows and Mediabunny's CENC-CTR row are hand-skipped. Consequence: unsupported combinations are not consistently represented as `NA_ENGINE`, and the disabled list grows with scenario ids. Target: concrete adapter preflight and `NotApplicableError` in Mediabunny, Remotion, and its media-parser layer, then remove those four cells. Verification: enable all four rows; each unsupported cell returns `NA_ENGINE` with a tuple-specific reason and no page error, timeout, `ERROR`, or `SKIPPED`. [src/core/runner.ts:112-190](../../src/core/runner.ts#L112-L190) [src/core/disabled-cells.ts:121-140](../../src/core/disabled-cells.ts#L121-L140) [src/core/disabled-cells.ts:209-217](../../src/core/disabled-cells.ts#L209-L217)

8. **The AES-128 HLS row overclaims key-free track probing.** Current: scenario prose says no key is needed, but the playlist has only `EXTINF` and `EXT-X-KEY`; aibrush resolves an encrypted probe source, ffmpeg.wasm materializes all sidecars, and the golden bake enables the key and crypto protocol. Consequence: the row does not distinguish playlist-only metadata from decrypted segment metadata. Target: split or narrow the contract according to [RFC 8216 playlist and key semantics](https://www.rfc-editor.org/rfc/rfc8216.html#section-4.3.2.4). Verification: run with the key fetch denied; a playlist-only row still verifies duration/protection, while a track-detail row is `NA_ASSET` or cleanly requires the key. [fixtures/media/hls_aes128.m3u8:1-17](../../fixtures/media/hls_aes128.m3u8#L1-L17) [src/scenarios/probe/index.ts:142-154](../../src/scenarios/probe/index.ts#L142-L154) [src/engines/aibrush-media/adapter.ts:3343-3400](../../src/engines/aibrush-media/adapter.ts#L3343-L3400) [src/engines/ffmpeg-wasm/adapter.ts:1854-1883](../../src/engines/ffmpeg-wasm/adapter.ts#L1854-L1883) [fixtures/bake.mjs:1657-1668](../../fixtures/bake.mjs#L1657-L1668)

9. **Scale labels do not prove cheap probing.** Current: scenarios describe header-only/lazy behavior, yet MP4Box materializes the whole input before discarding `mdat`, ffmpeg.wasm copies the whole input into MEMFS, and Remotion may request `slowFps`. Consequence: a correctness pass can still use O(file-size) reads and memory, while the three Remotion WebM rows are simply skipped. Target: range/progressive contracts and source-read/peak-memory budgets grounded in [Mediabunny's metadata duration API](https://mediabunny.dev/guide/reading-media-files#reading-file-metadata), [MP4Box.js progressive parsing](https://github.com/gpac/mp4box.js#getting-information), and [Remotion field tiers](https://www.remotion.dev/docs/media-parser/fast-and-slow). Verification: large through massive rows record bounded header/range reads where the format permits; otherwise the adapter returns `NA_ENGINE` before bulk allocation. [src/engines/mp4box/adapter.ts:707-755](../../src/engines/mp4box/adapter.ts#L707-L755) [src/engines/ffmpeg-wasm/adapter.ts:1854-1865](../../src/engines/ffmpeg-wasm/adapter.ts#L1854-L1865) [src/engines/remotion-media-parser/adapter.ts:381-391](../../src/engines/remotion-media-parser/adapter.ts#L381-L391)

10. **Coverage declarations are not executable coverage.** Current: fragmented MP4/CMAF, AVI, FLV, 3GP/3G2, CAF, OGV, GIF-as-video, 1×1/0×0, 1/240 fps, mislabeled content, 5.1 audio, and TS discontinuity exist only in a source comment. Consequence: no matrix cell can reveal regressions on those axes. Target: add deterministic assets, manifest entries, ffprobe metadata goldens, and registered scenarios only when at least one engine can contest each row; fMP4 initialization/media behavior should follow [W3C's ISO BMFF segment definitions](https://www.w3.org/TR/mse-byte-stream-format-isobmff/), and TS discontinuities should follow [RFC 8216 segment continuity rules](https://www.rfc-editor.org/rfc/rfc8216.html#section-3). Verification: every declared item moves either to a real scenario with a present golden or to an explicitly versioned out-of-scope decision; no permanent missing-asset row is added. [src/scenarios/probe/index.ts:568-604](../../src/scenarios/probe/index.ts#L568-L604)

## Sources

### Repository evidence

- [src/scenarios/probe/index.ts:52-354](../../src/scenarios/probe/index.ts#L52-L354) — 44 generated golden-metadata declarations and their common mapping.
- [src/scenarios/probe/index.ts:356-428](../../src/scenarios/probe/index.ts#L356-L428) — three at-scale `opsPerSec` declarations.
- [src/scenarios/probe/index.ts:430-564](../../src/scenarios/probe/index.ts#L430-L564) — property, empty-container, truncated-header, and final export declarations.
- [src/scenarios/probe/index.ts:568-620](../../src/scenarios/probe/index.ts#L568-L620) — declared but unregistered corpus and oracle gaps.
- [src/scenarios/index.ts:18-71](../../src/scenarios/index.ts#L18-L71) — family inclusion, flattening, uniqueness check, and registration.
- [src/core/scenario.ts:17-31](../../src/core/scenario.ts#L17-L31) — capability-requirement vocabulary.
- [src/core/scenario.ts:154-222](../../src/core/scenario.ts#L154-L222) — scenario validation and current result/oracle types.
- [src/core/engine.ts:41-61](../../src/core/engine.ts#L41-L61) — normalized track and metadata shapes.
- [src/core/runner.ts:112-227](../../src/core/runner.ts#L112-L227) — per-token negotiation and parser-only probe gating.
- [src/core/runner.ts:686-693](../../src/core/runner.ts#L686-L693) — runtime `NotApplicableError` recognition.
- [src/core/runner.ts:794-805](../../src/core/runner.ts#L794-L805) — single- and multi-input probe dispatch.
- [src/core/runner.ts:1331-1468](../../src/core/runner.ts#L1331-L1468) — functional execution, oracle reduction, status mapping, and benchmark gate.
- [src/core/runner.ts:1522-1625](../../src/core/runner.ts#L1522-L1625) — graceful-failure execution and verdict mapping.
- [src/core/runner.ts:1628-1691](../../src/core/runner.ts#L1628-L1691) — measured iteration and one-op numerator.
- [src/core/oracles.ts:52-116](../../src/core/oracles.ts#L52-L116) — tolerant golden loading.
- [src/core/oracles.ts:154-259](../../src/core/oracles.ts#L154-L259) — current fps and duration tolerances.
- [src/core/oracles.ts:719-825](../../src/core/oracles.ts#L719-L825) — current golden-metadata comparator.
- [src/core/oracles.ts:3942-3998](../../src/core/oracles.ts#L3942-L3998) — current probe-duration property.
- [src/core/box-readers.ts:46-115](../../src/core/box-readers.ts#L46-L115) — existing canonical codec vocabulary.
- [fixtures/bake.mjs:1587-1711](../../fixtures/bake.mjs#L1587-L1711) — ffprobe metadata-golden normalization and HLS input policy.
- [fixtures/golden/recorder_headerless.webm.meta.json:1-17](../../fixtures/golden/recorder_headerless.webm.meta.json#L1-L17) — null reference duration for the headerless fixture.
- [src/core/disabled-cells.ts:121-140](../../src/core/disabled-cells.ts#L121-L140) — Remotion scale-probe skips.
- [src/core/disabled-cells.ts:209-217](../../src/core/disabled-cells.ts#L209-L217) — Mediabunny CENC-CTR probe skip.
- [src/engines/mediabunny/adapter.ts:425-482](../../src/engines/mediabunny/adapter.ts#L425-L482) — metadata-first duration, track, and tag normalization.
- [src/engines/ffmpeg-wasm/adapter.ts:1890-1957](../../src/engines/ffmpeg-wasm/adapter.ts#L1890-L1957) — log-based ffmpeg.wasm probe.
- [src/engines/remotion-media-parser/adapter.ts:330-391](../../src/engines/remotion-media-parser/adapter.ts#L330-L391) — metadata tier and full-parse fallbacks.
- [src/engines/mp4box/adapter.ts:707-755](../../src/engines/mp4box/adapter.ts#L707-L755) — MP4Box whole-buffer probe with discarded `mdat`.
- [src/engines/web-demuxer/adapter.ts:714-739](../../src/engines/web-demuxer/adapter.ts#L714-L739) — URL/Blob loading and media-info probe.
- [src/engines/aibrush-media/adapter.ts:92-159](../../src/engines/aibrush-media/adapter.ts#L92-L159) — typed runtime applicability mapping.
- [src/engines/aibrush-media/adapter.ts:3343-3400](../../src/engines/aibrush-media/adapter.ts#L3343-L3400) — playlist duration plus encrypted first-segment HLS probe.

### External authorities

- World Wide Web Consortium, [WebCodecs Codec Registry, Audio and Video Codec Registries](https://www.w3.org/TR/webcodecs-codec-registry/), accessed 2026-07-16 — maps `mp4a.*` to AAC, `avc1.*`/`avc3.*` to AVC, and `hev1.*`/`hvc1.*` to HEVC.
- World Wide Web Consortium, [WebCodecs](https://www.w3.org/TR/webcodecs/), accessed 2026-07-16 — defines browser codec configuration and coded-frame primitives; it does not supply a container demux contract.
- ISO/IEC, [ISO/IEC 14496-12, ISO base media file format](https://www.iso.org/standard/85596.html), accessed 2026-07-16 — authoritative base-media container and timing model.
- World Wide Web Consortium, [ISO BMFF Byte Stream Format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/), accessed 2026-07-16 — openly describes `ftyp`/`moov`, edit-list handling, fragments, and in-band/out-of-band codec configuration.
- IETF CELLAR Working Group, [Matroska Media Container Codec Specifications, draft-ietf-cellar-codec-19](https://datatracker.ietf.org/doc/html/draft-ietf-cellar-codec-19), accessed 2026-07-16 — defines per-track CodecID mappings including `V_MPEG4/ISO/AVC`; cited as an active work in progress.
- ETSI, [TS 102 005 V1.2.1, Annex A.4.1, HE-AAC v2](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf), accessed 2026-07-16 — explains SBR's doubled output sampling rate and Parametric Stereo's mono-core/stereo-output behavior.
- Apple, [Technical Note TN2162, TimeScale and frame-rate guidance](https://developer.apple.com/library/archive/technotes/tn2162/_index.html), accessed 2026-07-16 — distinguishes exact `30/1.001` timing from decimal approximations and explains movie/media timescales.
- Apple, [Using track structures to represent encoder delay explicitly](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly), accessed 2026-07-16 — explains AAC priming/remainder, edit lists, and movie-versus-media-timescale rounding.
- FFmpeg Project, [`AVStream` structure reference](https://ffmpeg.org/doxygen/trunk/structAVStream.html), accessed 2026-07-16 — distinguishes average frame rate from the guessed real-base frame rate.
- RFC Editor, [RFC 8216, HTTP Live Streaming](https://www.rfc-editor.org/rfc/rfc8216.html), accessed 2026-07-16 — defines playlist duration, segment continuity, `EXTINF`, and `EXT-X-KEY` semantics.
- World Wide Web Consortium, [MPEG-2 TS Byte Stream Format](https://www.w3.org/TR/mse-byte-stream-format-mp2t/), accessed 2026-07-16 — documents timestamp rollover and discontinuity handling for MPEG-2 transport streams.
- Mediabunny, [Reading media files](https://mediabunny.dev/guide/reading-media-files), accessed 2026-07-16 — distinguishes approximate metadata duration from full duration computation and documents track metadata queries.
- Remotion, [Media Parser: Fast and slow operations](https://www.remotion.dev/docs/media-parser/fast-and-slow), accessed 2026-07-16 — distinguishes header-only, metadata-only, and full-file fields and explains the need for HTTP Range support.
- GPAC, [MP4Box.js: Getting Information](https://github.com/gpac/mp4box.js#getting-information), accessed 2026-07-16 — documents progressive parsing and metadata readiness after `moov` parsing.
- bilibili, [web-demuxer](https://github.com/bilibili/web-demuxer), accessed 2026-07-16 — official project source for browser/WASM multi-format demux and media-info APIs.
- ffmpeg.wasm, [FFmpeg class API](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/), accessed 2026-07-16 — official browser-WASM execution and virtual-filesystem API surface used by the adapter.
