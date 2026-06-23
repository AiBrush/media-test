# robustness/prop_trim_concatenation

- **family:** robustness
- **fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (H.264 video + AAC audio in MP4, ~31 MB)
- **primaryMetric:** wall (metrics declared: `wall`, `peakMemory`)
- **passCount:** 1 of 7
- **invariant under test:** `trim(a..b) ++ trim(b..c) ≈ trim(a..c)` with a=2.0s, b=5.0s, c=9.0s (interior split at b)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` — **uncontested** (only engine with status==PASS).
- **Decisive factor:** It is the only engine that declares the `trim` operation AND the `trim:compose` feature required by this metamorphic scenario (it must perform three trims plus a `concat` and compare). Every other engine returned `NA_ENGINE`: six because they do not declare the `trim` operation at all, and mediabunny specifically because it does not declare the `trim:compose` feature.
- **Margin over runner-up:** N/A — no second PASS exists, so there is no performance/correctness margin to compute. The remaining six engines are capability-gated out before any oracle runs.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | n/a (no bench; durationMs 77349) | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'trim:compose' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

Note: the shard carries no `bench{}` block for the PASS engine for this scenario; only `durationMs=77349` (wall-clock of the whole three-trim + concat + double-decode oracle run) is present. No throughputRealtime/peakMemory/longtasks samples were recorded.

## Why the winner wins (deep technical)

This is a metamorphic property test, not a single-shot transcode. The oracle (`src/core/oracles.ts:3319` `trimConcatInvariant`) requires the candidate engine to (1) produce three independent trims of the same H.264/MP4 source — `[a,b]`, `[b,c]`, `[a,c]` — (2) `concat` the two adjacent trims, then (3) prove that the concatenated result and the direct combined trim are equivalent in both duration and decoded pixels. That places two hard demands on a candidate: a working frame-accurate `trim` and a working `concat`. Only ffmpeg.wasm declares both (`trim` operation + `trim:compose` feature; see capability declarations at `src/engines/ffmpeg-wasm/adapter.ts:1495-1497`). The runner gates the other six out at capability-resolution time, so they never reach an oracle.

Mechanistically, ffmpeg.wasm satisfies the invariant because of how its `trim` is implemented for the `frameAccurate:true` path (`src/engines/ffmpeg-wasm/adapter.ts:2538-2645`). For H.264 it places `-ss`/`-t` *after* `-i` (`adapter.ts:2574-2586`), which forces a full decode and re-encode rather than a keyframe-copy. The video is re-encoded with `libx264 -pix_fmt yuv420p -preset veryfast` (`adapter.ts:2592-2594`) and the MP4 is written with `-movflags +faststart` (`adapter.ts:2630-2631`). Because every trim segment starts on a freshly inserted IDR keyframe (re-encode resets the GOP at the requested boundary), the two adjacent segments `[a,b]` and `[b,c]` join cleanly under the `concat` demuxer (`adapter.ts:2949-2979`, `-f concat -safe 0 -c copy`) with no GOP overlap or duplicated/dropped frames at the b boundary. `-avoid_negative_ts make_zero` (`adapter.ts:2629`) normalizes the timestamps of each segment so the concatenated timeline is monotonic from zero, which is exactly what makes the concatenated duration line up with the direct trim's duration.

The oracle measurements confirm this physically. Expected duration = (c−a)/1e6 = **7.000s**; the concatenated output measured **7.099s** and the direct trim **7.066s** (`concatDurationSec`/`directDurationSec` in the shard), both inside the enforced tolerance of **0.15s** (`durationTolSec = max(t.durationToleranceSec, 0.15)`, `oracles.ts:3358`). Frame-count parity is exact: `candidateFrames=210`, `referenceFrames=210`, `frameCountDelta=0`, `framePairs=210` — i.e. a 7s clip at 30fps yields exactly 210 frames on both paths. The perceptual gate then compares all 210 decoded pairs via SSIM (`compareFrameSsim`, `oracles.ts:3389`): `minSsim=0.98825`, `meanSsim=0.99481` over 210 frames, comfortably above the scenario tolerance `ssimMin=0.985`. SSIM (rather than bit-exact) is the correct gate here because the scenario notes explain that separately re-encoded adjacent trims round slightly differently from one direct trim (`src/scenarios/robustness/index.ts:441-444`); the ~0.005 SSIM headroom and the small 0.033s concat-vs-direct duration gap are the residue of that independent re-encoding, exactly as designed.

Backend: `env.configUsed` was not captured in this cached entry, but ffmpeg.wasm runs single-thread wasm here (the adapter explicitly excludes HEVC and libopus from this path for timeout/reliability reasons, `adapter.ts:2596-2610`); the H.264/AAC source uses libx264 + the default AAC encoder, which are reliable in the stable core. The 77.3s wall is consistent with three software re-encodes of a 1080p clip plus a stream-copy concat and two platform decodes.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE: "engine does not declare feature 'trim:compose'". Honest, granular NA. mediabunny may support simple trimming, but it does not advertise the compose/concat-of-trims capability this metamorphic oracle needs, so the runner correctly excludes it rather than letting it half-run.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest. mp4box is a box parser/segmenter, not a re-encoding trimmer; it cannot do a frame-accurate decode+re-encode trim.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Plausibly under-declared (WebCodecs could in principle decode+re-encode a range), but as shipped the adapter does not expose `trim`, so the NA is honest for this build.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest; web-demuxer is a demux-only library with no encode path.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest at the adapter level; the platform adapter does not wire up a trim/concat pipeline even though the underlying WebCodecs+MP4 muxer could.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest; it is a parser, not an encoder/trimmer.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/robustness/index.ts:418-445` (id `prop_trim_concatenation`), generated via `propertyScenarios`/`defineScenario` at `index.ts:460-480`. Oracle is `['property-invariant']`, tolerance `ssimMin: 0.985`.
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` — real file, exists, ~31 MB (verified via stat). Real H.264+AAC 1080p 30s asset, not synthetic/empty/mock.
- **Oracle:** `src/core/oracles.ts:3319` `trimConcatInvariant` (dispatched from `oracles.ts:3884` for `op==='trim'`). It performs three real `ctx.engine.trim()` calls and one real `ctx.engine.concat()` (`oracles.ts:3340-3343`), probes both outputs with the reference engine for duration (`oracles.ts:3351-3352`), decodes up to 240 frames of each with the platform decoder, and runs a real per-frame SSIM comparison (`oracles.ts:3383-3389`). It is NOT trivially satisfiable: duration must match within 0.15s on three independent checks AND SSIM must clear 0.985 across 210 frames. The recorded measurements (210/210 frames, 7.099s/7.066s vs 7.0s, minSsim 0.98825) are physically plausible for a 7s/30fps 1080p clip.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2538` (`trim`) and `:2949` (`concat`). Genuine implementation — invokes real ffmpeg.wasm with `-ss/-t` after `-i` (decode+re-encode via libx264) and a real `concat` demuxer with `-c copy`. No canned output, no input→output copy, no short-circuit to a golden file, no error-swallowing (errors are rethrown as `fail`).
- **Verdict:** **REAL** — real fixture + real ffmpeg.wasm implementation + a meaningful multi-condition oracle (exact frame-count parity, triple duration tolerance, and 210-frame SSIM well above tolerance).
- **Cached note:** the PASS entry has `cached:true` ("cached previous PASS result") — evidence was reused, not re-run in this session. Staleness risk is low because the fixture, adapter trim/concat code, and oracle are all present and self-consistent with the recorded measurements, but the numbers reflect a prior run.

## Confidence & caveats

- **Confidence: high** that ffmpeg.wasm is the correct (and only possible) winner — six engines are capability-gated to NA before any oracle and only one PASS exists.
- The PASS is `cached`, so the exact measurements are from a previous run; no per-metric `bench{}` (wall/peakMemory) was stored, only `durationMs=77349`. A fresh re-run would strengthen the timing evidence.
- The gate is partly perceptual (SSIM 0.985), by design, because adjacent re-encoded trims cannot be bit-exact against a single direct trim. With `frameCountDelta=0` and `minSsim=0.98825` the PASS is robust, not marginal.
- Some NAs (remotion-webcodecs, platform) could in principle implement trim via WebCodecs; they are honest for *this* build but represent under-coverage rather than a hard inability.
