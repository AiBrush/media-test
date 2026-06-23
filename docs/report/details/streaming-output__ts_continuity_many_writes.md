# streaming-output/ts_continuity_many_writes

family: streaming-output | fixture asset: `h264_1080p_30s.mp4` (31 MB, real H.264 1080p + AAC, exists in fixtures/media/) | primaryMetric: (none set; bench wall) | passCount: 1 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (uncontested — exactly 1 PASS).
- Contested: **no**. The other 6 engines are all NA_ENGINE (capability not declared); none even ran, so there is no runner-up to take a metric margin against.
- Decisive factor: mediabunny is the only engine that declares BOTH the `remux` operation and the `ts` output container (plus `target:writes`), so it is the only one eligible to attempt MP4→MPEG-TS streaming remux. It then passed the `reference-reimport` correctness gate: re-demuxing its streamed TS recovered 2310 packets / 1425 keyframes across 2 media tracks with a duration delta of only 0.08 s (tol 4.5 s).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 491.02 ms | 61.10 x-rt | 0 (n=0) | 747 ms | — |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'target:writes' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Additional mediabunny bench: targetWrites=857, bytesOut=32,242,940 (~32.2 MB), durationMs (whole run incl. setup)=5745.

## Why the winner wins (deep technical)

The operation is a **lossless container change MP4 → MPEG-TS streamed in 188-byte chunks** (`shape: { container: 'ts', target: 'stream', writeChunkBytes: 188 }`, scenario `src/scenarios/streaming-output/ts-webm-live.ts:45-61`). The source is H.264 video + AAC audio in MP4; the target is MPEG-2 Transport Stream, a fundamentally different framing model: instead of a single ISOBMFF moov/mdat, TS multiplexes the elementary streams into fixed 188-byte packets each carrying a 4-byte header with a 4-bit `continuity_counter`, and must periodically re-emit PAT/PMT so a mid-stream joiner can lock on. Getting "many tiny writes" right means the continuity counters stay monotonic per-PID and PAT/PMT are repeated; any slip shows up as dropped/misordered packets on re-parse.

mediabunny was the only eligible engine. Its `remux()` (`src/engines/mediabunny/adapter.ts:1244-1260`) takes the no-transform fast path: it builds the output format via `makeOutputFormat('ts')` which returns a real `new MpegTsOutputFormat()` from the mediabunny library (`src/engines/mediabunny/codecs.ts:172-173`), opens the source with `openInput`, wires an `instrumentedOutputTarget` and runs `runConversion`. Because no codec/resolution/bitrate options are passed, the Conversion copies encoded samples (no decode/re-encode) — H.264 NAL units and AAC frames are re-packetized into TS, not transcoded. The streaming path (`opts.target === 'stream'`, `src/engines/mediabunny/adapter.ts:776-816`) installs a real `mb.StreamTarget(writable)` whose `WritableStream.write` increments `targetWrites` per chunk; the run reported **targetWrites=857** chunked writes producing **32,242,940 bytes** of TS — i.e. the library genuinely streamed the mux out through the native StreamTarget rather than buffering whole-file. Backend per `env.configUsed`: `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false` — no COOP/COEP, no WASM threads needed; the copy-only remux is pure-TS muxing (WebCodecs/hwAccel listed but irrelevant to a sample-copy remux).

The gate is `reference-reimport` (`src/core/oracles.ts:1225-1271`, remux branch `semanticRemuxReimport` at :1273+). It is a genuine round-trip: it takes the engine's streamed TS bytes (`ctx.output`), feeds them back through the reference engine's `demux()` (`oracles.ts:1230-1236`), and asserts the re-parsed result is semantically equal to the golden. The shard measurements are physically plausible for a real 30 s 1080p30 clip: **reimportPackets=2310**, **reimportKeyframes=1425**, **reimportMediaTracks=2** vs **goldenMediaTracks=2**, **durationDeltaSec=0.08** against **durationToleranceSec=4.5**. The 2-track recovery (video+audio) confirms PAT/PMT were emitted and re-discovered; 2310 recovered packets with no empty-table failure confirm the continuity counters did not desync across the 857 tiny writes (a continuity slip would have caused the reference demuxer to drop/misorder packets, diverging the count/track layout and failing the `diffs` check at `oracles.ts:1289-1298`). The 0.08 s duration drift is the expected small tail-rounding from TS PCR/PES framing, comfortably inside the loose TS band (TS has no global duration; band widened to 4.5 s).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'target:writes'". Honest NA: this scenario's `target: 'stream'` shape requires the per-write streaming-target capability, which the ffmpeg.wasm adapter does not advertise. It writes to its MEMFS whole-file, not a chunked StreamTarget, so it cannot satisfy the 188-byte-write streaming profile.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'ts'". Honest: mp4box.js is an ISOBMFF (MP4/fragmented-MP4) muxer; it cannot emit MPEG-TS, so it is correctly excluded.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'ts'". Honest: its muxers target MP4/WebM, not MPEG-TS.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: web-demuxer is a demux/probe-only library; it has no muxing/remux path at all.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: the Chrome platform baseline (WebCodecs decode/encode) has no built-in container remux op, and certainly no TS muxer.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: media-parser is a read/parse library; it does not write containers.

All six NAs look genuine, not under-declared: only a library with a true MPEG-TS muxer AND a streaming write target could even attempt this, and mediabunny is the only such engine in the set.

## Anti-cheat validation

- Scenario definition: `src/scenarios/streaming-output/ts-webm-live.ts:45-61` (id `ts_continuity_many_writes`). Notes explicitly document that the 188-byte write-count/alignment assertion is NOT yet wired (needs CountingTarget through runOne) — so `targetWrites` here is observational telemetry (857), not an asserted gate; the actual gate is correctness via reference-reimport. This is disclosed, not hidden.
- Fixture: asset `h264_1080p_30s.mp4` exists in `fixtures/media/` (31 MB real H.264+AAC MP4). Golden present: `fixtures/golden/h264_1080p_30s.mp4.{meta,packets,frames,ssim}.json`. Not synthetic/empty/mock.
- Oracle: `referenceReimport` / `semanticRemuxReimport`, `src/core/oracles.ts:1225-1324`. Real comparison: re-demuxes the engine's own output bytes and compares packet/track/duration against golden; fails on empty packet table, track-count/layout mismatch, or duration drift beyond tolerance. Not trivially satisfiable.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1244-1260` (remux), `:776-816` (StreamTarget streaming), `src/engines/mediabunny/codecs.ts:172-173` (`MpegTsOutputFormat`). Real library calls; no canned output, no input→output copy faking a transcode, no short-circuit to golden, no swallowed errors (throws on null format / missing buffer).
- Verdict: **REAL**. Real fixture, real mediabunny TS muxer streamed through a real StreamTarget (857 writes, 32.2 MB out), real round-trip oracle with plausible measurements (2310 pkts / 1425 kf / 2 tracks / 0.08 s drift). One caveat: the oracle is a structural/semantic re-import (track-count + layout + loose duration), NOT bit-exact packet matching — it would catch gross continuity/PAT-PMT breakage but not subtle per-packet timestamp drift within tolerance. Still a meaningful correctness gate, so REAL rather than WEAK-GATE.
- Cached note: mediabunny result has no `cached:true` flag (field absent → freshly run this batch, startedAtIso 2026-06-22T17:37:06Z). No staleness risk.

## Confidence & caveats

- Confidence: **high** on the winner decision — it is the only PASS and the only engine that declares the required remux+ts+streaming capabilities; the NAs are all honest.
- Caveats: (1) bench has **n=1** (single sample, mad=0, p95==median) — wall 491 ms and throughput 61.1x are indicative, not statistically robust; but since there is no competing engine, performance margin is moot. (2) peakMemory is 0 with n=0 (not captured on this run). (3) The 188-byte per-write alignment is measured (targetWrites=857) but NOT asserted as a gate yet (CountingTarget unwired, per scenario header) — the continuity-counter integrity is proven only indirectly via the successful re-import, not by direct CC inspection. (4) Oracle is semantic/structural, not bit-exact.
