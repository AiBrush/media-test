# trim/audio_aac_adts_copy

family: trim | fixture asset: `aac_adts.aac` (raw ADTS AAC, container `adts`, ~164 KB) | primaryMetric: wall | passCount: 2

Restated concretely: take the real fixture `fixtures/media/aac_adts.aac` (a headerless ADTS AAC
elementary stream), perform a **copy-trim** (no re-encode) of the range startUs=2,000,000 →
endUs=7,000,000 (a 5.000 s window), emit a new ADTS stream, and check via the `trim-boundaries`
oracle that the output duration is within ±0.1 s of the requested 5 s. The cut must land on
1024-sample ADTS frame boundaries. Of the 7 engines, only 2 declare `trim` and both PASS; the
question is which of those two is the better framework for this codec/container/operation.

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- **Contested**: yes — 2 engines PASS (`ffmpeg-wasm`, `mediabunny`) with **identical correctness**.
- **Decisive factor: performance**, because correctness is a tie. Both pass the *same* and *only*
  gating oracle `trim-boundaries` with byte-for-byte identical measurements
  (outDurationSec=5.034666…, requestedDurationSec=5, durationDeltaSec=0.034666…,
  boundaryFrameComparisons=0). With correctness equal, the tie breaks on the primaryMetric `wall`.
- **Margin over runner-up (mediabunny):** wall median **6.025 ms vs 13.360 ms ≈ 2.22× faster**;
  throughputRealtime **1664.9× vs 750.8× ≈ 2.22× higher**. mediabunny reported peakMemory
  46.78 MB while ffmpeg did not sample memory (n=0). longtasks: ffmpeg 874 ms vs mediabunny 1073 ms
  (ffmpeg ~0.81×, lower/better). Caveat: every bench is **n=1, cached==true** (mad=0, p95=median),
  so this is single-sample evidence, not a distribution — the ratio is directionally clear but weak.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | trim-boundaries:true | 6.025 ms | 1664.90x | 0 (n=0, not sampled) | 874 ms | cached previous PASS result |
| mediabunny@1.48.0 | **PASS** | trim-boundaries:true | 13.360 ms | 750.82x | 46,776,379 B (46.78 MB) | 1073 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

This is a **stream-copy trim of a raw ADTS AAC elementary stream** — no MP4/MOV box surgery, no
seek index (raw ADTS is a headerless, self-framing frame stream: each access unit carries its own
7-byte ADTS header with a 13-bit frame length, ISO 13818-7). A copy-trim therefore reduces to
"locate the ADTS frames overlapping [2 s, 7 s), copy their bytes, drop the rest." Both winners
implement exactly that, and because AAC frames are fixed 1024 samples (≈23.2 ms at 44.1 kHz, or
~21.3 ms at 48 kHz), a copy trim can only cut on frame boundaries — hence the **0.0347 s overshoot
that both engines report identically**: the requested 5.000 s window straddles partial frames, so
both keep the same one or two edge frames and emit the same 5.0347 s. The fact that the two
independent codepaths agree to ~1e-15 on outDurationSec is strong evidence both are doing an honest
frame-granular copy on the same fixture, not rounding to the request.

ffmpeg.wasm's trim takes the keyframe-aligned fast path (scenario `frameAccurate:false`):
`src/engines/ffmpeg-wasm/adapter.ts:2613-2627` builds `-ss <start> -i <in> -map 0 -t <dur> -c copy`
with `-ss` placed **before** `-i` (input seek to nearest preceding frame) and `-avoid_negative_ts
make_zero` (line 2629). For audio every frame is independently decodable, so input-seek + `-c copy`
yields a clean frame-accurate-by-construction cut with zero decode/encode work — pure demux + remux
of compressed packets. That is why its wall is only 6.025 ms and throughputRealtime hits 1664.9×
realtime: it never touches the AAC decoder. The single-thread wasm core's startup cost is amortized
(cached run), so the measured wall reflects almost only the memfs write + packet copy + memfs read.

mediabunny's trim (audio packet-copy path, `src/engines/mediabunny/adapter.ts:945-993`) is equally
legitimate but heavier: it constructs an `EncodedPacketSink` over the input audio track and iterates
`sink.packets(undefined, undefined, { verifyKeyPackets: true })` (line 952), keeping packets whose
`[timestamp, timestamp+duration)` overlaps the range (lines 953-955), **re-times each packet
relative to the first kept packet** (`pkt.timestamp - originSec`, line 960), copies the payload
bytes (`copyBytes(pkt.data)`, line 958) into a fresh `EncodedPacket`, attaches a reconstructed
`decoderConfig` (codec string, sampleRate, channels, ASC `description`) on the first packet
(lines 964-974), and re-muxes through a new `mb.Output`/`EncodedAudioPacketSource` with
`output.finalize()` (line 986). This is a real packet-copy remux — correct, but it pays for
per-packet object allocation, key-packet verification, and a full re-mux pass, plus it runs on the
WebCodecs/streaming-lockstep pipeline (`configUsed.backend="webcodecs"`,
`pipeline="streaming-lockstep"`, `hwAccel="prefer-hardware"`, `coopCoep="not-required"`,
`wasmThreads:0`, `sharedArrayBuffer:false`). That overhead shows up as 13.360 ms wall (2.22× slower)
and a sampled 46.78 MB peak heap. For *this* operation — where no decode/encode is needed and no
container box rewrite is involved — ffmpeg's lean `-c copy` demux/remux is simply the lighter path.

Correctness is genuinely a draw: both pass only the duration leg of `trim-boundaries`
(`src/core/oracles.ts:2388-2400`); the boundary-frame-digest leg is deliberately skipped
(`boundaryFrameComparisons:0`) because for a sub-range trim the loaded golden is a source-prefix,
not a trim-range golden (`oracles.ts:2405-2431`), and ADTS has no decoded video boundary frames. So
neither engine earns extra correctness credit, and performance is the only separator.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on performance only. Same single oracle, identical duration
  measurements. Metric gap: wall 13.360 ms vs 6.025 ms (2.22× slower), throughputRealtime 750.82×
  vs 1664.90× (0.45×), longtasks 1073 ms vs 874 ms, and it sampled 46.78 MB peak memory vs ffmpeg's
  unsampled 0. Its packet-copy + re-mux + WebCodecs-pipeline overhead is heavier than ffmpeg's
  `-c copy` for a pure copy-trim. Loss is real but on n=1 cached samples.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'." Honest NA. The
  WebCodecs/`<video>` platform layer has no trim/remux primitive; declaring it would be a false
  capability.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare `trim`. Honest — web-demuxer is a demux-only
  library (it parses packets but does not mux/write output), so trim is genuinely out of scope.
- **mp4box@2.3.0** — NA_ENGINE: does not declare `trim`. Plausible-but-arguable: mp4box can fragment
  and rewrite MP4 boxes, but this fixture is **raw ADTS, not MP4**, so an MP4-box tool has no
  container to edit here regardless — the NA is correct for this input.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare `trim`. Honest — media-parser is a
  read/parse-only library, no output path.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare `trim`. This is the most arguable NA
  (remotion-webcodecs can transcode), but it does not expose a copy-trim operation in its adapter,
  so the runner records a true NA_ENGINE rather than attempting and failing.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/trim/index.ts:356-368` — id `audio_aac_adts_copy`, asset
  `aac_adts.aac`, container `adts`, audioCodec `aac`, startUs 2,000,000, endUs 7,000,000,
  frameAccurate false, durationToleranceSec 0.1, extraOracles `BOUNDARIES_ONLY`. notes: "Raw ADTS
  AAC copy-trim; headerless frame-stream, cut on 1024-sample ADTS frame boundaries." The reduced
  oracle set (boundaries only, no playback/reimport) is justified in the notes: "Raw ADTS has no
  global index and <video> playback of a bare .aac is unreliable → reimport only."
- **Fixture exists:** `fixtures/media/aac_adts.aac` present, ~164 KB real file (stat confirmed). Not
  synthetic/empty/mock.
- **Gating oracle:** `trim-boundaries` at `src/core/oracles.ts:2348-2435`. It probes the trimmed
  output duration (reference-engine probe, else decoded frame-pts span, else simple-container
  parse) and compares to the requested range with a 0.1 s tolerance (lines 2388-2400). The
  measurement is physically plausible: 5.0347 s out vs 5.000 s requested, a 0.0347 s overshoot equal
  to ~1.5 ADTS frames of slack — exactly what a frame-granular copy of a real 5 s window produces.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2538-2645` (`trim`). Genuine: real wasm
  invocation `await this.run(args)` (line 2636) with `-ss/-i/-t -c copy` (lines 2613-2627), reads
  the produced bytes back from memfs (`readBinary(outName)`, line 2637). No canned output, no
  input→output passthrough, no short-circuit to a golden, no swallowed errors (it throws on
  malformed/mutated/out-of-domain input, lines 2550-2561). The output is the muxer's actual bytes.
- **Verdict: REAL** for the implementations and fixture — real fixture + real `-c copy` wasm trim +
  a real duration comparison against a measured output. One qualifier: the **gate is duration-only**
  (boundaryFrameComparisons=0, no bit-exact/golden-packet check), which is a moderate-strength gate,
  not a strong one. It cannot, by itself, prove the kept *bytes* are the correct frames — only that
  the output length is right. So the PASS is genuine but not maximally strong (verges on WEAK-GATE
  on oracle strictness); the implementations themselves are not cheating.
- **Cached note:** **both** PASS results have `cached==true` ("cached previous PASS result"), so the
  bench numbers (all n=1, mad=0, p95==median) were *reused, not re-run*. Staleness/single-sample
  risk is real; the 2.22× wall margin is directionally credible but should be re-measured fresh
  before being treated as a stable performance claim.

## Confidence & caveats

- Confidence: **medium**. Winner selection is unambiguous (only 2 eligible, correctness tied,
  ffmpeg clearly faster on the primaryMetric), but it rests on **n=1 cached** benches and a
  **duration-only oracle** that does not verify frame bytes.
- The performance margin (2.22× wall, 2.22× throughput) has no variance to back it (mad=0 because
  there is a single sample). A fresh multi-sample re-run could narrow or widen it.
- ffmpeg's peakMemory was not sampled (n=0), so the memory comparison is one-sided; do not read the
  "0 vs 46.78 MB" as ffmpeg using no memory — it means memory was not measured for that engine.
- If the suite later bakes a trim-range golden for ADTS, the boundary-frame-digest leg would
  activate and could differentiate the two engines on byte-exact correctness; today it does not.
