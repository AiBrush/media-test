# robustness/edge_zero_length_probe

- **Family:** robustness
- **Fixture asset:** `fixtures/media/zero_length.mp4` (0 bytes — a genuinely empty file)
- **Operation:** `probe` (containerIn: mp4); option `gracefulAllowOutput: true`
- **Oracle(s):** `graceful-failure` (single oracle)
- **primaryMetric:** none recorded (no `bench` object in shard; only `durationMs`)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `remotion-webcodecs@4.0.479` (by lowest wall time)
- **Contested:** YES — all 7 engines PASS the identical, single `graceful-failure` oracle. Correctness is a 7-way tie (the gate is a robustness "did-not-crash/hang" check, not a correctness comparison), so the decision falls entirely to performance.
- **Decisive factor:** wall time (`durationMs`). remotion-webcodecs = 10 ms, vs platform/mp4box = 11 ms (next best).
- **Margin over runner-up:** ~1.1x faster than the 11 ms runners-up (platform, mp4box) — a 1 ms difference at **n==1, all results cached**. This is statistically meaningless; the win is nominal, not real separation. The slowest passers are ffmpeg.wasm (170 ms, ~17x slower) and mediabunny (67 ms), reflecting wasm/decoder init cost even on a trivially-empty input.

## Per-engine results

All 7 share the same single oracle `graceful-failure:pass`. No `bench` block exists for this scenario, so throughputRealtime / peakMemory / longtasks were not recorded; `durationMs` is the only metric.

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | **10 ms** | n/a | n/a | n/a | cached: graceful: Server returned 416 for zero_length.mp4 range 0 |
| platform@chrome-149 | PASS | graceful-failure:pass | 11 ms | n/a | n/a | n/a | cached previous PASS; returned partial/safe output, no crash/hang |
| mp4box@2.3.0 | PASS | graceful-failure:pass | 11 ms | n/a | n/a | n/a | cached: graceful: mp4box: moov not found (not ISO-BMFF/MP4, or moov truncated) |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:pass | 21 ms | n/a | n/a | n/a | cached: graceful: Server returned 416 for zero_length.mp4 range 0 |
| web-demuxer@4.0.0 | PASS | graceful-failure:pass | 58 ms | n/a | n/a | n/a | cached: graceful: get_media_info failed: undefined |
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 67 ms | n/a | n/a | n/a | cached: graceful: Error fetching zero_length.mp4: 416 Range Not Satisfiable |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 170 ms | n/a | n/a | n/a | cached: graceful: ffmpeg could not read input for probe (Invalid data found / Aborted) |

## Why the winner wins (deep technical)

This scenario exercises the *empty-input edge*: an MP4 probe over a 0-byte file. There is no codec to decode and no container to parse — the entire test is about whether the engine **rejects cleanly** rather than crashing, hanging, OOMing, or (worse) fabricating metadata from nothing. The `graceful-failure` oracle (src/core/oracles.ts:2586) PASSes when the runner caught a throw and the op left no output (oracles.ts:2608-2610), or — because this scenario sets `options.gracefulAllowOutput: true` (src/scenarios/robustness/index.ts:194) — when the op returned only partial/safe output (oracles.ts:2611-2613). There is no golden comparison, no SSIM, no packet-count check; this is a **smoke-class robustness gate**, so all engines that handled the empty file land on the same PASS rung of the correctness ladder.

remotion-webcodecs "wins" purely on the `durationMs=10` number. Mechanistically, its probe path (src/engines/remotion-webcodecs/adapter.ts:332 `probe()` → adapter.ts:346 `mp.parseMedia`) drives @remotion/media-parser's `webReader`, which opens the source with an HTTP **Range** request. For the 0-byte file the Vite dev server answered **416 Range Not Satisfiable** (`reason: "Server returned status code 416 ... and range 0"`), media-parser threw immediately on the failed range fetch before any box parsing, and the runner caught it → graceful PASS in 10 ms. Critically, this is the *same* short-circuit that remotion-media-parser (21 ms) and mediabunny (67 ms, "416 Range Not Satisfiable") hit — they all fail fast on the range probe of an empty body. remotion-webcodecs is simply the fastest of that 416-family group on this single cached sample. mp4box (11 ms, "moov not found") does a whole-file append (`whole-file-append(MP4BoxBuffer+fileStart)` per its configUsed) and then reports the missing `moov`, which is essentially as fast.

So the "win" is not a mechanistic superiority for empty-MP4 handling — every engine handles it correctly. The 1 ms edge over platform/mp4box is within timing noise, on n==1, and the result is **cached** (durationMs reflects a prior run, not a fresh measurement). The only *real* technical separation in the table is at the slow end: ffmpeg.wasm spends 170 ms because even an immediate "Invalid data found when processing input | Aborted()" still pays wasm module load / FS setup before the demuxer rejects; mediabunny (67 ms) and web-demuxer (58 ms, libav wasm "get_media_info failed: undefined") similarly carry wasm/init overhead. The pure-JS / media-parser readers (10-21 ms) and mp4box's JS append (11 ms) skip that cost and reject on the first byte/range, which is the genuine architectural distinction — fast-failing JS readers beat wasm engines on empty input.

## What each other framework did wrong

- **platform@chrome-149 (PASS, 11 ms):** lost by 1 ms (1.1x). Distinct path — it returned partial/safe output rather than throwing ("operation returned partial/safe output and did not crash/hang", allowed by `gracefulAllowOutput`). Correct, just nominally slower at n==1; gap is noise.
- **mp4box@2.3.0 (PASS, 11 ms):** lost by 1 ms (1.1x). Whole-file-append then "moov not found"; correct graceful reject but did not fail-fast on a range probe like the winner.
- **remotion-media-parser@4.0.479 (PASS, 21 ms):** lost by ~2.1x. Same media-parser/webReader 416 short-circuit as the winner but measured slower on this cached sample.
- **web-demuxer@4.0.0 (PASS, 58 ms):** lost by ~5.8x. libav-in-wasm; "get_media_info failed: undefined" — correct reject but pays wasm init.
- **mediabunny@1.48.0 (PASS, 67 ms):** lost by ~6.7x. "416 Range Not Satisfiable" — same fast-fail cause, but ~57 ms of decoder/setup overhead on top.
- **ffmpeg.wasm@0.12.15 (PASS, 170 ms):** lost by ~17x. "Invalid data found when processing input | Aborted()"; heaviest wasm load + FS mount before the demuxer can declare the input invalid.

No engine was NA and none FAILed — there are no under-declared capabilities to flag here; every engine declared `probe` over `mp4` and exercised it.

## Anti-cheat validation

- **Scenario:** src/scenarios/robustness/index.ts:189-200 — `id: 'edge_zero_length_probe'`, `op: 'probe'`, `asset: 'zero_length.mp4'`, `oracles: ['graceful-failure']`, `options: { gracefulAllowOutput: true }`. Notes (index.ts:199) state intent: "Zero-length file: must reject cleanly or report an empty/degraded probe result, never fault."
- **Fixture exists & is real-intent:** `fixtures/media/zero_length.mp4` — `stat` reports **0 bytes**. For this scenario an *empty* file is the correct, non-synthetic input (the whole point is the zero-length edge), so the empty fixture is legitimate, not a mock cheat.
- **Oracle:** src/core/oracles.ts:2586 `gracefulFailure`. It PASSes on no-output (oracles.ts:2608-2610) or, with `gracefulAllowOutput`, on partial output (oracles.ts:2611-2613); it FAILs only if a malformed input *produced output* without the allow-flag (oracles.ts:2614-2617). It performs **no golden comparison** — it is a robustness smoke gate by design. The scenario notes deliberately avoid the bad-token set (crash/hang/timeout/oom) that the marker path would force-FAIL on (oracles.ts:2592-2594), as documented at index.ts:196-198.
- **Winner adapter:** src/engines/remotion-webcodecs/adapter.ts:332 `probe()` → adapter.ts:346 `mp.parseMedia(...)` — genuinely calls @remotion/media-parser; no canned output, no golden short-circuit, no swallowed-error-as-success. The graceful PASS came from a real thrown error (HTTP 416 on the range fetch) caught by the runner, not from faked success.
- **Cached note:** **All 7 results have `cached==true`.** Every `durationMs` is reused from a prior run, not freshly measured. The 1 ms winner margin is therefore stale and unverifiable on this run.
- **Verdict:** **WEAK-GATE.** Real empty fixture + real adapter implementation, but the single oracle is a smoke/robustness gate that cannot distinguish engines on correctness — all 7 trivially PASS, and the "win" rests on a 1 ms, n==1, fully-cached timing difference. The PASS is real; the ranking is not strong evidence of superiority.

## Confidence & caveats

- **Confidence: low** on the ranking, high on the verdict-class. The PASS for all 7 is genuine, but the winner is decided by a 1 ms gap on cached, single-sample timing with no `bench` block — essentially a tie among the three fast JS-reader engines (remotion-webcodecs 10, platform 11, mp4box 11).
- No `bench` / `primaryMetric` data exists for this scenario, so throughputRealtime / peakMemory / longtasks could not inform the decision.
- All evidence is cached (staleness risk). A fresh re-run could reorder the 10-21 ms cluster trivially.
- The only robust, run-independent signal is the JS-reader vs wasm-engine split: fast-failing JS/media-parser/mp4box readers (10-21 ms) genuinely beat wasm engines (web-demuxer 58, mediabunny 67, ffmpeg.wasm 170) on empty input due to wasm init overhead.
