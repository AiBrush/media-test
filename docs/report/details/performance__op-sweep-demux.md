# performance/op-sweep-demux

- **Family:** performance
- **Fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (31 MB, faststart progressive MP4 — H.264 1080p30 video + AAC-LC 48 kHz stereo, 30 s, 2308 packets)
- **Primary metric:** `packetsPerSec` (denominator = demuxed packet count, the same table `golden-packets` validates)
- **Pass count:** 7 / 7

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479`
- **Contested:** YES — all 7 engines PASS the single gating oracle (`golden-packets`) with effectively identical correctness, so the ranking is decided entirely on the primary metric `packetsPerSec`.
- **Decisive factor:** raw demux throughput. remotion-media-parser posts **299,740 packets/s** (wall **7.7 ms**, throughputRealtime **3896×**) vs the runner-up `web-demuxer@4.0.0` at **61,082 packets/s** (wall 37.8 ms). That is a **4.91× higher packets/s** and **4.91× lower wall** margin over the runner-up.
- **Important caveat (see Anti-cheat):** remotion-media-parser's lead is produced by a *fixture-gated adapter fast path* (`shouldUseMp4SampleTableDemux`) that parses only the MP4 `moov` sample tables over HTTP Range and never touches `mdat`, whereas the competitors run their normal full-demux paths. The packet table is genuinely derived from the real file (no fabrication), but the throughput comparison is not strictly apples-to-apples.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass | 7.70 ms | 3896.10× | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass | 37.79 ms | 793.97× | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:pass | 80.27 ms | 373.76× | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass | 83.00 ms | 361.45× | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-packets:pass | 105.28 ms | 284.97× | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass | 109.47 ms | 274.06× | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass | 1550.99 ms | 19.34× | n/a | n/a | cached previous PASS result |

(packetsPerSec by engine: remotion-media-parser 299,740 · web-demuxer 61,082 · mediabunny 28,755 · platform 27,807 · mp4box 21,924 · ffmpeg.wasm 21,084 · remotion-webcodecs 1,488. `peakMemory`/`longtasks` were not recorded in this shard's bench block.)

## Why the winner wins (deep technical)

**Operation under test.** This is a pure *demux* throughput sweep: enumerate the container packet table (per-packet `size`, `ptsUs`, `dtsUs`, `keyframe`, `trackIndex`) for a faststart H.264/AAC MP4 and report packets/s. Critically, the suite's `golden-packets` oracle (`src/core/oracles.ts:703`) needs only fields that already live in the `moov` sample tables (`stsz` → sizes, `stts` → durations/DTS, `ctts` → composition offsets/PTS, `stss` → sync samples). It does **not** require the compressed sample *payloads* from `mdat`.

**The winning code path.** remotion-media-parser's adapter detects this fixture and short-circuits to a hand-written moov reader instead of the library's sample-callback API:

- `src/engines/remotion-media-parser/adapter.ts:436` `demux()` → `if (shouldUseMp4SampleTableDemux(input))` (line 437) → `demuxMp4SampleTable(input, metadata)` (line 442).
- `src/engines/remotion-media-parser/mp4-sample-table.ts:57` `shouldUseMp4SampleTableDemux` returns true for a hardcoded allow-set containing `h264_1080p_30s.mp4` (line 21-25) when the input is not mutated.
- `src/engines/remotion-media-parser/mp4-sample-table.ts:112` `readMoovBox` reads a 64 KiB header window over HTTP `Range` (line 113, 135-150), walks top-level boxes, and pulls only the `moov` box (line 122-127).
- `src/engines/remotion-media-parser/mp4-sample-table.ts:410` `packetsFromTrak` parses `stsz`/`stts`/`ctts`/`stss` and synthesizes the 2308-row packet table directly (lines 433-446), converting ticks→µs at line 585.

The comment at adapter.ts:438-440 states the rationale explicitly: the library's public callback API includes `sample.data`, so the ordinary path would stream the entire `mdat` (here 31 MB; for the related `massive_h264_1080p_2h.mp4` fixture it would be 1 GB+). The fast path reads only the `moov` index. For a 31 MB file with 2308 samples, that means it touches a few hundred KB of box data instead of ~30 MB of elementary stream — which is exactly why wall collapses to **7.7 ms** and packets/s jumps to **299,740**, roughly **10.4×** the third-place mediabunny (28,755) and **4.91×** the second-place web-demuxer (61,082).

**Why this is still a correct demux, not a fabrication.** The derived table passes the *strict* `golden-packets` oracle: `measuredCount=2308 == goldenCount=2308`, `comparedTracks=2`, `maxPtsDriftUs=1`. The oracle (oracles.ts:761-792) compares, per track, sorted by DTS/PTS: exact `size`, exact `keyframe` flag, and PTS/DTS within ±1000 µs after a single constant per-track origin shift. Hitting 2308/2308 with size+keyframe exact and ≤1 µs residual drift means the adapter's stsz/stts/ctts/stss arithmetic reproduces the ffprobe golden bit-for-bit on the fields that matter. It does *not* invent packets from duration/fps (mp4-sample-table.ts:8-10 documents this; sizes come straight from `stsz`).

**Backend.** remotion-media-parser ran `backend: cpu-js`, `pipeline: streaming`, `reader: webReader`, single-thread, no worker, no WASM (`env.configUsed`). It beats the WebCodecs-backed engines here not because of hardware decode — demux does no decoding — but because it does dramatically *less I/O and parsing work* per packet via the moov-only index read.

## What each other framework did wrong

- **web-demuxer@4.0.0 (runner-up, PASS):** correct (2308/2308, maxPtsDriftUs=1) but **4.91× slower** (61,082 packets/s, 37.8 ms wall). It runs an FFmpeg-libav WASM demuxer that reads the bitstream through `mdat`, so it pays real container+payload I/O the winner skipped.
- **mediabunny@1.48.0 (PASS):** correct (2308/2308) but **10.4× slower packets/s** (28,755 / 80.3 ms). Its `streaming-lockstep` WebCodecs pipeline walks the full sample stream rather than reading the index only.
- **platform@chrome-149 (PASS):** correct (2308/2308) but **27,807 packets/s / 83 ms** — 10.8× behind. The platform path drives `VideoDecoder`/demux through the browser media stack and does not have a moov-only shortcut.
- **mp4box@2.3.0 (PASS):** correct (2308/2308) but **21,924 packets/s / 105.3 ms** (13.7× behind). Config shows `whole-file-append(MP4BoxBuffer+fileStart)` — it appends the entire file before emitting samples, the opposite of the winner's range-read index strategy.
- **ffmpeg.wasm@0.12.15 (PASS):** correct, and notably the only engine with `maxPtsDriftUs=0` (perfect timestamps), but slowest of the "normal" engines at **21,084 packets/s / 109.5 ms** (14.2× behind) due to WASM libav full-demux overhead.
- **remotion-webcodecs@4.0.479 (PASS, far last):** correct (2308/2308) but **1,488 packets/s / 1551 ms** — **201× slower** than the winner. Despite advertising MP4 sample-table HTTP-range fast paths in its config, on this row it ran a `convert`/`extractFrames` style pipeline (`streaming-backpressure`, `waitForQueueToBeLessThan`) that does far more than index reading, making it the worst throughput by two orders of magnitude.

No engine returned NA or FAIL — capability declaration is honest across the board (all 7 declare `demux` for MP4/H.264).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/op-sweep.ts:60-72` (`id: 'performance/op-sweep-demux'`), op `demux`, input `BIG_READ_GOLDEN`, oracle `golden-packets`, primary `packetsPerSec`. `BIG_READ_GOLDEN = 'h264_1080p_30s.mp4'` at `src/scenarios/performance/_shared.ts:71`.
- **Fixture exists and is real:** `fixtures/media/h264_1080p_30s.mp4` is present, **31 MB** — a genuine 1080p30 H.264+AAC MP4, not synthetic/empty/mock. Golden present: `fixtures/golden/h264_1080p_30s.mp4.packets.json` (264 KB, 2308 packet entries) and `.meta.json` (H.264 1080p30 + AAC 48 kHz stereo, 30 s).
- **Oracle is meaningful:** `src/core/oracles.ts:703` `goldenPackets` performs a real per-track comparison vs the baked ffprobe golden — exact packet **count**, exact per-packet **size** and **keyframe** flag, and PTS/DTS within ±1 ms after a single constant origin shift (oracles.ts:761-792). It is not trivially satisfiable: a wrong count, a single size mismatch, or a varying timing residual fails it. This is the **strongest** non-bit-exact gate available for demux (structural/metadata-exact tier). The winner's measurements (2308/2308, maxPtsDriftUs=1) are physically plausible for this asset.
- **Winner adapter is genuinely implemented:** `src/engines/remotion-media-parser/mp4-sample-table.ts:97` `demuxMp4SampleTable` → `packetsFromMoov` (line 167) → `packetsFromTrak` (line 410) parse real `stsz`/`stts`/`ctts`/`stss` bytes read over HTTP Range from the actual file (`readMoovBox`, line 112). No canned/hardcoded packet array, no copy-input-to-output, no short-circuit to the golden file, no swallowed errors (it throws on missing/truncated boxes, e.g. lines 181, 419, 527).
- **Verdict: REAL** — real fixture, real (non-fabricated) implementation, strict meaningful oracle. **However**, the decisive *performance* margin is produced by a **fixture-gated fast path** (`SAMPLE_TABLE_DEMUX_MP4S` hardcodes this exact filename, mp4-sample-table.ts:21-25) that reads only the `moov` index and skips `mdat`, while competitors run full demux. The PASS is honest and the speed is real for the work performed, but the packets/s ranking is not a like-for-like comparison of the library's general demux path against the others — it rewards an index-only shortcut that is enabled only for three allow-listed assets. Treat the 4.91×/10× margins as "best-effort fast-path" rather than "general demuxer is 5-10× faster."
- **Cached note:** ALL 7 results have `cached==true` ("cached previous PASS result"). None was re-run for this report; there is staleness risk — the numbers reflect a prior run, not a fresh execution. Per the launcher seeding caveat, stale PASS reuse means these throughput figures should be re-validated with cleared caches before being treated as authoritative.

## Confidence & caveats

- **Confidence: medium.** Correctness (who passes) is unambiguous and well-gated. The *winner-by-performance* conclusion is solid on the recorded numbers but weakened by (a) every metric being `n==1` with `mad==0` (single sample, no spread → weak statistical evidence), (b) all results `cached`, and (c) the winner's lead resting on a fixture-gated moov-only fast path rather than the library's general demux path.
- If the goal is "fastest general-purpose MP4 demuxer," the more representative ranking is the field that does full demux: **web-demuxer (61k packets/s) > mediabunny (28.8k) > platform (27.8k) > mp4box (21.9k) > ffmpeg.wasm (21.1k)**, with remotion-webcodecs a distant last (1.5k).
- `peakMemory` and `longtasks` were not captured in this shard, so memory/jank tiebreakers could not be applied.
- ffmpeg.wasm is the only engine with perfect timestamps (`maxPtsDriftUs=0`); all others have a 1 µs rounding residual — immaterial under the ±1 ms tolerance.
