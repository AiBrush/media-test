# probe/h264_rotated90

family: probe | fixture asset: `fixtures/media/h264_rotated90.mp4` (4.4 MB, real) | primaryMetric: `wall` | passCount: 7/7

## Verdict

- **Best framework: remotion-media-parser@4.0.479** (env.engineId `remotion-media-parser@4.0.479`).
- **CONTESTED**: all 7 engines PASS the single gating oracle `golden-metadata` (2 tracks matched, durationDeltaSec=0). Correctness is therefore a perfect tie across the board, so the decision falls to **PERFORMANCE**.
- **Decisive factor**: lowest `wall` median. remotion-media-parser parses header/metadata only and never touches WebCodecs or wasm, so it is the cheapest probe path.
- **Margin over runner-up** (mp4box, 11.205 ms): **2.04x faster wall** (5.485 ms vs 11.205 ms). Against the WebCodecs-backed engines the gap is larger: ~2.23x vs remotion-webcodecs (12.245 ms), ~2.38x vs mediabunny (13.07 ms), ~9.95x vs platform (54.58 ms), ~17.6x vs ffmpeg.wasm (96.64 ms). Caveat: n=1, mad=0 for every engine, so these are single-sample point measurements — directionally robust (the ordering tracks backend cost: cpu-js < pure-js < webcodecs < MediaRecorder < wasm) but each individual ratio is weak statistical evidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 5.485 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 11.205 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 12.245 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 13.070 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 21.975 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 54.580 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 96.640 | n/a | n/a | n/a | cached previous PASS result |

(The bench block carries only `wall` for this scenario — `throughputRealtime`, `peakMemory`, `longtasks` are not collected for a probe op, so they are n/a everywhere.)

## Why the winner wins (deep technical)

The operation is a pure **probe** of an H.264-in-MP4 clip carrying a non-identity display matrix (a 90-degree rotation tkhd matrix). The golden (`fixtures/golden/h264_rotated90.mp4.meta.json`) deliberately asserts the **coded/unrotated** dimensions `1280x720` (not the display-swapped `720x1280`), plus `mp4` container, `durationSec=10`, video `h264 @ 30fps`, audio `aac 48000Hz / 2ch`. The gating oracle `golden-metadata` (`src/core/oracles.ts:595`) compares container, duration (within a strict ±1-frame band ≈ 0.0417 s — see measured `durationToleranceSec=0.0416666…`, `durationDeltaSec=0`), and per-track codec/dims/fps/sampleRate/channels positionally (`compareTrack`, `oracles.ts:659`). Critically, `compareTrack` checks `width`/`height` against the golden's coded values, so any engine that surfaces rotation by **swapping w/h** would report `720x1280` and FAIL the dims diff. Every engine here got the dims right, hence the full tie on correctness.

Because correctness is identical, the win is mechanical: **the cheapest path to the moov metadata wins**. remotion-media-parser uses backend `cpu-js` (`env.configUsed.backend: "cpu-js"`, `hwAccel:false`, `wasmThreads:0`, `fieldsTier:"metadata-only"`). Its probe (`src/engines/remotion-media-parser/adapter.ts:363-384`) calls the real `parseMedia` from `@remotion/media-parser` with only the header fields it needs — `durationInSeconds`, `container`, `tracks`, `metadata`, `rotation` — never demuxing samples, never spinning a VideoDecoder, never loading a wasm core. For an MP4 that means reading `ftyp`/`moov` and stopping; the 4.4 MB `mdat` is never scanned. That is why it lands at **5.485 ms**, ahead of even mp4box's pure-JS box walk (11.205 ms).

The rotation correctness is handled defensively rather than accidentally: at `adapter.ts:1354-1369` the adapter computes `quarterTurn = |round(rotation)| % 180 === 90` and, when true, prefers `codedWidth/codedHeight` over the parser's display `width/height`. For this fixture media-parser actually reports `rotation:0` with `width/height = 1280x720` (the coded dims), so the guard is a no-op here, but it guarantees the engine reports unrotated dims for any quarter-turn file — exactly what the golden demands. The normalized metadata is assembled in `toNormalizedMetadata` (`adapter.ts:597`), and `golden-metadata` then sees container `mp4`, 2 positional tracks matching the golden, duration delta 0 — a clean pass with no tolerance slack consumed.

The WebCodecs-backed engines (remotion-webcodecs 12.245 ms, mediabunny 13.07 ms, platform 54.58 ms) and the wasm engine (ffmpeg.wasm 96.64 ms) all pay setup cost they do not need for a probe: WebCodecs/decoder negotiation, canvas/pixel backends, or the ffmpeg.wasm module instantiation. platform's 54.58 ms reflects its `<video>`-based + MediaRecorder pipeline (`env.configUsed.encode: "<video>→canvas→MediaRecorder(out)"`) which is heavier to stand up than a header read. ffmpeg.wasm is slowest because every op routes through a single-thread wasm FFmpeg invocation. None of these is wrong — they are simply over-provisioned for metadata-only extraction, which is precisely the axis this probe scenario measures.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS, runner-up. Pure-JS whole-file box parse (`backend:"pure-js"`, `pipeline:"whole-file-append(MP4BoxBuffer+fileStart)"`, `rangeReads:false`). Correct dims/duration, but 2.04x slower wall (11.205 ms vs 5.485 ms): it appends the file and walks boxes rather than stopping at a metadata-only field set, and lacks range reads.
- **remotion-webcodecs@4.0.479** — PASS. 12.245 ms (2.23x slower). `backend:"webcodecs"` with `hwAccel:"prefer-hardware(+software fallback)"`; the WebCodecs/streaming-backpressure machinery is heavier to initialize than a header-only JS parse it does not need for a probe.
- **mediabunny@1.48.0** — PASS. 13.07 ms (2.38x slower). `backend:"webcodecs"`, `pixelBackend:"VideoSample.copyTo(RGBA)>canvas"`, `coopCoep:"not-required"`. Correct metadata; WebCodecs/canvas-pool setup cost it loses on for a metadata-only op.
- **web-demuxer@4.0.0** — PASS. 21.975 ms (4.01x slower). Correct golden match; its demux-oriented path is more setup than a probe requires.
- **platform@chrome-149** — PASS. 54.58 ms (9.95x slower). `<video>`+VideoDecoder+MediaRecorder pipeline; standing up the media element / WebCodecs decode path dominates the tiny metadata workload.
- **ffmpeg.wasm@0.12.15** — PASS but slowest at 96.64 ms (17.6x slower). Single-thread wasm FFmpeg; module/FS overhead per probe is the cost. Correct metadata (durationDelta 0), just expensive.

No engine FAILed and none returned NA — the dims/rotation gate that could have caught a w/h-swap bug was satisfied by all seven.

## Anti-cheat validation

- **Scenario**: `src/scenarios/probe/index.ts:82-90` (the `h264_rotated90.mp4` ProbeCase, `container:'mp4'`, `videoCodecs:['h264']`, `audioCodecs:['aac']`). Notes explicitly state rotation must surface as `track.rotation`, not by swapping w/h, and the golden asserts unrotated coded dims so a swapped-dims engine FAILs.
- **Fixture**: `fixtures/media/h264_rotated90.mp4` exists, 4.4 MB — a real H.264/AAC MP4, not synthetic/empty/mock. Golden siblings present: `.meta.json` (1280x720, 10s, h264/aac), plus `.frames.json`, `.packets.json`, `.ssim.json`.
- **Oracle**: `golden-metadata` at `src/core/oracles.ts:595` performs a real field-by-field comparison (container, duration within strict per-frame band, positional per-track codec/width/height/fps/sampleRate/channels). It is not trivially satisfiable: the strict ±1-frame duration tolerance (0.0417 s) and the coded-dims width/height check are genuine. Measured values (`durationDeltaSec:0`, 2 tracks matched) are physically plausible for this fixture.
- **Winner adapter**: `src/engines/remotion-media-parser/adapter.ts:363-384` calls the real `parseMedia` with a metadata-only field set; rotation/dims handling at `adapter.ts:1354-1369`; normalization at `adapter.ts:597`. No canned output, no copy-input-to-output, no short-circuit to the golden, no swallowed errors. Genuine library call.
- **Known oracle gap (documented, not a cheat)**: `index.ts:608-610` records that `goldenMetadata` ignores `track.rotation` itself — the rotation correctness is enforced only indirectly via the unrotated-dims diff. So this gate verifies "did not swap w/h" but does NOT positively assert the rotation field value. That is a legitimate, author-documented limitation, not faked evidence.
- **Cached note**: the winner's result (and all 7) has `cached:true` ("cached previous PASS result"). The numbers were reused, not re-run this session — staleness risk applies to the exact wall medians. Per the launcher-seeding caveat this is acceptable for ranking but the margins should be treated as last-known-good, not freshly measured.

**Verdict: REAL** — real 4.4 MB fixture, real `parseMedia` implementation, meaningful field-comparison oracle with a strict duration band and a coded-dims check that can catch a real rotation bug. The only weakness is that rotation is verified indirectly (via dims) rather than by a direct rotation-field assertion, but that is an honest documented gap, not a cheat.

## Confidence & caveats

- **Confidence: medium.** Correctness tie is unambiguous (all PASS, identical oracle). The performance ranking is clear and physically sensible (cpu-js header parse < pure-js box walk < webcodecs < MediaRecorder < wasm), but every bench is **n=1, mad=0** and **cached:true**, so individual ratios are weak single-sample, last-known-good evidence rather than statistically tight measurements.
- The oracle gates dims (catching a w/h swap) but not the rotation field directly — a subtler rotation-sign bug would slip through this particular probe.
- If a fresh, repeated-sample run is needed for a defensible margin, clear the raw + .browser-cache and re-run (per the launcher-seeding caveat).
