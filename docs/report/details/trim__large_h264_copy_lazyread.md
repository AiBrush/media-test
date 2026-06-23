# trim/large_h264_copy_lazyread

family: trim | fixture asset: `large_h264_1080p_120s.mp4` (90 MB, H.264 1080p30 + AAC 48 kHz stereo, MP4) | primaryMetric: `sourceReads` | passCount: 2

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **CONTESTED**: 2 engines PASS (ffmpeg-wasm, mediabunny), 5 are NA_ENGINE (op `trim` not declared).
- **Decisive factor: PERFORMANCE.** Both passers cleared the *exact same* oracle set at the *exact same* strictness (`trim-boundaries` duration-only + `playback-smoke`, `boundaryFrameComparisons=0` for both), so correctness is a tie. ffmpeg-wasm then wins every captured perf axis.
- **Margin over runner-up (mediabunny):** wall 180.14 ms vs 652.62 ms = **3.62x faster**; throughputRealtime 666.15x vs 183.87x = **3.62x higher**; longtasks 1361 ms vs 12909 ms = **9.49x less main-thread blocking**. All on n=1 (single sample, mad=0) — weak statistical evidence, see caveats.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true, playback-smoke:true | 180.14 ms | 666.15x | 0 (n=0) | 1361 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | trim-boundaries:true, playback-smoke:true | 652.62 ms | 183.87x | 0 (n=0) | 12909 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

Note: `peakMemory` and the scenario's declared `primaryMetric` `sourceReads` both have **n=0 samples** for *both* passers — they were never captured, so the "lazy-read" axis the scenario was designed around did not actually discriminate the engines.

## Why the winner wins (deep technical)

The operation is a **copy-trim** of the half-open range 60.0s..66.0s out of a 120s, 90 MB H.264-in-MP4 file with `frameAccurate:false` (scenario `src/scenarios/trim/index.ts:588-606`). The right answer is to *not* decode/re-encode: seek to the keyframe at/just-before 60s and stream-copy the GOPs through to ~66s, remuxing into a faststart MP4. Both passers do exactly that; ffmpeg-wasm does it ~3.6x faster on this run.

ffmpeg-wasm takes the keyframe-aligned fast-copy path in `src/engines/ffmpeg-wasm/adapter.ts:2613-2627`: with `frameAccurate` false it emits `-ss <start>` **before** `-i` (input-side seek to the nearest preceding keyframe, the cheap demux-level seek) then `-map 0 -t <dur> -c copy`, followed by `-avoid_negative_ts make_zero` (line 2629) and `-movflags +faststart` for MP4 (line 2630-2631). Because `-c copy` moves coded H.264 NAL units and AAC frames byte-for-byte with no decode, the work is pure container parse + bitstream copy + box rewrite — hence the 666x-realtime throughput and a single 1361 ms long task that is dominated by wasm instantiation, not codec work. The output measured at `outDurationSec=6.016s` vs `requestedDurationSec=6s` (Δ=0.016s), comfortably inside the scenario's loose `durationToleranceSec:0.5` (`src/scenarios/trim/index.ts:598`), and a `<video>` element advanced frames (playback-smoke).

mediabunny is correct but slower here. Its `trim()` (`src/engines/mediabunny/adapter.ts:1445-1500`) opens the input via **UrlSource** (`adapter.ts:266-270`) — the genuinely lazy path that range-reads the moov/sample tables and only the kept samples rather than buffering 90 MB as a Blob — then drives `Conversion` with `trim:{start,end}` and *no* `forceTranscode` (the `frameAccurate` branch at line 1493-1495 is skipped). It first tries `tryAudioOnlyPacketCopyTrim` (line 1480) and otherwise runs a streaming-lockstep conversion. Its env (`configUsed`) shows `backend:webcodecs`, `pipeline:streaming-lockstep`, `pixelBackend:VideoSample.copyTo(RGBA)>canvas`, `wasmThreads:0`, `coopCoep:not-required`. The 652.62 ms wall and the **12909 ms** of long tasks indicate it spun up more pipeline/canvas machinery (and likely touched the WebCodecs/decoder path for boundary handling) than the lean `-c copy` mux ffmpeg used, even though its final duration (`outDurationSec=6.08s`, Δ=0.08s) is just as inside tolerance. mediabunny's lazy UrlSource is the architecturally "right" answer for the scenario's stated thesis, but since `sourceReads`/`peakMemory` were not recorded (n=0), that advantage never materialized in the score and the captured wall/throughput/longtasks all favor ffmpeg.

Net: for a *same-codec, same-container, copy* trim, the FFmpeg `-c copy` path is the minimal-work implementation and beats mediabunny's conversion pipeline on every metric that was actually measured this run.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on perf: 3.62x slower wall (652.62 vs 180.14 ms), 3.62x lower realtime throughput (183.87x vs 666.15x), and 9.49x more main-thread blocking (12909 vs 1361 ms long tasks). Identical oracle strength, so it loses purely on speed. Its UrlSource lazy-read edge (`adapter.ts:266-270`) would have shown on `sourceReads`/`peakMemory`, but those were not captured (n=0).
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest: the raw WebCodecs/platform shim exposes decode/encode primitives, not a container-level trim+remux op.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare `trim`. Honest; it is a WebCodecs transcode wrapper, not a remuxing trimmer.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare `trim`. Honest; it is a parser/probe library (read-only), no muxing output path.
- **mp4box@2.3.0** — NA_ENGINE: does not declare `trim`. Plausible under-declaration in principle (MP4Box.js can segment/extract), but it has no decode and the scenario gates on duration of a copy-trim; declaring it without an audio/video copy+remux trim op would be unsafe, so the NA reads as honest scoping.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare `trim`. Honest; it is a demux-only (packet extraction) library, not a trimmer/muxer.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/trim/index.ts:588-606` (`id: 'large_h264_copy_lazyread'`), part of `LADDER_CASES`. Range `startUs:60_000_000 .. endUs:66_000_000`, `frameAccurate:false`, `durationToleranceSec:0.5`, `extraOracles: PLAYABLE_AV` (= `['playback-smoke']`, line 125), `primaryMetric:'sourceReads'`.
- **Fixture is real:** `fixtures/media/large_h264_1080p_120s.mp4` exists, **90 MB**. Golden meta `fixtures/golden/large_h264_1080p_120s.mp4.meta.json` confirms real media: mp4, durationSec 120, H.264 1920x1080@30 (bitrate 5,836,579), AAC 48 kHz stereo. Not synthetic/empty/mock.
- **Winner adapter is genuine:** `src/engines/ffmpeg-wasm/adapter.ts:2538-2645`. Real `ffmpeg.wasm` invocation: builds `-ss/-i/-map 0/-t/-c copy/-avoid_negative_ts/-movflags +faststart` args (2613-2635), runs `await this.run(args)` (2636), reads the produced bytes via `readBinary(outName)` (2637), returns them. No canned output, no input->output passthrough faking a transcode, no short-circuit to the golden, no swallow-and-succeed. (mediabunny winner-runner-up path `adapter.ts:1445-1500` is likewise a real `Conversion`.)
- **Oracle is a real (if loose) comparison:** `trim-boundaries` in `src/core/oracles.ts:2348-2435` decodes the output (up to 4096 frames) and/or probes via reference engine to derive `outDurationSec`, compares to requested span against `durationToleranceSec`, and *intentionally* skips boundary-frame digest because the loaded golden is a source-prefix, not a trim-range golden (`oracles.ts:2405-2431`, `boundaryFrameComparisons=0`). The measurements are physically plausible: 6.016s and 6.08s output durations for a 6.0s request on real frames.
- **Verdict: WEAK-GATE.** The implementation and fixture are real (would be REAL on those grounds), but the gate that decided the contest is loose: correctness is only a ±0.5s duration check with **no boundary-frame digest** (`boundaryFrameComparisons=0`) and a smoke playback check — neither verifies the cut landed on the right frames or that bytes are bit-exact. Worse, the scenario's *own* headline axis `primaryMetric:'sourceReads'` (and `peakMemory`) were **not captured** (n=0 for both engines), so the "lazy-read deep in a 100 MB file" thesis the scenario was built to test never actually scored — the winner was chosen on wall/throughput/longtasks instead. The PASS is real but the discriminating oracle is weak.
- **Cached note:** BOTH passers have `cached:true` ("cached previous PASS result"). Numbers were reused, not re-run this session; staleness risk applies to both, so the relative 3.62x ranking is internally consistent but not freshly verified.

## Confidence & caveats

- **Confidence: medium.** Winner selection is unambiguous on captured metrics (3.62x wall, 9.49x longtasks), and both adapters are verified real implementations against a real 90 MB fixture.
- **Single-sample (n=1, mad=0)** for every bench metric on both engines — no spread information; a 3.62x gap is large enough to survive noise, but this is weak statistical evidence.
- **Both results cached** — not re-run; ranking is from stale-but-consistent samples.
- **primaryMetric `sourceReads` and `peakMemory` were never measured (n=0)** — the lazy-read/memory story the scenario exists to test did not discriminate the engines, so a perf win on wall does not validate the scenario's design intent. mediabunny's UrlSource architecture may well be the "more correct" lazy reader despite losing on wall.
- The correctness gate is duration-tolerance + smoke only (boundary-frame digest disabled because golden is source-prefix); a frame-accurate or byte-level cut error within ±0.5s would not be caught.
