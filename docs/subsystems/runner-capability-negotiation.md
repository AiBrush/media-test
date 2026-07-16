# Runner and capability negotiation

> Scope: Owns matrix scheduling, capability and browser preflight, cell lifecycle, timeout and cancellation behavior, operation dispatch, status routing, exhaustive-file aggregation, and disabled-cell policy; scenario definitions, adapter internals, oracle algorithms, and report presentation are neighboring boundaries.
> Phase-2 owner: p2_subsystem_runner_capability_negotiation.

## Purpose

The runner turns each registered [scenario](../glossary.md#scenario) into an engine × scenario × browser [cell](../glossary.md#cell). It answers whether that cell is applicable, executes it once or over every selected input variant, protects the matrix from stalls, and preserves enough result state for the oracle and reporting layers to distinguish unsupported work from wrong work.

This page is the execution contract for adapter authors and later cleanup agents. In particular, it owns the [capability gate](../glossary.md#capability-gate), runtime [NotApplicableError](../glossary.md#notapplicableerror) routing, exhaustive [partial coverage](../glossary.md#partial-coverage), and the propagation consequences of the target three-way oracle model. General scenario fields belong to [Scenario DSL and registry](../subsystems/scenario-dsl-registry.md), adapter obligations to [Engine-adapter contract](../subsystems/engine-adapter-contract.md), oracle comparison rules to [Oracle system](../subsystems/oracle-system.md), media choice to [Media selection](../subsystems/media-selection.md), and ranking to [Reporting and aggregation](../subsystems/reporting-aggregation.md).

## As-built

### Matrix construction and run-wide state

`runMatrix()` defaults to all scored engines, resolves requested engine aliases or prefixes, warns and omits unknown requested engine ids, resolves requested scenarios while omitting unknown ids, then filters by pillar, feature family, and operation. The platform implementation is excluded from the default scored engine list because it is registered as an instrument rather than a competitor. [src/core/runner.ts:1734-1766](../../src/core/runner.ts#L1734-L1766) [src/core/runner.ts:2138-2205](../../src/core/runner.ts#L2138-L2205) [src/core/registry.ts:63-70](../../src/core/registry.ts#L63-L70)

Environment detection and the browser codec-support table run once, in parallel, for the whole matrix. The result environment stores the caller-supplied browser tag, detected version, user agent, GPU string, suite version, and later a per-engine id; it does not rerun feature detection per cell. [src/core/runner.ts:1768-1779](../../src/core/runner.ts#L1768-L1779) [src/core/feature-detect.ts:182-189](../../src/core/feature-detect.ts#L182-L189)

Media selection happens once per scenario and is shared by every engine. Normal mode chooses one seeded input; exhaustive mode builds the full candidate list. A selection-system exception warns and falls back to the scenario's baked input rather than aborting the matrix, while the corpus checksum records the selected set when selection succeeds. [src/core/runner.ts:1784-1825](../../src/core/runner.ts#L1784-L1825)

The execution queue is scenario-major and engine-minor unless one seeded Fisher–Yates shuffle is requested. Cells then execute serially. The outer abort signal is checked only before each cell; exhaustive mode also checks it before each input variant, so the current Stop action means “stop after the in-flight operation,” not immediate cancellation. Queue entries not reached after abort produce no result row; they are not relabeled `SKIPPED`. [src/core/runner.ts:428-440](../../src/core/runner.ts#L428-L440) [src/core/runner.ts:1827-1837](../../src/core/runner.ts#L1827-L1837) [src/core/runner.ts:1075-1099](../../src/core/runner.ts#L1075-L1099) [src/app/main.ts:210-218](../../src/app/main.ts#L210-L218)

### Capability gate and browser preflight

Both sides of the current gate are flat sets of [capability tokens](../glossary.md#capability-token). A scenario declares independent arrays for operation, input/output containers, input/output or undirected codecs, encryption, and features; an engine declares the corresponding operation map and arrays. Neither type can express a condition such as “transcode H.264 in MP4 to VP9 in WebM at 320×180, but not to VP9 in MP4” as one atomic support decision. [src/core/scenario.ts:17-31](../../src/core/scenario.ts#L17-L31) [src/core/engine.ts:115-137](../../src/core/engine.ts#L115-L137)

`negotiate()` is deliberately two-pass. Pass 1 checks every required operation, input/output container, codec direction, encryption scheme, and feature against the engine declarations. The first missing token returns [NA_ENGINE](../glossary.md#na_engine). Input/output-specific codec arrays fall back to the engine's undirected codec arrays. [src/core/runner.ts:124-189](../../src/core/runner.ts#L124-L189) [src/core/runner.ts:337-339](../../src/core/runner.ts#L337-L339)

Only after all engine tokens pass does Pass 2 consider [NA_BROWSER](../glossary.md#na_browser). `webcodecs:independent` bypasses the browser codec table. Probe, demux, remux-copy, and mux are treated as parser/packet paths; decode, seek, trim, decrypt, and transcode can require browser decode configuration, while transcode target codecs additionally require encode configuration. The target codecs are inferred from `options.video`, `options.audio`, and video rendition variants, and several native-codec feature tokens bypass selected audio checks. [src/core/runner.ts:191-227](../../src/core/runner.ts#L191-L227) [src/core/runner.ts:237-313](../../src/core/runner.ts#L237-L313) [src/core/runner.ts:341-368](../../src/core/runner.ts#L341-L368)

The run-wide browser table probes five canonical video tokens at 1920×1080 and fixed encoding settings, and ten audio tokens at 48 kHz, two channels, and 128 kbit/s. Presence means any one of the four WebCodecs constructors exists. Each support query catches missing constructors, missing methods, thrown exceptions, and `supported !== true` as `false`. [src/core/feature-detect.ts:19-31](../../src/core/feature-detect.ts#L19-L31) [src/core/feature-detect.ts:262-313](../../src/core/feature-detect.ts#L262-L313) [src/core/feature-detect.ts:315-399](../../src/core/feature-detect.ts#L315-L399)

Browser preflight also checks an alpha decode configuration and two strict-RGBA flags. Those pixel-comparability flags are currently a user-agent-family allow/deny table—golden comparison is disabled for WebKit and Firefox, and source comparison for WebKit—rather than an executed pixel self-test. `runOne()` adds output/oracle-specific WebKit gates for MKV playback smoke and exact AAC priming evidence. [src/core/feature-detect.ts:402-444](../../src/core/feature-detect.ts#L402-L444) [src/core/runner.ts:912-983](../../src/core/runner.ts#L912-L983) [src/core/runner.ts:1337-1356](../../src/core/runner.ts#L1337-L1356)

### Cell lifecycle and operation dispatch

For each queue entry, a registry row that is unexpectedly absent becomes [ERROR](../glossary.md#error), and the runner otherwise constructs a fresh engine whose factory failure also becomes `ERROR`. A known non-preemptible timeout rule is checked next and emits an applicable `FAIL` without entering the operation; a disabled-cell rule is checked after that and emits [SKIPPED](../glossary.md#skipped). Both early-result paths dispose the constructed engine before continuing. [src/core/runner.ts:1845-1957](../../src/core/runner.ts#L1845-L1957)

The result-reuse lookup occurs after forced-timeout and disabled checks but before current capability negotiation. Its key includes browser family, instance engine id, scenario id, and a tag for the selected file or complete exhaustive candidate set. Any cached status is reusable; a cache hit is returned as-is apart from restoring the real scenario id and prefixing its reason. [src/core/runner.ts:1960-2011](../../src/core/runner.ts#L1960-L2011) [src/app/result-cache.ts:43-55](../../src/app/result-cache.ts#L43-L55) [src/app/result-cache.ts:96-127](../../src/app/result-cache.ts#L96-L127)

On a cache miss, matrix-level negotiation can short-circuit to `NA_ENGINE` or `NA_BROWSER`. `runOne()` then checks selected or baked assets, returning [NA_ASSET](../glossary.md#na_asset) for a definitive missing file or required decode-frame golden, repeats negotiation, initializes the engine outside measured timing, and constructs lazy, cached `MediaInput` readers. Rotated inputs use a HEAD check that only treats a definite 404 as missing; baked assets also consult the fixture manifest. [src/core/runner.ts:2013-2038](../../src/core/runner.ts#L2013-L2038) [src/core/runner.ts:514-567](../../src/core/runner.ts#L514-L567) [src/core/runner.ts:1296-1375](../../src/core/runner.ts#L1296-L1375)

Operation dispatch is centralized and produces one normalized `OpResult` for the oracle context:

| Scenario operation | Current dispatch contract |
| --- | --- |
| `probe` | Calls `engine.probe()` once, or sequentially for every input and preserves every metadata result. [src/core/runner.ts:794-805](../../src/core/runner.ts#L794-L805) |
| `demux` / `remux` | Calls `demux()` directly; `remux()` receives the loose option object with a default `mp4` container and sanitized string tags. [src/core/runner.ts:721-730](../../src/core/runner.ts#L721-L730) [src/core/runner.ts:806-810](../../src/core/runner.ts#L806-L810) |
| `transcode` | Calls `transcode()` with the declared options and defaults only the output container to `mp4`. [src/core/runner.ts:738-740](../../src/core/runner.ts#L738-L740) [src/core/runner.ts:810-812](../../src/core/runner.ts#L810-L812) |
| `decodeFrames` / `seek` | Forwards optional `maxFrames`; seek defaults `tUs` to zero. [src/core/runner.ts:812-818](../../src/core/runner.ts#L812-L818) |
| `trim` | Extracts a range, defaulting missing endpoints to zero, and defaults to `mp4` and non-frame-accurate. [src/core/runner.ts:750-765](../../src/core/runner.ts#L750-L765) [src/core/runner.ts:818-820](../../src/core/runner.ts#L818-L820) |
| `mux` | Requires `engine.mux`; takes explicit encoded tracks or asks `prepareMuxTracks()`. Missing both is locally raised as `NotApplicableError`; a declared capability with no `mux` method is an ordinary error. [src/core/runner.ts:820-830](../../src/core/runner.ts#L820-L830) |
| `decrypt` | Requires `engine.decrypt`, extracts a key (empty string if absent), and defaults the scheme to `cenc-ctr`; a declared capability with no method is an ordinary error. [src/core/runner.ts:767-786](../../src/core/runner.ts#L767-L786) [src/core/runner.ts:831-838](../../src/core/runner.ts#L831-L838) |

### Timeouts, robustness, oracles, and measurement

Initialization, each functional operation, each oracle, and the whole benchmark use `Promise.race()` timeouts. Defaults are 120 seconds for initialization and an operation/oracle and 300 seconds for a whole benchmark; a positive scenario timeout overrides the operation/oracle default. Initialization timeout is `ERROR`, while operation timeout is `FAIL`. The race clears only its timer—it neither aborts the underlying promise nor preempts synchronous main-thread work. [src/core/runner.ts:655-684](../../src/core/runner.ts#L655-L684) [src/core/runner.ts:1358-1367](../../src/core/runner.ts#L1358-L1367) [src/core/runner.ts:1382-1389](../../src/core/runner.ts#L1382-L1389)

The normal path maps an operation timeout to `FAIL`, a recognized `NotApplicableError` to `NA_ENGINE`, and any other thrown operation error to the outer `ERROR` catch. Recognition currently requires `err instanceof Error` and the exact `name` string; adapter packages define their own local error classes rather than importing a shared runner-facing type. [src/core/runner.ts:686-694](../../src/core/runner.ts#L686-L694) [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393) [src/core/runner.ts:1464-1468](../../src/core/runner.ts#L1464-L1468)

Robustness cells invert only the expected malformed-input behavior: an ordinary clean rejection is evidence for graceful handling, a timeout is `FAIL`, and `NotApplicableError` remains `NA_ENGINE`. If the operation returns, its output is passed to the declared robustness oracles rather than automatically accepted. Robustness cells never benchmark. [src/core/runner.ts:1522-1569](../../src/core/runner.ts#L1522-L1569) [src/core/runner.ts:1572-1625](../../src/core/runner.ts#L1572-L1625)

For functional cells, the runner invokes every declared [oracle](../glossary.md#oracle). The current `OracleOutcome` is boolean (`pass`) and the current `ResultStatus` has no [DIFF](../glossary.md#diff). An oracle exception or timeout is converted to `pass: false`, so it is indistinguishable at the type boundary from a comparator-declared mismatch. The runner then classifies some failure-detail substrings as missing-golden gaps, lets any other failed oracle force `FAIL`, lets any surviving pass force `PASS`, and returns `NA_ASSET` only when every outcome is a recognized gap. [src/core/scenario.ts:206-222](../../src/core/scenario.ts#L206-L222) [src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889) [src/core/runner.ts:1411-1447](../../src/core/runner.ts#L1411-L1447)

`runMatrix()` injects the platform WebCodecs helpers as the unscored [reference decode](../glossary.md#reference-decode). The `ssim-psnr` oracle decodes candidate output through that path and, for transform scenarios without a committed frame golden, also decodes the source through the same neutral browser path. This is independent of the scored engine by construction. [src/core/runner.ts:2063-2075](../../src/core/runner.ts#L2063-L2075) [src/core/oracles.ts:1758-1808](../../src/core/oracles.ts#L1758-L1808) [src/core/oracles.ts:1905-1945](../../src/core/oracles.ts#L1905-L1945)

The same oracle currently pairs candidate and golden/source frames by array index. A platform decode error, no sink, zero frames, or no reference pixels returns boolean failure even when another parser or oracle might establish that the candidate output is structurally valid. [src/core/oracles.ts:1776-1803](../../src/core/oracles.ts#L1776-L1803) [src/core/oracles.ts:1811-1860](../../src/core/oracles.ts#L1811-L1860) [src/core/oracles.ts:1933-1980](../../src/core/oracles.ts#L1933-L1980)

Only a functional `PASS` is benchmark-eligible. Each measured iteration reconstructs the inputs, executes the operation once, feeds the resulting counters to all requested metrics, and summarizes the samples. A benchmark timeout preserves `PASS` but omits the number; another benchmark exception reaches the outer catch and replaces the cell with `ERROR`. [src/core/runner.ts:1445-1468](../../src/core/runner.ts#L1445-L1468) [src/core/runner.ts:1628-1710](../../src/core/runner.ts#L1628-L1710)

Every `runOne()` path disposes its engine in `finally`, and matrix-level early exits dispose explicitly. Disposal errors are swallowed so they do not replace the already selected status. [src/core/runner.ts:1469-1476](../../src/core/runner.ts#L1469-L1476) [src/core/runner.ts:1893-1902](../../src/core/runner.ts#L1893-L1902) [src/core/runner.ts:1928-1941](../../src/core/runner.ts#L1928-L1941)

### Exhaustive aggregation and disabled rules

Exhaustive mode reuses the already constructed engine only for the first file and constructs a fresh engine for every later input variant. It retains each variant's file, hash, baked flag, status, reason, and benchmark, but not that variant's oracle outcomes. Top-level coverage is `{passed, admissible, total}`, where “admissible” currently includes `PASS`, `FAIL`, and `ERROR`. [src/core/runner.ts:1053-1115](../../src/core/runner.ts#L1053-L1115) [src/core/runner.ts:1127-1169](../../src/core/runner.ts#L1127-L1169) [src/core/scenario.ts:320-330](../../src/core/scenario.ts#L320-L330)

Aggregation first looks for `FAIL` or `ERROR`. If either exists, any `FAIL` takes precedence over all `ERROR` sub-results; otherwise the top status is `ERROR`. Thus `PASS / FAIL / FAIL` currently becomes top-level `FAIL`, with coverage `1/3`, and its reason names files 02 and 03—it does not become `ERROR`. If there are no failures, at least one pass makes the whole cell `PASS`, even when other files are `NA_*`; if no file is admissible, a uniform NA/SKIPPED kind is retained, while a mixed set prefers `NA_ASSET` and otherwise depends on the first file. [src/core/runner.ts:1143-1204](../../src/core/runner.ts#L1143-L1204)

Bench aggregation includes passing files only. Additive costs are summed, peak memory takes the maximum, and rate metrics take the median; per-file representative values remain in `samples`. [src/core/runner.ts:1207-1232](../../src/core/runner.ts#L1207-L1232) [src/core/scenario.ts:247-267](../../src/core/scenario.ts#L247-L267)

The manual exception policy has two independent tables. One forced-timeout rule immediately records a Remotion corrupted-WebM hang as `FAIL`; the disabled table records exact engine/scenario pairs as `SKIPPED`, including browser-budget suppressions, scale limits, and concrete framework limitations. Matching accepts either the registry alias or versioned instance id. [src/core/disabled-cells.ts:14-34](../../src/core/disabled-cells.ts#L14-L34) [src/core/disabled-cells.ts:36-119](../../src/core/disabled-cells.ts#L36-L119) [src/core/disabled-cells.ts:121-231](../../src/core/disabled-cells.ts#L121-L231) [src/core/runner.ts:1928-1957](../../src/core/runner.ts#L1928-L1957)

## Contracts and invariants

- **Applicability kinds stay distinct.** The machine result type separately represents `NA_ENGINE`, `NA_BROWSER`, and `NA_ASSET`; `SKIPPED` is a policy decision and `ERROR` is not an NA alias. This is enforced by the result union and by separate negotiation/asset/disabled branches. [src/core/scenario.ts:208-218](../../src/core/scenario.ts#L208-L218) [src/core/runner.ts:2013-2037](../../src/core/runner.ts#L2013-L2037)
- **Engine absence wins over browser absence within the current gate.** Every engine declaration is checked before any browser query result is interpreted. This does not define a global precedence over cache, disabled rules, or assets; those are separate control-flow stages. [src/core/runner.ts:112-124](../../src/core/runner.ts#L112-L124) [src/core/runner.ts:130-200](../../src/core/runner.ts#L130-L200)
- **A runtime applicability decision is non-failing.** Any recognized `NotApplicableError` from normal dispatch, initialization, an adapter helper, or robustness dispatch becomes `NA_ENGINE`. The current name/`instanceof` recognition is an implementation mechanism, not permission to relabel malformed-input rejection or a real defect as unsupported. [src/core/runner.ts:1382-1393](../../src/core/runner.ts#L1382-L1393) [src/core/runner.ts:1464-1468](../../src/core/runner.ts#L1464-L1468) [src/core/runner.ts:1552-1565](../../src/core/runner.ts#L1552-L1565)
- **Correctness gates performance.** Today only top-level `PASS` can carry benchmark summaries; a `FAIL`, `ERROR`, NA, or `SKIPPED` cell cannot produce a scored number. [src/core/scenario.ts:269-279](../../src/core/scenario.ts#L269-L279) [src/core/runner.ts:1445-1463](../../src/core/runner.ts#L1445-L1463)
- **The platform helper is not a seventh scored engine.** It supplies browser reference decode/playback hooks while `listScoredEngines()` excludes instrument-only registrations. [src/core/registry.ts:18-26](../../src/core/registry.ts#L18-L26) [src/core/registry.ts:63-70](../../src/core/registry.ts#L63-L70) [src/core/runner.ts:2063-2072](../../src/core/runner.ts#L2063-L2072)
- **Input provenance is part of reuse correctness.** A single selection hash or the complete ordered exhaustive set is folded into the cache scenario key; a result for one byte selection is not reused for another selection. [src/core/runner.ts:1960-1984](../../src/core/runner.ts#L1960-L1984)
- **Exhaustive engines see the same ordered candidate set.** Selection is computed once per scenario, and each engine's aggregate records per-file status and total coverage. The current implementation enforces the set/order invariant but does not yet enforce the target partial-grade and per-file-oracle invariants. [src/core/runner.ts:1790-1803](../../src/core/runner.ts#L1790-L1803) [src/core/runner.ts:2040-2058](../../src/core/runner.ts#L2040-L2058)
- **Cleanup is best effort and result-preserving.** `dispose()` is attempted for every initialized/executed cell; disposal failure never masks the selected result. [src/core/runner.ts:1469-1476](../../src/core/runner.ts#L1469-L1476)

## Target design and known gaps

### Target design

The target runner uses a staged, typed decision pipeline rather than inferring all applicability from flat token membership:

1. **Resolve one concrete request.** Build a request tuple containing operation, selected input container and tracks, input codecs and concrete decoder configurations, output container/codecs and encoder configurations, encryption, transforms, timing mode, dimensions/rate/channels, and relevant options. Flat declarations remain a cheap coarse index, not the final answer.
2. **Ask the adapter about [combinatorial support](../glossary.md#combinatorial-support).** The adapter returns supported or a structured engine-applicability reason for the full tuple. Checks that require parsing may run after opening the input, but a known inability must throw the shared `NotApplicableError` and become `NA_ENGINE`. An invalid request, corrupt input, crash, unexpected library exception, or wrong output is not `NotApplicableError`.
3. **Probe the actual browser configurations the adapter will instantiate.** WebCodecs support is defined for a concrete configuration, including codec profile/level and encoder dimensions/rate—not for a canonical codec family in isolation—and the specification warns that support is best-effort and can change with hardware/resources. Query each exact decode/encode configuration immediately before use. `supported: false` or a configuration-time `NotSupportedError` is `NA_BROWSER`; a `TypeError` caused by the runner constructing an invalid configuration is `ERROR`; an `EncodingError` after an accepted configuration is execution evidence and must not be blindly rewritten as applicability. [W3C WebCodecs §7.1](https://www.w3.org/TR/webcodecs/#config-support) [W3C WebCodecs decoder configuration and processing](https://www.w3.org/TR/webcodecs/#dom-videodecoder-configure)
4. **Check required evidence and policy separately.** Missing source or golden evidence becomes `NA_ASSET`. An explicit, reviewed disabled rule becomes `SKIPPED`; it must never stand in for an unsupported tuple or a known correctness defect. Cache reuse happens only after the current tuple, browser support, assets, and policy fingerprint have been validated.
5. **Execute, evaluate, then measure.** Applicable operations produce typed oracle outcomes. Expected semantic/structural mismatch is `FAIL`; unexpected harness/adapter execution failure is `ERROR`; runtime inability is `NA_ENGINE`. Timeouts that violate a scenario's bounded-completion contract are `FAIL`, while a failure of the runner's isolation/cancellation mechanism is `ERROR`.

`NotApplicableError` should be exported once from the adapter contract with a stable machine code, operation, tuple dimensions, and human reason. Recognition must survive Worker/realm serialization through a structural discriminator rather than requiring `instanceof Error`. Mediabunny should use its output format's containability queries and concrete `canEncodeVideo`/`canEncodeAudio`/track `canDecode` checks; its official API explicitly separates container-supported codecs from concrete browser encodability. [Mediabunny supported formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs) [Mediabunny `OutputFormat`](https://mediabunny.dev/api/OutputFormat)

The Remotion composite, Remotion WebCodecs path, and Remotion Media Parser path need the same distinction. Remotion exposes copy/re-encode decisions and controllers for aborting conversion/parsing, and its worker parser is specifically intended to keep large parses off the UI thread. A known unsupported track/container/options tuple becomes `NA_ENGINE`; an `IsAnUnsupportedFileTypeError` caused by a deliberately malformed robustness input remains the expected rejection signal, not NA. [Remotion `convertMedia()`](https://www.remotion.dev/docs/webcodecs/convert-media) [Remotion WebCodecs controller](https://www.remotion.dev/docs/webcodecs/webcodecs-controller) [Remotion Media Parser controller](https://www.remotion.dev/docs/media-parser/media-parser-controller) [Remotion `parseMediaOnWebWorker()`](https://www.remotion.dev/docs/media-parser/parse-media-on-web-worker)

The target status precedence is explicit rather than an accident of branch order:

| Scope | Target precedence and meaning |
| --- | --- |
| Pre-execution | An active policy rule yields `SKIPPED` and records that policy separately. Otherwise a coarse or concrete engine inability yields `NA_ENGINE`; only an engine-applicable tuple can yield `NA_BROWSER`; only an engine- and browser-applicable tuple can yield `NA_ASSET`. All detected blockers may be retained as diagnostics, but the primary status is deterministic. |
| One executed variant | A comparator-returned `FAIL` means truly wrong. A shared `NotApplicableError` means `NA_ENGINE`. A proved browser reference/config limitation means `NA_BROWSER`. Missing evidence means `NA_ASSET`. An unexpected throw/worker crash/oracle implementation exception means `ERROR`. |
| Several oracle outcomes | `FAIL` wins; otherwise any target `DIFF` wins over all-`PASS`; otherwise `PASS`. Structured unavailable outcomes are excluded only under an explicit survivor-oracle policy; if no decisive oracle remains, their precise NA kind becomes the cell status. |
| Several exhaustive variants | `FAIL` > `ERROR` > `DIFF` > `PASS` among executed outcomes, while every per-file outcome remains visible. If no variant executes, retain all applicability counts and choose the deterministic pre-execution status above. |

The target oracle wire type replaces boolean `pass` with [PASS](../glossary.md#pass), `DIFF`, or [FAIL](../glossary.md#fail), plus a separate structured applicability/error channel. A valid [representation difference](../glossary.md#representation-difference) is `DIFF`, not `FAIL`; `DIFF` propagates to the cell and is benchmark-eligible because correctness remains admissible. Oracle exceptions and timeouts are `ERROR`, not fabricated comparator failures. Benchmark timeout/error is stored as measurement availability on an otherwise `PASS` or `DIFF` correctness result and never erases the already established verdict.

Exhaustive results gain complete per-file oracle outcomes and coverage counts such as `pass`, `diff`, `fail`, `error`, every NA kind, `skipped`, and `total`, plus `grade: full | partial | none`. “Partial” is orthogonal to `ResultStatus`: `PASS / FAIL / FAIL` has top status `FAIL`, `grade: partial`, valid coverage `1/3`, and explicit failing files 02 and 03; it is never converted to `ERROR`. `PASS / DIFF / PASS` is valid coverage `3/3`, top status `DIFF`, and full coverage. `PASS / ERROR / ERROR` is partial coverage with top status `ERROR`, because those two files did not produce correctness verdicts.

The neutral source-side WebCodecs decode used by `ssim-psnr` remains the target reference by design. Pair frames by presentation timestamp or overlapping presentation window, not array index; WebCodecs defines `VideoFrame.timestamp` and `duration` as microsecond presentation-time values copied from encoded chunks. [W3C WebCodecs `VideoFrame` attributes](https://www.w3.org/TR/webcodecs/#videoframe-interface) A source/output reference decoder's inability is a structured `NA_BROWSER` for that evidence path. Independently proved invalid output remains `FAIL`; valid output that the neutral browser path cannot decode is not made wrong by the instrument's limitation.

Timeouts and user cancellation should compose the caller signal with a timeout signal, thread it through fetch, initialization, operation, oracle, benchmark, and framework controllers, then wait for cleanup before the next cell. The DOM Standard defines `AbortSignal.timeout()` and `AbortSignal.any()` for this composition. [WHATWG DOM, AbortSignal static methods](https://dom.spec.whatwg.org/#interface-AbortSignal) A synchronous or non-cooperative call must execute in a disposable Worker; the HTML Standard's worker-termination algorithm aborts the script running in that Worker. [WHATWG HTML, terminate a worker](https://html.spec.whatwg.org/multipage/workers.html#terminate-a-worker) Acceptance requires that a timed-out operation cannot keep writing state after the runner advances and that the current forced-timeout cell can be exercised safely without freezing the UI.

Finally, behavior-dependent preflights should execute a focused probe instead of keying correctness eligibility to browser family. MDN's browser-detection guidance recommends testing the relevant feature behavior rather than assuming it from the user-agent string. [MDN, browser detection using the user agent](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent) The cache fingerprint must include suite/result schema, scenario definition, oracle-model version, engine id and configuration, browser build and exact support decisions, selected asset hashes/corpus checksum, and relevant golden hashes; a cached NA or PASS must not bypass changed preflight evidence.

### Known gaps

#### Flat capability tokens admit unsupported tuples

**Current.** `Requires` and `CapabilitySet` are independent token arrays, and `negotiate()` tests them independently. Mediabunny declares broad operation/container/codec sets but raises ordinary `Error` for an invalid `Conversion`, an unavailable concrete browser configuration, or unsupported mux details; those ordinary errors route to `ERROR`. Remotion WebCodecs already uses `NotApplicableError` for some option-specific limits, but other write/codec guards remain ordinary errors, while the composite unions the parser and WebCodecs declarations. [src/core/scenario.ts:17-31](../../src/core/scenario.ts#L17-L31) [src/core/engine.ts:120-137](../../src/core/engine.ts#L120-L137) [src/engines/mediabunny/adapter.ts:1029-1111](../../src/engines/mediabunny/adapter.ts#L1029-L1111) [src/engines/mediabunny/adapter.ts:850-877](../../src/engines/mediabunny/adapter.ts#L850-L877) [src/engines/remotion-webcodecs/adapter.ts:2138-2195](../../src/engines/remotion-webcodecs/adapter.ts#L2138-L2195) [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91)

**Consequence.** A truthful token such as “supports MP4,” “supports VP9,” and “supports transcode” can admit an unsupported combination and leak it into `FAIL`/`ERROR`; maintaining exact disabled cells then becomes an attractive but semantically wrong escape hatch.

**Target.** Evaluate the full tuple and require every adapter—including Mediabunny, Remotion, and Remotion Media Parser—to throw the shared `NotApplicableError` for a known concrete inability. Use framework containability and concrete config APIs rather than family-level guesses. Mediabunny documents both output-format codec queries and actual-config encode/decode queries. [Mediabunny supported formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs)

**Verification.** Add table-driven tests in which every individual token is true but the tuple is unsupported. Each must return `NA_ENGINE`, no oracle or benchmark may run, and no new disabled-cell entry may be needed. Companion malformed-input and injected-crash tests must still produce graceful robustness evidence and `ERROR`, respectively, proving the NA path is not overbroad.

#### Representative WebCodecs probes are not concrete support

**Current.** Browser support is detected once with fixed 1080p video and stereo/48 kHz audio configurations, then reused for every input profile, level, resolution, frame rate, channel layout, and bitrate. Strict pixel comparability is partly a browser-family denylist. [src/core/feature-detect.ts:315-399](../../src/core/feature-detect.ts#L315-L399) [src/core/feature-detect.ts:402-419](../../src/core/feature-detect.ts#L402-L419)

**Consequence.** The gate can return `NA_BROWSER` for a tuple the adapter handles through a native path, or admit a canonical codec whose actual profile/dimensions/options fail at runtime. A new browser behavior can also remain hidden behind an old UA assumption.

**Target.** Query the exact configurations that the adapter will configure and run behavior probes for strict pixel evidence. WebCodecs support checks are profile/configuration-specific and best-effort at query time, so their inputs and results must be attached to the cell environment. A false support result/`NotSupportedError` is browser applicability; invalid-config `TypeError` and post-configuration `EncodingError` stay distinguishable. [W3C WebCodecs §7.1 and configuration errors](https://www.w3.org/TR/webcodecs/#config-support) Feature behavior, rather than UA family, should control pixel applicability. [MDN UA detection guidance](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent)

**Verification.** Run matrices that vary H.264 profile/level, resolution, bitrate, hardware preference, AAC rate/channels, and native-codec adapters while holding the canonical token fixed. The recorded configuration must equal the one later passed to the framework; a false query must produce `NA_BROWSER`, and a passing query followed by a genuine encode/decode error must remain diagnosable rather than being rewritten as NA.

#### Promise racing does not cancel work

**Current.** `withTimeout()` rejects the race and clears its timer but cannot stop its operand. The UI abort signal is inspected only between cells. One known synchronous Remotion parser hang is hard-coded as a pre-execution `FAIL` because a main-thread timer cannot fire while it blocks. [src/core/runner.ts:655-684](../../src/core/runner.ts#L655-L684) [src/core/runner.ts:1836-1838](../../src/core/runner.ts#L1836-L1838) [src/core/disabled-cells.ts:26-34](../../src/core/disabled-cells.ts#L26-L34)

**Consequence.** A timed-out asynchronous operation can continue consuming CPU/memory or touching engine state after disposal and after the next cell starts; a synchronous hang can freeze the whole page. Stop latency is one complete cell or input variant.

**Target.** Compose timeout and user abort signals, invoke framework cancellation controllers, and isolate non-cooperative work in terminable Workers. Remotion exposes abort controllers for both conversion and parsing, and its official worker parser exists specifically for long, UI-blocking parses. [Remotion WebCodecs controller](https://www.remotion.dev/docs/webcodecs/webcodecs-controller) [Remotion Media Parser controller](https://www.remotion.dev/docs/media-parser/media-parser-controller) [Remotion worker parser](https://www.remotion.dev/docs/media-parser/parse-media-on-web-worker) Use immediate worker termination only as the hard fallback specified by HTML. [WHATWG HTML worker termination](https://html.spec.whatwg.org/multipage/workers.html#terminate-a-worker)

**Verification.** Instrument a never-resolving async adapter and a synchronous infinite-loop test Worker. On timeout or Stop, resource counters must cease, cleanup must complete, the next cell must start, and no late callback may mutate results. Remove the forced-timeout entry only after the real corrupted-WebM reproduction passes this test.

#### Boolean oracle outcomes collapse representation, mismatch, and oracle failure

**Current.** `OracleOutcome.pass` is boolean and `ResultStatus` has no `DIFF`. Oracle throws and timeouts are converted to `pass: false`; detail-string matching then distinguishes some asset gaps, while all other false outcomes become `FAIL`. A non-timeout benchmark error later overwrites an already established correctness pass with `ERROR`. [src/core/scenario.ts:213-222](../../src/core/scenario.ts#L213-L222) [src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889) [src/core/runner.ts:1411-1468](../../src/core/runner.ts#L1411-L1468)

**Consequence.** A legal representation difference, a truly wrong result, unavailable evidence, and a broken oracle can share the same boolean channel. Performance eligibility is also lost when measurement infrastructure fails after correctness has passed.

**Target.** Consume the oracle subsystem's target `PASS / DIFF / FAIL` verdict plus typed applicability/error outcomes. Aggregate `FAIL` over `DIFF` over `PASS`; benchmark `PASS` and `DIFF`; keep measurement availability separate. This runner change corroborates, but does not redefine, the representation rules owned by [Oracle system](../subsystems/oracle-system.md).

**Verification.** Feed synthetic oracle sequences for all verdict/applicability/error combinations. A valid golden representation difference must end `DIFF` with benchmark eligibility, a real mismatch must end `FAIL`, a thrown oracle must end `ERROR`, an all-unavailable set must retain its NA kind, and a benchmark exception must preserve the preceding `PASS`/`DIFF` verdict with no number.

#### Exhaustive aggregation lacks an explicit partial grade

**Current.** The aggregate stores only passed/admissible/total counts and omits per-file oracle outcomes. `PASS / FAIL / FAIL` becomes `FAIL` with `1/3` coverage, while `PASS` plus only NA sub-results becomes top-level `PASS`; no result field says “partial.” Mixed all-NA status can depend on file order when `NA_ASSET` is absent. [src/core/runner.ts:1127-1204](../../src/core/runner.ts#L1127-L1204) [src/core/scenario.ts:304-330](../../src/core/scenario.ts#L304-L330)

**Consequence.** The valuable robustness finding “file 01 works; files 02 and 03 do not” is visible only indirectly, can lose detailed oracle evidence, and can be summarized as a monolithic fail/error or an apparently complete pass. Order-dependent mixed NA status is not reproducible semantics.

**Target.** Preserve every per-file verdict, oracle outcome, reason, and measurement; add explicit outcome counts and `grade`. `PASS / FAIL / FAIL` is `FAIL` plus partial `1/3`, never `ERROR`; only actual harness/adapter errors contribute `ERROR`. Report and rank with the denominator and failing filenames as specified by [Reporting and aggregation](../subsystems/reporting-aggregation.md).

**Verification.** Unit-test permutations of `PASS`, `DIFF`, `FAIL`, `ERROR`, every NA, and `SKIPPED`; permutation must not change the aggregate. Snapshot the canonical `PASS / FAIL / FAIL` example and assert `status=FAIL`, `grade=partial`, valid `1`, total `3`, and both failing files with their oracle evidence.

#### SSIM confuses time alignment with reference decoder applicability

**Current.** The source reference is correctly decoded through the neutral platform helper, but candidate/reference frames are paired by index. Platform failure to decode source or candidate output is returned as boolean oracle failure. [src/core/oracles.ts:1758-1808](../../src/core/oracles.ts#L1758-L1808) [src/core/oracles.ts:1905-1980](../../src/core/oracles.ts#L1905-L1980)

**Consequence.** A valid fps/frame-count change can compare different presentation moments, and a valid representation outside the current browser reference decoder can falsely fail the scored engine.

**Target.** Keep the neutral source WebCodecs reference, pair by timestamp/time window with a documented tolerance, and separate candidate validity from reference-instrument applicability. WebCodecs supplies microsecond presentation timestamps and durations for this alignment. [W3C WebCodecs `VideoFrame.timestamp` and `duration`](https://www.w3.org/TR/webcodecs/#dom-videoframe-timestamp)

**Verification.** Test same-content transcodes at changed CFR, VFR, dropped/duplicated frames, and an output that a structural oracle validates but the current browser cannot decode. Time-aligned content must not false-fail; unavailable reference decode must produce typed `NA_BROWSER` evidence, while independently invalid output remains `FAIL`.

#### Disabled cells mix policy, applicability, and defects

**Current.** Exact cells are manually skipped for practical run-budget limits and for concrete parser/format limitations; a separate forced-timeout rule represents one applicable failure. Disabled matching occurs before current negotiation and cache lookup. [src/core/disabled-cells.ts:26-119](../../src/core/disabled-cells.ts#L26-L119) [src/core/disabled-cells.ts:121-231](../../src/core/disabled-cells.ts#L121-L231) [src/core/runner.ts:1893-1985](../../src/core/runner.ts#L1893-L1985)

**Consequence.** A stale rule can hide a capability change or real regression, and unsupported combinations require hand maintenance instead of adapter-owned applicability. `SKIPPED` can also mask what current negotiation would say.

**Target.** Shrink the table to exceptional, reviewed safety/budget suppressions. Every entry records owner, issue, browser/engine scope, evidence, expiry/retest condition, and why Worker isolation cannot safely execute it. Unsupported tuples move to `NotApplicableError → NA_ENGINE`; safe applicable defects run and remain `FAIL`/`ERROR`.

**Verification.** CI audits each rule against current engine ids and scenario ids, rejects expired/orphaned rules, and runs a no-disabled applicability audit. Removing a tuple-limitation rule must yield `NA_ENGINE`; removing a defect-hiding rule must expose its genuine verdict without freezing the matrix.

#### Reuse can bypass changed preflight evidence

**Current.** A cached result is returned before current negotiation. The persistent key contains browser family, engine id, scenario id, and runner-added selected-input tag; the cache separately uses a manually updated validation epoch for old passes, but not exact browser build, support configuration, scenario/oracle definition, or golden hashes. [src/core/runner.ts:1981-2013](../../src/core/runner.ts#L1981-L2013) [src/app/result-cache.ts:3-15](../../src/app/result-cache.ts#L3-L15) [src/app/result-cache.ts:43-50](../../src/app/result-cache.ts#L43-L50)

**Consequence.** A prior `PASS` or NA can survive a changed browser codec table, capability implementation, scenario tolerance, oracle semantics, or golden while still matching the coarse key.

**Target.** Validate a content-addressed execution fingerprint before reuse and rerun current policy/applicability checks. Treat the move from boolean outcomes to `PASS / DIFF / FAIL` as a result-schema break; never reinterpret old boolean rows as target verdicts.

**Verification.** Mutate each fingerprint component independently and assert a cache miss; unchanged components must hit. A cached `NA_BROWSER` must be rerun after the exact config becomes supported, and pre-three-way cached rows must never be loaded into the new schema.

## Sources

### Repository evidence

- [src/core/runner.ts:112-200](../../src/core/runner.ts#L112-L200) — two-pass engine-first capability negotiation.
- [src/core/runner.ts:191-334](../../src/core/runner.ts#L191-L334) — browser codec, native-path, alpha, and strict-pixel gates.
- [src/core/runner.ts:337-440](../../src/core/runner.ts#L337-L440) — target-codec inference, run options, and execution order.
- [src/core/runner.ts:514-629](../../src/core/runner.ts#L514-L629) — asset preflight and lazy `MediaInput` construction.
- [src/core/runner.ts:655-694](../../src/core/runner.ts#L655-L694) — timeout race and current `NotApplicableError` recognition.
- [src/core/runner.ts:721-844](../../src/core/runner.ts#L721-L844) — option normalization and complete operation dispatch.
- [src/core/runner.ts:858-889](../../src/core/runner.ts#L858-L889) — detail-substring classification of golden/evidence gaps.
- [src/core/runner.ts:912-983](../../src/core/runner.ts#L912-L983) — oracle-specific browser preflights.
- [src/core/runner.ts:1053-1232](../../src/core/runner.ts#L1053-L1232) — exhaustive execution, coverage/status aggregation, and cross-file metrics.
- [src/core/runner.ts:1242-1477](../../src/core/runner.ts#L1242-L1477) — single-cell lifecycle, negotiation, oracle aggregation, measurement, and disposal.
- [src/core/runner.ts:1522-1625](../../src/core/runner.ts#L1522-L1625) — robustness timeout/rejection/oracle routing.
- [src/core/runner.ts:1628-1710](../../src/core/runner.ts#L1628-L1710) — fresh measured iterations and shared samples.
- [src/core/runner.ts:1734-1863](../../src/core/runner.ts#L1734-L1863) — matrix filters, run-wide detection, selection, and unknown-id handling.
- [src/core/runner.ts:1865-2058](../../src/core/runner.ts#L1865-L2058) — factory, forced timeout, disabled, cache, negotiation, and exhaustive ordering.
- [src/core/runner.ts:2063-2123](../../src/core/runner.ts#L2063-L2123) — platform-hook injection, `runOne`, result persistence, and callbacks.
- [src/core/runner.ts:2138-2205](../../src/core/runner.ts#L2138-L2205) — requested engine-id resolution.
- [src/core/feature-detect.ts:19-131](../../src/core/feature-detect.ts#L19-L131) — browser support shape and canonical codec strings.
- [src/core/feature-detect.ts:182-258](../../src/core/feature-detect.ts#L182-L258) — user-agent environment and GPU detection.
- [src/core/feature-detect.ts:262-399](../../src/core/feature-detect.ts#L262-L399) — guarded representative WebCodecs support probes.
- [src/core/feature-detect.ts:402-467](../../src/core/feature-detect.ts#L402-L467) — UA-derived strict pixels, alpha, WebGPU, and memory probes.
- [src/core/disabled-cells.ts:14-34](../../src/core/disabled-cells.ts#L14-L34) — forced-timeout contract and current reproduction.
- [src/core/disabled-cells.ts:36-231](../../src/core/disabled-cells.ts#L36-L231) — manual disabled rules and exact matching.
- [src/core/scenario.ts:17-31](../../src/core/scenario.ts#L17-L31) — flat scenario requirement declarations.
- [src/core/scenario.ts:206-222](../../src/core/scenario.ts#L206-L222) — current statuses and boolean oracle outcome.
- [src/core/scenario.ts:247-330](../../src/core/scenario.ts#L247-L330) — benchmark, aggregate coverage, and per-file result schema.
- [src/core/engine.ts:115-137](../../src/core/engine.ts#L115-L137) — flat engine capability declarations.
- [src/core/registry.ts:18-26](../../src/core/registry.ts#L18-L26) — instrument-only registration boundary.
- [src/core/registry.ts:63-70](../../src/core/registry.ts#L63-L70) — scored-engine exclusion of instruments.
- [src/core/oracles.ts:1758-1903](../../src/core/oracles.ts#L1758-L1903) — output decode and index-paired golden SSIM path.
- [src/core/oracles.ts:1905-1995](../../src/core/oracles.ts#L1905-L1995) — neutral source reference decode and index pairing.
- [src/app/main.ts:210-218](../../src/app/main.ts#L210-L218) — current stop-after-cell UI contract.
- [src/app/result-cache.ts:3-15](../../src/app/result-cache.ts#L3-L15) — manual validation epoch and invalidated pass list.
- [src/app/result-cache.ts:43-55](../../src/app/result-cache.ts#L43-L55) — persistent cache-key and reuse rule.
- [src/app/result-cache.ts:96-127](../../src/app/result-cache.ts#L96-L127) — get/put behavior for all statuses.
- [src/engines/mediabunny/adapter.ts:1029-1111](../../src/engines/mediabunny/adapter.ts#L1029-L1111) — broad Mediabunny tokens and native exceptions.
- [src/engines/mediabunny/adapter.ts:850-877](../../src/engines/mediabunny/adapter.ts#L850-L877) — invalid conversion currently throws ordinary `Error`.
- [src/engines/remotion/adapter.ts:71-91](../../src/engines/remotion/adapter.ts#L71-L91) — unioned composite Remotion capabilities.
- [src/engines/remotion-webcodecs/adapter.ts:2138-2195](../../src/engines/remotion-webcodecs/adapter.ts#L2138-L2195) — existing option-specific runtime `NotApplicableError` checks.

### External authorities

- W3C, [WebCodecs, §7.1 “Check Configuration Support”](https://www.w3.org/TR/webcodecs/#config-support), accessed 2026-07-16 — support is for the concrete configuration, includes profile/level constraints, is best-effort, and may change with hardware/resources.
- W3C, [WebCodecs, `VideoDecoder.configure()` and decode processing](https://www.w3.org/TR/webcodecs/#dom-videodecoder-configure), accessed 2026-07-16 — distinguishes invalid configuration, unsupported configuration, and processing-time `EncodingError` paths.
- W3C, [WebCodecs, `VideoFrame` interface](https://www.w3.org/TR/webcodecs/#videoframe-interface), accessed 2026-07-16 — frame timestamps and durations are presentation-time values in microseconds, supporting time-aware pairing.
- WHATWG, [DOM Standard, `AbortSignal`](https://dom.spec.whatwg.org/#interface-AbortSignal), accessed 2026-07-16 — defines timeout signals, combined signals, abort reasons, and cooperative cancellation primitives.
- WHATWG, [HTML Standard, “terminate a worker”](https://html.spec.whatwg.org/multipage/workers.html#terminate-a-worker), accessed 2026-07-16 — defines hard termination that aborts the script running in a Worker.
- Mozilla, [MDN, “Browser detection using the user agent string”](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent), accessed 2026-07-16 — recommends testing relevant behavior instead of inferring capability from browser identity.
- Mediabunny, [“Supported formats & codecs”](https://mediabunny.dev/guide/supported-formats-and-codecs), accessed 2026-07-16 — documents concrete encode/decode configuration queries and track-level decodability.
- Mediabunny, [`OutputFormat` API](https://mediabunny.dev/api/OutputFormat), accessed 2026-07-16 — exposes container-specific supported codec and track-count queries.
- Remotion, [`convertMedia()`](https://www.remotion.dev/docs/webcodecs/convert-media), accessed 2026-07-16 — documents conversion containers/codecs and the controller hook.
- Remotion, [`webcodecsController()`](https://www.remotion.dev/docs/webcodecs/webcodecs-controller), accessed 2026-07-16 — provides explicit pause, resume, and abort controls for conversion.
- Remotion, [`mediaParserController()`](https://www.remotion.dev/docs/media-parser/media-parser-controller), accessed 2026-07-16 — provides abort control for parsing and download.
- Remotion, [`parseMediaOnWebWorker()`](https://www.remotion.dev/docs/media-parser/parse-media-on-web-worker), accessed 2026-07-16 — documents worker execution as the UI-safe path for long parses.
