# Robustness

> Scope: The robustness scenario family, including hard-but-valid media, malformed and mutated inputs, boundary behavior, metamorphic properties, and per-file robustness coverage; general runner, oracle, fixture, adapter, and reporting mechanics remain owned by their subsystem pages.
> Phase-2 owner: p2_feature_robustness.

## Purpose

Robustness asks whether an engine remains correct, bounded, and diagnosable when media is unusual, damaged, incomplete, adversarial, or presented in multiple concrete forms. It distinguishes a valid difficult input from an intentionally malformed one, and it preserves enough evidence to tell a media defect from an unsupported combination or a harness failure. The unit registered by the suite is a [scenario](../glossary.md); the scored engine × scenario × browser unit is a [cell](../glossary.md).

This page is the feature specification for authors adding robustness rows and for later cleanup work in the [runner and capability negotiation](../subsystems/runner-capability-negotiation.md), [oracle system](../subsystems/oracle-system.md), [media selection](../subsystems/media-selection.md), [fixtures](../subsystems/golden-baking-fixtures.md), and [reporting](../subsystems/reporting-aggregation.md). It inventories the family as it executes today, then defines the target in which partial corpus coverage is visible rather than collapsed.

## As-built

### Registration and dispatch

The family exports one flattened array assembled from ten local groups, and the global registry inserts that array under the canonical `robustness` family before flattening the full battery. [src/scenarios/robustness/index.ts:1158-1172](../../src/scenarios/robustness/index.ts#L1158-L1172) [src/scenarios/index.ts:32-50](../../src/scenarios/index.ts#L32-L50)

Every scenario whose family is `robustness` is routed through `runRobustness`, even when its oracle is positive metadata, packet, pixel, playback, decrypt, or property validation rather than `graceful-failure`. [src/core/runner.ts:1253-1256](../../src/core/runner.ts#L1253-L1256) [src/core/runner.ts:1369-1380](../../src/core/runner.ts#L1369-L1380) The route executes the requested engine operation, maps `NotApplicableError` to `NA_ENGINE`, maps timeout to `FAIL`, captures any other thrown error, builds the oracle context, runs every declared oracle, and never runs the benchmark loop. [src/core/runner.ts:1522-1625](../../src/core/runner.ts#L1522-L1625)

The implemented inventory contains 60 scenarios: 30 probes, 11 remuxes, six demuxes, four frame decodes, three trims, two seeks, two transcodes, one mux, and one decrypt. The tables below group them by behavioral purpose rather than source-array boundaries.

### Hard-but-valid format and timeline edges

These rows expect a valid observation or transformation; a clean rejection is not success unless applicability has first been established as `NA_ENGINE` or `NA_BROWSER`.

| Scenario | Operation and implemented gate | Repository evidence |
| --- | --- | --- |
| `robustness/edge_open_gop_bframes_decode` | Decode up to 90 reordered H.264 frames; `decoded-frames-bitexact`. | [src/scenarios/robustness/index.ts:49-58](../../src/scenarios/robustness/index.ts#L49-L58) |
| `robustness/edge_vfr_probe` | Probe VFR H.264; `golden-metadata` with an explicit 0.1 fps tolerance. | [src/scenarios/robustness/index.ts:60-67](../../src/scenarios/robustness/index.ts#L60-L67) |
| `robustness/edge_rotated_remux` | Remux rotated MP4 to MOV; `reference-reimport` plus `playback-smoke`. | [src/scenarios/robustness/index.ts:70-80](../../src/scenarios/robustness/index.ts#L70-L80) |
| `robustness/edge_multitrack_demux` | Demux interleaved H.264/AAC tracks; `golden-packets`. | [src/scenarios/robustness/index.ts:83-90](../../src/scenarios/robustness/index.ts#L83-L90) |
| `robustness/edge_headerless_recorder_probe`<br>`robustness/edge_headerless_recorder_remux` | Probe a sparse-Cues/unknown-duration recorder WebM, then separately rewrap it; metadata for probe, re-import plus playback for remux. | [src/scenarios/robustness/index.ts:93-113](../../src/scenarios/robustness/index.ts#L93-L113) |
| `robustness/edge_pcm_s16be_probe` | Probe big-endian PCM in AIFF; `golden-metadata`. | [src/scenarios/robustness/index.ts:116-127](../../src/scenarios/robustness/index.ts#L116-L127) |
| `robustness/edge_pcm_s24_decode` | Identity-transcode 24-bit PCM WAV and compare decoded source/output PCM digests through `property-invariant`. | [src/scenarios/robustness/index.ts:130-140](../../src/scenarios/robustness/index.ts#L130-L140) |
| `robustness/edge_cbcs_boundary_decrypt` | Decrypt CENC `cbcs` with fixture-matched KID/key; `decrypt-bitexact`. | [src/scenarios/robustness/index.ts:143-153](../../src/scenarios/robustness/index.ts#L143-L153) |
| `robustness/edge_faststart_reserve_remux` | Exercise reserved fast-start output and a large forward target seek; re-import plus playback. | [src/scenarios/robustness/index.ts:156-166](../../src/scenarios/robustness/index.ts#L156-L166) |
| `robustness/edge_fragmented_remux` | Produce fragmented MP4; re-import plus playback. | [src/scenarios/robustness/index.ts:169-179](../../src/scenarios/robustness/index.ts#L169-L179) |
| `robustness/edge_longform_probe` | Probe a one-hour AAC asset; `golden-metadata`. | [src/scenarios/robustness/index.ts:182-188](../../src/scenarios/robustness/index.ts#L182-L188) |

The common edge mapper attaches `wall`, `peakMemory`, and `longtasks` metric declarations and a 15-second timeout. Those declarations do not produce samples on this execution route because robustness returns before benchmarking. [src/scenarios/robustness/index.ts:204-226](../../src/scenarios/robustness/index.ts#L204-L226) [src/core/runner.ts:1623-1625](../../src/core/runner.ts#L1623-L1625)

### Structure and scale edges

| Scenario | Implemented observation | Repository evidence |
| --- | --- | --- |
| `robustness/edge_audio_only_micro_probe`<br>`robustness/edge_audio_only_probe` | Golden-backed enumeration of an AAC-only micro M4A and a normal-length audio-only M4A. | [src/scenarios/robustness/index.ts:619-639](../../src/scenarios/robustness/index.ts#L619-L639) |
| `robustness/edge_video_only_micro_probe`<br>`robustness/edge_video_only_probe` | Golden-backed enumeration of a one-frame and a normal video-only H.264 MP4. | [src/scenarios/robustness/index.ts:641-660](../../src/scenarios/robustness/index.ts#L641-L660) |
| `robustness/edge_no_media_tracks_probe` | Probe a valid WAV with an empty data chunk; `golden-metadata`. | [src/scenarios/robustness/index.ts:662-670](../../src/scenarios/robustness/index.ts#L662-L670) |
| `robustness/edge_dims_1x1_probe`<br>`robustness/edge_dims_1x1_decode`<br>`robustness/edge_dims_2x2_h264_probe` | Probe minimum VP9/H.264 dimensions and perceptually compare one decoded 1×1 frame. | [src/scenarios/robustness/index.ts:675-707](../../src/scenarios/robustness/index.ts#L675-L707) |
| `robustness/edge_extreme_fps_1_probe`<br>`robustness/edge_extreme_fps_240_probe` | Golden-backed duration/fps observation at 1 fps and 240 fps. | [src/scenarios/robustness/index.ts:712-729](../../src/scenarios/robustness/index.ts#L712-L729) |
| `robustness/edge_ts_pts_wraparound_demux` | Despite its id, the declared operation is `probe`; metadata uses a very wide 30 fps tolerance on a discontinuous MPEG-TS input. | [src/scenarios/robustness/index.ts:747-758](../../src/scenarios/robustness/index.ts#L747-L758) |
| `robustness/edge_gapless_priming_probe` | Probe AAC duration across encoder delay, padding, and an edit-list presentation; `golden-metadata`. | [src/scenarios/robustness/index.ts:767-776](../../src/scenarios/robustness/index.ts#L767-L776) |
| `robustness/edge_5_1_channels_probe` | Probe a 5.1-channel PCM WAV; `golden-metadata`. | [src/scenarios/robustness/index.ts:781-789](../../src/scenarios/robustness/index.ts#L781-L789) |
| `robustness/edge_flac_with_seektable_probe`<br>`robustness/edge_flac_without_seektable_probe` | Probe matched FLAC content with and without SEEKTABLE, each against its own metadata golden. | [src/scenarios/robustness/index.ts:973-1007](../../src/scenarios/robustness/index.ts#L973-L1007) |

The shape mapper attaches `wall`, `peakMemory`, and `longtasks` with a 15-second timeout. It does not enforce resource ceilings, and its declared metrics are not measured by the robustness path. [src/scenarios/robustness/index.ts:792-810](../../src/scenarios/robustness/index.ts#L792-L810) [src/core/runner.ts:1623-1625](../../src/core/runner.ts#L1623-L1625)

### Boundary inputs and still images

| Scenario | Implemented behavior | Repository evidence |
| --- | --- | --- |
| `robustness/edge_zero_length_probe` | A zero-byte MP4 may reject or return output; `gracefulAllowOutput: true` makes either route eligible to pass `graceful-failure`. | [src/scenarios/robustness/index.ts:191-200](../../src/scenarios/robustness/index.ts#L191-L200) |
| `robustness/image_jpeg_probe`<br>`robustness/image_png_probe`<br>`robustness/image_webp_probe` | These are positive image `probe` rows requiring the image container and comparing with `golden-metadata`; they are not images fed to a video-only operation. | [src/scenarios/robustness/index.ts:483-516](../../src/scenarios/robustness/index.ts#L483-L516) |
| `robustness/edge_seek_past_eof`<br>`robustness/edge_seek_negative` | Seek far beyond EOF or before zero; `graceful-failure` accepts either a return or ordinary throw within 15 seconds. The oracle context carries `seek`, but the output-presence inference does not inspect it. | [src/scenarios/robustness/index.ts:518-585](../../src/scenarios/robustness/index.ts#L518-L585) [src/core/oracles.ts:2680-2695](../../src/core/oracles.ts#L2680-L2695) |
| `robustness/edge_mislabeled_container_probe` | Bytes described as MP4/H.264 are presented with a WebM label; detect-by-content or clean rejection is intended, while any returned output is accepted because `gracefulAllowOutput` is true. | [src/scenarios/robustness/index.ts:732-743](../../src/scenarios/robustness/index.ts#L732-L743) |

The file header still describes an “IMAGE NEGATIVES” sub-battery, but the executable definitions implement positive image probing. [src/scenarios/robustness/index.ts:15-16](../../src/scenarios/robustness/index.ts#L15-L16) [src/scenarios/robustness/index.ts:494-515](../../src/scenarios/robustness/index.ts#L494-L515)

### Malformed and deterministic fuzz inputs

| Scenario | Mutation/operation and implemented acceptance | Repository evidence |
| --- | --- | --- |
| `robustness/fuzz_mp4_bitflip_probe`<br>`robustness/fuzz_mp4_header_truncated_demux`<br>`robustness/fuzz_mp4_tail_truncated_demux`<br>`robustness/fuzz_mp4_zeroed_spans_decode` | MP4 bit flips, head removal, 55% tail truncation, and six zeroed payload spans. Some rows allow returned output; all use `graceful-failure`; the zero-span decode has a 60-second timeout. | [src/scenarios/robustness/index.ts:247-285](../../src/scenarios/robustness/index.ts#L247-L285) |
| `robustness/fuzz_webm_bitflip_probe`<br>`robustness/fuzz_webm_header_truncated_demux` | EBML/Matroska bit flips and header removal; probe may return degraded output only where explicitly allowed. | [src/scenarios/robustness/index.ts:287-300](../../src/scenarios/robustness/index.ts#L287-L300) |
| `robustness/fuzz_ts_zeroed_spans_demux` | Zero complete 188-byte transport packets; return/resync or reject. | [src/scenarios/robustness/index.ts:303-310](../../src/scenarios/robustness/index.ts#L303-L310) |
| `robustness/fuzz_flac_bitflip_probe` | Flip FLAC metadata-block bytes; a degraded returned probe is accepted without structural follow-up. | [src/scenarios/robustness/index.ts:312-319](../../src/scenarios/robustness/index.ts#L312-L319) |
| `robustness/fuzz_mp3_header_truncated_probe` | Remove ID3/Xing head; bounded fallback scan or rejection, with returned output allowed. | [src/scenarios/robustness/index.ts:321-327](../../src/scenarios/robustness/index.ts#L321-L327) |
| `robustness/fuzz_remux_zeroed_spans` | Remux MP4 with zeroed sample spans to MKV; returned partial output is accepted without re-import validation. | [src/scenarios/robustness/index.ts:330-339](../../src/scenarios/robustness/index.ts#L330-L339) |
| `robustness/fuzz_encrypted_mp4_ciphertext_decode` | Decode CENC-CTR media after ciphertext spans are zeroed; a clean rejection leaves no frames field and is the pass signal. | [src/scenarios/robustness/index.ts:820-831](../../src/scenarios/robustness/index.ts#L820-L831) |
| `robustness/fuzz_adts_aac_bitflip_probe` | Probe bit-flipped raw ADTS/AAC; returned degraded metadata is allowed. | [src/scenarios/robustness/index.ts:833-842](../../src/scenarios/robustness/index.ts#L833-L842) |
| `robustness/fuzz_ogg_opus_header_truncated_probe` | Probe Ogg/Opus after removing the capture pattern and `OpusHead`; clean rejection is expected. | [src/scenarios/robustness/index.ts:844-852](../../src/scenarios/robustness/index.ts#L844-L852) |
| `robustness/fuzz_truncated_h264_asset_demux` | Demux the dedicated incomplete MP4; partial output or rejection is allowed. | [src/scenarios/robustness/index.ts:854-865](../../src/scenarios/robustness/index.ts#L854-L865) |
| `robustness/fuzz_mux_target_corrupt_remux` | Remux corrupted samples to fragmented MP4; returned partial output is accepted. | [src/scenarios/robustness/index.ts:867-879](../../src/scenarios/robustness/index.ts#L867-L879) |

The first fuzz mapper gives every row `graceful-failure`, `wall` and `peakMemory`, and 15 seconds unless overridden; the extra mapper applies the same default. [src/scenarios/robustness/index.ts:342-360](../../src/scenarios/robustness/index.ts#L342-L360) [src/scenarios/robustness/index.ts:882-901](../../src/scenarios/robustness/index.ts#L882-L901) The fixture baker produces those corruptions deterministically using seeded bit flips, head/tail truncation, and seeded zeroed spans, writes the mutated bytes as normal fixture files, and skips ffprobe golden derivation for the intentionally unreadable set. [fixtures/bake.mjs:241-304](../../fixtures/bake.mjs#L241-L304) [fixtures/bake.mjs:1406-1437](../../fixtures/bake.mjs#L1406-L1437) [fixtures/bake.mjs:1896-1908](../../fixtures/bake.mjs#L1896-L1908)

### Property and metamorphic rows

| Scenario | Declared property and current implementation | Repository evidence |
| --- | --- | --- |
| `robustness/prop_decode_remux_eq_decode_mp4_mkv`<br>`robustness/prop_decode_remux_eq_decode_webm_mkv` | Decode a remuxed MP4/WebM source and compare frame digests with the source-keyed golden decode. | [src/scenarios/robustness/index.ts:384-405](../../src/scenarios/robustness/index.ts#L384-L405) [src/core/oracles.ts:2774-2795](../../src/core/oracles.ts#L2774-L2795) |
| `robustness/prop_remux_duration_preserved` | Compare authored output duration with the source golden using container-specific tolerance. | [src/scenarios/robustness/index.ts:408-417](../../src/scenarios/robustness/index.ts#L408-L417) [src/core/oracles.ts:2797-2847](../../src/core/oracles.ts#L2797-L2847) |
| `robustness/prop_trim_concatenation` | Perform three trims plus candidate `concat`, then compare composed and direct output by duration and perceptual frames. | [src/scenarios/robustness/index.ts:420-445](../../src/scenarios/robustness/index.ts#L420-L445) [src/core/oracles.ts:3491-3580](../../src/core/oracles.ts#L3491-L3580) |
| `robustness/prop_duration_consistent_across_containers` | Probe three inputs; despite the name, the handler compares each measured duration with that input's own golden and does not compare the three durations with one another. | [src/scenarios/robustness/index.ts:448-458](../../src/scenarios/robustness/index.ts#L448-L458) [src/core/oracles.ts:3942-3998](../../src/core/oracles.ts#L3942-L3998) |
| `robustness/prop_transcode_idempotent_dims_h264` | Same-size H.264 transcode; neutral source-reference `ssim-psnr` with a 0.97 floor plus playback, under 120 seconds. | [src/scenarios/robustness/index.ts:931-965](../../src/scenarios/robustness/index.ts#L931-L965) |
| `robustness/prop_demux_mux_roundtrip_eq` | Parse the mux output's packet table and compare it with the source packet golden. | [src/scenarios/robustness/index.ts:1031-1045](../../src/scenarios/robustness/index.ts#L1031-L1045) [src/core/oracles.ts:3583-3594](../../src/core/oracles.ts#L3583-L3594) |
| `robustness/prop_double_remux_stable` | The runner performs one remux; the handler compares that first output with the source packet golden and does not execute a second remux. | [src/scenarios/robustness/index.ts:1047-1060](../../src/scenarios/robustness/index.ts#L1047-L1060) [src/core/oracles.ts:3596-3610](../../src/core/oracles.ts#L3596-L3610) |
| `robustness/prop_flac_seek_seektable_equiv` | Candidate trims matched windows from FLAC with/without SEEKTABLE, then compares STREAMINFO and browser-decoded PCM. | [src/scenarios/robustness/index.ts:1063-1083](../../src/scenarios/robustness/index.ts#L1063-L1083) [src/core/oracles.ts:2930-3051](../../src/core/oracles.ts#L2930-L3051) |
| `robustness/prop_gapless_sample_count_priming` | Decode the whole-range trimmed AAC and compare decoded sample count/duration with priming-removed golden expectations. | [src/scenarios/robustness/index.ts:1085-1105](../../src/scenarios/robustness/index.ts#L1085-L1105) [src/core/oracles.ts:3061-3133](../../src/core/oracles.ts#L3061-L3133) |
| `robustness/prop_trim_additivity_compose` | A second registered trim-composition contract with a tight SSIM floor and 60-second timeout, using the same compose handler. | [src/scenarios/robustness/index.ts:1108-1133](../../src/scenarios/robustness/index.ts#L1108-L1133) [src/core/oracles.ts:3491-3580](../../src/core/oracles.ts#L3491-L3580) |

Although the declaration block still calls the final five rows “TODO” and “HONEST-FAIL,” the current oracle dispatcher has live branches for round-trip packets, FLAC seek equivalence, gapless sample counts, and trim composition. The double-remux reduction remains weaker than its label. [src/scenarios/robustness/index.ts:1009-1013](../../src/scenarios/robustness/index.ts#L1009-L1013) [src/core/oracles.ts:2754-2768](../../src/core/oracles.ts#L2754-L2768)

### Current verdict, coverage, and reporting path

The result vocabulary currently has `PASS`, `FAIL`, the three `NA_*` statuses, `ERROR`, and `SKIPPED`. An `OracleOutcome` is only `{ oracle, pass: boolean, detail?, measurements? }`; there is no current `DIFF` representation. [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221) A non-golden oracle failure wins; otherwise any passing survivor oracle preserves `PASS`, while an all-golden-gap set becomes `NA_ASSET`. [src/core/runner.ts:1423-1443](../../src/core/runner.ts#L1423-L1443) The robustness route repeats that survivor policy. [src/core/runner.ts:1606-1625](../../src/core/runner.ts#L1606-L1625)

`graceful-failure` infers success when no output, metadata, demux result, or frames exist. If `gracefulAllowOutput` is true, any returned result passes without another structural or semantic check. It does not inspect `ctx.seek`, so a returned seek and a missing seek result are observationally equivalent to this oracle. [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705) The runner also treats any ordinary exception as the desired clean rejection on this route; only timeout and `NotApplicableError` are distinguished before oracle execution. [src/core/runner.ts:1552-1569](../../src/core/runner.ts#L1552-L1569)

The generic exhaustive runner does preserve each file's name, hash, baked flag, status, reason, and benchmark summary in `ScenarioResult.exhaustive`, and records `{passed, admissible, total}` coverage. [src/core/scenario.ts:294-329](../../src/core/scenario.ts#L294-L329) Its aggregate is still all-or-nothing: any per-file `FAIL` produces top-level `FAIL`, any failure set consisting only of `ERROR` produces top-level `ERROR`, and only a set with no failures can produce top-level `PASS`. [src/core/runner.ts:1127-1205](../../src/core/runner.ts#L1127-L1205) Robustness cannot currently exercise that multi-file path because candidate gathering forces the whole family to baked-only before both seeded and exhaustive selection. [src/core/media-selection.ts:352-389](../../src/core/media-selection.ts#L352-L389) Therefore the important “file 01 passes, files 02 and 03 fail” pattern is not generated for this family today.

The machine-readable report projects each exhaustive file down to file/hash/baked/status, dropping its reason, oracle outcomes, and measurements. [src/core/report.ts:52-70](../../src/core/report.ts#L52-L70) [src/core/report.ts:539-555](../../src/core/report.ts#L539-L555) Coverage is attached to the display/bench cell only when the aggregate status is `PASS`, while visible formatting appends a ratio only to `PASS`; a mixed failure therefore loses the ratio in the normal cell rendering. [src/core/report.ts:758-779](../../src/core/report.ts#L758-L779) [src/core/format.ts:84-117](../../src/core/format.ts#L84-L117) The robustness scorecard denominator counts every robustness result, including `NA_*` and `SKIPPED`, and increments its numerator only for top-level `PASS`. [src/core/report.ts:784-812](../../src/core/report.ts#L784-L812)

### Reference decode, isolation, and applicability

For `ssim-psnr` without a committed frame golden, the oracle decodes source bytes in-browser through the unscored platform path and compares candidate and reference pixels. This is a neutral [reference decode](../glossary.md), not an ffmpeg-engine comparison. [src/core/oracles.ts:1758-1809](../../src/core/oracles.ts#L1758-L1809) Both the golden and source-reference branches pair frames by array index; failure or emptiness in the platform decode of candidate output is currently `FAIL`. [src/core/oracles.ts:1776-1803](../../src/core/oracles.ts#L1776-L1803) [src/core/oracles.ts:1811-1830](../../src/core/oracles.ts#L1811-L1830) [src/core/oracles.ts:1905-1953](../../src/core/oracles.ts#L1905-L1953)

The scenario file claims all four sub-batteries are Worker-isolated, but the application directly awaits `runMatrix` on its current execution context. [src/scenarios/robustness/index.ts:4-19](../../src/scenarios/robustness/index.ts#L4-L19) [src/app/main.ts:338-346](../../src/app/main.ts#L338-L346) The timeout helper is a `Promise.race`; it cannot interrupt synchronous work that blocks the event loop. The disabled-cell module explicitly records that limitation for one Remotion parser operation. [src/core/runner.ts:655-683](../../src/core/runner.ts#L655-L683) [src/core/disabled-cells.ts:14-34](../../src/core/disabled-cells.ts#L14-L34) Remotion Media Parser has its own worker path, but adapter initialization falls back to main-thread parsing if worker setup fails. [src/engines/remotion-media-parser/adapter.ts:217-258](../../src/engines/remotion-media-parser/adapter.ts#L217-L258)

Preflight capabilities are flat operation, container, codec, encryption, and feature tokens, with optional input/output codec lists; they do not represent the complete operation × container × codec × option tuple. [src/core/engine.ts:115-137](../../src/core/engine.ts#L115-L137) The composite Remotion adapter unions parser and WebCodecs token sets before routing operations to one backend. [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91) Mediabunny declares broad operation/container/codec sets, but unsupported concrete mux containers and codecs throw ordinary `Error` rather than `NotApplicableError`; on a robustness row, an ordinary throw can be interpreted as clean malformed-input handling. [src/engines/mediabunny/adapter.ts:1030-1111](../../src/engines/mediabunny/adapter.ts#L1030-L1111) [src/engines/mediabunny/adapter.ts:1517-1548](../../src/engines/mediabunny/adapter.ts#L1517-L1548) A manually disabled Web Demuxer robustness cell demonstrates the resulting hand-maintained exception surface. [src/core/disabled-cells.ts:95-102](../../src/core/disabled-cells.ts#L95-L102)

## Contracts and invariants

The following are observable contracts of the present implementation, not endorsements of every current choice.

| Contract or invariant | Enforcement today | Boundary or caveat |
| --- | --- | --- |
| A scenario id is stable, family-qualified, declares at least one required operation and at least one oracle, and is unique in the flattened registry. | Definition validation and the global uniqueness guard. [src/core/scenario.ts:195-203](../../src/core/scenario.ts#L195-L203) [src/scenarios/index.ts:49-58](../../src/scenarios/index.ts#L49-L58) | Descriptive comments are not executable truth; the image and metamorphic comments have drifted from the definitions. |
| All engines in a run see the same selected bytes and selection provenance. | `ScenarioSelection` separates golden identity from fetched path and records file/hash/baked state. [src/core/media-selection.ts:69-104](../../src/core/media-selection.ts#L69-L104) | Robustness is forced to one baked candidate, so this does not yet establish multi-file family coverage. |
| Mutated fixtures are reproducible. | Seeded, file-backed bake helpers emit checksummed fixture bytes. [fixtures/bake.mjs:241-304](../../fixtures/bake.mjs#L241-L304) [fixtures/bake.mjs:1889-1893](../../fixtures/bake.mjs#L1889-L1893) | This proves reproduction of the fixed mutations, not breadth over real-world parser states. |
| Applicability is non-failing when expressed through preflight or `NotApplicableError`. | The runner recognizes the error name and maps it to `NA_ENGINE` in both ordinary and robustness execution. [src/core/runner.ts:686-694](../../src/core/runner.ts#L686-L694) [src/core/runner.ts:1552-1557](../../src/core/runner.ts#L1552-L1557) | Ordinary framework errors are not classified and can become `ERROR` or, on malformed robustness rows, apparent success. |
| A hard-but-valid row must satisfy all non-gap oracles. | The robustness route fails on the first non-golden-gap oracle outcome and passes only when at least one oracle passes. [src/core/runner.ts:1594-1625](../../src/core/runner.ts#L1594-L1625) | Current oracle outcomes are binary; a legal representation difference can therefore become `FAIL`. |
| An intentionally malformed row may cleanly reject or, when explicitly permitted, return a safe partial/degraded result within its timeout. | `graceful-failure` accepts absence or `gracefulAllowOutput`. [src/core/oracles.ts:2680-2705](../../src/core/oracles.ts#L2680-L2705) | “Safe” is not verified: the allow flag is unconditional, and ordinary adapter bugs are indistinguishable from intentional rejection. |
| A timeout is a robustness failure; an unsupported tuple is not. | Timeout maps to `FAIL`; `NotApplicableError` maps to `NA_ENGINE`. [src/core/runner.ts:1552-1569](../../src/core/runner.ts#L1552-L1569) | The timer is not preemptive and has no direct OOM/crash channel. |
| Golden-dependent oracles do not erase an independent survivor result. | A real oracle failure wins, a survivor pass wins over golden gaps, and an all-gap set becomes `NA_ASSET`. [src/core/runner.ts:1423-1443](../../src/core/runner.ts#L1423-L1443) | No robustness input variants currently reach this policy; an eventual per-file aggregate must preserve each file's all-gap state instead of collapsing the cell. |
| Correctness gates benchmark values. | Robustness declares metrics but exits without `runBench`. [src/core/runner.ts:1623-1625](../../src/core/runner.ts#L1623-L1625) | Wall duration exists as total cell duration, but declared peak-memory and long-task observations are absent; they are neither measurements nor enforced budgets. |
| Exhaustive provenance survives in the in-memory result. | Per-file file/hash/status/reason/bench plus coverage counts are retained. [src/core/scenario.ts:294-329](../../src/core/scenario.ts#L294-L329) | Oracle details are absent at the per-file type boundary, report projection drops reasons, and mixed outcomes have no partial grade. |

## Target design and known gaps

### Target design

The target is a corpus-aware robustness protocol with five independent decisions per input variant: applicability, operation disposition, structural/semantic validity, representation comparison, and resource outcome. A later implementation should make those decisions explicit instead of inferring them from missing output.

1. **Use three-way oracle verdicts.** Each oracle emits [PASS](../glossary.md), [DIFF](../glossary.md), or [FAIL](../glossary.md). PASS means the semantic and structural contract is satisfied after documented normalization; DIFF means the output is valid but its representation differs from the ffmpeg-baked [golden](../glossary.md); FAIL is reserved for invalid, unusable, missing, corrupted, or semantically wrong output. Cell aggregation treats both PASS and DIFF as valid while retaining DIFF diagnostics. This is especially important because ISO BMFF permits multiple legal AVC sample-entry/configuration styles: the W3C byte-stream specification recommends support for both out-of-band parameter sets (`avc1`/`avc2`) and in-band parameter sets (`avc3`/`avc4`). [W3C ISO BMFF Byte Stream Format, initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments)

2. **Normalize representation-sensitive goldens before deciding validity.** For robustness metadata rows, the target `golden-metadata` comparator canonicalizes `avc1`/`avc3` to `h264`, `hev1`/`hvc1` to `hevc`, `V_MPEG4/ISO/AVC` to `h264`, and `mp4a` to `aac`; matches tracks by media type rather than array index; treats HE-AAC/SBR core-rate versus reconstructed 2× sample rate as equivalent; treats Parametric Stereo mono-core versus stereo output as equivalent; uses bands for VFR and NTSC rational rates; and widens duration tolerance for edit lists, priming, and timebase conversion. A different normalized representation is DIFF, not FAIL. ISO/IEC 14496-12 is the normative ISO BMFF basis for boxes and presentation timing. [ISO, ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html)

3. **Separate packet semantics from packetization.** `golden-packets` should fail dropped content, invalid decode order, broken track association, impossible timestamps, or unusable codec configuration. Exact byte size, keyframe flag placement, inline SPS/PPS, [Annex B](../glossary.md) versus [AVCC](../glossary.md), and legal NAL grouping remain diagnostics and normally produce DIFF. The W3C ISO BMFF byte-stream requirements explicitly recognize in-band and out-of-band AVC parameter-set sample entries as supported alternatives. [W3C ISO BMFF Byte Stream Format, initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments)

4. **Record a structured operation disposition.** Each per-file execution records one of `returned-validatable-output`, `clean-reject`, `not-applicable`, `browser-unavailable`, `timeout`, `worker-crash`, `resource-limit`, or `harness-error`, plus the native error class/code and stage. Clean rejection is PASS only for a negative row; it is FAIL for hard-but-valid media. A returned partial result must run a scenario-specific structural survivor oracle before it can PASS or DIFF. The malformed-data policy follows mature parser practice: FFmpeg tells demuxers/decoders to treat input as untrusted and return invalid-data errors, EBML requires size validation to prevent out-of-bounds access and excessive allocation, and FLAC requires validating declared sizes before allocation. [FFmpeg Developer Documentation, Code behaviour](https://ffmpeg.org/developer.html#Code-behaviour) [RFC 8794 §16, Security Considerations](https://www.rfc-editor.org/rfc/rfc8794.html#section-16) [RFC 9639 §11, Security Considerations](https://www.rfc-editor.org/rfc/rfc9639.html#section-11)

5. **Grade every applicable input variant and preserve partial coverage.** Enable curated robustness corpora where variants share the same semantic contract and deterministic mutation recipe. For each cell, persist per-file identity/hash, applicability, PASS/DIFF/FAIL/ERROR, oracle outcomes, reason, resource disposition, and measurements. Define `valid = PASS + DIFF`; define `applicable = PASS + DIFF + FAIL + ERROR`; expose both `valid/applicable` and `valid/total`. A cell is `full` when every applicable file is valid, `partial` when at least one applicable file is valid and at least one applicable file is FAIL or ERROR, and `none` when no applicable file is valid. “File 01 passes while files 02 and 03 fail” is therefore partial coverage with `1/3 valid`, and the report names 02 and 03; it is never summarized as ERROR. Keep the individual ERROR where it occurred, but reserve top-level ERROR for a cell with no semantic verdict because the harness itself failed. Coverage-first ranking must never allow partial to outrank full.

6. **Make isolation and limits real.** Execute each file in a terminable Worker (or an equivalently isolated process boundary), start the timeout outside that worker, terminate and dispose it on deadline, and record crash, timeout, and resource-limit separately. Treat OOM and timeout as robustness findings, consistent with OSS-Fuzz's handling of timeouts and OOMs as bugs under explicit limits. [OSS-Fuzz FAQ, “How do you handle timeouts and OOMs?”](https://google.github.io/oss-fuzz/faq/#how-do-you-handle-timeouts-and-ooms) Use one correctness execution to observe wall time, peak memory where the browser exposes it, and long-task/worker-stall evidence; do not run a performance benchmark loop for malformed input. Release WebCodecs codec-system resources and frames on all exits, as required by the WebCodecs resource model. [W3C WebCodecs, Codec System Resources](https://www.w3.org/TR/webcodecs/#codec-system-resources)

7. **Use runtime applicability deliberately.** Keep the preflight [capability gate](../glossary.md) as a cheap filter, but require adapters to throw `NotApplicableError` when the concrete operation/container/codec/options tuple is unsupported at runtime. That becomes `NA_ENGINE`, not FAIL or ERROR, and should shrink the hand-kept disabled-cell list. Mediabunny should distinguish an unrecognized/corrupt input from an unsupported output tuple; its official reading guide documents thrown recognition errors. [Mediabunny, Reading media files](https://mediabunny.dev/guide/reading-media-files) Remotion and Remotion Media Parser should normalize support-query, abort, and unsupported-path results at their adapter boundary; Remotion documents supported-container/codec queries and WebCodecs cancellation, while `parseMedia` exposes a controller capable of aborting work. [Remotion, WebCodecs](https://www.remotion.dev/docs/webcodecs) [Remotion, `parseMedia()`](https://www.remotion.dev/docs/media-parser/parse-media) MP4Box's parse `onError` is a data rejection signal, not automatically an applicability signal. [GPAC, MP4Box.js](https://github.com/gpac/mp4box.js/)

8. **Keep neutral SSIM reference decode, fix pairing and applicability.** The source-side reference remains a fair in-browser WebCodecs decode because it is independent of the candidate engine. Pair frames by timestamp or bounded presentation window, not array index, so fps and frame-count changes do not compare unrelated pictures. Validate candidate output structure/readability independently before quality comparison. If the output is valid but the neutral browser path cannot decode that codec/configuration, report the reference oracle as `NA_BROWSER` and let independent survivor oracles decide; do not call the candidate wrong solely because the reference path lacks support. WebCodecs explicitly provides `isConfigSupported()` for configuration-dependent support and reports decode failures through decoder errors. [W3C WebCodecs, `VideoDecoder.isConfigSupported()`](https://www.w3.org/TR/webcodecs/#dom-videodecoder-isconfigsupported) [W3C WebCodecs, `VideoDecoder.decode()`](https://www.w3.org/TR/webcodecs/#dom-videodecoder-decode)

9. **Make the metamorphic labels literal.** The double-remux property must actually create and compare `remux(remux(x))` with `remux(x)` without requiring a source packet golden. Cross-container duration consistency must compare matched renditions of the same program directly, not merely compare unrelated inputs with their individual goldens. Still-image rows should stay explicitly positive probes, and separate negative rows should feed images into operations that promise moving-video semantics. Seek-negative and seek-past-EOF rows must inspect whether a return clamped to an allowed landing or returned an invalid result, rather than treating every return as output absence.

10. **Preserve survivor-oracle policy per file.** A golden-less input variant may still PASS/DIFF through a structural, metamorphic, playback, or neutral-reference survivor oracle; a real survivor failure remains FAIL; a file for which every required oracle lacks evidence is `NA_ASSET`. Aggregation retains that per-file state, its denominator, and the identity of every failure instead of letting one golden gap erase other files.

Acceptance requires a seeded three-file corpus demonstration where one engine yields full coverage, one yields PASS/FAIL/FAIL and is shown as partial `1/3` with the two failing identities, one throws `NotApplicableError` for one concrete tuple and shows `NA_ENGINE`, and one experiences a terminable worker timeout that shows FAIL without stalling the matrix. Machine-readable and Markdown reports must agree on all per-file verdicts and denominators.

### Known gaps

#### Partial coverage is unreachable and mixed results collapse

**Current.** Robustness is hard-coded baked-only in candidate gathering, while generic exhaustive aggregation turns mixed PASS+FAIL into top-level FAIL and PASS+ERROR into top-level ERROR. [src/core/media-selection.ts:352-389](../../src/core/media-selection.ts#L352-L389) [src/core/runner.ts:1127-1205](../../src/core/runner.ts#L1127-L1205)

**Consequence.** The suite cannot surface the high-value signature “works on 01, breaks on 02/03”; normal display also withholds the coverage suffix from a non-PASS aggregate. [src/core/report.ts:758-779](../../src/core/report.ts#L758-L779) [src/core/format.ts:84-117](../../src/core/format.ts#L84-L117)

**Target.** Admit curated same-contract robustness variants, preserve PASS/DIFF/FAIL/ERROR for each, and grade full/partial/none using explicit valid/applicable/total denominators. Reproducible failing inputs should carry their checksum and invocation context, matching FFmpeg's security-report expectation of a reproducible sample and command. [FFmpeg Security](https://ffmpeg.org/security.html)

**Verification.** A three-file fixture produces partial `1/3`; both rendered and JSON reports name the two failures, show their reasons/oracle outcomes, and do not emit top-level ERROR merely because two files failed.

#### Boolean oracles conflate wrongness with representation

**Current.** `OracleOutcome.pass` is boolean. Metadata compares codec/rate/channels positionally and exactly, while packet comparison requires exact count, size, and keyframe flags after only timestamp-origin normalization. [src/core/scenario.ts:213-221](../../src/core/scenario.ts#L213-L221) [src/core/oracles.ts:721-811](../../src/core/oracles.ts#L721-L811) [src/core/oracles.ts:835-926](../../src/core/oracles.ts#L835-L926)

**Consequence.** Codec aliases, HE-AAC/SBR or Parametric Stereo reporting views, VFR/NTSC/timeline rounding, edit-list/priming duration views, and legal Annex B/AVCC or SPS/PPS/NAL grouping can look like engine defects.

**Target.** Add PASS/DIFF/FAIL; apply the metadata canonicalization and tolerances listed above; split packet semantic invariants from representation diagnostics. Both in-band and out-of-band AVC parameter-set representations are recognized alternatives in the W3C ISO BMFF byte-stream specification. [W3C ISO BMFF Byte Stream Format, initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments)

**Verification.** Alias-only metadata and legal framing/grouping fixtures yield DIFF, while dropped samples, broken timestamps, invalid configuration, or wrong decoded content yield FAIL.

#### Graceful return and clean rejection are under-specified

**Current.** `gracefulAllowOutput` unconditionally passes any returned output, and absence of output-like fields passes; the runner treats every ordinary exception as a clean malformed-input rejection. [src/core/oracles.ts:2680-2705](../../src/core/oracles.ts#L2680-L2705) [src/core/runner.ts:1552-1565](../../src/core/runner.ts#L1552-L1565)

**Consequence.** Garbage partial media can pass, and an adapter programming error or unsupported combination can masquerade as robust malformed-data handling.

**Target.** Record structured disposition/error provenance, run a structural survivor oracle on every returned partial, and distinguish negative-input rejection from `NotApplicableError`, browser absence, worker crash, resource breach, and harness error. RFC 8794 and RFC 9639 require defensive length/allocation validation for EBML and FLAC readers. [RFC 8794 §16](https://www.rfc-editor.org/rfc/rfc8794.html#section-16) [RFC 9639 §11](https://www.rfc-editor.org/rfc/rfc9639.html#section-11)

**Verification.** A structurally parseable partial passes, a garbage partial fails, a deliberate parser rejection passes only the negative row, and an injected adapter `TypeError` reports ERROR.

#### Capability negotiation leaks concrete unsupported tuples

**Current.** Capabilities are flat tokens. Remotion unions two backends, Mediabunny's concrete mux rejections are ordinary errors, and one robustness limitation remains manually disabled. [src/core/engine.ts:115-137](../../src/core/engine.ts#L115-L137) [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91) [src/engines/mediabunny/adapter.ts:1517-1548](../../src/engines/mediabunny/adapter.ts#L1517-L1548) [src/core/disabled-cells.ts:95-102](../../src/core/disabled-cells.ts#L95-L102)

**Consequence.** A cell can pass preflight and then become FAIL/ERROR—or false graceful PASS—for a tuple the engine never supported.

**Target.** Add adapter-side tuple checks and normalize runtime inability to `NotApplicableError`/`NA_ENGINE`; use framework support APIs where available. WebCodecs makes codec support configuration-dependent through `isConfigSupported()`, and Remotion exposes supported conversion queries. [W3C WebCodecs, `isConfigSupported()`](https://www.w3.org/TR/webcodecs/#dom-videodecoder-isconfigsupported) [Remotion, WebCodecs](https://www.remotion.dev/docs/webcodecs)

**Verification.** Combinatorial-unsupported rows become `NA_ENGINE`, corrupt-but-supported inputs still execute the negative contract, and each migrated static disabled cell is removed only after a focused matrix confirms the runtime mapping.

#### SSIM pairing and reference decoder failure can false-fail

**Current.** The source reference is neutral, but candidate/golden and candidate/source frames are paired by index; candidate platform-decode failure or zero frames is always FAIL. [src/core/oracles.ts:1758-1830](../../src/core/oracles.ts#L1758-L1830) [src/core/oracles.ts:1905-1953](../../src/core/oracles.ts#L1905-L1953)

**Consequence.** Cadence or frame-count changes compare unrelated frames, and a valid output outside the browser reference decoder's current configuration support is blamed on the candidate.

**Target.** Pair by presentation timestamp/window, validate output independently, query reference support, and map reference-only inability to `NA_BROWSER`. WebCodecs support is explicitly configuration-dependent. [W3C WebCodecs, `VideoDecoder.isConfigSupported()`](https://www.w3.org/TR/webcodecs/#dom-videodecoder-isconfigsupported)

**Verification.** A legal fps-changing rendition pairs corresponding timestamps, a known-valid but reference-unsupported output survives through an independent oracle, and corrupted/undecodable output still fails.

#### Timeout is not isolation and resource metrics are declarations only

**Current.** The app awaits the matrix in its current context; timeout is `Promise.race`; a known synchronous parser path needs a forced timeout entry; robustness exits without benchmarking declared peak-memory/long-task metrics. [src/app/main.ts:338-346](../../src/app/main.ts#L338-L346) [src/core/runner.ts:655-683](../../src/core/runner.ts#L655-L683) [src/core/disabled-cells.ts:14-34](../../src/core/disabled-cells.ts#L14-L34) [src/core/runner.ts:1623-1625](../../src/core/runner.ts#L1623-L1625)

**Consequence.** Synchronous hangs can freeze the UI and evade timers; OOM/crash is not classified; the page cannot substantiate memory or long-task claims from recorded results.

**Target.** Use a terminable per-file worker, external watchdog, cleanup, and single-observation resource telemetry/budgets. OSS-Fuzz treats timeout and OOM as actionable bugs under resource limits, and WebCodecs requires prompt release of codec resources. [OSS-Fuzz FAQ](https://google.github.io/oss-fuzz/faq/#how-do-you-handle-timeouts-and-ooms) [W3C WebCodecs, Codec System Resources](https://www.w3.org/TR/webcodecs/#codec-system-resources)

**Verification.** A synchronous infinite-loop test is terminated without freezing progress, crash/timeout/resource-limit have distinct evidence, and resource fields are populated or explicitly unavailable rather than silently absent.

#### Scenario labels exceed their executable checks

**Current.** The header calls image rows negative although they are positive probes; out-of-range seek results are not inspected by `graceful-failure`; cross-container duration compares each input only to its own golden; double-remux performs one remux. [src/scenarios/robustness/index.ts:15-16](../../src/scenarios/robustness/index.ts#L15-L16) [src/scenarios/robustness/index.ts:494-515](../../src/scenarios/robustness/index.ts#L494-L515) [src/core/oracles.ts:2680-2695](../../src/core/oracles.ts#L2680-L2695) [src/core/oracles.ts:3942-3998](../../src/core/oracles.ts#L3942-L3998) [src/core/oracles.ts:3596-3610](../../src/core/oracles.ts#L3596-L3610)

**Consequence.** Report labels promise stronger properties than the oracle observes, creating false confidence even when a cell passes.

**Target.** Align names and notes with executable contracts; add true image-as-video negatives; validate allowed seek clamp ranges; use matched content for cross-container equality; execute both remux stages.

**Verification.** Mutation tests that return a wrong seek landing, compare mismatched container renditions, or alter only the second remux now fail the corresponding property; image-positive and image-negative rows appear as distinct ids.

#### Report projection and robustness denominator erase diagnostic context

**Current.** The result type retains per-file reason but not per-file oracle outcomes, the report projection drops reason, coverage is exposed only for PASS display cells, and the scorecard includes NA/SKIPPED in `robustnessTotal`. [src/core/scenario.ts:320-329](../../src/core/scenario.ts#L320-L329) [src/core/report.ts:52-70](../../src/core/report.ts#L52-L70) [src/core/report.ts:758-812](../../src/core/report.ts#L758-L812)

**Consequence.** Consumers cannot reconstruct why a particular file failed, partial ratios disappear, and engines with honest non-applicability can receive a misleading robustness percentage.

**Target.** Project complete per-file verdict evidence, display coverage on every aggregate state, and publish separate valid/applicable and valid/total rates. Keep NA kinds and SKIPPED visible but outside the applicable correctness denominator.

**Verification.** Round-trip the same result through in-memory, JSON, and Markdown representations and assert identical per-file ids, verdicts, reasons, oracle outcomes, measurements, and denominators.

## Sources

### Repository evidence

- [src/scenarios/robustness/index.ts:4-19](../../src/scenarios/robustness/index.ts#L4-L19) — declared sub-battery intent, including the unfulfilled worker-isolation and image-negative descriptions.
- [src/scenarios/robustness/index.ts:47-226](../../src/scenarios/robustness/index.ts#L47-L226) — base hard-valid and zero-length edge definitions plus common mapper.
- [src/scenarios/robustness/index.ts:245-360](../../src/scenarios/robustness/index.ts#L245-L360) — base malformed/fuzz definitions and mapper.
- [src/scenarios/robustness/index.ts:382-480](../../src/scenarios/robustness/index.ts#L382-L480) — base property definitions and mapper.
- [src/scenarios/robustness/index.ts:483-585](../../src/scenarios/robustness/index.ts#L483-L585) — image probes and out-of-range seek edges.
- [src/scenarios/robustness/index.ts:616-810](../../src/scenarios/robustness/index.ts#L616-L810) — structural/shape edge inventory and mapping.
- [src/scenarios/robustness/index.ts:818-901](../../src/scenarios/robustness/index.ts#L818-L901) — extra malformed/fuzz inventory and mapping.
- [src/scenarios/robustness/index.ts:931-1007](../../src/scenarios/robustness/index.ts#L931-L1007) — same-dimension transcode and FLAC probe definitions.
- [src/scenarios/robustness/index.ts:1009-1172](../../src/scenarios/robustness/index.ts#L1009-L1172) — final property definitions and complete family export.
- [src/scenarios/index.ts:32-58](../../src/scenarios/index.ts#L32-L58) — canonical family registration, flattening, and unique-id guard.
- [src/core/scenario.ts:195-221](../../src/core/scenario.ts#L195-L221) — scenario validation, current statuses, and boolean oracle outcome.
- [src/core/scenario.ts:269-329](../../src/core/scenario.ts#L269-L329) — aggregate result, coverage, and per-file result shapes.
- [src/core/runner.ts:655-694](../../src/core/runner.ts#L655-L694) — Promise-race timeouts and `NotApplicableError` recognition.
- [src/core/runner.ts:1127-1205](../../src/core/runner.ts#L1127-L1205) — current exhaustive aggregation and all-or-nothing top-level status.
- [src/core/runner.ts:1253-1468](../../src/core/runner.ts#L1253-L1468) — family routing, negotiation, functional oracle survivor policy, and outer error mapping.
- [src/core/runner.ts:1522-1625](../../src/core/runner.ts#L1522-L1625) — robustness operation/error/oracle path and no-benchmark exit.
- [src/core/oracles.ts:721-811](../../src/core/oracles.ts#L721-L811) — current positional, exact metadata comparison.
- [src/core/oracles.ts:835-985](../../src/core/oracles.ts#L835-L985) — current packet-table comparison and golden-packets wrapper.
- [src/core/oracles.ts:1758-1953](../../src/core/oracles.ts#L1758-L1953) — neutral source-reference SSIM, index pairing, and candidate decode failures.
- [src/core/oracles.ts:2650-2705](../../src/core/oracles.ts#L2650-L2705) — current graceful-failure inference and unconditional returned-output allowance.
- [src/core/oracles.ts:2723-2857](../../src/core/oracles.ts#L2723-L2857) — property-invariant dispatch and core decode/duration paths.
- [src/core/oracles.ts:2930-3182](../../src/core/oracles.ts#L2930-L3182) — FLAC seek, gapless sample-count, and audio PCM property implementations.
- [src/core/oracles.ts:3491-3610](../../src/core/oracles.ts#L3491-L3610) — trim composition, mux round-trip, and reduced double-remux implementation.
- [src/core/oracles.ts:3942-3998](../../src/core/oracles.ts#L3942-L3998) — per-input golden duration checks rather than cross-input equality.
- [src/core/media-selection.ts:69-104](../../src/core/media-selection.ts#L69-L104) — selected-input identity and provenance model.
- [src/core/media-selection.ts:352-435](../../src/core/media-selection.ts#L352-L435) — baked-only robustness policy and seeded/exhaustive candidate consumers.
- [src/core/report.ts:52-70](../../src/core/report.ts#L52-L70) — lossy exhaustive-file report schema.
- [src/core/report.ts:539-555](../../src/core/report.ts#L539-L555) — exhaustive projection implementation.
- [src/core/report.ts:758-812](../../src/core/report.ts#L758-L812) — PASS-only coverage display data and robustness score denominator.
- [src/core/format.ts:84-117](../../src/core/format.ts#L84-L117) — visible status and PASS-only coverage suffix.
- [src/core/engine.ts:115-137](../../src/core/engine.ts#L115-L137) — flat capability-token data model.
- [src/core/disabled-cells.ts:14-34](../../src/core/disabled-cells.ts#L14-L34) — non-preemptible main-thread timeout workaround.
- [src/core/disabled-cells.ts:95-102](../../src/core/disabled-cells.ts#L95-L102) — manually disabled robustness limitation.
- [src/app/main.ts:338-346](../../src/app/main.ts#L338-L346) — matrix execution directly awaited by the app.
- [src/engines/mediabunny/adapter.ts:1030-1111](../../src/engines/mediabunny/adapter.ts#L1030-L1111) — broad declared Mediabunny capability sets.
- [src/engines/mediabunny/adapter.ts:1517-1548](../../src/engines/mediabunny/adapter.ts#L1517-L1548) — concrete mux rejections thrown as ordinary errors.
- [src/engines/remotion/adapter.ts:71-146](../../src/engines/remotion/adapter.ts#L71-L146) — composite capability union and operation routing.
- [src/engines/remotion-media-parser/adapter.ts:217-258](../../src/engines/remotion-media-parser/adapter.ts#L217-L258) — worker warm-up and main-thread fallback.
- [fixtures/bake.mjs:241-304](../../fixtures/bake.mjs#L241-L304) — deterministic mutation primitives.
- [fixtures/bake.mjs:1406-1437](../../fixtures/bake.mjs#L1406-L1437) — concrete malformed-fixture recipes.
- [fixtures/bake.mjs:1889-1908](../../fixtures/bake.mjs#L1889-L1908) — checksum recording and intentional golden-skip policy.

### External authorities

- ISO, *ISO/IEC 14496-12:2026 — Information technology — Coding of audio-visual objects — Part 12: ISO base media file format*, [catalogue entry](https://www.iso.org/standard/85596.html), accessed 2026-07-16. Normative basis for ISO BMFF structure and presentation timing.
- W3C, *ISO BMFF Byte Stream Format*, [initialization and media segment requirements](https://www.w3.org/TR/mse-byte-stream-format-isobmff/), accessed 2026-07-16. Supports invalid-segment error handling and the validity of both in-band and out-of-band AVC parameter-set sample entries.
- W3C, *WebCodecs*, [`VideoDecoder.isConfigSupported()`](https://www.w3.org/TR/webcodecs/#dom-videodecoder-isconfigsupported), [`VideoDecoder.decode()`](https://www.w3.org/TR/webcodecs/#dom-videodecoder-decode), and [Codec System Resources](https://www.w3.org/TR/webcodecs/#codec-system-resources), accessed 2026-07-16. Supports configuration-dependent browser applicability, decode-error handling, and explicit resource cleanup.
- IETF, *RFC 8794: Extensible Binary Meta Language*, [§16 Security Considerations](https://www.rfc-editor.org/rfc/rfc8794.html#section-16), accessed 2026-07-16. Requires defensive validation of element sizes to avoid out-of-bounds reads and excessive allocation.
- IETF, *RFC 9639: Free Lossless Audio Codec*, [§11 Security Considerations](https://www.rfc-editor.org/rfc/rfc9639.html#section-11), accessed 2026-07-16. Requires validating encoded sizes before allocating or reading malformed FLAC data.
- FFmpeg project, *Developer Documentation — Code behaviour*, [untrusted input and invalid-data handling](https://ffmpeg.org/developer.html#Code-behaviour), accessed 2026-07-16. Supports clean invalid-data rejection rather than crash or unbounded work.
- FFmpeg project, *Security*, [reporting policy](https://ffmpeg.org/security.html), accessed 2026-07-16. Supports reproducible malformed-media evidence with a concrete input and invocation.
- Google, *OSS-Fuzz FAQ*, [“How do you handle timeouts and OOMs?”](https://google.github.io/oss-fuzz/faq/#how-do-you-handle-timeouts-and-ooms), accessed 2026-07-16. Supports treating bounded-resource violations as robustness bugs.
- Mediabunny, *Reading media files*, [official guide](https://mediabunny.dev/guide/reading-media-files), accessed 2026-07-16. Documents recognition errors that adapters must distinguish from unsupported output combinations.
- Remotion, *WebCodecs*, [official documentation](https://www.remotion.dev/docs/webcodecs), accessed 2026-07-16. Documents browser media conversion, supported-codec/container queries, and cancellation surfaces relevant to tuple applicability.
- Remotion, *Media Parser: `parseMedia()`*, [official API documentation](https://www.remotion.dev/docs/media-parser/parse-media), accessed 2026-07-16. Documents controlled parsing and abort support relevant to bounded malformed-input handling.
- GPAC, *MP4Box.js*, [official repository and API overview](https://github.com/gpac/mp4box.js/), accessed 2026-07-16. Documents progressive parsing and the `onError` callback used to distinguish parse rejection from adapter applicability.
