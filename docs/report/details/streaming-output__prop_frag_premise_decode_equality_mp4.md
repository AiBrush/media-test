# streaming-output/prop_frag_premise_decode_equality_mp4

**Family:** streaming-output | **Fixture asset:** `h264_1080p_30s.mp4` (H.264 High @ 1080p + AAC, 31,258,790 bytes) | **Primary metric:** wall (default = metrics[0]) | **passCount:** 2 of 7

This is a metamorphic property case: `op:'remux'` to a plain buffered MP4 (`shape={container:'mp4', target:'buffer'}`), gated by the `property-invariant` oracle with `invariant='decode(remux(x))==decode(x)'`. It proves the lossless-sample-copy premise that the fragmented/CMAF path depends on: a plain MP4 rewrap must preserve every decoded frame bit-for-bit. (Authored against the non-fragmented buffer shape because the platform inline MP4 demux is progressive-only and cannot parse `moof` — see scenario header `fragmented-faststart.ts:16-19`.)

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (2 PASS: mediabunny, ffmpeg.wasm).
- **Decisive factor: PERFORMANCE.** Both engines are tied on correctness (both pass the SAME single oracle, `property-invariant`, with identical 12/12 bit-exact frames, 0 mismatches). The tie is broken on wall median.
- **Margin over runner-up:** mediabunny 306.90ms vs ffmpeg.wasm 506.55ms wall = **1.65x faster wall** (Δ ≈ 199.65ms). Both are n==1 single-sample runs (mad=0, p95==median), so the magnitude is weak statistical evidence, but the ~200ms gap is structurally expected (in-browser WebCodecs/TS muxer vs wasm boot + MEMFS round-trip). Secondary tiebreakers also favor mediabunny: WebCodecs backend with `hwAccel:prefer-hardware`, `coopCoep:not-required`, `sharedArrayBuffer:false`, single-pass streaming pipeline — vs ffmpeg.wasm's monolithic wasm core. (Caveat: mediabunny logs far higher longtasks, 3045ms vs 403ms — main-thread blocking — but longtasks is not the primary metric and wall already captured total cost.)

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | property-invariant:true | 306.90ms | (not measured) | 0 (n=0) | 3045ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 506.55ms | (not measured) | 0 (n=0) | 403ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'streaming:decode-equality' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'streaming:decode-equality' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

(throughputRealtime / peakMemory not present in the shard bench block for either engine — peakMemory has n=0 samples; only wall and longtasks were sampled for this metamorphic case, which deliberately keeps metrics minimal per `_shared.ts:278`.)

## Why the winner wins (deep technical)

The operation is a **lossless stream-copy remux of H.264 (in `avc1`/AVCC) + AAC out of MP4 and back into a fresh buffered MP4**, then a WebCodecs decode of the output compared frame-by-frame against 12 baked golden RGBA SHA-256 digests. Because it is a pure rewrap (no re-encode), *both* PASS engines necessarily produce identically-decoding coded samples — that is the whole point of the metamorphic, and it is exactly what the measurements show: `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` for BOTH. So correctness cannot separate them; the separator is how each engine produces those bytes.

**mediabunny (winner)** runs its real conversion pipeline: `remux()` builds an `Output` with the MP4 format and an instrumented target, then `runConversion()` calls `Conversion.init(opts)` and `conversion.execute()` (`src/engines/mediabunny/adapter.ts:1250-1256`, `:842-855`). Per `env.configUsed`, it ran on `backend:"webcodecs"` with `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`. For a stream-copy remux mediabunny does not need to decode/re-encode the elementary stream — it parses the source `moov` sample tables and re-emits the same coded packets into a new ISOBMFF layout in pure-TS in a single pass. There is no wasm module to instantiate and no MEMFS file marshalling, which is why wall lands at 306.90ms. The decode side of the oracle (run by the platform WebCodecs path, `decodeWithPlatform`, oracles.ts:2697) hits the GPU/hardware H.264 decoder and produces RGBA digests that match the golden exactly.

**ffmpeg.wasm (runner-up)** does the genuine equivalent with FFmpeg semantics: `ffmpeg -i in -map 0 -c copy out.mp4` (`src/engines/ffmpeg-wasm/adapter.ts:2044`), and since `opts.fastStart` is undefined and not `false`, it adds `-movflags +faststart` (`:2048-2049`) — a correct, lossless faststart MP4. This is a real stream copy (`-c copy`, no re-encode), so it also yields 12/12 bit-exact frames. But it pays the wasm tax: writing the 31MB input into MEMFS (`writeInput`), running `ffprobe`-style info parsing (`runInfo`), executing the muxer, then reading the output back out (`readBinary`). That marshalling and the wasm execution path is why wall is 506.55ms — 1.65x slower. Notably ffmpeg.wasm's longtasks is *lower* (403ms vs 3045ms), so mediabunny is more main-thread-bursty; but total wall (the primary metric) still favors mediabunny by ~200ms.

The decisive mechanism: for a **plain H.264/AAC MP4→MP4 rewrap**, mediabunny's in-process pure-TS muxer + hardware-WebCodecs decode avoids the wasm-core instantiation and MEMFS copy-in/copy-out that FFmpeg.wasm cannot skip, and it does so without requiring COOP/COEP or SharedArrayBuffer. Same correctness, lower latency, fewer deployment constraints.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (genuine `-c copy +faststart` remux, 12/12 bit-exact), but LOST on wall: 506.55ms vs 306.90ms (1.65x slower, Δ199.65ms). Loss is the wasm boot + 31MB MEMFS write/read round-trip vs mediabunny's single-pass pure-TS path. (It does win longtasks 403ms vs 3045ms, but longtasks is not the primary metric.)
- **platform@chrome-149** — NA_ENGINE, "engine does not declare operation 'remux'". HONEST: the platform engine is a WebCodecs decode/demux/probe shim (demux-mp4/webm, decode, probe, transcode) with no muxer; it cannot emit a remuxed container. Genuine non-declaration, not a hidden capability.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare feature 'streaming:decode-equality'". HONEST: MP4Box.js can segment/repackage MP4 but does not provide an in-engine decode path to satisfy `decode(remux(x))==decode(x)`; declaring the feature would be a false claim. Honest gate.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "engine does not declare feature 'streaming:decode-equality'". HONEST: it declares decode/transcode WebCodecs capabilities but not this specific metamorphic feature token; reasonable non-declaration for a decode-equality-over-remux invariant.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'remux'". HONEST: web-demuxer is a demux-only wasm wrapper (no muxer/encoder), so it legitimately has no remux op.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'remux'". HONEST: media-parser is a parser/probe library (no output muxing), so no remux op exists to declare.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/streaming-output/fragmented-faststart.ts:86-103` (case `prop_frag_premise_decode_equality_mp4`), built via `buildStreamProperty` in `_shared.ts:261-283`. `invariant:'decode(remux(x))==decode(x)'`, `shape:{container:'mp4', target:'buffer'}`, oracle = `['property-invariant']`.
- **Fixture exists and is REAL:** `fixtures/media/h264_1080p_30s.mp4`, 31,258,790 bytes (stat confirmed) — a genuine 30s 1080p H.264+AAC asset, not synthetic/empty/mock.
- **Golden is REAL, not pending:** `fixtures/golden/h264_1080p_30s.mp4.frames.json` has `pending:false` and 12 fully-baked frame entries, each a 64-hex SHA-256 of normalized RGBA at 1920x1080, baked by the platform engine in a real browser (`bakedAtIso:2026-06-18`). Plausible: monotonic ptsUs at 30fps (0, 33333, 66667, ... 366667), frame 0 keyframe, rest non-keyframe — physically consistent with a 1080p30 H.264 GOP.
- **Oracle is REAL and strict:** `src/core/oracles.ts:2645` (`propertyInvariant`), decode-remux branch `:2686-2707` decodes `ctx.output` via `decodeWithPlatform` and calls `compareDigests` (`:1166-1207`). The comparison is **exact SHA-256 string equality** (`normHex(g.sha256) !== normHex(w.sha256)`) with NO numeric tolerance — any single differing byte in any decoded frame fails. Not a wide-tolerance/SSIM/smoke gate. Measurements (12/12 compared, 0 mismatched) are physically plausible for a lossless rewrap.
- **Winner implementation is REAL:** mediabunny `remux()` `src/engines/mediabunny/adapter.ts:1244-1260` → `runConversion` `:842-855` calls real `Conversion.init` + `conversion.execute()`. No canned output, no input→output copy, no short-circuit to golden, no swallowed errors (errors throw). The `-c copy` runner-up path (`ffmpeg-wasm/adapter.ts:2044`) is likewise a genuine stream copy.
- **Verdict: REAL.** Real 31MB fixture + real baked goldens + genuine library remux + strict bit-exact oracle.
- **Cached note:** BOTH PASS results have `cached:true` ("cached previous PASS result"). The numbers were reused, not re-run this pass, so the 306.90ms / 506.55ms wall figures carry staleness risk. The PASS verdict itself (bit-exact 12/12) is deterministic for a lossless rewrap and robust to caching; the *timing margin* is the part most exposed to stale reuse.

## Confidence & caveats

- **Confidence: high** on the winner (correctness tie + real implementations + strict oracle; the only differentiator is wall, where mediabunny clearly leads 1.65x).
- Caveats: (1) both wall figures are **n==1** (single sample, mad=0) and **cached==true** — the margin is directionally reliable but not statistically tight. (2) `peakMemory`/`throughputRealtime` were not sampled (n=0 / absent), so the buffer-vs-stream memory discriminator could not corroborate the win. (3) mediabunny's longtasks (3045ms) is far worse than ffmpeg.wasm's (403ms) — if the leaderboard later weights main-thread responsiveness, that nuance matters, but wall remains the primary metric here. (4) Correctness is genuinely tied; the win rests entirely on performance.
