# mux/prop_h264_decode_mux_mp4_to_mp4

family: mux · fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264 8.2 Mbps + AAC 48 kHz stereo, 30 s) · primaryMetric: wall (default; none pinned) · passCount: 2 / 7

## Verdict

Best framework: **mediabunny@1.48.0**. CONTESTED — two engines PASS (mediabunny, ffmpeg.wasm@0.12.15) with byte-for-byte identical, top-of-ladder oracle outcomes. The decisive factor is **performance**: mediabunny's wall median is **95.53 ms vs ffmpeg.wasm's 326.58 ms = 3.42x faster** for the same mux. Correctness is a dead heat (both: 12/12 frame digests bit-exact, 2308 packets / 1423 keyframes re-imported), so the tiebreak falls to the wall-clock margin plus mediabunny's hardware-WebCodecs / pure-TS-ESM backend with no COOP/COEP requirement against ffmpeg.wasm's single-thread WASM CLI round-trip.

Caveat on strength of the margin: both results are `cached==true` and each metric is `n==1` (mad=0, p95==median), so the 3.42x is a single-sample observation, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, reference-reimport:true | 95.53 ms | not reported | 0 (n=0) | 19963 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, reference-reimport:true | 326.58 ms | not reported | 0 (n=0) | 4531 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'mux:browser-decode-equality' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

Note: throughputRealtime and peakMemory are absent/zero in the shard (`peakMemory.n==0`); the only populated bench metrics are `wall` and `longtasks`. The `longtasks` figures (mediabunny 19963 ms vs ffmpeg 4531 ms) are not a clean ranking signal here — they reflect total main-thread long-task time accumulated over the cached run window, not per-mux cost, and do not flip the wall verdict.

## Why the winner wins (deep technical)

This scenario is the strongest mux video gate the suite has: `decode(mux(x)) == decode(x)`. The operation is to demux the source H.264+AAC MP4 into `EncodedTracks` (coded samples), then re-pack those samples into a fresh MP4 *without re-encoding*, and prove the decoded pixels are bit-identical to a browser-baked decode of the original. Because both engines stream-copy the coded samples, both can in principle be perfect; the contest is which one authors a clean ISO-BMFF faster.

Correctness, both engines (identical numbers from the shard):
- `property-invariant` (DECODE_MUX branch, `src/core/oracles.ts:2686`): the runner decodes the muxed output with the platform WebCodecs decoder and sha256-compares the normalized RGBA buffer of each frame against `fixtures/golden/h264_1080p_30s.mp4.frames.json` (12 baked digests, e.g. frame 0 `e3c072e0…`). Result: `measuredFrames=12, goldenFrames=12, comparedFrames=12, mismatchedFrames=0` → 12/12 bit-exact. This is the bit-exact/crypto tier of the correctness ladder (digest equality of decoded pixels), the strongest possible signal.
- `reference-reimport` (`src/core/oracles.ts:1225`): the reference engine re-demuxes the muxed output and diffs the packet table against `fixtures/golden/h264_1080p_30s.mp4.packets.json`. Golden has exactly 2308 packets / 1423 keyframes; both engines re-import `reimportPackets=2308, reimportKeyframes=1423` — an exact survival of every coded sample and keyframe through the muxer, well inside the `withinRel(...,0.02,1)` count gate (`oracles.ts:1258`). Since target=mp4 of an mp4 source (FAITHFUL_REIMPORT_TARGETS, `_shared.ts:111`), the source-keyed golden is a legitimate reference (no Annex-B/SimpleBlock reframing), so this count gate is meaningful rather than a false-fail trap.

The winning mechanism — mediabunny's adapter (`src/engines/mediabunny/adapter.ts:1508` `mux()`):
- It opens a real `mb.Output({ format, target })` and feeds an `EncodedVideoPacketSource(h264)` and `EncodedAudioPacketSource(aac)` (`adapter.ts:1528`, `:1539`). For each coded sample it constructs `new mb.EncodedPacket(c.data, c.keyframe?'key':'delta', ptsUs/1e6, durationUs/1e6, i)` and `add()`s it verbatim (`adapter.ts:1562-1591`). No transcode path is touched — the bytes are the original coded samples, which is exactly why decode equality holds.
- The decoder config (SPS/PPS) is carried on the first packet only via `decoderConfig.description` (`adapter.ts:1571-1590`), so the muxer writes a correct `avcC` codec-private box; this is what lets the platform decoder re-init and reproduce frame 0's keyframe digest.
- Backend (from `env.configUsed`): `backend="webcodecs"`, `hwAccel="prefer-hardware"`, `pipeline="streaming-lockstep"`, `coreBuild="pure-ts-esm"`, `sharedArrayBuffer=false`, `coopCoep="not-required"`. The muxing here is pure-TS ISO-BMFF writing (no codec invoked for a copy mux), running on the main JS heap with no WASM boundary and no thread/SAB setup cost. That is the structural reason it lands at 95.53 ms.

Why ffmpeg.wasm is 3.42x slower despite being equally correct: its `mux()` (`src/engines/ffmpeg-wasm/adapter.ts:2899`) materializes each track as an elementary stream, `writeFile`s it into the WASM MEMFS, then shells the FFmpeg CLI with `-i … -map … -c copy -avoid_negative_ts make_zero -movflags +faststart` (`adapter.ts:2916-2934`). That is a genuine stream-copy (no re-encode, hence identical decode digests), but it pays the WASM CLI launch, MEMFS round-trip, demuxer/muxer probe, and a `+faststart` second pass to move the `moov` atom — overhead mediabunny avoids by writing the ISO-BMFF table directly in JS. Same correctness, ~231 ms more wall.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed with identical oracle results, so it loses only on performance: wall 326.58 ms vs 95.53 ms (3.42x slower / mediabunny is 0.29x its wall). Root cause is architectural: single-thread WASM FFmpeg CLI with MEMFS writes + `+faststart` moov relocation pass vs mediabunny's native-JS ISO-BMFF writer. (Margin is n=1, cached, so weight accordingly.)
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'mux'". Honest. Raw platform has no encoded-sample muxer; `MediaRecorder` re-encodes a live stream and cannot accept opaque `EncodedTracks` (`src/engines/platform/adapter.ts:18`).
- **mp4box@2.3.0** — NA_ENGINE: "does not declare feature 'mux:browser-decode-equality'". Subtler but honest. mp4box *does* declare and implement `mux` (`src/engines/mp4box/adapter.ts:11`), but the DECODE_MUX builder injects the `mux:browser-decode-equality` feature requirement (`src/scenarios/mux/_shared.ts:264`), and only mediabunny and ffmpeg.wasm declare that feature token (`mediabunny/adapter.ts:1077`, `ffmpeg-wasm/adapter.ts:1510`). mp4box correctly opts out of the browser-decode-equality claim rather than over-declaring. Not an under-declared capability — its `addTrack/addSample/getBuffer` path is not wired to the platform-decode-equality contract.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'mux'". Honest. It is a pure FFmpeg-WASM demux/probe/seek specialist with no muxer (`src/engines/web-demuxer/adapter.ts:7`).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'mux'". Honest. Read-only streaming container parser; declares only probe + demux (`src/engines/remotion-media-parser/adapter.ts:188`).
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare operation 'mux'". Honest. It is a GPU converter (probe/demux/decode/seek/remux/transcode) with no general muxer fed by raw EncodedTracks (`src/engines/remotion-webcodecs/adapter.ts:6,245`).

## Anti-cheat validation

- Scenario definition: `src/scenarios/mux/metamorphic.ts:92` (id `prop_h264_decode_mux_mp4_to_mp4`, invariant `DECODE_MUX`, input `h264_1080p_30s.mp4`, to `mp4`, oracles `['property-invariant','reference-reimport']`). Builder: `src/scenarios/mux/_shared.ts:261` `buildMuxProperty`.
- Fixture: `fixtures/media/h264_1080p_30s.mp4` EXISTS — 31 MB real H.264 (8.2 Mbps, 1920x1080, 30 fps) + AAC (48 kHz, stereo), 30 s, per `fixtures/golden/h264_1080p_30s.mp4.meta.json`. Not synthetic/empty/mock.
- Goldens are real and physically plausible: `…frames.json` = 12 platform-baked sha256 RGBA digests (1920x1080, baked 2026-06-18 by the platform engine — `bakedBy` field; the leftover `$todo` text is the original placeholder note but `pending:false` and `frames[]` is fully populated). `…packets.json` = 2308 packets, 1423 keyframes — consistent with a 30 s 30 fps clip (≈900 video frames) plus AAC frames (~1400), and the high keyframe count is consistent with an all-/frequent-IDR encode. The shard's `reimportPackets=2308 / reimportKeyframes=1423` match the golden exactly, i.e. nothing was dropped or fabricated.
- Oracle implementations are real comparisons, not trivially satisfiable: `property-invariant` decodes the actual output with WebCodecs and does sha256 digest equality (`src/core/oracles.ts:2697`, compare at `:2702` → `compareDigests` `:1166`, which FAILs on any single mismatched or missing frame, `:1203`). `reference-reimport` actually re-demuxes the output and gates packet+keyframe counts (`oracles.ts:1258-1264`). This is the bit-exact tier, not ssim-psnr (no `exactFrames==0` weakness) and not playback-smoke.
- Winner adapter genuinely implements the op: `src/engines/mediabunny/mux` at `adapter.ts:1508-1600` — real `mb.Output` + `Encoded{Video,Audio}PacketSource`, verbatim `EncodedPacket` copy, `output.start()`/`finalize()`. No canned output, no input→output byte copy to fake a mux, no short-circuit to the golden, no swallowed errors (codec-resolution failures `throw`).
- One genuine caveat: mediabunny is the suite's REFERENCE engine (`src/engines/mediabunny/register.ts:29`), and `reference-reimport` uses the reference engine to re-demux. So for mediabunny's own row, that oracle is mediabunny re-importing mediabunny's output — a self-consistency check, weaker than an independent reader would be. ffmpeg.wasm's identical 2308/1423 result, re-imported by mediabunny independently, corroborates the count and removes the concern that the numbers are an artifact of self-import.
- Cached note: BOTH winning/runner-up results have `cached==true` ("cached previous PASS result"); they were reused, not re-run in this pass. Per the launcher-seeding caveat, the wall margin should be treated as a prior measurement, not a fresh head-to-head.
- Verdict: **REAL**. Real 31 MB fixture, real platform-baked goldens, genuine library mux on both engines, and a bit-exact decode + exact packet-survival oracle pair that cannot be passed by a copy-input or mock. The only softeners are evidentiary (cached, n=1, reference-engine self-import on the winner's row), not integrity problems.

## Confidence & caveats

- Confidence: **medium**. Correctness verdict is high-confidence (bit-exact digests + exact packet counts cross-confirmed by both engines). The "best framework" pick rests entirely on the wall margin, which is a single cached sample (n=1, mad=0) — directionally strong (3.42x) and architecturally well-explained, but not a distribution.
- throughputRealtime and peakMemory were not captured (peakMemory.n=0), so the secondary perf axes could not corroborate wall.
- longtasks (mediabunny 19963 ms > ffmpeg 4531 ms) looks adverse for mediabunny but is not per-mux cost; it is accumulated main-thread long-task time over the run window and does not change the wall-based ranking.
- A fresh, uncached, multi-sample re-run (clearing raw + .browser-cache) would harden the margin; the current evidence is reused PASS data.
