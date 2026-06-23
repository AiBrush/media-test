# demux/flac_seektable

- family: demux
- fixture asset(s): `fixtures/media/flac_seektable.flac` (143 KB, real FLAC, container `flac`, codec `flac`, 48 kHz / 2ch / 10s)
- golden: `fixtures/golden/flac_seektable.flac.packets.json` (105 packets), `flac_seektable.flac.meta.json`
- primaryMetric: wall (ms)
- passCount: 4 of 7 (mediabunny, ffmpeg-wasm, remotion-webcodecs, remotion-media-parser)

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (4 engines PASS, all on the same single oracle `golden-packets`).
- **Decisive factor: performance.** All four passing engines satisfy the identical, strongest-available oracle for an audio-elementary demux (`golden-packets`, exact packet-by-packet match: 105/105 packets, maxPtsDriftUs=0). Correctness is therefore a tie, so the ranking falls to wall-clock.
- **Margin over runner-up:** mediabunny 5.095 ms vs ffmpeg-wasm 5.545 ms = **1.09x faster** (a thin margin); vs remotion-webcodecs 9.04 ms = **1.77x**; vs remotion-media-parser 18.135 ms = **3.56x**. All wall samples are n=1 (mad=0, p95=median), so the mediabunny-vs-ffmpeg margin is weak evidence; the gap over the remotion engines is comfortable.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:pass (105/105, drift 0µs) | 5.095 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (105/105, drift 0µs) | 5.545 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (105/105, drift 0µs) | 9.040 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (105/105, drift 0µs) | 18.135 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |

The shard's `bench` block contains only `wall` for every engine; throughputRealtime / peakMemory / longtasks were not measured for this demux row (n/a).

## Why the winner wins (deep technical)

The operation is a pure **native-FLAC elementary-stream demux**: walk the FLAC bitstream and recover the per-frame packet table (offset/size/keyframe + presentation timestamp). The fixture is a raw `.flac` file (no MP4/Matroska wrapper). FLAC frames are self-delimiting via frame sync codes and the STREAMINFO block; this file carries a SEEKTABLE metadata block, but the oracle's metamorphic partner (`flac_noseektable`) proves the packet table must be identical with or without it — i.e. a correct demuxer must enumerate frames from the bitstream, not lean on the seek index. The golden confirms the physics: 105 packets, every packet `keyframe:true` (each FLAC frame is independently decodable), ptsUs stepping in ~96000µs increments (4608 samples / 48000 Hz = 96 ms per frame), sizes ~1287-1303 bytes.

All four passing engines produce a byte-for-byte identical packet table: `measuredCount=105, goldenCount=105, comparedTracks=1, maxPtsDriftUs=0`. The `golden-packets` oracle (`src/core/oracles.ts:703-796`) is strict here — it groups packets per-track, sorts by dts/pts, and compares **size exactly** (`a.size !== b.size`, line 777), **keyframe flag exactly** (line 778), and timestamps within ±1ms after a constant per-track origin offset (lines 780-784). With 0µs drift and exact sizes, this is the strongest correctness signal an audio-elementary row can earn; there is no bit-exact decode oracle for a demux-only scenario. So correctness cannot separate the four — the SEEKTABLE block changed nothing about their output, exactly as the scenario intends.

mediabunny wins on speed. Its demux path (`src/engines/mediabunny/adapter.ts:1152-1182`) opens the input through the FLAC format singleton (`FLAC_FORMAT`, `codecs.ts:136`), then iterates a single `EncodedPacketSink.packets(undefined, undefined, { verifyKeyPackets: true })` (line 1165), pushing `{ size: pkt.byteLength, ptsUs: pkt.microsecondTimestamp, dtsUs===ptsUs, keyframe: pkt.type==='key' }`. Its config (`env.configUsed`) shows a `pure-ts-esm` core, `streaming-lockstep` pipeline, no SharedArrayBuffer, COOP/COEP **not-required** — a lean pure-TypeScript bitstream walker with no wasm module to instantiate. For a 143 KB file that is essentially in-memory frame-sync scanning, so the wall is dominated by parse, and mediabunny finishes in 5.095 ms.

ffmpeg.wasm is a near tie at 5.545 ms (1.09x slower). It is the same correctness but carries a wasm core; even fully warmed, the 105-frame walk through libavformat's flac demuxer is marginally heavier than mediabunny's native-TS scan. remotion-webcodecs (9.04 ms, `backend:webcodecs`, `streaming-backpressure`) and remotion-media-parser (18.135 ms, `backend:cpu-js`, `fieldsTier:full-parse(demux)`) are correct but slower JS parse paths; remotion-media-parser's full-parse demux tier is the slowest at 3.56x mediabunny. None of these gaps reflect a correctness deficit — they are pure pipeline-overhead differences on a tiny file.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on speed only: 5.545 ms vs 5.095 ms = 1.09x slower. Identical oracle (105/105, drift 0µs). The thin margin on n=1 samples makes this a near-dead-heat; correctness is equal. Its only "fault" is wasm instantiation/parse overhead vs mediabunny's pure-TS walker.
- **remotion-webcodecs@4.0.479** — PASS, lost on speed: 9.04 ms = 1.77x slower than mediabunny. Same exact packet table; the streaming-backpressure WebCodecs pipeline adds overhead unnecessary for a 105-packet audio demux.
- **remotion-media-parser@4.0.479** — PASS, lost on speed: 18.135 ms = 3.56x slower (slowest passer). `cpu-js` full-parse(demux) tier; correct but the heaviest parse path.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'flac'". Honest NA — the browser's WebCodecs/MSE surface has no FLAC-elementary demuxer; the adapter correctly does not over-declare a `flac` container capability.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'flac'". Honest NA — its declared container set does not include raw FLAC.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'flac'". Honest NA — mp4box is an ISO-BMFF (MP4/MOV) parser and cannot demux a raw FLAC elementary stream; declaring it would be a false capability.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:138` — `{ asset: 'flac_seektable.flac', container: 'flac', audioCodecs: ['flac'] }`. Metamorphic partner and rationale at `index.ts:200-206` and `index.ts:494-517` (SEEKTABLE presence must not change the packet table).
- **Fixture exists:** `fixtures/media/flac_seektable.flac` — 143 KB real FLAC file (stat confirmed). Not synthetic/empty/mock. Golden `fixtures/golden/flac_seektable.flac.packets.json` holds 105 packets with plausible per-frame sizes (~1287-1303 B) and 96 ms pts steps consistent with 4608-sample FLAC frames at 48 kHz.
- **Oracle:** `src/core/oracles.ts:703-796` (`goldenPackets`). Real comparison: exact count, exact per-packet size (line 777), exact keyframe flag (line 778), ±1ms pts/dts after constant origin alignment (lines 780-784). Not trivially satisfiable; no smoke fallback for this row; not ssim-based.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1152-1182` — genuinely opens the real input via mediabunny's FLAC format and iterates `EncodedPacketSink.packets({verifyKeyPackets:true})`. No canned output, no golden short-circuit, no input-copy, no error-swallowing. Capability declared at `adapter.ts:1036` (`containersIn` includes `'flac'`).
- **Verdict: REAL** — real fixture + real library demux + strict exact-match oracle producing physically plausible numbers (105 frames, 0µs drift, exact byte sizes).
- **Cached note:** All four PASS results have `cached==true` ("cached previous PASS result"). The outcome was reused, not freshly re-run this session; per the launcher seeding caveat, stale-PASS reuse carries a small risk that the win reflects a prior run. The oracle/measurements are internally consistent, so confidence remains high, but a fresh re-run would be needed for an authoritative wall-time tiebreak between mediabunny and ffmpeg-wasm.

## Confidence & caveats

- **Confidence: medium-high.** Correctness verdict is solid (strict exact oracle, 0µs drift, real fixture, genuine adapter). The *winner identity* hinges on a 1.09x wall margin over ffmpeg-wasm with n=1 samples (mad=0, p95=median) on cached results — that is statistically weak; a re-run could flip the top two. The win over both remotion engines (1.77x / 3.56x) is robust.
- Bench captured only `wall` for this row; no throughput/memory/longtask data to corroborate the ranking.
- The three NA engines are honestly under-scoped for raw FLAC, not under-declared capabilities.
