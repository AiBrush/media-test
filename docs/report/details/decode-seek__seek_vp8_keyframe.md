# decode-seek/seek_vp8_keyframe

family: decode-seek | fixture asset: `vp8_720p_10s.webm` (VP8 video in WebM/Matroska container) | primaryMetric: seekMs | passCount: 5/7

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 5 of 7 engines PASS with identical correctness).
- **Decisive factor: PERFORMANCE.** All five passing engines satisfy the same single gate (`seek-accuracy`) with the exact same measurement — they all landed on PTS 4,003,000µs with `seekDeltaUs=0`. Correctness is therefore a perfect tie, so ranking falls to the performance tiebreaker (B.4.b). On the primary metric `seekMs`, mediabunny is fastest.
- **Margin over runner-up:** mediabunny 26.605ms vs platform/chrome-149 31.83ms = **1.20x faster wall/seek**; vs ffmpeg.wasm 32.84ms = 1.23x; vs web-demuxer 67.59ms = 2.54x; vs remotion-webcodecs 96.77ms = 3.64x. NOTE: all benches are `n==1` (single sample, mad=0), so the margin is weak statistical evidence — the 26.6 vs 31.8ms gap could be run-to-run jitter.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:pass | 26.605 | n/a | n/a | 5761 | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:pass | 31.83 | n/a | n/a | 4277 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:pass | 32.84 | n/a | n/a | 3675 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:pass | 67.59 | n/a | n/a | 3675 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:pass | 96.765 | n/a | n/a | 1227 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(No throughputRealtime / peakMemory metrics are emitted for this scenario; only `seekMs`/`wall` and `longtasks` are present in the shard bench block.)

## Why the winner wins (deep technical)

The operation is a **keyframe-accurate seek to t=4.003s in a VP8/WebM clip**. WebM (Matroska) does not carry a faststart/moov sample table like MP4; random access relies on the **Cues** element (CuePoint → CueTrackPositions → CueClusterPosition/CueRelativePosition) plus Cluster/SimpleBlock timestamps. The scenario notes confirm the design: *"VP8/WebM keyframe seek at the actual 4.003s video keyframe via Cues"* (src/scenarios/decode-seek/index.ts:528), and the target `tUs: 4_003_000` is deliberately set to the real keyframe PTS rather than a round number, with `seekToleranceUs: 50_000` (index.ts:525-527). The oracle `expectedSeekPtsUs` resolves the expected landing by scanning golden video packets for the keyframe at-or-before the requested time (`keyframeAtOrBefore`, oracles.ts:2236-2257); the golden's keyframe sits exactly at 4,003,000µs, so the only correct answer is landing on that PTS.

Every passing engine produced `landedPtsUs:4003000`, `expectedPtsUs:4003000`, `seekDeltaUs:0` — i.e. each correctly parsed the WebM Cues index, found the VP8 keyframe before/at 4.003s, and decoded to that exact frame. That makes correctness a 5-way exact tie; the gate does not differentiate them.

The differentiator is the seek path's cost. mediabunny's adapter (src/engines/mediabunny/adapter.ts:1415-1436) implements seek through a `VideoSampleSink` built on the track's `VideoDecoderConfig` (`videoDecoderOptionsForTrack`, adapter.ts:1421) and a single `sink.getSample(targetSec)` call (adapter.ts:1423) that returns the last frame with start ≤ t. Per its `configUsed`, mediabunny ran a **pure-TS ESM core** (`coreBuild:"pure-ts-esm"`), no SharedArrayBuffer, no COOP/COEP requirement (`coopCoep:"not-required"`), `backend:"webcodecs"` with `hwAccel:"prefer-hardware"` in a `streaming-lockstep` pipeline. It does its own lightweight WebM/Cues parsing in JS and hands exactly one keyframe-led GOP to a hardware `VideoDecoder`, then reads `sample.microsecondTimestamp` (adapter.ts:1426) — minimal demux overhead and a single decode, yielding the lowest `seekMs` of 26.605ms.

The platform engine (chrome-149) seeks via the native `<video>`/`VideoDecoder` path (`backend:"webcodecs"`, `hwAccel:true`, `decode:"VideoDecoder"`); at 31.83ms it is close, but slightly slower here — likely native demuxer + element seek setup overhead for VP8/WebM. ffmpeg.wasm (32.84ms) carries single-thread wasm demux cost. web-demuxer (67.59ms) layers a wasm (libav) demux over WebCodecs decode — ~2.5x mediabunny. remotion-webcodecs (96.77ms) is slowest, consistent with its `streaming-backpressure` convert pipeline and `bufferWriter` setup overhead for a one-shot seek. Notably mediabunny's `longtasks` figure (5761ms) is the *highest* of the group, but `longtasks` is not the primary metric and is a cumulative main-thread-blocking measure across the run rather than the seek latency itself; the primary `seekMs` governs.

## What each other framework did wrong

- **platform@chrome-149** — PASSed identically (seekDeltaUs=0) but lost on speed: 31.83ms vs 26.605ms = 1.20x slower seekMs. No correctness deficit; just slower native seek setup for VP8/WebM.
- **ffmpeg.wasm@0.12.15** — PASSed (seekDeltaUs=0) but 32.84ms = 1.23x slower; single-thread wasm demux overhead.
- **web-demuxer@4.0.0** — PASSed (seekDeltaUs=0) but 67.59ms = 2.54x slower; wasm-libav demux + WebCodecs decode stack.
- **remotion-webcodecs@4.0.479** — PASSed (seekDeltaUs=0) but slowest at 96.765ms = 3.64x slower; streaming-backpressure convert pipeline overhead for a single seek.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'seek'". HONEST NA — mp4box is an MP4/ISO-BMFF parser and does not implement a decode-and-land seek primitive; it could not service a WebM seek regardless.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'seek'". HONEST NA — it is a parser/probe library, not a decoder; no seek-to-frame primitive is declared.

## Anti-cheat validation

- **Scenario:** src/scenarios/decode-seek/index.ts:520-529 — `id:'seek_vp8_keyframe'`, `asset:'vp8_720p_10s.webm'`, `container:'webm'`, `videoCodec:'vp8'`, `tUs:4_003_000`, `keyframe:true`, `tolerances.seekToleranceUs:50_000`.
- **Fixture:** `fixtures/media/vp8_720p_10s.webm` exists, 1.3 MB — a real WebM file, not synthetic/empty/mock. The target PTS (4,003,000µs) is the actual on-disk keyframe timestamp, not a round number, which would only be discoverable from the real Cues index.
- **Oracle:** `seek-accuracy` in src/core/oracles.ts:2199-2234, with expected-PTS resolution via `expectedSeekPtsUs`/`keyframeAtOrBefore` (oracles.ts:2236-2267). It computes `d = |landedPtsUs - expectedPtsUs|` and FAILs if `d > seekToleranceUs`. The tolerance is 50,000µs but every engine reported `d=0`, far inside tolerance, against a golden-derived expected PTS — a real, meaningful comparison, not trivially satisfiable.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:1415-1436 — genuinely opens the input, gets the primary video track, builds a `VideoSampleSink` with a real `VideoDecoderConfig`, calls `getSample(targetSec)`, and returns `sample.microsecondTimestamp`. No hardcoded output, no copy-input-to-output, no short-circuit to golden, no error swallowing (it throws on missing track/frame).
- **Verdict: REAL** — real WebM fixture + genuine library-backed seek implementation + a meaningful timestamp oracle that performs a real golden comparison. The seek-accuracy gate is a timestamp gate (not pixel-exact), which is the appropriate correctness contract for a seek operation; it is not a smoke-only gate.
- **Cached note:** ALL five PASS results (and the bench numbers driving the win) have `cached==true` ("cached previous PASS result"). The performance ordering was reused, not freshly re-run. Combined with `n==1`/mad=0 single-sample benches, the 1.20x margin over platform is low-confidence and could invert on a fresh run.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict (REAL, exact PTS match) is high-confidence and well-grounded. The *winner selection* rests entirely on the performance tiebreaker because correctness is a perfect 5-way tie.
- The performance margin is fragile: every bench is a single sample (`n==1`, mad=0) and every result is cached. mediabunny (26.6ms) over platform (31.8ms) is a 5.2ms gap that is within plausible run-to-run jitter — treat the win as "fastest in the cached run" rather than a robust performance lead.
- `longtasks` is highest for the winner (5761ms) but is non-primary and cumulative; it does not represent seek latency and was not used to rank.
- Two NA_ENGINE results are honest capability gaps (parser-only libraries with no seek primitive), not under-declared capabilities.
