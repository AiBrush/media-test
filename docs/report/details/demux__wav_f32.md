# demux/wav_f32

- **Family:** demux
- **Fixture asset:** `fixtures/media/wav_f32.wav` (1.9 MB, real WAV PCM float32 container)
- **Goldens:** `fixtures/golden/wav_f32.wav.meta.json`, `fixtures/golden/wav_f32.wav.packets.json`
- **Primary metric:** wall (ms, lower better)
- **Pass count:** 3 / 7 (4 NA_ENGINE)
- **Operation:** demux a WAV file containing raw little-endian 32-bit float PCM (`pcm-f32`), emitting a packet table whose per-track aggregate byte count, first PTS, and duration match the ffprobe golden.

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (3 engines PASS the same `golden-packets` oracle with identical correctness).
- **Decisive factor:** PERFORMANCE. All three passers satisfy the PCM-aggregate `golden-packets` gate with byte-identical measurements (track0 1,920,000 == 1,920,000 bytes, firstPtsDelta 0 µs, durationDelta 0 s), so correctness is a tie. mediabunny wins on wall-clock.
- **Margin over runner-up:** mediabunny median **5.385 ms** vs platform **8.175 ms** = **1.52× faster wall**; vs ffmpeg.wasm 15.75 ms = **2.93× faster wall**. (See caveats: every result is `cached==true` and `n==1`, so the margin is single-sample evidence.)

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | golden-packets:true | **5.385 ms** | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 8.175 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 15.75 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-f32' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare audio codec 'pcm-f32' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

No engine reported throughputRealtime, peakMemory, or longtasks for this scenario; only `wall` is present in `bench{}`.

## Why the winner wins (deep technical)

**Container / codec context.** This is the simplest possible demux: a RIFF/WAVE file whose `data` chunk is a contiguous blob of interleaved 32-bit IEEE-float samples (`pcm-f32`). There is no per-frame framing in the bitstream — WAV PCM has no packets, only one monolithic `data` chunk. A demuxer therefore *invents* packet boundaries by slicing the PCM blob, and different engines pick different slice granularities. This is visible in the shard: mediabunny and platform each emit **118 chunks**, ffmpeg.wasm emits **469 chunks**, against a golden of **59 chunks**. The `golden-packets` oracle is aware of exactly this: `usesPcmAggregatePacketOracle()` (`src/core/oracles.ts:798`) detects container=="wav" with a `pcm-*` audio track and routes to `pcmAggregatePackets()` (`src/core/oracles.ts:807`), which deliberately does **not** compare packet count or per-packet sizes. Instead it sums bytes per track and requires the totals to match exactly (`src/core/oracles.ts:834-838`), plus first-PTS within `seekToleranceUs` (`:840-844`) and duration within `durationToleranceSec` (`:848-858`). That is why three different chunkings (118, 118, 469) all legitimately PASS — the gate is on the reconstructed PCM payload, not the arbitrary slicing.

**Why all three are correct, byte for byte.** For mediabunny: `measuredCount=118`, `track0MeasuredBytes=1920000`, `track0GoldenBytes=1920000`, `track0FirstPtsDeltaUs=0`, `durationDeltaSec=0`. Identical totals for platform (`measuredCount=118`) and ffmpeg.wasm (`measuredCount=469`). 1,920,000 bytes = 480,000 float32 samples; for stereo float32 that is 240,000 frames, consistent with a multi-second 48 kHz clip. The aggregate-byte match confirms every passer reconstructed the full `data` chunk with zero loss and zero padding, and started the stream at PTS 0 (delta 0 µs).

**Mechanistic reason mediabunny is fastest.** The mediabunny adapter's `demux()` (`src/engines/mediabunny/adapter.ts:1152-1183`) opens the input through mediabunny's pure-TypeScript ESM core (`env.configUsed.coreBuild=="pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`) and iterates `EncodedPacketSink.packets(undefined, undefined, { verifyKeyPackets: true })` (`adapter.ts:1162-1176`), reading `byteLength` and `microsecondTimestamp` per chunk. For raw PCM this is essentially a buffer walk over the `data` chunk with no codec parsing, no decode, and no WASM boundary crossing — a tight in-engine JS loop. That is why it lands at 5.385 ms.

The **platform** engine (`env.configUsed.backend=="webcodecs"`, `hwAccel:true`, `pipeline:"streaming"`) produces the same 118-chunk slicing and the same byte-perfect totals but runs at 8.175 ms — about 2.8 ms / 1.52× slower. For PCM-f32 WebCodecs hardware acceleration buys nothing (there is no codec to accelerate); the extra cost is the browser media-stack plumbing around an op that mediabunny does inline.

**ffmpeg.wasm** also passes byte-exact (1,920,000 == 1,920,000) but is the slowest at 15.75 ms (2.93× slower than mediabunny). It emits 469 chunks — a much finer slicing of the same PCM blob — and pays the single-thread WASM demuxer overhead (libavformat WAV parsing inside the emscripten module) for what is fundamentally a memcpy of one chunk. Correctness identical; throughput loses.

Decisive factor restated: **comparable (byte-identical) correctness → wall-clock tiebreak → mediabunny's pure-TS inline PCM walk beats both the WebCodecs plumbing path and the WASM demuxer.**

## What each other framework did wrong

- **platform@chrome-149** — PASSED, but lost on performance: 8.175 ms vs mediabunny 5.385 ms (**1.52× slower wall**). Identical correctness (118 chunks, 1,920,000 bytes, ptsDelta 0, durationDelta 0). WebCodecs/hwAccel adds no benefit for raw PCM; it is overhead here.
- **ffmpeg.wasm@0.12.15** — PASSED, but lost on performance: 15.75 ms vs 5.385 ms (**2.93× slower wall**). Byte-exact correctness (469 chunks, 1,920,000 bytes) but pays single-thread WASM libavformat overhead for a trivial PCM slice.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare audio codec 'pcm-f32'". Honest NA — Remotion's WebCodecs path targets coded codecs, not raw float PCM; an undeclared capability, not a runtime failure.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare audio codec 'pcm-f32'". Honest NA, same rationale: the media-parser does not list pcm-f32 among its readable audio codecs.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'wav'". Honest NA — mp4box is an ISO-BMFF (MP4) parser; it does not read RIFF/WAVE at all.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'wav'". Honest NA — its declared container set excludes WAV.

All four NAs are container/codec-capability declarations (NA_ENGINE = op not declared in `requires`), not swallowed errors. They look genuine: mp4box (MP4-only) and web-demuxer genuinely don't read WAV, and the two Remotion engines genuinely don't declare pcm-f32.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:240-245` — `{ asset: 'wav_f32.wav', container: 'wav', audioCodecs: ['pcm-f32'], notes: 'WAV PCM f32: float sample packing; packet sizes must match golden frame boundaries.' }`, mapped to id `demux/wav_f32` by the `defineScenario` map at `:256-269` with `op: 'demux'`, `requires.containersIn: ['wav']`, `requires.audioCodecs: ['pcm-f32']`.
- **Fixture exists & is real:** `fixtures/media/wav_f32.wav` present, **1.9 MB** — a genuine multi-second float32 PCM file, not synthetic/empty/mock. Goldens present: `fixtures/golden/wav_f32.wav.meta.json` and `.packets.json` (6.7 KB, 59-chunk golden table).
- **Oracle:** `golden-packets` → `pcmAggregatePackets()` at `src/core/oracles.ts:807-867`, dispatched by `usesPcmAggregatePacketOracle()` at `:798-805`. It performs a REAL comparison: per-track summed PCM bytes must equal golden exactly (`:838`), first PTS within tolerance (`:842`), duration within tolerance (`:853`). Measurements are physically plausible: 1,920,000 bytes = 480,000 float32 samples, consistent with the 1.9 MB fixture; firstPtsDelta 0 and durationDelta 0 are exact, not loose. The gate ignores packet count by design (correct for unframed PCM) but is NOT trivially satisfiable — a wrong byte total or a dropped/duplicated `data` chunk would fail.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1152-1183` (`demux`). Genuinely calls the real library: `openInput()`, `mbInput.getTracks()`, `new this.lib.EncodedPacketSink(track)`, `sink.packets(..., { verifyKeyPackets: true })`. It reports `pkt.byteLength` and `pkt.microsecondTimestamp` directly — no canned output, no input→output copy, no short-circuit to the golden file, no error swallowing (errors propagate; `mbInput.dispose()` in `finally`).
- **Cached note:** **All three PASS results have `cached==true`** (reason "cached previous PASS result"). Evidence is reused, not freshly re-run in this batch; per the launcher seeding caveat, stale PASS reuse is a known risk. The byte-exact measurements and real adapter/oracle code make the underlying PASS credible, but the wall-time margins specifically rest on cached single-sample runs.
- **Verdict:** **REAL** — real 1.9 MB fixture, real mediabunny library demux, meaningful byte-exact aggregate oracle with plausible measurements. (Strength qualifier: the oracle is structural/metadata-exact aggregate, not bit-exact per-packet; it is the correct gate for unframed PCM but is one rung below crypto/decoded-bitexact on the correctness ladder.)

## Confidence & caveats

- **Confidence: medium.** Correctness verdict is solid (byte-exact aggregate, real code paths, real fixture). The *winner-selection* is performance-driven and rests on weak statistical evidence.
- **n==1, mad==0, p95==median** for every engine — each wall median is a single sample. The 1.52× margin over platform is real but not robustly characterized; a re-run could narrow or invert a margin this small (5.385 vs 8.175 ms, ~2.8 ms absolute).
- **All results cached==true** — none were re-executed in this run; mediabunny's adapter file timestamp is recent ("2 hours" / "78k"), so the cached PASS may predate adapter edits. A fresh run (clear raw + .browser-cache) would harden the wall-time claim.
- The decisive metric is the only metric available (no memory/throughput/longtask data), so the tiebreak rests entirely on wall-clock.
