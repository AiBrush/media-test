# decode-seek/seek_vfr_arbitrary

family: decode-seek | fixture asset: `fixtures/media/h264_vfr.mp4` (2.3 MB, H.264 / MP4, variable frame rate) | primaryMetric: seekMs | passCount: 5/7

## Verdict

**Best framework: mediabunny@1.48.0** — CONTESTED (5 of 7 engines PASS the `seek-accuracy` gate).

Decisive factor: mediabunny ties for the **strongest correctness** (seek landed exactly on the expected VFR frame pts, `seekDeltaUs = 0`) AND is the fastest among the two zero-delta engines. Of the two engines that landed perfectly (mediabunny and web-demuxer), mediabunny is **~2.22x faster on the primary metric** (seekMs 65.16 ms vs 144.37 ms). It also requires no COOP/COEP/SharedArrayBuffer (`coopCoep: not-required`) and runs a pure-TS ESM core over hardware WebCodecs.

Margin over runner-up (web-demuxer, the other Δ0 engine): **65.16 ms vs 144.37 ms = 2.22x faster wall/seek**. Against the fastest overall engine (platform, 53.54 ms) mediabunny is 1.22x slower but platform's landing was less accurate (Δ16667µs vs Δ0), so platform loses on correctness strength, which ranks above performance.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | seek-accuracy:pass (Δ0µs) | 65.16 | n/a | n/a | 4223 | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | seek-accuracy:pass (Δ0µs) | 144.37 | n/a | n/a | 1012 | cached previous PASS result |
| platform@chrome-149 | PASS | seek-accuracy:pass (Δ16667µs) | 53.54 | n/a | n/a | 4223 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | seek-accuracy:pass (Δ16667µs) | 321.94 | n/a | n/a | 1012 | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | seek-accuracy:pass (Δ200000µs) | 492.21 | n/a | n/a | 2477 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'seek' |

(No throughputRealtime/peakMemory metrics are recorded in this shard; only seekMs/wall/longtasks are present. All five PASS rows are `n==1`, `mad==0` — single-sample evidence.)

## Why the winner wins (deep technical)

The operation is a precise frame seek to **t = 4,250,000 µs (4.25 s)** in a **variable-frame-rate H.264 elementary stream inside an MP4**, targeting a *non-keyframe* time. The oracle (`src/core/oracles.ts:2199` `seekAccuracy`) does not demand bit-exact pixels for seek; it resolves the **expected landing pts** as the nearest real video packet pts from the golden (`expectedSeekPtsUs` -> `nearestPacketPts`, `oracles.ts:2250` / `:2278`) and checks `|landedPtsUs - expectedPtsUs| <= 250000 µs`. The golden's nearest true video PTS to 4.25 s is **4,233,333 µs** — this is the crux of VFR: because frame intervals are non-uniform, the displayed frame at 4.25 s is the one that *starts* at 4.233333 s, ~16.7 ms earlier.

mediabunny's adapter (`src/engines/mediabunny/adapter.ts:1415` `seek`) opens the input, gets the primary video track, and uses `VideoSampleSink.getSample(targetSec)` (`adapter.ts:1421-1423`). `VideoSampleSink.getSample` is documented to return "the last frame with start ≤ t (presentation order), i.e. the frame visible at that timestamp." For a VFR stream this is exactly the right semantic: it walks mediabunny's parsed sample table, finds the demuxed sample whose presentation start is ≤ 4.25 s, decodes from the governing keyframe via hardware WebCodecs (`backend: webcodecs`, `hwAccel: prefer-hardware`, `configUsed`), and reports `sample.microsecondTimestamp` = **4,233,333 µs** → `seekDeltaUs = 0`. That is the tightest possible landing for this VFR target.

The single-frame, presentation-ordered sink design is why mediabunny beats web-demuxer on speed despite identical accuracy. web-demuxer (`src/engines/web-demuxer/adapter.ts:957` `seek`) must: call `getDecoderConfig`, run `VideoDecoder.isConfigSupported` (`adapter.ts:964`), fetch `getMediaInfo` for duration clamping, then `read('video', targetSec, readEndSec, AV_SEEK_FLAG_BACKWARD)` over a **0.75 s window** (`adapter.ts:975`), pipe every chunk in that window through a freshly configured `VideoDecoder`, flush, then linearly scan the decoded array for the frame at/before target (`adapter.ts:1021-1024`). It lands at the same 4,233,333 µs (Δ0) but pays for decoding an entire 0.75 s GOP window and the wasm-demux read loop — hence 144.37 ms vs mediabunny's 65.16 ms. mediabunny's `getSample` decodes only up to the requested frame, so it is 2.22x faster while equally accurate. mediabunny also runs without COOP/COEP and without SharedArrayBuffer (`sharedArrayBuffer: false`, `coopCoep: not-required`), a deployment-friendliness tiebreaker the wasm path cannot match.

## What each other framework did wrong

- **web-demuxer@4.0.0 (PASS, runner-up):** Correctness is tied (Δ0µs, landed 4,233,333µs) but it is **2.22x slower** on the primary metric (seekMs 144.37 vs 65.16). Cause: it decodes a full 0.75 s backward read window through a fresh `VideoDecoder` and linearly scans decoded frames (`adapter.ts:975-1024`), whereas mediabunny's `VideoSampleSink.getSample` decodes only to the target frame. Lower longtasks (1012 ms) does not offset a 2.22x primary-metric loss when correctness is equal.
- **platform@chrome-149 (PASS):** Fastest overall (53.54 ms) but **less accurate** — landed 4,250,000µs (`seekDeltaUs = 16667µs`). It used the `<video>`-element seek path (`decode: VideoDecoder`, `encode: <video>→canvas→MediaRecorder`), which snaps to wall-clock 4.25 s rather than the true VFR frame start at 4.233333 s. Correctness strength ranks above performance, so it loses to the Δ0 engines.
- **ffmpeg.wasm@0.12.15 (PASS):** Landed 4,250,000µs (Δ16667µs) — same accuracy tier as platform, but **6.0x slower** than mediabunny (321.94 ms) due to single-thread wasm demux+decode. Passes the gate but is the weakest of the accurate-enough engines on both correctness (Δ16667) and speed.
- **remotion-webcodecs@4.0.479 (PASS, weakest):** Landed 4,033,333µs (`seekDeltaUs = 200000µs`) — only just inside the 250 ms VFR tolerance, and **7.55x slower** than mediabunny (492.21 ms). Its streaming-backpressure pipeline overshot the target frame backward by a full ~200 ms (likely landing on an earlier sample than the at-or-before frame). Both metrics are worst-in-class among PASS engines.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA — it is a parser/demuxer that "does not declare operation 'seek'". It has no frame-decode/seek capability, so the NA is genuine, not under-declared.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — mp4box is an MP4 box parser/segmenter and "does not declare operation 'seek'". It can extract sample tables but does not decode frames, so it cannot satisfy a pixel/pts landing seek. Genuine NA.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/decode-seek/index.ts:475-485` (`id: 'seek_vfr_arbitrary'`). Asset `h264_vfr.mp4`, container mp4, codec h264, `tUs: 4_250_000`, `keyframe: false`, `tolerances.seekToleranceUs: 250_000`. Notes: "VFR seek: landing tolerance widened because frame intervals are non-uniform."
- **Fixture exists:** `fixtures/media/h264_vfr.mp4` present, **2.3 MB** real H.264/MP4 VFR file (confirmed via stat). Not synthetic/empty/mock.
- **Oracle:** `src/core/oracles.ts:2199` `seekAccuracy`. It resolves expected pts from golden video packets (`expectedSeekPtsUs` `:2250`, `nearestPacketPts` `:2278`) and asserts `|landed - expected| <= seekToleranceUs`. This is a **real comparison against golden packet timestamps**, not a smoke gate; the measured `expectedPtsUs = 4233333µs` is a physically plausible VFR frame pts near 4.25 s.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1415-1436`. Genuinely calls the real library: `getPrimaryVideoTrack`, `new VideoSampleSink(...)`, `sink.getSample(targetSec)`, reads `sample.microsecondTimestamp`, decodes pixels via `imageDataFromVideoSample` + `digestImageData`. No canned output, no copy of input, no short-circuit to golden, no error-swallow-then-success.
- **Plausibility:** measured landings are real and codec-consistent — Δ0 (mediabunny, web-demuxer), Δ16667µs ≈ one 60fps frame (platform, ffmpeg), Δ200000µs (remotion-webcodecs). All consistent with VFR seek behavior.
- **Cached note:** All five PASS rows have `cached == true` ("cached previous PASS result"). Evidence was **reused, not re-run** — staleness risk applies to every number here (per the launcher seeding caveat). The implementations and oracle are real, so the verdict stands, but the exact ms values should be treated as last-known-good, not freshly measured.

**validationVerdict: REAL** — real 2.3 MB VFR fixture, genuine WebCodecs-backed seek implementation in the winner, and a meaningful pts-vs-golden oracle that is not trivially satisfiable.

## Confidence & caveats

Confidence: **medium**. The correctness winner (Δ0 + fastest of the Δ0 pair) is unambiguous and the code path is verified real. Caveats: (1) every result is `cached==true` and `n==1` with `mad==0`, so the timing margins rest on single samples — the 2.22x gap over web-demuxer is large enough to survive sample noise, but the 1.22x platform-vs-mediabunny gap is not load-bearing since platform loses on accuracy regardless. (2) No peakMemory/throughputRealtime were captured for this scenario, so those tiebreakers could not be applied. (3) The win hinges on the correctness ladder placing Δ0 above platform's faster-but-Δ16667 result; if the suite weighted raw seek latency over pts accuracy, platform would win instead.
