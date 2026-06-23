# trim/audio_flac_noseektable_copy

family: trim | fixture asset: `fixtures/media/flac_noseektable.flac` (143 KB, exists) | primaryMetric: wall | passCount: 1

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** — UNCONTESTED (only 1 of 7 engines PASS).
Decisive factor: it is the **only engine that declares both the `trim` operation and the granular capability `trim:flac-no-seektable-frame-scan`**. The other six are NA before any work runs: five never declare `trim` at all, and mediabunny declares `trim` but not the no-seektable FLAC frame-scan feature. No runner-up exists, so there is no performance margin to report.

For reference, ffmpeg.wasm's measured run: wall median **10.28 ms** (n=1), throughputRealtime **972.76x**, longtasks **3045 ms**, peakMemory not sampled (n=0). The single gating oracle `trim-boundaries` passed with `durationDeltaSec=0` (out 5 s vs requested 5 s, tolerance 0.1 s).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:pass | 10.28 ms | 972.76x | n/a (n=0) | 3045 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'trim:flac-no-seektable-frame-scan' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The operation under test is a **stream-copy (no re-encode) trim of a native FLAC file that has NO SEEKTABLE metadata block**. The requested cut is `startUs=2_000_000 .. endUs=7_000_000` (a 5 s window), `frameAccurate=false`, with a loose 0.1 s duration tolerance. Because there is no seek index, the boundary frame must be located by scanning FLAC frames from the stream front — there is no `SEEKTABLE` to binary-search. This is exactly the case the scenario's `features: ['trim:flac-no-seektable-frame-scan']` gate demands proof of, and the `notes` field states it explicitly: "boundary must be found by a frame scan (no seek index)."

ffmpeg.wasm declares that capability at `src/engines/ffmpeg-wasm/adapter.ts:1498` (`'trim:flac-no-seektable-frame-scan'`), so the runner admits it. The actual copy-trim path is `trim()` at `src/engines/ffmpeg-wasm/adapter.ts:2538`. For `frameAccurate=false` it takes the fast keyframe-aligned copy branch at lines 2613-2627: `-ss <start>` placed BEFORE `-i` (input seek to the nearest preceding frame), then `-t <duration>` and `-c copy`. FFmpeg's FLAC demuxer performs the front-of-stream frame scan internally to position the seek when no seektable exists, which is the mechanism the feature token attests to. `-avoid_negative_ts make_zero` (line 2629) normalizes the output timestamp base.

The subtle correctness step is FLAC-specific: a raw stream copy leaves the `STREAMINFO` block's 36-bit **total-samples** field describing the ORIGINAL file, so a naive copy would report the wrong duration. The adapter fixes this at line 2638-2640 by calling `patchFlacStreaminfoTotalSamples(bytes, durationSec)` (`src/engines/ffmpeg-wasm/adapter.ts:819`). That function validates the `fLaC` magic, walks the metadata block chain to find block type 0 (STREAMINFO, len ≥ 34), reads the 20-bit sample rate, computes `totalSamples = round(durationSec * sampleRate)`, and bit-packs it into the 36-bit total-samples field with a `(1n<<36n)-1n` mask (lines 834-842). This is a genuine container-level repair, not a cosmetic edit — it makes the trimmed file self-describe its true duration so any downstream probe reads ~5 s.

The gating oracle `trim-boundaries` (`src/core/oracles.ts:2348`) then probes the output duration (via reference-engine probe, decoded frame-span, or `durationFromSimpleAudioContainer`) and compares against the requested 5 s. The shard's measurements confirm a real, physically plausible result: `outDurationSec=5`, `requestedDurationSec=5`, `durationDeltaSec=0` — exactly on target, well inside the 0.1 s tolerance. The boundary-frame digest comparison is intentionally skipped (`boundaryFrameComparisons=0`) because, per the oracle comment at lines 2405-2410, no trim-range frame golden is baked for audio; duration is the live gate here. So the STREAMINFO total-samples repair is precisely what is being validated, and it landed exact.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE: "engine does not declare feature 'trim:flac-no-seektable-frame-scan'". It DOES support generic trim and FLAC, but the suite requires explicit proof that a copy-trim can locate a boundary by frame scan and rewrite STREAMINFO without a seektable. mediabunny does not declare that token, so the NA is honest gating — not an under-declared bug, since the scenario `notes` justify why generic FLAC read/write is insufficient evidence for this specific case.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". The browser platform path (WebCodecs/MediaRecorder) has no container-level FLAC stream-copy trim; honest NA.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". MP4Box is an ISO-BMFF (MP4) tool; FLAC-native containers are out of its domain and it declares no trim op; honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". A parser/demuxer, not an editor; honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Demux-only; honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Its scope is WebCodecs transcode, not container copy-trim; honest NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:386` (id `audio_flac_noseektable_copy`), asset `flac_noseektable.flac`, container `flac`, codec `flac`, range 2_000_000..7_000_000 us, `features: ['trim:flac-no-seektable-frame-scan']`, `extraOracles: BOUNDARIES_ONLY` (empty array at index.ts:133 → only the base `trim-boundaries` gate).
- Fixture: `fixtures/media/flac_noseektable.flac` exists, 143 KB — a real, non-trivial FLAC file, not synthetic/empty/mock.
- Winner adapter: trim implementation `src/engines/ffmpeg-wasm/adapter.ts:2538` (copy branch 2613-2627, STREAMINFO repair call 2638-2640); repair function `src/engines/ffmpeg-wasm/adapter.ts:819`. It calls the real ffmpeg.wasm core (`this.run(args)` with `-c copy`) and does genuine FLAC bit-field rewriting — no canned output, no input→output passthrough, no short-circuit to golden, no swallowed errors (errors throw).
- Oracle: `trim-boundaries` at `src/core/oracles.ts:2348` performs a real duration probe/decode and a numeric tolerance comparison (`d > t.durationToleranceSec`). Measurements (`outDurationSec=5`, `delta=0`) are physically plausible for the requested 5 s cut.
- Verdict: **WEAK-GATE**. The implementation and fixture are real and the duration result is exact (delta 0 s), but the only gate is a duration-tolerance check with the boundary-frame digest skipped (`boundaryFrameComparisons=0`). It does not verify decoded-PCM bit-exactness of the cut content, only that the container self-reports the right length. The PASS is real but not the strongest possible correctness proof for a copy-trim.
- Cached note: ffmpeg.wasm's result has `cached==true` ("cached previous PASS result"). Staleness risk: the evidence was reused, not re-run this batch; numbers (wall 10.28 ms, 972.76x) reflect a prior run. The per-project memory flags stale-PASS reuse as a known caveat.

## Confidence & caveats

Confidence: **high** on the decision (1 PASS, 6 honest NA gated on declared capabilities; winner is uncontested by construction). Caveats: (1) winner result is cached, so timing/throughput are historical; (2) the gate is duration-only (WEAK-GATE) — no decoded-sample bit-exact verification of the trimmed FLAC content; (3) bench n=1 with peakMemory unsampled, so performance figures are single-shot and not used for ranking (no contest).
