---
name: test-cell
description: Drive ONE feature × ONE engine cell in media-test to a terminal state — PASS (green, timed) or NA_ENGINE (declared with evidence). Use when the user says "/test-cell", "test <feature> on <engine>", "run/fix the <feature> × <engine> cell", or names any feature+framework pair to verify. Args: <engine-id> <feature-or-scenario-id>.
---

# Test one cell to completion

Scope-lock to the requested **engine × feature** pair. The only acceptable end states are
**PASS in exhaustive mode** or **NA_ENGINE with cited evidence**. Do not stop at FAIL or
ERROR; do not widen scope to other cells.

## 1. Resolve arguments

Map the user's words onto exact ids (validation is strict; unknown ids throw
`RunOptionValidationError`):

- Engine ∈ `mediabunny | ffmpeg-wasm | mp4box | remotion | web-demuxer@4.0.0 |
  aibrush-media` ("ffmpeg" → `ffmpeg-wasm`, "webdemuxer" → `web-demuxer@4.0.0`).
- Feature ∈ `probe | demux | remux | transcode | decode-seek | trim | mux | encryption |
  metadata | streaming-output | audio-dsp | robustness | performance` — or a full
  scenario id like `trim/h264_mp4_keyframe` (then use `--scenario` instead of
  `--feature`).

## 2. Preflight

- Server up? `curl -sf http://127.0.0.1:5151/index.html >/dev/null` — else start
  `bash scripts/serve.sh` in the background and wait for the port.
- Fixtures present? `fixtures/manifest.json` must exist (else `bun run bake` — needs
  native ffmpeg — or stop and report).
- Everything runs on `http://127.0.0.1:5151` (secure context + COOP/COEP). Never a LAN IP.

## 3. Quick run (seeded single input per scenario)

```sh
bash scripts/run.sh --browser chromium --engine <engine> --feature <family> \
    --port 5151 --no-reuse
```

Output JSON lands in `results/raw/chromium-<stamp>.json`. Read every row's `status` for
this engine. All `PASS`/`NA_*` → go to step 6. Any `FAIL`/`ERROR` → step 4.

Alternative for tight iteration on one scenario (DevTools on the served page, or via
browser automation):

```js
await window.__SUITE__.run({ engineIds: ['<engine>'], scenarioIds: ['<family>/<name>'],
  reuseData: false })
// results: window.__RESULTS__ / window.__RUN_ARTIFACT__; per-cell popup in the matrix UI
```

## 4. Triage each failing scenario — in this exact order

Read the failure evidence first: the result row's reason/detail string
(`EVIDENCE_VERDICT_FAIL: … applied=<oracle-id>` names the oracle that fired), or the
cell popup in the UI.

1. **Environment.** `ERROR` with `reading 'digest'` ⇒ insecure context — fix serving,
   not code. `NA_BROWSER` ⇒ missing browser API (try another browser or accept).
   `NA_ASSET` ⇒ missing fixture. Timeout on 600 s/2 h assets ⇒ budget (per-op default is
   120 s), not lack of support.
2. **Harness/golden bug.** Run the SAME scenario on 1–2 other engines
   (`--engine mediabunny` etc.). If several engines fail identically ⇒ the golden value,
   an oracle tolerance in `src/core/oracles.ts`, or a scenario contract is wrong — not
   the framework. Fix there, but only after independently verifying the correct value
   (spec, offline ffprobe during baking, or a trusted engine's output). Never loosen a
   tolerance merely to make a cell green.
3. **Adapter bug (most common).** Our misuse of the framework in
   `src/engines/<engine>/adapter.ts` — wrong call, missing config, unhandled variant.
   Fix, then re-run just that scenario with `reuseData: false` / `--no-reuse`. Loop
   until PASS.
4. **Genuine framework limitation → N/A.** Only when you can cite evidence: the
   framework's public API has no surface for the operation, or the framework itself
   reports the codec/container/operation unsupported, or a documented upstream
   limitation. Then declare it at the right layer:
   - operation-wide: the engine's `CapabilitySet` declaration (its register/adapter);
   - concrete tuple: `supports()` in `src/engines/<engine>/support.ts` →
     `{ supported: false, status: 'NA_ENGINE', reasonCode: '<SCREAMING_SNAKE>',
     reason: '<the concrete API gap>' }`;
   - runtime-only: throw `createNotApplicableError(…)` from the adapter.
   Re-run: the cell must now show `NA_ENGINE` (not ERROR, not FAIL). Never route N/A
   through `src/core/disabled-cells.ts` (reviewed budget/safety suppressions only).

Anti-patterns (hard NO): marking N/A to escape a hard bug; weakening oracles/goldens
without independent verification; editing other engines' cells "while at it"; treating
slow-but-correct as failure (timing never gates correctness).

## 5. Fix loop discipline

Smallest change in the correct layer → re-run only the failing scenario (`--no-reuse`)
→ re-triage. If a fix touches shared code (oracles, runner, golden), immediately re-run
one other engine on the affected scenarios to prove no cross-engine regression.

## 6. Exhaustive gate (mandatory — the cell is not done without it)

```sh
bash scripts/run.sh --browser chromium --engine <engine> --feature <family> \
    --port 5151 --no-reuse --exhaustive
```

Exhaustive runs every scenario against its full eligible file catalog and folds per-file
results with precedence FAIL > ERROR > PASS — one failing file fails the cell. Required:
every scenario `PASS` with `coverage.grade: "full"` (launcher labels partials
`Partial`), or `NA_ENGINE`. Any per-file FAIL/ERROR → back to step 4 for that file.
Long-form files may need a raised `--timeout-ms`; that is budget, not support.

## 7. Regression gate

```sh
bun test && bun run typecheck
```

Both must be clean (no new failures vs. baseline). If they broke, your fix is wrong or
incomplete — go back to step 5.

## 8. Report and commit

Commit as `cell(<family> × <engine>): <what changed>`. Then report:

- Terminal state per scenario: `PASS (x ms)` or `NA_ENGINE (<reasonCode>)`.
- What was wrong and in which layer (environment / golden-oracle / adapter / framework).
- Evidence for every N/A (the API gap or upstream limitation cited in `reason`).
- Exhaustive coverage: files passed / admissible, grade.
- Confirmation that `bun test` + `typecheck` are green and, if shared code changed, that
  the cross-engine spot-check passed.
