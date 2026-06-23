# robustness/prop_trim_additivity_compose

- **Family:** robustness
- **Fixture asset(s):** `fixtures/media/h264_1080p_30s.mp4` (H.264 1080p video + AAC audio, MP4 container, ~31 MB real fixture)
- **Primary metric:** wall (scenario metrics: `wall`, `peakMemory`)
- **Pass count:** 1 / 7 (6 NA_ENGINE)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` — **UNCONTESTED** (only PASS; all other 6 engines NA_ENGINE).
- **Decisive factor:** It is the only engine that declares BOTH required features `trim:frame-accurate` and `trim:compose` (adapter.ts:1495-1496) AND implements a real `concat()` path, so it is the only engine the metamorphic compose oracle can even run. It then satisfied the `property-invariant` oracle: durations of the composed and direct trims matched the expected 7 s window, and the composed-vs-direct decode achieved **min SSIM 0.9883 / mean 0.9948 over 210 frame pairs** (frameCountDelta 0), clearing the 0.985 floor.
- **Margin over runner-up:** No runner-up — the other 6 engines never declared the operation/feature, so there is no second PASS to measure against.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | n/a (durationMs 66408) | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'trim:compose' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

Note: the shard carries no `bench{}` block for the ffmpeg entry (only `durationMs: 66408`, `cached: true`), so wall median / throughput / peakMemory / longtasks are not reported as measured percentiles — there is a single timed run, not a percentile sample.

## Why the winner wins (deep technical)

This scenario is a **metamorphic additivity property**: `trim(a..b) ++ trim(b..c) == trim(a..c)` with a=2 s, b=5 s, c=9 s on a real H.264-in-MP4 1080p clip (`src/scenarios/robustness/index.ts:1107-1124`). The oracle (`trimComposeInvariant`, `src/core/oracles.ts:3314-3411`) requires the candidate engine to (1) perform three frame-accurate trims, (2) `concat()` the two adjacent halves, (3) have a reference engine probe both outputs' durations, and (4) platform-decode both the composed and the direct trim and compare frame-by-frame SSIM. An engine that cannot do all of trim + concat simply cannot be exercised here — which is exactly why six engines are NA.

ffmpeg.wasm wins mechanistically because its adapter implements the full chain with the real wasm core, not shortcuts:

- **Frame-accurate trim** (`src/engines/ffmpeg-wasm/adapter.ts:2538-2645`): because `frameAccurate` is true, it places `-ss`/`-t` AFTER `-i` (line 2574-2586), which forces a full decode then re-encode so the cut lands on exact frame boundaries rather than the nearest preceding keyframe. For this H.264 source it selects `libx264` (`-c:v libx264 -pix_fmt yuv420p -preset veryfast`, lines 2592-2594) and re-encodes AAC audio, then writes MP4 with `-movflags +faststart` (line 2630-2631) and `-avoid_negative_ts make_zero` (line 2629). The `+faststart`/`avoid_negative_ts` handling is what keeps the two halves' timestamps clean enough that the concat demuxer can stitch them without a duration drift beyond the 0.15 s band.
- **Concat** (`src/engines/ffmpeg-wasm/adapter.ts:2949-2979`): uses ffmpeg's real `concat` demuxer (`-f concat -safe 0 -i list.txt -c copy`), writing each segment into MEMFS and a list file. This is a genuine container-level stitch of the two re-encoded MP4 halves, not a byte append.

The oracle measurements confirm the property held on real media: `expectedDurationSec 7`, `concatDurationSec 7.099`, `directDurationSec 7.066` (both within the `durationToleranceSec 0.15` band and within 0.033 s of each other), `candidateFrames 210` == `referenceFrames 210` (`frameCountDelta 0`), and `minSsim 0.9883` / `meanSsim 0.9948` across all 210 frame pairs — comfortably above the scenario's `ssimMin 0.985` floor (`src/scenarios/robustness/index.ts:1124`). The slight sub-1.0 SSIM is physically expected and explicitly anticipated in the scenario notes: two separately re-encoded adjacent trims are not byte-identical to one direct re-encode, so a tight perceptual floor (not bit-exact) is the correct gate.

Backend note: `env.configUsed` is not present in the shard entry, but the ffmpeg.wasm path is single-thread software codecs in the vendored wasm core (libx264 software encode), which is also why the run is slow (`durationMs 66408` ≈ 66 s) — three frame-accurate 1080p re-encodes plus a concat plus two platform decodes.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE: "engine does not declare feature 'trim:compose'". Honest NA. mediabunny DOES declare `trim:frame-accurate` (adapter.ts:1051) and implements `trim()`, but deliberately does NOT declare the `trim:compose` feature the scenario requires. Per the scenario notes, an engine must declare `trim:compose` only after the full compose path passes; mediabunny opts out rather than risk a failing additivity path. Under-declaration is conservative, not a cheat.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest; it is a parser, not an editor, with no trim/concat surface.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest; no trim operation declared.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest; demux-only.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest; the raw WebCodecs platform adapter exposes decode/demux helpers but no editing/trim operation.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest; mp4box is container parse/fragment, not re-encode trim.

## Anti-cheat validation

- **Scenario:** `src/scenarios/robustness/index.ts:1107-1124` (id `prop_trim_additivity_compose`, op `trim`, invariant `trim(a..b)++trim(b..c)==trim(a..c)`, a/b/c = 2 / 5 / 9 s, ssimMin 0.985).
- **Fixture:** `fixtures/media/h264_1080p_30s.mp4` — EXISTS, ~31 MB real H.264/AAC MP4 (stat confirmed). Real, not synthetic/empty/mock.
- **Oracle:** `property-invariant` → `trimComposeInvariant` at `src/core/oracles.ts:3314-3411`. Performs real trims via the candidate engine, real ffmpeg `concat`, reference-engine duration probes, and a real platform decode + per-frame SSIM compare. Not trivially satisfiable: it gates on three duration deltas (each ≤ 0.15 s) AND per-frame SSIM ≥ 0.985 over 210 frames with frameCountDelta 0. Measurements are physically plausible for a 7 s 1080p30 window (210 frames = 30 fps × 7 s, SSIM 0.988–0.995).
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts` — trim 2538-2645 (real decode→libx264 re-encode), concat 2949-2979 (real `-f concat` demuxer), feature declaration 1495-1496. No canned output, no copy-input-to-output, no golden short-circuit, no error swallowing (it throws on malformed/mutated input and on unsupported encoders).
- **Verdict:** **REAL.** Real fixture + genuine multi-step ffmpeg implementation + meaningful metamorphic oracle (duration + per-frame SSIM over 210 frames). The 0.985 SSIM floor is a perceptual proxy rather than bit-exact, but that is the physically correct gate for two separately re-encoded adjacent trims, and the actual margin (minSsim 0.9883, mean 0.9948) is comfortable, not borderline.
- **Cached note:** ffmpeg's result is `cached: true` ("cached previous PASS result"). The evidence was reused, not re-run in this batch — staleness risk exists, but the cached measurements are internally consistent and physically plausible.

## Confidence & caveats

- **Confidence: high** that ffmpeg.wasm is the correct uncontested winner — it is the only engine that even runs this scenario, and its oracle measurements are real and well above threshold.
- Caveat: the win is **uncontested by construction** — 6/7 engines are NA, so this is a coverage statement (only ffmpeg.wasm implements frame-accurate trim + concat) more than a head-to-head quality comparison.
- Caveat: result is `cached: true`; no fresh re-run in this batch, and the shard carries no `bench{}` percentile block, only a single `durationMs 66408`.
- Caveat: the gate is perceptual SSIM (proxy), not bit-exact; appropriate here, but it is not the strongest oracle tier.
- Caveat: `env.configUsed` is absent from the shard, so the single-thread-wasm/software-libx264 backend is inferred from the adapter, not read from the run env.
