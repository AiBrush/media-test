# remux/opus_ogg_to_mkv

- family: remux
- fixture asset(s): `opus.ogg` (fixtures/media/opus.ogg, 146 KB real Opus-in-Ogg, 10.007 s, 1 audio track opus 48 kHz stereo ~116 kbps)
- primaryMetric: wall (scenario metric order: wall, throughputRealtime, peakMemory, sourceReads, targetWrites, longtasks)
- passCount: 2 of 7 (mediabunny, ffmpeg.wasm)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (CONTESTED — 2 engines PASS).
- Decisive factor: with correctness tied (both pass the lone `reference-reimport` gate with identical structural results — 501 packets, 1 audio:opus track, duration delta inside tolerance), the tiebreak falls to PERFORMANCE on the primary `wall` metric. ffmpeg.wasm is **1.11x faster wall** (7.56 ms vs 8.425 ms) and **1.11x higher throughput** (1323.7x vs 1187.8x realtime).
- Margin over runner-up (mediabunny): wall 7.56 ms vs 8.425 ms = **1.11x**; throughput 1323.7 vs 1187.8 x-realtime = **1.11x**. CAVEAT: both samples are n=1 (mad=0, no spread), and mediabunny is dramatically better on main-thread blocking — longtasks 234 ms vs ffmpeg's 1901 ms (**8.1x less blocking**). This is a thin, low-confidence win; see Confidence & caveats.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 7.56 ms | 1323.7x | 0 (n=0) | 1901 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 8.425 ms | 1187.8x | 0 (n=0) | 234 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |

(peakMemory, sourceReads, targetWrites were not captured for either PASS engine: n=0, median 0.)

## Why the winner wins (deep technical)

The operation is a *lossless audio re-wrap*: take the coded Opus access units out of an Ogg bitstream and place them, byte-identical, into a Matroska (MKV) container. No decode, no re-encode — only the container framing changes (Ogg pages/granule positions -> Matroska SimpleBlocks/Cluster timecodes, plus an `A_OPUS` TrackEntry carrying the OpusHead as CodecPrivate). Because Opus is a legal Matroska audio codec, the coded payload is preserved exactly; the only variables are timestamp/duration materialization and track-layout fidelity, which is precisely what the gating oracle measures.

Both PASS engines do this for real:
- **ffmpeg.wasm** (src/engines/ffmpeg-wasm/adapter.ts:2031-2069) writes the input into MEMFS, runs `runInfo` and `assertRemuxContainerCompatible` to confirm Opus is legal in MKV, then executes `[-i in -map 0 -c copy out.mkv]` (adapter.ts:2044, 2062-2063). `-map 0 -c copy` is a genuine stream-copy: libavformat demuxes the Ogg, copies the encoded Opus packets, and remuxes them into Matroska with no transcode. Output bytes are read back via `readBinary` (adapter.ts:2064). The backend is single-thread wasm (no env.configUsed block emitted; ffmpeg.wasm 0.12.15 with the suite's default core).
- **mediabunny** (src/engines/mediabunny/adapter.ts:1244-1260) builds a `MkvOutputFormat` via `makeOutputFormat`, opens the Ogg with `openInput`, constructs `new Output({ format, target: BufferTarget })`, and drives the high-level `Conversion` API (`runConversion`, adapter.ts:841-861, 1256). env.configUsed shows backend `webcodecs`, hwAccel `prefer-hardware`, pipeline `streaming-lockstep`, wasmThreads 0, sharedArrayBuffer false, coopCoep `not-required`. For an audio-only stream-copy the Conversion path detects the codec is already MKV-legal and re-wraps without invoking an encoder.

The gating oracle is `reference-reimport` (src/core/oracles.ts:1225-1271 -> remux branch -> `semanticRemuxReimport` at 1273-1377). It re-imports each engine's MKV bytes with the reference engine (`ctx.referenceEngine.demux`, oracles.ts:1233), requires a non-empty packet table (oracles.ts:1244), then diffs against the golden meta: media-track count (oracles.ts:1289), per-key `type:codec` track layout (oracles.ts:1292-1299), and re-imported duration vs golden within a tolerance floored at 0.1 s (oracles.ts:1318-1323).

The shard measurements show both engines hit identical structural results: `reimportPackets: 501`, `reimportKeyframes: 501`, `reimportMediaTracks: 1`, `goldenMediaTracks: 1`. 501 packets for a 10.007 s Opus stream at 20 ms frames (~500 frames) is physically correct, and 501 keyframes is correct because every Opus packet is independently decodable (audio = all keyframes). Both land the duration inside the 0.1 s band — ffmpeg `durationDeltaSec: 0.001`, mediabunny `durationDeltaSec: 0.007`. So correctness is a tie under this oracle's ladder (structural/metadata-exact, not bit-exact, not smoke).

Correctness being equal, the tiebreak is performance on the primary `wall` metric. ffmpeg.wasm completes the rewrap in 7.56 ms vs mediabunny's 8.425 ms (1.11x), and reports 1323.7x realtime vs 1187.8x (1.11x). For a tiny single-track audio copy, the libavformat C path muxing Matroska is marginally cheaper end-to-end than mediabunny's pure-TS Conversion orchestration. That is the entire margin — small, and at n=1.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost the tiebreak. Identical correctness (501 packets, 1 audio:opus track, durationDelta 0.007 s). Performance gap: 1.11x slower wall (8.425 vs 7.56 ms) and 1.11x lower throughput. NOTE the reverse: mediabunny blocks the main thread far less (longtasks 234 ms vs 1901 ms = 8.1x better), and used a not-required-COOP/COEP, no-SAB config — so the headline loss is razor-thin and arguably reverses on responsiveness.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: the WebCodecs/Media platform engine exposes decode/encode primitives, not a container-remux op, so no muxer to copy Opus into MKV. Genuine non-capability.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest: the WebCodecs wrapper has no Ogg demuxer; it cannot ingest the source bitstream at all.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: media-parser is a read/parse library (probe/demux), not a muxer; no write path exists.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: a demux-only library by design; no output container writer.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ogg'". Honest: MP4Box is an ISO-BMFF (MP4/MOV) tool; it neither reads Ogg nor writes Matroska, so this cell is correctly out of scope.

All five NAs are genuine capability gaps, not under-declared abilities — none of these libraries has an Ogg-in / MKV-out remux path.

## Anti-cheat validation

- Scenario definition: src/scenarios/remux/audio.ts:44-51 (`asset: 'opus.ogg'`, `from: 'ogg'`, `to: 'mkv'`, `audioCodecs: ['opus']`); id derived by `remuxId` in src/scenarios/remux/_shared.ts:73-75 -> `remux/opus_ogg_to_mkv`. Default oracle set = `['reference-reimport']` (_shared.ts:78-81). Notes: "Opus OGG->MKV: lossless audio re-wrap into full Matroska."
- Fixture: fixtures/media/opus.ogg EXISTS (146 KB). ffprobe confirms a single real `opus` audio stream, duration 10.0065 s — a real, non-synthetic, non-empty media file. Golden meta (fixtures/golden/opus.ogg.meta.json) and packets (fixtures/golden/opus.ogg.packets.json, 501 entries) are present and consistent (1 audio/opus track, 48 kHz stereo, 10.007 s).
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:2031-2069. Operation is genuine: real `-map 0 -c copy` stream-copy via the bundled FFmpeg wasm; checks container compatibility first (adapter.ts:2040), reads real output bytes (adapter.ts:2064). No canned/hardcoded output, no input->output passthrough fake, no short-circuit to golden, no swallowed errors (`run` throws on nonzero exit).
- Oracle: src/core/oracles.ts:1225-1377. Performs a REAL re-demux of engine output with the reference engine and diffs track count, `type:codec` layout, and duration vs golden (tolerance floored at 0.1 s). Not trivially satisfiable: it would fail on empty packet table, wrong track count/layout, or duration drift > tolerance. Measurements (501 packets/keyframes, 1 track, sub-0.01 s delta) are physically plausible for 10 s of 20 ms-frame Opus.
- Verdict: **WEAK-GATE**. The implementation, fixture, and oracle are all real, and PASS is real — but the lone gate is structural/metadata-exact (track layout + packet non-emptiness + duration within 0.1 s), not a sample-fidelity gate. It does NOT verify the coded Opus payload is bit-identical across the rewrap (no decoded-audio-pcm / golden-packets byte comparison on this cell). A muxer that subtly reordered or altered packet boundaries while preserving count/layout/duration could still pass. So the PASS is honest but not the strongest possible correctness evidence.
- Cached note: BOTH PASS engines have `cached: true` ("cached previous PASS result"). Results were reused, not re-run for this report — staleness risk applies to the numbers, especially the n=1 timing margin.

## Confidence & caveats

- Confidence: **low**. The winner is decided by a 1.11x wall margin at n=1 (mad=0, single sample, no variance estimate) between two correctness-tied engines. Sub-millisecond differences on a 7-8 ms operation are within noise of one measurement.
- The ranking partially reverses on responsiveness: mediabunny's longtasks (234 ms) are 8.1x lower than ffmpeg.wasm's (1901 ms). If main-thread blocking were the primary metric, mediabunny would win decisively. ffmpeg.wasm wins only because wall is the headline metric.
- peakMemory / sourceReads / targetWrites were not captured (n=0) for either engine, so memory-footprint and I/O tiebreakers could not be applied.
- Both PASS rows are cached; a fresh run could shift the thin timing margin.
- Oracle is structural, not bit-exact (WEAK-GATE) — the PASS does not prove byte-identical Opus payload preservation, only that the MKV re-imports with the right track layout and duration.
