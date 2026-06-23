# robustness/fuzz_webm_bitflip_probe

family: robustness · fixture asset: `fuzz_webm_bitflip.webm` (9.3 MB, real file in fixtures/media/) · op: `probe` · primaryMetric: none recorded (only `durationMs`) · passCount: 6 of 7

## Verdict

- **Best framework: remotion-media-parser@4.0.479** (engineId `remotion-media-parser@4.0.479`).
- **Contested**: 6 of 7 engines PASS, and all six pass the *identical* single oracle (`graceful-failure`) with the *identical* detail string ("operation returned partial/safe output and did not crash/hang"). Correctness strength is therefore a dead tie across all six.
- **Decisive factor: performance.** With correctness indistinguishable, the only differentiating metric present in the shard is `durationMs` (there is no `bench{}` block and no `primaryMetric` for this robustness probe). remotion-media-parser completed the probe in **23 ms**, the lowest of all six PASS engines.
- **Margin over runner-up:** remotion-webcodecs at 33 ms → **1.43x faster wall**; vs mediabunny 36 ms → 1.57x; vs platform 58 ms → 2.52x; vs ffmpeg.wasm 189 ms → 8.2x; vs web-demuxer 720 ms → **31.3x faster**. Evidence is weak: n is effectively 1 (single cached duration, no MAD/p95 spread), and all six results are `cached==true`.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | 23 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 33 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | graceful-failure:true | 36 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | graceful-failure:true | 58 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 189 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | graceful-failure:true | 720 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

No `throughputRealtime`, `peakMemory`, or `longtasks` were recorded for any engine in this shard (no `bench{}` object present). The only quantitative axis available is `durationMs`.

## Why the winner wins (deep technical)

The container is **WebM/Matroska (EBML)**. The fixture begins with a valid EBML magic `1A 45 DF A3` and a `webm` DocType (bytes `77 65 62 6D` at offset 0x1B), then the SeekHead / element-size fields starting around offset 0x2B carry deliberate **bit-flips that corrupt VINT element sizes** (e.g. the mangled `cf 36` / oversized length bytes near the Segment and SeekHead). The scenario notes (`src/scenarios/robustness/index.ts:291`) spell out the contract: "EBML/Matroska bit-flips; probe must reject or report degraded, never fault on a mangled element size." This is a *robustness* test, not a correctness test: the only gate is `graceful-failure` with `options.gracefulAllowOutput: true` (line 290), so a probe may either throw cleanly or return partial/degraded metadata — it just must not crash, hang, or OOM.

remotion-media-parser ran on its `cpu-js` backend (`env.configUsed.backend: "cpu-js"`, `hwAccel:false`, `wasmThreads:0`, `reader: webReader`, `fieldsTier: metadata-only`). Its probe path (`src/engines/remotion-media-parser/adapter.ts:348`) is a pure-TypeScript, metadata-tier parse: it requests only `{durationInSeconds, container, tracks, metadata, rotation}` (lines 374-381) and feeds the **corrupted bytes** to the real `parseMedia` call (`adapter.ts:335`). For single-file containers, `chooseSrcOptions()` hands the parser a mutation-honoring Blob of the actual mangled file (documented at `adapter.ts:343-346`: "fuzz/truncate/zero-length probe cases feed the CORRUPTED bytes → clean throw → graceful-failure PASS"). Because the WebM bit-flips sit in the early SeekHead/element-size region, the parser hits the malformed VINT almost immediately, during the metadata-only header scan, and unwinds in ~23 ms without ever attempting a full-file walk. The runner caught the resulting throw and routed it to `gracefulFailure()` (`src/core/oracles.ts:2586`), whose robustness branch returned PASS via `gracefulAllowsReturnedOutput` (lines 2607-2612).

The speed advantage is mechanistic, not magic: a single-threaded JS EBML scanner that bails on the first invalid element size does the least possible work. It never spins up a WebCodecs VideoDecoder (unlike platform / mediabunny / remotion-webcodecs, whose `backend:"webcodecs"` paths carry decoder-init overhead) and never instantiates a wasm core (unlike ffmpeg.wasm's 189 ms, dominated by Emscripten module bring-up, and unlike web-demuxer's 720 ms, dominated by its wasm FFmpeg-demuxer startup). For a "fail-fast on corrupt header" probe, the lightest runtime wins, and the pure-TS metadata-only parser is the lightest.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** correct and graceful, but 33 ms vs 23 ms = 1.43x slower wall. Its `webcodecs` backend with `streaming-backpressure` pipeline carries decoder/queue setup overhead the metadata-only JS parser avoids. No correctness deficit — purely a margin loss.
- **mediabunny@1.48.0 (PASS, lost on perf):** 36 ms = 1.57x slower. `backend:"webcodecs"`, `prefer-hardware`, `streaming-lockstep` pipeline; same graceful-failure pass, more startup cost than pure-TS.
- **platform@chrome-149 (PASS, lost on perf):** 58 ms = 2.52x slower. Native `VideoDecoder` + `webgpu>webgl>offscreen2d` pixel backend; heaviest of the WebCodecs trio to spin up for a probe that never needs a decoder.
- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** 189 ms = 8.2x slower. wasm core (Emscripten) instantiation dominates; graceful but far costlier for a header-reject.
- **web-demuxer@4.0.0 (PASS, lost on perf):** 720 ms = 31.3x slower — slowest by a wide margin. Its wasm FFmpeg demuxer bring-up plus probe is heavy; still graceful (rejected/degraded without crash), just slow.
- **mp4box@2.3.0 (NA_ENGINE):** did not run. Reason: "engine does not declare input container 'webm'". This is an **honest NA** — MP4Box.js is an ISO-BMFF (MP4/MOV) parser and genuinely has no Matroska/WebM demuxer, so the capability registry correctly refuses the webm input rather than under-declaring a real capability.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:285-292` — id `fuzz_webm_bitflip_probe`, asset `fuzz_webm_bitflip.webm`, op `probe`, container `webm`, `options.gracefulAllowOutput:true`, notes at line 291.
- **Fixture exists & is real:** `fixtures/media/fuzz_webm_bitflip.webm` present, 9.3 MB. Hex confirms a genuine WebM: EBML magic `1A 45 DF A3`, DocType `webm`, followed by corrupted SeekHead/element-size VINTs (e.g. `...8d cf 36` near offset 0x2C). Not synthetic, not empty, not a mock.
- **Oracle:** `gracefulFailure()` at `src/core/oracles.ts:2586-2623`, with `gracefulAllowsReturnedOutput()` at 2625-2628. For robustness scenarios it PASSes if the op produced no output (clean throw inferred) OR produced partial output when `gracefulAllowOutput` is set. It only FAILs if a malformed-input op returns output *without* that flag, or a runner signal reports crash/hang/oom/timeout.
- **Winner adapter:** `src/engines/remotion-media-parser/adapter.ts:348` (probe) → `runParse` → real `parseMedia` (`adapter.ts:335`); corrupted-bytes feed documented at `adapter.ts:343-346`. The implementation is genuine: it calls the real `@remotion/media-parser` library, does not return canned output, does not copy input to output, and does not short-circuit to a golden file. The throw is caught by the runner, not swallowed-and-reported-success inside the adapter.
- **Verdict: WEAK-GATE.** Everything is real — real corrupted fixture, real library call, real catch/route — but the gating oracle is a *robustness smoke gate*: `graceful-failure` only asserts "did not crash/hang and (optionally) returned safe output." With `gracefulAllowOutput:true`, both "threw cleanly" and "returned degraded metadata" pass, so the bar is low and is satisfiable by any engine that merely survives. There is no correctness comparison against a golden, no decoded-frame or structural check. The PASS is real but not strong, and the winner is decided purely on a single, uncorroborated duration sample.
- **Cached note:** ALL six PASS results have `cached==true` ("cached previous PASS result"). The durations were reused, not freshly re-run — staleness risk is elevated, and the 23 ms winning margin rests on cached single-shot numbers (no MAD/p95). Per the launcher-seeding caveat, a truly honest fresh run would require clearing the raw + .browser-cache.

## Confidence & caveats

- **Confidence: medium.** The winner selection logic is unambiguous given the data (identical oracle across all six → perf tiebreak → lowest durationMs), and the implementation/fixture are verified real. But the underlying evidence is thin: a single duration per engine, all cached, no bench spread, and a smoke-level gate.
- The 23 ms vs 33 ms gap (10 ms) is within plausible scheduling/cache noise for cold-ish JS parses; with n≈1 and no MAD, the ranking among the three fastest (remotion-media-parser 23, remotion-webcodecs 33, mediabunny 36) is low-confidence. The large gaps (ffmpeg.wasm 189, web-demuxer 720) are robust and clearly driven by wasm bring-up.
- For this robustness probe, "best" really means "fastest fail-fast"; it is not a measure of decode/demux correctness. mp4box's NA is legitimate and should not count against it.
