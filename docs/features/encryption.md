# Encryption

> Scope: This page owns the encryption-family scenarios and their observable decrypt, rejection, robustness, and performance contracts; adapter internals, fixture production, media selection, and shared oracle mechanics are linked boundaries.
> Phase-2 owner: p2_feature_encryption.

## Purpose

The encryption family asks whether an [engine](../glossary.md#engine) can turn a protected media input into clear, usable media with the supplied test key, preserve the presentation, reject malformed or unsupported protection safely, and report performance only after correctness is established. Its 15 registered [scenarios](../glossary.md#scenario) cover ISO Common Encryption (CENC), HLS encryption, metamorphic equality, negative capability findings, malformed inputs, and decrypt throughput.

This is the feature-level specification for scenario authors, adapter implementers, fixture bakers, and oracle maintainers. Detailed mechanics belong to [runner and capability negotiation](../subsystems/runner-capability-negotiation.md), the [oracle system](../subsystems/oracle-system.md), [media selection](../subsystems/media-selection.md), [golden baking and fixtures](../subsystems/golden-baking-fixtures.md), the [engine-adapter contract](../subsystems/engine-adapter-contract.md), and the six [engine pages](../engines/aibrush-media.md).

## As-built

### Registration and execution path

The family entry point builds five positive rows and concatenates the metamorphic, robustness, performance, and capability-finding arrays into one synchronous export. The global scenario module places that export under the `encryption` family, flattens all families, rejects duplicate ids, and registers the result. [src/scenarios/encryption/index.ts:148-158](../../src/scenarios/encryption/index.ts#L148-L158) [src/scenarios/index.ts:33-71](../../src/scenarios/index.ts#L33-L71)

The shared positive builder creates `decrypt` scenarios with a scheme and raw key in `options`, requires the decrypt operation plus input container, encryption scheme, codecs, and optional feature tokens, and defaults to four metrics and three oracles. [src/scenarios/encryption/_shared.ts:145-172](../../src/scenarios/encryption/_shared.ts#L145-L172) The engine boundary accepts a `DecryptKey` containing `keyHex` and optional KID/IV, and returns `MediaBytes`; `decrypt` itself is optional, so declared capabilities decide whether the runner calls it. [src/core/engine.ts:181-185](../../src/core/engine.ts#L181-L185) [src/core/engine.ts:196-236](../../src/core/engine.ts#L196-L236)

Before execution, the runner independently intersects every required operation, container, codec, encryption scheme, and feature with the adapter's flat [capability tokens](../glossary.md#capability-token). It then applies the browser codec gate unless the adapter declares `webcodecs:independent`. [src/core/runner.ts:113-202](../../src/core/runner.ts#L113-L202) A runtime `NotApplicableError` maps to `NA_ENGINE`; another thrown error in the functional path escapes to the outer catch and maps to `ERROR`. [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393) [src/core/runner.ts:1464-1468](../../src/core/runner.ts#L1464-L1468)

### Positive clear-output scenarios

The positive rows all require H.264 and AAC input. Unless overridden below, the builder attaches `decrypt-bitexact`, `reference-reimport`, and `playback-smoke`, plus `wall`, `throughputRealtime`, `peakMemory`, and `longtasks`. [src/scenarios/encryption/_shared.ts:36-37](../../src/scenarios/encryption/_shared.ts#L36-L37) [src/scenarios/encryption/_shared.ts:145-168](../../src/scenarios/encryption/_shared.ts#L145-L168)

| Scenario | Protected input and required path | Current oracle set | Current intent and limitation |
| --- | --- | --- | --- |
| `encryption/cenc_ctr_decrypt` | `cenc_ctr.mp4`; MP4; `cenc-ctr`; key/KID row `cenc_ctr`; clear baseline `cenc_ctr_clear.mp4`; additionally requires `webcrypto:cenc-ctr-clear-output` | default three | Full-sample AES-CTR clear-output path. [src/scenarios/encryption/index.ts:58-76](../../src/scenarios/encryption/index.ts#L58-L76) |
| `encryption/cenc_cens_decrypt` | `cenc_cens.mp4`; MP4; `cenc-cens`; key/KID row `cenc_cens`; clear baseline `cenc_ctr_clear.mp4` | default three | Patterned AES-CTR (`cens`) path. [src/scenarios/encryption/index.ts:77-91](../../src/scenarios/encryption/index.ts#L77-L91) |
| `encryption/cenc_cbcs_decrypt` | `cenc_cbcs.mp4`; MP4; `cenc-cbcs`; key/KID row `cenc_cbcs`; no separate `cleartextAsset` | default three | Patterned AES-CBC (`cbcs`) path; the scenario itself notes that a pattern-boundary-specific assertion is missing. [src/scenarios/encryption/index.ts:92-108](../../src/scenarios/encryption/index.ts#L92-L108) |
| `encryption/hls_aes128_decrypt` | `hls_aes128.m3u8`; HLS; `hls-aes128`; key/IV row `hls_aes128`; clear baseline `hls_aes128_clear.mp4` | `decrypt-bitexact`, `playback-smoke` | Full-segment HLS AES-128 with an explicit IV; it deliberately omits `reference-reimport`. [src/scenarios/encryption/index.ts:109-128](../../src/scenarios/encryption/index.ts#L109-L128) |
| `encryption/hls_sample_aes_decrypt` | `hls_sample_aes.m3u8`; HLS; `hls-sample-aes`; key/IV row `hls_sample_aes`; clear baseline `hls_aes128_clear.mp4` | `decrypt-bitexact`, `playback-smoke` | Partial-sample H.264/AAC encryption; it also omits `reference-reimport`. [src/scenarios/encryption/index.ts:129-145](../../src/scenarios/encryption/index.ts#L129-L145) |

The `cenc_cbcs_decrypt` comments still say the asset and keys are absent, but the current checkout's manifest records a nonzero hash and size, and committed key and non-pending frame artifacts exist. Current missing-asset routing uses the manifest or a resolved-input `HEAD` check rather than scenario prose, so the stale comment does not force `NA_ASSET`. [src/scenarios/encryption/index.ts:100-107](../../src/scenarios/encryption/index.ts#L100-L107) [fixtures/manifest.json:339-353](../../fixtures/manifest.json#L339-L353) [fixtures/golden/cenc_cbcs.mp4.keys.json:1-7](../../fixtures/golden/cenc_cbcs.mp4.keys.json#L1-L7) [fixtures/golden/cenc_cbcs.mp4.frames.json:1-13](../../fixtures/golden/cenc_cbcs.mp4.frames.json#L1-L13) [src/core/runner.ts:1299-1323](../../src/core/runner.ts#L1299-L1323)

### Metamorphic and clear-input scenarios

These three rows use `wall`, `peakMemory`, and `longtasks`. Their builder always requires the named encryption scheme even for the clear-input no-op row. [src/scenarios/encryption/metamorphic.ts:119-144](../../src/scenarios/encryption/metamorphic.ts#L119-L144)

| Scenario | Relation under test | Current oracle set |
| --- | --- | --- |
| `encryption/cenc_ctr_decrypt_eq_cleartext` | Decrypt CENC-CTR and compare its platform-decoded frames with the `cenc_ctr_clear.mp4` golden; requires the clear-output feature. [src/scenarios/encryption/metamorphic.ts:62-80](../../src/scenarios/encryption/metamorphic.ts#L62-L80) | `property-invariant`, `reference-reimport`, `playback-smoke` |
| `encryption/hls_aes128_decrypt_eq_cleartext` | Decrypt full-segment HLS AES-128 and compare with `hls_aes128_clear.mp4`. [src/scenarios/encryption/metamorphic.ts:81-99](../../src/scenarios/encryption/metamorphic.ts#L81-L99) | `property-invariant`, `playback-smoke` |
| `encryption/unencrypted_left_untouched_noop` | Run the CENC-CTR decrypt entry point over clear `h264_1080p_30s.mp4` with an all-zero key; notes explicitly acknowledge that no output-versus-input byte identity check exists. [src/scenarios/encryption/metamorphic.ts:100-116](../../src/scenarios/encryption/metamorphic.ts#L100-L116) | `property-invariant`, `reference-reimport`, `playback-smoke` |

For baked inputs, the generic `decode-cleartext-baseline` property branch platform-decodes candidate output and compares it to golden frame digests. [src/core/oracles.ts:2774-2794](../../src/core/oracles.ts#L2774-L2794) For a rotated DERIVED CENC input, media selection instead injects that file's key, retained cleartext base, `decrypt-eq-cleartext-decode`, and `property-invariant`, while dropping `decrypt-bitexact`; the oracle decodes at most 24 frames from both candidate output and the retained base with the same platform path. [src/core/media-selection.ts:240-279](../../src/core/media-selection.ts#L240-L279) [src/core/oracles.ts:2861-2927](../../src/core/oracles.ts#L2861-L2927)

The clear-input no-op catalog row is `REAL`, not DERIVED. Selection therefore only repoints its input. On a selected real file there is no committed frame golden, the `property-invariant` outcome becomes a golden gap, `reference-reimport` is unavailable for decrypt, and a successful `playback-smoke` is enough for the runner's “any real pass” rule to make the [cell](../glossary.md#cell) pass. [fixtures/media/scenarios/_sources.ndjson:140](../../fixtures/media/scenarios/_sources.ndjson#L140) [src/core/media-selection.ts:308-325](../../src/core/media-selection.ts#L308-L325) [src/core/oracles.ts:1311-1325](../../src/core/oracles.ts#L1311-L1325) [src/core/runner.ts:1423-1443](../../src/core/runner.ts#L1423-L1443)

### Malformed-protection robustness scenarios

All three rows use the `cenc_ctr` key, require MP4 + H.264 + AAC + `cenc-ctr`, run only `graceful-failure`, record `wall` and `peakMemory`, and impose a 15-second operation timeout. [src/scenarios/encryption/robustness.ts:31-42](../../src/scenarios/encryption/robustness.ts#L31-L42) [src/scenarios/encryption/robustness.ts:83-100](../../src/scenarios/encryption/robustness.ts#L83-L100)

| Scenario | Mutation fixture |
| --- | --- |
| `encryption/cenc_ctr_senc_bitflip_graceful` | 96 deterministic bit flips in the CENC fragment/protected-sample region. [src/scenarios/encryption/robustness.ts:44-56](../../src/scenarios/encryption/robustness.ts#L44-L56) [fixtures/bake.mjs:1415](../../fixtures/bake.mjs#L1415) |
| `encryption/cenc_ctr_protection_zeroed_graceful` | Four deterministic 512-byte zero spans. [src/scenarios/encryption/robustness.ts:57-68](../../src/scenarios/encryption/robustness.ts#L57-L68) [fixtures/bake.mjs:1416](../../fixtures/bake.mjs#L1416) |
| `encryption/cenc_ctr_truncated_mdat_graceful` | Tail truncated to 60 percent. [src/scenarios/encryption/robustness.ts:69-80](../../src/scenarios/encryption/robustness.ts#L69-L80) [fixtures/bake.mjs:1417](../../fixtures/bake.mjs#L1417) |

The special runner path treats `NotApplicableError` as `NA_ENGINE`, a timeout as `FAIL`, any other thrown value as a graceful success condition, and returned output as suspicious unless `gracefulAllowOutput` is true. [src/core/runner.ts:1523-1569](../../src/core/runner.ts#L1523-L1569) [src/core/oracles.ts:2652-2705](../../src/core/oracles.ts#L2652-L2705) Thus “threw quickly” is currently evidence of robustness even when the exception does not prove that protection metadata was intentionally rejected.

### Capability-finding scenarios

The three capability findings deliberately omit `requires.encryption`. A decrypt-capable adapter that passes the operation/container/codec gate therefore receives the requested unsupported scheme plus an empty key; an adapter without `decrypt` is preflighted to `NA_ENGINE`. The declared intent is to require rejection, but each row embeds `signal:rejected` in its notes, and `graceful-failure` treats that pre-authored marker as an immediate pass before it inspects returned output. The current rows therefore do not prove that rejection actually occurred. [src/scenarios/encryption/capability-findings.ts:24-80](../../src/scenarios/encryption/capability-findings.ts#L24-L80) [src/core/oracles.ts:2664-2695](../../src/core/oracles.ts#L2664-L2695)

| Scenario | Requested path | Current negative-test intent |
| --- | --- | --- |
| `encryption/clearkey_decrypt_na` | `clearkey` over the CENC-CTR fixture | Keep EME Clear Key negotiation distinct from raw-key file decryption. [src/scenarios/encryption/capability-findings.ts:24-38](../../src/scenarios/encryption/capability-findings.ts#L24-L38) |
| `encryption/cenc_cens_decrypt_na` | `cenc-cens` over the CENC-CTR fixture | Exercise unsupported-scheme rejection using a stand-in input. [src/scenarios/encryption/capability-findings.ts:39-50](../../src/scenarios/encryption/capability-findings.ts#L39-L50) |
| `encryption/hls_sample_aes_decrypt_na` | `hls-sample-aes` over the HLS AES-128 fixture | Detect adapters that conflate per-sample encryption with full-segment AES-128. [src/scenarios/encryption/capability-findings.ts:51-63](../../src/scenarios/encryption/capability-findings.ts#L51-L63) |

The positive battery now contains real `cenc-cens` and `hls-sample-aes` rows, but these negative rows remain registered. Moreover, the local source catalog classifies `cenc_cens_decrypt_na` and `clearkey_decrypt_na` as DERIVED CENC-CTR rows. When one of their real inputs is selected, the generic DERIVED transformation rewrites `options.scheme` to that file's `cenc-ctr` scheme and replaces the negative semantics with a cleartext-decode property, and the runner executes that effective scenario. [fixtures/media/scenarios/_sources.ndjson:128](../../fixtures/media/scenarios/_sources.ndjson#L128) [fixtures/media/scenarios/_sources.ndjson:134](../../fixtures/media/scenarios/_sources.ndjson#L134) [src/core/media-selection.ts:240-279](../../src/core/media-selection.ts#L240-L279) [src/core/runner.ts:1841-1843](../../src/core/runner.ts#L1841-L1843)

### Performance scenario

`encryption/perf_cenc_ctr_decrypt_throughput` uses the same CENC-CTR source, key, clear baseline, codecs, and clear-output feature as the functional row. It gates on `decrypt-bitexact`, requests `throughputRealtime`, `wall`, `peakMemory`, and `longtasks`, ranks by `throughputRealtime`, and has a 60-second operation timeout. [src/scenarios/encryption/performance.ts:21-49](../../src/scenarios/encryption/performance.ts#L21-L49)

The runner only benchmarks after the correctness oracles admit the cell. [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463) Realtime throughput needs `mediaSec`; the meter only emits it when duration is supplied, while the benchmark obtains duration only from the selected input's golden metadata or the operation result's metadata. A decrypt result carries output bytes but no probe metadata, so a rotated golden-less input can yield a `throughputRealtime` summary with `n = 0`. [src/core/runner.ts:849-855](../../src/core/runner.ts#L849-L855) [src/core/runner.ts:1651-1664](../../src/core/runner.ts#L1651-L1664) [src/core/measure.ts:77-81](../../src/core/measure.ts#L77-L81) [src/core/bench.ts:127-150](../../src/core/bench.ts#L127-L150)

### Current oracle and result semantics

`decrypt-bitexact` loads the cleartext asset's frame golden when one is named, platform-decodes candidate output up to the golden's frame count, and compares SHA-256 frame digests. Matching is by frame index first and nearest PTS within 21 ms second; it verifies every golden frame but does not reject extra output frames because decode is capped at the golden length. [src/core/oracles.ts:1241-1297](../../src/core/oracles.ts#L1241-L1297) [src/core/oracles.ts:2608-2647](../../src/core/oracles.ts#L2608-L2647)

The injected platform helper is independent of the scored engine. It inline-demuxes MP4/WebM and decodes with WebCodecs when possible, then falls back to a media element on the page main thread. [src/engines/platform/oracle-helpers.ts:1-18](../../src/engines/platform/oracle-helpers.ts#L1-L18) [src/engines/platform/oracle-helpers.ts:108-165](../../src/engines/platform/oracle-helpers.ts#L108-L165) A platform-decode exception currently becomes a failed oracle, not `NA_BROWSER`, even when the failure is reference-path unavailability rather than invalid output. [src/core/oracles.ts:2621-2626](../../src/core/oracles.ts#L2621-L2626)

Despite its attachment to three CENC positive/metamorphic rows, `reference-reimport` has no decrypt implementation. It verifies only remux and mux, and returns an honest golden-absent outcome for every other operation. The runner excludes that outcome as `NA_ASSET`; it therefore does not currently prove that a decrypt output removed active CENC signaling or preserved all tracks. [src/core/oracles.ts:1299-1325](../../src/core/oracles.ts#L1299-L1325) [src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889)

Current `OracleOutcome` is boolean and current `ResultStatus` contains `PASS`, `FAIL`, the three NA classes, `ERROR`, and `SKIPPED`; there is no `DIFF`. [src/core/scenario.ts:206-221](../../src/core/scenario.ts#L206-L221) The runner returns `FAIL` for the first non-golden non-passing oracle and `PASS` if at least one oracle passes and every other non-pass is a recognized evidence gap. [src/core/runner.ts:1423-1447](../../src/core/runner.ts#L1423-L1447)

### Declared adapter coverage

This table records declarations, not successful cells. Runtime tuple limitations and browser support can still narrow them; see each engine page for implementation detail.

| Engine | Declared decrypt schemes relevant to this family | Material runtime behavior |
| --- | --- | --- |
| [aibrush-media](../engines/aibrush-media.md) | `cenc-ctr`, `cenc-cbcs`, `cenc-cens`, `hls-aes128`, `hls-sample-aes` | Maps the CENC tokens to library schemes, resolves HLS to clear media, and uses typed applicability conversion around library errors; unsupported tokens take a graceful-rejection path. [src/engines/aibrush-media/adapter.ts:3752-3801](../../src/engines/aibrush-media/adapter.ts#L3752-L3801) [src/engines/aibrush-media/adapter.ts:5564-5619](../../src/engines/aibrush-media/adapter.ts#L5564-L5619) |
| [ffmpeg.wasm](../engines/ffmpeg-wasm.md) | `cenc-ctr`, `hls-aes128` | Uses adapter WebCrypto CENC clearing followed by FFmpeg remux for CENC-CTR and native HLS demux/decrypt; unsupported schemes throw plain `Error`. [src/engines/ffmpeg-wasm/adapter.ts:1452-1476](../../src/engines/ffmpeg-wasm/adapter.ts#L1452-L1476) [src/engines/ffmpeg-wasm/adapter.ts:2071-2161](../../src/engines/ffmpeg-wasm/adapter.ts#L2071-L2161) |
| [mediabunny](../engines/mediabunny.md) | `cenc-ctr`, `cenc-cbcs`, `hls-aes128` | Supplies CENC keys through `resolveKeyId` and converts clear samples to MP4; unsupported schemes throw plain `Error`. It deliberately withholds the CENC-CTR clear-output feature after a fixture-specific abort, so the primary CTR rows negotiate `NA_ENGINE`. [src/engines/mediabunny/adapter.ts:1029-1105](../../src/engines/mediabunny/adapter.ts#L1029-L1105) [src/engines/mediabunny/adapter.ts:1611-1661](../../src/engines/mediabunny/adapter.ts#L1611-L1661) |
| [mp4box](../engines/mp4box.md) | none | Parses CENC signaling but declares neither decrypt nor an encryption scheme. [src/engines/mp4box/adapter.ts:630-652](../../src/engines/mp4box/adapter.ts#L630-L652) |
| [remotion](../engines/remotion.md) | none | The composite capability set explicitly clears encryption because neither package exposes protected-track normalization/decrypt. [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91) |
| [web-demuxer](../engines/web-demuxer.md) | none | Declares parser/decode operations but no encryption schemes or decrypt operation. [src/engines/web-demuxer/adapter.ts:618-646](../../src/engines/web-demuxer/adapter.ts#L618-L646) |

## Contracts and invariants

- **Stable identity and complete registration.** Every owned id has the `encryption/` prefix, derives the `encryption` family, and is included exactly once in the family export; duplicate ids are rejected during global import. [src/scenarios/encryption/index.ts:148-158](../../src/scenarios/encryption/index.ts#L148-L158) [src/core/scenario.ts:183-203](../../src/core/scenario.ts#L183-L203) [src/scenarios/index.ts:49-71](../../src/scenarios/index.ts#L49-L71)
- **Declared decrypt boundary.** An admissible positive scenario carries operation, input-container, codec, and scheme requirements; CTR functional/performance rows additionally require an adapter assertion that clear samples can actually be exported. These are flat preflight claims, not proof of the full combination. [src/scenarios/encryption/_shared.ts:150-172](../../src/scenarios/encryption/_shared.ts#L150-L172) [src/core/runner.ts:130-189](../../src/core/runner.ts#L130-L189)
- **Key handoff.** The scenario hands the adapter a hexadecimal key with optional KID and IV. There is no core length/format validation; individual adapters validate or consume these fields differently. [src/core/engine.ts:181-185](../../src/core/engine.ts#L181-L185) [src/core/runner.ts:767-786](../../src/core/runner.ts#L767-L786)
- **Positive output form.** Every successful engine returns a `MediaBytes` object; current CENC and HLS adapters shown above generally normalize output to clear MP4, but the engine interface itself does not prescribe MP4 or prove deprotection. [src/core/engine.ts:28-39](../../src/core/engine.ts#L28-L39) [src/core/engine.ts:236](../../src/core/engine.ts#L236)
- **Correctness before timing.** A real oracle failure prevents benchmarking. A correctness pass can still be returned without a number if the benchmark times out, and an unavailable duration can produce a primary metric summary with no admissible samples. [src/core/runner.ts:1433-1463](../../src/core/runner.ts#L1433-L1463) [src/core/bench.ts:127-150](../../src/core/bench.ts#L127-L150)
- **Golden/reference provenance.** Baked positive rows compare decoded output with browser-baked frame digests associated with the named clear baseline; rotated DERIVED CENC rows instead compare output and retained clear base through the same platform decoder. [src/core/oracles.ts:2608-2647](../../src/core/oracles.ts#L2608-L2647) [src/core/oracles.ts:2861-2927](../../src/core/oracles.ts#L2861-L2927)
- **Applicability separation.** Preflight capability absence and runtime `NotApplicableError` are `NA_ENGINE`; missing media/golden truth is `NA_ASSET`; browser codec/API absence is intended to be `NA_BROWSER`; an ordinary functional exception is `ERROR`; a real oracle mismatch is `FAIL`. [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221) [src/core/runner.ts:1331-1356](../../src/core/runner.ts#L1331-L1356) [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393)
- **Negative-row bypass.** Capability findings intentionally omit the requested scheme from `requires`, so supported-operation adapters execute and demonstrate a rejection rather than being filtered out by the scheme gate. [src/scenarios/encryption/capability-findings.ts:65-80](../../src/scenarios/encryption/capability-findings.ts#L65-L80)
- **Malformed-input bound.** The three encryption fuzz rows must finish within 15 seconds. A timeout is `FAIL`; `NotApplicableError` is `NA_ENGINE`; any other quick throw currently passes through `graceful-failure`. [src/scenarios/encryption/robustness.ts:31](../../src/scenarios/encryption/robustness.ts#L31) [src/core/runner.ts:1552-1569](../../src/core/runner.ts#L1552-L1569)
- **Run-level reproducibility.** Media selection is seeded by run seed and scenario id, and all engines in one run receive the same selected input. DERIVED CENC selections also replace the baked key with the selected file's recorded key. [src/core/media-selection.ts:328-345](../../src/core/media-selection.ts#L328-L345) [src/core/media-selection.ts:397-413](../../src/core/media-selection.ts#L397-L413)
- **Current verdict limit.** Present oracles can express only passing or non-passing evidence; [semantic equivalence](../glossary.md#semantic-equivalence) with a legal [representation difference](../glossary.md#representation-difference) cannot be preserved as `DIFF` today. [src/core/scenario.ts:213-221](../../src/core/scenario.ts#L213-L221)

## Target design and known gaps

### Target design

The target encryption contract is a staged decision, with applicability decided before correctness and performance:

1. **Establish applicability for the concrete tuple.** Evaluate operation × container × codecs × scheme × options × output form. Missing framework support is `NA_ENGINE`; a reference/browser primitive unavailable for an otherwise valid cell is `NA_BROWSER`; absent input, key record, clear baseline, or golden evidence is `NA_ASSET`; harness faults are `ERROR`. An adapter that discovers a finer-grained unsupported combination at runtime must throw `NotApplicableError`, including mediabunny, remotion, and remotion-media-parser paths when the framework cannot perform the requested concrete work.
2. **Validate key and fixture provenance before scoring an engine.** Test keys must be exactly 128 bits for these schemes, the KID must select the intended CENC key, and the IV must follow the scheme's rules. ISO/IEC 23001-7 specifies key identification and IV processing for its AES-CTR/CBC protection schemes, while RFC 8216 defines the explicit-IV and media-sequence-derived-IV alternatives for HLS AES-128. [ISO/IEC 23001-7:2023 abstract](https://www.iso.org/standard/84637.html) [RFC 8216 §4.3.2.4 and §5.2](https://www.rfc-editor.org/rfc/rfc8216.html#section-4.3.2.4)
3. **Use three-way correctness verdicts.** `PASS` means the required presentation and clear-output structure are correct after documented normalization. `DIFF` means valid, semantically equivalent clear media whose legal container organization, inert metadata, sample grouping, timestamps within tolerance, or codec representation differs from the ffmpeg-baked reference. `FAIL` is reserved for wrong clear samples, missing/extra required content, invalid/unplayable output, wrong timeline outside tolerance, or active protection remaining where clear output is required. ISO Common Encryption permits multiple DRM/key-management systems over the same protected stream and defines encryption metadata separately from elementary-stream semantics, so equality to one baker's byte/container representation is not the validity rule. [ISO/IEC 23001-7:2023 abstract](https://www.iso.org/standard/84637.html)
4. **Require both semantic and structural decryption evidence.** Decode candidate output with the neutral platform path and compare the complete required presentation to the independently clear source. Re-import the output with a no-candidate parser and prove clear sample entries/tracks, readable timing, expected track set, and absence of active per-sample protection. W3C's CENC stream note identifies `encv`/`enca`, `sinf`/`schm`, `tenc`, sample groups, `saiz`/`saio`, and sample encryption state as the signaling that distinguishes protected samples; an inert retained `pssh` alone may be reported as `DIFF`, but active encryption signaling or encrypted samples in a promised clear output is `FAIL`. [W3C ISO Common Encryption stream format §§2–4](https://www.w3.org/TR/eme-stream-mp4/#detection)
5. **Test CENC schemes as different algorithms, not labels.** `cenc` is full-sample/subsample AES-CTR, `cens` is patterned AES-CTR, and `cbcs` is patterned AES-CBC. Each positive fixture must record scheme, KID, IV size/rule, subsample map, and crypt:skip pattern; boundary fixtures must cross encrypted/clear block boundaries and fail with the wrong pattern. ISO/IEC 23001-7 covers CTR, CBC, pattern encryption, IVs, and NAL subsamples; EME distinguishes `cenc`, `cbcs`, and the 1:9 `cbcs-1-9` pattern. [ISO/IEC 23001-7:2023 abstract](https://www.iso.org/standard/84637.html) [W3C Encrypted Media Extensions, encryption scheme capability](https://www.w3.org/TR/encrypted-media-2/#dom-mediakeysystemmediacapability-encryptionscheme)
6. **Test HLS methods and IV branches separately.** AES-128 rows must cover whole-segment AES-CBC with PKCS#7, both explicit IV and the 128-bit big-endian media-sequence fallback. SAMPLE-AES rows must prove per-sample processing and must not pass through the AES-128 whole-segment implementation. RFC 8216 explicitly defines these as different methods and specifies `cbcs` for SAMPLE-AES in fMP4. [RFC 8216 §4.3.2.4](https://www.rfc-editor.org/rfc/rfc8216.html#section-4.3.2.4) [RFC 8216 §5.2](https://www.rfc-editor.org/rfc/rfc8216.html#section-5.2)
7. **Keep Clear Key separate from raw-key file decrypt.** `org.w3.clearkey` is an EME key system using plaintext keys; CENC initialization data consists of `pssh` boxes and Clear Key selects the common SystemID. The target either implements a dedicated EME scenario with `requestMediaKeySystemAccess`, `MediaKeys`, init data, and browser applicability, or retains a precisely named negative capability finding. It must not masquerade as an `EncryptionScheme` handled by the raw `decrypt(input, key)` primitive. [W3C Encrypted Media Extensions §9.1](https://www.w3.org/TR/encrypted-media-2/#clear-key) [W3C “cenc” Initialization Data Format §§1–4](https://www.w3.org/html/media/format-registry/initdata/cenc.html)
8. **Make rotation preserve scenario meaning.** Only positive clear-output scenarios may be rewritten to a DERIVED file's key and source-decode property. Negative rows retain their requested unsupported scheme, expected-rejection contract, and fixture class. A real no-op input must compare directly with its own source bytes for the byte-identity scenario; a separately named semantic-no-op scenario may accept a legal rewrap as `DIFF`.
9. **Use typed negative and robustness outcomes.** Wrong/missing key, malformed protected data, and unsupported tuple are distinct. A malformed row passes only on an expected parse/decrypt rejection class or on safe partial output explicitly permitted by that scenario; an arbitrary adapter initialization error is `ERROR`, `NotApplicableError` is `NA_ENGINE`, timeout is `FAIL`, and a process/worker crash is `FAIL` with crash evidence. In exhaustive mode, “01 passes, 02 and 03 fail” is [partial coverage](../glossary.md#partial-coverage): preserve every per-file verdict and grade the cell partial rather than collapsing it to `ERROR`.
10. **Keep the reference decode neutral and diagnose its applicability.** The in-browser WebCodecs/platform decode remains independent of every scored engine. First prove that the clear baseline can be decoded in the current browser/configuration; inability is `NA_BROWSER`. If the baseline decodes but candidate output cannot, that is `FAIL`. WebCodecs defines codec interfaces but permits a user agent to support any codec combination or none, so browser support must not be mistaken for candidate correctness. [W3C WebCodecs abstract and configuration support](https://www.w3.org/TR/webcodecs/#config-codec-support)
11. **Emit performance only with a real numerator.** Carry selected-source duration from the catalog or a neutral pre-probe into every decrypt benchmark. A ranked `throughputRealtime` summary must have `n > 0`, and the report must reject a headline metric with no finite samples. FFmpeg's official format documentation describes 16-byte CENC AES-CTR decryption keys, while the benchmark's timing remains a harness contract independent of any engine-specific output representation. [FFmpeg Formats, MOV/MP4 decryption options](https://ffmpeg.org/ffmpeg-formats.html#mov_002fmp4_002f3gp_002fQuickTime)

### Known gaps

#### 1. Boolean verdicts conflate wrongness with representation

**Current.** `OracleOutcome` is `pass: boolean`, `ResultStatus` has no `DIFF`, and the runner reduces the first real oracle miss to `FAIL`. [src/core/scenario.ts:213-221](../../src/core/scenario.ts#L213-L221) [src/core/runner.ts:1433-1447](../../src/core/runner.ts#L1433-L1447)

**Consequence.** A valid clear output whose container layout or inert signaling differs from the ffmpeg-baked representation cannot be retained as an informative representation difference; it is either failed or ignored as an unavailable oracle.

**Target.** Add target oracle verdicts `PASS`, `DIFF`, and `FAIL`; aggregate `DIFF` as valid but diagnostically distinct. Active CENC sample signaling described by the W3C stream format is `FAIL`, while a harmless legal representation difference is `DIFF`. [W3C ISO Common Encryption stream format §§1–3](https://www.w3.org/TR/eme-stream-mp4/#stream-format)

**Verification.** Feed two clear outputs with identical decoded presentation: one matching the golden container, one legally reordered/rewrapped. Observe `PASS` and `DIFF`; then retain an actively protected sample entry and observe `FAIL`.

#### 2. `reference-reimport` is attached but does not inspect decrypt output

**Current.** Positive CENC rows attach `reference-reimport`, but its dispatcher supports only remux and mux and returns a golden-absent outcome for decrypt. [src/scenarios/encryption/_shared.ts:145-168](../../src/scenarios/encryption/_shared.ts#L145-L168) [src/core/oracles.ts:1299-1325](../../src/core/oracles.ts#L1299-L1325)

**Consequence.** A frame-correct output can pass without proving track preservation or removal of active `encv`/`enca`, `sinf`/`schm`, `tenc`, sample-group, or auxiliary encryption signaling.

**Target.** Implement decrypt re-import against the output's own structure. W3C defines the relevant protected sample entries, scheme type, key association, and auxiliary sample encryption metadata. [W3C ISO Common Encryption stream format §§2–4](https://www.w3.org/TR/eme-stream-mp4/#detection)

**Verification.** Test a normal clear MP4, a frame-decrypted MP4 with active protected sample entry, a track-dropped MP4, and a clear MP4 retaining only inert `pssh`; expect `PASS`, `FAIL`, `FAIL`, and `DIFF` respectively.

#### 3. The HLS golden-key mirror has drifted and its guard is not called

**Current.** The code mirror supplies key `366a…` and IV `953e…` for `hls_aes128`, while the committed `.keys.json` records key `26cc…` and IV `c064…`. The exported parity helper is referenced nowhere else, tolerates HTTP/parse failure, and is not invoked by the scenario builder or runner. [src/scenarios/encryption/_shared.ts:71-77](../../src/scenarios/encryption/_shared.ts#L71-L77) [fixtures/golden/hls_aes128.m3u8.keys.json:1-7](../../fixtures/golden/hls_aes128.m3u8.keys.json#L1-L7) [src/scenarios/encryption/_shared.ts:179-220](../../src/scenarios/encryption/_shared.ts#L179-L220)

**Consequence.** Adapters that consume the scenario key can fail a correct implementation, while adapters that follow the playlist's key URI can appear to pass despite ignoring the raw-key contract; the result is not attributable to the engine.

**Target.** Load one authoritative key record, validate 128-bit key/IV shape, and run a blocking parity/provenance preflight before any cell. HLS AES-128 requires a 128-bit key and the playlist-selected IV rule. [RFC 8216 §4.3.2.4](https://www.rfc-editor.org/rfc/rfc8216.html#section-4.3.2.4)

**Verification.** A deliberately mismatched mirror prevents all affected cells from executing and reports harness `ERROR` or `NA_ASSET`, never engine `FAIL`; a corrected record produces identical key bytes in every adapter invocation.

#### 4. Media rotation can rewrite negative capability semantics

**Current.** The CENS and Clear Key negative rows are cataloged as DERIVED CENC-CTR inputs; the generic DERIVED transform replaces their requested scheme and oracle semantics with the selected file's key/scheme and cleartext property. [fixtures/media/scenarios/_sources.ndjson:128](../../fixtures/media/scenarios/_sources.ndjson#L128) [fixtures/media/scenarios/_sources.ndjson:134](../../fixtures/media/scenarios/_sources.ndjson#L134) [src/core/media-selection.ts:240-279](../../src/core/media-selection.ts#L240-L279)

**Consequence.** A seeded run can silently test a supported CENC-CTR positive path under an id whose declared purpose is rejection of CENS or Clear Key.

**Target.** Allow DERIVED rewriting only for scenarios explicitly marked as positive source-equivalence tests. CENC key association is tied to the content's KID and scheme, and official Mediabunny guidance likewise resolves a concrete key ID to its exact supplied key. [W3C ISO Common Encryption stream format §1](https://www.w3.org/TR/eme-stream-mp4/#stream-format) [Mediabunny, Reading HLS: encrypted content](https://mediabunny.dev/guide/reading-hls#encrypted-content)

**Verification.** Enumerate every candidate for both negative ids and assert that `effectiveScenario.options.scheme`, expected rejection, and oracle set never change; positive DERIVED rows must still receive each selected file's own key and clear base.

#### 5. The capability gate cannot express combinatorial support

**Current.** Negotiation checks independent operation, container, codec, scheme, and feature arrays. Mediabunny and ffmpeg.wasm still throw plain `Error` for unsupported schemes; outside the graceful path that maps to `ERROR`, not `NA_ENGINE`. [src/core/runner.ts:113-202](../../src/core/runner.ts#L113-L202) [src/engines/mediabunny/adapter.ts:1634-1636](../../src/engines/mediabunny/adapter.ts#L1634-L1636) [src/engines/ffmpeg-wasm/adapter.ts:2109-2113](../../src/engines/ffmpeg-wasm/adapter.ts#L2109-L2113)

**Consequence.** An adapter may honestly support each token but not the requested combination, allowing an unsupported tuple to leak into `FAIL`/`ERROR` and encouraging a growing hand-maintained disabled-cell list.

**Target.** Add tuple-aware capability negotiation where stable, and require `NotApplicableError` for runtime “framework cannot do this combination” discoveries. Framework docs demonstrate that support is conditional: current Mediabunny SAMPLE-AES support is limited to ISO BMFF media, while FFmpeg's MOV muxer exposes only `none` and `cenc-aes-ctr` for encryption output. [Mediabunny, Reading HLS: encrypted content](https://mediabunny.dev/guide/reading-hls#encrypted-content) [FFmpeg Formats, MOV/MP4 muxer encryption options](https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv)

**Verification.** Exercise supported tokens in an unsupported tuple and observe `NA_ENGINE` with a precise reason from each adapter; genuine malformed/wrong-key inputs must remain scored negative tests rather than applicability decisions.

#### 6. Rotated clear-input no-op can pass on playback alone

**Current.** A REAL no-op input has no selected-file frame golden; its property and decrypt re-import outcomes retire as evidence gaps, so `playback-smoke` alone can pass the cell. There is no output-versus-input byte comparator. [src/scenarios/encryption/metamorphic.ts:100-116](../../src/scenarios/encryption/metamorphic.ts#L100-L116) [src/core/oracles.ts:1311-1325](../../src/core/oracles.ts#L1311-L1325) [src/core/runner.ts:1423-1447](../../src/core/runner.ts#L1423-L1447)

**Consequence.** A decrypt adapter can alter or lose content yet pass if the result still advances a media element.

**Target.** Make `unencrypted_left_untouched_noop` byte-identical to its selected source, or split it into byte-no-op (`FAIL` on any byte change) and semantic-no-op (`DIFF` for a valid rewrap). Use a source-to-output neutral decode comparison in both. WebCodecs supplies the independent codec interface but does not guarantee any particular browser codec configuration, so browser applicability remains explicit. [W3C WebCodecs abstract](https://www.w3.org/TR/webcodecs/#abstract)

**Verification.** Test identity, metadata-only rewrap, one-frame loss, and playable wrong-content outputs; expect byte-no-op `PASS`, `FAIL`, `FAIL`, `FAIL`, with the optional semantic-no-op reporting the rewrap as `DIFF`.

#### 7. Pattern-scheme coverage is not pattern-specific

**Current.** CENS and CBCS positive rows use frame-digest equality, and the CBCS scenario notes the absence of a crypt:skip boundary assertion. Fixture comments also still describe CBCS as absent despite present artifacts. [src/scenarios/encryption/index.ts:77-108](../../src/scenarios/encryption/index.ts#L77-L108) [fixtures/golden/cenc_cbcs.mp4.keys.json:1-7](../../fixtures/golden/cenc_cbcs.mp4.keys.json#L1-L7)

**Consequence.** Coverage does not localize wrong pattern, IV, or subsample-boundary handling, and stale notes obscure whether a result is a fixture gap or engine behavior.

**Target.** Record and inspect scheme/pattern/subsample ground truth and add deterministic boundary vectors for CENS and CBCS. ISO/IEC 23001-7 explicitly distinguishes CTR, CBC, partial pattern encryption, IV processing, and NAL subsamples; Bento4 exposes separate MPEG-CENC, MPEG-CENS, and MPEG-CBCS methods with track keys/KIDs. [ISO/IEC 23001-7:2023 abstract](https://www.iso.org/standard/84637.html) [Bento4 `mp4encrypt`](https://www.bento4.com/documentation/mp4encrypt/)

**Verification.** Correct pattern/IV decrypts to `PASS`; whole-sample decryption, swapped CENS/CBCS, off-by-one crypt:skip, and wrong subsample offsets each produce localized `FAIL`. Fixture availability text must be generated from current manifest/artifacts.

#### 8. HLS AES-128 covers only explicit IV, and method separation is fixture-dependent

**Current.** Both HLS AES-128 rows explicitly state that only the playlist-IV branch is exercised. The SAMPLE-AES capability finding uses an AES-128 playlist stand-in, while the positive SAMPLE-AES row is separate. [src/scenarios/encryption/index.ts:109-145](../../src/scenarios/encryption/index.ts#L109-L145) [src/scenarios/encryption/metamorphic.ts:81-99](../../src/scenarios/encryption/metamorphic.ts#L81-L99) [src/scenarios/encryption/capability-findings.ts:51-63](../../src/scenarios/encryption/capability-findings.ts#L51-L63)

**Consequence.** An implementation can ignore media-sequence-derived IVs or conflate whole-segment and per-sample processing without a complete positive/negative matrix.

**Target.** Add AES-128 playlists with explicit IV, omitted IV at sequence zero, omitted IV at a nonzero media sequence, key rotation, and a clear `METHOD=NONE` transition. Keep SAMPLE-AES fixtures format-specific. RFC 8216 defines AES-128 CBC/PKCS#7, the two IV sources, SAMPLE-AES sample processing, and `METHOD=NONE`. [RFC 8216 §§4.3.2.4, 5.2, 6.3.6](https://www.rfc-editor.org/rfc/rfc8216.html#section-4.3.2.4)

**Verification.** Each IV/key transition decrypts against its retained clear source; feeding a SAMPLE-AES playlist to the AES-128 implementation and vice versa must produce typed rejection or `FAIL`, never `PASS`.

#### 9. Negative tests trust authored success markers or any quick exception, and aggregation loses partial coverage

**Current.** The capability findings' authored `signal:rejected` marker passes `graceful-failure` without observing execution output. Without a marker, any non-timeout, non-`NotApplicableError` throw is treated as graceful. Exhaustive aggregation turns any file `FAIL` into cell `FAIL` and all failing `ERROR` files into cell `ERROR`, although it preserves per-file rows and counts. [src/scenarios/encryption/capability-findings.ts:24-80](../../src/scenarios/encryption/capability-findings.ts#L24-L80) [src/core/oracles.ts:2664-2695](../../src/core/oracles.ts#L2664-L2695) [src/core/runner.ts:1552-1569](../../src/core/runner.ts#L1552-L1569) [src/core/runner.ts:1118-1189](../../src/core/runner.ts#L1118-L1189)

**Consequence.** A capability row can pass even if the adapter returns output, initialization bugs can masquerade as safe malformed-input rejection, and “01 passes, 02/03 fail” is not represented as the useful partial-coverage robustness signal.

**Target.** Require typed parse/decrypt rejection evidence and add a partial-coverage grade. Unknown adapter/harness errors remain `ERROR`; unsupported tuples remain `NA_ENGINE`; timeouts/crashes remain `FAIL`. WebCrypto specifies `OperationError` for invalid AES-CBC length/IV conditions, providing an example of algorithm-specific rejection distinct from capability absence. [W3C Web Cryptography Level 2, AES-CBC](https://www.w3.org/TR/webcrypto/#aes-cbc)

**Verification.** Remove scenario-authored success markers as verdict inputs, then run three files where 01 rejects safely, 02 returns unsafe output, and 03 triggers an adapter initialization error. Observe `PASS`, `FAIL`, and `ERROR`, preserve all outcomes, and report partial coverage rather than replacing the cell with undifferentiated `ERROR`.

#### 10. Reference-decode failures and frame cardinality are ambiguous

**Current.** A platform decode exception is an oracle `FAIL`; digest comparison is index-first with a 21 ms fallback, requests only the golden frame count, and does not reject extra frames. [src/core/oracles.ts:1241-1297](../../src/core/oracles.ts#L1241-L1297) [src/core/oracles.ts:2608-2630](../../src/core/oracles.ts#L2608-L2630)

**Consequence.** A browser reference-path limitation can falsely fail an engine, while duplicated/trailing frames can escape an otherwise exact comparison.

**Target.** Preflight the browser decoder with the clear reference and identical codec configuration; route reference inability to `NA_BROWSER`, but candidate-only decode failure to `FAIL`. Compare complete expected frame count and presentation timeline, with index/PTS matching documented rather than silently capped. WebCodecs explicitly allows user agents to support no codec configuration and recommends checking configuration support. [W3C WebCodecs, codec configuration support](https://www.w3.org/TR/webcodecs/#check-configuration-support)

**Verification.** Simulate an unsupported browser config, an invalid candidate under a supported config, one missing frame, one extra frame, and a legal timestamp-rounding difference; expect `NA_BROWSER`, `FAIL`, `FAIL`, `FAIL`, and `PASS`/`DIFF` according to the declared tolerance.

#### 11. Rotated decrypt throughput can have no numerator

**Current.** The benchmark derives media seconds only from golden metadata or operation metadata; DERIVED decrypt output supplies neither, and empty finite samples summarize as `n = 0`. [src/core/runner.ts:849-855](../../src/core/runner.ts#L849-L855) [src/core/runner.ts:1651-1664](../../src/core/runner.ts#L1651-L1664) [src/core/bench.ts:127-150](../../src/core/bench.ts#L127-L150)

**Consequence.** A headline throughput cell can be correctness-valid yet rank or display a zero-sample metric.

**Target.** Carry the selected source's catalog duration into measurement or obtain it once through a neutral probe, then require finite positive duration and `n > 0` for ranking. This keeps timing independent of framework-specific metadata behavior; official FFmpeg documentation is used only to delimit its CENC input support, not as the duration oracle. [FFmpeg Formats, MOV/MP4 demuxer decryption options](https://ffmpeg.org/ffmpeg-formats.html#mov_002fmp4_002f3gp_002fQuickTime)

**Verification.** Run baked and all three DERIVED CENC inputs; each passing performance cell must report the selected duration, a finite positive realtime factor, and the requested measured iteration count.

## Sources

### Repository evidence

- [src/scenarios/encryption/index.ts:58-158](../../src/scenarios/encryption/index.ts#L58-L158) — five positive rows and family concatenation.
- [src/scenarios/encryption/_shared.ts:36-220](../../src/scenarios/encryption/_shared.ts#L36-L220) — default metrics/oracles, key mirror, scenario builder, and dormant parity helper.
- [src/scenarios/encryption/metamorphic.ts:41-147](../../src/scenarios/encryption/metamorphic.ts#L41-L147) — three metamorphic/no-op rows and their shared builder.
- [src/scenarios/encryption/robustness.ts:31-101](../../src/scenarios/encryption/robustness.ts#L31-L101) — malformed CENC rows, requirements, oracle, metrics, and timeout.
- [src/scenarios/encryption/performance.ts:21-49](../../src/scenarios/encryption/performance.ts#L21-L49) — headline CENC-CTR throughput scenario.
- [src/scenarios/encryption/capability-findings.ts:24-81](../../src/scenarios/encryption/capability-findings.ts#L24-L81) — three executable unsupported-path findings.
- [src/scenarios/index.ts:33-71](../../src/scenarios/index.ts#L33-L71) — family registration and duplicate-id guard.
- [src/core/scenario.ts:17-51](../../src/core/scenario.ts#L17-L51) — requirements and oracle vocabulary.
- [src/core/scenario.ts:183-221](../../src/core/scenario.ts#L183-L221) — scenario validation and current boolean/status result model.
- [src/core/engine.ts:96-137](../../src/core/engine.ts#L96-L137) — decrypt operation, encryption-scheme union, and flat capability set.
- [src/core/engine.ts:181-236](../../src/core/engine.ts#L181-L236) — decrypt key and adapter method contract.
- [src/core/runner.ts:113-202](../../src/core/runner.ts#L113-L202) — flat declaration and browser capability negotiation.
- [src/core/runner.ts:1299-1468](../../src/core/runner.ts#L1299-L1468) — asset preflight, operation execution, oracle aggregation, benchmarking, and status routing.
- [src/core/runner.ts:1523-1710](../../src/core/runner.ts#L1523-L1710) — graceful-failure execution and benchmark measurement.
- [src/core/runner.ts:1118-1189](../../src/core/runner.ts#L1118-L1189) — exhaustive per-file aggregation.
- [src/core/oracles.ts:1241-1325](../../src/core/oracles.ts#L1241-L1325) — frame matching and the missing decrypt re-import branch.
- [src/core/oracles.ts:2608-2705](../../src/core/oracles.ts#L2608-L2705) — decrypt frame oracle and graceful-failure inference.
- [src/core/oracles.ts:2723-2927](../../src/core/oracles.ts#L2723-L2927) — baked and DERIVED decrypt metamorphic comparisons.
- [src/engines/platform/oracle-helpers.ts:108-165](../../src/engines/platform/oracle-helpers.ts#L108-L165) — neutral platform/WebCodecs decode strategy.
- [src/core/media-selection.ts:233-325](../../src/core/media-selection.ts#L233-L325) — CENC rotation and effective-scenario rewriting.
- [fixtures/media/scenarios/_sources.ndjson:128](../../fixtures/media/scenarios/_sources.ndjson#L128), [fixtures/media/scenarios/_sources.ndjson:134](../../fixtures/media/scenarios/_sources.ndjson#L134), [fixtures/media/scenarios/_sources.ndjson:140](../../fixtures/media/scenarios/_sources.ndjson#L140) — negative DERIVED CENC rows and REAL no-op corpus row.
- [fixtures/manifest.json:279-353](../../fixtures/manifest.json#L279-L353) — HLS/CENC fixture provenance and current CBCS availability.
- [fixtures/golden/hls_aes128.m3u8.keys.json:1-7](../../fixtures/golden/hls_aes128.m3u8.keys.json#L1-L7) — authoritative HLS AES-128 key/IV that disagrees with the code mirror.
- [fixtures/golden/cenc_cbcs.mp4.keys.json:1-7](../../fixtures/golden/cenc_cbcs.mp4.keys.json#L1-L7) — present CBCS key/KID record.
- [fixtures/bake.mjs:738-843](../../fixtures/bake.mjs#L738-L843) — CENC-CTR/CBCS production recipes and recorded keys.
- [fixtures/bake.mjs:1406-1417](../../fixtures/bake.mjs#L1406-L1417) — malformed encryption fixture mutations.
- [src/engines/aibrush-media/adapter.ts:3752-3801](../../src/engines/aibrush-media/adapter.ts#L3752-L3801), [src/engines/aibrush-media/adapter.ts:5564-5619](../../src/engines/aibrush-media/adapter.ts#L5564-L5619) — aibrush-media declarations and decrypt dispatch.
- [src/engines/ffmpeg-wasm/adapter.ts:1452-1512](../../src/engines/ffmpeg-wasm/adapter.ts#L1452-L1512), [src/engines/ffmpeg-wasm/adapter.ts:2071-2161](../../src/engines/ffmpeg-wasm/adapter.ts#L2071-L2161) — ffmpeg.wasm declarations and decrypt dispatch.
- [src/engines/mediabunny/adapter.ts:1029-1105](../../src/engines/mediabunny/adapter.ts#L1029-L1105), [src/engines/mediabunny/adapter.ts:1611-1661](../../src/engines/mediabunny/adapter.ts#L1611-L1661) — Mediabunny declarations, clear-output exclusion, and decrypt implementation.
- [src/engines/mp4box/adapter.ts:630-652](../../src/engines/mp4box/adapter.ts#L630-L652), [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91), [src/engines/web-demuxer/adapter.ts:618-646](../../src/engines/web-demuxer/adapter.ts#L618-L646) — adapters that declare no decrypt scheme.

### External authorities

- ISO/IEC JTC 1/SC 29, [ISO/IEC 23001-7:2023 — Common encryption in ISO base media file format files](https://www.iso.org/standard/84637.html), abstract, accessed 2026-07-16 — defines AES-CTR/CBC schemes, pattern and subsample encryption, key identification, and IV processing.
- W3C Media Working Group, [ISO Common Encryption Protection Scheme for ISO Base Media File Format Stream Format](https://www.w3.org/TR/eme-stream-mp4/), §§1–4, accessed 2026-07-16 — defines CENC/cbcs sample encryption and the protected-entry, scheme, key, auxiliary-data, and `pssh` signaling used by structural validation.
- W3C Media Working Group, [Encrypted Media Extensions](https://www.w3.org/TR/encrypted-media-2/), encryption-scheme capability and §9.1 Clear Key, accessed 2026-07-16 — distinguishes `cenc`, `cbcs`, `cbcs-1-9`, and the `org.w3.clearkey` key system.
- W3C Media Working Group, [“cenc” Initialization Data Format](https://www.w3.org/html/media/format-registry/initdata/cenc.html), §§1–4, accessed 2026-07-16 — defines concatenated `pssh` initialization data, the common SystemID, and Clear Key processing.
- R. Pantos and W. May, [RFC 8216 — HTTP Live Streaming](https://www.rfc-editor.org/rfc/rfc8216.html), §§4.3.2.4, 5.2, and 6.3.6, accessed 2026-07-16 — defines AES-128, SAMPLE-AES, PKCS#7, explicit versus media-sequence IVs, and decryption behavior.
- W3C Media Working Group, [WebCodecs](https://www.w3.org/TR/webcodecs/), abstract and configuration-support algorithms, accessed 2026-07-16 — supports the neutral browser reference design and runtime-dependent `NA_BROWSER` classification.
- W3C Web Cryptography Working Group, [Web Cryptography Level 2](https://www.w3.org/TR/webcrypto/), AES-CTR and AES-CBC, accessed 2026-07-16 — defines browser AES operations, CBC IV length, padding, and algorithm-level rejection behavior.
- FFmpeg Project, [FFmpeg Formats Documentation](https://ffmpeg.org/ffmpeg-formats.html), MOV/MP4 demuxer and muxer options, accessed 2026-07-16 — documents 16-byte CENC AES-CTR decryption keys and the MOV muxer's `cenc-aes-ctr` encryption limit.
- Mediabunny project, [Reading HLS — Encrypted content](https://mediabunny.dev/guide/reading-hls#encrypted-content), accessed 2026-07-16 — documents AES-128/SAMPLE-AES support conditions and exact KID-to-key resolution; used as target research, not proof of pinned adapter behavior.
- Axiomatic Systems, [Bento4 `mp4encrypt`](https://www.bento4.com/documentation/mp4encrypt/), usage and method specifics, accessed 2026-07-16 — distinguishes MPEG-CENC/CENS/CBCS and documents per-track key, IV, and KID inputs used for fixture production.
