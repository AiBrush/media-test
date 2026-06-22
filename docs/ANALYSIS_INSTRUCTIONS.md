# Instructions for Claude Code — "Best Framework per Feature" Deep Technical Report

> **Audience:** Claude Code (the orchestrating "main agent"), running with `/effort max` (or at least `high`).
> **Goal:** Produce a ~558-row report that, for every feature test in the benchmark, names the **best of the 7 frameworks**, explains in **deep technical detail** *why* it surpassed the others, says **what every other framework did wrong**, and **validates that the test did not cheat** (no mock data, no fake media, no trivially-passing oracle, no stale/cached PASS).
>
> **You do not do the 558 analyses yourself.** You orchestrate them with the **Workflow tool (`/workflows`)**, spawning **one Opus agent per feature**. Each agent analyzes exactly one feature and returns a structured result. **You (the main agent) own the master table file**: create it empty first, then append one row per feature as each agent's result arrives.

---

## 0. The data you are working from

- **Run file (input):** `results/runs/results-chromium-2026-06-22T17-42-49-289Z.json` (~5.7 MB).
  - **⚠️ Never read this whole file into any agent's context — it is ~1.4M tokens.** You will shard it (Step 2) into 558 tiny per-scenario files; each agent reads only its own shard.
- **Distinct feature tests (scenarios):** **558**. Each `scenarioId` is `"<family>/<id>"`, e.g. `transcode/aac_to_mp3_mp4`.
- **Families (13):** `audio-dsp, decode-seek, demux, encryption, metadata, mux, performance, probe, remux, robustness, streaming-output, transcode, trim`.
- **Frameworks in scope (7):**
  - `mediabunny@1.48.0`
  - `platform@chrome-149`
  - `ffmpeg.wasm@0.12.15`
  - `mp4box@2.3.0`
  - `remotion-media-parser@4.0.479`
  - `web-demuxer@4.0.0`
  - `remotion-webcodecs@4.0.479`
- **Excluded:** `aibrush-media@dev` (internal dev engine, 0 wins). Drop it from all winner selection and from the report. (The shard step below removes it.)
- **Invariant:** after excluding the dev engine, each scenario has **exactly 7** result entries (3,906 ÷ 558 = 7). An agent must flag any shard that does not contain exactly 7.

### 0.1 Per-result entry schema (what each agent mines)

Each entry in `.results[]` has:

| Field | Meaning / how to use |
|---|---|
| `engineId` | One of the 7 frameworks (version-pinned). |
| `scenarioId` / `family` | The feature under test. |
| `status` | `PASS` \| `FAIL` \| `ERROR` \| `NA_ENGINE` \| `NA_BROWSER` \| `NA_ASSET` \| `SKIPPED`. **Only `PASS` engines are eligible to win.** |
| `reason` | Human-readable explanation — the primary evidence for *why a loser lost* (esp. NA/FAIL/SKIPPED). |
| `oracleOutcomes[]` | Correctness evidence. Each = `{ oracle, pass, detail, measurements{...} }`. This is the **correctness signal** — strength of the PASS. |
| `bench{}` | Performance. Per metric: `{ n, warmup, metric, median, p95, mad, unit, samples[] }`. Metrics seen: `wall` (ms, lower better), `throughputRealtime` (x-realtime, higher better), `peakMemory` (bytes, lower better), `longtasks` (ms, lower better), `targetWrites` (count); scenarios may also carry decode/encode FPS, source reads, output bytes. |
| `primaryMetric` | The headline metric for that scenario — use it as the primary perf tiebreak. |
| `durationMs` | Total wall incl. harness overhead. |
| `cached` | `true` ⇒ this PASS was **reused from an earlier run**, not freshly executed. **Anti-cheat flag** — note staleness risk on any cached winner. |
| `env.configUsed` | *How* the engine ran: `backend` (webcodecs/wasm/…), `hwAccel`, `wasmThreads`, `sharedArrayBuffer`, `coopCoep`, `pipeline`, `pixelBackend`, etc. Use this in the "why" (e.g. hardware WebCodecs vs single-thread wasm). |

### 0.2 Oracle strictness ladder (used to rank correctness)

Oracles are **not** equally strong. When two engines both PASS, the one whose PASS rests on a *stricter* oracle has the stronger correctness claim:

1. **Bit-exact / cryptographic** (strongest): `decoded-frames-bitexact`, `golden-packets`, `decrypt-bitexact`.
2. **Structural / metadata-exact:** `mp4-box-layout`, `webm-live-layout`, `golden-metadata`, `seek-accuracy`, `trim-boundaries`, `reference-reimport`, `decoded-audio-pcm`, `alpha-plane`, `fanout-renditions`, `property-invariant`.
3. **Perceptual proxy:** `ssim-psnr` — and **weaker still when `measurements.exactFrames == 0`** (pixel match unverified, digest proxy only).
4. **Smoke (weakest):** `playback-smoke` — only proves the output plays, not that it is correct.

Oracle implementations live in `src/core/oracles.ts`. An agent validating a win **must read the gating oracle's code** to confirm it is a real comparison against goldens/decoded output and not trivially satisfiable.

---

## RUN ORDER (what you, the main agent, do — in sequence)

1. **Step 1 — Sanity-check the environment & counts.**
2. **Step 2 — Shard the run file** into 558 per-scenario JSON files + a manifest.
3. **Step 3 — Create the empty master table file** (headers only).
4. **Step 4 — For each of the 13 families: run a Workflow** that spawns one Opus agent per feature in that family. When the workflow returns the family's rows, **append them to the master table** and confirm each agent wrote its detail file. (This is the incremental "write into the table as results arrive" loop, batched by family for resumability.)
5. **Step 5 — Final synthesis:** leaderboard + validation roll-up + sanity checks.

Do not skip steps. Do not start Step 4 before the empty table exists in Step 3.

---

## Step 1 — Sanity checks

Run these and confirm the numbers before doing anything else. Abort and report if they disagree.

```bash
cd /Users/tarekbadr/Home/software/projects/aibrush/aibrush.lib/media-test/media-browser-test
RUN="results/runs/results-chromium-2026-06-22T17-42-49-289Z.json"
which jq                                                          # must exist
jq -r '.results|length' "$RUN"                                   # expect 4464
jq -r '[.results[]|select(.engineId!="aibrush-media@dev")]|length' "$RUN"  # expect 3906
jq -r '[.results[].scenarioId]|unique|length' "$RUN"             # expect 558
jq -r '[.results[].engineId]|unique|.[]' "$RUN"                  # expect 8 ids (7 + aibrush-media@dev)
```

---

## Step 2 — Shard the run file (one tiny JSON per feature) + manifest

Each shard holds the 7 in-scope engine results for one scenario plus its metadata. This is what each agent reads instead of the 5.7 MB monster.

```bash
cd /Users/tarekbadr/Home/software/projects/aibrush/aibrush.lib/media-test/media-browser-test
RUN="results/runs/results-chromium-2026-06-22T17-42-49-289Z.json"
mkdir -p results/report/shards results/report/details

# One compact object per scenario (7 in-scope engines only).
jq -c '
  .results
  | map(select(.engineId != "aibrush-media@dev"))
  | group_by(.scenarioId)[]
  | { scenarioId: .[0].scenarioId, family: .[0].family, engineCount: length, engines: . }
' "$RUN" > results/report/_scenarios.ndjson

wc -l < results/report/_scenarios.ndjson    # expect 558

# Explode to one file per scenario + build a manifest line each.
: > results/report/_index.ndjson
while IFS= read -r line; do
  sid=$(printf '%s' "$line" | jq -r '.scenarioId')
  safe=$(printf '%s' "$sid" | sed 's#[/ ]#__#g; s#[^A-Za-z0-9_.-]#_#g')
  printf '%s' "$line" > "results/report/shards/${safe}.json"
  printf '%s' "$line" | jq -c --arg s "$safe" \
    '{scenarioId, family, engineCount, shard:("results/report/shards/"+$s+".json"), detail:("results/report/details/"+$s+".md")}' \
    >> results/report/_index.ndjson
done < results/report/_scenarios.ndjson

jq -s '.' results/report/_index.ndjson > results/report/_index.json
ls results/report/shards | wc -l            # expect 558
# Quick check: every scenario has exactly 7 engines
jq -s '[.[]|select(.engineCount!=7)]|length' results/report/_index.ndjson   # expect 0
```

Artifacts produced:

- `results/report/shards/<safe>.json` — per-feature input (a few KB each).
- `results/report/_index.json` — manifest: `[{scenarioId, family, engineCount, shard, detail}]`.

---

## Step 3 — Create the empty master table (you own this file)

Create `results/report/best-framework-by-feature.md` with **only the header** (no rows yet):

```text
# Best Framework per Feature — Media-Engine Benchmark

Source run: results/runs/results-chromium-2026-06-22T17-42-49-289Z.json
Browser: chromium 149 · GPU: Apple M1 Max (ANGLE Metal) · suite 0.1.0
Frameworks compared (7): mediabunny@1.48.0, platform@chrome-149, ffmpeg.wasm@0.12.15,
mp4box@2.3.0, remotion-media-parser@4.0.479, web-demuxer@4.0.0, remotion-webcodecs@4.0.479
(aibrush-media@dev excluded: internal dev engine, 0 wins.)

Status: 0 / 558 features analyzed.

| # | Feature (scenarioId) | Family | Best Framework | Why it wins (technical) | What the other frameworks did wrong | Validation | Detail |
|---|---|---|---|---|---|---|---|
```

> The user's four required columns are **Feature**, **Best Framework**, **Why it wins (technical reason)**, and **What the other frameworks did wrong**. `Family`, `Validation`, and `Detail` are added because (a) validation/anti-cheat was explicitly requested and (b) the deep prose cannot fit in a table cell, so each row links to a per-feature detail file. Keep these unless told otherwise.

**Table-cell rules (enforce when appending rows):** every cell is a single line; escape `|` as `\|`; no raw newlines (use `;` or `<br>`). The full multi-paragraph technical analysis goes in the **detail file**, not the table.

---

## Step 4 — Run the per-feature Opus agents via Workflow, family by family

For each family (13 of them), call the **Workflow tool** with the script in **§4.3**, passing that family's manifest slice as `args`. When it returns the family's row objects, **append one table row per object** to `results/report/best-framework-by-feature.md`, update the "Status: N / 558" line, and verify each `detailPath` file now exists.

Process families largest-last or smallest-first as you like; suggested order (small→large for fast early feedback): `encryption (13), metadata (25), streaming-output (27), performance (33), audio-dsp (36), trim (42), demux (43), decode-seek (43), remux (49), probe (51), mux (52), robustness (60), transcode (84)`.

### 4.1 Resumability

Before running a family, drop items whose detail file already exists AND whose row is already in the master table — pass only the not-yet-done items as `args.items`. This makes the whole run restartable after any interruption. (The Workflow tool also supports `resumeFromRunId`, but the file-existence filter is simpler and authoritative here.)

### 4.2 The structured output schema (paste verbatim into the script)

Each agent returns this compact object (the heavy prose lives in the detail file it writes):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["scenarioId","family","bestFramework","passCount","contested",
               "whyShort","othersShort","validationVerdict","validationNote",
               "cachedWinner","confidence","detailPath"],
  "properties": {
    "scenarioId":        {"type":"string"},
    "family":            {"type":"string"},
    "bestFramework":     {"type":"string","description":"winning engineId, or 'NONE' if no engine passed"},
    "passCount":         {"type":"integer","description":"how many of the 7 PASSed"},
    "contested":         {"type":"boolean","description":"true if >=2 engines PASSed"},
    "whyShort":          {"type":"string","maxLength":340,"description":"1-2 sentences w/ the decisive numbers; single line; '|' escaped"},
    "othersShort":       {"type":"string","maxLength":340,"description":"terse per-loser summary; single line; '|' escaped"},
    "validationVerdict": {"type":"string","enum":["REAL","WEAK-GATE","SUSPECT","CHEAT","INCONCLUSIVE"]},
    "validationNote":    {"type":"string","maxLength":240,"description":"single line; cite file:line"},
    "cachedWinner":      {"type":"boolean","description":"winner's result had cached==true"},
    "confidence":        {"type":"string","enum":["high","medium","low"]},
    "detailPath":        {"type":"string","description":"path to the detail .md the agent wrote"}
  }
}
```

### 4.3 The Workflow script

Call the Workflow tool with `args = { batch: "<family>", items: [ ...manifest slice... ] }` and this `script` (the agent prompt is fully self-contained — subagents never see this instruction file):

```js
export const meta = {
  name: 'best-framework-per-feature',
  description: 'Per media feature: pick best of 7 frameworks, explain why deeply, validate no cheating',
  phases: [{ title: 'Analyze' }],
}

const ROW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['scenarioId','family','bestFramework','passCount','contested',
             'whyShort','othersShort','validationVerdict','validationNote',
             'cachedWinner','confidence','detailPath'],
  properties: {
    scenarioId:{type:'string'}, family:{type:'string'},
    bestFramework:{type:'string'}, passCount:{type:'integer'}, contested:{type:'boolean'},
    whyShort:{type:'string',maxLength:340}, othersShort:{type:'string',maxLength:340},
    validationVerdict:{type:'string',enum:['REAL','WEAK-GATE','SUSPECT','CHEAT','INCONCLUSIVE']},
    validationNote:{type:'string',maxLength:240},
    cachedWinner:{type:'boolean'},
    confidence:{type:'string',enum:['high','medium','low']},
    detailPath:{type:'string'},
  },
}

const ENGINE_DIRS = `mediabunny@1.48.0 -> src/engines/mediabunny (env.engineId "mediabunny")
platform@chrome-149 -> src/engines/platform (env.engineId "platform")
ffmpeg.wasm@0.12.15 -> src/engines/ffmpeg-wasm (env.engineId "ffmpeg-wasm")
mp4box@2.3.0 -> src/engines/mp4box (env.engineId "mp4box")
remotion-media-parser@4.0.479 -> src/engines/remotion-media-parser
web-demuxer@4.0.0 -> src/engines/web-demuxer
remotion-webcodecs@4.0.479 -> src/engines/remotion-webcodecs`

function PROMPT(it) {
  return `You are a media-codec engineer doing a forensic, deeply technical comparison for ONE feature test.

FEATURE (scenarioId): ${it.scenarioId}
FAMILY: ${it.family}
INPUT SHARD (read this; do NOT read the 5.7MB run file): ${it.shard}
DETAIL FILE YOU MUST WRITE: ${it.detail}

The shard is a JSON object { scenarioId, family, engineCount, engines:[ ...7 result entries... ] }.
Each engine entry has: engineId, status, reason, oracleOutcomes[] ({oracle,pass,detail,measurements}),
bench{} (per-metric {median,p95,mad,unit,samples,n}), primaryMetric, durationMs, cached, env.configUsed.

THE 7 FRAMEWORKS AND THEIR ADAPTER CODE:
${ENGINE_DIRS}
Scenario definitions: src/scenarios/${it.family}/  (find this scenario by its id after the slash:
grep -rn "id: '<id>'" src/scenarios/${it.family}/  — also check _shared.ts in that folder).
Oracle implementations: src/core/oracles.ts . Capability/NA logic: src/core/runner.ts, src/core/registry.ts.
Real media fixtures: fixtures/media/ . Goldens: fixtures/golden/ .

================= TASK =================
A) PICK THE BEST FRAMEWORK (decision procedure — follow exactly):
   1. Eligibility: ONLY engines with status=="PASS" can win.
   2. If 0 PASS -> bestFramework="NONE". Explain why every engine failed: quote each engine's status+reason.
   3. If exactly 1 PASS -> uncontested winner. The "why" = which capability/oracle it satisfied that others
      could not; "what others did wrong" = each loser's status+reason (NA_ENGINE=op not declared,
      NA_BROWSER=runtime lacks capability, FAIL=which oracle failed + measurements).
   4. If >=2 PASS -> CONTESTED. Rank by, in order:
      (a) CORRECTNESS STRENGTH first: number AND strictness of oracles passed, using this ladder
          (strongest->weakest): bit-exact/crypto (decoded-frames-bitexact, golden-packets, decrypt-bitexact)
          > structural/metadata-exact (mp4-box-layout, webm-live-layout, golden-metadata, seek-accuracy,
          trim-boundaries, reference-reimport, decoded-audio-pcm, alpha-plane, fanout-renditions,
          property-invariant) > perceptual proxy (ssim-psnr; WEAKER if measurements.exactFrames==0)
          > smoke (playback-smoke). Tighter measured tolerances / higher exactFrames win.
      (b) If correctness is comparable: PERFORMANCE. Use primaryMetric first, then bench: wall median (lower
          better), throughputRealtime (higher), peakMemory (lower), longtasks (lower), plus targetWrites /
          outputBytes / decodeFps / encodeFps when present. ALWAYS report the numeric MARGIN over the
          runner-up as a ratio (e.g. "1.8x faster wall, 0.46x peak memory"). Note sample count n and
          mad/p95 spread — a win on n==1 is weaker evidence; say so.
      (c) Tiebreakers: hardware WebCodecs vs single-thread wasm (env.configUsed.backend/hwAccel/wasmThreads),
          no COOP/COEP requirement, streaming vs whole-file buffering, smaller bundle.
   5. Report the decisive factor explicitly.

B) DEEP TECHNICAL "WHY" (this is the point of the exercise — be specific, not generic):
   Explain mechanistically why the winner surpassed the rest for THIS codec/container/operation. Reference:
   the actual codec & container (e.g. H.264 in MP4 vs VP8 in WebM, AAC/Opus/FLAC, fragmented vs faststart,
   CENC/CBCS encryption), the backend it used (from env.configUsed), the oracle measurements (real numbers
   from the shard), and the winner's adapter implementation (cite src/engines/<dir>/... file:line for the
   concrete code path that made the difference). For every NON-winner, state precisely what it did wrong
   (cite its status+reason; if it PASSed but lost, give the metric gap; if it FAILed, name the oracle and the
   failing measurement; if NA, say whether the NA looks honest or like an under-declared capability).

C) ANTI-CHEAT / CODE VALIDATION (a test may "cheat" — your job is to catch it):
   1. Open the scenario definition (grep its id under src/scenarios/${it.family}/). Confirm the INPUT is a
      REAL fixture file that exists in fixtures/media/ (check the 'asset'/input field; ls/stat it). Reject
      synthetic/empty/mock inputs. Read 'notes' for the gating rationale.
   2. Open the WINNER's adapter (src/engines/<dir>/). Confirm the operation is GENUINELY implemented — calls
      the real library / WebCodecs / wasm — and does NOT: return canned/hardcoded output, copy input->output
      to fake a transcode/remux, short-circuit to the golden file, or swallow errors and report success.
   3. Open the gating oracle(s) in src/core/oracles.ts. Confirm it performs a REAL comparison against
      goldens/decoded output and is not trivially satisfiable (tolerance so wide anything passes; ssim-psnr
      with exactFrames==0; a smoke-only gate where a correctness gate was expected). Check that the
      oracleOutcomes.measurements are physically plausible for real media (real packet/keyframe counts,
      durations, SSIM values, byte sizes).
   4. If the winner's result has cached==true, note staleness risk explicitly (it was reused, not re-run).
   5. Verdict (validationVerdict):
      REAL = real fixture + real implementation + meaningful oracle.
      WEAK-GATE = passes, but the oracle is loose/proxy/smoke-only (PASS is real but not strong).
      SUSPECT = something looks off (cached-only evidence, suspiciously trivial path) — explain.
      CHEAT = concrete evidence of mock data / faked output / oracle that cannot fail — explain with file:line.
      INCONCLUSIVE = could not access code/fixtures to decide — say what was missing.

================= OUTPUTS (TWO of them) =================
1) WRITE the detail markdown file to exactly ${it.detail} using the Write tool, with this structure:
   - "# ${it.scenarioId}" then a metadata line (family, fixture asset(s), primaryMetric, passCount).
   - "## Verdict": best framework, contested/uncontested, decisive factor, margin over runner-up.
   - "## Per-engine results": a markdown table with ALL 7 engines — engine | status | oracles passed
     (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason. Use real shard numbers.
   - "## Why the winner wins (deep technical)": multi-paragraph mechanistic explanation per section B,
     citing adapter file:line and the exact oracle measurements.
   - "## What each other framework did wrong": one bullet per non-winner with precise cause.
   - "## Anti-cheat validation": scenario file:line, fixture asset (and that it exists), oracle file:line,
     winner adapter file:line, the verdict + justification, and the cached note.
   - "## Confidence & caveats".
   Be deeply technical and quantitative. Use ONLY real values from the shard/code — never invent numbers.
2) RETURN the compact JSON row (the StructuredOutput tool will enforce the schema). detailPath must equal
   ${it.detail}. whyShort/othersShort/validationNote must be SINGLE LINE with '|' escaped as '\\|'.`
}

const items = args.items
log('Analyzing ' + items.length + ' features in family: ' + args.batch)

const rows = await pipeline(
  items,
  (it) => agent(PROMPT(it), {
    label: it.scenarioId,
    phase: 'Analyze',
    model: 'opus',
    effort: 'high',
    schema: ROW_SCHEMA,
  })
)

return rows.filter(Boolean)
```

### 4.4 Appending rows (after each family's Workflow returns)

For each returned row object, append one line to the master table (continuing the running `#` counter), e.g.:

```text
| 137 | demux/h264_mp4_basic | demux | mediabunny@1.48.0 | Only engine passing golden-packets bit-exact (1240/1240 pkts, 945 keyframes) AND fastest: 1.8x wall vs mp4box, 0.46x peak mem; hardware WebCodecs demux path | mp4box PASS but 1.8x slower & weaker oracle (structural only); web-demuxer FAIL seek-accuracy (Δ 3 frames); ffmpeg.wasm NA_ENGINE (no demux op); platform NA_BROWSER (no MSE path) | REAL — real fixture h264.mp4, genuine demux in adapter.ts:88, golden-packets oracle real (oracles.ts:704) | [detail](details/demux__h264_mp4_basic.md) |
```

*(The row above is a **format example only** — not a real result. The agents produce the real content.)*

Then update the "Status: N / 558 features analyzed." line, and verify each `detailPath` exists (`ls`). If any agent returned `null` (skipped/died), re-queue that single item in the next Workflow call.

---

## Step 5 — Final synthesis

After all 13 families are done (558 rows present, 558 detail files exist), write `results/report/leaderboard.md` containing:

1. **Wins per framework** — count of features where each engine is `bestFramework`; also break out **contested wins** vs **uncontested** (passCount==1) wins. Sort descending.
2. **Per-family winner breakdown** — which engine dominates each of the 13 families.
3. **Validation roll-up** — counts by `validationVerdict`. **List every `CHEAT` and `SUSPECT` feature** with its `validationNote` (these are the integrity findings the user cares about most). Also list `WEAK-GATE` features (PASSes resting on loose/proxy/smoke oracles) and **cached winners** (`cachedWinner==true`).
4. **No-winner features** — the features where `bestFramework=="NONE"`, with why.
5. **Confidence roll-up** — counts of high/medium/low; list every `low`-confidence feature so they can be revisited.
6. **Sanity checks:** confirm 558 rows, 558 detail files, every `bestFramework` is one of the 7 (or `NONE`), and `#` numbering is contiguous 1..558.

Then update the master table's header `Status:` line to `558 / 558` and add a one-line link to `leaderboard.md`.

---

## Guardrails (do / don't)

- **Do** keep the master table single-line per cell; **do** put all deep prose in detail files.
- **Do** make every agent cite `file:line` for adapter code and oracle code, and use only real numbers from the shard.
- **Do** treat `cached==true` winners as needing an explicit staleness note.
- **Don't** let any agent read the 5.7 MB run file — only its shard + the relevant source/fixtures.
- **Don't** include `aibrush-media@dev` as a candidate winner.
- **Don't** fabricate metrics, oracle results, or file paths. If something can't be verified, the verdict is `INCONCLUSIVE` and confidence is `low`.
- **Scale/cost note:** this spawns 558 Opus agents at `effort: high`. That is intentional (the user asked for one Opus agent per feature). The Workflow concurrency cap (~14 at once) and the per-family batching keep it bounded and resumable; expect a long, token-heavy run.

## Alternatives (only if the user prefers)

- **Single Workflow over all 558** instead of 13 family batches: pass the whole manifest as `args.items`; the main agent writes the table once at the end. Simpler, but less incremental and a larger return payload — the family-batched loop above is recommended because it matches "write into the table as results arrive" and is restartable.
- **Main agent writes detail files too** (agents return full prose instead of writing files): only do this if the user wants the main agent to own every write; it costs much more main-agent context (558 long analyses funneled through one context) and is not recommended.
