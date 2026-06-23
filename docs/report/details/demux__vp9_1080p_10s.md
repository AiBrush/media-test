# demux/vp9_1080p_10s

family: demux | fixture asset: `vp9_1080p_10s.webm` (9.3 MB, VP9 video + Opus audio, WebM/Matroska) | primaryMetric: wall (ms) | passCount: 5 / 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15**
- Contested: **YES** — 5 of 7 engines PASS with byte-identical correctness (`golden-packets`, 801 packets, 2 tracks, `maxPtsDriftUs=0`). Correctness is a tie, so the decision falls entirely to performance.
- Decisive factor: **wall-clock median**. ffmpeg.wasm demuxed in **47.22 ms** vs the runner-up remotion-webcodecs at **97.11 ms**.
- Margin over runner-up: **~2.06x faster wall** (47.22 ms vs 97.11 ms). Against the slowest PASS engine (platform, 6008.96 ms) the margin is **~127x**.
- Evidence strength caveat: every PASS bench is `n==1`, `cached==true`, `mad==0` (single sample). The ranking is directionally clear (47 ms vs 97 ms vs 114 ms vs 6009 ms — gaps far exceed any plausible single-sample jitter) but the exact ratios are low-confidence point measurements.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 47.22 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 97.11 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 97.30 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true | 113.88 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 6008.96 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true | 1013.71 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'webm' |

(Note: the bench block for every engine contains only the `wall` metric — there are no `throughputRealtime`, `peakMemory`, or `longtasks` samples in this shard, so those columns are n/a for all rows. Six engines actually PASS the oracle; I list web-demuxer and platform among them but they are far slower.)

## Why the winner wins (deep technical)

This is a **packet-enumeration demux** of a WebM/Matroska container carrying a VP9 1080p video track and an Opus audio track over ~10 s. The gating oracle (`golden-packets`, `src/core/oracles.ts:703`) requires the engine to reproduce the full ffprobe packet table: exact packet count (801), exact per-track `trackIndex` layout, **size-exact** per packet, **keyframe-flag-exact** per packet, and dts/pts within ±1 ms after a per-track constant-origin alignment. All five PASS engines satisfy this identically (`measuredCount==goldenCount==801`, `comparedTracks==2`, `maxPtsDriftUs==0`), so correctness cannot separate them — the win is a pure throughput result.

ffmpeg.wasm achieves its 47.22 ms because its demux path never decodes a single VP9 frame. The adapter (`src/engines/ffmpeg-wasm/adapter.ts:262-289`) deliberately avoids the broken vendored `_ffprobe` entry point and instead derives the packet table from `ffmpeg -i <in> -c copy -f framecrc <out>` (documented at `adapter.ts:269`). `-c copy` means the Matroska demuxer walks the SimpleBlock/Block cluster structure and copies compressed packets verbatim; the `framecrc` muxer then emits exactly one CSV line per packet (`stream, dts, pts, duration, size, 0xCRC[, F=0x<flags>]`). The parser at `adapter.ts:441-488` reads `#tb` timebase headers, converts dts/pts ticks to µs (`adapter.ts:478-484`), takes `size` from column 4, and infers the keyframe flag from the optional `F=` field (`adapter.ts:463-476` — framecrc omits `F=` for KEY-only packets, prints `F=0x0` for non-key). This is a stream-copy walk through native-speed C-compiled-to-wasm container parsing with zero pixel work, which is why it is roughly 2x faster than the WebCodecs/JS-parser competitors that set up additional decode/streaming machinery, and ~127x faster than the `platform` engine.

The `platform` engine (env.configUsed `backend:"webcodecs", hwAccel:true, pipeline:"streaming", decode:"VideoDecoder"`) at 6008.96 ms is the cautionary contrast: even though it passes the same packet oracle, its streaming/VideoDecoder-oriented config pays a large fixed setup and demux-extraction cost for what is, semantically, just a container packet walk — making it ~127x slower than ffmpeg.wasm for the identical result. ffmpeg.wasm’s framecrc stream-copy path is the right tool for packet enumeration: container parsing only, no codec engine spun up.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, correct (801 packets, drift 0), but **~2.06x slower** wall (97.11 ms vs 47.22 ms). It parses via its WebCodecs-oriented streaming-backpressure pipeline rather than a pure container stream-copy; the extra plumbing costs ~50 ms here. Runner-up only on speed.
- **remotion-media-parser@4.0.479** — PASS, correct, **~2.06x slower** (97.30 ms). `backend:"cpu-js"`, `fieldsTier:"full-parse(demux)"`: a JS Matroska parser doing a full element walk; correct but slower than the wasm stream-copy.
- **mediabunny@1.48.0** — PASS, correct, **~2.41x slower** (113.88 ms). Pure-TS ESM demux (`coreBuild:"pure-ts-esm"`, no SharedArrayBuffer, no COOP/COEP needed). Loses on speed only; its no-cross-origin-isolation profile is a real deployment advantage but is not the decisive factor for this throughput-only contest.
- **web-demuxer@4.0.0** — PASS, correct, but **~21.5x slower** (1013.71 ms). It is itself a wasm/libav-based demuxer but spends far more wall time than ffmpeg.wasm’s framecrc copy for the same 801-packet result.
- **platform@chrome-149** — PASS, correct, but **~127x slower** (6008.96 ms). WebCodecs/VideoDecoder streaming config incurs huge fixed cost for a pure packet-walk task.
- **mp4box@2.3.0** — NA_ENGINE, reason "engine does not declare input container 'webm'". This is an **honest** NA: MP4Box.js is an ISO-BMFF (MP4/MOV) parser and genuinely cannot read the EBML/Matroska (WebM) container. Not an under-declared capability.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:104` — `{ asset: 'vp9_1080p_10s.webm', container: 'webm', videoCodecs: ['vp9'], audioCodecs: ['opus'] }`. Defined as a `golden-packets` demux row in the shared demux table.
- Fixture: `fixtures/media/vp9_1080p_10s.webm` **exists**, 9.3 MB — a real VP9/Opus WebM file, not synthetic/empty/mock.
- Golden: `fixtures/golden/vp9_1080p_10s.webm.packets.json` **exists** (90 KB), consistent with an 801-packet table across 2 tracks.
- Oracle: `golden-packets` at `src/core/oracles.ts:703`. It is a **real, strict** comparison: packet count must match exactly (`:717`), per-track `trackIndex` multiset must match (`:724`), per-packet `size` exact (`:777`), keyframe flag exact (`:778`), and dts/pts drift bounded to ±1 ms after a per-track constant-origin offset (`:780-784`). Not trivially satisfiable; not a smoke gate; not ssim with exactFrames==0. Measurements are physically plausible: 801 packets over ~10 s of VP9+Opus, 2 tracks, `maxPtsDriftUs=0`.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:269` (framecrc demux command) and `adapter.ts:441-488` (real framecrc CSV → PacketInfo parser). The path genuinely invokes the vendored FFmpeg wasm via `-c copy -f framecrc`; it does **not** return canned output, copy input→output, short-circuit to the golden, or swallow errors. The per-asset NA special-cases at `adapter.ts:851-893` apply only to transcode/decode budget gating for OTHER assets (`large_vp9_1080p_120s.webm` transcode, `h264_1080p_30s.mp4`), not to this demux scenario.
- Verdict: **REAL** — real fixture + real wasm stream-copy demux implementation + strict, falsifiable packet-table oracle.
- Cached note: the winner's result has `cached==true` ("cached previous PASS result"), as do all five PASS engines. The PASS itself is genuine (deterministic packet table), but the **47.22 ms wall is a reused single-sample (`n==1`) measurement**, not freshly re-run — treat the exact timing as point evidence.

## Confidence & caveats

- Confidence: **high** for the winner identity. The 47.22 ms vs 97.11 ms gap (and the much larger gaps below) is far too wide to be flipped by single-sample noise.
- Caveats: (1) all PASS benches are `n==1`, `mad==0`, `cached==true` — exact ratios are point estimates, not distributions. (2) Only the `wall` metric is present; no peakMemory/throughput/longtasks to corroborate or to act as a tiebreak. (3) Correctness is a true tie across 5 engines, so this ranking rests entirely on wall time. (4) mediabunny's no-COOP/COEP, no-SharedArrayBuffer profile would be a meaningful deployment tiebreaker if timings were close — they are not.
