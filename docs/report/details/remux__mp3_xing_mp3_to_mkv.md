# remux/mp3_xing_mp3_to_mkv

- family: remux
- fixture asset: `mp3_xing.mp3` (64 KB, fixtures/media/mp3_xing.mp3)
- operation: `remux` MP3 (Xing/VBR-header MPEG-1 Layer III) -> Matroska (MKV), lossless coded-frame copy
- primaryMetric: wall (REMUX_OUT_METRICS, correctness-first family)
- passCount: 2 / 7 (mediabunny, ffmpeg-wasm)

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`)
- CONTESTED: two PASS engines (mediabunny, ffmpeg.wasm) cleared the identical gate.
- Decisive factor: **performance tiebreaker**. Correctness is a dead heat — both engines pass the
  single gating oracle `reference-reimport` with byte-for-byte identical measurements
  (reimportPackets 384, reimportKeyframes 384, reimportMediaTracks 1, goldenMediaTracks 1,
  durationDeltaSec 0.031 vs tolerance 0.1). So the win is decided on wall + throughput + longtasks.
- Margin over runner-up (ffmpeg.wasm): wall **8.24ms -> 7.82ms = 1.05x faster**;
  throughputRealtime **1278.77x vs 1213.59x = 1.05x higher**; main-thread longtasks
  **1901ms vs 3045ms = 1.60x less blocking**. All on n=1 (see caveats — the wall/throughput edge is
  thin and single-sample; the longtask edge is the substantive, architecturally-grounded one).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true | 7.82 ms | 1278.77 x | n=0 (not measured) | 1901 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 8.24 ms | 1213.59 x | n=0 (not measured) | 3045 ms | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

## Why the winner wins (deep technical)

The operation is a *lossless container transmux*: the MPEG-1 Layer III audio elementary stream from a
VBR MP3 carrying a Xing/Info header is repackaged into a Matroska (MKV) `SimpleBlock` track. MP3 is a
legal Matroska audio codec, so no decode/re-encode is needed — only the coded MP3 frames must move
verbatim from the MP3 elementary stream into MKV clusters, with the Xing TOC frame dropped (it is an
MP3-container artifact, not coded audio). The golden meta (fixtures/golden/mp3_xing.mp3.meta.json)
confirms a single audio track: codec mp3, 44100 Hz, 2 ch, ~51 kbit/s, ~10 s.

mediabunny performs this through its `Conversion` pipeline with no codec options. The remux path is
src/engines/mediabunny/adapter.ts:1244-1260: it builds an `Output` with the MKV `OutputFormat`
(`makeOutputFormat(opts.container, ...)`), opens the MP3 with `openInput`, and calls
`runConversion(...)` (adapter.ts:842-868). Because `ConversionOptions` carries no `video`/`audio`
transform specs, `Conversion.init` selects a stream-copy track and `conversion.execute()` writes the
coded MP3 frames straight into MKV — confirmed valid by the `isValid`/`discardedTracks` guard at
adapter.ts:849-854 (it throws if no usable copy track survives, so a degenerate/empty output cannot be
silently reported as success). The backend recorded in env.configUsed is `coreBuild: pure-ts-esm`,
`wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required` — a pure-TypeScript ESM muxer
that needs no SharedArrayBuffer and no cross-origin isolation headers.

The gating oracle `reference-reimport` (src/core/oracles.ts:1225-1271 -> semanticRemuxReimport
1273+) re-imports mediabunny's MKV bytes with the reference engine, demuxes, and checks media-track
semantics + duration against golden. Measurements from the shard: reimportPackets 384,
reimportKeyframes 384 (every MP3 frame is independently decodable, so all 384 packets are keyframes —
physically correct for MP3), reimportMediaTracks 1 == goldenMediaTracks 1, durationDeltaSec 0.031 <
durationToleranceSec 0.1. So the MKV is a real, reference-parseable container preserving exactly one
audio track and the ~10 s duration.

Why mediabunny edges ffmpeg.wasm: the correctness is identical (ffmpeg produces the *same* 384/384/1
re-import and the *same* 0.031 s duration delta — its `-map 0 -c copy` stream copy at
src/engines/ffmpeg-wasm/adapter.ts:2044 moves the identical coded frames). The separation is purely
runtime cost. ffmpeg.wasm must boot and drive a multi-megabyte Emscripten ffmpeg core (write input to
MEMFS, run `runInfo` probe + the copy command, read MEMFS back), which is why its main-thread
longtasks total **3045 ms** versus mediabunny's **1901 ms** — a 1.60x reduction in UI-blocking work.
The wall medians are within 0.42 ms of each other (7.82 vs 8.24 ms) and throughput tracks that
(1278.77x vs 1213.59x realtime); these are the *steady-state copy* numbers and the gap is small, but
mediabunny is ahead on every reported axis and additionally requires no COOP/COEP and no wasm threads,
which is the architectural tiebreaker (oracle ranking step 4c). peakMemory and targetWrites have n=0
for both, so neither is decided on memory.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, runner-up): correct and lossless, but loses the perf tiebreaker —
  +0.42 ms wall (1.05x slower), -65x realtime throughput (1.05x lower), and 3045 ms vs 1901 ms
  longtasks (1.60x more main-thread blocking) from the wasm-core boot + MEMFS round-trip. No
  correctness deficit.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: web-demuxer
  is a demux/probe-only binding; it has no muxer to emit a container. Genuine capability gap.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest:
  it is a parser, not a writer; no mux path exists. Genuine.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest:
  the remotion webcodecs writer targets MP4/WebM, not full Matroska/MKV; it declares remux but not the
  MKV output container, so the cell is correctly skipped (not under-declared for THIS target).
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'mp3'". Honest: mp4box.js only
  parses/writes ISO-BMFF (MP4/MOV/fragmented); it cannot ingest a raw MP3 elementary stream. Genuine.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: the browser
  WebCodecs/MSE platform exposes decode/encode primitives but no container muxer API, so a generic
  remux op is not declarable. Genuine.

## Anti-cheat validation

- Scenario definition: src/scenarios/remux/audio.ts:82-88 (asset `mp3_xing.mp3`, from `mp3`, to `mkv`,
  audioCodecs `['mp3']`); built via src/scenarios/remux/_shared.ts:84-104 (`buildRemux`), id derived by
  `remuxId` (_shared.ts:73-75) -> `remux/mp3_xing_mp3_to_mkv`. Default oracle set is
  `['reference-reimport']` (_shared.ts:78-81). Notes: "MP3->MKV: MP3 is legal in Matroska; lossless
  audio re-wrap (Xing TOC dropped, frames identical)."
- Fixture: `fixtures/media/mp3_xing.mp3` EXISTS, 64 KB real MPEG audio (not synthetic/empty/mock).
  Goldens present: fixtures/golden/mp3_xing.mp3.meta.json (mp3/44100/2ch/~10s) and
  mp3_xing.mp3.packets.json (43 KB packet table).
- Winner adapter: src/engines/mediabunny/adapter.ts:1244-1260 (`remux`) -> runConversion at
  adapter.ts:842-868. It calls the real mediabunny `Conversion` API, builds a real MKV `Output`, and
  has a hard `isValid`/`discardedTracks` guard (849-854) that throws on an empty/degenerate copy. No
  canned bytes, no input->output passthrough fake, no short-circuit to the golden file, no error
  swallowing.
- Gating oracle: src/core/oracles.ts:1225-1271 (`referenceReimport`) + semanticRemuxReimport
  (1273-1312+). It re-demuxes the engine's actual output bytes with the independent reference engine
  and compares media-track count/layout + duration against golden — a real round-trip comparison, not
  a width-anything tolerance. The remux branch (1243-1247) explicitly rejects an empty packet table.
  Measurements are physically plausible for ~10 s of 44.1 kHz MP3: 384 MP3 frames, all keyframes,
  1 track, 0.031 s duration delta.
- Verdict: **REAL**. Real fixture + real Conversion/stream-copy implementation + a meaningful
  structural re-import oracle that an empty or copied-input output would fail.
- Cached note: BOTH PASS results have `cached:true` ("cached previous PASS result"). The evidence was
  reused, not re-run this batch — minor staleness risk. The adapter code paths and oracle inspected
  here are the current sources, and the measurements are internally consistent, so confidence remains
  high; but the perf numbers reflect a prior run.

## Confidence & caveats

- Confidence: **high** on the winner identity and REAL verdict; the NA reasons for all five skipped
  engines are honest capability gaps, not under-declarations.
- The wall/throughput margin is thin (1.05x) and on **n=1, mad=0** for every metric — single-sample
  evidence. The robust, architecturally-explained advantage is the 1.60x lower longtasks (1901 vs
  3045 ms) plus mediabunny's no-COOP/COEP, no-wasm-threads, no-SharedArrayBuffer profile.
- peakMemory and targetWrites are n=0 (uninstrumented for this cell), so the win is not memory-based.
- Both winners are `cached:true`; numbers should be re-confirmed on a fresh run for a definitive perf
  delta.
