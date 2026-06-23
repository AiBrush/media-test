# remux/prop_multitrack_survives_mp4_mkv

family: remux | fixture asset: `fixtures/media/h264_multitrack.mp4` (4.5 MB, H.264 video + 2× AAC audio) | primaryMetric: wall | passCount: 2/7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Status: **CONTESTED** — two engines PASS (`mediabunny@1.48.0`, `ffmpeg-wasm`) with byte-identical correctness strength.
- Decisive factor: **performance**, because both winners satisfy the *exact same* oracle ladder (property-invariant + reference-reimport, both bit-/track-exact). ffmpeg.wasm wins wall median **38.55 ms vs 120.19 ms = 3.12× faster**, and longtasks **164 ms vs 403 ms = 2.46× fewer** main-thread blocking. Margin caveat: n==1 for both, so this is single-sample evidence (no MAD/p95 spread).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, reference-reimport:true | 38.55 ms | n/a (not measured) | 0 (n=0) | 164 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true, reference-reimport:true | 120.19 ms | n/a (not measured) | 0 (n=0) | 403 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

(peakMemory has n==0 samples for both PASS engines — it is not instrumented for this scenario, so it cannot be a tiebreaker. throughputRealtime is absent from both bench blocks.)

## Why the winner wins (deep technical)

The operation is a **multi-track stream-copy remux**: take an MP4 carrying one H.264/AVC video track plus two AAC audio tracks (golden meta `fixtures/golden/h264_multitrack.mp4.meta.json` lists exactly `video/h264 1280×720@30` + 2× `audio/aac 48000Hz stereo`), rewrap into a Matroska/MKV container, and demonstrate that (a) the decoded video pixels are unchanged and (b) every track survived. No codec re-encode is permitted — both winners do a true container rewrap.

**Correctness (a tie, so it does not decide the winner).** Both PASS engines clear the identical oracle ladder:
- `property-invariant` with invariant `decode-remux` (`DECODE_REMUX`, scenario `src/scenarios/remux/metamorphic.ts:123-135`). The oracle path at `src/core/oracles.ts:2686-2707` decodes the engine's MKV output with the platform WebCodecs decoder and `compareDigests` against the baked browser golden (`fixtures/golden/h264_multitrack.mp4.frames.json`, sha256 of normalized RGBA). ffmpeg-wasm: `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0`. mediabunny: identical 12/12, 0 mismatches. Both are bit-exact decoded-frame equality — the video track's coded samples round-tripped MP4→MKV without alteration.
- `reference-reimport` (`src/core/oracles.ts:1225` → `semanticRemuxReimport` at :1273). The reference engine re-demuxes the produced MKV and counts media tracks vs golden. ffmpeg-wasm: `reimportMediaTracks:3, goldenMediaTracks:3, reimportPackets:1244, reimportKeyframes:949, durationDeltaSec:0.069 ≤ tol 0.1`. mediabunny: `reimportMediaTracks:3, goldenMediaTracks:3, reimportPackets:1240, reimportKeyframes:945, durationDeltaSec:0.042 ≤ tol 0.1`. Both preserved all 3 tracks (no dropped audio); the tiny packet/keyframe delta (1244 vs 1240) is normal muxer-level repacketization and well within the ±2% / 0.1 s tolerances. Neither is meaningfully "more correct."

**Performance is the decider.** ffmpeg.wasm's remux (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) issues a single `-i <in> -map 0 -c copy <out.mkv>` exec. The `-map 0` is the load-bearing detail for this multi-track case — without it FFmpeg's default "one stream per type" selection would silently drop the second AAC track; the explicit map is why `reimportMediaTracks` stays 3. Because it is `-c copy`, no decoder/encoder runs: the wasm core only re-frames packets into the Matroska muxer, so the whole op is essentially demux+remux bookkeeping — hence the 38.55 ms wall and 164 ms longtasks even on the single-thread core. mediabunny's remux (`src/engines/mediabunny/adapter.ts:1244-1260`) goes through the higher-level `Conversion` API (`runConversion`) with `Output` + `MkvOutputFormat` + `BufferTarget`; the Conversion pipeline (streaming-lockstep, `pipeline:"streaming-lockstep"`, `backend:"webcodecs"`, `hwAccel:"prefer-hardware"` per its `configUsed`) does more per-frame TS bookkeeping and JS-side orchestration, costing 120.19 ms wall and 403 ms longtasks. The 3.12× wall and 2.46× longtask advantage all stems from ffmpeg's flat C `-c copy` packet path vs mediabunny's JS Conversion orchestration for what is fundamentally a no-transcode rewrap.

## What each other framework did wrong

- **mediabunny@1.48.0**: PASSed with identical correctness (12/12 frames, 3/3 tracks) but lost on speed — 120.19 ms wall (3.12× slower than 38.55 ms) and 403 ms longtasks (2.46× more main-thread blocking). The gap is the JS Conversion-API orchestration overhead vs ffmpeg's flat `-c copy`.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare output container 'mkv'". Honest NA: MP4Box.js is an ISO-BMFF (MP4) library and genuinely cannot author Matroska/MKV, so it cannot be the remux *target* container here.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — "engine does not declare output container 'mkv'". Honest NA: its writer targets MP4/WebM, not MKV.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'remux'". Honest NA: media-parser is a read-only demuxer/parser with no muxing/output path.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare operation 'remux'". Honest NA: it is a demux-only WASM library (no encoder/muxer output).
- **platform@chrome-149**: NA_ENGINE — "engine does not declare operation 'remux'". Honest NA: the raw WebCodecs/platform surface offers decode/encode primitives but no container muxer, so a one-shot remux op is not exposed.

## Anti-cheat validation

- Scenario: `src/scenarios/remux/metamorphic.ts:123` (`id: 'prop_multitrack_survives_mp4_mkv'`), invariant `DECODE_REMUX`, oracles `['property-invariant','reference-reimport']`.
- Fixture: `fixtures/media/h264_multitrack.mp4` — EXISTS, 4.5 MB real file (verified via stat). Golden meta confirms a genuine 3-track MP4 (H.264 1280×720 + 2× AAC 48kHz), not synthetic/empty/mock.
- Oracles: `property-invariant` decode-remux compares against baked sha256 RGBA goldens via `compareDigests` (`src/core/oracles.ts:2686-2707`) — a real per-frame bit-exact comparison, not a wide tolerance, not ssim, not smoke. `reference-reimport`/`semanticRemuxReimport` (`src/core/oracles.ts:1225,1273-1297`) re-demuxes the actual output and counts media tracks vs golden, failing on any track-count divergence. Measurements (1244 packets, 949 keyframes, 3 tracks, 0.069s duration delta) are physically plausible for a 10 s 30fps H.264+2×AAC clip.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — real `await this.run([...,'-i',name,'-map','0','-c','copy',outName])` then `readBinary`. No canned output, no input→output copy faking a transcode, no short-circuit to golden, no error swallowing. The `-map 0` is what actually preserves the secondary audio track.
- Cached note: ffmpeg.wasm result has **cached==true** ("cached previous PASS result"); mediabunny likewise. Both PASS verdicts and bench numbers were reused, not freshly re-run — minor staleness risk per the launcher-seeding caveat, but the implementations and oracles are genuine.
- Verdict: **REAL** — real multi-track fixture + genuine `-c copy` stream-copy implementation + bit-exact frame oracle and real track-count reimport oracle.

## Confidence & caveats

- Confidence: **high** on the winner. Correctness is a true tie (identical oracle passes), and performance margin (3.12× wall, 2.46× longtasks) is large enough that single-sample noise is unlikely to flip it.
- Caveats: (1) Both bench blocks are **n==1** (no MAD/p95), so the exact ratio is a point estimate. (2) Both results are **cached** — not re-run this session. (3) `peakMemory` (n==0) and `throughputRealtime` are not instrumented for this scenario, so they could not refine the ranking. (4) The 5 NA engines are all honest capability gaps (no MKV output / no remux op), not under-declared capabilities — none was wrongly excluded.
