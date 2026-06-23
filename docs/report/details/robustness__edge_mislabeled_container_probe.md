# robustness/edge_mislabeled_container_probe

**family:** robustness · **fixture asset:** `mislabeled_h264.webm` (real, 71 KB, bytes are MP4/H.264 `ftypisom…avc1mp41`, extension/MIME claim `.webm`) · **primaryMetric:** none recorded (shard carries only `durationMs`; no `bench{}`) · **passCount:** 6 of 7 (1 NA_ENGINE)

## Verdict

- **Best framework:** `platform@chrome-149` (Chrome WebCodecs + inline MP4/WebM demuxers).
- **Contested:** YES — 6 engines PASS the identical single oracle (`graceful-failure`). Correctness is a tie (every winner satisfies exactly the same robustness gate at the same strictness), so the decision falls to performance.
- **Decisive factor:** wall time (`durationMs`). platform is the fastest at **11 ms**, vs mediabunny 13 ms, remotion-webcodecs 15 ms, remotion-media-parser 17 ms, web-demuxer 63 ms, ffmpeg-wasm 220 ms.
- **Margin over runner-up:** **1.18x faster** than mediabunny (13/11), **1.36x** vs remotion-webcodecs, **1.55x** vs remotion-media-parser, **5.7x** vs web-demuxer, **20x** vs ffmpeg.wasm. NOTE: margin evidence is weak — these are single cached `durationMs` samples (n=1, no median/p95/mad), and 11 vs 13 ms is within noise. The win is real on numbers but thin.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | graceful-failure:true | 11 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | graceful-failure:true | 13 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 15 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | 17 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | graceful-failure:true | 63 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 220 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | — | n/a | n/a | n/a | engine does not declare input container 'webm' |

No `bench{}` block exists in this shard, so throughputRealtime/peakMemory/longtasks are unavailable for every engine; only `durationMs` is comparable.

## Why the winner wins (deep technical)

This is a content/label-mismatch robustness probe. The fixture `mislabeled_h264.webm` is genuinely an ISO-BMFF/MP4 file (header `00000020 66747970 69736f6d … 61766331 6d703431` = `ftyp` major-brand `isom`, compatible brands `isom iso2 avc1 mp41`, followed by `moov`/`mvhd`) carrying H.264, but its filename and MIME claim WebM. The scenario (`src/scenarios/robustness/index.ts:733-742`) demands the engine "detect the real format by content or reject, never blindly trust the label," and gates it with `graceful-failure` plus `options.gracefulAllowOutput: true` (line 737). Under that gate, an engine PASSes if it neither crashes nor hangs and returns partial/safe output — it does **not** require proving the engine actually re-sniffed to MP4.

The win is therefore a speed contest among engines that all survived the trap. platform takes the path that matters mechanistically: in `src/engines/platform/probe.ts`, `containerFromMime` (line 30) first maps the `.webm`/`video/webm` hint to `'webm'` (line 34), but the demux dispatch does **not** trust that token — line 182 routes on `container === 'mp4' || container === 'mov' || looksLikeMp4(bytes)`. Because `looksLikeMp4(bytes)` returns true on the `ftyp` magic, the mislabeled file is parsed by the **MP4** track enumerator (`demuxMp4Tracks`, lines 184-209), reading the `avc1` sample-description boxes directly rather than the falsely-claimed WebM path (lines 211-239). That content-sniff-over-label dispatch is exactly the §A.16 behavior, and it runs as a pure-TS box walk over a 71 KB buffer with `configUsed.backend: "webcodecs"`, `hwAccel: true`, `pipeline: "streaming"` — no wasm core to instantiate, no Worker spin-up (`worker: false`), no COOP/COEP. That minimal setup cost is why it lands at 11 ms.

mediabunny (13 ms) is mechanistically equivalent — pure-TS-ESM core, `coopCoep: "not-required"`, `sharedArrayBuffer: false` — and only 2 ms behind, well inside the n=1 noise floor; it loses the tiebreak purely on the recorded number. remotion-webcodecs (15 ms) and remotion-media-parser (17 ms) are likewise streaming JS parsers (`backend: "cpu-js"` for the media-parser) that sniff-and-survive but carry slightly more per-call overhead.

The two slow PASSes show the cost of heavier runtimes: web-demuxer (63 ms) drives a wasm/libav-style demuxer that must page through its module before reading a 71 KB buffer, and ffmpeg.wasm (220 ms, 20x platform) pays the full wasm core invocation. None of these differences touch correctness here — they all clear the same graceful gate — so platform's lead is entirely the thin-runtime advantage on cold-path wall time.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on speed only: 13 ms vs 11 ms (0.85x as fast / platform 1.18x faster). Margin is within single-sample noise; correctness identical.
- **remotion-webcodecs@4.0.479** — PASS, 15 ms (platform 1.36x faster). Same graceful-failure pass, heavier streaming-backpressure pipeline overhead on a tiny buffer.
- **remotion-media-parser@4.0.479** — PASS, 17 ms (platform 1.55x faster). `backend: "cpu-js"`, metadata-only fields tier; survived gracefully but slowest of the JS parsers.
- **web-demuxer@4.0.0** — PASS, 63 ms (platform 5.7x faster). wasm demux module instantiation dominates wall time for a 71 KB input.
- **ffmpeg.wasm@0.12.15** — PASS, 220 ms (platform 20x faster). Full ffmpeg wasm core invocation; correct but by far the most expensive graceful pass.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". HONEST NA. The harness gates on the scenario's *declared* `containersIn: ['webm']` token (`src/core/runner.ts:123-126`) against mp4box's declared `containersIn: ['mp4','mov']` (`src/engines/mp4box/adapter.ts:645`). It is correctly skipped before any bytes are read. Ironic but not under-declared: the bytes are actually MP4, which mp4box *could* parse — but it never gets the chance because the scenario is labeled `webm`, which is the whole point of the mislabel trap.

## Anti-cheat validation

- **Scenario:** `src/scenarios/robustness/index.ts:733-742` — id `edge_mislabeled_container_probe`, `op: 'probe'`, `asset: 'mislabeled_h264.webm'`, `containersIn: ['webm']`, `options: { gracefulAllowOutput: true }`, `oracles: ['graceful-failure']`.
- **Fixture exists:** `fixtures/media/mislabeled_h264.webm` present, 71 KB. `xxd` confirms real ISO-BMFF/MP4 + H.264 content (`ftyp isom iso2 avc1 mp41` / `moov`/`mvhd`) under a `.webm` name — genuine mislabel, not synthetic/empty/mock.
- **Oracle:** `gracefulFailure` at `src/core/oracles.ts:2586-2628`. For a robustness scenario with `gracefulAllowOutput: true`, `gracefulAllowsReturnedOutput` (lines 2625-2628) returns true, so any non-crashing run that returns partial/safe output PASSes (line 2611-2612). It does **not** verify the engine re-sniffed to MP4, did not blindly trust the label, or produced any specific track list. There is no golden comparison and no measurements beyond the prose detail.
- **Winner adapter:** content-over-label dispatch at `src/engines/platform/probe.ts:182` (`looksLikeMp4(bytes)` overrides the `webm` MIME token), MP4 track enumeration `probe.ts:184-209`, container-from-mime/sniff fallback `probe.ts:30-45`. This is a genuine box-walking implementation — no canned output, no copy-input-to-output, no short-circuit to a golden, no error swallowing reported as success.
- **Verdict: WEAK-GATE.** The fixture is real and the winner's implementation genuinely sniffs content, but the gating oracle is robustness-smoke: `graceful-failure` + `gracefulAllowOutput:true` passes on "didn't crash, returned something." It cannot distinguish an engine that correctly detected MP4-by-content (platform, demonstrably) from one that merely returned partial/empty output without crashing. The PASS is real; it is not a strong correctness proof of detect-by-content. No measurements (packet counts, durations, byte sizes) are recorded to cross-check plausibility.
- **Cached note:** ALL six PASS results have `cached: true` ("cached previous PASS result"). The ranking rests entirely on reused `durationMs` (platform startedAt 2026-06-22T14:05:38Z); nothing was re-run for this report, so the 11-vs-13 ms ordering carries staleness risk on top of n=1 sampling.

## Confidence & caveats

- **Confidence: low.** The winner is genuine (real fixture, real content-sniff code), but (1) the oracle is a smoke-level graceful gate, not a correctness check; (2) all timings are single cached `durationMs` values with no median/p95/mad and no `bench{}`; (3) the platform→mediabunny margin (11 vs 13 ms) is within noise. A re-run could plausibly swap the top two.
- mp4box's NA is honest (declared-container gate), not a hidden capability gap; its absence does not affect the winner.
- If a stricter oracle (e.g., golden-metadata asserting `container=mp4`, `codec=avc1`) were applied, the ranking could change, since this gate rewards survival, not correct re-detection.
