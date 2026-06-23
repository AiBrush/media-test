# robustness/prop_decode_remux_eq_decode_mp4_mkv

family: robustness | fixture asset: `h264_1080p_30s.mp4` (H.264 1080p30 + AAC 48k stereo, 30s, ~31MB) | output container: MKV | primaryMetric: (none recorded in shard) | passCount: 2 / 7

Metamorphic invariant under test: `decode(remux(x)) == decode(x)` — a lossless MP4→MKV container change must not alter a single decoded pixel. The oracle decodes the candidate's MKV output and compares per-frame SHA-256 digests against goldens baked from `decode(x)`.

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Co-passer: ffmpeg.wasm@0.12.15 (also 12/12 bit-exact).
- Decisive factor: **correctness is a tie** (both produce 12/12 frame digests bit-exact vs golden, 0 mismatches), so the decision falls to performance + backend tiebreakers. mediabunny wins on wall time and on backend quality: `durationMs` 553 vs 675 (≈**1.22x faster wall**), running the decode leg on the **WebCodecs hardware path** (`backend:"webcodecs"`, `hwAccel:"prefer-hardware"` on Apple M1 Max) with **no COOP/COEP requirement** (`coopCoep:"not-required"`, `sharedArrayBuffer:false`), whereas ffmpeg.wasm is single-threaded wasm (`wasmThreads:0` is not even reported; it is a pure-wasm transcoder).
- Margin over runner-up: 1.22x wall (553ms vs 675ms). Caveat: both results are `cached:true`, and the shard carries NO `bench{}` block (no median/p95/mad/n), so the wall figure is a single cached `durationMs`, not a benchmarked median — weak performance evidence. The backend tiebreaker (hardware WebCodecs + no cross-origin-isolation requirement) is the more durable discriminator.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass (12/12 bit-exact) | 553 | n/a (no bench) | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass (12/12 bit-exact) | 675 | n/a (no bench) | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

No `bench{}` object is present for any engine in this shard; the only timing datum is `durationMs` (both cached). throughputRealtime/peakMemory/longtasks were not recorded for this scenario.

## Why the winner wins (deep technical)

The operation is a pure container rewrap: H.264 (avc1) + AAC elementary streams are lifted out of the ISO-BMFF `moov`/`mdat` structure and re-laid into a Matroska/EBML Segment with new Cluster/SimpleBlock framing. Because no re-encode happens, the coded video bytes that reach the decoder must be byte-identical to those in `x`; therefore `decode(remux(x))` must reproduce the exact same reconstructed pixels as `decode(x)`. The golden (`fixtures/golden/h264_1080p_30s.mp4.frames.json`) holds 12 frames at 1920x1080 with per-frame SHA-256 digests (frame 0 is a keyframe, pts 0). Both winners satisfied the invariant with `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` — a true bit-exact match, the strongest rung on the correctness ladder (decoded-frames-bitexact class).

mediabunny performs a genuine conversion, not a byte copy. `remux()` (`src/engines/mediabunny/adapter.ts:1244`) builds a real Matroska `Output` via `makeOutputFormat(opts.container, ...)`, opens the MP4 with `openInput()` (line 1252), wraps the output target in `instrumentedOutputTarget()` (line 1254), constructs `new this.lib.Output({format, target})` (line 1255), and drives `runConversion()` (line 1256) — mediabunny's `Conversion` engine that demuxes the MP4 packets and remuxes them into EBML clusters. The decode leg the oracle runs against that MKV uses the WebCodecs hardware decoder (`env.configUsed.backend:"webcodecs"`, `pixelBackend:"VideoSample.copyTo(RGBA)>canvas"`, `hwAccel:"prefer-hardware"`), so the H.264 stream is decoded on the Apple M1 Max's hardware AVC decoder. Critically, mediabunny needs no cross-origin isolation (`coopCoep:"not-required"`, `sharedArrayBuffer:false`), `coreBuild:"pure-ts-esm"` — it carries no large wasm core, giving it both the lighter deployment footprint and the 553ms wall.

ffmpeg.wasm produces the identical bit-exact result by a different, equally legitimate mechanism: `remux()` (`src/engines/ffmpeg-wasm/adapter.ts:2031`) runs `-i <in> -map 0 -c copy <out.mkv>` (line 2044) — an explicit-mapping stream copy that rewraps every track without re-encoding, after `assertRemuxContainerCompatible()` confirms H.264/AAC are legal in Matroska. This is the canonical lossless remux, so its decoded frames also match golden 12/12. It loses only on the secondary axes: 675ms wall (1.22x slower) and a single-threaded wasm core versus mediabunny's hardware WebCodecs decode — and ffmpeg.wasm typically wants SharedArrayBuffer/COOP-COEP for its threaded builds, a heavier deployment constraint.

Because the two correctness signatures are indistinguishable (same oracle, same 12/12, same 0 mismatches), the tiebreaker rule (4b→4c) selects mediabunny: faster cached wall AND the preferred hardware-WebCodecs, no-cross-origin-isolation, smaller-core backend.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed correctly (12/12 bit-exact via `-c copy` MKV rewrap) but lost the tiebreaker: 675ms vs 553ms (0.82x the speed of mediabunny) and a single-thread wasm core instead of hardware WebCodecs. Real implementation, just not the fastest/lightest.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: the raw browser platform engine exposes decode/probe primitives, not a container muxer; there is no WebCodecs API that writes an MKV file, so declining `remux` is correct, not under-declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: media-parser is a read-only demux/probe library with no muxing/output capability.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: web-demuxer is a demux-only wasm wrapper; it has no remux/mux output path.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest: mp4box.js authors ISO-BMFF (MP4/MOV/fragmented MP4) only; it has no Matroska/EBML writer, so MKV output is genuinely out of scope.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest: remotion-webcodecs muxes to MP4/WebM, not Matroska/MKV; declining the MKV target is a true capability gap, not a dodge.

## Anti-cheat validation

- Scenario definition: `src/scenarios/robustness/index.ts:383` (`id: 'prop_decode_remux_eq_decode_mp4_mkv'`), invariant `decode(remux(x))==decode(x)`, op `remux`, containersIn `['mp4']`, containersOut `['mkv']`, videoCodecs `['h264']`, audioCodecs `['aac']`. notes (line 392): "Lossless remux must not change decoded pixels: frame digests of remux(x) == those of x."
- Fixture: `fixtures/media/h264_1080p_30s.mp4` EXISTS (~31MB real H.264 1080p30 + AAC file; meta golden confirms container=mp4, durationSec=30, 1920x1080 h264 @8.2Mbps, aac 48k stereo). Real media, not synthetic/mock.
- Oracle: `src/core/oracles.ts:2645` `propertyInvariant()`; the decode-remux branch at lines 2686–2707 requires `ctx.output` (no output → fail), loads golden frames (no golden → fail), decodes the candidate output via `ctx.decodeWithPlatform`, and calls `compareDigests` (`src/core/oracles.ts:1166`). `compareDigests` fails on zero produced frames, zero overlapping frames, or ANY SHA-256 mismatch (`normHex(g.sha256) !== normHex(w.sha256)`); it passes only on bit-exact equality. This is a strong, non-trivially-satisfiable gate — not a smoke test, not an ssim proxy. Measurements (12/12, 0 mismatched) are physically plausible for a 30s clip sampled to 12 golden frames.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1259` — genuine `Conversion` (openInput → new Output(MKV format) → runConversion). No canned output, no input→output copy faking a remux, no short-circuit to golden, no error swallowing. Co-passer ffmpeg.wasm `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` is a real `-c copy` MKV mux.
- Cached note: BOTH PASS engines have `cached:true` (mediabunny startedAtIso 2026-06-22T14:08:30Z, ffmpeg 2026-06-22T14:05:37Z) and the shard carries NO `bench{}` block. Evidence is reused, not freshly re-run; the 553/675ms wall figures are single cached durations, not benchmarked medians.
- Verdict: **REAL** — real fixture, real conversion implementations on both passers, and a strict bit-exact frame-digest oracle. The remux→decode pixel-equality is a meaningful, hard-to-fake correctness gate.

## Confidence & caveats

- Confidence: medium. Correctness verdict is solid (strict bit-exact oracle, real fixture, real adapter code paths verified at file:line). The WINNER SELECTION between two co-passers is the soft part: it rests on a single cached `durationMs` (1.22x) plus the backend tiebreaker, with no `bench{}` median/p95/mad/n to confirm the wall gap is stable rather than noise.
- Both PASS results are cached (`cached:true`) — staleness risk: if the MKV writer or WebCodecs decode path changed since the cache was seeded, the PASS may not reflect current code. A fresh re-run (clearing raw + .browser-cache per the launcher seeding caveat) would harden the result.
- The wall margin (≈122ms) is small; treat mediabunny's lead as "faster + better backend" rather than a decisive performance blowout. If only deployment simplicity matters, mediabunny's no-COOP/COEP, pure-TS-ESM core is the stronger, more durable argument than the timing.
