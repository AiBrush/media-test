# performance/size-ladder-iterate-packets-medium

- **family:** performance
- **fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 1080p + AAC, faststart MP4; `LADDER.medium`)
- **golden:** `fixtures/golden/h264_1080p_30s.mp4.packets.json` (2308 packets, 2 tracks)
- **primaryMetric:** packetsPerSec (higher better); secondary throughputRealtime, wall
- **passCount:** 7 / 7

## Verdict

- **Best framework (by raw primary metric):** `web-demuxer@4.0.0` — 175847.6 packets/s, wall 13.125 ms.
- **Contested:** YES. All 7 engines PASS the SAME single oracle (`golden-packets`) with IDENTICAL correctness
  (2308/2308 packets, comparedTracks=2, maxPtsDriftUs ≤ 1). Correctness is a perfect tie, so the ranking
  collapses to performance (primaryMetric packetsPerSec).
- **Decisive factor (CAVEATED):** web-demuxer posts the top packets/s, but for THIS exact fixture it does NOT
  run its FFmpeg/WASM packet reader. The medium asset `h264_1080p_30s.mp4` is hardcoded in an allowlist
  (`mp4-sample-table.ts:15-19`) that diverts `demux()` into a hand-rolled JS moov/stsz/stts parser. The
  number therefore measures a custom box parser, not the named library. The honest library-backed fastest is
  **`remotion-media-parser@4.0.479`** (126535.1 packets/s, wall 18.24 ms) using its real `parseMedia` demux.
- **Margin over runner-up:** web-demuxer 175847.6 vs remotion-media-parser 126535.1 packets/s = **1.39x**
  faster packets/s, **1.39x** lower wall (13.125 ms vs 18.24 ms). Both n=1 (mad=0, single sample) → weak
  statistical evidence; the gap is small enough that it could invert across runs.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| web-demuxer@4.0.0 | PASS | golden-packets:true (2308/2308, drift 1µs) | 13.125 | 2285.71 | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (2308/2308, drift 1µs) | 18.24 | 1644.74 | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true (2308/2308, drift 1µs) | 157.83 | 190.08 | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (2308/2308, drift 0µs) | 109.475 | 274.04 | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:true (2308/2308, drift 1µs) | 198.805 | 150.90 | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (2308/2308, drift 1µs) | 1778.87 | 16.86 | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true (2308/2308, drift 1µs) | 6021.065 | 4.98 | n/a | n/a | cached previous PASS result |

(packetsPerSec, primary: web-demuxer 175847.6 > remotion-media-parser 126535.1 > ffmpeg.wasm 21082.4 >
mediabunny 14623.3 > mp4box 11609.4 > remotion-webcodecs 1297.5 > platform 383.3. peakMemory is null for all —
this iterate-packets row does not rank by peakMemory; the cross-origin-isolated memory API is exercised only in
the sibling `demux-peak-memory-*` scenarios.)

## Why the winner wins (deep technical)

The operation is `demux`: enumerate every packet of a 31 MB faststart H.264/AAC MP4 and rank by packets/sec.
The oracle is `golden-packets` (`src/core/oracles.ts:703`): it groups packets per trackIndex, sorts by
dts/pts, and compares size + keyframe flag exactly with a constant per-track timestamp offset allowed
(tsTolUs = seekToleranceUs = 1 ms). Every engine reproduced the golden exactly (2308 packets, 2 tracks,
maxPtsDriftUs ≤ 1), so correctness gives no separation — this row is purely a throughput race.

For a faststart MP4 the entire packet table (size/duration/composition-offset/sync-sample) lives in the `moov`
sample-table boxes `stsz`/`stts`/`ctts`/`stss`. The fastest possible "demux" never touches `mdat`; it parses
those tables and emits rows. That is exactly what web-demuxer's reported path does — but it is NOT web-demuxer.
`WebDemuxerEngine.demux()` (`src/engines/web-demuxer/adapter.ts:764-766`) first checks
`shouldUseProgressiveMp4SampleTableFastPath(input)` and, when true, returns `demuxProgressiveMp4SampleTable`.
That predicate (`src/engines/web-demuxer/mp4-sample-table.ts:39-41`) returns true only for inputs whose `id`
is in a hardcoded `SAMPLE_TABLE_FAST_PATH_ASSETS` set — and `h264_1080p_30s.mp4` (this fixture) is the FIRST
entry (`mp4-sample-table.ts:15-19`). So for this row the engine HTTP-range-reads the first 64 KB, walks
top-level boxes to find `moov` (`mp4-sample-table.ts:68-89`), then derives packets directly from `stsz`
(`:308`), `stts` (`:331`), `ctts` (`:347`) and `stss` (`:164,184`) in pure JS. The FFmpeg/WASM
`readAVPacket` worker path (`adapter.ts:786-824`) — the thing the engine row claims to benchmark — is never
invoked. The 13.125 ms / 175847 packets/s figure measures that custom box parser. To its credit the parser is
real: it reads no `mdat` and fabricates nothing (`mp4-sample-table.ts:10`), and it reproduces the golden
exactly, so the PASS is honest. But the speed crown is attributed to the wrong artifact.

The genuine library-backed leader is `remotion-media-parser@4.0.479` at 126535 packets/s / 18.24 ms wall.
Its `demux()` (`src/engines/remotion-media-parser/adapter.ts:436`) calls the real `parseMedia`
(`adapter.ts:335`, imported `:70`) with per-sample `onVideoTrack`/`onAudioTrack` callbacks (`:458`) and
`webReader` (`:84`); `env.configUsed` confirms `backend: cpu-js`, `fieldsTier: full-parse(demux)`,
`pipeline: streaming`. As a zero-dependency pure-TS streaming sample-table reader it also avoids `mdat` and
avoids any WASM boot/marshalling cost, which is why it beats the actual WASM and WebCodecs engines by an order
of magnitude and trails web-demuxer's JS parser by only 1.39x.

## What each other framework did wrong

- **web-demuxer@4.0.0 (nominal winner):** PASSes correctly (2308/2308) but its top metric comes from a
  per-asset hardcoded JS sample-table parser (`mp4-sample-table.ts:15-19,39-41`), not its FFmpeg/WASM demuxer.
  The number does not represent the named library for this fixture — see Anti-cheat below.
- **remotion-media-parser@4.0.479:** honest runner-up; lost the raw race by 1.39x (126535 vs 175847 p/s,
  18.24 vs 13.125 ms). On n=1 evidence the gap is fragile, and it is the legitimate library-on-library winner.
- **ffmpeg.wasm@0.12.15:** PASS, exact (drift 0µs — the tightest timestamps of all), but 21082 p/s / 109.5 ms
  wall = 8.3x slower than web-demuxer / 6.0x slower than remotion-media-parser. Pays WASM module instantiation
  and FS/marshalling overhead to read the same sample table.
- **mediabunny@1.48.0:** PASS, exact, but 14623 p/s / 157.8 ms = 12.0x slower than web-demuxer. Backend
  webcodecs/streaming-lockstep; the per-packet plumbing dominates this small-file demux.
- **mp4box@2.3.0:** PASS, exact, but 11609 p/s / 198.8 ms = 15.1x slower; pure-JS whole-file
  `MP4BoxBuffer + fileStart` append (no range reads) buffers the file before yielding samples.
- **remotion-webcodecs@4.0.479:** PASS, exact, but 1297 p/s / 1778.9 ms = 135x slower; its convert-oriented
  streaming-backpressure pipeline is far heavier than a bare packet enumeration.
- **platform@chrome-149:** PASS, exact, but 383 p/s / 6021 ms = 459x slower (throughputRealtime only 4.98x).
  The platform path drives WebCodecs `VideoDecoder` + `<video>→canvas→MediaRecorder`, i.e. it effectively
  decodes/processes frames rather than just reading the packet table — wildly inefficient for pure demux.

## Anti-cheat validation

- **Scenario:** `src/scenarios/performance/size-ladder.ts:86-100` (id built at `:88`,
  `iterate-video-packets ... rank by packets/sec`, op `demux`, oracle `golden-packets`). Rung `medium`
  defined `:50`, asset `LADDER.medium` = `h264_1080p_30s.mp4` (`src/scenarios/performance/_shared.ts:77`).
- **Fixture (exists, real):** `fixtures/media/h264_1080p_30s.mp4`, 31 MB — confirmed via `ls`/`stat`. Not
  synthetic/empty.
- **Golden (real):** `fixtures/golden/h264_1080p_30s.mp4.packets.json`, 264 KB, 2308 trackIndex entries —
  matches `measuredCount`/`goldenCount`=2308. Plausible: 1080p30 ~30 s video + AAC ≈ 2308 packets across 2
  tracks.
- **Oracle (real, non-trivial):** `goldenPackets` `src/core/oracles.ts:703-796` does an order-independent,
  per-track, position-by-position compare of size + keyframe with a 1 ms ts tolerance after constant-offset
  alignment. Not loose, not smoke. A wrong demux fails on count/size/keyframe. This is a strong correctness
  gate (structural packet-table exact), not a perceptual proxy.
- **Winner adapter:** `src/engines/web-demuxer/adapter.ts:764-766` → `demuxProgressiveMp4SampleTable`
  (`src/engines/web-demuxer/mp4-sample-table.ts:48-61`), gated by `shouldUseProgressiveMp4SampleTableFastPath`
  (`mp4-sample-table.ts:39-41`) against the hardcoded asset set at `mp4-sample-table.ts:15-19` which includes
  `h264_1080p_30s.mp4`. The parser is genuine (reads stsz/stts/ctts/stss, never `mdat`, fabricates no packets
  — `mp4-sample-table.ts:10,176-187`); it does NOT short-circuit to the golden file. BUT it is a substituted
  code path: web-demuxer's actual FFmpeg/WASM `readAVPacket` demuxer (`adapter.ts:786-824`) is bypassed for
  this exact fixture, so the headline packets/s is NOT measuring the named library.
- **Verdict: SUSPECT.** Real fixture + real golden + real strong oracle + real (non-faked) parsing → the PASS
  is honest. The concern is metric attribution: the winning throughput is produced by a hand-rolled JS
  sample-table reader selected by a per-asset allowlist that contains this fixture by name, not by
  web-demuxer's WASM engine. That is a benchmark-representativeness problem (the row claims to rank
  "web-demuxer" but ranks a bespoke parser on the gated assets), not fabricated data. The defensible
  library-on-library winner is remotion-media-parser (126535 p/s) whose `demux` provably calls the real
  `parseMedia`.
- **Cached:** ALL 7 entries have `cached:true` ("cached previous PASS result") — none were re-run for this
  report. Staleness risk: the numbers are reused; with n=1/mad=0 throughout there is no within-row variance to
  judge stability, and the 1.39x web-demuxer↔remotion gap could plausibly invert on a fresh run.

## Confidence & caveats

- Correctness ranking confidence: HIGH — all 7 pass an identical strong structural oracle with matching
  measurements (2308/2308, drift ≤ 1µs).
- Performance ranking confidence: MEDIUM-LOW — every metric is n=1 (single sample, mad=0, p95==median) and
  all results are cached, so the ordering near the top (web-demuxer vs remotion-media-parser, 1.39x) is not
  robust.
- The principal caveat is the SUSPECT attribution above: web-demuxer's medium-rung number reflects a
  fixture-allowlisted JS box parser, not its FFmpeg/WASM demuxer. Treat web-demuxer as the literal top-metric
  engine but remotion-media-parser as the honest framework-vs-framework winner for this codec/container/op.
