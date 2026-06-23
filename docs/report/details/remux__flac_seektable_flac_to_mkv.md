# remux/flac_seektable_flac_to_mkv

- **Family:** remux
- **Fixture asset:** `flac_seektable.flac` (143 KB, real FLAC w/ SEEKTABLE; `fixtures/media/flac_seektable.flac`)
- **Operation:** lossless audio re-wrap FLAC -> MKV (Matroska); coded FLAC frames copied, SEEKTABLE dropped
- **primaryMetric:** wall (median ms)
- **passCount:** 2 of 7 (ffmpeg-wasm, mediabunny)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES — 2 engines PASS (ffmpeg-wasm, mediabunny). Both satisfy the *same* single gating oracle (`reference-reimport`) with *identical* structural measurements (105 packets, 1 media track, duration delta 0). Correctness is a dead heat, so the win is decided on **performance**.
- **Decisive factor:** lower wall + dramatically lower main-thread blocking. ffmpeg-wasm wall median **7.595 ms** vs mediabunny **10.925 ms** = **1.44x faster**; throughputRealtime **1316.66x** vs **915.33x** = **1.44x higher**; longtasks **234 ms** vs **1901 ms** = **8.12x less** main-thread blocking.
- **Margin over runner-up:** 1.44x wall, 1.44x throughput, 8.12x fewer longtask ms. Caveat: n=1 per metric (single timed sample, mad=0), so the perf margin is real but statistically thin.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 7.595 ms | 1316.66x | n/a (n=0) | 234 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 10.925 ms | 915.33x | n/a (n=0) | 1901 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

(peakMemory, sourceReads, targetWrites all have n=0 samples for both PASS engines — not captured this run.)

## Why the winner wins (deep technical)

This is an **audio-only lossless remux**: the FLAC coded bitstream from `flac_seektable.flac` (48 kHz, 2-ch, ~10 s, ~114 kbps per the golden meta) is re-wrapped from the native FLAC container into a Matroska (MKV) container. No samples are decoded or re-encoded; only the framing/index changes, and the FLAC source's SEEKTABLE metadata block is dropped (Matroska carries its own cues). The scenario (`src/scenarios/remux/index.ts:128-134`) attaches the single default oracle `reference-reimport` (`src/scenarios/remux/_shared.ts:78-81`), which the `_shared.ts` header justifies as the only honest structural gate for an `op:'remux'` run: the runner never probes the output into `ctx.metadata`/`ctx.demux`, so `golden-metadata`/`golden-packets` are inapplicable, and `decoded-frames-bitexact` digests RGBA *video* frames (there is no PCM/audio decode oracle), so it cannot gate audio.

**Both PASS engines clear the same gate identically.** For a non-Ogg remux output the oracle (`src/core/oracles.ts:1225` → `semanticRemuxReimport` at `:1273`) re-imports the bytes with the reference engine and compares (a) media-track *count*, (b) per-type track *layout*, and (c) *duration* within tolerance `max(band, 0.1s)`. The shard shows both engines produced `reimportPackets=105, reimportKeyframes=105, reimportMediaTracks=1, goldenMediaTracks=1, durationDeltaSec=0, durationToleranceSec=0.1`. 105 FLAC frames re-parsed from the MKV with 1 audio track and zero duration drift is physically consistent with a ~10 s 48 kHz FLAC stream copied losslessly. So **correctness strength is tied** — same oracle, same ladder rung (structural/metadata-exact), same measured numbers, same (default 0.1 s) tolerance. Per the decision procedure, correctness comparable -> rank on performance.

**Performance is where ffmpeg-wasm separates.** ffmpeg-wasm's remux (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) is a textbook stream copy: it writes the input to MEMFS, runs `runInfo` + `assertRemuxContainerCompatible`, then executes `['-i', in, '-map', '0', '-c', 'copy', out.mkv]` (`:2044`, `:2062-2064`) — FFmpeg's libavformat demuxes the FLAC elementary stream and remuxes it into Matroska with no codec work at all. For a 143 KB audio file that is a near-trivial copy, hence wall median **7.595 ms** and throughput **1316.66x** realtime, with only **234 ms** of longtask time. mediabunny (`src/engines/mediabunny/adapter.ts:1244-1259`) does an equally genuine remux through its pure-TS `Output`/`Conversion` muxer (`new this.lib.Output({format, target})` + `runConversion`), but its run shows wall **10.925 ms** (1.44x slower), throughput **915.33x** (0.70x), and a **1901 ms** longtask block (8.12x ffmpeg's). mediabunny's `env.configUsed` advertises `backend:webcodecs`, `hwAccel:prefer-hardware`, `pipeline:streaming-lockstep` — none of which help an audio stream-copy (no decode/encode happens), so its higher longtask cost is conversion-pipeline overhead, not useful work. Both are single-threaded with no SharedArrayBuffer / COOP-COEP requirement (mediabunny `wasmThreads:0`, `coopCoep:not-required`), so there is no threading tiebreaker; the raw wall + main-thread-blocking numbers decide, and ffmpeg-wasm wins on both.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on perf): correct lossless FLAC->MKV remux via its TS muxer, identical oracle pass (105 pkts, 1 track, Δdur 0), but **1.44x slower wall** (10.925 vs 7.595 ms), **0.70x throughput** (915.33 vs 1316.66x), and **8.12x more longtask time** (1901 vs 234 ms). Its WebCodecs/hw-accel config is irrelevant to an audio stream-copy.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA; the WebCodecs platform engine has no muxing/container-rewrite primitive.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA; it is a parser/demuxer, not a muxer.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA; demux-only library.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'flac'". Honest NA; MP4Box handles ISO-BMFF, not native FLAC input.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest NA; it does not emit Matroska as a remux target.

All five NAs look honest (capability boundaries, not under-declared): none of these libraries plausibly performs a native-FLAC-in -> Matroska-out container copy.

## Anti-cheat validation

- **Scenario:** `src/scenarios/remux/index.ts:128-134` — `{ asset: 'flac_seektable.flac', from: 'flac', to: 'mkv', audioCodecs: ['flac'] }`, oracle defaulted to `reference-reimport` via `src/scenarios/remux/_shared.ts:78-81`.
- **Fixture exists:** `fixtures/media/flac_seektable.flac` present, 143 KB — a real FLAC file, not synthetic/empty/mock. Golden meta `fixtures/golden/flac_seektable.flac.meta.json` confirms container=flac, durationSec=10, 1 audio FLAC track @ 48 kHz/2ch.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069`. Genuine `ffmpeg -i ... -map 0 -c copy out.mkv` stream copy then `readBinary(outName)` of the real produced file. No canned/hardcoded bytes, no input->output passthrough faking a transcode, no short-circuit to the golden, no swallowed errors (`assertRemuxContainerCompatible` gates compatibility; `this.run` surfaces failures).
- **Oracle:** `src/core/oracles.ts:1225` (`referenceReimport`) -> `:1273` (`semanticRemuxReimport`). It re-demuxes the *engine output* with the reference engine and compares media-track count, per-type layout, and duration within `max(band,0.1s)`. Not trivially satisfiable: empty packet tables fail (`:1244-1246`), track-count/layout mismatches and duration drift > tol produce diffs. Measurements (105 packets, 1 media track, 0 duration delta) are physically plausible for a 10 s 48 kHz FLAC stream copy.
- **Verdict:** **REAL** — real fixture + real `-c copy` implementation + meaningful structural oracle that re-parses actual output and can fail. The win is genuine; the only softness is that the gate is structural (track/duration), not bit-exact-packet, so correctness is "strong-structural" rather than "crypto/bit-exact" on the ladder.
- **Cached note:** Both PASS results carry `cached:true` ("cached previous PASS result"). The verdict and the perf numbers were *reused, not re-run* this session — staleness risk applies to both engines equally, so it does not flip the ranking, but the 7.595 ms / 10.925 ms / 1901 ms figures are from a prior run.

## Confidence & caveats

- **Confidence: high** on the winner choice — only 2 eligible PASS engines, correctness exactly tied (identical oracle measurements), and ffmpeg-wasm leads on every captured perf metric (wall, throughput, longtasks).
- **Caveats:** (1) Every bench metric has **n=1** (single timed sample, mad=0), so the 1.44x wall margin is directionally clear but statistically thin; the 8.12x longtask gap is large enough to be robust. (2) Both results are **cached** — figures are reused from an earlier run. (3) peakMemory / sourceReads / targetWrites were not captured (n=0) for either engine, so memory and I/O tiebreakers could not be applied. (4) The gate is structural (track count + layout + duration), not bit-exact packet comparison; a hypothetical engine that altered FLAC frame boundaries while preserving track count and duration could still pass — but ffmpeg `-c copy` does not do that.
