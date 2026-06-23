# mux/neg_zero_tracks_empty_audio_to_mp4

family: mux | fixture asset: `fixtures/media/empty_audio.wav` (44 bytes — WAV header + EMPTY data chunk) | primaryMetric: wall (negative test; metrics=[wall, peakMemory]) | passCount: 2 / 7

This is a NEGATIVE (graceful-failure) scenario: a valid WAV whose `data` chunk is empty demuxes to a track with zero codable samples. The operation `mux(... → mp4)` MUST reject cleanly (throw/reject, no output) within 15 s — it must NOT emit a 0-byte/garbage MP4 that later "round-trips". "Winning" here = correctly refusing to produce output.

## Verdict
- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS: mediabunny + ffmpeg.wasm@0.12.15).
- Decisive factor: both passers satisfy the same single oracle (`graceful-failure`) with identical strength (a clean rejection, no output). Tie broken on PERFORMANCE — wall median. mediabunny rejected in **16 ms** vs ffmpeg.wasm **162 ms** → **~10.1x faster** to refuse. Both backends per `env.configUsed` are clean (mediabunny webcodecs/pure-ts-esm, no COOP/COEP, no SharedArrayBuffer); ffmpeg.wasm carries a wasm worker and far heavier teardown cost. mediabunny is also the lighter / no-cross-origin-isolation path, reinforcing the tiebreak.
- Margin over runner-up: ~10.1x lower wall (16 ms vs 162 ms). Both results are `cached==true` and `durationMs` is a single observation each (no bench distribution recorded for this negative case), so the magnitude is directional, not a hardened benchmark.

## Per-engine results
| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs 16) | n/a | n/a | n/a | cached: graceful: MP4 requires at least 1 track. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs 162) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: mux requires at least one audio/video track |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

Note: this negative scenario records `metrics: ['wall','peakMemory']` but the shard carries no populated `bench{}` block for either passer — only `durationMs` (16 / 162). All throughput/memory/longtask cells are therefore "n/a".

## Why the winner wins (deep technical)
The container/codec combination is degenerate: input `empty_audio.wav` is a 44-byte canonical WAV (RIFF/WAVE header with an empty `data` chunk). Demuxing it yields a PCM audio track descriptor with **zero EncodedPacket samples**. The muxer is then asked to write an MP4 (`opts.container='mp4'`) from an `EncodedTracks` set that, after demux, contains no codable samples. Correct behavior is a clean reject; emitting an MP4 `moov` with an empty/zero-sample `stbl` would be the cheat the scenario notes warn against.

mediabunny reaches the reject via its REAL library path, not a hand-rolled stub. `mux()` (`src/engines/mediabunny/adapter.ts:1508`) builds a real `mb.Output({format, target})` (line 1514), iterates `tracks.tracks` adding `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (lines 1524–1551), calls `await output.start()` (line 1553), pushes packets (lines 1555–1591), and finally `await output.finalize()` (line ~1598). With an empty source no track is actually registered/finalizable, so mediabunny's own library guard fires: `node_modules/mediabunny/dist/modules/src/output.js:504` throws `"<format> requires at least 1 track"` — surfaced verbatim in the shard reason ("MP4 requires at least 1 track."). This is a library-enforced invariant, the strongest possible evidence the rejection is genuine. The runner caught that throw, left `ctx.output` undefined, and `gracefulFailure` (`src/core/oracles.ts:2586`) took the `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` branch (line 2608) → PASS "operation produced no output and did not crash/hang → handled gracefully".

Backend per `env.configUsed`: `backend=webcodecs`, `coreBuild=pure-ts-esm`, `wasmThreads=0`, `sharedArrayBuffer=false`, `coopCoep=not-required`. The reject is pure TS validation logic — no wasm spin-up, no worker — which is why wall is 16 ms.

ffmpeg.wasm reaches the same verdict but earlier and more cheaply-coded: its `mux()` (`src/engines/ffmpeg-wasm/adapter.ts:2899`) does `realTracks = tracks.tracks.filter(t => t.type==='video'||t.type==='audio')` and immediately `if (realTracks.length === 0) throw new Error("ffmpeg-wasm: mux requires at least one audio/video track")` (lines 2900–2902) — an explicit pre-flight guard before any FFmpeg exec. That is also genuine (it refuses without writing a file), and the shard reason matches verbatim. But because it still routes through the wasm worker adapter and its tear-down/measurement overhead, `durationMs=162` — ~10x slower than mediabunny's in-process throw.

Both PASS the same oracle at the same strength (clean reject, no output). Correctness is therefore a tie; the only separator is the wall margin (10.1x), and mediabunny additionally avoids the wasm/worker stack entirely, giving it the lighter, no-cross-origin-isolation footprint per tiebreaker (c).

## What each other framework did wrong
- platform@chrome-149: NA_ENGINE — does not declare operation 'mux'. Honest NA: the WebCodecs platform shim has no muxer, so it never claims the illegal/degenerate combo; cannot win a mux scenario.
- remotion-webcodecs@4.0.479: NA_ENGINE — does not declare operation 'mux'. Honest NA (decode/encode-focused; no container writer declared).
- remotion-media-parser@4.0.479: NA_ENGINE — does not declare operation 'mux'. Honest NA (parser/reader only, no mux op).
- web-demuxer@4.0.0: NA_ENGINE — does not declare operation 'mux'. Honest NA (demux-only library, no muxing capability).
- mp4box@2.3.0: NA_ENGINE — does not declare input container 'wav'. Honest NA: mp4box reads/writes ISOBMFF, not RIFF/WAV, so it cannot demux the source; per `negotiate()` (which gates on declared `containersIn`) it cleanly NA's rather than faking. This is the alternate correct outcome the scenario notes describe (an engine that does not declare `wav` never claims the combo → no false PASS).

All five NAs are honest capability gaps, not under-declared capabilities: none of these libraries ship an MP4 muxer fed from a WAV demux, so declaring `mux`/`wav` would be a false claim.

## Anti-cheat validation
- Scenario definition: `src/scenarios/mux/negative.ts:67` (case `neg_zero_tracks_empty_audio_to_mp4`), built by `buildMuxNegative` at `src/scenarios/mux/_shared.ts:309` (op `mux`, oracles `['graceful-failure']`, target container `mp4`, requires demux+mux+containerIn `wav`).
- Fixture: `fixtures/media/empty_audio.wav` EXISTS — 44 bytes (`stat` size=44), a real RIFF/WAVE header with an empty `data` chunk, exactly the "valid-but-empty" source the notes describe. Real fixture, not synthetic/mock.
- Oracle: `graceful-failure` at `src/core/oracles.ts:2586` (dispatch `src/core/oracles.ts:341`). It PASSes only when NO output/metadata/demux/frames were produced (line 2608) OR an explicit signal token says graceful; it FAILs if output is emitted from malformed input (line 2614). This is a meaningful gate for a negative test — a faked 0-byte/garbage MP4 would still set `ctx.output` and FAIL. Not trivially satisfiable in the "emit garbage" direction.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508` (`mux`), with the rejection enforced by the real library at `node_modules/mediabunny/dist/modules/src/output.js:504` ("requires at least 1 track"). No canned output, no input→output copy, no golden short-circuit: the throw comes from mediabunny's own finalize() invariant. Runner-up ffmpeg.wasm guard at `src/engines/ffmpeg-wasm/adapter.ts:2901-2902` is likewise a genuine pre-exec reject.
- Measurements: `oracleOutcomes[].detail` = "operation produced no output and did not crash/hang → handled gracefully"; reasons quote the real library/guard messages. Physically plausible: a zero-sample mux must reject; durations (16/162 ms) are sane for a validation-only path.
- Cached note: BOTH passers have `cached==true` (mediabunny startedAt 2026-06-22T14:11Z, ffmpeg 2026-06-22T16:39Z). Results were REUSED, not freshly re-run, so timings carry staleness risk per the launcher-seeding caveat. The PASS/FAIL verdict itself is robust (deterministic code-path reject), but the 10.1x wall margin should be treated as directional.
- Verdict: **REAL** — real 44-byte fixture, real library-enforced rejection (mediabunny output.js:504) and a real pre-flight guard (ffmpeg adapter:2901), meaningful graceful-failure oracle that would catch a faked-output cheat.

## Confidence & caveats
- Confidence: high on the verdict (mediabunny wins; correctness tie broken by a 10x wall margin and the cleaner no-wasm/no-COOP backend). The reject path is library-enforced and verified in source.
- Caveats: (1) Both winners are `cached==true` with single `durationMs` observations and no `bench{}` distribution — the 10.1x margin is directional, not a hardened p50 with MAD/p95 spread. (2) Performance is the only differentiator because correctness is identical; in a strict negative test both passers are equally "correct". (3) Five NAs are honest capability gaps; only mediabunny and ffmpeg.wasm declare an MP4 muxer fed from a WAV demux, so the contest is effectively 2-way.
