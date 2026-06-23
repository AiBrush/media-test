# mux/neg_h264_into_wav_illegal

- **Family:** mux (negative / illegal codec→container)
- **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (real 31 MB H.264 1080p/30s MP4; demuxed source feeds the muxer)
- **Target container:** `wav` (PCM-audio-only; cannot carry an H.264 video track)
- **Primary metric:** none declared in shard entries; ranking falls back to `durationMs` (scenario metrics = `wall`, `peakMemory`, but no `bench{}` was emitted)
- **passCount:** 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — two engines PASS (mediabunny, ffmpeg-wasm), both via the identical `graceful-failure` oracle.
- **Decisive factor:** Correctness is a tie (both reject H.264→WAV cleanly with no output; the oracle ladder has only the single `graceful-failure` gate, identically satisfied). The tiebreak is **performance + tiebreakers**. mediabunny rejected in **62 ms** vs ffmpeg-wasm's **301 ms** → **~4.86x faster** to reach the clean rejection. mediabunny also wins the architectural tiebreakers: pure-TS ESM core, **no COOP/COEP requirement**, `sharedArrayBuffer:false`, single shared module vs ffmpeg.wasm's heavyweight multi-MB wasm runtime.
- **Margin over runner-up:** 62 ms vs 301 ms (4.86x lower wall). Evidence is weak-ish: both results are `cached==true` and each is a single observation (no median/p95/MAD in shard).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 62 ms (durationMs) | n/a | n/a | n/a | cached: graceful: WAVE does not support video tracks. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 301 ms (durationMs) | n/a | n/a | n/a | cached: graceful: mux cannot write tracks [h264, aac] into WAV |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'wav' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

No `bench{}` block (median/p95/mad/throughputRealtime/peakMemory/longtasks) was emitted for either PASS engine in this shard, so the table reports the only timing present, `durationMs`.

## Why the winner wins (deep technical)

This is a **negative mux** case: take the demuxed H.264 video (plus AAC audio) from a real MP4 and attempt to mux it into **WAV**, a RIFF/PCM-audio-only container that has no concept of a video track. Per the scenario notes (`src/scenarios/mux/negative.ts:39-42`), the only correct behavior is a **clean throw/reject within the 15 s timeout** — never emit a "garbage WAV" that later round-trips. Because the harness's `negotiate()` checks declared `containersOut` and codecs *separately* and does not model codec-in-container legality (`negative.ts:15-19`), an engine that declares both `wav` output and `h264` video reaches the muxer and must guard internally; an engine that declares neither cleanly NA's. Both outcomes avoid a false PASS.

**mediabunny is the only engine that both declares `wav` output AND H.264 video, then rejects internally.** Its capability set declares `containersOut: ['mp4','mov','mkv','webm','ts','wav','mp3','flac','ogg','adts']` (`src/engines/mediabunny/adapter.ts:1039`), so it passes negotiation and actually exercises the muxer's container/codec guard. In `mux()` (`src/engines/mediabunny/adapter.ts:1508`), it builds the WAV output format (`makeOutputFormat('wav', ...)` → `WavOutputFormat`, `src/engines/mediabunny/codecs.ts:174-175`), then for the video track calls `output.addVideoTrack(source, ...)` (`adapter.ts:1529`). The library's `WavOutputFormat` has no video-track support, so `addVideoTrack` throws **"WAVE does not support video tracks."** — exactly the reason string captured in the shard. This is a genuine library-level guard, not an adapter short-circuit. The runner's `runRobustness` (`src/core/runner.ts:1028-1041`) catches that throw, classifies it `verdict='graceful'`, and leaves `opResult` undefined; `gracefulFailure` (`src/core/oracles.ts:2607-2609`) then sees `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` and returns PASS ("operation produced no output and did not crash/hang → handled gracefully").

mediabunny ran on `backend:webcodecs`, `hwAccel:prefer-hardware`, `pipeline:streaming-lockstep`, `coreBuild:pure-ts-esm`, `coopCoep:not-required`, `sharedArrayBuffer:false` (shard `env.configUsed`). For this case the WebCodecs/hardware path is incidental — the rejection happens at muxer-construction time, before any packet is added — which is precisely why it is so fast: **62 ms** is dominated by demuxing/opening the source and the immediate guard throw, with no encode/decode work. The pure-TS muxer fails fast and cheaply.

**ffmpeg.wasm also rejects correctly but is 4.86x slower (301 ms).** It declares wav as a mux target (`src/engines/ffmpeg-wasm/codecs.ts:94`) and reports the symmetric guard "mux cannot write tracks [h264, aac] into WAV". Its slowness is structural: the ffmpeg.wasm path has to spin up its wasm module and run muxer negotiation through the emscripten FS/CLI layer to discover that the avformat WAV muxer rejects an H.264 stream, all of which carries fixed wasm-runtime overhead absent from mediabunny's in-process TS guard. Correctness is identical; the cost to reach it is not.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but lost on performance: 301 ms vs mediabunny's 62 ms (4.86x slower wall to reach the same clean rejection), plus it requires a multi-MB wasm runtime where mediabunny does not. Correctness identical (graceful-failure:true).
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'wav'". Honest NA — mp4box is an ISO-BMFF (MP4) muxer and legitimately cannot target WAV, so it never claims the illegal combo.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — the WebCodecs platform adapter exposes encode/decode primitives, not a container-muxing op.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — it is a demux-only library (name and scope), no write/mux side.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — a parser/reader, not a muxer.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest NA — its surface is WebCodecs transcode/convert, with muxing not declared as the harness `mux` op here.

All five NAs are honest declared-capability gaps (op `mux` or container `wav` not declared), not under-declared capabilities being hidden — each is a parser/demuxer/encoder that genuinely lacks an arbitrary-codec WAV muxer.

## Anti-cheat validation

- **Scenario:** `src/scenarios/mux/negative.ts:34` (id `neg_h264_into_wav_illegal`), built via `buildMuxNegative` in `src/scenarios/mux/_shared.ts:309` → `op:'mux'`, `options.container:'wav'`, `oracles:['graceful-failure']`, requires `videoCodecs:['h264']`, `containersIn:['mp4']`, `containersOut:['wav']`.
- **Fixture:** input `h264_1080p_30s.mp4` exists and is real — `fixtures/media/h264_1080p_30s.mp4`, 31 MB (stat confirmed). Not synthetic/empty/mock. The illegal target (wav) is deliberately one mediabunny declares as a write target so the case exercises the real muxer guard rather than NA-ing for everyone (`negative.ts:21-23`).
- **Oracle:** `gracefulFailure` at `src/core/oracles.ts:2586`. Not trivially satisfiable for this op: PASS requires the runner to have caught a throw/reject leaving NO output (`oracles.ts:2607-2610`); had the engine *emitted* output from this illegal mux it would FAIL ("operation produced output from malformed/mutated input", `oracles.ts:2614-2617`). The runner's `runRobustness` (`src/core/runner.ts:1028-1042`) is the real driver: a clean throw → `graceful`; a hang → `timeout` → FAIL.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1508` (`mux`), throwing at `addVideoTrack` (`adapter.ts:1529`) via `WavOutputFormat` (`src/engines/mediabunny/codecs.ts:174`). Genuine library guard ("WAVE does not support video tracks."), not a canned-output / golden-short-circuit / swallowed-error path. The adapter does not fabricate a rejection — it lets the real library reject.
- **Measurements plausibility:** No fabricated correctness numbers (negative test; the only measurement is the boolean graceful pass + durationMs). 62 ms and 301 ms are physically plausible fail-fast guard timings.
- **Cached note:** BOTH PASS results have `cached==true` (mediabunny `durationMs:62`, ffmpeg-wasm `durationMs:301`). Reused, not re-run this session — staleness risk on the exact timing numbers. The correctness verdict (clean rejection) is structurally robust and unlikely to flip; the 4.86x margin is the soft part of the conclusion.
- **Verdict:** **REAL** — real 31 MB fixture, real library-level muxer guard in the winner, and a meaningful oracle that only PASSes on a genuine no-output rejection and FAILs on emitted garbage or a hang.

## Confidence & caveats

- **Confidence: medium.** The correctness conclusion (mediabunny correctly rejects H.264→WAV, REAL gate) is high-confidence and code-verified. The *ranking* is medium: it rests entirely on `durationMs` (62 vs 301 ms) because no `bench{}`/`primaryMetric` was emitted, and both data points are `cached==true` single observations (no n/median/p95/MAD), so the 4.86x margin has no spread to bound it.
- For a negative test, "winning" is somewhat nominal — both PASS engines are equally correct. mediabunny is named best on fail-fast latency + no-COOP/COEP + pure-TS bundle tiebreakers, not on any correctness superiority.
- Five NA engines are all honest capability gaps, not hidden/under-declared muxers.
