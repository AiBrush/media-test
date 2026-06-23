# remux/h264_multitrack_mp4_to_mkv

family: remux | fixture asset: `h264_multitrack.mp4` (1 H.264 video + 2 AAC audio tracks, 1280x720@30, 10s, 4.5MB) | primaryMetric: wall | passCount: 2 of 7

## Verdict

Best framework: **ffmpeg.wasm@0.12.15**. CONTESTED (2 PASS: ffmpeg-wasm and mediabunny). Both engines pass the identical and only gating oracle (`reference-reimport`) with equivalent correctness strength (3/3 media tracks preserved, duration within tolerance), so correctness is a tie and the decisive factor is **performance**: ffmpeg-wasm wall median 39.39ms vs mediabunny 153.55ms = **3.90x faster wall**, and throughputRealtime 253.87 vs 65.13 x-realtime = **3.90x higher throughput**. Margin is real but evidence strength is limited (both n=1, both cached).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:pass | 39.39ms | 253.87x | 0 (not sampled) | 1901ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:pass | 153.55ms | 65.13x | 33,471,147 B (~31.9MB) | 1901ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

## Why the winner wins (deep technical)

This is a **lossless container conversion**: H.264 (AVCC) video + two AAC audio tracks must move from an ISO-BMFF MP4 wrapper into a Matroska/MKV wrapper with **zero re-encoding** — the coded bitstreams are copied, only the box/EBML framing changes. The hard part for a multitrack source is preserving every track (one video + two parallel audio tracks) and keeping per-track sample timing intact through the wrapper swap.

ffmpeg-wasm implements this as a true stream copy. In `src/engines/ffmpeg-wasm/adapter.ts:2044` the remux path builds the args `[...inputOptions, '-i', name, '-map', '0', '-c', 'copy']` and writes to a `.mkv` output (`outName` derived at adapter.ts:2036). The crucial detail for THIS multitrack case is the explicit `-map 0` (adapter.ts:2042-2044): FFmpeg's default stream selection picks only one stream per type, which would silently drop the second AAC track; `-map 0` forces every input stream into the MKV. There is no transcode — `-c copy` re-frames the AVCC NAL units and AAC frames into Matroska SimpleBlocks/BlockGroups without touching sample data. Before muxing it runs `assertRemuxContainerCompatible` (adapter.ts:2040) to confirm all track codecs are legal in MKV (H.264 and AAC both are). The oracle confirms the result: `reference-reimport` re-demuxed the MKV output and found **1240 packets, 945 keyframes, 3 media tracks** matching `goldenMediaTracks: 3`, with `durationDeltaSec 0.0420s < durationToleranceSec 0.1s` — a structurally faithful Matroska file the reference engine parses cleanly. The backend is single-thread pure-wasm FFmpeg, yet the stream-copy path is so cheap (no pixel decode/encode) that it completes in 39.39ms / 253.87x realtime.

mediabunny is also genuine and correct, but slower. Its remux (`src/engines/mediabunny/adapter.ts:1244-1260`) opens the input with `openInput`, builds an MKV `Output` via `makeOutputFormat(opts.container, ...)` (adapter.ts:1250-1255) and drives the real mediabunny `Conversion` through `runConversion` (adapter.ts:1256). Per `env.configUsed` it ran on the `webcodecs` backend with `prefer-hardware` hwAccel, a `streaming-lockstep` pipeline, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`. Its oracle outcome is essentially equal: **1244 packets, 949 keyframes, 3 media tracks**, `durationDeltaSec 0.0690s < 0.1s`. (The ~4-packet / ~4-keyframe difference vs ffmpeg-wasm reflects benign container-edge repacketization, well inside the oracle's 2% packet tolerance and irrelevant to correctness.)

Correctness is therefore a dead tie — same oracle, same `goldenMediaTracks: 3` match, both inside duration tolerance. The decision falls to performance (decision rule 4b). ffmpeg-wasm is **3.90x faster on wall** (39.39ms vs 153.55ms) and **3.90x higher throughput** (253.87x vs 65.13x realtime). It also reports no peakMemory sample (n=0, not measured), while mediabunny used ~31.9MB; longtasks are identical at 1901ms for both. The mechanistic reason ffmpeg wins despite being single-thread wasm: its `-c copy` path is a pure muxer demux/remux with no codec instantiation, whereas mediabunny's `Conversion` pipeline sets up its streaming-lockstep machinery and WebCodecs-capable plumbing even when it is only copying tracks, adding fixed per-conversion overhead that dominates a tiny 10s/4.5MB job.

Caveat on evidence strength: both winners have `n: 1` (single sample, `mad: 0`, p95==median) and both are `cached: true`. The 3.90x margin is large enough to be decisive, but it rests on one un-rerun measurement each.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on perf): correct remux, equal oracle (1244 pkts / 949 kf / 3 tracks, Δdur 0.069s), but 3.90x slower wall (153.55ms vs 39.39ms) and 3.90x lower throughput (65.13x vs 253.87x); used ~31.9MB peak vs ffmpeg's unsampled. Conversion-pipeline setup overhead dominates a tiny stream-copy job.
- **platform@chrome-149** (NA_ENGINE): "engine does not declare operation 'remux'" — honest. The Chrome platform engine is a decode/playback surface with no muxing capability; declaring remux would be a false capability.
- **remotion-media-parser@4.0.479** (NA_ENGINE): "engine does not declare operation 'remux'" — honest. media-parser is a read-only parser/demuxer; it has no writer.
- **web-demuxer@4.0.0** (NA_ENGINE): "engine does not declare operation 'remux'" — honest. It is a demux-only engine (its name says so); no container writer exists.
- **mp4box@2.3.0** (NA_ENGINE): "engine does not declare output container 'mkv'" — honest. Its remux only targets fragmented ISO-BMFF (`containersOut: ['mp4']`, adapter.ts:647; remux throws for non-mp4 targets at adapter.ts:913-916). MP4Box.js is an ISOBMFF-only library and physically cannot emit Matroska.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): "engine does not declare output container 'mkv'" — honest. It can only WRITE mp4/webm/wav (`CONTAINERS_OUT`, adapter.ts:248); it reads MKV but has no Matroska muxer, so MKV output is a genuine NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/index.ts:69-76` — the `h264_multitrack.mp4 -> mkv` case; notes (line 75): "All tracks must survive remux; reference-reimport checks track count + per-track packets." ID derived by `remuxId` in `src/scenarios/remux/_shared.ts:73-75`; default oracle `reference-reimport` set at `_shared.ts:77-81`.
- Fixture: `fixtures/media/h264_multitrack.mp4` EXISTS (4.5MB real file, verified via stat). Golden `fixtures/golden/h264_multitrack.mp4.meta.json` lists 3 real media tracks (1 H.264 video 1280x720@30 + 2 AAC 48kHz stereo), durationSec 10 — physically plausible, matches the oracle's `goldenMediaTracks: 3`. Not synthetic/mock.
- Oracle: `referenceReimport` / `semanticRemuxReimport` in `src/core/oracles.ts:1225-1342`. It re-demuxes the engine's actual output bytes with the reference engine (oracles.ts:1233), compares media-track count and per-type layout against the golden (oracles.ts:1289-1299), and checks duration against a tolerance (oracles.ts:1311-1323). This is a REAL structural comparison against goldens, not trivially satisfiable: a dropped audio track or unparseable container would fail. Measurements (1240/1244 packets, 945/949 keyframes, 3 tracks, sub-0.07s duration delta) are physically plausible for a 10s multitrack H.264/AAC clip.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — genuine `-map 0 -c copy` stream-copy to a real `.mkv`, reads the produced bytes back (`readBinary(outName)`, adapter.ts:2064). No canned output, no input->output passthrough faking, no golden short-circuit; errors propagate via `this.run`.
- Verdict: **REAL**. Real fixture, real FFmpeg stream-copy remux, meaningful structural oracle with track-count and duration gates.
- Cached note: winner result is `cached: true` ("cached previous PASS result"). The PASS verdict and oracle measurements are reused from a prior run, not re-executed this session — minor staleness risk; mediabunny is also cached.

## Confidence & caveats

Confidence: **high** on the verdict (correctness tie, clean 3.90x perf margin, REAL validation, honest NAs all the way down). Caveats: (1) the gating oracle is structural (`reference-reimport`), not bit-exact — it confirms track preservation and parseability but does not byte-compare the copied bitstream, so this is a strong-but-not-cryptographic gate; the suite intentionally omits `decoded-frames-bitexact` for default remux rows (`_shared.ts:19-26`). (2) Both PASS engines have n=1 and cached=true; the perf numbers are single samples (mad 0). (3) peakMemory is unsampled (n=0) for ffmpeg-wasm, so the memory comparison is one-sided.
