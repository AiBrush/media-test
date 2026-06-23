# robustness/prop_duration_consistent_across_containers

- **family:** robustness
- **fixture assets:** `h264_1080p_30s.mp4` (31 MB, H.264/AAC, 30.000s), `h264_1080p_5s.mov` (4.4 MB, H.264/AAC QuickTime, 5.000s), `h264_in_mkv.mkv` (4.4 MB, H.264/AAC Matroska, 10.021s)
- **operation:** `probe` (metadata-only; no decode/encode/remux)
- **invariant:** `probe(x).dur consistent across containers`
- **primaryMetric:** wall (declared metrics: `wall`, `peakMemory`)
- **passCount:** 6 / 7 (mp4box NA_ENGINE)

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479` (chosen as the strongest of a CONTESTED 6-way correctness tie).
- **Contested:** YES. Six engines PASS the single `property-invariant` oracle with effectively identical correctness (all three container durations match golden within the strict ±1-frame band). The decision is therefore forced down to performance and engineering quality, both of which are weak/noisy signals here.
- **Decisive factor:** With correctness tied at the ceiling, ranking falls to wall time (`durationMs`, the only timing signal present — there is no `bench{}` block, so n=1). `remotion-webcodecs` is nominally fastest at 46 ms, but I rank `remotion-media-parser` as the best framework: its 53 ms is statistically indistinguishable from 46 ms at n=1 (1.15x, deep within single-sample noise), and it is the architecturally correct tool for this task — a pure metadata-tier, header-only parser (`fieldsTier: 'metadata-only'`, `backend: 'cpu-js'`) that reads container duration without spinning up any WebCodecs/decode machinery the probe does not need. If you prefer to honor the raw stopwatch, `remotion-webcodecs` (46 ms) is the literal wall winner; the margin over it is 0.87x (i.e. media-parser is ~15% slower) — explicitly inside noise.
- **Margin over runner-up:** media-parser 53 ms vs webcodecs 46 ms = 1.15x slower (noise, n=1); vs mediabunny 89 ms = 1.68x faster; vs platform 139 ms = 2.62x faster; vs web-demuxer 249 ms = 4.70x faster; vs ffmpeg-wasm 325 ms = 6.13x faster.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | property-invariant:true | 53 | n/a (no bench) | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | property-invariant:true | 46 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true | 89 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | property-invariant:true | 139 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | property-invariant:true | 249 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true | 325 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'mkv' |

Oracle measurements (per input, golden vs measured duration delta and tolerance):

- mp4 (golden 30.000s): all PASS engines `durationDeltaSec0 = 0`, tol `0.041666…s`.
- mov (golden 5.000s): all PASS engines `durationDeltaSec1 = 0`, tol `0.041666…s`.
- mkv (golden 10.021s): media-parser/webcodecs/mediabunny/platform `durationDeltaSec2 = 0`; web-demuxer `1.78e-15` (float noise ≈ 0); ffmpeg-wasm `0.0010s` (still ≪ tol).

## Why the winner wins (deep technical)

This scenario is a metamorphic *probe* invariant, not a decode/transcode. The runner hands each engine the same logical content in three different wrappers — H.264+AAC in ISO-BMFF (`isom` major brand), the same codec in a QuickTime `qt ` MOV, and H.264+AAC in a Matroska (`mkv`, encoder `Lavf`) container — and the oracle `probeDurationInvariant` (src/core/oracles.ts:3823-3880) reads each engine's reported `metadata.durationSec` and compares it to the baked golden (`fixtures/golden/*.meta.json`: 30s / 5s / 10.021s). The tolerance per input is `durationToleranceFor()` (src/core/oracles.ts:240) which returns the strict `1/24 ≈ 0.041666…s` band (src/core/oracles.ts:159) because none of mp4/mov/mkv is in `LOOSE_DURATION_CONTAINERS` (`ts/adts/hls`, src/core/oracles.ts:211). So this is a genuine ±1-frame-at-24fps metadata-exact gate, not a perceptual or smoke gate.

Correctly reading duration here is non-trivial precisely because of the container divergence the test probes: in MP4/MOV the authoritative duration lives in the `mvhd`/`tkhd` boxes (movie timescale, possibly divergent from track timescale, plus QuickTime's `qt ` brand quirks); in Matroska it lives in the `\Segment\Info\Duration` element expressed in `TimecodeScale` ticks with no per-sample table. A correct engine must parse all three header formats and normalize each to seconds. Every non-NA engine did so to within float noise.

`remotion-media-parser` is the architecturally ideal engine for this exact job and that is why I rank it first in the correctness-tied field. Its `probe()` (src/engines/remotion-media-parser/adapter.ts:348) calls the real Remotion core `parseMedia()` (src/engines/remotion-media-parser/adapter.ts:363-384) requesting only `{durationInSeconds, container, tracks, metadata, rotation}` at the `'metadata-only'` tier — i.e. it reads container headers and stops, never touching the AAC/H.264 elementary streams. `env.configUsed` confirms this: `backend: 'cpu-js'`, `fieldsTier: 'metadata-only'`, `reader: 'webReader'`, `hwAccel: false`. It does not allocate a `VideoDecoder`, a canvas pool, or a wasm heap — none of which a duration probe needs. That minimal path is why it landed at 53 ms (`durationDeltaSec0/1/2 = 0` on all three), beating mediabunny (89 ms, 1.68x), platform (139 ms, 2.62x), web-demuxer (249 ms, 4.70x) and ffmpeg-wasm (325 ms, 6.13x), while being a statistical tie with remotion-webcodecs (46 ms).

The literal stopwatch winner, `remotion-webcodecs`, uses the same underlying `mp.parseMedia()` core (src/engines/remotion-webcodecs/adapter.ts:346-355) with `backend: 'webcodecs'`; for a pure probe the WebCodecs backend is dead weight (no frames are decoded), so the 46 vs 53 ms gap reflects nothing about probe quality — it is single-sample jitter (no `bench` median/p95/mad is recorded; n=1). I therefore treat the two as tied on speed and prefer the engine whose declared backend/tier matches the operation.

Mechanistically the winner did not "surpass" the others on correctness — all six are pinned to Δ=0 (or float-epsilon). The only meaningful separation is the ~6x spread between the lean header parsers (media-parser/webcodecs/mediabunny) and the heavy demux/transcode stacks (web-demuxer, ffmpeg-wasm) that must instantiate a wasm module just to read an `mvhd`/`Info` box. For a "is your duration field right across containers" robustness check, the lean metadata-only parser is the correct and fastest answer.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479 (PASS, 46 ms):** Nothing wrong — it is the raw wall-time winner and is correct (Δ=0 on all three). Ranked second only because for a metadata-only probe its `webcodecs` backend is unnecessary machinery, and its 0.87x margin over media-parser is inside n=1 noise. A defensible alternative pick.
- **mediabunny@1.48.0 (PASS, 89 ms):** Correct (Δ=0 ×3) but 1.68x slower than the winner; its `webcodecs`/`prefer-hardware`/canvas-pool config (`canvasPoolSize: 4`) provisions decode/pixel resources a probe never uses.
- **platform@chrome-149 (PASS, 139 ms):** Correct (Δ=0 ×3) but 2.62x slower; the browser `webcodecs` path (`decode: VideoDecoder`, `pixelBackend: webgpu>webgl>offscreen2d`) carries the most setup overhead of the WebCodecs group for a no-decode op.
- **web-demuxer@4.0.0 (PASS, 249 ms):** Correct (mkv delta `1.78e-15` ≈ 0) but 4.70x slower — it is a wasm (libav-derived) demuxer that must spin up its module to read headers, expensive for a probe.
- **ffmpeg.wasm@0.12.15 (PASS, 325 ms):** Correct but loosest of the field on mkv (`durationDeltaSec2 = 0.0010s`, still ≪ 0.04167 tol) and 6.13x slower; full ffmpeg wasm init dominates the cost for a metadata read.
- **mp4box@2.3.0 (NA_ENGINE):** Did not run — `reason: "engine does not declare input container 'mkv'"`. This NA looks HONEST: MP4Box.js is an ISO-BMFF (MP4/MOV) parser and genuinely does not support Matroska/EBML; since the scenario's `requires.containersIn` includes `mkv` (src/scenarios/robustness/index.ts:452), the capability gate correctly excludes it rather than letting it silently skip an input. Not an under-declared capability.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/robustness/index.ts:447-457 (`id: 'prop_duration_consistent_across_containers'`, `op: 'probe'`, `input: ['h264_1080p_30s.mp4','h264_1080p_5s.mov','h264_in_mkv.mkv']`, `oracles: ['property-invariant']`).
- **Fixtures exist and are real:** `fixtures/media/h264_1080p_30s.mp4` (31 MB), `h264_1080p_5s.mov` (4.4 MB), `h264_in_mkv.mkv` (4.4 MB) — all present, non-empty, multi-megabyte real media. Goldens present (`fixtures/golden/*.meta.json` with `durationSec` 30 / 5 / 10.021 and full track tables). Not synthetic/mock.
- **Oracle:** `probeDurationInvariant` src/core/oracles.ts:3823-3880, dispatched from `propertyInvariant` src/core/oracles.ts:2709-2711. It performs a real per-input comparison `|measured.durationSec − golden.meta.durationSec|` against a strict `1/24 s` tolerance (src/core/oracles.ts:240,159). NOT trivially satisfiable: the band is ±1 frame, mp4/mov/mkv are NOT in the loose set, and the measured deltas (0, 0, 0.001, 1.78e-15) are physically plausible for header-derived durations of these clips. No ssim/smoke shortcut.
- **Winner adapter:** `remotion-media-parser` `probe()` src/engines/remotion-media-parser/adapter.ts:348-405 calls the real `parseMedia()` (src/engines/remotion-media-parser/adapter.ts:363) requesting `durationInSeconds` at metadata-only tier. No hardcoded duration, no read of the golden file, no copy-input trick, no swallowed error reported as success. (Literal stopwatch winner remotion-webcodecs src/engines/remotion-webcodecs/adapter.ts:346 likewise calls real `mp.parseMedia`.)
- **Verdict:** **REAL** — real multi-MB fixtures in three genuinely different containers, real library calls per engine, and a strict metadata-exact ±1-frame oracle that did real per-input comparisons against baked goldens.
- **Cached note:** ALL 7 entries have `cached: true` (`reason: "cached previous PASS result"`); none was re-run in this pass. Timing numbers (`durationMs`) are reused single-sample stopwatch values, not fresh medians — staleness/noise risk applies to the *ranking* but not to the correctness verdict (the Δ measurements are deterministic from headers).

## Confidence & caveats

- **Confidence:** MEDIUM. Correctness verdict is high-confidence (deterministic header parse, all Δ=0/epsilon, strict band, real fixtures and oracle). The *winner choice within the tie* is low-confidence: it rests on a single-sample wall time with no `bench{}` (no median/p95/mad), and the top three (webcodecs 46 / media-parser 53 / mediabunny 89 ms) are close enough that n=1 jitter could reorder webcodecs and media-parser.
- **Caveat:** I rank `remotion-media-parser` first on architectural fit (metadata-only/cpu-js path matches a no-decode probe) plus a tie-level wall time; `remotion-webcodecs` is the equally defensible raw-stopwatch pick at 46 ms. Either is correct; neither is meaningfully "stronger" on the oracle.
- **Caveat:** All results are cached — a fresh re-run would give more trustworthy timings. The mp4box NA is a legitimate capability gate (no Matroska support), not a defect.
