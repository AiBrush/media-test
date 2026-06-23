# remux/h264_1080p_5s_mov_to_mp4

- **Family:** remux
- **Fixture asset:** `fixtures/media/h264_1080p_5s.mov` (4,396,408 bytes / 4.4 MB; H.264 1920x1080@30fps + AAC 48 kHz stereo, QuickTime `major_brand: "qt  "`, 5.0 s)
- **Operation:** MOV (QuickTime ISO-BMFF) -> MP4 lossless container re-wrap (no re-encode)
- **Primary metric:** wall (ms, lower better); throughputRealtime secondary
- **passCount:** 4 of 7 (3 NA_ENGINE)

## Verdict

- **Best framework:** `mp4box@2.3.0` (env.engineId `mp4box`).
- **Contested:** YES — 4 engines PASS (mp4box, ffmpeg.wasm, mediabunny, remotion-webcodecs). All pass the SAME single oracle (`reference-reimport`), so correctness strength is at the same rung of the ladder (structural/metadata-exact) and the decision falls to performance.
- **Decisive factor:** lowest wall median and highest realtime throughput, with the tightest correctness numbers (exact packet/keyframe parity and zero duration drift). mp4box: 36.02 ms wall / 138.81x realtime. Runner-up ffmpeg.wasm: 40.22 ms / 124.32x.
- **Margin over runner-up:** 40.22 / 36.02 = **1.12x faster wall**; 138.81 / 124.32 = **1.12x higher throughput**. Caveat: n==1 for every metric (single sample, mad==0, p95==median), so the margin is thin evidence; and mp4box's longtasks (4531 ms) are WORSE than ffmpeg's (2055 ms) — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mp4box@2.3.0 | PASS | reference-reimport:true | 36.02 ms | 138.81x | 99,256,204 B (~94.7 MB) | 4531 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 40.22 ms | 124.32x | 0 (not measured) | 2055 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 54.98 ms | 90.94x | 0 (not measured) | 3045 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | reference-reimport:true | 230.19 ms | 21.72x | 0 (not measured) | 19963 ms | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Reimport measurements (per shard): mp4box 386 packets / 239 keyframes / durationDeltaSec 0; ffmpeg.wasm 386 / 239 / 0; remotion-webcodecs 386 / 239 / 0.0210s; mediabunny 388 / 241 / 0.0773s. Golden = 386 packets / 239 keyframes (`fixtures/golden/h264_1080p_5s.mov.packets.json`), 2 media tracks, 5.0 s duration. Tolerances: packet/keyframe ±2% (withinRel 0.02, oracles.ts:1258/1261), duration ±0.1 s (oracles.ts:1318).

## Why the winner wins (deep technical)

This cell is a **lossless container re-wrap**: the H.264 coded video samples and AAC audio samples in the QuickTime `.mov` are byte-identical to what must end up in the `.mp4`; only the ISO-BMFF box scaffolding (`ftyp`/`moov`/sample tables, or `moof`/`mdat` fragments) changes. No decode/encode is required, which is why a pure-JS ISO-BMFF rewriter can beat a WebCodecs pipeline here.

mp4box's `remux()` (`src/engines/mp4box/adapter.ts:913-944`) drives mp4box.js's documented fragmenter: it parses the whole file with `createFile(true)` so `mdat` media survives (`parseToInfo(..., true)`, adapter.ts:920 / 709-731), then sets `setSegmentOptions(track.id, null, { nbSamples: 1000, rapAlignement: true })` per track (adapter.ts:931-934), calls `initializeSegmentation()` to emit one combined `ftyp+moov(+mvex)` init segment, and runs `start()/flush()/stop()` synchronously, collecting media fragments from `onSegment` (adapter.ts:924-942). The output is `concatBuffers([init, ...mediaSegments])` -> a real fragmented MP4 (`video/mp4`). This is a genuine in-JS box rewrite — no copy-input-to-output shortcut, no golden short-circuit. Because it is single-pass over an already-parsed sample table and never touches a codec, it is the fastest path: **36.02 ms wall, 138.81x realtime** (env.configUsed: `backend: "pure-js"`, `hwAccel: false`, `worker: false`, `pipeline: "whole-file-append(MP4BoxBuffer+fileStart)"`, `discardMdatDataDemuxRemux: false`, `segmentRapAlignement: true`).

Its correctness is also the tightest available: the `reference-reimport` oracle (`src/core/oracles.ts:1279-1376`) re-parses the produced bytes with the reference engine and reports **386 packets, 239 keyframes, 2 media tracks, durationDeltaSec 0** — an EXACT match to the golden 386/239 (oracle requires within ±2% of 386 packets and ±2% of 239 keyframes, and duration within ±0.1 s). Zero duration drift and exact packet parity put mp4box at the strongest end of the only rung any engine reached.

ffmpeg.wasm is the runner-up and is correctness-equal (also 386/239/0 via `-map 0 -c copy -movflags +faststart`, `src/engines/ffmpeg-wasm/adapter.ts:2029+`), but it pays the wasm/virtual-FS tax: write input to MEMFS, run the muxer, read output back. Result: **40.22 ms / 124.32x** — 1.12x slower wall and lower throughput than mp4box. (ffmpeg does win the longtasks metric, 2055 ms vs 4531 ms; see caveats.)

For THIS codec+container+op, the decisive mechanism is that a pure-JS ISO-BMFF box rewriter has no codec, no wasm boundary, and no WebCodecs queue to cross for a same-family MOV->MP4 rewrap, so it minimizes wall time while still emitting a fully parseable fragmented MP4 with exact sample-table fidelity.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost):** correctness-tied (386/239/Δ0) but 40.22 ms vs 36.02 ms = **1.12x slower wall**, 124.32x vs 138.81x throughput. The wasm MEMFS write/exec/read round-trip and the `+faststart` two-pass moov relocation cost time the pure-JS fragmenter avoids. (Note its longtasks are actually lower — 2055 vs 4531 ms — so on main-thread responsiveness ffmpeg is better; the primary metric is wall, where mp4box wins.)
- **mediabunny@1.48.0 (PASS, lost):** 54.98 ms / 90.94x — **1.53x slower wall, 0.66x throughput** vs mp4box. It ran a WebCodecs streaming-lockstep pipeline (`backend: webcodecs`, `hwAccel: prefer-hardware`), heavier than needed for a pure re-wrap. Its reimport also drifted slightly: **388 packets / 241 keyframes** (vs golden 386/239) and **durationDeltaSec 0.0773** — still inside the ±2% and ±0.1 s tolerances so it PASSes, but it is the loosest of the four on every correctness number.
- **remotion-webcodecs@4.0.479 (PASS, lost):** 230.19 ms / 21.72x — **6.39x slower wall, 0.16x throughput**; longtasks 19,963 ms (>4x the next worst). Correctness is fine (386/239, Δ0.021 s) but the WebCodecs streaming-backpressure convert path on the main thread is by far the heaviest here for a lossless rewrap.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** reason "engine does not declare operation 'remux'". Honest NA — remotion-media-parser is a demux/parse library, not a muxer; no remux capability to under-declare.
- **web-demuxer@4.0.0 (NA_ENGINE):** reason "engine does not declare operation 'remux'". Honest NA — a demuxer-only wasm wrapper; it has no MP4 writer.
- **platform@chrome-149 (NA_ENGINE):** reason "engine does not declare operation 'remux'". Honest NA — the bare browser exposes WebCodecs (decode/encode) but no container muxer, so it cannot perform a container-level remux without a userland muxer.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/remux/index.ts:43` — `{ asset: 'h264_1080p_5s.mov', from: 'mov', to: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'] }`, built by `buildRemux` (`src/scenarios/remux/_shared.ts:84-104`), id `remux/h264_1080p_5s_mov_to_mp4` (remuxId, _shared.ts:73-75), default oracle `reference-reimport` (_shared.ts:78-81).
- **Fixture exists / is real:** `fixtures/media/h264_1080p_5s.mov`, 4,396,408 bytes (stat-confirmed) — a genuine 4.4 MB H.264/AAC QuickTime file, not synthetic/empty/mock. Golden truth present: `fixtures/golden/h264_1080p_5s.mov.{meta,packets,frames,ssim}.json` (meta: mov, 5 s, h264 1080p + aac 48k stereo; packets.json carries the 386-packet/239-keyframe table).
- **Winner adapter genuinely implements the op:** `src/engines/mp4box/adapter.ts:913-944` calls the real mp4box.js fragmenter (`createFile(true)` -> `setSegmentOptions` -> `initializeSegmentation` -> `start/flush/stop` -> `onSegment`). No canned bytes, no input->output copy, no read of the golden file, no swallowed errors (it throws on non-mp4 target and on zero tracks, adapter.ts:914-922).
- **Oracle is a real comparison:** `reference-reimport` (`src/core/oracles.ts:1279-1376` plus the packet/keyframe variant at 1226-1268) re-parses the produced bytes with the reference engine and diffs media-track count, per-codec track layout, duration (±0.1 s), and (in the packet variant) packet count and keyframe count to within ±2% (oracles.ts:1258/1261). The reported measurements (386 packets, 239 keyframes, 2 tracks, Δ0 s) are physically plausible for a 5 s 30 fps 1080p H.264+AAC clip and match the golden exactly — not a wide-open or trivially-satisfiable gate.
- **Caveat — gate strength:** this is the STRUCTURAL gate only. `reference-reimport` proves the output is a real, semantically-faithful container; it is NOT bit-exact pixel verification (`decoded-frames-bitexact` is intentionally not attached to default remux rows while source frame goldens are placeholders — _shared.ts:19-21). So the PASS is real but sits on the structural rung, not the bit-exact rung.
- **cached:** TRUE for all four PASS engines (`reason: "cached previous PASS result"`). Evidence is reused, not freshly re-run this session — staleness risk per the launcher-seeding caveat; numbers should be re-validated with a clean cache before publication.
- **Verdict:** **WEAK-GATE** — real fixture + real mp4box.js implementation + a real, plausible oracle, but the only gate is the structural `reference-reimport` (no bit-exact/pixel correctness), and all results are cached n==1 samples. The PASS is trustworthy; the strength of the correctness claim is limited.

## Confidence & caveats

- Confidence: **medium**. The winner's code path and the oracle are real and verified by file:line; the fixture is a confirmed 4.4 MB real MOV.
- All benchmark numbers are **n==1** (single sample, mad==0, p95==median) and **cached==true**, so the 1.12x wall margin over ffmpeg.wasm is thin and could flip on a fresh multi-sample run.
- mp4box wins the PRIMARY metric (wall) and throughput, but **loses longtasks** (4531 ms vs ffmpeg's 2055 ms): if main-thread responsiveness were the ranking key, ffmpeg.wasm would win. mp4box also reports peakMemory ~94.7 MB (whole-file buffering) while the others did not measure memory, so a peakMemory comparison is not possible.
- All three NA engines are honest NA_ENGINE (operation not declared), not under-declared capabilities: media-parser and web-demuxer are read-only demuxers, and `platform` has no container muxer.
