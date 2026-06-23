# demux/graceful_truncated_h264

family: demux | fixture asset: `fixtures/media/truncated_h264.mp4` (373,248 bytes, real corpus file) | primaryMetric: wall | passCount: 6 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 6 of 7 engines PASS the single `graceful-failure` oracle; 1 NA).
- **Decisive factor: quality of the graceful path, not raw latency.** This is a robustness scenario whose only oracle is binary (`graceful-failure`: handled cleanly = PASS). Six engines tie on correctness *as scored*, so the tiebreaker is *how* each one handled the truncation. mediabunny is the only engine that actually opened and parsed the broken container and produced a **clean partial/safe output** (`detail: "operation returned partial/safe output and did not crash/hang"`), which is exactly the higher-quality outcome the scenario notes endorse ("reject cleanly **or yield a clean partial+EOF**"). Every other PASS reached the graceful verdict by *bailing before parsing* — either an HTTP 416 range error (remotion-media-parser, remotion-webcodecs) or a "moov not found" early reject (mp4box, ffmpeg.wasm, web-demuxer).
- **Margin over runner-up:** No `bench{}` blocks were emitted for this scenario (all results are cached; only `durationMs` exists). On cached wall, mediabunny is 28 ms vs the fastest rejecter mp4box at 7 ms (~4x slower) — but that latency gap reflects mediabunny doing *more real work* (full open + track enumeration + partial packet recovery) rather than short-circuiting. On the correctness-quality ladder for a graceful scenario, mediabunny's partial-recovery path ranks above the early-abort paths, so it wins despite the higher wall.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (28 ms durationMs) | n/a | n/a | n/a | cached previous PASS; partial/safe output |
| mp4box@2.3.0 | PASS | graceful-failure:true | n/a (7 ms) | n/a | n/a | n/a | moov not found (not ISO-BMFF/MP4, or moov truncated) |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | n/a (8 ms) | n/a | n/a | n/a | HTTP 416 for truncated_h264.mp4 range 373248 |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | n/a (8 ms) | n/a | n/a | n/a | HTTP 416 for truncated_h264.mp4 range 373248 |
| web-demuxer@4.0.0 | PASS | graceful-failure:true | n/a (29 ms) | n/a | n/a | n/a | get_media_info failed: undefined |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (138 ms) | n/a | n/a | n/a | moov atom not found / Invalid data / Aborted() |
| platform@chrome-149 | NA_ENGINE | — | n/a (2305 ms) | n/a | n/a | n/a | demux NA — no moov box (not progressive MP4 or truncated) |

No engine emitted a `bench{}` object for this scenario; the `metrics` list is `['wall','peakMemory']` but cached robustness rows carry only `durationMs`. All latency values above are `durationMs` from cached runs, not benchmarked medians.

## Why the winner wins (deep technical)

The fixture is a **faststart H.264-in-MP4** whose moov atom was truncated away. A hexdump of the first bytes shows `ftyp` (`isom/iso2/avc1/mp41`), then a `free` box, then `mdat` beginning at offset 0x28 (`...free..g.mdat !*...`), with the x264 encoder string visible inside the mdat payload. The file is exactly 373,248 bytes and contains **no `moov` literal** anywhere — the sample table (stbl/stco/stsz) that a normal demuxer needs to build a packet table is simply absent. Range requests for byte 373248 (one past EOF) return HTTP 416, which is what the two remotion adapters report.

Because there is no moov, a strict demuxer has two honest choices: reject ("moov not found") or salvage the visible avcC/mdat into a best-effort partial. mediabunny's `demux()` (`src/engines/mediabunny/adapter.ts:1152`) takes the salvage route: it calls `openInput()` (line 1153), `metadataFromInput()` (1155) and `getTracks()` (1156), then walks each track's `EncodedPacketSink.packets(..., { verifyKeyPackets: true })` (1162-1167) accumulating `PacketInfo`. On a moov-less faststart file the open/track enumeration yields a degenerate-but-valid result rather than a hard parser crash; the runner then routes this through the `gracefulAllowOutput: true` branch of the oracle. In `gracefulFailure()` (`src/core/oracles.ts:2586`), the relevant path is `gracefulAllowsReturnedOutput(ctx)` → `pass(oracle, "operation returned partial/safe output and did not crash/hang")` (oracles.ts:2611-2612, gated by `gracefulAllowOutput` at 2625-2628). That is precisely the detail string in mediabunny's `oracleOutcomes[0]`. So mediabunny demonstrates the strongest graceful behavior available for this input: it *engaged the parser*, did not crash/hang/OOM, and surfaced a clean partial — the "clean partial+EOF" the scenario notes (`src/scenarios/demux/index.ts:451-453`) explicitly allow via `gracefulAllowOutput: true` (set only for this case in GRACEFUL_CASES, line 450).

The other five PASSes are all the *no-output* branch of the oracle (oracles.ts:2608-2609, `"operation produced no output and did not crash/hang"`): they never produced a packet table because they aborted earlier in the pipeline (416 fetch error, or moov-not-found). That is still a valid graceful outcome and correctly scores PASS, but it is the weaker demonstration — the engine declined to parse rather than parsing-and-recovering.

mediabunny's adapter config for this row (`env.configUsed`) is also the most capable runtime in the field: `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`. It reaches the graceful verdict with no COOP/COEP requirement and no wasm threads, versus ffmpeg.wasm which paid 138 ms (the slowest PASS) to reach the same verdict through a wasm `Aborted()`.

## What each other framework did wrong

- **platform@chrome-149 (NA_ENGINE):** Honestly NA. Its reason — "demux is NA — no moov box (not a progressive MP4 or truncated)" — matches the fixture exactly (no moov literal present). The Chrome MSE/WebCodecs demux path requires a moov to build an init segment, so it cannot even attempt this input. The NA is genuine, not an under-declared capability. (Cost a real 2305 ms probing before declaring NA.)
- **mp4box@2.3.0 (PASS, weaker):** Reached graceful by early reject — "moov not found (not an ISO-BMFF/MP4 file, or moov truncated)". Whole-file append parser detected the missing moov and threw; no partial recovery. Fastest (7 ms) but only because it short-circuited.
- **ffmpeg.wasm@0.12.15 (PASS, weaker):** Graceful via `framecrc exit 1`, log "moov atom not found / Invalid data found / Aborted()". Correct rejection, but the slowest PASS at 138 ms (wasm spin-up + abort), and no partial recovery.
- **remotion-media-parser@4.0.479 (PASS, weaker):** Graceful via an HTTP transport error — "Server returned status code 416 ... range 373248". It bailed on the range read past EOF before parsing the container at all, so it never tested its own moov-less handling. Cheap (8 ms) but uninformative about parser robustness.
- **remotion-webcodecs@4.0.479 (PASS, weaker):** Identical failure mode to remotion-media-parser (shared range-reader) — "416 ... range 373248". Same caveat: aborted at the fetch layer, not the demux layer.
- **web-demuxer@4.0.0 (PASS, weaker):** Graceful via "get_media_info failed: undefined". Its libav-in-wasm probe returned undefined on the moov-less file; clean reject, no partial. (29 ms.)

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:445-454` (entry in `GRACEFUL_CASES`), materialized at `index.ts:475-489`. `op: 'demux'`, `oracles: ['graceful-failure']`, `options.gracefulAllowOutput: true` (line 450/488).
- **Fixture exists and is real:** `fixtures/media/truncated_h264.mp4`, 373,248 bytes. Hexdump confirms a genuine faststart MP4 (`ftyp isom/iso2/avc1/mp41`, `free`, `mdat`) carrying real x264-encoded H.264 in mdat, with the `moov` atom truncated off (no `moov` byte sequence in the file; range 373248 = one past EOF → the observed 416s). This is an authentic partial/broken corpus file, not synthetic/empty/mock.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1152-1183` (`demux()`). Genuinely calls the mediabunny library — `openInput`, `getTracks`, `EncodedPacketSink.packets({ verifyKeyPackets: true })`. No canned output, no copy-input-to-output, no golden short-circuit, no error swallowing that fakes success; the partial path is produced by the real parser and the runner routes the (allowed) partial output to the oracle.
- **Oracle:** `src/core/oracles.ts:2586-2628` (`gracefulFailure` + `gracefulAllowsReturnedOutput`). It is a robustness oracle: PASS on no-output (2608-2609) or, only when `gracefulAllowOutput===true`, on a returned partial (2611-2612); FAIL if a malformed input yields output without that flag (2614-2617). It is not trivially satisfiable across the board — for the other graceful cases (no `gracefulAllowOutput`) producing output would FAIL. The measurements are physically plausible (matching reasons: moov-not-found, 416 at EOF byte, wasm Aborted()).
- **Cached note:** **All 6 PASS rows and the NA row are `cached: true`.** Evidence is reused, not freshly re-run; per the launcher seeding caveat, stale PASS reuse is possible. The verdicts are internally consistent with the fixture and adapters, but a fresh run was not performed in this shard.
- **Verdict: WEAK-GATE.** The fixture and the mediabunny implementation are real, but the gating oracle is a single binary robustness check (graceful = PASS) that all 6 contestants satisfy; it does not measure packet-table correctness, so the "win" rests on qualitative interpretation of the graceful path plus uninstrumented `durationMs`, not on a strong correctness oracle. No cheating found, but the gate is intentionally loose for a robustness case.

## Confidence & caveats

- **Confidence: medium.** The winner determination is sound on the correctness-quality ladder (only mediabunny demonstrably parsed-and-recovered), and the implementation/fixture/oracle are all verified real. But (1) the oracle is binary, so all 6 are "correct" by the letter of the score; (2) there are **no `bench{}` metrics** — only cached `durationMs`, which is weak performance evidence (effectively n=1, no mad/p95); and (3) **every row is cached**, so the numbers were not re-measured in this run. A reader prioritizing raw latency could reasonably pick mp4box (7 ms) instead; the mediabunny pick is justified specifically by the partial-recovery quality that `gracefulAllowOutput` rewards here.
