# Mux

> Scope: The mux scenario family: packing existing encoded tracks into a target container, including track selection, multi-source assembly, write modes, timing edges, and clean rejection of illegal combinations; encoding and decode-only behavior are out of scope.
> Phase-2 owner: p2_feature_mux.

## Purpose

This page specifies the 52 `mux/*` [scenarios](../glossary.md) that judge how an [engine](../glossary.md) packages already-encoded audio and video tracks. It is both an inventory of the current benchmark and the acceptance specification for a later cleanup: which tracks enter the muxer, which container and write mode leave it, what an [oracle](../glossary.md) may call correct, and when a cell is not applicable rather than broken.

Mux correctness is semantic before it is representational. A valid container may carry the same coded media with different packet boundaries, codec-configuration placement, interleaving, timestamps expressed in another timebase, or random-access signalling. The target model therefore distinguishes [PASS](../glossary.md), [DIFF](../glossary.md), and [FAIL](../glossary.md), while preserving [NA_ENGINE](../glossary.md) for a combination an adapter cannot implement at runtime.

## As-built

### Registration, construction, and execution

The family entry point concatenates the baseline, write-target, multi-source, codec-edge, size, output-mode, metamorphic, and negative arrays; the global scenario registry then flattens every family and rejects duplicate IDs. [src/scenarios/mux/index.ts:114-123](../../src/scenarios/mux/index.ts#L114-L123) [src/scenarios/index.ts:33-67](../../src/scenarios/index.ts#L33-L67)

The ordinary builder declares both `demux` and `mux`, independently lists input containers, output container, codecs, and optional feature tokens, forwards `container`, the duration invariant, and write-mode options, and attaches correctness oracles before metrics. Its default is `property-invariant`; it adds `reference-reimport` only for a single unselected MP4/MOV source written to MP4/MOV. Fragmented and fast-start modes also receive `mp4-box-layout`. [src/scenarios/mux/_shared.ts:111-135](../../src/scenarios/mux/_shared.ts#L111-L135) [src/scenarios/mux/_shared.ts:183-228](../../src/scenarios/mux/_shared.ts#L183-L228)

At runtime the runner obtains `EncodedTracks` either from `options.tracks` or `engine.prepareMuxTracks(inputs, options)`, strips only the embedded `tracks` field from mux options, then calls `engine.mux(tracks, options)`. A missing preparation hook is constructed as `NotApplicableError`. [src/core/runner.ts:686-694](../../src/core/runner.ts#L686-L694) [src/core/runner.ts:732-736](../../src/core/runner.ts#L732-L736) [src/core/runner.ts:789-830](../../src/core/runner.ts#L789-L830)

The adapter-facing track contract carries media type, codec, timebase, optional dimensions or audio shape, optional decoder configuration, and packets with separate PTS, DTS, duration, keyframe state, and bytes. That distinction is capable of representing B-frames and container-specific codec configuration even when an individual adapter loses it. [src/core/engine.ts:163-179](../../src/core/engine.ts#L163-L179) [src/core/engine.ts:227-233](../../src/core/engine.ts#L227-L233)

### Baseline container matrix

The seven original cases cover the main A/V pairs, a second-source audio assembly, and an audio-only path. All use the ordinary builder and therefore the default duration oracle; the faithful ISO BMFF cases also gain packet-table re-import. [src/scenarios/mux/index.ts:46-110](../../src/scenarios/mux/index.ts#L46-L110)

| Scenario ID | Input intent | Target |
|---|---|---|
| `mux/h264_aac_to_mp4` | H.264 + AAC from MP4 | MP4 |
| `mux/h264_aac_to_mkv` | H.264 + AAC from MP4 | Matroska |
| `mux/h264_aac_to_ts` | H.264 + AAC from MP4 | MPEG-TS |
| `mux/vp9_opus_to_webm` | VP9 + Opus from WebM | WebM |
| `mux/av1_opus_to_mp4` | AV1 + Opus from WebM | MP4 |
| `mux/video_plus_audio_to_mp4` | H.264 video plus AAC audio from separate sources | MP4 |
| `mux/audio_only_aac_to_mp4` | AAC-only M4A | MP4 |

### Additional write targets

Eleven cases extend the output surface to MOV, Ogg, WAV, ADTS, MP3, audio-only WebM/Matroska, and MP4-with-MP3. The PCM cases request the corresponding PCM codec token; the Vorbis case explicitly selects `audio:0`. [src/scenarios/mux/write-targets.ts:38-168](../../src/scenarios/mux/write-targets.ts#L38-L168)

| Scenario ID | Track shape | Target/write contract |
|---|---|---|
| `mux/h264_aac_to_mov` | H.264 + AAC | MOV |
| `mux/opus_to_ogg` | Opus audio | Ogg |
| `mux/vorbis_to_ogg` | selected Vorbis audio | Ogg |
| `mux/pcm_s16_to_wav` | signed 16-bit PCM | WAV |
| `mux/pcm_s24_to_wav` | signed 24-bit PCM | WAV |
| `mux/pcm_f32_to_wav` | 32-bit float PCM | WAV |
| `mux/aac_to_adts` | AAC audio | ADTS elementary stream |
| `mux/mp3_to_mp3` | MP3 audio | MP3 elementary stream |
| `mux/opus_to_webm_audio` | Opus audio | WebM |
| `mux/flac_to_mkv_audio` | FLAC audio | Matroska |
| `mux/mp3_to_mp4_audio` | MP3 audio | MP4 |

### Multi-source and track topology

Five cases assemble tracks from two or three files, retain every track, select a subset, or request a replacement audio track. The scenario data expresses selection with selectors such as `video:0` and `audio:0`; the `swapAudioFrom` option is also present in the swap case, but the generic runner merely forwards it and does not define its semantics. [src/scenarios/mux/multi-source.ts:36-115](../../src/scenarios/mux/multi-source.ts#L36-L115) [src/core/runner.ts:732-736](../../src/core/runner.ts#L732-L736)

| Scenario ID | Intended output topology | Target |
|---|---|---|
| `mux/video_a_plus_audio_b_to_mkv` | video from source A + audio from source B | Matroska |
| `mux/vp9_video_plus_opus_audio_to_webm` | VP9 video + Opus audio from separate sources | WebM |
| `mux/three_track_assembly_to_mkv` | one video + two audio tracks | Matroska |
| `mux/drop_audio_track_subset_to_mp4` | selected video only | MP4 |
| `mux/swap_audio_video_with_opus_to_mkv` | H.264 video + replacement Opus audio | Matroska |

Mediabunny is the clearest implemented selector contract: it parses `<type>:<ordinal>`, defaults a multi-input assembly to video from the first input plus audio from later inputs, and otherwise keeps all tracks from a single source. No shared selector parser enforces the same behavior across adapters. [src/engines/mediabunny/adapter.ts:386-423](../../src/engines/mediabunny/adapter.ts#L386-L423)

### Codec, timing, and metadata edges

Seven cases exercise B-frame timing, rotation, HEVC, and keep-all multi-track behavior. The six codec/metadata property cases use browser decode equality; the keep-all case uses duration plus faithful re-import. [src/scenarios/mux/codec-edges.ts:39-157](../../src/scenarios/mux/codec-edges.ts#L39-L157)

| Scenario ID | Edge | Current oracle intent |
|---|---|---|
| `mux/edge_bframes_decode_mux_mp4` | H.264 B-frames to MP4 | decode equality + re-import |
| `mux/edge_bframes_decode_mux_mkv` | H.264 B-frames to Matroska | decode equality |
| `mux/edge_rotation_decode_mux_mov` | rotation-bearing MP4 to MOV | decode equality + re-import |
| `mux/edge_rotation_decode_mux_mkv` | rotation-bearing MP4 to Matroska | decode equality |
| `mux/edge_hevc_decode_mux_mp4` | HEVC to MP4 | decode equality + re-import |
| `mux/edge_hevc_decode_mux_mkv` | HEVC to Matroska | decode equality |
| `mux/edge_multitrack_keep_all_to_mp4` | all tracks retained | duration + re-import |

The shared `decode(mux(x))==decode(x)` property decodes the candidate output with the neutral platform path and compares frame digests with the source golden. The duration property reads MP4/WebM structure, otherwise tries platform decode or a simple PCM parser, and emits an unavailable oracle outcome when none can determine duration. [src/core/oracles.ts:2774-2847](../../src/core/oracles.ts#L2774-L2847)

One current adapter-specific timing defect is visible before mux: Mediabunny prepares each packet with `dtsUs` set equal to `ptsUs`, despite the shared contract carrying both values. [src/engines/mediabunny/adapter.ts:1194-1248](../../src/engines/mediabunny/adapter.ts#L1194-L1248)

### Output modes

Four MP4 cases cover progressive layout, an incremental stream target, reserved fast start, and fragmented output. The builder derives `target:writes`, `fastStart:*`, and `fragmented` feature requirements from the options. [src/scenarios/mux/output-modes.ts:32-95](../../src/scenarios/mux/output-modes.ts#L32-L95) [src/scenarios/mux/_shared.ts:127-135](../../src/scenarios/mux/_shared.ts#L127-L135)

| Scenario ID | Requested mode | Current structural/metric signal |
|---|---|---|
| `mux/mp4_progressive_buffer` | buffered MP4, `fastStart: false` | `mdat` before `moov` |
| `mux/mp4_streaming_target` | stream target | target-write count is the primary metric |
| `mux/mp4_faststart_reserve` | stream target with reserved fast start | `moov` before `mdat`; target-write count is primary |
| `mux/mp4_fragmented_cmaf` | fragmented MP4 | `moov` init followed by `moof`/`mdat` |

`mp4-box-layout` parses only top-level boxes. It checks `moov`/`moof`/`mdat` presence and order for fragmented output, `moov` before `mdat` for reserve/in-memory fast start, and `mdat` before `moov` for the progressive control. It does not inspect fragment track runs, decode time, sample addressing, reserve/patch behavior, or CMAF profile constraints. [src/core/oracles.ts:491-551](../../src/core/oracles.ts#L491-L551)

The benchmark records `targetWrites` and `bytesOut`, but they are measurements, not assertions that writes were incremental, correctly positioned, or bounded in memory. [src/scenarios/mux/_shared.ts:83-100](../../src/scenarios/mux/_shared.ts#L83-L100) [src/core/runner.ts:1668-1674](../../src/core/runner.ts#L1668-L1674)

### Metamorphic properties

Eight cases ask whether muxing preserves total duration or source-decode pixels. The VFR variants still check total duration rather than the per-sample timestamp cadence that makes them VFR. [src/scenarios/mux/metamorphic.ts:38-156](../../src/scenarios/mux/metamorphic.ts#L38-L156)

| Scenario ID | Property |
|---|---|
| `mux/prop_h264_mux_duration_mp4_to_mkv` | duration survives MP4 → Matroska |
| `mux/prop_h264_mux_duration_mp4_to_ts` | duration survives MP4 → MPEG-TS |
| `mux/prop_vp9_mux_duration_webm_to_webm` | duration survives WebM → WebM |
| `mux/prop_av1_mux_duration_webm_to_mp4` | duration survives WebM → MP4 |
| `mux/prop_h264_decode_mux_mp4_to_mp4` | decoded pixels survive MP4 → MP4 |
| `mux/prop_vp9_decode_mux_webm_to_webm` | decoded pixels survive WebM → WebM |
| `mux/prop_vfr_mux_duration_mp4_to_mp4` | total duration survives a VFR MP4 rewrite |
| `mux/prop_vfr_mux_duration_mp4_to_mkv` | total duration survives a VFR MP4 → Matroska rewrite |

### Negative and size boundaries

Four negative cases are built with `graceful-failure`: illegal H.264→WAV, H.264→Ogg, VP9→ADTS, and a zero-track MP4 request. Clean throw/reject with no output is a PASS; returning output is a FAIL unless the scenario explicitly allows it. [src/scenarios/mux/negative.ts:29-80](../../src/scenarios/mux/negative.ts#L29-L80) [src/scenarios/mux/_shared.ts:294-327](../../src/scenarios/mux/_shared.ts#L294-L327) [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705)

| Scenario ID | Required rejection |
|---|---|
| `mux/neg_h264_into_wav_illegal` | video cannot be authored as WAVE audio |
| `mux/neg_h264_into_ogg_illegal` | this H.264/Ogg tuple is deliberately illegal |
| `mux/neg_vp9_into_adts_illegal` | VP9 cannot be authored as AAC ADTS |
| `mux/neg_zero_tracks_empty_audio_to_mp4` | no selected tracks must not produce a nominal MP4 |

Six size cases cover a one-frame MP4 and Matroska, a small 360p MP4, two 1080p/120-second inputs, and one-hour M4A. The two large-video cells rank throughput and use an eighth-realtime duration tolerance. [src/scenarios/mux/size-ladder.ts:34-116](../../src/scenarios/mux/size-ladder.ts#L34-L116)

| Scenario ID | Size/shape |
|---|---|
| `mux/size_micro_1frame_to_mp4` | one-frame H.264 MP4 |
| `mux/size_micro_1frame_to_mkv` | one-frame H.264 Matroska |
| `mux/size_tiny_360p_to_mp4` | short 360p H.264/AAC MP4 |
| `mux/size_large_1080p_to_mp4` | 120-second 1080p H.264/AAC to MP4 |
| `mux/size_large_1080p_to_mkv` | 120-second 1080p H.264/AAC to Matroska |
| `mux/size_longform_audio_to_mp4` | one-hour AAC to MP4 |

The “large” fixture used by both 1080p cases is 89,573,913 bytes. It exercises sustained work and memory, but it is far below the 32-bit chunk-offset boundary and therefore cannot establish correct `co64` authoring. [fixtures/manifest.json:600-612](../../fixtures/manifest.json#L600-L612)

### Capability reach and verdict path

Capability negotiation is token-by-token: operation, input container, output container, codec, encryption, and feature are each tested independently. Mux is deliberately exempt from WebCodecs codec configuration because it copies encoded packets; a tuple that passes those independent checks but is unsupported in combination reaches adapter runtime. [src/core/runner.ts:124-190](../../src/core/runner.ts#L124-L190) [src/core/runner.ts:209-227](../../src/core/runner.ts#L209-L227)

| Engine/adapter | As-built mux reach |
|---|---|
| [Mediabunny](../engines/mediabunny.md) | Declares mux, the broad container/codec surface, fragmented and fast-start modes, VFR timestamps, browser-decode equality, and target writes. [src/engines/mediabunny/adapter.ts:1029-1089](../../src/engines/mediabunny/adapter.ts#L1029-L1089) |
| [ffmpeg.wasm](../engines/ffmpeg-wasm.md) | Declares mux and prepares elementary inputs before invoking FFmpeg stream copy; H.264/HEVC preparation converts length-prefixed samples to Annex B and adds parameter sets. [src/engines/ffmpeg-wasm/adapter.ts:1445-1477](../../src/engines/ffmpeg-wasm/adapter.ts#L1445-L1477) [src/engines/ffmpeg-wasm/adapter.ts:2791-3040](../../src/engines/ffmpeg-wasm/adapter.ts#L2791-L3040) [src/engines/ffmpeg-wasm/adapter.ts:3090-3162](../../src/engines/ffmpeg-wasm/adapter.ts#L3090-L3162) |
| [MP4Box.js](../engines/mp4box.md) | Declares mux only to MP4 from MP4/MOV inputs and advertises exact CTS/DTS preservation; runtime rejects unsupported/non-MP4 and malformed track shapes with `NotApplicableError`. [src/engines/mp4box/adapter.ts:630-681](../../src/engines/mp4box/adapter.ts#L630-L681) [src/engines/mp4box/adapter.ts:806-880](../../src/engines/mp4box/adapter.ts#L806-L880) [src/engines/mp4box/adapter.ts:971-1051](../../src/engines/mp4box/adapter.ts#L971-L1051) |
| [Remotion](../engines/remotion.md) | The composite adapter and its WebCodecs/parser components do not declare mux, so mux cells negotiate to NA_ENGINE. [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91) [src/engines/remotion-webcodecs/adapter.ts:223-263](../../src/engines/remotion-webcodecs/adapter.ts#L223-L263) [src/engines/remotion-media-parser/adapter.ts:179-192](../../src/engines/remotion-media-parser/adapter.ts#L179-L192) |
| [web-demuxer](../engines/web-demuxer.md) | Declares read/demux-oriented operations and no output containers or mux operation, so mux cells negotiate to NA_ENGINE. [src/engines/web-demuxer/adapter.ts:618-665](../../src/engines/web-demuxer/adapter.ts#L618-L665) |
| [aibrush-media](../engines/aibrush-media.md) | Declares a broad mux surface and write-mode features; runtime has explicit not-applicable and graceful-rejection paths for unsupported targets, empty samples, and illegal combinations. [src/engines/aibrush-media/adapter.ts:3752-3886](../../src/engines/aibrush-media/adapter.ts#L3752-L3886) [src/engines/aibrush-media/adapter.ts:4949-5137](../../src/engines/aibrush-media/adapter.ts#L4949-L5137) |

The result type is currently binary at oracle level (`pass: boolean`) and has no DIFF status. After execution, any non-gap oracle failure makes the cell FAIL; a `NotApplicableError` becomes NA_ENGINE; an ordinary thrown exception outside the negative clean-rejection path becomes ERROR. [src/core/scenario.ts:208-222](../../src/core/scenario.ts#L208-L222) [src/core/runner.ts:1382-1468](../../src/core/runner.ts#L1382-L1468)

The packet comparator groups by numeric track index, sorts on DTS/PTS, then requires the same packet count, track-index layout, packet size, and keyframe flag; timestamps may differ only by a constant per-track origin and a tolerance. The `reference-reimport` mux path feeds the candidate’s own MP4/WebM packet table into that comparator against the ffmpeg-baked source golden. [src/core/oracles.ts:835-969](../../src/core/oracles.ts#L835-L969) [src/core/oracles.ts:1299-1325](../../src/core/oracles.ts#L1299-L1325)

## Contracts and invariants

1. **Family identity.** Every case is a stable `mux/<suffix>` scenario, executes `op: 'mux'`, requires both `demux` and `mux`, and must be registered exactly once. [src/scenarios/mux/_shared.ts:203-228](../../src/scenarios/mux/_shared.ts#L203-L228) [src/scenarios/index.ts:49-67](../../src/scenarios/index.ts#L49-L67)
2. **No implicit encode.** Input packets are already encoded. Mux may change container framing and codec-configuration placement, but it must not silently transcode. The shared interface exposes encoded bytes and timing rather than frames. [src/core/engine.ts:163-179](../../src/core/engine.ts#L163-L179)
3. **Track intent is observable.** Single-source defaults, selectors, and multi-source assembly must yield exactly the requested media types and ordinals. The order of container track IDs is not itself semantic; selected track identity, codec, and content are. Current selector behavior is adapter-local. [src/scenarios/mux/multi-source.ts:36-115](../../src/scenarios/mux/multi-source.ts#L36-L115) [src/engines/mediabunny/adapter.ts:386-423](../../src/engines/mediabunny/adapter.ts#L386-L423)
4. **Timing has two axes.** PTS expresses presentation and DTS expresses decode order. An implementation must preserve composition offsets, durations, and monotonic decode order after any legal timebase rescaling; equality of total duration alone is insufficient for B-frame or VFR cases. The data model already keeps both axes. [src/core/engine.ts:163-179](../../src/core/engine.ts#L163-L179)
5. **Codec configuration is part of the track.** `description` may carry records such as `avcC`, `hvcC`, or `esds`; an output may instead legally carry required parameter sets in band. The oracle must judge whether the resulting stream is valid and decodable, not require the source’s byte placement. [src/core/engine.ts:163-175](../../src/core/engine.ts#L163-L175)
6. **Layout options are contracts.** `fastStart: false`, `fastStart: reserve`, fragmented output, and a stream target request different authoring behavior. They must be correctness-checked independently of throughput measurements. Today only final top-level MP4 order is checked. [src/scenarios/mux/output-modes.ts:32-95](../../src/scenarios/mux/output-modes.ts#L32-L95) [src/core/oracles.ts:491-551](../../src/core/oracles.ts#L491-L551)
7. **Unsupported is not incorrect.** A valid requested tuple that an adapter cannot implement is NA_ENGINE via `NotApplicableError`; a tuple intentionally defined as illegal remains executable and passes only when it rejects cleanly. The runner already recognizes the exception name and the negative builder already selects `graceful-failure`. [src/core/runner.ts:686-694](../../src/core/runner.ts#L686-L694) [src/scenarios/mux/_shared.ts:309-327](../../src/scenarios/mux/_shared.ts#L309-L327)
8. **Correctness gates performance.** Wall time, realtime throughput, peak memory, target writes, bytes out, and long tasks describe a correct output; they do not make an invalid output acceptable. [src/scenarios/mux/_shared.ts:83-100](../../src/scenarios/mux/_shared.ts#L83-L100)
9. **Golden packets are evidence, not a unique serialization.** They are authoritative for coded-media content and timing intent, but packet size, NAL-unit grouping, track numbering, interleave, and parameter-set placement can vary legally across containers and muxers. The current exact comparator violates this intended invariant. [src/core/oracles.ts:835-926](../../src/core/oracles.ts#L835-L926)
10. **Negative outputs are absent.** Illegal target/codec or zero-track cases must reject within their timeout without crash, hang, out-of-memory, or a nominal output. [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705)

## Target design and known gaps

### Target design

The target mux verdict pipeline is:

1. **Preflight applicability.** Evaluate the complete tuple—operation × source container(s) × selected track codecs × output container × write mode × track topology—not merely each capability token in isolation. If the tuple is valid in principle but this adapter cannot perform it, throw `NotApplicableError`; the runner records NA_ENGINE. Deliberately illegal negative scenarios bypass this applicability shortcut and execute the rejection test.
2. **Parse and validate the candidate container.** Require a structurally valid target with the selected track set, declared codecs, usable configuration, legal timestamps, and no missing media. ISO BMFF conformance must follow the current base media file format and carriage rules; fragmented MP4 must have an initialization segment and valid movie-fragment media segments. [ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html) [ISO/IEC 14496-15:2024](https://www.iso.org/standard/89118.html) [MSE ISO BMFF byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/)
3. **Re-import semantically.** Match tracks by type and declared selection identity, not numeric output index. Compare codec family, decoded content or elementary-stream access units, PTS/DTS/duration after rational timebase conversion, random-access semantics, and configuration sufficiency. Container-specific readers should cover every advertised target rather than turning valid Ogg, ADTS, MP3, WAV, Matroska/WebM, or TS outputs into unavailable evidence.
4. **Classify differences.** Return PASS when semantic media and required output-mode behavior match with no material representation deviation; DIFF when the file is valid, complete, and semantically equivalent but differs from the ffmpeg-baked golden’s representation; FAIL only for wrong, missing, malformed, mistimed, or unusable media. The runner and reports must preserve the three-way oracle verdict rather than reducing it to a Boolean.
5. **Measure after correctness.** Collect the existing metrics and output-mode diagnostics only after semantic and structural validation. A fast corrupt mux is FAIL; a valid but differently grouped mux can be DIFF and still retain its measurements.

The semantic re-import must treat the following representation changes as non-failures when validity is demonstrated:

- H.264/H.265 length-prefixed samples versus Annex B start-code samples, and codec parameter sets stored in `avcC`/`hvcC` versus carried in band. WebCodecs explicitly distinguishes an AVC decoder configuration with an `AVCDecoderConfigurationRecord` from Annex B data without it; encoded chunks are access units, not a mandate for one container packetization. [WebCodecs AVC registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/) [WebCodecs `EncodedVideoChunk`](https://www.w3.org/TR/webcodecs/#encodedvideochunk-interface)
- Parameter-set repetition at random-access points and legal grouping of multiple NAL units into one access unit. FFmpeg’s official `h264_mp4toannexb` and `hevc_mp4toannexb` filters exist precisely because MPEG-TS and raw Annex B carriage differ from MP4 length prefixes and out-of-band extradata. [FFmpeg bitstream filters](https://ffmpeg.org/ffmpeg-bitstream-filters.html#h264_005fmp4toannexb)
- Matroska/WebM block grouping, lacing, cluster boundaries, and cue placement. Matroska permits lacing multiple frames into one Block, while the WebM media-segment contract constrains Cluster/Block ordering rather than reproducing a source packet table. [RFC 9559, lacing](https://www.rfc-editor.org/rfc/rfc9559.html#section-10.3) [WebM byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-webm/)
- Ogg page boundaries and packet segmentation. Ogg packets may span pages and pages may contain several packets; granule position, sequence, completion, and codec semantics are the invariants. [RFC 3533](https://www.rfc-editor.org/rfc/rfc3533.html)

Output-mode acceptance must be explicit:

- **Progressive buffered MP4:** valid `ftyp`/movie/media structures with `mdat` before the final `moov`, plus a successful semantic re-import.
- **Fast-start reserve:** `moov` before media and proof from target-write telemetry that reserved space was patched through valid positioned writes without corrupt gaps or overlap. Mediabunny documents reserve as a distinct fast-start mode requiring space estimation; final box order alone is insufficient. [Mediabunny output formats](https://mediabunny.dev/guide/output-formats#mp4)
- **Stream target:** more than one valid incremental write for a nontrivial asset, correct positioned-write semantics where supported, exact reconstruction of the final bytes, and a bounded-buffer diagnostic. Mediabunny’s output model distinguishes in-memory and stream targets and describes multi-track buffering/interleaving. [Mediabunny writing guide](https://mediabunny.dev/guide/writing-media-files)
- **Fragmented MP4:** `ftyp` + `moov` initialization followed by one or more optional `styp` + `moof` + `mdat` media segments, with valid `traf`, `tfdt`, sample runs, offsets, and referenced media bytes. Do not call the scenario CMAF-conformant merely because those top-level boxes exist. [MSE ISO BMFF initialization and media segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/)

Track/timing acceptance must likewise be specific:

- Preserve separate DTS and PTS through B-frame muxing, allow only rational timebase-rounding error, and verify composition offsets after re-import.
- Compare VFR sample timelines or frame presentation timestamps, not only overall duration.
- Assert exact selected media types and content identities for multi-source cases; output track order and numeric index may differ.
- Assert rotation both structurally and at presentation: preserve or intentionally transform display-matrix/orientation semantics, then compare presented pixels under the same policy.
- Validate WAV `fmt ` and `data` semantics for the requested PCM type, ADTS frame headers for AAC, Ogg codec headers and granule progression, WebM/Matroska CodecPrivate plus Blocks/Clusters, and TS program/PES/timestamp structure. [Microsoft RIFF/WAVE](https://learn.microsoft.com/en-us/windows/win32/xaudio2/resource-interchange-file-format--riff-) [MSE MPEG audio byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-mpeg-audio/) [Matroska codec mappings](https://www.matroska.org/technical/codec_specs.html) [ITU-T H.222.0](https://www.itu.int/rec/T-REC-H.222.0)

### Known gaps

1. **The verdict cannot express representation difference.** Current: `OracleOutcome.pass` is Boolean and `ResultStatus` omits DIFF; any substantive false oracle becomes FAIL. Consequence: a valid mux can be graded the same as corrupt media. Target: add DIFF end-to-end and use it only after structural validity and semantic equivalence are proven. Verification: require PASS for the normalized-equivalent representation, DIFF after an intentional legal representation change, and FAIL after a sample is corrupted or dropped. [src/core/scenario.ts:208-222](../../src/core/scenario.ts#L208-L222) [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447)
2. **Golden-packet equality is representation-sensitive.** Current: the comparator requires byte-size, keyframe flag, packet count, numeric track layout, and position-by-position grouping to match the ffmpeg-baked golden. Consequence: Annex B versus AVCC, inline SPS/PPS, Matroska lacing, and legal NAL/access-unit grouping can false-fail even when decode, timing, and random access are correct. Target: split semantic failures from representation diagnostics; valid regrouping is DIFF, loss/corruption/mistiming is FAIL. Verification: round-trip the same H.264 through MP4 and TS/Matroska with deliberate legal parameter-set and grouping changes, then compare decoded frames and normalized access-unit timelines. [src/core/oracles.ts:835-969](../../src/core/oracles.ts#L835-L969) [WebCodecs AVC registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/) [FFmpeg bitstream filters](https://ffmpeg.org/ffmpeg-bitstream-filters.html#h264_005fmp4toannexb)
3. **The capability gate is too coarse for combinations.** Current: capabilities are tested as independent tokens, and mux bypasses the browser codec gate; a declared codec and declared container can still be unsupported together at runtime. Mediabunny’s mux path throws ordinary `Error` for an unsupported container or codec, while Remotion and Remotion Media Parser do not declare mux and the parser’s defensive mux stub also throws ordinary `Error`. Consequence: combinatorial unsupported cases can leak into FAIL/ERROR and encourage a hand-kept disabled-cell list. Target: preflight the concrete tuple in `prepareMuxTracks`/`mux`; Mediabunny, Remotion, and Remotion Media Parser runtime-not-supported paths must throw `NotApplicableError` for a valid but unsupported request so the runner emits NA_ENGINE. Verification: construct pairwise and three-way matrices where every individual token is declared but some tuples are not; every unsupported valid tuple must be NA_ENGINE without a disabled cell. [src/core/runner.ts:124-227](../../src/core/runner.ts#L124-L227) [src/engines/mediabunny/adapter.ts:1517-1549](../../src/engines/mediabunny/adapter.ts#L1517-L1549) [src/engines/remotion-media-parser/adapter.ts:179-192](../../src/engines/remotion-media-parser/adapter.ts#L179-L192) [src/engines/remotion-media-parser/adapter.ts:533-535](../../src/engines/remotion-media-parser/adapter.ts#L533-L535) [src/core/runner.ts:686-694](../../src/core/runner.ts#L686-L694)
4. **Negative illegality and adapter non-applicability need an explicit boundary.** Current: the negative family expects an ordinary clean rejection, while some adapters use not-applicable errors for unsupported output shapes. Consequence: converting every mux error to `NotApplicableError` would incorrectly turn a conformance rejection into NA_ENGINE. Target: scenario-declared illegal tuples must run and PASS only on clean rejection; implementation-limited but valid tuples must be NA_ENGINE. Verification: run each of the four negative IDs beside a valid unsupported tuple and assert PASS versus NA_ENGINE respectively. [src/scenarios/mux/negative.ts:29-80](../../src/scenarios/mux/negative.ts#L29-L80) [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705)
5. **Multi-source correctness is reduced mostly to first-source duration.** Current: track selection and source lists suppress faithful re-import, leaving the generic duration property; `swapAudioFrom` has no generic runner semantics. Consequence: a mux can drop, duplicate, or choose the wrong auxiliary track while preserving approximately the primary input’s duration. Target: define one shared selector grammar, normalize selected identities before adapter dispatch, and re-import to verify exact media types/codecs/content per source. Verification: use distinguishable tone frequencies and frame watermarks, permute output track order, and require identical semantic selection. [src/scenarios/mux/_shared.ts:183-200](../../src/scenarios/mux/_shared.ts#L183-L200) [src/scenarios/mux/multi-source.ts:36-115](../../src/scenarios/mux/multi-source.ts#L36-L115)
6. **B-frame and VFR checks do not fully cover the timeline.** Current: the interface retains DTS/PTS, but Mediabunny preparation collapses DTS to PTS; VFR scenarios assert total duration. Consequence: composition order or cadence can be wrong while the final duration and even some decode comparisons look acceptable. Target: compare normalized per-track DTS, PTS, duration, decode monotonicity, composition offsets, and VFR intervals. Verification: use the B-frame and VFR fixtures and require exact rational timestamp sequences within one target-tick rounding. [src/core/engine.ts:163-179](../../src/core/engine.ts#L163-L179) [src/engines/mediabunny/adapter.ts:1194-1248](../../src/engines/mediabunny/adapter.ts#L1194-L1248) [src/scenarios/mux/metamorphic.ts:120-150](../../src/scenarios/mux/metamorphic.ts#L120-L150)
7. **Output-mode evidence is shallow.** Current: MP4 layout inspects top-level box order, while `targetWrites` is only a metric. Consequence: a single buffered write can satisfy the “stream” scenario, a reserve implementation can rewrite in memory, and malformed fragment internals can pass the shape gate. Target: validate the stream write trace and fragment internals described above. Verification: replay positioned writes into a sparse model, reject overlap/gaps/out-of-range patches, reconstruct exact output bytes, and independently parse each fragment’s decode time, runs, and offsets. [src/core/oracles.ts:491-551](../../src/core/oracles.ts#L491-L551) [src/core/runner.ts:1668-1674](../../src/core/runner.ts#L1668-L1674) [MSE ISO BMFF byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/)
8. **The fragmented scenario name overclaims CMAF.** Current: `mux/mp4_fragmented_cmaf` requests `fragmented: true`, and the oracle checks only `moov` before `moof`/`mdat`. Consequence: the label can be read as CMAF certification without checking brands, tracks, fragment timing, switching constraints, or profile rules. Target: rename it to fragmented MP4 or add a dedicated, sourced CMAF conformance oracle. Verification: a valid generic fMP4 outside the chosen CMAF profile must not be reported as CMAF PASS. [src/scenarios/mux/output-modes.ts:78-91](../../src/scenarios/mux/output-modes.ts#L78-L91) [src/core/oracles.ts:514-529](../../src/core/oracles.ts#L514-L529)
9. **Format coverage can become NA_ASSET instead of a verdict.** Current: duration re-import is strongest for MP4/WebM and simple PCM; packet re-import is limited to MP4/WebM and explicitly returns unavailable when output is outside the reader or is fragmented/laced/reordered. Consequence: advertised Ogg, ADTS, MP3, TS, WAV, and some Matroska outputs may be benchmarked without a deep semantic gate. Target: add neutral parsers/decoders for every advertised write target and reserve NA_ASSET for actually missing goldens/assets. Verification: every applicable write-target scenario must produce at least one decisive semantic oracle result. [src/core/oracles.ts:929-969](../../src/core/oracles.ts#L929-L969) [src/core/oracles.ts:2802-2817](../../src/core/oracles.ts#L2802-L2817)
10. **The size ladder does not test large-file addressing.** Current: the largest input used by mux size scenarios is about 89.6 MB. Consequence: the suite cannot prove transition from 32-bit `stco` offsets to 64-bit `co64`, large-size boxes, or streaming behavior across 4 GiB. Target: add a sparse/generated >4 GiB MP4 authoring case gated as a long resource test, plus a parser assertion that offsets and box sizes remain valid. Verification: place media beyond `0xffffffff`, re-import samples at both sides of the boundary, and require no truncation or wraparound. [src/scenarios/mux/size-ladder.ts:73-98](../../src/scenarios/mux/size-ladder.ts#L73-L98) [fixtures/manifest.json:600-612](../../fixtures/manifest.json#L600-L612)
11. **Rotation is not fully specified.** Current: both MOV and Matroska rotation cases use decoded-frame equality, but neither explicitly asserts the re-imported display-matrix/orientation representation. Consequence: a browser’s presentation behavior can hide dropped, double-applied, or differently encoded orientation metadata. Target: define whether mux preserves the coded raster plus orientation metadata or bakes orientation into pixels, then test both structure and presentation under that policy. Verification: inspect re-imported orientation and compare presentation-normalized frames. [src/scenarios/mux/codec-edges.ts:75-100](../../src/scenarios/mux/codec-edges.ts#L75-L100)
12. **Metrics do not prove streaming.** Current: stream cases rank `targetWrites`, and all ordinary cases report performance counters, but correctness does not impose write-count or memory bounds. Consequence: an adapter can buffer the whole file, emit once, and still receive a correctness PASS. Target: pair a minimum-write contract for nontrivial streams with a peak-buffer watermark and correctly reconstructed output. Verification: run the same large asset through buffer and stream targets and assert multiple writes plus materially bounded live buffering for the stream path. [src/scenarios/mux/output-modes.ts:47-75](../../src/scenarios/mux/output-modes.ts#L47-L75) [src/scenarios/mux/_shared.ts:83-100](../../src/scenarios/mux/_shared.ts#L83-L100)

## Sources

### Repository evidence

- [src/scenarios/mux/index.ts:46-123](../../src/scenarios/mux/index.ts#L46-L123) — seven baseline cases and family assembly.
- [src/scenarios/mux/_shared.ts:83-135](../../src/scenarios/mux/_shared.ts#L83-L135) and [src/scenarios/mux/_shared.ts:183-228](../../src/scenarios/mux/_shared.ts#L183-L228) — builders, requirements, oracle selection, metrics, and feature derivation.
- [src/scenarios/mux/write-targets.ts:38-168](../../src/scenarios/mux/write-targets.ts#L38-L168) — MOV, Ogg, WAV, ADTS, MP3, WebM, Matroska, and MP4 audio outputs.
- [src/scenarios/mux/multi-source.ts:36-115](../../src/scenarios/mux/multi-source.ts#L36-L115) — assembly and track-selection cases.
- [src/scenarios/mux/codec-edges.ts:39-157](../../src/scenarios/mux/codec-edges.ts#L39-L157) — B-frame, rotation, HEVC, and multi-track cases.
- [src/scenarios/mux/output-modes.ts:32-95](../../src/scenarios/mux/output-modes.ts#L32-L95) — buffer, stream, reserve, and fragmented cases.
- [src/scenarios/mux/metamorphic.ts:38-156](../../src/scenarios/mux/metamorphic.ts#L38-L156) — duration and decode-equality properties.
- [src/scenarios/mux/negative.ts:29-80](../../src/scenarios/mux/negative.ts#L29-L80) — deliberate rejection cases.
- [src/scenarios/mux/size-ladder.ts:34-116](../../src/scenarios/mux/size-ladder.ts#L34-L116) and [fixtures/manifest.json:600-612](../../fixtures/manifest.json#L600-L612) — size scenarios and actual fixture sizes.
- [src/core/engine.ts:163-179](../../src/core/engine.ts#L163-L179) — encoded-track and mux adapter contracts.
- [src/core/scenario.ts:208-222](../../src/core/scenario.ts#L208-L222) — current result and oracle types.
- [src/core/runner.ts:124-190](../../src/core/runner.ts#L124-L190) and [src/core/runner.ts:686-830](../../src/core/runner.ts#L686-L830) — negotiation, mux dispatch, runtime status mapping, and metrics.
- [src/core/oracles.ts:491-551](../../src/core/oracles.ts#L491-L551), [src/core/oracles.ts:835-969](../../src/core/oracles.ts#L835-L969), and [src/core/oracles.ts:1299-1325](../../src/core/oracles.ts#L1299-L1325) — packet, layout, duration, decode, re-import, and graceful-failure verdicts.
- [src/engines/mediabunny/adapter.ts:386-423](../../src/engines/mediabunny/adapter.ts#L386-L423), [src/engines/ffmpeg-wasm/adapter.ts:2791-3040](../../src/engines/ffmpeg-wasm/adapter.ts#L2791-L3040), [src/engines/mp4box/adapter.ts:806-880](../../src/engines/mp4box/adapter.ts#L806-L880), [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91), [src/engines/remotion-webcodecs/adapter.ts:223-263](../../src/engines/remotion-webcodecs/adapter.ts#L223-L263), [src/engines/remotion-media-parser/adapter.ts:179-192](../../src/engines/remotion-media-parser/adapter.ts#L179-L192), [src/engines/web-demuxer/adapter.ts:618-665](../../src/engines/web-demuxer/adapter.ts#L618-L665), and [src/engines/aibrush-media/adapter.ts:4949-5137](../../src/engines/aibrush-media/adapter.ts#L4949-L5137) — engine-specific capability and mux behavior.

### External authorities

- [ISO/IEC 14496-12:2026 — ISO base media file format](https://www.iso.org/standard/85596.html) — current ISO BMFF structure and timing authority. Accessed 2026-07-16.
- [ISO/IEC 14496-15:2024 — carriage of NAL-unit structured video](https://www.iso.org/standard/89118.html) — AVC/HEVC and related carriage in ISO BMFF. Accessed 2026-07-16.
- [W3C MSE ISO BMFF byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/) — initialization and fragmented media segment requirements. Accessed 2026-07-16.
- [W3C WebCodecs AVC codec registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/) — AVC access units, AVCC configuration, and Annex B distinction. Accessed 2026-07-16.
- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/#encodedvideochunk-interface) — encoded chunk timestamp, duration, type, and data model. Accessed 2026-07-16.
- [FFmpeg bitstream filters](https://ffmpeg.org/ffmpeg-bitstream-filters.html#h264_005fmp4toannexb) — official MP4 length-prefix to Annex B conversion behavior. Accessed 2026-07-16.
- [RFC 9559 — Matroska](https://www.rfc-editor.org/rfc/rfc9559.html) — Matroska structure, Blocks, and lacing. Accessed 2026-07-16.
- [W3C MSE WebM byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-webm/) — WebM initialization, Cluster, and Block constraints. Accessed 2026-07-16.
- [Matroska codec mappings](https://www.matroska.org/technical/codec_specs.html) — CodecID and CodecPrivate mappings, including AVC/HEVC. Accessed 2026-07-16.
- [RFC 3533 — Ogg encapsulation](https://www.rfc-editor.org/rfc/rfc3533.html) — page, packet segmentation, granule, and sequencing rules. Accessed 2026-07-16.
- [W3C MSE MPEG audio byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-mpeg-audio/) — ADTS AAC and MPEG audio frame-stream rules. Accessed 2026-07-16.
- [Microsoft RIFF/WAVE format](https://learn.microsoft.com/en-us/windows/win32/xaudio2/resource-interchange-file-format--riff-) — RIFF chunk and WAVE `fmt `/`data` structure. Accessed 2026-07-16.
- [ITU-T H.222.0](https://www.itu.int/rec/T-REC-H.222.0) — MPEG transport/program stream systems specification. Accessed 2026-07-16.
- [Mediabunny: writing media files](https://mediabunny.dev/guide/writing-media-files) and [output formats](https://mediabunny.dev/guide/output-formats#mp4) — stream targets, multi-track buffering, MP4 fast-start modes, and fragmentation. Accessed 2026-07-16.
- [MP4Box.js](https://github.com/gpac/mp4box.js/) — official project description for parsing, writing, segmentation, and fragmentation. Accessed 2026-07-16.
- [ffmpeg.wasm API](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/) — browser FFmpeg execution contract. Accessed 2026-07-16.
- [Remotion WebCodecs conversion](https://www.remotion.dev/docs/webcodecs/convert-media) — current experimental/deprecated conversion surface. Accessed 2026-07-16.
- [web-demuxer](https://github.com/bilibili/web-demuxer) — official demux-only project scope and WebCodecs integration intent. Accessed 2026-07-16.
