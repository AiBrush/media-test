# decode-seek/seek_hevc_keyframe

family: decode-seek | fixture asset: `hevc_1080p_10s.mp4` (HEVC/H.265 in MP4, 1080p, 10s) | primaryMetric: seekMs | passCount: 5/7

## Verdict
- Best framework: **mediabunny@1.48.0** (CONTESTED — 5 of 7 engines PASS the same oracle).
- Decisive factor: All 5 passing engines satisfy `seek-accuracy` identically (Δ=0µs, landed exactly on the 4,000,000µs keyframe), so correctness is a perfect tie. The tiebreaker is **performance on the primary metric `seekMs`**.
- Margin over runner-up: mediabunny seekMs median **38.16ms** vs platform/chrome **50.00ms** → **1.31x faster** than the runner-up, and 2.04x / 7.06x / 47.5x faster than ffmpeg.wasm / web-demuxer / remotion-webcodecs respectively. (All on n=1, see caveats.)

## Per-engine results
| engine | status | oracles passed | seek/wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:pass | 38.16 | n/a | n/a | 5478 | cached previous PASS |
| platform@chrome-149 | PASS | seek-accuracy:pass | 50.00 | n/a | n/a | 874 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:pass | 77.80 | n/a | n/a | 4223 | cached previous PASS |
| web-demuxer@4.0.0 | PASS | seek-accuracy:pass | 269.35 | n/a | n/a | 2059 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:pass | 1814.01 | n/a | n/a | 474 | cached previous PASS |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(No throughputRealtime/peakMemory metrics are emitted for this seek scenario; bench carries only seekMs/wall/longtasks.)

## Why the winner wins (deep technical)
The operation is a precise keyframe seek to t=4.0s in an HEVC elementary stream muxed in MP4. The fixture is a closed-GOP HEVC clip with a 2-second IDR cadence: the golden video track (trackIndex 0) holds 300 packets with exactly 5 keyframes at pts {0, 2.0s, 4.0s, 6.0s, 8.0s}. Because there is a true IDR at 4.0s, the oracle's `keyframeAtOrBefore` resolves `expectedPtsUs=4000000` and the tolerance is `seekToleranceUs: 0` (src/scenarios/decode-seek/index.ts:499-509). Any engine that demuxes the MP4 sample table, locates the sync sample at 4.0s, and reports its PTS lands Δ=0 — which all 5 passing engines did (measurements `landedPtsUs:4000000`, `seekDeltaUs:0`).

Since correctness is a hard tie, the win is purely mechanical speed. mediabunny ran on `backend:webcodecs`, `hwAccel:prefer-hardware`, `pipeline:streaming-lockstep`, `coopCoep:not-required`, `sharedArrayBuffer:false` (shard env.configUsed). Its seek path (src/engines/mediabunny/adapter.ts:1415-1436) is minimal: `openInput` → `getPrimaryVideoTrack` → construct a `VideoSampleSink` with hardware decoder options → `sink.getSample(targetSec)`, then read `sample.microsecondTimestamp`. Mediabunny's sample sink uses the parsed MP4 `stss`/`stco` sample tables to jump directly to the IDR at 4.0s and feed only that GOP entry to the Apple M1 Max hardware HEVC decoder (`ANGLE Metal Renderer` GPU in env). One IDR frame, one hardware decode, no whole-stream scan — yielding the 38.16ms median, the lowest of the field.

By contrast platform/chrome (50.00ms) drives the same WebCodecs hardware HEVC decoder but through the `<video>`/MSE-style streaming pipeline (env: `decode:VideoDecoder`, `frameTransfer:transferable`), which carries more setup overhead per seek; it is correct and only 1.31x slower. ffmpeg.wasm (77.80ms) demuxes and software-decodes HEVC in single-thread wasm (no hardware path), still fast for a single keyframe but 2.04x slower and with a heavy 4223ms longtask cost. web-demuxer (269.35ms) wraps an FFmpeg-wasm demux core and also pays wasm init/seek cost. remotion-webcodecs (1814.01ms) is the slow outlier: its convert-on-main-thread, backpressure-gated pipeline (env: `pipeline:streaming-backpressure`, `convert=main-thread`) appears to walk/stage the stream to reach the target rather than performing a direct sample-table jump, so it is 47.5x slower despite landing on the same exact keyframe.

## What each other framework did wrong
- **platform@chrome-149**: PASS, correct (Δ=0µs) but lost on speed — seekMs 50.00ms vs 38.16ms = 1.31x slower. Same WebCodecs hardware decode, heavier per-seek pipeline setup.
- **ffmpeg.wasm@0.12.15**: PASS, correct (Δ=0µs) but 77.80ms = 2.04x slower; single-thread wasm software HEVC decode, no hardware path, 4223ms longtask.
- **web-demuxer@4.0.0**: PASS, correct (Δ=0µs) but 269.35ms = 7.06x slower; wasm demux core overhead.
- **remotion-webcodecs@4.0.479**: PASS, correct (Δ=0µs) but 1814.01ms = 47.5x slower; main-thread backpressure pipeline instead of a direct sample-table seek.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare operation 'seek'". Honest NA: mp4box is a demux/parse library; it can expose the sample table but the adapter does not implement a decode-and-land seek op, so it cannot produce `landedPtsUs`.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'seek'". Honest NA: the media-parser is a metadata/packet parser (its sibling remotion-webcodecs owns the decode/seek path), so seek is legitimately undeclared here.

## Anti-cheat validation
- Scenario: src/scenarios/decode-seek/index.ts:499-509 — `id: 'seek_hevc_keyframe'`, `asset:'hevc_1080p_10s.mp4'`, `tUs:4_000_000`, `keyframe:true`, `tolerances.seekToleranceUs:0`.
- Fixture: `fixtures/media/hevc_1080p_10s.mp4` exists, 11MB real HEVC/MP4 (not synthetic/empty/mock).
- Golden: `fixtures/golden/hevc_1080p_10s.mp4.packets.json` — 300 video packets, 5 real keyframes at {0,2,4,6,8}s; a genuine IDR sits at exactly 4,000,000µs, so the expected landing is a real bitstream keyframe, not a fabricated target.
- Oracle: src/core/oracles.ts:2199-2234 (`seekAccuracy`) computes `expectedPtsUs` from golden packets via `keyframeAtOrBefore` (oracles.ts:2236-2248) and fails if `|landed-expected| > tolerance`. With tolerance=0 this is a strict, non-trivially-satisfiable timestamp gate — it cannot pass on a wrong/synthetic landing. It is a timestamp (structural) oracle, not pixel-exact; pixel quality for HEVC is covered separately by ssim-psnr, so this is the correct gate for a seek op.
- Winner adapter: src/engines/mediabunny/adapter.ts:1415-1436 — genuine: real `openInput`/`VideoSampleSink.getSample` against the hardware WebCodecs decoder, returns the decoded sample's actual `microsecondTimestamp`. No canned output, no golden short-circuit, no copy-through, no error swallowing (throws on missing track/sample).
- Cached note: mediabunny's result (and all 5 PASS rows) have `cached:true` ("cached previous PASS result"). Evidence is reused, not freshly re-run — staleness risk applies; per the launcher-seeding caveat, a fully honest fresh run would require clearing raw + .browser-cache.
- Verdict: **REAL** — real 11MB HEVC fixture, real keyframe at 4.0s in goldens, strict (tol=0) timestamp oracle, genuine hardware-decode adapter path.

## Confidence & caveats
- Confidence: medium. The correctness verdict is rock-solid (all measurements physically plausible, Δ=0 against a verified golden IDR). The performance ranking determines the winner and rests on **n=1, mad=0** single samples for every engine — a 1.31x margin over the runner-up on a single draw is weak statistical evidence; mediabunny's lead is plausible (direct sample-table jump + hardware decode) but not robust to noise.
- All results are `cached:true`; numbers may be stale relative to current code.
- mediabunny carries the highest longtasks figure (5478ms) of the field — its decode work is more main-thread-bound; if longtask/jank were weighted over raw seekMs, platform (874ms) or remotion-webcodecs (474ms) would look better. The chosen primaryMetric is seekMs, which favors mediabunny.
