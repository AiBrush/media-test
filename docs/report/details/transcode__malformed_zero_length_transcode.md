# transcode/malformed_zero_length_transcode

family: transcode | fixture asset: `zero_length.mp4` (0 bytes, exists in fixtures/media/) | primaryMetric: none (robustness graceful-failure; only `durationMs` recorded) | passCount: 4 / 7

## Verdict

- Best framework: **platform@chrome-149** (uncontested on the decisive tiebreaker; nominally contested 4-way on correctness).
- Contested: yes — 4 engines PASS (`platform`, `ffmpeg.wasm`, `remotion-webcodecs`, `mediabunny`), each satisfying the single `graceful-failure` oracle. Correctness strength is identical (one smoke/robustness-level oracle, no bit-exact, structural, or perceptual gate exists for a zero-byte input).
- Decisive factor: since correctness is a tie, the ranking falls to **performance (durationMs)** then tiebreakers. platform rejects in **6 ms** with **zero bundle / zero library** (native `<video>` element errors before metadata), tied with remotion-webcodecs (6 ms) on time but cleaner on dependency/backend footprint (no parser, no wasm, no HTTP-range machinery). mediabunny is 9 ms, ffmpeg.wasm is 120 ms.
- Margin over runner-up: vs remotion-webcodecs **1.0x wall (6 ms = 6 ms — tie)**, broken by tiebreaker (c) no-dependency/native path; vs mediabunny **1.5x faster** (6 ms vs 9 ms); vs ffmpeg.wasm **20x faster** (6 ms vs 120 ms). All evidence is n==1 cached single samples — weak performance signal; the win is really "everyone rejects cleanly, platform does it with the least machinery."

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | graceful-failure:true | 6 ms (durationMs) | n/a | n/a | n/a | cached: graceful: `<video>` error before metadata (transcode source) |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 6 ms (durationMs) | n/a | n/a | n/a | cached: graceful: Server returned status code 416 for .../zero_length.mp4 and range 0 |
| mediabunny@1.48.0 | PASS | graceful-failure:true | 9 ms (durationMs) | n/a | n/a | n/a | cached: graceful: Error fetching .../zero_length.mp4: 416 Range Not Satisfiable |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 120 ms (durationMs) | n/a | n/a | n/a | cached: graceful: ffmpeg could not read input for probe. Log: op1.in: Invalid data found when processing input \| Aborted() |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |

Note: this scenario carries **no `bench{}` block** for any engine — it is a robustness/degenerate-input test where the only signal is whether the engine threw/rejected cleanly within the timeout. Only `durationMs` is available, used here as the wall proxy.

## Why the winner wins (deep technical)

This is the A.16 "zero-length" degenerate-input transcode case (src/scenarios/transcode/index.ts:1558-1567): a literally 0-byte file named `zero_length.mp4`, requested to be transcoded to H.264-in-MP4. There is no container at all — no `ftyp`, no `moov`, no `mdat`, not a single byte. The "correct" behavior is not to produce media but to **reject cleanly without crashing, hanging, or OOM**. The gating oracle is `graceful-failure` (src/core/oracles.ts:2586-2623), which for a robustness/`graceful-failure`-listed scenario returns PASS when the op produced no output and did not crash (oracles.ts:2607-2610), and FAIL only if it silently emitted output from malformed input (oracles.ts:2614-2617). All four passing engines hit the PASS branch with `ctx.output` undefined.

The mechanistic differences are in *how early and how cheaply* each engine detects emptiness:

- **platform (winner, 6 ms):** the platform transcode source path drives a native `<video>` element. With 0 bytes the element fires an `error` event "before metadata" (shard reason: "graceful: `<video> error before metadata`") — the browser's media stack rejects an empty resource at the demux-probe stage before any decoder/encoder is constructed. configUsed shows `backend: webcodecs`, `hwAccel: true`, but the WebCodecs/encode path (`<video>→canvas→MediaRecorder`) is never reached because the source never reaches `loadedmetadata`. No wasm, no library, no HTTP-range request, `coopCoep` not required. This is the lowest-machinery rejection of the four and ties for fastest at 6 ms — the decisive tiebreaker (c): native, zero-dependency, no COOP/COEP, no extra fetch round-trips.

- **remotion-webcodecs (6 ms):** also rejects in 6 ms, but via a *different mechanism* — its adapter uses `http-range` fast paths for MP4/MOV demux (configUsed.adapterFastPaths). It issues a Range request `range 0` against the 0-byte file, the dev server replies **416 Range Not Satisfiable**, and the adapter surfaces that as a clean throw. Functionally identical PASS and identical 6 ms, but it depends on the remotion parser stack + an HTTP round-trip, so it loses the dependency/footprint tiebreaker to platform.

- **mediabunny (9 ms):** mediabunny's `transcode()` (src/engines/mediabunny/adapter.ts:1271-1305) calls `openInput(this.lib, input)` (adapter.ts:1287) which fetches the source; for the 0-byte file the source fetch returns **416 Range Not Satisfiable** ("Error fetching .../zero_length.mp4: 416"), so the throw happens during `openInput`/`getTracks` (adapter.ts:1293) before any Conversion or encoder is built. Correct and clean, but 9 ms vs 6 ms (1.5x slower) and carries the mediabunny library.

- **ffmpeg.wasm (120 ms):** slowest by 20x because it must spin up the wasm module and run a probe pass over the (empty) input; ffmpeg reports "Invalid data found when processing input | Aborted()" and the adapter routes the abort to a clean reject. PASS, but the wasm bootstrap + probe cost dominates (120 ms) — and it is single-thread wasm (the heaviest backend), so it loses the hardware-vs-wasm tiebreaker too.

Because all four pass the *same* single oracle with no stronger correctness gate available, performance and footprint decide. platform wins on the combination of fastest-tie (6 ms) and least machinery (native browser demux probe, no library/wasm/extra fetch).

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASSed, but tied platform on wall (6 ms = 6 ms, 1.0x) and loses tiebreaker (c): it relies on its parser + an HTTP Range request (got 416) rather than a native zero-cost probe; larger dependency footprint.
- **mediabunny@1.48.0** — PASSed, but 9 ms vs 6 ms (1.5x slower); throw originates in `openInput()` (adapter.ts:1287) after a fetch that returns 416, carrying the mediabunny library overhead.
- **ffmpeg.wasm@0.12.15** — PASSed, but 120 ms (20x slower) due to wasm module bootstrap + probe ("Invalid data found... Aborted()"); single-thread wasm backend.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest NA — mp4box is a demux/box-parser library with no encode/transcode capability; declaring transcode would be an under-declaration risk it correctly avoids.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'transcode'". Honest NA — it is a parser/demuxer (the *webcodecs* sibling is the transcoder), no encoder.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'transcode'". Honest NA — demux-only (wasm libav demuxer), no encode path.

## Anti-cheat validation

- Scenario: src/scenarios/transcode/index.ts:1558-1567 — `id: 'malformed_zero_length_transcode'`, `asset: 'zero_length.mp4'`, options `{ container: 'mp4', video: { codec: 'h264' } }`, notes "Zero-length file → transcode (A.16 zero-length). Robustness path: clean throw expected, no crash."
- Fixture: `fixtures/media/zero_length.mp4` exists and is **0 bytes** (confirmed via stat). This is exactly the intended degenerate real input — not a mock/synthetic stand-in; the test's whole point is the empty file. The 416 / "Invalid data" / `<video> error` messages across engines are physically consistent with a genuinely empty resource (Range request on a 0-byte body is unsatisfiable → 416; native element errors before metadata).
- Oracle: src/core/oracles.ts:2586-2623 `gracefulFailure`. For a `graceful-failure`-listed scenario it PASSes only when no output/metadata/demux/frames were produced (oracles.ts:2607-2610) and would FAIL if the engine emitted output from this malformed input (oracles.ts:2614-2617). This is the correct, non-trivially-satisfiable gate for a degenerate input: an engine that faked a transcode by emitting any bytes would FAIL.
- Winner adapter: platform engine uses the native `<video>` source path; rejection occurs "before metadata" with no decoder/encoder constructed (shard reason). It does not copy input→output, return canned bytes, or short-circuit to a golden — there is no golden for a 0-byte input. mediabunny's path (adapter.ts:1271-1305) genuinely calls `openInput` → `getTracks` and throws on the real fetch failure; no swallow-and-succeed.
- Verdict: **WEAK-GATE**. Everything is real (real 0-byte fixture, real library/native rejection paths, oracle performs a real output-presence check), but the gate is a single robustness smoke-level oracle (`graceful-failure`) — by design there is no bit-exact/structural/perceptual correctness to compare for an empty input. The PASS is real but intrinsically weak (it asserts "did not crash", not "produced correct media").
- Cached note: **all four PASS results have `cached: true`** (platform startedAt 14:06, ffmpeg 13:53, mediabunny 13:51, remotion-webcodecs 16:56 on 2026-06-22). Reused, not re-run this batch — staleness risk exists, but the underlying input (0-byte file) is invariant so re-running would reproduce the same clean throws. durationMs values are single cached samples (n==1), so the performance ranking is weak evidence.

## Confidence & caveats

- Confidence: medium. The PASS/NA classification is unambiguous and the fixture + oracle + adapter paths are all genuine. The *ranking among the 4 PASS engines* is low-strength: no `bench{}` block exists, durationMs is a single cached sample each, and platform vs remotion-webcodecs is a literal 6 ms tie broken only by the dependency/footprint tiebreaker.
- Caveat: this is a robustness "clean throw" test, so "best" means "rejects most cheaply/cleanly," not "best transcoder." The three NA_ENGINE results are honest non-declarations (demux/parser-only libraries), not under-declared capability.
- Caveat: cached evidence — a fresh re-run (clear raw + .browser-cache per the launcher seeding caveat) would harden the durationMs numbers, though the verdict (4 PASS, platform cheapest) is robust to that.
