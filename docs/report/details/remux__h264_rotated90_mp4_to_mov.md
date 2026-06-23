# remux/h264_rotated90_mp4_to_mov

- **family:** remux
- **fixture asset:** `fixtures/media/h264_rotated90.mp4` (4.4 MB, real H.264/AAC MP4 with a 90° display matrix; 1280x720 coded, ~10s)
- **operation:** lossless stream-copy remux MP4 -> MOV (QuickTime), `-c copy` / Conversion (no re-encode)
- **primaryMetric:** wall (ms)
- **passCount:** 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES — two engines PASS (`mediabunny@1.48.0`, `ffmpeg.wasm@0.12.15`), each satisfying the identical single gating oracle `reference-reimport` with equivalent structural fidelity (2/2 media tracks re-imported).
- **Decisive factor:** PERFORMANCE. Correctness is comparable (same oracle, same track count, both within the 0.1s duration band — ffmpeg-wasm is even tighter at Δ0.0s vs mediabunny's Δ0.069s). ffmpeg-wasm wins on every available speed metric.
- **Margin over runner-up (mediabunny):** **3.32x faster wall** (34.875 ms vs 115.695 ms) and **3.32x higher throughput** (286.74x vs 86.43x realtime). Caveat: both samples are `n==1` and `cached==true`, so the margin is single-shot evidence, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 34.875 ms | 286.74 x | (not reported, n=0) | 1901 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 115.695 ms | 86.43 x | 53,944,702 B (~51.4 MB) | 1361 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

The operation is a **lossless container re-wrap**: H.264 AVCC coded samples + AAC samples are lifted from one ISOBMFF brand (MP4 `isom`) into another (QuickTime MOV). No NAL framing rewrite is required (both MP4 and MOV use length-prefixed AVCC, not Annex-B), so the only real work is parsing the source `moov`/`stbl` sample tables, re-emitting them under the MOV `moov`, and — critically for this asset — carrying the **90° display matrix** in the new `tkhd` matrix field. The gating oracle does not decode pixels; it re-imports the bytes and asserts structural parity.

**ffmpeg-wasm's path** (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`): the `remux()` method probes the input (`runInfo`), checks codec/container legality via `assertRemuxContainerCompatible`, then runs a genuine `ffmpeg -i <in> -map 0 -c copy -movflags +faststart <out>.mov` (lines 2044-2050). `-map 0` forces every input stream through so the secondary AAC track is not dropped (this is what yields the 2 media tracks the oracle requires); `-c copy` guarantees no transcode; `+faststart` relocates the `moov` ahead of `mdat`. FFmpeg's ISOBMFF muxer copies the source display matrix into the MOV `tkhd` natively. The re-import measured **770 packets / 475 keyframes / 2 media tracks**, with **durationDeltaSec = 0.0** against the golden (tolerance 0.1s) — an exact duration match, the tightest possible. Despite being WASM, the whole job is a byte-shuffling stream copy with zero decode/encode, so it completes in **34.875 ms** at **286.74x realtime**, 3.32x faster than mediabunny.

**mediabunny's path** (`src/engines/mediabunny/adapter.ts:1244-1260`): `remux()` builds an `OutputFormat` for MOV and runs the `Conversion` API (`runConversion`, adapter.ts:842-852) over an `Input`. With no `ConversionVideoOptions` supplied, the Conversion stream-copies the tracks and — per the adapter's documented behavior (adapter.ts:22-25, 588-596) — keeps the angle as ISOBMFF rotation **metadata** (`canUseRotationMetadata`) rather than baking pixels, which is exactly correct for a remux. Its backend is `env.configUsed.backend == "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coopCoep: "not-required"`, `wasmThreads: 0`. mediabunny also PASSed `reference-reimport` (**772 packets / 477 keyframes / 2 media tracks**, durationDelta 0.069s < 0.1s). It is correct — it just costs more wall time (115.695 ms; 86.43x realtime) and ~51.4 MB peak memory because the Conversion pipeline spins up its read->decode-gate->mux machinery and a pure-TS ESM core, whereas ffmpeg-wasm's `-c copy` is a single muxer pass. The small packet/keyframe deltas (770/475 vs 772/477) reflect ffmpeg's `+faststart`/edit-list handling vs mediabunny's muxer; both are within the oracle's 2% relative bands and both report 2/2 media tracks, so correctness is a wash and performance decides.

The two NA categories are honest declarations, not under-claims: `mp4box` and `remotion-webcodecs` declare `remux` but not the **MOV output container**, and `web-demuxer`, `remotion-media-parser`, and `platform` (WebCodecs) do not declare the `remux` operation at all — none of these libraries author a QuickTime `moov`, so the NAs are correct.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (genuine Conversion stream-copy, 772 pkts / 2 tracks, durationΔ0.069s). Lost purely on performance: **3.32x slower wall** (115.695 ms vs 34.875 ms), **3.32x lower throughput** (86.43x vs 286.74x), and it reports ~51.4 MB peak memory (ffmpeg-wasm reported none). Not a correctness loss.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare output container 'mov'". Honest: mp4box.js writes ISOBMFF/MP4 segments but does not author a QuickTime/MOV output, so the operation is genuinely unsupported.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare output container 'mov'". Honest: its muxer targets fragmented MP4/WebM, not MOV.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest: it is a demux-only library (no muxer).
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest: a parser/probe, no muxing path.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'remux'". Honest: raw WebCodecs decodes/encodes coded frames but provides no container muxer/demuxer, so remux is not expressible.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/index.ts:61-68` — asset `h264_rotated90.mp4`, from `mp4`, to `mov`, videoCodecs `['h264']`, audioCodecs `['aac']`, notes: "Rotation metadata (display matrix) must carry across to the new container." Built into scenarios via `buildRemuxAll` / `_shared.ts`.
- **Fixture exists:** `fixtures/media/h264_rotated90.mp4` is present and real (4.4 MB), with committed goldens `fixtures/golden/h264_rotated90.mp4.meta.json` (1280x720 H.264 + 48kHz stereo AAC, 10s), `.packets.json` (87 KB), `.frames.json`, `.ssim.json`. Not synthetic/mock/empty.
- **Gating oracle:** `reference-reimport` -> `semanticRemuxReimport` at `src/core/oracles.ts:1225-1324`. It actually re-demuxes the engine's output bytes with the reference engine, compares media-track count and per-type layout against the golden, and checks duration drift against a tolerance band (here 0.1s). This is a real structural comparison, not trivially satisfiable: an empty packet table fails (oracles.ts:1244-1245), and track-count/layout mismatches push diffs (oracles.ts:1289-1298). Measured values are physically plausible for a 10s 30fps clip: ~770-772 packets, ~475-477 keyframes, 2 media tracks, sub-0.1s duration deltas.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — real `ffmpeg -i ... -map 0 -c copy -movflags +faststart out.mov`, output read back from MEMFS. No canned bytes, no input->output passthrough faking, no short-circuit to a golden file, no error-swallowing (it `await this.run(args)` and reads the produced file).
- **Verdict:** **WEAK-GATE.** The implementation and fixture are real and the oracle is a genuine structural re-import, so the PASS is real. It is downgraded from REAL because (a) only a single oracle gates this cell — `reference-reimport` — and (b) the scenario's headline concern, *rotation/display-matrix survival*, is NOT directly verified here: `decoded-frames-bitexact` is intentionally excluded from the default remux battery (`src/scenarios/remux/_shared.ts:19-23, 77-80`), so the gate confirms track count + duration but does NOT prove the 90° matrix actually carried into the MOV `tkhd`. The dedicated rotation-pixel gate lives in the metamorphic case `prop_rotation_survives_mp4_mov` (`src/scenarios/remux/metamorphic.ts:142`), not in this cell. PASS is therefore real but structurally proxied, not pixel-strong.
- **Cached note:** Both winning and runner-up results have `cached==true` ("cached previous PASS result"). The numbers were reused, not re-run this session — staleness/regression risk if the adapters changed after caching. Both bench samples are `n==1`.

## Confidence & caveats

- **Confidence: medium.** The winner selection is unambiguous on the decision procedure (both PASS the same oracle equally; ffmpeg-wasm wins performance by a clean 3.32x), and the implementation/fixture/oracle are all verified real.
- Performance evidence is **single-shot (n=1, mad=0, p95==median) and cached** for both engines, so the 3.32x margin is one measurement, not a stable distribution.
- ffmpeg-wasm's `peakMemory` was not captured (n=0); mediabunny's ~51.4 MB is the only memory datapoint, so the memory comparison is one-sided.
- The cell does not pixel-verify rotation survival (WEAK-GATE rationale above); a regression that silently dropped the display matrix while keeping 2 tracks and the same duration would still PASS this specific scenario.
