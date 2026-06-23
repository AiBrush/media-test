# remux/prop_roundtrip_mp4_mkv_mp4

family: remux | fixture asset: `h264_1080p_30s.mp4` (31 MB, real H.264/AAC MP4) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- Status: **CONTESTED** — two engines passed (`ffmpeg-wasm`, `mediabunny`), both with identical, maximal correctness (property-invariant `decode(remux(x))==decode(x)`, 12/12 frame digests bit-exact, 0 mismatches).
- Decisive factor: **PERFORMANCE**, since correctness is a tie. ffmpeg-wasm wall median 180.66 ms vs mediabunny 352.97 ms.
- Margin over runner-up: **1.95x faster wall** (352.97 / 180.66) and **0.71x main-thread long-task time** (2147 ms vs 3045 ms). peakMemory was not measured for either (n=0), so memory is not a discriminator. Evidence strength is weak on n: both benches are n=1 (mad=0, p95==median).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 180.66 ms | n/a (not in bench) | 0 (n=0, unmeasured) | 2147 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 352.97 ms | n/a (not in bench) | 0 (n=0, unmeasured) | 3045 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

Note: `throughputRealtime` is not present in either engine's `bench{}` for this scenario; only `wall`, `peakMemory` (n=0), and `longtasks` were captured.

## Why the winner wins (deep technical)

This scenario re-wraps a 30 s 1080p **H.264 video + AAC audio** elementary stream from MP4 into Matroska (MKV) and (per `extraOptions.roundTrip: ['mkv','mp4']`) conceptually back to MP4. The invariant `DECODE_REMUX` (`decode(remux(x))==decode(x)`) gates that the decoded pixels of the remuxed output equal the offline golden decode of the source. Because remux is a *container rewrap with no transcode*, the H.264 access units and AAC frames must be carried byte-for-byte into the new container so that decode of the output yields identical frames. Both passing engines achieve this with a true stream-copy path, so the oracle reports `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` for both — bit-exact SHA-256 frame digests, the strongest rung on the correctness ladder (decoded-frames-bitexact via `compareDigests`, oracles.ts:1166-1207).

Since correctness is a dead tie, the decision falls to performance. ffmpeg-wasm wins by mechanism:

- **ffmpeg-wasm** (src/engines/ffmpeg-wasm/adapter.ts:2031-2069) runs a single `ffmpeg -i in -map 0 -c copy out.mkv` invocation. `-c copy` means the muxer demuxes the MP4 sample tables and re-emits the same compressed H.264 NALs and AAC frames into the Matroska SimpleBlock/Block structure with no decode/encode — pure pointer-level packet copy inside the wasm MEMFS. The `-map 0` (adapter.ts:2044) explicitly maps every input stream so neither track is dropped. There is no faststart pass for MKV (the `+faststart` branch at adapter.ts:2048-2050 only triggers for mp4/mov), so the MKV write is a straight forward-only mux. ffmpeg's mature C demux/mux pipeline compiled to wasm completes the rewrap of the 31 MB file in 180.66 ms wall with 2147 ms of long-task time.

- **mediabunny** (src/engines/mediabunny/adapter.ts:1244-1260) performs the same logical operation through its high-level `Conversion` API: `runConversion()` over an `Output` with a Matroska `OutputFormat` and a `BufferTarget`, with no video/audio transform options so encoded samples are copied (adapter.ts:1243 docstring: "Conversion with no codec/transform options copies encoded samples"). Its env shows `backend: webcodecs`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `wasmThreads: 0`. The pure-TypeScript ESM core parses and re-serializes the MP4 box tree and EBML elements in JS rather than compiled C, which is why its wall (352.97 ms) and long-task budget (3045 ms) are ~1.95x / ~1.42x larger than ffmpeg's for the identical bit-exact result. Note mediabunny did NOT need to decode here (remux is sample-copy), so the `webcodecs`/`prefer-hardware` backend tag is not the cost — the cost is the JS-side container parse/serialize throughput on a 31 MB file.

Tiebreaker considerations beyond raw wall: both ran with `coopCoep: not-required`-equivalent (mediabunny explicitly `sharedArrayBuffer:false, coopCoep:not-required, wasmThreads:0`; ffmpeg single-thread wasm), so neither carries a COOP/COEP isolation requirement and neither used WASM threads — performance parity on deployment constraints. The decisive edge is purely the 1.95x wall advantage of ffmpeg's compiled-C copy mux over mediabunny's JS box re-serializer.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on perf): equal correctness (12/12 bit-exact) but 352.97 ms wall = 1.95x slower than ffmpeg-wasm, and 3045 ms long-tasks vs 2147 ms. The pure-TS ESM container serializer is slower than ffmpeg's compiled-C `-c copy` mux for a 31 MB file. No correctness deficit — a legitimate close second.
- **platform@chrome-149**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: the WebCodecs platform baseline exposes encode/decode only, no container muxer, so it genuinely cannot remux. Not an under-declared capability.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: web-demuxer is a demux-only library (it reads packets out of containers, does not write containers), so remux is genuinely out of scope.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: media-parser is a read/parse-only library with no muxing/writing path.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare output container 'mkv'". Honest: MP4Box.js is an ISO-BMFF (MP4/MOV) toolkit only; it cannot write Matroska/EBML, so an mkv write target is correctly declared NA. (It could remux MP4->MP4, but not the mkv target this scenario requires.)
- **remotion-webcodecs@4.0.479**: NA_ENGINE — "engine does not declare output container 'mkv'". Honest: its muxer set does not include Matroska; the mkv write target is genuinely unsupported, hence a clean NA rather than a forced failure.

All five NAs are capability-honest: three lack any remux/mux operation, two lack the specific mkv (EBML/Matroska) write target. None look like an under-declared capability being dodged.

## Anti-cheat validation

- Scenario definition: src/scenarios/remux/metamorphic.ts:103-116 (`id: 'prop_roundtrip_mp4_mkv_mp4'`), built into a full case via src/scenarios/remux/_shared.ts:143 which forwards `extraOptions.roundTrip` into scenario options.
- Fixture: `input: 'h264_1080p_30s.mp4'` resolves to fixtures/media/h264_1080p_30s.mp4 — confirmed present, **31 MB** real H.264/AAC MP4 (`stat` shows 31M, 5 days old). Not synthetic/empty/mock.
- Oracle: `property-invariant` → `propertyInvariant()` src/core/oracles.ts:2645, decode-remux branch oracles.ts:2686-2707, which decodes `ctx.output` with the platform and compares SHA-256 frame digests against the offline golden decode of the source via `compareDigests` (oracles.ts:1166-1207). This is a real per-frame bit-exact hash comparison (normHex SHA-256, mismatch counting), not a loose tolerance or smoke gate. Measurements (12/12 compared, 0 mismatched, 12 golden frames) are physically plausible for a sampled 12-frame digest of a 30 s clip.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2031-2069 — genuine `ffmpeg -i in -map 0 -c copy out.mkv` via the real ffmpeg.wasm `this.run(args)`; reads output back with `readBinary`. No canned output, no input->output copy faking a transcode, no short-circuit to the golden, no error-swallow-as-success (`assertRemuxContainerCompatible` at adapter.ts:2040 would throw on an incompatible codec/container).
- Verdict: **REAL** — real 31 MB fixture, real stream-copy remux implementation calling the actual ffmpeg.wasm binary, and a meaningful bit-exact frame-digest oracle that can genuinely fail (it counts mismatches and missing frames).
- Cached note: both PASS results have `cached:true` ("cached previous PASS result"). The evidence is a reused prior run, not a fresh re-execution this cycle, so there is mild staleness risk for the exact wall/longtask numbers; per the launcher-seeding caveat, fully honest perf would need a fresh run with cache cleared.

## Confidence & caveats

- Correctness verdict (tie) is high confidence: identical strongest-rung oracle, 0 mismatches for both.
- Performance verdict (ffmpeg-wasm wins) is **medium** confidence: the 1.95x wall gap is large and consistent with the long-task gap (1.42x), but both benches are **n=1** (mad=0, p95==median), so there is no spread to confirm stability — a single-sample win is weaker evidence.
- peakMemory was unmeasured (n=0) for both, so a memory-based tiebreak could not be applied.
- Both results are `cached:true`; numbers are reused, not freshly re-run.
- The `roundTrip: ['mkv','mp4']` chain is, per the scenario notes, gated as the subset guarantee `decode(remux(x,mkv))==decode(x)` (single-remux decoded-pixel equality); the oracle does not separately verify the second mkv->mp4 hop, so the test is slightly weaker than its name implies — but still a genuine bit-exact correctness gate.
