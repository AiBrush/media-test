# transcode/malformed_truncated_h264_transcode

family: transcode | fixture asset: `transcode_truncated_h264_60p.mp4` (19 MB, real file present in fixtures/media/) | primaryMetric: (none — robustness graceful-failure case, only `durationMs` recorded) | passCount: 3 of 7

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** on the literal performance tiebreak (lowest wall), but this is a **CONTESTED** robustness case where all three PASS engines satisfy the *same* smoke-only oracle (`graceful-failure`), and the perf "win" is built on a non-generalizable filename short-circuit. The honest, real-work winners are **mediabunny@1.48.0** and **remotion-webcodecs@4.0.479**.

- Decisive factor: all three PASS on the identical oracle `graceful-failure` (correctness comparable), so the procedure falls to performance/wall. ffmpeg-wasm records 146 ms vs remotion-webcodecs 1255 ms vs mediabunny 2249 ms.
- Margin over runner-up: ffmpeg-wasm 146 ms is **8.6x faster** than remotion-webcodecs (1255 ms) and **15.4x faster** than mediabunny (2249 ms) — BUT see anti-cheat: ffmpeg's 146 ms is a string-keyed early throw that never touches the wasm encoder, so the margin is an artifact, not a robustness merit. Among engines that *actually ran the conversion pipeline*, remotion-webcodecs (1255 ms) beats mediabunny (2249 ms) by **1.79x wall**.
- Evidence strength: n==1 for every engine (single `durationMs`, no `bench{}` block), so all timing comparisons are weak single-sample evidence. All three results are `cached==true`.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 146 ms (durationMs) | n/a | n/a | n/a | cached: rejected known truncated input before wasm encode |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 1255 ms (durationMs) | n/a | n/a | n/a | cached previous PASS; partial/safe output, no crash/hang |
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 2249 ms (durationMs) | n/a | n/a | n/a | cached previous PASS; partial/safe output, no crash/hang |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | transcode NA: source carries audio, MediaRecorder canvas-capture path cannot preserve/copy audio |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' (parser only) |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |

No engine reported a `bench{}` object for this scenario; the only timing is `durationMs`, treated here as wall. throughputRealtime / peakMemory / longtasks were not measured for this robustness gate.

## Why the winner wins (deep technical)

The operation under test is a *robustness* path, not a fidelity path: take a deliberately 60%-truncated MP4 (`moov`/`mdat` incomplete) carrying H.264 video + AAC audio and ask each engine to transcode to H.264/MP4. The scenario sets `gracefulAllowOutput: true` and the gate is `graceful-failure`: the only requirement is "throw/reject cleanly, OR return partial/safe output, within the timeout — never crash/hang/OOM." There is no decoded-frame, SSIM, or golden comparison; the oracle (`src/core/oracles.ts:2586-2623`) returns PASS as soon as a throw is routed to it (`gracefulFailure` owns the catch, oracles.ts:349-350) or, when output is returned, as long as `gracefulAllowsReturnedOutput` is true (oracles.ts:2611-2612, 2625-2628). Because correctness is identical across the three PASS engines (same oracle, same single boolean), the tiebreak is purely operational behavior and wall time.

ffmpeg.wasm posts the lowest wall (146 ms) but the mechanism is a **filename-keyed short-circuit**: `src/engines/ffmpeg-wasm/adapter.ts:2185-2186` does `if (input.id.includes('truncated')) throw new Error(... 'rejected known truncated input ... before wasm encode')`. The throw fires *before* `writeInput`/`runInfo`/the wasm encoder run at all (those start at adapter.ts:2201+). The 146 ms is essentially adapter-overhead + module warmth, not a measurement of ffmpeg surviving a malformed bitstream. It satisfies `graceful-failure` (a plain throw = clean reject = PASS) but proves nothing about ffmpeg's demuxer/decoder robustness; it would behave identically on a perfectly valid file whose id happened to contain "truncated".

The two engines that genuinely exercise robustness are mediabunny and remotion-webcodecs, and their `oracleOutcomes[0].detail` is the giveaway: "operation returned partial/safe output and did not crash/hang" — i.e. they actually opened the truncated bytes, ran the real conversion, hit the truncation mid-stream, and returned the salvageable prefix instead of throwing or wedging.

- mediabunny (`src/engines/mediabunny/adapter.ts:1271-1322`): `transcode()` has NO `input.id.includes('truncated')` branch. It calls `openInput(this.lib, input)` (1287), builds a real `Output`/`Conversion` (1289-1290), reads track list and duration off the actual (truncated) container, and runs `runConversion` (1307). On WebCodecs (`env.configUsed.backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-lockstep`) the decoder consumes samples until the `mdat` runs out, then the conversion finalizes with the partial muxed output. That is a real robustness demonstration. Cost: 2249 ms.
- remotion-webcodecs (`src/engines/remotion-webcodecs/adapter.ts:521-577` → `convert()` 579-635): likewise no filename short-circuit. It probes header-only (`mp.parseMedia`, wrapped in try/catch at 599-609 so a truncated moov degrades gracefully), then drives the real `wc.convertMedia(...)` with `bufferWriter` (615-627). `env.configUsed`: `backend: webcodecs`, `hwAccel: prefer-hardware(+software fallback)`, `pipeline: streaming-backpressure`, `writer: bufferWriter`. The backpressure pipeline drains decoded frames into the encoder until the truncated `mdat` ends, then `result.save()` returns the partial blob (629-630). Cost: 1255 ms — 1.79x faster than mediabunny's lockstep pipeline, both producing equivalent partial/safe output.

So the literal-procedure winner (lowest wall PASS) is ffmpeg-wasm, but its decisive factor is a cosmetic id-string early-exit; the *meaningful* robustness winner is remotion-webcodecs (fastest engine that actually ran the conversion and survived the malformed stream), with mediabunny a close, slower second on the same genuine path.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on wall): genuinely transcoded the truncated input and returned partial/safe output, but its `streaming-lockstep` pipeline took 2249 ms — 1.79x slower than remotion-webcodecs (1255 ms) and 15.4x slower than ffmpeg's no-work short-circuit. Lost purely on time; correctness identical (same `graceful-failure` PASS). n==1, cached.
- **remotion-webcodecs@4.0.479** (PASS, runner-up to ffmpeg on raw wall): did the most honest thing of the three — ran the real `convertMedia` and produced partial/safe output in 1255 ms — but loses the literal wall tiebreak to ffmpeg's 146 ms early-throw. On any merit-weighted reading it is the true winner. n==1, cached.
- **platform@chrome-149** (NA_ENGINE): honest NA. `transcode` is not viable because the encode path is `<video>→canvas→MediaRecorder` (env.configUsed.encode), which cannot preserve/copy the source AAC audio track; the fixture has audio, so the engine declines rather than emit an audio-less file. Honest capability gap, not under-declaration.
- **web-demuxer@4.0.0** (NA_ENGINE): "engine does not declare operation 'transcode'" — honest. web-demuxer is a demux-only library (no encoder), so transcode is genuinely out of scope.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "does not declare operation 'transcode'" — honest. The media-parser package only parses/probes; encoding lives in the separate webcodecs package (which competed and PASSed).
- **mp4box@2.3.0** (NA_ENGINE): "does not declare operation 'transcode'" — honest. mp4box.js is an ISO-BMFF box parser/remuxer with no video/audio codec, so transcode is correctly NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/transcode/index.ts:1547-1556` (`id: 'malformed_truncated_h264_transcode'`, asset `transcode_truncated_h264_60p.mp4`, `options.gracefulAllowOutput: true`, notes: "must throw/reject within the timeout — no crash/hang/OOM ... deterministic 60%-truncated fixture").
- Fixture: `fixtures/media/transcode_truncated_h264_60p.mp4` exists, 19 MB — a real, non-empty, deliberately-truncated H.264/AAC MP4. Not synthetic/mock/empty. PASS on fixture authenticity.
- Oracle: `src/core/oracles.ts:2586-2623` (`gracefulFailure`). This is a SMOKE/robustness gate by design: it does NO golden/decoded-frame/SSIM comparison. A clean throw → PASS; with `gracefulAllowOutput:true`, returned partial output → PASS (2611-2612, 2625-2628). It is loose by construction — anything that neither crashes nor hangs passes. That makes the gate genuine for its stated purpose but WEAK as a correctness signal.
- Winner adapter (literal): ffmpeg-wasm `src/engines/ffmpeg-wasm/adapter.ts:2185-2186` — `if (input.id.includes('truncated')) throw ... 'before wasm encode'`. This is a **filename-keyed short-circuit**: it rejects on the test's id string, not on any inspection of the bytes, and never runs the wasm encoder. It satisfies the oracle but is a non-generalizable hardcoded path (would mis-fire on a valid file named with "truncated", and reveals nothing about ffmpeg's real demuxer robustness). This is the basis for the SUSPECT/cheat-adjacent flag.
- Genuine-path adapters: mediabunny `src/engines/mediabunny/adapter.ts:1271-1322` and remotion-webcodecs `src/engines/remotion-webcodecs/adapter.ts:521-577,579-635` BOTH open the real input and run the real conversion (`runConversion` / `wc.convertMedia`) with no id-string short-circuit. Their PASS reflects actual malformed-stream survival. No copy-input-to-output, no golden short-circuit, no error-swallow-as-success in these paths.
- Cached: ALL THREE PASS results have `cached==true` (mediabunny startedAt 13:52Z, remotion 17:00Z, ffmpeg 16:34Z). Staleness risk: results were reused, not re-run in this batch; timing numbers are historical single samples.
- Verdict: **WEAK-GATE**. The fixture is real and (for mediabunny/remotion) the implementation is genuine, but the oracle is smoke-only (`graceful-failure`, no correctness comparison), so the PASSes are real-but-not-strong. The literal wall winner (ffmpeg-wasm) additionally relies on a filename short-circuit that is cheat-adjacent; it is not classified CHEAT because the oracle's stated contract explicitly accepts a clean throw, but the perf "win" should be discounted.

## Confidence & caveats

Confidence: medium. The shard, scenario, oracle, and all three winners' adapter code were read directly, so the mechanism is well established. Caveats: (1) the gate is smoke-only — no engine demonstrated *fidelity*, only non-crash, so "best" here means "best-behaved on malformed input", not "best transcoder". (2) All evidence is n==1 single `durationMs` with no `bench{}` spread, and all three are `cached==true`, so wall comparisons are weak. (3) The literal-procedure winner ffmpeg-wasm wins only because of a filename short-circuit that does no real work; the merit-weighted winner is remotion-webcodecs (fastest genuine-conversion engine, 1.79x faster than mediabunny). Treat ffmpeg's 146 ms as an artifact, not a robustness result.
