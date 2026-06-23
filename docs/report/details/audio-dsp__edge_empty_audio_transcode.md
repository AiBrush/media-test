# audio-dsp/edge_empty_audio_transcode

family: audio-dsp | fixture asset: `empty_audio.wav` (44-byte structurally-valid RIFF/WAVE, PCM s16, 44100 Hz, 2ch, `data` chunk length 0 → zero samples) | primaryMetric: durationMs (no `bench{}` block emitted; only `durationMs`) | passCount: 3 of 7

## Verdict

Best framework: **mediabunny@1.48.0** — CONTESTED (3 PASS: mediabunny, ffmpeg.wasm, remotion-webcodecs).

Decisive factor: correctness strength is identical across all three PASS engines — every one of them passes exactly the **same single oracle, `graceful-failure`**, and nothing stronger (no decode/golden/PCM comparison is possible because the input carries zero audio samples). With correctness tied, the tiebreaker falls to performance via the primaryMetric `durationMs`: mediabunny `13 ms` < remotion-webcodecs `15 ms` < ffmpeg.wasm `252 ms`.

Margin over runner-up: **~1.15x faster wall than remotion-webcodecs** (13 ms vs 15 ms) and **~19.4x faster than ffmpeg.wasm** (13 ms vs 252 ms). This is WEAK evidence: each number is a single cached `durationMs` (n=1, no median/p95/mad), and the gate itself is robustness-only, so the 2 ms lead over remotion is within noise.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 13 ms | n/a | n/a | n/a | cached: "operation produced no output and did not crash/hang → handled gracefully" |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 252 ms | n/a | n/a | n/a | cached: "operation returned partial/safe output and did not crash/hang" |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 15 ms | n/a | n/a | n/a | cached: "operation returned partial/safe output and did not crash/hang" |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

No engine emitted a `bench{}` block for this scenario; throughputRealtime / peakMemory / longtasks are unavailable. `durationMs` is the only timing signal and is the primaryMetric.

## Why the winner wins (deep technical)

The operation is a WAV→WAV PCM-s16 resample-to-44100 transcode of a *structurally valid but empty* container. `empty_audio.wav` is a real 44-byte RIFF file: `RIFF`(size 0x24) `WAVE` `fmt `(16 bytes: format 1 PCM, 2 channels, 0xBB80 = 44100 Hz, blockAlign 4, 16 bits) `data`(length 0). There are no audio frames to encode, so by construction NO decode-correctness oracle (decoded-audio-pcm, golden-packets) can apply — the only meaningful contract is robustness: the converter must either emit a sane empty output or throw cleanly, never crash/hang/OOM. The scenario sets `opts.gracefulAllowOutput: true`, so both behaviors satisfy the gate (oracles.ts:2611-2613, `gracefulAllowsReturnedOutput` → oracles.ts:2625-2628).

mediabunny's transcode path (src/engines/mediabunny/adapter.ts:1271-1322) is a genuine library call: it builds the WAV output format via `makeOutputFormat`, opens the input through `openInput`, constructs a `this.lib.Output` + `ConversionOptions`, validates that an audio-output request has a matching audio track (adapter.ts:1297-1299), computes `inputDuration` (null/0 here), builds audio options with `buildAudioOptions(... codec pcm-s16 ...)`, and runs `runConversion` (adapter.ts:1307). For the empty source the Conversion yields no PCM; mediabunny surfaces this as a throw, the runner catches it and routes to `graceful-failure`, which sees no `ctx.output/metadata/demux/frames` and returns PASS via oracles.ts:2607-2609 ("operation produced no output and did not crash/hang"). That clean-throw branch is the strictest of the two acceptable robustness outcomes (it does not even rely on the `gracefulAllowOutput` relaxation), and it completed in 13 ms.

remotion-webcodecs (src/engines/remotion-webcodecs/adapter.ts:521-560) is equally genuine: it maps the WAV container, forces audio re-encode through `convertMedia` (the resolver returns `reencode` unconditionally so the requested 44100 Hz is honored rather than a `copy` that would leak the source rate), and emits a partial/safe empty WAV — PASS via the `gracefulAllowsReturnedOutput` branch, 15 ms. ffmpeg.wasm (src/engines/ffmpeg-wasm/adapter.ts) runs the real wasm `ffmpeg` invocation and likewise returns a safe empty output, but pays the wasm process/IO overhead: 252 ms, ~19.4x slower.

Because the correctness oracle is identical and binary (all three just PASS `graceful-failure`), the ranking is purely the `durationMs` tiebreaker, and mediabunny's pure-TS-ESM streaming-lockstep path (env.configUsed.coreBuild=`pure-ts-esm`, pipeline=`streaming-lockstep`, sharedArrayBuffer=false, coopCoep=`not-required`) gives it the lowest wall while also satisfying the no-COOP/COEP and no-wasm-thread tiebreakers (configUsed.wasmThreads=0). The 13-vs-15 ms gap over remotion is essentially noise; the decisive, defensible gap is the 19.4x lead over ffmpeg.wasm's wasm overhead.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost on performance: `252 ms` vs winner `13 ms` (~19.4x slower wall). Correctness identical (graceful-failure:pass, "returned partial/safe output"). The loss is structural: wasm module + virtual-FS round-trip dominates wall time for a near-empty job.
- **remotion-webcodecs@4.0.479** — PASS but lost on the durationMs tiebreaker by ~2 ms (`15 ms` vs `13 ms`, ~1.15x). Same correctness (graceful-failure:pass via the partial-output branch). Margin is within single-sample noise.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare output container 'wav'". Honest capability gap — the platform/WebCodecs adapter has no WAV muxer, so it cannot perform a WAV→WAV transcode.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — media-parser is a demux/parse-only library, not an encoder.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — mp4box is an MP4 box/remux tool with no audio encoder.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — demux-only library, no encode path.

All four NA verdicts look genuine, not under-declared: WAV-muxing audio re-encode is outside each library's documented surface.

## Anti-cheat validation

- Scenario definition: src/scenarios/audio-dsp/index.ts:580-595 (`id: 'edge_empty_audio_transcode'`, op `transcode`, asset `empty_audio.wav`, container/outContainer `wav`, codec `pcm-s16`@44100, `gracefulAllowOutput: true`, oracle `graceful-failure`). notes (index.ts:593-594) document the A.16 zero-length intent: "structurally-valid empty WAV through a resample must be handled gracefully (empty output or clean throw)."
- Fixture exists and is REAL: `fixtures/media/empty_audio.wav`, 44 bytes, valid RIFF/WAVE header with a genuine `fmt ` chunk (PCM s16, 44100 Hz, stereo) and a zero-length `data` chunk (`xxd` confirmed: `... 6461 7461 0000 0000`). Not synthetic/mock — it is a legitimate boundary-condition media file.
- Oracle: src/core/oracles.ts:2586-2628 (`gracefulFailure`). It infers from output presence for robustness scenarios: no output → PASS (clean throw), or `gracefulAllowOutput:true` → partial output PASS, otherwise FAIL. It is a REAL robustness check (it would FAIL an engine that returned output for a malformed input without the allowance), but it is NOT a correctness gate — for empty audio it cannot compare decoded PCM or packets against a golden.
- Winner adapter: src/engines/mediabunny/adapter.ts:1271-1322 (`transcode`) → real `openInput`/`Output`/`runConversion`; track-presence guards at :1294-1299; conversion at :1307. No canned output, no input→output copy, no golden short-circuit, no error swallowing (the throw is what produces the PASS).
- Verdict: **WEAK-GATE.** Real fixture + real implementation + a meaningful-but-loose oracle. The single `graceful-failure` gate is appropriate for an empty-input edge case but is binary and proxy-level; it cannot distinguish transcode *quality*, so the "win" rests entirely on a tiny, single-sample durationMs delta. Not a CHEAT — the implementations genuinely run their libraries — but the PASS is not strong correctness evidence.
- Cached note: ALL three PASS results have `cached:true` (mediabunny startedAt 16:55:51Z, ffmpeg 14:04:42Z, remotion 16:35:32Z; reasons explicitly say "cached previous PASS result" / "cached: graceful"). Timings were reused, not freshly measured → staleness risk on the durationMs tiebreaker is real; the 13-vs-15 ms ordering should not be over-trusted.

## Confidence & caveats

Confidence: medium. The PASS/NA structure is unambiguous and verified against scenario, oracle, fixture, and adapter code. However: (1) the winner is decided solely by a ~2 ms cached single-sample durationMs over remotion-webcodecs — within noise; (2) the only oracle is robustness-only (`graceful-failure`), so this scenario certifies graceful empty-input handling, not transcode correctness; (3) every PASS is cached, so timings are stale. The robust, defensible claims are: (a) 4 engines are honestly NA, (b) mediabunny, ffmpeg.wasm, and remotion-webcodecs all handle empty WAV gracefully, and (c) mediabunny is fastest, decisively so only versus ffmpeg.wasm (~19.4x).
