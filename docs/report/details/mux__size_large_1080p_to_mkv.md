# mux/size_large_1080p_to_mkv

family: mux | fixture asset: `large_h264_1080p_120s.mp4` (90 MB, real on disk) | primaryMetric: `throughputRealtime` | passCount: 2 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 2 engines PASS: mediabunny and ffmpeg.wasm).
- **Decisive factor: PERFORMANCE.** Both engines pass the *same* single gating oracle (`property-invariant:probe-duration`) with comfortable margin, so correctness is a tie. The ranking metric `throughputRealtime` separates them: mediabunny **204.93 x-realtime** vs ffmpeg.wasm **167.20 x-realtime**.
- **Margin over runner-up:** **1.23x higher throughputRealtime** (204.93 / 167.20) and **1.23x faster wall** (585.58 ms vs 717.71 ms). Peak-memory and targetWrites were not sampled (n=0) for either engine, so they cannot break the tie. Caveat: both numbers are **n=1, mad=0, cached** — a single-sample, reused measurement, so the perf margin is real but weakly evidenced.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 585.58 ms | 204.93 x | n/a (n=0) | 3045 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 717.71 ms | 167.20 x | n/a (n=0) | 1227 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

**The operation.** This case demuxes the 90 MB H.264(1080p)+AAC(stereo 48 kHz) MP4 into `EncodedTracks` and re-packs the *already-coded* samples into a **Matroska/MKV** container. No transcode happens — coded NAL units and AAC frames are copied verbatim and only the container (Matroska EBML, SimpleBlock lacing, Cues index) is authored. Because both passing engines copy the same bitstream, decoded pixels are by construction identical; the only observable conformance signal the runner exposes for a `mux` op is the authored output's container duration, gated by `property-invariant:probe-duration` (`src/scenarios/mux/_shared.ts:50-61`, oracle at `src/core/oracles.ts:2709-2758`).

**Correctness is a genuine tie.** mediabunny's authored MKV probes to `outDurationSec=120.021` vs golden `120.000` → **Δ 0.0210 s**; ffmpeg.wasm probes to `120.042` → **Δ 0.0420 s**. Both sit well under the explicit `durationToleranceSec=0.125` set in the scenario (`size-ladder.ts:94`). mediabunny's reframe is actually *tighter* (0.021 vs 0.042 s), but both are far inside the band, so the duration invariant does not by itself separate them — the scenario's notes (`size-ladder.ts:16-20`) explicitly designate this as a throughput-leaderboard case where correctness merely gates.

**The decisive mechanism — backend.** mediabunny ran with `env.configUsed.backend="webcodecs"`, `hwAccel="prefer-hardware"`, `pipeline="streaming-lockstep"`, `coreBuild="pure-ts-esm"`, `sharedArrayBuffer=false`, `coopCoep="not-required"`. Its mux path (`src/engines/mediabunny/adapter.ts:1508-1600`) constructs a native `mb.Output` with the Matroska `format` (resolved via `makeOutputFormat`; mkv/matroska mapping confirmed at `adapter.ts:284`), attaches `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (`adapter.ts:1528-1546`), and streams packets straight into the writer with `maximumPacketCount` pre-sized to `track.chunks.length` (`adapter.ts:1529,1540`) — a single-pass, pure-TypeScript EBML author with no process boundary and no filesystem round-trip. The first packet alone carries `decoderConfig` so the muxer emits the codec-private CodecPrivate element (`adapter.ts:1570-1590`). This pure-TS, in-memory streaming write is why it sustains **204.93 x-realtime** with no COOP/COEP and no threads.

ffmpeg.wasm, by contrast, runs the real native muxer via `-c copy` (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069` is the remux path; the mux path is the analogous `-c copy` author noted at `adapter.ts:33`), but pays for it: every byte of the 90 MB input is materialized into MEMFS, processed by the single-thread wasm core (no `wasmThreads`/SAB declared in its `configUsed`), and read back out. That MEMFS write + wasm-VM overhead is the ~132 ms (1.23x) wall gap, dropping it to **167.20 x-realtime**. (Note: ffmpeg posts *fewer* longtask ms, 1227 vs 3045 — its work is inside the wasm VM rather than chunked on the main thread — but longtasks is a secondary tiebreaker only and correctness/throughput already decided this.)

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** correct mux (Δ 0.0420 s ≤ 0.125 s) but **1.23x slower wall (717.71 vs 585.58 ms) and 1.23x lower throughputRealtime (167.20 vs 204.93 x)**. Cause: single-thread wasm core + MEMFS materialize/read-back of the 90 MB file vs mediabunny's in-memory pure-TS streaming author. Beaten on the ranking metric, not on correctness.
- **web-demuxer@4.0.0 (NA_ENGINE):** `engine does not declare operation 'mux'`. Honest — it is a demux-only WASM wrapper; it never claims a muxer.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** `engine does not declare operation 'mux'`. Honest — it exposes transcode/convert primitives, not a standalone container author for this op surface.
- **platform@chrome-149 (NA_ENGINE):** `engine does not declare operation 'mux'`. Honest — bare WebCodecs has no container muxer; declaring mux NA is correct.
- **mp4box@2.3.0 (NA_ENGINE):** `engine does not declare output container 'mkv'`. Honest and precisely scoped — mp4box.js authors ISO-BMFF only, so it cannot emit Matroska; it would have been eligible for the sibling `size_large_1080p_to_mp4` case but not this MKV target.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** `engine does not declare operation 'mux'`. Honest — it is a parser/demuxer, not a muxer.

## Anti-cheat validation

- **Scenario:** `src/scenarios/mux/size-ladder.ts:86-99` (`id: 'size_large_1080p_to_mkv'`), built via `buildMux` in `src/scenarios/mux/_shared.ts:204-229`.
- **Fixture:** input `large_h264_1080p_120s.mp4` exists at `fixtures/media/large_h264_1080p_120s.mp4` — **90 MB real file**, not synthetic/empty. Goldens present and non-trivial: `fixtures/golden/large_h264_1080p_120s.mp4.meta.json` (durationSec 120, 1080p30 H.264 @ 5.84 Mbps + AAC 48 kHz stereo), plus real `.packets.json` (1.1 MB), `.frames.json`, `.ssim.json`. Physically plausible for a 120 s 1080p clip.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1508-1600` — genuine `mb.Output` Matroska author over `EncodedVideoPacketSource`/`EncodedAudioPacketSource`, packets copied verbatim with real PTS/duration/keyframe flags (`adapter.ts:1559-1591`). No canned bytes, no input→output passthrough of the source MP4 (output is a freshly authored MKV via `output.finalize()` / `targetInfo.mediaBytes`), no short-circuit to a golden file, no swallowed errors (unsupported codec/container *throw*).
- **Oracle:** `src/core/oracles.ts:2709-2758` — re-probes the authored MKV with the reference engine and compares duration to the golden meta, failing when `Δ > tolSec`. It is a real measurement against a baked golden, not trivially satisfiable. It is, however, a **single duration-only structural-proxy gate** (no packet/frame bit-comparison; `reference-reimport` and `decode-mux` are intentionally not attached for a cross-container/reframing MKV target per `_shared.ts:30-61`).
- **Verdict: WEAK-GATE.** Fixture is real and both implementations are genuine native library calls, so the PASS is honest — but conformance for this cell rests on a single duration-invariant proxy (±0.125 s) rather than a bit-exact or packet-table comparison. A mux that corrupted samples while preserving total duration would not be caught here. The winner's perf margin is also the *only* discriminator and is **cached==true, n=1, mad=0** — reused, not re-run, so staleness/single-sample risk applies.
- **Cached note:** both passing results carry `cached:true` ("cached previous PASS result"); neither was re-executed in this run.

## Confidence & caveats

- **Confidence: medium.** Winner selection is unambiguous (only 2 eligible, correctness tied, mediabunny wins the named primary metric by a clean 1.23x), and both adapters were code-verified as real. Downgraded from high because (a) the gate is a single duration proxy (WEAK-GATE), and (b) the deciding perf numbers are cached single samples (n=1, mad=0) — the 1.23x margin is directionally trustworthy but not statistically robust.
- The 5 NA_ENGINE results all look like **honest capability declarations**, not under-declarations: web-demuxer/remotion-media-parser are parsers, platform is bare WebCodecs, remotion-webcodecs offers no standalone mux op, and mp4box correctly reports it cannot author MKV.
- peakMemory and targetWrites were not sampled (n=0) for either passing engine, so the secondary memory/IO tiebreakers in the rubric could not be applied.
