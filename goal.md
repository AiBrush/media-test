# GOAL — Implement the media-test correctness & fairness cleanup (CODE)

Source of truth: `REQUIREMENTS.md` (repo root) — the consolidated backlog with stable IDs (REQ-CORE / ORAC / RUN / ADP / ENG / DSL / SEL / FIX / REP / UI / FEAT), priorities (P0>P1>P2), a `Depends on` field, per-item **Acceptance**, and a `Source:` pointer to the owning `docs/` page (full rationale + `file:line` evidence). Before writing code, each agent reads its REQ + that doc page + the cited `src/`; implement to the Acceptance, do not invent scope. Same model as this session; ULTRATHINK, max effort.

North star: an honest three-way verdict (PASS/DIFF/FAIL) and honest applicability (NA_ENGINE/NA_BROWSER/NA_ASSET vs ERROR). DIFF is correctness-valid and benchmark-eligible; never FAIL a valid representation difference; never let an unsupported combination leak into FAIL/ERROR (throw the shared NotApplicableError); malformed-input rejections stay expected; correctness gates performance.

## Phase 0 — Foundations first (BLOCKING; coordinated; no fan-out yet)
Land REQ-CORE-01..04 on a shared branch before anything else: three-way oracle verdict + order-independent reducer; shared Worker/realm-safe `NotApplicableError`; tuple/combinatorial capability + concrete WebCodecs config probes; typed evidence/reader results. These are shared types every later agent builds on — freeze their signatures, then fan out.

## Phase 1 — Fan out (max agents in parallel; one owner per area; disjoint files)
Spawn one max-effort agent per feature family / sub-family AND per subsystem/engine. Each agent OWNS a disjoint REQ-ID set and file set so no two agents edit the same file at once:
- Subsystems/engines: REQ-ORAC-*, REQ-RUN-*, REQ-ADP-*, REQ-ENG-* (per engine: mediabunny, ffmpeg-wasm, remotion, mp4box, web-demuxer, aibrush-media), REQ-DSL-*, REQ-SEL-*, REQ-FIX-*, REQ-REP-*, REQ-UI-*.
- Feature families (split sub-families as useful), each keyed to `docs/features/<family>.md`: demux, remux, mux, transcode, trim, probe, metadata, decode-seek, encryption, audio-dsp, performance, robustness, streaming-output.

Each agent: (1) read its REQ rows in `REQUIREMENTS.md` + its `docs/` page(s) + cited code; (2) implement to Acceptance; (3) add the Acceptance fixtures/tests; (4) run typecheck + its tests; (5) stay within its ownership.

## Conflict rules
Respect every `Depends on` (never start an item whose deps are unlanded). Shared hot files (`src/core/oracles.ts`, `src/core/runner.ts`) are edited by exactly one owning agent per area or serialized via git worktrees; feature agents touch their `src/scenarios/<family>/` and fixtures, not core. A REQ is DONE only when its Acceptance passes.

## Phase 2 — Waves & integration
Order by dependency: Wave 1 oracle+runner core → Wave 2 engines → Wave 3 features + reporting + selection + DSL + UI → Wave 4 fixtures + acceptance matrices (codec-alias/reorder/SBR/PS/NTSC/VFR/edit-list/Annex-B pairs, negative-tuple, corrupt-vs-unsupported, partial-coverage). Do P0s first within every wave.

## Done when
Every REQ's Acceptance passes; full typecheck + unit/fixture suites are green; a final integration agent runs the whole matrix and confirms no valid output scores FAIL, no unsupported tuple scores FAIL/ERROR, and DIFF + partial-coverage are surfaced — then reports the completed REQ-IDs.