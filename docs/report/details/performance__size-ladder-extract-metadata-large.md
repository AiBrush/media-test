# performance/size-ladder-extract-metadata-large

- **Family:** performance
- **Fixture asset:** `fixtures/media/large_h264_1080p_120s.mp4` (90 MB, H.264 1080p30 ~5.84 Mbps + AAC 48 kHz stereo, faststart MP4, 120 s)
- **Primary metric:** `opsPerSec` (higher better) — extract-metadata throughput across the §5.3 size ladder, large rung
- **Oracle gate:** `golden-metadata` (structural/metadata-exact)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (all 7 engines PASS the same `golden-metadata` gate).
- **Decisive factor:** Since correctness is identical (every engine matches the golden with `durationDeltaSec: 0`), the contest collapses to the primary metric `opsPerSec`. Mediabunny posts the highest throughput at **173.61 ops/s** (wall median **5.76 ms**).
- **Margin over runner-up:** runner-up is `remotion-webcodecs@4.0.479` at 164.47 ops/s / 6.08 ms wall. Mediabunny is **~1.06x faster** (173.61 / 164.47 = 1.056; 6.08 / 5.76 = 1.056x lower wall). This is a thin margin. Against the slowest passing engine (`ffmpeg.wasm` 4.60 ops/s) the margin is **~37.7x**.

## Per-engine results

| Engine | status | oracles passed | wall median (ms) | opsPerSec | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 5.76 | **173.61** | n/a | n/a | n/a | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 6.08 | 164.47 | n/a | n/a | n/a | cached previous PASS |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 6.81 | 146.84 | n/a | n/a | n/a | cached previous PASS |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 40.91 | 24.44 | n/a | n/a | n/a | cached previous PASS |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 130.45 | 7.67 | n/a | n/a | n/a | cached previous PASS |
| platform@chrome-149 | PASS | golden-metadata:pass | 164.48 | 6.08 | n/a | n/a | n/a | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 217.28 | 4.60 | n/a | n/a | n/a | cached previous PASS |

(Only `opsPerSec` and `wall` are produced for this probe case; `throughputRealtime`/`peakMemory`/`longtasks` are not measured for extract-metadata and are honestly absent from the shard bench, not zero.)

## Why the winner wins (deep technical)

This is a probe/extract-metadata operation on a 90 MB faststart MP4. The golden requires container=`mp4`, duration=120 s (±1 frame), and two tracks: video H.264 1920×1080 @ 30 fps and audio AAC 48 kHz stereo (`fixtures/golden/large_h264_1080p_120s.mp4.meta.json`). Every engine produces a correct match (`durationDeltaSec: 0`, `metadata matches golden (2 track(s))`), so correctness cannot separate them — the ranking is pure metadata-extraction throughput.

The single mechanistic driver here is **whether the engine reads only the front-of-file `moov`/`mvhd` to answer the metadata query, versus touching `mdat` / scanning samples.** Because the asset is faststart (moov before mdat), the entire metadata answer lives in a small header at the start of the 90 MB file. Mediabunny's probe path (`src/engines/mediabunny/adapter.ts:417` `metadataFromInput`) takes the cheap duration route first: `input.getDurationFromMetadata()` (`adapter.ts:429`) reads the container's declared `mvhd`/track duration WITHOUT a sample scan, and only falls back to `computeDuration()` (`adapter.ts:436`) if metadata yields null — which it does not for this faststart MP4. It then reads tracks via `input.getTracks()` (`adapter.ts:443`) and normalizes codec/dims/fps/sampleRate/channels. The result is a 5.76 ms wall, 173.61 ops/s — dominated by a tiny header parse, not by the 90 MB payload. This is the same WebCodecs-backed pure-TS-ESM build (`env.configUsed.backend: "webcodecs"`, `coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`), but for pure probe the WebCodecs backend is irrelevant — the win is the lazy header-only read.

The two near-peers confirm the mechanism: `remotion-webcodecs` (164.47 ops/s, 6.08 ms) and `remotion-media-parser` (146.84 ops/s, 6.81 ms) are also streaming header-first parsers (`fieldsTier: "metadata-only"`, `reader: "webReader"`, `pipeline: "streaming"`), landing within 6–7 ms. The slow tail (`mp4box` 130 ms, `platform` 164 ms, `ffmpeg.wasm` 217 ms) pays a structural penalty: mp4box uses `whole-file-append(MP4BoxBuffer+fileStart)` with `rangeReads:false` (`env.configUsed`), i.e. it appends the whole 90 MB buffer before answering; `platform`'s probe goes through a `<video>` element load path; and `ffmpeg.wasm` must boot the wasm core and let libavformat open the file. Mediabunny's margin over its nearest peer is only ~1.06x — within the noise floor for an n=1, single-warmup sample (`bench.opsPerSec.n: 1, warmup: 1, mad: 0`) — so the strongest claim is "mediabunny is in the top tier of header-only probers," not a robust lead. The decisive, defensible separation is over the whole-file/wasm tail (37.7x vs ffmpeg.wasm, 22.6x vs platform, 17.0x vs mp4box).

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, lost on speed: 164.47 ops/s vs 173.61 (6.08 ms vs 5.76 ms wall). Gap is ~1.06x; effectively a tie within n=1 noise.
- **remotion-media-parser@4.0.479** — PASS, lost on speed: 146.84 ops/s vs 173.61 (~1.18x slower, 6.81 ms wall). Same streaming metadata-only approach, marginally slower header parse.
- **web-demuxer@4.0.0** — PASS, lost on speed: 24.44 ops/s vs 173.61 (~7.1x slower, 40.91 ms wall). The WASM (FFmpeg-based) demuxer pays core-init + libavformat open cost even for a metadata-only query.
- **mp4box@2.3.0** — PASS, lost on speed: 7.67 ops/s vs 173.61 (~22.6x slower, 130.45 ms wall). Pure-JS `whole-file-append` with `rangeReads:false` buffers the full 90 MB before reporting metadata.
- **platform@chrome-149** — PASS, lost on speed: 6.08 ops/s vs 173.61 (~28.5x slower, 164.48 ms wall). Metadata via a `<video>` element load path is far heavier than a direct moov parse.
- **ffmpeg.wasm@0.12.15** — PASS, lost on speed: 4.60 ops/s vs 173.61 (~37.7x slower, 217.28 ms wall). Single-thread wasm core boot + libavformat open dominate the wall for a trivial header read.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/size-ladder.ts:69-83` (id built at line 71 as `performance/size-ladder-extract-metadata-${r.key}`, large rung `r.asset = LADDER.large`). Asset id resolved in `src/scenarios/performance/_shared.ts:79` → `large_h264_1080p_120s.mp4`. Op is `probe`, oracle `golden-metadata`, primary `opsPerSec`, timeout `T_LARGE` (120 s).
- **Fixture exists:** `fixtures/media/large_h264_1080p_120s.mp4` is present and real (90 MB). Not synthetic/empty/mock.
- **Golden exists & is plausible:** `fixtures/golden/large_h264_1080p_120s.mp4.meta.json` — container mp4, durationSec 120, video h264 1920×1080@30 5.84 Mbps, audio aac 48 kHz/2ch. NOTE: the source-file comments (`size-ladder.ts:52`, `_shared.ts:79`) state this rung's golden was "NOT yet baked → NA until bake"; the bake has since landed (the `.meta.json` now exists), so the rung correctly ranks for real rather than degrading to NA. This is the documented designed behavior ("light up the moment the bake commits asset+golden"), not a defect.
- **Oracle is meaningful:** `src/core/oracles.ts:595` `goldenMetadata` performs a real structural comparison — container (line 606), duration within strict ±1-frame band (lines 614-637), and per-track codec/width/height/fps/sampleRate/channels (lines 642-653, `compareTrack` at 659). It fails on any mismatch and returns the diff list. Not trivially satisfiable; measured `durationDeltaSec: 0` against a 0.0417 s tolerance is physically plausible for a precise faststart MP4.
- **Winner adapter is genuine:** `src/engines/mediabunny/adapter.ts:417` `metadataFromInput` calls the real mediabunny `Input` API — `getFormat()`, `getDurationFromMetadata()` (line 429), `computeDuration()` fallback (436), `getTracks()` (443), `getMetadataTags()` (457). No canned output, no golden short-circuit, no swallowed-error-as-success.
- **Cached note:** ALL 7 engine results have `cached: true` ("cached previous PASS result"). The numbers were reused, not re-run this session; opsPerSec/wall figures carry staleness risk and were measured on Apple M1 Max / Chromium 149.
- **Verdict:** **REAL** — real 90 MB fixture, real header-parsing implementation, meaningful structural oracle. The only caveat is the thin winning margin combined with n=1 cached samples (see below).

## Confidence & caveats

- **Confidence:** medium. The PASS/oracle integrity is high (real fixture, real oracle, real adapter, exact duration match). The *ranking* confidence is reduced because (a) the winning margin over remotion-webcodecs is only ~1.06x, (b) every bench is `n:1, warmup:1, mad:0` so there is no spread to bound noise, and (c) all results are `cached:true` — reused, not freshly re-run. A re-run could plausibly swap mediabunny and remotion-webcodecs at the top.
- The decisive separation that *is* robust is mediabunny (and the two remotion streaming parsers) vs the whole-file/wasm tail (mp4box, platform, ffmpeg.wasm) — a 17x–38x gap that no n=1 noise can erase.
- Source comments lag the actual golden state (they say "not baked"); confirmed the golden file now exists, so the ranking is legitimate rather than an NA that should not have produced numbers.
