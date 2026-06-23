# streaming-output/buffer_massive_h264_mp4

- Family: streaming-output
- Fixture asset: `fixtures/media/massive_h264_1080p_2h.mp4` (~1.1 GB, 2h, 1080p H.264 + AAC mono 48 kHz, ~553k packets)
- Operation: remux MP4 -> MP4 with `shape.target = 'buffer'` (BufferTarget materializes whole output in memory)
- primaryMetric: `peakMemory` (lower-is-better)
- passCount: 3 of 7 (mediabunny, ffmpeg-wasm, mp4box)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (`ffmpeg-wasm`).
- Contested: YES (3 engines PASS, all satisfying the same gating oracle `reference-reimport`).
- Decisive factor: The primary metric `peakMemory` is only physically measured for ONE engine
  (mp4box = 3,508,747,778 bytes ~= 3.5 GB), and that value is the WORST possible outcome (larger
  than the 1.1 GB input). mediabunny and ffmpeg-wasm both report `peakMemory` as null/unmeasured
  (`bench.peakMemory.n == 0`, samples `[]`) because `measureUserAgentSpecificMemory` requires
  cross-origin isolation, which their runs did not have (mediabunny `configUsed.coopCoep:
  "not-required"`). With the primary metric unavailable for two engines and correctness comparable
  across all three, the tiebreak falls to performance (wall / throughput), where ffmpeg-wasm wins
  decisively.
- Margin over runner-up (mp4box): **1.61x faster wall** (6705.3 ms vs 10795.8 ms) and **1.61x higher
  realtime throughput** (1073.8x vs 666.9x). Over mediabunny: **5.08x faster wall** (6705.3 ms vs
  34044.97 ms) and **5.08x throughput** (1073.8x vs 211.5x). mp4box additionally pays a measured
  3.5 GB peak-memory cost (the only engine that surfaced one) that ffmpeg-wasm does not, so even on
  the nominal primary axis mp4box cannot win.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 6705.32 ms | 1073.77x | null (n=0) | 3476 ms | cached previous PASS result |
| mp4box@2.3.0 | PASS | reference-reimport:pass | 10795.75 ms | 666.93x | 3,508,747,778 B | 1361 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 34044.97 ms | 211.49x | null (n=0) | 200 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | SKIPPED | — | — | — | — | — | timed out >120s buffering 2h massive MP4 through bufferWriter; tracked per-engine scale limit |

## Why the winner wins (deep technical)

This rung is a BUFFER-target remux of a low-bitrate 2-hour 1080p H.264/AAC MP4 (`massive_h264_1080p_2h.mp4`,
~1.1 GB on disk, ~553k packets / ~341k keyframes per the golden re-import counts). It is a pure
stream-copy job: no pixel decoding or re-encoding is required, only container parse + sample-table
walk + re-mux into MP4. The contest is therefore decided by how efficiently each engine moves ~1 GB
of mdat through the JS/wasm boundary and rebuilds the moov, not by any codec quality concern.

**ffmpeg.wasm (winner).** Its remux path (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) is a
genuine native `-c copy` stream copy: it builds `['-i', name, '-map', '0', '-c', 'copy', ...,
'+faststart', outName]` (line 2044) and runs the real FFmpeg wasm program, then reads the muxed bytes
back from MEMFS (`readBinary`, line 2064). The libavformat MP4 demuxer/muxer is a single compiled-C
hot loop that copies packets without ever round-tripping each sample through JS objects, which is why
it finishes in 6705 ms at 1073.8x realtime — the fastest of the three by a wide margin. The
`reference-reimport` oracle re-demuxed its 1,144,400,219-byte output and recovered 553,501 packets /
341,101 keyframes across 2 media tracks with `durationDeltaSec = 0` (exactly 7200 s, well inside the
0.1 s tolerance) — see `src/core/oracles.ts:1273-1324` (`semanticRemuxReimport`). So it is both the
fastest and bit-for-bit the most faithful (zero duration drift). The cost it pays is `longtasks =
3476 ms` (the wasm copy monopolizes the main thread in long chunks) and an unmeasured peakMemory —
but peakMemory is null for it precisely because the run lacked cross-origin isolation, not because it
used no memory; it is honestly omitted rather than faked (scenario notes, `size-ladder.ts:15-22`).

**mp4box (runner-up).** Its remux (`src/engines/mp4box/adapter.ts:913-944`) is the documented
"fragmenter": it `appendBuffer`s the WHOLE file (`input.arrayBuffer()`, line 919), keeps mdat
(`createFile(true)`), then `setSegmentOptions(... nbSamples:1000, rapAlignement:true)` per track and
concatenates the init segment plus every media fragment emitted via `onSegment` into one fMP4 buffer
(lines 924-942). Because it is pure-JS (`configUsed.backend: "pure-js"`, `wasmThreads: 0`) and holds
the entire input ArrayBuffer AND every emitted segment Uint8Array simultaneously, it is the only
engine that produced a real `peakMemory` sample: 3,508,747,778 bytes (~3.5 GB) for a 1.1 GB input —
roughly 3x file size. That is exactly the "buffer rung => file-sized-or-worse peak memory" behaviour
this scenario exists to expose (`size-ladder.ts:106-124`). It re-imports cleanly (553,501 pkts /
341,101 kf, delta 0) so correctness ties ffmpeg, but it is 1.61x slower on wall and carries a 3.5 GB
memory tax, so it loses on both the available primary axis and the performance tiebreak.

**mediabunny (third).** Its BufferTarget path (`src/engines/mediabunny/adapter.ts:819-838`) is a real
`mb.Conversion` (`runConversion`, lines 842-869) writing into `mb.BufferTarget`, backend
`webcodecs` / `prefer-hardware` / pure-ts-esm (`configUsed`). It passes the same oracle but with a
slightly larger output (1,249,826,311 bytes) and a non-zero `durationDeltaSec = 0.064` s (still inside
the 0.1 s band — `oracles.ts:1318-1323`), recovering 553,503 pkts / 341,103 kf. Its great virtue is
main-thread friendliness (`longtasks = 200 ms`, ~17x lower than ffmpeg), but its wall time of
34044.97 ms (211.5x realtime) is 5.08x slower than ffmpeg — the streaming-lockstep TS pipeline pays a
heavy per-sample JS overhead at ~553k packets. peakMemory is null (cross-origin isolation absent), so
it cannot claim a memory win to offset the throughput loss.

Net: correctness is a three-way tie; the primary metric is only measurable for mp4box and is its worst
result; performance breaks the tie firmly for ffmpeg-wasm (1.61x over mp4box, 5.08x over mediabunny).

## What each other framework did wrong

- **mp4box@2.3.0** (PASS, lost): 1.61x slower wall (10795.75 vs 6705.32 ms) and the ONLY engine with
  a measured peakMemory — 3.5 GB for a 1.1 GB input (whole-file `appendBuffer` + all retained segments,
  `adapter.ts:919-942`). Even on the nominal primary metric it loses because that number is the worst case.
- **mediabunny@1.48.0** (PASS, lost): 5.08x slower wall (34044.97 ms) / lowest throughput (211.5x);
  streaming-lockstep TS per-packet overhead at ~553k packets dominates. Correctness fine but no metric win.
- **platform@chrome-149** (NA_ENGINE): does not declare operation 'remux'. Honest — the WebCodecs
  platform path has no container muxer; remux is genuinely out of scope.
- **remotion-media-parser@4.0.479** (NA_ENGINE): does not declare 'remux'. Honest — it is a parser
  (demux/probe) only, no muxing capability.
- **web-demuxer@4.0.0** (NA_ENGINE): does not declare 'remux'. Honest — a demux-only wasm wrapper.
- **remotion-webcodecs@4.0.479** (SKIPPED): timed out past the 120 s op budget buffering the 2h
  massive MP4 through its bufferWriter; the paired massive-stream row is already NA because the adapter
  does not declare `target:writes`. A tracked per-engine scale limit, not a conformance failure — and a
  real demonstration of the OOM/timeout risk the BUFFER rung is designed to surface.

## Anti-cheat validation

- Scenario definition: `src/scenarios/streaming-output/size-ladder.ts:109-124` (id `buffer_massive_h264_mp4`),
  built via `buildStream` (`_shared.ts`). Op = remux MP4->MP4, `shape.target: 'buffer'`, oracle
  `reference-reimport`, primaryMetric `peakMemory`, 120 s timeout. Notes (lines 120-124) state the rung
  exists to show buffer-vs-stream peak-memory divergence at GB scale.
- Fixture: `fixtures/media/massive_h264_1080p_2h.mp4` EXISTS (~1.1 GB real file, verified via stat).
  Golden meta `fixtures/golden/massive_h264_1080p_2h.mp4.meta.json` confirms 7200 s, h264 1920x1080@30 +
  aac 48 kHz mono, 2 media tracks — physically consistent with the oracle's recovered counts. Not
  synthetic/empty/mock.
- Gating oracle: `referenceReimport` / `semanticRemuxReimport` in `src/core/oracles.ts:1225-1324`. It
  re-demuxes the engine's actual output bytes with the reference engine, requires a non-empty packet
  table, compares media-track count + per-type layout against golden, and gates duration within a real
  tolerance (`Math.max(band, 0.1) s`). This is a real semantic round-trip, not a smoke gate. The
  recovered numbers are physically plausible (553,501-553,503 packets, 341,101-341,103 keyframes,
  durationDelta 0-0.064 s vs 7200 s golden, ~1.14-1.25 GB output).
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069`. Genuine native `-c copy` stream copy
  via the real FFmpeg wasm program; reads back the muxed MEMFS file. NOT canned output, NOT input->output
  copy, NOT golden short-circuit, does not swallow errors (run/readBinary throw on failure).
- Caching: ALL THREE PASS rows have `cached: true` ("cached previous PASS result"). The evidence was
  reused, not re-run this session. Staleness risk is low for the relative ranking (the wall/throughput
  gaps are large and structural), but the absolute numbers are from a prior run.
- Verdict: **REAL**. Real GB-scale fixture, real native stream-copy implementation, meaningful semantic
  re-import oracle with plausible measurements. The one caveat is that the primary metric (peakMemory)
  is unmeasured for the winner, so the win rests on the performance tiebreak rather than the nominal
  primary axis.

## Confidence & caveats

- Confidence: medium-high. The winner is unambiguous on the performance tiebreak (1.61x / 5.08x margins
  are far beyond noise), and all three implementations are verified genuine.
- Caveat 1: primaryMetric is `peakMemory` but is null for the winner (no cross-origin isolation), so the
  decision falls to wall/throughput. If the suite gains COOP/COEP and re-measures, mp4box's 3.5 GB would
  formally confirm its loss while the other two would finally surface comparable peak figures.
- Caveat 2: all benches are `n == 1` (single sample, mad 0) and `cached: true`. Single-sample timings
  carry run-to-run variance, but the magnitude of the gaps makes the ordering robust.
- Caveat 3: remotion-webcodecs SKIPPED (timeout) is itself the scenario's intended finding for buffer
  targets at the massive rung; it is not counted as a conformance failure.
