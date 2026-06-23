# trim/audio_flac_seektable_copy

family: trim | fixture asset: `fixtures/media/flac_seektable.flac` (143 KB, exists) | primaryMetric: wall | passCount: 1/7

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** — **uncontested** (only 1 of 7 engines reached PASS).
Decisive factor: it is the **only engine that declares the feature `trim:flac-seektable-copy`**. The scenario is feature-gated (`features: ['trim:flac-seektable-copy']`), so the other six engines were ruled NA before execution. No runner-up margin applies (zero other PASS).

ffmpeg.wasm passed the `trim-boundaries` oracle exactly: requested 5.000000 s trim (startUs 2_000_000 → endUs 7_000_000), output duration 5 s, `durationDeltaSec = 0` against a 0.1 s tolerance. Wall median 6.885 ms (n=1), throughputRealtime 1452.4 x-realtime.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true | 6.885 ms | 1452.43 x | 0 (n=0) | 4223 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'trim:flac-seektable-copy' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

The operation is a **lossless copy-trim of a native FLAC stream that carries a SEEKTABLE metadata block**. FLAC is a raw codec stream wrapped in its own minimal container: a `fLaC` magic followed by a chain of metadata blocks (STREAMINFO is type 0 and mandatory and first), then frame data. A copy-trim must (a) cut on FLAC frame boundaries without re-encoding, and (b) repair the **STREAMINFO `total samples` field** so that probers compute the new, shorter duration — otherwise the trimmed file still advertises the original length. The scenario `notes` make this explicit: "generic FLAC read/write support does not prove a copy trim can update the total-samples duration," which is precisely why a dedicated `trim:flac-seektable-copy` feature gate exists.

ffmpeg.wasm runs the real wasm core. The trim path (`src/engines/ffmpeg-wasm/adapter.ts:2614-2627`) issues a keyframe-aligned fast trim: `-ss <startSec>` BEFORE `-i` (input seek to the nearest preceding frame), `-map 0`, `-t <durationSec>`, `-c copy` — i.e. no decode/encode of the FLAC samples. With startSec 2.0 and durationSec 5.0 this produces the 5 s sub-stream. Because the codec is FLAC and the trim is a non-frame-accurate copy, the adapter then runs the STREAMINFO repair: `src/engines/ffmpeg-wasm/adapter.ts:2638-2639` calls `patchFlacStreaminfoTotalSamples(bytes, durationSec)`.

That repair (`src/engines/ffmpeg-wasm/adapter.ts:819-849`) is a genuine container rewrite: it validates the `fLaC` magic, walks the metadata-block chain reading each block's last-flag/type/24-bit length, locates STREAMINFO (type 0, len ≥ 34), reads the 20-bit sample rate (bytes data+10..+12), computes `totalSamples = round(durationSec * sampleRate)`, and patches the 36-bit total-samples bitfield in place using a 64-bit big-int mask (`(1n<<36n)-1n`) over the 8 bytes at offset data+10. This is exactly the field a FLAC prober reads to report duration, so the rewritten file probes at 5 s — yielding the oracle's `outDurationSec = 5`, `durationDeltaSec = 0`.

The gating oracle `trim-boundaries` (`src/core/oracles.ts:2348-2435`) probes the trimmed output for duration (reference-engine probe, then decoded-frame-span proxy, then `durationFromSimpleAudioContainer`) and compares to the requested range. For audio-only FLAC there are no decoded VIDEO boundary frames and no trim-range frame golden, so the boundary-frame digest is deliberately skipped (`boundaryFrameComparisons: 0`) and duration is the live gate. The measured `durationDeltaSec` of 0 against a 0.1 s tolerance is the strongest result this oracle can produce for this fixture class.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE: "does not declare feature 'trim:flac-seektable-copy'". Honest NA. mediabunny declares the `trim` operation in general but not this specific FLAC STREAMINFO-repair feature; the gate correctly refuses to credit generic FLAC handling as proof of a copy-trim that rewrites total-samples.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare operation 'trim'". Honest. MP4Box is an ISO-BMFF box tool; it has no FLAC-native trim path and never declares the trim op.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'trim'". Honest. It is a demux-only library (no muxing/cutting output path).
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'trim'". Honest. A read-only parser with no output-writing trim capability.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare operation 'trim'". Honest for this fixture: a WebCodecs-based pipeline has no FLAC decoder in Chrome and no copy-trim path for the FLAC container, so it does not declare the op.
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'trim'". Honest. The platform (browser-native) engine exposes decode/playback primitives, not a container-level FLAC copy-trim writer.

None of the six NAs looks under-declared: the scenario is explicitly gated behind the `trim:flac-seektable-copy` feature, which is a narrow STREAMINFO-rewrite capability that only ffmpeg.wasm implements.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:369-384` (id `audio_flac_seektable_copy`, asset `flac_seektable.flac`, container/codec flac, startUs 2_000_000 → endUs 7_000_000, `features: ['trim:flac-seektable-copy']`, `tolerances.durationToleranceSec = 0.1`).
- Fixture: `fixtures/media/flac_seektable.flac` exists, 143 KB — a real FLAC file, not synthetic/empty/mock.
- Oracle: `trim-boundaries` at `src/core/oracles.ts:2348-2435`. Performs a real duration comparison (`Math.abs(outDurationSec - requestedSec) > t.durationToleranceSec` → fail). Measurements are physically plausible: 5 s out vs 5 s requested, Δ 0 s. The boundary-frame digest comparison is intentionally skipped (no video frames / no trim-range golden for audio), so this is a duration-only metadata gate, not a bit-exact gate.
- Winner adapter: trim path `src/engines/ffmpeg-wasm/adapter.ts:2614-2641` (real `-ss/-t -c copy` wasm run), STREAMINFO repair `src/engines/ffmpeg-wasm/adapter.ts:819-849`, feature declared `src/engines/ffmpeg-wasm/adapter.ts:1497`. The op is genuinely implemented: it shells the real ffmpeg wasm core and rewrites the FLAC total-samples bitfield; it does not return canned output, copy input→output unchanged, short-circuit to a golden, or swallow errors.
- Verdict: **WEAK-GATE**. The implementation and fixture are real, but the only active correctness check is a ±0.1 s duration tolerance with the boundary-frame digest disabled (`boundaryFrameComparisons: 0`). It is a structural/metadata duration gate, not a bit-exact packet/sample comparison; it cannot detect e.g. a wrong-but-near-duration cut or sample-level corruption. PASS is real but not strong.
- Cached note: ffmpeg.wasm's result has `cached: true` ("cached previous PASS result"). Numbers (wall 6.885 ms, throughput 1452.4 x, durationDelta 0) are reused, not freshly re-run; staleness risk if the adapter/oracle changed since the cache was written.

## Confidence & caveats

Confidence: **high** on the winner selection (uncontested — feature gate leaves exactly one eligible engine, and that engine's PASS rests on a genuine, inspected implementation). Caveats: (1) the gate is a duration-only proxy (WEAK-GATE), so "correctness" here means "duration within 0.1 s after STREAMINFO repair," not bit-exact FLAC frame integrity; (2) the winner is cached, so the bench/oracle numbers are not from this run; (3) bench n=1 (no spread/MAD beyond a single sample), so performance figures are weak evidence — though performance is moot with no contesting engine.
