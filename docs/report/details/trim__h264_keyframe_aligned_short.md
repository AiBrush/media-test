# trim/h264_keyframe_aligned_short

family: trim | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264/AAC in MP4, ~31MB) | primaryMetric: wall (with throughputRealtime) | passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Status: **CONTESTED** — two engines PASS (ffmpeg-wasm and mediabunny), both satisfying the identical oracle pair `trim-boundaries` + `playback-smoke`.
- Decisive factor: **PERFORMANCE** (correctness is comparable — both pass the same two oracles and both have `boundaryFrameComparisons:0`, so no bit-exact tiebreaker exists). ffmpeg-wasm wins on every measured metric AND has the tighter duration delta.
- Margin over runner-up (mediabunny): wall **3.62x faster** (94.32ms vs 341.29ms), throughputRealtime **3.62x higher** (318.05x vs 87.90x realtime), longtasks **6.17x lower** (3234ms vs 19963ms), and a tighter trim duration delta (0.0267s vs 0.0693s). Caveat: both results are `cached:true` and `n:1`.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 94.325 | 318.049 | 197,064,160 | 3234 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 341.295 | 87.900 | 0 (not sampled) | 19963 | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The operation is a **short keyframe-aligned copy-trim** of the window [10.0s, 12.0s) (`startUs:10_000_000`, `endUs:12_000_000`, `frameAccurate:false`, `tolerances.durationToleranceSec:1.1`) over a 30s 1080p H.264/AAC MP4 (`src/scenarios/trim/index.ts:152-164`). Because `frameAccurate` is false, the correct and fast strategy is a **stream copy** snapped to the nearest preceding keyframe — no decode/re-encode of video should be necessary.

ffmpeg-wasm takes exactly that path. In its `trim()` (`src/engines/ffmpeg-wasm/adapter.ts:2613-2627`) the non-frame-accurate branch builds the classic fast-seek argument vector: `-ss <start>` placed **before** `-i` (input-seek to the nearest preceding keyframe), then `-t <duration>` and `-c copy` to mux without re-encoding, followed by `-avoid_negative_ts make_zero` and `-movflags +faststart` for the MP4 output (`adapter.ts:2629-2635`). This is a genuine libav stream-copy: only packet remuxing, no YUV decode, no x264 encode. That is why its wall median is **94.32ms** at **318x realtime** with only **3234ms** of long tasks — the work is dominated by container parsing and packet copying inside the single-thread wasm core. The `trim-boundaries` oracle measured `outDurationSec:2.0267`, `requestedDurationSec:2`, `durationDeltaSec:0.0267` — i.e. the copy landed within ~27ms of the requested 2.0s window, comfortably inside the 1.1s GOP-slack tolerance, and `playback-smoke` confirmed the resulting MP4 actually plays in a `<video>` element.

mediabunny also genuinely PASSes, but via a heavier path. Its `trim()` (`src/engines/mediabunny/adapter.ts:1445-1500`) opens the input, and for a non-frame-accurate **video+audio** MP4 the audio-only packet-copy fast path (`tryAudioOnlyPacketCopyTrim`, `adapter.ts:1480-1481`) does not apply (there is a video track), so it falls through to a full `Conversion` with `trim:{start,end}` on a `BufferTarget` (`adapter.ts:1484-1496`). Under `env.configUsed` the backend is `webcodecs` / `prefer-hardware` with `pixelBackend:"VideoSample.copyTo(RGBA)>canvas"` and a `streaming-lockstep` pipeline. That conversion pipeline does substantially more per-frame work (sample handling through the WebCodecs/canvas path), which is why mediabunny's wall is **341.29ms** (3.62x slower), throughput only **87.90x**, and — most tellingly — **19963ms of long tasks** (6.17x ffmpeg's), indicating heavy main-thread/decode activity rather than a pure packet copy. Its duration delta was also looser at **0.0693s** (still within tolerance, but ~2.6x ffmpeg's deviation). mediabunny did not sample `peakMemory` (n:0, reported 0), so memory cannot be compared.

Tiebreaker notes per the ladder: correctness is a tie (same two oracles, neither does boundary-frame bit comparison here, so this is a duration-proxy + smoke gate for both). Performance therefore decides it, and ffmpeg-wasm wins on wall, throughput, and longtasks simultaneously, with the tighter duration delta as a bonus. mediabunny's config has the nominal architectural advantages (no COOP/COEP requirement, hardware WebCodecs hint), but for a keyframe-aligned **copy** trim those advantages are irrelevant — no encode is needed — and the conversion overhead makes it the slower engine here.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost): same correctness (trim-boundaries + playback-smoke), but 3.62x slower wall (341.29ms vs 94.32ms), 3.62x lower throughput (87.90x vs 318.05x), 6.17x higher longtasks (19963ms vs 3234ms), and a looser duration delta (0.0693s vs 0.0267s). It routed a copy-trim through a full WebCodecs `Conversion` instead of a pure packet stream-copy.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: web-demuxer is a demux-only library, not a transcoder/remuxer, so no trim capability is expected.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'trim'. Plausible-but-arguably-conservative: remotion-webcodecs can re-encode, but trim is not declared as an operation in this suite; treated as honest non-declaration.
- **platform@chrome-149** — NA_ENGINE: does not declare 'trim'. Honest: the raw browser platform has no single "trim" primitive (would require manual MSE/WebCodecs assembly).
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'trim'. Honest: it is a parser, not a writer/remuxer.
- **mp4box@2.3.0** — NA_ENGINE: does not declare 'trim'. Honest within this suite; mp4box can segment/extract but the adapter does not expose a trim operation.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:152-164` (id `h264_keyframe_aligned_short`), oracle set = base `trim-boundaries` + `PLAYABLE_AV`=`['playback-smoke']` (`src/scenarios/trim/index.ts:125`). Notes: "Short 2s copy-trim deeper in the file."
- Fixture: `asset:'h264_1080p_30s.mp4'` → `fixtures/media/h264_1080p_30s.mp4` EXISTS, ~31MB real H.264/AAC MP4 (verified via stat). Not synthetic/mock; trimming [10s,12s) of a 30s file is a genuine in-range sub-trim.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2538-2645`. The non-frame-accurate branch (`:2613-2627`) issues a real ffmpeg `-ss .. -i .. -t .. -c copy` invocation via `this.run(args)` (`:2636`) and reads the produced bytes with `this.readBinary(outName)` (`:2637`). No canned output, no input→output passthrough faking a trim, no short-circuit to a golden, no error swallowing (it throws on malformed/mutated/out-of-domain inputs at `:2550-2561`, `:2570-2572`).
- Oracle: `trim-boundaries` (`src/core/oracles.ts:2348-2435`) computes output duration via reference probe / decoded-frame pts-span and compares against the requested range with the configured tolerance — a real measurement, not trivially true. Measurements (`outDurationSec:2.0267`, `durationDeltaSec:0.0267`) are physically plausible for a 2s keyframe-aligned copy. `playback-smoke` (`oracles.ts:1574-1580`) actually plays the output `<video>`. Caveat: the boundary-frame digest is deliberately skipped (`boundaryFrameComparisons:0`) because the loaded golden is a source-prefix, not a trim-range golden (`oracles.ts:2405-2431`) — so this gate is a duration-proxy + smoke gate, not a bit-exact frame check. The tolerance (1.1s) is wide (one GOP of slack), but the achieved delta (0.027s) is far inside it, so the PASS is real even though the gate is loose.
- Cached: both winning entries are `cached:true` ("cached previous PASS result"). Staleness risk noted — these were reused from a prior run, not re-executed in this run.
- Verdict: **WEAK-GATE**. Real fixture + real ffmpeg stream-copy implementation + a real (but proxy/duration + smoke) oracle. The PASS is genuine, but with no boundary-frame bit comparison and a 1.1s tolerance, the gate is not a strong correctness proof.

## Confidence & caveats

- Confidence: **medium**. The ranking is unambiguous (ffmpeg-wasm wins every measured metric and has the tighter delta), and both implementations are verified-real. Confidence is held below "high" because: (1) both results are `cached:true` and `n:1` (no spread/repeatability evidence — mad=0, p95=median), (2) the gating oracles are a duration-proxy + smoke pair with no frame-accurate/bit-exact comparison, and (3) mediabunny did not sample peakMemory, leaving one comparison dimension blank.
- For trim *correctness* specifically (boundary frame fidelity), neither engine was actually verified at the pixel level in this scenario; the win is fundamentally a performance win between two functionally-correct copy-trims.
