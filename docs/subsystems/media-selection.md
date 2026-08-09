# Media selection

> Scope: This page owns corpus-candidate eligibility, deterministic per-scenario selection, exhaustive input enumeration, selected-byte identity, and selection provenance; [scenario](../glossary.md#scenario) meaning, [oracle](../glossary.md#oracle) comparison logic, aggregate ranking, and fixture production remain with their subsystem pages.
> Phase-2 owner: p2_subsystem_media_selection.

## Purpose

Media selection decides which concrete [input variant](../glossary.md#variant) realizes each registered [scenario](../glossary.md#scenario). It must give every scored [engine](../glossary.md#engine) in a run the same bytes, broaden coverage beyond one baked fixture, and retain enough identity to replay any finding without changing the scenario's engine-independent contract.

This boundary is also where corpus quality can otherwise be mistaken for engine quality. Readers implementing the runner, fixture pipeline, oracle system, cache, or report need to know which files were eligible, why one was chosen, which evidence survived that choice, and whether an aggregate [cell](../glossary.md#cell) represents full or [partial coverage](../glossary.md#partial-coverage).

## As-built

### Catalog and candidate eligibility

The browser loads `/fixtures/media/scenarios/_sources.ndjson`. Each nonblank line is parsed as one row and inserted into a `scenarioId`-keyed map; a fetch error, non-OK response, or parse exception is warned and converted to an empty map. Duplicate row ids therefore overwrite earlier rows, and only the presence of a string `scenarioId` is checked at the load boundary.[src/core/media-selection.ts:120-145](../../src/core/media-selection.ts#L120-L145)

The declared row schema separates scenario-level input shape from file-level observations. A file record carries a relative file name, container, video/audio codec arrays, SHA-256 text, byte size, optional duration, and—only for derived media—key material, cleartext-base identity, derivation text, and HLS member names. A row carries its source class, flattened input requirements, file list, and optional notes; additional provenance keys are accepted but have no typed runtime meaning.[src/core/media-selection.ts:24-65](../../src/core/media-selection.ts#L24-L65)

This selection catalog is distinct from `fixtures/manifest.json`. The committed fixture manifest declares a suite corpus version and baked-asset source/checksum/size metadata, but the selector does not read that version or join the two manifests.[fixtures/manifest.json:2-18](../../fixtures/manifest.json#L2-L18) The runner separately reads `fixtures/manifest.json` to index baked assets and to reject a baked entry whose checksum or size is null.[src/core/runner.ts:492-523](../../src/core/runner.ts#L492-L523)

Every successfully gathered pool starts with one baked candidate. Rotation is forced to baked-only when rotation is disabled, the catalog row is absent, the class is `SYNTHETIC` or `STREAMING`, the file list is empty, the family is robustness or streaming-output, the scenario is multi-input, the operation is seek, or a derived row is not one of the admitted CENC-in-MP4 schemes.[src/core/media-selection.ts:352-375](../../src/core/media-selection.ts#L352-L375) CENC rotation recognizes `cenc-ctr`, `cenc-cbcs`, and `cenc-cens`, using an MP4 row plus the first file's scheme or first declared encryption requirement.[src/core/media-selection.ts:158-159](../../src/core/media-selection.ts#L158-L159) [src/core/media-selection.ts:233-238](../../src/core/media-selection.ts#L233-L238)

For a rotatable row, the shape gate lowercases and exactly compares the container, requires every declared input codec token to occur in the corresponding file array, rejects video on an audio-only requirement, and checks a required encryption scheme against `file.keys.scheme`. The canonical scenario may declare a `candidateEnvelope` with inclusive minimum and maximum width, height, and duration bounds; the catalog row may add the same bounds as further restrictions. A bounded observation must be finite and present on the file record, and the scenario and catalog envelopes are conjunctive. Unknown or out-of-range metadata rejects that real candidate with `CANDIDATE_INPUT_CONTRACT_MISMATCH`.[src/core/scenario.ts](../../src/core/scenario.ts) [src/core/media-selection.ts](../../src/core/media-selection.ts) Trim additionally requires a finite catalog duration at least 20 ms beyond the larger requested boundary; the same helper can derive a seek target, although seek is already baked-only. A rejected real file is omitted and recorded in the pool; if no real survives, the independently admitted baked candidate remains.

Source envelopes are explicit scenario/catalog declarations, not filename or scenario-id heuristics. The gate does not infer profile, level, bit depth, dimensions, duration, frame cadence, channel layout, track count, or other option-conditioned traits when both declarations omit the corresponding requirement. It also does not require a video stream when `video` is true unless a required video codec token supplies that constraint.[src/core/media-selection.ts](../../src/core/media-selection.ts)

### Canonical single-file selection and exhaustive enumeration

In canonical-single mode, selection chooses the eligible candidate with the lexicographically smallest stable candidate identity. Catalog enumeration order therefore cannot change the selected input, and no run-specific value participates in the decision. The selected full path, digest, pool digest, policy version, and algorithm id remain available as durable provenance.

In exhaustive mode, the selector returns the complete canonical candidate set. The runner computes both the canonical selection and exhaustive list before iterating engine × scenario cells, so all engines share the same per-scenario input or candidate set. The browser UI checks exhaustive mode by default, while the launcher enables it through `--exhaustive`.

Catalog loading that cleanly returns an empty map still produces one baked selection per scenario. A later selection exception is different: the runner clears both maps and falls through to the legacy scenario-input path, leaving no selection object and no corpus checksum for that run.[src/core/runner.ts:1792-1824](../../src/core/runner.ts#L1792-L1824)

### Input identity, evidence, and survivor policy

A selection deliberately separates logical identity from fetch location. For baked input, `ResolvedInput.id` remains the flat scenario asset id while `urlAssetPath` points into `scenarios/<scenarioId>/`; for a real input, both become `scenarios/<scenarioId>/<file>`, and the catalog SHA-256 and size are copied as metadata.[src/core/media-selection.ts:282-325](../../src/core/media-selection.ts#L282-L325) The runner HEAD-checks a resolved URL only for a definitive 404, then lazily fetches it; catalog size becomes a `MediaInput.sizeBytes` hint, but catalog SHA-256 is not recomputed or compared with the fetched bytes.[src/core/runner.ts:548-567](../../src/core/runner.ts#L548-L567) [src/core/runner.ts:580-625](../../src/core/runner.ts#L580-L625)

Logical id controls [golden](../glossary.md#golden) lookup. The loader forms metadata, packet, frame, and SSIM URLs by appending artifact suffixes to that id and tolerates absent or non-OK artifacts.[src/core/oracles.ts:52-79](../../src/core/oracles.ts#L52-L79) Thus a nested real-file golden is used when present; absence is discovered by the oracle path, not by selection.

For an ordinary real file, selection changes only `input` and retains the scenario's oracle list.[src/core/media-selection.ts:308-325](../../src/core/media-selection.ts#L308-L325) For a derived CENC MP4 with both key and cleartext-base metadata, it instead injects that file's scheme/key/base and metamorphic invariant, deletes baked-twin golden pointers, removes `decrypt-bitexact`, and ensures `property-invariant` is present.[src/core/media-selection.ts:253-279](../../src/core/media-selection.ts#L253-L279) If either key or base metadata is missing, the defensive branch only repoints the input and performs none of that oracle surgery.[src/core/media-selection.ts:253-257](../../src/core/media-selection.ts#L253-L257)

The runner executes every remaining oracle and classifies unavailable golden evidence by matching phrases in the boolean outcome detail.[src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889) Any non-gap false outcome makes the cell [FAIL](../glossary.md#fail); otherwise one true outcome is sufficient for [PASS](../glossary.md#pass), even when other oracle outcomes are golden gaps; if nothing passes, the cell becomes [NA_ASSET](../glossary.md#na_asset).[src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447) Selection itself neither declares a minimum survivor-oracle set nor preflights that the evidence required for a meaningful verdict exists.

### Cell identity, cache reuse, and result provenance

The effective scenario preserves its registered id, family, and requirements; only its input and, for derived rotation, options/oracles differ. Consequently the public cell remains engine × registered scenario × browser. The selected input variant is additional identity: `runOne` stamps file, optional SHA-256, baked flag, candidate count, pool digest, candidate identity, and policy/algorithm ids onto `ScenarioResult.selection`. The result model also provides exhaustive per-file provenance and coverage counts.

Cache identity is implemented by temporarily suffixing the scenario id. A baked pick uses `baked`; a real pick uses the first 12 SHA-256 characters or `real:<filename>`; an exhaustive pick uses the ordered comma-joined list plus its count.[src/core/media-selection.ts:438-443](../../src/core/media-selection.ts#L438-L443) [src/core/runner.ts:1960-1979](../../src/core/runner.ts#L1960-L1979) IndexedDB's underlying key is browser, engine id, and that suffixed scenario key; a cache hit restores the registered scenario id in the live result.[src/app/result-cache.ts:43-50](../../src/app/result-cache.ts#L43-L50) [src/core/runner.ts:1981-1998](../../src/core/runner.ts#L1981-L1998) The cached result's old selection fields and environment are otherwise retained.

The run's `corpusChecksum` is a 32-bit FNV digest over sorted `scenarioId|selectedFile|catalogSha` triples. Single mode hashes only selected input variants; exhaustive mode hashes all returned candidates.[src/core/media-selection.ts:445-454](../../src/core/media-selection.ts#L445-L454) [src/core/runner.ts:1797-1803](../../src/core/runner.ts#L1797-L1803) Baked selections carry no SHA-256, so their contribution is only scenario id and filename.[src/core/media-selection.ts:290-305](../../src/core/media-selection.ts#L290-L305)

The report projects file, SHA-256, baked flag, candidate count, and exhaustive per-file evidence into conformance cells. It detects merged run checksums and warns against comparing across them.

### Exhaustive aggregation

The runner constructs a fresh engine after the first candidate, calls `runOne` for every candidate not skipped by cancellation, and collects one full result in memory per file.[src/core/runner.ts:1053-1115](../../src/core/runner.ts#L1053-L1115) Aggregation then serializes only file, optional SHA-256, baked flag, status, optional reason, and optional bench for each sub-result; it discards each file's oracle-outcome array.[src/core/runner.ts:1127-1142](../../src/core/runner.ts#L1127-L1142)

`PASS`, `FAIL`, and [ERROR](../glossary.md#error) are called admissible. Any `FAIL` or `ERROR` prevents aggregate `PASS`; a mixture containing a `FAIL` becomes top-level `FAIL`, while failures consisting only of `ERROR` become top-level `ERROR`. All passes become `PASS`. If every file is an `NA_*`, a uniform kind survives, while a mixture prefers `NA_ASSET` and otherwise takes the first kind.[src/core/runner.ts:1143-1203](../../src/core/runner.ts#L1143-L1203) Coverage records passed, admissible, and total, but has no partial/full grade.[src/core/runner.ts:1149-1165](../../src/core/runner.ts#L1149-L1165)

The report only allows top-level `PASS` cells into winner ranking and then orders those eligible engines by `coverage.passed` before the performance metric.[src/core/report.ts:622-676](../../src/core/report.ts#L622-L676) Therefore a file 01 pass plus file 02/03 failure remains inspectable in the raw exhaustive array, but it is not represented as an explicit partial-coverage grade and cannot participate as a partially covered performance result.

## Contracts and invariants

- **One common input decision per run.** Selection maps are built once before cell execution and reused across all engine columns; this enforces within-run input fairness today.[src/core/runner.ts:1781-1803](../../src/core/runner.ts#L1781-L1803)
- **Baked fallback is structurally nonempty.** Candidate construction begins with baked and adds only eligible real files. Whether the baked bytes actually exist is checked later by the runner.
- **Canonical selection is order-independent.** Single-file mode chooses the smallest stable candidate identity; explicit replay uses the recorded path and full digest.
- **Shape rejection is a corpus warning, not an engine verdict.** Files failing the selector's container/codec/encryption/duration checks never reach an [adapter](../glossary.md#adapter), and their warning is logged once per scenario.[src/core/media-selection.ts:374-390](../../src/core/media-selection.ts#L374-L390) [src/core/runner.ts:1804-1811](../../src/core/runner.ts#L1804-L1811)
- **Scenario semantics normally survive selection.** A real ordinary input preserves requirements, options, and oracles; the sole implemented selection-time semantic rewrite is the derived-CENC metamorphic path.[src/core/media-selection.ts:308-325](../../src/core/media-selection.ts#L308-L325) [src/core/media-selection.ts:253-279](../../src/core/media-selection.ts#L253-L279)
- **Logical id selects evidence; URL selects bytes.** `ResolvedInput.id` feeds golden lookup and reporting identity, while `urlAssetPath` feeds the fetch; the runner carries both through functional and benchmark executions.[src/core/runner.ts:1296-1323](../../src/core/runner.ts#L1296-L1323) [src/core/runner.ts:1369-1374](../../src/core/runner.ts#L1369-L1374)
- **A missing selected file is `NA_ASSET`.** A resolved-input 404 short-circuits before execution, while a transient HEAD problem is allowed through so a genuine fetch failure remains visible later.[src/core/runner.ts:548-567](../../src/core/runner.ts#L548-L567)
- **Catalog SHA-256 is provenance, not enforced integrity.** It is copied into selection, cache tags, and reports, but the fetched bytes are not digested; this intended integrity invariant is currently unenforced.[src/core/media-selection.ts:308-325](../../src/core/media-selection.ts#L308-L325) [src/core/runner.ts:596-625](../../src/core/runner.ts#L596-L625)
- **Exhaustive order is common, but aggregate meaning is lossy.** All engines receive the ordered candidate list, yet the aggregate retains per-file status/reason/bench rather than the complete oracle verdicts.[src/core/media-selection.ts:416-435](../../src/core/media-selection.ts#L416-L435) [src/core/runner.ts:1127-1158](../../src/core/runner.ts#L1127-L1158)
- **Cache reuse is selected-byte-sensitive only to the recorded tag.** Different real SHA prefixes or exhaustive ordered tag lists cannot reuse each other, but changed baked bytes, a collision after 12 hex characters, or changed unselected pool membership are not part of the single-file cache tag.[src/core/media-selection.ts:438-443](../../src/core/media-selection.ts#L438-L443)
- **Selection provenance is additive to scoring.** Reports carry selection and checksum data, while conformance still reads top-level status and performance ranking reads only top-level passes.[src/core/report.ts:52-70](../../src/core/report.ts#L52-L70) [src/core/report.ts:622-676](../../src/core/report.ts#L622-L676)

## Target design and known gaps

### Target design

The end state is a validated, versioned selection plan created before any engine starts. Selection is deterministic from explicit inputs, fair across engines, insensitive to incidental catalog ordering, cryptographically bound to the bytes, and lossless when exhaustive outcomes are aggregated. Benchmark disclosures must describe the tested workload and relevant conditions; this follows the general comparability and reproducibility discipline in the [SPEC CPU run and reporting rules](https://www.spec.org/cpu2017/Docs/runrules.html#rule_1.2.2).

#### 1. Validate and freeze a canonical candidate manifest

Before matrix construction, parse the entire catalog against a runtime schema and produce an immutable per-run manifest. Require one row per registered scenario id; a known source class; a nonempty, normalized relative path; finite nonnegative safe byte size; lowercase 64-hex SHA-256; internally coherent container/codec/duration/key fields; and a unique file path and unique content digest within each scenario. A repeated digest in one scenario is rejected as a duplicate candidate. The same digest may appear in different scenarios when the bytes intentionally play different roles.

Compute and verify SHA-256 over every selected file before handing it to an engine. SHA-256 is specified by [NIST FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final), and the W3C's [Subresource Integrity model](https://www.w3.org/TR/2016/REC-SRI-20160623/#resource-integrity) establishes the relevant rule: expected hash metadata must be checked against the fetched representation, not merely copied beside it. Verify `sizeBytes` in the same pass. A mismatch is a corpus-integrity issue attached to the run and scenario; it must never be attributed to an engine.

The frozen manifest must record `catalogSchemaVersion`, `selectionPolicyVersion`, full catalog SHA-256, canonical eligible-pool digest per scenario, and the baked manifest's corpus version and digest. Acquisition provenance must bind each artifact to source URL/provider, retrieval or generation activity, tool and version, input digest, derivation command, output digest, and applicable license/attribution. This follows the W3C [PROV-DM entity/activity/derivation model](https://www.w3.org/TR/prov-dm/Overview.html#section-prov-overview) and SLSA's definition of [verifiable provenance](https://slsa.dev/spec/v1.2/provenance) as where, when, and how an artifact was produced.

Acceptance criteria:

1. Row order and object-key order produce the same canonical manifest digest and candidate identities.
2. Duplicate row ids, paths, or in-scenario digests are diagnosed before engine construction; no silent last-row-wins behavior remains.
3. A size or SHA-256 mismatch prevents those bytes from reaching every engine and produces one engine-independent corpus issue.
4. If no verified candidate remains, do not draw or invoke an engine. Emit `NA_ASSET` for the affected cells with the same structured corpus reason and record `eligible=0`; do not emit `ERROR` and do not silently use an unverified legacy path.
5. A missing/invalid catalog may choose an explicitly configured baked-only fallback, but the report must say `catalogState=fallback`, include its reason, and cryptographically identify the baked manifest used.

#### 2. Keep canonical selection stable and replayable

Within each scenario, duplicate paths or byte-identical files cannot silently create additional candidates. Single-file mode chooses the lexicographically smallest stable candidate identity, independent of catalog enumeration order or run-local state.

Record the selection algorithm id/version, exact selected logical path and full SHA-256, eligible-pool digest, and candidate count. Replay by recorded path plus digest must work even if the live catalog later changes, while ordinary pool replay rejects a pool-digest mismatch.

Version the algorithm so any future decision-rule change explicitly invalidates prior cache contracts.

Acceptance criteria:

1. The same policy version, scenario id, and eligible-pool digest select the same full digest in every supported browser and after reload.
2. Reordering catalog rows or file entries never changes the pick.
3. Adding or removing a candidate follows the documented candidate-identity minimum.
4. Duplicate-content fixtures are rejected rather than admitted as distinct candidates.
5. A recorded failing digest is directly replayable as an explicit input.

#### 3. Make survivor-oracle sufficiency explicit

The selection plan must contain a typed oracle-evidence plan for every candidate. Each oracle declares whether it needs a source-keyed golden, candidate-output decode, [reference re-import](../glossary.md#reference-re-import), metamorphic peer, browser capability, or other evidence; the scenario declares which set is sufficient for `PASS`. Missing evidence yields a structured unavailable reason, never a phrase that downstream code must recognize.

A rotated candidate may pass only when its declared sufficient set rendered semantic verdicts. “At least one oracle passed” is not a general sufficiency rule. If a required golden is absent and remaining checks are merely supplemental, the file is `NA_ASSET`; if a designated golden-free survivor set is sufficient, it may carry the verdict and the unavailable checks remain visible. Per-file goldens and retained cleartext bases must themselves name the exact source SHA-256 they cover, so manifest drift cannot pair new media with stale evidence.

For derived CENC candidates, key material, scheme, cleartext-base path, full base digest, and the declared metamorphic survivor are mandatory eligibility fields. Missing any one makes the candidate an engine-independent corpus/evidence gap; never run it with baked-twin keys or oracles.

Acceptance criteria:

1. No result status depends on matching free-form oracle-detail text.
2. Every candidate report lists required, applied, unavailable, and sufficient survivor oracles.
3. A strong required oracle missing plus a weak supplemental pass cannot produce top-level `PASS`.
4. A complete CENC candidate runs only its own key/base-bound invariant; a key/base/evidence mutation is caught before any adapter call.
5. A file with no sufficient evidence remains visible as `NA_ASSET` in the exhaustive denominator rather than being silently removed to improve coverage.

#### 4. Preserve exhaustive per-file semantics and grade partial coverage

An exhaustive cell must retain one sub-result for every frozen input variant, including full identity, `PASS` / [DIFF](../glossary.md#diff) / `FAIL` or applicable `NA_*` verdict, structured reason, all oracle outcomes, and measurement summary. `DIFF` means valid output with a representation different from the ffmpeg-baked anchor; it counts as semantically acceptable coverage but stays diagnostically distinct from `PASS`. Selection and aggregation must not turn a [representation difference](../glossary.md#representation-difference) into wrongness.

Add a coverage grade separate from the top-level semantic verdict: `FULL` when all eligible input variants are semantically acceptable, `PARTIAL` when at least one is acceptable and at least one is `FAIL` or `NA_*`, and `NONE` when no input variant rendered a semantic verdict. The denominator is the frozen eligible candidate count, not the number that happened to execute. Report counts for pass, diff, fail, each NA kind, and harness interruption, plus exact failing file and full digest identities.

A true failing input variant still makes the aggregate semantic verdict `FAIL`; a representation-only difference makes it `DIFF` only when no input variant truly fails; all-valid same-representation output is `PASS`. If at least one input variant is `PASS` and all others are `NA_*`, top-level remains `PASS` with `coverageGrade=PARTIAL`; a `DIFF` plus only `PASS`/`NA_*` remains `DIFF`, with the grade determined by whether an NA exists. `ERROR` is reserved for a harness failure that prevents constructing trustworthy per-file results. In particular, “01 passes; 02 and 03 fail” is `coverageGrade=PARTIAL`, `1/3` semantically acceptable, with top-level `FAIL`—never a collapsed `ERROR`. Mixed NA kinds remain separate counts instead of arbitrarily preferring `NA_ASSET`.

Performance aggregation may use only semantically acceptable input variants and must disclose its numerator and denominator. Cross-engine ranking compares like-for-like full candidate sets; lower coverage cannot win by being faster on fewer files. This is consistent with SPEC's practice of running all workloads in a suite and validating their outputs before computing reportable metrics.[SPEC CPU 2017, Test Methods](https://www.spec.org/cpu2017/Docs/runrules.html#rule_1.2.1)

Acceptance criteria:

1. A fixture with file 01 `PASS`, file 02 `FAIL`, and file 03 `FAIL` serializes all three oracle-outcome arrays, reports `PARTIAL`, denominator `3`, and the two failing full identities; its top-level status is `FAIL`, not `ERROR`.
2. A `PASS` + `DIFF` set remains fully semantically covered and is diagnostically `DIFF`, not `FAIL`.
3. A `PASS` + [NA_ENGINE](../glossary.md#na_engine) set reports partial `1/2` coverage; the NA does not disappear from the denominator.
4. All-NA sets retain per-kind counts and `NONE`; cancellation retains explicit unexecuted identities instead of shrinking `total`.
5. JSON, Markdown, and UI views expose the same denominator and failing identities. See [reporting and aggregation](../subsystems/reporting-aggregation.md) and [runner and capability negotiation](../subsystems/runner-capability-negotiation.md) for their owning presentation and routing contracts.

#### 5. Bind cache and reports to the executed contract

Replace the 12-hex/filename tags and 32-bit FNV checksum with full SHA-256 identities over canonical data. Record two distinct values: `eligiblePoolDigest` for all candidate identities and selection policy, and `executedInputDigest` for the exact single candidate or exhaustive set actually run. Include the baked file's verified digest. The public scenario id remains unchanged.

A reusable observation key must include engine/version, browser and relevant runtime configuration, scenario-contract fingerprint, oracle/evidence-contract fingerprint, exact executed input digest(s), and benchmark configuration. A cache hit must retain the current pool digest, candidate count, corpus state, and timestamps; stale provenance from the stored run must not leak into the new report. Full disclosure of performance-relevant conditions is a core reproducibility requirement in the [SPEC reporting rules](https://www.spec.org/cpu2017/Docs/runrules.html#rule_4.0).

Acceptance criteria:

1. Changing baked or real bytes changes the cache key and both executed/corpus digests.
2. A SHA-256 prefix collision or same filename with different bytes cannot hit the same cache entry.
3. Reordering an unchanged exhaustive set does not invalidate a canonical set cache key; adding, removing, or changing one member does.
4. Changing the oracle/scenario contract invalidates the observation even when input bytes are unchanged.
5. Reusing identical bytes retains a trace to the original observation while using current run timestamps and environment evidence.

#### 6. Test the policy as a property, not only as examples

Keep focused example tests for baked-only families, shape/duration boundaries, id/URL separation, and CENC rewrite. Add property tests over generated row permutations, candidate additions/removals, duplicate content, malformed fields, and empty pools.

The test suite must cover `candidatesForRun`, integration with `runMatrix`, cache hits, and report serialization—not just `selectForRun`. Assert each `selectionPolicyVersion` and algorithm id so later decision-rule changes are intentional.

### Known gaps

#### Catalog validation and integrity are permissive

**Current.** The loader casts parsed JSON after checking only `scenarioId`, duplicate ids overwrite, extra fields are ignored, and the selector trusts catalog SHA-256/size without hashing fetched bytes.[src/core/media-selection.ts:120-145](../../src/core/media-selection.ts#L120-L145) [src/core/runner.ts:580-625](../../src/core/runner.ts#L580-L625)

**Consequence.** Malformed metadata can collapse selection to baked-only, duplicated bytes can bias sampling, and a stale or replaced file can be reported under a digest it does not have. The latter breaks the content-integrity property that [FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final) digests are intended to provide.

**Target.** Apply the validated, canonical, digest-verifying manifest contract above; keep corpus failures separate from engine verdicts.

**Verification.** Mutation tests for row duplication, path traversal, invalid class/codec/duration/size/hash, duplicate digest, truncated bytes, and same-path replacement all fail before the first adapter call and serialize one stable corpus issue.

#### Canonical selection identity

**Current.** Selection uses the stable candidate-identity minimum and records the policy, algorithm, pool, candidate, and executed-input identities.

**Verification.** Cross-browser selection survives row permutations and reloads; pool drift is detected; an explicitly recorded failed digest replays even after unrelated candidates are added.

#### Duplicate candidate identity

**Current.** Candidate paths and content digests must be unique within a scenario.

**Target.** Keep duplicate detection fail-closed and make any future grouping or strata explicit versioned manifest fields.

**Verification.** Duplicate-content fixtures are rejected; reports enumerate the canonical pool.

#### Survivor-oracle routing is implicit and brittle

**Current.** Ordinary real selection retains all oracles; the runner later recognizes evidence gaps by detail substrings and allows any remaining true outcome to carry `PASS`.[src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889) [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447) A derived CENC record missing key/base metadata bypasses the intended rewrite.[src/core/media-selection.ts:253-257](../../src/core/media-selection.ts#L253-L257)

**Consequence.** Copy changes can alter status routing, a weak survivor can conceal unavailable required evidence, and an incomplete derived record can be executed with stale baked assumptions.

**Target.** Use typed evidence requirements, candidate-specific sufficient sets, digest-bound goldens/bases, and fail-closed CENC eligibility.

**Verification.** Oracle wording mutations cannot change status; missing strong evidence plus weak survivor becomes `NA_ASSET`; incomplete CENC candidates never reach an engine.

#### Exhaustive aggregation erases decisive detail and has no partial grade

**Current.** Raw exhaustive entries omit each sub-result's oracle outcomes, report projection drops per-file reason/bench, and a pass mixed only with errors collapses to top-level `ERROR`; coverage has counts but no grade.[src/core/runner.ts:1127-1203](../../src/core/runner.ts#L1127-L1203) [src/core/report.ts:541-555](../../src/core/report.ts#L541-L555)

**Consequence.** Later agents cannot reconstruct why each file passed or failed, UI/report layers cannot distinguish full from partial coverage consistently, and “passes 01, fails 02/03” can be presented as execution failure instead of a useful robustness gradient.

**Target.** Preserve per-file PASS/DIFF/FAIL/NA verdicts and oracle outcomes, make partial coverage a separate grade, reserve `ERROR` for a harness-level inability to form trustworthy results, and expose denominator plus failing identities everywhere. Benchmark methodology should run and validate the declared workload set consistently, as [SPEC's test-method rules](https://www.spec.org/cpu2017/Docs/runrules.html#rule_1.2.1) illustrate.

**Verification.** The mandatory 01-pass/02-and-03-fail integration fixture produces `PARTIAL`, `1/3`, top-level `FAIL`, full file/hash identities, and identical JSON/Markdown/UI data—never aggregate `ERROR`.

#### Cache and corpus identity are too weak and can retain stale provenance

**Current.** Real cache tags truncate SHA-256 to 12 hex characters, baked tags omit content identity, corpus checksum is a 32-bit FNV digest, and a cache hit restores only scenario id while retaining the stored result's old selection/environment.[src/core/media-selection.ts:438-454](../../src/core/media-selection.ts#L438-L454) [src/core/runner.ts:1981-1998](../../src/core/runner.ts#L1981-L1998)

**Consequence.** Byte changes can evade identity for baked inputs, collisions are needlessly plausible relative to full SHA-256, pool changes can reuse stale candidate counts, and reports may describe the prior run envelope instead of the current one. A secure digest should detect changed messages, which is the defined purpose of [FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final).

**Target.** Use canonical full-digest observation keys, separate eligible-pool and executed-input digests, include contract fingerprints, and re-envelope cache hits with current provenance.

**Verification.** Baked mutation, prefix collision, pool-only drift, oracle-contract change, and identical-byte reuse tests each demonstrate the intended hit/miss and current-envelope behavior.

#### Current tests stop before exhaustive integration

**Current.** The unit script covers canonical single selection, exhaustive candidate enumeration, shape and duration gates, baked-only policies, id/URL behavior, CENC rewrite, cache tags, checksum order independence, seek exclusion, and fetch fallback. The Bun test suite covers selection-to-runner cache reuse and report integration.

**Consequence.** Catalog reorder churn, duplicate weighting, digest verification, empty verified pools, survivor sufficiency, cache re-enveloping, and required partial-coverage semantics have no executable guard.

**Target.** Add the policy-property and end-to-end acceptance suite described above; persist exact counterexample identities, following Hypothesis's recommendation to promote important generated failures into explicit examples.[Hypothesis, “Replaying failed tests”](https://hypothesis.readthedocs.io/en/latest/tutorial/replaying-failures.html#using-example-to-run-a-specific-input)

**Verification.** CI exercises canonical-single and exhaustive modes through report JSON and proves the acceptance matrix for PASS/FAIL/NA, denominators, failing identities, cache behavior, and manifest drift.

## Sources

### Repository evidence

- [src/core/media-selection.ts:24-65](../../src/core/media-selection.ts#L24-L65) — source-row and file-record schema, including shape, digest, size, derived-key, and provenance-extension fields.
- [src/core/media-selection.ts:83-103](../../src/core/media-selection.ts#L83-L103) — selection output and unchanged-scenario contract.
- [src/core/media-selection.ts:120-145](../../src/core/media-selection.ts#L120-L145) — catalog fetch, line parsing, map insertion, and empty-map fallback.
- [src/core/media-selection.ts:158-159](../../src/core/media-selection.ts#L158-L159) — admitted CENC rotation schemes.
- [src/core/media-selection.ts:173-230](../../src/core/media-selection.ts#L173-L230) — shape and duration eligibility rules.
- [src/core/media-selection.ts:233-279](../../src/core/media-selection.ts#L233-L279) — derived-CENC classification and candidate-specific oracle/options rewrite.
- [src/core/media-selection.ts:282-325](../../src/core/media-selection.ts#L282-L325) — baked/real logical id, fetch path, digest, and size construction.
- [src/core/media-selection.ts:352-390](../../src/core/media-selection.ts#L352-L390) — baked-only policy, stable pool construction, and warnings.
- [src/core/media-selection.ts](../../src/core/media-selection.ts) — canonical-single selection and exhaustive enumeration.
- [src/core/media-selection.ts:438-454](../../src/core/media-selection.ts#L438-L454) — cache tags and 32-bit corpus checksum.
- [src/core/runner.ts:492-523](../../src/core/runner.ts#L492-L523) — separate baked fixture-manifest consumption.
- [src/core/runner.ts:548-625](../../src/core/runner.ts#L548-L625) — selected-file presence check, lazy fetch, and unverified size hint.
- [src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889) — phrase-based golden/evidence-gap recognition.
- [src/core/runner.ts:1053-1203](../../src/core/runner.ts#L1053-L1203) — exhaustive execution, lossy sub-result projection, coverage, and aggregate status.
- [src/core/runner.ts:1258-1279](../../src/core/runner.ts#L1258-L1279) — per-result selection provenance.
- [src/core/runner.ts:1296-1323](../../src/core/runner.ts#L1296-L1323) — resolved-input authority and missing-asset routing.
- [src/core/runner.ts:1369-1374](../../src/core/runner.ts#L1369-L1374) — resolved inputs carried into actual execution.
- [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447) — survivor-oracle status policy.
- [src/core/runner.ts:1781-1824](../../src/core/runner.ts#L1781-L1824) — once-per-run selection, checksum, warnings, and fallback.
- [src/core/runner.ts:1960-1998](../../src/core/runner.ts#L1960-L1998) — selection-sensitive cache key and cache-hit restoration.
- [src/core/oracles.ts:52-79](../../src/core/oracles.ts#L52-L79) — id-derived golden URLs and missing-artifact tolerance.
- [src/core/scenario.ts:287-349](../../src/core/scenario.ts#L287-L349) — result selection, exhaustive detail, and coverage types.
- [src/core/report.ts:52-70](../../src/core/report.ts#L52-L70) — conformance selection/exhaustive projection contract.
- [src/core/report.ts:317-343](../../src/core/report.ts#L317-L343) — cross-corpus warning and report-level provenance.
- [src/core/report.ts:541-555](../../src/core/report.ts#L541-L555) — concrete projection of selection and exhaustive status.
- [src/core/report.ts:622-676](../../src/core/report.ts#L622-L676) — top-level-PASS eligibility and coverage-first ranking.
- [src/app/main.ts:228-250](../../src/app/main.ts#L228-L250) — browser UI exhaustive-mode default path.
- [src/app/main.ts](../../src/app/main.ts) — canonical run configuration and runner options.
- [src/app/result-cache.ts:43-50](../../src/app/result-cache.ts#L43-L50) — IndexedDB result-key components and epoch invalidation.
- [scripts/launch.mjs](../../scripts/launch.mjs) — launcher exhaustive and reuse flags.
- [scripts/test-media-selection.mjs:15-21](../../scripts/test-media-selection.mjs#L15-L21) — tested selector API surface.
- [scripts/test-media-selection.mjs:51-130](../../scripts/test-media-selection.mjs#L51-L130) — deterministic reachability and shape-gate tests.
- [scripts/test-media-selection.mjs:134-227](../../scripts/test-media-selection.mjs#L134-L227) — baked-only and id/URL tests.
- [scripts/test-media-selection.mjs:230-367](../../scripts/test-media-selection.mjs#L230-L367) — CENC, checksum/cache, duration, seek, and fallback tests.
- [fixtures/manifest.json:2-18](../../fixtures/manifest.json#L2-L18) — baked manifest corpus version and source/checksum/size example.

### External authorities

- National Institute of Standards and Technology, *FIPS PUB 180-4: Secure Hash Standard (SHS)*, [publication page and DOI](https://csrc.nist.gov/pubs/fips/180-4/upd1/final), accessed 2026-07-16 — specifies SHA-256 and the use of message digests to detect changed content.
- World Wide Web Consortium, *Subresource Integrity*, W3C Recommendation 23 June 2016, §1.2 “Resource Integrity,” [stable Recommendation](https://www.w3.org/TR/2016/REC-SRI-20160623/#resource-integrity), accessed 2026-07-16 — supports verifying fetched representations against expected cryptographic hash metadata.
- World Wide Web Consortium, *PROV-DM: The PROV Data Model*, W3C Recommendation 30 April 2013, §§2.1.1-2.1.2, [PROV overview](https://www.w3.org/TR/prov-dm/Overview.html#section-prov-overview), accessed 2026-07-16 — supports recording entities, producing/using activities, and derivation relationships for corpus artifacts.
- Supply-chain Levels for Software Artifacts, *SLSA Specification v1.2: Provenance*, [approved specification](https://slsa.dev/spec/v1.2/provenance), accessed 2026-07-16 — supports verifiable records of where, when, and how artifacts were produced.
- Hypothesis maintainers, *Hypothesis documentation*, [official project documentation](https://hypothesis.readthedocs.io/en/latest/), accessed 2026-07-16 — supports property-based generation over declared input domains.
- Standard Performance Evaluation Corporation, *SPEC CPU 2017 Run and Reporting Rules*, §§1.2.1-1.3.1 and §4, [official rules](https://www.spec.org/cpu2017/Docs/runrules.html), accessed 2026-07-16 — supports complete workload execution, output validation, disclosure of observation conditions, and reproducible benchmark reporting.
