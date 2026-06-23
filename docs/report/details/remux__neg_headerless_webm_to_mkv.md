# remux/neg_headerless_webm_to_mkv

family: remux | fixture asset: `remux_headerless_webm.webm` (9.3 MB, EBML header zeroed) | primaryMetric: wall (declared metrics: wall, peakMemory) | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **YES** — two engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Both pass the *same single* oracle `graceful-failure`, which is a smoke-level "rejected without crash/hang/OOM" gate (no correctness/structural comparison exists for a negative test — by design there is no valid output).
- Decisive factor: **rejection latency**. mediabunny rejected the unparseable input in `durationMs=9` vs ffmpeg.wasm `durationMs=311` — a **~34.6x faster** clean rejection. Correctness strength is identical (both satisfy graceful-failure and only that), so the tie breaks on performance per the decision ladder.
- Margin over runner-up: 9 ms vs 311 ms on the per-run duration (both `cached==true`, n is the single cached run; weak-evidence on sample count — see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (no bench; durationMs=9) | n/a | n/a | n/a | cached: graceful: Input has an unsupported or unrecognizable format. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (no bench; durationMs=311) | n/a | n/a | n/a | cached: graceful: ffmpeg could not read input for probe. Log: op1.in: Invalid data found when processing input \| Aborted() |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

No `bench{}` block is present for any engine in this shard; the only timing signal is the per-run `durationMs`. The declared metrics (`wall`, `peakMemory`) are not benched here because the op throws before any throughput phase exists.

## Why the winner wins (deep technical)

This is a **negative robustness probe of the remux op**, not a transcode. The fixture `remux_headerless_webm.webm` is a real 9.3 MB WebM whose EBML header has been destroyed — the first bytes are all `0x00` (verified via hex dump: bytes 0x00–0x4F are entirely zero). A valid Matroska/WebM stream must begin with the EBML magic `0x1A45DFA3`; with that magic zeroed the demux stage has no recognizable top-level element ID, and a naive parser can loop forever on a bogus VINT element size. The scenario's contract (see notes in `src/scenarios/remux/negative.ts:72-75`) is precisely that "the demux stage of remux must reject the unparseable header gracefully rather than loop on a bogus element size." There is no golden output to match — for a negative case, *clean rejection within the 15 s timeout IS the correct behavior* (`REMUX_NEG_TIMEOUT_MS = 15_000`, `src/scenarios/remux/negative.ts:27`).

mediabunny's `remux()` (`src/engines/mediabunny/adapter.ts:1244-1260`) is a genuine library call: it builds the MKV output format via `makeOutputFormat(opts.container, ...)`, opens the input with `openInput(this.lib, input)` (line 1252) — which for in-memory mutated/negative fixtures uses a `BlobSource` so the byte stream is read directly (adapter line 274 / comment at 237-241) — then runs `runConversion(...)`. The throw happens inside `openInput`: mediabunny's `Input` format detection probes the leading bytes against `ALL_FORMATS` singletons, finds no matching container magic (the EBML signature is zeroed), and raises **"Input has an unsupported or unrecognizable format."** — exactly the reason string recorded in the shard. The runner catches that synchronous/async rejection and routes the scenario through the graceful path, so the `graceful-failure` oracle infers "operation produced no output and did not crash/hang → handled gracefully" (`src/core/oracles.ts:2607-2610`, the `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` branch). Crucially mediabunny fails at **format recognition** (a cheap leading-bytes check) rather than after committing to a parse, which is why it returns in **9 ms** — it never attempts to walk a single (bogus) Matroska cluster.

ffmpeg.wasm also passes the same oracle but reaches the rejection through a heavier path: its log shows the failure surfaced during the *probe* stage — "op1.in: Invalid data found when processing input | Aborted()". That is libavformat's probe scoring (`av_probe_input_format`) running across the buffered input and the wasm module hitting an `abort()` when no demuxer claims the bytes. ffmpeg.wasm must first materialize the input into its MEMFS (`op1.in`), spin up the wasm runtime, and run the full probe heuristic before giving up — hence **311 ms**, ~34.6x slower than mediabunny's pure-TS leading-magic check. mediabunny's configUsed confirms a lightweight, no-COOP/COEP, single-thread-friendly path: `coreBuild: pure-ts-esm`, `sharedArrayBuffer: false`, `coopCoep: not-required`, `wasmThreads: 0`, `backend: webcodecs`. For a negative test the WebCodecs backend is never engaged (no decode/encode occurs), so the win is purely the cheaper TypeScript format sniff vs a wasm probe round-trip. Both outcomes are correct; mediabunny is simply the faster, lower-overhead rejector and requires no cross-origin isolation.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** Correct graceful rejection, but ~34.6x slower (311 ms vs 9 ms) because it loads the wasm runtime, copies the 9.3 MB input into MEMFS, and runs libavformat's full probe before aborting ("Invalid data found when processing input | Aborted()"). No correctness gap — identical oracle set.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — "engine does not declare input container 'webm'." mp4box.js is an ISO-BMFF/MP4 parser and genuinely cannot ingest Matroska/WebM, so it cannot even attempt this WebM→MKV remux. Capability declaration matches reality.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA — "engine does not declare operation 'remux'." It is a parser/demuxer, not a muxer; no remux op to exercise.
- **web-demuxer@4.0.0 (NA_ENGINE):** Honest NA — "engine does not declare operation 'remux'." Demux-only library; no container-writing path.
- **platform@chrome-149 (NA_ENGINE):** Honest NA — "engine does not declare operation 'remux'." Raw WebCodecs has no built-in container remux op; this adapter does not expose one.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** Honest NA — "engine does not declare output container 'mkv'." It can do some remux/transcode but does not declare MKV as an output container, so the WebM→**MKV** target is out of its declared scope.

All five NAs look honest (capability-true), not under-declared: each maps to a real architectural limitation (no WebM input, no remux op, or no MKV output) rather than an avoidance of a doable operation.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/negative.ts:66-75` (case `neg_headerless_webm_to_mkv`), assembled into a `Scenario` at `src/scenarios/remux/negative.ts:78-96` with `op: 'remux'`, `oracles: ['graceful-failure']`, `timeoutMs: 15_000`.
- Fixture: `asset: 'remux_headerless_webm.webm'` → `fixtures/media/remux_headerless_webm.webm` **EXISTS** (9.3 MB). It is a REAL, large WebM whose EBML header has been deliberately zeroed (hex dump confirms leading bytes are `0x00`), i.e. a genuine deterministic malformed fixture — not synthetic/empty/mock. A zero-length file would be a different (probe) case; this one is large with a destroyed header, matching the "loop on a bogus element size" rationale in the notes.
- Oracle: `gracefulFailure` at `src/core/oracles.ts:2586-2623`. For a negative test the meaningful assertion is "no output produced AND no crash/hang/OOM." It is **not trivially always-pass**: line 2614-2617 explicitly FAILs if the engine emits output from malformed input, and the robustness/graceful runner path FAILs on a hang/timeout. So an engine that looped (the exact hazard called out for a zeroed EBML header) or that fabricated an MKV would NOT pass.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1260`. The remux op genuinely calls `openInput` → `new Output({format, target})` → `runConversion`; the recorded reason "Input has an unsupported or unrecognizable format." is mediabunny's real format-detection error, not a canned string, not a copy of input→output, not a short-circuit to a golden. The failure is thrown by the library, caught by the runner, and reported as graceful — exactly the intended behavior.
- Verdict: **REAL** for the implementation/fixture, but the gate is a smoke-level negative oracle. Because the single passing oracle is `graceful-failure` (no correctness/structural comparison — by construction there can be none for a negative input), the strength of evidence is a "did-not-crash" smoke gate. I classify the overall as **WEAK-GATE**: the PASS is genuine and the rejection is real, but it is a smoke-only gate, so it should not be read as a strong correctness win — only as "mediabunny rejects malformed WebM cleanly and fastest."
- Cached note: both PASS engines have `cached==true` (mediabunny startedAt 2026-06-22T14:05Z, ffmpeg.wasm 2026-06-22T16:39Z). The 9 ms vs 311 ms numbers are reused, not freshly re-run; staleness risk is low for a deterministic negative case but the timing margin rests on single cached runs.

## Confidence & caveats

- Confidence: **medium**. Winner selection is unambiguous (only 2 PASS, identical oracle set, clear 34.6x latency gap), and the implementation + fixture + oracle were all inspected and are real.
- Caveats: (1) The deciding metric is the per-run `durationMs` only — there is no `bench{}` block, no median/p95/mad, and both runs are `cached`, so the timing margin is single-sample evidence (weak statistically, though the >30x gap is large enough that the ordering is robust). (2) This is a negative test gated by a smoke-level `graceful-failure` oracle; "best" here means "rejects malformed WebM cleanly and fastest," not "best at producing correct WebM→MKV output." (3) ffmpeg.wasm's slower number partly reflects unavoidable wasm-runtime + MEMFS load overhead, which is structural rather than a correctness deficiency.
