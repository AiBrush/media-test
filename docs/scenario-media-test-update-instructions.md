# Update the tests to use the per-scenario media files

**Prerequisite / sibling doc:** `docs/scenario-media-download-instructions.md`. That task downloaded
≥3 independent real internet files per scenario and, in a follow-up reorg, **moved every baked
fixture into its scenario's directory**. Its §9 ("Downstream implications — record, do NOT implement")
deferred exactly the work this document now specifies. Read that §9 first.

This is a **specification, not a green-light to make numbers look good.** The three hard rules in §3
override every other consideration, including "the suite passes." A red test that is honestly red is
a *success* of this task.

---

## 1. Goal

Today each scenario is judged against **one** baked fixture with committed goldens. That over-fits the
benchmark: a framework can look correct by coincidentally handling one specific file. We now have,
per scenario, the baked fixture **plus** real independent internet files of the same shape. The goal
is to **exercise frameworks against these real files** so correctness/performance reflect real-world
inputs, **without**:

- changing any downloaded file to make it "work" (rule R1),
- softening any check to manufacture a pass (rule R2),
- penalizing a framework that has no honest way to attempt a scenario (rule R3).

## 2. Current state (what you are starting from)

- **Media location.** For every scenario `family/name`, the directory
  `fixtures/media/scenarios/<family>/<name>/` contains: the **baked fixture(s)** under their original
  manifest name (e.g. `h264_1080p_30s.mp4`) — the file that has committed goldens — and the **real
  downloads** as `01.<ext>`, `02.<ext>`, `03.<ext>`. Encryption scenarios also contain their
  `*_clear.mp4` cleartext twin; HLS scenarios contain the playlist + `.ts` segments + `.key`.
- **Selection catalog.** `fixtures/media/scenarios/_sources.ndjson` — one JSON row per scenario, with
  a `files[]` array giving each real file's probed `container`, `videoCodecs`, `audioCodecs`, `width`,
  `height`, `durationSec`, `sizeBytes`, `sha256`, and (for `DERIVED`) `keys` + `cleartextBase` +
  `derivation`. This is your authoritative list of candidate files and their true shapes. It does
  **not** list the baked fixture (that is the manifest asset).
- **The runner still reads the root.** `mediaAssetUrl(assetId)` in `src/core/runner.ts` resolves
  input to `/fixtures/media/<assetId>` — the flat root, which the reorg **emptied**. So the suite's
  input path is currently broken and is precisely what you must repoint. (This was expected; see the
  sibling §9.)
- **Goldens are per-asset.** `fixtures/golden/<assetId>.{meta,packets,frames,ssim}.json`, loaded by
  `loadGolden(assetId)` keyed on `ctx.input.id`. The real files have **no** goldens.

## 3. The three hard rules (non-negotiable)

These come directly from the repo owner. They are not tunable. If honoring them makes a framework
fail a scenario, **that is the correct outcome** — record it and move on.

### R1 — Never alter a downloaded file to make it work

The bytes fed to a framework MUST be the file **exactly as downloaded**. You MUST NOT transcode,
remux, re-wrap, trim, pad, re-timestamp, fix headers, or otherwise edit an input to satisfy a
framework. If a framework cannot handle the file as-is, the scenario **fails** for that framework
(`FAIL`/`ERROR`), full stop.

- The **only** pre-existing exceptions are already in the corpus and stay as-is: the `robustness`
  family's deterministic `mutate` corruption (part of the *scenario definition*, applied equally to
  all engines), and the `encryption`/`DERIVED` local encryption that was baked at download time with
  recorded keys. You are not adding new manipulation.
- **Read-only measurement is not mutation.** Probing/decoding a file to *record* its properties (e.g.
  baking a golden sidecar, §7.4) is allowed because it does not change the media. Re-encoding a file
  to *produce* a golden is forbidden — bake goldens from the file as-is.

### R2 — Never manufacture a pass

You MUST NOT loosen an oracle, widen a tolerance, lower a threshold, or special-case a framework to
turn a `FAIL` green. You MUST NOT switch a scenario to an "easier" file to dodge a `FAIL`. Oracle
logic and tolerances are engine-agnostic and stay that way. If a real file exposes a real defect, the
red result is the deliverable.

### R3 — Be fair to each framework

If a framework offers **no clear, first-class way** to perform a scenario, do not contort it — that
framework simply does not do that scenario, and it is recorded as **`NA_ENGINE`** (not counted
against it; see §4–§5). Do not reshape one framework's call sequence to imitate another's just to
force an attempt. Fairness cuts both ways: a framework that *claims* a capability and then gets a
matching real file wrong **fails** — that is not "unfair," it is the benchmark working (§5).

## 4. The result-status contract (reuse it; never collapse it)

The runner already has exactly the vocabulary this task needs. **Reuse these statuses; do not invent
an "unsupported" state and do not merge any two.** (`ResultStatus`, `src/core/scenario.ts`; the file's
own comment forbids collapsing them.)

| Status | Means | Scored? (`isAdmissible`, `report.ts`) |
|---|---|---|
| `PASS` | Attempted; all oracles green | ✅ counts (numerator + denominator) |
| `FAIL` | **Attempted; output wrong** (oracle failed, or op timed out) | ✅ counts against (denominator) |
| `ERROR` | Unexpected throw (generic `Error`) | ✅ counts against (denominator) |
| `NA_ENGINE` | **Engine never declared the capability** (or honest input-specific `NotApplicableError`) | ❌ excluded |
| `NA_BROWSER` | Declared, but the browser can't configure the WebCodecs codec/API | ❌ excluded |
| `NA_ASSET` | Corpus asset/golden intentionally absent (nothing to judge against) | ❌ excluded |
| `SKIPPED` | Manual per-cell policy disable (`disabled-cells.ts`) | ❌ excluded |

The fairness you want is **already** the scoring rule: conformance = `PASS / (PASS+FAIL+ERROR)`; every
`NA_*` is excluded. So "capability gap → not penalized" and "attempted-but-wrong → penalized" fall out
for free **provided you keep statuses honest** (§5). Your selection/oracle changes MUST preserve this
mapping and MUST NOT route a real defect into an `NA_*` bucket.

## 5. The `NA_ENGINE`-vs-`FAIL` boundary (the one subtle rule)

This is where R2 and R3 meet, and where a framework could cheat. Draw the line precisely:

- **Legitimate `NA_ENGINE` — capability-level gap.** The scenario's required
  `(op, containersIn, videoCodecsIn/Out, audioCodecsIn/Out, encryption, features)` is **not in the
  engine's declared `capabilities()`**. Decided *before* running by `negotiate()`. This is the honest
  "no clear way to do it" and is correctly free of penalty. Preferred mechanism: the engine simply
  **omits** the capability (see `src/engines/_template/adapter.ts`).
- **Legitimate `NA_ENGINE` — input-specific, honestly out of declared scope.** A runtime
  `NotApplicableError` (keyed by `err.name`, `isNotApplicableError` in `runner.ts`) is allowed **only**
  when the specific file needs something the engine legitimately never claimed (e.g. a codec
  profile/level or container feature outside its declared set). It must be a *confirmed library
  limitation of a whole class of inputs*, not "this file was hard."
- **`FAIL`/`ERROR` — the file matches declared capabilities but breaks the engine.** If the framework
  **declares** it can do this `(op × container × codecs)` and a real file of exactly that shape then
  produces wrong output, throws a generic error, or times out → this is a **`FAIL`/`ERROR`**. This is
  the owner's rule "*if the file, as it is, does not work with this framework, the test fails.*"

**Anti-cheat:** `NotApplicableError` MUST NOT be used to escape a file that satisfies the engine's own
declared capabilities. If you find an adapter doing that, it is a bug to report, not a status to
honor. When in doubt, the honest default is `FAIL`, not `NA`.

## 6. File selection (the new layer)

### 6.1 What may be selected

For a scenario, the candidate inputs are: the **baked fixture** (has goldens; runs the full oracle
set) and the **real files** listed in `_sources.ndjson[scenarioId].files[]` (no goldens; run the
survivor oracles, §7). All live in the scenario directory.

### 6.2 Selection policy — **DEFAULT: seeded-random, one file per run** *(override point, §14)*

- Per scenario, pick **one** input via the existing seeded RNG primitive
  (`mulberry32(hashSeed(seed))`, `runner.ts`) keyed on `hashSeed(`${runSeed}|${scenarioId}`)`. Same
  `runSeed` ⇒ same pick ⇒ **every framework in that run sees the identical file** (cross-framework
  comparison stays valid) and the run is reproducible.
- Over many runs, all files (baked + real) get exercised — that is the anti-overfit mechanism.
- Provide an **exhaustive mode** (env/flag) that runs *every* candidate file as its own sub-case for
  thorough audits; default off (keeps runtime ~constant). Never silently sample a subset without
  recording which files were skipped.

### 6.3 Shape-compatibility gate (mandatory)

A selected file MUST satisfy the scenario's **input** shape — container + input-side codecs — as
recorded in `_sources.ndjson`. Selection MUST NOT change *which capability is under test*: if a
scenario tests "remux h264+aac mp4", every candidate it draws must be h264+aac mp4. If a scenario's
real files do not match its required input shape, that is a **corpus bug** — fix the corpus (or drop
that file from the candidate set), never let it surface as an engine `NA_ENGINE`/`FAIL`.

### 6.4 Wiring

- Serve `fixtures/media/scenarios/` statically and repoint input resolution: `buildMediaInput` /
  `mediaAssetUrl` must produce the URL of the **selected file inside the scenario dir**, not
  `/fixtures/media/<id>`. Keep `MediaInput.id` meaningful (see §7/§10 — it drives golden lookup and
  reporting): use the baked fixture's asset id when the baked fixture is selected, and a stable
  per-file id (e.g. `<scenarioId>#<sha256-prefix>` or the `NN.<ext>` name) for real files.
- The baked fixture MUST remain selectable (it is still in the dir) so its golden-exact coverage is
  never lost.

### 6.5 Multi-input scenarios (`input: string[]`)

These consume several inputs **together** (e.g. `mux`, multi-probe), not as interchangeable
candidates. **v1 default:** keep the baked fixtures for multi-input scenarios (do not rotate). Only
rotate a slot if `_sources.ndjson` provides shape-compatible real files for *that slot*; otherwise
leave it baked. Do not fabricate slot pairings.

## 7. Oracles under file rotation (the crux)

Selecting a real file changes what evidence is available. Oracles split into two buckets (full table
in Appendix A). **The rule:**

> The **baked fixture** runs the **full** oracle set (it has goldens).
> A **real (golden-less) file** runs only the **survivor** oracles.
> A golden-keyed oracle on a golden-less file MUST record **`NA_ASSET`** — never a fabricated pass,
> never a false `FAIL`.

### 7.1 Survivor oracles — valid on ANY file, no golden needed

Structural / metamorphic / differential / smoke checks whose reference is computed on the fly (by the
reference engine `mediabunny` or the platform WebCodecs decoder) or is a pure invariant:
`mp4-box-layout`, `webm-live-layout`, `fanout-renditions`, `trim-boundaries`, `playback-smoke`,
`graceful-failure`, `reference-reimport`, `decoded-audio-pcm`, `ssim-psnr` (source-fallback arm), and
`property-invariant` sub-kinds: `transcode-output-metadata`, `decode-pts-strictly-increasing`,
`remux(remux(x))==remux(x)`, `audio-pcm-digest`, `flac-seektable-equivalence`, `trim-concat
additivity`, plus `alpha-plane` presence. **Prefer routing rotated real files through these.**

### 7.2 Golden-keyed oracles — break on a golden-less file

`golden-metadata`, `golden-packets`, `decoded-frames-bitexact`, `seek-accuracy`, `decrypt-bitexact`,
and `property-invariant` sub-kinds `decode-remux`, `seek-vs-linear-decode`, `vfr-seek`, `demux(mux)`,
`gapless-sample-count`, `probe-duration`. On a real file these have no ground truth. They MUST become
`NA_ASSET` (the runner already maps golden-bake gaps to `NA_ASSET`; do not let them emit a green or a
red). **Do not** invent a golden at runtime.

### 7.3 Metamorphic decrypt for `DERIVED` rotation (recommended addition)

`decrypt-bitexact` needs the cleartext twin's golden frames, which rotated `DERIVED` files lack. Add a
**golden-free** metamorphic oracle: `decode(decrypt(encrypted))` must equal `decode(cleartextBase)`,
both decoded in-browser with the platform engine — using the retained `_derived_cleartext/<sha>.mp4`
base recorded in `_sources.ndjson[...].files[].cleartextBase`. No stored golden, honest bit-exact
spirit, and it exercises the real encrypted files. (Keys/scheme are in the same record.)

### 7.4 Optional: regenerate goldens for real files *(override point, §14; heavy)*

If you want golden-*exact* coverage on real files too, bake goldens for them with the **existing**
offline pipeline — this is allowed under R1 because it only *reads* the file:

- `fixtures/bake.mjs` → `<id>.meta.json` (`ffprobe -show_format -show_streams`) and `<id>.packets.json`
  (`ffprobe -show_packets`) from the file **as-is** (never regenerate the media for a real file).
- `src/core/frame-bake.ts` / `scripts/frame-bake.mjs` → browser-decoded RGBA `<id>.frames.json` +
  `.ssim.json`.
Gate this behind explicit intent; it adds a native+browser bake step per file. Until then, golden-keyed
oracles on real files are honestly `NA_ASSET`.

## 8. Per-family playbook

| Family | Rotate real files? | Notes |
|---|---|---|
| `probe` | Yes | Survivors: structural/reference-probe. Golden-metadata/packets → `NA_ASSET` on real files unless §7.4. |
| `demux` | Yes | `reference-reimport`, `demux(mux)` needs golden → `NA_ASSET`; prefer reference-engine re-demux. |
| `remux` | Yes | Survivors strong: `mp4-box-layout`, `webm-live-layout`, `remux(remux)`, `reference-reimport`. |
| `transcode` | Yes | `transcode-output-metadata` + `ssim-psnr` source-fallback survive; `decoded-frames-bitexact` → `NA_ASSET`. |
| `decode-seek` | Yes (decode); Caution (seek) | `decode-pts-increasing`/`audio-pcm-digest` survive; `seek-accuracy`/golden-PTS → `NA_ASSET` unless §7.4. |
| `trim` | Yes | `trim-boundaries`, `trim-concat additivity` survive (reference probe/SSIM). |
| `mux` | v1 no (multi-input) | Keep baked unless shape-compatible per-slot real files exist (§6.5). |
| `encryption`/`DERIVED` | Yes | Use §7.3 metamorphic decrypt; keys+cleartextBase are in `_sources.ndjson`. |
| `metadata` | Yes | Prefer `property-invariant`/structural; exact-metadata goldens → `NA_ASSET` on real files. |
| `streaming-output` | v1 no | HLS/DASH sets; rotation of whole sets is a later phase. Keep baked. |
| `audio-dsp` | Yes | `audio-pcm-digest`, `decoded-audio-pcm`, `flac-seektable-equivalence` survive. |
| `robustness` | **No** | These are SYNTHETIC deliberate-corruption scenarios; the `mutate` is the test. Keep baked fixture; do not feed real files. |
| `performance` | Yes, carefully | Metrics must stay comparable: prefer candidates of comparable size/duration (sibling §9). Report per-file metrics; do not average across dissimilar files. |

## 9. Scoring & fairness

- **Reuse `isAdmissible`.** Do not change what counts. `PASS/FAIL/ERROR` admissible; `NA_*`/`SKIPPED`
  excluded. This is the fairness guarantee — protect it.
- **Rotation must not hide regressions.** A `FAIL` on *any* selected file is a real signal. In
  exhaustive mode, a scenario is only `PASS` for an engine if it passes **all** its files; report the
  offending file. In seeded-single mode, record which file was used so a `FAIL` is reproducible from
  the seed. Never average a `FAIL` into a pass.
- **Optional dual score** *(override point, §14)*: publish both a strict rate (unsupported=fail) and
  the capability-adjusted rate (unsupported excluded). Default: the single adjusted rate the code
  already computes.

## 10. Determinism & reproducibility

- Record, per result cell: the **selected file name + its `sha256`** (from `_sources.ndjson`), and the
  `runSeed`. A run must be replayable byte-for-byte from `(runSeed, corpus)`.
- Fold the selected files into `corpusChecksum` so a changed corpus is visible in the report (existing
  §13 caveat machinery in `report.ts`).
- `MediaInput.id` must stay stable per selected file (drives golden lookup + winner attribution).

## 11. Implementation plan (phased, keep the suite runnable at every step)

0. **Static serving + catalog loader.** Serve `fixtures/media/scenarios/` (dev server middleware near
   `frame-bake.ts`'s static mount). Add a loader that parses `_sources.ndjson` into
   `Map<scenarioId, FileRecord[]>`.
1. **Selection layer.** Implement seeded pick (§6.2) + shape gate (§6.3), including the baked fixture
   as a candidate; repoint `buildMediaInput`/`mediaAssetUrl` to the selected scenario-dir file (§6.4).
   Leave oracles unchanged: golden-keyed oracles will naturally hit `NA_ASSET` on real files — verify
   that, don't fake it.
2. **Reporting + guards.** Emit selected file + sha256 + seed per cell (§10). Add a guard that flags
   any scenario whose selected file yields **all-`NA`** (no admissible oracle) — that means the file
   gave zero signal; surface it, don't hide it.
3. **DERIVED metamorphic decrypt (§7.3).** Add the golden-free decrypt oracle so encryption rotation
   is meaningful.
4. **(Optional) Golden regeneration (§7.4)** and/or **exhaustive mode (§6.2)** and/or **multi-input
   slot rotation (§6.5)** — only if the owner wants deeper coverage.

Each phase is independently shippable and MUST NOT break the baked-fixture path (it remains a
selectable candidate with full goldens).

## 12. Definition of done

- The runner feeds each (non-excluded) scenario a file **selected from its own directory**, byte-for-
  byte as downloaded; the baked-fixture path still works and still gets full golden coverage.
- Statuses are honest per §4–§5: capability gaps `NA_ENGINE`, golden-less exactness `NA_ASSET`,
  attempted-but-wrong `FAIL`/`ERROR`; **no status collapsed, no pass manufactured, no file mutated.**
- Every result cell records the selected file + sha256 + seed; a run replays from `(runSeed, corpus)`.
- No scenario silently degrades to all-`NA` without being reported.
- Scoring still uses `isAdmissible` unchanged.
- Report: per-family counts of PASS/FAIL/ERROR/NA_*, the list of scenarios now exercised on real files
  vs still baked-only, and any scenario where a real file exposed a new `FAIL` (the valuable findings).

## 13. Anti-patterns (reject these outright)

- Transcoding/remuxing/trimming/"fixing" a downloaded file so a framework accepts it. *(R1)*
- Widening a tolerance, lowering a threshold, or per-engine-special-casing an oracle to green a
  `FAIL`. *(R2)*
- Switching to an easier file, or excluding a file, to avoid a `FAIL`. *(R2)*
- Emitting `NotApplicableError`/`NA_ENGINE` for a file that matches the engine's **declared**
  capabilities. *(R3/§5 — that is a disguised failure.)*
- Collapsing `NA_ENGINE`/`NA_BROWSER`/`NA_ASSET` into each other, or into `PASS`/`FAIL`.
- Fabricating or hand-editing a golden so a golden-keyed oracle greens on a real file. *(R2)*
- Averaging a `FAIL` across files into an aggregate pass. *(§9)*

## 14. Decisions baked in (override points)

Three defaults were chosen to honor §3. To change one, edit here **and** the referenced section before
implementing:

1. **Selection = seeded-random, one file per run (§6.2).** Alternatives: *all files every run*
   (exhaustive; N× runtime) or *baked-canonical + real as a separate non-scored audit*.
2. **Goldens = self-consistency + differential (§7).** Real files run survivor oracles; golden-exact
   stays on the baked fixture; golden-less exactness → `NA_ASSET`. Alternative: *regenerate per-file
   goldens via the reference bake pipeline* (§7.4). Rejected by default: *differential-only* (can't
   catch a bug all frameworks share).
3. **Capability gap = `NA_ENGINE`, excluded from pass-rate (§4–§5).** This is already the code's
   behavior. Alternative: *report both strict and adjusted rates* (§9). Rejected: *count capability
   gaps as `FAIL`* (penalizes narrow-scope frameworks; violates R3).

If a default is wrong for your intent, flip it here first — the rest of the doc references these three
choices by section.
