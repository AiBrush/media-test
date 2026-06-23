# remux/av1_720p_5s_webm_to_mkv

family: remux | fixture asset: `fixtures/media/av1_720p_5s.webm` (1.9 MB, AV1 video + Opus audio, 5.008 s) | primaryMetric: wall (REMUX_OUT_METRICS) | passCount: 2 (of 7 engines)

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **YES** — two engines PASS (mediabunny, ffmpeg.wasm). Both satisfy the identical single oracle `reference-reimport` with the same structural strength, so the decision falls to performance.
- Decisive factor: **wall-clock and realtime throughput**. mediabunny remuxes in **10.76 ms** vs ffmpeg.wasm's **18.565 ms** (**1.73x faster wall**), and **465.4x-realtime** vs **269.75x-realtime** (**1.73x higher throughput**). It also avoids ffmpeg.wasm's ~78.5 MB peak memory (ffmpeg.wasm must boot a full libavformat WASM module).
- Caveat on the margin: both samples are **n==1** (no spread; mad=0, p95==median), so the timing win is real but on single-shot evidence. mediabunny's reported `longtasks` (19963 ms) is anomalously high vs ffmpeg.wasm's (1017 ms) and looks like a main-thread instrumentation artifact for the WebCodecs/canvas-pool init path rather than work attributable to this 10.76 ms remux — it does not change the wall/throughput ranking.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 10.76 ms | 465.43x | 0 (not captured) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 18.565 ms | 269.75x | 78457970 B (~78.5 MB) | 1017 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

## Why the winner wins (deep technical)

The operation is a **lossless container re-wrap**: AV1 video + Opus audio are lifted out of a WebM (Matroska) container and re-emitted into MKV (full Matroska). WebM is a restricted Matroska profile (VP8/VP9/AV1 + Opus/Vorbis), so every coded block already legal in WebM is legal in MKV — no decode/re-encode of the AV1 bitstream is required, only EBML/Matroska repackaging (re-emitting the Segment, Tracks with the `av1C`/Opus CodecPrivate, and rebuilding Cues/SeekHead). This is why the bench numbers are in the tens of milliseconds for a 5 s / 1.9 MB asset and the throughput is hundreds of times realtime: no pixel work happens.

mediabunny takes the **Conversion** path. `remux()` (`src/engines/mediabunny/adapter.ts:1244`) constructs the MKV output format (`makeOutputFormat('mkv', ...)` → `new MkvOutputFormat(...)`, `src/engines/mediabunny/codecs.ts:169`), opens the WebM input, builds an `Output` over an instrumented `BufferTarget`, and calls `runConversion(...)` (`adapter.ts:1256`). Per the adapter's own dossier comment (`adapter.ts:29`), leaving codec options unset triggers mediabunny's "copy whenever possible" path: matching codecs are stream-copied rather than transcoded. The result is a pure-TypeScript ESM repacketizer (`env.configUsed.coreBuild = "pure-ts-esm"`, `coopCoep = "not-required"`, `sharedArrayBuffer = false`) that streams the demuxed AV1/Opus packets straight into the Matroska writer — no WASM module boot, no AAC/H.264 codec context, hence the **0-byte peakMemory** (not actually zero — `peakMemory.n==0`, the sample was never captured for this engine) and the **10.76 ms** wall.

ffmpeg.wasm produces an equally correct output via `remux()` (`src/engines/ffmpeg-wasm/adapter.ts:2031`): it writes the input into MEMFS, probes tracks, asserts MKV compatibility (`assertRemuxContainerCompatible`, line 2040), then runs `-i in -map 0 -c copy out.mkv` (`adapter.ts:2044`) — a genuine libavformat stream copy that maps every input stream so the secondary Opus track survives. It is correct but slower (**18.565 ms**, **1.73x** mediabunny's wall) and pays a heavy fixed cost: booting the full ffmpeg/libavformat WASM module pushes **peakMemory to ~78.5 MB** vs mediabunny's near-nothing. For a small re-wrap the constant overhead of a general-purpose C demux/mux engine in WASM dominates, whereas mediabunny's purpose-built TS Matroska writer has almost no startup tax.

Both engines were validated by the **`reference-reimport`** oracle (`src/core/oracles.ts:1225`), which re-imports the engine's MKV output with the reference engine and runs `semanticRemuxReimport` (`oracles.ts:1273`). The measured re-import is identical for both: **401 packets, 254 keyframes, 2 media tracks** (video+audio), matching the golden's 2-track layout. The duration deltas are tiny and well inside tolerance — mediabunny `durationDeltaSec = 0.007` and ffmpeg.wasm `0.020`, both under the 0.1 s tolerance. So correctness is a tie; performance is the sole differentiator, and mediabunny wins decisively on it.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, but lost on performance: 18.565 ms wall (1.73x slower than mediabunny's 10.76 ms), 269.75x-realtime (1.73x lower throughput), and ~78.5 MB peakMemory vs mediabunny's effectively-none. Correctness identical (same 401 packets / 254 keyframes / 2 tracks, durationDelta 0.020 s within 0.1 s tol). The loss is the WASM libavformat boot/runtime overhead for a tiny re-wrap.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — the browser WebCodecs/MediaSource surface has no general container-remux API (it decodes/encodes; it does not expose a Matroska muxer). Not an under-declared capability.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — web-demuxer is a demux-only library; it reads packets but provides no muxer/writer path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest — media-parser is a parser/probe library with no muxing output stage.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". Honest — MP4Box.js is ISO-BMFF (MP4/MOV) only and cannot parse the EBML/Matroska input; it genuinely cannot read WebM.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest — its container writer set does not include Matroska/MKV as an output target, so the webm→mkv cell is correctly unreachable.

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/remux/index.ts:89-96` — `{ asset: 'av1_720p_5s.webm', from: 'webm', to: 'mkv', videoCodecsIn: ['av1'], audioCodecs: ['opus'] }`, notes "AV1/Opus WebM->MKV copy: requires AV1 read/copy support, not AV1 encode support." Built into id `remux/av1_720p_5s_webm_to_mkv` by `remuxId` (`src/scenarios/remux/_shared.ts:73-74`). Default oracle = `['reference-reimport']` (`_shared.ts:78-80`).
- **Fixture exists**: `fixtures/media/av1_720p_5s.webm` present, 1.9 MB, real AV1+Opus media (golden `fixtures/golden/av1_720p_5s.webm.meta.json`: video av1 1280x720@30, audio opus 48000/2ch, durationSec 5.008). Not synthetic/empty/mock.
- **Winner adapter is real**: `src/engines/mediabunny/adapter.ts:1244-1260` — builds a real `MkvOutputFormat` (`codecs.ts:169`), opens the real WebM input, and runs `runConversion` over a `BufferTarget`. No canned bytes, no input→output copy shortcut, no golden short-circuit, no error swallowing (throws on missing format / failed conversion).
- **Oracle is meaningful**: `src/core/oracles.ts:1225` `referenceReimport` → `semanticRemuxReimport` (`oracles.ts:1273`) re-demuxes the produced MKV with the reference engine and asserts track count, per-type track layout, and duration within a real tolerance (0.1 s here). It is structural/metadata-exact, not smoke. Measurements are physically plausible: 401 packets and 254 keyframes for 5 s of 30 fps AV1 (≈150 video frames) plus ~250 Opus frames is consistent; durationDelta 0.007 s (mediabunny) vs the golden 5.008 s is sub-frame.
- **Strength caveat**: this is the structural-tier gate, NOT bit-exact (no `decoded-frames-bitexact` / `golden-packets` here). It confirms semantic media-track preservation and parseability, not pixel/byte identity. Given the op is a lossless re-wrap of an already-legal codec, the structural gate is the appropriate and meaningful gate, but it is one notch below bit-exact strength.
- **Cached note**: BOTH PASS engines have `cached==true` ("cached previous PASS result"). Results were reused, not re-run this session — staleness risk: the timing margin (10.76 vs 18.565 ms) reflects a prior run. The correctness verdict (identical 401/254/2 re-import) is robust to caching.
- **Verdict: REAL** — real fixture, real library implementation on both winners, meaningful structural oracle. The only reservations (cached evidence, n==1 timing, structural-not-bitexact gate) are noted but do not indicate cheating.

## Confidence & caveats

- Confidence: **medium-high**. The NA_ENGINE reasons are all honest capability gaps (verified against each library's nature), the two PASS adapters are genuine real-library code paths, and the oracle does a real re-import comparison.
- Caveats: (1) both PASS results are `cached==true` — timings are from a prior run. (2) Performance margin rests on **n==1** samples (mad=0, p95==median) for both engines, so the 1.73x wall/throughput win is single-shot evidence. (3) mediabunny's `peakMemory` was not captured (n==0), so the memory advantage is inferred from architecture (pure-TS vs WASM libavformat) plus ffmpeg.wasm's measured ~78.5 MB, not a head-to-head measured pair. (4) mediabunny's `longtasks=19963 ms` is anomalous and almost certainly an instrumentation artifact (WebCodecs/canvas-pool init), not work in the 10.76 ms remux. (5) The gate is structural, not bit-exact, so "lossless" is asserted at media-track/duration granularity, not byte/pixel identity.
