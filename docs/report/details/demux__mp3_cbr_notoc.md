# demux/mp3_cbr_notoc

- family: demux
- fixture asset: `fixtures/media/mp3_cbr_notoc.mp3` (161 KB, real CBR MP3, no Xing/Info TOC)
- primaryMetric: wall (ms)
- passCount: 4 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- CONTESTED: 4 engines PASS (mediabunny, ffmpeg.wasm, remotion-media-parser, remotion-webcodecs), all on the identical golden-packets gate (384/384 packets, max PTS drift ≤ 1 µs). Correctness is a dead heat, so the decision falls to performance.
- Decisive factor: **wall-clock median**. mediabunny 5.09 ms vs runner-up ffmpeg.wasm 7.62 ms.
- Margin over runner-up: **1.50x faster wall** than ffmpeg.wasm (7.62/5.09); 1.90x faster than remotion-media-parser (9.68/5.09) and 1.95x faster than remotion-webcodecs (9.92/5.09).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true | 5.09 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 7.62 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 9.68 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 9.92 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'mp3' |
| platform@chrome-149 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'mp3' |
| mp4box@2.3.0 | NA_ENGINE | — | — | n/a | n/a | n/a | engine does not declare input container 'mp3' |

The shard's `bench` block contains only the `wall` metric (n=1, warmup=1, mad=0); throughputRealtime, peakMemory and longtasks were not recorded for this demux row.

## Why the winner wins (deep technical)

This scenario is a pure elementary-stream demux of a **CBR MP3 with NO Xing/Info TOC header** (`src/scenarios/demux/index.ts:223-227`). With no TOC, frame boundaries cannot be looked up from a seek table; the demuxer must walk the bitstream frame-by-frame, decoding each MPEG-1 Layer III frame header (sync word `0xFFE`, bitrate index, sample-rate index, padding bit) and computing the frame length `144 * bitrate/samplerate + padding`. The golden was produced by ffprobe and contains 384 packets; the first packet is 417 bytes with `keyframe:true, ptsUs:0` — consistent with a 128 kbps / 44.1 kHz CBR stream (every MP3 frame is independently decodable, hence every packet is a keyframe). The gate `golden-packets` (`src/core/oracles.ts:701-796`) groups packets per track, sorts by dts/pts, and compares **size and keyframe flag exactly** plus PTS/DTS within a 1 ms origin-aligned tolerance. mediabunny matched all 384 sizes, all 384 keyframe flags, and reported `maxPtsDriftUs:1` — i.e. its CBR frame walker reproduced ffprobe's frame boundaries to within 1 µs.

mediabunny's demux path is genuinely implemented in `src/engines/mediabunny/adapter.ts:1152-1183`: it opens the real `Input`, iterates `await mbInput.getTracks()`, and for each track constructs `new this.lib.EncodedPacketSink(track)` then streams `sink.packets(undefined, undefined, { verifyKeyPackets: true })` (`adapter.ts:1162-1167`). Each yielded `EncodedPacket` contributes its real `pkt.byteLength` (the per-frame size the size-comparison gate checks), `pkt.microsecondTimestamp` as ptsUs, and `pkt.type === 'key'` as the keyframe flag (`adapter.ts:1168-1175`). `verifyKeyPackets:true` forces a bitstream-level keyframe determination rather than trusting a container index — exactly what is needed for an MP3 with no TOC. The MP3 input format is wired via `MP3_FORMAT` in `src/engines/mediabunny/codecs.ts:135`, and `mp3` is declared as a read container at `adapter.ts:1036`.

On the performance axis (the decider here, since correctness ties), mediabunny ran on a **pure-TS ESM core** with `backend:"webcodecs"`, `pipeline:"streaming-lockstep"`, `wasmThreads:0`, `sharedArrayBuffer:false`, `coopCoep:"not-required"` (env.configUsed). Note that demux here does not actually need WebCodecs — frame walking is CPU-side — but mediabunny's lean ESM parser walks the 161 KB file in 5.09 ms with no wasm module instantiation cost. ffmpeg.wasm (7.62 ms, 1.50x slower) pays the cost of marshalling the file into the wasm FS and running libavformat's MP3 demuxer across the JS/wasm boundary; it still passes 384/384 with `maxPtsDriftUs:0`, so it loses purely on overhead, not correctness. remotion-media-parser ran a `backend:"cpu-js"` full-parse (9.68 ms) and remotion-webcodecs a `streaming-backpressure` JS pipeline (9.92 ms) — both correct (384/384, 0 µs drift) but ~1.9x slower than mediabunny's tighter parser loop.

Caveat on margin strength: every PASS engine has `n:1` (a single timed sample, `mad:0`, `warmup:1`), so the wall numbers are single-shot measurements. The 1.50x gap over ffmpeg.wasm is comfortably outside single-sample noise for a wasm-instantiation-vs-native-JS comparison, but with n=1 the precise ratio should be treated as indicative rather than statistically tight. All four results are `cached:true`.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (runner-up): PASSed correctly (golden-packets 384/384, maxPtsDriftUs 0) but lost on performance — wall 7.62 ms vs 5.09 ms = 1.50x slower, attributable to wasm FS marshalling + JS/wasm boundary overhead for a tiny 161 KB file.
- **remotion-media-parser@4.0.479**: PASSed correctly (384/384, 0 µs drift) but slowest-but-one — wall 9.68 ms (1.90x slower) on a `cpu-js` full-parse demux pipeline.
- **remotion-webcodecs@4.0.479**: PASSed correctly (384/384, 0 µs drift) but slowest — wall 9.92 ms (1.95x slower) on its `streaming-backpressure` JS pipeline.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare input container 'mp3'". Honest NA: web-demuxer's declared input containers do not include raw MP3 elementary streams.
- **platform@chrome-149**: NA_ENGINE — "engine does not declare input container 'mp3'". Honest NA: the WebCodecs platform path has no demuxer/container parser; raw MP3 demux is genuinely out of scope.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare input container 'mp3'". Honest NA: mp4box.js parses ISO-BMFF (MP4/MOV) boxes only; a raw MP3 elementary stream has no box structure for it.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:223-227` — id derived from asset `mp3_cbr_notoc.mp3`; notes: "MP3 CBR with NO Xing TOC: frame boundaries derived purely by constant-bitrate frame walking."
- Fixture: `fixtures/media/mp3_cbr_notoc.mp3` exists, 161 KB — a real CBR MP3 file, not synthetic/empty/mock.
- Golden: `fixtures/golden/mp3_cbr_notoc.mp3.packets.json` — 384 packets; first packet `{size:417, ptsUs:0, dtsUs:0, keyframe:true}`, physically plausible for 128 kbps/44.1 kHz CBR MP3 (every frame a keyframe).
- Oracle: `src/core/oracles.ts:701-796` (`goldenPackets`). Performs a real per-track, dts/pts-sorted comparison requiring exact size + keyframe-flag match on all 384 packets, with a tight 1 ms (`seekToleranceUs`) origin-aligned timestamp tolerance. Not trivially satisfiable: a wrong frame-walk would shift sizes and packet counts. mediabunny's measurements (measuredCount 384, goldenCount 384, comparedTracks 1, maxPtsDriftUs 1) are consistent.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1152-1183` — genuine EncodedPacketSink walk with real byteLength/timestamp/key-type; no canned output, no golden short-circuit, no error swallowing. MP3 input wired at `codecs.ts:135` and declared at `adapter.ts:1036`.
- Cached note: winner result is `cached:true` ("cached previous PASS result"), as are all four PASS engines. Evidence is real but reused — there is a staleness risk; the numbers were not re-run in this invocation.
- Verdict: **REAL** — real fixture + real implementation + meaningful exact-comparison oracle.

## Confidence & caveats

- Confidence: high on the winner identity (correctness tie broken cleanly by a 1.50x wall margin that exceeds plausible single-sample noise for native-JS vs wasm).
- Caveat 1: all bench samples are n=1 (mad=0, warmup=1); ratios are indicative, not statistically tight.
- Caveat 2: all four PASS results are cached — re-running is advisable to confirm the timing ranking holds.
- Caveat 3: the gate is structural (golden-packets), not bit-exact decode; it validates demux frame boundaries/keyframe flags, which is the correct strength level for an elementary-stream demux scenario. It does not validate decoded PCM.
