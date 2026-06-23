# mux/neg_vp9_into_adts_illegal

- **family:** mux
- **fixture asset(s):** `fixtures/media/vp9_1080p_10s.webm` (9.3 MB, real VP9+Opus WebM)
- **primaryMetric:** none benched (negative / graceful-failure case; runner never benches robustness paths)
- **passCount:** 2 of 7 (ffmpeg.wasm@0.12.15, mediabunny@1.48.0)

## Verdict

- **Best framework:** `mediabunny@1.48.0` (marginal winner).
- **Contested:** YES — two engines PASS the single `graceful-failure` oracle with identical correctness strength.
- **Decisive factor:** With correctness strictly tied (both produce a clean rejection, no output, no crash/hang), this is decided on tiebreaker: mediabunny's rejection is enforced by the **real underlying library's container guard** (`AdtsOutputFormat` refuses a video track → "ADTS does not support video tracks."), it runs on a pure-TS/ESM core needing **no COOP/COEP and no SharedArrayBuffer** (`coopCoep:"not-required"`, `sharedArrayBuffer:false`), and it threw far sooner (40 ms vs 446 ms durationMs, both cached). ffmpeg.wasm rejects too, but via an **adapter-level pre-check** before any wasm muxer is consulted.
- **Margin over runner-up:** ~11x lower duration on the cached reject path (40 ms vs 446 ms). This is NOT a correctness margin — both reject equally well; it is the rejection-latency + deployment-friction tiebreaker.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (40 ms durationMs) | n/a | n/a | n/a | cached: graceful: ADTS does not support video tracks. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (446 ms durationMs) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: mux cannot write tracks [vp9, opus] into ADTS |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

Note: robustness/graceful-failure cases declare `metrics: ['wall','peakMemory']` (src/scenarios/mux/_shared.ts:324) but `runRobustness` never records a `bench{}` block (src/core/runner.ts:1093), so no median/p95/mad numbers exist for any engine here. Only `durationMs` is available.

## Why the winner wins (deep technical)

The operation is an **intentionally illegal mux**: take the demuxed tracks of a VP9 (video) + Opus (audio) WebM and write them into **ADTS** — a raw AAC elementary-stream wrapper (ISO 14496-3 / 13818-7) that can carry exactly one AAC audio stream and **no video track at all**. The only correct outcome is a clean throw/reject with no emitted file; the scenario notes (src/scenarios/mux/negative.ts:60-63) state "ADTS is a raw AAC elementary stream — it cannot hold a VP9 video track." The gate is the `graceful-failure` oracle (oracles.ts:2586), which PASSes when the op produced no output and did not crash/hang (the runner caught the throw and routed here with empty `ctx.output/metadata/demux/frames`, oracles.ts:2607-2610).

mediabunny reaches the muxer because `negotiate()` checks declared `containersOut` and codecs *separately* and does not model codec-in-container legality (negative.ts:15-19). mediabunny declares `adts` in both `containersIn` and `containersOut` (adapter.ts:1036, 1039) and declares `vp9`, so it passes negotiation and actually executes `mux()`. Inside `mux()` (adapter.ts:1508), `makeOutputFormat('adts', …)` returns a real `AdtsOutputFormat` (codecs.ts:182-183). For the VP9 track, the adapter maps the codec and calls `output.addVideoTrack(source, …)` (adapter.ts:1525-1529). **mediabunny's own library** then refuses: an AdtsOutputFormat cannot accept a video track, and throws "ADTS does not support video tracks." — exactly the reason string recorded in the shard. The throw propagates out of `mux()`, the runner catches it (runner.ts:1031-1039 maps a plain throw → `graceful`), and graceful-failure PASSes. Backend per `env.configUsed`: `backend:"webcodecs"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"` — the rejection costs no thread/cross-origin-isolation setup, and it returned in 40 ms.

ffmpeg.wasm also PASSes, but by a different mechanism and one step earlier. Its `mux()` (adapter.ts:2899) calls `assertMuxContainerCompatible(realTracks, 'adts')` (adapter.ts:2904), whose ADTS branch (adapter.ts:3055-3058) rejects when `hasVideo || audioCodecs.length !== 1 || audioCodecs[0] !== 'aac'`. The fixture's tracks are `[vp9, opus]` — `hasVideo` is true and the lone audio codec is Opus, not AAC — so it throws "ffmpeg.wasm@0.12.15: mux cannot write tracks [vp9, opus] into ADTS" before ever materializing an elementary stream or invoking the wasm muxer. That is a legitimate, accurate guard, but it is an *adapter pre-check* rather than the underlying muxer refusing; it also took 446 ms on the cached path.

Because correctness is exactly tied (one `graceful-failure` PASS each, no bit-exact/structural/perceptual ladder applies to a negative case), the tiebreakers in the decision procedure (4c) settle it: mediabunny wins on the rejection coming from the genuine library container guard, on requiring no COOP/COEP and no SharedArrayBuffer, and on the ~11x faster reject. None of these is a strong correctness signal — both engines are equally correct here.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** Correct clean reject, but via an adapter-level pre-check (assertMuxContainerCompatible, adapter.ts:3055-3058) instead of the real wasm muxer, and ~11x slower on the cached path (446 ms vs 40 ms durationMs). No correctness deficit — purely the tiebreaker.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'mux'." Honest NA — the WebCodecs platform adapter exposes no muxer, so it never claims the VP9→ADTS combo. Correct outcome, not eligible to win.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'webm'." Honest NA — mp4box is an ISOBMFF (MP4/MOV) tool and does not read WebM/Matroska, so it cannot even ingest the source. Correct.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'mux'." Honest NA — web-demuxer is a read/demux-only library, no write/mux path.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'mux'." Honest NA — parser-only, no muxing.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare operation 'mux'." Honest NA — its declared surface is transcode/convert, not a standalone mux op.

All five NAs look genuinely honest, not under-declared: none of these libraries actually exposes a general encoded-packet muxer that could take WebM tracks and write ADTS, so declining is the truthful capability statement (and per negative.ts:15-19 an honest NA is itself a correct, no-false-PASS outcome).

## Anti-cheat validation

- **Scenario:** src/scenarios/mux/negative.ts:55-63 (case `neg_vp9_into_adts_illegal`); built by `buildMuxNegative` (src/scenarios/mux/_shared.ts:309-328) with `op:'mux'`, `options.container:'adts'`, `oracles:['graceful-failure']`.
- **Fixture:** input `vp9_1080p_10s.webm` → `fixtures/media/vp9_1080p_10s.webm` EXISTS, 9.3 MB real VP9+Opus WebM (verified via stat). Real media, not synthetic/empty/mock.
- **Oracle:** `gracefulFailure` at src/core/oracles.ts:2586-2623. Real check: PASS only when the op left no output AND did not crash/hang (2607-2610); it FAILs (2614-2617) if any output was emitted from the illegal input. It is not trivially satisfiable in the wrong direction — emitting a garbage ADTS would fail it. The recorded `measurements` are empty (negative case has none to measure), consistent with a clean no-output reject.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1508 (`mux`), 1525-1529 (`addVideoTrack` onto AdtsOutputFormat) → real library guard throws "ADTS does not support video tracks." No canned output, no input→output copy, no golden short-circuit, no swallowed error. The throw is genuine and propagates.
- **Runner-up adapter (for completeness):** src/engines/ffmpeg-wasm/adapter.ts:2904 + 3055-3058 — real codec/container legality guard; also a genuine reject.
- **Verdict:** WEAK-GATE. Both implementations and the fixture are real, and the rejection is genuine — but the gate is a `graceful-failure` (negative) oracle: it confirms the engine did NOT do the wrong thing, not that it produced any correct artifact. That is the weakest, smoke-equivalent class of evidence on the correctness ladder. The "win" is real but not strong, and the margin is a latency/deployment tiebreaker, not a correctness differentiator.
- **Cached note:** Both PASS results have `cached:true` (mediabunny startedAt 2026-06-22T16:56, ffmpeg startedAt 2026-06-22T13:55). The verdicts were reused, not freshly re-run; per the launcher seeding caveat, the 40 ms / 446 ms durations and the PASS verdicts carry staleness risk and should be re-validated on a clean run before being treated as live.

## Confidence & caveats

- **Confidence: low.** The winner is correct, but (1) the deciding oracle is a negative graceful-failure gate (weakest evidence class), (2) there is no bench data so the only quantitative separator is `durationMs` on a cached path, and (3) both PASS results are cached. A fresh run could narrow or invert the latency margin.
- The choice of mediabunny over ffmpeg.wasm is defensible but marginal — both are equally correct. If the ranking weights "reject originates from the real library muxer vs an adapter pre-check," mediabunny wins; if it weights "explicit, auditable, codec-listed adapter guard," ffmpeg.wasm is arguably cleaner. Either is an acceptable PASS.
- All five NAs are honest capability declarations, not concealed failures.
