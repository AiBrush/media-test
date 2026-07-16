# Reporting and aggregation

> Scope: Result reduction, benchmark summaries, status presentation, report artifacts, winner selection, offline comparison, aggregate scorecards, and bundle-size joins; oracle semantics, runner execution, and application interaction remain with their owning pages.
> Phase-2 owner: p2_subsystem_reporting_aggregation.

## Purpose

Reporting turns per-engine observations into an auditable answer to two questions: what happened in each engine × [scenario](../glossary.md#scenario) × browser [cell](../glossary.md#cell), and which performance comparisons are actually valid? It must preserve correctness and applicability evidence before it summarizes speed, coverage, breadth, or wins.

This page specifies the current pipeline from measurement through JSON and Markdown, then defines the reporting contract needed by later cleanup work. The target keeps [PASS](../glossary.md#pass), [DIFF](../glossary.md#diff), [FAIL](../glossary.md#fail), the three `NA_*` causes, [ERROR](../glossary.md#error), [SKIPPED](../glossary.md#skipped), and [partial coverage](../glossary.md#partial-coverage) distinct; makes every denominator and comparison cohort explicit; and makes generated artifacts reproducible and schema-validated.

## As-built

### Measurement and benchmark summaries

`MetricSample` can carry wall time, throughput, memory, I/O, long-task, frame/packet/operation rates, latency, and offline bundle size. `BenchSummary` stores finite-sample count, warmup count, metric, median, nearest-rank p95, median absolute deviation (MAD), unit, raw samples, and an optional exhaustive-file aggregate. [src/core/scenario.ts:224-266](../../src/core/scenario.ts#L224-L266)

One measured operation feeds every metric requested by a scenario. The runner performs the configured warmups, collects the configured measured iterations, drops non-finite values separately for each metric, and calls `summarize` even when no finite value remains. [src/core/runner.ts:1628-1708](../../src/core/runner.ts#L1628-L1708) The defaults are one warmup, one measured iteration, and a 3% noise band. [src/core/bench.ts:16-28](../../src/core/bench.ts#L16-L28)

The meter always records a non-negative wall duration and best-effort memory, then derives rate and latency fields only when their required context exists. Long-task observation and memory APIs are guarded; an unavailable memory observation becomes `null` rather than an exception. [src/core/measure.ts:50-103](../../src/core/measure.ts#L50-L103) [src/core/measure.ts:169-209](../../src/core/measure.ts#L169-L209)

`summarize` filters to finite samples and computes median, p95, and MAD. Empty input produces `n: 0`, empty `samples`, and numeric zero for all three statistics because both statistic helpers return zero on an empty list. [src/core/bench.ts:127-150](../../src/core/bench.ts#L127-L150) [src/core/bench.ts:231-253](../../src/core/bench.ts#L231-L253) Thus a missing observation is currently shaped like a measured zero unless every consumer checks `n`.

Metric direction is centralized: throughput and rate metrics are higher-is-better; all other metrics are lower-is-better. `compareBench` compares medians, normalizes the sign so positive means better, and calls differences within at least 3% `within-noise`; it does not inspect `n`, MAD, or sample pairing. [src/core/bench.ts:71-89](../../src/core/bench.ts#L71-L89) [src/core/bench.ts:153-192](../../src/core/bench.ts#L153-L192)

For exhaustive input sets, rate metrics are combined as the median of per-file medians, peak memory as the maximum, and other cost metrics as a sum. The resulting summary reuses `median`, `p95`, `mad`, and `samples` for the distribution across files while `aggregate` holds the representative combined value. [src/core/bench.ts:194-227](../../src/core/bench.ts#L194-L227) The same shape therefore represents two sample axes—iterations in an ordinary cell and files in an exhaustive cell—without a field that identifies the axis.

### Status reduction and display

The current persisted result status union is binary for correctness: it has `PASS` and `FAIL` but no `DIFF`. Its `OracleOutcome` carries only `pass: boolean`. Benchmark data is documented and populated only for a top-level `PASS`. [src/core/scenario.ts:206-221](../../src/core/scenario.ts#L206-L221) [src/core/scenario.ts:269-318](../../src/core/scenario.ts#L269-L318)

For an ordinary cell, operation timeout becomes `FAIL`, [NotApplicableError](../glossary.md#notapplicableerror) becomes [NA_ENGINE](../glossary.md#na_engine), and an unclassified exception becomes `ERROR`. A substantive false oracle outcome becomes `FAIL`; an all-golden-gap set becomes [NA_ASSET](../glossary.md#na_asset); otherwise the cell becomes `PASS`. A benchmark timeout leaves the already-correct cell `PASS` with no benchmark number. [src/core/runner.ts:1382-1468](../../src/core/runner.ts#L1382-L1468)

An exhaustive cell retains each input file's status, reason, hash, and benchmark in `ScenarioResult.exhaustive`. The reducer counts `PASS`, `FAIL`, and `ERROR` as admissible, records `passed/admissible/total`, and aggregates metrics from passing files. [src/core/runner.ts:1118-1169](../../src/core/runner.ts#L1118-L1169) Any per-file `FAIL` or `ERROR` then replaces the top-level cell with `FAIL` when at least one failure is semantic, otherwise `ERROR`; a mixed set such as file 01 `PASS` plus files 02/03 `FAIL` is not represented as partial at the top level. [src/core/runner.ts:1171-1189](../../src/core/runner.ts#L1171-L1189) If every file is not applicable, mixed `NA_*` kinds are reduced by preferring `NA_ASSET`, otherwise the first status. [src/core/runner.ts:1191-1204](../../src/core/runner.ts#L1191-L1204)

The shared human formatter renders a timed `PASS` as `Pass (<time>)`, appends `passed/total` only to a top-level `PASS`, folds [NA_ENGINE](../glossary.md#na_engine), [NA_BROWSER](../glossary.md#na_browser), and [NA_ASSET](../glossary.md#na_asset) into `N/A`, and leaves `FAIL`, `ERROR`, and `SKIPPED` visible. Missing cells render as an em dash. [src/core/format.ts:23-47](../../src/core/format.ts#L23-L47) [src/core/format.ts:68-120](../../src/core/format.ts#L68-L120) Because mixed per-file failures make the top-level status non-`PASS`, the coverage suffix does not expose those mixed outcomes.

The live scoreboard separately counts `PASS`, `FAIL`, `ERROR`, grouped `NA_*`, and `SKIPPED`; its pass rate is `PASS / (PASS + FAIL + ERROR)` and displays an em dash when that denominator is zero. [src/app/ui.ts:378-415](../../src/app/ui.ts#L378-L415)

### Report projection, ranking, and Markdown

`buildReport` derives engines from results and sorts them, orders known browsers with a fixed preference, preserves first-seen scenario order, and indexes duplicate `(engine, browser, scenario)` triples with last-write-wins semantics. When the caller omits a timestamp it inserts the current time. [src/core/report.ts:254-305](../../src/core/report.ts#L254-L305) [src/core/report.ts:490-503](../../src/core/report.ts#L490-L503)

`ReportJson` has suite version, generation time, matrix axes, browser sections, scorecards, caveats, corpus checksums, and rotation findings, but no report schema identifier or schema version. [src/core/report.ts:233-249](../../src/core/report.ts#L233-L249) Raw browser and launcher downloads do carry the string `media-browser-test/results@1`; neither writer validates the in-memory result shape against a machine-readable schema. [src/app/main.ts:393-405](../../src/app/main.ts#L393-L405) [scripts/launch.mjs:277-305](../../scripts/launch.mjs#L277-L305)

The conformance projection preserves a cell-level reason and selection, but its exhaustive projection keeps only file, baked flag, status, and optional hash. It drops each file's reason, oracle outcomes, and benchmark summaries. [src/core/report.ts:516-555](../../src/core/report.ts#L516-L555) The benchmark projection keeps only selected wall, throughput, memory, long-task, primary-metric, and coverage fields, dropping raw samples, `n`, warmup, MAD, most metric families, and per-file benchmark detail. [src/core/report.ts:73-103](../../src/core/report.ts#L73-L103) [src/core/report.ts:758-779](../../src/core/report.ts#L758-L779)

Per-scenario winners are chosen only among top-level `PASS` results. They are ordered first by `coverage.passed`, then by the primary metric's exhaustive `aggregate` or ordinary `median`; co-winners are limited to the top coverage tier and a fixed 3% band. [src/core/report.ts:609-723](../../src/core/report.ts#L609-L723) A mixed exhaustive result with some passing files is therefore excluded because its top-level status is `FAIL` or `ERROR`, while a top-level `PASS` containing passing plus `NA_*` files remains eligible. The primary metric chooser first seeks a common declared or inferred metric but finally accepts the first metric present in any eligible result, which can rank only a subset. [src/core/report.ts:725-742](../../src/core/report.ts#L725-L742) It tests summary presence rather than `n`, so an `n: 0, median: 0` summary can be rankable.

The report annotates each passing bench cell with the selected primary metric's median even when the winner used an exhaustive aggregate. [src/core/report.ts:568-594](../../src/core/report.ts#L568-L594) The benchmark-first Markdown table then calls the shared visible-cell formatter, so its cells show execution wall time or duration rather than the stored `primaryValueMedian`; its adjacent column only names the primary metric. [src/core/report.ts:1079-1111](../../src/core/report.ts#L1079-L1111) [src/core/report.ts:1410-1427](../../src/core/report.ts#L1410-L1427) The detailed benchmark matrix exposes wall median/p95, throughput, memory, and long tasks but omits MAD, sample counts, raw samples, and all other metrics. [src/core/report.ts:1146-1179](../../src/core/report.ts#L1146-L1179)

Conformance percentage is `PASS / (PASS + FAIL + ERROR)`; zero admissible cells become numeric `0%`. Robustness uses a different denominator: every observed robustness result is counted, including `NA_*` and `SKIPPED`. [src/core/report.ts:784-838](../../src/core/report.ts#L784-L838) Scorecard wins are summed across browser sections and the headline leaderboard sorts by wins, then conformance. [src/core/report.ts:818-865](../../src/core/report.ts#L818-L865) [src/core/report.ts:1213-1231](../../src/core/report.ts#L1213-L1231)

The live UI has a second winner implementation. It waits for all selected engines, filters to `PASS`, ranks by files passed and then lowest displayed wall time, and has no primary-metric direction, 3% co-winner logic, or tie output. [src/app/ui.ts:550-589](../../src/app/ui.ts#L550-L589) The live race can therefore disagree with the generated report.

### Offline comparison and aggregate scorecards

`compare.mjs` reads lexically sorted JSON files, accepts either `payload.results` or a bare array, silently skips unreadable or empty inputs, concatenates all results, and relies on report.ts last-write-wins. It performs no schema, status, metric-unit, environment, corpus, or configuration validation. [scripts/compare.mjs:59-97](../../scripts/compare.mjs#L59-L97) It writes the report JSON directly with ordinary `JSON.stringify`. [scripts/compare.mjs:112-130](../../scripts/compare.mjs#L112-L130)

`aggregate.mjs` also accepts either payload shape. It selects the freshest cell by payload `generatedAtIso`; an equal timestamp is resolved by later lexical filename. During deduplication it retains only engine, browser, scenario, family, status, a real-file flag, and timestamp. [scripts/aggregate.mjs:68-135](../../scripts/aggregate.mjs#L68-L135) This policy differs from compare's unconditional concatenation plus input-order overwrite.

Aggregate mode defaults to the browser represented by the most engines, but it does not construct or validate a common expected scenario set. [scripts/aggregate.mjs:144-184](../../scripts/aggregate.mjs#L144-L184) Each engine's total is only its observed cells; `NA_ENGINE`, `NA_BROWSER`, `NA_ASSET`, and `SKIPPED` are all merged into one `na` bucket. Ranking is conformance first, observed-cell coverage second. [scripts/aggregate.mjs:188-246](../../scripts/aggregate.mjs#L188-L246) Consequently, missing cells are absent from the denominator and a declared “identical scenario set” is not enforced by the data path.

`goal26-analyze.mjs` duplicates primary-metric priority, metric direction, coverage-first ordering, and the 3% band. It groups only by scenario id, not browser, and truncates every engine id at `@`, so separate browser or version observations can collide. [scripts/goal26-analyze.mjs:7-55](../../scripts/goal26-analyze.mjs#L7-L55)

### Offline bundle-size join

`measure-bundles.mjs` synthesizes one browser ESM entry per hard-coded engine, bundles/minifies it, and gzips emitted JavaScript. Runtime-loaded WASM and workers are excluded by definition. [scripts/measure-bundles.mjs:8-35](../../scripts/measure-bundles.mjs#L8-L35) Its primary artifact is a flat `engineId -> kB` map; a sibling detail file records raw/gzip sizes, imports, notes, or an error, but the join does not read that detail. Neither artifact carries a schema identifier, bundler version, input hash, flags, or compression provenance. [scripts/measure-bundles.mjs:248-293](../../scripts/measure-bundles.mjs#L248-L293)

`compare.mjs` injects a finite map value only into top-level `PASS` bundle-size cells and replaces the empty benchmark with `n: 1`. Lookup accepts exact id, bare id, and a platform-prefix fallback. [scripts/compare.mjs:135-231](../../scripts/compare.mjs#L135-L231) If the map or entry is absent, the runner's current `n: 0, median: 0` summary remains and can participate in report ranking. [scripts/compare.mjs:99-108](../../scripts/compare.mjs#L99-L108)

## Contracts and invariants

The following are current executable contracts; their limitations are target gaps rather than implied future behavior:

1. **Correctness gates measurement.** Ordinary benchmark execution begins only after the current binary oracle reduction yields `PASS`; a benchmark timeout preserves correctness but yields no number. [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463)
2. **Finite values alone enter a summary.** Every metric drops `null`, `undefined`, `NaN`, and infinity before summarization, but empty summaries still contain numeric zero and are not automatically ineligible downstream. [src/core/bench.ts:91-124](../../src/core/bench.ts#L91-L124) [src/core/bench.ts:127-150](../../src/core/bench.ts#L127-L150)
3. **Metric direction is fixed by metric id.** Rates are higher-is-better; time, memory, I/O, bytes, and latency are lower-is-better. [src/core/bench.ts:30-89](../../src/core/bench.ts#L30-L89)
4. **Exhaustive performance excludes non-passing files.** Only passing files contribute benchmark values; lower-is-better costs sum, peak memory takes a maximum, and rates take a median. [src/core/runner.ts:1207-1232](../../src/core/runner.ts#L1207-L1232) [src/core/bench.ts:194-227](../../src/core/bench.ts#L194-L227)
5. **Current exhaustive correctness is an AND-like collapse.** One `FAIL` makes the cell `FAIL`; otherwise one `ERROR` makes it `ERROR`; only a set with at least one `PASS` and no failures becomes top-level `PASS`. [src/core/runner.ts:1143-1204](../../src/core/runner.ts#L1143-L1204)
6. **Winner eligibility requires top-level `PASS`.** Coverage is considered only after that gate, and performance ordering uses aggregate before median. [src/core/report.ts:609-676](../../src/core/report.ts#L609-L676)
7. **Not-applicable causes are machine-distinct only in retained fields.** The shared compact formatter folds all three `NA_*` statuses, while `FAIL`, `ERROR`, and `SKIPPED` remain visible. [src/core/format.ts:104-125](../../src/core/format.ts#L104-L125)
8. **A missing result is not an `NA_*` result.** Report matrices store it as `status: null` and render an em dash. [src/core/report.ts:52-70](../../src/core/report.ts#L52-L70) [src/core/report.ts:532-538](../../src/core/report.ts#L532-L538)
9. **Report comparison is intended to be within one browser.** The report emits that caveat, but the input validator does not verify equal browser build, host, corpus, sample plan, or scenario definition before ranking. [src/core/report.ts:286-294](../../src/core/report.ts#L286-L294) [src/core/report.ts:298-347](../../src/core/report.ts#L298-L347)
10. **Raw and report artifacts are not equivalent.** Raw `ScenarioResult` retains oracle and exhaustive benchmark evidence; `ReportJson` is a lossy projection used for presentation and scorecards. [src/core/scenario.ts:269-330](../../src/core/scenario.ts#L269-L330) [src/core/report.ts:52-103](../../src/core/report.ts#L52-L103)
11. **Disabled cells remain `SKIPPED`.** A disabled-cell rule creates an explicit `SKIPPED` result; it is not a capability decision. Runtime NotApplicableError instead becomes `NA_ENGINE`. [src/core/runner.ts:1928-1957](../../src/core/runner.ts#L1928-L1957) [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393)
12. **Offline tools currently trust input.** Compare, aggregate, and the goal-specific analyzer parse JSON and branch on familiar fields without schema validation or a shared normalizer. [scripts/compare.mjs:70-91](../../scripts/compare.mjs#L70-L91) [scripts/aggregate.mjs:87-130](../../scripts/aggregate.mjs#L87-L130) [scripts/goal26-analyze.mjs:11-35](../../scripts/goal26-analyze.mjs#L11-L35)

## Target design and known gaps

### Target design

#### Orthogonal execution, oracle, and coverage states

Do not force applicability, execution health, correctness, and multi-file coverage into one overloaded status. Persist each input variant with:

```ts
type ExecutionState =
  | 'EXECUTED'
  | 'NA_ENGINE'
  | 'NA_BROWSER'
  | 'NA_ASSET'
  | 'ERROR'
  | 'SKIPPED';

type OracleVerdict = 'PASS' | 'DIFF' | 'FAIL';

interface VariantOutcome {
  file: string;
  sha256?: string;
  execution: ExecutionState;
  verdict?: OracleVerdict;
  reasonCode?: string;
  reason?: string;
}
```

`DIFF` means valid but representationally different from the ffmpeg-baked [golden](../glossary.md#golden); it is not silently counted as `PASS` or `FAIL`. `FAIL` remains truly wrong. Reporting consumes that decision from the [oracle system](../subsystems/oracle-system.md); it must never infer semantic equivalence from packet sizes, codec spellings, or other presentation fields.

Reduce a cell in this order, independent of input order:

| Condition over the expected input variants | Cell presentation | Scoring consequence |
| --- | --- | --- |
| No observation exists | `—` / not run | Expected-coverage miss; no correctness denominator. |
| Every observation is intentionally disabled | `SKIPPED` | Separate policy debt; never `N/A`. |
| No variant executed and all are `NA_*` | `N/A`, with exact subtype counts and reasons | Excluded from correctness; included in expected coverage. Do not choose one subtype to erase the others. |
| No valid verdict exists and at least one semantic `FAIL` exists | `FAIL`, with all variant identities | Counts in correctness denominator. Preserve any `ERROR` separately. |
| No valid verdict or `FAIL` exists and at least one execution `ERROR` exists | `ERROR` | Execution reliability failure, not oracle wrongness. |
| `0 < PASS + DIFF < expected total` | `Partial (valid/total)` | [Partial coverage](../glossary.md#partial-coverage); rank below greater valid coverage, never collapse to `ERROR`. |
| Every expected variant is valid and at least one is `DIFF` | `DIFF` | Correctness-valid and benchmark-eligible, but representation difference remains visible. |
| Every expected variant is `PASS` | `PASS` | Correctness-valid and benchmark-eligible. |

The machine report must always expose exact `PASS`, `DIFF`, `FAIL`, `ERROR`, `NA_ENGINE`, `NA_BROWSER`, `NA_ASSET`, `SKIPPED`, and not-run counts plus per-variant identities. A compact table may still show `N/A`, but its details and JSON must retain the subtype. Runtime unsupported combinations signaled by NotApplicableError are `NA_ENGINE`, excluded from correctness and included in expected coverage; they must not inflate `FAIL`/`ERROR`. This is the reporting side of the target contract owned by [runner and capability negotiation](../subsystems/runner-capability-negotiation.md).

Acceptance fixture: one exhaustive robustness cell has `01` = `PASS`, `02` = `FAIL`, and `03` = `FAIL`. Raw JSON and `report.json` retain all three file names, hashes, verdicts, reasons, oracle details, and any eligible measurements. Markdown reads `Partial (1/3)` and lists `02` and `03`; no layer labels the cell `ERROR`. A `2/3` engine outranks it, and a full `3/3` engine outranks both, regardless of speed. See the [robustness family](../features/robustness.md) for operation-level expectations.

#### Explicit denominators and score semantics

Every summary publishes numerator and denominator together. At minimum, per cohort and per engine report:

- `expected`: every selected engine × scenario × browser cell, and every expected input variant inside an exhaustive cell;
- `observed`: persisted results, including `SKIPPED` and each `NA_*`;
- `executed`: variants whose operation ran, separated from preflight/runtime applicability;
- `oracleEvaluable`: variants with `PASS`, `DIFF`, or `FAIL`;
- `valid`: `PASS + DIFF`, with exact `PASS` and `DIFF` also shown;
- `failed`, `errors`, each `NA_*`, `skipped`, and `notRun` separately.

Define correctness as `valid / (PASS + DIFF + FAIL)`. Publish exact-match rate as `PASS / (PASS + DIFF + FAIL)` and representation-difference rate as `DIFF / (PASS + DIFF + FAIL)`; do not put `ERROR` in an oracle-correctness denominator. Define execution reliability and expected coverage separately. A zero denominator is unavailable (`null` in JSON and `—` in Markdown), never numeric `0%`. W3C Data on the Web Best Practices recommends publishing machine-readable quality information and describes completeness as actual items relative to the expected total; it also requires an explanation when data is unavailable. [W3C DWBP, data quality](https://www.w3.org/TR/dwbp/#dataQuality) [W3C DWBP, data not available](https://www.w3.org/TR/dwbp/#AccessNotAvailable)

Overall rankings use the intersection of the expected scenario set for the selected cohort. Missing observations count against expected coverage rather than disappearing from `total`. The report may publish broader per-engine coverage alongside the common-cohort score, but it must not present unequal observed sets as one apples-to-apples rank.

#### Comparability acceptance gate

Build a normalized `cohortId` before any cross-engine performance comparison. Apart from engine identity and measured values, all members of a cohort must agree on:

| Dimension | Required equality/provenance |
| --- | --- |
| Suite and semantics | Compatible artifact-schema major; exact suite commit/version; scenario id plus scenario-definition hash; oracle-policy version; golden/fixture provenance version. |
| Browser/runtime | Browser family and exact build, execution realm, required feature flags, and relevant codec/API support snapshot. |
| Host | OS/architecture, CPU class, GPU/driver identity when relevant, power state, and declared isolation/thermal policy. |
| Inputs | Corpus checksum; exact selected file hashes; exhaustive file identity set and order; mutation parameters; rotation seed. |
| Run selection | Pillar, scenario filter, engine set, exhaustive mode, disabled policy, timeout policy, and cache/reuse policy. |
| Engine record | Immutable engine id and exact framework/adapter version plus `configUsed`; engine id is the intended comparison axis, not a field to normalize away. |
| Metric protocol | Primary metric id, unit, direction, numerator/denominator definition, sample axis, aggregation rule, warmup count, requested iterations, minimum rankable sample count, and noise/uncertainty policy. |

If any required cohort dimension differs or is absent, split the report into separate cohorts and label the cross-cohort relation `not comparable`; never silently pool it. SPEC's run rules state that reported results should be meaningful, comparable, and reproducible and require enough configuration disclosure to reproduce them. [SPEC CPU 2017 Run and Reporting Rules §1.1](https://www.spec.org/cpu2017/Docs/runrules.html#rule_1.1) [SPEC CPU 2017 Run and Reporting Rules §4.0](https://www.spec.org/cpu2017/Docs/runrules.html#rule_4.0)

Acceptance tests mutate one dimension at a time—browser build, corpus hash, scenario hash, engine configuration, warmup/iteration plan, or primary unit—and assert that the records are split or rejected before winner computation. Shuffling files and result order must not change cohort membership.

#### Rankable metrics and honest uncertainty

Replace the ambiguous `BenchSummary` with a discriminated measurement state:

```ts
type MetricObservation =
  | { state: 'UNAVAILABLE'; metric: MetricId; unit: string; reasonCode: string }
  | {
      state: 'AVAILABLE'; metric: MetricId; unit: string;
      sampleAxis: 'iteration' | 'file'; n: number; warmup: number;
      samples: number[]; median: number; p95: number; mad: number;
      aggregate?: number; aggregation: 'median' | 'sum' | 'max' | 'ratio-of-sums';
    };
```

An available observation requires `n >= 1`, finite samples, and finite statistics. `n = 0` is `UNAVAILABLE`, carries a reason, has no median/p95/MAD, and cannot rank. JSON must never serialize `NaN` or infinity; RFC 8259 explicitly excludes those values from JSON numbers. [RFC 8259 §6](https://www.rfc-editor.org/rfc/rfc8259.html#section-6)

Record the sample axis and never call a distribution across files the same thing as a distribution across iterations. Preserve raw paired samples in the report artifact. For exhaustive rate metrics, store raw work and wall-time components and use ratio-of-sums when the metric represents total throughput; keep median per-file rate as a separate distribution. Cost sums and peak maxima remain valid when computed over the identical file identity set.

Ranking proceeds in this order:

1. Pass the comparability gate.
2. Rank by valid coverage (`PASS + DIFF`) over the same expected file set; full coverage outranks partial, and larger valid numerator outranks smaller.
3. Use a primary performance metric only when contenders have the same metric, unit, direction, aggregation, sample axis, and exact valid-file identity set.
4. Require at least the versioned `minRankSamples` from the benchmark policy; the project minimum is three finite observations until calibration requires more. `n = 1` may be displayed as a single observation but cannot produce a winner.
5. Treat contenders as tied/unresolved when the relative difference is within the larger of the 3% floor and the recorded empirical noise band, or when the policy's confidence interval includes no difference. Publish the rule and interval, not only a winner label.

MAD is a robust scale measure, but sample-size adequacy depends on the desired error rates and process variability rather than one universal number. [NIST/SEMATECH, Measures of Scale](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm) [NIST/SEMATECH, Sample Sizes Required](https://www.itl.nist.gov/div898/handbook/prc/section2/prc222.htm) Acceptance includes `n=0`, `n=1`, unequal units, unequal file sets, and near-noise results; none may produce a claimed sole winner.

#### Versioned, lossless, deterministic artifacts

Define separate versioned schemas for raw runs, normalized observations, reports, and bundle measurements. Each instance carries a stable schema URI and semantic version distinct from `suiteVersion`. Each JSON Schema document declares the 2020-12 dialect with `$schema` and its canonical URI with `$id`; writers and readers validate at their boundary. JSON Schema defines `$schema` as the dialect identifier and `$id` as the canonical schema resource identifier. [JSON Schema 2020-12 Core §8.1.1](https://json-schema.org/draft/2020-12/json-schema-core#section-8.1.1) [JSON Schema 2020-12 Core §8.2.1](https://json-schema.org/draft/2020-12/json-schema-core#section-8.2.1)

Reject or quarantine an unknown major version. Permit a known major's additive minor fields only after validation; never guess a payload from “array or `results`”. Keep suite version, scenario definition hash, and data-schema version separate. W3C recommends explicit dataset version indicators because they support repeatability and comparison. [W3C DWBP, data versioning](https://www.w3.org/TR/dwbp/#dataVersioning)

`report.json` must be a lossless normalized evidence artifact, not merely a table projection. Preserve per-variant reasons, hashes, oracle verdicts and measurements, full metric observations, environment/configuration, expected-set definition, cohort decisions, and exclusion reasons. Derive Markdown and UI views from that validated model. W3C's provenance best practice calls for complete origin and change information in machine-readable form. [W3C DWBP, data provenance](https://www.w3.org/TR/dwbp/#DataProvenance)

Normalize before serialization: sort engines, browsers, scenarios, variants, metrics, reasons, and map keys by documented stable keys; remove input-order overwrite semantics; normalize finite numbers; and escape Markdown cells including pipes and line breaks. Separate volatile envelope metadata such as `generatedAtIso` from canonical report data. Compute `contentHash` over the RFC 8785 canonical form of normalized data; the JSON Canonicalization Scheme specifies deterministic property sorting and invariant serialization. [RFC 8785 §3.2.3](https://www.rfc-editor.org/rfc/rfc8785.html#section-3.2.3)

Acceptance: the same normalized inputs and explicit timestamp produce byte-identical JSON and Markdown. Random permutations of input files, result arrays, object insertion order, and exhaustive-file order produce the same canonical content hash. Changing one substantive observation changes the hash. A generated timestamp alone may change the envelope but not the canonical data hash.

#### One ingestion, aggregation, ranking, and rendering core

Replace the independent report, live UI, aggregate, and goal-specific implementations with one pure pipeline:

```text
validate -> normalize -> select explicit cohort -> deduplicate -> reduce variants
         -> summarize metrics -> compute denominators -> rank -> render views
```

The live UI may update incrementally, but it must call the same cell reducer, metric selector, tie logic, and formatter as offline reporting. `compare`, `aggregate`, and targeted analyses become thin commands over the same normalized model. Snapshot tests feed one fixture through every entry point and require identical status counts, partial grades, eligibility, winners, and reasons.

Deduplication uses a stable `runId`, per-cell `observationId`, and canonical content hash. Identical duplicates coalesce. Conflicting duplicates with the same identity are an error. A deliberate `--latest` policy may choose by a validated observation timestamp and then content hash, but it must report the discarded record and must not use filename order. No tool silently shortens versioned engine ids or pools browsers.

#### Provenance-safe bundle measurements

Replace the flat bundle map with a versioned artifact containing, per engine: exact engine id and version, source/import entry and content hash, bundler/runtime name and version, target, tree-shake/minify flags, byte unit, compression algorithm/options, raw bytes, compressed bytes, included files, excluded runtime assets, and a typed `MEASURED`/`UNAVAILABLE` state with reason. A zero is valid only when the recorded measurement definition genuinely contains zero shipped third-party bytes; a missing or failed measurement is unavailable, never zero.

Injection validates the bundle artifact, requires an exact or explicitly declared unambiguous alias, records the joined artifact hash in the result, and refuses stale engine/source/toolchain mismatches. Bundle size forms its own build-toolchain cohort rather than being duplicated as independent browser wins. The report shows exclusions—especially separately loaded WASM/workers—next to the number. SPEC requires deviations and subset reporting to be disclosed, especially when only a subset validates. [SPEC CPU 2017 Run and Reporting Rules §5.4](https://www.spec.org/cpu2017/Docs/runrules.html#rule_5.4)

Acceptance covers a valid finite measurement, a legitimate measured zero, a missing engine entry, a failed build, an ambiguous alias, a stale source hash, and a changed bundler version. Only the valid, comparable measurements rank; every other case is visible with its exact reason.

### Known gaps

| Gap | Current | Consequence | Target | Verification |
| --- | --- | --- | --- | --- |
| No three-way oracle verdict | Results and oracle outcomes are binary; only `PASS` benchmarks. [src/core/scenario.ts:206-221](../../src/core/scenario.ts#L206-L221) [src/core/runner.ts:1411-1463](../../src/core/runner.ts#L1411-L1463) | Valid representation differences are reported as wrong or disappear inside a pass policy. | Persist and render `PASS`/`DIFF`/`FAIL`; `DIFF` is valid and benchmark-eligible but separately counted. Preserve the upstream oracle's representation diagnosis. W3C recommends machine-readable quality metadata rather than an opaque aggregate. [W3C DWBP, data quality](https://www.w3.org/TR/dwbp/#dataQuality) | A legal representation-only fixture appears as `DIFF` in raw JSON, report JSON, Markdown, UI, denominators, and ranking eligibility. |
| Mixed exhaustive outcomes collapse | Any file `FAIL`/`ERROR` replaces the top-level cell; the report projection drops per-file reasons and benches. [src/core/runner.ts:1135-1189](../../src/core/runner.ts#L1135-L1189) [src/core/report.ts:544-555](../../src/core/report.ts#L544-L555) | “01 passes, 02/03 fail” loses its robustness grade and passing evidence. | Grade partial coverage, retain identities and denominators, and separate semantic failures from execution errors. Completeness is actual relative to expected. [W3C DWBP, data quality](https://www.w3.org/TR/dwbp/#dataQuality) | The mandatory 1/3 fixture renders `Partial (1/3)`, never `ERROR`, with both failing names and all original evidence. |
| Runtime unsupported tuples can contaminate failure counts | Runtime NotApplicableError maps to `NA_ENGINE`, but only adapters that throw it get that route; disabled cells become `SKIPPED`. [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393) [src/core/runner.ts:1928-1957](../../src/core/runner.ts#L1928-L1957) | A coarse capability gate can leak unsupported combinations into `FAIL`/`ERROR`, while manual skips hide the applicability boundary. | Report NotApplicableError-derived `NA_ENGINE` separately, exclude it from correctness, include it in expected coverage, and expose disabled `SKIPPED` debt. Explain unavailable data rather than treating it as zero or wrong. [W3C DWBP, data not available](https://www.w3.org/TR/dwbp/#AccessNotAvailable) | Adapter tuple tests yield `NA_ENGINE`; scorecard counts do not change `FAIL`/`ERROR`; disabled-cell count shrinks without hiding missing cells. |
| Empty metric summaries look numeric | Empty finite input becomes `n:0` with zero median/p95/MAD; winner selection checks object/value presence, not `n`. [src/core/bench.ts:127-150](../../src/core/bench.ts#L127-L150) [src/core/report.ts:725-742](../../src/core/report.ts#L725-L742) | Missing observations can win a lower-is-better metric at zero. | Use typed unavailable observations and finite JSON numbers only. RFC 8259 forbids NaN/infinity, and unavailable values need explicit explanation. [RFC 8259 §6](https://www.rfc-editor.org/rfc/rfc8259.html#section-6) [W3C DWBP, data not available](https://www.w3.org/TR/dwbp/#AccessNotAvailable) | `n=0` serializes without statistics and cannot be selected, tied, indexed, or injected as zero. |
| Sample axes and aggregation are ambiguous | One summary shape represents iterations and per-file medians; rate aggregation is median-of-rates. [src/core/bench.ts:194-227](../../src/core/bench.ts#L194-L227) | p95/MAD meaning is unclear, and total throughput cannot be reconstructed. | Persist sample axis, raw numerators/denominators, and aggregation policy; use ratio-of-sums for total throughput when available. SPEC requires sufficient disclosure to reproduce a result. [SPEC CPU 2017 Run and Reporting Rules §4.0](https://www.spec.org/cpu2017/Docs/runrules.html#rule_4.0) | Schema tests distinguish iteration/file samples; a two-file rate fixture verifies ratio-of-sums and retains the per-file distribution. |
| Winner confidence is under-specified | Defaults are one measured iteration; a fixed 3% band ignores `n` and MAD. [src/core/bench.ts:16-28](../../src/core/bench.ts#L16-L28) [src/core/report.ts:696-708](../../src/core/report.ts#L696-L708) | A single noisy observation can produce a sole winner. | Record and enforce a calibrated minimum sample plan and uncertainty rule; insufficient samples remain descriptive. NIST explains both robust MAD and sample-size dependence on variance/error targets. [NIST MAD](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm) [NIST sample sizes](https://www.itl.nist.gov/div898/handbook/prc/section2/prc222.htm) | `n=1` and overlapping-uncertainty fixtures produce no sole winner; the report prints `n`, MAD, band, and interval. |
| Comparability is advisory | Caveats say same browser/corpus, but ranking validates neither host/config equality nor the complete cohort key. [src/core/report.ts:286-320](../../src/core/report.ts#L286-L320) | Incomparable runs can be pooled and ordered. | Enforce the cohort acceptance gate and disclose all configuration needed to reproduce results. [SPEC CPU 2017 Run Rules §§1.1, 4.0](https://www.spec.org/cpu2017/Docs/runrules.html#rule_1.1) | One-field mismatch tests split/reject before any winner is emitted. |
| Report JSON is lossy and unversioned | `ReportJson` has no schema id and projects away most oracle, exhaustive, and metric evidence. [src/core/report.ts:52-103](../../src/core/report.ts#L52-L103) [src/core/report.ts:233-249](../../src/core/report.ts#L233-L249) | A report cannot be independently audited or safely re-imported. | Publish validated, versioned, lossless artifacts with provenance. JSON Schema identifies dialect/resources; W3C calls for machine-readable provenance. [JSON Schema Core §8](https://json-schema.org/draft/2020-12/json-schema-core#section-8) [W3C DWBP, provenance](https://www.w3.org/TR/dwbp/#DataProvenance) | Round-trip a raw fixture through normalized report JSON without losing variant, oracle, metric, environment, or exclusion fields. |
| Output depends on order and wall clock | Scenario order is first-seen, duplicate cells are last-write-wins, and generation time defaults to now. [src/core/report.ts:298-347](../../src/core/report.ts#L298-L347) [src/core/report.ts:496-503](../../src/core/report.ts#L496-L503) | Identical evidence can yield different files, hashes, and winners after reordering. | Normalize/sort and hash canonical report data using JCS; isolate volatile envelope fields. [RFC 8785 §3.2.3](https://www.rfc-editor.org/rfc/rfc8785.html#section-3.2.3) | Property tests shuffle every collection and require identical canonical hash, JSON, and Markdown for an explicit timestamp. |
| Offline tools disagree | Compare uses lexical-order overwrite; aggregate uses timestamp/filename freshness; goal analysis duplicates ranking and drops browser/version identity. [scripts/compare.mjs:59-97](../../scripts/compare.mjs#L59-L97) [scripts/aggregate.mjs:105-130](../../scripts/aggregate.mjs#L105-L130) [scripts/goal26-analyze.mjs:16-55](../../scripts/goal26-analyze.mjs#L16-L55) | The same evidence can produce different selected cells and winners. | Share validation, cohorting, dedupe, aggregation, and ranking; make any latest-selection policy explicit. Comparable reporting should be reproducible. [SPEC CPU 2017 Run Rules §1.1](https://www.spec.org/cpu2017/Docs/runrules.html#rule_1.1) | Golden fixtures through every command yield identical selected observations, counts, partial grades, and winners. |
| Aggregate denominators omit missing cells | Totals are observed cells only and all `NA_*` plus `SKIPPED` merge. [scripts/aggregate.mjs:188-208](../../scripts/aggregate.mjs#L188-L208) | Thin or incomplete runs can look fully covered; applicability and policy debt are indistinguishable. | Derive expected matrix first; report not-run, each `NA_*`, and `SKIPPED` separately. W3C defines completeness against expected data. [W3C DWBP, data quality](https://www.w3.org/TR/dwbp/#dataQuality) | Removing one expected cell lowers expected coverage and adds one not-run without changing correctness denominator. |
| UI and report winners drift | UI ranks passing cells by coverage then wall; report uses primary metric direction and a tie band. [src/app/ui.ts:550-589](../../src/app/ui.ts#L550-L589) [src/core/report.ts:609-723](../../src/core/report.ts#L609-L723) | A user can see different winners before and after export. | Use one pure ranking core and one normalized model. Reproducibility requires the reported observation and derivation to be stable. [SPEC CPU 2017 Run Rules §1.1](https://www.spec.org/cpu2017/Docs/runrules.html#rule_1.1) | Incremental UI snapshots and offline reports agree after every completed row, including ties and higher-is-better metrics. |
| Bundle joins lack provenance | The scored input is a flat map and missing entries preserve a rankable empty zero; detail is disconnected. [scripts/measure-bundles.mjs:257-293](../../scripts/measure-bundles.mjs#L257-L293) [scripts/compare.mjs:145-201](../../scripts/compare.mjs#L145-L201) | Stale, ambiguous, failed, or differently configured builds can look comparable. | Version the measurement definition, validate exact joins, retain exclusions/toolchain/input hashes, and make missing unavailable. SPEC requires disclosure of configuration and deviations. [SPEC CPU 2017 Run Rules §§4.0, 5.4](https://www.spec.org/cpu2017/Docs/runrules.html#rule_4.0) | Toolchain/source/alias/missing-entry matrix admits only exact comparable measurements and prints every exclusion reason. |
| Markdown headline does not show its ranking value | Primary medians are projected, but the headline table calls the wall-time formatter; exhaustive winners may use `aggregate`. [src/core/report.ts:568-594](../../src/core/report.ts#L568-L594) [src/core/report.ts:1079-1111](../../src/core/report.ts#L1079-L1111) | The visible number can differ from the number that decided the winner. | Render the exact ranked value, aggregation label, unit, coverage, `n`, and eligibility reason from the normalized model. SPEC requires the observations underlying a reported result to be available. [SPEC CPU 2017 Run Rules §1.1](https://www.spec.org/cpu2017/Docs/runrules.html#rule_1.1) | For an exhaustive non-wall primary metric, Markdown value equals `winnerValue`; wall remains a separate diagnostic column. |

## Sources

### Repository evidence

- [src/core/scenario.ts:206-330](../../src/core/scenario.ts#L206-L330) — current statuses, boolean oracle outcomes, metric samples/summaries, scenario results, and exhaustive evidence.
- [src/core/measure.ts:13-103](../../src/core/measure.ts#L13-L103) — measurement context, wall timing, optional observations, and derived rates/latencies.
- [src/core/measure.ts:169-209](../../src/core/measure.ts#L169-L209) — best-effort memory sources and unavailable behavior.
- [src/core/bench.ts:16-28](../../src/core/bench.ts#L16-L28) — default warmup, iteration, and noise settings.
- [src/core/bench.ts:30-124](../../src/core/bench.ts#L30-L124) — metric field/unit/direction mapping and finite-value collection.
- [src/core/bench.ts:127-192](../../src/core/bench.ts#L127-L192) — summary statistics and median-based noise comparison.
- [src/core/bench.ts:194-253](../../src/core/bench.ts#L194-L253) — exhaustive aggregation and empty statistic helpers.
- [src/core/runner.ts:1118-1232](../../src/core/runner.ts#L1118-L1232) — exhaustive status, coverage, and benchmark reduction.
- [src/core/runner.ts:1382-1468](../../src/core/runner.ts#L1382-L1468) — operation/oracle/benchmark status routing and NotApplicableError handling.
- [src/core/runner.ts:1628-1708](../../src/core/runner.ts#L1628-L1708) — shared measured iterations and per-metric summarization.
- [src/core/runner.ts:1928-1957](../../src/core/runner.ts#L1928-L1957) — disabled-cell `SKIPPED` results.
- [src/core/format.ts:23-125](../../src/core/format.ts#L23-L125) — compact status and timing display contract.
- [src/core/report.ts:39-168](../../src/core/report.ts#L39-L168) — report input, conformance/benchmark projections, scorecards, and winner shape.
- [src/core/report.ts:233-347](../../src/core/report.ts#L233-L347) — unversioned report shape, ordering, timestamp, and report construction.
- [src/core/report.ts:490-594](../../src/core/report.ts#L490-L594) — duplicate indexing, matrix projection, conformance math, and primary-metric annotation.
- [src/core/report.ts:609-779](../../src/core/report.ts#L609-L779) — PASS-only winner ranking, metric selection, coverage, and benchmark projection.
- [src/core/report.ts:784-945](../../src/core/report.ts#L784-L945) — scorecard denominators, cross-browser wins, performance index, bundle field, and verdict.
- [src/core/report.ts:1079-1231](../../src/core/report.ts#L1079-L1231) — Markdown result, benchmark, scorecard, and leaderboard rendering.
- [src/core/report.ts:1410-1499](../../src/core/report.ts#L1410-L1499) — visible-cell formatting, admissibility, ordering helpers, and Markdown escaping.
- [src/app/ui.ts:378-415](../../src/app/ui.ts#L378-L415) — live status totals and applicable-cell pass rate.
- [src/app/ui.ts:484-589](../../src/app/ui.ts#L484-L589) — live cell rendering and independent wall-time winner race.
- [src/app/main.ts:393-405](../../src/app/main.ts#L393-L405) — browser-download raw result envelope.
- [scripts/launch.mjs:277-305](../../scripts/launch.mjs#L277-L305) — launcher raw result envelope and recorded run options.
- [scripts/compare.mjs:59-130](../../scripts/compare.mjs#L59-L130) — raw-file ingestion, flattening, report build, and serialization.
- [scripts/compare.mjs:135-231](../../scripts/compare.mjs#L135-L231) — bundle map injection and alias lookup.
- [scripts/aggregate.mjs:68-135](../../scripts/aggregate.mjs#L68-L135) — aggregate ingestion and timestamp/filename deduplication.
- [scripts/aggregate.mjs:144-246](../../scripts/aggregate.mjs#L144-L246) — browser selection, observed-cell denominators, and ranking.
- [scripts/goal26-analyze.mjs:7-68](../../scripts/goal26-analyze.mjs#L7-L68) — duplicated browser-agnostic winner analysis.
- [scripts/measure-bundles.mjs:8-58](../../scripts/measure-bundles.mjs#L8-L58) — bundle-size measurement definition and exclusions.
- [scripts/measure-bundles.mjs:248-293](../../scripts/measure-bundles.mjs#L248-L293) — flat map/detail output and error handling.

### External authorities

- Standard Performance Evaluation Corporation, [SPEC CPU 2017 Run and Reporting Rules §1.1, Philosophy](https://www.spec.org/cpu2017/Docs/runrules.html#rule_1.1), accessed 2026-07-16 — states the goals of fair, objective, meaningful, comparable, and reproducible reporting and preservation of underlying observations.
- Standard Performance Evaluation Corporation, [SPEC CPU 2017 Run and Reporting Rules §4.0, Run Rule Exceptions](https://www.spec.org/cpu2017/Docs/runrules.html#rule_4.0), accessed 2026-07-16 — requires configuration disclosure sufficient to reproduce a result.
- Standard Performance Evaluation Corporation, [SPEC CPU 2017 Run and Reporting Rules §4.10, Base and Peak Reporting](https://www.spec.org/cpu2017/Docs/runrules.html#rule_4.10), accessed 2026-07-16 — provides an authoritative example of declared median-based multi-run aggregation with validation requirements.
- Standard Performance Evaluation Corporation, [SPEC CPU 2017 Run and Reporting Rules §5.4, Research and Academic Usage](https://www.spec.org/cpu2017/Docs/runrules.html#rule_5.4), accessed 2026-07-16 — requires deviations and correctly validated subsets to be disclosed.
- W3C Data on the Web Best Practices Working Group, [Data on the Web Best Practices, BP 5: Provide data provenance information](https://www.w3.org/TR/dwbp/#DataProvenance), accessed 2026-07-16 — calls for complete, machine-readable origins and changes.
- W3C Data on the Web Best Practices Working Group, [Data on the Web Best Practices, BP 6: Provide data quality information](https://www.w3.org/TR/dwbp/#dataQuality), accessed 2026-07-16 — supports machine-readable quality measures and completeness against expected data.
- W3C Data on the Web Best Practices Working Group, [Data on the Web Best Practices, BP 7: Provide a version indicator](https://www.w3.org/TR/dwbp/#dataVersioning), accessed 2026-07-16 — explains why explicit versions support repeatability and comparison.
- W3C Data on the Web Best Practices Working Group, [Data on the Web Best Practices, BP 22: Provide an explanation for data that is not available](https://www.w3.org/TR/dwbp/#AccessNotAvailable), accessed 2026-07-16 — supports typed unavailable observations with reasons rather than fabricated zeroes.
- NIST/SEMATECH, [e-Handbook of Statistical Methods, Measures of Scale](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm), accessed 2026-07-16 — defines MAD and explains its robustness.
- NIST/SEMATECH, [e-Handbook of Statistical Methods, Sample Sizes Required](https://www.itl.nist.gov/div898/handbook/prc/section2/prc222.htm), accessed 2026-07-16 — explains that adequate sample size depends on significance, power, variability, and the difference of interest.
- IETF, [RFC 8259 §6, Numbers](https://www.rfc-editor.org/rfc/rfc8259.html#section-6), accessed 2026-07-16 — excludes NaN and infinity from JSON numbers.
- IETF, [RFC 8785 §3.2.3, Sorting of Object Properties](https://www.rfc-editor.org/rfc/rfc8785.html#section-3.2.3), accessed 2026-07-16 — specifies deterministic property sorting for canonical JSON.
- JSON Schema, [JSON Schema Core 2020-12 §§8.1.1 and 8.2.1](https://json-schema.org/draft/2020-12/json-schema-core#section-8), accessed 2026-07-16 — defines schema-dialect and canonical schema-resource identifiers.
