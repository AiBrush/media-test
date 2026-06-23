# mux/mp4_streaming_target

family: mux | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264 1080p + AAC, ~31 MB, ISO-BMFF) | primaryMetric: targetWrites | passCount: 1/7

## Verdict
- Best framework: **mediabunny@1.48.0** (uncontested — the only PASS).
- Contested: NO. The other 6 engines never ran an oracle; all returned NA at capability-gate time.
- Decisive factor: mediabunny is the only engine that declares BOTH the `mux` operation AND the `target:writes` feature, so it is the only one eligible to be exercised on an incremental MP4 streaming-write target. It then passed both attached oracles (reference-reimport + property-invariant probe-duration).
- Margin over runner-up: N/A — no second engine produced any oracle outcome. The win is on eligibility + correctness, not on a performance margin.

## Per-engine results
| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass, property-invariant:pass | 66.845 ms | 448.799 x-realtime | 167,548,412 B (~159.8 MB) | 185 ms | — (targetWrites=122, bytesOut=31,242,391) |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |

(Bench n=1, warmup=1, mad=0 for all metrics → single-sample evidence; see caveats.)

## Why the winner wins (deep technical)
The scenario is the mux WRITE sub-mode "streaming target" (`src/scenarios/mux/output-modes.ts:46-60`): take already-encoded H.264 video + AAC audio tracks and **author** a brand-new MP4 sample table incrementally, emitting the file as many small writes rather than one buffer-then-flush. The primary metric `targetWrites` is precisely the discriminator — a true incremental writer reports many writes, a buffer-then-flush writer reports ~1. mediabunny reported **targetWrites=122** and **bytesOut=31,242,391** (~29.8 MB), i.e. it genuinely streamed the ISO-BMFF box stream out in 122 chunks while authoring a ~30 MB file.

Mechanism: mediabunny's mux path (`src/engines/mediabunny/adapter.ts:1508`) builds an `mb.Output` whose target comes from `instrumentedOutputTarget` (`adapter.ts:767`). For `opts.target === 'stream'` (this case set `extraOptions:{ target:'stream' }`) it constructs a real `mb.StreamTarget(writable)` backed by a `WritableStream` whose `write(chunk)` callback (`adapter.ts:787-792`) increments `targetWrites` for every box/segment the muxer flushes and records `{position,data}`. This is the native streaming write path, not a wrapper around a single final buffer — which is exactly why targetWrites is 122 and not 1 (contrast the BufferTarget path at `adapter.ts:819` that the progressive baseline uses). Each EncodedTrack's packets are fed via real `mb.EncodedVideoPacketSource` / `mb.EncodedAudioPacketSource` (`adapter.ts:1528,1539`), packets re-wrapped as `mb.EncodedPacket(data, key|delta, ptsUs/1e6, durationUs/1e6, seqIdx)` (`adapter.ts:1562`), with the decoder config (codec param, dimensions / sampleRate+channels, description box) carried on the first packet (`adapter.ts:1571-1590`) so the muxer can author the codec-private boxes (avcC / esds) correctly. The backend (`env.configUsed`) is `backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `coopCoep:"not-required"`, `sharedArrayBuffer:false` — pure-TS muxing, no COOP/COEP, no wasm threads.

Correctness — both attached oracles passed:
- **reference-reimport** (`src/core/oracles.ts:1225`): the reference engine re-demuxed mediabunny's authored MP4 and recovered a non-empty packet table of **2308 packets / 1423 keyframes**. Because `op==='mux'` (not remux), it then compared against the golden packet table (`fixtures/golden/h264_1080p_30s.mp4.packets.json`, 264 KB present) with a 2% relative tolerance on both packet count and keyframe count (`oracles.ts:1258-1263`). It passed, meaning the authored sample table round-trips to within 2% of the source structure — the muxed boxes (stsz/stco/stss/ctts) are well-formed and the H.264 key/delta classification survived.
- **property-invariant** (probe-duration variant, `oracles.ts:343`/`619`): out duration **30.0213s** vs golden **30.0000s**, Δ **0.0213s ≤ tolerance 0.0417s** (≈ ±1 frame @ 24 fps, `oracles.ts:159`). The authored MP4's mvhd/tkts/mdhd timescale + edit-list math reproduced the source duration to within one frame.

So the win is: only-eligible engine + a real native streaming-write implementation + two faithful structural/metadata oracles passing on real numbers.

## What each other framework did wrong
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'mux'". remotion-media-parser is a read/parse-only library; it has no muxer, so the NA is honest (it cannot author an MP4 sample table from encoded tracks).
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare operation 'mux'". This engine wraps WebCodecs for transcode/convert; it does not expose a raw `mux` (pack-already-encoded-tracks) op. Honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'mux'". web-demuxer is, by name and scope, a demux-only wasm wrapper. Honest NA.
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'mux'". The bare browser/WebCodecs platform has decoders/encoders but no container muxer (WebCodecs deliberately omits muxing). Honest NA — no native MP4 writer exists in the platform.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare feature 'target:writes'". mp4box CAN author MP4 boxes, but it did not declare the `target:writes` capability that this streaming sub-mode gates on (it has no instrumented incremental StreamTarget telemetry path in the adapter). The NA is at the feature level, not the op level — looks honest given the adapter doesn't expose per-write streaming telemetry, though mp4box's segmentation API could in principle support it (mildly under-declared, but defensible).
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "does not declare feature 'target:writes'". ffmpeg.wasm muxes via its in-memory MEMFS and returns one final file blob; it has no incremental-write callback to report targetWrites, so declaring `target:writes` would be dishonest. Honest NA for the streaming-write discriminator.

## Anti-cheat validation
- Scenario: `src/scenarios/mux/output-modes.ts:46-60` (id `mp4_streaming_target`, `extraOptions:{ target:'stream' }`, primaryMetric `targetWrites`, built via `buildMux` from `src/scenarios/mux/_shared.ts`).
- Fixture: `fixtures/media/h264_1080p_30s.mp4` — EXISTS, ~31 MB real H.264+AAC ISO-BMFF (stat confirmed). Real media, not synthetic/mock. Golden `fixtures/golden/h264_1080p_30s.mp4.packets.json` (264 KB) and `.meta.json` exist, so reference-reimport had a genuine baseline.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1508` (`mux`) + `adapter.ts:767-816` (`instrumentedOutputTarget` real StreamTarget/WritableStream). No canned output, no input→output copy (it authors fresh boxes from EncodedPacketSources), no short-circuit to golden, no error-swallow (errors throw; `close()` in finally). targetWrites=122 and bytesOut≈29.8 MB are physically plausible for incrementally writing a 30 MB MP4.
- Oracle: `src/core/oracles.ts:1225` (reference-reimport, real re-demux + 2% golden compare on counts) and `oracles.ts:619`/`343` (property-invariant probe-duration, ±1-frame tolerance). Neither is smoke-only; both perform real comparisons against golden/re-imported data. Measurements (2308 pkts, 1423 kf, Δ0.0213s) are consistent with the 30 s 1080p source.
- cached: field absent (undefined) → result was freshly run, not reused. No staleness risk.
- Verdict: **REAL** — real fixture, genuine native streaming-mux implementation, meaningful structural+metadata oracles with plausible measured numbers.

## Confidence & caveats
- Confidence: HIGH on the verdict (uncontested, all code/fixtures inspected, oracles faithful).
- Caveat 1: All bench metrics are n=1 (warmup=1, mad=0). The wall=66.8 ms / 448.8x-realtime / 159.8 MB peak figures are single-sample and carry no spread; treat performance numbers as indicative only. This doesn't affect the correctness-based win.
- Caveat 2: The win is by eligibility — six engines were gated out before running. The streaming-target sub-mode is genuinely niche (incremental MP4 authoring with write telemetry), so a one-engine PASS is expected, not a red flag. mp4box's NA is the only mildly arguable one (its API could plausibly support segment-level writes), but the adapter's lack of a `target:writes` telemetry path makes the NA defensible.
- Caveat 3: This is a structural/metadata-strength PASS (reference-reimport + probe-duration), not bit-exact; it proves the authored sample table round-trips and the duration is frame-accurate, not that decoded pixels are byte-identical.
