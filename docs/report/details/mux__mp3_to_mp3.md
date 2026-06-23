# mux/mp3_to_mp3

- family: mux
- fixture asset: `fixtures/media/mp3_xing.mp3` (64 KB, Xing-headed MP3, 44.1 kHz stereo, golden duration 10 s)
- primaryMetric: throughputRealtime (x-realtime); wall median (ms) reported alongside
- passCount: 2 of 7 (mediabunny, ffmpeg.wasm)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15**
- Contested: YES (2 engines PASS — mediabunny and ffmpeg.wasm).
- Decisive factor: **correctness strength**. Both pass the identical single gate (`property-invariant`, probe-duration sub-mode), so the tie is broken on the strictness of the measured invariant. ffmpeg.wasm authored an MP3 elementary stream whose probed duration deviates from the 10 s golden by only **Δ 0.0310 s**, versus mediabunny's **Δ 0.0571 s** — ffmpeg's reframed output is ~1.84x closer to the source duration (0.0310 vs 0.0571 s), i.e. fewer spurious/partial trailing MP3 frames in the authored stream.
- Margin over runner-up: correctness margin Δ-duration ratio ≈ **0.54x** (ffmpeg's error is ~54% of mediabunny's). On performance mediabunny is actually faster (throughputRealtime 1339.58 vs 901.31 x-realtime = 1.49x; wall 7.465 vs 11.095 ms = 1.49x lower), but performance is only consulted when correctness is comparable — here correctness is NOT comparable (ffmpeg's duration fidelity is measurably tighter on the only gate), so ffmpeg wins. This is a thin margin on a loose tolerance (see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x-rt) | peakMemory (bytes) | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 11.095 | 901.31 | 25,256,444 | 142 | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 7.465 | 1339.58 | 0 (not sampled) | 4034 | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is a container WRITE: take MP3 frames demuxed from a Xing-headed MP3 source and re-emit them into an MP3 elementary/ID3 stream (`to: 'mp3'`, scenario `mp3_to_mp3` in `src/scenarios/mux/write-targets.ts:121-129`). There is no transcode — MP3 access units are stream-copied — so the only thing that can differ between engines is **how the muxer re-frames the packet stream and what trailing/partial frames or padding it emits**, which manifests as the probed duration of the authored output.

The single gating oracle is `property-invariant` in its probe-duration cross-container sub-mode (`src/core/oracles.ts:2709-2759`). For an authored MP3 target the oracle explicitly relaxes the band: `authoredMp3Out` (line 2738-2742) keys the tolerance off the OUTPUT container, so an MP3 elementary stream — which has no guaranteed Xing/Info TOC after authoring — is judged with `LOOSE_DURATION_ABS_SEC` (here 1.5 s), because its probed duration is frame-estimate-only (≈±2 MP3 frames of encoder-delay / partial final frame). The golden duration is 10 s (`fixtures/golden/mp3_xing.mp3.meta.json`). Within that 1.5 s band both engines pass, but the measured deltas differ:

- **ffmpeg.wasm**: `outDurationSec` = 10.031020s, `deltaSec` = **0.031020s** (measurements in shard).
- **mediabunny**: `outDurationSec` = 10.057143s, `deltaSec` = **0.057143s**.

ffmpeg's authored stream is ~26 ms closer to the source. Mechanistically: ffmpeg.wasm's mux path is a genuine `-c copy` file mux. The adapter rebuilds each track as a demuxable elementary stream in MEMFS and stream-copies it (`src/engines/ffmpeg-wasm/adapter.ts:491-495`; `mux:true` declared at `adapter.ts:1463` with the dossier `-c copy` rationale at `adapter.ts:33-34`). FFmpeg's MP3 muxer preserves the original MP3 frame boundaries one-to-one and writes no extra padding frame, so the probed duration tracks the integer-frame source length tightly. mediabunny's mux path (`src/engines/mediabunny/adapter.ts:1508-1600`) is an encoded-packet mux: it wraps each chunk in `new mb.EncodedPacket(...)` with per-packet `ptsUs/durationUs` (lines 1562-1569) and feeds an `EncodedAudioPacketSource` (line 1539), with the first packet carrying a synthesized `decoderConfig` (sampleRate/channels, lines 1582-1589). That packet-duration accounting accumulates a slightly larger duration estimate (~57 ms of effective extra frame time vs ~31 ms), which is why its probed output is marginally longer. Both are correct re-muxes; ffmpeg's is the tighter duration reconstruction, and on this codec/container the duration invariant is the only correctness signal available.

Both engines ran in-browser on Chrome 149 (Apple M1 Max). mediabunny's `env.configUsed` shows `backend: webcodecs`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false` — pure-TS, no cross-origin isolation needed, which explains its lower wall (7.465 ms) and high throughput (1339.58 x-rt). ffmpeg.wasm carries a real WASM core (peakMemory 25.26 MB sampled; mediabunny reported 0 because the mux path didn't sample peak memory). Performance therefore favors mediabunny (1.49x throughput, 0.46x... actually mediabunny did not sample peakMemory so memory is not comparable). But under the decision procedure, performance is a tiebreaker only when correctness is comparable; the duration-fidelity gap (0.0310 vs 0.0571 s) makes ffmpeg the correctness winner.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed but LOST on correctness: its authored MP3 probed duration deviated 0.0571 s from the 10 s golden, vs ffmpeg's 0.0310 s (0.54x tighter for ffmpeg). It is the performance leader (throughputRealtime 1339.58 vs 901.31 = 1.49x; wall 7.465 vs 11.095 ms), but performance is not decisive here.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'mp3'". Honest. mp4box.js is an ISO-BMFF (MP4) box parser/segmenter and genuinely cannot read a raw MP3 elementary stream as input; the declaration gap is correct, not under-declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest. The media-parser is a read/demux/probe library with no container-write (mux) capability.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest. The browser platform shim exposes WebCodecs decode/encode and decode-seek, but no native container muxer; MP3 authoring is not a platform primitive.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest. This adapter wraps WebCodecs decode/encode/convert flows and does not declare a standalone mux op.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest. As the name says, it is a demux-only WASM library; no write path.

## Anti-cheat validation

- Scenario: `src/scenarios/mux/write-targets.ts:121-129` (id `mp3_to_mp3`, `input: 'mp3_xing.mp3'`, `containersIn: ['mp3']`, `to: 'mp3'`, `audioCodecs: ['mp3']`). Built via `buildMuxAll(WRITE_TARGET_CASES)` at line 166.
- Fixture: `fixtures/media/mp3_xing.mp3` EXISTS (64 KB, real Xing-headed MP3). Golden `fixtures/golden/mp3_xing.mp3.meta.json` confirms container mp3, durationSec 10, audio mp3 44100 Hz stereo, bitrate 51158. Real media, not synthetic/mock.
- Oracle: `src/core/oracles.ts:2645` (`propertyInvariant`), probe-duration sub-mode at lines 2709-2759. It performs a REAL probe of the authored output via `ctx.referenceEngine.probe(...)` (line 2721) and compares against the golden source duration with a measured delta and a hard threshold (lines 2730, 2745-2751). Not trivially satisfiable in principle, BUT the authored-MP3 branch (lines 2738-2742) deliberately widens the band to LOOSE_DURATION_ABS_SEC = 1.5 s — both observed deltas (0.031 s, 0.057 s) sit far inside it, so the gate is permissive.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts` — `mux:true` declared at line 1463; real elementary-stream rebuild + `-c copy` file mux documented at lines 33-34 and 491-495. No canned output, no input→output copy faking, no short-circuit to golden, no error-swallowing-as-success. Genuine implementation.
- Measurements physically plausible: outDuration 10.031 s for a 10 s source with ~±2 MP3-frame estimate error is realistic (one MP3 frame at 44.1 kHz ≈ 26 ms; the 0.031 s and 0.057 s deltas are ~1–2 frame-times — exactly the expected re-framing artifact).
- Cached: BOTH PASS results have `cached: true` ("cached previous PASS result"). The evidence was reused, not re-run this session; staleness risk noted.
- Verdict: **WEAK-GATE**. The fixture is real and both implementations are genuine, but the only gate is a duration-invariant with a 1.5 s tolerance (≈15% of a 10 s clip) that is far looser than the observed deltas. There is NO packet-exact, byte-exact, or decoded-PCM oracle for this MP3 write target, so the PASS is real but not strong, and the winner margin (0.026 s) rests entirely on a metric the gate barely constrains.

## Confidence & caveats

- Confidence: medium. The PASS/NA classifications are unambiguous and the winner selection follows the decision procedure exactly (correctness before performance). The implementations and fixture are verified genuine.
- Caveat 1: the correctness margin (Δ 0.0310 s vs 0.0571 s) is tiny and both sit deep inside a deliberately loosened 1.5 s band — the winner ordering is technically correct per the ladder but practically a near-tie; a reasonable reading could call this a draw and hand it to mediabunny on its 1.49x performance lead.
- Caveat 2: all bench samples are n=1 (no spread; mad=0, p95=median), so performance numbers are single-shot and weak evidence. mediabunny's longtasks (4034 ms) vs ffmpeg's (142 ms) is a striking gap but on n=1 should not be over-interpreted; mediabunny also did not sample peakMemory.
- Caveat 3: both winners are `cached:true` — results were not re-run this session; if fixtures or adapters changed since caching, re-validation is advised (matches the known launcher stale-PASS caveat).
