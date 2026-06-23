# transcode/fanout_h264_abr_ladder

**Family:** transcode · **Fixture:** `fixtures/media/h264_1080p_30s.mp4` (31 MB, real H.264/AAC in MP4) · **Primary metric:** throughputRealtime (TC_METRICS) · **passCount:** 1 / 7

## Verdict

**Best framework: mediabunny@1.48.0** — **UNCONTESTED** (exactly one PASS).

Decisive factor: mediabunny is the only engine that declares **both** `op: 'transcode'` **and** the `fanout` feature (plus `resize`) required by the scenario's `requires` block. The other six engines negotiate a clean `NA_ENGINE` at capability time — they never run. There is no runner-up to take a margin against; "margin" is therefore N/A.

mediabunny ran on the **WebCodecs** backend with `hwAccel: "prefer-hardware"` on an Apple M1 Max (ANGLE Metal), `pipeline: "streaming-lockstep"`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`. It produced **4 verified renditions** at **3.66x realtime** wall throughput (8194 ms wall for a 30 s clip), **encodeFps 109.8**.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | fanout-renditions:pass | 8194.355 ms | 3.661x | 0 (n=0, unmeasured) | 406 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fanout' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fanout' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'fanout' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

**The operation.** The scenario asks for a 1→4 H.264 ABR ladder: one 1080p30 H.264-in-MP4 source decoded once and re-encoded into four independently muxed MP4 renditions — 1920×1080@5 Mbps, 1280×720@2.8 Mbps, 854×480@1.4 Mbps, 640×360@800 kbps (`src/scenarios/transcode/index.ts:432-461`). This is not a remux or a frame copy: every rung needs a genuine spatial resize + H.264 re-encode at a distinct bitrate, and the suite needs four separately inspectable output files.

**Why mediabunny is the only contender.** The `requires` block (`index.ts:449-456`) demands `operations:['transcode']`, `containersIn/Out:['mp4']`, `videoCodecs:['h264']`, `audioCodecs:['aac']`, and `features:['fanout','resize']`. Three engines (web-demuxer, remotion-media-parser, mp4box) are parse/demux-only and do not declare `transcode` at all, so the runner negotiates `NA_ENGINE` on the missing operation. Three engines that *can* transcode (remotion-webcodecs, platform/WebCodecs, ffmpeg.wasm) do declare `transcode` but do **not** declare the `fanout` feature token — the contract that an adapter returns every requested rung in `MediaBytes.variants[]`. mediabunny's registry declares `fanout` (`src/engines/mediabunny/adapter.ts:1082` — "transcode() returns every requested ABR rendition in MediaBytes.variants[]"), so it is the sole engine that survives capability negotiation.

**How mediabunny implements the fanout (genuine, not faked).** `transcode()` (`adapter.ts:1271-1322`) detects `opts.variants` (`adapter.ts:1273`) and, for each variant, calls `runSingle(variant)` (`adapter.ts:1315`). `runSingle` (`adapter.ts:1284-1311`) opens a fresh `Input` over the source, builds a real `mediabunny.Output` MP4 muxer + `ConversionOptions`, calls `buildVideoOptions` for the per-variant width/height/codec/bitrate (`adapter.ts:1302`), sets a full-duration trim (`adapter.ts:1305`), and runs `runConversion` — the real mediabunny Conversion pipeline that decodes via WebCodecs and re-encodes through the hardware H.264 encoder. The four outputs are collected into `outputs[]` and returned as `{ ...primary, variants: outputs }` with `primary === variants[0]` (`adapter.ts:1313-1318`). Each rendition is a distinct, freshly muxed MP4 — no input→output copy, no canned bytes, no golden short-circuit.

**The oracle evidence (real numbers from the shard).** `fanout-renditions` (`src/core/oracles.ts:1584-1660`) verified all four rungs structurally and perceptually:
- It confirmed `variants.length === expected.length` (4 == 4, `oracles.ts:1597`).
- For each rung it re-probed the produced bytes through the reference engine and asserted exact width/height/codec against the spec (`oracles.ts:1631-1639`). Measured: variant0 1920×1080, variant1 1280×720, variant2 854×480, variant3 640×360 — all H.264 — matching the ladder exactly.
- The byte sizes descend monotonically with the bitrate ladder, which is the physical signature of a real ABR encode (not four copies of one file): variant0 19,324,357 B (5 Mbps), variant1 11,015,578 B (2.8 Mbps), variant2 5,780,478 B (1.4 Mbps), variant3 3,524,005 B (800 kbps); totalBytes 39,644,418.
- Each rung passed `playbackSmoke` (decode actually advanced, `oracles.ts:1641`) and `ssimPsnr` against the in-browser reference-decoded source downscaled to the rung resolution (`oracles.ts:1644`). SSIM means are 0.99999670 / 0.99998287 / 0.99983696 / 0.99994846 (min 0.99999406 / 0.99997565 / 0.99982723 / 0.99993937) — all far above the `ssimMin: 0.95` tolerance, with 12 SSIM pairs per rung.

**Backend mechanics for THIS codec/container.** Because the source is H.264-in-MP4 and the targets are H.264-in-MP4 at the same colorspace, mediabunny's Conversion can ride the platform's hardware H.264 decoder and encoder end-to-end (`backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pixelBackend: "VideoSample.copyTo(RGBA)>canvas"`). The Apple M1 Max VideoToolbox H.264 encoder is why the run sustains encodeFps 109.8 and 3.66x realtime over four full encodes of a 30 s clip in a single 8.2 s wall, with only 406 ms of long tasks (the streaming-lockstep pipeline keeps the main thread responsive; no SharedArrayBuffer / COOP-COEP needed).

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — NA_ENGINE, "engine does not declare feature 'fanout'". Honest NA: it can transcode and resize but never declared the multi-rendition `variants[]` contract, so it cannot satisfy a 1→4 fanout. Not an under-declaration cheat — emitting four files would require real adapter work it hasn't done.
- **platform@chrome-149** (raw WebCodecs) — NA_ENGINE, "engine does not declare feature 'fanout'". Honest NA: raw WebCodecs has no batched multi-output abstraction in this adapter; declaring `fanout` would require a hand-rolled per-rung encode+mux loop that isn't implemented.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE, "engine does not declare feature 'fanout'". Notable because native ffmpeg trivially does ladders via multiple `-map`/output args; the wasm adapter simply hasn't wired a `variants[]` path, so the NA is honest for the adapter as written (a defensible under-declaration to flag for future work, but not a false PASS).
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Correct: it is a demuxer, no encode path exists.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'transcode'". Correct: parser/probe-only, no encode path.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare operation 'transcode'". Correct: it is an MP4 box parser/segmenter, not an encoder.

## Anti-cheat validation

- **Scenario:** `src/scenarios/transcode/index.ts:444-461` (`ABR_OPTS` at `:432-441`). Input is `h264_1080p_30s.mp4`, the real 31 MB H.264/AAC MP4 fixture — verified present at `fixtures/media/h264_1080p_30s.mp4`. Not synthetic, not empty, not a mock. Notes: "1→4 H.264 ABR renditions (1080/720/480/360); every surfaced rendition is playback + SSIM/PSNR validated."
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1271-1322` (fanout loop `:1313-1318`, per-rung Conversion `:1284-1311`, capability token `:1082`). Genuinely calls mediabunny's `Output`/`Conversion`/`runConversion` per variant; no canned output, no input→output copy, no golden short-circuit, no error swallowing (it throws on invalid dims / missing tracks).
- **Oracle:** `src/core/oracles.ts:1584-1660` (`fanout-renditions`). Performs a real comparison: variant-count check, reference re-probe with exact width/height/codec assertions, playback-smoke per rung, and SSIM/PSNR per rung against the reference-decoded source. Not trivially satisfiable. Measurements are physically plausible: four distinct resolutions, monotonically descending byte sizes tracking the bitrate ladder, SSIM ≈ 0.9998–0.99999.
- **Caveat on strictness:** the SSIM leg is a perceptual proxy with `variantNSsimExactFrames: 0` (no bit-exact frames; expected for a lossy re-encode at a different resolution — bit-exactness is impossible here). The PASS is genuinely strong because it is gated by *structural* exactness (dimensions + codec + count + distinct byte payloads + playback) on top of near-unity SSIM, which places it on the structural/metadata-exact rung of the correctness ladder, not on the smoke-only rung.
- **Cached note:** mediabunny's result has `cached: true` ("cached previous PASS result"). The numbers above are reused, not freshly re-run this batch — minor staleness risk per the launcher-seeding caveat, but the cached evidence is internally consistent and physically plausible.

**Verdict: REAL.** Real fixture + real per-variant Conversion implementation + a meaningful multi-leg oracle (structural exactness + playback + near-unity SSIM).

## Confidence & caveats

- **Confidence: high** that mediabunny is the correct and only winner — uncontested, with a genuine implementation and a sound structural+perceptual gate.
- The win is uncontested, so no performance margin/ranking applies; the 3.66x-realtime / 109.8 encodeFps figures are single-sample (n=1, mad=0) and only describe mediabunny, not a comparison.
- `peakMemory` and `decodeFps` are unmeasured (n=0) for this run, so no memory comparison is possible.
- The three transcode-capable NAs (remotion-webcodecs, platform, ffmpeg.wasm) are honest given their adapters but represent latent coverage gaps: any of them could implement a `variants[]` fanout and contest this cell in future.
- Result is cached; a fresh re-run (clearing raw + .browser-cache per the seeding caveat) would harden the timing/SSIM numbers.
