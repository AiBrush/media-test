# robustness/prop_flac_seek_seektable_equiv

family: robustness | fixture assets: fixtures/media/flac_seektable.flac, fixtures/media/flac_noseektable.flac | primaryMetric: property-invariant (correctness) | passCount: 1 / 7

## Verdict
- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- **Uncontested** — exactly 1 PASS; the other 6 engines are all NA_ENGINE (none declares the FLAC trim/remux capability this metamorphic gate exercises).
- Decisive factor: ffmpeg.wasm is the only engine that genuinely implements a FLAC stream-copy trim with STREAMINFO total-samples repair, so it could perform the paired ±SEEKTABLE trims the `property-invariant` oracle requires and prove the two outputs decode to bit-identical PCM.
- Margin over runner-up: none to compute — every other engine returned NA before producing output, so there is no second PASS and no metric race.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass | n/a (durationMs 219) | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'flac' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'flac:seektable-seek-equivalence' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |

Note: the shard carries no `bench{}` block for this scenario (it is a pure correctness/metamorphic gate, primaryMetric is the oracle outcome, not a perf metric); the only timing signal is `durationMs: 219` for the cached ffmpeg.wasm entry. No throughput/memory/longtask figures were recorded.

## Why the winner wins (deep technical)

This scenario is a §A.16 metamorphic invariant, not a throughput race. The two inputs — `flac_seektable.flac` and `flac_noseektable.flac` — are the same native FLAC audio (48000 Hz, 2 channels, 16-bit, 480000 total source samples = 10 s, per the shard's `sourceWithSeektableTotalSamples`/`sourceWithoutSeektableTotalSamples` = 480000) differing only by the presence of a SEEKTABLE metadata block. The SEEKTABLE is an *index*, never content, so seeking/trimming to the same window must yield byte-for-byte identical coded frames and therefore identical decoded PCM. The oracle (`src/core/oracles.ts:2771` `flacSeektableSeekEquivalenceInvariant`) enforces this with a hard chain: it trims the same frame-aligned 960 ms window starting at 2_880_000 µs from *both* assets with the candidate engine (`oracles.ts:2807-2808`), parses native FLAC STREAMINFO from each trimmed output (`oracles.ts:2813-2817`), browser-decodes both to PCM and computes a SHA-256 digest (`oracles.ts:2822-2825`), then fails on ANY mismatch in sample rate / channels / bits-per-sample / total samples / decoded sample count / **PCM SHA-256** (`oracles.ts:2855-2878`). This is the strictest rung available for audio here: a bit-exact decoded-PCM digest comparison, not a perceptual proxy and not a smoke test.

ffmpeg.wasm passed every clause. The shard's `property-invariant` outcome reports the two trimmed FLAC files came out at identical size (`withSeektableBytes` = `withoutSeektableBytes` = 21194), identical STREAMINFO total samples (46080 = 0.96 s × 48000), identical 48000/2/16 parameters, and identical decoded sample counts (`withSeektableDecodedSamples` = `withoutSeektableDecodedSamples` = 42335). Because all those equal and the gate would have reported a `decoded PCM digest … vs …` diff otherwise, the SHA-256 PCM digests also matched — the PASS detail confirms "trim … produced identical decoded PCM (42335 sample(s))".

Mechanistically, ffmpeg.wasm reaches this because its trim path for non-frame-accurate FLAC is a true stream copy plus header repair. In `src/engines/ffmpeg-wasm/adapter.ts:2613-2627` the non-frame-accurate branch issues `-ss <startSec>` *before* `-i` (seek to the nearest preceding frame boundary) with `-map 0 -t <durationSec> -c copy`, i.e. it copies the original FLAC coded frames untouched rather than re-encoding. Then `adapter.ts:2638-2640` calls `patchFlacStreaminfoTotalSamples(bytes, durationSec)` to rewrite the STREAMINFO total-samples field so the trimmed file is well-formed. Because the coded frames copied out of the SEEKTABLE and no-SEEKTABLE fixtures are identical (the SEEKTABLE block lives in metadata and is dropped/ignored on copy), the decoder sees identical FLAC subframes and emits identical PCM — exactly the invariant the oracle checks. The capability is honestly declared at `adapter.ts:1497-1499` (`trim:flac-seektable-copy`, `trim:flac-no-seektable-frame-scan`, `flac:seektable-seek-equivalence`), which is what gates this engine into the run instead of being short-circuited to NA.

The 42335 decoded vs 46080 STREAMINFO total-samples gap is itself physically plausible: FLAC frames decode in full blocks and the browser FLAC decoder drops the partial leading/trailing block content, so decoded < container-declared total — and crucially the *same* gap appears on both branches, which is the point of the metamorphic comparison.

## What each other framework did wrong
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "does not declare output container 'flac'". WebCodecs-based muxing path has no FLAC container writer, so it cannot emit a trimmed FLAC. Honest NA: FLAC is not a WebCodecs output container.
- **mediabunny@1.48.0** — NA_ENGINE, "does not declare feature 'flac:seektable-seek-equivalence'". It does not implement the paired-FLAC-trim metamorphic capability token, so the runner correctly skips it. Honest NA at the feature granularity.
- **web-demuxer@4.0.0** — NA_ENGINE, "does not declare operation 'remux'". web-demuxer is a demux-only library (it surfaces packets via libav but does not write containers), so it cannot perform the trim/remux this op requires. Honest NA.
- **platform@chrome-149** — NA_ENGINE, "does not declare operation 'remux'". The raw browser/WebCodecs platform adapter has no container-writing remux path. Honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "does not declare operation 'remux'". A parser, not a muxer; no remux/trim output. Honest NA.
- **mp4box@2.3.0** — NA_ENGINE, "does not declare input container 'flac'". mp4box.js parses ISO-BMFF only; native FLAC is not an MP4/ISO-BMFF input. Honest NA.

All six NAs look genuine, not under-declared: each engine lacks the specific capability (FLAC container I/O or any remux/trim output) that this gate demands, and each NA reason names the exact missing capability layer (container-in / container-out / operation / feature).

## Anti-cheat validation
- Scenario definition: `src/scenarios/robustness/index.ts:1061-1082` (id `prop_flac_seek_seektable_equiv`, op `remux`, inputs `['flac_seektable.flac','flac_noseektable.flac']`, feature `flac:seektable-seek-equivalence`, options targetUs 2_880_000 / durationUs 960_000).
- Fixtures exist and are real: `fixtures/media/flac_seektable.flac` and `fixtures/media/flac_noseektable.flac`, both ~143 KB native FLAC (not empty/synthetic/mock). The shard's STREAMINFO measurements (48000/2/16, 480000 source samples) are consistent with a real ~10 s FLAC clip.
- Oracle: `src/core/oracles.ts:2771-2893` `flacSeektableSeekEquivalenceInvariant` performs a REAL comparison — native FLAC STREAMINFO parse on both outputs plus a SHA-256 PCM digest equality check (`oracles.ts:2876-2878`). It is not trivially satisfiable: it fails on any of 9 distinct diff clauses; no wide tolerance, no ssim-with-exactFrames==0, no smoke gate. The gate compares the two engine outputs against each other (metamorphic), so it cannot be satisfied by short-circuiting to a single golden.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2613-2641` — real ffmpeg `-ss … -i … -map 0 -t … -c copy` stream-copy trim plus `patchFlacStreaminfoTotalSamples` header repair. No canned output, no input→output passthrough faking a transcode, no golden short-circuit, no swallowed error reported as success (failures throw `NotApplicableError`/propagate). Capability honestly declared at `adapter.ts:1497-1499`.
- Verdict: **REAL** — real fixtures, real ffmpeg.wasm implementation, and a strict bit-exact-PCM + STREAMINFO metamorphic oracle.
- Cached note: the winning ffmpeg.wasm entry is `cached: true` ("cached previous PASS result"). The PASS reflects a prior run, not a fresh execution in this run, so there is mild staleness risk per the launcher-seeding caveat; the measurements are internally consistent and physically plausible, so the cached result is credible but was not re-verified live.

## Confidence & caveats
- Confidence: **high** on the winner decision — only one eligible engine, a strict bit-exact oracle, and a verified real implementation path.
- Caveat 1: the winning result is cached; a truly fresh re-run (clearing raw + .browser-cache) would remove the staleness asterisk.
- Caveat 2: no perf bench exists for this scenario, so the win is purely correctness-based; there is no head-to-head metric race because no other engine even attempted output.
- Caveat 3: the six NAs are honest given current declarations, but several engines (e.g. mediabunny) could in principle implement FLAC trim — the NA reflects a deliberate non-declaration, not a hard library impossibility, so "best" here means "only engine that does it," not "only engine that ever could."
