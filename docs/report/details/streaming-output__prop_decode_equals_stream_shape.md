# streaming-output/prop_decode_equals_stream_shape

family: streaming-output | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (H.264/AVC video + AAC audio in progressive MP4, 31 MB) | primaryMetric: wall | passCount: 1 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested: **NO** — uncontested. Exactly one engine reached `status==PASS`; the other six are all `NA_ENGINE` (capability/feature not declared).
- Decisive factor: mediabunny is the **only** engine that declares all three gates this scenario requires — operation `remux`, feature `streaming:decode-equality`, and feature `target:writes` — AND implements a genuine `StreamTarget` incremental write path whose output decodes bit-exact to the source.
- Margin over runner-up: none to measure (no second PASS). Mediabunny's own numbers: wall median **715.49 ms** (n=1), longtasks **501 ms** (n=1), peakMemory unmeasured (n=0).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true | 715.49 ms | (not measured) | 0 (n=0) | 501 ms | decode(remux_stream(x))==decode(x): 12/12 frame digests bit-exact vs golden |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'streaming:decode-equality' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'streaming:decode-equality' |

## Why the winner wins (deep technical)

The operation under test is a **lossless container re-wrap of progressive H.264-in-MP4 emitted through a streaming (incremental) output target**, and the invariant asserts `decode(remux_stream(x)) == decode(x)` at the level of decoded RGBA frame digests. Passing requires three independent things to all be true: (1) the engine can actually `remux` (stream-copy encoded samples into a fresh container without re-encoding); (2) it can route output through a true incremental **StreamTarget** rather than buffering the whole file (`target:writes`); and (3) the streaming path must not drop, reorder, or corrupt samples relative to the buffered/source decode (`streaming:decode-equality`). Mediabunny is the only candidate that declares and implements all three.

Mechanistically, mediabunny's remux goes through its `Conversion` API with **no codec/transform options**, which is documented in the adapter as a pure encoded-sample copy: `remux()` at `src/engines/mediabunny/adapter.ts:1244-1260` builds an `OutputFormat` for the requested container, opens the input, then calls `runConversion(...)` (`adapter.ts:842-848`). Because no `video`/`audio` transform is attached, the H.264 access units and AAC frames are copied byte-for-byte into the new `moov`/`mdat` — there is no decode/encode round-trip, so the decoded frames are necessarily identical to the source.

The *stream-shape* specificity comes from `instrumentedOutputTarget()` at `src/engines/mediabunny/adapter.ts:767-817`. When `opts.target === 'stream'` (the shape knob from the scenario, `shape: { container: 'mp4', target: 'stream' }`, metamorphic.ts:56) the adapter constructs a real `WritableStream<StreamTargetChunk>` and wraps it in `new mb.StreamTarget(writable)` (`adapter.ts:801`). Each incremental write is captured with its absolute `chunk.position` and length (`adapter.ts:787-792`), `targetWrites` is incremented per write, and on `close()` the chunks are re-assembled by position into a contiguous `Uint8Array` of length `maxEnd` (`adapter.ts:805-807`). This is the genuine streaming write path the scenario notes describe ("the bytes leave incrementally") — not a `BufferTarget` shortcut (the buffer branch is the separate fallback at `adapter.ts:819-838`). The reassembled bytes are then handed to the oracle as `ctx.output`.

The gating oracle is `property-invariant` routed to the **decode-remux** branch (`src/core/oracles.ts:2686-2707`): because the invariant token contains "decode"/"remux", it decodes the engine's `ctx.output` with the platform decoder (`ctx.decodeWithPlatform`, oracles.ts:2697) and compares the resulting RGBA frame digests against the **baked golden** `decode(x)` (`fixtures/golden/h264_1080p_30s.mp4.frames.json`, which holds 12 real browser-produced sha256 frame digests, `pending:false`). The shard measurement is unambiguous: `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` — i.e. all 12 decoded frames of the stream-target output are **bit-identical** to the source decode. This is the strongest correctness class on the ladder for this scenario (structural/property-invariant against a real per-frame golden, not an ssim-psnr proxy and not a playback-smoke gate).

Backend: `env.configUsed` shows `backend:"webcodecs"`, `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `wasmThreads:0`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`. So the (decode side of the) verification ran on hardware WebCodecs on an Apple M1 Max with no COOP/COEP requirement, and the remux itself is a pure-TS ESM core copying encoded packets — explaining the modest 715.49 ms wall for re-wrapping a 31 MB / 30 s clip.

## What each other framework did wrong

- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest NA — raw browser APIs cannot losslessly rewrap encoded samples into a container; the adapter explicitly throws `NotApplicableError('remux', ...)` at `src/engines/platform/adapter.ts:356`. No muxer, so no streaming-output shape to test.
- **ffmpeg.wasm@0.12.15** — `NA_ENGINE`: "engine does not declare feature 'target:writes'". Honest NA. ffmpeg.wasm can remux and even declares `streaming:decode-equality` (`src/engines/ffmpeg-wasm/adapter.ts:1502`), but it writes output to a MEMFS virtual file and reads the whole file back — it has no native incremental StreamTarget, so it cannot satisfy the `target:writes` gate this stream-shape scenario requires. Correctly excluded rather than faking incremental writes.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare feature 'streaming:decode-equality'". Honest NA. mp4box declares `remux:true` (`src/engines/mp4box/adapter.ts:640`) but only to FRAGMENTED MP4 (fMP4/CMAF via setSegmentOptions/onSegment, header at adapter.ts:10); it never produces decodable pixels itself and does not claim decode-equality for a progressive stream-target re-wrap. Capability boundary is documented as a true NA, not a hidden feature.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest NA — a demux-only library; it parses/extracts packets but has no muxer/output-target, so it cannot produce a remuxed stream output.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest NA — a parser/probe library, no muxing/output path.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare feature 'streaming:decode-equality'". Honest NA — it can transcode via WebCodecs but does not declare lossless stream-shape decode-equality for a pure remux, so it is gated out rather than asserting an invariant it does not guarantee.

All six NAs are at the declaration/gating layer (`oracleOutcomes:[]`, no measurements), and each maps to a real capability gap in the adapter — none looks like an under-declared capability being hidden to dodge a hard test.

## Anti-cheat validation

- Scenario definition: `src/scenarios/streaming-output/metamorphic.ts:48-62` (id `prop_decode_equals_stream_shape`, invariant token `decode(remux(x))==decode(x)`, `shape: { container: 'mp4', target: 'stream' }`).
- Fixture asset: `fixtures/media/h264_1080p_30s.mp4` — **exists**, 31 MB real H.264/AAC progressive MP4 (stat confirmed). Not synthetic/empty/mock.
- Golden: `fixtures/golden/h264_1080p_30s.mp4.frames.json` — `pending:false`, 12 real browser-produced sha256 RGBA frame digests with width/height 1920×1080 and per-frame keyframe flags. This is `decode(x)` baked offline, exactly what the oracle compares against.
- Gating oracle: `src/core/oracles.ts:2686-2707` (property-invariant → decode-remux branch). It performs a REAL decode of the engine output via the platform decoder and a digest-by-digest comparison against the golden frames (`compareDigests`). It is not trivially satisfiable: an empty/identity/canned output would mismatch the 12 baked sha256 digests and FAIL. It is NOT an ssim-psnr proxy and NOT smoke-only.
- Winner adapter: remux `src/engines/mediabunny/adapter.ts:1244-1260`; streaming target `adapter.ts:767-817` (real `mb.StreamTarget(writable)` with positional reassembly). The output is genuinely produced by the library, not copied from input or short-circuited to the golden; errors propagate (it throws on missing buffer / unknown container) rather than being swallowed into a false success.
- Measurements plausibility: 12/12 frames, 0 mismatched, on a 1920×1080 30 s clip; wall 715.49 ms and 501 ms longtasks for a 31 MB re-wrap are physically reasonable for a pure-TS sample copy. All consistent.
- Cached: shard entry has no `cached:true` flag (it carries `startedAtIso` and `durationMs:5315`), so this is a fresh run — no staleness risk.
- Verdict: **REAL** — real fixture + real StreamTarget implementation + meaningful per-frame bit-exact oracle against a non-placeholder golden.

## Confidence & caveats

- Confidence: **high** for the verdict (single PASS, strong oracle, real fixture/golden, real adapter path).
- Caveats: (1) bench has n=1 (no spread, mad=0, p95==median) so the 715.49 ms / 501 ms figures are single-sample timing, weak as *performance* evidence — but performance is irrelevant here since the win is uncontested on correctness eligibility. (2) peakMemory was not captured (n=0). (3) The win is partly a *capability* win: six engines are NA at the gate, so this scenario primarily demonstrates that only mediabunny offers a true incremental StreamTarget remux that preserves decode-equality, rather than a head-to-head correctness contest. (4) decode-equality is verified by the *platform* decoder against the golden, so it transitively trusts the platform WebCodecs decode path being deterministic (which the golden was baked with).
