# Golden Baking and Fixtures

> Scope: This page owns corpus identity, fixture acquisition and generation, golden artifact production and provenance, and missing or pending evidence; oracle interpretation, input rotation, and cell-status aggregation belong to their sibling subsystem pages.
> Phase-2 owner: p2_subsystem_golden_baking_fixtures.

## Purpose

The fixture pipeline turns source recipes and acquired media into a committed corpus plus [golden](../glossary.md) evidence. It must answer two different questions without confusing them: “Which exact bytes did this run exercise?” and “Which observations from those bytes may an [oracle](../glossary.md) use as an expectation?” Metadata and packet artifacts are ffprobe-derived representation anchors; frame digests and luma signatures are produced in a browser by the unscored platform instrument.

This page is the evidence contract for later code cleanup. It covers how evidence is made, named, loaded, invalidated, and routed to [NA_ASSET](../glossary.md) when unavailable. The comparison rules that turn evidence into [PASS](../glossary.md), target [DIFF](../glossary.md), or [FAIL](../glossary.md) belong primarily to the [oracle system](../subsystems/oracle-system.md).

## As-built

### Corpus manifest and media bytes

`fixtures/manifest.json` is the flat-corpus catalog. Its top-level prose `$schema` describes an `assets[]` collection and `suiteCorpusVersion`; each asset has a stable `id`, family, container/codecs, source class, size bucket, generation/acquisition prose, SHA-256, and byte size. This is a convention encoded in JSON rather than a machine-validated versioned schema. [fixtures/manifest.json:1-18](../../fixtures/manifest.json#L1-L18)

The source classes have materially different trust paths:

| Source class | Current path | Evidence |
| --- | --- | --- |
| `generated` | A recipe in `fixtures/bake.mjs` writes synthetic, derived, or mutated media, after which the bake records its digest and size. | [fixtures/bake.mjs:1809-1893](../../fixtures/bake.mjs#L1809-L1893) |
| `fetched` | The bake accepts a download only when its SHA-256 matches a pre-trusted manifest value; an unpinned or mismatched response is rejected. | [fixtures/bake.mjs:171-210](../../fixtures/bake.mjs#L171-L210) |
| `provided` | A human or optional external tool supplies bytes; a present file is reused and re-checksummed, while an absent file remains explicitly missing. | [fixtures/manifest.json:339-353](../../fixtures/manifest.json#L339-L353), [fixtures/bake.mjs:1827-1857](../../fixtures/bake.mjs#L1827-L1857) |
| `captured` | A browser capture is dropped into `fixtures/media/` and then checksummed by the bake. | [fixtures/manifest.json:512-525](../../fixtures/manifest.json#L512-L525), [fixtures/bake.mjs:1827-1832](../../fixtures/bake.mjs#L1827-L1832) |

The normal entry point is `scripts/bake-fixtures.sh`. It resolves the repository root, requires Bun plus native ffmpeg and ffprobe, then forwards all arguments to `fixtures/bake.mjs`; these native programs are deliberately outside the browser test loop. [scripts/bake-fixtures.sh:16-33](../../scripts/bake-fixtures.sh#L16-L33) The bake supports full, subset, forced, golden-only, media-only, and long-form-skipping modes. [fixtures/bake.mjs:26-34](../../fixtures/bake.mjs#L26-L34)

Generation uses common `+bitexact` codec/demux/mux flags and strips metadata, while comments explicitly qualify reproducibility as depending on the same ffmpeg build and on individual muxers honoring the flags. [fixtures/bake.mjs:60-70](../../fixtures/bake.mjs#L60-L70) Existing media is reused by existence alone unless `--force`; the bake then computes the current file's SHA-256 and size and overwrites those manifest fields. It does not compare a reused file to the previously committed digest before accepting the new identity. [fixtures/bake.mjs:1822-1832](../../fixtures/bake.mjs#L1822-L1832), [fixtures/bake.mjs:1889-1893](../../fixtures/bake.mjs#L1889-L1893)

Intentionally malformed robustness assets are different again: their byte identity remains in the manifest, but ffprobe failure is expected and metadata/packet/frame goldens are deliberately omitted. [fixtures/bake.mjs:1440-1480](../../fixtures/bake.mjs#L1440-L1480), [fixtures/bake.mjs:1902-1908](../../fixtures/bake.mjs#L1902-L1908)

### Flat golden derivation

For each present, non-exempt flat asset, the bake asks ffprobe for format and stream data, normalizes it, asks for packet rows, and optionally emits a frame placeholder. The artifacts are written independently in this order: `.meta.json`, `.packets.json`, then `.frames.json`; encryption keys and HLS segment lists are written as auxiliary JSON files later. [fixtures/bake.mjs:1912-1949](../../fixtures/bake.mjs#L1912-L1949), [fixtures/bake.mjs:1968-1990](../../fixtures/bake.mjs#L1968-L1990)

The current artifact families are:

| Suffix | Producer and representation | Runtime use |
| --- | --- | --- |
| `.meta.json` | ffprobe `-show_format -show_streams`, reduced to container, rounded duration, stream-order tracks, selected track fields, and selected tags. | Loaded as normalized metadata for metadata/layout comparisons. [fixtures/bake.mjs:1671-1711](../../fixtures/bake.mjs#L1671-L1711), [src/core/oracles.ts:71-75](../../src/core/oracles.ts#L71-L75) |
| `.packets.json` | ffprobe `-show_packets`, reduced to stream index, byte size, integer-microsecond PTS/DTS, and keyframe flag. | Loaded as the packet-table anchor. [fixtures/bake.mjs:1714-1731](../../fixtures/bake.mjs#L1714-L1731), [src/core/oracles.ts:76-80](../../src/core/oracles.ts#L76-L80) |
| `.frames.json` | ffprobe supplies a bounded list of video presentation timestamps and keyframe flags; SHA-256 fields begin as `null` with `pending: true`. | The browser pass fills normalized-RGBA digests; pending documents are not exposed as frame evidence. [fixtures/bake.mjs:1733-1772](../../fixtures/bake.mjs#L1733-L1772), [src/core/oracles.ts:81-97](../../src/core/oracles.ts#L81-L97) |
| `.ssim.json` | The browser pass downsamples each fully baked frame to a 16×16 Rec.601 luma signature. | Loaded independently as the perceptual comparison reference. [src/core/frame-bake.ts:513-527](../../src/core/frame-bake.ts#L513-L527), [src/core/oracles.ts:99-102](../../src/core/oracles.ts#L99-L102) |
| `.keys.json` | Encryption recipes expose key/KID/IV material to a side-channel and the bake serializes it. | Auxiliary evidence for decrypt scenarios, outside `GoldenStore`. [fixtures/bake.mjs:1482-1485](../../fixtures/bake.mjs#L1482-L1485), [fixtures/bake.mjs:1968-1975](../../fixtures/bake.mjs#L1968-L1975) |
| `.segments.json` | The bake sorts sibling HLS segment filenames and records the playlist/key relationship. | Auxiliary evidence for streaming scenarios, outside `GoldenStore`. [fixtures/bake.mjs:1978-1990](../../fixtures/bake.mjs#L1978-L1990) |

The metadata producer canonicalizes ffprobe `codec_name` values such as `h264`, `h265`, `hevc`, and AAC into the suite vocabulary, but it does not accept container sample-entry or Matroska codec-ID aliases such as `avc1`, `avc3`, `hvc1`, `hev1`, `mp4a`, or `V_MPEG4/ISO/AVC`. [fixtures/bake.mjs:1587-1614](../../fixtures/bake.mjs#L1587-L1614) It stores tracks in ffprobe stream order, one rounded scalar fps selected from `avg_frame_rate` or `r_frame_rate`, one sample rate/channel count, and one rounded format duration. [fixtures/bake.mjs:1640-1647](../../fixtures/bake.mjs#L1640-L1647), [fixtures/bake.mjs:1671-1705](../../fixtures/bake.mjs#L1671-L1705)

### Scenario-file golden derivation

`fixtures/bake-scenario-goldens.mjs` reads REAL and DERIVED rows from `fixtures/media/scenarios/_sources.ndjson` and writes nested goldens keyed by the scenario-relative asset id. The runtime therefore resolves `scenarios/<family>/<scenario>/<file>.<kind>.json` without a separate lookup table. [fixtures/bake-scenario-goldens.mjs:3-20](../../fixtures/bake-scenario-goldens.mjs#L3-L20), [fixtures/bake-scenario-goldens.mjs:280-303](../../fixtures/bake-scenario-goldens.mjs#L280-L303)

The script duplicates the flat producer's normalization functions rather than importing one implementation. Its own header requires changes to be mirrored manually. [fixtures/bake-scenario-goldens.mjs:18-20](../../fixtures/bake-scenario-goldens.mjs#L18-L20), [fixtures/bake-scenario-goldens.mjs:82-179](../../fixtures/bake-scenario-goldens.mjs#L82-L179) By default it writes metadata for every selected real/derived file and packet goldens only for the demux family; `--packets` broadens the latter. Existing files are skipped unless `--force`. Per-file ffprobe failures are collected and printed, but `main()` does not set a non-zero exit code from the failure count. [fixtures/bake-scenario-goldens.mjs:370-415](../../fixtures/bake-scenario-goldens.mjs#L370-L415)

In `--frames` mode it emits placeholders only for an allowlist of frame-consuming families unless an explicit family overrides the allowlist. [fixtures/bake-scenario-goldens.mjs:182-203](../../fixtures/bake-scenario-goldens.mjs#L182-L203) This producer reads up to 60 decode-order frames, resolves best-effort or PTS timestamps, sorts them into presentation order, and retains the first 12. The flat producer still asks ffprobe for only 12 frames directly, so the two paths do not share the scenario producer's B-frame/VFR refinement. [fixtures/bake-scenario-goldens.mjs:206-271](../../fixtures/bake-scenario-goldens.mjs#L206-L271), [fixtures/bake.mjs:1742-1752](../../fixtures/bake.mjs#L1742-L1752)

### Browser frame and luma bake

The browser pass exists because normalized RGBA includes the browser's decode, color conversion, and rasterization choices. `src/core/frame-bake.ts` constructs the unscored platform engine, decodes media using browser APIs, and returns JSON text; it has no filesystem write access. [src/core/frame-bake.ts:1-35](../../src/core/frame-bake.ts#L1-L35), [src/core/frame-bake.ts:603-663](../../src/core/frame-bake.ts#L603-L663) `scripts/frame-bake.mjs` launches Brave, Chromium, WebKit, or Firefox through Playwright, invokes the page control surface, validates every relative output path, and persists the returned files. [scripts/frame-bake.mjs:48-57](../../scripts/frame-bake.mjs#L48-L57), [scripts/frame-bake.mjs:123-157](../../scripts/frame-bake.mjs#L123-L157), [scripts/frame-bake.mjs:205-228](../../scripts/frame-bake.mjs#L205-L228)

For each placeholder, the browser pass requires at least one listed timestamp, checks media presence, decodes a bounded leading window, and matches each expected timestamp to one decoded frame within 1 ms. Unmatched entries retain a null digest. [src/core/frame-bake.ts:396-443](../../src/core/frame-bake.ts#L396-L443), [src/core/frame-bake.ts:446-493](../../src/core/frame-bake.ts#L446-L493) `pending` becomes false only when every listed frame is filled; `.ssim.json` is emitted only for that complete state. [src/core/frame-bake.ts:496-527](../../src/core/frame-bake.ts#L496-L527) The filesystem orchestrator removes an older `.ssim.json` after a partial or failed rebake so stale perceptual evidence cannot survive a pending frame document. [scripts/frame-bake.mjs:230-245](../../scripts/frame-bake.mjs#L230-L245)

Filled frame documents carry only a user-agent string and current timestamp as producer provenance. [src/core/frame-bake.ts:815-824](../../src/core/frame-bake.ts#L815-L824) If the frame sink has a digest but does not expose pixels, the producer substitutes a 1×1 transparent `ImageData`; its luma reduction becomes zeros, yet that frame still counts toward completion and can enter `.ssim.json`. [src/core/frame-bake.ts:562-590](../../src/core/frame-bake.ts#L562-L590), [src/core/frame-bake.ts:743-761](../../src/core/frame-bake.ts#L743-L761)

### Runtime evidence loading and availability

`loadGolden()` fetches metadata, packets, frames, and SSIM in parallel. It accepts bare values or several wrapper shapes; any non-OK response, network error, or JSON parse failure becomes an absent field. It performs shape checks sufficient to cast the value, but no schema-version, producer, input-digest, or artifact-digest validation. [src/core/oracles.ts:14-21](../../src/core/oracles.ts#L14-L21), [src/core/oracles.ts:52-115](../../src/core/oracles.ts#L52-L115)

Flat-asset preflight checks that the manifest entry exists and has non-null SHA-256/size, then uses HEAD or a one-byte range request to establish presence. It does not hash the served media or compare response length with `sizeBytes`. [src/core/runner.ts:492-545](../../src/core/runner.ts#L492-L545) Rotated scenario files bypass the flat manifest and become missing only on a definitive 404. [src/core/runner.ts:548-566](../../src/core/runner.ts#L548-L566)

Pending frame documents are deliberately hidden from frame oracles. The runner turns the absence of both frame digests and SSIM signatures into `NA_ASSET` before a `decodeFrames` operation. [src/core/oracles.ts:81-97](../../src/core/oracles.ts#L81-L97), [src/core/runner.ts:892-900](../../src/core/runner.ts#L892-L900), [src/core/runner.ts:1324-1329](../../src/core/runner.ts#L1324-L1329) Other missing-golden states are recognized later by matching human-readable substrings such as `golden absent`, `no golden meta`, or `frame-bake must run`; a real mismatch remains a failure if its text does not match that list. [src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889), [src/core/runner.ts:1423-1447](../../src/core/runner.ts#L1423-L1447)

The `ssim-psnr` path has two reference modes. With committed frame/luma evidence it pairs candidate and golden frames by index. Without such a golden, it neutrally decodes the source in-browser with the platform instrument, then still pairs source and candidate pixels by index. [src/core/oracles.ts:1756-1822](../../src/core/oracles.ts#L1756-L1822), [src/core/oracles.ts:1905-1959](../../src/core/oracles.ts#L1905-L1959) Failure to decode engine output is a clean FAIL rather than an exception. [src/core/oracles.ts:1776-1804](../../src/core/oracles.ts#L1776-L1804)

## Contracts and invariants

- **Asset identity is the manifest id plus committed bytes.** Recipes, scenarios, media URLs, and flat golden filenames use the exact asset id. When the manifest loads, runtime preflight rejects undeclared flat ids. [fixtures/manifest.json:5-18](../../fixtures/manifest.json#L5-L18), [src/core/runner.ts:514-523](../../src/core/runner.ts#L514-L523)
- **A fetched asset is admitted only under an existing trusted digest.** Unpinned trust-on-first-use and a mismatched download are rejected before the file is written. [fixtures/bake.mjs:171-210](../../fixtures/bake.mjs#L171-L210)
- **Metadata and packets come from an independent offline tool, not a scored engine.** The flat and scenario producers invoke ffprobe directly; the browser runner does not. [fixtures/bake.mjs:122-169](../../fixtures/bake.mjs#L122-L169), [fixtures/bake-scenario-goldens.mjs:68-79](../../fixtures/bake-scenario-goldens.mjs#L68-L79)
- **Frame goldens come from an unscored browser instrument.** Only the platform engine and image/browser APIs produce the normalized-RGBA digest and luma signature; the browser page returns writes for the orchestrator. [src/core/frame-bake.ts:1-35](../../src/core/frame-bake.ts#L1-L35), [src/core/frame-bake.ts:603-653](../../src/core/frame-bake.ts#L603-L653)
- **A partial frame bake is not admissible evidence.** Every listed digest is required before `pending` is cleared, and SSIM is omitted for incomplete documents. [src/core/frame-bake.ts:496-527](../../src/core/frame-bake.ts#L496-L527)
- **Missing evidence is not an engine defect.** Absent media or the complete absence of an oracle's required evidence routes the cell to `NA_ASSET`; an oracle with surviving valid evidence may still determine the cell. [src/core/runner.ts:1310-1329](../../src/core/runner.ts#L1310-L1329), [src/core/runner.ts:1423-1447](../../src/core/runner.ts#L1423-L1447)
- **Intentionally malformed media keeps byte provenance but has no fabricated ffprobe truth.** Those assets are checksummed while their metadata/packet/frame derivation is skipped. [fixtures/bake.mjs:1440-1480](../../fixtures/bake.mjs#L1440-L1480), [fixtures/bake.mjs:1902-1908](../../fixtures/bake.mjs#L1902-L1908)
- **Bake errors are distinct from expected absence.** The flat bake exits non-zero for recorded hard errors; skipped and missing provided/captured assets are reported but do not fail the process. [fixtures/bake.mjs:1960-1965](../../fixtures/bake.mjs#L1960-L1965), [fixtures/bake.mjs:2021-2065](../../fixtures/bake.mjs#L2021-L2065)
- **A golden is an evidence snapshot, not universal semantic truth.** The current metadata/packet artifacts capture ffprobe's normalized representation, while current oracles often treat their differences as boolean failures. [fixtures/bake.mjs:1671-1731](../../fixtures/bake.mjs#L1671-L1731), [src/core/scenario.ts:213-221](../../src/core/scenario.ts#L213-L221)

## Target design and known gaps

### Target design

#### Versioned, attributable evidence

Every media and golden publication should have a machine-validated schema and a provenance record. At minimum, the record should include artifact kind/schema version, asset id, source-media SHA-256, recipe and normalized-argument digest, resolved dependency digests, baker identity and exact versions, platform/environment parameters, start/end time, and output artifact digest. That follows the SLSA provenance division between build definition, resolved dependencies, builder/run details, and digest-addressed subjects. [SLSA Build Provenance v1.2](https://slsa.dev/spec/v1.2/build-provenance)

Tool and environment versions must be pinned or recorded, not inferred from PATH: ffmpeg, ffprobe, Bun, optional Bento4/Shaka, Playwright, browser build, operating system/architecture, locale, timezone, and relevant environment variables. Reproducible Builds explicitly scopes reproducibility to a recorded environment and calls for a tool/version inventory. [Reproducible Builds, “What's in a build environment?”](https://reproducible-builds.org/docs/perimeter/) FFmpeg's bitexact mode remains useful because its documented purpose is platform/build/time-independent regression output, but it is one control within that full perimeter, not a substitute for recording it. [FFmpeg documentation, `bitexact`](https://ffmpeg.org/ffmpeg-all.html#Format-Options)

Acceptance criteria:

1. JSON Schema validation rejects unknown major schema versions and malformed required fields before publication and before runtime use.
2. A clean rebake in the declared environment produces the same media and ffprobe-derived golden digests, except artifacts explicitly declared browser-qualified.
3. Every runtime-loaded artifact can be traced to the exact source digest and baker configuration that produced it.
4. Random fixture material is deterministic under a committed seed; encryption secrets and IVs never depend on wall-clock time or unrecorded randomness.

#### Transactional publication and integrity checks

A bake should stage one immutable generation, validate every artifact and cross-reference, compute all output digests, synchronize staged files, and publish a small generation index last. Runtime should accept only files named by that index whose digest and source-media digest match. Node exposes both file synchronization and rename primitives needed to implement the per-file durability/publication steps. [Node.js file system API, `filehandle.sync()`](https://nodejs.org/api/fs.html#filehandlesync), [Node.js file system API, `fsPromises.rename()`](https://nodejs.org/api/fs.html#fspromisesrenameoldpath-newpath)

Acceptance criteria:

1. Fault injection after every write yields either the complete previous generation or the complete new generation; no loader can observe mixed metadata, packets, frames, SSIM, keys, manifest, or segment index.
2. The bake fails if any selected source is unexpectedly missing, any producer fails, a frame-complete document has a null digest, an SSIM signature lacks real pixels, or an output digest differs from its index.
3. Expected absent/provided/captured and intentionally malformed states are explicit typed records with reason codes, not successful zero-exit omissions.
4. Runtime hashes media and evidence at least once per cache lifetime; a digest mismatch quarantines the evidence as `NA_ASSET` and never grades an engine against stale truth.

#### One canonical normalization library

Flat and nested producers should import one versioned normalization module and emit both raw observations and canonical semantic fields. The current [reference re-import](../glossary.md) path already calls a canonicalizer that maps `avc1`/`avc3` to `h264`, `hev1`/`hvc1` to `hevc`, `mp4a` to `aac`, and `V_MPEG4/ISO/AVC` to `h264`; the current `golden-metadata` comparison only lowercases strings and compares positional tracks. [src/core/box-readers.ts:46-106](../../src/core/box-readers.ts#L46-L106), [src/core/oracles.ts:341-375](../../src/core/oracles.ts#L341-L375), [src/core/oracles.ts:768-811](../../src/core/oracles.ts#L768-L811)

Those mappings are semantic, not project aliases invented for convenience: the WebCodecs registry groups `avc1.*` and `avc3.*` under AVC/H.264, `hev1.*` and `hvc1.*` under HEVC/H.265, and `mp4a.*` under AAC; Matroska identifies `V_MPEG4/ISO/AVC` as AVC/H.264. [W3C WebCodecs Codec Registry, audio/video tables](https://www.w3.org/TR/webcodecs-codec-registry/#audio-codec-registry), [Matroska Codec Mappings, `V_MPEG4/ISO/AVC`](https://www.matroska.org/technical/codec_specs.html#v_mpeg4isoavc)

The target [golden metadata](../glossary.md) contract is:

- retain `codecRaw` while canonicalizing all listed aliases to `h264`, `hevc`, or `aac`;
- match tracks by semantic type (and stable per-type ordinal only when more than one track of a type exists), never by absolute stream index;
- preserve exact rational rates and timestamp-derived cadence evidence rather than only a three-decimal scalar fps, then band [VFR](../glossary.md) and [NTSC rate](../glossary.md) comparisons;
- preserve coded/core and presentation/output views for [HE-AAC/SBR](../glossary.md) and [Parametric Stereo](../glossary.md), treating AAC-core versus 2× SBR output sample rate and one-channel core versus two-channel reconstructed output as semantically equal; the AAC registration identifies HE-AAC v1 as AAC-LC+SBR and HE-AAC v2 as AAC-LC+SBR+PS, while ETSI describes mono-to-stereo PS reconstruction and the SBR 2× output-rate relationship. [W3C AAC WebCodecs Registration, codec strings](https://www.w3.org/TR/webcodecs-aac-codec-registration/#fully-qualified-codec-strings), [ETSI TS 102 005 V1.2.1, Annex A.4.1](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf)
- preserve presentation duration, raw media/sample span, [timebase](../glossary.md), [edit list](../glossary.md), and audio [priming](../glossary.md) observations so the comparator can widen duration only for a documented cause. [ISO BMFF](../glossary.md) edit lists map media composition time to presentation time, and AAC priming/remainder samples can make packet duration longer than source program duration. [W3C ISO BMFF Byte Stream Format, initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments), [Apple QuickTime File Format, “AAC encoding background”](https://developer.apple.com/documentation/quicktime-file-format/background_aac_encoding)

Completion is proven by alias-order, HE-AAC v1/v2, VFR, 30000/1001, edit-list, primed-AAC, and multi-track fixtures for both flat and nested bake paths. Each pair must produce the same canonical document and a semantically equivalent comparison outcome independent of original stream order.

#### Separate packet semantics from baker representation

The target [golden packets](../glossary.md) document should explicitly label its framing/configuration location and separate semantic access-unit observations from optional representation fingerprints. Exact byte size, parameter-set placement, keyframe flag placement, and NAL grouping remain useful diagnostics, but they cannot alone define validity across [Annex B](../glossary.md) and [AVCC](../glossary.md). The AVC WebCodecs registration defines both length-prefixed `avc` and Annex B forms, places configuration in `description` for the former, and requires parameter sets in Annex B key chunks; ISO BMFF guidance likewise calls for support of both in-band and out-of-band SPS/PPS. [W3C AVC WebCodecs Registration, encoded data and configuration](https://www.w3.org/TR/webcodecs-avc-codec-registration/#encodedvideochunk-data), [W3C ISO BMFF Byte Stream Format, initialization segments](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments)

The bake should therefore record framing, decoder configuration, access-unit timestamps/durations, random-access semantics, and decodability. The oracle should classify legal size/grouping/config-placement differences as DIFF, while missing/duplicated content, invalid timing beyond tolerance, failed random access, or undecodable output remains FAIL. The full comparator design is owned by the [oracle system](../subsystems/oracle-system.md).

Completion is proven with the same H.264 content represented as AVCC/`avc1`, in-band `avc3`, and Annex B, including legal SPS/PPS placement and NAL grouping differences. All must preserve the semantic sample timeline; representation fingerprints may differ and report DIFF, but no legal form may become FAIL solely from packet byte size or grouping.

#### Browser evidence must require real pixels and timestamp identity

Frame evidence should remain browser-qualified because [WebCodecs](../glossary.md) exposes presentation timestamps in microseconds while the final RGBA pixels also depend on browser decode and image-processing behavior. [W3C WebCodecs, `VideoFrame`](https://www.w3.org/TR/webcodecs/#videoframe-interface) A frame publication must include source digest, browser executable/build, OS/architecture, decoder configuration, coded/display dimensions, color space, crop/rotation handling, expected and observed PTS, and the pixel-normalization version.

No luma signature may be generated without real source pixels. Missing `getPixels`, decode failure, a timestamp miss, or a zero-frame placeholder stays pending and routes to `NA_ASSET`; a 1×1 transparent substitute is forbidden. Flat and scenario placeholder generation must use the same presentation-order algorithm.

The neutral in-browser [reference decode](../glossary.md) used by `ssim-psnr` is fair by construction because it is independent of the scored engine. Its target pairing key is timestamp within an explicit tolerance, not array index; fps or frame-count changes must not compare unrelated frames. A valid output that the neutral decoder cannot decode remains a distinct “reference unavailable/output undecodable” observation for the oracle policy, not fabricated pixel evidence. The [oracle-system page](../subsystems/oracle-system.md) owns the resulting verdict rule.

Completion is proven by B-frame, VFR, frame-rate-changing, frame-dropping, and browser-no-pixel tests. Each expected PTS maps to at most one actual frame; a missing pixel or decode produces pending/NA evidence; and no committed SSIM array contains the all-zero signature created by a placeholder image.

#### Three-way verdict boundary

Goldens remain anchors after the oracle model becomes PASS/DIFF/FAIL. The bake must expose enough raw and canonical fields for the oracle to distinguish semantic equality from representation equality; it must not pre-collapse the two. Current `OracleOutcome.pass` is boolean and `ResultStatus` has no DIFF. [src/core/scenario.ts:206-221](../../src/core/scenario.ts#L206-L221)

Acceptance requires one conformance test for each class: exact/canonical equality → PASS; valid alternative codec tag, framing, packet grouping, or timing representation → DIFF; corrupt, content-losing, timing-invalid, or undecodable media → FAIL. No golden producer may encode “different from this ffmpeg build” as proof of wrongness.

### Known gaps

#### 1. Manifest and goldens have no enforceable schema or complete provenance

- **Current:** The manifest's `$schema` is prose, metadata/packet artifacts have no envelope, and `loadGolden()` accepts broad shapes without a schema version. Browser frame provenance is only user agent plus wall-clock timestamp. [fixtures/manifest.json:1-4](../../fixtures/manifest.json#L1-L4), [src/core/oracles.ts:14-21](../../src/core/oracles.ts#L14-L21), [src/core/frame-bake.ts:815-824](../../src/core/frame-bake.ts#L815-L824)
- **Consequence:** A stale or hand-edited artifact can be parseable yet impossible to reproduce or attribute; incompatible schema changes can silently cast into runtime types.
- **Target:** Adopt the versioned provenance envelope and dependency/output digests described above, following SLSA's build-definition/run-details/subject model. [SLSA Build Provenance v1.2](https://slsa.dev/spec/v1.2/build-provenance)
- **Verification:** Schema tests reject malformed and unknown-major documents; an audit command resolves every committed artifact to source digest, recipe, baker version, and output digest.

#### 2. Publication is non-transactional and failure signaling is inconsistent

- **Current:** Flat metadata, packets, frames, manifest, keys, and segments use independent direct writes. The scenario bake also writes files directly and prints counted ffprobe failures without setting a failing exit status. [fixtures/bake.mjs:1775-1777](../../fixtures/bake.mjs#L1775-L1777), [fixtures/bake.mjs:1912-1958](../../fixtures/bake.mjs#L1912-L1958), [fixtures/bake-scenario-goldens.mjs:274-277](../../fixtures/bake-scenario-goldens.mjs#L274-L277), [fixtures/bake-scenario-goldens.mjs:370-415](../../fixtures/bake-scenario-goldens.mjs#L370-L415)
- **Consequence:** Interruption can leave a mixed generation that still looks present, and automation can accept an incomplete scenario bake as success.
- **Target:** Stage, validate, digest, synchronize, and publish a generation index last; any unexpected selected failure makes the process non-zero. Node provides explicit sync and rename operations for the publication implementation. [Node.js file system API](https://nodejs.org/api/fs.html)
- **Verification:** Kill-point tests never expose a mixed generation, and an injected ffprobe/write/schema failure makes both bake entry points exit non-zero without changing the active index.

#### 3. Reuse can silently redefine corpus identity

- **Current:** A pre-existing path is reused without comparison to the committed SHA-256, then the manifest is refreshed from whatever bytes are present. Runtime checks only non-null digest/size and HTTP presence. [fixtures/bake.mjs:1827-1832](../../fixtures/bake.mjs#L1827-L1832), [fixtures/bake.mjs:1889-1893](../../fixtures/bake.mjs#L1889-L1893), [src/core/runner.ts:514-545](../../src/core/runner.ts#L514-L545)
- **Consequence:** Local contamination or a changed provided/captured file can redefine the corpus and leave old goldens attached to new media.
- **Target:** Reuse only after source digest and size match the active generation; an intentional replacement requires an explicit update command that invalidates and rebakes every dependent artifact. This is the same digest-addressed subject principle used by SLSA provenance. [SLSA Build Provenance v1.2](https://slsa.dev/spec/v1.2/build-provenance)
- **Verification:** Replacing one byte causes reuse to fail and runtime to quarantine the asset; an explicit update produces a new generation with no old dependent golden.

#### 4. The claimed deterministic perimeter is incomplete

- **Current:** The bake uses bitexact flags but discovers tools from PATH without recording versions. HLS AES-128 keys and IVs use browser crypto or a Date/`Math.random()` fallback. [fixtures/bake.mjs:60-70](../../fixtures/bake.mjs#L60-L70), [fixtures/bake.mjs:122-138](../../fixtures/bake.mjs#L122-L138), [fixtures/bake.mjs:681-712](../../fixtures/bake.mjs#L681-L712), [fixtures/bake.mjs:1493-1505](../../fixtures/bake.mjs#L1493-L1505)
- **Consequence:** Two nominally identical bakes can emit different media, keys, and downstream goldens with no recorded explanation.
- **Target:** Pin/record the full tool and environment perimeter and use committed deterministic seeds for fixture cryptographic material. Reproducible Builds requires the tools, versions, and relevant environment to be described. [Reproducible Builds, build environment perimeter](https://reproducible-builds.org/docs/perimeter/)
- **Verification:** Two isolated clean bakes under the declared environment match all non-browser-qualified digests, including encrypted assets and sidecars.

#### 5. Flat and scenario normalization can drift

- **Current:** Scenario normalization is copied from the flat bake and must be updated manually. Its frame placeholder logic has presentation-order refinements absent from the flat producer. [fixtures/bake-scenario-goldens.mjs:18-20](../../fixtures/bake-scenario-goldens.mjs#L18-L20), [fixtures/bake-scenario-goldens.mjs:206-271](../../fixtures/bake-scenario-goldens.mjs#L206-L271), [fixtures/bake.mjs:1742-1752](../../fixtures/bake.mjs#L1742-L1752)
- **Consequence:** The same bytes can produce different canonical documents or frame selections depending on corpus location.
- **Target:** Import one normalization and placeholder module from both entry points, with fixture-location-independent golden ids and presentation-order selection.
- **Verification:** Property tests run identical probe JSON through both entry points and require byte-identical normalized output and frame timestamp lists.

#### 6. Golden metadata collapses valid representations into current FAIL

- **Current:** The producer reduces codec/rate/channel/timing views to scalar fields, and `golden-metadata` matches tracks positionally with lowercased exact codec/sample-rate/channel comparisons. The separate reference-reimport path already canonicalizes recognized codec aliases. [fixtures/bake.mjs:1587-1614](../../fixtures/bake.mjs#L1587-L1614), [fixtures/bake.mjs:1640-1705](../../fixtures/bake.mjs#L1640-L1705), [src/core/oracles.ts:768-811](../../src/core/oracles.ts#L768-L811), [src/core/box-readers.ts:46-106](../../src/core/box-readers.ts#L46-L106)
- **Consequence:** Alias-only codecs, reordered tracks, HE-AAC/SBR core/output views, Parametric Stereo core/output channels, VFR/NTSC cadence, and edit-list/priming/timebase duration views can become indistinguishable from genuinely wrong metadata.
- **Target:** Emit raw plus canonical/multi-view evidence and apply the semantic matching/banding rules above; representation-only differences become DIFF. The external codec, HE-AAC, and ISO BMFF authorities establish why those views can be equivalent. [W3C WebCodecs Codec Registry](https://www.w3.org/TR/webcodecs-codec-registry/), [ETSI TS 102 005 V1.2.1](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf), [Apple AAC encoding background](https://developer.apple.com/documentation/quicktime-file-format/background_aac_encoding)
- **Verification:** The canonical-equivalence corpus enumerated in Target design passes semantically, reports DIFF only when representation differs, and still fails wrong codec/type/rate/channel/timeline observations.

#### 7. Golden packet rows overfit ffprobe's byte representation

- **Current:** The producer stores exact packet size/keyframe rows, and the shared comparator counts any size or keyframe mismatch as failure after per-track sorting. [fixtures/bake.mjs:1714-1731](../../fixtures/bake.mjs#L1714-L1731), [src/core/oracles.ts:835-924](../../src/core/oracles.ts#L835-L924)
- **Consequence:** Annex B versus AVCC, inline SPS/PPS, and legal NAL grouping can change sizes and boundaries without changing decodable pictures or sample timing.
- **Target:** Store framing/config placement and separate semantic access-unit checks from representation fingerprints; legal representation differences are DIFF, not FAIL. The AVC registration explicitly permits the two packaging/configuration forms. [W3C AVC WebCodecs Registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/)
- **Verification:** Equivalent AVCC, in-band, and Annex B fixtures retain semantic timeline/decode PASS while producing a representation DIFF; dropped NAL units or broken random access remain FAIL.

#### 8. Browser SSIM can be fabricated from missing pixels

- **Current:** When a decoded frame has no pixel accessor or pixel retrieval fails, frame baking substitutes transparent 1×1 pixels and can still publish a complete all-zero luma signature. [src/core/frame-bake.ts:562-590](../../src/core/frame-bake.ts#L562-L590), [src/core/frame-bake.ts:743-761](../../src/core/frame-bake.ts#L743-L761)
- **Consequence:** A parseable `.ssim.json` can describe a fallback image rather than the decoded frame, causing false failures against faithful candidates.
- **Target:** Require real pixel provenance for every signature; otherwise keep the document pending and route it to `NA_ASSET`. Record browser and decode configuration because WebCodecs output frames are browser-produced resources with presentation timestamps. [W3C WebCodecs](https://www.w3.org/TR/webcodecs/)
- **Verification:** A test frame sink with digests but no `getPixels` produces no SSIM file, remains pending, and never yields an all-zero committed signature.

#### 9. Missing, malformed, and stale evidence are inferred from strings

- **Current:** `loadGolden()` maps HTTP, network, and parse failures alike to undefined; the runner recognizes evidence gaps through human-readable detail substrings. [src/core/oracles.ts:108-115](../../src/core/oracles.ts#L108-L115), [src/core/runner.ts:858-900](../../src/core/runner.ts#L858-L900)
- **Consequence:** A server error, corrupt JSON, genuinely absent artifact, and intentionally pending bake become observationally similar; wording changes can alter status routing.
- **Target:** Return a typed evidence state per kind: `ready`, `absent-expected`, `pending`, `digest-mismatch`, `schema-invalid`, `transport-error`, or `producer-failed`, each with provenance. Only evidence-unavailable states route to `NA_ASSET`; transport/harness failures remain [ERROR](../glossary.md), and no candidate is graded against invalid evidence.
- **Verification:** Table-driven loader/runner tests assert the exact state and cell status for 404, 500, parse error, schema error, digest mismatch, pending frame, and valid evidence without inspecting detail text.

#### 10. Neutral source-reference frames are paired by index

- **Current:** `ssim-psnr` decodes source media through the unscored platform instrument, which is fair by design, but compares the first candidate and source frames at equal array indices. Output decode failure is immediately FAIL. [src/core/oracles.ts:1905-1959](../../src/core/oracles.ts#L1905-L1959), [src/core/oracles.ts:1776-1804](../../src/core/oracles.ts#L1776-L1804)
- **Consequence:** A valid fps or frame-count change can compare unrelated presentation times and false-fail. A valid-but-platform-undecodable output cannot be distinguished from semantically corrupt output by this evidence path alone.
- **Target:** Pair reference and candidate frames by transformed presentation timestamp with explicit unmatched-frame policy, and report decoder availability separately from media validity. WebCodecs defines frame timestamps as presentation timestamps in microseconds. [W3C WebCodecs, `VideoFrame`](https://www.w3.org/TR/webcodecs/#videoframe-interface)
- **Verification:** Rate-changing and frame-dropping fixtures compare intended temporal neighbors, while a deliberately undecodable-to-platform but independently valid output produces the oracle-system's explicit reference-unavailable classification rather than an unrelated pixel mismatch.

## Sources

### Repository evidence

- [fixtures/manifest.json:1-18](../../fixtures/manifest.json#L1-L18) — current corpus catalog convention and representative generated asset.
- [fixtures/manifest.json:339-353](../../fixtures/manifest.json#L339-L353) — representative provided asset contract.
- [fixtures/manifest.json:512-525](../../fixtures/manifest.json#L512-L525) — browser-captured source contract.
- [scripts/bake-fixtures.sh:16-33](../../scripts/bake-fixtures.sh#L16-L33) — offline bake entry point and tool preflight.
- [fixtures/bake.mjs:60-70](../../fixtures/bake.mjs#L60-L70) — current determinism controls and same-build qualification.
- [fixtures/bake.mjs:122-210](../../fixtures/bake.mjs#L122-L210) — tool discovery, ffmpeg/ffprobe execution, and pinned fetch.
- [fixtures/bake.mjs:681-712](../../fixtures/bake.mjs#L681-L712) — HLS AES-128 random key/IV recipe.
- [fixtures/bake.mjs:1440-1505](../../fixtures/bake.mjs#L1440-L1505) — intentionally malformed golden exclusions and randomness helpers.
- [fixtures/bake.mjs:1587-1777](../../fixtures/bake.mjs#L1587-L1777) — flat metadata, packet, and frame-placeholder production.
- [fixtures/bake.mjs:1809-1990](../../fixtures/bake.mjs#L1809-L1990) — reuse, hashing, independent writes, manifest publication, keys, and segments.
- [fixtures/bake.mjs:2021-2065](../../fixtures/bake.mjs#L2021-L2065) — missing-asset reporting and intended NA policy.
- [fixtures/bake-scenario-goldens.mjs:3-39](../../fixtures/bake-scenario-goldens.mjs#L3-L39) — nested scenario-golden purpose, path mapping, and browser-frame split.
- [fixtures/bake-scenario-goldens.mjs:82-179](../../fixtures/bake-scenario-goldens.mjs#L82-L179) — duplicated normalization implementation.
- [fixtures/bake-scenario-goldens.mjs:182-271](../../fixtures/bake-scenario-goldens.mjs#L182-L271) — family allowlist and presentation-order frame placeholders.
- [fixtures/bake-scenario-goldens.mjs:305-415](../../fixtures/bake-scenario-goldens.mjs#L305-L415) — nested bake skip/failure/write behavior.
- [scripts/frame-bake.mjs:123-260](../../scripts/frame-bake.mjs#L123-L260) — Playwright orchestration, filesystem writes, and stale-SSIM pruning.
- [src/core/frame-bake.ts:53-171](../../src/core/frame-bake.ts#L53-L171) — browser frame/SSIM document shapes and statuses.
- [src/core/frame-bake.ts:368-537](../../src/core/frame-bake.ts#L368-L537) — timestamp matching, completeness, and pending policy.
- [src/core/frame-bake.ts:545-590](../../src/core/frame-bake.ts#L545-L590) — platform decode and transparent fallback pixels.
- [src/core/frame-bake.ts:603-663](../../src/core/frame-bake.ts#L603-L663) — browser report and write-map production.
- [src/core/frame-bake.ts:735-824](../../src/core/frame-bake.ts#L735-L824) — luma reduction and limited provenance stamp.
- [src/core/oracles.ts:14-115](../../src/core/oracles.ts#L14-L115) — runtime golden shapes, loading, and absent/pending handling.
- [src/core/oracles.ts:719-924](../../src/core/oracles.ts#L719-L924) — current metadata and packet comparators.
- [src/core/oracles.ts:1756-1959](../../src/core/oracles.ts#L1756-L1959) — committed and neutral-reference SSIM paths.
- [src/core/box-readers.ts:46-106](../../src/core/box-readers.ts#L46-L106) — existing codec alias canonicalization used by reference re-import.
- [src/core/runner.ts:492-566](../../src/core/runner.ts#L492-L566) — manifest/presence preflight and rotated-file exception.
- [src/core/runner.ts:858-900](../../src/core/runner.ts#L858-L900) — string-based golden-gap classification.
- [src/core/runner.ts:1296-1447](../../src/core/runner.ts#L1296-L1447) — NA_ASSET preflight, golden loading, and survivor-oracle aggregation.
- [src/core/scenario.ts:206-221](../../src/core/scenario.ts#L206-L221) — current result statuses and boolean oracle outcome.

### External authorities

- FFmpeg Project, [“ffprobe Documentation — Main options”](https://ffmpeg.org/ffprobe.html#Main-options), accessed 2026-07-16 — defines machine-readable format/stream/packet/frame inspection used by the offline producers.
- FFmpeg Project, [“ffmpeg Documentation — Format options (`bitexact`)”](https://ffmpeg.org/ffmpeg-all.html#Format-Options), accessed 2026-07-16 — documents bitexact output as a regression-reproducibility control.
- W3C Media Working Group, [“WebCodecs”](https://www.w3.org/TR/webcodecs/), accessed 2026-07-16 — defines browser frame resources and microsecond presentation timestamps.
- W3C Media Working Group, [“WebCodecs Codec Registry”](https://www.w3.org/TR/webcodecs-codec-registry/), accessed 2026-07-16 — maps `mp4a.*`, `avc1.*`/`avc3.*`, and `hev1.*`/`hvc1.*` to AAC, AVC/H.264, and HEVC/H.265.
- W3C Media Working Group, [“AVC (H.264) WebCodecs Registration”](https://www.w3.org/TR/webcodecs-avc-codec-registration/), accessed 2026-07-16 — distinguishes Annex B from length-prefixed AVC and locates SPS/PPS in-band versus decoder configuration.
- W3C Media Working Group, [“HEVC (H.265) WebCodecs Registration”](https://www.w3.org/TR/webcodecs-hevc-codec-registration/), accessed 2026-07-16 — identifies `hev1`/`hvc1` HEVC strings and corresponding HEVC and Annex B configuration forms.
- W3C Media Working Group, [“AAC WebCodecs Registration”](https://www.w3.org/TR/webcodecs-aac-codec-registration/), accessed 2026-07-16 — identifies AAC-LC, HE-AAC v1/SBR, and HE-AAC v2/SBR+PS codec strings.
- W3C, [“ISO BMFF Byte Stream Format — Initialization Segments”](https://www.w3.org/TR/mse-byte-stream-format-isobmff/#initialization-segments), accessed 2026-07-16 — requires edit-list timeline mapping and supports in-band/out-of-band codec configuration.
- Matroska Project, [“Codec Mappings — `V_MPEG4/ISO/AVC`”](https://www.matroska.org/technical/codec_specs.html#v_mpeg4isoavc), accessed 2026-07-16 — identifies the Matroska codec id as AVC/H.264.
- ETSI/EBU, [“ETSI TS 102 005 V1.2.1 — Annex A.4.1, MPEG-4 High Efficiency AAC v2”](https://www.etsi.org/deliver/etsi_TS/102000_102099/102005/01.02.01_60/ts_102005v010201p.pdf), accessed 2026-07-16 — describes Parametric Stereo mono-core/stereo-output reconstruction and the SBR core/output sampling-rate relationship.
- Apple, [“QuickTime File Format — AAC encoding background”](https://developer.apple.com/documentation/quicktime-file-format/background_aac_encoding), accessed 2026-07-16 — explains AAC priming and remainder samples and their relationship to packet and source duration.
- ISO, [“ISO/IEC TR 14496-24:2025 — Audio and systems interaction”](https://www.iso.org/standard/79105.html), accessed 2026-07-16 — describes encoding/decoding offsets and HE-AAC system interactions that affect finite-length presentation.
- Reproducible Builds project, [“What's in a build environment?”](https://reproducible-builds.org/docs/perimeter/), accessed 2026-07-16 — requires the tool, version, OS, and environment perimeter to be recorded for reproducibility.
- SLSA, [“Build: Provenance v1.2”](https://slsa.dev/spec/v1.2/build-provenance), accessed 2026-07-16 — defines digest-addressed subjects, build inputs/dependencies, and builder/run metadata for attributable artifacts.
- Node.js Project, [“File system API”](https://nodejs.org/api/fs.html), accessed 2026-07-16 — provides synchronization and rename primitives for staged publication.
