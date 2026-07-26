# Requirements — media-test correctness & fairness cleanup

This file is the single, consolidated backlog for the correctness and fairness cleanup of the
media-browser benchmark. Every requirement is derived from the `docs/` Target-design + Known-gaps
sections (subsystems, engines, and feature families) — it records what the code must become, not a
re-description of what it does now. The north star is an **honest three-way verdict** (PASS / DIFF /
FAIL) and **honest applicability** (typed NA_ENGINE / NA_BROWSER / NA_ASSET vs ERROR): never punish a
valid representation that merely differs from the ffmpeg-baked golden, and never let an unsupported
combination leak into FAIL/ERROR. Correctness always gates performance; DIFF is correctness-valid and
benchmark-eligible.

How a coding agent should use this file: start at **Foundations** (REQ-CORE-01..04) — almost everything
depends on them. Then follow **Execution order** waves. Each requirement carries file:line evidence and
a `Source:` doc pointer; open that doc section for the full rationale and external authorities. Where a
per-engine or per-feature fix is only a local application of a foundation or a shared oracle/runner
requirement, it is folded into that canonical requirement and referenced by ID rather than duplicated.

## Conventions

**ID scheme.** `REQ-<AREA>-NN`. Areas: `CORE` (cross-cutting foundations), `ORAC` (oracle system),
`RUN` (runner & capability negotiation), `ADP` (engine-adapter contract), `ENG` (per-engine adapters,
title-tagged by engine), `DSL` (scenario DSL & registry), `SEL` (media selection), `FIX` (golden baking
& fixtures), `REP` (reporting & aggregation), `UI` (app / UI), `FEAT` (feature families, title-tagged by
family). `NN` is sequential within the area, P0 first.

**Priorities.**
- **P0** — fairness/correctness that changes benchmark verdicts, or a foundation others depend on.
- **P1** — important correctness, robustness, or maintainability.
- **P2** — coverage or polish.

**Per-requirement field format.**
```
### REQ-XXX-NN — Title
- **Priority:** P0|P1|P2
- **Depends on:** <REQ ids or "none">
- **Current:** <one sentence> (`path:line`)
- **Problem:** <one-sentence consequence>
- **Change:** <imperative target: what the code must do; bullets allowed>
- **Acceptance:** <testable criteria / fixtures from the doc's Verification text>
- **Source:** <doc path — section>
```

## Foundations (do first)

These four are canonical. Every local restatement across engines and feature families folds into them;
where an area adds engine/API-specific detail or its own fixtures, that area keeps its own requirement
with a `Depends on:` back to the relevant foundation.

### REQ-CORE-01 — Three-way oracle verdict, typed applicability/error channel, order-independent reducer
- **Priority:** P0
- **Depends on:** none
- **Current:** `OracleOutcome.pass` is boolean and `ResultStatus` has PASS/FAIL but no DIFF; the runner reduces the first substantive false outcome to FAIL and converts oracle throws/timeouts to `pass:false` (`src/core/scenario.ts:208-221`, `src/core/runner.ts:1411-1447`).
- **Problem:** A valid representation that differs from the ffmpeg-baked golden is indistinguishable from wrong output, and a thrown oracle looks like a semantic negative.
- **Change:**
  - Replace boolean `pass` with a discriminated `OracleOutcome`: `{state:'VERDICT'; verdict:'PASS'|'DIFF'|'FAIL'; …}` | `{state:'UNAVAILABLE'; status:'NA_ASSET'|'NA_BROWSER'; reasonCode; …}` | `{state:'ERROR'; reasonCode; …}`. Add `DIFF` to persisted `ResultStatus`.
  - PASS = contract holds after named normalizations; DIFF = media valid & semantically acceptable but differs from the baked representation (benchmark-eligible); FAIL = invalidity/lost-or-changed required content/violated invariant/measurement outside tolerance.
  - Implement an order-independent cell reducer: any FAIL→FAIL; else any DIFF→DIFF; else any PASS→PASS; if no substantive verdict, an oracle/harness throw→ERROR, else NA_BROWSER over NA_ASSET, retaining every per-oracle reason. NA_ENGINE is decided pre-oracle (REQ-CORE-02) and an oracle must never manufacture it.
  - PASS and DIFF both collect performance; FAIL gates benchmarks; a benchmark timeout/error stores measurement-availability without erasing the verdict.
- **Acceptance:** Reducer permutation tests prove FAIL > DIFF > PASS across all orderings; JSON round-trips preserve DIFF and typed unavailable reasons; a matrix fixture keeps `PASS+unavailable`→PASS, `DIFF+unavailable`→DIFF, any real FAIL decisive; thrown-oracle produces ERROR (not a false verdict).
- **Source:** docs/subsystems/oracle-system.md — Target design "Typed three-way outcomes"; docs/subsystems/runner-capability-negotiation.md — "Boolean oracle outcomes collapse representation, mismatch, and oracle failure"

### REQ-CORE-02 — Shared, serialization-safe `NotApplicableError`
- **Priority:** P0
- **Depends on:** none
- **Current:** Runtime applicability is recognized by `err instanceof Error` plus an exact `name` string; adapters define private lookalike classes or none, and an oracle-triggered `trim()`/`concat()` NA becomes FAIL (`src/core/runner.ts:686-694,1382-1393`, `src/engines/ffmpeg-wasm/adapter.ts:113-123`, `src/core/oracles.ts:3498-3521`).
- **Problem:** Operation/tuple/reason data is lost, `instanceof` fails across Worker/realm boundaries, and secondary (oracle) calls collapse NA to FAIL — mis-scoring cells.
- **Change:**
  - Export exactly one `NotApplicableError` from the adapter contract carrying a stable machine `reasonCode`, `operation`, `engineId`, structured tuple summary, human reason, and optional `cause`.
  - Recognize it by a **structural discriminator** (e.g. a branded field) that survives structured-clone/Worker/realm serialization — never by `instanceof` or message regex.
  - Map it to NA_ENGINE from functional dispatch, initialization, adapter helpers, robustness dispatch, and oracle-triggered sub-operations. Forbid any message/detail-string classification.
  - It is only for a **known concrete inability**; malformed-input rejections and real defects must remain FAIL/ERROR (never relabeled NA).
- **Acceptance:** Cross-adapter tests compare stable reason codes and prohibit message matching; a Worker-serialized error is still recognized; `trim()`/`concat()` applicability inside an oracle becomes NA_ENGINE, while an injected malformed-input rejection and an injected crash stay FAIL/ERROR.
- **Source:** docs/subsystems/engine-adapter-contract.md — "One shared execution protocol" / gap 2; docs/subsystems/runner-capability-negotiation.md — Target design (`NotApplicableError` export)

### REQ-CORE-03 — Combinatorial (tuple) capability with concrete WebCodecs probes
- **Priority:** P0
- **Depends on:** REQ-CORE-02
- **Current:** `Requires` and `CapabilitySet` are flat token arrays and `negotiate()` tests each token independently; browser support is a run-wide table probed once at 1920×1080 / 48 kHz stereo (`src/core/scenario.ts:17-31`, `src/core/engine.ts:115-137`, `src/core/runner.ts:112-189`, `src/core/feature-detect.ts:315-399`).
- **Problem:** Every atomic token can pass while the concrete operation × container × codec × config × options tuple is impossible, leaking into FAIL/ERROR or requiring hand-kept disabled cells; a representative probe hides real per-config browser support.
- **Change:**
  - Keep flat tokens only as a **cheap coarse pre-index** that rejects obvious misses before init.
  - Add a versioned adapter protocol `supports(request: ConcreteOperationRequest): SupportDecision` evaluating the full tuple (operation, input container/tracks/codecs/decoder-configs, output container/codecs/encoder-configs, encryption, transforms, timing mode, dimensions/rate/channels, options) once source info is available; a known inability throws the shared `NotApplicableError`.
  - Probe the **exact** WebCodecs decode/encode configuration the adapter will instantiate (`isConfigSupported()` immediately before use): `supported:false`/`NotSupportedError`→NA_BROWSER; a runner-caused invalid-config `TypeError`→ERROR; a post-configuration `EncodingError` is execution evidence, not applicability.
- **Acceptance:** A generated negative-tuple matrix per adapter yields only NA_ENGINE/NA_BROWSER (no valid tuple ends FAIL/ERROR/SKIPPED); capability-only disabled cells are removed; the recorded config equals the one later passed to the framework; holding the canonical codec fixed while varying profile/level/resolution/rate/channels routes correctly.
- **Source:** docs/subsystems/runner-capability-negotiation.md — "Flat capability tokens admit unsupported tuples", "Representative WebCodecs probes are not concrete support"; docs/subsystems/engine-adapter-contract.md — "One shared execution protocol"

### REQ-CORE-04 — Typed evidence & reader boundaries
- **Priority:** P0
- **Depends on:** none
- **Current:** Readers return `null` for unsupported/ambiguous parses and oracles encode unavailability as `pass:false` + special detail text that the runner searches (`golden absent`, `packet table unreadable`) to route NA_ASSET (`src/core/box-readers.ts:1006-1058`, `src/core/oracles.ts:306-324`, `src/core/runner.ts:858-889`).
- **Problem:** A server error, corrupt JSON, absent artifact, pending bake, and a reader limitation are observationally identical; a copy edit silently reroutes status; an unsupported reader path is mislabeled a missing asset.
- **Change:**
  - Replace `null` + detail-substring control flow with typed result objects carrying `OK | UNSUPPORTED_FORMAT | UNSUPPORTED_STRUCTURE | MALFORMED | INCOMPLETE` plus parser evidence, preserving the never-throw parser safety.
  - Disambiguate at the boundary: missing committed evidence → NA_ASSET; browser codec/API limitation → NA_BROWSER; a scored adapter's runtime inability → NA_ENGINE (REQ-CORE-02); an unimplemented neutral reader → harness ERROR (with an oracle-reader reason); malformed candidate bytes → FAIL.
- **Acceptance:** A detail-text mutation cannot change status; table-driven tests map 404/500/parse-error/schema-error/digest-mismatch/pending/valid to the exact state and cell status without inspecting text; fragmented-MP4 reader absence is ERROR while a missing golden is NA_ASSET.
- **Source:** docs/subsystems/oracle-system.md — Target design "Typed evidence and reader boundaries" / gap "Availability depends on prose"

## Master list

P0 first, then P1, then P2, grouped stably by area. This table is the index; full blocks follow per area.

| ID | Title | Area | Priority | Depends-on |
| --- | --- | --- | --- | --- |
| REQ-CORE-01 | Three-way verdict + typed applicability + reducer | Foundations | P0 | — |
| REQ-CORE-02 | Shared serialization-safe NotApplicableError | Foundations | P0 | — |
| REQ-CORE-03 | Combinatorial tuple capability + concrete probes | Foundations | P0 | CORE-02 |
| REQ-CORE-04 | Typed evidence & reader boundaries | Foundations | P0 | — |
| REQ-ORAC-01 | Semantic golden-metadata comparison | Oracle | P0 | CORE-01 |
| REQ-ORAC-02 | Semantic packet comparison + representation diagnostics | Oracle | P0 | CORE-01, CORE-04 |
| REQ-ORAC-03 | Timestamp-aware reference frame pairing | Oracle | P0 | CORE-01 |
| REQ-ORAC-04 | Reference-decode applicability classification | Oracle | P0 | CORE-04 |
| REQ-ORAC-05 | Extend neutral readers with typed results | Oracle | P1 | CORE-04 |
| REQ-ORAC-06 | Typed oracle-availability branch | Oracle | P1 | CORE-04 |
| REQ-RUN-01 | Staged tuple negotiation pipeline | Runner | P0 | CORE-03, CORE-02 |
| REQ-RUN-02 | Concrete per-cell WebCodecs probes → NA_BROWSER | Runner | P0 | CORE-03 |
| REQ-RUN-03 | Three-way propagation + benchmark PASS/DIFF | Runner | P0 | CORE-01 |
| REQ-RUN-04 | Explicit status precedence | Runner | P0 | CORE-01, CORE-02 |
| REQ-RUN-05 | Exhaustive partial-coverage grade + per-file outcomes | Runner | P0 | CORE-01 |
| REQ-RUN-06 | Real cancellation (composed signals + worker isolation) | Runner | P1 | — |
| REQ-RUN-07 | Shrink disabled-cell table + CI audit | Runner | P1 | CORE-02, CORE-03 |
| REQ-RUN-08 | Content-addressed cache fingerprint before reuse | Runner | P1 | — |
| REQ-RUN-09 | Executed pixel self-test instead of UA family | Runner | P1 | — |
| REQ-ADP-01 | Keep adapters verdict-neutral (PASS/DIFF/FAIL) | Adapter | P0 | CORE-01 |
| REQ-ADP-02 | Probe exact configs + BrowserNotSupportedError channel | Adapter | P0 | CORE-03 |
| REQ-ADP-03 | Translate framework probes to shared applicability | Adapter | P0 | CORE-02, CORE-03 |
| REQ-ADP-04 | Validate normalized adapter results before oracles | Adapter | P1 | — |
| REQ-ADP-05 | Explicit chunk framing & parameter-set location | Adapter | P1 | — |
| REQ-ADP-06 | Normative adapter lifecycle state machine | Adapter | P1 | — |
| REQ-ADP-07 | Thread AbortSignal through adapter signatures | Adapter | P1 | — |
| REQ-ADP-08 | Enforce & instrument frame/codec ownership | Adapter | P1 | — |
| REQ-ADP-09 | Adapter conformance suite gating add-engine | Adapter | P1 | ADP-13 |
| REQ-ADP-10 | Typed OperationTelemetry stream | Adapter | P2 | — |
| REQ-ADP-11 | Snapshot configUsed as validated immutable object | Adapter | P2 | ADP-06 |
| REQ-ADP-12 | Guarantee repeatable normalized observations | Adapter | P2 | — |
| REQ-ADP-13 | Conforming minimal adapter template | Adapter | P2 | CORE-02, ADP-04 |
| REQ-ENG-01 | [mediabunny] Tuple capability + typed NA_BROWSER probes | Engines | P0 | CORE-03 |
| REQ-ENG-02 | [mediabunny] Strict copy-only remux + track accounting | Engines | P0 | CORE-02 |
| REQ-ENG-03 | [mediabunny] Representation-aware packet + metadata evidence | Engines | P0 | CORE-04, ORAC-02 |
| REQ-ENG-04 | [mediabunny] Operation fidelity (mux/trim/transcode-audio) | Engines | P1 | CORE-02, ADP-04 |
| REQ-ENG-05 | [mediabunny] Decrypt KID/scheme/IV + metadata:write | Engines | P1 | CORE-02 |
| REQ-ENG-06 | [mediabunny] Truthful streaming/TTFB + cancellation + mutated HLS | Engines | P1 | ADP-07 |
| REQ-ENG-07 | [mediabunny] Starvation telemetry + conformance suite | Engines | P2 | ADP-09 |
| REQ-ENG-08 | [remotion] Tuple-aware capability, no filename heuristics | Engines | P0 | CORE-03 |
| REQ-ENG-09 | [remotion] Copy-only remux, explicit per-track | Engines | P0 | CORE-02 |
| REQ-ENG-10 | [remotion] Representation-aware packet/metadata, stop byte fudge | Engines | P0 | CORE-04, ORAC-02 |
| REQ-ENG-11 | [remotion] Exact output options + isolate per-track decoders | Engines | P1 | CORE-03 |
| REQ-ENG-12 | [remotion] Abort/cleanup/telemetry + conformance & partial grade | Engines | P1 | ADP-07, RUN-07 |
| REQ-ENG-13 | [ffmpeg-wasm] Tuple capability from runtime build | Engines | P0 | CORE-03 |
| REQ-ENG-14 | [ffmpeg-wasm] Representation-aware packet + metadata facts | Engines | P0 | CORE-04, ORAC-02 |
| REQ-ENG-15 | [ffmpeg-wasm] Single-flight race-safe lifecycle + signals | Engines | P1 | ADP-05, ADP-07 |
| REQ-ENG-16 | [ffmpeg-wasm] Bounded memory (WORKERFS, HLS caps, FS accounting) | Engines | P1 | — |
| REQ-ENG-17 | [ffmpeg-wasm] Preserve media time (probe/PTS/seek/mux) | Engines | P1 | CORE-04 |
| REQ-ENG-18 | [ffmpeg-wasm] Layout-token honesty + reproducible envelope | Engines | P1 | — |
| REQ-ENG-19 | [ffmpeg-wasm] Broaden CENC + reason-code decrypt + conformance | Engines | P1 | CORE-02 |
| REQ-ENG-20 | [mp4box] Tuple negotiation + precise runtime NA | Engines | P0 | CORE-03 |
| REQ-ENG-21 | [mp4box] Representation-aware packets + AAC/fps views | Engines | P0 | CORE-04, ORAC-02 |
| REQ-ENG-22 | [mp4box] demux-feed observable contract or remove | Engines | P1 | CORE-04 |
| REQ-ENG-23 | [mp4box] Preserve sample-entry config + presentation timeline | Engines | P1 | CORE-04 |
| REQ-ENG-24 | [mp4box] Prove fragment/writer completion | Engines | P1 | — |
| REQ-ENG-25 | [mp4box] Bounded memory + deterministic cleanup/cancel | Engines | P1 | — |
| REQ-ENG-26 | [web-demuxer] Operation-scoped tuple support + PTS-wrap FAIL | Engines | P0 | CORE-03 |
| REQ-ENG-27 | [web-demuxer] Representation-aware packets + optional DTS | Engines | P0 | CORE-04, ORAC-02 |
| REQ-ENG-28 | [web-demuxer] Temporal decode/seek + seek-landing selection | Engines | P1 | ORAC-03, ORAC-04 |
| REQ-ENG-29 | [web-demuxer] Dual-demux backend provenance + validate table path | Engines | P1 | CORE-03 |
| REQ-ENG-30 | [web-demuxer] Observable readiness/cancel/cleanup/memory | Engines | P1 | ADP-07 |
| REQ-ENG-31 | [web-demuxer] Partial robustness grade + conformance suite | Engines | P2 | RUN-05 |
| REQ-ENG-32 | [aibrush-media] Tuple applicability, typed errors not regex | Engines | P0 | CORE-03 |
| REQ-ENG-33 | [aibrush-media] Representation-aware packet + observed metadata | Engines | P0 | CORE-04, ORAC-02 |
| REQ-ENG-34 | [aibrush-media] Forward advertised output-shape options or reject | Engines | P1 | CORE-03 |
| REQ-ENG-35 | [aibrush-media] Single-source cancel/ownership, no global suppression | Engines | P1 | ADP-07 |
| REQ-ENG-36 | [aibrush-media] Factual telemetry/route/framework provenance | Engines | P1 | — |
| REQ-DSL-01 | Validated immutable ScenarioDefinitionV2 model | Scenario DSL | P0 | — |
| REQ-DSL-02 | Tuple/alternative Requires clauses + derived configs | Scenario DSL | P0 | CORE-03 |
| REQ-DSL-03 | Result schema v2 + reducer + results@2 JSON Schema | Scenario DSL | P0 | CORE-01 |
| REQ-DSL-04 | Scenario revision + RFC 8785 definition hash | Scenario DSL | P1 | DSL-01 |
| REQ-DSL-05 | One canonical manifest + atomic staged commit | Scenario DSL | P1 | DSL-01 |
| REQ-DSL-06 | Enforce result schema at read boundaries + v1→v2 migrator | Scenario DSL | P1 | DSL-03 |
| REQ-DSL-07 | Per-input outcomes + variant ids + partial coverage first-class | Scenario DSL | P1 | CORE-01, RUN-05 |
| REQ-DSL-08 | Variant/rendition expansion identity + committed snapshot | Scenario DSL | P2 | DSL-05 |
| REQ-SEL-01 | Validate & freeze canonical candidate manifest | Media selection | P0 | — |
| REQ-SEL-02 | Verify content digest + size before engine use | Media selection | P0 | SEL-01 |
| REQ-SEL-03 | Order-independent scoring + durable digest replay key | Media selection | P0 | SEL-01 |
| REQ-SEL-04 | Typed oracle-evidence plan + declared sufficient sets | Media selection | P0 | CORE-04, CORE-01 |
| REQ-SEL-05 | Sampling unit = unique verified content | Media selection | P1 | SEL-01 |
| REQ-SEL-06 | Derived-CENC eligibility fail-closed + digest-bound | Media selection | P1 | CORE-04 |
| REQ-SEL-07 | Bind cache/report identity to full-digest + pool contracts | Media selection | P1 | SEL-02 |
| REQ-SEL-08 | Selection-policy property + e2e acceptance tests | Media selection | P2 | SEL-01 |
| REQ-FIX-01 | Raw+canonical multi-view golden metadata (bake) | Golden/fixtures | P0 | FIX-05, ORAC-01 |
| REQ-FIX-02 | Record packet framing, separate semantic AUs from fingerprints | Golden/fixtures | P0 | ORAC-02 |
| REQ-FIX-03 | Require real pixel provenance; forbid 1×1 SSIM substitute | Golden/fixtures | P0 | FIX-06 |
| REQ-FIX-04 | Pair ssim-psnr goldens by timestamp + decoder availability | Golden/fixtures | P0 | ORAC-03, ORAC-04 |
| REQ-FIX-05 | One shared normalization + placeholder module | Golden/fixtures | P1 | — |
| REQ-FIX-06 | Versioned provenance envelope + validated schemas | Golden/fixtures | P1 | — |
| REQ-FIX-07 | Pin tool/environment perimeter + seed fixture crypto | Golden/fixtures | P1 | FIX-06 |
| REQ-FIX-08 | Transactional publication + generation index + runtime checks | Golden/fixtures | P1 | FIX-06 |
| REQ-FIX-09 | Reuse media only on digest+size + explicit update invalidation | Golden/fixtures | P1 | FIX-08 |
| REQ-FIX-10 | Expose non-collapsing raw+canonical golden fields | Golden/fixtures | P1 | CORE-01 |
| REQ-FIX-11 | Typed golden evidence states instead of string inference | Golden/fixtures | P1 | CORE-04 |
| REQ-REP-01 | Persist & render three-way PASS/DIFF/FAIL | Reporting | P0 | CORE-01 |
| REQ-REP-02 | Orthogonal execution/oracle/coverage states + reduction | Reporting | P0 | CORE-01, CORE-02 |
| REQ-REP-03 | Grade mixed exhaustive Partial + retain per-file projection | Reporting | P0 | CORE-01, RUN-05 |
| REQ-REP-04 | Publish explicit numerators/denominators + score formulas | Reporting | P0 | CORE-01 |
| REQ-REP-05 | Cohort comparability gate before comparison | Reporting | P0 | — |
| REQ-REP-06 | Discriminated available/unavailable MetricObservation | Reporting | P0 | — |
| REQ-REP-07 | Calibrated minimum sample plan + uncertainty tie rule | Reporting | P0 | REP-06 |
| REQ-REP-08 | Rank by valid coverage first; admit DIFF/partial | Reporting | P0 | CORE-01, REP-03 |
| REQ-REP-09 | Lossless normalized report.json | Reporting | P0 | REP-12 |
| REQ-REP-10 | One pure ingestion/aggregation/ranking/render pipeline | Reporting | P0 | REP-09 |
| REQ-REP-11 | Route NotApplicableError NA_ENGINE outside correctness denom | Reporting | P1 | CORE-02, CORE-03 |
| REQ-REP-12 | Derive expected matrix first + rank over common set | Reporting | P1 | REP-04 |
| REQ-REP-13 | Record metric sample axis + raw components + aggregation | Reporting | P1 | REP-06 |
| REQ-REP-14 | Versioned JSON schemas validated at boundaries | Reporting | P1 | — |
| REQ-REP-15 | Normalize + canonically hash report, isolate volatile envelope | Reporting | P1 | REP-09 |
| REQ-REP-16 | Deduplicate on canonical identity + explicit latest policy | Reporting | P1 | REP-10 |
| REQ-REP-17 | Provenance-safe versioned bundle-measurement artifact | Reporting | P1 | REP-05 |
| REQ-REP-18 | Render exact ranked value + aggregation label in Markdown | Reporting | P1 | REP-09 |
| REQ-UI-01 | Render PASS/DIFF/FAIL as distinct verdicts | App/UI | P0 | CORE-01, REP-01 |
| REQ-UI-02 | Present partial coverage as first-class grade | App/UI | P0 | RUN-05, REP-03 |
| REQ-UI-03 | Preserve streamed results on failure + reset error state | App/UI | P0 | — |
| REQ-UI-04 | Default manual boot to idle; reject empty selection | App/UI | P1 | — |
| REQ-UI-05 | Validate control bounds, preserve warmup 0, freeze config | App/UI | P1 | — |
| REQ-UI-06 | Keep NA_ENGINE/NA_BROWSER/NA_ASSET/SKIPPED/ERROR distinct | App/UI | P1 | CORE-02, CORE-03 |
| REQ-UI-07 | Render missing/pending metrics as labelled non-numeric | App/UI | P1 | REP-06 |
| REQ-UI-08 | Build, surface, and export an immutable run manifest | App/UI | P1 | UI-05 |
| REQ-UI-09 | Derive cache key from full manifest; version all statuses | App/UI | P1 | SEL-07 |
| REQ-UI-10 | Native progress element + polite status live region | App/UI | P1 | — |
| REQ-UI-11 | Table caption, header scope, focusable text details | App/UI | P1 | — |
| REQ-UI-12 | Keyboard-operable controls + meaningful focus order | App/UI | P1 | — |
| REQ-UI-13 | Distinguish non-preemptible stop from cancelling; inner progress | App/UI | P1 | — |
| REQ-UI-14 | Reserve Resume for validated checkpoint | App/UI | P1 | UI-08 |
| REQ-UI-15 | Unify manual & launcher export envelope | App/UI | P1 | UI-08, REP-09 |
| REQ-UI-16 | Disable /__save by default; loopback dev server | App/UI | P1 | — |
| REQ-UI-17 | Expose seed entry/replay + selected input variant/SHA | App/UI | P2 | UI-08 |
| REQ-UI-18 | Cross-port cache origin + import provenance | App/UI | P2 | UI-09 |
| REQ-UI-19 | Render all matrix rows on one scrollable page | App/UI | P2 | — |
| REQ-UI-20 | One CLI/UI option schema; fix headed/headless copy | App/UI | P2 | — |
| REQ-UI-21 | Correct reference-engine copy to unscored instrument | App/UI | P2 | — |
| REQ-FEAT-01 | [demux] DTS value-plus-provenance or unknown | Features | P1 | CORE-04 |
| REQ-FEAT-02 | [demux] Judge metadata with shared semantic comparator | Features | P1 | ORAC-01 |
| REQ-FEAT-03 | [demux] Validate truncated-H264 partial output structurally | Features | P1 | — |
| REQ-FEAT-04 | [demux] Enforce scale budgets (memory/read/long-task) | Features | P2 | — |
| REQ-FEAT-05 | [demux] FLAC SEEKTABLE invariance as two-input property | Features | P2 | — |
| REQ-FEAT-06 | [demux] Add corpus/oracle coverage for omitted axes | Features | P2 | — |
| REQ-FEAT-07 | [remux] Enforce strict stream-copy oracle | Features | P0 | CORE-03 |
| REQ-FEAT-08 | [remux] Neutral readers + semantic track/timeline matching | Features | P1 | ORAC-01 |
| REQ-FEAT-09 | [remux] Actually execute the round-trip property | Features | P1 | — |
| REQ-FEAT-10 | [remux] Validate safe partial remux output | Features | P1 | — |
| REQ-FEAT-11 | [remux] Reconcile size-ladder comments with manifest | Features | P2 | — |
| REQ-FEAT-12 | [mux] Boundary between illegal-mux rejection and NA | Features | P1 | CORE-02 |
| REQ-FEAT-13 | [mux] Verify multi-source track selection semantically | Features | P1 | — |
| REQ-FEAT-14 | [mux] Compare full B-frame/VFR timeline | Features | P1 | — |
| REQ-FEAT-15 | [mux] Output-mode evidence + streaming correctness contract | Features | P1 | — |
| REQ-FEAT-16 | [mux] Neutral parser/verdict per advertised write target | Features | P1 | ORAC-01 |
| REQ-FEAT-17 | [mux] Stop overclaiming CMAF | Features | P2 | — |
| REQ-FEAT-18 | [mux] Large-file addressing (co64/>4GiB) | Features | P2 | — |
| REQ-FEAT-19 | [mux] Specify rotation at structure and presentation | Features | P2 | — |
| REQ-FEAT-20 | [transcode] Effect-aware transform oracles | Features | P1 | ORAC-03 |
| REQ-FEAT-21 | [transcode] Score audio content and priming explicitly | Features | P1 | — |
| REQ-FEAT-22 | [transcode] Validate ABR renditions as switchable set | Features | P1 | — |
| REQ-FEAT-23 | [transcode] Compose round trip via output binding | Features | P1 | — |
| REQ-FEAT-24 | [transcode] Gate metrics on valid evidence + honest thresholds | Features | P2 | CORE-01 |
| REQ-FEAT-25 | [trim] Presentation-time-windowed boundary decode evidence | Features | P0 | ORAC-03, FIX-01 |
| REQ-FEAT-26 | [trim] Reachable audio content oracles | Features | P1 | — |
| REQ-FEAT-27 | [trim] Resolve ISO BMFF timeline through edit lists | Features | P1 | — |
| REQ-FEAT-28 | [trim] Assert feature-labelled properties | Features | P1 | — |
| REQ-FEAT-29 | [trim] Define no-op identity semantically | Features | P1 | ORAC-02 |
| REQ-FEAT-30 | [trim] Mode-aware preflight with runtime tuple NA | Features | P1 | CORE-03 |
| REQ-FEAT-31 | [trim] Fix throughput numerator (effective interval) | Features | P1 | — |
| REQ-FEAT-32 | [trim] Make fragmented trim scenario actually fragmented | Features | P2 | — |
| REQ-FEAT-33 | [trim] Implement trim-concat composition metamorphic | Features | P2 | — |
| REQ-FEAT-34 | [probe] Assert all declared metadata fields | Features | P1 | — |
| REQ-FEAT-35 | [probe] Make cross-container property actually cross-container | Features | P2 | — |
| REQ-FEAT-36 | [probe] Headerless "sane duration" predicate | Features | P2 | — |
| REQ-FEAT-37 | [probe] Fix AES-128 HLS key-free overclaim | Features | P2 | — |
| REQ-FEAT-38 | [probe] Enforce cheap/range probe budgets at scale | Features | P2 | — |
| REQ-FEAT-39 | [probe] Turn coverage gaps into executable scenarios | Features | P2 | — |
| REQ-FEAT-40 | [metadata] Extend normalized metadata schema | Features | P1 | — |
| REQ-FEAT-41 | [metadata] Verify tag read/write by neutral re-probe | Features | P1 | FEAT-40 |
| REQ-FEAT-42 | [metadata] Validate safe metadata recovery semantically | Features | P1 | — |
| REQ-FEAT-43 | [metadata] Bake equivalence-class fixtures | Features | P2 | ORAC-01 |
| REQ-FEAT-44 | [decode-seek] Adapters return observed seek landing PTS | Features | P0 | — |
| REQ-FEAT-45 | [decode-seek] Execute stateful repeated & backward seek | Features | P1 | — |
| REQ-FEAT-46 | [decode-seek] Measure timeToFirstFrame at frame-sink boundary | Features | P1 | REP-06 |
| REQ-FEAT-47 | [decode-seek] Enforce track selection through DecodeOptions | Features | P1 | — |
| REQ-FEAT-48 | [decode-seek] Compare rotated output in display space | Features | P1 | ORAC-03 |
| REQ-FEAT-49 | [decode-seek] Bake & compare timestamp-keyed alpha evidence | Features | P1 | ORAC-03 |
| REQ-FEAT-50 | [decode-seek] Preserve structured size/provenance fields | Features | P2 | — |
| REQ-FEAT-51 | [decode-seek] Negotiate ImageDecoder separately | Features | P2 | CORE-03 |
| REQ-FEAT-52 | [encryption] Key/IV provenance blocking parity preflight | Features | P0 | — |
| REQ-FEAT-53 | [encryption] Structural decrypt reference-reimport + cardinality | Features | P0 | CORE-01, ORAC-04 |
| REQ-FEAT-54 | [encryption] Restrict DERIVED rotation to positive rows | Features | P0 | — |
| REQ-FEAT-55 | [encryption] Typed negative/robustness rejection + partial grade | Features | P0 | CORE-04, CORE-02, RUN-05 |
| REQ-FEAT-56 | [encryption] Pattern-specific CENS & CBCS coverage | Features | P1 | — |
| REQ-FEAT-57 | [encryption] Full HLS method & IV matrix | Features | P1 | — |
| REQ-FEAT-58 | [encryption] Clear Key as EME scenario or precise negative | Features | P1 | — |
| REQ-FEAT-59 | [encryption] Byte-identity comparator for unencrypted no-op | Features | P1 | CORE-01 |
| REQ-FEAT-60 | [encryption] Real duration numerator for decrypt throughput | Features | P1 | — |
| REQ-FEAT-61 | [audio-dsp] Transform-specific sample & spectral checks | Features | P0 | — |
| REQ-FEAT-62 | [audio-dsp] WAV/WAVEFORMATEXTENSIBLE/CAF readers + two-layer | Features | P1 | — |
| REQ-FEAT-63 | [audio-dsp] Native-rate evidence, not decodeAudioData rate | Features | P1 | — |
| REQ-FEAT-64 | [audio-dsp] Gapless comparison priming-aware at native rate | Features | P1 | — |
| REQ-FEAT-65 | [audio-dsp] Audio throughput in sample-frame units | Features | P1 | — |
| REQ-FEAT-66 | [audio-dsp] Endianness round trip as observable two-leg contract | Features | P1 | CORE-02 |
| REQ-FEAT-67 | [audio-dsp] Derive scenario display facts from manifest | Features | P2 | — |
| REQ-FEAT-68 | [performance] Count actual output presentation units | Features | P0 | — |
| REQ-FEAT-69 | [performance] Adaptive/repeated/interleaved timing protocol | Features | P1 | — |
| REQ-FEAT-70 | [performance] Honest memory protocol | Features | P1 | — |
| REQ-FEAT-71 | [performance] Gate and window long-task measurement | Features | P1 | — |
| REQ-FEAT-72 | [performance] Complete, early-joined bundle component sizes | Features | P1 | REP-17 |
| REQ-FEAT-73 | [performance] Honest media-timeline denominators + event latency | Features | P1 | — |
| REQ-FEAT-74 | [performance] Data-driven scale availability + de-dup questions | Features | P2 | — |
| REQ-FEAT-75 | [performance] Close VideoFrames + repeated-decode leak check | Features | P2 | ADP-08 |
| REQ-FEAT-76 | [robustness] Multi-file corpora + full/partial/none grading | Features | P0 | RUN-05 |
| REQ-FEAT-77 | [robustness] Structured operation disposition + survivor oracles | Features | P0 | CORE-04, CORE-02 |
| REQ-FEAT-78 | [robustness] Real isolation & resource limits | Features | P1 | RUN-06 |
| REQ-FEAT-79 | [robustness] Align metamorphic labels with executable checks | Features | P1 | — |
| REQ-FEAT-80 | [streaming-output] Split correctness into four layers | Features | P1 | — |
| REQ-FEAT-81 | [streaming-output] Validate fragmented MP4/CMAF + MSE append | Features | P1 | — |
| REQ-FEAT-82 | [streaming-output] Prove reserve vs in-memory from write trace | Features | P1 | FEAT-80 |
| REQ-FEAT-83 | [streaming-output] MPEG-TS structural & continuity reader | Features | P0 | — |
| REQ-FEAT-84 | [streaming-output] Honor or reject writeChunkBytes granularity | Features | P1 | FEAT-80 |
| REQ-FEAT-85 | [streaming-output] Enforce live WebM constraints + incremental | Features | P1 | — |
| REQ-FEAT-86 | [streaming-output] Own TTFB clock origin + real first-write | Features | P0 | — |
| REQ-FEAT-87 | [streaming-output] Bounded streaming memory, non-retaining sink | Features | P1 | FEAT-80, FEAT-70 |
| REQ-FEAT-88 | [streaming-output] Tuple-aware applicability with reason codes | Features | P1 | CORE-03 |
| REQ-FEAT-89 | [streaming-output] Isolate equivalent work before scale/mode | Features | P1 | — |

## Oracle system

Canonical comparators the feature families reference. `REQ-CORE-01` owns the three-way verdict + reducer;
these own the comparison algorithms.

### REQ-ORAC-01 — Semantic golden-metadata comparison
- **Priority:** P0
- **Depends on:** REQ-CORE-01
- **Current:** `golden-metadata` lowercases codecs, zips measured/golden tracks positionally, and requires exact sample rate/channels; a nearby reference-reimport path already canonicalizes aliases but this comparator does not call it (`src/core/oracles.ts:721-825`, `src/core/box-readers.ts:46-121`).
- **Problem:** Codec aliases, reordered tracks, HE-AAC/SBR core-vs-output rates, Parametric Stereo channels, VFR/NTSC cadence, and edit-list/priming/timescale duration views all look like genuinely wrong metadata.
- **Change:** Two layers — semantic validation, then representation classification (semantic mismatch→FAIL, semantic agreement + raw diff→DIFF, full agreement→PASS):
  - Canonicalize codec identity before compare: `avc1`/`avc3`→h264, `hev1`/`hvc1`→hevc, `V_MPEG4/ISO/AVC`→h264, `mp4a`→aac (shared `canonicalCodecToken`).
  - Match logical tracks by type (video/audio/subtitle/other) with a per-type minimum-cost one-to-one match (canonical codec, dims, language, rate/channels); unequal per-type counts→FAIL; reorder→DIFF.
  - Make AAC signaling explicit (raw string / `AudioSpecificConfig` AOT, `sbrPresent`/`psPresent`): only-when-signaled may core-rate vs 2× compare equal, and 1-ch core vs 2-ch output compare equal; same ratios unsignaled→FAIL.
  - Band cadence by what is represented: keep CFR/VFR mode + rational/timestamp cadence; NTSC families (24000/1001, 30000/1001, 60000/1001) compare around the rational center; VFR uses a scenario band/envelope.
  - Compare presentation duration with evidenced allowances only (movie/media timescale, edit-list span, sample span, priming/remainder + at most one tick per timebase); loss beyond the signaled envelope→FAIL.
  - Retain raw + canonical values, selected matches, cadence mode/band, tolerance components, and the selecting rule in diagnostics.
- **Acceptance:** Fixtures for each codec alias, audio-first vs video-first, reversed same-type audio, signaled/unsignaled SBR 24↔48 kHz, signaled/unsignaled PS 1↔2 ch, 29.97↔30000/1001, genuine VFR envelope, AAC priming, ISO BMFF edit list, and two legal timescales each avoid FAIL when legal, while a missing track / wrong canonical codec / unsignaled ratio / duration beyond envelope FAIL.
- **Source:** docs/subsystems/oracle-system.md — Target design "Semantic golden-metadata comparison"

### REQ-ORAC-02 — Semantic packet comparison with representation diagnostics
- **Priority:** P0
- **Depends on:** REQ-CORE-01, REQ-CORE-04
- **Current:** `PacketInfo` holds only track index, byte size, PTS, DTS, keyframe bool; the comparator groups by track, removes one constant origin, then requires equal count/layout, exact sizes, exact keyframe flags, and turns any residual into FAIL (`src/core/engine.ts:63-74`, `src/core/oracles.ts:835-985`).
- **Problem:** Annex B vs AVCC framing, inline vs out-of-band SPS/PPS, and legal NAL/access-unit grouping change byte sizes/rows without changing decodable pictures or timing — yet FAIL.
- **Change:**
  - Add codec-aware packet evidence: payload bytes or a stable payload digest, decoder configuration, framing kind, normalized access-unit identity, derived random-access kind.
  - For AVC/HEVC normalize Annex B start-code and length-prefixed `avcC`/`hvcC` framing into ordered NAL units; merge out-of-band VPS/SPS/PPS with equivalent in-band sets; form access units before comparing coded pictures.
  - Verdict: match tracks by type+canonical codec; compare timelines after constant-origin normalization with codec/timebase-aware tolerance; for lossless-preserve compare ordered primary coded pictures/audio frames (dropped/duplicated/reordered/changed required content→FAIL); derive random-access from codec structure (missing required RAP→FAIL); semantic agreement + baked rows agree→PASS, semantic agreement + framing/param-set/grouping/size/keyframe diff→DIFF (both representations in diagnostics); no implemented normalizer→typed harness-unavailable (never infer PASS, never call an unexplained row diff FAIL).
- **Acceptance:** Paired fixtures whose VCL/audio content and timing match across Annex B / length-prefixed, inline / out-of-band SPS/PPS, and ≥2 legal NAL groupings are DIFF (not FAIL); removing a VCL NAL, altering decoded content, breaking IDR dependency, changing cadence beyond tolerance, or wrong-track assignment remain FAIL.
- **Source:** docs/subsystems/oracle-system.md — Target design "Semantic packet comparison with representation diagnostics"

### REQ-ORAC-03 — Timestamp-aware neutral reference frame pairing
- **Priority:** P0
- **Depends on:** REQ-CORE-01
- **Current:** Both committed-golden and source-reference SSIM pair array element `i` with `i`, and the shared frame-SSIM helper rejects a frame-count delta above three (`src/core/oracles.ts:1078-1128,1811-1860,1933-1984`).
- **Problem:** An intended fps conversion, VFR cadence change, or frame drop/dup compares different presentation moments and false-fails; a valid frame-count change is rejected outright.
- **Change:** Replace index pairing with presentation-time sampling (shared by golden-index mode and fanout's `compareFrameSsim`):
  - Preserve each frame PTS + duration; normalize each timeline by first PTS; derive half-open `[pts, pts+duration)` (fallbacks: next PTS, then documented median-delta).
  - Apply the scenario crop/rotation/resize to source pixels; compute the common presentation window; select ≤8 evenly spaced sample times; at each time pick frames whose intervals contain it, else nearest center within `max(half-frame, one timebase tick, scenario tolerance)`; reuse across adjacent times allowed for intended fps conversion.
  - Require ≥75% of sample times to yield pairs and presentation-window coverage within the scenario duration tolerance; a different frame count alone is not failure, missing time coverage is; keep reporting pair count, min/mean SSIM, PSNR, timestamp residuals, coverage.
- **Acceptance:** fps-conversion and VFR fixtures whose equal presentation moments are index-offset align and pass their existing threshold; each expected PTS maps to ≤1 actual frame; missing expected coverage fails.
- **Source:** docs/subsystems/oracle-system.md — Target design "Timestamp-aware neutral reference decode"

### REQ-ORAC-04 — Reference-decode applicability classification (separate from quality)
- **Priority:** P0
- **Depends on:** REQ-CORE-04
- **Current:** Candidate platform-decode exceptions, empty sinks, and missing pixels all become ordinary FAIL; the code cannot distinguish malformed output from valid output this browser instrument cannot decode (`src/core/oracles.ts:1776-1804,1919-1945`, `src/engines/platform/decode.ts:89-122`).
- **Problem:** A legal output that the neutral browser reference path cannot decode is blamed on the scored engine.
- **Change:** Classify decode failure independently of the quality score:
  - Missing API or `isConfigSupported()===false` for source/output → NA_BROWSER for the reference oracle.
  - Valid output whose concrete codec/config the browser rejects, or whose only decode path is unavailable in the realm → typed NA_BROWSER reference-path limitation, not FAIL.
  - Structurally malformed output, or decode failure after config is known-supported with independent evidence of an invalid bitstream → FAIL.
  - Unimplemented/ambiguous internal demux/parser path → harness ERROR (not NA_BROWSER, not guessed wrongness).
  - When another oracle has a substantive verdict, an unavailable SSIM is retained but does not erase it; when every correctness oracle is reference-blocked, the cell is NA_BROWSER.
- **Acceptance:** A legal browser-unsupported-codec fixture → NA_BROWSER; a deliberately truncated stream under a supported config → FAIL; both preserve per-oracle reasons.
- **Source:** docs/subsystems/oracle-system.md — Target design "Timestamp-aware neutral reference decode" / gap "Reference decode applicability is collapsed into failure"

### REQ-ORAC-05 — Extend neutral readers with typed results (fragmented ISO BMFF, WebM lacing)
- **Priority:** P1
- **Depends on:** REQ-CORE-04
- **Current:** The ISO BMFF packet reader declines fragmented files; the WebM reader declines lacing, unknown-size clusters, and B-frame reorder; the dispatcher returns `null` for those and other containers (`src/core/box-readers.ts:798-888,1006-1058`).
- **Problem:** Reference re-import loses otherwise-usable truth and can be routed under the wrong status.
- **Change:** Give readers typed results (REQ-CORE-04), then implement, in priority order, fragmented ISO BMFF sample runs, WebM lacing, and separate WebM decode/presentation ordering; until a reader exists its typed unsupported result is visible and never mistaken for engine invalidity.
- **Acceptance:** Reader conformance fixtures yield complete tables or the exact typed unsupported/malformed reason; no partial table is compared.
- **Source:** docs/subsystems/oracle-system.md — Target design "Typed evidence and reader boundaries" / gap "Neutral packet readers cover only a subset"

### REQ-ORAC-06 — Typed oracle-availability branch (replace prose routing)
- **Priority:** P1
- **Depends on:** REQ-CORE-04
- **Current:** Oracles return `pass:false` with detail prefixes and the runner searches human text (`golden absent`, `packet table unreadable`) to recover NA_ASSET (`src/core/oracles.ts:306-323`, `src/core/runner.ts:858-889`). (Folds the scenario-DSL "prose oracle-availability" item.)
- **Problem:** Editing wording reroutes status, and consumers cannot distinguish unavailability from semantic failure without duplicating string heuristics.
- **Change:** Use the discriminated `state:'UNAVAILABLE'` branch with structurally validated status (NA_BROWSER/NA_ASSET) + reasonCode; stop searching detail text for availability.
- **Acceptance:** Changing `detail` has no effect on status; a missing/invalid kind, status, or reason code fails schema validation.
- **Source:** docs/subsystems/oracle-system.md — gap "Availability depends on prose"; docs/subsystems/scenario-dsl-registry.md — "Oracle availability is encoded in prose"

## Runner & capability negotiation

### REQ-RUN-01 — Staged, typed tuple negotiation pipeline
- **Priority:** P0
- **Depends on:** REQ-CORE-03, REQ-CORE-02
- **Current:** `negotiate()` is a two-pass check of flat token arrays; input/output codec arrays fall back to undirected arrays; the first missing token returns NA_ENGINE (`src/core/runner.ts:112-200`, `src/core/scenario.ts:17-31`, `src/core/engine.ts:115-137`).
- **Problem:** A truthful set of atomic tokens can admit an unsupported combination and leak it into FAIL/ERROR, making disabled cells an attractive but wrong escape hatch.
- **Change:** Build one concrete request tuple (operation, selected container/tracks, input codecs + decoder configs, output container/codecs + encoder configs, encryption, transforms, timing mode, dims/rate/channels, options), keep flat tokens as a coarse index, then ask the adapter `supports(request)`; a known inability short-circuits NA_ENGINE (never runs oracle/benchmark). Checks that need parsing may run after opening the input.
- **Acceptance:** Table-driven tests where each token is true but the tuple is unsupported return NA_ENGINE with no oracle/benchmark and no new disabled cell; companion malformed-input and injected-crash tests stay graceful/ERROR, proving the NA path is not overbroad.
- **Source:** docs/subsystems/runner-capability-negotiation.md — "Flat capability tokens admit unsupported tuples"

### REQ-RUN-02 — Concrete per-cell WebCodecs probes routed to NA_BROWSER
- **Priority:** P0
- **Depends on:** REQ-CORE-03
- **Current:** The run-wide table probes five video tokens at 1080p and ten audio tokens at 48 kHz/2ch/128 kbit once and reuses it for every profile/level/resolution/rate/channels/bitrate (`src/core/feature-detect.ts:315-399`, `src/core/runner.ts:191-313`).
- **Problem:** The gate can NA_BROWSER a tuple the adapter handles natively, or admit a canonical codec whose actual profile/dimensions/options fail at runtime; new browser behavior hides behind old assumptions.
- **Change:** Query the exact decode/encode configuration each adapter will instantiate, immediately before use; attach the queried config + result to the cell environment; `supported:false`/`NotSupportedError`→NA_BROWSER; runner-caused invalid-config `TypeError`→ERROR; post-config `EncodingError`→execution evidence (not applicability). Target codecs are derived from `options.video`/`options.audio`/rendition variants, not a fixed table.
- **Acceptance:** Matrices varying H.264 profile/level/resolution/bitrate/hw-pref and AAC rate/channels while holding the canonical token fixed classify correctly; the recorded config equals the one passed to the framework; a passing query followed by a genuine encode/decode error stays diagnosable rather than rewritten as NA.
- **Source:** docs/subsystems/runner-capability-negotiation.md — "Representative WebCodecs probes are not concrete support"

### REQ-RUN-03 — Three-way verdict propagation + benchmark PASS/DIFF + measurement availability
- **Priority:** P0
- **Depends on:** REQ-CORE-01
- **Current:** The runner reduces oracle outcomes to a binary cell status, benchmarks only top-level PASS, and a non-timeout benchmark error overwrites an established correctness pass with ERROR (`src/core/runner.ts:1411-1468`).
- **Problem:** A legal representation difference, wrong output, unavailable evidence, and a broken oracle share one channel, and performance eligibility is lost when measurement fails after correctness passed.
- **Change:** Consume the oracle system's PASS/DIFF/FAIL + typed applicability/error outcomes; aggregate FAIL over DIFF over PASS; benchmark PASS and DIFF; store benchmark timeout/error as measurement availability on the otherwise PASS/DIFF result without erasing the verdict; keep NA kinds separate.
- **Acceptance:** Synthetic oracle sequences for every verdict/applicability/error combination behave: valid golden DIFF ends DIFF with benchmark eligibility, real mismatch FAIL, thrown oracle ERROR, all-unavailable retains NA kind, benchmark exception preserves the preceding PASS/DIFF with no number.
- **Source:** docs/subsystems/runner-capability-negotiation.md — "Boolean oracle outcomes collapse representation, mismatch, and oracle failure"

### REQ-RUN-04 — Explicit status precedence (pre-execution, variant, oracle, exhaustive)
- **Priority:** P0
- **Depends on:** REQ-CORE-01, REQ-CORE-02
- **Current:** Precedence is an accident of branch order; disabled runs before negotiation/cache, and mixed all-NA status can depend on file order (`src/core/runner.ts:1382-1468,1893-1985`).
- **Problem:** Status routing is not deterministic and can misclassify blockers.
- **Change:** Make precedence explicit and deterministic:
  - Pre-execution: an active reviewed policy rule → SKIPPED (recorded separately); else coarse/concrete engine inability → NA_ENGINE; only an engine-applicable tuple → NA_BROWSER; only an engine+browser-applicable tuple → NA_ASSET. Retain all blockers as diagnostics.
  - One variant: comparator FAIL = wrong; `NotApplicableError` = NA_ENGINE; proved browser limitation = NA_BROWSER; missing evidence = NA_ASSET; unexpected throw/crash/oracle exception = ERROR.
  - Several oracles: FAIL > DIFF > PASS; structured unavailable excluded only under explicit survivor policy, else its NA kind becomes the cell status.
  - Several exhaustive variants: FAIL > ERROR > DIFF > PASS among executed, every per-file outcome visible; if none executes retain applicability counts and choose the deterministic pre-execution status.
- **Acceptance:** Variant/oracle permutations never change the reduced status by ordering; each blocker class routes to its documented status.
- **Source:** docs/subsystems/runner-capability-negotiation.md — Target design "target status precedence" table

### REQ-RUN-05 — Exhaustive partial-coverage grade + preserved per-file oracle outcomes
- **Priority:** P0
- **Depends on:** REQ-CORE-01
- **Current:** Exhaustive aggregation retains file/hash/baked/status/reason/bench but discards per-file oracle outcomes; `admissible` includes PASS/FAIL/ERROR; `PASS/FAIL/FAIL`→FAIL with coverage `1/3` but no partial grade; mixed all-NA can depend on file order (`src/core/runner.ts:1053-1204`, `src/core/scenario.ts:304-330`).
- **Problem:** "file 01 works; 02/03 do not" survives only indirectly, loses oracle evidence, and can look like a monolithic fail/error or a complete pass.
- **Change:** Preserve one sub-result per frozen input variant (full identity + PASS/DIFF/FAIL or `NA_*` + structured reason + all oracle outcomes + measurement summary); add outcome counts (pass/diff/fail/error/each NA/skipped/total) and `grade: full|partial|none`; aggregate FAIL > ERROR > DIFF > PASS; ERROR is reserved for harness/adapter failure that prevents forming trustworthy per-file results; never collapse mixed signals to ERROR; cancellation keeps explicit unexecuted identities. (Canonical for the runner-side aggregation referenced by REQ-SEL-*, REQ-REP-03, REQ-UI-02 and the feature partial-coverage items.)
- **Acceptance:** `PASS/FAIL/FAIL`→status FAIL, grade partial, valid 1/3, both failing files with oracle evidence, never ERROR; `PASS/DIFF/PASS`→DIFF, full 3/3; `PASS/ERROR/ERROR`→partial with top ERROR; permutation never changes the aggregate.
- **Source:** docs/subsystems/runner-capability-negotiation.md — "Exhaustive aggregation lacks an explicit partial grade"

### REQ-RUN-06 — Real cancellation via composed signals + worker isolation
- **Priority:** P1
- **Depends on:** none
- **Current:** `withTimeout()` clears its timer but cannot stop its operand, the abort signal is inspected only between cells, and one synchronous Remotion hang is a hard-coded pre-execution FAIL (`src/core/runner.ts:655-684,1836-1838`, `src/core/disabled-cells.ts:26-34`).
- **Problem:** A timed-out async operation keeps consuming CPU/memory or touching engine state after disposal and after the next cell starts; a synchronous hang freezes the page; Stop latency is a whole cell/variant.
- **Change:** Compose the caller signal with `AbortSignal.timeout()` via `AbortSignal.any()`, thread it through fetch/init/operation/oracle/benchmark/framework controllers, then await bounded cleanup before the next cell; reduce `Promise.race` to a watchdog; run synchronous/non-cooperative work in a terminable Worker (HTML worker-termination as the hard fallback).
- **Acceptance:** A never-resolving async adapter and a synchronous infinite-loop Worker both stop resource use, complete cleanup, and allow the next cell to start on timeout/Stop with no late callback mutating results; the forced-timeout entry is removed only after the real corrupted-WebM repro passes.
- **Source:** docs/subsystems/runner-capability-negotiation.md — "Promise racing does not cancel work"

### REQ-RUN-07 — Shrink the disabled-cell table to reviewed suppressions + CI audit
- **Priority:** P1
- **Depends on:** REQ-CORE-02, REQ-CORE-03
- **Current:** Two tables mix a forced-timeout FAIL with exact engine/scenario SKIPPED entries for budget suppressions, scale limits, and framework limitations, matched before negotiation/cache (`src/core/disabled-cells.ts:14-231`, `src/core/runner.ts:1893-1985`).
- **Problem:** A stale rule can hide a capability change or real regression; unsupported combinations require hand maintenance; SKIPPED can mask what negotiation would say.
- **Change:** Shrink to exceptional, reviewed safety/budget suppressions; each entry records owner, issue, browser/engine scope, evidence, expiry/retest condition, and why Worker isolation cannot safely execute it. Move unsupported tuples to `NotApplicableError`→NA_ENGINE; safe applicable defects run and stay FAIL/ERROR.
- **Acceptance:** CI audits each rule against current engine/scenario ids, rejects expired/orphaned rules, and runs a no-disabled applicability audit; removing a tuple-limitation rule yields NA_ENGINE; removing a defect-hiding rule exposes its genuine verdict without freezing the matrix.
- **Source:** docs/subsystems/runner-capability-negotiation.md — "Disabled cells mix policy, applicability, and defects"

### REQ-RUN-08 — Content-addressed execution fingerprint before cache reuse
- **Priority:** P1
- **Depends on:** none
- **Current:** A cached result is returned before current negotiation; the key is browser family + engine id + scenario id + selected-input tag, with a manual epoch invalidating only old passes (`src/core/runner.ts:1981-2013`, `src/app/result-cache.ts:3-55`).
- **Problem:** A prior PASS or NA survives a changed browser codec table, capability implementation, scenario tolerance, oracle semantics, or golden while still matching the coarse key.
- **Change:** Validate a content-addressed execution fingerprint before reuse (suite/result schema, scenario definition hash, oracle-model version, engine id + config, browser build + exact support decisions, selected asset hashes/corpus checksum, relevant golden hashes) and rerun current policy/applicability; treat the boolean→PASS/DIFF/FAIL move as a result-schema break — never reinterpret old boolean rows as target verdicts.
- **Acceptance:** Mutating each fingerprint component independently causes a miss; unchanged components hit; a cached NA_BROWSER is rerun once the exact config becomes supported; pre-three-way rows never load into the new schema.
- **Source:** docs/subsystems/runner-capability-negotiation.md — "Reuse can bypass changed preflight evidence"

### REQ-RUN-09 — Executed pixel self-test instead of UA-family gating
- **Priority:** P1
- **Depends on:** none
- **Current:** Strict-RGBA/pixel-comparability flags are a user-agent-family allow/deny table (golden compare disabled for WebKit and Firefox, source compare for WebKit) rather than an executed self-test, plus per-output WebKit gates in `runOne()` (`src/core/feature-detect.ts:402-444`, `src/core/runner.ts:912-983,1337-1356`).
- **Problem:** Correctness eligibility is keyed to browser identity rather than actual behavior, so a capable browser is denied and a changed behavior stays hidden.
- **Change:** Replace the UA-family denylist with a focused executed pixel/behavior probe that decides strict-pixel applicability; feature behavior, not UA family, controls pixel comparability.
- **Acceptance:** A browser whose behavior passes the self-test is eligible regardless of family; one whose behavior fails is denied with a behavior reason, not a UA string.
- **Source:** docs/subsystems/runner-capability-negotiation.md — Target design "behavior-dependent preflights"

## Engine-adapter contract

### REQ-ADP-01 — Keep adapters verdict-neutral for PASS/DIFF/FAIL
- **Priority:** P0
- **Depends on:** REQ-CORE-01
- **Current:** `OracleOutcome` is boolean and `ResultStatus` has no DIFF, so the runner reduces any real false outcome to FAIL and an adapter cannot preserve a valid representation difference except as detail (`src/core/scenario.ts:206-221`, `src/core/runner.ts:1411-1463`).
- **Problem:** An adapter that rewrites output to resemble a golden, or throws NA for legal packetization, biases the verdict.
- **Change:** Adapters return richer representation evidence and stay verdict-neutral — never rewriting output to resemble a golden, comparing to a golden, or throwing `NotApplicableError` for legal packetization/framing; the oracle owns PASS/DIFF/FAIL and the runner/result model propagate DIFF without collapsing it to FAIL.
- **Acceptance:** A three-fixture propagation test (identical/canonical, identical/representationally-different, invalid) yields PASS/DIFF/FAIL with no adapter-side golden logic; only applicability errors become NA_ENGINE.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Three-way verdict propagation" / gap 10

### REQ-ADP-02 — Probe exact configs; distinct BrowserNotSupportedError channel
- **Priority:** P0
- **Depends on:** REQ-CORE-03
- **Current:** Browser codec support is cached per canonical codec using representative 1080p/48 kHz configs, not the concrete track config, and a browser miss can surface as engine ERROR (`src/core/feature-detect.ts:315-378`).
- **Problem:** A runtime browser `NotSupportedError` is mislabeled engine ERROR, or an adapter hides an engine gap as NA_BROWSER.
- **Change:** Check the exact profile/level/constraints/dimensions/rate/channels/description the operation will configure via WebCodecs config-support, and route browser/API/config misses through a distinct `BrowserNotSupportedError`/NA_BROWSER decision that is never `NotApplicableError`.
- **Acceptance:** Mocked exact-config failures route to NA_BROWSER while framework tuple failures with the same codec route to NA_ENGINE.
- **Source:** docs/subsystems/engine-adapter-contract.md — "One shared execution protocol" / gap 3

### REQ-ADP-03 — Translate each adapter's framework probes into the shared applicability protocol
- **Priority:** P0
- **Depends on:** REQ-CORE-02, REQ-CORE-03
- **Current:** Mediabunny turns an impossible `Conversion.isValid`, unconstructable output, and missing tracks into ordinary errors; Remotion Media Parser forwards parser errors unchanged; only Remotion WebCodecs maps concrete checks to `NotApplicableError` (`src/engines/mediabunny/adapter.ts:850-877,1253-1319`, `src/engines/remotion-media-parser/adapter.ts:179-215`).
- **Problem:** Valid-but-unsupported concrete inputs reach ERROR/FAIL and there is no shared point distinguishing unsupported from malformed/defect.
- **Change:** Each adapter translates its official probes to the shared error (Mediabunny output-format codec intersection + `Conversion.isValid`; Remotion `canCopy{Video,Audio}Track()` per source-track×container×transform; Remotion Media Parser unsupported-file-type only for valid bytes with an over-broad declared read set), checks option support before expensive/irreversible work, rechecks after init, releases partial output before returning, and keeps empty/corrupted/mismatched negative-test input as a normal rejection.
- **Acceptance:** Each declared operation has ≥1 input-specific miss ending NA_ENGINE; malformed input stays a normal rejection; the disabled-cell list contains no row whose only reason is an expressible adapter inability.
- **Source:** docs/subsystems/engine-adapter-contract.md — "One shared execution protocol" (adapter-specific corrections)

### REQ-ADP-04 — Validate normalized adapter results before oracles
- **Priority:** P1
- **Depends on:** none
- **Current:** The runner passes an adapter's returned object into the oracle context with no runtime shape/finiteness/token/index/ownership validation; result fields are unconstrained `string` (`src/core/runner.ts:1480-1519`, `src/core/engine.ts:242-276`).
- **Problem:** Invalid values fail far downstream and reach oracles instead of being rejected at the boundary.
- **Change:** Add validators immediately after each adapter call rejecting non-canonical container/codec tokens, detached/aliased buffers, non-finite times/dims/rates, negative packet sizes, invalid `trackIndex`, inconsistent frame indices, invalid rendition recursion, and empty bytes from a declared byte-producing op (unless the scenario permits), failing as ERROR with adapter + field path.
- **Acceptance:** Tests round-trip every normalized carrier through its validator and fuzz each numeric/token/index/buffer/recursion boundary so the validator names the exact offending field.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Validated normalized results" / gap 6

### REQ-ADP-05 — Make coded chunk framing and parameter-set location explicit
- **Priority:** P1
- **Depends on:** none
- **Current:** `EncodedTrack.description` exists but chunk framing and parameter-set location do not, so representation is inferred (`src/core/engine.ts:43-74,163-175`).
- **Problem:** Mux adapters may infer AVCC merely from `codec:'h264'` or infer parameter-set placement from packet size, risking a wrong demux→mux handoff.
- **Change:** Extend `EncodedTrack`/`DemuxResult` with packet ordering (decode/presentation), rational timebase when exposed, explicit framing (annexb/avc/hevc/equivalent), access-unit grouping, parameter-set location, owned/copied `description` with stated record, and a native codec tag kept separate from the canonical codec.
- **Acceptance:** H.264/H.265 fixtures in both Annex B and length-prefixed forms pass through `prepareMuxTracks()`/`mux()` with the adapter preserving, explicitly converting, or returning NA_ENGINE before authoring output — never relying on codec-name inference.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Validated normalized results" / gap 6

### REQ-ADP-06 — Codify the normative adapter lifecycle state machine
- **Priority:** P1
- **Depends on:** none
- **Current:** One instance serves functional, oracle, warmup, and iteration calls, `configUsed` is read after `finally` disposal, and no state machine is enforced (`src/core/runner.ts:1396-1475,1637-1701,2107-2120`).
- **Problem:** State-leaking adapters corrupt observations, and cleanup can erase the effective config before reporting.
- **Change:** Make `constructed → initialized → serial operations → disposed` normative with idempotent `init()`/`dispose()`, per-operation state reset, contract errors for pre-init/post-dispose operations, disposal that closes workers/codecs/streams/readers/object-URLs/temp-files/partial-targets, and a runner snapshot of a JSON-serializable `configUsed` before disposal after any fallback/backend is selected.
- **Acceptance:** Stateful fake and real-adapter smoke tests produce identical normalized observations across warmup/iteration counts, retain the effective config after cleanup, and reject pre/post-state misuse.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Lifecycle, cancellation, and ownership" / gap 5

### REQ-ADP-07 — Thread AbortSignal through every adapter call
- **Priority:** P1
- **Depends on:** none
- **Current:** Operation signatures accept no signal; the abort is inspected only between cells and `withTimeout()` races without aborting the loser (`src/core/runner.ts:387-420,655-683`).
- **Problem:** Timed-out work keeps consuming CPU/workers/codecs/output targets while disposal or the next cell starts.
- **Change:** Pass the same `AbortSignal` through every lifecycle/operation call so on timeout/cancel the runner aborts first, the adapter forwards to framework controllers/fetch/readers and closes WebCodecs objects, then awaits bounded cleanup, with `Promise.race` reduced to a watchdog. (Adapter-facing side of REQ-RUN-06.)
- **Acceptance:** A never-resolving fake operation observes the abort, closes its resources, and stops telemetry before the cleanup deadline.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Lifecycle, cancellation, and ownership" / gap 4

### REQ-ADP-08 — Enforce and instrument native frame/codec ownership
- **Priority:** P1
- **Depends on:** none
- **Current:** Representative adapters manually close frames/samples/decoders, but `MediaEngine` has no ownership or close-on-error clause (`src/engines/remotion-webcodecs/adapter.ts:615-683`, `src/engines/mediabunny/adapter.ts:1394-1418`).
- **Problem:** A new adapter can typecheck while leaking large WebCodecs resources and pressuring later measurements.
- **Change:** Require transfer-like ownership — copy/digest returned data, close every `VideoFrame`/`AudioData` exactly once after last use, have retained async consumers clone explicitly, flush/close decoders and encoders on every exit — and instrument the close behavior.
- **Acceptance:** Close-count tests with fake resources cover success/throw/NA_ENGINE/NA_BROWSER/timeout/abort/partial-output, closing each owned resource once and leaving no active worker/codec/stream.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Lifecycle, cancellation, and ownership" / gap 8

### REQ-ADP-09 — Adapter conformance suite gating add-engine
- **Priority:** P1
- **Depends on:** REQ-ADP-13
- **Current:** `add-engine.sh` validates the id, stamps the template, and prints manual steps but runs no type/lifecycle/capability/normalization checks (`scripts/add-engine.sh:82-94`).
- **Problem:** A generated adapter can reach wiring without proof of identity, capability, error, result, lifecycle, cancellation, telemetry, or oracle-boundary conformance.
- **Change:** Provide a conformance suite verifying the eight areas (identity/registration, capabilities, errors, results, lifecycle, cancellation, telemetry, oracle boundary) and make `add-engine.sh`'s printed workflow end with the conformance command before app wiring.
- **Acceptance:** A new adapter is generated into a temp dir, typechecked, run through the suite with a fake framework, registered in an isolated registry, and deleted without changing scenarios or disabled cells.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Conformance gate and add-engine workflow" / gap 9

### REQ-ADP-10 — Bridge a typed OperationTelemetry stream with returned final counters
- **Priority:** P2
- **Depends on:** none
- **Current:** Boundary telemetry is limited to `targetWrites`, `firstByteMs`, and renditions; cell progress is emitted outside operations; source-read/first-frame slots have no shared producer (`src/core/engine.ts:28-39`, `src/core/runner.ts:1651-1689`).
- **Problem:** Progress, backpressure, reads, frame latency, and fallback are inconsistently observable even where a framework exposes them.
- **Change:** Define an additive `OperationTelemetry` stream with a monotonic operation-relative timestamp and typed events (progress, bytes read/written, write count, first byte, decoded/encoded frame count, first frame, framework fallback), progress in [0,1] when a denominator exists and explicitly indeterminate otherwise, and return final normalized counters alongside the result.
- **Acceptance:** Fake and real streaming operations emit monotonic events whose final counters equal the normalized result and benchmark sample.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Telemetry, configuration, and repeatability" / gap 7

### REQ-ADP-11 — Snapshot configUsed as a validated immutable object
- **Priority:** P2
- **Depends on:** REQ-ADP-06
- **Current:** `configUsed` is read by the matrix after `runOne()`'s `finally` disposal, forcing the Remotion adapter to preserve its backend across disposal (`src/core/runner.ts:2107-2120`, `src/engines/remotion/adapter.ts:59-68`).
- **Problem:** The read order forces adapters to keep disposed state, and unserializable/mutable config can enter reports.
- **Change:** Make `configUsed` a validated immutable snapshot (framework/package versions, backend, hw/sw preference, worker/thread count, reader/writer/target mode, actual codec configs, any fallback+reason), captured separately for functional and measured phases when they differ, guarded by a serializer conformance test and captured before disposal.
- **Acceptance:** A serializer conformance test rejects functions, promises, DOM/native objects, cycles, non-finite numbers, and post-capture mutation; the snapshot is captured before disposal.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Telemetry, configuration, and repeatability"

### REQ-ADP-12 — Guarantee repeatable normalized observations across fresh instances
- **Priority:** P2
- **Depends on:** none
- **Current:** Every iteration creates new input objects but the interface makes no repeatability guarantee across two fresh instances, and encoder nondeterminism is not declared (`src/core/runner.ts:1637-1701`).
- **Problem:** Two fresh instances are not guaranteed to emit the same observations, and nondeterministic encoders are undocumented.
- **Change:** Require that, given identical input bytes, options, browser support, and `configUsed`, two fresh instances emit the same canonical metadata, stable packet/frame ordering, applicability reason code, and telemetry field meanings, declaring any framework-encoder nondeterminism in `configUsed` while semantic oracles still judge output.
- **Acceptance:** Repeatability tests show identical normalized observations across fresh instances, and nondeterministic encoders are flagged in `configUsed`.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Telemetry, configuration, and repeatability"

### REQ-ADP-13 — Replace the throw-everything template with a conforming minimal adapter
- **Priority:** P2
- **Depends on:** REQ-CORE-02, REQ-ADP-04
- **Current:** The template starts with every operation undeclared and every method throwing and omits the applicability contract, cancellation, validation, and conformance tests (`src/engines/_template/adapter.ts:47-98`).
- **Problem:** A generated adapter can compile while over-declaring support, leaking resources, or returning invalid observations.
- **Change:** Replace it with a compiling minimal adapter that imports the shared applicability errors and validators, accepts `OperationContext`, demonstrates idempotent lifecycle/cleanup, declares no capabilities, and makes operation methods optional (or keeps stubs only if structurally required) while validating that every declared operation has a callable method.
- **Acceptance:** The clean scaffold passes only the all-undeclared baseline, and each newly declared operation requires positive, negative-tuple, lifecycle, normalized-result, and cancellation tests.
- **Source:** docs/subsystems/engine-adapter-contract.md — "Conformance gate and add-engine workflow" / gap 9

## Engines

Per-adapter fixes. The shared semantic comparators (REQ-ORAC-01/02/03/04), three-way verdict
(REQ-CORE-01), tuple capability (REQ-CORE-03), and `NotApplicableError` (REQ-CORE-02) are referenced,
not restated; each engine keeps its framework-specific API detail and fixtures.

### REQ-ENG-01 — [mediabunny] Tuple capability + typed NA_BROWSER via concrete probes
- **Priority:** P0
- **Depends on:** REQ-CORE-03, REQ-CORE-02
- **Current:** Flat token sets are checked independently and the adapter throws no `NotApplicableError`, so cross-products like h264→webm are admitted; video decode checks the exact config but throws an ordinary Error, and exact audio decode/encode checks are missing (`src/engines/mediabunny/adapter.ts:1029-1111,897,681`, `src/core/runner.ts:686`).
- **Problem:** Illegal container/codec/track cross-products reach WebCodecs and become ERROR/FAIL instead of NA_ENGINE, and dynamic browser codec absence is misclassified ERROR instead of NA_BROWSER.
- **Change:** Decide support over the full tuple using `OutputFormat.getSupportedVideoCodecs()`/`getSupportedAudioCodecs()`/`getSupportedTrackCounts()`/timestamp/rotation/alpha intersection and `Conversion.isValid` + every `discardedTrack`, throwing reason-coded `NotApplicableError` (container-codec, track-count/type, copy-required, protection-form, transform-format, metadata-write-format); add a separate typed NA_BROWSER path from exact `canEncodeVideo`/`canEncodeAudio`/`canDecodeVideo`/`canDecodeAudio`/`InputTrack.canDecode()` checks, keeping malformed config and post-positive-decision decoder crashes as FAIL/ERROR.
- **Acceptance:** Every output-tuple row (positive, illegal cross-product, zero/excess track counts, subtitle/other, timestamped vs not) is tested; browser-matrix tests route intrinsic unsupported→NA_ENGINE and dynamic browser absence→NA_BROWSER; a disabled cell is deleted only with a regression test proving success or NA_ENGINE.
- **Source:** docs/engines/mediabunny.md — Target design #1 / gaps "Flat capability tokens…", "Browser applicability is encoded as error prose"

### REQ-ENG-02 — [mediabunny] Strict copy-only remux with full track accounting
- **Priority:** P0
- **Depends on:** REQ-CORE-02
- **Current:** Only the reserve route uses explicit packet prep/mux; all other remuxes call an unconfigured `Conversion` that copies-or-transcodes and drops output-incompatible tracks, checking `isValid` only when no usable output exists and ignoring `discardedTracks` (`src/engines/mediabunny/adapter.ts:1251,850`).
- **Problem:** A cell labeled lossless remux can spend encode work, change codec essence, or drop tracks while downstream decode still looks plausible.
- **Change:** Implement strict remux via encoded packet sinks/sources or an upstream copy-only mode proving every selected track was copied (empty discard set, same selected-track multiset, codec-essence preservation, no unrequested loss); reject any tuple needing decode/encode as `NotApplicableError`; timeline-origin/legal-framing changes may be DIFF, transcode/drop is FAIL.
- **Acceptance:** Strict-remux cases where `Conversion` would otherwise transcode/discard prove no payload transcode and no unrequested track loss, comparing pre/post codec essence plus decoded content.
- **Source:** docs/engines/mediabunny.md — Target design #2 (Remux) / gap "Remux is not guaranteed to copy or preserve all tracks"

### REQ-ENG-03 — [mediabunny] Representation-aware packet + truthful metadata evidence
- **Priority:** P0
- **Depends on:** REQ-CORE-04, REQ-ORAC-01, REQ-ORAC-02
- **Current:** The adapter canonicalizes its codec vocabulary but feeds the positional/byte-exact oracles; FPS is a 120-packet estimate presented as exact and demux reports `dtsUs = ptsUs` (`src/engines/mediabunny/adapter.ts:328,1154`, `src/core/oracles.ts:835,768`). SSIM index pairing is covered by REQ-ORAC-03.
- **Problem:** A valid, decodable Mediabunny representation scores as corruption, and fabricated DTS implies decode-order equality.
- **Change:** Adapter-side, record/normalize codec configuration, AVCC vs Annex B framing, NAL length size, in/out-of-band SPS/PPS/VPS, access-unit/NAL grouping, decode order, PTS, optional DTS, duration, and verified random-access (feeding REQ-ORAC-02); report how FPS was derived (sample count/observed interval/nominal) and keep missing DTS missing rather than substituting PTS (feeding REQ-ORAC-01).
- **Acceptance:** AVCC↔Annex B, in/out-of-band SPS/PPS/VPS, alternate NAL grouping, B-frame decode order, and absent-DTS fixtures become DIFF (not FAIL) unless content/timing/random-access/validity is wrong; HE-AAC/NTSC/VFR/edit-list/priming avoid false FAIL; FPS provenance and absent DTS are explicit.
- **Source:** docs/engines/mediabunny.md — Target design #3/#4 / gap "Golden packet equality is representation-blind"

### REQ-ENG-04 — [mediabunny] Operation fidelity: mux track contract, trim modes, transcode audio
- **Priority:** P1
- **Depends on:** REQ-CORE-02, REQ-ADP-04
- **Current:** Mux sets `dtsUs` to presentation time, skips subtitle/other tracks, invents fallback profiles, and lets Output containability errors escape; the general trim path is `Conversion` with `forceTranscode`; transcode has no `canEncodeAudio` preflight and fanout can erase supported variants (`src/engines/mediabunny/adapter.ts:1194,1533,1673,1454,625,1271`).
- **Problem:** A plausible output can carry wrong timing/config or omit requested media; a copy trim can silently transcode; an unsupported variant erases supported siblings.
- **Change:** Preflight containability/track counts (→NA_ENGINE), reject zero supported tracks, never silently drop subtitle/other tracks, preserve decode-order/DTS separately from PTS, require codec-private description, validate provided profiles; separate byte-identity / packet-copy / boundary-GOP transcode / full transcode so a non-frame-accurate copy never falls through to transcode and report observed first/last PTS + priming/edit-list changes; add exact `canEncodeAudio`/decode preflight and validate every fanout variant independently with per-variant provenance.
- **Acceptance:** B-frame/VFR/multitrack round-trips assert track multiset, cadence, decode order, codec config, and content; a copy request never accidentally transcodes; exact browser video AND audio encode/decode configs are tested per-variant and an unsupported variant does not remove supported ones.
- **Source:** docs/engines/mediabunny.md — Target design #2 (Mux/Trim/Transcode) / gap "Mux loses DTS and silently ignores unsupported track types"

### REQ-ENG-05 — [mediabunny] Decrypt KID/scheme/IV validation + metadata:write
- **Priority:** P1
- **Depends on:** REQ-CORE-02
- **Current:** HLS ignores the supplied key; CENC `resolveKeyId` returns the same key for every KID and ignores IV; the CENC-CTR parse abort is hand-disabled; `metadata:write` is declared but no path applies tags (`src/engines/mediabunny/adapter.ts:1622,1634,464,1063,850`, `src/core/disabled-cells.ts:209`).
- **Problem:** Key-selection correctness is unproven, valid unsupported protection looks like a crash, and metadata-write cells pass an oracle that never verified the edit.
- **Change:** Validate scheme/protection shape/KID→key mapping/IV/subsample/pattern, use the requested key only for the matching KID, specify HLS key ownership, move the CENC-CTR abort behind a safe preflight, reject valid-unsupported forms as NA_ENGINE and keep wrong-key/corrupt ciphertext FAIL; implement `metadata:write` via `Output.setMetadataTags`/`ConversionOptions.tags` with read-after-write re-import (unrelated-tag preservation) or remove the token and return NA_ENGINE.
- **Acceptance:** CENC multi-KID, wrong KID/key, CTR/CBCS/pattern/subsample, malformed protection, and the current assertion fixture classify correctly and the disabled CENC-CTR entry is removed only after NA_ENGINE/success; metadata round-trips per supported carrier or the unsupported subset is NA_ENGINE.
- **Source:** docs/engines/mediabunny.md — Target design #2 (Decrypt/Metadata) / gaps "Decryption key…", "Metadata write is advertised but absent"

### REQ-ENG-06 — [mediabunny] Truthful streaming/TTFB + end-to-end cancellation + mutated HLS path
- **Priority:** P1
- **Depends on:** REQ-ADP-07
- **Current:** The stream route consumes positioned writes then reassembles all chunks into one `Uint8Array`, buffer `firstByteMs` is set at completed-buffer readback, the runner never calls `Conversion.cancel()`, and HLS always constructs `UrlSource` before the `mutated` branch (`src/engines/mediabunny/adapter.ts:785,828,850,245,234`, `src/core/runner.ts:655,1651`).
- **Problem:** Native writes are conflated with bounded streaming, completion latency is reported as first-byte latency, timed-out conversion continues behind a terminal result, and mutated-HLS cells read pristine bytes.
- **Change:** Stream to a bounded spool/consumer with backpressure and report separate facts (target kind, append-only vs repositioning, first native write, first consumer-visible byte, write count/bytes, max position/overwrite, peak queued bytes, completion); buffer targets timestamp the actual write or leave TTFB absent; thread cancellation and retain the active `Conversion` to call `cancel()` on abort/timeout, awaiting a cleanup barrier before publishing; provide a pathed in-memory HLS source whose playlist bytes are the mutation with a mutation-specific digest/read trace.
- **Acceptance:** Positioned overwrite, append-only, backpressure, target abort, truthful TTFB, bounded peak memory, and final-byte equality vs BufferTarget are tested with no all-chunk-plus-full-buffer peak; abort/timeout at every phase produces no post-result writes; a pristine HLS reread cannot pass.
- **Source:** docs/engines/mediabunny.md — Target design #6 / gaps "Native writes are real, but the result is still fully buffered", "Timeout does not cancel active conversion", "Mutated HLS does not reach the in-memory mutation path"

### REQ-ENG-07 — [mediabunny] Starvation/queue telemetry honesty + conformance suite
- **Priority:** P2
- **Depends on:** REQ-ADP-09
- **Current:** The starvation sampler is annex-only and unwired while `configUsed` claims webcodecs/streaming-lockstep/queueDepth:auto/four-canvas pool with no observable machinery, and no adapter-boundary conformance suite exists (`src/engines/mediabunny/internal/encoder-starvation.ts:2`, `src/engines/mediabunny/adapter.ts:146`).
- **Problem:** Reports imply a backpressure implementation that cannot be substantiated and capability/disabled drift can silently change verdicts.
- **Change:** Wire starvation sampling as explicit telemetry only (WebCodecs queue depths around transcode, reset per operation, distinguishing source/transform/encoder/output starvation) and remove or qualify unbacked config labels; add the enumerated adapter-boundary conformance suite (identity, tuple table, exact browser encode/decode, strict remux, metadata round trip, AVCC/Annex B/B-frame DIFF, SSIM temporal pairing, HLS/CENC variants, streaming/TTFB/bounded memory, abort/timeout, telemetry persistence) gating disabled-cell deletion and capability expansion.
- **Acceptance:** Slow-source/slow-target tests distinguish starvation causes and reset sampler state on every exit; the 12 conformance areas pass and gate deletions.
- **Source:** docs/engines/mediabunny.md — Target design #6/#7 / gap "Starvation and configuration labels are not measured facts"

### REQ-ENG-08 — [remotion] Tuple-aware capability across both children, no filename heuristics
- **Priority:** P0
- **Depends on:** REQ-CORE-03
- **Current:** Composite capabilities union independent tokens, the parser child has no `NotApplicableError` classification, and the WebCodecs precheck depends on fixture id/URL substrings (`src/engines/remotion/adapter.ts:71-91`, `src/engines/remotion-media-parser/adapter.ts:296-328`, `src/engines/remotion-webcodecs/adapter.ts:2138-2205`).
- **Problem:** Unsupported valid tuples pass the coarse gate and become ERROR/FAIL or depend on the disabled list, and renaming identical bytes changes support.
- **Change:** Encode combinatorial tuple support (operation × input container × each input codec/config × output container × each output codec × options) with an operation-local runtime check, throwing `NotApplicableError` for valid tuples neither child can execute; decide from parsed tracks/exact WebCodecs config, not id/URL substrings; classify browser-config absence NA_BROWSER and malformed robustness bytes graceful.
- **Acceptance:** Table-driven positive/negative tests for every advertised container/codec direction and operation assert NA_ENGINE/NA_BROWSER/graceful/ERROR explicitly with no disabled-cell reliance, and the same bytes under different names yield the same decision.
- **Source:** docs/engines/remotion.md — Target design "Tuple-aware capability and applicability boundary"

### REQ-ENG-09 — [remotion] Copy-only remux with explicit per-track decisions
- **Priority:** P0
- **Depends on:** REQ-CORE-02
- **Current:** `remux()` validates only the output-container token and calls the shared converter with no per-track handler, so the default can copy, re-encode, or remove tracks (`src/engines/remotion-webcodecs/adapter.ts:462-474`).
- **Problem:** Re-encoding or dropping a track is possible despite the operation name.
- **Change:** Parse every track and use Remotion track-transformation/copy-eligibility info, returning copy for every required track only when the destination supports it and otherwise throwing `NotApplicableError` before writing; preserve required track multiplicity, canonical codec identity, sample timing/content; silent video removal or "remux by transcode" that returns bytes is FAIL, not DIFF.
- **Acceptance:** Compatible MP4→MP4/WebM→WebM copy, cross-container non-copy tuples, multi-audio, and WAV/audio-only destinations are tested; successful remux telemetry records only copy; incompatible tuples are NA_ENGINE.
- **Source:** docs/engines/remotion.md — Target design "Copy-only remux" / gap "Remux may transform"

### REQ-ENG-10 — [remotion] Representation-aware packet/metadata evidence; stop the Annex B byte fudge
- **Priority:** P0
- **Depends on:** REQ-CORE-04, REQ-ORAC-01, REQ-ORAC-02
- **Current:** The parser contains a one-byte access-unit-delimiter redistribution and reconstructs duplicated TS/HLS AAC and MP3 timestamps solely to match ffprobe, and reorders demux tracks to synthesized indices (`src/engines/remotion-media-parser/adapter.ts:1036-1211,545-591`). SSIM pairing is REQ-ORAC-03.
- **Problem:** Adapter fudges reproduce one ffprobe representation and legal framing/order differences false-fail.
- **Change:** Do not mutate packet sizes or timestamps to reproduce ffprobe accounting; expose raw framework observations plus framing metadata (AVCC vs Annex B, start-code width, parameter-set placement, access-unit/NAL grouping, optional DTS) for REQ-ORAC-02, and preserve both the framework canonical codec family and the underlying codec/config evidence (comparing by type, not synthesized index) for REQ-ORAC-01.
- **Acceptance:** Same AVC access units as AVCC/Annex B, SPS/PPS in/out of band, and legal grouping changes land PASS/DIFF (never FAIL from byte size alone); alias/rate/track-order/HE-AAC/NTSC/VFR/edit-list fixtures avoid false FAIL; dropped/corrupt access units, wrong timing, or missing RAP remain FAIL.
- **Source:** docs/engines/remotion.md — Target design "Representation-aware packet and metadata evidence"

### REQ-ENG-11 — [remotion] Forward exact output options; isolate per-track decoders
- **Priority:** P1
- **Depends on:** REQ-CORE-03
- **Current:** PCM-S24 maps to WAV/PCM-16, transcode uses only `variants[0]`, general bitrate is not forwarded, both-dimension resize is box-fit, and decode/seek share one mutable decoder slot while swallowing `flush()` rejection (`src/engines/remotion-webcodecs/codecs.ts:77-92`, `src/engines/remotion-webcodecs/adapter.ts:478-540,620-683,709-785`).
- **Problem:** Requests are silently narrowed or represented as a different output contract, and frames can mix across tracks while decoder failures disappear.
- **Change:** Implement each requested field exactly (PCM-S24, bitrate, multi-rendition fan-out, exact/box resize) or reject the concrete request as `NotApplicableError` before conversion; select a documented primary track or isolate one decoder per selected track, propagate decoder errors (retain the flush-failure cause), and close codec resources immediately.
- **Acceptance:** PCM-S24/bitrate/multi-rendition/resize-box/absent-track tests assert exact output or NA_ENGINE; multi-video fixtures assert track identity, PTS, no cross-track frames, surfaced flush failure, zero live decoders.
- **Source:** docs/engines/remotion.md — gaps "Output codec/options mismatch", "Multi-video decoder state"

### REQ-ENG-12 — [remotion] Wire abort into controllers, cleanup in finally, truthful telemetry, conformance + partial grade
- **Priority:** P1
- **Depends on:** REQ-ADP-07, REQ-RUN-07
- **Current:** The `webcodecsController` is local and not wired to abort, `remove()` runs only after success, disposal only nulls imports, `configUsed` statically claims worker-capable parsing while URL+webReader forces main-thread parsing, and there are 1 forced-timeout + 22 skip rules (`src/engines/remotion-webcodecs/adapter.ts:543-603,287-289,107-117`, `src/engines/remotion-media-parser/adapter.ts:296-328`, `src/core/disabled-cells.ts:26-207`).
- **Problem:** Timeout can leave conversion/decode/buffers alive, cleanup is unobservable, reports imply off-main-thread work that did not occur, and coverage is hidden as SKIPPED while mixed files collapse the aggregate.
- **Change:** Propagate the runner abort/timeout into every active Remotion controller (pause/resume/abort), retain conversion/parser controllers, abort on cancellation/disposal, close every decoder/frame/worker/writer buffer in `finally` (retaining flush-failure cause), use worker execution only when the call can run there, and record the actual per-operation parse path/source reader/exact configs/copy-decisions/queue-high-water/finalState/output-bytes/cleanup; replace broad disabled cells with executable conformance tests + runtime applicability and keep only narrow time-bounded quarantines, preserving exhaustive partial coverage (REQ-RUN-05).
- **Acceptance:** Cancellation during parse/decode/seek/conversion and forced failures prove prompt settlement, buffer removal, frame/decoder closure, and cleanup telemetry; reports distinguish main-thread URL parsing from Blob worker parsing on every terminal status; removing rules adds no ERROR, unsupported cells become NA_ENGINE, and mixed Remotion files show an explicit partial grade.
- **Source:** docs/engines/remotion.md — Target design "Controllers, workers, cleanup, and telemetry", "Conformance and robustness grading"

### REQ-ENG-13 — [ffmpeg-wasm] Tuple-aware capability from parsed runtime build
- **Priority:** P0
- **Depends on:** REQ-CORE-03
- **Current:** The gate checks tokens independently, runtime probes reduce only broad codec/container sets after preflight already admitted the cell (`capabilities()` runs before init), four cells are hand-disabled, and `NotApplicableError` covers only some cases (`src/core/runner.ts:124`, `src/engines/ffmpeg-wasm/adapter.ts:1679,2165`, `src/core/disabled-cells.ts:36`).
- **Problem:** A combinatorially unsupported cell enters execution and becomes ERROR/FAIL, and manual skips outlive their limitations.
- **Change:** Add an adapter-owned decision over operation × input container/codecs × output container/codecs × filters × bit depth/alpha × encryption × track cardinality × size/resource class from the parsed runtime build plus explicit adapter limits, throwing reason-coded `NotApplicableError`→NA_ENGINE for valid unsupported requests, marking static fallback data "unverified", keeping malformed input and crashes FAIL/ERROR, and replacing each disabled cell with a conformance test.
- **Acceptance:** Every advertised codec/container pair has a positive smoke test and a negative tuple test; H.264→HEVC, AV1→H.264, resize-budget, alpha, two-pass, mux-legality, and decryption-scheme cases produce NA_ENGINE when unsupported; invalid bytes are never laundered into NA.
- **Source:** docs/engines/ffmpeg-wasm.md — Target design #1 / gap "Capability declarations are coarse"

### REQ-ENG-14 — [ffmpeg-wasm] Representation-aware packet + metadata facts
- **Priority:** P0
- **Depends on:** REQ-CORE-04, REQ-ORAC-01, REQ-ORAC-02
- **Current:** `golden-packets` requires exact count/size/keyframe while the adapter's mux reconstruction intentionally converts AVCC/HVCC to Annex B, and `golden-metadata` compares positionally/raw (`src/engines/ffmpeg-wasm/adapter.ts:3090`, `src/core/oracles.ts:835,721,341`).
- **Problem:** Valid ISO BMFF/Annex B/AAC/timestamp representations FAIL merely for differing from one baked FFmpeg representation.
- **Change:** Attach ffmpeg representation facts (chosen muxer, bitstream filters, codec tag, extradata form, command) so the oracle can explain DIFF for legal packet-shape divergence (feeding REQ-ORAC-02), and let decode/probe invariants + codec-config validity decide correctness; expose the fields REQ-ORAC-01 needs for alias/HE-AAC/NTSC/VFR/edit-list/priming.
- **Acceptance:** AVCC/Annex B round trips with in/out-of-band parameter sets and alternate NAL grouping expect PASS/DIFF (never representation-only FAIL) while corrupt/dropped access units still FAIL; metadata alias/order/HE-AAC/NTSC/edit-list/priming fixtures exercise every branch without false FAIL.
- **Source:** docs/engines/ffmpeg-wasm.md — Target design #3/#4 / gap "Packet and metadata oracles conflate representation with correctness"

### REQ-ENG-15 — [ffmpeg-wasm] Single-flight, race-safe lifecycle with signal propagation
- **Priority:** P1
- **Depends on:** REQ-ADP-05, REQ-ADP-07
- **Current:** `init()` has only a post-load instance guard with no shared in-flight promise/mutex, operations share one worker/FS, cancel depends on whole-worker termination, and an `exec()` timeout returning nonzero is raised as an ordinary Error (`src/engines/ffmpeg-wasm/adapter.ts:1525,1787,1817`).
- **Problem:** Concurrent use can double-load or interleave state, cancellation can affect unrelated work, and a timed-out instance has ambiguous reuse state.
- **Change:** Make initialization single-flight (shared promise), pick one enforceable concurrency model (serialize commands or isolated worker/FS), settle every waiter exactly once on dispose/cancel during load, mark the instance unusable after timeout/terminate until a fresh `load()`, and thread a cancellation signal through init/fetch/execution/output reads with a distinct ERROR for hung/broken workers.
- **Acceptance:** Single-flight init, concurrent-operation policy, failed-load retry, dispose-during-load, and terminal-state tests for every race ordering pass.
- **Source:** docs/engines/ffmpeg-wasm.md — Target design #2 / gap "Initialization and cancellation are not concurrency-safe"

### REQ-ENG-16 — [ffmpeg-wasm] Bounded memory model (WORKERFS, HLS caps, FS accounting)
- **Priority:** P1
- **Depends on:** none
- **Current:** Every input is `writeFile`'d and every output `readFile`'d, HLS is batch-materialized, the FS label mentions WORKERFS but code never mounts it, and deletion is best-effort/swallowed (`src/engines/ffmpeg-wasm/adapter.ts:1835,1854,1571`).
- **Problem:** Peak memory can greatly exceed asset size and failed cleanup is invisible until worker termination.
- **Change:** Report the real FS backend, use mounted WORKERFS (or a streaming FS) for eligible File/Blob inputs, cap HLS materialization, expose measured/estimated peak bytes (wrapper heap + MEMFS in/out + working buffers + JS copies, 2 GB WASM ceiling), and enforce materialization ceilings.
- **Acceptance:** A cleanup suite inspects the FS after success/NA/failure/timeout/cancel/partial-HLS, asserting FS emptiness plus peak memory per phase.
- **Source:** docs/engines/ffmpeg-wasm.md — Target design #2 / gap "Memory and cleanup claims are stronger than the implementation"

### REQ-ENG-17 — [ffmpeg-wasm] Preserve media time (structured probe, observed PTS, seek landing, route-independent mux)
- **Priority:** P1
- **Depends on:** REQ-CORE-04
- **Current:** Probe scrapes human log formatting, video PTS is `frameIndex/fps`, audio PTS is from sample index, seek reports the clamped request, and rebuilt prepared mux tracks collapse each stream to one chunk at PTS/DTS zero (`src/engines/ffmpeg-wasm/adapter.ts:311,2706,2763,2825,2791,2899`).
- **Problem:** VFR/reorder/edit-list effects, discontinuities, keyframe seek landing, and route-dependent mux timing appear correct when wrong.
- **Change:** Probe through a machine-readable interface returning rational frame-rate candidates and time bases (CFR vs VFR), keep per-frame observed PTS through decode, report actual seek landing via a structured side channel, and make prepared mux tracks retain every chunk's PTS/DTS/duration/keyframe identically regardless of route.
- **Acceptance:** VFR, B-frame, negative-origin/edit-list, and between-keyframe seek cases assert against decoded content plus actual PTS; source-copy and public-track assembly compare duration/cadence/DTS-order/decode/PASS-DIFF.
- **Source:** docs/engines/ffmpeg-wasm.md — Target design #3 / gaps "Decode and seek discard real timing", "Mux timing is route-dependent"

### REQ-ENG-18 — [ffmpeg-wasm] Layout-token honesty + reproducible execution envelope
- **Priority:** P1
- **Depends on:** none
- **Current:** Every media op waits for a completed MEMFS file yet `fastStart:reserve` maps to `+faststart` not `-moov_size`, and `dispose()` clears `configUsed` before the runner reads it while progress fires only on cell completion (`src/engines/ffmpeg-wasm/adapter.ts:1839,1503,2045,1787`, `src/core/runner.ts:2107,2116`).
- **Problem:** Fragment structure or a front-loaded moov can be mistaken for incremental/reserve behavior, and results cannot prove the core/build/command that generated them.
- **Change:** Keep `target:writes` absent until bytes are delivered incrementally with backpressure, map `fastStart:in-memory`→`+faststart`, make `fastStart:reserve` use/verify `-moov_size` (or stop advertising it), declare exact fragment flags; snapshot immutable provenance into the result before disposal (npm versions, core hashes/URLs, single/multithreaded, banner/build config, runtime probe digest, every command arg, worker timeout, in/out byte sizes, cross-origin isolation, UA, hardware concurrency, policy reason codes; redact user paths) and emit phase telemetry (materialize/execute/read/cleanup).
- **Acceptance:** Capabilities are renamed to actual batch layout, reserved space is implemented if claimed, snapshots are compared across repeated runs, every terminal status retains one, and cancellation/timeout events include the phase and whether worker termination was required.
- **Source:** docs/engines/ffmpeg-wasm.md — Target design #5/#6 / gaps "Streaming and reserve-fast-start feature names overstate behavior", "Configuration and progress evidence is lost or incomplete"

### REQ-ENG-19 — [ffmpeg-wasm] Broaden CENC + reason-code decryption applicability + conformance
- **Priority:** P1
- **Depends on:** REQ-CORE-02
- **Current:** Clear-output decryption supports only a limited nonfragmented CENC-CTR shape while other schemes/forms throw ordinary errors, and no adapter-level conformance suite exists (`src/engines/ffmpeg-wasm/adapter.ts:2116,1135,1283`).
- **Problem:** A valid-but-unsupported protected file is reported like corrupted media or a broken engine, and capability/provenance/representation regressions go undetected.
- **Change:** Probe protection metadata first, return reason-coded NA_ENGINE for valid unsupported schemes/forms (fragmented CENC, CBCS/pattern, override params, auxiliary-info variants) and reserve FAIL/ERROR for wrong keys/damaged boxes/invalid ranges/crypto defects; add the enumerated adapter-boundary conformance suite gating disabled-cell deletion and capability trust.
- **Acceptance:** Enumerated protected variants classify NA_ENGINE vs FAIL/ERROR correctly; the conformance suites pass and gate deletions.
- **Source:** docs/engines/ffmpeg-wasm.md — Target design #7 / gap "CENC support and error translation are narrow"

### REQ-ENG-20 — [mp4box] Tuple negotiation + precise runtime NA (scope fragmented; reason-code mux/remux)
- **Priority:** P0
- **Depends on:** REQ-CORE-03
- **Current:** Flat `fragmented` is declared once, remux always fragments, mux ignores fragmented/fastStart/target/writeChunkBytes after admission, and non-MP4 and no-track remux both throw generic Error (`src/engines/mp4box/adapter.ts:630-680,913-943,971-1046`).
- **Problem:** A combinatorially unsupported cell can become FAIL/ERROR, a progressive-output scenario can receive fragmented bytes with no output-shape oracle, and unsupported target is not distinguished from malformed input.
- **Change:** Define support by operation × input container × track/sample-entry set × output container × output mode inside the adapter, throwing `NotApplicableError` for ordinary unsupported combinations (non-MP4 remux, non-segmentable track sets, mux fastStart/streaming-target/unsupported-sample-entry/multi-description/negative-composition) while keeping malformed/trackless applicable input FAIL/ERROR, and only declare a shape the operation actually authors (scope `fragmented` to remux unless mux authors fragments).
- **Acceptance:** Every remux/mux × progressive/fragmented/fast-start/stream combination returns requested bytes or NA_ENGINE (never accidental FAIL/ERROR); a genuinely trackless MP4 still fails as invalid input.
- **Source:** docs/engines/mp4box.md — Target design #1 / gap "Capability and output-mode leakage"

### REQ-ENG-21 — [mp4box] Representation-aware packets + AAC coded/presentation views + fps banding
- **Priority:** P0
- **Depends on:** REQ-CORE-04, REQ-ORAC-01, REQ-ORAC-02
- **Current:** The comparator requires exact packet count/track-index multiset/size/keyframe (boolean collapse), AAC parsing reads only the first two ASC bytes into one rate/channel pair, and fps is sample-count/duration (`src/core/oracles.ts:835-984`, `src/engines/mp4box/adapter.ts:309-405,421-458`).
- **Problem:** Valid Annex B vs length-prefixed AVC/HEVC, inline parameter sets, or legal NAL grouping is reported wrong, and HE-AAC/SBR/PS and VFR/NTSC expose one view and can false-fail.
- **Change:** Adapter-side, feed representation facts for REQ-ORAC-02 (keep size/keyframe/grouping as diagnostics) and parse the complete AAC ASC / expose both coded-core and presentation values with provenance and a timing basis for REQ-ORAC-01, retaining the raw sample-entry/codec token so a semantic PASS stays auditable.
- **Acceptance:** avc1/avc3, hvc1/hev1, AVCC/Annex B, inline/out-of-band parameter sets, and legal NAL grouping return DIFF while removed access unit/broken timestamp order/unusable RAP return FAIL; HE-AAC v1/v2 and VFR/30000÷1001 fixtures avoid false FAIL while detecting truly wrong rate/layout/cadence.
- **Source:** docs/engines/mp4box.md — Target design #4/#5 / gaps "AAC and average-fps metadata expose only one view", "Representation-biased packet verdict"

### REQ-ENG-22 — [mp4box] Make webcodecs:demux-feed observable or remove it
- **Priority:** P1
- **Depends on:** REQ-CORE-04
- **Current:** `webcodecs:demux-feed` is declared, but normalized demux returns metadata plus scalar packet observations only, with no chunk payload or decoder description (`src/engines/mp4box/adapter.ts:658-680`, `src/core/engine.ts:63-74`).
- **Problem:** The token suggests an integration no scenario can verify.
- **Change:** Remove the token, or extend `DemuxResult` with access-unit bytes plus the codec-specific description (AVCDecoderConfigurationRecord / length-prefixed vs Annex B, and the HEVC analog) and populate them, accepting the capability only when a scenario consumes and validates that output.
- **Acceptance:** A feature-gated scenario configures a neutral browser decoder from the returned description and decodes the returned chunks (in and out-of-band parameter-set fixtures), or the token is removed.
- **Source:** docs/engines/mp4box.md — Target design #2 / gap "webcodecs:demux-feed is not an observable contract"

### REQ-ENG-23 — [mp4box] Preserve sample-entry config and the presentation timeline in mux
- **Priority:** P1
- **Depends on:** REQ-CORE-04
- **Current:** Mux rebases each track's min PTS/DTS to zero, authors durations without copying an edit list, and chooses one sample entry per track with no per-sample description index (`src/engines/mp4box/adapter.ts:525-547,850-895,991-1021`).
- **Problem:** Valid A/V lead/lag, edit-list offsets, negative composition, and primed-AAC presentation can change even when intra-track deltas are intact; sample entries can be silently flattened.
- **Change:** Keep the active sample-description index per sample, preserve required avcC/hvcC/vpcC/av1C/esds boxes and reject rather than silently flatten sample-entry changes, and retain/reconstruct edit-list offsets, media start, composition offsets, and inter-track A/V offsets (single rate-one edit mapping media composition time to movie presentation time) instead of zeroing, or return NA_ENGINE for a timeline the writer cannot represent.
- **Acceptance:** Positive empty edits, media-time trims, B-frame composition offsets, AAC priming, distinct timebases, and A/V tracks with different origins keep probe/remux/mux semantically aligned after re-import (timestamp-aware decode agrees before/after mux).
- **Source:** docs/engines/mp4box.md — Target design #3 / gap "Presentation timeline is flattened"

### REQ-ENG-24 — [mp4box] Prove fragment and writer completion
- **Priority:** P1
- **Depends on:** none
- **Current:** Remux collects `onSegment` buffers and concatenates without proving any media segment arrived or validating the fragment graph, and accepts zero media callbacks (`src/engines/mp4box/adapter.ts:905-943`).
- **Problem:** Init-only or incomplete output can escape as a plausible container.
- **Change:** Require fragmented output to contain a valid init segment (ftyp+moov with mvex) and ≥1 complete media segment (optional styp + moof + ≥1 mdat, referenced samples present, each traf with tfdt) for non-empty media, honor the requested output mode or return NA_ENGINE, and never return a plausible MIME for init-only/incomplete bytes.
- **Acceptance:** Init-only fragmented files and zero-sample media tracks never silently succeed, and fragment structure is validated before returning.
- **Source:** docs/engines/mp4box.md — Target design #6 / gap "Completion and cleanup are inferred"

### REQ-ENG-25 — [mp4box] Bound memory + deterministic cleanup/cancellation + retained error observation
- **Priority:** P1
- **Depends on:** none
- **Current:** The shared `settled` flag makes later `onError` no-ops after `onReady`, extraction/segmentation/writer calls lack try/finally, and remux retains and copies all segments (`src/engines/mp4box/adapter.ts:717-745,776-803,924-943`).
- **Problem:** Late parse failures are hidden, error cleanup is nondeterministic, and peak memory grows with input/output size.
- **Change:** Feed MP4Box.js progressively/by ranges where the input contract permits, release samples immediately after the last consumer, stream fragments to an observable sink rather than retaining/concatenating, keep operation errors active through extraction/segmentation completion, call `stop()`/release from `finally`, and make abort stop parser work before resolving.
- **Acceptance:** Truncated moov/mdat, incomplete moof/mdat, callback errors after onReady, and abort tests assert verdict, output completeness, callback completion, cleanup, bounded peak memory, and prompt abort without changing the primary verdict.
- **Source:** docs/engines/mp4box.md — Target design #7 / gap "Completion and cleanup are inferred"

### REQ-ENG-26 — [web-demuxer] Operation-scoped tuple support; re-enable PTS-wraparound as FAIL
- **Priority:** P0
- **Depends on:** REQ-CORE-03
- **Current:** `webcodecs:independent` is global and returns negotiation success before decode/seek browser/strict-RGBA checks, the adapter then throws generic errors when WebCodecs is absent/rejects, only the TS AVPacketReader failure self-NAs, and the PTS-wraparound 240fps row is hand-disabled (`src/core/runner.ts:191-202`, `src/engines/web-demuxer/adapter.ts:848-858`, `src/core/disabled-cells.ts:95-103`).
- **Problem:** Legitimately unavailable browser configs become ERROR instead of NA_BROWSER, parser-only tuples enter execution, and an applicable parser defect is hidden.
- **Change:** Make independence operation-scoped (probe/demux parser-independent) and decide over operation × container × selected track type/index × codec/config × protection × browser API/config × fast-path eligibility, passing the exact `VideoDecoderConfig` through browser applicability, throwing reason-coded `NotApplicableError` for package/adapter inability (e.g. TS packet streaming→NA_ENGINE) and a distinct browser error for missing VideoDecoder/`isConfigSupported=false`/absent raster/Web Crypto→NA_BROWSER, and re-enable `robustness/edge_ts_pts_wraparound_demux` as FAIL until fps derivation is fixed.
- **Acceptance:** Identical HEVC/AV1 probe/demux/decode/seek in browsers with and without those configs keep parser cells running while pixel cells become NA_BROWSER only when unsupported, and the PTS-wraparound cell is a real verdict.
- **Source:** docs/engines/web-demuxer.md — Target design #1 / gap "Engine-wide parser-independence bypasses decode applicability"

### REQ-ENG-27 — [web-demuxer] Representation-aware packets with optional DTS (no fabricated DTS)
- **Priority:** P0
- **Depends on:** REQ-CORE-04, REQ-ORAC-01, REQ-ORAC-02
- **Current:** The oracle requires exact packet count/layout/size/keyframe and compares DTS though normal demux sets `dtsUs=ptsUs` while the fast path derives real DTS from stts (two backends, different evidence), and the TS supplement reads one ADTS base config (`src/engines/web-demuxer/adapter.ts:797-805,463-495`, `src/engines/web-demuxer/mp4-sample-table.ts:160-185,255-306`).
- **Problem:** Annex B vs AVCC, inline parameter sets, legal grouping, Matroska lacing, and missing-DTS evidence become false FAIL, and metadata false-fails aliases/reordering/HE-AAC/PS/VFR/NTSC.
- **Change:** Extend packet evidence with optional DTS (represent absent explicitly, never substitute PTS), duration, codec config, framing, access-unit/NAL grouping, and a payload/decoded-essence digest for REQ-ORAC-02; canonicalize codecs, match by type, treat HE-AAC/SBR and PS views as equivalent, and represent fps as nominal/average/observed with NTSC banding + edit-list/priming duration for REQ-ORAC-01 (ADTS-only TS supplement attaches provenance rather than forcing an exact value).
- **Acceptance:** Paired files with identical essence but alternate framing/parameter-set placement/grouping/lacing return DIFF while corrupt NAL/dropped sample/out-of-tolerance PTS return FAIL; reordered tracks and alias/valid-summary variations PASS while SBR/PS/30000-1001/VFR/edit-list/priming/wraparound assert explicit equivalence or true-failure.
- **Source:** docs/engines/web-demuxer.md — Target design #2/#3 / gaps "Packet verdicts mistake representation for correctness", "Metadata equivalence is positional and under-specified"

### REQ-ENG-28 — [web-demuxer] Temporal decode/seek and correct seek-landing selection
- **Priority:** P1
- **Depends on:** REQ-ORAC-03, REQ-ORAC-04
- **Current:** SSIM pairs by index, seek does not sort callback outputs and uses a fixed 0.75 s window with a 16-frame margin, and decode/seek suppress a callback error when any frame exists (`src/engines/web-demuxer/adapter.ts:977-987,860-927`, `src/core/oracles.ts:1905-1963`).
- **Problem:** fps/frame-count changes compare different instants, an unusual reorder depth/callback order picks the wrong first-N or landing, and truncated decode is scored on surviving frames.
- **Change:** Pair by presentation time after the declared fps/transform policy (record max delta/coverage; handle duplicate/drop/VFR) and separate media validity from reference applicability (NA_BROWSER); for seek, sort decoded candidates by PTS, select max real PTS ≤ target (or scenario nearest/keyframe rule), prove the chosen PTS exists in demux/golden timing, replace the fixed window with a landing/GOP-progress condition, and require declared frame coverage while surfacing partial-decode state.
- **Acceptance:** Injected failures after one/several frames, deep-reorder/VFR streams, altered frame count/fps, and permuted callback order yield deterministic temporal matches and explicit partial/failure classification, with negative/zero/past-EOF/repeated/backward/B-frame/Cues/VFR seek cases preserved.
- **Source:** docs/engines/web-demuxer.md — Target design #4 / gap "Decode and seek can accept partial or callback-order evidence"

### REQ-ENG-29 — [web-demuxer] Dual-demux backend provenance + validate the sample-table path
- **Priority:** P1
- **Depends on:** REQ-CORE-03
- **Current:** Demux bypasses web-demuxer for three unmutated ids using an adapter-local sample-table parser that reads no mdat, compacts tracks, omits boxes/metadata, and derives DTS unlike the normal path (`src/engines/web-demuxer/adapter.ts:764-767`, `src/engines/web-demuxer/mp4-sample-table.ts:1-23,139-189`).
- **Problem:** Results/performance are not comparable under one backend label, and table syntax can be reported as packet evidence without checking payload ranges.
- **Change:** Either run the pinned package for every ordinary demux cell or expose the sample-table helper as a distinct backend/config with a table-only contract; if retained, validate stsc + stco/co64 placement and referenced ranges (or promise table-observation only), apply edit lists/track matrices, reason-code multiple sample descriptions/fragmented/subtitle/data, keep a stable track-id→index map, stream stts/ctts, and report backend/bytes-read/moov-size/packet-count/omitted-evidence.
- **Acceptance:** Both paths run against the same fixtures comparing normalized metadata/packet semantics/range counts/bytes read/memory/verdict, and deliberately broken chunk offsets/mdat prove table-only evidence cannot PASS payload validation.
- **Source:** docs/engines/web-demuxer.md — Target design #5 / gap "One engine id hides two demux implementations"

### REQ-ENG-30 — [web-demuxer] Observable readiness, cancellation, cleanup, and memory
- **Priority:** P1
- **Depends on:** REQ-ADP-07
- **Current:** `init()` does not await package readiness (biasing timing), timeout only races promises, normal demux releases the reader lock only on error, seek leaks frames if read/flush throws, and packet rows/table/frames/pixels are bounded only by fixture/option (`src/engines/web-demuxer/adapter.ts:668-695,714-728,792-823,989-1040`, `src/core/runner.ts:655-684`).
- **Problem:** First-operation timing can include cold worker/WASM startup, work can continue after a terminal result, and worker/frame resources may outlive the cell with unverifiable memory.
- **Change:** Await explicit readiness in init (or label first-operation timing startup-inclusive), thread an AbortSignal through load/readers/decode/seek/range-fetches/raster, cancel active streams on abort (readable-stream cancel, not just lock release), close every VideoFrame (including the seek exceptional path), terminate the worker, await a cleanup barrier before any terminal result, bound memory independently for packet rows/table/frames/pixels, and report cleanup failure instead of swallowing it.
- **Acceptance:** Cancel/timeout at every async phase asserts zero later callbacks/messages, all streams settled, every frame closed, and no worker/WASM growth across repeated cells, with cold/warm readiness instrumented.
- **Source:** docs/engines/web-demuxer.md — Target design #6 / gaps "Timeout and teardown are not end-to-end cancellation", "Cold WASM work is not proven outside operation timing"

### REQ-ENG-31 — [web-demuxer] Partial multi-file robustness grade + adapter conformance suite
- **Priority:** P2
- **Depends on:** REQ-RUN-05, REQ-CORE-03
- **Current:** Any admissible file failure collapses the exhaustive cell, and no focused tests exercise the TS parser, sample-table helper, raster/digest, error-name matching, or worker lifecycle (`src/core/runner.ts:1118-1179`, `src/core/disabled-cells.ts:95-103`).
- **Problem:** "Passes 01, fails 02/03" loses its partial grade, and package upgrades / box-layout / browser-config changes can silently change verdict routing.
- **Change:** Headline mixed robustness as partial coverage (passed/admissible/total) reserving whole-cell ERROR for a true construction/init fault (unsupported valid files→NA_ENGINE), and implement the 12 enumerated conformance areas (package/lock/WASM provenance, lifecycle, container/codec matrix, multitrack, TS/ADTS/HE-AAC/PS/wraparound, ordinary-vs-fast-path parity, framing→DIFF, WebCodecs absence→NA, decode/seek edge cases, cancel/timeout, status persistence) gating capability/upgrade/disabled-row changes.
- **Acceptance:** A three-file group (PASS / semantic FAIL / clean unsupported NA) yields stable partial coverage and exact per-file reasons; CI runs deterministic unit + browser integration cases and fails on unreviewed capability or taxonomy drift.
- **Source:** docs/engines/web-demuxer.md — Target design #7/#8 / gaps "Robustness coverage collapses…", "Adapter-local behavior has no focused tests"

### REQ-ENG-32 — [aibrush-media] Tuple-aware applicability with typed framework errors (not message regexes)
- **Priority:** P0
- **Depends on:** REQ-CORE-03
- **Current:** The capability object is flat/undirected, concrete legality is discovered in scattered branches or translated from framework exceptions via `naIfMiss` message regexes, and browser support is not probed per exact config (`src/engines/aibrush-media/adapter.ts:3752-3900,4075-4093,92-160`).
- **Problem:** A token-complete scenario can enter the adapter and become ERROR when a framework miss does not match the broad translator.
- **Change:** Keep the token gate as a first pass, then validate operation × input container × input codec × output container × output codec × options before costly work using exact framework error classes/codes (not message regexes) and WebCodecs `isConfigSupported()`, throwing `NotApplicableError`→NA_ENGINE for runtime inability while keeping malformed media (GracefulRejectionError) and genuine faults distinct.
- **Acceptance:** Table-driven tests cover still-image demux/remux, fragmented trim, append-only output, PCM/container legality, HEVC browser re-import, and unsupported encode tuples, with unsupported rows terminating NA_ENGINE before mutation/output allocation and malformed media/real faults retaining distinct paths.
- **Source:** docs/engines/aibrush-media.md — Target design #1 / gap "Coarse declarations leak unsupported combinations into execution"

### REQ-ENG-33 — [aibrush-media] Representation-aware packet oracle + preserve observed metadata
- **Priority:** P0
- **Depends on:** REQ-CORE-04, REQ-ORAC-01, REQ-ORAC-02
- **Current:** The adapter exposes packet bytes/sizes/timestamps/durations/key flags/descriptions and normalizes AVC/HEVC/AV1/VPx/AAC/MP3 aliases, but `golden-packets`/`golden-metadata` compare positionally with exact size/keyframe/rate/channel (`src/engines/aibrush-media/adapter.ts:626-784,1153-1216`, `src/core/oracles.ts:835-927`). SSIM index pairing is REQ-ORAC-03.
- **Problem:** Annex B vs length-prefixed framing, inline SPS/PPS/VPS, legal grouping, reordered same-type tracks, HE-AAC/PS, VFR/NTSC, priming, and edit-list durations false-fail valid AiBrush output.
- **Change:** Feed decode order/timestamps, sync semantics, decodability, and required codec configuration to REQ-ORAC-02 (semantic PASS, representation DIFF, corruption FAIL, precise diagnostic), and keep truthful observed rates/channels (do not fabricate ffprobe's representation) for REQ-ORAC-01.
- **Acceptance:** Two decodable outputs differing only by framing/inline-parameter-sets/legal grouping yield DIFF while damaged timestamps/missing access units/undecodable output yield FAIL; equivalent HE-AAC observations, reordered tracks, rational rates, and documented timeline shifts do not fail while missing tracks and materially wrong duration still do.
- **Source:** docs/engines/aibrush-media.md — Target design #2/#3/#4

### REQ-ENG-34 — [aibrush-media] Forward advertised output-shape options exactly or reject
- **Priority:** P1
- **Depends on:** REQ-CORE-03
- **Current:** Fragmented is advertised but trim forwards only range/mode/sink, `fastStart:reserve` collapses to a boolean, and the callback target rejects non-contiguous positioned writes (`src/engines/aibrush-media/adapter.ts:3840-3863,4294-4343,1746-1777,5248-5274`, `src/core/runner.ts:750-765`).
- **Problem:** The gate can claim a requested output organization the adapter did not request or cannot express.
- **Change:** Forward and observe the exact mode (trim fragmentation, fastStart reserve bytes, positioned writes) or reject the tuple as NA_ENGINE, and verify ISO BMFF layout claims from the produced box/timeline structure (ftyp+moov, fragment-bearing init) rather than a truthy flag.
- **Acceptance:** Re-import trim/fast-start outputs assert the required fragmentation or front-loaded metadata, and unsupported positioned-write modes never report support.
- **Source:** docs/engines/aibrush-media.md — gap "Advertised option semantics are not always forwarded"

### REQ-ENG-35 — [aibrush-media] Single-source cancellation/ownership; remove global error suppression
- **Priority:** P1
- **Depends on:** REQ-ADP-07
- **Current:** The runner gives up at 120 s without aborting while the adapter waits 310 s before aborting, global unhandledrejection/error listeners stay armed two seconds after disposal, and the pooled first-frame path double-closes (`src/core/runner.ts:670-683`, `src/engines/aibrush-media/adapter.ts:180-292,1999-2143,2173-2182,3574-3583`).
- **Problem:** Framework work continues after a recorded result, a late rejection from another cell is suppressed, and double-close bugs are hidden.
- **Change:** Propagate one cell-scoped AbortSignal/deadline that cannot outlive the cell, await termination before final status, remove process-global error suppression, and assign each VideoFrame/AudioData/reader/pooled decoder exactly one closer.
- **Acceptance:** A forced 120 s timeout aborts framework work before teardown, an unhandled rejection from the next engine stays visible, and instrumented frame handles close exactly once on success/rejection/abort (no readers/decoder queues/timers/listeners left).
- **Source:** docs/engines/aibrush-media.md — Target design #5 / gaps "Timeouts and global error handling cross cell boundaries", "Resource ownership and route telemetry are ambiguous"

### REQ-ENG-36 — [aibrush-media] Factual telemetry, route, and framework provenance
- **Priority:** P1
- **Depends on:** none
- **Current:** `configUsed` is a static instance description, a stream target retains every chunk before concatenating, a buffer target records a synthetic one-write sample, and the dependency is `file:../media` labeled `aibrush-media@dev` with sibling git state printed but not saved (`src/engines/aibrush-media/adapter.ts:3442-3450,1741-1795`, `package.json:28-38`, `scripts/sync-aibrush-vendor.sh:21-54`).
- **Problem:** Stream memory behavior is overstated, reports cannot attribute a result to the actual framework path, and two reports with the same label can benchmark different TS/WASM artifacts.
- **Change:** Retain callback-write telemetry only for genuine stream targets, label buffer materialization separately, report peak retained bytes, populate `configUsed` from the actual framework route/driver per operation, and record the exact AiBrush source revision/dirty state/package version/build flags/WASM artifact digest in run metadata (pin/persist an immutable revision while preserving a marked dirty-dev mode), refusing an unlabeled dirty build in reproducible/CI mode.
- **Acceptance:** Report JSON alone identifies the exact source and WASM inputs, rerunning the same revision produces the same provenance tuple, callback-write counts match emitted callbacks, retained-byte metrics expose concatenation, and two operation routes produce different truthful `configUsed` evidence.
- **Source:** docs/engines/aibrush-media.md — Target design #6 / gaps "Resource ownership and route telemetry are ambiguous", "Framework builds are not independently reproducible"

## Scenario DSL & registry

### REQ-DSL-01 — Introduce a validated, immutable ScenarioDefinitionV2 model
- **Priority:** P0
- **Depends on:** none
- **Current:** `defineScenario()` checks only id-with-slash, a non-empty operations array, and a non-empty oracle array, then casts the family prefix, validating nothing about input, op/requirement alignment, tokens, options, metrics, tolerances, timeout, or callback (`src/core/scenario.ts:183-204`).
- **Problem:** An unknown family, empty input, op/requirements mismatch, duplicate token, invalid option, unusable primary metric, or non-finite tolerance enters registration and fails later as a misleading result.
- **Change:** Introduce a JSON-safe `ScenarioDefinitionV2` (schemaVersion, id, revision, family, order, op, inputs, operation-discriminated options, requires, oracle/metric specs, tolerances, timeout, notes; `mutate`→`{mutationId, parameters}`) validated fail-fast by a JSON Schema 2020-12 structural layer plus a semantic layer (family===id prefix, op in required ops, primaryMetric in metrics, oracle/metric applicability, assets resolve, timeout>0, mutation ids confined to negative/robustness), committing only a deep-frozen snapshot.
- **Acceptance:** One validation command expands every family with zero diagnostics; one negative fixture per omitted invariant fails before registry mutation naming scenarioId + field path; mutating a caller-owned definition after registration cannot change `getScenario()`/`listScenarios()`.
- **Source:** docs/subsystems/scenario-dsl-registry.md — Target design "A versioned, immutable definition model"

### REQ-DSL-02 — Add tuple/alternative clauses to Requires with derived WebCodecs configs
- **Priority:** P0
- **Depends on:** REQ-CORE-03
- **Current:** `Requires` is flat arrays, the gate checks independent arrays plus a representative per-codec browser boolean, and relies on runtime `NotApplicableError` or ordinary failure for unsupported combinations (`src/core/scenario.ts:17-31`, `src/core/runner.ts:124-205`, `src/core/feature-detect.ts:315-379`).
- **Problem:** All individual tokens can pass while operation × container × codec × options is impossible, leaking into FAIL/ERROR or requiring disabled-cell entries.
- **Change:** Replace flat-only `Requires` with a normalized representation retaining atomic tokens plus concrete clauses (`allOfTokens` + disjunctive `anyOfCombinations[]` with conjunctive fields for operation, containers/codecs, option constraints, browser roles/config recipes), derive the actual audio/video decoder/encoder config from selected input metadata + output options and probe with `isConfigSupported()`, and retain the typed runtime `NotApplicableError` fallback. (Scenario-side of REQ-CORE-03.)
- **Acceptance:** A token-complete but tuple-unsupported scenario is NA_ENGINE when known or `NotApplicableError` when data-dependent (never FAIL/ERROR), a concrete-config WebCodecs rejection is NA_BROWSER while a parser-only path is not browser-gated, and combinatorial-miss tests remove equivalent disabled-cell entries.
- **Source:** docs/subsystems/scenario-dsl-registry.md — Target design "Tuple-aware applicability without losing atomic tokens"

### REQ-DSL-03 — Adopt three-way oracle verdicts and result schema v2
- **Priority:** P0
- **Depends on:** REQ-CORE-01
- **Current:** `OracleOutcome.pass` is boolean and `ResultStatus` omits DIFF, the runner maps the first real false to FAIL, and downloads advertise `results@1` while cached rows are cast directly to `ScenarioResult` (`src/core/scenario.ts:208-222`, `src/core/runner.ts:1411-1447`, `src/app/main.ts:393-402`).
- **Problem:** A valid representation differing from an ffmpeg-baked golden cannot be a first-class diagnostic and is normalized to PASS ad hoc or conflated with wrong output.
- **Change:** Replace boolean `pass` with a discriminated schema-validated `OracleOutcomeV2` (verdict PASS/DIFF/FAIL + reasonCode, or unavailable NA_BROWSER/NA_ASSET + reasonCode) and `ResultStatusV2`, add the explicit reducer, and publish `media-browser-test/results@2` plus a JSON Schema carrying schema version, scenario id/revision/hash, engine id/version, browser, input-variant identity+digest, status, every oracle outcome, measurements, environment, and timing. (Serialization/schema realization of REQ-CORE-01.)
- **Acceptance:** Reducer table tests prove FAIL > DIFF > PASS across permutations; valid Annex B/AVCC/codec-alias/legal-grouping/tolerant-timing produces DIFF while invalid produces FAIL; performance is collected only for PASS and DIFF with reports keeping DIFF visible and distinct.
- **Source:** docs/subsystems/scenario-dsl-registry.md — Target design "Three-way oracle verdicts and result schema v2"

### REQ-DSL-04 — Add scenario revision and RFC 8785 definition hash to identity
- **Priority:** P1
- **Depends on:** REQ-DSL-01
- **Current:** Scenario id is the only definition identity copied into results and cache keys, results carry no revision/hash, and cache compatibility relies on a manual epoch plus selected invalidation keys (`src/core/scenario.ts:269-285`, `src/app/result-cache.ts:43-50`).
- **Problem:** Changing options, requirements, oracle/tolerance policy, or fixture semantics under the same id can make an old cached result look current.
- **Change:** Keep `id` as the permanent key, add a monotonic `revision` for any semantic change, produce a `definitionHash` over an RFC 8785 canonical projection, and carry `{scenarioId, scenarioRevision, definitionHash}` in results and cache keys, never reusing an id for different behavior.
- **Acceptance:** Any semantic definition change causes a new key/hash and a cache miss, while formatting/property-order-only changes leave the canonical hash unchanged.
- **Source:** docs/subsystems/scenario-dsl-registry.md — Target design "Stable identity and deterministic expansion"

### REQ-DSL-05 — Register from one canonical manifest with atomic staged commit
- **Priority:** P1
- **Depends on:** REQ-DSL-01
- **Current:** The static battery puts robustness before performance and prechecks all ids while app wiring reverses those two families and commits each scenario directly; registry lists return insertion order (`src/scenarios/index.ts:32-50`, `src/app/register.ts:128-173`, `src/core/registry.ts:72-77`).
- **Problem:** Run order differs by entry point, UI regrouping masks the mismatch, and a failed family registration can leave an unreported partial family.
- **Change:** Replace the two order/wiring lists with one canonical manifest (family id, label, order, lazy loader); registration loads/expands every selected family into a staging area, validates the complete set, sorts by manifest family order then explicit scenario order/id, and commits atomically.
- **Acceptance:** Eager and lazy loading produce identical ordered ids and definition hashes, robustness precedes performance at every consumer, and one invalid/duplicate member leaves the registry unchanged and reports the exact family/member with a successful retry after correction.
- **Source:** docs/subsystems/scenario-dsl-registry.md — Target design "Stable identity and deterministic expansion"

### REQ-DSL-06 — Enforce the result schema at read boundaries with a v1→v2 migrator
- **Priority:** P1
- **Depends on:** REQ-DSL-03
- **Current:** Downloads advertise `results@1` but cached rows are cast directly to `ScenarioResult`, and cache/downstream loaders have no shared runtime validator or migrator (`src/app/result-cache.ts:36-110`, `src/app/main.ts:393-402`).
- **Problem:** Stale, malformed, or future-version data can reach consumers with impossible status/outcome combinations.
- **Change:** Publish and enforce a versioned result JSON Schema at every read boundary (IndexedDB read, download import, offline compare/aggregate, report input) with an explicit v1→v2 migration (pass:true→PASS; provably-unavailable false→typed unavailable; every other false→FAIL conservatively; never manufacture DIFF), replacing the manual cache epoch with schema version + revision/hash.
- **Acceptance:** Valid v1 fixtures migrate deterministically, valid v2 fixtures round-trip, and malformed/unknown-major inputs fail before indexing, scoring, or cache reuse.
- **Source:** docs/subsystems/scenario-dsl-registry.md — Target design "Three-way oracle verdicts and result schema v2" / gap "Stored result readers trust TypeScript-shaped JSON"

### REQ-DSL-07 — Make per-input outcomes, variant ids, and partial coverage first-class in the result model
- **Priority:** P1
- **Depends on:** REQ-CORE-01, REQ-RUN-05
- **Current:** Selection mutates a shallow scenario clone, ABR uses a separate options array, exhaustive file results omit oracle outcomes, and mixed exhaustive failures collapse to top-level FAIL/ERROR (`src/core/media-selection.ts:253-325`, `src/core/scenario.ts:320-330`, `src/core/runner.ts:1127-1204`).
- **Problem:** "File 01 passes, files 02/03 fail" survives only as a thin status list, and variant terminology/identities are ambiguous.
- **Change:** Model runs as `ScenarioInstance {scenarioId, scenarioRevision, definitionHash, inputVariantId, inputSha256}`, retain a full per-input result (oracle outcomes + availability) for every variant with ABR renditions nested under distinct `renditionId`s, and add `coverage.grade` FULL/PARTIAL/NONE plus passed/diffed/failed/unavailable/total counts. (Result-model side; runner aggregation is REQ-RUN-05.)
- **Acceptance:** Exhaustive round-trips preserve every file's oracle outcomes and digest; mixed PASS/FAIL, DIFF/PASS, NA/PASS, and all-NA fixtures produce deterministic aggregate status and coverage grade; a partial robustness cell names passing/failing files and is never a harness ERROR.
- **Source:** docs/subsystems/scenario-dsl-registry.md — Target design "Explicit exhaustive input outcomes and partial coverage"

### REQ-DSL-08 — Emit explicit variant/rendition expansion identity and a committed snapshot
- **Priority:** P2
- **Depends on:** REQ-DSL-05
- **Current:** Case-table builders expand eagerly into materialized `Scenario[]`, "variant" has several runtime shapes, and there is no committed expansion snapshot (`src/scenarios/remux/_shared.ts:72-108`, `src/core/media-selection.ts:253-389`).
- **Problem:** Unmaterialized or accidental duplicate variants can pass CI silently, and variant identity is ambiguous across input selection and renditions.
- **Change:** Have every builder emit explicit expansion identity — input variants use `variantId`, rendition variants use `renditionId`, neither overloaded as the scenario id — and commit a manifest snapshot of ordered `{id, revision, definitionHash, inputVariantIds, renditionIds}`.
- **Acceptance:** Reordering source imports without changing declared order leaves the snapshot and registry output byte-for-byte unchanged, while adding/removing a builder row changes the checked expansion snapshot.
- **Source:** docs/subsystems/scenario-dsl-registry.md — Target design "Stable identity and deterministic expansion"

## Media selection

### REQ-SEL-01 — Validate and freeze a canonical candidate manifest
- **Priority:** P0
- **Depends on:** none
- **Current:** The loader casts parsed JSON after checking only `scenarioId`, lets duplicate ids overwrite, ignores extra fields, and never joins the baked manifest (`src/core/media-selection.ts:120-145`).
- **Problem:** Malformed metadata silently collapses selection to baked-only, duplicate rows/digests bias sampling, and last-row-wins hides corpus errors.
- **Change:** Parse the whole catalog against a runtime schema (one row per scenario id, known class, normalized path, finite nonneg safe size, lowercase 64-hex SHA, coherent container/codec/duration/key, unique path and digest per scenario); diagnose duplicate ids/paths/digests before engine construction; freeze an immutable manifest recording `catalogSchemaVersion`, `selectionPolicyVersion`, full catalog SHA-256, per-scenario eligible-pool digest, baked corpus version+digest, and PROV/SLSA acquisition provenance; an explicit baked-only fallback reports `catalogState=fallback` with reason and baked digest.
- **Acceptance:** Row/object-key order yields the same canonical manifest digest and candidate identities; duplicate ids/paths/in-scenario digests are diagnosed before engine construction; a missing/invalid catalog either fails or is labelled `catalogState=fallback` with its reason and baked digest.
- **Source:** docs/subsystems/media-selection.md — Target design #1 / gap "Catalog validation and integrity are permissive"

### REQ-SEL-02 — Verify content digest and size of fetched bytes before engine use
- **Priority:** P0
- **Depends on:** REQ-SEL-01
- **Current:** Catalog SHA-256 is copied into selection/cache/reports but the fetched bytes are never re-hashed; size is an unverified hint (`src/core/runner.ts:580-625`, `src/core/media-selection.ts:308-325`).
- **Problem:** A stale, truncated, or replaced file is reported under a digest it does not have, breaking integrity and blaming engines for corpus faults.
- **Change:** Compute and verify SHA-256 and `sizeBytes` over every selected file before handing it to any engine; a mismatch is a single engine-independent corpus-integrity issue attached to the run and scenario and those bytes must not reach any engine; if no verified candidate remains, emit `NA_ASSET` with the structured corpus reason and `eligible=0` (never ERROR, never a silent unverified path).
- **Acceptance:** A size or SHA-256 mismatch prevents those bytes reaching every engine and produces one corpus issue; with no verified candidate, no draw/engine is invoked and affected cells are NA_ASSET/`eligible=0`; mutation tests for truncated bytes and same-path replacement fail before the first adapter call.
- **Source:** docs/subsystems/media-selection.md — Target design #1 / gap "Catalog validation and integrity are permissive"

### REQ-SEL-03 — Order-independent versioned scoring with a durable digest replay key
- **Priority:** P0
- **Depends on:** REQ-SEL-01
- **Current:** Selection hashes `runSeed|scenarioId` and indexes catalog order via mulberry32; neither the RNG/policy version nor the eligible-pool digest is recorded (`src/core/media-selection.ts:397-413`, `src/core/scenario.ts:338-349`).
- **Problem:** Reordering/inserting files remaps a seed, and the same textual seed can mean different bytes across corpus revisions, so a seed alone is not a stable sample identity.
- **Change:** Replace index selection with a specified cryptographic hash-to-integer keyed score over `selectionPolicyVersion|seed|scenarioId|fullCandidateDigest` (highest-random-weight, canonical tie-break); record seed, algorithm id/version, selected full path + full SHA-256, eligible-pool digest, and candidate count; make full path + full SHA-256 the durable replay key that works even if the catalog changes, and reject a pool-digest mismatch on seed replay unless explicitly opted in.
- **Acceptance:** Same policy/seed/scenario/pool-digest selects the same full digest in every supported browser; reordering never changes the pick; adding/removing a candidate changes a prior pick only when set-scoring selects the changed member; a recorded failing digest replays as an explicit input; a golden vector exists per `selectionPolicyVersion`.
- **Source:** docs/subsystems/media-selection.md — Target design #2 / gap "Fixed seed does not identify a stable sample by itself"

### REQ-SEL-04 — Typed oracle-evidence plan with declared sufficient sets
- **Priority:** P0
- **Depends on:** REQ-CORE-04, REQ-CORE-01
- **Current:** Ordinary real selection retains all oracles and the runner recognizes evidence gaps by matching phrases in boolean-outcome detail, letting any remaining true outcome carry PASS (`src/core/runner.ts:858-889,1411-1447`).
- **Problem:** Copy changes silently alter status routing and a weak supplemental pass can hide unavailable required evidence.
- **Change:** Attach a typed oracle-evidence plan per candidate (each oracle declares source-keyed golden / candidate decode / reference re-import / metamorphic peer / capability need; the scenario declares the sufficient set for PASS); missing evidence yields a structured unavailable reason, not a phrase; a strong required oracle missing plus a weak supplemental pass cannot produce top-level PASS, and a file with no sufficient evidence stays visible as NA_ASSET in the exhaustive denominator; per-file goldens/cleartext bases name the exact source SHA-256 they cover.
- **Acceptance:** No result status depends on free-form oracle-detail text; every candidate report lists required/applied/unavailable/sufficient survivor oracles; a required-missing + weak-pass case becomes NA_ASSET; a no-sufficient-evidence file stays in the denominator rather than being removed to improve coverage.
- **Source:** docs/subsystems/media-selection.md — Target design #3 / gap "Survivor-oracle routing is implicit and brittle"

### REQ-SEL-05 — Define the sampling unit as unique verified content
- **Priority:** P1
- **Depends on:** REQ-SEL-01
- **Current:** Every file entry occupies one array slot with no duplicate-content detection or stratification, and baked gets one slot regardless of corpus size (`src/core/media-selection.ts:375-410`).
- **Problem:** Duplicate downloads or a provider with many near-identical files receive extra probability and baked coverage decays as reals are appended, biasing the sample.
- **Change:** Define the sampling unit as unique verified content (a repeated digest in one scenario is one unit, not extra probability mass); disclose per-candidate selection probabilities; introduce any strata/weights only as versioned manifest fields applied identically for every engine.
- **Acceptance:** Duplicate-content fixtures do not change selection probability and are rejected rather than double-weighted; a deterministic seed sweep meets a predeclared uniformity test; reports enumerate the eligible pool and any weights used.
- **Source:** docs/subsystems/media-selection.md — Target design #2 / gap "Sampling probability can be accidentally weighted"

### REQ-SEL-06 — Make derived-CENC candidate eligibility fail-closed and digest-bound
- **Priority:** P1
- **Depends on:** REQ-CORE-04
- **Current:** A derived CENC record missing key or cleartext-base metadata falls into a defensive branch that only repoints the input and performs none of the intended oracle/metamorphic rewrite (`src/core/media-selection.ts:253-257`).
- **Problem:** An incomplete derived candidate can execute with baked-twin key/base assumptions and the wrong invariant.
- **Change:** Make key material, scheme, cleartext-base path, full base digest, and the declared metamorphic survivor mandatory eligibility fields for a derived CENC candidate; missing any one makes it an engine-independent corpus/evidence gap that never reaches an adapter; a complete candidate runs only its own key/base-bound invariant.
- **Acceptance:** A complete CENC candidate runs only its own key/base-bound invariant and any key/base/evidence mutation is caught before any adapter call; incomplete CENC candidates never reach an engine.
- **Source:** docs/subsystems/media-selection.md — Target design #3 / gap "Survivor-oracle routing is implicit and brittle"

### REQ-SEL-07 — Bind cache and report identity to full-digest executed and pool contracts
- **Priority:** P1
- **Depends on:** REQ-SEL-02
- **Current:** Real cache tags truncate SHA to 12 hex, baked tags omit content identity, the corpus checksum is a 32-bit FNV digest, and a cache hit restores only the scenario id while retaining the stored run's old selection/environment (`src/core/media-selection.ts:438-454`, `src/core/runner.ts:1981-1998`).
- **Problem:** Baked byte changes evade identity, collisions are needlessly plausible, pool-only drift reuses stale counts, and reports describe the prior run envelope.
- **Change:** Replace the 12-hex/filename tags and FNV checksum with full-SHA-256 canonical identities, recording distinct `eligiblePoolDigest` and `executedInputDigest` (including the verified baked digest); build a reusable observation key from engine/version, runtime config, scenario-contract and oracle/evidence-contract fingerprints, executed input digests, and benchmark config; re-envelope every cache hit with the current run's seed, pool digest, candidate count, corpus state, and timestamps.
- **Acceptance:** Changing baked or real bytes changes the cache key and both digests; a SHA-256 prefix collision or same-filename/different-bytes cannot hit the same entry; reordering an unchanged exhaustive set keeps the set cache key but adding/removing/changing a member invalidates it; changing the oracle/scenario contract invalidates the observation; reusing identical bytes under a new seed stamps the new envelope while tracing to the original observation.
- **Source:** docs/subsystems/media-selection.md — Target design #5 / gap "Cache and corpus identity are too weak and can retain stale provenance"

### REQ-SEL-08 — Add selection-policy property tests and an end-to-end acceptance suite
- **Priority:** P2
- **Depends on:** REQ-SEL-01
- **Current:** The unit script covers deterministic single selection, shape/duration gates, baked-only policies, id/URL, CENC rewrite, cache tags, checksum order-independence, seek exclusion, and fallback, but imports neither `candidatesForRun` nor runner/report integration (`scripts/test-media-selection.mjs:15-21`).
- **Problem:** The new manifest, sampling, evidence, partial-coverage, and cache behaviors have no test coverage across the real integration path.
- **Change:** Keep focused example tests and add property tests over row permutations, candidate add/remove, duplicate content, malformed fields, empty pools, and seed sweeps; cover `candidatesForRun`, `runMatrix` integration, cache hits, and report serialization; persist counterexample identities and add a fixed golden vector per `selectionPolicyVersion`.
- **Acceptance:** CI exercises seeded-single and exhaustive modes through report JSON and proves the acceptance matrix for PASS/DIFF/FAIL/NA, denominators, failing identities, cache behavior, and manifest drift.
- **Source:** docs/subsystems/media-selection.md — Target design #6 / gap "Current tests stop before exhaustive integration"

## Golden baking & fixtures

### REQ-FIX-01 — Emit raw plus canonical multi-view golden metadata with semantic matching
- **Priority:** P0
- **Depends on:** REQ-FIX-05, REQ-ORAC-01
- **Current:** The producer reduces codec/rate/channel/timing to scalar fields and canonicalizes only `codec_name`, while `golden-metadata` matches positionally with lowercased exact comparisons (`fixtures/bake.mjs:1587-1614`, `src/core/oracles.ts:768-811`, `src/core/box-readers.ts:46-106`).
- **Problem:** Alias-only codecs, reordered tracks, HE-AAC/SBR core/output views, Parametric Stereo channels, VFR/NTSC cadence, and edit-list/priming/timebase duration views can look like genuinely wrong metadata.
- **Change:** Retain `codecRaw` while canonicalizing all listed aliases, match tracks by semantic type (per-type ordinal only when >1), preserve exact rational rates and cadence to band VFR/NTSC, keep coded/core vs presentation/output views for HE-AAC/SBR and PS, and preserve presentation duration, media/sample span, timebase, edit list, and AAC priming so duration widens only for a documented cause. (Bake-side inputs to REQ-ORAC-01.)
- **Acceptance:** Alias-order, HE-AAC v1/v2, VFR, 30000/1001, edit-list, primed-AAC, and multi-track fixtures produce the same canonical document and semantically equivalent outcome independent of stream order on both bake paths, reporting DIFF for representation differences while still failing wrong codec/type/rate/channel/timeline.
- **Source:** docs/subsystems/golden-baking-fixtures.md — Target design "One canonical normalization library" / gap 6

### REQ-FIX-02 — Record packet framing and separate semantic access-units from fingerprints
- **Priority:** P0
- **Depends on:** REQ-ORAC-02
- **Current:** The producer stores exact packet size/keyframe rows and the shared comparator counts any size or keyframe mismatch as failure after per-track sorting (`fixtures/bake.mjs:1714-1731`, `src/core/oracles.ts:835-924`).
- **Problem:** Annex B vs AVCC, inline SPS/PPS, and legal NAL grouping change sizes/boundaries without changing decodable pictures or timing.
- **Change:** Record framing (Annex B vs length-prefixed avc/hevc), decoder configuration/parameter-set placement, access-unit timestamps/durations, random-access semantics, and decodability, and separate semantic access-unit checks from optional representation fingerprints so legal differences are DIFF while missing/duplicated content, invalid timing, failed random access, or undecodable output are FAIL. (Bake-side inputs to REQ-ORAC-02.)
- **Acceptance:** Equivalent AVCC, in-band `avc3`, and Annex B fixtures retain semantic timeline/decode PASS while producing a representation DIFF; dropped NAL units or broken random access remain FAIL; no legal form becomes FAIL solely from packet byte size or grouping.
- **Source:** docs/subsystems/golden-baking-fixtures.md — Target design "Separate packet semantics from baker representation" / gap 7

### REQ-FIX-03 — Require real pixel provenance and forbid the 1×1 SSIM substitute
- **Priority:** P0
- **Depends on:** REQ-FIX-06
- **Current:** When a decoded frame lacks a pixel accessor or retrieval fails, frame baking substitutes transparent 1×1 pixels and can still publish a complete all-zero luma signature, with provenance limited to user agent + timestamp (`src/core/frame-bake.ts:562-590,743-761`).
- **Problem:** A parseable `.ssim.json` can describe a fallback image rather than the decoded frame, causing false failures against faithful candidates.
- **Change:** Require real source pixels for every luma signature — a missing `getPixels`, decode failure, timestamp miss, or zero-frame placeholder stays pending and routes to NA_ASSET, forbidding the 1×1 transparent substitute — and record full frame provenance (source digest, browser executable/build, OS/arch, decoder config, coded/display dims, color space, crop/rotation, expected+observed PTS, pixel-normalization version).
- **Acceptance:** A frame sink with digests but no `getPixels` produces no SSIM file, remains pending, and never yields an all-zero committed signature.
- **Source:** docs/subsystems/golden-baking-fixtures.md — Target design "Browser evidence must require real pixels and timestamp identity" / gap 8

### REQ-FIX-04 — Pair ssim-psnr frames by timestamp and report decoder availability separately
- **Priority:** P0
- **Depends on:** REQ-ORAC-03, REQ-ORAC-04
- **Current:** `ssim-psnr` decodes source through the unscored platform instrument (fair) but compares candidate and source frames at equal array indices, and output decode failure is immediately FAIL (`src/core/oracles.ts:1905-1959,1776-1804`).
- **Problem:** A valid fps or frame-count change can compare unrelated presentation times and false-fail, and a valid-but-platform-undecodable output cannot be distinguished from corrupt output.
- **Change:** Pair reference and candidate frames by transformed presentation timestamp within an explicit tolerance and unmatched-frame policy rather than array index (REQ-ORAC-03), and report decoder availability separately from media validity so a valid output the neutral decoder cannot decode is a distinct reference-unavailable observation (REQ-ORAC-04), not fabricated pixels.
- **Acceptance:** Rate-changing and frame-dropping fixtures compare intended temporal neighbors, each expected PTS maps to ≤1 actual frame, and a deliberately-undecodable-to-platform but independently valid output produces the reference-unavailable classification.
- **Source:** docs/subsystems/golden-baking-fixtures.md — Target design "Browser evidence must require real pixels…" / gap 10

### REQ-FIX-05 — Share one normalization and placeholder module across bake paths
- **Priority:** P1
- **Depends on:** none
- **Current:** Scenario normalization is copied from the flat bake and must be updated manually, and its frame placeholder logic has presentation-order refinements absent from the flat producer, which asks ffprobe for 12 frames directly (`fixtures/bake-scenario-goldens.mjs:18-20,206-271`, `fixtures/bake.mjs:1742-1752`).
- **Problem:** The same bytes can produce different canonical documents or frame selections depending on corpus location.
- **Change:** Import one versioned normalization module and one presentation-order placeholder module from both entry points, with fixture-location-independent golden ids and identical presentation-order selection.
- **Acceptance:** Property tests run identical probe JSON through both entry points and require byte-identical normalized output and frame timestamp lists.
- **Source:** docs/subsystems/golden-baking-fixtures.md — Target design "One canonical normalization library" / gap 5

### REQ-FIX-06 — Adopt a versioned provenance envelope with validated schemas
- **Priority:** P1
- **Depends on:** none
- **Current:** The manifest `$schema` is prose, metadata/packet artifacts have no envelope, `loadGolden()` accepts broad shapes without a schema version, and browser frame provenance is only user agent + wall-clock (`fixtures/manifest.json:1-4`, `src/core/oracles.ts:14-21`, `src/core/frame-bake.ts:815-824`).
- **Problem:** A stale or hand-edited artifact can be parseable yet impossible to reproduce or attribute, and incompatible schema changes can silently cast into runtime types.
- **Change:** Adopt a versioned provenance envelope (artifact kind/schema version, asset id, source-media SHA-256, recipe + normalized-argument digest, resolved dependency digests, baker identity/versions, platform/env params, start/end time, output artifact digest) per the SLSA build-definition/run-details/subject model, JSON Schema-validated before publication and runtime use.
- **Acceptance:** Schema validation rejects unknown-major and malformed-required documents before publication and runtime, and an audit command resolves every committed artifact to source digest, recipe, baker version, and output digest.
- **Source:** docs/subsystems/golden-baking-fixtures.md — Target design "Versioned, attributable evidence" / gap 1

### REQ-FIX-07 — Pin the tool/environment perimeter and seed fixture crypto material
- **Priority:** P1
- **Depends on:** REQ-FIX-06
- **Current:** The bake uses bitexact flags but discovers tools from PATH without recording versions, and HLS AES-128 keys/IVs use browser crypto or a Date/`Math.random()` fallback (`fixtures/bake.mjs:60-70,681-712,1493-1505`).
- **Problem:** Two nominally identical bakes can emit different media, keys, and downstream goldens with no recorded explanation.
- **Change:** Pin or record the full perimeter (ffmpeg, ffprobe, Bun, optional Bento4/Shaka, Playwright, browser build, OS/arch, locale, timezone, relevant env vars) rather than inferring from PATH, and use committed deterministic seeds so fixture cryptographic material never depends on wall-clock or unrecorded randomness.
- **Acceptance:** Two isolated clean bakes under the declared environment match all non-browser-qualified digests including encrypted assets and sidecars, and random fixture material is deterministic under a committed seed.
- **Source:** docs/subsystems/golden-baking-fixtures.md — Target design "Versioned, attributable evidence" / gap 4

### REQ-FIX-08 — Publish bakes transactionally with a generation index and runtime digest checks
- **Priority:** P1
- **Depends on:** REQ-FIX-06
- **Current:** Flat metadata/packets/frames/manifest/keys/segments use independent direct writes, and the scenario bake writes directly and prints counted ffprobe failures without a failing exit code (`fixtures/bake.mjs:1912-1958`, `fixtures/bake-scenario-goldens.mjs:370-415`).
- **Problem:** Interruption can leave a mixed generation that still looks present, and automation can accept an incomplete scenario bake as success.
- **Change:** Stage one immutable generation, validate every artifact and cross-reference, compute all digests, fsync, and publish a small generation index last (rename); accept at runtime only files named by that index whose digest and source-media digest match; make any unexpected selected failure exit non-zero on both entry points; record expected absent/provided/captured and malformed states as explicit typed records.
- **Acceptance:** Fault injection after every write yields the complete previous or new generation with no mixed loader view; an injected ffprobe/write/schema failure makes both entry points exit non-zero without changing the active index; runtime hashes media and evidence at least once per cache lifetime, quarantining mismatches as NA_ASSET.
- **Source:** docs/subsystems/golden-baking-fixtures.md — Target design "Transactional publication and integrity checks" / gap 2

### REQ-FIX-09 — Reuse media only on digest+size match with explicit update invalidation
- **Priority:** P1
- **Depends on:** REQ-FIX-08
- **Current:** A pre-existing path is reused by existence alone unless `--force`, then the manifest is refreshed from whatever bytes are present without comparing to the committed SHA-256, while runtime checks only non-null digest/size and HTTP presence (`fixtures/bake.mjs:1827-1832,1889-1893`, `src/core/runner.ts:514-545`).
- **Problem:** Local contamination or a changed provided/captured file can redefine the corpus and leave old goldens attached to new media.
- **Change:** Reuse a file only after its source digest and size match the active generation, and require an explicit update command for an intentional replacement that invalidates and rebakes every dependent artifact.
- **Acceptance:** Replacing one byte causes reuse to fail and runtime to quarantine the asset, while an explicit update produces a new generation with no old dependent golden.
- **Source:** docs/subsystems/golden-baking-fixtures.md — gap 3 "Reuse can silently redefine corpus identity"

### REQ-FIX-10 — Expose non-collapsing raw+canonical golden fields for three-way verdicts
- **Priority:** P1
- **Depends on:** REQ-CORE-01
- **Current:** `OracleOutcome.pass` is boolean and `ResultStatus` has no DIFF, and current producers reduce views to scalar fields (`src/core/scenario.ts:206-221`).
- **Problem:** Goldens cannot support PASS/DIFF/FAIL if they pre-collapse semantic versus representation equality.
- **Change:** Have the bake expose enough raw and canonical fields for the oracle to distinguish semantic equality from representation equality without pre-collapsing them, and never encode "different from this ffmpeg build" as proof of wrongness. (Umbrella over REQ-FIX-01/02/03.)
- **Acceptance:** One conformance test per class holds — exact/canonical equality→PASS, valid alternative codec tag/framing/packet grouping/timing→DIFF, corrupt/content-losing/timing-invalid/undecodable→FAIL.
- **Source:** docs/subsystems/golden-baking-fixtures.md — Target design "Three-way verdict boundary"

### REQ-FIX-11 — Return typed golden evidence states instead of string inference
- **Priority:** P1
- **Depends on:** REQ-CORE-04
- **Current:** `loadGolden()` maps HTTP, network, and parse failures alike to undefined, and the runner recognizes evidence gaps through human-readable detail substrings (`src/core/oracles.ts:108-115`, `src/core/runner.ts:858-900`).
- **Problem:** A server error, corrupt JSON, absent artifact, and pending bake are observationally similar, and wording changes alter status routing.
- **Change:** Return a typed evidence state per kind (`ready`, `absent-expected`, `pending`, `digest-mismatch`, `schema-invalid`, `transport-error`, `producer-failed`) each with provenance, routing only evidence-unavailable states to NA_ASSET, keeping transport/harness failures ERROR, and never grading a candidate against invalid evidence.
- **Acceptance:** Table-driven loader/runner tests assert the exact state and cell status for 404, 500, parse error, schema error, digest mismatch, pending frame, and valid evidence without inspecting detail text.
- **Source:** docs/subsystems/golden-baking-fixtures.md — gap 9 "Missing, malformed, and stale evidence are inferred from strings"

## Reporting & aggregation

### REQ-REP-01 — Persist and render a three-way PASS/DIFF/FAIL oracle verdict
- **Priority:** P0
- **Depends on:** REQ-CORE-01
- **Current:** The persisted status union and `OracleOutcome` are binary and only a top-level PASS carries benchmark data (`src/core/scenario.ts:206-221`, `src/core/runner.ts:1411-1463`).
- **Problem:** A legal representation-only difference is reported as FAIL or disappears into PASS, losing its diagnostic meaning.
- **Change:** Persist and render PASS/DIFF/FAIL where DIFF is valid-but-representationally-different, separately counted and benchmark-eligible, consumed from the oracle system and never inferred from packet sizes/codec spellings.
- **Acceptance:** A legal representation-only fixture appears as DIFF in raw JSON, report JSON, Markdown, UI, denominators, and ranking eligibility.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Orthogonal execution, oracle, and coverage states"

### REQ-REP-02 — Model orthogonal execution/oracle/coverage states with an order-independent reduction
- **Priority:** P0
- **Depends on:** REQ-CORE-01, REQ-CORE-02
- **Current:** Applicability, execution health, correctness, and multi-file coverage are forced into one overloaded status routed by ad hoc rules (`src/core/runner.ts:1382-1468`, `src/core/scenario.ts:206-221`).
- **Problem:** A single overloaded status cannot express valid-but-different, partial coverage, or applicability without erasing an axis.
- **Change:** Persist each variant as `{execution: EXECUTED|NA_ENGINE|NA_BROWSER|NA_ASSET|ERROR|SKIPPED, verdict?: PASS|DIFF|FAIL, reasonCode, reason}` and reduce a cell by the documented order-independent table (not-run → SKIPPED → all-`NA_*` with subtype counts → FAIL → ERROR → `Partial(valid/total)` → DIFF → PASS), always exposing exact per-state counts and per-variant identities.
- **Acceptance:** The machine report exposes exact PASS/DIFF/FAIL/ERROR/NA_ENGINE/NA_BROWSER/NA_ASSET/SKIPPED/not-run counts plus identities; a compact table may show `N/A` but details/JSON retain the subtype; reordering variants never changes the reduced cell.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Orthogonal execution, oracle, and coverage states"

### REQ-REP-03 — Grade mixed exhaustive cells as Partial and retain per-file evidence in the projection
- **Priority:** P0
- **Depends on:** REQ-CORE-01, REQ-RUN-05
- **Current:** Any per-file FAIL/ERROR replaces the top-level cell and the projection keeps only file/baked/status/optional hash (`src/core/runner.ts:1135-1189`, `src/core/report.ts:544-555`).
- **Problem:** "01 passes, 02/03 fail" loses its passing evidence and reads as a harness error rather than a partial-coverage gradient.
- **Change:** Render `Partial (valid/total)` with all variant identities, retain per-file reasons/hashes/oracle verdicts/measurements in the projection, rank partial below greater valid coverage, and never collapse mixed outcomes to ERROR.
- **Acceptance:** The mandatory 1/3 fixture renders `Partial (1/3)` (never ERROR) with both failing names and all original evidence in raw JSON, report JSON, and Markdown; a 2/3 engine outranks it and a 3/3 engine outranks both regardless of speed.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Orthogonal execution…" / gap "Mixed exhaustive outcomes collapse"

### REQ-REP-04 — Publish explicit numerators, denominators, and correctness/exact-match/diff-rate formulas
- **Priority:** P0
- **Depends on:** REQ-CORE-01
- **Current:** Conformance is `PASS/(PASS+FAIL+ERROR)` with zero admissible cells rendered as numeric `0%`, and empty summaries carry numeric zero (`src/core/report.ts:784-838`, `src/core/bench.ts:127-150`).
- **Problem:** ERROR contaminates the oracle-correctness denominator and a `0%` misrepresents unavailable data.
- **Change:** Publish per cohort/engine `expected`, `observed`, `executed`, `oracleEvaluable`, `valid`(PASS+DIFF with exact PASS and DIFF), `failed`, `errors`, each `NA_*`, `skipped`, `notRun`; define correctness as `valid/(PASS+DIFF+FAIL)`, exact-match as `PASS/(PASS+DIFF+FAIL)`, diff-rate as `DIFF/(PASS+DIFF+FAIL)` (never ERROR in an oracle denominator); a zero denominator is `null` in JSON and `—` in Markdown, never `0%`.
- **Acceptance:** All listed counts appear per cohort/engine; correctness/exact-match/diff-rate use the defined denominators; a zero denominator renders unavailable rather than numeric zero.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Explicit denominators and score semantics"

### REQ-REP-05 — Enforce a normalized cohort comparability gate before any cross-engine comparison
- **Priority:** P0
- **Depends on:** none
- **Current:** The report emits a same-browser caveat but the input validator does not verify browser build, host, corpus, sample plan, or scenario definition before ranking (`src/core/report.ts:286-320`).
- **Problem:** Runs differing in host/config/corpus/metric protocol are pooled and ordered as if comparable.
- **Change:** Build a normalized `cohortId` and require all members to agree on suite/semantics, browser/runtime, host, inputs, run selection, engine record, and metric-protocol dimensions before any cross-engine comparison; if any required dimension differs or is absent, split into separate cohorts and label `not comparable`, never silently pooling.
- **Acceptance:** Mutating one dimension at a time (browser build, corpus hash, scenario hash, engine config, warmup/iteration plan, primary unit) splits or rejects the records before winner computation; shuffling files/result order does not change cohort membership.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Comparability acceptance gate"

### REQ-REP-06 — Replace BenchSummary with a discriminated available/unavailable MetricObservation
- **Priority:** P0
- **Depends on:** none
- **Current:** Empty finite input becomes `n:0` with zero median/p95/MAD and winner selection checks object/value presence rather than `n` (`src/core/bench.ts:127-150`, `src/core/report.ts:725-742`).
- **Problem:** Missing observations are shaped like measured zeros and can be selected, tied, or injected.
- **Change:** Model each metric as a discriminated `UNAVAILABLE` (reasonCode, no statistics) or `AVAILABLE` (n≥1, finite samples/statistics, sample axis, aggregation) observation; `n=0` is `UNAVAILABLE` and cannot rank; never serialize NaN or infinity in JSON.
- **Acceptance:** An `n=0` observation serializes without statistics and cannot be selected, tied, indexed, or injected as zero; JSON never contains NaN/infinity.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Rankable metrics and honest uncertainty"

### REQ-REP-07 — Enforce a calibrated minimum sample plan and an uncertainty tie rule
- **Priority:** P0
- **Depends on:** REQ-REP-06
- **Current:** Defaults are one measured iteration and a fixed 3% band that ignores `n` and MAD (`src/core/bench.ts:16-28`, `src/core/report.ts:696-708`).
- **Problem:** Insufficient samples still yield claimed sole winners.
- **Change:** Record and enforce a versioned `minRankSamples` (project minimum three finite observations) so `n=1` may display but cannot win; treat contenders as tied/unresolved within the larger of the 3% floor and the recorded empirical noise band, or when the confidence interval includes no difference; publish the rule and interval.
- **Acceptance:** `n=1` and overlapping-uncertainty fixtures produce no sole winner; the report prints `n`, MAD, band, and interval.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Rankable metrics…" / gap "Winner confidence is under-specified"

### REQ-REP-08 — Rank by valid coverage first and admit DIFF and partial-coverage contenders
- **Priority:** P0
- **Depends on:** REQ-CORE-01, REQ-REP-03
- **Current:** Winners are chosen only among top-level PASS results, ordered by `coverage.passed` then the primary metric, and the metric chooser can accept the first metric present in any eligible result (`src/core/report.ts:609-742`).
- **Problem:** Valid DIFF and mixed-but-partially-passing results are excluded, and a subset-only metric can rank incomparable contenders.
- **Change:** Rank in order: pass the comparability gate, then rank by valid coverage (`PASS+DIFF`) over the same expected file set (full outranks partial, larger valid numerator outranks smaller), then apply a primary metric only when contenders share metric/unit/direction/aggregation/sample-axis and exact valid-file identity set, then require `minRankSamples`, then apply the tie rule.
- **Acceptance:** `n=0`, `n=1`, unequal units, unequal file sets, and near-noise contenders never produce a claimed sole winner; a valid DIFF and a partial-coverage result are rankable, with full coverage outranking partial.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Rankable metrics and honest uncertainty"

### REQ-REP-09 — Make report.json a lossless normalized evidence artifact
- **Priority:** P0
- **Depends on:** REQ-REP-14
- **Current:** `ReportJson` is a lossy projection that drops most oracle, exhaustive, and metric evidence (`src/core/report.ts:52-103`).
- **Problem:** A report cannot be independently audited or safely re-imported.
- **Change:** Make `report.json` preserve per-variant reasons/hashes, oracle verdicts and measurements, full metric observations, environment/configuration, the expected-set definition, cohort decisions, and exclusion reasons, and derive Markdown and UI views from that validated model.
- **Acceptance:** A raw fixture round-trips through normalized report JSON without losing variant, oracle, metric, environment, or exclusion fields.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Versioned, lossless, deterministic artifacts"

### REQ-REP-10 — Unify report, live UI, aggregate, and analysis into one pure pipeline
- **Priority:** P0
- **Depends on:** REQ-REP-09
- **Current:** The live UI has a second winner implementation and compare/aggregate/goal26 each duplicate ranking, so the live race can disagree with the report (`src/app/ui.ts:550-589`, `scripts/goal26-analyze.mjs:7-55`).
- **Problem:** The same evidence yields different selected cells and winners across tools and before/after export.
- **Change:** Replace the independent implementations with one pure pipeline (validate → normalize → select cohort → deduplicate → reduce variants → summarize metrics → compute denominators → rank → render) where the live UI calls the same cell reducer, metric selector, tie logic, and formatter, and compare/aggregate/analyses become thin commands over the same normalized model.
- **Acceptance:** One fixture through every entry point yields identical status counts, partial grades, eligibility, winners, and reasons; incremental UI snapshots and offline reports agree after every completed row, including ties and higher-is-better metrics.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "One ingestion, aggregation, ranking, and rendering core"

### REQ-REP-11 — Route NotApplicableError to NA_ENGINE outside the correctness denominator; keep SKIPPED visible
- **Priority:** P1
- **Depends on:** REQ-CORE-02, REQ-CORE-03
- **Current:** Runtime `NotApplicableError` maps to `NA_ENGINE` only for adapters that throw it, disabled cells become `SKIPPED`, and a coarse gate can leak unsupported tuples into FAIL/ERROR (`src/core/runner.ts:1382-1393,1928-1957`).
- **Problem:** Unsupported tuples inflate failure counts and disabled policy debt is indistinguishable from applicability.
- **Change:** Report `NotApplicableError`-derived `NA_ENGINE` separately, exclude it from correctness, include it in expected coverage, keep it from inflating FAIL/ERROR, and surface disabled `SKIPPED` as visible policy debt.
- **Acceptance:** Adapter tuple tests yield `NA_ENGINE`; scorecard FAIL/ERROR counts do not change; the disabled-cell count shrinks without hiding missing cells.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Orthogonal execution…" / gap "Runtime unsupported tuples can contaminate failure counts"

### REQ-REP-12 — Derive the expected matrix first and rank only over the common expected set
- **Priority:** P1
- **Depends on:** REQ-REP-04
- **Current:** Aggregate totals count only observed cells and merge all `NA_*`+`SKIPPED`, and rankings use whatever cells exist (`scripts/aggregate.mjs:188-208`, `src/core/report.ts:609-676`).
- **Problem:** Missing cells vanish from the denominator and unequal engine coverage is presented as one apples-to-apples rank.
- **Change:** Derive the expected engine×scenario×browser matrix (and expected input variants) first, report not-run and each `NA_*`/`SKIPPED` separately, and rank overall only over the intersection of the expected scenario set for the selected cohort while optionally publishing broader per-engine coverage alongside.
- **Acceptance:** Removing one expected cell lowers expected coverage and adds one not-run without changing the correctness denominator; unequal observed sets are never presented as one apples-to-apples rank.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Explicit denominators…" / gap "Aggregate denominators omit missing cells"

### REQ-REP-13 — Record metric sample axis, raw components, and aggregation policy
- **Priority:** P1
- **Depends on:** REQ-REP-06
- **Current:** One summary shape represents both iteration samples and per-file medians, and exhaustive rate aggregation is median-of-rates (`src/core/bench.ts:194-227`).
- **Problem:** A distribution across files is conflated with a distribution across iterations and total throughput is unrecoverable.
- **Change:** Persist the sample axis (`iteration` vs `file`), raw work and wall-time numerators/denominators, and the aggregation rule; use ratio-of-sums for total throughput while keeping median per-file rate as a separate distribution, and keep cost sums/peak maxima over the identical file-identity set.
- **Acceptance:** Schema tests distinguish iteration vs file samples; a two-file rate fixture verifies ratio-of-sums and retains the per-file distribution.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Rankable metrics…" / gap "Sample axes and aggregation are ambiguous"

### REQ-REP-14 — Define versioned JSON schemas and validate artifacts at their boundaries
- **Priority:** P1
- **Depends on:** none
- **Current:** `ReportJson` has no schema id or version, and raw/launcher downloads only carry a string tag with no machine-readable schema validation (`src/core/report.ts:233-249`, `src/app/main.ts:393-405`).
- **Problem:** Consumers guess payloads from "array or `results`" and unknown versions are parsed blindly.
- **Change:** Define separate versioned schemas (raw runs, normalized observations, reports, bundle measurements), each declaring the JSON Schema 2020-12 dialect and canonical `$id` with a semantic version distinct from `suiteVersion`; validate at every writer/reader boundary, reject or quarantine an unknown major, and permit a known major's additive minor fields only after validation.
- **Acceptance:** An unknown major version is rejected/quarantined; a known-major additive-minor field validates; suite version, scenario-definition hash, and data-schema version remain separate.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Versioned, lossless, deterministic artifacts" / gap "Report JSON is lossy and unversioned"

### REQ-REP-15 — Normalize and canonically hash report data with a volatile envelope isolated
- **Priority:** P1
- **Depends on:** REQ-REP-09
- **Current:** Scenario order is first-seen, duplicate cells are last-write-wins, and generation time defaults to now (`src/core/report.ts:298-347,496-503`).
- **Problem:** Reordering inputs changes the output file, hash, and winners.
- **Change:** Normalize before serialization by sorting engines/browsers/scenarios/variants/metrics/reasons/map-keys by documented stable keys, remove input-order overwrite, normalize finite numbers, escape Markdown cells (pipes/line breaks), isolate volatile envelope fields such as `generatedAtIso`, and compute a `contentHash` over the RFC 8785 canonical form.
- **Acceptance:** The same normalized inputs plus explicit timestamp produce byte-identical JSON and Markdown; random permutations produce the same content hash; changing one substantive observation changes the hash; a generated timestamp alone changes only the envelope.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Versioned, lossless, deterministic artifacts" / gap "Output depends on order and wall clock"

### REQ-REP-16 — Deduplicate on canonical identity with an explicit latest policy
- **Priority:** P1
- **Depends on:** REQ-REP-10
- **Current:** Compare uses lexical-order overwrite, aggregate uses timestamp/filename freshness, and goal analysis truncates engine ids at `@`, colliding browser/version observations (`scripts/compare.mjs:59-97`, `scripts/aggregate.mjs:105-130`, `scripts/goal26-analyze.mjs:16-55`).
- **Problem:** The same evidence produces different selected cells and winners depending on filenames.
- **Change:** Deduplicate using a stable `runId`, per-cell `observationId`, and canonical content hash so identical duplicates coalesce and conflicting same-identity duplicates are an error; make any `--latest` policy choose by validated observation timestamp then content hash (reporting the discarded record), and never silently shorten versioned engine ids or pool browsers.
- **Acceptance:** Golden fixtures through every command yield identical selected observations, counts, partial grades, and winners; conflicting same-identity duplicates error; a `--latest` run reports the discarded record.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "One ingestion…core"

### REQ-REP-17 — Publish a provenance-safe versioned bundle-measurement artifact
- **Priority:** P1
- **Depends on:** REQ-REP-05
- **Current:** The scored input is a flat `engineId -> kB` map, missing entries keep a rankable empty zero, and the detail file is disconnected with no schema/toolchain/hash provenance (`scripts/measure-bundles.mjs:257-293`, `scripts/compare.mjs:145-201`).
- **Problem:** Incomparable or missing measurements are pooled and ranked as if valid.
- **Change:** Replace the flat map with a versioned artifact carrying per engine the exact id/version, source/import entry + content hash, bundler/runtime name+version, target, tree-shake/minify flags, byte unit, compression algorithm/options, raw and compressed bytes, included files, excluded runtime assets, and a typed `MEASURED`/`UNAVAILABLE` state; validate joins, record the joined artifact hash, refuse stale source/toolchain mismatches, treat missing/failed as unavailable (never zero), and make bundle size its own build-toolchain cohort showing exclusions.
- **Acceptance:** A valid finite measurement, a legitimate measured zero, a missing entry, a failed build, an ambiguous alias, a stale source hash, and a changed bundler version each behave correctly — only valid comparable measurements rank and every other case is visible with its exact reason.
- **Source:** docs/subsystems/reporting-aggregation.md — Target "Provenance-safe bundle measurements"

### REQ-REP-18 — Render the exact ranked value and its aggregation label in Markdown
- **Priority:** P1
- **Depends on:** REQ-REP-09
- **Current:** Primary medians are projected but the headline table calls the wall-time formatter, and exhaustive winners may use `aggregate` (`src/core/report.ts:568-594,1079-1111`).
- **Problem:** Markdown shows execution wall time instead of the value that actually ranked the engine.
- **Change:** Render the exact ranked value with its aggregation label, unit, coverage, `n`, and eligibility reason from the normalized model, keeping wall time as a separate diagnostic column.
- **Acceptance:** For an exhaustive non-wall primary metric, the Markdown value equals `winnerValue` and wall time remains a separate diagnostic column.
- **Source:** docs/subsystems/reporting-aggregation.md — gap "Markdown headline does not show its ranking value"

## App / UI

### REQ-UI-01 — Render PASS, DIFF, and FAIL as distinct verdicts across the UI
- **Priority:** P0
- **Depends on:** REQ-CORE-01, REQ-REP-01
- **Current:** `OracleOutcome` is boolean, `ResultStatus` has no DIFF, and the matrix has only binary correctness rendering (`src/core/scenario.ts:208-221`, `src/core/format.ts:104-120`).
- **Problem:** A valid DIFF is shown as FAIL, hiding its diagnostic nature.
- **Change:** Render PASS/DIFF/FAIL separately in cell, summary, detail, export, and legend, giving DIFF its own count, legend entry, visual treatment, and accessible label, never coloring/announcing/summarizing it as FAIL.
- **Acceptance:** A snapshot/accessibility test of one verdict of each type shows DIFF with its own count/details and no FAIL token in its accessible name; DIFF details identify the representation difference while FAIL details identify a true violation.
- **Source:** docs/subsystems/app-ui.md — Target "Verdict, applicability, metrics, and coverage presentation" / gap 3

### REQ-UI-02 — Present partial coverage as a first-class grade with failing files
- **Priority:** P0
- **Depends on:** REQ-RUN-05, REQ-REP-03
- **Current:** Any per-file FAIL/ERROR makes the aggregate FAIL/ERROR and the matrix renders only that marker plus a title tooltip (`src/core/runner.ts:1135-1179`, `src/app/ui.ts:516-518`).
- **Problem:** "Passes 01, fails 02/03" loses its robustness value and reads as a harness ERROR, with the denominator and failing filenames hidden.
- **Change:** Show partial coverage as its own grade (`Partial 1/3`) listing failing files with individual verdict/reason, preserving all per-file metrics and hashes and contributing one passed file over a denominator of three, never becoming ERROR merely because the aggregate is mixed.
- **Acceptance:** A 1/3 fixture renders `Partial 1/3`, lists files 02/03 with statuses/reasons without hover, shows a partial summary count, and carries no ERROR classification.
- **Source:** docs/subsystems/app-ui.md — Target "Verdict, applicability…" / gap 5

### REQ-UI-03 — Preserve streamed results on failure and reset error state each run
- **Priority:** P0
- **Depends on:** none
- **Current:** The failure catch sets `__SUITE_ERROR__`, then `finally` overwrites the live `__RESULTS__` with the still-empty local array, and new-run init does not clear the error (`src/app/main.ts:269-270,338-357`).
- **Problem:** Partial evidence disappears from manual/launcher export and a later successful run is still reported as failed.
- **Change:** Keep a run-scoped immutable result accumulator preserved on every terminal state, reset error state at run start, and announce terminal status through a polite `role="status"` region without forcing focus.
- **Acceptance:** Throwing after several streamed cells still exports those cells with `completionState: failed`, and a subsequent successful run retains no prior error or partial reason.
- **Source:** docs/subsystems/app-ui.md — Target "Progress, cancellation, and recovery" / gap 11

### REQ-UI-04 — Default manual boot to idle and reject empty engine or scenario selection
- **Priority:** P1
- **Depends on:** none
- **Current:** The page auto-runs unless `autorun` is explicitly false, all choices default checked, and empty filter arrays become "all" (`src/app/main.ts:159-164,272-288`).
- **Problem:** Accidental full-matrix runs start on load and empty selections silently expand to everything.
- **Change:** Default manual boot to an `idle` state that runs only after explicit manual activation or an explicit automation call, and make an empty engine or scenario selection a validation error (not "all") that identifies the fieldset and announces one concise message per WCAG 2.2 status messages without moving focus.
- **Acceptance:** Loading the manual URL without query parameters makes zero runner calls; clearing either required checklist and activating Run yields zero cells plus one accessible error; the launcher still starts through `window.__SUITE__.run()`.
- **Source:** docs/subsystems/app-ui.md — Target "Run configuration and state model" / gap 1

### REQ-UI-05 — Validate control bounds, preserve warmup zero, and freeze the active configuration
- **Priority:** P1
- **Depends on:** none
- **Current:** `Number(value) || 1` turns warmup `0` into `1`, out-of-range values are not rejected, and only cache/download controls are disabled during a run (`src/app/main.ts:229-240,263-269`).
- **Problem:** Executed timing silently differs from the entered value and mid-run edits appear to affect the running configuration.
- **Change:** Validate native control values and preserve a valid warmup `0`, check iteration/warmup bounds before execution, and freeze and display an immutable active configuration so edits during a run are disabled or clearly marked "applies to next run."
- **Acceptance:** Boundary values round-trip (warmup `0` stays `0`) and mutating every control after start leaves the exported configuration and active labels identical to the start snapshot.
- **Source:** docs/subsystems/app-ui.md — Target "Run configuration and state model" / gap 2

### REQ-UI-06 — Keep NA_ENGINE, NA_BROWSER, NA_ASSET, SKIPPED, and ERROR visually distinct
- **Priority:** P1
- **Depends on:** REQ-CORE-02, REQ-CORE-03
- **Current:** `visibleResult()`, the run summary, scoreboard, and legend fold the three NA statuses into a generic `N/A` and the legend describes only capability/codec absence (`src/core/format.ts:104-117`, `src/app/ui.ts:385-401`, `index.html:954-959`).
- **Problem:** Applicability causes and SKIPPED policy are invisible without opening raw JSON.
- **Change:** Keep `NA_ENGINE`/`NA_BROWSER`/`NA_ASSET`/`SKIPPED`/`ERROR` distinct everywhere with a concise keyboard-accessible reason, and make `NA_ENGINE` detail say whether a declared capability token or a runtime `NotApplicableError` rejected the combination, with NA available per subtype and only optionally as an aggregate that never replaces the subtype.
- **Acceptance:** Feeding one of each status yields unique visible/accessibility text, counters, filters, and legend definitions with unchanged machine values; neither NA_ENGINE route appears as ERROR.
- **Source:** docs/subsystems/app-ui.md — Target "Verdict, applicability…" / gap 4

### REQ-UI-07 — Render missing or pending metrics as labelled non-numeric states
- **Priority:** P1
- **Depends on:** REQ-REP-06
- **Current:** Race/rate counters and empty summaries can surface as `0`, and only PASS timing avoids a fabricated zero (`src/app/ui.ts:605-621`, `src/core/format.ts:104-119`).
- **Problem:** Null, gated, pending, or inapplicable metrics are indistinguishable from a real zero measurement.
- **Change:** Render a missing metric as "not measured" or "not available" and a pending winner/rate field as "pending," never `0`, so every numeric metric in the DOM traces to an actual finite measurement.
- **Acceptance:** Every DOM numeric metric traces to a finite measurement; null/undefined/gated/pending/inapplicable values use labelled nonnumeric states.
- **Source:** docs/subsystems/app-ui.md — Target "Verdict, applicability, metrics, and coverage presentation"

### REQ-UI-08 — Build, surface, and export an immutable run manifest
- **Priority:** P1
- **Depends on:** REQ-UI-05
- **Current:** Per-result `env` and `selection` fields exist but only in JSON, and manual export omits filter/seed/completion/registration provenance (`src/core/scenario.ts:269-329`, `src/app/main.ts:393-405`).
- **Problem:** A run cannot be uniformly replayed or audited from the UI, and partial/empty payloads resemble complete runs.
- **Change:** Build a visible and exported immutable manifest (schema/status-model version, run id, start/end time, completion state, suite/build revision, engine instance ids/configs, browser/build+operator tag, user agent, GPU, capability snapshot, scenario/oracle-definition digest, filters, warmup/iterations, execution-order digest, seed, media mode, corpus checksum, selected files+hashes, cache policy/hits, registration failures) and surface those fields in the UI rather than leaving them only in JSON.
- **Acceptance:** The manifest is visible and exported with all listed fields; current per-result `env`/`selection` values are surfaced in the UI.
- **Source:** docs/subsystems/app-ui.md — Target "Reproducibility and cache contract"

### REQ-UI-09 — Derive the cache key from the full manifest and version all cached statuses
- **Priority:** P1
- **Depends on:** REQ-SEL-07
- **Current:** The cache key covers only browser label, engine id, and scenario/input tag, the validation epoch invalidates only PASS rows, and read/write failures are swallowed (`src/app/result-cache.ts:43-55`, `src/core/runner.ts:1960-1986`).
- **Problem:** Stale non-PASS results are reused after correctness-relevant changes and operators cannot tell when persistence failed.
- **Change:** Derive the cache key from the correctness- and measurement-relevant manifest (suite/status-schema, engine config, oracle/tolerance digest, browser build, timing protocol, input set), apply invalidation epochs to all statuses with explicit expiry for transient ERROR and runtime-dependent `NA_BROWSER`, show cache-hit provenance (source run id, creation time, original environment, epoch, why still valid), and make read/write/quota failures visible but non-fatal.
- **Acceptance:** Mutating each manifest component in isolation causes a miss and repeating the identical manifest produces an attributed hit; an old FAIL/ERROR/NA row is not immortal; injected open/read/write/quota failures announce a cache warning while live verdicts stay unaffected.
- **Source:** docs/subsystems/app-ui.md — Target "Reproducibility and cache contract" / gap 6

### REQ-UI-10 — Use a native progress element and a polite status live region
- **Priority:** P1
- **Depends on:** none
- **Current:** Progress is two unlabelled `div`s with CSS width and status/progress/counter/matrix updates have no live-region or progressbar semantics (`index.html:904-907`, `src/app/ui.ts:637-660`).
- **Problem:** The bar's numeric state is visual-only and lifecycle changes are not announced.
- **Change:** Use a labelled native `<progress>` (or equivalent `progressbar` with current/min/max), put coarse throttled run/cache/export updates in one persistent polite `role="status"` region, and render current cell/file as text, without making every cell an assertive live region.
- **Acceptance:** The accessibility tree exposes progress name/min/max/current values and a screen-reader smoke test receives bounded, nonduplicated lifecycle announcements.
- **Source:** docs/subsystems/app-ui.md — Target "Accessible structure, keyboard, focus, and live updates" / gap 8

### REQ-UI-11 — Give the matrix table caption, header scope, and focusable text details
- **Priority:** P1
- **Depends on:** none
- **Current:** Scenario labels are `<td>`, there is no caption or `scope`, reasons live only in `title` text, and the winner is a CSS class plus generated trophy (`src/app/ui.ts:297-318`, `index.html:503-513`).
- **Problem:** Programmatic header/data relationships and reasons/winner state are missing for assistive tech and zoomed layouts.
- **Change:** Add a table caption, `<th scope="col">` engine headers and `<th scope="row">` scenario headers, provide focusable text details for reason/oracle/coverage/winner (trophy decoration only), and make the horizontally scrollable wrapper keyboard reachable when overflow exists.
- **Acceptance:** Automated header-association plus keyboard and 200%-zoom tests can identify scenario, engine, verdict, reason, coverage, metric, cache state, and winner for any cell.
- **Source:** docs/subsystems/app-ui.md — Target "Accessible structure…" / gap 9

### REQ-UI-12 — Make all controls keyboard operable with meaningful focus order
- **Priority:** P1
- **Depends on:** none
- **Current:** There is no explicit focus transfer/restoration when validation, cancellation, completion, export, cache clearing, or fatal error changes page state (`src/app/ui.ts:297-318`, `src/app/main.ts:338-360`).
- **Problem:** Focus context is lost or trapped as state changes, breaking keyboard-only operation.
- **Change:** Keep all functionality keyboard operable, preserve focus order across state changes (do not move focus for routine progress, keep focus on Stop while stopping, return it to the run control after completion), and provide explicit "Jump to current cell/results" controls rather than forced focus.
- **Acceptance:** A keyboard-only test configures/starts a run, opens any cell detail, stops, exports, clears cache after confirmation, and returns to the starting control without a trap; scrolling/filtering/sorting never loses focus context.
- **Source:** docs/subsystems/app-ui.md — Target "Accessible structure, keyboard, focus, and live updates"

### REQ-UI-13 — Distinguish non-preemptible stop from cancelling and show inner progress
- **Priority:** P1
- **Depends on:** none
- **Current:** Abort is checked only between cells, Stop disables itself while the current cell finishes, and there is no inner exhaustive progress (`src/app/main.ts:210-218`, `src/core/runner.ts:1833-1838`).
- **Problem:** Non-preemptible cells look frozen and the operator cannot see per-file progress during cancellation.
- **Change:** Keep `AbortController` as the run-level carrier but have each cancellable layer observe its signal, distinguish "stop requested; current cell cannot be preempted" from "current cell cancelling," expose last-completed and current cell/file, show inner exhaustive progress, and adopt adapter/worker hard cancellation only where cleanup and result integrity are proven.
- **Acceptance:** Stop during short/long/exhaustive/cached/non-preemptible cells each announces its actual boundary and exports a coherent partial snapshot; a ten-file exhaustive cell exposes file-level progress or states it is non-preemptible.
- **Source:** docs/subsystems/app-ui.md — Target "Progress, cancellation, and recovery" / gap 10

### REQ-UI-14 — Reserve Resume for a validated checkpoint and keep partial results exportable
- **Priority:** P1
- **Depends on:** REQ-UI-08
- **Current:** An aborted run relabels the fresh-run action "Continue run," which relies on ordinary result reuse and is not a resumable-run state machine (`src/app/main.ts:338-360`).
- **Problem:** "Continue" overclaims recovery and may rerun or reuse stale cache instead of resuming.
- **Change:** Keep completed results downloadable after stop/failure, and use "Resume/Continue" only when the exact frozen manifest and completed-cell set are restored (otherwise label "Start new run," with a separate "Run remaining with cache" action), clearing stale error state at the start of a new run while the prior run remains a completed snapshot.
- **Acceptance:** Resume is offered only when run id, manifest digest, cache validation, and selected input hashes match; otherwise the action is labelled a new run, and a stopped/failed run is exportable and clearly marked.
- **Source:** docs/subsystems/app-ui.md — Target "Progress, cancellation, and recovery" / gap 10

### REQ-UI-15 — Unify manual and launcher export into one canonical versioned envelope
- **Priority:** P1
- **Depends on:** REQ-UI-08, REQ-REP-09
- **Current:** Manual export omits the active filter, run-level seed, Playwright version, completion/partial state, registration report, and report artifacts, and the launcher adds only some (`src/app/main.ts:393-405`, `scripts/launch.mjs:277-305`).
- **Problem:** An empty/partial payload can resemble a complete run and the two export paths are not uniformly validatable.
- **Change:** Have manual and launcher exports share one canonical versioned envelope (immutable run manifest, registration report, environment/support, results, cache-hit provenance, completion/partial reason, content digest) and offer raw results JSON plus the structured report JSON and Markdown, each labelled by schema and purpose.
- **Acceptance:** The same run downloaded manually and saved by Playwright validate against the same schema and differ only in explicitly optional launcher provenance; raw/report-JSON/Markdown share cell count, status/coverage facts, run id, corpus checksum, and completion state; a complete run cannot carry a stale `partialReason` or suite error.
- **Source:** docs/subsystems/app-ui.md — Target "Export and server boundary" / gap 13

### REQ-UI-16 — Disable /__save by default and default the dev server to loopback
- **Priority:** P1
- **Depends on:** none
- **Current:** Vite always configures `/__save`, accepts an unbounded POST body, and uses string-prefix containment, while the app/launcher persist via Blob download and Bun filesystem output (`vite.config.mjs:281-327`, `src/app/main.ts:484-492`).
- **Problem:** The endpoint exposes a filesystem write surface with sibling-prefix/path/body edge cases undefended.
- **Change:** Default the dev server to loopback and make LAN exposure explicit, and disable `/__save` unless an explicit local-orchestration mode enables it — then require opt-in, a non-guessable run token, a true descendant-path containment check, an extension allowlist, a bounded body, and no wildcard cross-origin write surface — keeping fixture Range and COOP/COEP behavior.
- **Acceptance:** Security tests reject disabled, unauthenticated, traversal, sibling-prefix, cross-origin, non-JSON, and oversized requests while the explicit local happy path writes only the allowlisted results file and normal fixture Range/isolated WASM requests still succeed.
- **Source:** docs/subsystems/app-ui.md — Target "Export and server boundary" / gap 16

### REQ-UI-17 — Expose seed entry/replay and the selected input variant, count, and SHA-256
- **Priority:** P2
- **Depends on:** REQ-UI-08
- **Current:** Manual runs expose no seed field (a time+`Math.random()` seed is generated) and there is no operator-facing display of the selected input variant (`src/app/main.ts:310-323`).
- **Problem:** Runs are not reproducible from the UI and the chosen media is invisible until raw JSON is inspected.
- **Change:** Let manual users enter, copy, and replay a seed, and after selection show the selected input variant(s), candidate count, and SHA-256 (keeping media catalog-controlled by media-selection, not an untracked local-file path).
- **Acceptance:** Warmup/iteration/browser tag/seed/reuse/exhaustive/filter values round-trip through a visible run-configuration summary and the export manifest; the UI shows the selected variant, candidate count, and SHA-256 after selection.
- **Source:** docs/subsystems/app-ui.md — Target "Run configuration and state model"

### REQ-UI-18 — Make cross-port cache origin and import provenance explicit
- **Priority:** P2
- **Depends on:** REQ-UI-09
- **Current:** The server port commonly changes, IndexedDB is origin-scoped, and the launcher reseeds current-origin storage from result files with no page validation epoch (`scripts/run.sh:104-136`, `scripts/launch.mjs:340-423`).
- **Problem:** Operators are misled that a persistent browser profile shares IndexedDB across ports, and seeded rows follow inconsistent epoch policy.
- **Change:** Make origin and import provenance explicit, use one validated import schema, never promise cross-port persistence, and show origin, storage availability/estimate, entry count, invalidated count, last error, and export/clear controls.
- **Acceptance:** Running on two ports with the same profile shows no native rows in the second origin until an explicit validated import, after which every status follows the same epoch policy.
- **Source:** docs/subsystems/app-ui.md — Target "Reproducibility and cache contract" / gap 7

### REQ-UI-19 — Render all matrix rows on one scrollable page
- **Priority:** P2
- **Depends on:** none
- **Current:** The complete filtered matrix is rendered as one semantic table inside a horizontally scrollable wrapper.
- **Preference:** Operators prefer continuous browser-page scrolling over row pagination, even for large selections.
- **Change:** Keep every matching scenario row in one table, retain the full result model/export, and expose total row/column counts and stable indexes per the ARIA table pattern.
- **Acceptance:** A 10,000-cell stress run renders every scenario row without pagination, produces and exports all cells, preserves logical indexes across filtering, and keeps pending/not-run/cached/resolved states distinguishable.
- **Source:** docs/subsystems/app-ui.md — Target "Single-page matrix rendering" / gap 12

### REQ-UI-20 — Give the CLI and UI one option schema and fix inert --headed/headless copy
- **Priority:** P2
- **Depends on:** none
- **Current:** Playwright is always headed, `--headed` is inert, serve copy says "headlessly," and only `launch.mjs` accepts seed/exhaustive flags (`scripts/launch.mjs:69-74`, `scripts/run.sh:57-76`, `scripts/serve.sh:65-67`).
- **Problem:** `run.sh` cannot forward seed/exhaustive and the headed/headless copy contradicts the implementation.
- **Change:** Establish one option schema and generated help across UI, `run.sh`, and `launch.mjs` for seed, exhaustive mode, reuse/fresh policy, filters, timing, timeout, and browser choice with one meaning; implement or remove `--headed`; and use one accurate term for browser mode.
- **Acceptance:** CLI conformance tests prove every documented option is accepted and forwarded exactly once, and help output contains no inert or contradictory headed/headless claim.
- **Source:** docs/subsystems/app-ui.md — Target "Export and server boundary" / gap 14

### REQ-UI-21 — Correct the reference-engine copy to an unscored reference instrument
- **Priority:** P2
- **Depends on:** none
- **Current:** Hero/about text says results are reported against a "reference engine," while registration/report contracts define platform as an unscored instrument with no live reference candidate (`index.html:763-765`, `src/core/registry.ts:7-12`, `src/core/report.ts:4-9`).
- **Problem:** Users misunderstand golden-based verdicts and think a scored reference engine exists.
- **Change:** Describe platform as an unscored browser reference instrument, distinguish golden comparison / reference decode / reference re-import, and link the oracle-system contract.
- **Acceptance:** UI copy and accessibility text contain no "reference engine" claim, and platform never appears as a scored picker, matrix column, or winner.
- **Source:** docs/subsystems/app-ui.md — gap 15 "Page copy misidentifies the reference instrument"

<!-- SECTIONS-ANCHOR -->
