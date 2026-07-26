# Application and browser UI

> Scope: This page owns the browser application shell, controls, live matrix, browser-side result cache and export, plus the launcher/server interface; runner semantics, report scoring, media selection, and engine behavior remain with their dedicated subsystem pages.
> Phase-2 owner: p2_subsystem_app_ui.

## Purpose

The application turns the registered [engine](../glossary.md) and [scenario](../glossary.md) sets into an operable browser benchmark: it exposes run configuration, streams each [cell](../glossary.md) into a live matrix, preserves browser-local results, and hands the same in-page control surface to the automated launcher. This is the operator-facing boundary where execution state, applicability, correctness, coverage, provenance, and export must remain distinguishable.

Readers implementing runner, [oracle](../glossary.md), reporting, media-selection, or adapter changes depend on this page for the presentation contract. The underlying behavior belongs to [runner and capability negotiation](../subsystems/runner-capability-negotiation.md), the [oracle system](../subsystems/oracle-system.md), [reporting and aggregation](../subsystems/reporting-aggregation.md), and [media selection](../subsystems/media-selection.md); this page specifies how their states are exposed without changing them.

## As-built

### Browser boot and registration visibility

`index.html` is the Vite-served shell and loads `/src/app/main.ts` as its only module entry. It declares an English-language document, responsive viewport, page title, static explanatory content, environment and control regions, a live summary, and the results host. [index.html:1-6](../../index.html#L1-L6) [index.html:759-816](../../index.html#L759-L816) [index.html:952-970](../../index.html#L952-L970)

Boot first probes environment and codec support, then defensively registers engines and scenario families, renders pickers, wires controls and the frame-bake control surface, exposes `window.__SUITE__`, and finally marks the page ready. A boot rejection writes `window.__SUITE_ERROR__`, attempts to put the message in `#run-status`, and logs the error. [src/app/main.ts:97-165](../../src/app/main.ts#L97-L165) [src/app/main.ts:494-505](../../src/app/main.ts#L494-L505)

Registration uses lazy imports and catches each engine or family independently. Seven engine wirings are attempted, including the platform instrument, and thirteen family modules are loaded; a failed module contributes a structured failure row instead of rejecting `registerAll()`. [src/app/register.ts:37-92](../../src/app/register.ts#L37-L92) [src/app/register.ts:100-147](../../src/app/register.ts#L100-L147) [src/app/register.ts:154-181](../../src/app/register.ts#L154-L181)

Only scored engines become enabled matrix choices. A failed engine registration appears as a disabled checkbox whose label includes the failure reason, failed scenario families appear only in the registration banner, and the banner always appends registered engine/scenario counts. The platform implementation remains resolvable as an unscored instrument and is excluded by `listScoredEngines()`. [src/app/main.ts:105-141](../../src/app/main.ts#L105-L141) [src/core/registry.ts:58-69](../../src/core/registry.ts#L58-L69)

The environment panel renders the detected browser/version, optional GPU, WebCodecs and WebGPU presence, alpha support, memory-measurement availability, user agent, and per-codec decode/encode pills. Feature probes are defensive: unavailable constructors and rejected `isConfigSupported()` calls resolve to false instead of aborting boot. [src/app/ui.ts:64-101](../../src/app/ui.ts#L64-L101) [src/core/feature-detect.ts:262-312](../../src/core/feature-detect.ts#L262-L312) [src/core/feature-detect.ts:319-350](../../src/core/feature-detect.ts#L319-L350)

Unless the query parameter is exactly `autorun=0` or `autorun=false`, a successfully booted manual page schedules a full UI-configured run immediately. The Playwright launcher deliberately opens `index.html?autorun=0` and starts through `window.__SUITE__.run()` instead. [src/app/main.ts:159-164](../../src/app/main.ts#L159-L164) [src/app/main.ts:205-208](../../src/app/main.ts#L205-L208) [scripts/launch.mjs:114-117](../../scripts/launch.mjs#L114-L117) [scripts/launch.mjs:201-218](../../scripts/launch.mjs#L201-L218)

### Controls, filters, and media choice

The page presents independent scrollable fieldsets for features, scenarios, engines, and options. The options are warmup, measured iterations, a browser label override, reuse, randomized cell order, and exhaustive media; reuse, randomization, and exhaustive mode are checked in the static markup. [index.html:818-872](../../index.html#L818-L872)

Feature groups are derived in canonical family order from the registered scenarios. Every feature and scenario starts checked, scenario labels are stable ids, scenario notes become `title` text, and failed engine choices remain disabled. Checklist getters read the enabled checked inputs when a run begins; the “All” actions only set all enabled inputs to checked and do not provide clear, invert, or tri-state behavior. [src/core/scenario.ts:131-142](../../src/core/scenario.ts#L131-L142) [src/app/main.ts:119-133](../../src/app/main.ts#L119-L133) [src/app/ui.ts:123-175](../../src/app/ui.ts#L123-L175)

The feature and scenario checklists do not dynamically constrain one another. At run start, explicit scenario ids are intersected with the selected feature families and optional operations. Empty engine, feature, or scenario arrays are normalized to `undefined`, which means “all” downstream; therefore manually unchecking every item does not request an empty run. [src/app/main.ts:229-251](../../src/app/main.ts#L229-L251) [src/app/main.ts:272-288](../../src/app/main.ts#L272-L288)

Numeric values are converted with `Number(value) || 1`. This makes a UI warmup value of `0` become `1` despite the input declaring `min="0"`; values outside the HTML min/max constraints are not explicitly rejected before the direct JavaScript run call. [src/app/main.ts:229-240](../../src/app/main.ts#L229-L240) [index.html:833-850](../../index.html#L833-L850)

There is no operator-selected file in the run filter. The UI supplies engine, feature, scenario, timing, reuse, ordering, and exhaustive flags; `runMatrix()` loads the scenario source catalog and chooses one seed-keyed input [variant](../glossary.md) per scenario, or every candidate in exhaustive mode, consistently across engines. [src/app/main.ts:229-251](../../src/app/main.ts#L229-L251) [src/core/runner.ts:1784-1803](../../src/core/runner.ts#L1784-L1803) [src/core/media-selection.ts:393-435](../../src/core/media-selection.ts#L393-L435)

Manual runs do not expose a seed field. `runFromFilter()` creates a seed from the current time and `Math.random()` when a caller does not provide one; the same seed drives cell shuffling and media selection and is recorded in result selection provenance when present. [src/app/main.ts:310-323](../../src/app/main.ts#L310-L323) [src/core/runner.ts:1827-1832](../../src/core/runner.ts#L1827-L1832) [src/core/runner.ts:2073-2089](../../src/core/runner.ts#L2073-L2089)

### Run lifecycle, progress, and cancellation

One `AbortController` identifies the active run. Starting clears the exposed completion flag and results, changes the primary button to “Stop,” disables download and cache controls, resolves the filter, constructs version-bearing display engine ids, computes the execution order, lays out the matrix, and calls `runMatrix()` with result and progress callbacks. Picker and timing controls remain editable while that immutable run configuration is executing. [src/app/main.ts:255-329](../../src/app/main.ts#L255-L329)

The matrix renderer constructs engine instance ids before execution so streamed versioned ids can map back to the columns. It normalizes each cell key by dropping the `@version` suffix; randomized order is generated by the same `buildExecutionOrder()` helper used by the runner. [src/app/main.ts:290-314](../../src/app/main.ts#L290-L314) [src/app/ui.ts:624-634](../../src/app/ui.ts#L624-L634) [src/core/runner.ts:428-439](../../src/core/runner.ts#L428-L439)

Each streamed result is appended to `MatrixView`, mirrored immediately to `window.__RESULTS__`, and persisted by the runner when reuse is enabled. Cell-level progress reports `done/total` only after a cell resolves; exhaustive work reports its file count only when the aggregate cell completes, not while individual files are running. [src/app/main.ts:317-336](../../src/app/main.ts#L317-L336) [src/core/runner.ts:2040-2057](../../src/core/runner.ts#L2040-L2057) [src/core/runner.ts:2116-2120](../../src/core/runner.ts#L2116-L2120) [src/app/ui.ts:639-651](../../src/app/ui.ts#L639-L651)

The matrix has no core “cell started” callback. Its running indicator is a best-effort inference: it marks the next entry in the precomputed execution order after each resolved result, then restores unresolved cells to a middle-dot placeholder when the run finishes. [src/app/ui.ts:227-238](../../src/app/ui.ts#L227-L238) [src/app/ui.ts:418-463](../../src/app/ui.ts#L418-L463)

Pressing Stop aborts the controller, disables the button, changes its text to “Stopping...,” and states “stopping after current cell…”. The runner checks the signal at the boundary before each matrix cell, so an in-flight cell is allowed to finish and dispose cleanly. [src/app/main.ts:167-174](../../src/app/main.ts#L167-L174) [src/app/main.ts:210-218](../../src/app/main.ts#L210-L218) [src/core/runner.ts:1833-1838](../../src/core/runner.ts#L1833-L1838)

On normal completion or cancellation, the UI hides progress, freezes the matrix, exposes results, enables download when at least one result exists, restores cache controls, and labels the run button “Continue run” after an abort or “Run selected features” otherwise. “Continue run” invokes a new filtered matrix; it relies on ordinary result reuse to avoid completed work and is not a dedicated resumable-run state machine. [src/app/main.ts:338-362](../../src/app/main.ts#L338-L362)

If `runMatrix()` rejects, the catch writes a failure message and `window.__SUITE_ERROR__`; because the local `results` variable remains its initial empty array, the `finally` block overwrites the live streamed `window.__RESULTS__` with that array and disables download. A new run clears `__RESULTS__` and `__RUN_DONE__` but does not clear a prior `__SUITE_ERROR__`. [src/app/main.ts:269-270](../../src/app/main.ts#L269-L270) [src/app/main.ts:338-357](../../src/app/main.ts#L338-L357)

### Matrix, statuses, metrics, and coverage

`MatrixView.start()` eagerly creates a native table with one row per scenario and one cell per selected engine. Column labels are `<th>` elements, but scenario labels are ordinary `<td class="scn">` cells; the table has no caption or explicit `scope` attributes. All rows and cells stay in the DOM for the run. [src/app/ui.ts:258-323](../../src/app/ui.ts#L258-L323)

The current result model contains [PASS](../glossary.md), [FAIL](../glossary.md), [NA_ENGINE](../glossary.md), [NA_BROWSER](../glossary.md), [NA_ASSET](../glossary.md), [ERROR](../glossary.md), and [SKIPPED](../glossary.md); current oracle outcomes carry a boolean `pass`. There is no [DIFF](../glossary.md) result or oracle verdict. [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221)

At execution time, the runner maps a runtime [NotApplicableError](../glossary.md) to `NA_ENGINE`; the app receives only the resulting status and reason, then renders the same generic `N/A` text as declaration-time non-support. [src/core/runner.ts:1388-1394](../../src/core/runner.ts#L1388-L1394) [src/app/ui.ts:516-518](../../src/app/ui.ts#L516-L518) [src/core/format.ts:104-117](../../src/core/format.ts#L104-L117)

For each resolved cell, the matrix renders `visibleResult(r)` and stores the detailed reason only in a `title` attribute on a non-focusable span. `visibleResult()` shows a timed PASS, raw FAIL/ERROR/SKIPPED, and collapses all three NA statuses to the same `N/A` text; the CSS class retains the internal status even when the visible text does not. [src/app/ui.ts:484-521](../../src/app/ui.ts#L484-L521) [src/core/format.ts:96-120](../../src/core/format.ts#L96-L120)

The run-status summary also folds `NA_ENGINE`, `NA_BROWSER`, and `NA_ASSET` into one `N/A` count. The live scoreboard groups the same three statuses, computes pass rate as `PASS / (PASS + FAIL + ERROR)`, excludes NA and SKIPPED, and shows an em dash rather than a percentage when no applicable cell has resolved. [src/app/main.ts:365-390](../../src/app/main.ts#L365-L390) [src/app/ui.ts:378-415](../../src/app/ui.ts#L378-L415)

A PASS cell shows the exhaustive aggregate wall time when present, otherwise median wall time, otherwise total cell duration. When a PASS has coverage over more than one file, the formatter appends `passed/total`; absent timing renders bare `PASS`, not a numeric zero. [src/core/format.ts:68-93](../../src/core/format.ts#L68-L93) [src/core/format.ts:104-119](../../src/core/format.ts#L104-L119)

Exhaustive execution already retains each file name, hash, baked flag, status, reason, and PASS-only bench summary, plus top-level `passed/admissible/total` coverage counters. It does not implement the target [partial coverage](../glossary.md#partial-coverage) grade: any per-file FAIL or ERROR makes the aggregate status FAIL or ERROR and the matrix then renders only that aggregate marker; its file names and denominator are available only through the result object and aggregate reason tooltip. [src/core/scenario.ts:294-329](../../src/core/scenario.ts#L294-L329) [src/core/runner.ts:1135-1179](../../src/core/runner.ts#L1135-L1179) [src/app/ui.ts:516-518](../../src/app/ui.ts#L516-L518)

The winner race waits until every selected engine has returned for a scenario, ignores non-PASS or untimed results, ranks by files passed and then execution time, adds a winner CSS class to the cell, and increments one win for the engine. Before a complete row exists, each engine's race counter displays `0`; winner state is conveyed visually by background, weight, and a CSS-generated trophy. [src/app/ui.ts:531-590](../../src/app/ui.ts#L531-L590) [src/app/ui.ts:605-621](../../src/app/ui.ts#L605-L621) [index.html:503-513](../../index.html#L503-L513)

The static legend describes `N/A` as capability/codec absence even though the collapsed value can also mean `NA_ASSET`, and it does not list SKIPPED. The page copy calls the platform path a “reference engine,” while the registry and report code define platform as an unscored instrument and explicitly state that there is no live reference candidate. [index.html:952-963](../../index.html#L952-L963) [index.html:763-765](../../index.html#L763-L765) [index.html:783-809](../../index.html#L783-L809) [src/core/registry.ts:7-12](../../src/core/registry.ts#L7-L12) [src/core/report.ts:4-9](../../src/core/report.ts#L4-L9)

### Browser cache and cache controls

The result cache is an IndexedDB database named `media-browser-test-results`, version 1, with one `results` object store keyed by a string. It is unavailable only when the global `indexedDB` name is absent; opening the database is lazy, and open/read/write errors reject the individual cache operation. [src/app/result-cache.ts:3-6](../../src/app/result-cache.ts#L3-L6) [src/app/result-cache.ts:57-72](../../src/app/result-cache.ts#L57-L72)

The physical key is `browser + NUL + engineId + NUL + scenarioId`. Before cache access, the runner extends the scenario portion with either the selected file tag or the ordered exhaustive candidate-set tags, which prevents reuse across different selected bytes. The file tag is `baked`, a SHA-256 prefix, or a real filename fallback. [src/app/result-cache.ts:43-45](../../src/app/result-cache.ts#L43-L45) [src/core/runner.ts:1960-1985](../../src/core/runner.ts#L1960-L1985) [src/core/media-selection.ts:438-443](../../src/core/media-selection.ts#L438-L443)

The cache key does not include suite version, scenario/oracle definition version, browser build, GPU, engine configuration, timing protocol, or a general run-manifest digest. A hard-coded validation epoch invalidates only PASS rows from another epoch, plus seven exact PASS keys; non-PASS rows bypass epoch invalidation. [src/app/result-cache.ts:6-15](../../src/app/result-cache.ts#L6-L15) [src/app/result-cache.ts:47-55](../../src/app/result-cache.ts#L47-L55)

Reuse defaults on in both the UI and programmatic path and applies to every stored status. A cache hit restores the real scenario id, prefixes or replaces the reason with cached provenance, disposes the newly constructed engine, and emits the cached cell like a live result; the matrix does not render a dedicated cached badge or timestamp. Cache read/write failures are deliberately swallowed by the runner. [src/app/main.ts:330-332](../../src/app/main.ts#L330-L332) [src/core/runner.ts:1981-2010](../../src/core/runner.ts#L1981-L2010) [src/core/runner.ts:2032-2036](../../src/core/runner.ts#L2032-L2036)

The page can export all stored entries, including whether each row is currently invalidated, and can clear the whole store or every exact/versioned `aibrush-media` engine id after a native confirmation. Cache controls are disabled during a run and when IndexedDB is absent. [src/app/main.ts:179-202](../../src/app/main.ts#L179-L202) [src/app/main.ts:407-445](../../src/app/main.ts#L407-L445) [src/app/main.ts:448-481](../../src/app/main.ts#L448-L481) [src/app/result-cache.ts:128-167](../../src/app/result-cache.ts#L128-L167)

IndexedDB is origin-scoped. `run.sh` normally selects a free, often changing port, while the launcher uses a persistent browser profile; the launcher therefore scans prior raw result files and seeds reusable statuses into the current origin's IndexedDB. Seeded rows omit the page cache's validation epoch, so page-side validation rejects seeded PASS rows but permits seeded non-PASS rows. [scripts/run.sh:104-136](../../scripts/run.sh#L104-L136) [scripts/launch.mjs:133-180](../../scripts/launch.mjs#L133-L180) [scripts/launch.mjs:340-423](../../scripts/launch.mjs#L340-L423) [src/app/result-cache.ts:47-50](../../src/app/result-cache.ts#L47-L50)

### Download, launcher, and serving interface

The manual Download action emits `media-browser-test/results@1` with generation time, current top-level environment/support, and the flat result array. Cache export emits `browser-cache-export@1` with current environment/support, cache counts, full entry wrappers, and a duplicate bare results array. Both paths serialize to a JSON Blob, activate a same-document download anchor, and revoke the Blob URL immediately afterward. [src/app/main.ts:393-405](../../src/app/main.ts#L393-L405) [src/app/main.ts:418-438](../../src/app/main.ts#L418-L438) [src/app/main.ts:484-492](../../src/app/main.ts#L484-L492)

The browser app does not build the repository's report artifact in this path. `buildReport()` separately accepts flat results and returns Markdown plus structured JSON with scorecards, caveats, corpus checksums, and rotation findings; the manual app export remains the raw runner envelope. [src/core/report.ts:39-48](../../src/core/report.ts#L39-L48) [src/core/report.ts:298-347](../../src/core/report.ts#L298-L347) [src/app/main.ts:393-405](../../src/app/main.ts#L393-L405)

`window.__SUITE__` exposes readiness, environment/support, registration details, complete registered ids, and a filtered `run()` method. The launcher waits for readiness or boot error, validates the browser-side inventory, optionally seeds cache, forwards engine/feature/operation/scenario/pillar/timing/seed/exhaustive filters, polls completion, and snapshots partial results every fifteen seconds. [src/app/main.ts:43-84](../../src/app/main.ts#L43-L84) [src/app/main.ts:147-157](../../src/app/main.ts#L147-L157) [scripts/launch.mjs:155-199](../../scripts/launch.mjs#L155-L199) [scripts/launch.mjs:220-255](../../scripts/launch.mjs#L220-L255)

Launcher output uses the same raw schema but adds the Playwright browser, exact Playwright version, pillar, and active filter. On timeout or page failure it attempts a partial save; final and partial files are written directly by the Bun process. [scripts/launch.mjs:277-318](../../scripts/launch.mjs#L277-L318)

The launcher always sets Playwright `headless: false`; its parsed `--headed` option does not alter launch configuration. `run.sh` still documents and forwards `--headed`, while `serve.sh` describes the driver as headless. `launch.mjs` accepts `--random-seed` and `--exhaustive`, but `run.sh` neither parses nor forwards those two options. [scripts/launch.mjs:34-50](../../scripts/launch.mjs#L34-L50) [scripts/launch.mjs:69-74](../../scripts/launch.mjs#L69-L74) [scripts/launch.mjs:119-137](../../scripts/launch.mjs#L119-L137) [scripts/run.sh:8-27](../../scripts/run.sh#L8-L27) [scripts/run.sh:57-76](../../scripts/run.sh#L57-L76) [scripts/serve.sh:65-67](../../scripts/serve.sh#L65-L67)

`run.sh` starts and verifies its own Vite server, refuses a foreign listener on a pinned port, runs requested browsers sequentially, saves raw results, and cleans up the server unless asked to keep it. [scripts/run.sh:118-147](../../scripts/run.sh#L118-L147) [scripts/run.sh:177-213](../../scripts/run.sh#L177-L213) [scripts/run.sh:230-244](../../scripts/run.sh#L230-L244)

The serving layer provides raw fixture bytes with Range support and no-store caching, serves ffmpeg.wasm runtime assets, and adds COOP/COEP headers for cross-origin isolation. A configured development-only `POST /__save?path=results/...` endpoint accepts a body and writes it after a normalized string-prefix containment check; the manual download and Playwright launcher use Blob download and direct filesystem output respectively. [vite.config.mjs:65-109](../../vite.config.mjs#L65-L109) [vite.config.mjs:112-160](../../vite.config.mjs#L112-L160) [vite.config.mjs:252-278](../../vite.config.mjs#L252-L278) [vite.config.mjs:281-327](../../vite.config.mjs#L281-L327)

### Accessibility and responsive behavior

The current shell uses native headings, sections, fieldsets, legends, labels, inputs, select, and buttons, and keeps text labels alongside result colors. It also disables decorative animations and transitions under `prefers-reduced-motion: reduce`. [index.html:779-879](../../index.html#L779-L879) [index.html:737-756](../../index.html#L737-L756)

The custom progress bar is two unlabelled `div` elements whose width is updated in CSS; it has no native `<progress>` semantics, `role="progressbar"`, or `aria-valuenow`. `#run-status`, `#progress-label`, the live counters, matrix cell updates, cache messages, and boot errors are not declared as live regions. [index.html:904-907](../../index.html#L904-L907) [src/app/ui.ts:637-660](../../src/app/ui.ts#L637-L660)

The result reason is available only as hover-oriented `title` text, the visual winner trophy is CSS-generated, and the table lacks row-header/caption semantics. There is no explicit focus transfer or restoration when validation, cancellation, completion, export, cache clearing, or fatal error changes the page state. [src/app/ui.ts:297-318](../../src/app/ui.ts#L297-L318) [src/app/ui.ts:516-518](../../src/app/ui.ts#L516-L518) [index.html:503-513](../../index.html#L503-L513) [src/app/main.ts:338-360](../../src/app/main.ts#L338-L360)

## Contracts and invariants

The following are present behavior, not target promises:

- **One orchestration path.** Manual activation and Playwright automation both enter `runFromFilter()`, so filtering, matrix setup, callbacks, cancellation, and final exposure share one implementation. Enforced by the UI and `window.__SUITE__` wiring. [src/app/main.ts:147-157](../../src/app/main.ts#L147-L157) [src/app/main.ts:228-255](../../src/app/main.ts#L228-L255)
- **One active run.** A second invocation while a controller is active requests cancellation and returns the currently exposed results rather than starting concurrent work. Enforced by `activeRunController`. [src/app/main.ts:95](../../src/app/main.ts#L95-L95) [src/app/main.ts:255-261](../../src/app/main.ts#L255-L261)
- **Scored visibility.** Instrument-only engines are never offered as scored columns; registration failures remain visible as disabled engine rows or banner text. Enforced at picker construction and registry filtering. [src/app/main.ts:105-141](../../src/app/main.ts#L105-L141) [src/core/registry.ts:63-69](../../src/core/registry.ts#L63-L69)
- **Filter intersection.** When non-empty filters exist, a scenario must satisfy requested id, family, and operation filters; empty arrays mean no restriction, not an empty matrix. Enforced before matrix layout and again in the runner. [src/app/main.ts:272-288](../../src/app/main.ts#L272-L288) [src/core/runner.ts:1746-1766](../../src/core/runner.ts#L1746-L1766)
- **Stable cell identity.** The drawn column uses the factory's instance id, while cell lookup strips the engine version at `@`. This assumes short engine names are unique within a run. Enforced only by `MatrixView.key()`; uniqueness is not validated in the UI. [src/app/main.ts:290-308](../../src/app/main.ts#L290-L308) [src/app/ui.ts:624-634](../../src/app/ui.ts#L624-L634)
- **Streaming observability.** Every runner result updates the in-memory matrix and `window.__RESULTS__` before the next cell; progress increments after resolution. Enforced through `onResult` and `onProgress`. [src/app/main.ts:317-329](../../src/app/main.ts#L317-L329) [src/core/runner.ts:2116-2120](../../src/core/runner.ts#L2116-L2120)
- **Cooperative cancellation.** Stop is observable only between cells. The UI must not claim that the current operation is preempted; its present “after current cell” text matches runner behavior. [src/app/main.ts:210-218](../../src/app/main.ts#L210-L218) [src/core/runner.ts:1833-1838](../../src/core/runner.ts#L1833-L1838)
- **Machine-readable status preservation.** Raw result and cache exports retain the current internal status even though visible cells and summaries collapse all NA variants. Enforced by serialization of `ScenarioResult[]`; not enforced by the presentation layer. [src/core/scenario.ts:269-318](../../src/core/scenario.ts#L269-L318) [src/app/main.ts:393-405](../../src/app/main.ts#L393-L405)
- **Correctness-gated timing.** The matrix derives visible execution time only from a PASS result's aggregate wall, median wall, or duration fallback; no fabricated zero is inserted when timing is absent. Enforced by `pickExecutionMs()` and `visibleResult()`. [src/core/format.ts:68-81](../../src/core/format.ts#L68-L81) [src/core/format.ts:104-119](../../src/core/format.ts#L104-L119)
- **Coverage-bearing exhaustive results.** Every exhaustive result can carry per-file status and `passed/admissible/total`; the UI currently consumes coverage only for PASS suffixes and winner selection. Enforced by runner aggregation and UI winner logic. [src/core/runner.ts:1135-1165](../../src/core/runner.ts#L1135-L1165) [src/app/ui.ts:572-589](../../src/app/ui.ts#L572-L589)
- **Byte-sensitive cache identity.** Selected input or exhaustive candidate-set tags extend the scenario cache key; changing the selected bytes changes the key. Enforced by runner key construction. [src/core/runner.ts:1960-1985](../../src/core/runner.ts#L1960-L1985)
- **Cache failure isolation.** Cache failures never fail a benchmark cell because runner cache reads and writes are caught. This also means the current UI receives no durable-cache failure signal. [src/core/runner.ts:1985-1986](../../src/core/runner.ts#L1985-L1986) [src/core/runner.ts:2116](../../src/core/runner.ts#L2116-L2116)
- **Download is a snapshot.** A manual result download contains whichever results are in `window.__RESULTS__` or the matrix at activation time, with the environment/support captured during the current boot. It is not the aggregated report contract. [src/app/main.ts:393-405](../../src/app/main.ts#L393-L405)
- **Launcher is not a meter.** Playwright launches the real browser and reads the page's in-browser results; it adds provenance and persists files but does not generate benchmark measurements. [scripts/launch.mjs:3-12](../../scripts/launch.mjs#L3-L12) [scripts/launch.mjs:277-305](../../scripts/launch.mjs#L277-L305)
- **Same-origin fixture delivery.** The supported server path supplies fixtures, workers, and WASM with Range and cross-origin-isolation headers required by the suite. Direct `file:` opening is not the implemented execution path despite prose suggesting a plain static host. [scripts/serve.sh:1-18](../../scripts/serve.sh#L1-L18) [vite.config.mjs:112-160](../../vite.config.mjs#L112-L160) [vite.config.mjs:252-278](../../vite.config.mjs#L252-L278)

## Target design and known gaps

### Target design

#### Run configuration and state model

The target UI must separate `idle`, `validating`, `running`, `stopping`, `completed`, `completed-partial`, and `failed` states. A run begins only after an explicit manual activation or an explicit automation call; query-driven automation may still opt in. Empty engine or scenario selection must be a validation error, not “all,” and the message must be programmatically exposed under [WCAG 2.2 status-message requirements](https://www.w3.org/TR/WCAG22/#status-messages). Warmup `0` must remain valid, iteration and warmup bounds must be checked before execution, and the exact configuration must be snapshotted so edits during a run are either disabled or clearly marked “applies to next run.”

Acceptance criteria:

1. Loading the manual URL reaches `idle` without running a cell; the launcher still starts through `window.__SUITE__.run()`.
2. Zero selected engines or scenarios leaves the runner untouched, identifies the relevant fieldset, keeps keyboard focus in a logical order, and announces one concise validation message.
3. Warmup `0`, iteration bounds, browser tag, random seed, reuse policy, exhaustive mode, feature/scenario filters, and operation/pillar filters round-trip through a visible run configuration summary and the export manifest.
4. Feature selection either filters the visible scenario checklist or exposes an unambiguous intersection count; “Select all,” “Clear all,” and mixed group state are keyboard operable.
5. Manual users can enter, copy, and replay a seed. Media files remain catalog-controlled by the [media-selection subsystem](../subsystems/media-selection.md); the UI shows the selected input variant(s), candidate count, and SHA-256 after selection rather than introducing an untracked local-file path.

#### Verdict, applicability, metrics, and coverage presentation

The target presentation must show the oracle's three-way [PASS](../glossary.md) / [DIFF](../glossary.md) / [FAIL](../glossary.md) verdict without conflation. DIFF means the candidate is valid but representationally different from the ffmpeg-baked [golden](../glossary.md); it must have its own count, legend entry, visual treatment, accessible label, and details. It must never be colored, announced, or summarized as FAIL. The matrix must mirror the target decision from [reporting and aggregation](../subsystems/reporting-aggregation.md) about whether a valid DIFF is performance-rankable, while still displaying any measured value separately from the verdict.

`NA_ENGINE`, `NA_BROWSER`, `NA_ASSET`, `SKIPPED`, and `ERROR` must remain visible as distinct statuses. `NA_ENGINE` detail must say whether the [capability gate](../glossary.md) rejected a declared token or a runtime `NotApplicableError` rejected the concrete combination; neither route may appear as ERROR. Each cell must expose a concise primary status plus a keyboard-accessible details control containing reason, oracle outcomes, metrics, cache source, selected file(s), and timestamps. Color may reinforce but never replace text. A missing metric must render “not measured” or “not available,” never `0`, and pending winner/rate fields must render “pending,” not a zero that resembles an observed measurement.

Partial coverage is a first-class grade. When file 01 passes and files 02/03 fail, the cell must show `Partial 1/3`, list `02` and `03` with their individual verdict/reason, preserve all per-file metrics and hashes, and contribute one passed file over a denominator of three. It must not become ERROR merely because the aggregate is mixed. The detailed representation and ranking must remain aligned with [robustness](../features/robustness.md), [runner and capability negotiation](../subsystems/runner-capability-negotiation.md), and [reporting and aggregation](../subsystems/reporting-aggregation.md).

Acceptance criteria:

1. A fixture containing one example of every target verdict/status produces separately queryable text in the cell, summary, legend, and JSON export.
2. DIFF details identify the representation difference and never use failure copy; FAIL details identify a true semantic or structural violation.
3. NA counts are available both per subtype and as an optional aggregate; the aggregate can never replace the subtype in cell text or accessible name.
4. A mixed three-file result displays its denominator and failing filenames without hover, has a partial counter, and is not included in ERROR.
5. Every numeric metric in the DOM traces to an actual finite measurement. Null, undefined, gated, pending, or inapplicable values use labelled nonnumeric states.

#### Reproducibility and cache contract

Every run must have a visible and exported immutable manifest: schema/status-model version, run id, start/end time, completion state, suite/build revision, selected engine instance ids and configurations, detected browser/build plus operator tag, user agent, GPU, capability snapshot, scenario/oracle-definition digest, filters, warmup/iterations, randomization and execution-order digest, seed, media mode, corpus checksum, selected files and hashes, cache policy/hits, and registration failures. Current per-result `env` and `selection` fields can supply part of this record; the UI must surface them instead of leaving them only in JSON.

The cache key must derive from the correctness- and measurement-relevant manifest, not only browser label, engine id, scenario id, and input tag. Invalidation epochs must apply to all statuses; transient ERROR and runtime-dependent `NA_BROWSER` need an explicit expiry or must default to fresh execution. A cache hit must show source run id, creation time, original environment, validation epoch, and why it remains valid. Cache write/read/quota failures must be visible but must not change a cell verdict.

IndexedDB transactions are the correct structured-storage primitive because the specification defines reads/writes through transactions with explicit scopes and modes ([Indexed Database API 3.0, Transactions](https://www.w3.org/TR/IndexedDB/#transactions)). Browser storage is nevertheless origin-scoped and best-effort by default; eviction and `QuotaExceededError` are normal platform conditions ([MDN, Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). The UI must therefore show origin, storage availability/estimate, entry count, invalidated count, last error, and export/clear controls, and must never describe the cache as the sole durable record.

Acceptance criteria:

1. Changing suite/status schema, engine configuration, oracle/tolerance digest, browser build, timing protocol, or input set causes a cache miss; repeating the identical manifest produces a visibly attributed hit.
2. An old FAIL/ERROR/NA row is not immortal: the exported cache policy states its validation/expiry rule and a forced-fresh action bypasses it.
3. A simulated database-open failure and `QuotaExceededError` leave execution intact, announce “cache unavailable,” and record the cache failure in the run manifest.
4. A run on a new port either explains that the origin has a separate cache or imports a provenance-checked cache bundle; it never silently implies that a persistent browser profile makes origins share IndexedDB. The same-origin separation is a browser security boundary ([MDN, Same-origin policy: cross-origin data storage access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy#cross-origin_data_storage_access)).

#### Accessible structure, keyboard, focus, and live updates

Retain native controls and reduced-motion support. All functionality, including filtering, details, cache management, cancel, export, and virtualized navigation, must remain keyboard operable under [WCAG 2.2 Keyboard](https://www.w3.org/TR/WCAG22/#keyboard). Focus order must preserve meaning when state changes ([W3C, Understanding Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)): do not move focus for routine progress, keep focus on the Stop control while stopping, return it to the run control after completion, and provide explicit “Jump to current cell/results” controls rather than forced focus.

Use a labelled native `<progress>` element or an equivalent `progressbar` with current/min/max values. The HTML Standard defines `value` as completed work and `max` as total work and recommends textual current/maximum fallback ([WHATWG HTML, The `progress` element](https://html.spec.whatwg.org/multipage/form-elements.html#the-progress-element)). Put coarse, throttled run/cache/export updates in a persistent `role="status"` region; WAI-ARIA defines `status` as a polite, atomic live region that should not receive focus merely because its content changes ([WAI-ARIA 1.2, `status` role](https://www.w3.org/TR/wai-aria-1.2/#status)). Do not make every cell an assertive live region.

The matrix must have a caption, `<th scope="col">` engine headers, and `<th scope="row">` scenario headers. W3C's table guidance requires programmatic header/data relationships and recommends a caption ([WAI Tables Tutorial](https://www.w3.org/WAI/tutorials/tables/)); the horizontally scrollable wrapper must itself be keyboard reachable when overflow exists. Reasons, oracle details, cached state, partial filenames, and winner state must be text reachable without hover; CSS-generated trophy content is decoration only.

Acceptance criteria:

1. Automated accessibility checks find no missing progress name/value, table caption/header association, form label, or status role.
2. A keyboard-only test configures and starts a run, opens any cell detail, stops, exports, clears cache after confirmation, and returns to the starting control without a trap.
3. Screen-reader smoke tests announce start, periodic `done of total`, stopping, completion/partial/failure, cache/export outcomes, and validation errors once each; rapid cell updates do not flood the speech queue.
4. At 200% zoom and a narrow viewport, controls and result data remain reachable; any table overflow follows W3C responsive-table guidance rather than clipping ([WAI Tables: Tips and Tricks](https://www.w3.org/WAI/tutorials/tables/tips/)).
5. `prefers-reduced-motion` continues to remove nonessential spinner, flash, bump, entrance, and bar animation without removing state text.

#### Progress, cancellation, and recovery

`AbortController` remains the run-level cancellation carrier, but each cancellable layer must observe its signal. The DOM Standard defines an abort signal's reason and abort algorithms while allowing an API that has already completed to ignore it ([WHATWG DOM, Aborting ongoing activities](https://dom.spec.whatwg.org/#aborting-ongoing-activities)). The UI must distinguish “stop requested; current cell cannot be preempted” from “current cell cancelling,” expose last completed and current cell/file, and show inner exhaustive progress. Adapter/worker hard cancellation must be adopted only where cleanup and result integrity are proven.

Completed results must remain downloadable after stop or failure. “Resume” or “Continue” may be used only when the exact frozen manifest and completed-cell set are restored; otherwise the control says “Start new run,” with a separate “Run remaining with cache” action if appropriate. A new run must clear stale error state before starting, while the prior run remains available as a completed snapshot.

Acceptance criteria:

1. Stop during an ordinary cell yields `stopping`, preserves focus, completes/disposes that cell, marks untouched cells `not run`, and exports the partial manifest/results.
2. Stop during a ten-file exhaustive cell exposes file-level progress; if the operation is non-preemptible, the UI says so.
3. A synthetic top-level runner exception preserves all streamed results, sets completion state `failed`, enables export, and does not leak its error flag into the next successful run.
4. Resume is offered only when run id, manifest digest, cache validation, and selected input hashes match; otherwise the UI labels the action as a new run.

#### Single-page matrix rendering

Keep the full result model and render every matching scenario row in one semantic table. Filtering, sorting, and export operate on the complete result set. The table may overflow horizontally inside its focusable wrapper, while vertical navigation uses normal browser-page scrolling. Winner calculation and status counts derive from the model, not only currently visible rows.

Expose total row/column counts and stable row/column positions as specified by the [WAI-ARIA table pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/). Do not turn a read-only result table into an interactive ARIA grid unless cell-level keyboard interaction genuinely requires grid behavior.

Acceptance criteria:

1. A generated 10,000-cell matrix renders every scenario row on one page and exports all 10,000 cells.
2. Scrolling, filtering, or sorting never changes a cell's engine/scenario identity.
3. Screen readers receive the full logical row/column counts and correct indexes.
4. Pending, not-run, cached, and resolved states remain distinguishable.

#### Export and server boundary

Manual and launcher exports must share one canonical versioned envelope and validation routine. The envelope includes the immutable run manifest, registration report, environment/support, results, cache-hit provenance, completion/partial reason, and a content digest. Offer raw results JSON plus the structured report JSON and Markdown produced by the [reporting subsystem](../subsystems/reporting-aggregation.md); label each artifact by schema and purpose.

Blob download is acceptable for same-origin, user-initiated export. The HTML download algorithm treats the `download` attribute as a download request and applies origin/security checks ([WHATWG HTML, Downloading resources](https://html.spec.whatwg.org/multipage/links.html#downloading-resources)); Blob URLs must be revoked after use according to their defined lifetime model ([W3C File API, Blob URL lifetime](https://www.w3.org/TR/FileAPI/#url)). Export success should be announced only after the activation path is initiated, and an export failure must retain the in-memory snapshot.

The command interface must have option parity: `run.sh`, `launch.mjs`, visible UI, and exported filter schema all support seed, exhaustive mode, reuse/fresh policy, filters, timing, timeout, and browser choice with one meaning. Remove inert `--headed` handling or make it real, and remove “headless” copy while the implementation mandates headed execution.

Keep the fixture Range and COOP/COEP behavior, but default the development server to loopback and make LAN exposure explicit. Disable `/__save` unless an explicit local orchestration mode enables it; then require a true descendant-path check, allowlisted extension, bounded body, non-guessable run token, and no wildcard cross-origin write surface. Treat direct Blob download and Playwright filesystem persistence as the primary export paths unless the endpoint has a documented caller.

Acceptance criteria:

1. The same run downloaded manually and saved by Playwright validates against the same schema and differs only in explicitly optional launcher provenance.
2. Raw, report JSON, and report Markdown contain the same cell count, status/coverage facts, run id, corpus checksum, and completion state.
3. A partial or failed run is exportable and clearly marked; a complete run cannot carry a stale `partialReason` or stale suite error.
4. CLI conformance tests prove every documented option is accepted and forwarded exactly once; help output contains no inert or contradictory headed/headless claim.
5. Traversal attempts, sibling-prefix paths, oversized bodies, missing tokens, cross-origin writes, and `/__save` while disabled are rejected; normal fixture Range requests and isolated WASM workers still succeed.

### Known gaps

#### Gap 1 — Manual boot and empty selection are surprising

- **Current:** The page auto-runs unless `autorun` is explicitly false, all choices default checked, and empty filter arrays become “all.” [src/app/main.ts:159-164](../../src/app/main.ts#L159-L164) [src/app/main.ts:205-208](../../src/app/main.ts#L205-L208) [src/app/main.ts:272-288](../../src/app/main.ts#L272-L288)
- **Consequence:** Merely opening the page can start a large exhaustive matrix, and a user who unchecks everything can accidentally run everything.
- **Target:** Default manual boot to idle, validate non-empty selections, and announce the error without moving focus, consistent with [WCAG 2.2 Status Messages](https://www.w3.org/TR/WCAG22/#status-messages).
- **Verification:** Load without query parameters and assert zero runner calls; clear either required checklist, activate Run, and assert zero cells plus one accessible error.

#### Gap 2 — Control validation and state snapshot are incomplete

- **Current:** `Number(value) || 1` changes warmup zero to one, and only cache/download controls are disabled during execution. [src/app/main.ts:229-240](../../src/app/main.ts#L229-L240) [src/app/main.ts:263-269](../../src/app/main.ts#L263-L269)
- **Consequence:** The visible value can disagree with the executed value, and mid-run edits look as though they affect the active run.
- **Target:** Validate the native control values, preserve valid zero, freeze and display an immutable active configuration, and keep keyboard focus order meaningful under [WCAG focus-order guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).
- **Verification:** Exercise boundary values and mutate every control after start; exported configuration and active labels remain identical to the start snapshot.

#### Gap 3 — Current UI cannot express PASS / DIFF / FAIL

- **Current:** `OracleOutcome` is boolean and `ResultStatus` has no DIFF; the matrix has only current binary correctness/status rendering. [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221) [src/core/format.ts:104-120](../../src/core/format.ts#L104-L120)
- **Consequence:** A legal representation difference can be displayed as FAIL, overstating wrongness and hiding a valid output's diagnostic nature.
- **Target:** After the [oracle-system](../subsystems/oracle-system.md) model changes, render PASS, DIFF, and FAIL separately in cell, summary, detail, export, and legend; DIFF remains valid and is never failure-colored or announced as failure. Dynamic status text must be programmatically determinable under [WCAG 2.2](https://www.w3.org/TR/WCAG22/#status-messages).
- **Verification:** Snapshot and accessibility-test one target verdict of each type; DIFF has its own count/details and no FAIL token in its accessible name.

#### Gap 4 — Applicability causes are visually collapsed

- **Current:** `visibleResult()`, run summary, scoreboard, and legend present the three NA statuses as generic `N/A`, and the legend describes only capability/codec absence. [src/core/format.ts:104-117](../../src/core/format.ts#L104-L117) [src/app/main.ts:376-390](../../src/app/main.ts#L376-L390) [src/app/ui.ts:385-401](../../src/app/ui.ts#L385-L401) [index.html:954-959](../../index.html#L954-L959)
- **Consequence:** Operators cannot distinguish adapter non-support, browser runtime absence, or missing assets without opening raw JSON; SKIPPED policy is also absent from the legend.
- **Target:** Keep `NA_ENGINE`, `NA_BROWSER`, `NA_ASSET`, `SKIPPED`, and `ERROR` distinct everywhere, with a concise reason exposed through keyboard-accessible content and polite status summaries per [WAI-ARIA `status`](https://www.w3.org/TR/wai-aria-1.2/#status).
- **Verification:** Feed one of each status and assert unique visible/accessibility text, counters, filters, legend definitions, and unchanged machine values.

#### Gap 5 — Mixed exhaustive coverage is hidden behind aggregate failure

- **Current:** Per-file rows and coverage exist, but any file FAIL/ERROR becomes top-level FAIL/ERROR and the UI renders only that marker plus a title tooltip. [src/core/runner.ts:1135-1179](../../src/core/runner.ts#L1135-L1179) [src/app/ui.ts:516-518](../../src/app/ui.ts#L516-L518)
- **Consequence:** “Passes 01, fails 02/03” loses its robustness value and can be mistaken for a harness ERROR; denominator and failing filenames are not visible without inspecting JSON.
- **Target:** Show partial coverage as its own grade with passed/total and failing files, never ERROR solely because coverage is mixed; expose the detail without hover and preserve native table relationships following the [WAI Tables Tutorial](https://www.w3.org/WAI/tutorials/tables/).
- **Verification:** A 1/3 fixture renders `Partial 1/3`, files 02/03 and their statuses/reasons, a partial summary count, and no ERROR classification.

#### Gap 6 — Cache validity is narrower than result validity

- **Current:** The key covers browser label, engine id, scenario/input tag, while validation epoch mismatch invalidates only PASS. Reads and writes fail silently. [src/app/result-cache.ts:43-55](../../src/app/result-cache.ts#L43-L55) [src/core/runner.ts:1960-1986](../../src/core/runner.ts#L1960-L1986) [src/core/runner.ts:2116](../../src/core/runner.ts#L2116-L2116)
- **Consequence:** Changed code, oracles, browser build, engine config, or timing protocol can reuse stale non-PASS results; operators cannot tell when persistence failed.
- **Target:** Key all correctness/measurement inputs, version all statuses, apply status-specific expiry, show cache provenance/errors, and handle best-effort eviction/quota as documented by [MDN storage guidance](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- **Verification:** Mutate each manifest component in isolation and observe a miss; inject open/read/write/quota failures and observe an announced cache warning with unaffected live verdicts.

#### Gap 7 — Persistent profile does not imply persistent page cache across ports

- **Current:** The runner commonly changes the server port, IndexedDB is origin-scoped, and the launcher reseeds current-origin storage from result files; seeded rows have no page validation epoch. [scripts/run.sh:104-136](../../scripts/run.sh#L104-L136) [scripts/launch.mjs:340-423](../../scripts/launch.mjs#L340-L423)
- **Consequence:** Manual and launcher reuse behave differently, and seeded PASS versus non-PASS rows follow different invalidation outcomes.
- **Target:** Make origin and import provenance explicit, use one validated import schema, and do not promise cross-port persistence; IndexedDB's same-origin isolation is intentional ([MDN Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy#cross-origin_data_storage_access)).
- **Verification:** Run on two ports with the same browser profile; the second origin sees no native rows until an explicit validated import, after which every status follows the same epoch policy.

#### Gap 8 — Progress and status changes are not accessible

- **Current:** Progress is a styled `div`, and status/progress/counter/matrix updates have no live-region or progressbar semantics. [index.html:904-907](../../index.html#L904-L907) [src/app/ui.ts:637-660](../../src/app/ui.ts#L637-L660)
- **Consequence:** Assistive technology may not announce that a run started, advanced, stopped, failed, exported, or cleared cache; the bar's numeric state is visual only.
- **Target:** Use a labelled native progress element following the [HTML progress contract](https://html.spec.whatwg.org/multipage/form-elements.html#the-progress-element), one throttled polite `status` region, and text state for current cell/file.
- **Verification:** Inspect the accessibility tree for name/min/max/current values and run a screen-reader smoke test that receives bounded, nonduplicated lifecycle announcements.

#### Gap 9 — Table detail, winner state, and reasons depend on weak semantics

- **Current:** Scenario labels are `<td>`, there is no caption/scope, reasons are `title` text, and winner is a CSS class plus generated trophy. [src/app/ui.ts:297-318](../../src/app/ui.ts#L297-L318) [src/app/ui.ts:516-518](../../src/app/ui.ts#L516-L518) [index.html:503-513](../../index.html#L503-L513)
- **Consequence:** Header context, reasons, and winner state may be unavailable to keyboard/screen-reader users; narrow/zoomed matrices lack a deliberate scroll-region contract.
- **Target:** Apply caption/row/column header semantics from the [WAI Tables Tutorial](https://www.w3.org/WAI/tutorials/tables/), provide focusable details, textual winner state, and a keyboard-reachable responsive wrapper per [WAI table tips](https://www.w3.org/WAI/tutorials/tables/tips/).
- **Verification:** Automated header association plus keyboard and 200%-zoom tests can identify scenario, engine, verdict, reason, coverage, metric, cache state, and winner for any cell.

#### Gap 10 — Cancel is cooperative but “Continue” overclaims recovery

- **Current:** Abort is checked between cells, Stop disables itself while the current cell completes, and an aborted run relabels the fresh-run action “Continue run.” [src/app/main.ts:210-218](../../src/app/main.ts#L210-L218) [src/app/main.ts:338-360](../../src/app/main.ts#L338-L360) [src/core/runner.ts:1833-1838](../../src/core/runner.ts#L1833-L1838)
- **Consequence:** Long cells and exhaustive file loops can appear stuck, and “Continue” may rerun work or reuse stale cache rather than resume an exact checkpoint.
- **Target:** Preserve cooperative semantics truthfully, propagate abort to safe layers using the [DOM abort model](https://dom.spec.whatwg.org/#aborting-ongoing-activities), show cell/file progress, and reserve Resume for a validated manifest/checkpoint.
- **Verification:** Stop during short, long, exhaustive, cached, and non-preemptible cells; each path announces its actual boundary and exports a coherent partial snapshot.

#### Gap 11 — Top-level failure can erase streamed results and contaminate the next run

- **Current:** The failure catch sets `__SUITE_ERROR__`, then `finally` replaces `__RESULTS__` with the still-empty local array; new-run initialization does not clear the error. [src/app/main.ts:269-270](../../src/app/main.ts#L269-L270) [src/app/main.ts:338-357](../../src/app/main.ts#L338-L357)
- **Consequence:** Partial evidence can disappear from both manual and launcher export, and a later successful launcher run can still be reported as failed.
- **Target:** Keep a run-scoped immutable result accumulator, preserve it on every terminal state, and reset error state at run start; announce terminal status through [WAI-ARIA `status`](https://www.w3.org/TR/wai-aria-1.2/#status) without forcing focus.
- **Verification:** Throw after several streamed cells, export those cells with `completionState: failed`, then run successfully and assert no prior error or partial reason remains.

#### Gap 12 — Operators want one continuous matrix

- **Current:** The matrix renders every matching row and engine cell in one semantic table.
- **Consequence:** Operators can inspect the entire run using normal browser-page scrolling without changing pages.
- **Target:** Preserve the single-page table and full model/export; communicate total positions as required by the [ARIA table pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/).
- **Verification:** A 10,000-cell stress run renders all scenario rows without pagination, produces all results, and preserves logical indexes.

#### Gap 13 — Manual and automated artifacts have different provenance

- **Current:** Manual export omits the active filter, seed as a run-level field, Playwright version, completion/partial state, registration report, and report artifacts; launcher export adds only some of those fields. [src/app/main.ts:393-405](../../src/app/main.ts#L393-L405) [scripts/launch.mjs:277-305](../../scripts/launch.mjs#L277-L305)
- **Consequence:** Two files from the same run path cannot be validated or replayed uniformly, and an empty/partial payload can resemble a complete run.
- **Target:** Use one canonical envelope and expose raw/report artifacts; use the [HTML download algorithm](https://html.spec.whatwg.org/multipage/links.html#downloading-resources) and [File API Blob URL lifecycle](https://www.w3.org/TR/FileAPI/#url) for the browser route.
- **Verification:** Validate manual and launcher files with one schema; compare run id, manifest digest, result count, coverage, status, corpus checksum, and completion state for equality.

#### Gap 14 — Launcher/serve options and copy contradict implementation

- **Current:** Playwright is always headed, `--headed` is inert, serve copy says “headlessly,” and only `launch.mjs` accepts seed/exhaustive flags. [scripts/launch.mjs:69-74](../../scripts/launch.mjs#L69-L74) [scripts/launch.mjs:119-137](../../scripts/launch.mjs#L119-L137) [scripts/run.sh:57-76](../../scripts/run.sh#L57-L76) [scripts/serve.sh:65-67](../../scripts/serve.sh#L65-L67)
- **Consequence:** Operators cannot infer actual browser visibility or reproduce seed/exhaustive runs through the supported wrapper.
- **Target:** Establish one option schema and generated help across UI/wrappers, implement or remove `--headed`, and use one accurate term for browser mode.
- **Verification:** Contract tests compare help, accepted flags, forwarded filter, and export manifest for every entry point.

#### Gap 15 — Page copy misidentifies the reference instrument

- **Current:** Hero/about text says results are reported or surfaced against a “reference engine,” while core registration/report contracts say platform is an unscored instrument and no live candidate is the reference judge. [index.html:763-765](../../index.html#L763-L765) [index.html:783-809](../../index.html#L783-L809) [src/core/registry.ts:7-12](../../src/core/registry.ts#L7-L12) [src/core/report.ts:4-9](../../src/core/report.ts#L4-L9)
- **Consequence:** Users can mistake neutral [reference decode](../glossary.md) or [reference re-import](../glossary.md) for a scored seventh engine and misunderstand golden-based verdicts.
- **Target:** Describe platform as an unscored browser reference instrument, distinguish golden comparison, reference decode, and reference re-import, and link the [oracle-system contract](../subsystems/oracle-system.md).
- **Verification:** UI copy and accessibility text contain no “reference engine” claim; platform never appears as a scored picker, matrix column, or winner.

#### Gap 16 — Development persistence endpoint is broader than its active callers

- **Current:** Vite always configures `/__save`, accepts an unbounded POST body, and uses string-prefix containment; the app and launcher persist through Blob download and Bun filesystem output instead. [vite.config.mjs:281-327](../../vite.config.mjs#L281-L327) [src/app/main.ts:484-492](../../src/app/main.ts#L484-L492) [scripts/launch.mjs:299-305](../../scripts/launch.mjs#L299-L305)
- **Consequence:** An optional LAN-served development session exposes an unnecessary filesystem-writing surface, and sibling-prefix/path/body edge cases are not defended by the current contract.
- **Target:** Disable the endpoint by default; if retained for a named orchestrator, require opt-in, token, exact descendant containment, extension allowlist, size limit, loopback/LAN warning, and auditable caller. Preserve browser same-origin protections rather than assuming a persistent profile is a trust boundary ([MDN Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy#cross-origin_data_storage_access)).
- **Verification:** Security tests reject disabled, unauthenticated, traversal, sibling-prefix, cross-origin, non-JSON, and oversized requests while the explicit local happy path writes only the allowlisted results file.

## Sources

### Repository evidence

- [index.html:1-6](../../index.html#L1-L6) — document language, viewport, and title.
- [index.html:737-756](../../index.html#L737-L756) — reduced-motion behavior.
- [index.html:759-816](../../index.html#L759-L816) — hero, explanatory copy, and environment section.
- [index.html:818-872](../../index.html#L818-L872) — feature/scenario/engine/options controls and defaults.
- [index.html:904-970](../../index.html#L904-L970) — status, custom progress, scoreboard, legend, and results host.
- [index.html:503-513](../../index.html#L503-L513) — visually generated winner treatment.
- [src/app/main.ts:43-84](../../src/app/main.ts#L43-L84) — browser automation surface and run-filter shape.
- [src/app/main.ts:97-165](../../src/app/main.ts#L97-L165) — boot, registration visibility, picker creation, automation exposure, and autorun.
- [src/app/main.ts:167-218](../../src/app/main.ts#L167-L218) — control wiring, cache-control state, autorun test, and stop request.
- [src/app/main.ts:228-251](../../src/app/main.ts#L228-L251) — UI input collection and numeric conversion.
- [src/app/main.ts:255-336](../../src/app/main.ts#L255-L336) — run state initialization, filters, display ids, seed, matrix, and callbacks.
- [src/app/main.ts:338-390](../../src/app/main.ts#L338-L390) — terminal states, failure handling, result exposure, and collapsed summary.
- [src/app/main.ts:393-492](../../src/app/main.ts#L393-L492) — raw/cache export, cache clearing, and Blob download.
- [src/app/main.ts:494-505](../../src/app/main.ts#L494-L505) — fatal boot-error path.
- [src/app/register.ts:37-92](../../src/app/register.ts#L37-L92) — engine wiring inventory.
- [src/app/register.ts:100-147](../../src/app/register.ts#L100-L147) — scenario-family wiring inventory.
- [src/app/register.ts:154-181](../../src/app/register.ts#L154-L181) — failure-isolated registration report.
- [src/app/result-cache.ts:3-55](../../src/app/result-cache.ts#L3-L55) — database identity, invalidation epoch/list, physical key, and reusable-status policy.
- [src/app/result-cache.ts:57-127](../../src/app/result-cache.ts#L57-L127) — lazy IndexedDB open, get, and put transactions.
- [src/app/result-cache.ts:128-167](../../src/app/result-cache.ts#L128-L167) — cache listing, sorting, and deletion.
- [src/app/ui.ts:64-101](../../src/app/ui.ts#L64-L101) — environment and codec-support rendering.
- [src/app/ui.ts:123-175](../../src/app/ui.ts#L123-L175) — native checklist rendering and all-selection action.
- [src/app/ui.ts:227-323](../../src/app/ui.ts#L227-L323) — inferred execution order and eager table construction.
- [src/app/ui.ts:330-415](../../src/app/ui.ts#L330-L415) — live counters, pass-rate denominator, and coalesced repaint.
- [src/app/ui.ts:418-521](../../src/app/ui.ts#L418-L521) — running-cell inference, finish behavior, cell status, and title reason.
- [src/app/ui.ts:531-621](../../src/app/ui.ts#L531-L621) — winner race and coverage-first timed-PASS selection.
- [src/app/ui.ts:624-660](../../src/app/ui.ts#L624-L660) — engine-id normalization and progress/status updates.
- [src/core/feature-detect.ts:262-350](../../src/core/feature-detect.ts#L262-L350) — defensive WebCodecs feature probing.
- [src/core/format.ts:68-120](../../src/core/format.ts#L68-L120) — visible time source, coverage suffix, status collapse, and no-zero fallback.
- [src/core/media-selection.ts:393-443](../../src/core/media-selection.ts#L393-L443) — seeded/exhaustive candidates and byte-sensitive cache tag.
- [src/core/registry.ts:7-12](../../src/core/registry.ts#L7-L12) — platform as unscored instrument, not reference engine.
- [src/core/registry.ts:58-69](../../src/core/registry.ts#L58-L69) — scored-engine filtering.
- [src/core/report.ts:4-9](../../src/core/report.ts#L4-L9) — report's no-live-reference contract.
- [src/core/report.ts:39-48](../../src/core/report.ts#L39-L48) — separate report input/output API.
- [src/core/report.ts:298-347](../../src/core/report.ts#L298-L347) — report JSON/Markdown assembly and corpus provenance.
- [src/core/scenario.ts:131-142](../../src/core/scenario.ts#L131-L142) — canonical feature-family grouping order.
- [src/core/runner.ts:387-439](../../src/core/runner.ts#L387-L439) — run options, callbacks, reuse, cancellation, and execution order.
- [src/core/runner.ts:1135-1204](../../src/core/runner.ts#L1135-L1204) — exhaustive detail, coverage, and aggregate status.
- [src/core/runner.ts:1388-1394](../../src/core/runner.ts#L1388-L1394) — runtime NotApplicableError mapping to NA_ENGINE.
- [src/core/runner.ts:1734-1838](../../src/core/runner.ts#L1734-L1838) — filter resolution, environment, media selection, queue, and cancellation boundary.
- [src/core/runner.ts:1960-2037](../../src/core/runner.ts#L1960-L2037) — input-sensitive cache key, cache hit, negotiation, and persistence.
- [src/core/runner.ts:2040-2123](../../src/core/runner.ts#L2040-L2123) — exhaustive/single execution, provenance, result persistence, and progress.
- [src/core/scenario.ts:208-221](../../src/core/scenario.ts#L208-L221) — current statuses and boolean oracle outcome.
- [src/core/scenario.ts:269-329](../../src/core/scenario.ts#L269-L329) — result, exhaustive per-file, coverage, and environment shape.
- [scripts/launch.mjs:34-97](../../scripts/launch.mjs#L34-L97) — launcher options and browser mapping.
- [scripts/launch.mjs:114-180](../../scripts/launch.mjs#L114-L180) — non-headless persistent context, page boot, and seed entry.
- [scripts/launch.mjs:185-255](../../scripts/launch.mjs#L185-L255) — filter forwarding, run trigger, completion polling, and partial snapshots.
- [scripts/launch.mjs:277-318](../../scripts/launch.mjs#L277-L318) — launcher export envelope and persistence.
- [scripts/launch.mjs:340-423](../../scripts/launch.mjs#L340-L423) — raw-file reuse scan and IndexedDB seed transaction.
- [scripts/run.sh:8-27](../../scripts/run.sh#L8-L27) — documented wrapper interface.
- [scripts/run.sh:57-76](../../scripts/run.sh#L57-L76) — actual wrapper argument parser.
- [scripts/run.sh:104-147](../../scripts/run.sh#L104-L147) — free-port/origin selection and server cleanup.
- [scripts/run.sh:177-244](../../scripts/run.sh#L177-L244) — owned-server verification and sequential browser launching.
- [scripts/serve.sh:1-18](../../scripts/serve.sh#L1-L18) — supported server modes and cross-origin-isolation intent.
- [scripts/serve.sh:41-67](../../scripts/serve.sh#L41-L67) — Bun/Vite startup, preview, host, and current headless wording.
- [vite.config.mjs:65-160](../../vite.config.mjs#L65-L160) — raw fixture delivery, Range behavior, and containment check.
- [vite.config.mjs:252-278](../../vite.config.mjs#L252-L278) — COOP/COEP middleware.
- [vite.config.mjs:281-327](../../vite.config.mjs#L281-L327) — development save endpoint and configured plugin order.

### External authorities

- W3C, *Web Content Accessibility Guidelines (WCAG) 2.2*, “2.1.1 Keyboard” and “4.1.3 Status Messages,” https://www.w3.org/TR/WCAG22/#keyboard and https://www.w3.org/TR/WCAG22/#status-messages, accessed 2026-07-16 — supports keyboard-operable functionality and programmatically determinable status updates without forced focus.
- W3C, *Accessible Rich Internet Applications (WAI-ARIA) 1.2*, “`status` role,” https://www.w3.org/TR/wai-aria-1.2/#status, accessed 2026-07-16 — defines status as a polite, atomic live region and advises against focusing it merely on update.
- WHATWG, *HTML Living Standard*, “The `progress` element,” https://html.spec.whatwg.org/multipage/form-elements.html#the-progress-element, accessed 2026-07-16 — defines completed/total progress semantics and textual fallback guidance.
- W3C Web Accessibility Initiative, *Tables Tutorial*, https://www.w3.org/WAI/tutorials/tables/, accessed 2026-07-16 — requires semantic header/data relationships and recommends captions for data tables.
- W3C Web Accessibility Initiative, *Tables Tutorial: Tips and Tricks*, https://www.w3.org/WAI/tutorials/tables/tips/, accessed 2026-07-16 — supports keyboard-reachable horizontal overflow and responsive preservation of table relationships.
- W3C WAI-ARIA Authoring Practices Guide, *Table Pattern*, https://www.w3.org/WAI/ARIA/apg/patterns/table/, accessed 2026-07-16 — defines total row/column counts and indexes when rows or columns are absent from the DOM.
- W3C Web Accessibility Initiative, *Understanding Success Criterion 2.4.3: Focus Order*, https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html, accessed 2026-07-16 — supports focus sequences that preserve meaning and operability through dynamic state changes.
- WHATWG, *DOM Standard*, “Aborting ongoing activities,” https://dom.spec.whatwg.org/#aborting-ongoing-activities, accessed 2026-07-16 — defines AbortController/AbortSignal reasons and abort-algorithm propagation.
- W3C, *Indexed Database API 3.0*, “Transactions,” https://www.w3.org/TR/IndexedDB/#transactions, accessed 2026-07-16 — defines scoped transactional database reads/writes and transaction modes.
- MDN Web Docs, *Storage quotas and eviction criteria*, https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria, accessed 2026-07-16 — documents best-effort persistence, origin storage quotas, eviction, estimates, and `QuotaExceededError` handling.
- MDN Web Docs, *Same-origin policy*, “Cross-origin data storage access,” https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy#cross-origin_data_storage_access, accessed 2026-07-16 — documents scheme/host/port origin separation for IndexedDB and other browser storage.
- WHATWG, *HTML Living Standard*, “Downloading resources,” https://html.spec.whatwg.org/multipage/links.html#downloading-resources, accessed 2026-07-16 — defines `download` activation, proposed filenames, origin checks, and user-agent safety handling.
- W3C, *File API*, “A URL for Blob and MediaSource reference,” https://www.w3.org/TR/FileAPI/#url, accessed 2026-07-16 — defines Blob URL creation, access restrictions, lifetime, and revocation.
