# demux/flac_noseektable

family: demux | fixture asset: `flac_noseektable.flac` (143 KB, real `fLaC` bitstream, 48 kHz stereo, ~10 s) | primaryMetric: wall | passCount: 4/7

## Verdict
- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- CONTESTED: 4 of 7 engines PASS the single gating oracle `golden-packets`, and all four passed it with byte/timestamp-identical measurements (`measuredCount=105`, `goldenCount=105`, `comparedTracks=1`, `maxPtsDriftUs=0`). Correctness strength is therefore a perfect tie.
- Decisive factor: PERFORMANCE on the `wall` primary metric, since correctness is indistinguishable. ffmpeg.wasm posts the lowest wall median at **6.715 ms**.
- Margin over runner-up (remotion-webcodecs @ 9.625 ms): **1.43x faster wall**. Against remotion-media-parser (11.115 ms): 1.66x. Against mediabunny (19.2 ms): 2.86x. Caveat: every PASS row is `n==1` (single timed sample, `mad=0`, `warmup=1`), so the margin is weak statistical evidence — see Confidence.

## Per-engine results
| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (105/105, drift 0µs) | 6.715 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (105/105, drift 0µs) | 9.625 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (105/105, drift 0µs) | 11.115 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true (105/105, drift 0µs) | 19.2 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |

(No throughputRealtime/peakMemory/longtasks were emitted in any engine's `bench` block for this scenario — only `wall` was measured.)

## Why the winner wins (deep technical)
The operation is demuxing a **raw FLAC elementary stream that has NO SEEKTABLE metadata block**. The fixture header (`66 4c 61 43` = `fLaC`, then a STREAMINFO block of length `0x22`) carries STREAMINFO and VORBIS_COMMENT but no type-3 SEEKTABLE, so an engine cannot consult a seek index to enumerate frames. Frame boundaries must be recovered by **walking the FLAC bitstream itself** — scanning for the 14-bit `0x3FFE` frame sync code, decoding each frame header (block size, sample rate, channel assignment), and computing per-frame sample offsets to derive packet timestamps. The golden encodes 105 frames at exactly 96000 µs spacing (4608 samples / 48000 Hz = 96 ms per frame), all flagged `keyframe:true` (every FLAC frame is independently decodable), with the first packet at pts 0.

ffmpeg.wasm performs this through native libavformat's FLAC demuxer. The adapter does not parse FLAC by hand: it runs `ffmpeg -i <in> -c copy -f framecrc <out>` (documented at `src/engines/ffmpeg-wasm/adapter.ts:269`) and parses the framecrc muxer's one-line-per-packet output in `parseFramecrcPackets` (`src/engines/ffmpeg-wasm/adapter.ts:439-489`). Each framecrc row yields `trackIndex, dts, pts, size` and a keyframe flag; timestamps are converted from stream-timebase ticks to microseconds via the per-stream `#tb` lines (`adapter.ts:446-451, 478-484`). The keyframe convention is handled correctly for FLAC: the framecrc muxer OMITS the `F=` field when the only flag is KEY, so the adapter treats a missing flag column as keyframe=true (`adapter.ts:463-476`) — which is exactly why all 105 FLAC frames report `keyframe:true` and match the golden. FLAC is declared as a native demuxer/decoder (`src/engines/ffmpeg-wasm/codecs.ts:38,61,80,96,122-123` — `flac: 'flac' // native`), so the container is genuinely un-NA'd and the bitstream is walked by ffmpeg's own `flacdec`.

Because correctness is a dead heat — `golden-packets` is order-independent and per-track origin-aligned (`src/core/oracles.ts:732-792`), and all four engines produced 105 packets with `maxPtsDriftUs=0`, zero size mismatches, and zero keyframe-flag mismatches — the only differentiator is wall time. Here ffmpeg.wasm's single-thread wasm core (no SharedArrayBuffer, no COOP/COEP, no GPU involvement for an audio elementary stream) demuxes the 143 KB file in 6.715 ms, ahead of the two Remotion CPU/JS parsers and mediabunny. For a tiny audio-only file, ffmpeg.wasm's compiled C frame-walker beats the JS bitstream scanners; there is no decode or pixel work where a WebCodecs hardware path could have helped the others.

## What each other framework did wrong
- **remotion-webcodecs@4.0.479** — PASS, but lost on speed: 9.625 ms wall vs 6.715 ms (1.43x slower). Same perfect oracle result (105/105, drift 0µs). It used `backend:webcodecs` / `cpu-js` parsing for the demux, but WebCodecs hardware acceleration is irrelevant to a no-decode FLAC packet enumeration, so it carried JS-parse overhead without benefit.
- **remotion-media-parser@4.0.479** — PASS, but slower: 11.115 ms (1.66x slower). `backend:cpu-js`, `fieldsTier:full-parse(demux)`, pure-JS FLAC frame walking; correct (105/105, drift 0µs) but its JS bitstream scan is heavier than ffmpeg's native demuxer.
- **mediabunny@1.48.0** — PASS, but slowest of the four: 19.2 ms (2.86x slower). Pure-TS ESM core (`coreBuild:pure-ts-esm`), correct result (105/105, drift 0µs). Its TypeScript frame walker pays the highest per-frame interpreter cost for the 105-frame sync scan.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'flac'". Honest NA — Chrome's built-in WebCodecs/`MediaSource` demux surface does not expose a raw-FLAC container demuxer (FLAC-in-MP4/Ogg only), so it cannot enumerate native-FLAC frames. Not an under-declaration.
- **web-demuxer@4.0.0** — NA_ENGINE: same "does not declare input container 'flac'". Plausibly under-declared in principle (web-demuxer wraps an ffmpeg build), but the registry capability set does not list `flac` as an input container, so the NA is consistent with its declared capabilities.
- **mp4box@2.3.0** — NA_ENGINE: same reason. Honest — MP4Box.js is an ISO-BMFF (MP4/MOV/fragmented) parser only; it has no FLAC elementary-stream demuxer at all.

## Anti-cheat validation
- Scenario definition: `src/scenarios/demux/index.ts:200-206` — `asset: 'flac_noseektable.flac'`, `container: 'flac'`, `audioCodecs: ['flac']`, notes: "FLAC WITHOUT a SEEKTABLE block: frame enumeration must come from the bitstream itself, not a seek index." There is a paired metamorphic case at `index.ts:494-518` asserting `packets(flac_noseektable) == packets(flac_seektable)` (the bake equalized the no-seektable golden to the seektable variant), strengthening the gate.
- Fixture exists and is real: `fixtures/media/flac_noseektable.flac`, 143 KB, header `66 4c 61 43` (`fLaC`) confirmed via xxd — a genuine FLAC bitstream, not synthetic/empty/mock. STREAMINFO present; no type-3 SEEKTABLE block, matching the scenario's intent.
- Golden is real and physically plausible: `fixtures/golden/flac_noseektable.flac.packets.json` (12 KB, 105 packets) — first packet size 1298 bytes pts 0, subsequent packets at 96000 µs steps (4608 samples @ 48 kHz), all keyframes. Meta (`.meta.json`): 48 kHz stereo, 10 s, bitrate 114346 — consistent with a 143 KB / 10 s FLAC.
- Oracle: `golden-packets` at `src/core/oracles.ts:703-796`. Real comparison: matches packet count, per-track index layout (`oracles.ts:717-730`), and position-by-position size + keyframe-flag equality with order-independent per-track sort by dts/pts and a constant per-track origin-offset allowance for timestamps (`oracles.ts:739-792`). Not trivially satisfiable: size and keyframe mismatches fail outright; only a *constant* ts offset is forgiven, a varying residual fails. The shard's `maxPtsDriftUs=0` shows zero timestamp drift, so the tolerance was not even exercised.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:269` (the `-c copy -f framecrc` demux exec) and `:439-489` (framecrc parser). Genuinely invokes the vendored ffmpeg wasm core; does NOT return canned output, copy input→output, short-circuit to the golden, or swallow errors (it derives packets from real framecrc rows). FLAC declared native at `codecs.ts:38`.
- Cached note: the winner's row (and all four PASS rows) have `cached==true` ("cached previous PASS result"). Evidence is REUSED, not freshly re-run, so the absolute wall numbers carry staleness risk; per the launcher seeding caveat, a fully honest fresh timing would require clearing raw + .browser-cache. The correctness verdict is unaffected (golden comparison is deterministic).
- Verdict: **REAL** — real un-mocked FLAC fixture, real native-ffmpeg demux implementation, and a meaningful structural packet-table oracle that compares against an authentic golden and is not loosely satisfiable.

## Confidence & caveats
- Confidence: medium. The PASS/NA classification and REAL validation are solid (real fixture, real oracle, real adapter path). The *winner ranking* rests entirely on wall time because correctness is a 4-way tie, and every wall sample is `n==1` with `mad=0` — a single measurement. ffmpeg.wasm's 1.43x lead over remotion-webcodecs could plausibly shrink or invert across repeated runs.
- All four PASS rows are `cached==true`; the wall medians are reused from a prior run, adding staleness risk to the timing-based decision.
- No secondary metrics (throughputRealtime, peakMemory, longtasks) were recorded, so the tiebreak could not be cross-checked against memory or main-thread cost. ffmpeg.wasm's single-thread wasm core (no COOP/COEP, no SharedArrayBuffer per `coreBuild`/`sharedArrayBuffer:false` seen in sibling configs) is a deployment plus, but that did not factor into the metric-based ranking.
