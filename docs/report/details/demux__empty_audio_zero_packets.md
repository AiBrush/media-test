# demux/empty_audio_zero_packets

- **family:** demux
- **fixture asset:** `fixtures/media/empty_audio.wav` (44-byte valid RIFF/WAVE, PCM s16, 2ch, 48000 Hz, `data` chunk length = 0)
- **golden:** `fixtures/golden/empty_audio.wav.packets.json` = `[]`
- **primaryMetric:** wall (ms)
- **passCount:** 5 / 7 (2 NA_ENGINE)

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479`
- **Contest status:** CONTESTED — 5 engines PASS the single gating oracle (`golden-packets`) with byte-identical results (0 measured chunks vs 0 golden chunks). Correctness is a flat tie; the contest collapses to a pure wall-time race.
- **Decisive factor:** lowest wall median. remotion-media-parser = **2.600 ms** vs runner-up remotion-webcodecs = **4.565 ms**.
- **Margin over runner-up:** **1.76x faster wall** (4.565 / 2.600). Against the slowest PASS engine (ffmpeg-wasm, 7.630 ms) the margin is **2.93x**. NOTE: every PASS row is `cached==true` and `n==1` (single sample, mad=0) — the timing margins are weak, low-confidence evidence.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (0/0) | 2.600 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (0/0) | 4.565 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true (0/0) | 5.415 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true (0/0) | 6.930 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (0/0) | 7.630 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

(The shard's `bench` block contains only `wall` for this scenario — `metrics: ['wall']` in the scenario def. No throughput/memory/longtask metrics were collected, hence n/a.)

## Why the winner wins (deep technical)

**The operation.** This is a degenerate/no-tracks demux. The fixture `empty_audio.wav` is a structurally valid WAV: hex header `52 49 46 46 24 00 00 00 57 41 56 45` (`RIFF`, size 0x24=36, `WAVE`), a `fmt ` chunk declaring PCM (format tag `0100` = 1), 2 channels, sample rate `80 bb 00 00` = 48000 Hz, 16-bit, followed by `64 61 74 61 00 00 00 00` — a `data` chunk whose length field is exactly 0. There is no encoded audio payload at all. The correct demuxer behavior is to parse the container, recognize a PCM-s16 audio track, and emit **zero** packets — never fabricate a phantom packet, never crash on the empty `data` chunk.

**The oracle.** `golden-packets` routes through the WAV/PCM-aggregate path (`src/core/oracles.ts:798-805` `usesPcmAggregatePacketOracle` → container `wav` + a `pcm-*` audio track) into `pcmAggregatePackets` (`src/core/oracles.ts:807-867`). It groups packets per track, sums PCM byte totals per track, and compares `measuredBytes` vs `goldenBytes` plus first-pts and duration deltas. With golden = `[]` there are zero tracks on the golden side and the engine must also yield zero packets: `measuredCount:0, goldenCount:0`, no diffs → PASS. All five PASS engines report exactly `{"measuredCount":0,"goldenCount":0}` — a flat correctness tie at the strongest applicable rung for this scenario (this is structural packet-table matching, not a smoke gate). There is no decode here, so no bit-exact frame rung applies; the oracle is as strict as the data allows.

**Why remotion-media-parser is fastest.** Its adapter (`src/engines/remotion-media-parser/adapter.ts:436` `demux()`) runs a genuine streaming parse via Remotion's `parseMedia` (`adapter.ts:486-509`), registering real per-sample callbacks `onAudioTrack` (`adapter.ts:469-480`) and `onVideoTrack` (`adapter.ts:458-468`). For this WAV, `chooseSrcOptions` (`adapter.ts:485`) feeds a mutation-honoring Blob of the 44-byte file; `parseMedia` reads the RIFF/`fmt `/`data` chunks, discovers a PCM audio track, then iterates the `data` chunk. Because the `data` length is 0, the audio per-sample callback at `adapter.ts:471` is invoked **zero times**, so the `tagged[]` array (`adapter.ts:455`) stays empty and `packets` (`adapter.ts:522`) is `[]`. This is the architecturally cheapest path of the five contenders: a pure CPU JS streaming container reader (`env.configUsed.backend: "cpu-js"`, `pipeline: "streaming"`, `reader: "webReader"`) with no WebCodecs VideoDecoder/AudioDecoder warm-up, no canvas pool, and no wasm core to instantiate. For a 44-byte file with no codec work, the fixed per-op overhead dominates, and the lean JS reader (median 2.600 ms) beats the WebCodecs-pipeline and wasm engines that each carry heavier per-op setup. mediabunny and platform both spin a `webcodecs` backend (`configUsed.backend: "webcodecs"`, canvas pool / VideoDecoder paths) they don't even need here; ffmpeg-wasm pays the highest fixed cost.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, correct (0/0). Lost on wall: 4.565 ms vs 2.600 ms = **1.76x slower**. Its `streaming-backpressure` WebCodecs pipeline (`configUsed.backend: "webcodecs"`, `pipeline: "streaming-backpressure"`) carries more per-op machinery than the cpu-js media-parser reader for a zero-payload file.
- **platform@chrome-149** — PASS, correct (0/0). Wall 5.415 ms = **2.08x slower**. The browser-native WebCodecs path (`VideoDecoder` + `webgpu>webgl>offscreen2d` pixel backend) is set up even though no decode occurs.
- **mediabunny@1.48.0** — PASS, correct (0/0). Wall 6.930 ms = **2.67x slower**. `streaming-lockstep` WebCodecs pipeline with `canvasPoolSize:4` and hardware-prefer config — unnecessary overhead for an empty WAV demux.
- **ffmpeg.wasm@0.12.15** — PASS, correct (0/0). Wall 7.630 ms = **2.93x slower** (slowest PASS). Single-thread wasm core (`wasmThreads:0`) has the highest fixed invocation cost.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'wav'". Honest NA — its capability registry genuinely omits the `wav` container; the scenario `requires.containersIn: ['wav']` so the runner gates it out. Not an under-declaration relative to this row's needs.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'wav'". Honest NA — MP4Box is an ISO-BMFF (MP4/MOV) box parser and legitimately cannot ingest a RIFF/WAVE file. Correct gate.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:407-420` (`emptyAudioDemux`, id `demux/empty_audio_zero_packets`, `input: 'empty_audio.wav'`, `requires: { operations:['demux'], containersIn:['wav'], audioCodecs:['pcm-s16'] }`, `oracles: ['golden-packets']`, `metrics: ['wall']`).
- **Fixture exists & is real:** `fixtures/media/empty_audio.wav` is present, 44 bytes, with a valid RIFF/WAVE header, a real PCM `fmt ` chunk (tag=1, 2ch, 48kHz, 16-bit) and a genuine zero-length `data` chunk. Not synthetic/mock — it is a deliberately degenerate but standards-valid container. Golden `fixtures/golden/empty_audio.wav.packets.json` = `[]`.
- **Oracle:** `src/core/oracles.ts:703` `goldenPackets` → `:798` `usesPcmAggregatePacketOracle` → `:807` `pcmAggregatePackets`. Performs a real per-track PCM-byte / pts / duration comparison; it is NOT trivially satisfiable in general (size, keyframe, pts-drift checks on the full-packet path; byte-sum + duration checks on the PCM path). For the empty case it correctly requires `measuredCount == goldenCount == 0`, so an engine that fabricates even one phantom packet or crashes would FAIL.
- **Winner adapter:** `src/engines/remotion-media-parser/adapter.ts:436` `demux()` calls real `parseMedia` (`:486`) with real `onAudioTrack`/`onVideoTrack` per-sample callbacks (`:458-480`). Zero packets arise organically because the empty `data` chunk fires the callback zero times — no canned output, no golden short-circuit, no error-swallowing.
- **Cached note:** ALL five PASS rows have `cached==true` ("cached previous PASS result"); the winner's 2.600 ms was reused, not freshly re-run. Per the launcher seeding caveat, stale PASS reuse means the timing margins should be treated as low-confidence. Correctness (0/0) is robust regardless of caching.
- **Verdict: REAL.** Real valid fixture + genuine streaming-parser implementation + a meaningful oracle that demands exactly-zero packets. The win itself is a thin (1.76x), n==1, cached timing margin on an essentially-free operation, so the *strength* of the win is weak even though the PASS is real.

## Confidence & caveats

- **Confidence: medium.** The PASS verdicts and the NA gating are solid and verifiable in code. The *ranking* among the 5 PASS engines rests entirely on a single-sample (n=1, mad=0), cached wall measurement of a 44-byte file where fixed per-op overhead dominates — so the 1.76x margin could reorder on a fresh run.
- This scenario does not exercise decode/encode, so no bit-exact or perceptual rung applies; correctness is genuinely tied across all 5 PASS engines.
- web-demuxer and mp4box NAs are honest capability gaps (no `wav` container support), not under-declared capabilities.
- For honest re-evaluation of the performance ordering, clear the raw cache + `.browser-cache` and re-run (per the launcher seeding caveat in memory).
