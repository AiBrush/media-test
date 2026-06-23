# remux/prop_rotation_survives_mp4_mov

family: remux | fixture asset: `fixtures/media/h264_rotated90.mp4` (4.4 MB, H.264 1280x720@30fps + AAC 48kHz stereo, 10s, 90deg display matrix) | primaryMetric: wall | passCount: 2

## Verdict

**Best framework: ffmpeg.wasm@0.12.15** — CONTESTED (2 of 7 engines PASS: ffmpeg-wasm and mediabunny).

Both PASS engines satisfied the SAME single gating oracle — `property-invariant` (decode-remux), 12/12 frame digests bit-exact vs golden — so correctness strength is a tie. The decision falls to performance. **Decisive factor: primaryMetric `wall`.** ffmpeg-wasm's wall median is **40.56 ms vs mediabunny's 106.74 ms = 2.63x faster wall**.

Caveat that materially weakens the win: mediabunny beats ffmpeg-wasm on the two secondary metrics — **peakMemory 51.7 MB vs 99.8 MB (mediabunny 0.52x)** and **longtasks 2147 ms vs 5077 ms (mediabunny 0.42x main-thread blocking)**. Both engines have n==1 (mad==0, no spread), so the wall margin rests on a single sample and is weaker evidence than a multi-sample win would be.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass (12/12 bit-exact) | 40.56 ms | n/a | 99,806,384 B (99.8 MB) | 5077 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass (12/12 bit-exact) | 106.74 ms | n/a | 51,666,281 B (51.7 MB) | 2147 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

(No `throughputRealtime` metric was recorded in the bench block for either PASS engine for this scenario; the bench carries `wall`, `peakMemory`, and `longtasks` only.)

## Why the winner wins (deep technical)

The operation is a **lossless container change MP4 -> MOV with stream copy** of an H.264 video track carrying a **90deg display/rotation matrix** in its `tkhd`. The gating contract (`src/scenarios/remux/metamorphic.ts:142-153`) deliberately does NOT probe the matrix value directly — the scenario `notes` explain a rotation-VALUE probe is not expressible in `oracles.ts` today, so it gates the **observable effect**: a dropped or mishandled display matrix would change the decoded presentation, producing a frame-digest mismatch. The golden (`fixtures/golden/h264_rotated90.mp4.frames.json`, `pending:false`) is `decode(x)` baked offline by the platform engine into normalized RGBA sha256 digests; the oracle decodes `decode(remux(x))` with the platform decoder and requires every digest equal (`src/core/oracles.ts:2686-2707` -> `compareDigests` at `:1166-1207`). The shard records `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` for both PASS engines — i.e. the rotated presentation survived bit-for-bit through the MP4->MOV rewrap.

ffmpeg-wasm's remux path (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) is a true `-map 0 -c copy` stream copy: it maps every input stream (so audio is not dropped), copies encoded H.264/AAC samples without re-encode, and because the target is `mov` it takes the MP4/MOV branch adding `-movflags +faststart` (`:2045-2050`). FFmpeg's `mov`/`mp4` muxer carries the source track's display matrix (`tkhd` matrix) across a `-c copy` rewrap, so the rotation is preserved structurally — the decoded digests then match the rotated golden. The win on the primary metric is mechanistic: ffmpeg.wasm is doing a **pure byte-level sample copy through MEMFS**, no decode/encode and no per-frame WebCodecs round-trip, so its measured `wall` execution (40.56 ms) is just the demux+remux copy. That is 2.63x faster than mediabunny's 106.74 ms.

mediabunny's remux (`src/engines/mediabunny/adapter.ts:1244-1260`) also stream-copies encoded samples via `runConversion` with no codec options, on the WebCodecs/`streaming-lockstep` backend (`env.configUsed.backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `hwAccel:"prefer-hardware"`, `coopCoep:"not-required"`, `wasmThreads:0`). Its streaming/WebCodecs orchestration carries more per-call overhead for a 10s clip, hence the higher wall. But the same architecture is why it wins the secondary metrics decisively: it does NOT load a multi-megabyte single-threaded wasm core into a flat heap, so peakMemory is roughly half (51.7 MB vs 99.8 MB), and its work is chunked off the main thread, giving 2147 ms of longtasks vs ffmpeg-wasm's 5077 ms — ffmpeg.wasm's single-threaded wasm blocks the main thread ~2.4x longer. If the family primaryMetric were peakMemory or longtasks rather than wall, mediabunny would win.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed with identical correctness (12/12 bit-exact). Lost only on the primary metric: wall 106.74 ms vs 40.56 ms (2.63x slower). It actually leads on peakMemory (0.52x) and longtasks (0.42x); the loss is purely the wall tiebreak, on n==1 evidence.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mov'". Honest NA — MP4Box.js writes ISO-BMFF (.mp4) and does not declare a QuickTime/`mov` write target; the scenario requires `to:'mov'`.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mov'". Honest NA — same missing `mov` output capability.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — web-demuxer is a demux-only library; it has no muxer/remux op.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — the raw browser platform exposes WebCodecs decode/encode but no container remux primitive.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA — media-parser is a parser/reader, not a muxer.

All five NAs are capability-honest, not under-declared: a container-rewrap to `mov` genuinely requires a muxer with a QuickTime write target plus a declared `remux` op, which only ffmpeg-wasm and mediabunny provide.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/metamorphic.ts:142-153` (id `prop_rotation_survives_mp4_mov`, invariant `DECODE_REMUX`, input `h264_rotated90.mp4`, from `mp4` to `mov`).
- **Fixture:** `fixtures/media/h264_rotated90.mp4` EXISTS — 4.4 MB real H.264+AAC file (meta golden confirms 1280x720@30fps H.264, AAC 48kHz stereo, 10s). Not synthetic/empty/mock.
- **Gating oracle:** `property-invariant` (decode-remux branch) `src/core/oracles.ts:2686-2707`, comparison core `compareDigests` `src/core/oracles.ts:1166-1207`. It decodes the engine's actual output with the platform decoder and requires sha256-equality of normalized RGBA frames against the golden `decode(x)`. Golden `fixtures/golden/h264_rotated90.mp4.frames.json` has `pending:false` and real per-frame sha256 hashes (e.g. frame 0 `f3b50c8e...`, frame 1 `1262557b...`). This is a strict bit-exact gate, not a loose/proxy/smoke gate; measurements (12 frames, 0 mismatches) are physically plausible for a 30fps clip windowed to 12 frames.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069`. Genuine `-map 0 -c copy` stream copy through MEMFS via the real ffmpeg.wasm core; no canned output, no input->output passthrough fake, no short-circuit to golden, errors propagate (no swallow).
- **Cached note:** ffmpeg-wasm result has `cached:true` ("cached previous PASS result"); mediabunny also `cached:true`. Both bench rows were REUSED, not freshly re-run this session — staleness risk applies to BOTH the winner's metrics and the correctness verdict. Per the launcher seeding caveat, a fully honest head-to-head would require clearing raw + .browser-cache and re-running both.
- **Verdict: REAL.** Real fixture, real ffmpeg.wasm stream-copy implementation, strict bit-exact frame-digest oracle that survived rotation. The only reservations are evidentiary (cached + n==1), not integrity.

## Confidence & caveats

- **Confidence: medium.** The PASS/correctness verdict is strong (bit-exact, real fixture, real code). The WINNER SELECTION is weaker because: (1) both PASS engines are tied on correctness, so the choice hinges entirely on the `wall` primary metric; (2) both bench numbers are n==1 (mad==0) and `cached:true`, so the 2.63x wall margin is a single stale sample; (3) mediabunny wins both secondary metrics (peakMemory 0.52x, longtasks 0.42x) — under a memory- or responsiveness-weighted policy the winner flips to mediabunny.
- No `throughputRealtime` was recorded for this scenario, so that ladder rung could not be used.
- If re-run fresh, re-verify the wall ordering before treating ffmpeg-wasm as the definitive winner.
