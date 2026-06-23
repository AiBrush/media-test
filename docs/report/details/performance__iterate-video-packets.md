# performance/iterate-video-packets

- **family:** performance
- **fixture asset:** `h264_1080p_30s.mp4` (31 MB, H.264 video + AAC audio in progressive MP4; bake fallback identical)
- **golden:** `fixtures/golden/h264_1080p_30s.mp4.packets.json` (264 KB, 2308 packet rows from ffprobe)
- **primaryMetric:** `packetsPerSec`
- **passCount:** 7 / 7

## Verdict

- **Best framework:** `web-demuxer@4.0.0` — **CONTESTED** (all 7 engines PASS the same `golden-packets` oracle).
- **Decisive factor:** correctness is identical across all seven (every engine reproduces the 2308-packet table exactly, `maxPtsDriftUs` 0–1µs, 2 tracks compared), so the tie breaks on the primary performance metric, `packetsPerSec`. web-demuxer is fastest.
- **Margin over runner-up:** `remotion-media-parser@4.0.479` at 187,642 packets/s. web-demuxer 228,628 packets/s = **1.22x higher throughput** (wall 10.095 ms vs 12.30 ms = **1.22x faster wall**). Both are `n=1, mad=0` single-shot samples, so the margin is real but low-confidence as evidence.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | packetsPerSec | maxPtsDriftUs | reason |
|---|---|---|---|---|---|---|
| web-demuxer@4.0.0 | PASS | golden-packets:pass | 10.095 | 228,628 | 1 | cached previous PASS |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass | 12.30 | 187,642 | 1 | cached previous PASS |
| mediabunny@1.48.0 | PASS | golden-packets:pass | 62.205 | 37,103 | 1 | cached previous PASS |
| platform@chrome-149 | PASS | golden-packets:pass | 75.94 | 30,392 | 1 | cached previous PASS |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass | 99.96 | 23,089 | 0 | cached previous PASS |
| mp4box@2.3.0 | PASS | golden-packets:pass | 160.12 | 14,414 | 1 | cached previous PASS |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass | 1944.83 | 1,187 | 1 | cached previous PASS |

(No `throughputRealtime`, `peakMemory`, or `longtasks` metrics are emitted for this scenario — only `packetsPerSec` and `wall`.)

## Why the winner wins (deep technical)

The operation is `op: 'demux'` over a **progressive (faststart) H.264/AAC MP4**: walk every elementary-stream packet of both tracks and report each packet's track index, byte size, presentation/decode timestamp and keyframe flag (`src/scenarios/performance/index.ts:111-127`). For a progressive MP4 the entire packet table is fully described by the `moov` sample-table boxes — `stsz` (per-sample sizes), `stts` (decode-time deltas), `ctts` (composition offsets → PTS), and `stss` (sync-sample / keyframe list) — none of which require touching the `mdat` payload.

web-demuxer's adapter recognizes exactly this and takes a moov-only fast path. `demux()` first calls `shouldUseProgressiveMp4SampleTableFastPath(input)` (`src/engines/web-demuxer/adapter.ts:765`), which returns true because `h264_1080p_30s.mp4` is in `SAMPLE_TABLE_FAST_PATH_ASSETS` and the input is unmutated (`src/engines/web-demuxer/mp4-sample-table.ts:15-19, 39-41`). It then runs `demuxProgressiveMp4SampleTable()` (`mp4-sample-table.ts:48-61`): an HTTP-Range read of just the `moov` box (`readMoovBox`, `mp4-sample-table.ts:68-89`, 64 KB header probe then a single range fetch of the moov), and a hand-written ISO-BMFF parser (`sampleTablesFromMoov` → `sampleTableFromTrak`, `mp4-sample-table.ts:108-160`, `parseStsz` at `:308`) that synthesizes the 2308 `PacketInfo` rows directly from the tables. This is why it posts the lowest wall (10.095 ms) and highest throughput (228,628 packets/s): it never instantiates the FFmpeg-WASM `AVPacketReader`, never demuxes `mdat`, and never crosses a worker boundary per packet. The slower general path (also present, `adapter.ts:786-824`) would drain `d.readAVPacket(...)` ReadableStreams from the bundled FFmpeg worker — correct, but per-packet worker reads cost an order of magnitude more.

Correctness is not sacrificed: the `golden-packets` oracle (`src/core/oracles.ts:703-796`) groups both sides by `trackIndex`, sorts by dts/pts, and compares **counts, track layout, per-packet size, keyframe flag, and pts/dts** with a constant per-track origin offset allowed (to absorb the −21333µs edit-list/priming on track 1 that ffprobe exposes). web-demuxer matches all of it: `measuredCount 2308 == goldenCount 2308`, `comparedTracks 2`, `maxPtsDriftUs 1` — i.e. sub-microsecond residual after origin alignment, sizes and keyframes exact. Reading sizes from `stsz` and keyframe flags from `stss` is the same source ffprobe used, so the table is structurally identical to the golden rather than perceptually close.

Backend note: web-demuxer ran with no special config (pure HTTP-Range + JS box parse on the main thread); the runner-up remotion-media-parser ran `backend: cpu-js, pipeline: streaming, reader: webReader, fieldsTier: full-parse(demux)` — a genuine full streaming demux, which is why it is close (187,642 packets/s) but still ~22% behind the moov-only shortcut.

## What each other framework did wrong

- **remotion-media-parser@4.0.479 (PASS, runner-up):** correct and fast (full streaming `cpu-js` demux, golden-packets pass, `maxPtsDriftUs 1`), but 187,642 vs 228,628 packets/s = 0.82x throughput, wall 12.30 vs 10.095 ms. Lost purely on speed because it does a real full parse rather than a curated moov-table shortcut.
- **mediabunny@1.48.0 (PASS):** correct (golden-packets pass, drift 1µs) but 37,103 packets/s — **6.2x slower** than web-demuxer (wall 62.205 ms). Pure-TS streaming demux without the per-asset sample-table fast path.
- **platform@chrome-149 (PASS):** correct (drift 1µs) but 30,392 packets/s — **7.5x slower** (wall 75.94 ms). The WebCodecs platform path carries demux overhead it cannot amortize for pure packet enumeration.
- **ffmpeg.wasm@0.12.15 (PASS):** the most exact (`maxPtsDriftUs 0`) but 23,089 packets/s — **9.9x slower** (wall 99.96 ms). Single-thread WASM with full container demux through the FFmpeg pipeline; correctness-perfect, throughput-poor.
- **mp4box@2.3.0 (PASS):** correct (drift 1µs) but 14,414 packets/s — **15.9x slower** (wall 160.12 ms). `whole-file-append(MP4BoxBuffer+fileStart)`, `rangeReads:false` — it appends the whole 31 MB file before yielding samples, the opposite of web-demuxer's moov-only range read.
- **remotion-webcodecs@4.0.479 (PASS, last):** correct (drift 1µs) but only 1,187 packets/s — **193x slower** (wall 1944.83 ms). Its `streaming-backpressure` WebCodecs convert pipeline is built for transcode, not bare packet iteration, so it pays full pipeline setup for a counting task.

## Anti-cheat validation

- **Scenario:** `src/scenarios/performance/index.ts:111-127` — `op:'demux'`, `input: BIG_READ_ASSET = 'h264_1080p_30s.mp4'` (`index.ts:73`), oracle `golden-packets`, notes confirm "iterate every video packet … correctness gated by golden-packets".
- **Fixture exists & is real:** `fixtures/media/h264_1080p_30s.mp4` = 31 MB real H.264/AAC MP4 (not synthetic/empty). Golden `fixtures/golden/h264_1080p_30s.mp4.packets.json` = 264 KB, first rows show real edit-list priming (`ptsUs:-21333`) and real H.264 sizes (50539-byte IDR keyframe, 303/416-byte AAC frames) — physically plausible for 1080p H.264 + AAC.
- **Oracle is meaningful, not trivially satisfiable:** `src/core/oracles.ts:703-796` compares exact packet count, track-layout multiset, per-packet size, keyframe flag, and pts/dts with only a ±1ms residual after a *constant* origin offset (a varying residual still FAILs). A skip-ahead/short-read demux would mismatch counts/sizes and fail. web-demuxer's measurements (`measuredCount 2308`, `comparedTracks 2`, `maxPtsDriftUs 1`) are physically consistent with the golden.
- **Winner adapter is genuinely implemented:** `src/engines/web-demuxer/adapter.ts:764-829` plus `src/engines/web-demuxer/mp4-sample-table.ts:48-160`. It does NOT return canned output, copy input→output, or short-circuit to the golden file — it issues real HTTP-Range reads of the moov box and parses ISO-BMFF stsz/stts/ctts/stss to synthesize packet rows from the actual file's real metadata.
- **Caveat (why not unreserved REAL):** the winning number comes from a **per-asset curated fast path** (`SAMPLE_TABLE_FAST_PATH_ASSETS` hard-codes exactly the three benchmarked large MP4/MOV assets, `mp4-sample-table.ts:15-19`). For these specific assets web-demuxer bypasses its own FFmpeg-WASM `readAVPacket` packet reader (the path other engines effectively exercise) and reads only the moov. The output is still correct and the moov-table read is a legitimate way to enumerate progressive-MP4 packets, but the headline `packetsPerSec` measures a shortcut tailored to the benchmark inputs rather than the library's general demux loop — so the *performance* margin is somewhat flattered.
- **Cached:** ALL 7 results have `cached:true` ("cached previous PASS result"). The numbers were reused, not freshly re-run, so there is staleness risk and the n=1 wall/throughput samples cannot be re-confirmed in this run.
- **Verdict:** **WEAK-GATE.** The fixture is real, the implementation genuinely parses real file metadata, and the oracle is a strong structural gate (PASS is real). But the winning *performance* figure is produced by a benchmark-specific curated fast path that sidesteps the general packet reader, and all evidence is cached n=1 — so the speed ranking, while plausible, is not a clean apples-to-apples measurement of equivalent code paths.

## Confidence & caveats

- **Confidence: medium.** Correctness ordering is unambiguous (all 7 pass an exact structural oracle). The speed ordering is directionally clear but rests on `n=1, mad=0` cached single shots, and web-demuxer's lead is amplified by a curated per-asset moov-only fast path rather than its general demux loop.
- ffmpeg.wasm is actually the most *exact* (`maxPtsDriftUs 0`) but ~9.9x slower; if the rubric weighted timestamp exactness over throughput it would lead — it does not, since `primaryMetric` is `packetsPerSec` and all engines clear the oracle.
- Re-running fresh (clearing cache) and lifting the three benchmark assets out of `SAMPLE_TABLE_FAST_PATH_ASSETS` would test whether web-demuxer still wins on its general FFmpeg-WASM packet path, or whether remotion-media-parser's honest full-parse overtakes it.
