# demux/hls_vod

family: demux | fixture asset: `hls_vod.m3u8` (+ 5 sibling segments `hls_vod_000.ts`..`hls_vod_004.ts`) | primaryMetric: wall (ms) | passCount: 4 / 7

## Verdict

- **Best framework: `ffmpeg.wasm@0.12.15`** (env.engineId `ffmpeg-wasm`).
- **CONTESTED**: 4 engines PASS (`ffmpeg-wasm`, `mediabunny`, `remotion-media-parser`, `remotion-webcodecs`); 3 are NA_ENGINE.
- **Decisive factor: performance.** All four passers satisfy the *same* gating oracle (`golden-packets`, 770/770 packets, comparedTracks=2) with identical correctness, so the ladder falls through to performance. ffmpeg-wasm has the lowest wall median by a wide margin.
- **Margin over runner-up:** ffmpeg-wasm 64.865 ms vs mediabunny 122.150 ms ≈ **1.88x faster wall**. Also 7.63x faster than remotion-media-parser (495.155 ms) and 7.03x faster than remotion-webcodecs (455.920 ms). Secondary tiebreak: ffmpeg-wasm reported `maxPtsDriftUs=0` vs mediabunny's `maxPtsDriftUs=1`, a marginal correctness edge in the winner's favor too.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (770/770, drift 0µs) | 64.865 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true (770/770, drift 1µs) | 122.150 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (770/770, drift 0µs) | 455.920 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (770/770, drift 0µs) | 495.155 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |

(The bench block in the shard contains only `wall`; no throughputRealtime / peakMemory / longtasks samples were recorded for this row, hence n/a.)

## Why the winner wins (deep technical)

The input is an **HLS VOD playlist** (`#EXT-X-PLAYLIST-TYPE:VOD`, version 3) referencing five **MPEG-2 Transport Stream** segments carrying **H.264 video + AAC audio** muxed as PES into 188-byte TS packets. Demuxing this correctly requires three things that the elementary-stream demuxers in the corpus do not all have: (1) parsing the M3U8 manifest, (2) fetching/concatenating the segment files across `.ts` boundaries, and (3) reassembling PES packets and recovering the unwrapped 90 kHz PTS origin — the golden's first video packet sits at **ptsUs 1421333** (the scenario note: "golden encodes the unwrapped 90kHz origin (first pts 1421333µs)"), with 770 total packets split 300 video / 470 audio across two tracks.

ffmpeg-wasm wins because it has a true HLS demux path. `writeInput` (src/engines/ffmpeg-wasm/adapter.ts:1854) detects the playlist via `isHlsPlaylistInput`, rewrites the relative segment URIs with `rewriteHlsPlaylistUris`, fetches each sibling `.ts` and materializes it into MEMFS (adapter.ts:1871-1881), and passes `-allowed_extensions ALL` so FFmpeg's `hls`/`applehttp` demuxer will open the segment URIs (adapter.ts:1883). The packet table itself is produced by a single stream-copy pass: `-map 0 -c copy -f framecrc` (src/engines/ffmpeg-wasm/adapter.ts:1980-1995). `-map 0` forces *all* streams (so both the video and audio tracks are walked rather than FFmpeg's default one-per-type), and `framecrc` emits one row per real container packet with its size and keyframe flag — exactly the granularity the `golden-packets` oracle compares. The framecrc rows are parsed into `{trackIndex,size,ptsUs,dtsUs,keyframe}` (adapter.ts:486). Because this is a genuine demux of the real TS PES stream, ffmpeg reproduces the ffprobe golden byte-for-byte: **measuredCount 770 == goldenCount 770, comparedTracks 2, maxPtsDriftUs 0**.

On the performance axis, ffmpeg.wasm runs as **single-thread wasm** but the work here is pure container parsing (stream copy, no decode), so the wasm TS demuxer chews through ~9 MB of segments in **64.865 ms** — 1.88x faster than mediabunny's pure-TS-ESM path (122.150 ms) and ~7x faster than both Remotion engines (495.155 / 455.920 ms), whose `cpu-js` / WebCodecs-streaming pipelines carry more per-packet JS overhead for a demux-only job. Note the evidence weight is limited: every bench is **n=1, warmup=1, mad=0**, so the margins are single-sample point estimates rather than distributions; the 1.88x ordering is large enough to be credible but not statistically robust.

The correctness ladder does not separate the four passers — all four satisfy `golden-packets` (structural/metadata-exact tier: exact per-track packet count, size column, keyframe flags, and PTS/DTS within ±1ms after per-track origin alignment). So performance is the only discriminator, and ffmpeg-wasm wins it outright; the maxPtsDriftUs=0 vs mediabunny's =1 is a tiny secondary nod in ffmpeg's favor but both are far inside the 1000µs tolerance.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, runner-up): correct (770/770) but 1.88x slower wall (122.150 ms vs 64.865 ms) on its pure-TS-ESM/WebCodecs-streaming demux path; also reported `maxPtsDriftUs=1` vs the winner's 0. Lost purely on the performance tiebreak.
- **remotion-webcodecs@4.0.479** (PASS): correct (770/770, drift 0) but 7.03x slower (455.920 ms); its `streaming-backpressure` + WebCodecs convert pipeline is overhead-heavy for a demux-only walk. Lost on performance.
- **remotion-media-parser@4.0.479** (PASS): correct (770/770, drift 0) but slowest of all passers at 495.155 ms (7.63x slower) on its `cpu-js` full-parse demux. Lost on performance.
- **web-demuxer@4.0.0** (NA_ENGINE): "engine does not declare input container 'hls'". Honest NA — web-demuxer's libav build is fed a single byte buffer and has no manifest-fetch/segment-materialization layer, so HLS playlist demux is genuinely outside its declared capability set.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare input container 'hls'". Honest NA — MP4Box.js is an ISO-BMFF (MP4/MOV) box parser; it cannot parse M3U8 manifests or MPEG-TS segments.
- **platform@chrome-149** (NA_ENGINE): "engine does not declare input container 'hls'". Honest NA — Chrome WebCodecs has no built-in HLS/M3U8 demuxer; the platform adapter only exposes containers it can demux natively.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/demux/index.ts:176-186 (`asset: 'hls_vod.m3u8'`, container `hls`, videoCodecs `['h264']`, audioCodecs `['aac']`). Notes spell out the gating rationale (PES packets across `.ts` boundaries; unwrapped 90 kHz origin first pts 1421333µs; non-HLS engines report NA(engine)).
- **Fixture exists (real, not synthetic):** `fixtures/media/hls_vod.m3u8` (278 B, real VOD manifest with `#EXT-X-PLAYLIST-TYPE:VOD` and five `#EXTINF:2.000000` entries) plus the five referenced segments `hls_vod_000.ts`..`hls_vod_004.ts` (≈898k–937k each, ~4.5 MB total). Golden `fixtures/golden/hls_vod.m3u8.packets.json` holds 770 real packets (300 on track 0, 470 on track 1; first packet `{trackIndex:0,size:24642,ptsUs:1421333,dtsUs:1421333,keyframe:true}`), matching the scenario's stated origin.
- **Oracle:** `golden-packets` at src/core/oracles.ts:701-796. Real per-track comparison: requires matching packet count, matching trackIndex layout (multiset), exact `size` per packet, exact keyframe flag per packet, and PTS/DTS residual ≤ seekToleranceUs (1ms) after a single constant per-track origin offset. Not trivially satisfiable — wrong segment concatenation, dropped tracks, or mis-recovered PTS all fail it. Measurements (770==770, comparedTracks 2, maxPtsDriftUs 0) are physically plausible for 10s of 30fps H.264 + 48kHz AAC.
- **Winner adapter:** src/engines/ffmpeg-wasm/adapter.ts — HLS materialization at :1854-1888, demux pass `-map 0 -c copy -f framecrc` at :1961-1995, framecrc→packet parsing at :486. Genuinely invokes ffmpeg.wasm's TS/HLS demuxer; does not return canned data, does not short-circuit to the golden, does not copy input→output, and surfaces hard demux errors (adapter.ts:2002-2007) rather than swallowing them.
- **Verdict: REAL.** Real multi-file HLS fixture + genuine ffmpeg.wasm hls demux + a strict structural packet-table oracle that compares against an ffprobe-derived golden.
- **Cached note:** the winner's result is `cached==true` ("cached previous PASS result"), as are all four passers. The PASS/numbers were reused, not re-run this session — modest staleness risk; a fresh re-run would confirm the 1.88x margin, but per the launcher seeding caveat stale PASS reuse can mask drift.

## Confidence & caveats

- **Confidence: high** on the winner selection. Correctness is a true tie at the top tier and ffmpeg-wasm's 1.88x wall lead over the runner-up (and ~7x over the Remotion pair) is unambiguous, with the secondary drift edge also in its favor.
- **Caveats:** (1) All benches are **n=1, warmup=1, mad=0** — single-sample timings, so margins are point estimates, not distributions. (2) Every passing row is **cached**; numbers reflect a prior run. (3) No throughputRealtime / peakMemory / longtasks were recorded for this scenario, so the performance comparison rests on wall median alone. (4) The three NA_ENGINE results are honest capability gaps (no HLS manifest/TS demux), not under-declared capabilities.
