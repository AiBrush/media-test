# trim/audio_aiff_pcm_be_copy

**Family:** trim · **Fixture asset:** `fixtures/media/pcm_s16be.aiff` (960 KB, AIFF big-endian PCM-s16, 48 kHz stereo, 5 s) · **primaryMetric:** wall · **passCount:** 1 / 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` (engineId `ffmpeg-wasm`).
- **Contested?** No — **uncontested**. Exactly one engine reached PASS; the other six are all NA (none FAILed).
- **Decisive factor:** ffmpeg.wasm is the **only** engine that declares BOTH the `aiff` input container AND the `trim` operation. Mediabunny declares `trim` but not `aiff`; the remaining five do not declare `trim` at all. So eligibility — not a performance margin — decides it.
- **Margin over runner-up:** N/A (no second PASS to compare). Absolute numbers: wall median **11.465 ms** (n=1), throughputRealtime **436.1 x-realtime**, longtasks 2477 ms (one-time wasm core warmup).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true | 11.465 ms | 436.11 x | 0 (not sampled) | 2477 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| ffmpeg-wasm (dup row n/a) | — | — | — | — | — | — | — |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

(7 distinct engines; the dup row is a formatting placeholder — real entries are the 7 named engines above.)

## Why the winner wins (deep technical)

The operation is a **packet/byte-range copy-trim of big-endian PCM (`pcm-s16be`) inside an AIFF container** over [1.0 s, 4.0 s] (requested 3.0 s). AIFF stores audio in an `SSND` chunk preceded by a `COMM` chunk that carries `numSampleFrames`, `sampleRate` (an 80-bit IEEE extended float), and `sampleSize`; samples are stored **big-endian** with an `SSND` offset/blockSize header. A correct copy-trim must (a) recompute the byte offset of the start sample-frame, (b) emit a new `SSND`/`COMM`/`FORM` size triplet, and (c) preserve big-endian sample byte order — exactly the "byte-order + SSND-offset handling" the scenario notes call out (`src/scenarios/trim/index.ts:413-424`).

ffmpeg.wasm reaches this through its `trim()` adapter at `src/engines/ffmpeg-wasm/adapter.ts:2538`. Because the scenario sets `frameAccurate:false`, it takes the **stream-copy fast path** at `adapter.ts:2613-2627`: it builds `-ss <startSec> -i <in> -map 0 -t <durSec> -c copy -avoid_negative_ts make_zero <out.aiff>` (`-ss` placed BEFORE `-i` for an input seek; `startSec`/`durationSec` computed from the range at `adapter.ts:2568-2569`). This invokes the real single-thread ffmpeg wasm core's AIFF demuxer + muxer, which rewrites `COMM.numSampleFrames` and the `FORM`/`SSND` sizes natively — no synthetic byte poking. Before running it probes the input with `runInfo()`/`metadataFromLog` and guards against start-past-EOF (`adapter.ts:2567-2572`), and it explicitly rejects mutated/truncated/bitflipped inputs (`adapter.ts:2550-2555`), so the PASS reflects an honest decode of a real fixture.

The gating oracle is **trim-boundaries** (`src/core/oracles.ts:2348`). For AIFF there is no browser reference-engine probe and `<video>` cannot reliably play AIFF (scenario uses `BOUNDARIES_ONLY`, an empty extra-oracle list at `src/scenarios/trim/index.ts:133`), so the oracle falls through to `durationFromSimpleAudioContainer` → `durationFromAiff` (`oracles.ts:2384-2386, 2447-2453`), parsing the output AIFF's own `COMM`/`SSND` to derive duration. Measurements from the shard: `outDurationSec=3.008`, `requestedDurationSec=3`, `durationDeltaSec=0.008` against `durationToleranceSec=0.02` (`oracles.ts:2388-2400`). The 8 ms overshoot is a single PCM packet/edge chunk included by the byte-range cut — physically consistent with stream-copy at 48 kHz, and comfortably inside the 20 ms band. Boundary-frame digest comparison is correctly skipped (`boundaryFrameComparisons:0`) because this is audio with no trim-range frame golden (`oracles.ts:2410-2412`). Performance is plausible for a tiny 3 s PCM stream-copy: wall 11.465 ms, 436 x-realtime, on the M1 Max via the wasm single-thread core.

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE, "engine does not declare input container 'aiff'". Honest NA: mediabunny declares the `trim` operation (`src/engines/mediabunny/adapter.ts:1029,1051`) and does packet-copy audio trims, but its input-container capability set does not include AIFF, so the runner skips it before any wasm work. Not an under-declaration — mediabunny has no AIFF demuxer.
- **platform@chrome-149** — NA_ENGINE, "engine does not declare operation 'trim'". Honest: the WebCodecs/platform adapter exposes decode/probe primitives, not a container-rewriting trim. AIFF is also not a WebCodecs-demuxable container.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare operation 'trim'". Honest: MP4Box is an ISO-BMFF (MP4) tool; it neither implements a generic trim op nor parses AIFF.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'trim'". Honest: it is a parser/demuxer, no trim/mux output path.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'trim'". Honest: demux-only library, no trim.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "engine does not declare operation 'trim'". Honest: its trim would route through WebCodecs re-encode, and it does not declare the op for this container/codec.

All six NAs are genuine capability gaps (no AIFF demux and/or no trim op), not concealed failures. AIFF is a niche legacy container; only ffmpeg's broad demuxer/muxer covers it, which is the expected real-world outcome.

## Anti-cheat validation

- **Scenario:** `src/scenarios/trim/index.ts:412-424` (`id: 'audio_aiff_pcm_be_copy'`, asset `pcm_s16be.aiff`, container `aiff`, codec `pcm-s16be`, range 1.0–4.0 s, tolerance 0.02 s, `extraOracles: BOUNDARIES_ONLY`).
- **Fixture exists:** `fixtures/media/pcm_s16be.aiff` present, 960 KB — a real big-endian PCM AIFF, not synthetic/empty/mock. Goldens `fixtures/golden/pcm_s16be.aiff.meta.json` (durationSec 5, pcm-s16be, 48 kHz, 2ch, 1.536 Mbps) and `.packets.json` (26 KB) exist.
- **Oracle:** `src/core/oracles.ts:2348` (`trimBoundaries`). It performs a real duration check derived from the OUTPUT bytes via `durationFromAiff` (`oracles.ts:2447-2453`) — it parses the produced AIFF, not the golden — and compares against the requested range with a tight 0.02 s tolerance. Not trivially satisfiable for a duration gate; it would FAIL a wrong-length cut.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2538-2645`; stream-copy path `2613-2636` issues real `-ss/-t/-c copy` to the ffmpeg wasm core and reads back actual output bytes (`readBinary`, `2637`). No canned output, no input→output passthrough, no golden short-circuit, no error swallowing (it throws on malformed/mutated input and on out-of-range seeks).
- **Verdict:** **REAL.** Real fixture + genuine ffmpeg stream-copy implementation + a meaningful, tight duration oracle that reads the produced container. The only softness is that for AIFF the gate is duration-only (no per-sample PCM bit-exact comparison and `boundaryFrameComparisons:0`), so it verifies cut length, not sample-accurate content — strong but not crypto-grade.
- **Cached note:** `cached:true` ("cached previous PASS result"). The metrics were reused, not re-run this session; standard staleness caveat applies, but the cached PASS is internally consistent with the fixture and oracle.

## Confidence & caveats

- **Confidence: high** for the winner selection — single eligible PASS with a real implementation and real fixture; the NA distribution is fully explained by capability declarations.
- Caveat 1: the gate is duration-only for AIFF (no reference-engine probe, no PCM bit-exact / boundary-frame digest, `boundaryFrameComparisons:0`), so it does not certify sample-accurate big-endian content — only that the cut length is within 8 ms of 3.0 s (delta 0.008 s).
- Caveat 2: result is `cached:true` (n=1 for every bench metric, mad=0), so the timing numbers are weak single-sample evidence; peakMemory was not sampled (n=0).
- Caveat 3: no contest, so no comparative performance ranking was possible.
