# Demux

> Scope: This page owns packet-observation scenarios for container demultiplexing; shared runner, oracle, fixture, and adapter machinery is linked at the boundary rather than specified here.
> Phase-2 owner: p2_feature_demux.

## Purpose

The demux family asks whether an engine can turn a media input into the right track topology and coded-packet timeline without decoding or rewriting the media. It exercises generated and real-world inputs across container, codec, timing, track-count, encryption, scale, empty-input, malformed-input, and index-metadata axes. A passing result is intended to mean that packets were neither lost, invented, reordered incorrectly, nor assigned to the wrong track.

This is also the family in which the distinction between [semantic equivalence](../glossary.md#semantic-equivalence) and a [representation difference](../glossary.md#representation-difference) matters most. Container parsers may expose the same access units using different legal framing, parameter-set placement, grouping, timestamp origins, or codec labels. The current implementation does not fully preserve that distinction; the target contract below does.

## As-built

### Registration and execution path

`demuxScenarios` is exported as one array containing the core corpus, size ladder, empty-audio row, malformed-input rows, and FLAC metamorphic-intent row. The family is included both in the eager all-scenario index and in the app's lazy family wiring; duplicate scenario ids are rejected during shared registration. [src/scenarios/demux/index.ts:524-530](../../src/scenarios/demux/index.ts#L524-L530) [src/scenarios/index.ts:18-35](../../src/scenarios/index.ts#L18-L35) [src/scenarios/index.ts:49-71](../../src/scenarios/index.ts#L49-L71) [src/app/register.ts:94-103](../../src/app/register.ts#L94-L103) [src/core/registry.ts:43-51](../../src/core/registry.ts#L43-L51)

Each ordinary row declares operation `demux`, one corpus asset, atomic capability requirements, the `golden-packets` [oracle](../glossary.md#oracle), and normally the `wall` metric. `defineScenario` derives the family from the id and verifies that the row has an operation requirement and at least one oracle. [src/scenarios/demux/index.ts:256-274](../../src/scenarios/demux/index.ts#L256-L274) [src/core/scenario.ts:183-204](../../src/core/scenario.ts#L183-L204)

For one engine × scenario × browser cell, the runner checks the asset, negotiates declared capabilities, initializes the adapter, builds `MediaInput`, calls `engine.demux(input)` under a timeout, loads the input-keyed [golden](../glossary.md#golden), and runs the row's oracles. Only a correctness `PASS` reaches performance measurement. [src/core/runner.ts:1296-1338](../../src/core/runner.ts#L1296-L1338) [src/core/runner.ts:1358-1409](../../src/core/runner.ts#L1358-L1409) [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463)

The adapter boundary returns `DemuxResult { metadata, packets }`. A packet currently has only `trackIndex`, byte `size`, presentation and decode timestamps in microseconds, and a `keyframe` boolean; it contains neither packet bytes nor an access-unit/configuration description. [src/core/engine.ts:41-74](../../src/core/engine.ts#L41-L74) The input contract offers a URL, Blob, or whole `ArrayBuffer`, so range/lazy access is possible but not required by the interface. [src/core/engine.ts:13-26](../../src/core/engine.ts#L13-L26)

### Registered scenario inventory

The family currently registers 43 scenarios. The table inventories every stable id; ids without an explicit name are generated from the asset stem. [src/scenarios/demux/index.ts:52-64](../../src/scenarios/demux/index.ts#L52-L64) [src/scenarios/demux/index.ts:256-274](../../src/scenarios/demux/index.ts#L256-L274)

| Axis | Registered scenario ids | What the declaration varies |
| --- | --- | --- |
| ISO BMFF: ordinary, timing, and tracks | `demux/h264_1080p_30s`, `demux/realworld_mdn_flower_mp4`, `demux/h264_bframes_1080p`, `demux/h264_vfr`, `demux/h264_multitrack`, `demux/h264_1080p_5s` | MP4/MOV; generated and downloaded media; explicit DTS requirement for real-world/B-frame/VFR paths; multiple tracks. [src/scenarios/demux/index.ts:64-101](../../src/scenarios/demux/index.ts#L64-L101) |
| WebM/Matroska | `demux/vp9_1080p_10s`, `demux/realworld_mdn_flower_webm`, `demux/vp8_720p_10s`, `demux/av1_720p_5s`, `demux/h264_in_mkv` | VP9/Opus, VP8/Vorbis, AV1/Opus, and H.264/AAC, including a read-side-only AV1 requirement. [src/scenarios/demux/index.ts:103-124](../../src/scenarios/demux/index.ts#L103-L124) |
| MPEG transport | `demux/h264_ts`, `demux/hls_vod`, `demux/hls_aes128` | Standalone MPEG-TS plus plain and AES-128 HLS playlists; the encrypted row requires `hls-aes128`. [src/scenarios/demux/index.ts:126-133](../../src/scenarios/demux/index.ts#L126-L133) [src/scenarios/demux/index.ts:176-196](../../src/scenarios/demux/index.ts#L176-L196) |
| Video edge representations | `demux/hevc_1080p_10s`, `demux/h264_4k_10s`, `demux/h264_rotated90`, `demux/vp9_alpha` | HEVC configuration, 4K packet sizes, display-matrix rotation, and WebM alpha side data. [src/scenarios/demux/index.ts:140-174](../../src/scenarios/demux/index.ts#L140-L174) |
| Compressed audio | `demux/aac_adts`, `demux/opus`, `demux/flac_seektable`, `demux/flac_noseektable`, `demux/mp3_xing`, `demux/realworld_mdn_trex_mp3`, `demux/mp3_cbr_notoc` | ADTS, Ogg/Opus, FLAC with and without SEEKTABLE, and MP3 with Xing, downloaded, and CBR/no-TOC forms. [src/scenarios/demux/index.ts:135-138](../../src/scenarios/demux/index.ts#L135-L138) [src/scenarios/demux/index.ts:198-227](../../src/scenarios/demux/index.ts#L198-L227) |
| PCM containers | `demux/wav_s16`, `demux/wav_s24`, `demux/wav_f32`, `demux/pcm_s16be` | Little-endian 16-bit, packed 24-bit, and float WAV plus big-endian AIFF PCM. [src/scenarios/demux/index.ts:228-253](../../src/scenarios/demux/index.ts#L228-L253) |
| Micro/tiny scale | `demux/size_micro_micro_h264_1frame`, `demux/size_micro_micro_audio_short`, `demux/size_tiny_tiny_h264_360p_2s`, `demux/size_tiny_tiny_vp9_360p_2s` | One-frame video, short primed AAC, and small two-track MP4/WebM. [src/scenarios/demux/index.ts:295-329](../../src/scenarios/demux/index.ts#L295-L329) |
| Large/huge/massive scale | `demux/size_large_large_h264_1080p_120s`, `demux/size_large_large_vp9_1080p_120s`, `demux/size_huge_huge_h264_1080p_600s`, `demux/size_massive_massive_h264_1080p_2h` | Long MP4, WebM, and MOV walks. These rows request `wall`, `peakMemory`, and `longtasks`; large uses 120 s, while huge/massive use 600 s operation timeouts. [src/scenarios/demux/index.ts:289-293](../../src/scenarios/demux/index.ts#L289-L293) [src/scenarios/demux/index.ts:330-403](../../src/scenarios/demux/index.ts#L330-L403) |
| Empty valid input | `demux/empty_audio_zero_packets` | A valid empty WAV whose packet golden is empty. [src/scenarios/demux/index.ts:405-420](../../src/scenarios/demux/index.ts#L405-L420) |
| Malformed input | `demux/graceful_zero_length`, `demux/graceful_truncated_h264`, `demux/graceful_mp4_header_destroyed`, `demux/graceful_webm_header_destroyed` | Zero-length and damaged headers under a 15 s timeout; only truncated H.264 explicitly allows safe returned output. [src/scenarios/demux/index.ts:422-492](../../src/scenarios/demux/index.ts#L422-L492) |
| Metamorphic intent | `demux/metamorphic_flac_seektable_invariance` | Demuxes the no-SEEKTABLE FLAC against that file's own packet golden. It does not execute both inputs or compare them directly. [src/scenarios/demux/index.ts:494-520](../../src/scenarios/demux/index.ts#L494-L520) |

The declaration header also records deliberate omissions: AVI, FLV, 3GP, CAF, fragmented/CMAF input, AAC-vs-ADTS, timestamp wrap/discontinuity, gapless-delay, mislabeled-container, and demux-after-mux coverage lack an asset, a suitable property oracle, or both. They are not silently represented by unrelated rows. [src/scenarios/demux/index.ts:33-44](../../src/scenarios/demux/index.ts#L33-L44)

### Golden construction and present comparison

The flat fixture baker asks `ffprobe` for `stream_index`, `size`, `pts_time`, `dts_time`, and `flags`, converts times to integer microseconds, uses PTS when DTS is absent, and persists exactly those five normalized fields. [fixtures/bake.mjs:1714-1730](../../fixtures/bake.mjs#L1714-L1730) Scenario-specific real files use the same shape and are packet-baked automatically for the demux family. [fixtures/bake-scenario-goldens.mjs:170-179](../../fixtures/bake-scenario-goldens.mjs#L170-L179) [fixtures/bake-scenario-goldens.mjs:374-399](../../fixtures/bake-scenario-goldens.mjs#L374-L399)

The current packet comparator is inter-track-order independent: it groups by numerical `trackIndex`, sorts each track by DTS then PTS, and compares positions. Packet count and the multiset of numeric track indices must match. Within each track, byte size and keyframe flag must match exactly; PTS and DTS may differ by one constant per-track origin offset, but residual drift is limited by the scenario's seek tolerance, 1 ms by default. [src/core/oracles.ts:835-926](../../src/core/oracles.ts#L835-L926) [src/core/oracles.ts:154-178](../../src/core/oracles.ts#L154-L178)

There are two format-specific relaxations. WAV PCM uses equal total bytes per numeric track, first-PTS tolerance, and duration tolerance instead of exact packet boundaries. Ogg/Opus anchors timestamp alignment at packet 1 and ignores drift on packet 0, while still requiring exact count, size, and keyframe fields. [src/core/oracles.ts:972-1063](../../src/core/oracles.ts#L972-L1063)

`golden-packets` otherwise emits a boolean outcome: any comparator difference is `pass: false`. The result vocabulary contains `PASS` and `FAIL` but no `DIFF`; the runner turns the first non-gap false outcome into cell `FAIL`. [src/core/scenario.ts:206-222](../../src/core/scenario.ts#L206-L222) [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447)

Although every demux result carries normalized metadata, ordinary demux rows declare only `golden-packets`. The packet oracle consults metadata only to choose its WAV PCM and Ogg/Opus branches; it does not generally compare container, track codec, dimensions, rate, channels, or duration. [src/scenarios/demux/index.ts:256-274](../../src/scenarios/demux/index.ts#L256-L274) [src/core/oracles.ts:972-1063](../../src/core/oracles.ts#L972-L1063)

The separate current `golden-metadata` comparator lowercases but otherwise compares container and codec labels literally, compares filtered tracks positionally, permits fps drift of 0.05 by default, and requires exact sample rate and channel count. Its duration policy is strict by default but widens estimate-only TS, ADTS, HLS, selected MP3, and recorder-WebM cases to the greater of 0.5 s or 15%. [src/core/oracles.ts:719-825](../../src/core/oracles.ts#L719-L825) [src/core/oracles.ts:180-260](../../src/core/oracles.ts#L180-L260) By contrast, the reference re-import path already counts tracks by type and canonicalizes recognized codec tokens; the shared byte reader maps `avc1`/`avc3`, `hev1`/`hvc1`, `mp4a`, and Matroska `V_MPEG4/ISO/AVC` to the suite vocabulary. [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375) [src/core/box-readers.ts:43-118](../../src/core/box-readers.ts#L43-L118)

### Adapter observations

All scored engines implement the same scalar result, but they reach it differently. The differences below are observable inputs to oracle design, not permission to weaken correctness per engine.

| Adapter | Present demux observation path |
| --- | --- |
| Mediabunny | Iterates each track with `EncodedPacketSink.packets()` in decode order, verifies key packets, reports packet byte length and PTS, and sets DTS equal to PTS because its packet abstraction does not expose DTS. [src/engines/mediabunny/adapter.ts:1152-1192](../../src/engines/mediabunny/adapter.ts#L1152-L1192) |
| MP4Box | Restricts input to ISO BMFF MP4/MOV, extracts sample-table size, CTS, DTS, timescale, and sync flag, then sorts globally by DTS. [src/engines/mp4box/adapter.ts:630-680](../../src/engines/mp4box/adapter.ts#L630-L680) [src/engines/mp4box/adapter.ts:758-804](../../src/engines/mp4box/adapter.ts#L758-L804) |
| Remotion | The composite adapter delegates demux to the read-only media-parser layer. That layer maps parser samples, preserves `decodingTimestamp`, builds a canonical type/track-id order, and applies transport/elementary normalization before returning packets. [src/engines/remotion/adapter.ts:71-113](../../src/engines/remotion/adapter.ts#L71-L113) [src/engines/remotion-media-parser/adapter.ts:394-498](../../src/engines/remotion-media-parser/adapter.ts#L394-L498) |
| ffmpeg.wasm | Runs a stream-copy `framecrc` pass with `-map 0`, parses its packet rows, and builds metadata from the same FFmpeg log. [src/engines/ffmpeg-wasm/adapter.ts:1959-2024](../../src/engines/ffmpeg-wasm/adapter.ts#L1959-L2024) |
| web-demuxer | Uses a progressive-MP4 sample-table fast path or drains every packetized stream. Its generic packets expose PTS but not DTS, so DTS equals PTS. A narrowly recognized MPEG-TS reader-construction miss throws `NotApplicableError`. [src/engines/web-demuxer/adapter.ts:741-829](../../src/engines/web-demuxer/adapter.ts#L741-L829) |
| aibrush-media | Selects specialized WAV, AIFF, PCM, MP4/MOV, MP3, and packet-info paths before its generic demux stream; it preserves DTS where exposed and translates recognized capability misses through `NotApplicableError`. [src/engines/aibrush-media/adapter.ts:3924-4061](../../src/engines/aibrush-media/adapter.ts#L3924-L4061) [src/engines/aibrush-media/adapter.ts:92-159](../../src/engines/aibrush-media/adapter.ts#L92-L159) |

### Applicability, malformed input, and scale

The [capability gate](../glossary.md#capability-gate) checks operation, input container, codec, encryption, and feature tokens independently. Parser-only demux does not require browser WebCodecs configuration. A token miss becomes `NA_ENGINE`; a runtime error named `NotApplicableError` also becomes `NA_ENGINE`; an untyped operation exception becomes `ERROR`; an operation timeout becomes `FAIL`. [src/core/runner.ts:112-227](../../src/core/runner.ts#L112-L227) [src/core/runner.ts:1382-1394](../../src/core/runner.ts#L1382-L1394) [src/core/runner.ts:1464-1468](../../src/core/runner.ts#L1464-L1468)

Malformed demux rows take the robustness path. A clean throw is accepted, a timeout fails, and returned output fails unless the scenario sets `gracefulAllowOutput`; the truncated-H.264 row sets that option. `NotApplicableError` still maps to `NA_ENGINE`. [src/core/runner.ts:1522-1625](../../src/core/runner.ts#L1522-L1625) [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705)

Scale rows record peak-memory and long-task measurements only after correctness passes, but their declarations contain no numeric memory or long-task acceptance threshold. The hard timeout is therefore the only scale-specific correctness gate in this family. Remotion's huge and massive rows are currently disabled, its destroyed-MP4 row is disabled, and its destroyed-WebM row is converted to a forced timeout because the parser can block the event loop. [src/scenarios/demux/index.ts:289-293](../../src/scenarios/demux/index.ts#L289-L293) [src/scenarios/demux/index.ts:381-403](../../src/scenarios/demux/index.ts#L381-L403) [src/core/runner.ts:1445-1463](../../src/core/runner.ts#L1445-L1463) [src/core/disabled-cells.ts:26-34](../../src/core/disabled-cells.ts#L26-L34) [src/core/disabled-cells.ts:62-76](../../src/core/disabled-cells.ts#L62-L76) [src/core/disabled-cells.ts:90-93](../../src/core/disabled-cells.ts#L90-L93)

In exhaustive-media mode, per-file results and coverage are preserved, but top-level correctness is a logical AND: one `FAIL` or `ERROR` makes the whole cell `FAIL` or `ERROR`. There is no explicit partial-coverage grade for “file 01 passes, files 02/03 fail.” [src/core/scenario.ts:294-313](../../src/core/scenario.ts#L294-L313) [src/core/runner.ts:1118-1204](../../src/core/runner.ts#L1118-L1204)

## Contracts and invariants

- **Engine-independent declaration.** A demux [scenario](../glossary.md#scenario) names input behavior and required capabilities, never a candidate library. Registration rejects malformed declarations and duplicate ids. [src/core/scenario.ts:183-204](../../src/core/scenario.ts#L183-L204) [src/scenarios/index.ts:52-71](../../src/scenarios/index.ts#L52-L71)
- **Normalized observable.** Today, the only packet-level contract shared by every adapter is numeric track index, byte size, PTS, DTS, and keyframe flag; `metadata.tracks[trackIndex]` is intended to identify the packet's track. Payload bytes, duration, codec framing, and “DTS unavailable” are not representable. [src/core/engine.ts:41-74](../../src/core/engine.ts#L41-L74)
- **Track-local ordering.** Cross-track interleaving is not an invariant. The oracle groups by track, sorts by DTS/PTS, then compares. Numeric track-index layout and per-track packet counts are invariants today. [src/core/oracles.ts:835-900](../../src/core/oracles.ts#L835-L900)
- **Timeline.** A constant PTS and DTS origin shift per numeric track is accepted; varying drift beyond the default ±1 ms fails. Ogg/Opus packet zero has a special pre-skip allowance. [src/core/oracles.ts:902-926](../../src/core/oracles.ts#L902-L926) [src/core/oracles.ts:1058-1063](../../src/core/oracles.ts#L1058-L1063)
- **Representation equality.** Outside WAV PCM, exact ffprobe packet byte size and exact keyframe booleans are enforced as correctness today. WAV PCM instead preserves total bytes, first timestamp, and duration while permitting different chunk boundaries. [src/core/oracles.ts:891-926](../../src/core/oracles.ts#L891-L926) [src/core/oracles.ts:987-1056](../../src/core/oracles.ts#L987-L1056)
- **Golden provenance.** Packet goldens are observations baked by ffprobe from each input, not output from any scored adapter. The bake records no payload hash or codec configuration with which to prove semantic access-unit identity. [fixtures/bake.mjs:1714-1730](../../fixtures/bake.mjs#L1714-L1730)
- **Correctness gates measurement.** A real oracle failure ends the cell as `FAIL`; only a `PASS` reaches benchmark collection. A missing asset is `NA_ASSET`, a negotiated or typed runtime capability miss is `NA_ENGINE`, a timeout is `FAIL`, and an unexpected adapter/harness exception is `ERROR`. [src/core/runner.ts:1296-1338](../../src/core/runner.ts#L1296-L1338) [src/core/runner.ts:1382-1468](../../src/core/runner.ts#L1382-L1468)
- **Graceful malformed handling.** The malformed rows must settle within 15 s without a hang. Zero-length and destroyed headers require rejection; truncated H.264 may reject or return partial output, but the current allowance verifies only that the call returned without crashing, not that returned packets are structurally sound. [src/scenarios/demux/index.ts:424-492](../../src/scenarios/demux/index.ts#L424-L492) [src/core/oracles.ts:2680-2705](../../src/core/oracles.ts#L2680-L2705)
- **Applicability is not correctness.** A declared atomic token says only that the engine claims that isolated capability. The gate has no operation × container × codec × encryption × option tuple, so a passing negotiation does not prove the concrete combination is supported. [src/core/runner.ts:112-189](../../src/core/runner.ts#L112-L189)
- **Empty is observable.** The valid empty WAV must return an empty packet list rather than throw or invent a packet; unlike malformed rows, this is checked by `golden-packets`. [src/scenarios/demux/index.ts:405-420](../../src/scenarios/demux/index.ts#L405-L420)
- **Metamorphic intent is not yet a metamorphic check.** The two FLAC encodings are declared as equivalent in notes, but the discoverable metamorphic id runs only `flac_noseektable.flac` against its own golden. [src/scenarios/demux/index.ts:494-520](../../src/scenarios/demux/index.ts#L494-L520)

## Target design and known gaps

### Target design

#### Three-way verdicts

Replace boolean oracle outcomes with `PASS | DIFF | FAIL`, and carry the same distinction into cell aggregation:

- `PASS`: required tracks, access units, timing, and random-access semantics match after documented normalization, with no representation-only difference from the ffmpeg-baked golden.
- `DIFF`: the candidate is valid and semantically acceptable but differs from the golden's representation—for example codec alias, Annex B versus AVCC/HEVC length-prefixed framing, in-band versus out-of-band parameter sets, legal NAL grouping, track ordering, or an accepted timing representation.
- `FAIL`: the candidate is invalid or unusable, loses or invents required media, assigns packets to the wrong semantic track, violates timeline tolerances, marks a non-random-access unit as random access, or cannot produce a required decodable/readable result.

Aggregation must be deterministic: any `FAIL` wins; otherwise any `DIFF` yields cell `DIFF`; otherwise all judged oracles yield `PASS`. `NA_ENGINE`, `NA_BROWSER`, `NA_ASSET`, `ERROR`, and `SKIPPED` remain execution/applicability statuses rather than oracle verdicts. Acceptance requires a representation-only fixture to report `DIFF` and a corrupted/missing-access-unit fixture to report `FAIL`; no current code may be described as already supporting `DIFF`. The current boolean/status types prove the migration point. [src/core/scenario.ts:206-222](../../src/core/scenario.ts#L206-L222)

#### Semantic packet evidence

Enrich the demux observation and packet golden enough to judge meaning rather than only scalar shape. At minimum, each semantic sample/access unit needs a stable track identity, PTS, DTS-or-explicitly-unknown, duration when available, random-access classification, codec framing/configuration metadata, and either bounded packet bytes or a canonical elementary-payload digest. Preserve native evidence when a framework exposes it: MP4Box.js documents extracted samples with RAP, timescale, DTS, CTS, duration, size, and data. [MP4Box.js extraction API](https://github.com/gpac/mp4box.js/#extraction) The baker should retain ffprobe provenance and add payload hashes/configuration evidence; [ffprobe's official `-show_packets`, `-show_data`, and `-show_data_hash` options](https://ffmpeg.org/ffprobe.html) define an independent path for collecting it.

For AVC and HEVC, parse and normalize NAL units before comparison. The W3C AVC registration treats one chunk as an access unit, distinguishes canonical AVC from Annex B, and explicitly places SPS/PPS in the decoder description for AVC form but in-band for Annex B key chunks; its HEVC counterpart specifies the analogous `HEVCDecoderConfigurationRecord` and VPS/SPS/PPS split. [AVC EncodedVideoChunk data and description](https://www.w3.org/TR/webcodecs-avc-codec-registration/#encodedvideochunk-data) [HEVC EncodedVideoChunk data and description](https://www.w3.org/TR/webcodecs-hevc-codec-registration/#encodedvideochunk-data) Therefore:

1. Strip start codes or length prefixes into a canonical ordered NAL inventory; compare the coded-picture NAL payloads and access-unit timeline semantically.
2. Model parameter sets separately from picture payload. Moving SPS/PPS or VPS/SPS/PPS between configuration and samples is a representation difference, not lost media, when the resulting stream remains correctly configured. The MSE ISO BMFF byte-stream rules require out-of-band configuration support and recommend in-band support where the codec permits it. [W3C ISO BMFF initialization-segment requirements](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#init-segment)
3. Compare access units, not the baker's byte boundaries. The WebCodecs registrations describe one primary/base-layer coded picture per access unit, so legal NAL aggregation within that unit must not fail solely because sizes or grouping differ. [W3C AVC registration, §2](https://www.w3.org/TR/webcodecs-avc-codec-registration/#encodedvideochunk-data) [W3C HEVC registration, §2](https://www.w3.org/TR/webcodecs-hevc-codec-registration/#encodedvideochunk-data)
4. Validate random access from codec semantics. AVC `key` in canonical form implies an IDR picture; HEVC also permits CRA and BLA. Parameter-set placement changes the required bytes for Annex B key chunks. Exact equality to ffprobe's `K` flag is diagnostic unless the normalized access unit violates those semantics. [W3C AVC registration, §4](https://www.w3.org/TR/webcodecs-avc-codec-registration/#encodedvideochunk-type) [W3C HEVC registration, §4](https://www.w3.org/TR/webcodecs-hevc-codec-registration/#encodedvideochunk-type)

Classify an exact scalar and semantic match as `PASS`, semantic equality with changed framing/configuration/grouping/size as `DIFF`, and missing, duplicated, reordered, payload-different, or invalid access units as `FAIL`. ISO/IEC 14496-15 is the governing storage standard for NAL-structured AVC/HEVC in ISO BMFF, while ISO/IEC 14496-12 defines the container's timing and structure model. [ISO/IEC 14496-15:2024](https://www.iso.org/standard/89118.html) [ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html)

For PCM, retain aggregate-byte/sample-duration equivalence but derive it from audio sample count, format, channel count, and rate rather than byte total alone. For compressed audio, define codec-specific frame/access-unit identity and separate transport headers or page/lacing choices from coded audio content. The AAC WebCodecs registration, for example, distinguishes raw AAC access units plus `AudioSpecificConfig` from self-describing ADTS frames. [W3C AAC registration, §§2–5](https://www.w3.org/TR/webcodecs-aac-codec-registration/) Packet size, raw keyframe flag, and packet grouping remain measurements in all cases, never sole proof of wrongness.

#### Metadata semantics carried by demux

Apply one shared semantic metadata comparator to demux metadata—either as an additional oracle on demux rows or as an explicit metadata phase inside the demux oracle. It must:

- canonicalize `avc1` and `avc3` to `h264`, `hev1` and `hvc1` to `hevc`, `V_MPEG4/ISO/AVC` to `h264`, and the suite's bare `mp4a` sample-entry token to `aac`; the W3C registrations map the AVC/HEVC prefixes and `mp4a.*` AAC strings, while the CELLAR codec mapping identifies `V_MPEG4/ISO/AVC` as AVC/H.264. [W3C AVC codec strings](https://www.w3.org/TR/webcodecs-avc-codec-registration/#fully-qualified-codec-strings) [W3C HEVC codec strings](https://www.w3.org/TR/webcodecs-hevc-codec-registration/#fully-qualified-codec-strings) [W3C AAC codec strings](https://www.w3.org/TR/webcodecs-aac-codec-registration/#fully-qualified-codec-strings) [IETF CELLAR codec mapping, §3.3.13](https://www.ietf.org/archive/id/draft-ietf-cellar-codec-18.html#name-v_mpeg4-iso-avc)
- match tracks by media type and, for multiple same-type tracks, stable semantic descriptors rather than raw array position or numeric stream index;
- treat HE-AAC/SBR core rate and 2× reconstructed output rate as equivalent when signalled, and treat a Parametric Stereo mono core and stereo output as equivalent. ETSI's HE-AAC v2 description states that SBR output can be twice the AAC core sampling rate and that Parametric Stereo reconstructs stereo from the underlying mono signal. [ETSI TS 102 005, Annex A.4.1](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf)
- compare CFR rational rates in a band and compare VFR by timestamp cadence/range rather than one exact nominal fps. In particular, accept rational NTSC rates such as 30000/1001 without confusing them with rounded 29.97 or integer 30. [Apple Technical Note TN2162, “QuickTime Image Rates and Video”](https://developer.apple.com/library/archive/technotes/tn2162/_index.html#//apple_ref/doc/uid/DTS40013070-CH1-TNTAG10)
- widen duration equivalence when an edit list, AAC priming/padding, or timebase conversion explains the delta, while retaining tight bounds for unexplained content loss. ISO BMFF edit lists map media composition time to movie presentation time, and codec configuration may legally be carried in or out of band. [W3C ISO BMFF initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#init-segment) [Apple, AAC encoding background](https://developer.apple.com/documentation/quicktime-file-format/background_aac_encoding)

Acceptance includes cross-tests proving the same normalizer is used by `golden-metadata` and reference re-import, because reference re-import already canonicalizes aliases while the current golden comparator does not. [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375) [src/core/box-readers.ts:43-118](../../src/core/box-readers.ts#L43-L118) [src/core/oracles.ts:768-810](../../src/core/oracles.ts#L768-L810)

#### Capability and runtime routing

Keep the fast token gate, but make [combinatorial support](../glossary.md#combinatorial-support) explicit at the adapter boundary. After the concrete input/container/codec/encryption/options tuple is known, an adapter that can determine it cannot perform that tuple must throw `NotApplicableError`; the runner must preserve that as `NA_ENGINE`. Mediabunny, Remotion, and the Remotion media-parser adapter need the same typed mapping already demonstrated by web-demuxer's narrow TS path and aibrush-media's capability-miss translation. [src/engines/web-demuxer/adapter.ts:777-816](../../src/engines/web-demuxer/adapter.ts#L777-L816) [src/engines/aibrush-media/adapter.ts:148-159](../../src/engines/aibrush-media/adapter.ts#L148-L159)

Do not translate malformed-media rejection, unexpected parser bugs, or an applicable operation that merely exceeds its time budget into NA. Those remain graceful-negative behavior, `ERROR`, or `FAIL` respectively. Acceptance requires a table-driven test with (a) atomic tokens all present but an unsupported tuple producing `NA_ENGINE`, (b) corrupted bytes producing the malformed-input verdict rather than NA, and (c) an unexpected exception producing `ERROR`. As typed runtime decisions cover real unsupported tuples, remove corresponding hand-maintained disabled cells; retain only genuinely unsafe/applicable cases with an explicit policy rationale.

#### Robustness, scale, and metamorphic coverage

For `graceful_truncated_h264`, returned partial output must pass a structural/decodability check over every returned complete access unit before it can pass; safe EOF truncation is acceptable, corrupt packets are not. The three destroyed/empty invalid inputs continue to require clean rejection within 15 s. A matrix that passes one exhaustive input but fails two is [partial coverage](../glossary.md#partial-coverage): preserve each file result, grade the aggregate as partial, and never turn that robustness signal into `ERROR`. The target report must show `passed/admissible/total` alongside the failing file identities.

Turn `demux/metamorphic_flac_seektable_invariance` into a real two-input property: execute both `flac_seektable.flac` and `flac_noseektable.flac`, normalize their semantic FLAC frame inventories and timelines, and compare them directly. The current duplicate comparison against the no-SEEKTABLE file's own golden is insufficient proof of the stated relation. [src/scenarios/demux/index.ts:494-520](../../src/scenarios/demux/index.ts#L494-L520)

Make scale claims enforceable. Add source-read telemetry and explicit peak-memory/long-task budgets for large, huge, and massive rows, with thresholds recorded in the scenario/report; preserve hard timeouts. An adapter that reads the whole input is allowed to compete, but must not pass a “lazy/streaming demux” claim solely because packet correctness passed. Framework-designed full scans are evidence, not automatic defects: Remotion documents that returning per-sample audio/video callbacks requires a full parse. [Remotion, “Fast and slow operations”](https://www.remotion.dev/docs/media-parser/fast-and-slow#full-parsing-operations) Where a framework supplies a lazy packet iterator, use its intended decode-order API; Mediabunny documents that `packets()` yields in decode order and preloads according to consumer speed. [Mediabunny `EncodedPacketSink.packets()`](https://mediabunny.dev/api/EncodedPacketSink#packets)

Add admissible assets and oracles for the currently declared omissions, prioritizing MPEG-TS 33-bit PTS wrap/discontinuity, fragmented MP4/CMAF input, mislabeled-container detection, gapless priming/padding, and true `demux(mux(x))` round trips. HLS tests must cover segment format, discontinuity, encryption scope, and packed-audio timestamp rules rather than only one playlist shape; RFC 8216 specifies TS/fMP4/packed-audio media segments, `EXT-X-DISCONTINUITY`, and `EXT-X-KEY`. [RFC 8216, §§3 and 4.3.2](https://www.rfc-editor.org/rfc/rfc8216.html#section-3)

### Known gaps

#### Byte-exact golden packets conflate representation with correctness

- **Current:** exact packet size, count, numeric track-index layout, keyframe flag, and position are required, with only constant timestamp-origin tolerance and narrow PCM/Opus exceptions. Packet bytes and configuration are unavailable. [src/core/oracles.ts:835-926](../../src/core/oracles.ts#L835-L926) [src/core/engine.ts:63-74](../../src/core/engine.ts#L63-L74)
- **Consequence:** Annex B versus AVCC, in-band SPS/PPS or VPS/SPS/PPS, and legal NAL grouping can produce a `FAIL` even when the coded pictures and timeline are valid. A size match can also pass without proving equal payload.
- **Target:** compare canonical access-unit semantics and retain size/keyframe/grouping as diagnostics; legal representation-only changes yield `DIFF`. The W3C AVC/HEVC registrations explicitly distinguish these framing and configuration forms. [AVC registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/) [HEVC registration](https://www.w3.org/TR/webcodecs-hevc-codec-registration/)
- **Verification:** bake paired Annex B/AVCC and in-band/out-of-band parameter-set fixtures with equal decoded pictures. Expect `DIFF`; remove one VCL NAL and expect `FAIL`.

#### The verdict model has no DIFF

- **Current:** `OracleOutcome.pass` is boolean and `ResultStatus` contains no `DIFF`; any real false outcome becomes `FAIL`. [src/core/scenario.ts:206-222](../../src/core/scenario.ts#L206-L222) [src/core/runner.ts:1423-1447](../../src/core/runner.ts#L1423-L1447)
- **Consequence:** valid-but-different demux representations are indistinguishable from wrong outputs in machine-readable results and reports.
- **Target:** implement the three-way rules above and propagate `DIFF` without admitting it to performance winner calculations unless the benchmark policy explicitly allows semantically valid differences.
- **Verification:** unit-test oracle aggregation for all permutations of `PASS`, `DIFF`, `FAIL`, and NA outcomes; assert `DIFF` survives serialization and report aggregation.

#### Demux metadata is returned but mostly unjudged

- **Current:** every `DemuxResult` carries metadata, but core and size rows declare only `golden-packets`; the packet oracle uses metadata mainly to choose PCM/Opus special cases. [src/core/engine.ts:71-74](../../src/core/engine.ts#L71-L74) [src/scenarios/demux/index.ts:256-274](../../src/scenarios/demux/index.ts#L256-L274) [src/core/oracles.ts:972-1063](../../src/core/oracles.ts#L972-L1063)
- **Consequence:** an adapter can return a correct-looking packet table with wrong codec labels, track types, duration, sample rate, or channel count and still pass demux.
- **Target:** run the shared semantic metadata comparator for demux and apply codec aliases, type-based track matching, HE-AAC/SBR and Parametric Stereo equivalence, VFR/NTSC fps bands, and edit-list/priming/timebase duration bands.
- **Verification:** mutation tests independently corrupt each metadata field while preserving packets; each semantic corruption must `FAIL`, while each documented alias/rate/channel/timing representation must `PASS` or `DIFF` as specified.

#### DTS absence is encoded as invented equality

- **Current:** `PacketInfo.dtsUs` is mandatory. Mediabunny and generic web-demuxer packets expose no DTS and set it equal to PTS; MP4Box and Remotion media-parser can preserve distinct decode timestamps. [src/core/engine.ts:63-69](../../src/core/engine.ts#L63-L69) [src/engines/mediabunny/adapter.ts:1152-1184](../../src/engines/mediabunny/adapter.ts#L1152-L1184) [src/engines/web-demuxer/adapter.ts:761-805](../../src/engines/web-demuxer/adapter.ts#L761-L805) [src/engines/mp4box/adapter.ts:758-803](../../src/engines/mp4box/adapter.ts#L758-L803)
- **Consequence:** “not exposed” is indistinguishable from “DTS genuinely equals PTS,” causing B-frame rows to compare an invented decode timeline to ffprobe's timeline.
- **Target:** represent DTS as a value plus provenance, or as optional/unknown. Require exact/tolerant DTS correctness only from adapters declaring `packets:dts`; judge non-DTS adapters on presentation order/access-unit semantics and surface the missing observation as coverage, not wrong data.
- **Verification:** the B-frame scenario must show a measured DTS check for MP4Box/Remotion and an explicit “DTS unavailable” diagnostic for Mediabunny/web-demuxer, never a fabricated numeric match.

#### Coarse capability tokens leak unsupported tuples into ERROR/FAIL

- **Current:** negotiation intersects independent tokens. web-demuxer has one narrow runtime `NotApplicableError` for TS, while other adapters do not consistently expose a typed per-tuple applicability decision. [src/core/runner.ts:112-189](../../src/core/runner.ts#L112-L189) [src/engines/web-demuxer/adapter.ts:777-816](../../src/engines/web-demuxer/adapter.ts#L777-L816)
- **Consequence:** container and codec tokens can each be true while their concrete combination is unsupported; the ensuing generic exception becomes `ERROR`, or bad fallback output reaches an oracle and becomes `FAIL`. Disabled-cell policy then grows around adapter-specific misses.
- **Target:** adapters, especially Mediabunny, Remotion, and Remotion media-parser, throw `NotApplicableError` for a proven unsupported tuple so the runner emits `NA_ENGINE`; unexpected defects and applicable timeouts remain failures.
- **Verification:** audit every demux declaration against runtime tuples, add negative tuple tests, and delete each disabled cell made redundant by typed NA routing.

#### Scale metrics do not enforce lazy behavior

- **Current:** four at-scale rows request `peakMemory` and `longtasks`, but the declarations set no threshold and correctness is still packet equality plus timeout. Some Remotion rows are disabled rather than producing comparable scale evidence. [src/scenarios/demux/index.ts:330-403](../../src/scenarios/demux/index.ts#L330-L403) [src/core/disabled-cells.ts:62-76](../../src/core/disabled-cells.ts#L62-L76)
- **Consequence:** whole-file buffering may pass, and disabled cells hide the degree and shape of the limitation.
- **Target:** define enforceable memory/read/long-task budgets and report applicable timeouts as robustness/performance findings. Use `NA_ENGINE` only for a proven unsupported tuple, not for slowness.
- **Verification:** record source reads, peak bytes, longest task, and first/last packet latency for each size rung; thresholds and any exemption must be visible in machine-readable output.

#### Malformed partial output is accepted without validating it

- **Current:** `graceful_truncated_h264` sets `gracefulAllowOutput`, and the graceful oracle passes any returned demux result if the call did not crash or hang. [src/scenarios/demux/index.ts:445-454](../../src/scenarios/demux/index.ts#L445-L454) [src/core/oracles.ts:2680-2705](../../src/core/oracles.ts#L2680-L2705)
- **Consequence:** corrupt or internally inconsistent partial packets can pass as “safe output.”
- **Target:** validate returned complete access units, timestamps, track references, and decodability through the neutral platform path; accept clean EOF truncation, reject corrupt output.
- **Verification:** one fixture ending between access units must pass with the complete prefix; one ending inside a reported access unit must reject or `FAIL` validation.

#### FLAC SEEKTABLE invariance is asserted indirectly

- **Current:** the metamorphic-id row and the ordinary no-SEEKTABLE row both demux the same input against its own golden. Neither executes the SEEKTABLE variant in the same oracle evaluation. [src/scenarios/demux/index.ts:494-520](../../src/scenarios/demux/index.ts#L494-L520)
- **Consequence:** the suite does not directly prove that one adapter returns equivalent frame inventories for the paired files.
- **Target:** implement a two-input semantic property oracle; SEEKTABLE affects seeking metadata, not the decoded FLAC frame sequence.
- **Verification:** deliberately alter only the SEEKTABLE block and require equal semantic frame timelines; remove an audio frame and require `FAIL`.

#### Scenario and corpus axes remain incomplete

- **Current:** the family itself lists missing assets/oracles for fragmented/CMAF, AVI/FLV/3GP/CAF, timestamp wrap/discontinuity, gapless delay, mislabeled containers, and round-trip properties. [src/scenarios/demux/index.ts:33-44](../../src/scenarios/demux/index.ts#L33-L44)
- **Consequence:** declared engine support outside the current corpus is not challenged, and important timestamp/container-detection failures can remain invisible.
- **Target:** add one admissible asset plus a semantic oracle per claimed axis. For HLS, include TS, fMP4, packed ADTS, discontinuity, and encrypted-segment cases consistent with RFC 8216. [RFC 8216](https://www.rfc-editor.org/rfc/rfc8216.html)
- **Verification:** the README index must show the added scenario ids, each asset must have recorded provenance, and each target row must be runnable without unconditional NA.

#### Exhaustive-file mixed results have no partial grade

- **Current:** all per-file results and coverage are stored, but any admissible `FAIL`/`ERROR` determines the top-level status. [src/core/runner.ts:1118-1204](../../src/core/runner.ts#L1118-L1204)
- **Consequence:** “passes 01, fails 02/03” is preserved in details but not expressed as a first-class robustness grade; an `ERROR` among files can dominate the cell even when the useful signal is partial support.
- **Target:** represent mixed admissible outcomes as partial coverage with exact file-level verdicts. Keep true harness failures identifiable, but do not discard the support gradient.
- **Verification:** a three-file synthetic run with one pass and two fails must serialize a partial aggregate, coverage `1/3`, and all three file reasons; it must not report a blanket `ERROR`.

## Sources

### Repository evidence

- [src/scenarios/demux/index.ts:33-44](../../src/scenarios/demux/index.ts#L33-L44) — explicitly omitted corpus/oracle axes.
- [src/scenarios/demux/index.ts:52-274](../../src/scenarios/demux/index.ts#L52-L274) — core scenario inventory and mapping contract.
- [src/scenarios/demux/index.ts:276-403](../../src/scenarios/demux/index.ts#L276-L403) — size ladder, metrics, and timeouts.
- [src/scenarios/demux/index.ts:405-530](../../src/scenarios/demux/index.ts#L405-L530) — empty, malformed, metamorphic-intent, and final export rows.
- [src/core/engine.ts:13-74](../../src/core/engine.ts#L13-L74) — input, metadata, packet, and demux result types.
- [src/core/scenario.ts:183-222](../../src/core/scenario.ts#L183-L222) — scenario validation and current boolean/status model.
- [src/core/scenario.ts:294-330](../../src/core/scenario.ts#L294-L330) — exhaustive per-file result and coverage representation.
- [src/core/runner.ts:112-227](../../src/core/runner.ts#L112-L227) — atomic capability negotiation and parser-only browser-gate exemption.
- [src/core/runner.ts:655-693](../../src/core/runner.ts#L655-L693) — timeout and `NotApplicableError` recognition.
- [src/core/runner.ts:1237-1477](../../src/core/runner.ts#L1237-L1477) — cell execution, oracle aggregation, status routing, and measurement gate.
- [src/core/runner.ts:1522-1625](../../src/core/runner.ts#L1522-L1625) — malformed/graceful execution path.
- [src/core/runner.ts:1118-1204](../../src/core/runner.ts#L1118-L1204) — exhaustive-media aggregation.
- [src/core/oracles.ts:154-260](../../src/core/oracles.ts#L154-L260) — default and container-dependent timing tolerances.
- [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375) — type-count and canonical-codec comparison used by reference re-import.
- [src/core/oracles.ts:719-825](../../src/core/oracles.ts#L719-L825) — present golden metadata comparison.
- [src/core/oracles.ts:835-1063](../../src/core/oracles.ts#L835-L1063) — present golden packet, PCM, and Opus comparison.
- [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705) — graceful-failure verdict logic.
- [src/core/box-readers.ts:43-118](../../src/core/box-readers.ts#L43-L118) — existing codec-token canonicalization.
- [fixtures/bake.mjs:1587-1730](../../fixtures/bake.mjs#L1587-L1730) — ffprobe metadata and packet golden derivation.
- [fixtures/bake-scenario-goldens.mjs:374-399](../../fixtures/bake-scenario-goldens.mjs#L374-L399) — real-file demux golden baking.
- [src/engines/mediabunny/adapter.ts:1029-1192](../../src/engines/mediabunny/adapter.ts#L1029-L1192) — declared read coverage and packet iterator mapping.
- [src/engines/mp4box/adapter.ts:630-804](../../src/engines/mp4box/adapter.ts#L630-L804) — ISO BMFF capabilities and sample-table demux.
- [src/engines/remotion/adapter.ts:71-113](../../src/engines/remotion/adapter.ts#L71-L113) — composite capability union and demux delegation.
- [src/engines/remotion-media-parser/adapter.ts:179-214](../../src/engines/remotion-media-parser/adapter.ts#L179-L214) — parser capabilities.
- [src/engines/remotion-media-parser/adapter.ts:394-498](../../src/engines/remotion-media-parser/adapter.ts#L394-L498) — Remotion sample-to-packet mapping.
- [src/engines/ffmpeg-wasm/adapter.ts:1959-2024](../../src/engines/ffmpeg-wasm/adapter.ts#L1959-L2024) — FFmpeg framecrc demux path.
- [src/engines/web-demuxer/adapter.ts:618-665](../../src/engines/web-demuxer/adapter.ts#L618-L665) — declared parser coverage.
- [src/engines/web-demuxer/adapter.ts:741-829](../../src/engines/web-demuxer/adapter.ts#L741-L829) — packet streaming and typed TS NA.
- [src/engines/aibrush-media/adapter.ts:92-159](../../src/engines/aibrush-media/adapter.ts#L92-L159) — capability-miss translation.
- [src/engines/aibrush-media/adapter.ts:3924-4061](../../src/engines/aibrush-media/adapter.ts#L3924-L4061) — specialized and generic demux paths.
- [src/core/disabled-cells.ts:26-34](../../src/core/disabled-cells.ts#L26-L34) — forced Remotion corrupted-WebM timeout.
- [src/core/disabled-cells.ts:62-93](../../src/core/disabled-cells.ts#L62-L93) — disabled Remotion demux cells.

### External authorities

- ISO/IEC, [ISO/IEC 14496-12:2026 — ISO base media file format](https://www.iso.org/standard/85596.html), Abstract, accessed 2026-07-16 — defines ISO BMFF as the timing, structure, and media-information base format.
- ISO/IEC, [ISO/IEC 14496-15:2024 — Carriage of NAL unit structured video in ISO BMFF](https://www.iso.org/standard/89118.html), Abstract, accessed 2026-07-16 — governs AVC/HEVC NAL-unit storage in ISO BMFF.
- W3C Media Working Group, [AVC (H.264) WebCodecs Registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/), §§1–5, accessed 2026-07-16 — defines `avc1`/`avc3`, access units, AVC versus Annex B form, configuration placement, and key chunks.
- W3C Media Working Group, [HEVC (H.265) WebCodecs Registration](https://www.w3.org/TR/webcodecs-hevc-codec-registration/), §§1–5, accessed 2026-07-16 — defines `hev1`/`hvc1`, HEVC versus Annex B form, configuration placement, and IDR/CRA/BLA key semantics.
- W3C Media Working Group, [AAC WebCodecs Registration](https://www.w3.org/TR/webcodecs-aac-codec-registration/), §§1–5, accessed 2026-07-16 — maps `mp4a.*` strings to AAC forms and distinguishes raw AAC plus configuration from ADTS framing.
- W3C, [ISO BMFF Byte Stream Format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/), §§3–4, accessed 2026-07-16 — documents edit-list offsets plus in-band/out-of-band codec configuration and segment structure.
- IETF CELLAR Working Group, [Matroska Media Container Codec Specifications, draft-ietf-cellar-codec-18](https://www.ietf.org/archive/id/draft-ietf-cellar-codec-18.html), §3.3.13, accessed 2026-07-16 — maps `V_MPEG4/ISO/AVC` to AVC/H.264.
- ETSI, [TS 102 005 V1.2.1 — DVB video/audio coding over IP](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf), Annex A.4.1, accessed 2026-07-16 — explains HE-AAC/SBR's core/output rate relation and Parametric Stereo's mono-to-stereo reconstruction.
- Apple, [Technical Note TN2162 — QuickTime Image Rates and Video](https://developer.apple.com/library/archive/technotes/tn2162/_index.html), accessed 2026-07-16 — explains timebase/sample-duration rate representation and exact 30000/1001 NTSC cadence.
- Apple, [AAC encoding background](https://developer.apple.com/documentation/quicktime-file-format/background_aac_encoding), accessed 2026-07-16 — documents AAC priming and remainder samples relevant to duration equivalence.
- RFC Editor, [RFC 8216 — HTTP Live Streaming](https://www.rfc-editor.org/rfc/rfc8216.html), §§3 and 4.3.2, accessed 2026-07-16 — specifies TS/fMP4/packed-audio segments, discontinuities, encryption keys, and timestamp signaling.
- FFmpeg Project, [ffprobe Documentation](https://ffmpeg.org/ffprobe.html), `-show_packets`, `-show_data`, and `-show_data_hash`, accessed 2026-07-16 — defines the independent packet and payload evidence available to the baker.
- Mediabunny, [`EncodedPacketSink`](https://mediabunny.dev/api/EncodedPacketSink), `packets()`, accessed 2026-07-16 — documents decode-order asynchronous packet iteration and consumer-paced preloading.
- GPAC, [MP4Box.js — Extraction API](https://github.com/gpac/mp4box.js/#extraction), accessed 2026-07-16 — documents sample extraction fields including timing, RAP, duration, size, and data.
- Remotion, [Fast and slow operations](https://www.remotion.dev/docs/media-parser/fast-and-slow), accessed 2026-07-16 — states that sample callbacks require a full parse and distinguishes that path from metadata-only reads.
