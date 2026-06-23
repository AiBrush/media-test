# encryption/hls_aes128_decrypt

family: encryption | fixture asset: `hls_aes128.m3u8` (+ `hls_aes128_000..004.ts`, `hls_aes128.key`) | golden compare target: `hls_aes128_clear.mp4` | primaryMetric: wall | passCount: 2 / 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (`ffmpeg-wasm`).
- Contested: **YES** — 2 engines PASS (`ffmpeg-wasm`, `mediabunny`), both with identical, maximal correctness.
- Decisive factor: **performance**, since correctness is a tie. ffmpeg.wasm wins wall time and main-thread responsiveness.
- Margin over runner-up (mediabunny): **1.69x faster wall** (114.52 ms vs 194.095 ms), **1.69x higher throughputRealtime** (87.32x vs 51.52x), **6.17x lower longtasks** (3234 ms vs 19963 ms). peakMemory is uninformative (n=0 for both). Both bench rows are n=1 (mad=0, single sample) → the perf margin is real in direction but weak in statistical strength.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | decrypt-bitexact:true, playback-smoke:true | 114.52 ms | 87.32x | 0 (n=0) | 3234 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | decrypt-bitexact:true, playback-smoke:true | 194.095 ms | 51.52x | 0 (n=0) | 19963 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

## Why the winner wins (deep technical)

**The operation.** The input is a real HLS VOD playlist (`hls_aes128.m3u8`) with `#EXT-X-KEY:METHOD=AES-128,URI="hls_aes128.key",IV=0x953e5e232e1585e615d9164ece153cf2` and 5 MPEG-2 transport-stream segments (~900 KB each) carrying H.264 video + AAC audio. AES-128 here is whole-segment AES-CBC (PKCS#7), with an **explicit IV** carried in the playlist (not the media-sequence-derived default). The operation under test is `decrypt`: clear the segments byte-exactly, then re-container the cleared H.264/AAC so the output decodes to pixels identical to the offline plaintext reference `hls_aes128_clear.mp4`.

**Correctness is a tie at the top of the ladder.** Both PASS engines satisfy `decrypt-bitexact` — the strongest oracle class (bit-exact/crypto). The oracle (`src/core/oracles.ts:2537` `decryptBitexact`) decodes the engine's decrypted output via the platform decoder, then compares per-frame normalized-RGBA sha256 digests against the golden of the *cleartext* asset (`frameComparisonGolden` → `frameComparisonAssetId` reads `cleartextAsset: 'hls_aes128_clear.mp4'`, `src/core/oracles.ts:2562-2570`). Both engines report `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` — every one of the 12 frames is bit-exact. Both also pass `playback-smoke`. There is no correctness separation, so the tie breaks on performance.

**Why ffmpeg.wasm is faster for this container/scheme.** ffmpeg-wasm routes the `hls-aes128` scheme through FFmpeg's native HLS/applehttp demuxer with decrypt-on-demux plus a stream copy (`src/engines/ffmpeg-wasm/adapter.ts:2077-2107`). `writeInput()` materializes the `EXT-X-KEY` URI and the referenced `.ts` segments into MEMFS and supplies `-allowed_extensions ALL`; the command is `-i <playlist> -map 0 -c copy -movflags +faststart out.mp4`. The decisive cost-saver is **`-c copy`**: the AES-CBC clearing happens inside libavformat's crypto protocol during demux, and the cleared H.264/AAC elementary streams are *copied* (no re-decode, no re-encode) straight into a faststart MP4. The only heavy compute is the single AES-CBC pass over ~4.5 MB of segment bytes plus a TS→MP4 bitstream copy — a near-IO-bound path. That is why wall is 114.52 ms, throughput 87.32x realtime, and longtasks only 3234 ms.

**Why mediabunny is slower.** mediabunny's `hls-aes128` branch (`src/engines/mediabunny/adapter.ts:1613-1623`) opens the playlist with `openInput(mb, input, 'hls')`, builds an MP4 `Output` over a `BufferTarget`, and calls `runConversion(...)`. mediabunny's HLS reader resolves `#EXT-X-KEY` and decrypts segment bytes in pure TypeScript/WebCrypto inside its segmented reader, then runs a full conversion pipeline to repackage into MP4. That JS-driven segmented read + conversion is heavier and far less main-thread-friendly than libav's native copy path: wall 194.095 ms (1.69x slower) and — most tellingly — **longtasks 19963 ms vs 3234 ms (6.17x more main-thread blocking)**, reflecting long synchronous JS spans during decryption/conversion. Note mediabunny ran on the `webcodecs` / `prefer-hardware` backend per `env.configUsed`, but for a `-c copy`-style de-protection the WebCodecs decode path is not the bottleneck; the segmented-read + conversion overhead is.

**Backend / tiebreaker notes.** ffmpeg.wasm is single-thread wasm here (no SharedArrayBuffer needed, no COOP/COEP requirement), and it still beats mediabunny's WebCodecs-backed pipeline on this de-protection-by-copy workload — a case where avoiding a full decode/convert pass matters more than hardware decode. Both avoid COOP/COEP. Performance, not capabilities, is the separator.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on perf only. Same correctness (decrypt-bitexact 12/12, playback-smoke). Slower: 194.095 ms wall (1.69x), 51.52x throughput (0.59x), 19963 ms longtasks (6.17x worse). Cause: pure-JS segmented HLS read + full MP4 conversion vs libav decrypt-on-demux + stream copy.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: mp4box parses CENC signalling (pssh/senc) but cannot decrypt samples (`encryption: []`, decrypt absent; `src/engines/mp4box/adapter.ts:635-651`). No crypto/decode capability — genuine NA, not under-declared.
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'decrypt'". Honest: EME drives protected playback to the screen, not byte/frame export, so `decrypt: false`, `encryption: []` (`src/engines/platform/adapter.ts:236,263`). Correct NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'decrypt'". Honest: demux/probe-only library, no decode/encode/decrypt (`encryption: []`, `src/engines/web-demuxer/adapter.ts:646`). Genuine NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'decrypt'". Honest: parser only, "No decryption" (`encryption: []`, `src/engines/remotion-media-parser/adapter.ts:206-207`). Genuine NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare operation 'decrypt'". Honest: "No decrypt API" (`encryption: []`, `src/engines/remotion-webcodecs/adapter.ts:266-267`). Genuine NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/encryption/index.ts:95-114` (`id: 'hls_aes128_decrypt'`, `asset: 'hls_aes128.m3u8'`, `scheme: 'hls-aes128'`, `cleartextAsset: 'hls_aes128_clear.mp4'`, `oracles: ['decrypt-bitexact','playback-smoke']`).
- Fixture exists and is real: `fixtures/media/hls_aes128.m3u8` (378 B playlist with explicit-IV `#EXT-X-KEY`) referencing `fixtures/media/hls_aes128_000.ts ... 004.ts` (~900 KB each, total ~4.5 MB) and `fixtures/media/hls_aes128.key` (16 B). Key/IV ground truth in `fixtures/golden/hls_aes128.m3u8.keys.json` (`keyHex 366a63833fcc99941516c6239b0d3f11`, `ivHex 953e5e232e1585e615d9164ece153cf2` — IV matches the playlist). Not synthetic/empty/mock.
- Compare golden is real: `fixtures/golden/hls_aes128_clear.mp4.frames.json` has `pending:false` and **12 non-null sha256 digests** of normalized RGBA. (NB: `fixtures/golden/hls_aes128.m3u8.frames.json` is `pending:true` with null digests, but the oracle compares against the *cleartext* asset's golden via `frameComparisonAssetId`, so the populated `hls_aes128_clear.mp4` golden is what gates — the populated one is correctly the one used.)
- Oracle is meaningful: `decryptBitexact` (`src/core/oracles.ts:2537-2560`) decodes the engine output and does a per-frame sha256-digest equality (`compareDigests`) against the cleartext golden — fails on any null/missing digests or any mismatch. Not a wide-tolerance or smoke-only gate; measurements (12/12 compared, 0 mismatched) are physically plausible for ~2 s of 30 fps H.264.
- Winner adapter is genuinely implemented: `src/engines/ffmpeg-wasm/adapter.ts:2077-2107` runs real FFmpeg (HLS demuxer decrypt-on-demux + `-c copy` faststart). No canned output, no input→output copy of the encrypted bytes (it actually decrypts), no short-circuit to the golden, no error-swallow-as-success.
- Cached note: winner result has `cached:true` ("cached previous PASS result", durationMs 4984, startedAt 2026-06-22T16:42:15Z). Runner-up also `cached:true`. Evidence is reused, not re-run this pass → minor staleness risk; correctness verdict is robust (bit-exact crypto gate), perf numbers should ideally be re-measured fresh.
- Verdict: **REAL** — real multi-segment encrypted HLS fixture, real libav decrypt-on-demux implementation, strong bit-exact crypto oracle against a populated cleartext golden.

## Confidence & caveats

- Confidence: **high** on the winner. Correctness is a genuine tie at the strongest oracle tier; the performance ordering (ffmpeg.wasm faster, far fewer longtasks) is consistent across wall, throughput, and longtasks.
- Caveats: (1) Both bench rows are **n=1, mad=0** — single-sample, so the perf margin is directionally clear but statistically weak; a multi-sample re-run would harden it. (2) Both winners are **cached** — not re-run this pass. (3) **peakMemory uninstrumented** (n=0) for both, so memory was not a usable discriminator. (4) The m3u8's own frames golden is still `pending`, but it is not the gating golden for this oracle, so it does not affect the verdict.
