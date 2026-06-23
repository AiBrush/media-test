# encryption/hls_aes128_decrypt_eq_cleartext

family: encryption | fixture asset: hls_aes128.m3u8 (+ 5 segments hls_aes128_000..004.ts, key hls_aes128.key); golden baseline: hls_aes128_clear.mp4 | primaryMetric: (none declared → wall) | passCount: 2 / 7

## Verdict

Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
Contested: **YES** — two engines PASS (ffmpeg-wasm and mediabunny@1.48.0), both satisfying the *identical* oracle set at the *identical* strictness: `property-invariant` (decode-cleartext-baseline, 12/12 frame digests bit-exact, 0 mismatches) + `playback-smoke`. Correctness is therefore a dead heat — the decisive factor is **performance**.

Decisive factor: wall-clock and main-thread responsiveness.
- Wall median: ffmpeg-wasm **116.84 ms** vs mediabunny **283.56 ms** → **2.43x faster**.
- Longtasks (main-thread blocking): ffmpeg-wasm **4223 ms** vs mediabunny **19963 ms** → **4.73x less blocking** (0.21x).
- peakMemory: not captured for either (n=0, median 0) — no tiebreak available there.

Margin over runner-up: **2.43x faster wall, 0.21x main-thread longtasks**. Both measurements are single-sample (n=1, mad=0), so the spread is unknown and the magnitude (not the direction at the margin) carries the weaker evidentiary weight; the 2.4x/4.7x gaps are large enough to be decisive despite n=1.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, playback-smoke:true | 116.84 ms | n/a | 0 (uncaptured) | 4223 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:true, playback-smoke:true | 283.56 ms | n/a | 0 (uncaptured) | 19963 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

## Why the winner wins (deep technical)

The operation is a **metamorphic decrypt**: take the HLS VOD playlist `hls_aes128.m3u8` whose 5 MPEG-TS segments are encrypted with full-segment **AES-128-CBC** (HLS `#EXT-X-KEY:METHOD=AES-128`, explicit `IV=0x953e5e232e1585e615d9164ece153cf2`, key `366a63833fcc99941516c6239b0d3f11`), decrypt + demux + re-mux to a clean MP4, and prove the decoded pixels are bit-exact against the offline cleartext reference `hls_aes128_clear.mp4`. The media is **H.264 video + AAC audio** in TS segments; the baseline is the same content in a clear MP4.

Both winners pass the *same* gate, so correctness cannot rank them. The gate (`property-invariant`, src/core/oracles.ts:2686-2707) is strong: it decodes the engine's *output* MP4 with the platform decoder (`ctx.decodeWithPlatform`, oracles.ts:2697), then compares each frame's SHA-256 of the normalized RGBA buffer against `golden.frames` resolved from the **cleartextAsset** (`frameComparisonAssetId` → reads `cleartextAsset` option, oracles.ts:2562-2563; `frameComparisonGolden`, oracles.ts:2566). Measurements for both: `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` — a full bit-exact pixel agreement of the decrypted-then-decoded output with the independently-authored cleartext golden. This is crypto/bit-exact ladder strength, not a perceptual proxy.

Mechanistically, **ffmpeg.wasm** treats HLS-AES128 as a *native demuxer* problem. The adapter detects the playlist (`isHlsPlaylistInput`, src/engines/ffmpeg-wasm/adapter.ts:929-935: `.m3u8` suffix / `mpegurl` mime / `#EXTM3U` magic), then materializes the playlist's relative URIs as MEMFS sidecars by rewriting `URI=...` and segment lines to local names (`rewriteHlsPlaylistUris`, adapter.ts:937-970) so libavformat's `hls`/`applehttp` demuxer can open the segment files AND the key URI from the in-memory filesystem. FFmpeg's own HLS demuxer then performs the AES-128-CBC segment decryption inline against the `#EXT-X-KEY` material and stream-copies the elementary H.264/AAC into the output MP4. This is a single, tight C/wasm pass through highly-optimized libavformat code (declared `'hls:aes128'` feature, adapter.ts:1512; `encryption: ['cenc-ctr','hls-aes128']`, adapter.ts:1757). Result: **116.84 ms** wall and only **4223 ms** of long-task time. Notably this path does NOT use WebCodecs or hardware accel — it is the wasm decode/copy pipeline — yet it still wins on wall.

**mediabunny** also genuinely decrypts (it is not a false pass), but via a higher-level TypeScript HLS reader. Its `decrypt()` (src/engines/mediabunny/adapter.ts:1608-1624) opens the playlist as an `hls` input (`openInput(mb, input, 'hls')`) and runs `runConversion` to an MP4 BufferTarget; the HLS segmented reader resolves the `#EXT-X-KEY` URI and decrypts each segment's bytes in JS/WebCrypto before demux (adapter.ts:1042-1044). Its configUsed shows `backend: webcodecs`, `pipeline: streaming-lockstep`, `pixelBackend: VideoSample.copyTo(RGBA)>canvas`, `coopCoep: not-required`, `sharedArrayBuffer: false`, `wasmThreads: 0`. The streaming-lockstep + per-segment JS AES + conversion-graph muxing is correct but markedly heavier on the main thread: **283.56 ms** wall (2.43x slower) and **19963 ms** longtasks (4.73x more blocking) — the segment-by-segment decrypt + sample re-mux through the JS conversion pipeline does far more main-thread work than libav's native HLS demuxer. Correctness identical; throughput and responsiveness lose.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on performance: 283.56 ms wall vs 116.84 ms (2.43x slower) and 19963 ms vs 4223 ms longtasks (4.73x more main-thread blocking). Correctness is a true tie (same oracle, 12/12 bit-exact). Its JS/WebCrypto per-segment decrypt + streaming-lockstep conversion graph is heavier than libavformat's native HLS-AES128 demux.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA. The raw browser platform exposes no programmatic AES-128-HLS decrypt-to-bytes API (EME/MSE is DRM playback, not a byte-level decrypt op), so not declaring `decrypt` is correct, not an under-declaration.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest. mp4box.js is an ISOBMFF parser/segmenter; it has no HLS/TS AES-128 decryption pipeline.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest. It is a read-only parser; no decrypt/transcode emit path.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest. It is a demux-only WASM wrapper without a declared decrypt operation.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest. WebCodecs-centric transcode wrapper; no HLS-AES128 decrypt operation declared.

All five NAs are at the operation-declaration level (`decrypt` not in the engine's operation set), checked by the runner/registry capability gate before any oracle runs; none look like under-declared capabilities for this specific HLS-AES128 byte-decrypt task.

## Anti-cheat validation

- Scenario definition: src/scenarios/encryption/metamorphic.ts:81-99 (case `hls_aes128_decrypt_eq_cleartext`), asset `hls_aes128.m3u8`, container `hls`, scheme `hls-aes128`, oracles `['property-invariant','playback-smoke']`, cleartextAsset `hls_aes128_clear.mp4`. Notes confirm the explicit-IV (#EXT-X-KEY) path is exercised and reference-reimport was intentionally dropped (segmented-HLS output is not reliably re-demuxable as one blob) — a defensible gating choice, not a weakened gate.
- Fixture exists and is REAL: fixtures/media/hls_aes128.m3u8 (378 B, real `#EXT-X-KEY:METHOD=AES-128` with explicit IV), plus 5 real encrypted TS segments hls_aes128_000.ts..004.ts (~900 KB each) and hls_aes128.key (16 B). Cleartext baseline fixtures/media/hls_aes128_clear.mp4 (4.5 MB) with golden frames fixtures/golden/hls_aes128_clear.mp4.frames.json (13 sha256 entries). Key/IV ground truth: fixtures/golden/hls_aes128.m3u8.keys.json. No synthetic/empty/mock input.
- Winner adapter implements the operation genuinely: src/engines/ffmpeg-wasm/adapter.ts:929-970 (HLS detection + playlist URI rewrite to MEMFS sidecars, including the key URI) feeding libavformat's HLS/applehttp demuxer with native AES-128-CBC decryption; feature `'hls:aes128'` at adapter.ts:1512, `encryption` includes `'hls-aes128'` at adapter.ts:1757. No canned output, no input→output copy, no short-circuit to the golden, no error swallowing (the CENC paths throw on every malformed-box case, e.g. adapter.ts:1101-1400).
- Oracle is a real comparison: src/core/oracles.ts:2686-2707 decodes the engine output via the platform decoder and compares 12 frame SHA-256 RGBA digests against golden frames sourced from the cleartext asset (oracles.ts:2562-2566). Measurements physically plausible: 12 compared, 0 mismatched, against a real 10 s (5×2 s) 1080p-class H.264 clip. Not tolerance-trivial, not ssim-with-exactFrames==0, not smoke-only.
- Cached note: BOTH PASS results have `cached:true` ("cached previous PASS result"). The evidence was reused, not freshly re-run in this pass — there is staleness risk (cf. launcher seeding caveat). The verdict direction (ffmpeg-wasm faster, both bit-exact) is robust, but the exact wall/longtask numbers reflect a prior run.
- Verdict: **REAL** — real segmented HLS-AES128 fixture, genuine libavformat decrypt implementation, and a bit-exact cross-asset metamorphic oracle. The only caveat is cached evidence (does not change the winner).

## Confidence & caveats

Confidence: **high** on the winner (ffmpeg-wasm) given a 2.43x wall and 4.73x longtask margin over the only other passer, identical strong correctness, a real fixture, a genuine implementation, and a meaningful bit-exact oracle. Caveats: (1) both passing results are `cached:true`, so the precise metrics are from a prior run (staleness risk); (2) bench is single-sample (n=1, mad=0) — direction is clear but variance is unmeasured; (3) peakMemory was not captured (n=0) for either engine, removing one tiebreak dimension; (4) `throughputRealtime`/`primaryMetric` were not emitted in this shard, so wall + longtasks are the ranking basis.
