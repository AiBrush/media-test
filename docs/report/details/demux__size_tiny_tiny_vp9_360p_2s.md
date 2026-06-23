# demux/size_tiny_tiny_vp9_360p_2s

family: demux | fixture asset: `fixtures/media/tiny_vp9_360p_2s.webm` (VP9 video + Opus audio, WebM/Matroska, 640x360, 30fps, 2.008s, ~155 KB) | primaryMetric: wall | passCount: 6 of 7

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
Contested: **YES** — 6 of 7 engines PASS the identical single gating oracle (`golden-packets`) with byte-identical results (161 packets, 2 tracks, maxPtsDriftUs=0). Correctness is a flat tie, so the winner is decided purely on **performance (wall median)**.
Decisive factor: lowest wall median of the demux packet-walk. ffmpeg-wasm = 9.725 ms vs runner-up mediabunny = 11.885 ms.
Margin over runner-up: **1.22x faster wall** (9.725 ms vs 11.885 ms; 2.16 ms absolute). NOTE: all samples are n==1 (cached) — a 2.16 ms gap on a single sample is within measurement noise; the win is real-by-procedure but weak evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 9.725 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true | 11.885 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 12.840 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 14.580 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true | 89.920 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 6000.165 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

All bench entries carry only the `wall` metric (n=1, warmup=1, mad=0, p95==median); throughputRealtime / peakMemory / longtasks were not recorded for this tiny demux row.

## Why the winner wins (deep technical)

This row crosses the WebM format axis at tiny size: a VP9 video track and an Opus audio track muxed in a Matroska/WebM container (golden meta: container "webm", VP9 640x360@30, Opus 48 kHz stereo, durationSec 2.008). The operation is a pure packet-table demux — walk every container packet, report trackIndex / size / pts / dts / keyframe — with no decode required. The single gating oracle is `golden-packets` (src/core/oracles.ts:701-795), an order-independent, per-track comparison that groups both measured and golden packets by trackIndex, sorts each group by dts then pts, and checks count, trackIndex multiset layout, exact byte sizes, exact keyframe flags, and pts/dts drift after a constant per-track origin alignment (1ms tolerance via `seekToleranceUs`). The golden has 60 video + 101 audio = 161 packets; every passing engine produced measuredCount 161 == goldenCount 161, comparedTracks 2, maxPtsDriftUs 0 — i.e. zero timestamp residual after origin alignment, exact sizes and keyframe flags. That is a genuine structural/metadata-exact gate, not a smoke or proxy gate, so the 6-way tie is a strong correctness tie.

Because correctness is identical, the tiebreak falls to wall median of the demux loop. ffmpeg.wasm wins at 9.725 ms. Mechanistically: ffmpeg-wasm performs the WebM demux with a single `ffmpeg -hide_banner -i <in> -map 0 -c copy -f framecrc <out>` exec inside its wasm worker (src/engines/ffmpeg-wasm/adapter.ts:1961-1998), then parses the framecrc text — one line per stream-copied container packet — into the PacketInfo table (parser at adapter.ts:441-488). The `-c copy` path does not decode VP9 or Opus; FFmpeg's matroska demuxer just enumerates the SimpleBlock/Block entries from the cluster timeline and copies them, so the cost is a single Matroska cluster walk in native wasm with no per-frame entropy decode and no JS-object-per-packet allocation on the hot path. For a ~155 KB file this is essentially a memcpy-bounded parse, which is why it edges out the JS demuxers by ~2 ms.

The reason this is only a 1.22x edge (not larger) is that all the leaders run the same algorithmic shape — a single linear cluster/segment walk — and the file is tiny, so absolute times are all single-digit-to-low-double-digit milliseconds. mediabunny (runner-up, 11.885 ms) uses `EncodedPacketSink.packets(undefined, undefined, { verifyKeyPackets: true })` per track (src/engines/mediabunny/adapter.ts:1152-1183) in its pure-TS ESM core (configUsed.coreBuild "pure-ts-esm", no SharedArrayBuffer, coopCoep "not-required"); the `verifyKeyPackets` bitstream inspection plus per-packet JS object construction adds the ~2 ms. The decisive factor is therefore the lower constant-factor of the native wasm Matroska demux over the TS/JS demuxers for this small WebM, with correctness held equal at exact-match.

## What each other framework did wrong

- **mediabunny@1.48.0 (PASS, lost):** correctness identical (161 packets, maxPtsDriftUs 0), but wall 11.885 ms vs winner 9.725 ms — 1.22x slower (+2.16 ms). Pure-TS `EncodedPacketSink` walk with per-packet keyframe verification carries a higher constant factor than the native wasm framecrc walk. Loss is on performance only and is within n==1 noise.
- **remotion-media-parser@4.0.479 (PASS, lost):** identical correctness; wall 12.840 ms vs 9.725 ms = 1.32x slower (+3.12 ms). configUsed.backend "cpu-js", fieldsTier "full-parse(demux)" — a full JS parse of the WebM segment, slowest-but-one of the JS leaders.
- **remotion-webcodecs@4.0.479 (PASS, lost):** identical correctness; wall 14.580 ms vs 9.725 ms = 1.50x slower (+4.86 ms). Slowest of the four fast leaders; its streaming-backpressure pipeline overhead does not pay off at tiny size.
- **web-demuxer@4.0.0 (PASS, lost):** identical correctness; wall 89.920 ms vs 9.725 ms = 9.25x slower (+80.2 ms). Big constant overhead (its libav-based wasm demux pays a heavier per-call/setup cost) makes it an order of magnitude behind on this tiny file.
- **platform@chrome-149 (PASS, lost):** identical correctness; wall 6000.165 ms vs 9.725 ms = 617x slower. The platform path has no native demux-to-packet-table API, so it reconstructs the packet table via a decode/MediaRecorder route (configUsed.decode "VideoDecoder", encode "<video>→canvas→MediaRecorder"), which is hugely more expensive than a stream-copy walk. PASS but non-competitive.
- **mp4box@2.3.0 (NA_ENGINE):** honest NA — "engine does not declare input container 'webm'". MP4Box.js is an ISO-BMFF (MP4/MOV) parser and genuinely cannot read Matroska/WebM; the capability is correctly not declared in its registry, so the runner skips it rather than failing it. Not an under-declared capability.

## Anti-cheat validation

- Scenario definition: src/scenarios/demux/index.ts:322-329 — SIZE_CASES entry `asset: 'tiny_vp9_360p_2s.webm'`, container 'webm', bucket 'tiny', videoCodecs ['vp9'], audioCodecs ['opus']. notes: "Tiny 360p VP9/Opus WebM: crosses the WebM format axis at tiny size (golden 60 video + 101 audio)." — matches the observed 161-packet golden.
- Fixture exists: `fixtures/media/tiny_vp9_360p_2s.webm` present, ~155 KB — a real WebM file, not synthetic/empty/mock. Goldens present: `.packets.json` (18 KB, real per-packet sizes/pts/dts/keyframe entries verified by inspection), `.meta.json` (real VP9/Opus track meta), `.frames.json`, `.ssim.json`.
- Oracle: src/core/oracles.ts:701-795 (`goldenPackets`) — performs a real per-track, order-independent comparison of count, trackIndex layout, exact byte sizes, exact keyframe flags, and pts/dts drift (1ms tol) against the golden packets file. Not trivially satisfiable: any wrong count/size/keyframe/timing fails. Measurements (161==161, 2 tracks, maxPtsDriftUs 0) are physically plausible for a 2s 30fps VP9 (~60 video frames) + Opus (~101 ~20ms frames) WebM.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:1961-1998 (demux via `ffmpeg -map 0 -c copy -f framecrc`) + parser at adapter.ts:441-488. Genuine wasm FFmpeg invocation; no canned output, no copy-input-as-output, no short-circuit to golden, no error swallowing (a failed open throws on the missing Input block).
- Verdict: **REAL** — real fixture + real wasm demux implementation + meaningful structural-exact oracle with exact (drift-0) measurements.
- Cached note: ALL 7 entries have cached==true ("cached previous PASS result"); the winner's result was reused, not re-run this session. Staleness risk: the wall numbers are stale single-sample reads, so the 1.22x margin should be treated as provisional pending a fresh re-run.

## Confidence & caveats

- Confidence: **medium**. Correctness tie is rock-solid (6 engines, exact-match, real oracle). The winner ordering rests entirely on wall median.
- All wall measurements are n==1 (single sample, mad==0, p95==median) and cached==true. The 9.725 vs 11.885 ms gap (2.16 ms, 1.22x) is small enough to fall inside single-sample timer noise; a fresh multi-sample re-run could swap ffmpeg-wasm and mediabunny.
- The clear, non-noise signals are the order-of-magnitude losers: web-demuxer (9.25x) and platform (617x) are decisively non-competitive regardless of noise. mp4box's NA is honest (no WebM support).
- No throughputRealtime / peakMemory / longtasks recorded for this row, so the secondary performance tiebreakers could not refine the close ffmpeg-wasm vs mediabunny call.
