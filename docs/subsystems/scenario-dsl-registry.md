# Scenario DSL and registry

> Scope: This page owns scenario and result declarations, definition-time validation, deterministic family/scenario expansion, registry behavior, and application wiring; operation execution, oracle algorithms, media selection policy, reporting, and adapter internals belong to their subsystem pages.
> Phase-2 owner: p2_subsystem_scenario_dsl_registry.

## Purpose

The scenario DSL is the engine-independent specification boundary for every benchmark [scenario](../glossary.md#scenario). It must say what is exercised, what evidence decides correctness, what can be measured, and what capabilities make a cell applicable without embedding framework-specific behavior. Scenario authors, the runner, oracle authors, adapters, the UI, result-cache readers, and offline reporters all depend on this contract remaining stable.

The registry turns those declarations into a reproducible matrix. Its output must be complete, uniquely identified, consistently ordered, and versioned strongly enough that a stored result cannot silently acquire the meaning of a changed scenario. General execution policy is specified in [runner and capability negotiation](runner-capability-negotiation.md), oracle semantics in the [oracle system](oracle-system.md), and result presentation in [reporting and aggregation](reporting-aggregation.md).

## As-built

### Declaration vocabulary and light validation

`Requires` is a collection of flat arrays: required operations; input and output containers; generic, input-side, and output-side video/audio codecs; encryption schemes; and feature strings. Direction-specific codec arrays are optional and fall back later to the generic codec arrays. There is no tuple or alternative-expression field in this model. [src/core/scenario.ts:17-31](../../src/core/scenario.ts#L17-L31)

`OracleId` and `MetricId` are closed TypeScript string unions. The oracle union names the evaluator dispatched by `runOracle`; the metric union names measurements and possible primary ranking metrics. These declarations constrain typed callers at build time, but are not runtime registries with per-id metadata or applicability rules. [src/core/scenario.ts:35-72](../../src/core/scenario.ts#L35-L72) [src/core/oracles.ts:431-479](../../src/core/oracles.ts#L431-L479)

`ScenarioSpec` carries a claimed-stable `family/name` id, one operation, one asset id or an asset-id array, untyped/operation-specific options, requirements, ordered oracle and metric lists, an optional primary metric and tolerances, an optional byte-mutation callback, timeout, and notes. `Scenario` adds a derived family. An input array means multiple inputs to one operation; it is not a scenario-variant abstraction. [src/core/scenario.ts:145-180](../../src/core/scenario.ts#L145-L180) [src/core/scenario.ts:127-129](../../src/core/scenario.ts#L127-L129)

`defineScenario()` currently checks only that the id is non-empty and contains `/`, that `requires.operations` is non-empty, and that at least one oracle is present. It then casts the first id segment to `ScenarioFamily`; it does not prove that the prefix is a known family or that it matches any independently declared value. It does not validate input, `op`/requirement alignment, tokens, options, metrics, primary metric, tolerance ranges, timeout, or callback placement. [src/core/scenario.ts:183-204](../../src/core/scenario.ts#L183-L204)

Family-specific helper functions act as a source-level DSL over case tables. For example, the remux helper deterministically derives the id/options/requirements and maps every case through `defineScenario()` immediately. These builders return materialized `Scenario[]`; no lazy scenario factory survives registration. [src/scenarios/remux/_shared.ts:72-108](../../src/scenarios/remux/_shared.ts#L72-L108) Video transcode case tables are expanded eagerly in the same way. [src/scenarios/transcode/index.ts:284-320](../../src/scenarios/transcode/index.ts#L284-L320)

The word [variant](../glossary.md#variant) has several distinct runtime shapes rather than one DSL field. `TranscodeOptions.variants` is an array of video configurations for ABR rendition variants. [src/core/engine.ts:155-161](../../src/core/engine.ts#L155-L161) Media selection creates a shallow `effectiveScenario` clone for a chosen input variant and may replace input/options/oracles for derived encrypted media. [src/core/media-selection.ts:253-325](../../src/core/media-selection.ts#L253-L325) Exhaustive selection materializes an ordered baked-plus-real candidate list outside the scenario declaration. [src/core/media-selection.ts:328-389](../../src/core/media-selection.ts#L328-L389)

### Families, grouping, and ordering

The family vocabulary, canonical family order, and display labels are separately declared in `scenario.ts`. `groupScenariosByFeature()` buckets its input by family, emits only populated families in `SCENARIO_FAMILY_ORDER`, and preserves the incoming order within each family. [src/core/scenario.ts:74-119](../../src/core/scenario.ts#L74-L119) [src/core/scenario.ts:131-143](../../src/core/scenario.ts#L131-L143)

There are two battery-assembly paths. `src/scenarios/index.ts` statically imports all 13 family arrays, places them in canonical order, flattens them eagerly, asserts global id uniqueness at module evaluation, and offers `registerAllScenarios()`. [src/scenarios/index.ts:18-50](../../src/scenarios/index.ts#L18-L50) [src/scenarios/index.ts:52-72](../../src/scenarios/index.ts#L52-L72) The browser boot path does not call that function: `src/app/register.ts` maintains its own lazy-import list and registers each resolved family directly. [src/app/register.ts:94-147](../../src/app/register.ts#L94-L147)

Those two order declarations already differ: the canonical order puts robustness before performance, while the application wiring puts performance before robustness. The UI hides that difference by regrouping registry output through the canonical family order, but `listScenarios()` itself preserves registry insertion order. [src/core/scenario.ts:89-103](../../src/core/scenario.ts#L89-L103) [src/app/register.ts:128-147](../../src/app/register.ts#L128-L147) [src/app/main.ts:119-133](../../src/app/main.ts#L119-L133)

### Engine and scenario registries

The core registry stores engines and scenarios in module-global `Map`s. Engine registration rejects duplicate registry ids and stores a factory plus `instrumentOnly`; scenario registration rejects duplicate scenario ids and stores the object reference as supplied. Bulk scenario registration is a simple loop, so a failure after earlier insertions does not roll back the partial batch. [src/core/registry.ts:18-51](../../src/core/registry.ts#L18-L51)

`listEngines()` and `listScenarios()` expose `Map` values in insertion order. `listScoredEngines()` filters out instrument-only registrations while `getEngine()` can still resolve them. No list function sorts, copies nested declaration data, freezes objects, or attaches a registry revision. [src/core/registry.ts:54-77](../../src/core/registry.ts#L54-L77)

The application lazily imports six scored engine adapters plus the platform reference instrument. Each engine module supplies its own registration helper, which ultimately registers a factory rather than a live engine instance. [src/app/register.ts:37-92](../../src/app/register.ts#L37-L92) `registerAll()` awaits those imports sequentially, then awaits each scenario-family import sequentially; it catches and reports each engine/family failure and returns actual registry counts. A family that throws during its bulk registration is reported with count zero even though earlier members may already have been inserted. [src/app/register.ts:149-181](../../src/app/register.ts#L149-L181)

At boot, the application registers first, then builds scored-engine and grouped-scenario pickers from registry lists; failed wirings are surfaced in the registration banner. [src/app/main.ts:97-140](../../src/app/main.ts#L97-L140) The default runner likewise reads registered scenarios, applies id/family/operation/pillar filters, and expands a scenario-major then engine-minor execution queue; optional shuffling is the only later order change. [src/core/runner.ts:428-440](../../src/core/runner.ts#L428-L440) [src/core/runner.ts:1734-1766](../../src/core/runner.ts#L1734-L1766)

### Runtime interpretation and result model

The [capability gate](../glossary.md#capability-gate) interprets every array entry as an independent required [capability token](../glossary.md#capability-token): any missing operation, container, codec, encryption scheme, or feature yields `NA_ENGINE`. Directional codecs fall back to the generic arrays. Browser checks then use flattened required codec lists and the operation/options to choose decode versus encode checks. [src/core/runner.ts:124-205](../../src/core/runner.ts#L124-L205) [src/core/runner.ts:219-334](../../src/core/runner.ts#L219-L334)

Browser codec support is precomputed once per run from representative configurations: video tokens are probed at 1920×1080 and audio tokens at 48 kHz stereo. The result is reduced to one decode and one encode boolean per codec token, losing the exact profile/dimensions/rate/channels/description combination a concrete input may require. [src/core/feature-detect.ts:315-379](../../src/core/feature-detect.ts#L315-L379)

After negotiation, the runner executes the operation and maps an error whose `name` is exactly `NotApplicableError` to `NA_ENGINE`; other operation exceptions escape to the outer `ERROR` mapping. [src/core/runner.ts:686-693](../../src/core/runner.ts#L686-L693) [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393) [src/core/runner.ts:1464-1468](../../src/core/runner.ts#L1464-L1468) This typed-by-name runtime escape hatch can catch [combinatorial support](../glossary.md#combinatorial-support) that the flat gate did not express, but the scenario definition cannot declare that tuple itself.

The current `ResultStatus` union is `PASS | FAIL | NA_ENGINE | NA_BROWSER | NA_ASSET | ERROR | SKIPPED`; it has no `DIFF`. Each `OracleOutcome` instead carries `pass: boolean`, optional detail, and numeric measurements. [src/core/scenario.ts:208-222](../../src/core/scenario.ts#L208-L222) Oracle helpers construct only true/false outcomes. [src/core/oracles.ts:4262-4266](../../src/core/oracles.ts#L4262-L4266)

The runner reduces boolean outcomes by selecting the first non-golden-gap false outcome as `FAIL`, otherwise accepting any true outcome as `PASS`, or returning `NA_ASSET` if nothing passed and only recognized gaps remain. Oracle unavailability is recognized from substrings in human-readable detail, such as `golden absent` and `packet table unreadable`, rather than a discriminated field. [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447) [src/core/runner.ts:858-873](../../src/core/runner.ts#L858-L873) A representation difference and a semantic defect therefore have the same `pass: false` representation unless individual oracle code has already normalized the difference away.

`ScenarioResult` repeats the engine/browser/scenario/family identity, cell status, reason, oracle outcomes, optional correctness-gated bench, primary metric, selection, exhaustive sub-results, coverage, environment, and timing. Each exhaustive sub-result retains file/status/reason/bench but not its oracle outcomes. [src/core/scenario.ts:269-330](../../src/core/scenario.ts#L269-L330) Exhaustive aggregation counts `PASS`, `FAIL`, and `ERROR` as admissible; any failed file collapses the top-level cell to `FAIL` if at least one sub-result failed, otherwise `ERROR`, while only an all-pass admissible set becomes `PASS`. [src/core/runner.ts:1127-1204](../../src/core/runner.ts#L1127-L1204)

The browser download envelope labels results `media-browser-test/results@1`. [src/app/main.ts:393-402](../../src/app/main.ts#L393-L402) IndexedDB stores `ScenarioResult` values under browser/engine/scenario keys, uses a hand-maintained validation epoch for old PASS invalidation, and trusts the stored object after a TypeScript cast rather than runtime schema validation. [src/app/result-cache.ts:43-55](../../src/app/result-cache.ts#L43-L55) [src/app/result-cache.ts:97-123](../../src/app/result-cache.ts#L97-L123)

## Contracts and invariants

- **Engine independence.** A scenario has no engine-id field and the runner presents the same declaration to each selected engine. This is structurally represented by `ScenarioSpec` and by matrix expansion over registry engines, not checked through a separate policy validator. [src/core/scenario.ts:154-180](../../src/core/scenario.ts#L154-L180) [src/core/runner.ts:428-440](../../src/core/runner.ts#L428-L440)

- **Identity.** The declared contract calls `ScenarioSpec.id` stable. Today the enforced portion is only “contains a slash” plus duplicate rejection at registration; disabled-cell rules, cache keys, result joins, and user filters all treat the exact string as identity. [src/core/scenario.ts:154-156](../../src/core/scenario.ts#L154-L156) [src/core/registry.ts:43-47](../../src/core/registry.ts#L43-L47) [src/app/result-cache.ts:43-50](../../src/app/result-cache.ts#L43-L50)

- **Definition minimum.** Registration-time creation requires at least one required operation and one [oracle](../glossary.md#oracle). No current invariant requires a non-empty input, a known family prefix, `op` to appear in `requires.operations`, unique tokens, a non-empty metric list, `primaryMetric` to be measured, finite tolerances, or a positive timeout. [src/core/scenario.ts:193-204](../../src/core/scenario.ts#L193-L204)

- **Family presentation.** Canonical grouping order is `SCENARIO_FAMILY_ORDER`; only populated families are returned and scenario order inside a family is inherited from registration input. The registry itself promises no canonical sort beyond `Map` insertion behavior. [src/core/scenario.ts:89-103](../../src/core/scenario.ts#L89-L103) [src/core/scenario.ts:131-143](../../src/core/scenario.ts#L131-L143) [src/core/registry.ts:72-77](../../src/core/registry.ts#L72-L77)

- **Duplicate handling.** A duplicate engine or scenario id throws. The eager all-family module checks the whole flattened battery before its bulk registration, but the application’s lazy path validates and commits one scenario at a time and is not transactional. [src/core/registry.ts:32-51](../../src/core/registry.ts#L32-L51) [src/scenarios/index.ts:52-71](../../src/scenarios/index.ts#L52-L71) [src/app/register.ts:165-173](../../src/app/register.ts#L165-L173)

- **Applicability precedence.** The current gate checks engine declarations first and returns `NA_ENGINE` before checking browser support; the runner maps a runtime `NotApplicableError` to the same non-failure status. This precedence is enforced, while the concrete unsupported tuple is not represented in `Requires`. [src/core/runner.ts:124-200](../../src/core/runner.ts#L124-L200) [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393)

- **Oracle reduction.** Current cell correctness is binary: any real false outcome becomes `FAIL`; otherwise at least one true outcome permits `PASS`. `DIFF` is not implemented in either `OracleOutcome` or `ResultStatus`. [src/core/scenario.ts:208-222](../../src/core/scenario.ts#L208-L222) [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447)

- **Correctness-gated measurement.** The runner starts performance measurement only after current binary oracle reduction has produced `PASS`, and reporting only admits `PASS` cells to winner calculation. [src/core/runner.ts:1445-1468](../../src/core/runner.ts#L1445-L1468) [src/core/report.ts:622-650](../../src/core/report.ts#L622-L650)

- **Exhaustive traceability.** One [cell](../glossary.md#cell) can retain per-input statuses and coverage counts, but its top-level status is an all-pass reduction and only the first failing or passing file’s oracle outcomes survive at cell level. [src/core/runner.ts:1127-1204](../../src/core/runner.ts#L1127-L1204)

- **Stored-result compatibility.** The downloadable envelope has a v1 schema label, but individual results have no schema version, scenario revision, definition hash, or input-variant id. Cached reads accept the stored TypeScript-shaped value without validating it. [src/app/main.ts:393-402](../../src/app/main.ts#L393-L402) [src/core/scenario.ts:269-318](../../src/core/scenario.ts#L269-L318) [src/app/result-cache.ts:97-110](../../src/app/result-cache.ts#L97-L110)

## Target design and known gaps

### Target design

Everything in this subsection is a required target; none of it is implemented by the current citations above.

#### A versioned, immutable definition model

Introduce `ScenarioDefinitionV2` as the canonical, JSON-safe declaration and keep runtime handlers in named registries. At minimum it contains `schemaVersion: 2`, `id`, `revision`, explicit `family`, `order`, `op`, `inputs`, an operation-discriminated `options` object, `requires`, oracle specifications, metric specifications, tolerances, timeout, and notes. Replace the non-serializable `mutate` callback with `{ mutationId, parameters }`, resolved only after definition validation. Structural validation should use a published JSON Schema Draft 2020-12 schema: that vocabulary provides `type`, `enum`, `required`, `minItems`, `uniqueItems`, and conditional/applicator building blocks for this purpose. [JSON Schema’s validation vocabulary](https://json-schema.org/draft/2020-12/json-schema-validation#section-6) defines those assertions. This runtime boundary is necessary because [TypeScript erases types](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch#erased-types) before JavaScript executes.

Validation is two-layered and fail-fast. The structural schema rejects unknown family/operation/oracle/metric/token values, missing or extra fields, malformed ids, empty/duplicate arrays, non-finite or out-of-range numbers, and wrong option shapes. A semantic validator then enforces cross-field rules: `family === id prefix`, `op` is present in the required operation tuple, `primaryMetric` is in `metrics`, every oracle/metric is applicable to the operation/result shape, all asset ids resolve, timeout is positive, and mutation ids are confined to intended negative/robustness paths. Only a deep-frozen validated snapshot may enter the registry.

Acceptance criteria:

1. A single validation command expands every family and emits zero diagnostics for the checked-in battery.
2. Fixtures covering an unknown family prefix, empty input, op/require mismatch, duplicate token, illegal option, absent primary metric, `NaN` tolerance, zero timeout, and unknown handler each fail before registry mutation and identify `scenarioId + field path`.
3. Mutating a caller-owned definition after registration cannot change `getScenario()` or `listScenarios()` output.

#### Stable identity and deterministic expansion

Keep `id` as the permanent human/CLI key and add a monotonically changed `revision` for any semantic change to operation, inputs, options, requirements, oracle set/tolerances, metrics, timeout, or handler ids. Never reuse an id for a different behavior. Produce a `definitionHash` over a JSON-only canonical projection; [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html#name-introduction) exists specifically to make JSON hashing repeatable through invariant serialization and property sorting. Results and cache keys carry `{ scenarioId, scenarioRevision, definitionHash }`.

Replace the two family-order/wiring lists with one canonical manifest containing family id, label, order, and lazy loader. Lazy loading may remain, but registration must first load/expand every selected family into a staging area, validate the complete set, sort it by manifest family order then explicit scenario order/id, and commit atomically. `Map` itself exposes insertion order because its iterator walks `[[MapData]]` by index, as specified by [ECMAScript `CreateMapIterator`](https://tc39.es/ecma262/2025/multipage/keyed-collections.html#sec-createmapiterator); canonical order therefore must be chosen before insertion rather than depending on whichever import finishes or which duplicate is encountered first.

Every case-table builder must emit an explicit expansion identity. Input variants use `variantId` and rendition variants use `renditionId`; neither is overloaded as the scenario id. A committed manifest snapshot lists the ordered `{id, revision, definitionHash, inputVariantIds, renditionIds}`. Reordering source imports without changing declared order must leave that snapshot and registry output byte-for-byte unchanged.

Acceptance criteria:

1. Eager and lazy loading produce identical ordered ids and identical definition hashes.
2. Robustness precedes performance in registry, UI, launcher metadata, default runner order, and reports.
3. One invalid or duplicate member leaves the registry unchanged and reports the exact family/member; retry after correction succeeds once.
4. Adding/removing a builder row changes the checked expansion snapshot, so unmaterialized or accidental duplicate variants cannot pass CI silently.

#### Tuple-aware applicability without losing atomic tokens

Replace flat-only `Requires` with a normalized representation that retains atomic tokens for indexing but adds concrete clauses, for example `allOfTokens` plus `anyOfCombinations[]`. Each combination identifies operation, input container/codecs, output container/codecs, relevant option constraints, and browser codec roles/config recipes. Alternatives express valid implementation paths; fields inside a combination are conjunctive. Engine declarations must be matchable against the same tuples, as detailed in [runner and capability negotiation](runner-capability-negotiation.md).

For a WebCodecs-backed combination, derive the actual `AudioDecoderConfig`, `AudioEncoderConfig`, `VideoDecoderConfig`, or `VideoEncoderConfig` from the selected input metadata and output options, rather than substituting one global codec-token boolean. The WebCodecs `isConfigSupported()` contract answers whether the *provided configuration* is supported and returns the configuration members the user agent recognized; callers can compare the returned config to detect ignored members. [W3C WebCodecs, `VideoDecoder.isConfigSupported()`](https://w3c.github.io/webcodecs/#dom-videodecoder-isconfigsupported) The normative support algorithm checks exact codec profile, level, and constraint bits. [W3C WebCodecs, Check Configuration Support](https://w3c.github.io/webcodecs/#check-configuration-support)

Typed runtime applicability remains mandatory because declarations cannot predict every data-dependent framework limitation. Define one shared `NotApplicableError` with a stable code and structured `{ operation, combination, reason }`; adapters throw it when the concrete combination cannot be performed, and the runner maps it to `NA_ENGINE`. A normal exception remains `ERROR`, and an executed but incorrect output remains `FAIL`. This should replace unsupported-combination entries in the hand-kept disabled-cell list rather than turning them into `SKIPPED`. [src/core/disabled-cells.ts:36-66](../../src/core/disabled-cells.ts#L36-L66)

Acceptance criteria:

1. A scenario whose individual tokens are all declared but whose operation × input × output × options tuple is unsupported is rejected as `NA_ENGINE` before execution when known, or by `NotApplicableError` at runtime when data-dependent; it never leaks to `FAIL`/`ERROR` merely for being unsupported.
2. A WebCodecs configuration rejected for the concrete profile/dimensions/rate/channels is `NA_BROWSER`; a parser-only path that never configures a codec is not browser-gated.
3. Tests cover at least one combinatorial miss for Mediabunny, Remotion, and Remotion Media Parser and demonstrate removal of their equivalent disabled-cell entries.

#### Three-way oracle verdicts and result schema v2

Replace boolean `pass` with a discriminated, schema-validated outcome. JSON Schema [`enum`](https://json-schema.org/draft/2020-12/json-schema-validation#section-6.1.2) and [`required`](https://json-schema.org/draft/2020-12/json-schema-validation#section-6.5.3) assertions provide a machine-checkable representation for the required closed vocabulary.

```ts
type OracleVerdict = 'PASS' | 'DIFF' | 'FAIL';

type OracleOutcomeV2 =
  | {
      kind: 'verdict';
      oracle: OracleId;
      verdict: OracleVerdict;
      reasonCode: string;
      detail?: string;
      measurements?: Record<string, number>;
    }
  | {
      kind: 'unavailable';
      oracle: OracleId;
      status: 'NA_BROWSER' | 'NA_ASSET';
      reasonCode: string;
      detail?: string;
    };

type ResultStatusV2 =
  | OracleVerdict
  | 'NA_ENGINE'
  | 'NA_BROWSER'
  | 'NA_ASSET'
  | 'ERROR'
  | 'SKIPPED';
```

The reducer is explicit: any semantic `FAIL` makes the cell `FAIL`; otherwise any `DIFF` makes it `DIFF`; otherwise any semantic `PASS` makes it `PASS`. When no oracle produced a semantic verdict, preserve every unavailable outcome and reduce to `NA_ASSET` if any required oracle evidence is absent, otherwise `NA_BROWSER`; `NA_ENGINE` is decided before oracle execution. Thus `DIFF` means valid and semantically acceptable but representationally different from the ffmpeg-baked [golden](../glossary.md#golden); it is never inferred from an exception or used to soften truly wrong output. `PASS` and `DIFF` are correctness-admissible for measurement, while reports preserve the distinction. Exact oracle normalization and the classification of metadata/packet differences are owned by the [oracle system](oracle-system.md).

Publish `media-browser-test/results@2` and a matching JSON Schema. Each cell carries schema version, scenario id/revision/hash, engine id/version, browser, concrete input variant identity and digest, status, every oracle outcome, measurements/bench, environment, and timing. Validate at every trust boundary: IndexedDB read, downloaded result import, offline compare/aggregate input, and report input. Unknown major versions are rejected with an import diagnostic, not converted into an engine `ERROR` cell.

Provide an explicit v1-to-v2 migrator. Legacy `pass: true` maps to oracle `PASS`; a false outcome that the legacy cell/status and recognized legacy detail prove was unavailable maps to the typed unavailable branch; every other false maps conservatively to `FAIL`. Migration must never manufacture `DIFF`, because v1 did not retain enough information to distinguish valid representation differences from wrong output. Replace the manual cache validation epoch with the schema version plus scenario revision/hash.

Acceptance criteria:

1. Oracle reducer table tests cover all permutations of PASS/DIFF/FAIL/unavailable and prove the precedence `FAIL > DIFF > PASS`.
2. A valid Annex B/AVCC, codec-alias, legal packet-grouping, or tolerant-timing representation classified by its owning oracle produces `DIFF`, while invalid/unusable output produces `FAIL`.
3. Performance is collected for PASS and DIFF, never for FAIL/NA/ERROR/SKIPPED; reporting keeps DIFF visible and does not count it as an exact PASS.
4. v1 golden-gap, v1 false, and v1 true fixtures migrate deterministically; malformed and unknown-version payloads are rejected before cache/report consumption.

#### Explicit exhaustive input outcomes and partial coverage

Model a concrete run as `ScenarioInstance { scenarioId, scenarioRevision, definitionHash, inputVariantId, inputSha256 }`. Exhaustive results contain a full result for every input variant, including its oracle outcomes and availability, not only status/reason/bench. Keep ABR rendition outcomes nested under distinct `renditionId`s so input variants, browser-reference variants, and rendition variants cannot be confused.

Coverage is orthogonal to semantic status: add `coverage.grade: 'FULL' | 'PARTIAL' | 'NONE'` plus passed/diffed/failed/unavailable/total counts. `FULL` means every selected input produced `PASS` or `DIFF`; `PARTIAL` means at least one selected input produced `PASS` or `DIFF` and at least one did not; `NONE` means none did. Aggregate verdict-bearing inputs with the same `FAIL > DIFF > PASS` precedence. If file 01 passes and files 02/03 fail, preserve all three results, set `coverage.grade = 'PARTIAL'`, and keep the aggregate semantic status `FAIL`; do not collapse the mixed signal to `ERROR` or erase the passing file. The [media-selection](media-selection.md), [runner](runner-capability-negotiation.md), [robustness](../features/robustness.md), and [reporting](reporting-aggregation.md) pages own selection, execution, grading, and display policy respectively.

Acceptance criteria:

1. Exhaustive serialization round-trips every file’s oracle outcomes and digest.
2. Mixed PASS/FAIL, DIFF/PASS, NA/PASS, and all-NA fixtures produce deterministic aggregate status and coverage grade.
3. A partial robustness cell names the passing and failing files and is never represented as a harness `ERROR`.

### Known gaps

#### Boolean outcomes conflate semantic failure and representation difference

- **Current:** `OracleOutcome.pass` is boolean and `ResultStatus` omits `DIFF`; the runner maps the first real false outcome to `FAIL`. [src/core/scenario.ts:208-222](../../src/core/scenario.ts#L208-L222) [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447)
- **Consequence:** A valid representation that differs from an ffmpeg-baked golden cannot be retained as a first-class diagnostic; it is either normalized into PASS ad hoc or conflated with truly wrong output.
- **Target:** Adopt the discriminated PASS/DIFF/FAIL outcome and v2 result enum above, expressed as closed JSON Schema enums and required fields. [JSON Schema structural validation](https://json-schema.org/draft/2020-12/json-schema-validation#section-6)
- **Verification:** Reducer and serialization tests prove `FAIL > DIFF > PASS`, and a legacy-v1 migration test proves no false outcome is guessed to be DIFF.

#### Oracle availability is encoded in prose

- **Current:** Oracles return `pass: false` with detail prefixes, and the runner searches human text such as `golden absent` and `packet table unreadable` to recover `NA_ASSET`. [src/core/oracles.ts:306-323](../../src/core/oracles.ts#L306-L323) [src/core/runner.ts:858-873](../../src/core/runner.ts#L858-L873)
- **Consequence:** Editing wording can change status routing, and result consumers cannot distinguish unavailability from a semantic failure without duplicating string heuristics.
- **Target:** Use the required/discriminated `kind: unavailable` branch and validate its status/reason code structurally; JSON Schema defines `required`, `enum`, and conditional applicators for such unions. [JSON Schema validation §§6 and Appendix A](https://json-schema.org/draft/2020-12/json-schema-validation#section-6)
- **Verification:** Changing `detail` has no effect on status; missing/invalid `kind`, status, or reason code fails schema validation.

#### Definition validation is insufficient at the runtime boundary

- **Current:** `defineScenario()` checks only id-with-slash, a non-empty operations array, and a non-empty oracle array, then casts the family prefix. [src/core/scenario.ts:183-204](../../src/core/scenario.ts#L183-L204)
- **Consequence:** An unknown family, empty input, op/requirements mismatch, duplicate token, invalid option, unusable primary metric, or non-finite tolerance can enter registration and fail much later as a misleading matrix result.
- **Target:** Validate a JSON-safe V2 definition structurally and semantically before commit. TypeScript’s own documentation confirms that types are erased at runtime, while JSON Schema supplies runtime assertions. [TypeScript erased types](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch#erased-types) [JSON Schema validation vocabulary](https://json-schema.org/draft/2020-12/json-schema-validation#section-6)
- **Verification:** One negative fixture per omitted invariant fails with scenario id and field path, and the registry remains unchanged.

#### Registry order and commit behavior depend on the wiring path

- **Current:** Static battery assembly puts robustness before performance and prechecks all ids, while app wiring reverses those two families and commits each scenario directly; registry lists return insertion order. [src/scenarios/index.ts:32-50](../../src/scenarios/index.ts#L32-L50) [src/app/register.ts:128-173](../../src/app/register.ts#L128-L173) [src/core/registry.ts:72-77](../../src/core/registry.ts#L72-L77)
- **Consequence:** Default run order differs by entry point, UI regrouping can mask the mismatch, and a failed family registration can leave an unreported partial family in the registry.
- **Target:** Use one canonical manifest, stage/validate/sort the whole selected battery, then commit atomically. ECMAScript specifies that Map iteration walks its entry list in insertion order, so canonical insertion must be deliberate. [ECMAScript `CreateMapIterator`](https://tc39.es/ecma262/2025/multipage/keyed-collections.html#sec-createmapiterator)
- **Verification:** Eager/lazy order snapshots match; injected family failure leaves counts/content unchanged; robustness precedes performance at every consumer.

#### Stable ids have no semantic revision or canonical definition hash

- **Current:** Scenario id is the only definition identity copied into results and cache keys; results have no scenario revision/hash, and cache compatibility relies on a manual epoch plus selected invalidation keys. [src/core/scenario.ts:269-285](../../src/core/scenario.ts#L269-L285) [src/app/result-cache.ts:3-15](../../src/app/result-cache.ts#L3-L15) [src/app/result-cache.ts:43-50](../../src/app/result-cache.ts#L43-L50)
- **Consequence:** Changing options, requirements, oracle/tolerance policy, or fixture semantics under the same id can make an old cached result look current until someone updates hand-maintained invalidation state.
- **Target:** Add scenario revision and an RFC 8785-canonicalized definition hash to definitions, results, and cache keys. [RFC 8785, JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html#name-introduction)
- **Verification:** Any semantic definition change causes a new key/hash and a cache miss; formatting/property-order-only changes leave the canonical hash unchanged.

#### Flat requirements cannot express concrete support combinations

- **Current:** The gate checks independent arrays and a representative per-codec browser boolean, then relies on runtime `NotApplicableError` or ordinary failure when a concrete combination is unsupported. [src/core/runner.ts:124-205](../../src/core/runner.ts#L124-L205) [src/core/feature-detect.ts:315-379](../../src/core/feature-detect.ts#L315-L379) [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393)
- **Consequence:** All individual tokens can pass while operation × container × codec × options remains impossible; these cells can leak into `FAIL`/`ERROR` or require hand-kept disabled-cell entries.
- **Target:** Add tuple/alternative clauses, derive the concrete WebCodecs config, and retain typed runtime `NotApplicableError` fallback. WebCodecs support is defined for a provided configuration, including exact profile/level/constraints, not for a repository’s coarse codec token. [W3C WebCodecs configuration support](https://w3c.github.io/webcodecs/#check-configuration-support)
- **Verification:** Combination-miss tests route to `NA_ENGINE`, exact runtime-config misses route to `NA_BROWSER`, and equivalent disabled entries can be deleted without creating FAIL/ERROR cells.

#### Input/rendition variants and partial coverage are not first-class in results

- **Current:** Selection mutates a shallow scenario clone; ABR uses a separate options array; exhaustive file results omit oracle outcomes; mixed exhaustive failures collapse to top-level FAIL/ERROR. [src/core/media-selection.ts:253-325](../../src/core/media-selection.ts#L253-L325) [src/core/engine.ts:155-161](../../src/core/engine.ts#L155-L161) [src/core/scenario.ts:320-330](../../src/core/scenario.ts#L320-L330) [src/core/runner.ts:1127-1204](../../src/core/runner.ts#L1127-L1204)
- **Consequence:** “file 01 passes, files 02/03 fail” survives only as a thin status list, not a fully inspectable partial-coverage result; variant terminology and identities are ambiguous across input selection and renditions.
- **Target:** Give each kind of variant its own id and schema branch, retain complete per-input outcomes, and add an explicit partial coverage grade. JSON Schema’s array `minItems` and `uniqueItems` assertions can enforce non-empty, unique variant manifests. [JSON Schema validation §6.4](https://json-schema.org/draft/2020-12/json-schema-validation#section-6.4)
- **Verification:** Exhaustive round-trip tests preserve every outcome; mixed files report `coverage.grade = PARTIAL` and never become `ERROR` solely because coverage is mixed.

#### Stored result readers trust TypeScript-shaped JSON

- **Current:** Downloads advertise `results@1`, but cached rows are cast directly to `ScenarioResult`; the cache and downstream loaders have no shared runtime validator or migrator. [src/app/main.ts:393-402](../../src/app/main.ts#L393-L402) [src/app/result-cache.ts:36-55](../../src/app/result-cache.ts#L36-L55) [src/app/result-cache.ts:97-110](../../src/app/result-cache.ts#L97-L110)
- **Consequence:** Stale, malformed, or future-version data can reach UI/report consumers with impossible status/outcome combinations.
- **Target:** Publish and enforce a versioned result JSON Schema at every read boundary, with an explicit v1-to-v2 migration. JSON Schema validation keywords are assertions over instances rather than TypeScript compile-time hints. [JSON Schema validation vocabulary](https://json-schema.org/draft/2020-12/json-schema-validation#section-6)
- **Verification:** Valid v1 fixtures migrate, valid v2 fixtures round-trip, and malformed/unknown-major inputs fail before indexing, scoring, or cache reuse.

## Sources

### Repository evidence

- [src/core/scenario.ts:17-31](../../src/core/scenario.ts#L17-L31) — flat capability-requirement fields.
- [src/core/scenario.ts:35-72](../../src/core/scenario.ts#L35-L72) — closed oracle and metric id vocabularies.
- [src/core/scenario.ts:74-119](../../src/core/scenario.ts#L74-L119) — family union, canonical order, and labels.
- [src/core/scenario.ts:127-143](../../src/core/scenario.ts#L127-L143) — input normalization and canonical grouping.
- [src/core/scenario.ts:145-180](../../src/core/scenario.ts#L145-L180) — tolerance, scenario-spec, and derived-family shapes.
- [src/core/scenario.ts:183-204](../../src/core/scenario.ts#L183-L204) — family derivation and current light validation.
- [src/core/scenario.ts:208-222](../../src/core/scenario.ts#L208-L222) — current status union and boolean oracle outcome.
- [src/core/scenario.ts:269-330](../../src/core/scenario.ts#L269-L330) — result and exhaustive sub-result schemas.
- [src/core/registry.ts:18-51](../../src/core/registry.ts#L18-L51) — Map registries, duplicate checks, and non-transactional bulk registration.
- [src/core/registry.ts:54-77](../../src/core/registry.ts#L54-L77) — engine/scenario lookup and insertion-ordered listing.
- [src/scenarios/index.ts:18-72](../../src/scenarios/index.ts#L18-L72) — eager canonical battery assembly and global duplicate check.
- [src/scenarios/remux/_shared.ts:72-108](../../src/scenarios/remux/_shared.ts#L72-L108) — representative eager case-table builder.
- [src/scenarios/transcode/index.ts:284-320](../../src/scenarios/transcode/index.ts#L284-L320) — representative video-scenario expansion.
- [src/app/register.ts:37-92](../../src/app/register.ts#L37-L92) — scored-engine and platform-instrument lazy wirings.
- [src/app/register.ts:94-181](../../src/app/register.ts#L94-L181) — independent family wiring, order, error isolation, and counts.
- [src/app/main.ts:97-140](../../src/app/main.ts#L97-L140) — boot registration and grouped picker consumers.
- [src/app/main.ts:393-402](../../src/app/main.ts#L393-L402) — downloadable results-v1 envelope.
- [src/app/result-cache.ts:3-15](../../src/app/result-cache.ts#L3-L15) — current cache database/validation epoch and manual invalidations.
- [src/app/result-cache.ts:43-55](../../src/app/result-cache.ts#L43-L55) — cache identity and PASS invalidation policy.
- [src/app/result-cache.ts:97-123](../../src/app/result-cache.ts#L97-L123) — unvalidated cache read/write path.
- [src/core/engine.ts:155-161](../../src/core/engine.ts#L155-L161) — rendition variants in transcode options.
- [src/core/media-selection.ts:253-325](../../src/core/media-selection.ts#L253-L325) — selected input variant and effective-scenario cloning.
- [src/core/media-selection.ts:328-389](../../src/core/media-selection.ts#L328-L389) — ordered exhaustive input candidates.
- [src/core/feature-detect.ts:315-379](../../src/core/feature-detect.ts#L315-L379) — representative WebCodecs token probes.
- [src/core/disabled-cells.ts:36-66](../../src/core/disabled-cells.ts#L36-L66) — hand-maintained engine/scenario exclusions for unsupported cells.
- [src/core/runner.ts:124-334](../../src/core/runner.ts#L124-L334) — flat engine/browser negotiation.
- [src/core/runner.ts:428-440](../../src/core/runner.ts#L428-L440) — scenario-major matrix expansion and optional shuffle.
- [src/core/runner.ts:686-693](../../src/core/runner.ts#L686-L693) — current name-based `NotApplicableError` recognition.
- [src/core/runner.ts:858-873](../../src/core/runner.ts#L858-L873) — detail-substring oracle-unavailability routing.
- [src/core/runner.ts:1127-1204](../../src/core/runner.ts#L1127-L1204) — exhaustive result aggregation.
- [src/core/runner.ts:1331-1468](../../src/core/runner.ts#L1331-L1468) — negotiation, operation error mapping, boolean oracle reduction, and bench gate.
- [src/core/runner.ts:1734-1766](../../src/core/runner.ts#L1734-L1766) — registry enumeration and scenario filtering.
- [src/core/oracles.ts:306-323](../../src/core/oracles.ts#L306-L323) — prose-encoded unavailable outcomes.
- [src/core/oracles.ts:431-479](../../src/core/oracles.ts#L431-L479) — oracle-id dispatch and catch-to-false behavior.
- [src/core/oracles.ts:4262-4266](../../src/core/oracles.ts#L4262-L4266) — boolean pass/fail constructors.
- [src/core/report.ts:622-650](../../src/core/report.ts#L622-L650) — PASS-only winner eligibility.

### External authorities

- Microsoft, “TypeScript for the New Programmer — Erased Types,” [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch#erased-types), accessed 2026-07-16 — establishes that TypeScript type information does not exist as runtime validation.
- JSON Schema authors, “JSON Schema Validation: A Vocabulary for Structural Validation of JSON,” [Draft 2020-12 §§6.1, 6.4, and 6.5](https://json-schema.org/draft/2020-12/json-schema-validation#section-6), accessed 2026-07-16 — defines enum, required, numeric, and array uniqueness/size assertions used by the target definition and result schemas.
- Ecma International, “Map Iterator Objects,” [ECMAScript 2025 §24.1.5.1 `CreateMapIterator`](https://tc39.es/ecma262/2025/multipage/keyed-collections.html#sec-createmapiterator), accessed 2026-07-16 — establishes insertion-ordered Map iteration and why canonical insertion order must be deliberate.
- Rundgren, Jordan, and Erdtman, “JSON Canonicalization Scheme (JCS),” [RFC 8785 §1](https://www.rfc-editor.org/rfc/rfc8785.html#name-introduction), accessed 2026-07-16 — specifies invariant JSON serialization and deterministic property sorting for repeatable definition hashes.
- W3C Media Working Group, “VideoDecoder `isConfigSupported()`,” [WebCodecs Editor’s Draft](https://w3c.github.io/webcodecs/#dom-videodecoder-isconfigsupported), accessed 2026-07-16 — defines support as a property of the supplied configuration and exposes recognized configuration members.
- W3C Media Working Group, “Check Configuration Support,” [WebCodecs Editor’s Draft §7.1](https://w3c.github.io/webcodecs/#check-configuration-support), accessed 2026-07-16 — requires checking exact codec profile, level, and constraint bits, supporting configuration-specific rather than token-only browser negotiation.
