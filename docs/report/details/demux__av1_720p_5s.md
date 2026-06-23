# demux/av1_720p_5s

family: demux | fixture asset: `fixtures/media/av1_720p_5s.webm` (1.9 MB, real) | primaryMetric: wall (only bench metric present in shard) | passCount: 6 of 7 (1 NA_ENGINE)

Container/codec under test: AV1 video + Opus audio in a WebM (Matroska) container, 1280x720 @ 30fps, 5.008s. The operation is **read-side demux** — packet enumeration of the AV1/Opus elementary streams, NOT AV1 encode (per scenario `notes`: "AV1 read-side demux: requires input AV1 parsing/packet walking, not AV1 encode capability").

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- **CONTESTED**: 6 engines PASS, all satisfying the same single gating oracle `golden-packets` with identical, perfect measurements (measuredCount=401, goldenCount=401, comparedTracks=2, maxPtsDriftUs=0). Correctness is therefore a dead tie — every passer reproduced the golden packet table exactly.
- **Decisive factor: PERFORMANCE (wall median).** With correctness equal, ranking falls to wall clock. ffmpeg.wasm demuxes in **13.16 ms**, vs runner-up remotion-webcodecs at 40.13 ms.
- **Margin over runner-up: 3.05x faster wall** (40.13 / 13.16). Against the slowest passer (platform, 6000.74 ms) it is ~456x faster.
- Caveat: every result is `cached==true` and every bench is **n=1** (mad=0, p95==median because a single sample), so the margin is a single-shot measurement, not a distribution. The 3.05x gap is large enough to survive normal jitter, but the evidence strength is low-n.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 13.16 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 40.13 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 44.31 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true | 49.24 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true | 229.68 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:true | 6000.74 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

(The shard `bench` object carries only `wall` for every engine; throughputRealtime / peakMemory / longtasks were not recorded for this demux row, so they are n/a.)

## Why the winner wins (deep technical)

This is a pure demux/packet-walk task: parse the WebM/Matroska clustering, walk SimpleBlock/Block laced entries for the AV1 video track and the Opus audio track, and emit per-packet `{trackIndex, size, ptsUs, dtsUs, keyframe}`. The gating oracle does an order-independent, per-track comparison against an ffprobe-derived golden (401 packets across 2 tracks), checking exact packet count, exact byte sizes, exact keyframe flags, and pts/dts drift within ±1ms after a constant per-track origin shift (`src/core/oracles.ts:703-796`). All six passers hit it dead-on: `maxPtsDriftUs:0`, `measuredCount:401`, `comparedTracks:2`. So correctness cannot separate them — the win is purely about how cheaply each engine produces that identical table.

ffmpeg.wasm's adapter implements demux with a single stream-copy framecrc pass: `ff.exec(['-hide_banner', ...inputOptions, '-i', name, '-map', '0', '-c', 'copy', '-f', 'framecrc', crcName], READ_EXEC_TIMEOUT_MS)` (`src/engines/ffmpeg-wasm/adapter.ts:1980-1995`). The key word is `-c copy`: FFmpeg does **no AV1/Opus decoding** — the libdav1d-less wasm build (per the header comment at adapter.ts:21, "no libaom/dav1d → av1 is absent") never has to. The Matroska demuxer parses the container, and the framecrc muxer writes one CSV row per copied packet (stream, dts, pts, duration, size, CRC, optional F=flags). The adapter then parses those rows in `parseFramecrcPackets` (`src/engines/ffmpeg-wasm/adapter.ts:439-488`), converting tick timestamps via the per-stream `#tb` timebase and deriving keyframe from the F= flag convention (KEY omitted means keyframe; F=0x0 means non-key — adapter.ts:463-476). This is a single demuxer-only C-speed pass over a 1.9 MB file, so 13.16 ms is plausible: the WebM parse and CSV emit are the entire cost, with no pixel/sample work.

Why it beats the JS/WebCodecs-class engines: remotion-media-parser (`backend:"cpu-js"`, `fieldsTier:"full-parse(demux)"`) walks the EBML tree in JavaScript on the main thread (44.31 ms — 3.4x slower); the per-element JS parsing of every cluster/block is intrinsically slower than the wasm demuxer's tight loop. mediabunny (`backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`) at 49.24 ms pays its pure-TS Matroska reader cost (3.7x slower). remotion-webcodecs (40.13 ms, the closest, `pipeline:"streaming-backpressure"`) is fastest of the non-winners but still 3.05x behind — its adapter fast-paths (`mp4-sample-table:http-range`, MOV→MP4 ftyp rewrite) are MP4/MOV-specific and don't apply to WebM, so it falls back to a general streaming parse. web-demuxer (229.68 ms) wraps an ffmpeg-derived wasm demuxer too, but pays heavy module/worker plumbing per call, making it ~17x slower than the in-process ffmpeg.wasm core. platform@chrome-149 (`backend:"webcodecs"`, `hwAccel:true`) at 6000.74 ms is the outlier: its config drives a full `VideoDecoder` + `<video>→canvas→MediaRecorder` style streaming pipeline (env.configUsed), i.e. it effectively plays/decodes through the media stack to enumerate packets rather than doing a metadata-only walk, so it is ~456x slower for an identical packet table.

The decisive mechanism: ffmpeg.wasm reaches the identical golden packet table via the cheapest possible route — a single `-c copy` demuxer pass with zero decode and zero per-element JS overhead — and is the only engine that combines a native-speed wasm demuxer with no worker round-trip tax (unlike web-demuxer) and no decode pipeline (unlike platform).

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, but lost on speed: 40.13 ms vs 13.16 ms = 3.05x slower. Its MP4/MOV-only adapter fast-paths don't apply to a WebM input, so it ran a general streaming-backpressure parse instead of a one-shot copy pass.
- **remotion-media-parser@4.0.479** — PASS, lost on speed: 44.31 ms (3.4x slower). `backend:"cpu-js"` does a full EBML demux entirely in JS on the main thread; per-block JS parsing can't match the wasm demuxer loop.
- **mediabunny@1.48.0** — PASS, lost on speed: 49.24 ms (3.7x slower). `coreBuild:"pure-ts-esm"` Matroska reader in lockstep streaming; correct but slower than the native demuxer.
- **web-demuxer@4.0.0** — PASS, lost on speed: 229.68 ms (17.5x slower). Same ffmpeg-lineage demuxer capability but heavy wasm-module/worker invocation overhead per demux call.
- **platform@chrome-149** — PASS, lost on speed by 456x: 6000.74 ms. Its configUsed shows a WebCodecs VideoDecoder + media-element decode pipeline; it effectively decodes/plays the stream to enumerate packets rather than doing a metadata-only walk. Correct table, catastrophically slow for this purpose.
- **mp4box@2.3.0** — NA_ENGINE (honest). It declares `containersIn: ['mp4','mov']` (`src/engines/mp4box/adapter.ts:645`); MP4Box.js is an ISO-BMFF-only parser and genuinely cannot read WebM/Matroska. The NA reason ("engine does not declare input container 'webm'") matches the code — not an under-declared capability.

## Anti-cheat validation

- **Scenario**: defined in `src/scenarios/demux/index.ts:116-123` — `{ asset: 'av1_720p_5s.webm', container: 'webm', videoCodecsIn: ['av1'], audioCodecs: ['opus'], notes: 'AV1 read-side demux...' }`. The `videoCodecsIn` (read-only) framing correctly gates this as a demux/parse test, not an encode test.
- **Fixture**: `fixtures/media/av1_720p_5s.webm` exists, 1.9 MB — a real AV1/Opus WebM, not synthetic/empty/mock. Golden artifacts present and substantial: `av1_720p_5s.webm.packets.json` (45 KB, a JSON array of exactly 401 packet records), `.meta.json` (container=webm, av1 video 1280x720@30, opus 48kHz stereo). Packet count 401 is physically plausible for ~150 video frames + ~250 Opus frames over 5.008s.
- **Oracle**: `golden-packets` at `src/core/oracles.ts:703-796`. Real, strict comparison: exact count, exact per-track multiset of trackIndex, exact byte sizes (`sizeMismatch`), exact keyframe flags (`kfMismatch`), pts/dts drift bounded at ±1ms after only a CONSTANT per-track origin shift (varying residual fails). Not trivially satisfiable — no wide tolerance, not a smoke gate. Measurements (maxPtsDriftUs=0, 401/401, 2 tracks) are physically consistent with a clean WebM walk.
- **Winner adapter**: `src/engines/ffmpeg-wasm/adapter.ts:1961-2019` (demux), packet parsing `:439-488`. Genuinely runs the FFmpeg wasm core via `ff.exec([...'-c','copy','-f','framecrc'...])`; throws on `Input #` absence and on missing framecrc output (adapter.ts:2002-2018) — it does NOT swallow errors, does NOT return canned output, does NOT copy input→output to fake the table, and does NOT short-circuit to the golden file. The packet table is derived from the demuxer's actual per-packet rows.
- **Cached note**: winner result `cached==true` (reason "cached previous PASS result"), as are all 6 passers; bench n=1. The PASS is real but reused, not freshly re-run — per the launcher seeding caveat, stale-PASS reuse means the 13.16 ms wall is a single historical sample. Verdict strength is bounded by this.
- **Verdict: REAL.** Real 1.9 MB fixture + real golden (401-packet array) + genuine in-process ffmpeg wasm demux + a strict, falsifiable packet oracle.

## Confidence & caveats

- Confidence: **medium**. Correctness verdict is rock-solid (real fixture, strict oracle, exact-match measurements, genuine implementation). The *winner-selection* rests on a wall-clock margin from n=1 cached samples.
- The 3.05x margin over remotion-webcodecs is comfortably larger than typical single-sample jitter, so ffmpeg.wasm is very likely the genuine speed leader; but a fresh multi-sample re-run would harden this.
- All six passers are functionally interchangeable on correctness for this AV1/Opus-in-WebM demux; if startup/bundle cost or COOP/COEP mattered, the ranking among the JS engines could shift (ffmpeg.wasm carries a large wasm core, which this wall-only metric does not penalize for load time since results are cached).
- mp4box NA is correctly honest and should not be re-classified.
