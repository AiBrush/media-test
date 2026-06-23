# trim/robust_start_past_eof

family: trim | fixture asset: `h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4, ~31 MB, real) | primaryMetric: none recorded (metrics declared: wall, peakMemory) | passCount: 2 of 7

This is a robustness scenario: trim range `startUs=40_000_000 .. endUs=45_000_000` (40s..45s) on a file whose duration is ~30s. The start is past EOF, so there is nothing to cut. The single gating oracle is `graceful-failure`: an engine PASSes iff it rejects cleanly (throws/rejects within the timeout, produces no output) and does NOT crash/hang/OOM or fabricate output.

## Verdict

- Best framework: **mediabunny@1.48.0**
- CONTESTED: two engines PASS (mediabunny and ffmpeg.wasm@0.12.15). Five engines are NA_ENGINE (do not declare `trim`).
- Correctness is a tie: both PASS exactly the same single oracle (`graceful-failure`) at the same strength (a robustness/smoke gate — "no output, no crash"). Neither produced any output.
- Decisive factor: **performance / rejection latency**. mediabunny rejected in `durationMs=97`; ffmpeg.wasm in `durationMs=207`. Margin: **~2.13x faster wall** for mediabunny over the runner-up. Secondary tiebreaker also favors mediabunny: it reaches the throw with a lighter path (it lets its real Conversion sink raise `startSample out of range` while opening the input lazily), whereas ffmpeg.wasm must write the 31 MB file into MEMFS and run a full `runInfo` probe before it can compare start vs duration.

Note both results are `cached==true` and neither carries a `bench{}` block, so the only quantitative signal is `durationMs` (effectively n implied small / not a benched distribution). The performance margin is real but lightly sampled.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs=97) | n/a | n/a | n/a | cached: graceful: startSample out of range. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs=207) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: trim start is past end-of-file |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

No `bench{}` objects or `primaryMetric` were present in the shard for any engine; wall/throughput/peakMemory/longtasks columns are therefore n/a. `durationMs` is shown inline as the only timing signal.

## Why the winner wins (deep technical)

The container is faststart MP4 carrying H.264 video and AAC audio; nominal duration ~30s. The requested trim window (40s..45s) begins entirely past the last sample. A correct engine must recognize that the start anchor cannot be located in the sample tables and reject — never emit a zero/garbage clip.

mediabunny's win is mechanistic and lives in its real trim path. The adapter's `trim()` (src/engines/mediabunny/adapter.ts:1445) validates only the obviously-illegal cases first — negative start (line 1450-1452) and inverted/empty range (line 1453-1455) — neither of which applies here (start 40s > 0, end 45s > start 40s). It then opens the input lazily (`openInput`, line 1460) and builds a real mediabunny `Conversion` with `trim: { start: 40, end: 45 }` (line 1485-1488), executed through `runConversion` (line 1496). Because the adapter deliberately does NOT pre-clamp or pre-probe the past-EOF case, the responsibility falls to mediabunny's real sample/packet sink, which cannot resolve a start sample at 40s in a 30s file and throws `startSample out of range` (the exact `reason` in the shard). The runner catches that throw, leaves `ctx.output`/`ctx.metadata`/`ctx.demux`/`ctx.frames` undefined, and `gracefulFailure` (src/core/oracles.ts:2586) takes the robustness branch (scenario.oracles includes `graceful-failure`, line 2606) and returns PASS via the "no output → handled gracefully" path (line 2608-2609). The configUsed backend was `webcodecs` / `prefer-hardware` / `coopCoep: not-required` / `wasmThreads: 0`, but no decode/encode actually ran — the rejection short-circuits before any WebCodecs work — which is why it completes in only 97ms.

ffmpeg.wasm reaches the same verdict but more expensively and via a different code path. Its `trim()` (src/engines/ffmpeg-wasm/adapter.ts:2538) passes the same domain guards (start ≥ 0, end > start, line 2559-2561), then must materialize the 31 MB input into MEMFS (`writeInput`, line 2565) and run a full ffmpeg probe (`runInfo` + `metadataFromLog`, line 2567) to learn the real duration. Only then does its explicit content-aware check `startSec >= inputMetadata.durationSec` fire and throw `trim start is past end-of-file` (line 2570-2572) — again the exact shard `reason`. That extra MEMFS copy + probe is the source of the 207ms vs mediabunny's 97ms; both are honest rejections, but mediabunny's is cheaper.

So with correctness tied (identical single oracle, identical "no output" strength), the ranking falls to performance per the decision procedure step 4(b): mediabunny is ~2.13x faster to the clean rejection (97ms vs 207ms), and step 4(c) reinforces it — mediabunny avoids whole-file MEMFS buffering and a separate probe pass, requires no COOP/COEP, and uses lazy input reads.

## What each other framework did wrong

- ffmpeg.wasm@0.12.15: PASS, but lost on speed. It rejected correctly (`trim start is past end-of-file`, adapter.ts:2570-2572) yet took 207ms vs mediabunny's 97ms because it buffers the full 31 MB file into MEMFS and runs a full `runInfo` probe before it can compare start against duration. ~2.13x slower; no correctness advantage to offset it.
- mp4box@2.3.0: NA_ENGINE — "engine does not declare operation 'trim'". Honest NA: mp4box is a box parser/(re)muxer; it has no trim/cut operation in its capability set, so it never entered the scenario.
- platform@chrome-149: NA_ENGINE — does not declare `trim`. Honest: the bare browser/WebCodecs platform adapter exposes decode/encode primitives, not a packaged trim op.
- web-demuxer@4.0.0: NA_ENGINE — does not declare `trim`. Honest: web-demuxer is a demux-only library.
- remotion-media-parser@4.0.479: NA_ENGINE — does not declare `trim`. Honest: it is a parser, not an editor.
- remotion-webcodecs@4.0.479: NA_ENGINE — does not declare `trim`. This is the one mild surprise (remotion-webcodecs does perform conversions elsewhere), but for this suite its capability map does not list the `trim` operation, so the NA is taken at face value here; nothing in this shard contradicts it.

## Anti-cheat validation

- Scenario definition: src/scenarios/trim/index.ts:867-878 (case `robust_start_past_eof`) and the factory at lines 919-943 wiring `op: 'trim'`, `oracles: ['graceful-failure']`, `range { startUs: 40_000_000, endUs: 45_000_000 }`, `notes: 'startUs ≥ duration (past EOF): nothing to cut; trim must reject gracefully.'`
- Fixture: `h264_1080p_30s.mp4`. Confirmed present at fixtures/media/h264_1080p_30s.mp4 (~31 MB real H.264/AAC MP4). Real file, not synthetic/empty/mock; its real ~30s duration is exactly what makes a 40s start past EOF.
- Oracle: `gracefulFailure` at src/core/oracles.ts:2586-2623. It is NOT trivially satisfiable in a harmful direction: it PASSes only when there is genuinely no output AND no crash/hang (lines 2607-2609); it explicitly FAILs an engine that produces output from malformed/out-of-domain input (lines 2614-2617). For this scenario `gracefulAllowOutput` is not set, so any fabricated clip would have failed. This is a robustness/smoke gate by design (it asserts a clean throw, not bit-exactness) — strong enough for the intent, but it is a smoke-level oracle, not a correctness oracle.
- Winner adapter: src/engines/mediabunny/adapter.ts:1445-1500. The trim genuinely builds and runs a real mediabunny `Conversion` (lines 1485-1496); it does not return canned output, does not copy input→output for the past-EOF case, does not short-circuit to a golden, and does not swallow the error — the `startSample out of range` throw propagates to the runner. (For comparison, ffmpeg.wasm adapter.ts:2538-2572 is likewise a real probe-then-reject path.)
- Cached note: both PASS results have `cached==true` (mediabunny startedAt 16:50:21Z, ffmpeg startedAt 17:04:55Z). The verdicts were reused, not freshly re-run in this report pass; per the launcher seeding caveat, the timing values in particular should be treated as reused evidence.
- Verdict: **WEAK-GATE**. Real fixture + real implementations + a meaningful-but-smoke oracle (graceful-failure asserts a clean reject with no output; it is robustness-level, not a bit-exact/structural correctness gate). PASS is genuine for both engines; the win is correct but rests on a proxy/smoke gate plus a single-sample timing margin.

## Confidence & caveats

- Confidence: medium. The PASS/NA structure is unambiguous and both implementations are verified real, but (1) the gate is smoke-level (graceful-failure), so it cannot distinguish *quality* of rejection beyond "no output"; (2) both winners are `cached==true` with no `bench{}` distribution and only a single `durationMs` figure each, so the 2.13x margin is lightly sampled (no p95/mad/n to confirm stability); (3) the five NA_ENGINE results are honest capability gaps, with remotion-webcodecs the only mildly notable omission.
- If re-run fresh (clearing raw + .browser-cache per the seeding caveat), the relative ordering (mediabunny faster to reject than ffmpeg.wasm) is expected to hold structurally because ffmpeg.wasm's MEMFS write + probe is intrinsic to its path, but the exact ms values could shift.
