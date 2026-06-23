# remux/prop_mp3_to_mp4_duration_invariant

family: remux | fixture asset: `fixtures/media/mp3_xing.mp3` (Xing-headed MP3 elementary stream, ~64 KB) | primaryMetric: wall | passCount: 2 (of 7)

## Verdict

Best framework: **ffmpeg.wasm@0.12.15**. **CONTESTED** — two engines PASS (ffmpeg-wasm and mediabunny@1.48.0).

Decisive factor: **correctness strength**. Both engines pass the same single gate (`property-invariant`, probe-duration variant), but ffmpeg-wasm reconstructed a far more accurate MP4 `mvhd` duration: Δ **0.0060s** vs golden 10.000s, against mediabunny's Δ **0.0310s** — ffmpeg-wasm is ~**5.2x closer** to the true duration while both stay under the 0.0417s (≈1 MP3 frame @ 24 fps band) tolerance. Performance reinforces the same winner: wall median **6.645 ms vs 7.26 ms** (~**1.09x faster**) and longtasks 5077 ms vs 1017 ms is the only metric favoring mediabunny, but it is a single-sample (n=1) blocking-time figure and does not override a correctness win on a duration-fidelity gate. Margin over runner-up: **5.2x tighter duration delta**, 1.09x faster wall.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (Δ0.0060s) | 6.645 | n/a | 0 (n=0, not measured) | 5077 (n=1) | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true (Δ0.0310s) | 7.26 | n/a | 129,168,503 (n=1) | 1017 (n=1) | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'remux:mp3-in-mp4' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

throughputRealtime not present in the shard bench for either engine (bench keys = wall, peakMemory, longtasks only).

## Why the winner wins (deep technical)

The operation is a **lossless audio stream-copy from a raw MP3 elementary stream into an ISO-BMFF (MP4) container**. The source `mp3_xing.mp3` carries a **Xing/Info header** — a frame-count + byte-count TOC in the first MPEG-audio frame — which is the only authoritative duration source: MP3 is CBR/VBR framed with no global duration field, so duration = (Xing frame count × samples-per-frame) / sample-rate. A correct MP4 remux must read that Xing frame count, count/copy the MP3 access units as `mp4a`-style sample entries (codec `mp3` / `.mp4a` object type 0x6B), and **materialize an exact `mvhd`/`mdhd` duration** in the moov atom. The gate is metamorphic: `probe(remux(x)).dur ≈ probe(x).dur(golden)`.

The gating oracle is `propertyInvariant` → probe-duration branch in `src/core/oracles.ts:2709-2759`. It re-probes the engine's *authored* MP4 output through the reference engine (`ctx.referenceEngine.probe`, oracles.ts:2719-2722) and compares `outDurationSec` against the golden `durationSec` (10.000s). The tolerance band is computed at oracles.ts:2738-2743: because the **output** container here is `mp4` (not `mp3`), it does NOT take the loose `LOOSE_DURATION_ABS_SEC` path — it uses the per-container strict band `durationToleranceFor(...)` resolving to **0.041666…s** (≈ one frame at 24 fps). This is a real, tight, non-trivially-satisfiable comparison against a physically meaningful golden.

ffmpeg-wasm's path (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`): it writes the MP3 into MEMFS, runs `assertRemuxContainerCompatible` (line 2040), then execs the real ffmpeg wasm program with `-map 0 -c copy` and, for the mp4 target, `-movflags +faststart` (lines 2044-2050). The `-c copy` means the MP3 frames are bit-copied as MP4 audio samples (no AAC transcode — consistent with the declared `remux:mp3-in-mp4` feature, adapter.ts:1519), and ffmpeg's MP4 muxer derives the track duration from the actual copied sample durations × count. That sample-accurate accounting is why its measured `outDurationSec = 10.005963718820862` lands within **0.0060s** of golden — essentially the residual of MP3's 1152-sample frame granularity (one partial final frame).

mediabunny (runner-up, `src/engines/mediabunny/adapter.ts`) uses its `Conversion` API (streaming-lockstep, env.configUsed.pipeline) with `backend: webcodecs`, `hwAccel: prefer-hardware`, `coopCoep: not-required`. For a pure audio remux WebCodecs hardware does not help, and its duration estimate `outDurationSec = 10.031020408163265` (Δ 0.0310s) is ~5x looser — likely from rounding the authored MP4 timescale/edit-list against the Xing frame count rather than counting copied samples as precisely. It still passes (0.0310 ≤ 0.0417) but is the less faithful reconstruction, which loses the correctness-first tiebreak.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed but lost on correctness: duration delta 0.0310s vs ffmpeg-wasm's 0.0060s (5.2x looser), and slower wall (7.26 vs 6.645 ms). Its only edge is longtasks (1017 vs 5077 ms), an n=1 main-thread-blocking figure that does not outrank a duration-fidelity gate.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — web-demuxer is a libav-backed demux-only library with no muxer, so it genuinely cannot author an MP4.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'mp3'". Honest NA — mp4box.js parses/segments ISO-BMFF only; it cannot ingest a raw MP3 elementary stream.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — raw WebCodecs/Media platform APIs expose decode/encode but no container muxer for a file-to-file remux.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'remux:mp3-in-mp4'". Honest, granular NA — it declares remux generally but specifically not MP3-frame copy into MP4 (no `mp3`/`.mp4a` muxer path), so the feature-token gate correctly excludes it.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — media-parser is a read/parse-only library, no muxing.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/metamorphic.ts:90-98` — `id: 'prop_mp3_to_mp4_duration_invariant'`, `input: 'mp3_xing.mp3'`, `from: 'mp3'`, `to: 'mp4'`, `invariant: PROBE_DUR`, `features: ['remux:mp3-in-mp4']`.
- Fixture: `fixtures/media/mp3_xing.mp3` EXISTS (64 KB real Xing-headed MP3, modified 5 days ago) — a genuine elementary-stream input, not synthetic/empty/mock.
- Gating oracle: `src/core/oracles.ts:2709-2759` (probe-duration branch). Performs a REAL re-probe of the authored output via `ctx.referenceEngine.probe` and an absolute-delta comparison against the golden 10.000s with a strict ≈0.0417s band keyed off the mp4 output container (oracles.ts:2738-2743). Not trivially satisfiable: a dropped/garbled audio track or a wrong `mvhd` duration would blow past the band. Measurements are physically plausible (10.0060s and 10.0310s vs 10.000s golden; deltas consistent with MP3's 1152-sample frame granularity).
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069`. Genuine implementation — writes input to MEMFS, asserts container compatibility, execs the real ffmpeg wasm program with `-map 0 -c copy -movflags +faststart`, reads bytes back. No canned/hardcoded output, no input→output passthrough faking a transcode, no short-circuit to the golden, no swallowed errors (`run()` throws on non-zero exit, adapter.ts:1819-1828).
- Cached note: BOTH PASS engines have `cached:true` ("cached previous PASS result"). Evidence is reused, not freshly re-run this invocation — minor staleness risk per the launcher-seeding caveat, but the cached measurements are internally consistent and the code paths are real.

Verdict: **REAL** — real fixture + real ffmpeg.wasm stream-copy implementation + meaningful strict duration oracle.

## Confidence & caveats

Confidence: **high** on the verdict and winner selection. The contest resolves cleanly on correctness (5.2x tighter duration delta), and the winner's code path is a verifiably genuine `-c copy` remux. Caveats: (1) both winners are `cached:true`, so numbers were not re-measured this run; (2) all bench metrics are n=1 (no mad/p95 spread), so the wall margin (1.09x) is weak performance evidence — the decision rests on correctness, not speed; (3) ffmpeg-wasm peakMemory is n=0 (unmeasured), so no memory comparison is possible; (4) mediabunny's lower longtasks (1017 ms) is genuine but does not outrank the correctness gate.
