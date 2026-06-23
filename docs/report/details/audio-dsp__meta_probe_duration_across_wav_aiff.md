# audio-dsp/meta_probe_duration_across_wav_aiff

- **Family:** audio-dsp
- **Fixtures (assets):** `fixtures/media/wav_s16.wav` (960 KB, PCM s16le, 48 kHz stereo, 5 s) and `fixtures/media/pcm_s16be.aiff` (960 KB, PCM s16be, 48 kHz stereo, 5 s)
- **Operation:** `probe` (metamorphic A.16: probe(x).dur consistent across containers)
- **Primary metric:** wall (median ms)
- **Pass count:** 1 of 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` (env.engineId `ffmpeg-wasm`).
- **Contested?** No — **uncontested**. Exactly one engine reached `status=="PASS"`; the other six are `NA_ENGINE`.
- **Decisive factor:** Capability coverage. This is a *two-input cross-container* metamorphic probe requiring an engine that declares **both** `wav` AND `aiff` as input containers. Only ffmpeg.wasm declares `aiff` (and `wav`); every other engine is pre-negotiated out by the runner because it does not declare one of the two containers, so it never runs the oracle at all.
- **Margin over runner-up:** Not applicable — there is no second PASS. The runner-up engines produced no oracle outcomes and no bench samples (NA_ENGINE entries carry empty `oracleOutcomes` and no `bench`).

## Per-engine results

| Engine | Status | Oracles passed | Wall median | throughputRealtime | peakMemory | longtasks | Reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | property-invariant:pass | 34.64 ms | n/a | 69,717,662 B (~66.5 MB) | n/a | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |

Bench notes: the winner's wall and peakMemory are each `n=1` (single sample, `mad=0`, `p95==median`), so the timing is a single-shot point estimate, not a distribution. throughputRealtime / longtasks are not collected for this `probe` scenario (metrics declared are only `wall`, `peakMemory` — see `src/scenarios/audio-dsp/index.ts:756`).

## Why the winner wins (deep technical)

This scenario is a metamorphic *invariant* test, not a transcode/decode. The property under test (`src/scenarios/audio-dsp/index.ts:730-740`): the **same 5 s 48 kHz/stereo sine PCM** is delivered two ways — little-endian PCM in a RIFF/WAVE container (`wav_s16.wav`, codec `pcm-s16`) and big-endian PCM in an AIFF/Apple chunk container (`pcm_s16be.aiff`, codec `pcm-s16be`) — and a correct prober must report the **same duration** for both, independent of byte order and container framing. The `requires.containersIn` is therefore `['wav','aiff']` and `audioCodecs` is `['pcm-s16','pcm-s16be']`.

ffmpeg.wasm is the only engine that declares both containers. Its capability table (`src/engines/ffmpeg-wasm/codecs.ts:78` `wav: ['wav']`, `:83` `aiff: ['aiff']`) lets the runner pre-negotiate `containersIn` for **both** inputs, so the engine is admitted and actually executes the probe on each file.

Mechanically, the adapter's `probe()` (`src/engines/ffmpeg-wasm/adapter.ts:1892`) writes the input to the WASM MEMFS and calls `runInfo()` (`:1912`), which runs `ffmpeg -hide_banner -i <in>` with no output file. ffmpeg prints the Input block and exits non-zero ("At least one output file must be specified") — expected and caught (`:1918-1921`). The log is then parsed by `metadataFromLog()` (`:1946`), whose duration comes from `parseDurationSecFromLog()` (`:312-317`): a real regex `/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/` over ffmpeg's emitted `Duration: HH:MM:SS.ss` line, converted to seconds and rounded to ms. Note ffmpeg.wasm here deliberately avoids the broken vendored `_ffprobe` entry point (documented at `adapter.ts:262-267`) and derives metadata from the `ffmpeg` program log — the reliable path the other operations already drive. There is no hardcoding of "5"; the value is read from the demuxer's own header parse of each container.

The oracle is `property-invariant` dispatched to `probeDurationInvariant()` (`src/core/oracles.ts:2709-2712`, body at `:3823-3880`). It iterates `ctx.probeMetadatas` (one entry per input), and for each compares the **measured** `metadata.durationSec` against that input's **golden** `golden.meta.durationSec` with a per-container tolerance band (`durationToleranceFor`). The shard measurements are physically exact for both legs:

- `durationDeltaSec0 = 0`, `durationToleranceSec0 = 0.041666…` (≈ 1/24 s, the strict ±1-frame band)
- `durationDeltaSec1 = 0`, `durationToleranceSec1 = 0.041666…`

Both goldens confirm the target: `fixtures/golden/wav_s16.wav.meta.json` → `durationSec: 5`, `pcm-s16`, 48 kHz/2ch; `fixtures/golden/pcm_s16be.aiff.meta.json` → `durationSec: 5`, `pcm-s16be`, 48 kHz/2ch. ffmpeg.wasm read exactly 5.000 s from *both* the LE WAV and the BE AIFF — Δ of 0.0000 s against a 0.0417 s gate, i.e. it nailed the invariant with zero slack used, demonstrating correct RIFF `data`-chunk size ÷ byte-rate and AIFF `COMM` numSampleFrames ÷ sampleRate duration derivation across endianness.

Backend: pure single-thread WASM on Chromium 149 (M1 Max via ANGLE Metal per env). No GPU/WebCodecs needed — this is a header parse. Peak memory ~66.5 MB reflects the ffmpeg core + two 960 KB buffers in MEMFS; wall 34.64 ms is the parse + two `ffmpeg -i` invocations.

## What each other framework did wrong

- **mediabunny@1.48.0** — `NA_ENGINE`: "engine does not declare input container 'aiff'". It declares `wav` (`src/engines/mediabunny/codecs.ts:174`) but not AIFF, so it cannot satisfy the two-container requirement and was honestly pre-negotiated out. Under-declaration is plausible (mediabunny is WAV-capable) but AIFF is genuinely outside its container set, so the NA is honest, not a missed win.
- **platform@chrome-149** — `NA_ENGINE`: "does not declare input container 'aiff'". The WebCodecs/HTMLMediaElement platform path has no AIFF demuxer surface in this harness. Honest NA.
- **mp4box@2.3.0** — `NA_ENGINE`: "does not declare input container 'wav'". MP4Box is an ISO-BMFF (MP4/MOV) tool; it parses neither RIFF/WAVE nor AIFF. Honest NA — wrong tool for raw PCM containers.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "does not declare input container 'aiff'". No AIFF demuxer declared. Honest NA.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "does not declare input container 'wav'". No WAV input declared. Honest NA.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "does not declare input container 'aiff'". No AIFF demuxer declared. Honest NA.

None of the six FAILed an oracle; all were filtered before execution on declared-capability grounds. There are no competing measurements to compare against.

## Anti-cheat validation

- **Scenario:** `src/scenarios/audio-dsp/index.ts:730-740` (id `meta_probe_duration_across_wav_aiff`, `op: 'probe'`, `input: ['wav_s16.wav','pcm_s16be.aiff']`, `oracles: ['property-invariant']`, `options.invariant: 'probe-duration'`). Notes (`:738-739`) state the A.16 metamorphic rationale: same PCM sine in WAV vs AIFF must report equal duration.
- **Fixtures exist and are real media:** `fixtures/media/wav_s16.wav` and `fixtures/media/pcm_s16be.aiff` both present at 960 KB each (≈ a real 5 s 48 kHz/stereo/16-bit PCM payload: 48000×2×2×5 = 960,000 bytes of samples + header — sizes match exactly). Not synthetic/empty/mock. Two distinct files with different byte order and container, as the invariant requires.
- **Goldens:** `fixtures/golden/wav_s16.wav.meta.json` and `fixtures/golden/pcm_s16be.aiff.meta.json` both independently committed `durationSec: 5`; the oracle compares each input to its own golden, not cross-copied.
- **Winner adapter genuinely implemented:** `src/engines/ffmpeg-wasm/adapter.ts:1892` `probe()` → `:1912` `runInfo()` runs the real vendored ffmpeg WASM (`ffmpeg -i`) → `:1946` `metadataFromLog()` → `:312` `parseDurationSecFromLog()` extracts duration via regex from ffmpeg's own log. No canned constant, no short-circuit to the golden, no input→output copy, errors are surfaced (`:1924-1928` throws if no `Input #` block). Real demux of each container.
- **Oracle meaningful:** `src/core/oracles.ts:3823-3880` `probeDurationInvariant` does a real numeric `|measured − golden|` comparison per input against a strict ±1-frame band (0.0417 s), not a smoke/loose gate. Measurements are physically plausible: both deltas exactly 0 against 5.000 s goldens; tolerance 0.0417 s is tight. It would FAIL on a wrong-endianness or wrong-chunk-size misread.
- **Cached:** `cached==true`, reason "cached previous PASS result". The PASS was **reused, not re-run** in this batch (startedAt 2026-06-22T16:57:16Z). Staleness risk is low because the underlying inputs, goldens, and parse path are deterministic header reads, but the timing/memory bench (n=1) is a stale single sample and should not be over-interpreted.

**validationVerdict: REAL** — real two-file fixtures that exist on disk, a genuine ffmpeg-WASM demux/duration-parse implementation, and a strict per-input duration-equality oracle with exact (Δ=0) physically plausible measurements.

## Confidence & caveats

- **Confidence: high** on the verdict and validation. The winner is the only PASS and the only engine declaring both containers; the oracle and adapter are concrete and were read at the cited lines.
- Caveats: (1) result is **cached** (`cached==true`) — re-run for fresh timing if bench numbers matter. (2) Bench is `n=1` (no spread), so 34.64 ms / 66.5 MB are point estimates, not robust. (3) Six engines are NA on capability declaration, not on demonstrated incorrectness — they are not proven *wrong* at AIFF/WAV duration, only not admitted; an under-declaration audit could in principle expand the field (mediabunny/web-demuxer notably handle one of the two containers), but AIFF remains genuinely outside most of their declared surfaces.
