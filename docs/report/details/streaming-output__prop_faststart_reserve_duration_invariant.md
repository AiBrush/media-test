# streaming-output/prop_faststart_reserve_duration_invariant

Family: streaming-output | Fixture asset: `fixtures/media/h264_1080p_30s.mp4` (real, 31 MB H.264 1080p 30s MP4, AAC audio) | primaryMetric: wall (ms) | passCount: 2 / 7

## Verdict

Best framework: **mediabunny@1.48.0** — CONTESTED (2 engines PASS: mediabunny and ffmpeg.wasm@0.12.15).

Decisive factor: **performance**, not correctness. Both PASS engines satisfy the SAME two oracles
(`property-invariant` probe-duration + `mp4-box-layout`), so correctness strength is a tie. mediabunny wins on
every measured metric: **2.29x faster wall** (77.73 ms vs 178.24 ms), **9.42x less main-thread blocking**
(longtasks 263 ms vs 2477 ms), runs on a hardware WebCodecs backend (`prefer-hardware`) with **no COOP/COEP
requirement** and `sharedArrayBuffer:false`, versus ffmpeg.wasm's wasm path that monopolised the main thread.

Caveat: ffmpeg.wasm reported `peakMemory` with n==0 samples (median 0 bytes = NOT measured), so the memory
comparison is one-sided; mediabunny's 115,001,277 bytes (~115 MB) is the only real memory figure. Both wall
numbers are n==1 (mad 0, single sample) and both results are `cached==true` — evidence is real but single-shot.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, mp4-box-layout:true | 77.73 ms | n/a (not in bench) | 115,001,277 B | 263 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, mp4-box-layout:true | 178.24 ms | n/a (not in bench) | 0 B (n=0, unmeasured) | 2477 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:reserve' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:reserve' |

## Why the winner wins (deep technical)

The operation is an MP4→MP4 lossless remux of `h264_1080p_30s.mp4` (H.264 video + AAC audio in ISOBMFF) with
`fastStart:'reserve'` and `maximumPacketCount:4096` (scenario `src/scenarios/streaming-output/fragmented-faststart.ts:121-136`).
"reserve" means the muxer pre-allocates a forward `moov` region sized for up to N packets, writes `mdat`, then
patches the reserved `moov` in place — producing a progressive-download-friendly moov-before-mdat layout WITHOUT
the buffered second pass that `in-memory` needs. The scenario gates two facts: (1) the reserved/relocated moov did
not change the reported duration (probe-duration invariant, tolerance 0.125 s), and (2) the box layout actually
put moov before mdat.

mediabunny took a dedicated reserve code path: `src/engines/mediabunny/adapter.ts:1244-1248` — when
`opts.fastStart === 'reserve'` it routes through `prepareMuxTracks([input], opts)` then `mux(...)`, because the
reserve mode requires a per-track `maximumPacketCount` to size the forward moov reservation. In `mux`
(`adapter.ts:1508-1551`) it builds a real mediabunny `Output` with `EncodedVideoPacketSource`/`EncodedAudioPacketSource`
and calls `output.addVideoTrack(source, { maximumPacketCount: t.chunks.length })` (line 1529) /
`addAudioTrack(..., { maximumPacketCount })` (line 1540) — feeding the muxer the exact packet count it needs to
reserve the forward moov. `outputFormatOptionsFrom` (`adapter.ts:180-199`) maps `fastStart:'reserve'` straight to
mediabunny's `OutputFormatOptions.fastStart='reserve'` (line 188), so the real library performs the in-place
forward-moov patch. This ran on the WebCodecs backend (`env.configUsed.backend:"webcodecs"`, `hwAccel:"prefer-hardware"`,
`pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`).

The oracle measurements confirm the work was genuine. `mp4-box-layout` (`src/core/oracles.ts:405-413`) parsed the
output's top-level boxes and recorded `ftyp@0, moov@28, free@10906, mdat@85186` (`topLevelBoxes:4, moovOffset:28,
mdatOffset:85186`); since 28 < 85186 the moov genuinely precedes mdat — and the presence of a `free@10906` box of
~74 KB between moov and mdat is exactly the signature of reserve mode (the reserved region the muxer over-allocated
for 4096 packets and the actual packet count fell short of, left as padding). `property-invariant` probe-duration
(`oracles.ts:2709-2758`) re-probed mediabunny's output with the reference engine and got `outDurationSec:30.0213` vs
`goldenDurationSec:30`, Δ 0.0213 s ≤ 0.125 s — a real, physically plausible ~1-frame-and-change drift consistent with
moov-time rounding, well inside tolerance.

ffmpeg.wasm passed the same two oracles with an even tighter duration (Δ 0.0000 s, `outDurationSec:30`) and its own
valid reserve-style layout (`ftyp@0, moov@32, free@27342, mdat@27350`), so it is genuinely correct too. It loses
purely on cost: its single-thread wasm transmux took 178.24 ms wall (2.29x mediabunny's 77.73 ms) and, more tellingly,
blocked the main thread for 2477 ms of longtasks vs mediabunny's 263 ms (9.42x). That gap is the structural difference
between a hardware-WebCodecs/native-muxer pipeline and a monolithic wasm decode-mux that has no thread offload here.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (both oracles, Δ 0.0000 s duration). Lost on performance: 178.24 ms wall vs
  77.73 ms (2.29x slower) and 2477 ms longtasks vs 263 ms (9.42x more main-thread blocking). peakMemory was not
  measured (n=0). A correct but heavier path.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare feature 'fastStart:reserve'". Honest NA — mp4box.js is a
  parser/segmenter and does not expose an in-place reserved-forward-moov writer.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — it is a
  read-only media parser, no muxing/remux output path.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — the raw WebCodecs/
  platform inline path has no container-remux operation (its inline mp4 demux is progressive-only per scenario notes).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — a demux-only library.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'fastStart:reserve'". Plausible NA;
  it can transcode but does not declare the specific reserved-moov output shape. Borderline (it has muxing) but the
  reserve-specific capability is genuinely not declared, so the NA is defensible rather than under-declared.

## Anti-cheat validation

- Scenario: `src/scenarios/streaming-output/fragmented-faststart.ts:121-136` (case `prop_faststart_reserve_duration_invariant`),
  built via `buildStreamPropertyAll` at line 141.
- Fixture: `asset: 'h264_1080p_30s.mp4'` → `fixtures/media/h264_1080p_30s.mp4` EXISTS, 31 MB real H.264 1080p MP4
  (verified via stat). Not synthetic/empty/mock.
- Oracles: `mp4-box-layout` at `src/core/oracles.ts:405-413` (real top-level box parse, asserts moovOffset < mdatOffset);
  `property-invariant` probe-duration at `src/core/oracles.ts:2709-2758` (re-probes the AUTHORED output via the
  reference engine and compares to golden duration with an EXPLICIT 0.125 s tolerance from the scenario). Both are real
  comparisons, not trivially satisfiable: the layout check would FAIL on a moov-last output, and the duration check
  would FAIL on a wrong-duration probe.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1248` (reserve route), `:180-199` (fastStart='reserve'
  mapping), `:1508-1551` (real Output + Encoded*PacketSource + addVideoTrack/addAudioTrack with maximumPacketCount).
  No canned output, no input→output copy, no golden short-circuit, no error swallowing.
- Measurements are physically plausible: 4 top-level boxes, moov@28 before mdat@85186, a ~74 KB free reservation gap,
  duration 30.0213 s vs golden 30 s.
- Verdict: **REAL**. Real fixture + real library implementation + two meaningful oracles (structural layout +
  duration invariant) that can fail.
- Cached note: mediabunny's result is `cached==true` ("cached previous PASS result") — reused, not freshly re-run, so
  there is staleness risk; the numbers reflect a prior run. ffmpeg.wasm is also cached. Per memory note on launcher
  seeding, fully honest fresh numbers would require clearing the raw + .browser-cache.

## Confidence & caveats

Confidence: medium-high. The winner choice is unambiguous (mediabunny beats the only other PASS on every measured
metric, with verified real code and real oracles). Caveats: (1) all bench samples are n==1 (mad 0) and both results
are cached, so the 2.29x/9.42x margins are single-shot, not distributions; (2) ffmpeg.wasm peakMemory is unmeasured
(n=0), so the memory comparison is incomplete; (3) the gate is structural+duration, not bit-exact decoded-frame
equality (the lossless-sample-copy decode-equality premise is covered by a sibling case, not this one), so this is a
strong-but-not-cryptographic correctness gate.
