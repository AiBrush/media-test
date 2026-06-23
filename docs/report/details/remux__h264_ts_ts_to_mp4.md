# remux/h264_ts_ts_to_mp4

family: remux | fixture asset: `h264_ts.ts` (4.6 MB, MPEG-TS, H.264 720p30 + AAC 48k stereo, 10.021s) | primaryMetric: wall | passCount: 3 of 7

## Verdict

**Best framework: mediabunny@1.48.0** — CONTESTED (3 engines PASS: mediabunny, ffmpeg.wasm, remotion-webcodecs).

All three passing engines satisfy the *same single* gating oracle (`reference-reimport`) at effectively the same correctness strength, so correctness is a tie at the top. The decisive factor is **performance**: mediabunny's wall median is **110.46 ms** vs ffmpeg.wasm **136.89 ms** (runner-up) and remotion-webcodecs **818.22 ms**. mediabunny is **1.24x faster wall than ffmpeg.wasm** and **7.41x faster than remotion-webcodecs**, with **90.72x-realtime** throughput vs 73.20x (ffmpeg.wasm, 1.24x margin) and 12.25x (remotion-webcodecs, 7.41x margin). mediabunny additionally has the lowest longtasks (2055 ms vs 1901 ms ffmpeg / 4223 ms remotion-webcodecs — note ffmpeg's longtasks is actually marginally lower, but it loses on wall and throughput) and is the only engine that reported a peakMemory sample (35.0 MB).

Correctness tiebreak refinement: mediabunny re-imported **770 packets / 480 keyframes** — an *exact* match to the golden packet table (`fixtures/golden/h264_ts.ts.packets.json` = 770 entries) with durationDelta **0.0057s**. ffmpeg.wasm produced the identical 770/480/0.0057s. remotion-webcodecs produced **773 packets / 481 keyframes** and durationDelta **0.07s** (still inside the 0.1s tolerance, but a looser, non-exact match). So mediabunny ties ffmpeg on correctness and edges remotion on both correctness *and* speed.

Margin over runner-up (ffmpeg.wasm): **1.24x faster wall (110.46 vs 136.89 ms), 1.24x higher throughput (90.72x vs 73.20x realtime)**. Evidence strength is weak on sample count: every metric is **n=1** (mad=0, p95=median), so margins reflect a single timed run, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | reference-reimport:true | 110.46 ms | 90.72x | 35,001,800 B | 2055 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 136.89 ms | 73.20x | 0 (not sampled) | 1901 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | reference-reimport:true | 818.22 ms | 12.25x | 0 (not sampled) | 4223 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ts' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

**The operation.** This is a *lossless* container conversion: MPEG-TS (PES-packetized, H.264 carried as Annex-B with start-code-delimited NAL units) → MP4/ISOBMFF (H.264 stored as length-prefixed AVCC samples inside `mdat`, with parameter sets hoisted into the `avcC` box of the `stsd`). The coded H.264 samples and the AAC frames are *not* re-encoded; the only real work is (1) PES de-packetization + PTS/DTS recovery from the 90 kHz TS clock, (2) the Annex-B → AVCC NAL framing rewrite (strip start codes, prepend 4-byte length prefixes, lift SPS/PPS into `avcC`), and (3) ISOBMFF box construction (`moov`/`stbl` sample tables, `mdat`). The scenario note (`src/scenarios/remux/index.ts:51`) states exactly this: "TS->MP4: Annex-B -> AVCC bitstream conversion is still lossless (same coded samples)."

**mediabunny's path.** The adapter's `remux()` (`src/engines/mediabunny/adapter.ts:1244`) takes the non-fastStart branch: it builds a real `OutputFormat` from `opts.container` (`makeOutputFormat`, line 1250), opens the TS source as a real `mb.Input` (`openInput`, line 1252), constructs an `mb.Output` with a `BufferTarget` (line 1255), and drives `runConversion` (line 1256 → `src/engines/mediabunny/adapter.ts:842`). `runConversion` calls `mb.Conversion.init(...)`, asserts `conversion.isValid` (throws "no usable output tracks" otherwise — no silent success), then `conversion.execute()` and returns the real `BufferTarget.buffer` bytes (line 856-868). The Conversion runs mediabunny's pure-TS read→demux→(NAL-reframe)→mux pipeline with **no transcode** because source and target codecs match; `env.configUsed` confirms `backend: webcodecs`, `pipeline: streaming-lockstep`, `wasmThreads: 0`, `coopCoep: not-required`, `sharedArrayBuffer: false`. Crucially, for a same-codec remux the WebCodecs decoder/encoder are never engaged — the win is a pure-JS bitstream rewrite, which is why mediabunny's hand-written ISOBMFF muxer (no wasm module load, no FS marshalling) clears the job in 110 ms.

**Why faster than ffmpeg.wasm.** ffmpeg.wasm performs the identical, equally-correct remux (770/480, Δ0.0057s) but pays the wasm tax: a single-threaded Emscripten build must marshal the 4.6 MB input through the MEMFS virtual filesystem, run libavformat's TS demuxer + MP4 muxer, then read the output file back out. That overhead is the 26.4 ms gap (136.89 vs 110.46 ms, 1.24x). Its longtasks (1901 ms) is actually marginally lower than mediabunny's (2055 ms), but longtasks is a secondary metric behind the primaryMetric (wall) and throughput, both of which mediabunny wins.

**Why far faster than remotion-webcodecs.** remotion-webcodecs is correct but 7.41x slower (818.22 ms, 12.25x realtime). Its `env.configUsed` shows `pipeline: streaming-backpressure`, `convert=main-thread`, `writer: bufferWriter`, `pixelBackend: offscreencanvas-2d`. Its reimport differs slightly (773 packets / 481 keyframes, Δ0.07s vs the golden's exact 770/480) — a benign extra packet/keyframe and a larger duration tail, suggesting a less-tight PTS/DTS reconstruction or an extra access unit at a GOP boundary on the TS→MP4 path. It passes the same single oracle, so it is a true PASS, just both slower and less bit-faithful than the two exact-770 engines.

**Net:** correctness is a 3-way tie on the only gate; mediabunny wins the performance tiebreak on the primary metric (wall) and throughput, and additionally matches the golden packet table exactly while using a no-COOP/COEP, single-thread, pure-TS path that avoids both wasm marshalling and a heavyweight Conversion pipeline.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** identical correctness (reference-reimport 770 pkts / 480 keyframes, Δ0.0057s) but **1.24x slower wall (136.89 vs 110.46 ms)** and **1.24x lower throughput (73.20x vs 90.72x)** due to wasm/MEMFS marshalling overhead. No peakMemory sample reported (n=0).
- **remotion-webcodecs@4.0.479 (PASS, lost on perf+exactness):** correct but **7.41x slower (818.22 ms, 12.25x realtime)** and slightly less faithful (773 pkts / 481 keyframes, Δ0.07s vs golden's exact 770/480). Highest longtasks (4223 ms). Main-thread convert + offscreencanvas pixel backend.
- **mp4box@2.3.0 (NA_ENGINE):** honest NA — its `capabilities()` declares `containersIn: ['mp4', 'mov']` (`src/engines/mp4box/adapter.ts:645`), which excludes 'ts'. It is an ISOBMFF-only parser/fragmenter; it physically cannot ingest an MPEG-TS source. NA is correct, not under-declared.
- **platform@chrome-149 (NA_ENGINE):** honest NA — `remux: false` (`src/engines/platform/adapter.ts:233`); raw browser APIs (MediaSource/WebCodecs alone) cannot losslessly rewrap encoded samples into a new container. `remux()` throws `NotApplicableError` (line 355-356).
- **web-demuxer@4.0.0 (NA_ENGINE):** honest NA — declares only probe/demux/seek operations; it has no muxer, so 'remux' is undeclared and the runner records NA without invoking it.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** honest NA — read-only parser with NO muxer/codecs (`src/engines/remotion-media-parser/adapter.ts:7-10`); `remux()` throws "not supported (read-only parser; no muxer)" (line 548-549). Declares 'ts' in containersIn for *parsing* only, not for remux output.

## Anti-cheat validation

- **Scenario:** `src/scenarios/remux/index.ts:45-52` (REMUX_CASES entry `asset: 'h264_ts.ts', from: 'ts', to: 'mp4'`). The scenario id `remux/h264_ts_ts_to_mp4` is synthesized by `buildRemuxAll` from this real case.
- **Fixture exists and is real:** `fixtures/media/h264_ts.ts` — 4.6 MB on disk (stat confirmed), a genuine MPEG-TS file. Golden sidecars exist and are consistent: `fixtures/golden/h264_ts.ts.meta.json` (container ts, 10.021s, video h264 1280x720@30 + audio aac 48k/2ch = 2 media tracks), and `fixtures/golden/h264_ts.ts.packets.json` (exactly **770** packet entries). Not synthetic/mock/empty.
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts:1244` (`remux`) → `:842` (`runConversion`). Opens a real `mb.Input`, builds a real `mb.Output` + `BufferTarget`, runs `mb.Conversion.init`/`execute`, returns the real output buffer. No canned bytes, no input→output passthrough, no golden short-circuit, and errors are *thrown* (invalid conversion → throw at line 851-853, empty buffer → throw at line 861), not swallowed into a false PASS.
- **Oracle is meaningful:** `reference-reimport` at `src/core/oracles.ts:1279`. It re-parses the engine's *actual output bytes* with the reference engine and diffs against golden: media-track count + per-codec track layout (line 1289-1299), duration delta vs golden within a real tolerance (line 1311-1323; here tol = max(band, 0.1) = 0.1s and Δ = 0.0057s), and a "no keyframes in a video remux" guard (line 1361-1365). Measurements are physically plausible: 770 packets / 480 keyframes / 2 media tracks / Δ0.0057s exactly track the golden. NOTE: this is a *structural/semantic* re-import gate, not bit-exact decode — `decoded-frames-bitexact` is intentionally NOT applied to remux outputs because the runner never re-decodes ctx.output (documented `src/scenarios/remux/index.ts:15-21`). So the gate is real and non-trivial but not the strongest possible (no pixel digest comparison).
- **Cached note:** mediabunny's result has `cached: true` (reason "cached previous PASS result"), as do all three PASS engines. Numbers were reused from a prior run (mediabunny startedAt 2026-06-22T13:52Z; remotion/ffmpeg 16:43-16:44Z) rather than freshly re-executed. Minor staleness risk, but the adapter/oracle/fixture code all check out, so the cached PASS is credible.

**validationVerdict: REAL** — real 4.6 MB MPEG-TS fixture, genuine mediabunny Conversion implementation, and a meaningful semantic re-import oracle whose measurements exactly match the golden packet table (770/480, Δ0.0057s).

## Confidence & caveats

- **Confidence: high** that mediabunny is the correct winner — it strictly dominates on the primary metric (wall) and throughput, ties or beats on correctness (exact golden packet match), and uses the lightest backend (single-thread pure-TS, no COOP/COEP, no wasm load).
- **Caveat — n=1 benchmarking:** every bench metric is a single sample (n=1, mad=0, p95=median). The 1.24x margin over ffmpeg.wasm is plausible but not statistically robust; the 7.41x margin over remotion-webcodecs is large enough to be safe even at n=1.
- **Caveat — cached results:** all PASS rows are cached, not freshly re-run; numbers could be stale relative to current adapter code (see the launcher seeding caveat in project memory).
- **Caveat — oracle strength:** the single gate is structural re-import (not bit-exact pixel decode), so all three PASSes are "semantically lossless" rather than "proven pixel-identical". The ladder ranks this as structural/metadata-exact (mid-tier), which is appropriate for a remux op where pixel decode of the output is not performed.
- **Secondary-metric wrinkle:** ffmpeg.wasm's longtasks (1901 ms) is marginally below mediabunny's (2055 ms); this does not flip the verdict because longtasks ranks below the primaryMetric (wall) and throughput, both won by mediabunny.
