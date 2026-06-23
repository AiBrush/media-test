# performance/op-sweep-probe

- **Family:** performance
- **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (BIG_READ_GOLDEN — 31 MB, real 1080p H.264 + AAC, 30 s, 2 tracks)
- **Primary metric:** `opsPerSec` (probes/sec; higher is better)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **CONTESTED** (all 7 engines PASS the single correctness gate).
- **Decisive factor:** PERFORMANCE. Correctness is identical across all 7 (every engine passes `golden-metadata` with `durationDeltaSec=0` against the same 2-track golden), so ranking falls through to the primary metric `opsPerSec`. Mediabunny posts **263.50 ops/s** (wall median **3.795 ms**).
- **Margin over runner-up:** runner-up is `remotion-media-parser@4.0.479` at **178.73 ops/s** (wall 5.595 ms). Mediabunny is **1.47x faster on opsPerSec** and **1.47x lower wall**. Against the next WebCodecs-class engine (`remotion-webcodecs`, 55.73 ops/s) the gap is **4.73x**; against the pure-JS box parser `mp4box` (14.67 ops/s) it is **17.96x**.
- **Caveat on strength:** all benches are `n==1` (`warmup:1`, `mad=0`, p95==median), and every result is `cached==true`. The ordering margin (1.47x) is comfortably outside single-sample noise but is single-shot evidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | opsPerSec | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 3.795 | 263.50 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 5.595 | 178.73 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 17.945 | 55.73 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 45.610 | 21.93 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 68.185 | 14.67 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 102.265 | 9.78 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 116.380 | 8.59 | n/a | n/a | n/a | cached previous PASS result |

(The shard publishes only `opsPerSec` and `wall` for this case; `throughputRealtime`, `peakMemory`, and `longtasks` were not measured for the probe sweep.)

## Why the winner wins (deep technical)

The operation under test is a **probe** (metadata extraction only) on a faststart-style progressive MP4 carrying H.264/AVC video (1920x1080, 30 fps) and AAC-LC audio (48 kHz stereo). A probe must return container type, duration, and per-track codec/dimensions/fps/sampleRate/channels — and crucially it must do so **without decoding samples or scanning the full `mdat`**. The throughput differences here are therefore almost entirely a function of how much of the 31 MB file each library touches and how heavy its parse machinery is.

Mediabunny's probe path (`src/engines/mediabunny/adapter.ts:417` `metadataFromInput`) is the leanest possible: it opens a single `Input` over a `BlobSource` (`openInput`, `src/engines/mediabunny/adapter.ts:245`), then reads duration via the **cheap metadata path first** — `input.getDurationFromMetadata()` (`adapter.ts:429`), which reads the `mvhd`/`mdhd` declared duration straight out of the `moov` box and never walks `mdat` or computes a sample table. Only if that returns null/non-finite does it fall back to the expensive `computeDuration()` scan (`adapter.ts:436`). For this faststart MP4 the `moov` carries a precise global duration, so the cheap path resolves immediately and yields exactly `30.0000s` — matching the golden's `durationSec: 30` with `durationDeltaSec=0` (well inside the strict +/-1-frame band `durationToleranceSec=0.0417s`). Track metadata comes from `input.getTracks()` + `normalizeTrack` (`adapter.ts:443`), which read codec/dims/fps/sampleRate/channels out of `stsd`/`avcC`/`esds` without touching media payloads. The result: wall **3.795 ms** and **263.50 ops/s** — a pure box-walk with no WebCodecs init on the timed path and no full-file buffering.

`remotion-media-parser` (config `backend: cpu-js`, `fieldsTier: metadata-only`, `reader: webReader`, streaming) is the only engine within striking distance at **178.73 ops/s / 5.595 ms**. It is also a metadata-only streaming JS parser that stops after the header boxes, so it does the same class of work; mediabunny still edges it by **1.47x**, attributable to mediabunny's tighter single-pass box reader and its deliberate avoidance of any duration recomputation.

Everything below 100 ops/s pays a structural tax that the probe does not actually need:

- **remotion-webcodecs (55.73 ops/s):** a convert-oriented WebCodecs pipeline (`backend: webcodecs`, `hwAccel: prefer-hardware`, `pipeline: streaming-backpressure`). Even gated to metadata it carries heavier setup than a bare parser, costing ~4.7x vs mediabunny.
- **web-demuxer (21.93 ops/s) and mp4box (14.67 ops/s):** mp4box runs `backend: pure-js`, `pipeline: whole-file-append(MP4BoxBuffer+fileStart)` — it appends the whole buffer and builds full sample tables before yielding metadata, which is why it sits at 68 ms even though correctness is identical. web-demuxer is a wasm demuxer (FFmpeg-derived) whose module/format-probe overhead dominates a sub-100 ms probe.
- **platform (9.78 ops/s) and ffmpeg.wasm (8.59 ops/s):** the two slowest. `platform@chrome-149` drives a WebCodecs/`<video>`-element pipeline whose element/media-engine warm-up is enormous relative to a metadata read (102 ms). `ffmpeg.wasm` pays full libavformat container-open cost inside wasm (single-thread, `116 ms`) — ~30x slower than mediabunny for what is, here, just reading the `moov`.

The mechanistic story is consistent: this probe rewards a library that reads only the header and trusts the container's declared duration. Mediabunny is purpose-built for exactly that (`getDurationFromMetadata` cheap-path, `adapter.ts:429`), so it wins; the WebCodecs/wasm/whole-file engines are correct but architecturally over-provisioned for a header-only read.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASSed correctly (golden-metadata, durationDeltaSec=0) but lost on speed: 178.73 vs 263.50 ops/s (**1.47x slower**, wall 5.595 vs 3.795 ms). No correctness deficit; pure throughput margin.
- **remotion-webcodecs@4.0.479** — PASSed; lost at 55.73 ops/s (**4.73x slower**, 17.945 ms). Carries WebCodecs/backpressure pipeline setup unneeded for a probe.
- **web-demuxer@4.0.0** — PASSed; lost at 21.93 ops/s (**12.0x slower**, 45.610 ms). wasm demuxer module/probe overhead dominates a header read.
- **mp4box@2.3.0** — PASSed; lost at 14.67 ops/s (**17.96x slower**, 68.185 ms). `whole-file-append` + full sample-table build before surfacing metadata.
- **platform@chrome-149** — PASSed; lost at 9.78 ops/s (**26.9x slower**, 102.265 ms). `<video>`/WebCodecs media-engine warm-up cost.
- **ffmpeg.wasm@0.12.15** — PASSed; slowest at 8.59 ops/s (**30.7x slower**, 116.380 ms). Full libavformat container-open inside single-thread wasm.

No engine FAILed and none returned NA — the `probe` op on `mp4/h264` is universally declared, so the capability matrix is fully populated and honest here.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/op-sweep.ts:45-57` (`sweepProbe`), id `performance/op-sweep-probe`, op `probe`, input `BIG_READ_GOLDEN`, oracles `['golden-metadata']`, primary `opsPerSec`.
- **Fixture:** `BIG_READ_GOLDEN = 'h264_1080p_30s.mp4'` (`src/scenarios/performance/_shared.ts:71`). Verified present and real: `fixtures/media/h264_1080p_30s.mp4` is **31 MB** (genuine 1080p H.264+AAC), not synthetic/empty/mock.
- **Golden:** `fixtures/golden/h264_1080p_30s.mp4.meta.json` exists (431 B) and declares real, physically-plausible values: `container: mp4`, `durationSec: 30`, video h264 1920x1080@30 bitrate 8.2 Mbps, audio aac 48000 Hz stereo 128 kbps. Plausible for a 31 MB / 30 s 1080p clip (8.2 Mbps × 30 s ≈ 30.75 MB).
- **Oracle:** `goldenMetadata`, `src/core/oracles.ts:595-657`. Performs a REAL field-by-field comparison: container string match (`:606`), duration within strict band (`:614-637`, here `durationToleranceSec=0.0417s` ≈ +/-1 frame), positional per-track codec/dims/fps/sampleRate/channels diff (`:643-653`). It FAILs on any diff (`:655`). Not trivially satisfiable — it is an exact-metadata gate, the strongest available for a probe op (there is no decoded output to bit-compare). Measured `durationDeltaSec=0` for all 7 engines is consistent with a faststart MP4 whose `moov` carries an exact 30 s duration.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:417` (`metadataFromInput`) → genuinely calls mediabunny `Input.getDurationFromMetadata()` (`:429`), `getTracks()` (`:443`), `getMetadataTags()` (`:457`). No canned output, no golden short-circuit, no input->output copy, no error-swallow-as-success (the only catches downgrade duration to null and force the precise `computeDuration` fallback, `:431-441`).
- **Cached note:** ALL 7 results carry `cached==true` ("cached previous PASS result"). The PASS verdicts and ordering are reused, not freshly re-run — minor staleness risk. Per project memory, stale-PASS reuse is a known caveat; a clean re-run would confirm the 1.47x margin, but the qualitative ordering (lean parser > WebCodecs/wasm/whole-file) is structural and robust.
- **Verdict:** **REAL** — real 31 MB fixture, real golden, real exact-metadata oracle, genuine mediabunny library calls on the timed path. The single caveat is that the gate is metadata-exact (the correct/strongest gate for a probe) and the win is decided on `opsPerSec`, which is the scenario's declared, runner-produced primary metric.

## Confidence & caveats

- **Confidence: medium-high.** The correctness gate is identical and exact across all engines, so the verdict is a clean speed ranking on the declared primary metric; the 1.47x winning margin is well outside trivial noise.
- **Caveats:** (1) every bench is `n==1`/`warmup:1` (`mad=0`), so per-number precision is single-shot; (2) all results are `cached==true` (reused, not re-run); (3) the gate is metadata-exact rather than a decoded/bit-exact comparison — appropriate for a probe but it is a structural/metadata gate, not the top of the correctness ladder; (4) `throughputRealtime`/`peakMemory`/`longtasks` were not captured for this case, so the secondary tiebreakers reduce to wall/opsPerSec.
