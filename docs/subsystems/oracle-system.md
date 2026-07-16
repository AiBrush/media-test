# Oracle system

> Scope: Oracle vocabulary, evidence contexts, comparison and tolerance rules, neutral platform reference decode and re-import, and the target three-way verdict model; scenario intent, adapter applicability, fixture production, and report presentation remain with their owning pages.
> Phase-2 owner: p2_subsystem_oracle_system.

## Purpose

The oracle system turns one engine operation into a correctness judgment. It is the boundary between observations—metadata, packets, decoded pixels, timestamps, output bytes, committed [goldens](../glossary.md#golden), and browser evidence—and an engine-independent [oracle](../glossary.md#oracle) outcome. Every feature family depends on that boundary because performance is meaningful only after correctness has been established.

This page records what that boundary does today and specifies the replacement contract. The key change is to distinguish [PASS](../glossary.md#pass), [DIFF](../glossary.md#diff), and [FAIL](../glossary.md#fail): exact or normalized agreement, a valid [representation difference](../glossary.md#representation-difference), and a true semantic or structural defect. It also owns the fairness rules for [golden metadata](../glossary.md#golden-metadata), [golden packets](../glossary.md#golden-packets), [reference re-import](../glossary.md#reference-re-import), and neutral in-browser [reference decode](../glossary.md#reference-decode).

## As-built

### Vocabulary, context, and reduction

The [scenario](../glossary.md#scenario) DSL exposes 16 `OracleId` values and requires every scenario to declare at least one. A scenario may override five numeric tolerances: SSIM, PSNR, duration, fps, and seek. [src/core/scenario.ts:35-51](../../src/core/scenario.ts#L35-L51) [src/core/scenario.ts:145-152](../../src/core/scenario.ts#L145-L152) [src/core/scenario.ts:193-203](../../src/core/scenario.ts#L193-L203)

At execution time, `OracleContext` combines the scenario and input with whichever operation result exists—output bytes, normalized metadata, demux packets, decoded frames, or a seek landing—plus its loaded golden and two runner-injected platform hooks. The candidate engine is present for property checks, but the ordinary byte readers and platform helpers do not call a scored engine to grade its own output. [src/core/oracles.ts:283-301](../../src/core/oracles.ts#L283-L301) [src/core/runner.ts:1481-1519](../../src/core/runner.ts#L1481-L1519)

`loadGolden` fetches independent metadata, packet, frame, and SSIM JSON sidecars. Missing, non-OK, malformed, or pending artifacts become absent fields instead of throwing. [src/core/oracles.ts:44-50](../../src/core/oracles.ts#L44-L50) [src/core/oracles.ts:57-116](../../src/core/oracles.ts#L57-L116)

The implemented outcome is binary: `OracleOutcome.pass` is a boolean, and `ResultStatus` contains `PASS` and `FAIL` but no `DIFF`. The dispatch wrapper catches an oracle exception and returns another non-passing outcome. [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221) [src/core/oracles.ts:425-480](../../src/core/oracles.ts#L425-L480) [src/core/oracles.ts:4262-4266](../../src/core/oracles.ts#L4262-L4266)

The runner executes all declared oracles, then treats the first false outcome that is not recognized as a bake gap as decisive `FAIL`. If no real failure exists, one true outcome makes the [cell](../glossary.md#cell) `PASS`; if every outcome is a recognized gap, the cell becomes [NA_ASSET](../glossary.md#na_asset). Only `PASS` proceeds to benchmarking. [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463) That reduction cannot express “valid, but represented differently from the ffmpeg-baked golden.”

Oracle availability is not typed. Helpers encode missing evidence and unreadable packet tables as `pass: false` with special detail text; the runner searches those strings, including `golden absent` and `packet table unreadable`, to route them to `NA_ASSET`. [src/core/oracles.ts:306-324](../../src/core/oracles.ts#L306-L324) [src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889) An internal reader limitation is therefore reported as an asset absence even when the asset and output both exist.

### Implemented oracle catalogue

| Oracle | Evidence and current judgment | Implementation |
| --- | --- | --- |
| `golden-metadata` | Probe metadata versus the committed metadata sidecar. | [src/core/oracles.ts:721-825](../../src/core/oracles.ts#L721-L825) |
| `golden-packets` | Demux packet table versus the committed packet sidecar. | [src/core/oracles.ts:835-985](../../src/core/oracles.ts#L835-L985) |
| `decoded-frames-bitexact` | Candidate frame digests, or a platform decode of candidate bytes, versus baked frame digests. | [src/core/oracles.ts:1132-1203](../../src/core/oracles.ts#L1132-L1203) |
| `decoded-audio-pcm` | Candidate audio-frame digests versus a platform-derived PCM decode of the source. | [src/core/oracles.ts:1212-1238](../../src/core/oracles.ts#L1212-L1238) |
| `reference-reimport` | Structural byte re-read for remux; exact packet comparison for qualifying mux; otherwise unavailable. | [src/core/oracles.ts:1301-1442](../../src/core/oracles.ts#L1301-L1442) |
| `playback-smoke` | A media element must load and advance. | [src/core/oracles.ts:1633-1639](../../src/core/oracles.ts#L1633-L1639) |
| `ssim-psnr` | Candidate pixels versus committed image evidence or a platform decode of the source. | [src/core/oracles.ts:1758-1995](../../src/core/oracles.ts#L1758-L1995) |
| `mp4-box-layout` | Top-level [ISO BMFF](../glossary.md#iso-bmff) box ordering and fragmented/fast-start shape. | [src/core/oracles.ts:491-552](../../src/core/oracles.ts#L491-L552) |
| `webm-live-layout` | WebM live/append-only structural markers. | [src/core/oracles.ts:611-661](../../src/core/oracles.ts#L611-L661) |
| `fanout-renditions` | Rendition count, dimensions, playback, and per-rendition visual evidence. | [src/core/oracles.ts:1643-1729](../../src/core/oracles.ts#L1643-L1729) |
| `alpha-plane` | Non-opaque alpha and, when available, alpha-plane digest evidence. | [src/core/oracles.ts:2160-2255](../../src/core/oracles.ts#L2160-L2255) |
| `seek-accuracy` | Landed presentation timestamp versus a golden-derived keyframe or nearest-frame target. | [src/core/oracles.ts:2269-2304](../../src/core/oracles.ts#L2269-L2304) |
| `trim-boundaries` | Output duration and optional boundary-frame evidence versus the requested trim. | [src/core/oracles.ts:2418-2506](../../src/core/oracles.ts#L2418-L2506) |
| `decrypt-bitexact` | Decrypted output decoded through the platform path versus clear-content frame evidence. | [src/core/oracles.ts:2608-2630](../../src/core/oracles.ts#L2608-L2630) |
| `graceful-failure` | A malformed-input operation must reject or return only when the scenario permits it. | [src/core/oracles.ts:2652-2700](../../src/core/oracles.ts#L2652-L2700) |
| `property-invariant` | Scenario-selected metamorphic checks over remux, trim, probe, decode, mux, decrypt, and timing behavior. | [src/core/oracles.ts:2710-2857](../../src/core/oracles.ts#L2710-L2857) |

### Golden metadata comparison

`golden-metadata` lowercases and compares container names, compares duration when both sides provide it, filters tracks only by explicit scenario options, and then zips the measured and golden arrays positionally. [src/core/oracles.ts:721-783](../../src/core/oracles.ts#L721-L783) Its per-track comparator lowercases raw codec strings, compares dimensions, uses the configured scalar fps tolerance, and requires exact sample rate and channel count. [src/core/oracles.ts:785-812](../../src/core/oracles.ts#L785-L812)

The default duration band is `1/24` second and the default fps band is `0.05`. Duration is widened to `max(0.5 s, 15%)` for TS, ADTS, HLS, selected no-TOC MP3, and selected headerless/MediaRecorder WebM assets; an explicit scenario override prevents that widening. [src/core/oracles.ts:154-178](../../src/core/oracles.ts#L154-L178) [src/core/oracles.ts:217-259](../../src/core/oracles.ts#L217-L259) No current branch reads an [edit list](../glossary.md#edit-list), AAC [priming](../glossary.md#priming), codec configuration, rate mode, or source [timebase](../glossary.md#timebase) to justify a file-specific band.

The nearby reference-reimport path is already more semantic. It counts tracks by type and calls `canonicalCodecToken` before comparing readable codec identities. [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375) The byte-reader map resolves `avc1` and `avc3` to `h264`, `hev1` and `hvc1` to `hevc`, `mp4a` to `aac`, and Matroska `V_MPEG4/ISO/AVC` to `h264`; `golden-metadata` does not call this map. [src/core/box-readers.ts:46-121](../../src/core/box-readers.ts#L46-L121)

Consequently, the current comparator can report `FAIL` for a codec alias, a different video/audio track order, a signaled [HE-AAC/SBR](../glossary.md#he-aacsbr) core rate versus reconstructed rate, a signaled [Parametric Stereo](../glossary.md#parametric-stereo) core channel count versus decoded channel count, or a valid duration view affected by edit-list presentation, priming, or timescale rounding. It can also overstate a [VFR](../glossary.md#vfr) track as one scalar fps comparison. These are consequences of the cited comparison fields; the code does not record enough signaling to decide their validity today.

### Golden packet comparison and byte readers

`PacketInfo` contains only numeric track index, byte size, PTS, DTS, and a boolean keyframe flag; it carries neither payload bytes nor codec configuration or access-unit structure. [src/core/engine.ts:63-74](../../src/core/engine.ts#L63-L74) The comparator groups each side by numeric track index, sorts by DTS then PTS, removes one constant timestamp origin per track, and then requires equal packet count/layout, exact packet sizes, exact keyframe booleans, and residual timestamps within the seek tolerance. [src/core/oracles.ts:835-927](../../src/core/oracles.ts#L835-L927) `golden-packets` turns any remaining difference into `FAIL`. [src/core/oracles.ts:972-985](../../src/core/oracles.ts#L972-L985)

That table is representation evidence, not a complete semantic packet model. [Annex B](../glossary.md#annex-b) start codes and [AVCC](../glossary.md#avcc) length prefixes have different byte counts; SPS/PPS can be inline or in an `AVCDecoderConfigurationRecord`; and legal NAL/access-unit grouping can change table rows without losing a coded picture. With no payload/configuration fields, the current comparator cannot prove that such size, grouping, or keyframe-flag differences are wrong.

For candidate output, reference re-import uses dependency-free readers rather than a scored adapter. They intentionally never throw and recognize only ISO BMFF and WebM/Matroska structure. [src/core/box-readers.ts:1-40](../../src/core/box-readers.ts#L1-L40) The ISO BMFF packet reader declines fragmented files, while the WebM reader declines lacing, unknown-size clusters, and B-frame reorder because it cannot produce a faithful DTS table. [src/core/box-readers.ts:798-829](../../src/core/box-readers.ts#L798-L829) [src/core/box-readers.ts:842-888](../../src/core/box-readers.ts#L842-L888) The public dispatcher returns `null` for those cases and for other containers. [src/core/box-readers.ts:1006-1058](../../src/core/box-readers.ts#L1006-L1058)

### Neutral platform reference decode and pixel comparisons

The platform implementation is registered as `instrumentOnly`, so it supports baking and oracle helpers but is excluded from the scored engine list and matrix ranking. [src/engines/platform/adapter.ts:521-527](../../src/engines/platform/adapter.ts#L521-L527) Matrix execution injects its decode and playback helpers into every oracle context. [src/core/runner.ts:2063-2071](../../src/core/runner.ts#L2063-L2071)

`decodeBytesToFrames` first uses an inline MP4/WebM demuxer and `VideoDecoder`; if the path rejects or emits no frames, it falls back to a `<video>` element when a DOM exists. In a Worker, the fallback is unavailable and the failure propagates. [src/engines/platform/oracle-helpers.ts:108-165](../../src/engines/platform/oracle-helpers.ts#L108-L165) The [WebCodecs](../glossary.md#webcodecs) driver checks `VideoDecoder.isConfigSupported`, submits encoded chunks with their presentation timestamps, collects decoded frames, sorts them by PTS, rasterizes them, and retains both normalized digests and pixels. [src/engines/platform/decode.ts:89-163](../../src/engines/platform/decode.ts#L89-L163) [src/engines/platform/decode.ts:165-224](../../src/engines/platform/decode.ts#L165-L224) The DOM fallback samples across the media duration and records the element's `currentTime` as PTS. [src/engines/platform/decode.ts:249-307](../../src/engines/platform/decode.ts#L249-L307)

For byte-producing transform cases without a committed frame golden, `ssim-psnr` decodes the engine output with that platform helper, independently decodes the source with the same helper, applies the requested crop/rotation/resize preparation to the source pixels, and compares at most eight frames. When the operation already returns a frame sink, that sink is the candidate side and only the source side is independently decoded. In both shapes, the neutral source reference is fair by construction: it does not privilege any scored framework. [src/core/oracles.ts:1758-1809](../../src/core/oracles.ts#L1758-L1809) [src/core/oracles.ts:1905-1995](../../src/core/oracles.ts#L1905-L1995)

The implemented pairing is not time-aware. Both committed-golden mode and source-reference mode pair array element `i` with array element `i`; the shared frame-SSIM helper also rejects a frame-count delta above three. [src/core/oracles.ts:1078-1128](../../src/core/oracles.ts#L1078-L1128) [src/core/oracles.ts:1811-1860](../../src/core/oracles.ts#L1811-L1860) [src/core/oracles.ts:1933-1984](../../src/core/oracles.ts#L1933-L1984) An intended fps conversion, VFR cadence change, frame duplication/drop policy, or different sampling count can therefore compare different presentation moments and create a false failure.

Candidate platform-decode exceptions, empty sinks, and missing pixels currently become ordinary `FAIL`; the code does not distinguish malformed output from a valid output whose codec/configuration or container path this browser instrument cannot decode. [src/core/oracles.ts:1776-1804](../../src/core/oracles.ts#L1776-L1804) [src/core/oracles.ts:1919-1945](../../src/core/oracles.ts#L1919-L1945) The source-reference branch gates on mean SSIM and reports PSNR only as advisory because its canvas resampler may differ from the engine's; the committed-golden branch gates on minimum SSIM and cannot compute true RGB PSNR without golden pixels. [src/core/oracles.ts:1862-1902](../../src/core/oracles.ts#L1862-L1902) [src/core/oracles.ts:1982-1995](../../src/core/oracles.ts#L1982-L1995)

Decoded frame digests themselves use a tight, top-left, straight-alpha RGBA byte buffer. The SSIM implementation uses 8×8 luma windows, while PSNR uses RGB mean squared error over the overlapping region. [src/core/oracles.ts:4010-4029](../../src/core/oracles.ts#L4010-L4029) [src/core/oracles.ts:4032-4095](../../src/core/oracles.ts#L4032-L4095) [src/core/oracles.ts:4120-4149](../../src/core/oracles.ts#L4120-L4149)

## Contracts and invariants

The following are current executable contracts, including the limitations that the target design must remove:

1. **Declared evaluation.** Every registered scenario has at least one known oracle; unknown IDs become a non-passing outcome rather than crashing dispatch. [src/core/scenario.ts:193-203](../../src/core/scenario.ts#L193-L203) [src/core/oracles.ts:431-480](../../src/core/oracles.ts#L431-L480)
2. **Fixed default bands.** Unless a scenario overrides them, the system uses SSIM `0.99`, PSNR `40 dB`, duration `1/24 s`, fps `0.05`, and seek `1,000 µs`. [src/core/oracles.ts:162-177](../../src/core/oracles.ts#L162-L177)
3. **Binary outcome.** Each oracle emits exactly `pass: true` or `pass: false`; details and numeric measurements do not change that state. [src/core/scenario.ts:215-221](../../src/core/scenario.ts#L215-L221)
4. **All-oracle correctness gate.** Any substantive false outcome makes the cell `FAIL`; one true survivor can carry a cell only when every other false outcome matches the bake-gap string classifier. Benchmarks run only after the runner selects `PASS`. [src/core/runner.ts:1423-1463](../../src/core/runner.ts#L1423-L1463)
5. **No self-grading reference engine.** Output structure is read from bytes and pixel evidence comes from the unscored platform instrument. [src/core/box-readers.ts:1-16](../../src/core/box-readers.ts#L1-L16) [src/engines/platform/adapter.ts:521-527](../../src/engines/platform/adapter.ts#L521-L527)
6. **Normalized pixel bytes.** Bit-exact frame identity means SHA-256 equality over tight RGBA bytes, not equality of encoded media bytes. [src/core/engine.ts:76-94](../../src/core/engine.ts#L76-L94) [src/core/oracles.ts:4010-4029](../../src/core/oracles.ts#L4010-L4029)
7. **Packet timestamp-origin tolerance.** A constant per-track PTS/DTS shift is accepted; varying residual drift beyond the seek tolerance is not. Size and keyframe representation remain exact. [src/core/oracles.ts:839-846](../../src/core/oracles.ts#L839-L846) [src/core/oracles.ts:897-926](../../src/core/oracles.ts#L897-L926)
8. **Reader uncertainty does not throw.** Unsupported or ambiguous byte parsing returns `null`; today that uncertainty is converted to `NA_ASSET` through detail-text matching. [src/core/box-readers.ts:1006-1058](../../src/core/box-readers.ts#L1006-L1058) [src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889)
9. **Runtime decode support is browser-specific.** The platform driver queries the concrete `VideoDecoderConfig`; a rejected configuration cannot produce neutral pixel evidence in that browser. [src/engines/platform/decode.ts:89-122](../../src/engines/platform/decode.ts#L89-L122)
10. **Source-reference quality is independent but full-reference.** Candidate and source pixels are produced through an unscored browser path, then compared at corresponding array indexes. The independence is intentional; index correspondence is only an implementation assumption. [src/core/oracles.ts:1905-1995](../../src/core/oracles.ts#L1905-L1995)

## Target design and known gaps

### Target design

#### Typed three-way outcomes

Replace the boolean with a [discriminated outcome](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) and add `DIFF` to persisted result status:

```ts
type OracleVerdict = 'PASS' | 'DIFF' | 'FAIL';

type OracleOutcome =
  | { state: 'VERDICT'; oracle: OracleId; verdict: OracleVerdict; detail?: string; measurements?: Record<string, number> }
  | { state: 'UNAVAILABLE'; oracle: OracleId; status: 'NA_ASSET' | 'NA_BROWSER'; reasonCode: string; detail: string }
  | { state: 'ERROR'; oracle: OracleId; reasonCode: string; detail: string };
```

`PASS` means the scenario contract holds after its named normalizations. `DIFF` means the media remains valid and semantically acceptable but differs from the ffmpeg-baked representation. `FAIL` is reserved for invalidity, unusability, lost or changed required content, a violated structural invariant, or a measurement outside a correctness tolerance. This split follows the fact that [RFC 6381 distinguishes registered sample-entry coding names](https://datatracker.ietf.org/doc/html/rfc6381#section-3.3), while [ISO BMFF](https://www.iso.org/standard/85596.html) separately defines the container and timed-media structure in which coded media is carried.

The runner reducer must be order-independent:

1. If any substantive verdict is `FAIL`, the cell is `FAIL`.
2. Otherwise, if any substantive verdict is `DIFF`, the cell is `DIFF`.
3. Otherwise, if any substantive verdict is `PASS`, the cell is `PASS`.
4. If no substantive verdict exists, an oracle/harness error produces [ERROR](../glossary.md#error); otherwise [NA_BROWSER](../glossary.md#na_browser) takes precedence over `NA_ASSET`, while retaining every per-oracle reason in machine-readable output.
5. [NA_ENGINE](../glossary.md#na_engine) remains an operation/adapter decision made before oracle reduction when a runtime [NotApplicableError](../glossary.md#notapplicableerror) is thrown; an oracle must not manufacture it.

`PASS` and `DIFF` are both correctness-valid and may collect performance measurements, but reports must retain the verdict so representation drift is never displayed as exact agreement. `FAIL` continues to gate benchmarks. Thrown oracle code becomes typed `ERROR`, not a false semantic verdict. Missing golden evidence becomes `NA_ASSET`; rejected browser codec/API configurations become `NA_BROWSER`; an unsupported internal byte-reader path becomes `ERROR` with an oracle-reader reason, not `NA_ASSET`.

Acceptance requires unit tests over every reducer permutation, JSON round trips that preserve `DIFF` and typed unavailable reasons, and a matrix fixture in which one `PASS` plus one unavailable oracle remains `PASS`, one `DIFF` plus one unavailable oracle remains `DIFF`, and any real `FAIL` remains decisive.

#### Semantic golden-metadata comparison

The target comparator has two layers: semantic validation first, then representation classification. A semantic mismatch is `FAIL`; semantic agreement with raw differences is `DIFF`; semantic and relevant raw agreement is `PASS`.

1. **Canonicalize codec identity before comparison.** Share `canonicalCodecToken` with golden metadata and require at least these mappings: `avc1`/`avc3 → h264`, `hev1`/`hvc1 → hevc`, `V_MPEG4/ISO/AVC → h264`, and `mp4a → aac`. RFC 6381 makes the four-character sample-entry code the base codec identifier for ISO BMFF, and the [WebCodecs AVC registration accepts both `avc1.` and `avc3.` prefixes](https://www.w3.org/TR/webcodecs-avc-codec-registration/#fully-qualified-codec-strings). Canonical equality prevents `FAIL`; a different raw legal label is recorded as `DIFF`.
2. **Match logical tracks by type, not array index.** Partition both sides into video, audio, subtitle, and other tracks; unequal per-type counts are `FAIL`. Within one type, choose a deterministic minimum-cost one-to-one match using canonical codec, dimensions, language, and rate/channel evidence. Never compare a video track with an audio track merely because both occupy index zero. Reordered but otherwise identical logical tracks are valid and therefore `DIFF` rather than `FAIL`; exact order remains `PASS`.
3. **Make AAC signaling explicit.** Extend normalized evidence with the raw codec string or `AudioSpecificConfig` interpretation, including Audio Object Type and `sbrPresent`/`psPresent`. The [WebCodecs AAC registration identifies `mp4a.40.5` as HE-AAC v1 and `mp4a.40.29` as HE-AAC v2](https://www.w3.org/TR/webcodecs-aac-codec-registration/#fully-qualified-codec-strings). Only when SBR is signaled may a core rate and exactly `2×` reconstructed rate compare as semantically equal; only when Parametric Stereo is signaled may a one-channel core and two-channel output compare as equal. ITU-R describes HE-AAC as a dual-rate system and HE-AAC v2 as a mono representation plus stereo reconstruction parameters. [ITU-R BS.1196-7, Annex 2 §§4-5](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1196-7-201901-S%21%21PDF-E.pdf#page=16) A different valid observer view is `DIFF`; the same ratios without signaling are `FAIL`.
4. **Band cadence according to what is represented.** Preserve a [CFR](../glossary.md#cfr)/`VFR` mode and rational or timestamp-derived cadence evidence. CFR scalar comparison may retain the scenario's fps band; known [NTSC rate](../glossary.md#ntsc-rate) families—`24000/1001`, `30000/1001`, and `60000/1001`—must compare around the rational center rather than a rounded integer. Apple's timing note shows `30000/1001` as `TimeScale=30000`, sample duration `1001`, and explains why `29.97` and `30/1.001` are not identical representations. [Apple TN2162, “Video Rate and Movie TimeScale”](https://developer.apple.com/library/archive/technotes/tn2162/_index.html) For VFR, compare a scenario-declared fps band or timestamp-derived cadence envelope; do not require equality to one nominal scalar. WebCodecs exposes presentation timestamp and duration in microseconds, providing the appropriate evidence. [WebCodecs encoded video chunk timing](https://www.w3.org/TR/webcodecs/#encodedvideochunk-interface)
5. **Compare presentation duration with evidenced allowances.** Add timing evidence for movie/media timescales, edit-list presentation span, raw sample span, and audio priming/remainder. Prefer comparing normalized presentation durations. If one observer exposes raw media span and the other presentation span, the extra allowance is only the evidenced absolute difference between those spans, plus priming/remainder divided by sample rate and at most one tick from each participating timebase. ISO BMFF user agents apply an `edts/elst` mapping from media composition time to movie presentation time. [W3C ISO BMFF byte-stream format, initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments) Apple's AAC guidance explains why packet span includes priming and remainder samples and how edit lists identify the presented source waveform. [Apple, “Using track structures to represent encoder delay explicitly”](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly) This is a per-file evidence band, never a blanket percentage; loss beyond the signaled edit/priming/timebase envelope is `FAIL`.

Metadata diagnostics must retain raw and canonical codec values, selected track matches, raw and normalized rate/channel values, cadence mode/band, raw and presentation durations, the calculated tolerance components, and the rule that selected `PASS`, `DIFF`, or `FAIL`.

Acceptance fixtures must cover: every required codec alias; audio-first versus video-first ordering; two same-type audio tracks in reversed order; signaled and unsignaled SBR `24 kHz ↔ 48 kHz`; signaled and unsignaled Parametric Stereo `1 ch ↔ 2 ch`; `29.97 ↔ 30000/1001`; a genuinely VFR timestamp envelope; AAC priming/remainder; an ISO BMFF edit list; and two different legal timescales. Each signaled/legal representation case must avoid `FAIL`, while a missing track, wrong canonical codec, unsignaled rate/channel ratio, or duration beyond its evidenced envelope must be `FAIL`.

#### Semantic packet comparison with representation diagnostics

Keep the current packet table for reporting, but do not use byte size, raw row grouping, or adapter-supplied keyframe flags as universal semantic truth. Add codec-aware packet evidence: payload bytes or a stable payload digest, decoder configuration, framing kind, normalized access-unit identity, and derived random-access kind.

For AVC and HEVC, normalize [Annex B](https://www.w3.org/TR/webcodecs-avc-codec-registration/#encodedvideochunk-data) start-code framing and length-prefixed `avcC`/`hvcC` framing into ordered NAL units; merge out-of-band VPS/SPS/PPS with equivalent in-band parameter sets; and form access units before comparing coded pictures. The WebCodecs AVC registration says an encoded chunk is an access unit containing one primary coded picture, that a present `VideoDecoderConfig.description` denotes an `AVCDecoderConfigurationRecord`, and that an absent description denotes Annex B. [WebCodecs AVC registration §§2-3](https://www.w3.org/TR/webcodecs-avc-codec-registration/#videodecoderconfig-description) It also requires Annex B key chunks to carry the necessary parameter sets while `avc` key chunks obtain them from configuration, so raw key-chunk sizes and parameter-set placement are expected to differ. [WebCodecs AVC registration §4](https://www.w3.org/TR/webcodecs-avc-codec-registration/#encodedvideochunk-type)

The verdict algorithm is:

1. Match tracks semantically by type and canonical codec.
2. Compare presentation/decode timelines after the current constant-origin normalization, using a codec/timebase-aware tolerance.
3. For lossless-preserve scenarios, compare the ordered primary coded pictures or audio frames after framing/configuration normalization; dropped, duplicated, reordered, or changed required coded content is `FAIL`.
4. Derive random-access semantics from codec structure—IDR/IRAP and required parameter availability—not solely from a container boolean. A missing required random-access point is `FAIL`.
5. If semantic evidence agrees and the ffmpeg-baked packet rows also agree, return `PASS`. If semantic evidence agrees but Annex B/length-prefix framing, inline parameter sets, legal NAL grouping, packet sizes, or raw keyframe flags differ, return `DIFF` with both representations in diagnostics.
6. If the codec has no implemented semantic normalizer, return a typed harness-unavailable outcome; never infer `PASS` from incomplete evidence and never call an unexplained row difference semantic `FAIL`.

Acceptance requires paired fixtures whose VCL/audio-frame content and timing are the same across Annex B and length-prefixed forms, inline and out-of-band SPS/PPS, and at least two legal NAL groupings. Those pairs must be `DIFF`, not `FAIL`. Removing a VCL NAL, altering decoded content, breaking an IDR dependency, changing cadence beyond tolerance, or assigning a packet to the wrong logical track must remain `FAIL`.

#### Timestamp-aware neutral reference decode

Retain the neutral platform source decode. [WebCodecs](https://www.w3.org/TR/webcodecs/) is intentionally below the scored frameworks, and its `isConfigSupported()` result is explicitly user-agent/configuration dependent. [WebCodecs `VideoDecoder.isConfigSupported()`](https://www.w3.org/TR/webcodecs/#dom-videodecoder-isconfigsupported) The source-reference design is fair; its correspondence and error classification need correction.

Replace index pairing with presentation-time sampling:

1. Preserve each decoded frame's PTS and duration. Normalize each timeline by its first presented PTS and derive a half-open interval `[pts, pts + duration)`; when duration is absent, use the next PTS and only then a documented median-delta fallback.
2. Apply the scenario's crop/rotation/resize transform to source pixels, then compute the expected common presentation window.
3. Select up to eight evenly spaced sample times inside that window. At each time, choose the source and candidate frames whose intervals contain it; if neither interval contains it, accept the nearest frame center only within the larger of one local half-frame duration, one recorded timebase tick, and the scenario's explicit timing tolerance. Reuse across adjacent sample times is allowed for an intentional fps conversion.
4. Require at least 75% of requested sample times to yield pairs and require presentation-window coverage within the scenario duration tolerance. A different frame count alone is not failure when the scenario changes fps; missing expected time coverage is.
5. Apply the existing scenario SSIM threshold to the aligned pairs and continue reporting pair count, min/mean SSIM, PSNR, timestamp residuals, and coverage. SSIM is a full-reference image-quality measure, so correspondence is part of the measurement contract. [Wang et al., “Image Quality Assessment: From Error Visibility to Structural Similarity”](https://ece.uwaterloo.ca/~z70wang/publications/ssim.pdf) ITU-T's PSNR reference algorithm explicitly compensates temporal and spatial shifts, reinforcing that unaligned samples are not a fair quality comparison. [ITU-T J.340 summary](https://www.itu.int/dms_pubrec/itu-t/rec/j/T-REC-J.340-201006-I%21%21SUM-HTM-E.htm)

Decode failure classification must be independent from the quality score:

- missing API or `isConfigSupported() === false` for source or output is `NA_BROWSER` for the reference oracle;
- a valid output whose concrete codec/configuration the browser rejects—or whose only browser decode path is unavailable in the current realm—is a typed `NA_BROWSER` reference-path limitation, not engine `FAIL`;
- structurally malformed output, or decode failure after the configuration is known supported and independent evidence establishes an invalid bitstream, is `FAIL`;
- an unimplemented or ambiguous internal demux/parser path is a harness `ERROR`, not `NA_BROWSER` and not guessed wrongness;
- when another oracle has a substantive verdict, an unavailable SSIM outcome is retained but does not erase that verdict; when every correctness oracle is reference-blocked, the cell is `NA_BROWSER`.

Acceptance requires an fps-conversion case and a VFR case whose equal presentation moments are offset in array index; both must align and pass their existing quality threshold. A legal output using a browser-unsupported codec must be `NA_BROWSER`, while a deliberately truncated stream under a supported configuration must be `FAIL`. Golden-index mode and fanout's shared `compareFrameSsim` must use the same timestamp matcher so the bug is not merely moved between code paths.

#### Typed evidence and reader boundaries

Replace `null` and detail-substring control flow with result objects carrying `OK`, `UNSUPPORTED_FORMAT`, `UNSUPPORTED_STRUCTURE`, `MALFORMED`, or `INCOMPLETE` plus parser evidence. Missing committed files alone map to `NA_ASSET`; a browser codec limitation maps to `NA_BROWSER`; a scored adapter's runtime inability remains `NA_ENGINE`; an unimplemented neutral reader maps to harness `ERROR`; malformed candidate bytes can support `FAIL`. This preserves the existing never-throw parser safety while removing the false equivalence between “asset absent” and “benchmark reader cannot parse fragmented MP4.”

Extend the neutral readers in priority order to fragmented ISO BMFF sample runs, WebM lacing, and separate WebM decode/presentation ordering. ISO/IEC 14496-12 defines the common box and timed-media foundation for MP4-family files. [ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html) Until each reader exists, its typed unsupported result is visible and cannot be mistaken for engine invalidity.

### Known gaps

| Gap | Current | Consequence | Target | Verification |
| --- | --- | --- | --- | --- |
| No three-way verdict | `OracleOutcome` is boolean and the runner reduces any substantive false value to `FAIL`. [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221) [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447) | A valid representation change is indistinguishable from wrong output; thrown oracle code also looks like a semantic negative. | Implement typed `PASS`/`DIFF`/`FAIL`, availability, and harness errors; RFC 6381's distinct registered coding names demonstrate why raw representation and semantic codec family are not the same judgment. [RFC 6381 §3.3](https://datatracker.ietf.org/doc/html/rfc6381#section-3.3) | Reducer permutation tests, persisted `DIFF`, and separate thrown-oracle `ERROR` snapshots. |
| Golden metadata is raw and positional | Codecs are lowercased rather than canonicalized, arrays are zipped, and sample rate/channels are exact. [src/core/oracles.ts:768-812](../../src/core/oracles.ts#L768-L812) | Codec aliases, track reordering, HE-AAC observer rates, and Parametric Stereo observer channels can false-fail. | Canonicalize aliases, match by type, and condition SBR/PS equivalence on signaling. The W3C AAC registration identifies HE-AAC v1/v2 codec strings, while ITU-R documents dual-rate and mono-core/stereo-output behavior. [W3C AAC registration §1](https://www.w3.org/TR/webcodecs-aac-codec-registration/#fully-qualified-codec-strings) [ITU-R BS.1196-7 Annex 2](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1196-7-201901-S%21%21PDF-E.pdf#page=16) | Required alias, reorder, signaled/unsignaled SBR, and signaled/unsignaled Parametric Stereo fixtures produce the specified verdicts. |
| Cadence and duration lack presentation evidence | One scalar fps and mostly fixed/container-name duration bands are compared. [src/core/oracles.ts:217-259](../../src/core/oracles.ts#L217-L259) [src/core/oracles.ts:736-766](../../src/core/oracles.ts#L736-L766) | VFR, NTSC rational spelling, edit-list presentation, priming, and timebase rounding can false-fail or be hidden by a broad container band. | Persist rational/timestamp, edit-list, priming, remainder, and timescale evidence; use only evidenced bands. Apple documents exact `30000/1001` timing and AAC edit-list/priming representation. [Apple TN2162](https://developer.apple.com/library/archive/technotes/tn2162/_index.html) [Apple AAC delay representation](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly) | VFR/NTSC/edit-list/priming/timebase fixtures stay non-failing inside their evidence envelope and fail immediately outside it. |
| Packet rows are treated as semantic truth | Packet count, size, and keyframe flags are exact after timestamp-origin alignment. [src/core/oracles.ts:835-927](../../src/core/oracles.ts#L835-L927) | Annex B versus AVCC, inline SPS/PPS, and legal NAL grouping can create `FAIL` without content loss. | Normalize access units and parameter-set placement; retain row differences as `DIFF`. W3C specifies both AVC packaging forms and their different configuration/key-chunk obligations. [W3C AVC registration §§2-4](https://www.w3.org/TR/webcodecs-avc-codec-registration/#encodedvideochunk-data) | Equivalent framing/grouping pairs are `DIFF`; removed or corrupted coded pictures remain `FAIL`. |
| SSIM pairs frames by index | Candidate/source and candidate/golden loops use the same numeric index; one helper also rejects a count delta above three. [src/core/oracles.ts:1078-1128](../../src/core/oracles.ts#L1078-L1128) [src/core/oracles.ts:1905-1984](../../src/core/oracles.ts#L1905-L1984) | Valid fps/frame-count changes compare different moments and lower the quality score. | Pair by presentation intervals and common-window sample times. WebCodecs preserves microsecond timestamps and frame durations, while ITU-T J.340 treats temporal alignment as part of PSNR evaluation. [WebCodecs `VideoFrame` timing](https://www.w3.org/TR/webcodecs/#videoframe-interface) [ITU-T J.340](https://www.itu.int/dms_pubrec/itu-t/rec/j/T-REC-J.340-201006-I%21%21SUM-HTM-E.htm) | Offset-index fps/VFR fixtures meet the existing threshold after timestamp pairing; missing expected time coverage fails. |
| Reference decode applicability is collapsed into failure | Unsupported config, zero frames, and absent pixels all become ordinary false outcomes. [src/engines/platform/decode.ts:89-122](../../src/engines/platform/decode.ts#L89-L122) [src/core/oracles.ts:1776-1804](../../src/core/oracles.ts#L1776-L1804) | A legal output that this browser reference path cannot decode is blamed on the engine. | Route unsupported concrete configurations to `NA_BROWSER`; reserve `FAIL` for independently established invalid/undecodable output under a supported configuration. WebCodecs defines `isConfigSupported()` as a user-agent support query. [WebCodecs support query](https://www.w3.org/TR/webcodecs/#dom-videodecoder-isconfigsupported) | Unsupported-codec fixture yields `NA_BROWSER`; corrupt supported-codec fixture yields `FAIL`; both preserve per-oracle reasons. |
| Availability depends on prose | Magic substrings select `NA_ASSET`, including byte-reader limitations. [src/core/oracles.ts:306-324](../../src/core/oracles.ts#L306-L324) [src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889) | Copy edits can change control flow, and existing output can be mislabeled as a missing asset. | Use [TypeScript discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) for reason codes and map only absent committed evidence to `NA_ASSET`. | A detail-text mutation cannot alter status; fragmented MP4 reader absence is harness `ERROR`, while a missing golden file is `NA_ASSET`. |
| Neutral packet readers cover only a subset | Fragmented ISO BMFF and laced/reordered WebM return `null`. [src/core/box-readers.ts:798-829](../../src/core/box-readers.ts#L798-L829) [src/core/box-readers.ts:842-888](../../src/core/box-readers.ts#L842-L888) | Reference re-import loses otherwise useful truth and can be routed under the wrong status. | Add typed parse results, then implement fragments, lacing, and distinct PTS/DTS using the relevant container structures defined on the ISO BMFF foundation. [ISO/IEC 14496-12:2026](https://www.iso.org/standard/85596.html) | Reader conformance fixtures either yield complete tables or the exact typed unsupported/malformed reason; no partial table is compared. |

## Sources

### Repository evidence

- [src/core/scenario.ts:35-51](../../src/core/scenario.ts#L35-L51) — complete oracle identifier vocabulary.
- [src/core/scenario.ts:145-152](../../src/core/scenario.ts#L145-L152) — per-scenario oracle tolerance surface.
- [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221) — current result statuses and boolean oracle outcome.
- [src/core/engine.ts:41-74](../../src/core/engine.ts#L41-L74) — normalized metadata and packet evidence shapes.
- [src/core/engine.ts:76-94](../../src/core/engine.ts#L76-L94) — normalized frame digest and pixel sink contract.
- [src/core/oracles.ts:44-116](../../src/core/oracles.ts#L44-L116) — golden sidecar loading and absence policy.
- [src/core/oracles.ts:154-259](../../src/core/oracles.ts#L154-L259) — default and container-derived tolerance rules.
- [src/core/oracles.ts:283-324](../../src/core/oracles.ts#L283-L324) — oracle context and current detail-string availability encoding.
- [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375) — type-counted, canonicalized structure comparison used by reference re-import.
- [src/core/oracles.ts:425-480](../../src/core/oracles.ts#L425-L480) — oracle dispatch and catch-to-false behavior.
- [src/core/oracles.ts:721-825](../../src/core/oracles.ts#L721-L825) — current golden metadata comparator.
- [src/core/oracles.ts:835-985](../../src/core/oracles.ts#L835-L985) — current packet comparator and golden-packets verdict.
- [src/core/oracles.ts:1078-1128](../../src/core/oracles.ts#L1078-L1128) — shared index-based SSIM comparison and frame-count rule.
- [src/core/oracles.ts:1132-1442](../../src/core/oracles.ts#L1132-L1442) — decoded-frame/audio and reference-reimport paths.
- [src/core/oracles.ts:1758-1995](../../src/core/oracles.ts#L1758-L1995) — candidate/reference decode, index pairing, SSIM gate, and decode failure behavior.
- [src/core/oracles.ts:4010-4149](../../src/core/oracles.ts#L4010-L4149) — pixel digest, SSIM, and PSNR implementations.
- [src/core/box-readers.ts:1-121](../../src/core/box-readers.ts#L1-L121) — no-engine reader contract and codec canonicalization map.
- [src/core/box-readers.ts:798-888](../../src/core/box-readers.ts#L798-L888) — fragmented ISO BMFF and WebM packet-reader exclusions.
- [src/core/box-readers.ts:1006-1058](../../src/core/box-readers.ts#L1006-L1058) — public structure and packet reader dispatch.
- [src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889) — detail-substring gap classification.
- [src/core/runner.ts:1411-1519](../../src/core/runner.ts#L1411-L1519) — oracle execution, binary cell reduction, benchmark gate, and context construction.
- [src/core/runner.ts:2063-2071](../../src/core/runner.ts#L2063-L2071) — default platform helper injection.
- [src/engines/platform/oracle-helpers.ts:108-165](../../src/engines/platform/oracle-helpers.ts#L108-L165) — WebCodecs-first decode with DOM fallback.
- [src/engines/platform/decode.ts:89-224](../../src/engines/platform/decode.ts#L89-L224) — configuration support, chunk timing, decode, and presentation-order sorting.
- [src/engines/platform/decode.ts:249-307](../../src/engines/platform/decode.ts#L249-L307) — media-element fallback sampling.
- [src/engines/platform/adapter.ts:521-527](../../src/engines/platform/adapter.ts#L521-L527) — platform registration as an unscored instrument.

### External authorities

- ISO/IEC, [ISO/IEC 14496-12:2026 — ISO base media file format](https://www.iso.org/standard/85596.html), accessed 2026-07-16 — authoritative catalogue entry for the box and timed-media format inherited by MP4-family files.
- R. Gellens, D. Singer, and P. Frojdh, [RFC 6381 §3.3, ISO file format namespace](https://datatracker.ietf.org/doc/html/rfc6381#section-3.3), accessed 2026-07-16 — defines sample-entry coding-name use in codec parameters.
- W3C Media Working Group, [AVC (H.264) WebCodecs Registration §§1-5](https://www.w3.org/TR/webcodecs-avc-codec-registration/), accessed 2026-07-16 — defines `avc1`/`avc3`, access units, Annex B versus `avc` packaging, decoder configuration, and key-chunk parameter-set placement.
- W3C Media Working Group, [AAC WebCodecs Registration §§1-3](https://www.w3.org/TR/webcodecs-aac-codec-registration/), accessed 2026-07-16 — identifies AAC-LC, HE-AAC v1/SBR, HE-AAC v2/SBR+Parametric Stereo, and `AudioSpecificConfig` use.
- W3C Media Working Group, [WebCodecs](https://www.w3.org/TR/webcodecs/), accessed 2026-07-16 — specifies runtime configuration-support queries and microsecond presentation timestamps/durations on encoded chunks and frames.
- W3C Media Source Extensions Working Group, [ISO BMFF byte stream format, initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments), accessed 2026-07-16 — requires support for a single edit-list mapping and describes in-band/out-of-band codec configuration expectations.
- ITU Radiocommunication Sector, [Recommendation ITU-R BS.1196-7, Annex 2 §§4-5](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1196-7-201901-S%21%21PDF-E.pdf#page=16), accessed 2026-07-16 — documents HE-AAC's dual-rate core/output behavior and Parametric Stereo's mono representation with stereo reconstruction.
- Apple, [AAC encoding background](https://developer.apple.com/documentation/quicktime-file-format/background_aac_encoding), accessed 2026-07-16 — explains AAC priming and remainder samples and why packet span exceeds source-program duration.
- Apple, [Using track structures to represent encoder delay explicitly](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly), accessed 2026-07-16 — explains edit-list, timescale, priming, and remainder representation for AAC tracks.
- Apple, [Technical Note TN2162, “Video Rate and Movie TimeScale”](https://developer.apple.com/library/archive/technotes/tn2162/_index.html), accessed 2026-07-16 — gives exact `30000/1001` timing and discusses timescale precision and alternate representations.
- Z. Wang, A. C. Bovik, H. R. Sheikh, and E. P. Simoncelli, [“Image Quality Assessment: From Error Visibility to Structural Similarity”](https://ece.uwaterloo.ca/~z70wang/publications/ssim.pdf), accessed 2026-07-16 — primary SSIM paper establishing the full-reference structural comparison used by the benchmark.
- ITU Telecommunication Standardization Sector, [Recommendation ITU-T J.340 summary](https://www.itu.int/dms_pubrec/itu-t/rec/j/T-REC-J.340-201006-I%21%21SUM-HTM-E.htm), accessed 2026-07-16 — specifies PSNR computation with temporal/spatial shift compensation, supporting explicit alignment before quality scoring.
- TypeScript, [Handbook: Narrowing — Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions), accessed 2026-07-16 — documents tagged union shapes that make verdict, availability, and error states explicit and exhaustively narrowable.
