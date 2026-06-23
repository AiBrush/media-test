# mux/mp4_progressive_buffer

- family: mux
- fixture asset: `fixtures/media/h264_1080p_30s.mp4` (real, 31 MB, H.264 video + AAC audio, 30 s, 1080p)
- primaryMetric: wall (the progressive baseline ranks on wall; targetWrites is the primary only for the streaming/reserve/fragmented siblings)
- passCount: 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework: mediabunny@1.48.0**
- **Contested** (2 engines PASS with byte-for-byte-equivalent correctness).
- **Decisive factor: performance.** Correctness is a dead heat — both engines re-import to the identical 2308 packets / 1423 keyframes, both pass the duration invariant with the same Δ 0.0213 s, and both produce a structurally correct progressive (mdat-before-moov) MP4. mediabunny then wins on every speed axis.
- **Margin over runner-up (ffmpeg-wasm):** wall 89.46 ms vs 264.75 ms = **2.96x faster**; throughputRealtime 335.3x vs 113.3x = **2.96x higher**; longtasks 173 ms vs 4223 ms = **24.4x less main-thread blocking**. Both samples are n=1 (mad=0, p95=median), so the magnitude is single-shot evidence, but the gap (3x wall, 24x longtasks) is far larger than plausible run-to-run noise.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true, property-invariant:true, mp4-box-layout:true | 89.46 ms | 335.35x | 99,971,688 B | 173 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true, property-invariant:true, mp4-box-layout:true | 264.76 ms | 113.31x | 0 B (n=0, not sampled) | 4223 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fastStart:none' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

This case packs already-encoded **H.264 (AVCC) video + AAC audio** EncodedTracks into a **progressive MP4** (`fastStart:false`, `target:'buffer'`) — i.e. mdat written first, moov authored and appended at the end once the sample table is known. There is no decode and no re-encode; both PASS engines do a pure sample-copy, so correctness is identical and the contest is purely about how the muxer authors the ISO-BMFF and how much it stalls the main thread.

**Correctness is genuinely tied.** The reference-reimport oracle (`src/core/oracles.ts:1225`) feeds each engine's output bytes back through the reference engine's demuxer and counts packets/keyframes; both engines yield exactly `reimportPackets:2308, reimportKeyframes:1423`, and since `op==='mux'` (not remux) the gate also asserts a non-empty packet table (oracles.ts:1249) — both clear it. The property-invariant probe-duration check (`src/core/oracles.ts:2645`, "probe-duration" branch) measures `outDurationSec:30.0213` vs `goldenDurationSec:30` → `deltaSec:0.0213 ≤ durationToleranceSec:0.0417` for both. The mp4-box-layout gate (`src/core/oracles.ts:365`) takes the `fastStart === false` branch (oracles.ts:415-422): it parses top-level boxes and requires `mdatOffset < moovOffset`. mediabunny emitted `ftyp@0, mdat@28, moov@31231513` (3 boxes); ffmpeg-wasm emitted `ftyp@0, free@32, mdat@40, moov@31231517` (4 boxes, an extra `free` reservation box). Both satisfy mdat-before-moov, so the layout gate passes identically — the only structural difference (ffmpeg's `free` padding box) is cosmetic and does not affect correctness.

**mediabunny's speed comes from its in-process, pure-TS streaming muxer.** Per `env.configUsed`, mediabunny ran `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`. Its `mux()` (`src/engines/mediabunny/adapter.ts:1508`) constructs a real `Output` over a `BufferTarget`, adds an `EncodedVideoPacketSource`/`EncodedAudioPacketSource` per track with `maximumPacketCount` pre-sized to the chunk count (adapter.ts:1529, 1540 — lets the muxer pre-allocate the sample table), then streams each `EncodedPacket` in (adapter.ts:1562-1591), carrying the WebCodecs `decoderConfig` (codec string + AVCC `description`) on the first packet so the muxer emits the correct codec-private boxes. `fastStart:false` flows through `outputFormatOptionsFrom` (adapter.ts:180-198) which maps the raw option straight to mediabunny's `OutputFormatOptions.fastStart`, telling the native muxer to write mdat first and append moov — no second pass, no rewrite. This is a single-threaded JS hot loop over packet metadata (no codec work), which is why wall is 89 ms and longtasks only 173 ms.

**ffmpeg-wasm is correct but pays the wasm tax.** Its `mux()` (`src/engines/ffmpeg-wasm/adapter.ts:2899`) rebuilds each EncodedTrack into an elementary-stream file, writes it into the wasm MEMFS, and shells out to the ffmpeg CLI with `-c copy -map ...` (adapter.ts:2924-2941). For `fastStart:false` it deliberately omits `+faststart` (adapter.ts:2933 — the `else if (opts.fastStart !== false)` guard), correctly producing the progressive layout (and the `free` box ffmpeg reserves for a potential faststart pass). But the whole pipeline runs inside a single-threaded wasm core: MEMFS writes of the elementary streams, the CLI argument parse, demux of each ES, and the copy-mux all execute on the main thread as one giant blocking task — hence **longtasks 4223 ms** (24x mediabunny) even though wall is only 265 ms (the 4223 ms longtasks figure includes the per-run wasm core/exec accounting). throughputRealtime of 113.3x is real and respectable, but mediabunny's 335.3x triples it.

The performance tiebreaker (B/4b/4c) is unambiguous: mediabunny is faster on wall (2.96x) and throughput (2.96x), and dramatically better on main-thread responsiveness (24.4x fewer longtask ms) — the latter matters most for an in-browser muxer that must not freeze the UI. mediabunny also needs no COOP/COEP and no SharedArrayBuffer (`coopCoep:"not-required"`), a deployment advantage over the wasm path. The only column ffmpeg "wins" is peakMemory (0 vs ~100 MB) but that is an artifact — ffmpeg's peakMemory has `n:0` (not sampled), so it is not a real measurement; mediabunny's 99,971,688 B reflects holding the 31 MB input chunks plus the output buffer in JS heap, which is expected and not a deciding factor.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed with identical correctness but lost on performance: wall 264.76 ms (2.96x slower), throughput 113.31x (0.34x of the winner), longtasks 4223 ms (24.4x more main-thread blocking). Single-threaded wasm core + MEMFS round-trip + CLI invocation is the mechanism.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare feature 'fastStart:none'". Honest NA — mp4box.js can mux but this adapter does not declare the `fastStart:none`/progressive write-shape feature this case requires, so it is gated out rather than faking a pass.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — remotion-media-parser is a read/parse-only library; it has no muxing capability, so the NA is correct, not under-declared.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — web-demuxer is demux-only by design; muxing is out of scope.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — the raw browser/WebCodecs platform shim exposes decode/encode but no container muxer, so it cannot author an MP4 sample table itself.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — this adapter wraps WebCodecs encode/convert flows but does not expose a standalone mux-from-EncodedTracks op.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/mux/output-modes.ts:32-45` — case `id:'mp4_progressive_buffer'`, `input:'h264_1080p_30s.mp4'`, `to:'mp4'`, `videoCodecs:['h264']`, `audioCodecs:['aac']`, `extraOptions:{ fastStart:false, target:'buffer' }`. Built via `buildMux` in `src/scenarios/mux/_shared.ts`.
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB real H.264+AAC media (verified by `stat`). Not synthetic/empty/mock. The runner assembles EncodedTracks from this real file (runner.ts:728-733, via `prepareMuxTracks`), so the muxer is fed genuine encoded packets.
- **Oracles (real, non-trivial):**
  - reference-reimport `src/core/oracles.ts:1225` — re-demuxes the engine's own output bytes; requires non-empty packet table (op==='mux' branch, line 1249); measured 2308 packets / 1423 keyframes are physically plausible for 30 s 1080p H.264 (~76 fps-equivalent packet rate incl. audio; ~1 keyframe / 0.65 s GOP). Not trivially satisfiable.
  - property-invariant probe-duration `src/core/oracles.ts:2645` — compares re-probed duration to golden 30 s within a 0.0417 s tolerance; measured Δ 0.0213 s is a real, tight match, not a wide-open band.
  - mp4-box-layout `src/core/oracles.ts:365` — parses real top-level boxes and asserts mdat-before-moov for `fastStart:false` (line 415-422); the measured offsets (mdat@28/40, moov@31231513/31231517) are consistent with a ~31 MB mdat. A muxer cannot pass by writing a generic faststart MP4 — the layout direction is checked.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1508` `mux()` — calls real mediabunny `Output`/`BufferTarget`/`EncodedVideoPacketSource`/`EncodedAudioPacketSource`, streams every EncodedPacket (adapter.ts:1562-1591), and finalizes (adapter.ts:1598). No canned output, no input→output copy, no short-circuit to golden, no swallowed errors (unsupported codecs throw, adapter.ts:1527/1538). The output is independently re-demuxed by the oracle, so faked bytes would fail.
- **Cached note:** mediabunny's result has `cached:true` ("cached previous PASS result"); ffmpeg-wasm also `cached:true`. Both rows are reused, not freshly re-run, so there is mild staleness risk — but the adapter code and oracles inspected here are real, and the cached measurements are internally consistent (identical 2308/1423 reimport counts across both engines, matching duration deltas).
- **Verdict: REAL.** Real 31 MB fixture, genuine library-backed mux implementation, and three meaningful oracles (one structural layout, one round-trip packet/keyframe count, one duration invariant) with physically plausible measurements. The win is on performance and the correctness gates are honest.

## Confidence & caveats

- **Confidence: high** on the winner identity and verdict; correctness is provably equal and the performance gap (2.96x wall, 24.4x longtasks) is large.
- **Caveat — n=1:** every bench metric for both engines has `n:1, mad:0, p95==median`. The exact ratios are single-shot; a multi-sample re-run could shift magnitudes, though not the direction given the size of the gap.
- **Caveat — cached:** both PASS rows are cached, not re-run this cycle; if the input fixture or adapter changed since caching, the numbers could be stale (see launcher seeding caveat). Code inspection mitigates this.
- **Caveat — peakMemory:** ffmpeg-wasm's peakMemory is `n:0` (not sampled, reported 0), so the apparent memory "win" for ffmpeg is not a real measurement and was not used in ranking.
