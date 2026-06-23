# trim/audio_mp3_copy

family: trim | fixture asset: `mp3_xing.mp3` (ID3v2.4 + MPEG-1 Layer III, 64 kbps CBR, 44.1 kHz stereo, ~64 KB) | primaryMetric: wall (no scenario override -> default) | passCount: 2/7

## Verdict

- Best framework: **mediabunny@1.48.0** (PASS, uncontested on correctness, narrowly ahead on the primary perf axis).
- Contested: **YES** — two engines PASS (mediabunny, ffmpeg.wasm@0.12.15). Both satisfy exactly the same single oracle (`trim-boundaries`) at the same strength tier, so the tie is broken on performance.
- Decisive factor: **wall-clock (the default primaryMetric) and realtime throughput.** Mediabunny: wall median **6.125 ms** vs ffmpeg.wasm **7.05 ms** = **1.15x faster**; throughputRealtime **1632.65x** vs **1418.44x** = **1.15x higher**. The win is real but small and from n==1 cached samples; ffmpeg.wasm actually beats mediabunny on memory and main-thread blocking (see caveats).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | trim-boundaries:true | 6.125 ms | 1632.65x | 37,058,549 B (~35.3 MB) | 4924 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | trim-boundaries:true | 7.05 ms | 1418.44x | 31,123,619 B (~29.7 MB) | 4223 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

This scenario is an **audio-only stream-copy trim of bare MP3**: cut [5.0s, 10.0s) from a 64 kbps CBR MPEG-1 Layer III elementary stream wrapped only in an ID3v2.4 tag (`fixtures/media/mp3_xing.mp3`, magic `49 44 33 04` = ID3v2.4, first audio frame sync `FF FB 50 00`). There is no video, no AAC/Opus re-encode, and `frameAccurate:false`, so the correct implementation is a **packet-level copy**: pick the MP3 frames whose timestamps fall in the requested window and re-emit them, untouched, into a new MP3 stream. Both PASS engines do exactly this — neither re-encodes — which is why their `outDurationSec` lands so close to the requested 5.0 s.

Mediabunny's win is mechanistic, not from a faster codec. Its trim dispatcher (`src/engines/mediabunny/adapter.ts:1445`) takes a dedicated audio-only fast path: after a cheap noop-trim guard (`adapter.ts:1468`, not triggered here since startUs=5e6), it calls `tryAudioOnlyPacketCopyTrim` (`adapter.ts:1480` -> `adapter.ts:912`). That helper requires a single audio track, no video (`adapter.ts:921-925`), pulls the source's `EncodedPacketSink` (`adapter.ts:945`), and streams packets, selecting by timestamp window — skipping packets whose end is <= startSec (`adapter.ts:954`), breaking once a packet's start >= endSec (`adapter.ts:955`), rebasing each surviving packet's pts to a zero origin (`adapter.ts:956-963`), and re-adding the **byte-identical** payload (`copyBytes(pkt.data)`) through an `EncodedAudioPacketSource` (`adapter.ts:936-975`). It never instantiates a decoder or encoder, never touches WebCodecs (the `webcodecs` backend in `env.configUsed` is the suite default, but the MP3 trim path is pure-TS demux/remux with no GPU/codec involvement) — it is a tight single-pass copy of ~64 KB of packets entirely in JS/WASM-free TS. That low-overhead path produces wall **6.125 ms** and **1632.65x realtime**.

ffmpeg.wasm reaches the same correctness via a genuinely different and heavier mechanism. Its trim (`src/engines/ffmpeg-wasm/adapter.ts:2538`) writes the input into MEMFS, runs an `ffmpeg -i` probe pass (`metadataFromLog(runInfo(...))`, `adapter.ts:2567`), then for the non-frame-accurate branch builds a real CLI invocation: `-ss <start> -i <in> -map 0 -t <dur> -c copy -avoid_negative_ts make_zero` (`adapter.ts:2613-2629`) and shells the single-thread WASM core. That is a correct keyframe-aligned stream copy, but it pays for a probe pass plus full WASM-core spin-up and MEMFS round-trips, costing wall **7.05 ms** and **1418.44x realtime** — about **1.15x slower** than mediabunny on both axes.

On correctness the two are a true tie at the **structural/duration tier** (not bit-exact, not perceptual): the gating oracle is `trim-boundaries` (`src/core/oracles.ts:2348`). For audio-only output with no decoded video boundary frames and no trim-range golden, the oracle falls back to a **duration-span gate** and explicitly skips boundary-frame digesting (`oracles.ts:2405-2431`, `boundaryFrameComparisons=0`). Measured deltas against the scenario tolerance `durationToleranceSec:0.1` (`src/scenarios/trim/index.ts:186`): mediabunny `outDurationSec=5.0416s`, `durationDeltaSec=0.0416s`; ffmpeg.wasm `outDurationSec=5.0156s`, `durationDeltaSec=0.0155s`. ffmpeg.wasm is actually the *tighter* duration match (0.0155s vs 0.0416s), but both are comfortably inside the 0.1s window so this does not change the correctness ranking — the dense ~26 ms MP3 frame grid means both engines snap to within a couple of frames of the requested 5.0s. With correctness equal, the rule (4b) sends the decision to the primary perf metric, which mediabunny wins.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed correctly (real `-c copy` stream-copy trim, `adapter.ts:2613-2629`), but lost on the primary axis: **1.15x slower wall** (7.05 ms vs 6.125 ms) and **1.15x lower throughput** (1418.44x vs 1632.65x), owing to its extra `ffmpeg -i` probe pass and WASM-core/MEMFS overhead. (It did win peakMemory 29.7 MB vs 35.3 MB and longtasks 4223 ms vs 4924 ms — see caveats.)
- **web-demuxer@4.0.0** — NA_ENGINE, "does not declare operation 'trim'". Honest: it is a demux/probe-only library that produces no output container (`src/engines/web-demuxer/adapter.ts:1055-1060`).
- **platform@chrome-149** — NA_ENGINE, "does not declare operation 'trim'". Honest: raw browser APIs have no muxer, so no rewrap/cut is possible (`src/engines/platform/adapter.ts:234`, `:467-472`).
- **remotion-media-parser@4.0.479** — NA_ENGINE. Honest: read-only parser that can seek-read a range but cannot write an output container (`src/engines/remotion-media-parser/adapter.ts:570-575`).
- **mp4box@2.3.0** — NA_ENGINE. Honest: ISOBMFF box tool, no MP3/elementary-stream trim, declared undeclared (`src/engines/mp4box/adapter.ts:962-967`).
- **remotion-webcodecs@4.0.479** — NA_ENGINE. Honest: the library has no trim/cut API (docs list it "Soon"), so trim is intentionally left undeclared (`src/engines/remotion-webcodecs/adapter.ts:850-853`).

All five NA verdicts are genuine capability gaps, not under-declared functionality.

## Anti-cheat validation

- Scenario definition: `src/scenarios/trim/index.ts:179-189` (`id:'audio_mp3_copy'`, asset `mp3_xing.mp3`, container `mp3`, audioCodec `mp3`, startUs 5e6, endUs 10e6, `frameAccurate:false`, `tolerances.durationToleranceSec:0.1`, extraOracles PLAYABLE_AUDIO).
- Fixture exists and is real: `fixtures/media/mp3_xing.mp3`, ~64 KB; `file` reports "ID3 version 2.4.0 ... MPEG ADTS, layer III, v1, 64 kbps, 44.1 kHz, Stereo"; header bytes `49 44 33 04` (ID3v2.4) then frame sync `FF FB`. Not synthetic/empty/mock.
- Winner adapter genuinely implements the op: `src/engines/mediabunny/adapter.ts:1445` (dispatch) -> `:912` `tryAudioOnlyPacketCopyTrim` performs a real packet-windowed copy through mediabunny's `EncodedPacketSink`/`EncodedAudioPacketSource`. It does NOT hardcode output, does NOT short-circuit to the golden, and does NOT blindly copy input->output (the noop short-circuit at `:1468-1477` only fires for a true 0..duration identity request, which this 5..10s cut is not; it throws if zero packets fall in range, `:982-984`).
- Gating oracle is a real comparison: `src/core/oracles.ts:2348` `trimBoundaries` requires `ctx.output` bytes and measures actual output duration vs requested, failing when `durationDeltaSec > tolerance` (`oracles.ts:2388-2400`). Measurements are physically plausible (out ~5.04s/5.02s for a requested 5.0s MP3 cut; deltas 0.0416s/0.0155s).
- WEAK-GATE caveat: for audio-only output the oracle is a **duration-span gate only** — boundary-frame digesting is explicitly skipped (`boundaryFrameComparisons=0`, `oracles.ts:2410-2431`) because no trim-range frame golden is baked. So the PASS is real but not byte/sample-exact; a wrong-but-similar-duration output could in principle slip through. This is a loose-but-honest proxy, not a fakeable gate.
- Cached: **BOTH PASS results have `cached==true`** ("cached previous PASS result"). The numbers were reused, not freshly re-run — staleness risk on the 1.15x perf margin specifically (n==1, mad==0 for every metric).

Verdict: **WEAK-GATE** — real fixture + real implementation, but the only correctness oracle for this audio-only case is a duration-tolerance proxy (0.1s window) with no boundary/PCM exactness, and both results are cached n==1.

## Confidence & caveats

- Correctness winner choice is robust: both engines pass the same single proxy oracle, so this is purely a perf tiebreak.
- The perf margin is **small (1.15x)** and the verdict is genuinely mixed: mediabunny wins wall + throughput (the default primary), but ffmpeg.wasm wins **peakMemory (29.7 MB vs 35.3 MB, ~1.19x leaner)** and **longtasks (4223 ms vs 4924 ms, ~1.17x less main-thread blocking)**. If memory or jank were the primary axis, ffmpeg.wasm would win. Tiebreakers favor mediabunny: pure-TS-ESM, `coopCoep:not-required`, no SharedArrayBuffer, streaming-lockstep pipeline (`env.configUsed`), vs ffmpeg.wasm's heavier WASM core + MEMFS.
- All metrics are **n==1, mad==0, cached==true** for both engines — weak statistical evidence. A fresh re-run could flip a 1.15x gap.
- Oracle gate is duration-only for audio (no sample-exact PCM or boundary-frame check), so "correct trim" here means "correct duration," not "bit-exact MP3 frames."
