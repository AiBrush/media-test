# encryption/cenc_ctr_decrypt

- family: encryption
- fixture asset(s): `fixtures/media/cenc_ctr.mp4` (protected input, 2.2 MB) + `fixtures/media/cenc_ctr_clear.mp4` (cleartext frame golden source, 2.2 MB); key/KID from `fixtures/golden/cenc_ctr.mp4.keys.json`
- primaryMetric: wall (ms) — but this is a correctness case (decrypt-bitexact gate); perf is secondary
- passCount: 1 / 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Contested: **NO** — uncontested. Exactly one engine reached status=PASS; the other six are NA_ENGINE (capability not declared), so they were never eligible to win.
- Decisive factor: ffmpeg.wasm is the only engine in the battery that declares the `decrypt` operation AND the gating feature `webcrypto:cenc-ctr-clear-output`, and it actually produced a de-protected MP4 whose decoded frames are **bit-exact (12/12 frames, 0 mismatches)** against the offline cleartext golden.
- Margin over runner-up: not applicable — there is no second PASS to compare against. All competitors stopped at capability negotiation (NA_ENGINE), not at a slower or weaker pass.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | decrypt-bitexact:true, reference-reimport:true, playback-smoke:true | 30.345 ms | 165.46 x-realtime | 94,969,678 B (~90.6 MB) | 1192 ms | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'webcrypto:cenc-ctr-clear-output' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

## Why the winner wins (deep technical)

The operation is a CENC AES-CTR full-sample decrypt of an H.264+AAC MP4 (`cenc-ctr` scheme, container `mp4`; see scenario `src/scenarios/encryption/index.ts:60-77`). The scenario gates on `webcrypto:cenc-ctr-clear-output`, encoding the explicit requirement that an engine must not merely *recognize* CENC track metadata (`encv`/`enca` sample entries, `tenc`, `senc`) — it must clear the encrypted sample bytes and emit a re-parseable de-protected container. Only one of the seven adapters declares both the `decrypt` operation and that feature.

ffmpeg.wasm does not delegate this to libavformat's CENC path; it implements the clearing itself in JavaScript using the browser's WebCrypto SubtleCrypto AES-CTR primitive. The core decryptor `decryptCencCtrMp4` (`src/engines/ffmpeg-wasm/adapter.ts:1349`) walks the ISO-BMFF box tree, locates each protected `trak`, reads `stsd` -> `sinf` -> `frma`/`schm`/`schi`/`tenc` (`adapter.ts:1356-1367`), verifies the scheme is literally `cenc` (`adapter.ts:1364`) and that the `tenc` KID matches the expected KID from the golden keys (`adapter.ts:1368-1370`) — i.e. it cross-checks `11223344556677889900aabbccddeeff` against the box, so a wrong key cannot silently "pass". It then rebuilds the sample byte map from `stsz` + `stco`/`co64` + `stsc` (`adapter.ts:1372-1381`) and the per-sample IVs from `senc` (`adapter.ts:1382-1387`), and for every sample decrypts via `decryptCencSample` -> `aesCtrDecrypt` (`adapter.ts:1297`, `adapter.ts:1283`). The AES-CTR call seeds a 16-byte counter from the per-sample IV and calls `subtle.decrypt({name:'AES-CTR', counter, length:64}, ...)` (`adapter.ts:1286-1294`). For subsample (partial) encryption it concatenates the encrypted NAL ranges with 16-byte block padding between subsamples to match FFmpeg's cenc-aes-ctr muxer counter advancement (`adapter.ts:1307-1346`) — a non-trivial, scheme-correct detail that proves a real implementation rather than a copy-through. Finally it rewrites each protected sample entry's 4CC back to the original `frma` codec (`encv`->`avc1`) so the output is a clean unprotected MP4 (`adapter.ts:1396`), and throws if no protected track was found (`adapter.ts:1400`).

The oracle evidence is strong and physically plausible. `decrypt-bitexact` (`src/core/oracles.ts:2537`) decodes the engine's de-protected output with the platform decoder and compares frame digests against the golden frames decoded from the independent cleartext fixture `cenc_ctr_clear.mp4` (`oracles.ts:2540-2557`): the shard reports `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` — every compared frame is bit-exact, which is only possible if the AES-CTR clearing was correct down to the byte. The secondary `reference-reimport` oracle re-parsed the output and found `386 packets, 239 keyframes`, confirming the result is a structurally valid, re-demuxable container (not a corrupt blob), and `playback-smoke` confirmed `<video>` rendered frames from it. Backend: this is single-thread ffmpeg.wasm (software), but the actual cryptographic work runs on WebCrypto, not the wasm core, which is why the wall median is a fast **30.345 ms** at **165.46x realtime** with ~90.6 MB peak memory (n=1, mad=0, single sample — see caveats).

## What each other framework did wrong

- **mediabunny@1.48.0** — NA_ENGINE, "engine does not declare feature 'webcrypto:cenc-ctr-clear-output'". This is the most interesting NA: mediabunny *does* declare encryption schemes (`cenc-ctr`/`cenc-cbcs` per the scenario header note), but it does not declare the clear-sample-output feature this case requires, so negotiation correctly routed it NA. The scenario header (`index.ts:36-46`) documents this as an honest adapter-vs-dossier reconciliation gap, not a silent omission. Honest NA.
- **platform@chrome-149** — NA_ENGINE, "engine does not declare operation 'decrypt'". The browser's WebCodecs/MSE path does not expose a standalone CENC-clearing decrypt primitive (EME decrypts inside a CDM, not to clear output). Honest NA.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare operation 'decrypt'". MP4Box.js parses `sinf`/`tenc` metadata but is a demuxer/parser, not a decryptor; it cannot clear sample bytes. Honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE, "engine does not declare operation 'decrypt'". A parser only; no decrypt capability. Honest NA.
- **remotion-webcodecs@4.0.479** — NA_ENGINE, "engine does not declare operation 'decrypt'". WebCodecs wrapper; no CENC clearing primitive. Honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE, "engine does not declare operation 'decrypt'". Demux-only wasm; no decrypt. Honest NA.

All six NAs look genuine: none of these libraries exposes an offline CENC-clearing primitive, so declaring `decrypt` would be a false capability. There is no under-declaration to penalize here.

## Anti-cheat validation

- Scenario definition: `src/scenarios/encryption/index.ts:60-77` (case `cenc_ctr_decrypt`), built via `buildDecryptAll` in `src/scenarios/encryption/_shared.ts`.
- Fixture: input `fixtures/media/cenc_ctr.mp4` exists (2.2 MB, real protected MP4) and frame golden source `fixtures/media/cenc_ctr_clear.mp4` exists (2.2 MB); key ground truth `fixtures/golden/cenc_ctr.mp4.keys.json` exists (keyHex `00112233445566778899aabbccddeeff`, kid `11223344556677889900aabbccddeeff`, scheme `cenc-ctr`). No synthetic/empty/mock input.
- Winner adapter: real implementation — `decryptCencCtrMp4` (`src/engines/ffmpeg-wasm/adapter.ts:1349`) parses the ISO box tree and calls WebCrypto `subtle.decrypt` AES-CTR (`adapter.ts:1283-1294`). It does NOT copy input->output (it byte-rewrites each sample in place), does NOT short-circuit to the golden (the golden is a separate cleartext asset never read by the adapter), validates KID (`adapter.ts:1368`) and scheme (`adapter.ts:1364`), and throws if no protected track is decrypted (`adapter.ts:1400`) — it cannot fake success on an unprotected/empty file.
- Gating oracle: `decryptBitexact` (`src/core/oracles.ts:2537`) decodes the output and does a per-frame digest comparison against goldens decoded from `cenc_ctr_clear.mp4` (`oracles.ts:2540-2557`) — a real bit-exact comparison, not a wide tolerance and not smoke-only. Measurements (12/12 frames, 0 mismatches; reimport 386 packets/239 keyframes) are plausible for a short real H.264 clip.
- Verdict: **REAL**. Real fixture + genuine WebCrypto-backed CENC-CTR implementation + a strict bit-exact decode oracle backed by independent cleartext goldens, plus structural reimport and playback secondaries.
- Cached note: ffmpeg.wasm's result has `cached:true` ("cached previous PASS result"). The PASS evidence and oracle measurements were reused from a prior run rather than re-executed this run. The correctness conclusion is unaffected (the inputs/adapter/oracle are unchanged), but the bench numbers (n=1, mad=0) are a single stale sample — treat the timing as indicative, not freshly measured.

## Confidence & caveats

- Confidence: **high** for the winner selection — it is the only eligible PASS and the gate is a strict, sound bit-exact oracle against independent goldens.
- Caveat (cached): the winning row is cached, so timing is stale single-sample (n=1, mad=0, p95==median). No throughput/memory comparison is possible because there is no runner-up.
- Caveat (uncontested): "best of 7" overstates competition — six engines never attempted the op. The result proves ffmpeg.wasm is the *only* engine in this suite that can offline-clear CENC-CTR, not that it beat rivals on a level field.
- Caveat (cbcs sibling): pattern (`cbcs`) encryption is explicitly unsupported by this adapter (`adapter.ts:1304-1306`) and the cbcs case is NA(asset-missing); this verdict is scoped to full-sample AES-CTR only.
