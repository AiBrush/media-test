# Metadata

> Scope: Structural media metadata, descriptive tags, rotation, multi-track attribution, empty-tag inputs, and malformed metadata regions in the `metadata` scenario family. Probe mechanics, golden production, generic oracle plumbing, capability negotiation, and engine implementation details are described here only where they define this family’s contract; their full designs belong to the linked subsystem pages.
> Phase-2 owner: p2_feature_metadata.

## Purpose

This family answers two different questions for every eligible engine/scenario [cell](../glossary.md#cell):

1. Can the engine expose the media’s structure and descriptive metadata without changing their meaning?
2. Can it write or carry metadata without corrupting the underlying media?

The distinction is important. A valid file can describe the same content with different codec identifiers, track ordering, time origins, tag carriers, or packet layouts. The target [oracle](../glossary.md#oracle) therefore judges [semantic equivalence](../glossary.md#semantic-equivalence) separately from a [representation difference](../glossary.md#representation-difference) against ffmpeg-baked [golden metadata](../glossary.md#golden-metadata). This page inventories all 25 exported metadata [scenarios](../glossary.md#scenario), records what they actually prove today, and specifies the comparison model required before their results can serve as a cleanup contract.

The family owns:

- normalized container, duration, track, codec, rate, channel, language, rotation, and tag observations;
- semantic tag read/write/absence behavior across MP4/MOV, Matroska/WebM, MP3, FLAC, Ogg, WAV, and AIFF;
- rotation as both metadata and observable presentation;
- association of metadata and packets with the correct logical track;
- safe rejection or recovery when ID3 or MP4 metadata regions are malformed.

It does not own generic probing, remuxing, demuxing, decoding, fixture baking, or result aggregation. Those mechanisms are dependencies documented in [probe](probe.md), [remux](remux.md), [demux](demux.md), [decode and seek](decode-seek.md), [golden baking and fixtures](../subsystems/golden-baking-fixtures.md), the [oracle system](../subsystems/oracle-system.md), and [reporting and aggregation](../subsystems/reporting-aggregation.md).

## As-built

### Registration and normalized surface

`metadataScenarios` concatenates nine generated structural reads, four rotation/track scenarios, and twelve write/edge scenarios, and the global scenario index registers that array as the `metadata` family ([src/scenarios/metadata/index.ts:44-130](../../src/scenarios/metadata/index.ts#L44-L130), [src/scenarios/index.ts:18-50](../../src/scenarios/index.ts#L18-L50)). The app also lazy-loads and registers the family, recording the number loaded or the registration failure ([src/app/register.ts:118-121](../../src/app/register.ts#L118-L121), [src/app/register.ts:154-172](../../src/app/register.ts#L154-L172)).

The adapter contract currently normalizes a track to `type`, `codec`, optional dimensions/fps/rotation, optional sample rate/channel count, bitrate, and language. File-level metadata is only `container`, nullable `durationSec`, `tracks`, and an optional flat `Record<string,string>` tag map ([src/core/engine.ts:41-61](../../src/core/engine.ts#L41-L61)). There is no normalized field for raw codec identity, track ID/default disposition, tag scope/language, chapters, edit lists, cover art, timecode, codec delay, padding, or source timebase.

### Exported scenario inventory

The inventory below is exhaustive. Generated IDs follow `metadata/read_<asset-basename>` in the read builder ([src/scenarios/metadata/_shared.ts:72-95](../../src/scenarios/metadata/_shared.ts#L72-L95)).

#### Structural reads: 9

| Scenario | Input and intent | Current gate |
| --- | --- | --- |
| `metadata/read_h264_1080p_30s` | MP4/H.264/AAC structural read | `golden-metadata` |
| `metadata/read_h264_1080p_5s` | MOV/H.264/AAC structural read | `golden-metadata` |
| `metadata/read_h264_multitrack` | MP4 with one video and two AAC tracks | `golden-metadata` |
| `metadata/read_h264_in_mkv` | Matroska/H.264/AAC structural read | `golden-metadata` |
| `metadata/read_vp9_1080p_10s` | WebM/VP9/Opus structural read | `golden-metadata` |
| `metadata/read_pcm_s16be` | AIFF big-endian PCM structural read | `golden-metadata` |
| `metadata/read_mp3_xing` | MP3 with a Xing frame count | `golden-metadata` |
| `metadata/read_flac_seektable` | FLAC with seek table | `golden-metadata` |
| `metadata/read_opus` | Ogg/Opus structural read | `golden-metadata` |

The cases and their declared container/codec requirements are the nine entries in [src/scenarios/metadata/index.ts:49-124](../../src/scenarios/metadata/index.ts#L49-L124). Despite their tag-carrier-oriented notes, each performs only `probe` and attaches `golden-metadata`; no tag value is part of its current verdict ([src/scenarios/metadata/_shared.ts:80-95](../../src/scenarios/metadata/_shared.ts#L80-L95)).

#### Rotation and multi-track attribution: 4

| Scenario | Operation | Current gate |
| --- | --- | --- |
| `metadata/rotation_decode_read_h264_rotated90` | Decode eight frames from a 90°-rotated MP4 | `decoded-frames-bitexact`; requires `rotation:decode` |
| `metadata/rotation_survives_mp4_mkv` | Remux rotated MP4 to MKV | `decode(remux(x))==decode(x)`; requires `rotate` |
| `metadata/tracks_attribution_multitrack` | Probe one video plus two AAC tracks | `golden-metadata` |
| `metadata/tracks_packet_attribution_multitrack` | Demux the same three-track MP4 | `golden-packets` plus packet throughput |

The rotation scenarios are defined at [src/scenarios/metadata/rotation-tracks.ts:60-104](../../src/scenarios/metadata/rotation-tracks.ts#L60-L104); the probe- and packet-attribution scenarios are defined at [src/scenarios/metadata/rotation-tracks.ts:108-163](../../src/scenarios/metadata/rotation-tracks.ts#L108-L163). The fixture manifest says the rotated asset was made with a 90° display matrix and the multi-track asset contains two distinct audio tones ([fixtures/manifest.json:112-140](../../fixtures/manifest.json#L112-L140)). The decoded-effect check is meaningful, but current `golden-metadata` does not compare the normalized `rotation` field at all ([src/core/oracles.ts:785-812](../../src/core/oracles.ts#L785-L812)); the committed rotated metadata golden likewise contains dimensions and rates but no rotation value ([fixtures/golden/h264_rotated90.mp4.meta.json:1-26](../../fixtures/golden/h264_rotated90.mp4.meta.json#L1-L26)).

#### Tag writes and preservation properties: 8

All five write cases request the same boundary-stressing tag set: emoji and CJK in the title, diacritics in the artist, album/date/genre/track number, and a comment longer than 255 bytes ([src/scenarios/metadata/write-roundtrip.ts:34-46](../../src/scenarios/metadata/write-roundtrip.ts#L34-L46)).

| Scenario | Intended write or property | Current gate |
| --- | --- | --- |
| `metadata/write_mp4_tags` | MP4 `ilst` tags | Valid re-import plus decoded-video preservation |
| `metadata/write_mkv_tags` | Matroska `SimpleTag` values | Valid re-import plus decoded-video preservation |
| `metadata/write_mp3_id3` | ID3v2 frames | Valid re-import plus duration preservation, explicit 100 ms band |
| `metadata/write_flac_vorbiscomment` | FLAC Vorbis comment block | Valid re-import plus duration preservation |
| `metadata/write_ogg_vorbiscomment` | Ogg/Opus comment header | Valid re-import plus duration preservation |
| `metadata/tagedit_no_corrupt_video_mp4_mkv` | Standalone MP4→MKV media-preservation property | Decoded-frame equality |
| `metadata/tagedit_no_corrupt_audio_flac` | Standalone FLAC rewrite preservation property | Duration equality proxy |
| `metadata/meta_consistent_mp4_to_mkv` | Cross-container structural consistency | Duration equality, explicit 100 ms band |

The five write definitions are at [src/scenarios/metadata/write-roundtrip.ts:48-114](../../src/scenarios/metadata/write-roundtrip.ts#L48-L114); the two no-corruption cases and the cross-container case are at [src/scenarios/metadata/write-roundtrip.ts:121-172](../../src/scenarios/metadata/write-roundtrip.ts#L121-L172). A write scenario is a same-container `remux` requiring `remux`, `probe`, input/output container support, and the `metadata:write` [capability token](../glossary.md#capability-token); it attaches `reference-reimport` and `property-invariant` ([src/scenarios/metadata/_shared.ts:124-151](../../src/scenarios/metadata/_shared.ts#L124-L151)). The runner validates and forwards the flat tag object to `engine.remux`, but returns only output bytes and does not probe those bytes through the scored adapter ([src/core/runner.ts:713-730](../../src/core/runner.ts#L713-L730), [src/core/runner.ts:794-815](../../src/core/runner.ts#L794-L815)). Consequently, these cells currently prove container readability and media survival—not that the requested tags were written or can be read back.

For video preservation, `property-invariant` decodes the authored output through the platform path and compares it with baked source-frame digests. For duration preservation, it reads the authored container duration, then falls back to a decoded span or simple-audio parser ([src/core/oracles.ts:2774-2847](../../src/core/oracles.ts#L2774-L2847)). `reference-reimport` separately byte-reads supported output containers, compares media-track structure, and applies a minimum 100 ms remux-duration band ([src/core/oracles.ts:1328-1441](../../src/core/oracles.ts#L1328-L1441)).

#### Empty and malformed metadata: 4

| Scenario | Input | Current gate |
| --- | --- | --- |
| `metadata/read_no_tags_wav` | Bare PCM WAV | `golden-metadata` structural comparison |
| `metadata/read_no_tags_recorder_webm` | Headerless MediaRecorder WebM | `golden-metadata`, ±0.25 fps override |
| `metadata/neg_garbled_id3_mp3_probe` | MP3 with garbled leading ID3/Xing region | `graceful-failure`, returned output allowed |
| `metadata/neg_garbled_ilst_mp4_probe` | MP4 with garbled `moov`/`ilst` region | `graceful-failure`, returned output allowed |

The no-tag scenarios are defined at [src/scenarios/metadata/write-roundtrip.ts:174-216](../../src/scenarios/metadata/write-roundtrip.ts#L174-L216), and the two malformed cases at [src/scenarios/metadata/write-roundtrip.ts:218-245](../../src/scenarios/metadata/write-roundtrip.ts#L218-L245). Because `golden-metadata` ignores tags, the no-tag cells do not actually reject fabricated semantic tags. For the malformed cases, `gracefulAllowOutput: true` makes any returned metadata sufficient for the graceful oracle; the oracle checks only output presence, not that recovered fields are sane or untainted ([src/core/oracles.ts:2652-2706](../../src/core/oracles.ts#L2652-L2706)).

### Current golden and comparison behavior

Fixture baking invokes ffprobe, canonicalizes ffprobe codec names, rounds average frame rate to three decimals, normalizes rotation from side data or a `rotate` tag, and retains only six file-tag keys: `title`, `artist`, `album`, `comment`, `encoder`, and `major_brand` ([fixtures/bake.mjs:1587-1614](../../fixtures/bake.mjs#L1587-L1614), [fixtures/bake.mjs:1640-1655](../../fixtures/bake.mjs#L1640-L1655), [fixtures/bake.mjs:1671-1711](../../fixtures/bake.mjs#L1671-L1711)). This makes the committed ffmpeg/ffprobe view the comparison reference, not a complete container metadata model.

`golden-metadata` currently:

- lowercases and compares the container token;
- compares duration with a default ±1/24-second band, widened only for selected estimate-only TS/ADTS/HLS, no-TOC MP3, and headerless WebM inputs;
- compares the measured and golden track arrays by the same numeric position;
- lowercases codec strings but does not canonicalize aliases;
- compares video dimensions/fps and audio sample rate/channel count;
- ignores tags, rotation, bitrate, and language.

The implementation is at [src/core/oracles.ts:721-812](../../src/core/oracles.ts#L721-L812); default and estimate-only duration bands are at [src/core/oracles.ts:154-178](../../src/core/oracles.ts#L154-L178) and [src/core/oracles.ts:180-259](../../src/core/oracles.ts#L180-L259). This is materially less semantic than the existing [reference re-import](../glossary.md#reference-re-import) path: that path first compares counts per track type and maps `avc1`/`avc3`, `hev1`/`hvc1`, `mp4a`, and Matroska CodecIDs to the benchmark vocabulary before comparing codecs ([src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375), [src/core/box-readers.ts:43-121](../../src/core/box-readers.ts#L43-L121)).

The packet-attribution scenario is also broader than its name. `golden-packets` groups packets by numeric `trackIndex` and tolerates a constant timestamp origin shift, but still requires exact packet count, per-packet size, and keyframe flags ([src/core/oracles.ts:835-927](../../src/core/oracles.ts#L835-L927), [src/core/oracles.ts:972-985](../../src/core/oracles.ts#L972-L985)). It can therefore fail an otherwise correct track-attribution implementation because its NAL representation or grouping differs.

Finally, verdicts are binary inside every oracle (`pass: boolean`), and the result status union has `PASS` and `FAIL` but no `DIFF` ([src/core/scenario.ts:208-222](../../src/core/scenario.ts#L208-L222)). The runner reduces any non-bake-gap false outcome to `FAIL`; otherwise it emits `PASS` ([src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447)). A representation mismatch is therefore indistinguishable from wrong metadata.

### Current engine write coverage

Three adapters advertise `metadata:write`:

- ffmpeg.wasm adds one `-metadata key=value` option per requested tag while stream-copying every stream ([src/engines/ffmpeg-wasm/adapter.ts:2031-2065](../../src/engines/ffmpeg-wasm/adapter.ts#L2031-L2065));
- aibrush-media forwards `opts.tags` into its remux request and already maps tuple-specific misses to `NotApplicableError` in the surrounding operation path ([src/engines/aibrush-media/adapter.ts:4075-4112](../../src/engines/aibrush-media/adapter.ts#L4075-L4112));
- Mediabunny advertises the feature but its remux method constructs `Output`/`Conversion` without reading `opts.tags` ([src/engines/mediabunny/adapter.ts:1055-1067](../../src/engines/mediabunny/adapter.ts#L1055-L1067), [src/engines/mediabunny/adapter.ts:1251-1268](../../src/engines/mediabunny/adapter.ts#L1251-L1268)). Mediabunny’s read path does normalize a subset of common tags ([src/engines/mediabunny/adapter.ts:425-483](../../src/engines/mediabunny/adapter.ts#L425-L483)).

The Remotion composite delegates probes to media-parser and remuxes to `@remotion/webcodecs`, merging their capability declarations; neither layer advertises `metadata:write` ([src/engines/remotion/adapter.ts:52-91](../../src/engines/remotion/adapter.ts#L52-L91), [src/engines/remotion/adapter.ts:105-118](../../src/engines/remotion/adapter.ts#L105-L118)). Those write cells correctly preflight to `NA_ENGINE`, but the flat feature token cannot express whether a nominal writer supports a particular container/tag/codec combination.

## Contracts and invariants

### Current contracts

1. **Stable registration.** Every ID listed above must remain unique and appear in the family registry. Duplicate IDs are rejected during global scenario initialization ([src/scenarios/index.ts:49-71](../../src/scenarios/index.ts#L49-L71)).
2. **Normalized return shape.** A successful probe returns a finite or null duration, a container token, and an array of typed tracks conforming to `NormalizedMetadata`; descriptive tags, if present, are a string map ([src/core/engine.ts:41-61](../../src/core/engine.ts#L41-L61)).
3. **Capability-first execution.** A scenario runs only after operation, input/output container, codec, and feature requirements pass the [capability gate](../glossary.md#capability-gate). Each requirement is checked as a separate token, not as a supported combination ([src/core/runner.ts:112-190](../../src/core/runner.ts#L112-L190)).
4. **Structural read invariant.** The nine generated reads, both no-tag reads, and probe-side multi-track attribution currently require positional agreement with ffprobe-baked container/duration/track structure—not semantic tag agreement.
5. **Tag-write invariant.** The five write scenarios require that a tag-bearing same-container remux be structurally readable and leave decoded video or audio-duration evidence intact. They do not currently require output tag equality.
6. **Rotation invariant.** The decoded presentation of the rotated source and the decoded presentation after MP4→MKV remux must match baked frame evidence. Numeric rotation metadata is not currently part of the invariant.
7. **Malformed-region invariant.** A malformed ID3 or MP4 tag region may be rejected cleanly or ignored; it must not hang or crash. Current `gracefulAllowOutput` accepts returned metadata without semantic validation.
8. **Current verdict invariant.** Every real oracle mismatch is `FAIL`; there is no representational middle state. Runtime `NotApplicableError` is recognized and converted to `NA_ENGINE` on both functional and robustness paths ([src/core/runner.ts:686-693](../../src/core/runner.ts#L686-L693), [src/core/runner.ts:1382-1394](../../src/core/runner.ts#L1382-L1394), [src/core/runner.ts:1552-1565](../../src/core/runner.ts#L1552-L1565)).

### Target contracts

The cleanup implementation must preserve these stronger invariants:

1. A structurally invalid, semantically wrong, lost, fabricated, or corrupt result is `FAIL`.
2. A valid result that preserves meaning but uses a materially different representation from the ffmpeg-baked golden is `DIFF`.
3. A result equivalent after the explicit normalizations below is `PASS`; no normalization may silently erase a semantic distinction.
4. Diagnostics retain raw measured values, canonical values, the selected logical-track match, timing evidence, and the rule that produced the verdict.
5. Unsupported runtime combinations produce `NA_ENGINE` via `NotApplicableError`, never `FAIL` or `ERROR` merely because the preflight token set was too coarse.
6. Tag writes are verified by neutral re-probe of the authored bytes, and media-preservation checks remain independent; correct tags cannot hide corrupt media, and intact media cannot hide lost tags.

## Target design and known gaps

### Target design

#### Three-way oracle outcome

Replace `OracleOutcome.pass` with an explicit `PASS | DIFF | FAIL` verdict and add `DIFF` to the persisted result status. Aggregation uses the worst substantive outcome in the order `FAIL > DIFF > PASS`, while retaining the existing NA/ERROR states. The intended semantics are:

| Verdict | Metadata meaning |
| --- | --- |
| [PASS](../glossary.md#pass) | The result is semantically equivalent after a named, lossless normalization. |
| [DIFF](../glossary.md#diff) | The result is valid and usable, but exposes a different representation or view than the ffmpeg-baked golden. |
| [FAIL](../glossary.md#fail) | Meaning is wrong or missing, structure is invalid, requested tags are lost/changed, media is corrupt, or recovery is unsafe. |

Codec aliases listed below, same-type track reordering, SBR/PS reporting views, and NTSC rational spelling normalize to `PASS`. Raw-media versus presentation duration, valid tag carrier differences not reducible to the same normalized value, and legal NAL packetization differences are `DIFF`. A missing track, wrong canonical codec, genuinely wrong rate/channel count, presentation-duration error beyond the evidence band, or altered requested tag is `FAIL`.

#### Semantic golden-metadata comparator

The target comparator is a staged algorithm, not a collection of widening constants:

1. **Retain evidence.** Extend normalized metadata and golden schema with `rawCodec`, canonical codec, stable container track ID, disposition/default flag, raw and presentation dimensions, rational rate evidence, cadence kind, movie/media timebases, raw media span, presentation duration, edit-list entries, codec priming/padding, rotation matrix/degrees, scoped tags, chapters, cover art descriptors, and timecode descriptors. Raw fields are diagnostic; canonical fields drive the verdict.
2. **Canonicalize codec identity.** Apply `avc1` and `avc3` → `h264`; `hev1` and `hvc1` → `hevc`; `V_MPEG4/ISO/AVC` → `h264`; and `mp4a` → `aac` before comparison. This deliberately brings `golden-metadata` up to the canonicalization already used by reference re-import ([src/core/box-readers.ts:59-114](../../src/core/box-readers.ts#L59-L114)). The [MP4 Registration Authority codec table](https://mp4ra.org/registered-types/codecs) registers those sample-entry codes, while the [W3C ISO BMFF byte-stream note](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#iso-init-segments) explicitly treats in-band and out-of-band parameter-set carriage as interoperable forms.
3. **Match logical tracks by type, not array index.** Partition measured and golden tracks into `video`, `audio`, `subtitle`, and `other`. Require equal counts per required type, then compute a deterministic minimum-cost match within each type using canonical codec and available identity fields (dimensions, rate/channel layout, language, disposition, and stable track ID). Array order is never identity. Packets are joined through the resulting logical-track mapping. This replaces the current positional compare while retaining a real attribution check for the two distinct AAC tracks.
4. **Recognize HE-AAC signaling views.** Only when the AudioSpecificConfig or equivalent evidence identifies [HE-AAC/SBR](../glossary.md#he-aacsbr), treat an AAC core rate and a rendered rate exactly 2× larger as equal. Only when [Parametric Stereo](../glossary.md#parametric-stereo) is signaled, treat a coded mono/core view and a rendered two-channel view as equal. Do not apply either exception to plain AAC-LC. ITU-R describes HE-AAC as a dual-rate system whose plain AAC core runs at half the SBR output rate, and HE-AAC v2 as a mono representation plus parameters that reconstruct stereo ([ITU-R BS.1196-5, Annex 2 §§4–5](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1196-5-201510-S%21%21PDF-E.pdf)); the [W3C AAC registration](https://www.w3.org/TR/webcodecs-aac-codec-registration/#fully-qualified-codec-strings) distinguishes AAC-LC (`mp4a.40.2`), HE-AAC v1 (`.5`), and HE-AAC v2 (`.29`).
5. **Compare cadence, not a lone rounded float.** Mark a track [CFR](../glossary.md#cfr) or [VFR](../glossary.md#vfr) from sample timestamps. For CFR, retain the rational rate and normalize the standard [NTSC rate](../glossary.md#ntsc-rate) family (`24000/1001`, `30000/1001`, `60000/1001`) before comparing rounded decimal reports. For VFR, compare frame count, first/last presentation timestamp, median duration, and a timestamp-duration band; do not fail solely because two engines report different `avg_frame_rate` summaries. Headerless estimated cadence keeps an explicit fixture-class band. Apple’s QuickTime guidance shows 29.97 as a timebase/duration ratio and warns that an average rate can be rounded and is not a substitute for per-sample durations ([29.97 fps track construction](https://developer.apple.com/documentation/quicktime-file-format/creating_video_tracks_at_2997_frames_per_second), [average frame-rate semantics](https://developer.apple.com/documentation/quicktime-file-format/average_video_frame_rate_in_a_single_track)).
6. **Compare presentation time with provenance.** Derive a canonical presentation duration by applying the [edit list](../glossary.md#edit-list) and subtracting signaled [priming](../glossary.md#priming)/padding. Also retain the raw coded-media span. The equality band is the maximum of one tick from each relevant [timebase](../glossary.md#timebase), one video-frame duration, or one coded audio-frame duration. A measured presentation view within that band is `PASS`; an explicitly raw-media view that matches the raw span is `DIFF`; a value matching neither is `FAIL`. If an API cannot label its view, accept either evidence-backed interval but classify the raw-span match as `DIFF`—never apply an unlimited blanket tolerance. ISO BMFF edit lists map movie time to media time ([Apple edit-list table](https://developer.apple.com/documentation/quicktime-file-format/edit_list_atom/edit_list_table)), and AAC encoder delay/remainder samples are intentionally excluded from the presented edit ([Apple AAC encoder-delay guidance](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly)).
7. **Compare semantic tags by format-aware mapping.** Add a neutral output re-probe and compare the requested logical subset `title`, `artist`, `album`, `comment`, `date`, `genre`, and `trackNumber`. Map those keys to ID3 frames, MP4 `ilst`/keyed metadata, Matroska scoped `SimpleTag` values, and Vorbis comments. Tag-key case is format-specific; values preserve case and whitespace and may normalize only canonically equivalent Unicode. Extra technical tags such as `encoder` or `major_brand` do not fail the subset check, but must remain visible in diagnostics. ID3v2 assigns semantic frames such as `TIT2`, `TALB`, and `TRCK` ([ID3v2.4 frame definitions](https://id3.org/id3v2.4.0-frames)); Vorbis comment keys are case-insensitive with UTF-8 values ([Xiph comment-header specification](https://xiph.org/vorbis/doc/v-comment.html)); Matroska tags can target the segment, tracks, chapters, or attachments and carry language ([RFC 9559 §4.6](https://www.rfc-editor.org/rfc/rfc9559.html#section-4.6)).
8. **Model scoped and visual metadata.** Normalize rotation modulo 360 while retaining the raw display matrix; compare track language and default disposition; represent chapters, edit lists, cover art/attachments, and timecode rather than hiding them in a flat tag map. Keep the decoded-presentation rotation check because a correct numeric matrix that is ignored at decode time is still wrong. [WebCodecs](https://www.w3.org/TR/webcodecs/) models decoded frame presentation metadata, while QuickTime matrices encode rotation/scale/translation ([Apple matrix structure](https://developer.apple.com/documentation/quicktime-file-format/matrices)) and Matroska metadata has explicit track/chapter/attachment scope ([RFC 9559 §4.6](https://www.rfc-editor.org/rfc/rfc9559.html#section-4.6)).
9. **Isolate packet attribution from packet representation.** For `metadata/tracks_packet_attribution_multitrack`, first map output tracks to logical golden tracks, then judge whether each packet is attached to the right logical track. Annex B versus length-prefixed AVC, inline versus out-of-band SPS/PPS, and legal NAL grouping may change sizes and packet boundaries without changing attribution. Those representation-only differences are `DIFF`, not `FAIL`; packet loss, cross-track assignment, invalid timestamps, or undecodable output remains `FAIL`. FFmpeg documents lossless conversion between length-prefixed AVC and Annex B start-code form ([`h264_mp4toannexb`](https://ffmpeg.org/ffmpeg-bitstream-filters.html#h264_005fmp4toannexb)), and the W3C ISO BMFF note requires support for out-of-band configuration and recommends in-band parameter-set support ([initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#iso-init-segments)).

#### Tag-write and applicability flow

The target write flow is:

1. preflight broad operation/container/codec requirements;
2. let the adapter inspect the concrete input plus tag set;
3. throw `NotApplicableError` before writing when that exact combination is unsupported, producing `NA_ENGINE`;
4. author the file;
5. neutral-reprobe the output and compare the semantic tag subset;
6. independently run structural re-import and media-preservation oracles.

The coarse per-token capability gate remains a fast filter, but it is not the final authority for combinations. Mediabunny must pass tags through `ConversionOptions.tags` or call `Output.setMetadataTags` before conversion starts, as its own [writing guide](https://mediabunny.dev/guide/writing-media-files#setting-metadata-tags) specifies. Remotion, remotion-media-parser, and every other adapter that reaches an operation it cannot perform for the concrete tuple must throw `NotApplicableError`; hand-maintained disabled-cell exceptions are a last resort, not the primary model.

#### Acceptance matrix

| Target behavior | Required fixtures/checks | Expected verdict |
| --- | --- | --- |
| `avc1`/`avc3`, `hev1`/`hvc1`, Matroska AVC, and `mp4a` aliases | Paired container samples exposing raw identifiers | `PASS` after canonicalization |
| Track arrays reordered but same logical tracks | Video + two distinguishable audio tracks, language/default/ID retained | `PASS` |
| HE-AAC core 24 kHz vs rendered 48 kHz | Explicit-SBR fixture and parsed AudioSpecificConfig | `PASS` |
| HE-AAC v2 mono core vs two-channel rendered view | Explicit-PS fixture | `PASS` |
| Plain AAC 24 kHz reported as 48 kHz | AAC-LC fixture without SBR | `FAIL` |
| 29.97 decimal vs `30000/1001` | CFR NTSC fixture with rational timing evidence | `PASS` |
| Valid VFR with different average-rate summary | Irregular PTS fixture, cadence-band comparison | `PASS` or representation-only `DIFF`, never rate-only `FAIL` |
| Raw coded AAC span includes priming, presentation duration does not | Edit-list/roll-group fixture | presentation `PASS`; raw view `DIFF` |
| Requested Unicode tags survive each supported carrier | Read-after-write for MP4, MKV, MP3, FLAC, Ogg | `PASS` |
| Tags are valid but represented through a different lossless carrier | Raw plus canonical tag evidence | `DIFF` |
| Requested tag altered/lost, or fabricated semantic tag on no-tag fixture | Semantic subset/absence check | `FAIL` |
| Legal Annex B/AVCC or NAL grouping difference with correct attribution | Multi-track H.264 packet fixtures | `DIFF` |
| Unsupported concrete writer tuple | Adapter `NotApplicableError` | `NA_ENGINE` |
| Garbled tag region safely ignored with sane structural metadata | Malformed ID3/MP4 fixtures plus sanity validation | `PASS` |

### Known gaps

#### The current golden comparator confuses representation with correctness

**Current:** codec strings and tracks are compared positionally, sample rate/channel count are exact, one float represents fps, and current duration logic has no edit-list, priming, or timebase evidence ([src/core/oracles.ts:721-812](../../src/core/oracles.ts#L721-L812)).

**Consequence:** valid codec aliases, reordered same-type tracks, HE-AAC/SBR and Parametric Stereo views, VFR/NTSC summaries, and raw-versus-presentation durations can become false `FAIL`.

**Target/verification:** implement the staged semantic comparator and acceptance fixtures above. The test must assert both the final verdict and the normalization rule recorded in diagnostics.

#### Tag scenarios do not currently test tag values

**Current:** reads attach only `golden-metadata`; writes never re-probe output tags; no-tag cases cannot detect fabricated tags. The baked goldens for representative MP4/MOV contain only `major_brand`, Matroska/WebM commonly only `encoder`, and the audio carriers contain no semantic values ([fixtures/golden/h264_1080p_30s.mp4.meta.json:23-25](../../fixtures/golden/h264_1080p_30s.mp4.meta.json#L23-L25), [fixtures/golden/h264_in_mkv.mkv.meta.json:23-25](../../fixtures/golden/h264_in_mkv.mkv.meta.json#L23-L25)).

**Consequence:** an adapter can drop every requested title/artist/comment and still pass if the output remains parseable and its media survives.

**Target/verification:** add semantic tag-bearing source fixtures, output re-probe, subset equality, explicit no-semantic-tags assertions, and cross-container logical-tag equality. Preserve the existing Unicode/long-comment stress values.

#### The normalized model cannot express important metadata

**Current:** chapters, edit lists, cover art, timecode, tag scope/language, priming, padding, rational timebase, default dispositions, and raw codec identifiers have no typed home ([src/core/engine.ts:41-61](../../src/core/engine.ts#L41-L61)). Rotation and language exist on tracks, but `golden-metadata` ignores them.

**Consequence:** the family can neither verify preservation nor distinguish “unsupported” from “silently lost.” Container-scoped and track-scoped tags are flattened together.

**Target/verification:** extend normalized/golden schemas, add at least one fixture per modeled field, and require round-trip preservation where the target format supports it. Matroska’s standard explicitly distinguishes tags on tracks, chapters, and attachments ([RFC 9559 §4.6](https://www.rfc-editor.org/rfc/rfc9559.html#section-4.6)); a flat map is insufficient.

#### The multi-track packet scenario carries an unrelated byte-exact burden

**Current:** the named property is packet-to-track attribution, but the shared comparator also requires exact packet count, sizes, and keyframe flags ([src/scenarios/metadata/rotation-tracks.ts:134-155](../../src/scenarios/metadata/rotation-tracks.ts#L134-L155), [src/core/oracles.ts:839-924](../../src/core/oracles.ts#L839-L924)).

**Consequence:** Annex B versus AVCC, inline SPS/PPS, or different legal NAL grouping can fail a metadata-attribution cell even when every packet belongs to the correct logical track.

**Target/verification:** split attribution from representation. Correct logical association plus valid timing is `PASS`; valid alternate packet representation is `DIFF`; loss or cross-track assignment is `FAIL`.

#### Mediabunny advertises a write path it does not invoke

**Current:** `metadata:write` is declared, but `remux` ignores `opts.tags` ([src/engines/mediabunny/adapter.ts:1055-1067](../../src/engines/mediabunny/adapter.ts#L1055-L1067), [src/engines/mediabunny/adapter.ts:1251-1268](../../src/engines/mediabunny/adapter.ts#L1251-L1268)). Current oracles cannot expose the loss.

**Consequence:** cells can report `PASS` for a no-op tag request.

**Target/verification:** wire the documented Mediabunny metadata API and require read-after-write equality for all supported carriers. If the concrete carrier cannot encode the requested tag subset, throw `NotApplicableError` and emit `NA_ENGINE`.

#### Capability declarations are not combinatorial

**Current:** the runner independently checks operation, container, codec, and `metadata:write`; a writer that supports each token separately can still reject their combination at runtime ([src/core/runner.ts:124-190](../../src/core/runner.ts#L124-L190)). Non-`NotApplicableError` rejection becomes `ERROR`, while a returned but invalid file reaches oracle `FAIL`.

**Consequence:** unsupported combinations pollute correctness results and encourage a hand-kept disabled-cell list.

**Target/verification:** every adapter must perform tuple-aware validation and throw `NotApplicableError` before work. Add matrix tests for supported and unsupported carrier/tag/codec combinations, including Mediabunny, Remotion, and remotion-media-parser routing.

#### Safe recovery is not validated semantically

**Current:** `gracefulAllowOutput` accepts any returned metadata from the garbled ID3/MP4 probes ([src/core/oracles.ts:2680-2706](../../src/core/oracles.ts#L2680-L2706)).

**Consequence:** NaN/negative durations, impossible tracks, or fabricated values can pass as “safe recovery.”

**Target/verification:** a recovered result must satisfy schema, finiteness, bounded counts/sizes, valid track types, and absence of semantic values derived from the corrupt region. Clean rejection and sane partial recovery are `PASS`; timeout/crash or unsafe recovery is `FAIL`.

#### The corpus lacks equivalence-class fixtures

**Current:** the metadata family has no HE-AAC/SBR, Parametric Stereo, edit-list/priming, chapter, cover-art, timecode, distinct-language, 180°/270° rotation, or semantically tagged read fixture. The current multi-track golden’s two AAC tracks share the same rate/channel/language, leaving only order and bitrate as distinguishing evidence ([fixtures/golden/h264_multitrack.mp4.meta.json:1-34](../../fixtures/golden/h264_multitrack.mp4.meta.json#L1-L34)).

**Consequence:** new comparator branches could remain unexecuted or over-broad.

**Target/verification:** bake paired positive and negative fixtures for every equivalence rule. Each positive pair proves a valid alternate representation; each negative neighbor proves that the rule does not excuse real wrongness.

## Sources

### Repository evidence

- Metadata family composition and read matrix: [src/scenarios/metadata/index.ts:44-130](../../src/scenarios/metadata/index.ts#L44-L130).
- Scenario builders and current oracle wiring: [src/scenarios/metadata/_shared.ts:70-281](../../src/scenarios/metadata/_shared.ts#L70-L281).
- Rotation and multi-track cases: [src/scenarios/metadata/rotation-tracks.ts:55-163](../../src/scenarios/metadata/rotation-tracks.ts#L55-L163).
- Write, preservation, empty, and malformed cases: [src/scenarios/metadata/write-roundtrip.ts:34-254](../../src/scenarios/metadata/write-roundtrip.ts#L34-L254).
- Normalized engine metadata and capability surface: [src/core/engine.ts:41-61](../../src/core/engine.ts#L41-L61), [src/core/engine.ts:115-137](../../src/core/engine.ts#L115-L137), [src/core/engine.ts:187-219](../../src/core/engine.ts#L187-L219).
- Result and oracle outcome types: [src/core/scenario.ts:208-222](../../src/core/scenario.ts#L208-L222).
- Current capability gate, dispatch, and result reduction: [src/core/runner.ts:112-190](../../src/core/runner.ts#L112-L190), [src/core/runner.ts:686-730](../../src/core/runner.ts#L686-L730), [src/core/runner.ts:1331-1447](../../src/core/runner.ts#L1331-L1447).
- Golden metadata, packet, reference-reimport, property, and graceful oracles: [src/core/oracles.ts:721-985](../../src/core/oracles.ts#L721-L985), [src/core/oracles.ts:1299-1441](../../src/core/oracles.ts#L1299-L1441), [src/core/oracles.ts:2650-2855](../../src/core/oracles.ts#L2650-L2855).
- Existing reference-reimport codec canonicalization: [src/core/box-readers.ts:43-121](../../src/core/box-readers.ts#L43-L121).
- Golden derivation: [fixtures/bake.mjs:1587-1711](../../fixtures/bake.mjs#L1587-L1711).
- Mediabunny metadata paths: [src/engines/mediabunny/adapter.ts:425-483](../../src/engines/mediabunny/adapter.ts#L425-L483), [src/engines/mediabunny/adapter.ts:1035-1067](../../src/engines/mediabunny/adapter.ts#L1035-L1067), [src/engines/mediabunny/adapter.ts:1251-1268](../../src/engines/mediabunny/adapter.ts#L1251-L1268).
- ffmpeg.wasm and aibrush-media write paths: [src/engines/ffmpeg-wasm/adapter.ts:2031-2065](../../src/engines/ffmpeg-wasm/adapter.ts#L2031-L2065), [src/engines/aibrush-media/adapter.ts:4075-4112](../../src/engines/aibrush-media/adapter.ts#L4075-L4112).

### External authorities

- [ISO/IEC 14496-12:2022 — ISO base media file format](https://www.iso.org/standard/83102.html): authoritative ISO BMFF structure and timing model. Accessed 2026-07-16.
- [MP4 Registration Authority — codec sample entries](https://mp4ra.org/registered-types/codecs): registered `avc1`/`avc3`, `hev1`/`hvc1`, and `mp4a` identifiers. Accessed 2026-07-16.
- [W3C ISO BMFF byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/): edit-list handling and interoperable in-band/out-of-band codec configuration. Accessed 2026-07-16.
- [W3C AAC WebCodecs registration](https://www.w3.org/TR/webcodecs-aac-codec-registration/): AAC-LC, HE-AAC v1/SBR, HE-AAC v2/PS codec strings and AudioSpecificConfig behavior. Accessed 2026-07-16.
- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/): browser codec configuration and decoded media model. Accessed 2026-07-16.
- [ITU-R BS.1196-5](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1196-5-201510-S%21%21PDF-E.pdf): HE-AAC dual-rate behavior and Parametric Stereo mono/stereo representations. Accessed 2026-07-16.
- [Apple QuickTime edit-list table](https://developer.apple.com/documentation/quicktime-file-format/edit_list_atom/edit_list_table) and [AAC encoder-delay representation](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly): presentation mapping, timebases, priming, and remainder samples. Accessed 2026-07-16.
- [Apple QuickTime 29.97 fps guidance](https://developer.apple.com/documentation/quicktime-file-format/creating_video_tracks_at_2997_frames_per_second) and [average frame-rate semantics](https://developer.apple.com/documentation/quicktime-file-format/average_video_frame_rate_in_a_single_track): rational NTSC rates and limits of average fps metadata. Accessed 2026-07-16.
- [Apple QuickTime metadata atoms and types](https://developer.apple.com/documentation/quicktime-file-format/metadata_atoms_and_types) and [matrix structure](https://developer.apple.com/documentation/quicktime-file-format/matrices): MP4/MOV metadata carriers and display transforms. Accessed 2026-07-16.
- [RFC 9559 — Matroska](https://www.rfc-editor.org/rfc/rfc9559.html): tracks, timing, scoped tags, chapters, and attachments. Accessed 2026-07-16.
- [ID3v2.4 frame definitions](https://id3.org/id3v2.4.0-frames): MP3 semantic tag frames and text encodings. Accessed 2026-07-16.
- [Xiph Vorbis comment-header specification](https://xiph.org/vorbis/doc/v-comment.html) and [RFC 9639 §8.6 — FLAC Vorbis comments](https://www.rfc-editor.org/rfc/rfc9639.html#section-8.6): case-insensitive keys, UTF-8 values, and FLAC carriage. Accessed 2026-07-16.
- [FFmpeg bitstream filters](https://ffmpeg.org/ffmpeg-bitstream-filters.html#h264_005fmp4toannexb): lossless H.264 length-prefix/Annex B conversion and in-band/extradata handling. Accessed 2026-07-16.
- [Mediabunny writing guide — metadata tags](https://mediabunny.dev/guide/writing-media-files#setting-metadata-tags): public tag-writing APIs and call ordering. Accessed 2026-07-16.
