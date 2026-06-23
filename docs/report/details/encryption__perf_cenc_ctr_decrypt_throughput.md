# encryption/perf_cenc_ctr_decrypt_throughput

- **Family:** encryption
- **Fixture asset(s):** `fixtures/media/cenc_ctr.mp4` (2.2 MB, H.264 + AAC in MP4, CENC AES-CTR protected); golden comparison target `fixtures/media/cenc_ctr_clear.mp4` via `fixtures/golden/cenc_ctr_clear.mp4.frames.json`
- **primaryMetric:** `throughputRealtime` (x-realtime; decrypt wall vs 5.021 s media duration, higher-is-better)
- **passCount:** 1 of 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` — UNCONTESTED (only PASS).
- **Decisive factor:** It is the only engine that both declares the `webcrypto:cenc-ctr-clear-output` feature AND actually produces a frame-exact clear MP4 from the CENC-CTR fixture. It passed the gating `decrypt-bitexact` oracle (12/12 frames bit-exact, 0 mismatches) and posted `throughputRealtime` = **128.63 x-realtime** (wall = **39.03 ms** for 5.021 s of media).
- **Margin over runner-up:** none — all other six engines are NA (4 do not declare the `decrypt` operation; mediabunny declares decrypt but withholds the `webcrypto:cenc-ctr-clear-output` feature). There is no second PASS to form a ratio.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | decrypt-bitexact:pass | 39.03 ms | 128.63 x-realtime | 0 (n=0, unsampled) | 4924 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'webcrypto:cenc-ctr-clear-output' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

## Why the winner wins (deep technical)

The operation is a standalone **CENC AES-CTR** decrypt of a non-fragmented MP4 carrying H.264 video (1280x720, 29.872 fps, ~3.37 Mbps) and AAC audio (48 kHz stereo, ~128 kbps), 5.021 s total (`fixtures/golden/cenc_ctr.mp4.meta.json`). There is no browser-native byte/frame export path for this: EME drives protected playback to the screen, never to a buffer, which is exactly why `platform` declares decrypt as `✗ NA` (`src/engines/platform/adapter.ts:19`). ffmpeg.wasm@0.12.15 wins because it is the only adapter that reconstructs the cleartext elementary stream itself and then re-containers it.

The decrypt is genuinely implemented in `src/engines/ffmpeg-wasm/adapter.ts`. The `decrypt()` entry (`adapter.ts:2073`) dispatches `cenc-ctr` to `decryptCencCtrMp4()` (`adapter.ts:1349`), which parses the real box tree: it walks `stsd`/`tenc` to confirm the protection scheme is `cenc` and matches the supplied KID (`adapter.ts:1364`, `:1369`), reads the sample-size/offset tables (`stsz`/`stsc`/`stco`/`co64`, `adapter.ts:1171`–`1232`), and reads the per-sample initialization vectors and subsample ranges from the `senc` box (`adapter.ts:1240`–`1278`). Each sample is decrypted by `decryptCencSample()` (`adapter.ts:1297`), which handles CENC subsample partial-encryption (clear NAL-header bytes interleaved with protected payload) and the FFmpeg cenc-aes-ctr block-advance quirk (`adapter.ts:1315`), then calls `aesCtrDecrypt()` (`adapter.ts:1283`) — a real **WebCrypto `subtle.decrypt({name:'AES-CTR', counter, length:64})`** with the key imported via `importKey('raw', …, {name:'AES-CTR'})`. The cleared bytes are written into MEMFS and ffmpeg.wasm performs a `-c copy` stream-copy with `-movflags +faststart` into a clean MP4 (`adapter.ts:2138`–`2156`). This matches the engine's declared capability surface (`encryption: ['cenc-ctr','hls-aes128']`, feature `webcrypto:cenc-ctr-clear-output`, `adapter.ts:1508`).

Correctness gates the number (scenario `notes`, `src/scenarios/encryption/performance.ts:11`): the runner benches only after `decrypt-bitexact` is green. That oracle (`src/core/oracles.ts:2537`) decodes the engine's decrypted MP4 with the platform decoder and compares each RGBA frame's sha256 against the **offline cleartext golden** selected by `cleartextAsset: 'cenc_ctr_clear.mp4'` (`performance.ts:27`; oracle asset resolution at `oracles.ts:2562`–`2569`). The golden `fixtures/golden/cenc_ctr_clear.mp4.frames.json` is a real browser-baked set of 12 frame digests (`pending:false`, has `bakedBy`/`bakedAtIso`, sha256 e.g. frame 0 `f3b50c8e…594d68`). The shard measurement `{measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0}` means every decoded frame of the de-protected stream matched the independently-produced cleartext reference — i.e. the AES-CTR key/IV/subsample handling is correct to the pixel. Only after that pass does the runner divide golden duration 5.021 s by measured wall 39.03 ms to derive 128.63 x-realtime. The key is sourced from the golden-key mirror (`decryptKeyFor('cenc_ctr')`, keyHex `00112233…eeff`, KID `11223344…eeff`), verbatim from `fixtures/golden/cenc_ctr.mp4.keys.json`, so the oracle compares against media decrypted with the very key that produced the golden (`src/scenarios/encryption/_shared.ts`).

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE: "engine does not declare feature 'webcrypto:cenc-ctr-clear-output'". It DOES implement a cenc-ctr/cbcs decrypt path (`src/engines/mediabunny/adapter.ts:1608`) and declares `encryption: ['cenc-ctr','cenc-cbcs','hls-aes128']`, but the feature is **deliberately withheld** (`adapter.ts:1089`): a real browser run showed mediabunny@1.48.0 WASM-aborts ("Assertion failed.") on this exact `cenc_ctr.mp4` fixture, on both decrypt and plain probe, while it handles `cenc_cbcs.mp4` fine. The NA is HONEST — declaring it would surface as ERROR, not PASS.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: EME exposes protected playback only, not decrypted byte/frame export (`src/engines/platform/adapter.ts:19`). No under-declaration.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: mp4box is a parser/muxer with no decode/decrypt surface (`src/engines/mp4box/adapter.ts:12`). It can report protected-track metadata without decrypting, but cannot clear samples.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: encrypted samples pass through unchanged; `decrypt()` throws "not supported" (`src/engines/remotion-media-parser/adapter.ts:582`).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: no decryption surface; `decrypt()` throws "no decryption surface" (`src/engines/web-demuxer/adapter.ts:1068`).
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: decrypt is intentionally left undeclared (`src/engines/remotion-webcodecs/adapter.ts:7`).

## Anti-cheat validation

- **Scenario:** `src/scenarios/encryption/performance.ts:24` (id `encryption/perf_cenc_ctr_decrypt_throughput`), op `decrypt`, input `cenc_ctr.mp4`, gate `oracles: ['decrypt-bitexact']`, primaryMetric `throughputRealtime`.
- **Fixture exists:** `fixtures/media/cenc_ctr.mp4` present, 2.2 MB (real CENC-CTR MP4; meta confirms H.264+AAC, 5.021 s). Cleartext golden target `fixtures/media/cenc_ctr_clear.mp4` (2.2 MB) and its baked frame golden `fixtures/golden/cenc_ctr_clear.mp4.frames.json` (12 real digests, `pending:false`) both present. Not synthetic/mock.
- **Oracle:** `src/core/oracles.ts:2537` (`decryptBitexact`). Performs a REAL comparison: decodes the engine's decrypted output in-browser and sha256-compares 12 frames against the independently-baked cleartext golden; FAILs if the golden is absent/pending (`oracles.ts:2542`). Measurements `{12,12,12,0}` are physically plausible for 5 s of 30 fps sampled video. Not trivially satisfiable — note the related `cenc_ctr.mp4.frames.json` is `pending` and would FAIL; the scenario correctly routes to the populated `cenc_ctr_clear.mp4` golden instead.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2073` → `:1349` → `:1297` → `:1283`. Genuine box-tree parsing + WebCrypto AES-CTR + ffmpeg `-c copy` faststart remux. No canned output, no input→output copy to fake a transcode, no short-circuit to the golden file, no swallowed errors (failures rethrow; the only swallow is the documented "no protected tracks" clear-MP4 no-op path at `:2130`, which does not apply here).
- **Verdict:** **REAL** — real fixture, real WebCrypto+ffmpeg implementation, meaningful bit-exact crypto oracle gating the perf number.
- **Cached note:** the winner's result has `cached:true` ("cached previous PASS result"), so this PASS was reused rather than re-run in this pass. The frame-exact evidence and metrics are from a prior run; staleness risk is low (deterministic decrypt + committed golden) but the wall/throughput numbers reflect that earlier execution.

## Confidence & caveats

- **Confidence: high.** Single unambiguous PASS, sound bit-exact oracle, genuine implementation verified at file:line, fixture and golden present.
- **Caveats:** (1) `cached:true` — perf numbers (39.03 ms / 128.63 x-realtime) are from a prior run, not freshly measured here. (2) Performance samples are thin: `n=1` for wall/throughput/longtasks (mad=0, p95==median), so the throughput figure is a single observation, not a distribution. (3) `peakMemory` is unsampled (`n=0`, reported 0 bytes) and must not be read as "zero memory". (4) The 4924 ms `longtasks` value reflects ffmpeg.wasm module init/decrypt main-thread blocking and dwarfs the 39 ms decrypt wall — a real responsiveness cost for this single-thread wasm path, even though it does not affect the ranked throughput metric. (5) Uncontested by construction: six engines are NA, so there is no competitive margin to report.
