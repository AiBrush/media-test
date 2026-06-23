# demux/hevc_1080p_10s

- **family:** demux
- **fixture asset:** `fixtures/media/hevc_1080p_10s.mp4` (real file, ~11 MB; HEVC/H.265 video + AAC audio in MP4)
- **primaryMetric:** wall (ms)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` (CONTESTED — all 7 engines PASS the same oracle with identical correctness).
- **Decisive factor:** Performance. Correctness is a dead heat (every engine matched the golden packet table 770/770, 2 tracks, maxPtsDriftUs ≤ 1µs), so the tie breaks on wall-clock. mediabunny demuxes in **24.98 ms** — the fastest of all seven.
- **Margin over runner-up:** runner-up is `mp4box@2.3.0` at 80.23 ms. mediabunny is **3.21x faster** (80.23 / 24.98). Against the next contender ffmpeg.wasm (158.95 ms) it is 6.36x faster; against the slowest passing engine, `platform@chrome-149` (5714.05 ms), it is ~228x faster. All n=1 single-sample, so the margin is a point estimate (see caveats).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true (770/770, 2 tracks, drift 1µs) | 24.98 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true (770/770, 2 tracks, drift 1µs) | 80.23 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (770/770, 2 tracks, drift 0µs) | 158.95 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (770/770, 2 tracks, drift 1µs) | 519.38 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (770/770, 2 tracks, drift 1µs) | 731.55 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true (770/770, 2 tracks, drift 0µs) | 925.94 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true (770/770, 2 tracks, drift 1µs) | 5714.05 | n/a | n/a | n/a | cached previous PASS result |

(No throughputRealtime / peakMemory / longtasks metrics were recorded in this shard's `bench{}`; only `wall` is present for each engine.)

## Why the winner wins (deep technical)

**The operation.** This is a pure read-side demux: enumerate the encoded packet table of an HEVC-in-MP4 file and prove sizes, keyframe flags, track layout and timestamps match an ffprobe-derived golden. Critically, demux does **not** require an HEVC decoder — it only requires parsing the `hvcC`-described sample table (`stsz`/`stss`/`stts`/`ctts`/`stco`) and walking the `mdat`. The scenario note (`src/scenarios/demux/index.ts:146-148`) makes this explicit: "the packet table (sizes/keyframes/dts<pts) must match golden exactly" and codec-gated engines that cannot *configure* HEVC should report NA(browser), not FAIL. Here, none reported NA — every engine parses the container without needing the system HEVC codec.

**Why correctness ties.** The gating oracle `golden-packets` (`src/core/oracles.ts:703-796`) does an order-independent per-track comparison: it groups both measured and golden packets by `trackIndex`, sorts each group by dts then pts, and compares position-by-position requiring **exact** `size` match and **exact** `keyframe`-flag match, with a 1ms (`seekToleranceUs`) tolerance on pts/dts *after* per-track origin alignment. The golden table has 770 packets (track 0 = 300 video samples = 10s @ 30fps; track 1 = 470 AAC frames; 475 keyframes total). All seven engines returned `measuredCount: 770 == goldenCount: 770`, `comparedTracks: 2`, and `maxPtsDriftUs` of 0 (ffmpeg.wasm, web-demuxer) or 1 (the rest). No size or keyframe mismatches anywhere. So correctness is genuinely indistinguishable and the decision falls to performance per rule A.4(b).

**Why mediabunny is fastest.** mediabunny's demux path (`src/engines/mediabunny/adapter.ts:1152-1183`) opens the input, gets tracks, and for each track drives `EncodedPacketSink.packets(undefined, undefined, { verifyKeyPackets: true })` (line 1165), pulling `pkt.byteLength`, `pkt.microsecondTimestamp` and `pkt.type==='key'`. mediabunny is a pure-TS ESM core (`env.configUsed.coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`) that reads the MP4 box structure directly and streams packets in decode order. For an HEVC-in-MP4 file this means it parses `moov`/`stbl` once and iterates the sample table with no decoding and no transcode — it never instantiates a `VideoDecoder` for the demux op. That gives it the lowest fixed cost: **24.98 ms**.

The contrast with the field is mechanistic:
- **mp4box (80.23 ms, 3.21x slower)** is also pure-JS box parsing but uses a whole-file `appendBuffer` model (`pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"`, `rangeReads: false`) — it buffers the entire 11 MB then re-walks samples through its `onSamples` callback machinery, which is heavier per-packet than mediabunny's direct sink iteration.
- **ffmpeg.wasm (158.95 ms, 6.36x slower)** must boot the wasm module and run libavformat's full demuxer over the file; the wasm boundary and emulated I/O dominate even though it produces the most precise timestamps (drift 0µs).
- **platform/Chrome (5714.05 ms, ~228x slower)** routes through the browser WebCodecs/MediaSource stack with a heavy `<video>→canvas→MediaRecorder` pipeline configured for the encode side; for demux this path is enormously over-provisioned and hardware-accelerated decode setup adds seconds of fixed cost.

mediabunny also has the cleanest deployment profile among the WebCodecs-class engines (no COOP/COEP, no SharedArrayBuffer), which is the rule A.4(c) tiebreaker — though it never needed it since it won outright on wall.

## What each other framework did wrong

- **mp4box@2.3.0** — PASS, correct (770/770, drift 1µs), but 3.21x slower (80.23 ms vs 24.98 ms): whole-file-append buffering + callback-based sample extraction has higher per-packet overhead than mediabunny's streaming `EncodedPacketSink`.
- **ffmpeg.wasm@0.12.15** — PASS, most precise timestamps (drift 0µs), but 6.36x slower (158.95 ms): wasm module boot + emulated file I/O + full libavformat demux dominate the wall time.
- **remotion-media-parser@4.0.479** — PASS, correct (770/770, drift 1µs), but 20.8x slower (519.38 ms): `cpu-js` full-parse demux on the main thread (`fieldsTier: "full-parse(demux)"`, `worker: false`) with a generic web-reader is far heavier than mediabunny's targeted box walk.
- **remotion-webcodecs@4.0.479** — PASS, correct (770/770, drift 1µs), but 29.3x slower (731.55 ms): main-thread conversion pipeline with backpressure/queue machinery layered over parsing; its MP4 sample-table fast paths target large/progressive files, not this row.
- **web-demuxer@4.0.0** — PASS, precise (drift 0µs), but 37.1x slower (925.94 ms): wraps an ffmpeg-derived wasm demuxer, so it carries the same wasm boot/I/O tax as ffmpeg.wasm plus its own worker bridge.
- **platform@chrome-149** — PASS, correct (770/770, drift 1µs), but ~228x slower (5714.05 ms): the browser-native pipeline (`<video>`/MediaRecorder, hardware decode setup) is grossly over-provisioned for a packet-enumeration task.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:141-149` — `asset: 'hevc_1080p_10s.mp4'`, `container: 'mp4'`, `videoCodecs: ['hevc']`, `audioCodecs: ['aac']`, with a note demanding exact packet-table match.
- **Fixture:** `fixtures/media/hevc_1080p_10s.mp4` exists, ~11 MB — a real HEVC/AAC MP4, not synthetic/mock/empty.
- **Golden:** `fixtures/golden/hevc_1080p_10s.mp4.packets.json` (87 KB) — 770 packets, 2 tracks (300 video + 470 audio), 475 keyframes; physically consistent with 10s @ 30fps HEVC + AAC.
- **Oracle:** `src/core/oracles.ts:703-796` (`goldenPackets`). Performs a genuine, non-trivial comparison: exact `size` match, exact `keyframe`-flag match, track-layout multiset match, and pts/dts drift ≤ 1ms after per-track origin alignment. It is NOT a smoke gate and NOT trivially satisfiable; size and keyframe tolerances are zero. Measurements are plausible (770/770, drift 0–1µs).
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1152-1183`. Genuinely implemented — opens the real input via `openInput`, walks `getTracks()`, drives the real `EncodedPacketSink.packets({verifyKeyPackets:true})`, and emits real `pkt.byteLength` / `pkt.microsecondTimestamp` / `pkt.type`. No canned output, no copy-input-to-output, no short-circuit to the golden, no swallowed errors. One honest documented limitation (lines 1144-1150): mediabunny abstracts DTS away, so the adapter sets `dtsUs === ptsUs`; the oracle's per-track origin alignment + 1ms tolerance accommodates this without weakening the size/keyframe/count checks.
- **Cached note:** mediabunny's result has `cached: true` ("cached previous PASS result"), as do all seven engines in this shard. The PASS and 24.98 ms wall were reused from a prior run, not re-executed here — staleness risk exists, but the winner's relative ordering is robust (3.21x margin over the runner-up).
- **Verdict:** **REAL** — real 11 MB fixture, real library packet-walk implementation, meaningful zero-tolerance correctness oracle with plausible measurements.

## Confidence & caveats

- **Confidence: high** for the correctness verdict (zero-tolerance oracle, 7/7 exact 770-packet match) and the qualitative ordering (mediabunny's pure-TS streaming sink vs wasm-boot and browser-pipeline competitors).
- **Caveat — n=1:** every wall figure is a single sample (`n:1`, `mad:0`, `p95==median`). The 3.21x margin over mp4box is large enough to survive normal variance, but the precise ratios are point estimates, not distributions.
- **Caveat — all cached:** every engine's row is `cached: true`; numbers were reused, not freshly re-run. Per the launcher seeding caveat, a fully honest fresh run would require clearing the cache.
- **Caveat — DTS:** mediabunny reports `dtsUs === ptsUs`; B-frame decode-order timing is observable only via decode-order sequence, not an independent DTS. This did not affect the result here (HEVC packet table still matched), but is a known modeling simplification.
