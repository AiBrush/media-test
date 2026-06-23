# demux/aac_adts

family: demux | fixture asset: `fixtures/media/aac_adts.aac` (164 KB, raw ADTS/AAC elementary stream) | primaryMetric: wall | passCount: 4 / 7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (4 of 7 engines PASS the identical `golden-packets` gate).
- **Decisive factor: performance.** All four passing engines produce a bit-identical packet table (470/470 packets, 1 track), so correctness is a tie; the tiebreak is wall-clock demux time.
- **Margin over runner-up (ffmpeg.wasm, 8.83 ms):** mediabunny 5.92 ms = **1.49x faster wall**. Against the slowest passer (remotion-media-parser, 15.30 ms) it is **2.58x faster**. Caveat: n==1 per engine, mad==0, so this is single-sample evidence (weak spread information).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true | 5.92 ms | n/a | n/a | n/a | cached previous PASS (maxPtsDriftUs=1) |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 8.83 ms | n/a | n/a | n/a | cached previous PASS (maxPtsDriftUs=0) |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 13.13 ms | n/a | n/a | n/a | cached previous PASS (maxPtsDriftUs=0) |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 15.30 ms | n/a | n/a | n/a | cached previous PASS (maxPtsDriftUs=0) |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'adts' |

No engine reported throughputRealtime / peakMemory / longtasks for this row; the only emitted bench metric is `wall` (primaryMetric), as expected for a small audio-elementary demux case.

## Why the winner wins (deep technical)

The input is a **raw ADTS AAC elementary stream** (`aac_adts.aac`): there is no ISO-BMFF/Matroska container box tree to walk — the demuxer must scan the byte stream for ADTS sync words (`0xFFF`), parse each 7-or-9-byte ADTS header to recover `aac_frame_length`, and synthesize the packet boundaries and the 1024-sample-per-frame presentation clock itself. The golden (baked from ffprobe) is 470 packets, all `keyframe:true` (every AAC access unit is independently decodable), single track (trackIndex 0), with a 21333µs inter-packet stride (1024 samples / 48000 Hz × 1e6 ≈ 21333µs) running to a final pts of 10005333µs (~10 s). The `golden-packets` oracle (`src/core/oracles.ts:703`) groups by track, sorts each group by dts→pts, and compares **size and keyframe flags exactly** while allowing only a constant per-track timestamp origin offset (±1ms residual tolerance, `tsTolUs`, oracles.ts:738). This is a strict structural/metadata-exact gate, not a perceptual or smoke proxy — it catches dropped frames, wrong frame-length parsing, or a misderived sample-rate clock.

All four passing engines hit `measuredCount==470 / goldenCount==470` with `comparedTracks==1`. Three of them (ffmpeg.wasm, remotion-webcodecs, remotion-media-parser) report `maxPtsDriftUs==0` — perfect timestamp reconstruction. Mediabunny reports `maxPtsDriftUs==1`, i.e. a single-microsecond residual from rational-to-integer rounding of its `microsecondTimestamp` conversion, far inside the ±1000µs tolerance and irrelevant to the size/keyframe-exact comparison. Correctness across the four is therefore equivalent (the 1µs is not a correctness deficit; it is a representation artifact of mediabunny converting an internal rational to µs).

Because correctness ties, **performance decides**, and mediabunny is the fastest at 5.92 ms wall. Mechanistically: mediabunny runs a **pure-TS ESM** demux path (`env.configUsed.coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`) — no wasm module instantiation, no worker handshake. Its `demux()` (`src/engines/mediabunny/adapter.ts:1152`) opens the input once, gets the track list, and streams packets through `EncodedPacketSink.packets(undefined, undefined, { verifyKeyPackets: true })` (adapter.ts:1162-1176), reading `pkt.microsecondTimestamp`, `pkt.byteLength`, and `pkt.type === 'key'` directly off each `EncodedPacket`. For a 164 KB ADTS file this is a tight in-process JS scan of the sync-word frame loop with no FFI boundary. By contrast ffmpeg.wasm (8.83 ms) pays for crossing into a wasm libavformat instance to run the ADTS demuxer, and the two Remotion paths (13.13 / 15.30 ms) carry their own parser overhead — remotion-media-parser explicitly runs `backend: "cpu-js"`, `fieldsTier: "full-parse(demux)"` on the main thread (`worker:false`), which is the slowest configuration here. Mediabunny's no-wasm, no-COOP/COEP, streaming-lockstep design is the decisive structural advantage for a tiny elementary-stream demux where startup/FFI cost dominates the actual parse work.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correct (470/470, maxPtsDriftUs=0) but 8.83 ms vs 5.92 ms = 1.49x slower wall; the loss is the wasm/libavformat FFI and module-instantiation overhead, unjustified for a 164 KB pure-frame-scan workload.
- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** correct (470/470, maxPtsDriftUs=0) but 13.13 ms = 2.22x slower; its streaming-backpressure pipeline + parser layer is heavier than mediabunny's direct sink for this case.
- **remotion-media-parser@4.0.479 (PASS, lost on perf):** correct (470/470, maxPtsDriftUs=0) but slowest at 15.30 ms = 2.58x slower; `backend: cpu-js`, `worker:false`, full-parse on the main thread is the least efficient config in the field.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare input container 'adts'". Honest NA — the WebCodecs-only platform path has no demuxer for raw ADTS elementary streams (the browser exposes decoders, not container demuxers), so it cannot enumerate a packet table without an external parser.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare input container 'adts'". Honest NA — its declared input containers do not include raw `adts`; not under-declared, this is a genuine capability gap for elementary AAC.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'adts'". Honest NA — MP4Box.js is an ISO-BMFF (MP4/MOV) parser and structurally cannot parse a non-boxed ADTS elementary stream.

## Anti-cheat validation

- **Scenario:** `src/scenarios/demux/index.ts:136` — `{ asset: 'aac_adts.aac', container: 'adts', audioCodecs: ['aac'], notes: 'ADTS frame boundaries → audio packets.' }`. Framework-blind (no library named).
- **Fixture exists & is real:** `fixtures/media/aac_adts.aac`, 164 KB on disk — a genuine raw ADTS/AAC file, not synthetic/empty/mock.
- **Golden is independent & plausible:** `fixtures/golden/aac_adts.aac.packets.json`, 53 KB, 470 packets, all `keyframe:true`, single track, 21333µs stride, last pts 10005333µs (~10 s @ 48 kHz). Physically consistent with real ADTS AAC (1024 samples/frame); baked offline from ffprobe per the scenario header comment.
- **Oracle is meaningful, not trivially satisfiable:** `goldenPackets` at `src/core/oracles.ts:703` requires exact packet count, exact per-track size match (oracles.ts:777), exact keyframe-flag match (oracles.ts:778), and per-track timestamp residual within ±1ms after only a *constant* origin offset (oracles.ts:780-784). A wrong frame-length parse or dropped sync word would change `size`/count and fail. Not a smoke gate, not an ssim proxy.
- **Winner implementation is genuine:** `src/engines/mediabunny/adapter.ts:1152-1183` opens the real `Input`, lists tracks, and iterates `EncodedPacketSink.packets({ verifyKeyPackets: true })`, reading real `microsecondTimestamp` / `byteLength` / `type` per packet. No canned output, no copy of golden, no error-swallow. `adts` is honestly declared in `containersIn` (adapter.ts:1036).
- **Verdict: REAL** — real fixture + independent ffprobe golden + strict structural oracle + genuine streaming demux implementation.
- **Cached note:** all four PASS results have `cached:true` ("cached previous PASS result"). The packet tables and bench numbers were reused, not freshly re-run, so the 5.92/8.83/13.13/15.30 ms wall figures carry staleness risk and rest on a single sample each (n==1, mad==0). The PASS/correctness conclusions are unaffected (golden comparison is deterministic); only the perf margins are soft.

## Confidence & caveats

- **Confidence: medium.** Winner correctness is solid and the implementation/fixture/oracle all validate as REAL. The win is decided by performance, and the perf evidence is weak: n==1 per engine, mad==0, all results cached. The 1.49x margin over ffmpeg.wasm is real but single-sample; a fresh re-run could narrow or reorder the perf gap among the four passers (their correctness would not change).
- mediabunny's `maxPtsDriftUs==1` vs others' 0 is a representation/rounding artifact (rational→µs), not a correctness penalty; it does not affect ranking.
- The three NA_ENGINE verdicts (platform, web-demuxer, mp4box) all look honest — raw ADTS demux is a real capability gap for a WebCodecs-only path and for an MP4-box parser, not an under-declaration.
