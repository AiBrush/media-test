# Glossary

This page is the normative vocabulary for `media-test`. A term marked **current** names behavior or data present in the repository. A term marked **target** is a requirement for later cleanup work and must not be described as implemented. Many terms have both a current use and a narrower target meaning.

For the owning implementation discussions, see the [scenario DSL](subsystems/scenario-dsl-registry.md), [runner and capability negotiation](subsystems/runner-capability-negotiation.md), [oracle system](subsystems/oracle-system.md), [reporting and aggregation](subsystems/reporting-aggregation.md), [golden baking and fixtures](subsystems/golden-baking-fixtures.md), and [engine adapter contract](subsystems/engine-adapter-contract.md).

## Results and execution

- <a id="pass"></a> **PASS** *(current status; target oracle verdict)* — Currently, the only green `ResultStatus`; boolean oracle outcomes reduce to it when no substantive false outcome remains, and only it admits benchmark iterations. In the target three-way oracle model, PASS specifically means that the observation satisfies the scenario's semantic and structural contract after documented normalization and tolerances. It does not inherently mean byte-for-byte identity. [src/core/scenario.ts:208-222](../src/core/scenario.ts#L208-L222) [src/core/runner.ts:1411-1463](../src/core/runner.ts#L1411-L1463)

- <a id="diff"></a> **DIFF** *(target only)* — A verdict for output that is valid and semantically acceptable but differs from the ffmpeg-baked golden's representation, such as an allowed codec label, framing, packet grouping, timing expression, or container organization. DIFF is diagnostic and benchmark-eligible in the target model. It is absent from the current `ResultStatus` and boolean `OracleOutcome`; no page may imply otherwise. [src/core/scenario.ts:208-222](../src/core/scenario.ts#L208-L222)

- <a id="fail"></a> **FAIL** *(current status; narrowed target meaning)* — Currently, the runner uses FAIL for the first substantive non-passing oracle outcome and for ordinary operation timeouts. The target reserves FAIL for truly wrong output: invalid or unusable media, lost or changed required content, a violated semantic/structural invariant, or an exceeded correctness tolerance. A legal representation difference alone is DIFF. [src/core/runner.ts:1382-1447](../src/core/runner.ts#L1382-L1447)

- <a id="na_engine"></a><a id="na-engine"></a> **NA_ENGINE** *(current)* — A non-failure cell status meaning the engine or adapter cannot perform the operation or concrete combination. The runner emits it after declaration-time rejection or after catching a runtime error whose name is exactly `NotApplicableError`. It is distinct from browser and asset absence. [src/core/runner.ts:124-190](../src/core/runner.ts#L124-L190) [src/core/runner.ts:1382-1393](../src/core/runner.ts#L1382-L1393)

- <a id="na_browser"></a><a id="na-browser"></a> **NA_BROWSER** *(current)* — A non-failure status meaning the engine declares the path but this browser/runtime lacks a required API, codec configuration, or comparable platform evidence. The current gate derives it from detected browser support after engine declaration checks pass. [src/core/runner.ts:191-334](../src/core/runner.ts#L191-L334)

- <a id="na_asset"></a><a id="na-asset"></a> **NA_ASSET** *(current)* — A non-failure status meaning required source media or golden evidence is unavailable. Current oracle availability routing partly depends on recognized detail strings; the target replaces that string protocol with typed evidence states. [src/core/runner.ts:1307-1329](../src/core/runner.ts#L1307-L1329) [src/core/runner.ts:858-889](../src/core/runner.ts#L858-L889)

- <a id="error"></a> **ERROR** *(current)* — An unexpected harness, adapter, initialization, or operation failure that is neither a valid negative-test outcome nor an applicability decision. Ordinary unsupported combinations should become NA_ENGINE, and mixed robustness coverage should receive a target partial grade rather than being collapsed to ERROR. [src/core/runner.ts:1358-1366](../src/core/runner.ts#L1358-L1366) [src/core/runner.ts:1464-1468](../src/core/runner.ts#L1464-L1468)

- <a id="skipped"></a> **SKIPPED** *(current)* — An intentionally unexecuted cell selected by a hand-maintained disabled-cell rule. It is policy/debt, not a synonym for engine or browser incapability. [src/core/runner.ts:1928-1957](../src/core/runner.ts#L1928-L1957)

- <a id="notapplicableerror"></a> **NotApplicableError** *(current runtime signal; broader target use)* — The exact error-name contract by which an adapter tells the runner that a coarse declared capability cannot handle the concrete request. The repository currently recognizes `err.name === 'NotApplicableError'`; it is not yet one shared exported error class. The target requires adapters—especially Mediabunny, Remotion, and Remotion Media Parser—to use the signal consistently so runtime inability becomes NA_ENGINE and the disabled-cell list shrinks. [src/core/runner.ts:686-693](../src/core/runner.ts#L686-L693) [src/core/runner.ts:1382-1393](../src/core/runner.ts#L1382-L1393)

- <a id="scenario"></a> **scenario** *(current)* — One registered, engine-independent specification with a stable family/name id, operation, logical input, options, required capabilities, oracles, metrics, and tolerances. Use *scenario*, not *case*, for this object. [src/core/scenario.ts:154-181](../src/core/scenario.ts#L154-L181) [src/core/scenario.ts:189-204](../src/core/scenario.ts#L189-L204)

- <a id="variant"></a> **variant** *(current concept, qualified by kind)* — One concrete realization inside a scenario. Always qualify it: an *input variant* is a selected corpus file/configuration, a *browser-reference variant* is browser-specific evidence, and a *rendition variant* is one ABR/media output. Never use variant as a synonym for scenario. Current result and output types represent input selection and rendition variants in different fields. [src/core/scenario.ts:287-313](../src/core/scenario.ts#L287-L313) [src/core/engine.ts:28-39](../src/core/engine.ts#L28-L39)

- <a id="cell"></a> **cell** *(current)* — One engine × scenario × browser scoring unit. In ordinary mode it uses one selected input variant. Exhaustive mode retains multiple per-file sub-results but still produces one aggregate cell. [src/core/scenario.ts:269-318](../src/core/scenario.ts#L269-L318) [src/core/runner.ts:428-439](../src/core/runner.ts#L428-L439)

- <a id="partial-coverage"></a> **partial coverage** *(target grade; current evidence only)* — A robustness/reporting result in which some admissible input variants pass and others fail, for example file 01 passes while files 02 and 03 fail. Current exhaustive execution retains per-file states and `passed/admissible/total`, but any FAIL/ERROR still collapses the top-level cell. The target preserves all per-file verdicts and grades that cell as partial—never ERROR merely because coverage is mixed. [src/core/runner.ts:1118-1205](../src/core/runner.ts#L1118-L1205)

## Correctness and evidence

- <a id="oracle"></a> **oracle** *(current)* — A named, engine-independent correctness evaluator that consumes an operation observation plus source, golden, or platform context and emits a verdict detail and measurements. The current outcome is boolean; the target outcome is PASS/DIFF/FAIL plus typed unavailability/error. Oracles gate performance numbers. [src/core/scenario.ts:35-51](../src/core/scenario.ts#L35-L51) [src/core/oracles.ts:283-301](../src/core/oracles.ts#L283-L301)

- <a id="golden"></a> **golden** *(current evidence)* — Committed expected evidence under `fixtures/golden`, with provenance that depends on artifact kind. Metadata and packet goldens are generally ffmpeg/ffprobe-baked representation anchors; frame/quality evidence may be browser-baked. A golden is evidence, not proof that every different valid representation is wrong. The loader currently exposes metadata, packets, frame digests, and SSIM references. [src/core/oracles.ts:42-105](../src/core/oracles.ts#L42-L105)

- <a id="golden-metadata"></a> **golden metadata** *(current comparator; target semantic comparator)* — Normalized container, duration, tracks, codec labels, dimensions/rate/channel data, and related observations consumed by `golden-metadata`. Today the comparator lowercases raw codec values and matches track arrays by position, with exact rate/channel checks. The target canonicalizes `avc1`/`avc3 → h264`, `hev1`/`hvc1 → hevc`, `V_MPEG4/ISO/AVC → h264`, and `mp4a → aac`; matches tracks by type; accepts signaled HE-AAC/SBR base-versus-2× rates and Parametric Stereo 1-versus-2-channel views; bands VFR/NTSC cadence; and widens duration only for evidenced edit-list, priming, and timebase effects. [src/core/oracles.ts:719-825](../src/core/oracles.ts#L719-L825) The existing reference re-import path already uses codec canonicalization and type buckets, which golden metadata does not. [src/core/oracles.ts:341-375](../src/core/oracles.ts#L341-L375) [src/core/box-readers.ts:46-121](../src/core/box-readers.ts#L46-L121)

- <a id="golden-packets"></a> **golden packets** *(current representation anchor; target semantic split)* — The ffprobe-baked packet table consumed by `golden-packets`. Today the comparator requires the same per-track packet count, byte size, keyframe flags, and grouping after limited timestamp-origin normalization. Those exact properties are unfair as universal correctness criteria across Annex B versus AVCC, inline versus out-of-band SPS/PPS, and legal NAL grouping. The target keeps representation facts as diagnostics and uses DIFF when semantics are preserved. [src/core/oracles.ts:835-985](../src/core/oracles.ts#L835-L985)

- <a id="reference-decode"></a> **reference decode** *(current neutral instrument; target pairing fix)* — An unscored in-browser decode through platform WebCodecs paths used to obtain source or candidate frames for pixel comparisons. It is deliberately independent of every scored engine and is fair by design. Current SSIM/PSNR false failures come from array-index frame pairing under fps/frame-count changes and from valid candidate output that this browser reference path cannot decode. The target pairs by timestamps/presentation windows and separates output validity from reference-path applicability. [src/core/registry.ts:63-70](../src/core/registry.ts#L63-L70) [src/core/oracles.ts:1758-1809](../src/core/oracles.ts#L1758-L1809) [src/core/oracles.ts:1905-1995](../src/core/oracles.ts#L1905-L1995)

- <a id="reference-re-import"></a> **reference re-import** *(current)* — Re-opening candidate output through dependency-free reference parsing/probing to test readability and observable structure. It is distinct from reference decode and from comparing a source demux result with golden packets. Its existing structure comparison canonicalizes known codec labels and counts tracks by type. [src/core/oracles.ts:341-375](../src/core/oracles.ts#L341-L375) [src/core/oracles.ts:1299-1442](../src/core/oracles.ts#L1299-L1442)

- <a id="semantic-equivalence"></a> **semantic equivalence** *(target classification concept)* — Two representations preserve the behavior a scenario requires even when codec tags, packetization, timestamps within an evidenced tolerance, or container layout differ. Semantic equivalence prevents FAIL; a remaining observable legal representation change is DIFF.

- <a id="representation-difference"></a> **representation difference** *(target classification concept)* — A difference in legal encoding or container expression that does not itself change required semantics. Examples include allowed codec aliases, Annex B versus AVCC framing, inline configuration, legal packet grouping, and equivalent timeline expression. The target oracle model reports it as DIFF, not FAIL.

## Capabilities and adapters

- <a id="capability-token"></a> **capability token** *(current)* — One canonical atomic declaration or requirement: operation, input/output container, input/output codec, encryption scheme, or feature string. Engine declarations and scenario requirements use arrays/maps of these tokens. [src/core/engine.ts:115-137](../src/core/engine.ts#L115-L137) [src/core/scenario.ts:15-31](../src/core/scenario.ts#L15-L31)

- <a id="capability-gate"></a> **capability gate** *(current)* — The runner's pre-execution intersection of scenario requirements, engine-declared capability tokens, and detected browser support. It checks independent tokens and selected browser codec configurations; it does not prove every concrete tuple. [src/core/runner.ts:112-334](../src/core/runner.ts#L112-L334)

- <a id="combinatorial-support"></a> **combinatorial support** *(target modeling need; runtime reality)* — Support conditioned on a tuple such as operation × input container × input codec × output container × output codec × options. A flat token can be individually true while the concrete combination remains unsupported. Tuple-aware negotiation is not implemented; until it is, adapters must use NotApplicableError for known runtime misses.

- <a id="engine"></a> **engine** *(current)* — One scored media-framework implementation behind the `MediaEngine` interface. The browser platform reference instrument is not a scored engine. [src/core/engine.ts:196-240](../src/core/engine.ts#L196-L240) [src/core/registry.ts:63-70](../src/core/registry.ts#L63-L70)

- <a id="adapter"></a> **adapter** *(current boundary; stricter target contract)* — Repository code that translates a framework's native APIs and errors into `MediaEngine` inputs, normalized observations, capabilities, lifecycle, and NotApplicableError decisions. General obligations live in the [engine adapter contract](subsystems/engine-adapter-contract.md).

## Media formats and timing

- <a id="annex-b"></a> **Annex B** — H.264/H.265 elementary bytestream framing in which NAL units are delimited by start codes and parameter sets may be carried in-band. Write *Annex B* with a space, except inside a quoted title or code token.

- <a id="avcc"></a> **AVCC** — The common name for length-prefixed AVC NAL framing associated with an `AVCDecoderConfigurationRecord`, usually carried in the `avcC` box with SPS/PPS out of band. Qualify HEVC's analogous `hvcC` framing rather than calling every length-prefixed representation AVCC.

- <a id="iso-bmff"></a> **ISO BMFF** — ISO Base Media File Format, the box-based format defined by ISO/IEC 14496-12 and inherited by MP4 and related formats. Use *ISO BMFF* on first mention; retain `ISO-BMFF` only inside a quote, title, or code token.

- <a id="he-aacsbr"></a> **HE-AAC/SBR** — High-Efficiency AAC using Spectral Band Replication. A parser may expose the AAC core rate while a decoder exposes the reconstructed output rate, often 2×. The target metadata comparator accepts those views only when SBR signaling proves the relationship.

- <a id="parametric-stereo"></a> **Parametric Stereo** — The HE-AAC v2 tool that can represent a mono core plus stereo reconstruction parameters. Spell it out on first use. The target metadata comparator accepts a 1-channel core versus 2-channel output only when signaling proves Parametric Stereo.

- <a id="edit-list"></a> **edit list** — An ISO BMFF `edts/elst` presentation-timeline mapping that can offset, omit, or dwell media time. It can legitimately change apparent start and duration relative to raw sample spans.

- <a id="priming"></a> **priming** — Encoder/decoder delay and padding, especially for AAC, that can shift decoded sample counts or presentation duration without representing lost program content.

- <a id="timebase"></a> **timebase** — The unit or rational scale in which media timestamps are stored or reported. Conversion and rounding can create small legal timing differences.

- <a id="vfr"></a> **VFR** — Variable frame rate: successive frame durations or presentation intervals are not constant. Do not infer a strict single fps contract from one nominal or average field.

- <a id="cfr"></a> **CFR** — Constant frame rate: frame cadence is intended to be uniform, subject to rational-rate representation and timestamp rounding.

- <a id="ntsc-rate"></a> **NTSC rate** — A rational cadence such as `30000/1001` or `24000/1001`. Compare it around the rational value with a documented band rather than against a rounded integer.

- <a id="webcodecs"></a> **WebCodecs** — The browser API for low-level encoded chunks, raw audio/video frames, codecs, and codec-configuration queries. It does not provide general-purpose container demuxing or muxing, and support remains runtime- and configuration-dependent. The platform reference instrument uses it without becoming a scored engine.

## External authorities

- ISO/IEC JTC 1/SC 29, [ISO/IEC 14496-12:2026 — ISO base media file format](https://www.iso.org/standard/85596.html), accessed 2026-07-16 — ISO BMFF structure and timed-media terminology.
- W3C Media Working Group, [WebCodecs](https://www.w3.org/TR/webcodecs/), Working Draft 2026-07-08, accessed 2026-07-16 — codec interfaces, configuration-dependent support, timestamps, frames, and the absence of container APIs.
- W3C Media Working Group, [AVC (H.264) WebCodecs Registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/), accessed 2026-07-16 — Annex B and length-prefixed AVC framing, decoder configuration, access units, and key chunks.
- W3C Media Working Group, [AAC WebCodecs Registration](https://www.w3.org/TR/webcodecs-aac-codec-registration/), accessed 2026-07-16 — AAC-LC, HE-AAC v1/v2 codec identities and `AudioSpecificConfig` signaling.
- W3C Media Source Extensions Working Group, [ISO BMFF Byte Stream Format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/), accessed 2026-07-16 — initialization/media segments, codec configuration, and edit-list presentation mapping.
- ETSI, [TS 102 005 V1.2.1, Annex A — HE-AAC transport](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf), accessed 2026-07-16 — SBR core/output-rate and Parametric Stereo mono/stereo views.
- Apple, [Technical Note TN2162 — Uncompressed Y'CbCr Video in QuickTime Files](https://developer.apple.com/library/archive/technotes/tn2162/_index.html), accessed 2026-07-16 — rational NTSC cadence representation.
- Apple, [Using track structures to represent encoder delay explicitly](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly), accessed 2026-07-16 — AAC priming/remainder, edit lists, and movie/media timebase effects.
