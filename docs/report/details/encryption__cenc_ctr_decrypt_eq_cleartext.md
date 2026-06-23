# encryption/cenc_ctr_decrypt_eq_cleartext

- **family:** encryption
- **fixture asset(s):** `fixtures/media/cenc_ctr.mp4` (encrypted input, 2.2 MB), compared against golden `fixtures/golden/cenc_ctr_clear.mp4.frames.json` (offline cleartext decode of `cenc_ctr_clear.mp4`, 2.2 MB)
- **primaryMetric:** wall (ms)
- **passCount:** 1 / 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` (engineId `ffmpeg-wasm`).
- **Contested?** No — **uncontested**. It is the only engine with status `PASS`; the other six are `NA_ENGINE`.
- **Decisive factor:** It is the only adapter that declares and genuinely implements the `decrypt` operation for the `cenc-ctr` scheme AND advertises the gating feature `webcrypto:cenc-ctr-clear-output`. It removed CENC-CTR protection and produced a clear MP4 whose decoded pixels are **bit-exact** to the offline cleartext (12/12 frame digests match, 0 mismatches) and which re-imports as a normal clear container (386 packets, 239 keyframes).
- **Margin over runner-up:** N/A — there is no second PASS. Every other engine never ran an oracle (empty `oracleOutcomes`).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass; reference-reimport:pass; playback-smoke:pass | 26.835 ms | n/a (not measured) | 92,315,025 B (~88.0 MiB) | 403 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'webcrypto:cenc-ctr-clear-output' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

Only `wall`, `peakMemory`, `longtasks` are requested by the scenario (`metrics: ['wall','peakMemory','longtasks']`, metamorphic.ts:142); `throughputRealtime` is not collected here.

## Why the winner wins (deep technical)

This scenario is the decrypt analogue of the remux metamorphic property `decode(remux(x)) == decode(x)`: a correct CENC-CTR decryptor must turn the protected H.264/AAC-in-MP4 input into media that decodes to the *same pixels* as the independently-produced offline cleartext twin. The scenario routes the `property-invariant` oracle with the token `decode-cleartext-baseline` (metamorphic.ts:42, options.invariant at metamorphic.ts:130), which `propertyInvariant` matches by substring `includes('decode')` and dispatches to the frame-digest branch (oracles.ts:2686-2707). That branch decodes the engine's *output* with the platform (WebCodecs) engine and compares sha256 RGBA digests against the golden cleartext frames.

ffmpeg.wasm is the lone engine that actually does the cryptography. Despite the engine name, the CENC-CTR path is **not** a libavcodec/wasm call — it is a hand-rolled ISO-BMFF + WebCrypto path inside the adapter. `decrypt()` dispatches on `opts.scheme === 'cenc-ctr'` (adapter.ts:2109), validates a 16-byte hex key (adapter.ts:2117), and calls `decryptCencCtrMp4()` (adapter.ts:2127, defined adapter.ts:1349). That function walks each `trak`, finds the protected sample entry (`encv`/`enca`, adapter.ts:1358), reads the `sinf/frma/schm/schi/tenc` protection boxes, asserts the scheme is literally `'cenc'` (adapter.ts:1364), checks the KID against the golden KID (adapter.ts:1368-1370), then reconstructs the sample table from `stsz/stsc/stco|co64` and the per-sample IVs/subsamples from `senc` (adapter.ts:1372-1387). For every sample it calls `decryptCencSample()` → `aesCtrDecrypt()` (adapter.ts:1283-1295), which imports the raw AES key into `crypto.subtle` and runs `subtle.decrypt({name:'AES-CTR', counter, length:64}, …)` with the 16-byte counter seeded from the sample IV. Crucially it handles CENC subsample (clear/encrypted interleave) layout and pads each encrypted subsample to the next 16-byte AES block (adapter.ts:1315-1322) to match FFmpeg's `cenc-aes-ctr` muxer counter advancement — without this the second NAL of the first IDR would decrypt to garbage. Finally it rewrites the sample-entry FourCC from `encv`/`enca` back to the original `frma` codec (`avc1`/`mp4a`) at adapter.ts:1396, de-signalling protection at the box level.

The oracle measurements confirm this worked correctly on real media:
- **property-invariant[decode-cleartext-baseline]:** `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` — every one of the 12 decoded RGBA frames is sha256-bit-exact to the offline cleartext golden. This is the strongest tier (crypto/bit-exact decode digest), not a perceptual proxy.
- **reference-reimport:** `reimportPackets:386, reimportKeyframes:239` — the de-protected output re-demuxes cleanly through the reference engine. This catches an engine that leaves `sinf/senc` in place but still happens to decode; here the re-import succeeds with a real packet/keyframe table, proving the container is genuinely de-protected (oracles.ts:1225-1271).
- **playback-smoke:** a real `<video>` element played frames of the output.

The golden it is checked against is itself browser-baked: `cenc_ctr_clear.mp4.frames.json` has `pending:false`, `bakedBy:"frame-bake (platform engine)"`, and 12 entries each carrying a concrete sha256 of the normalized RGBA buffer (e.g. frame 0 pts 0 = `f3b50c8e…b594d68`, 1280×720, keyframe). The asset meta confirms real media: H.264 1280×720 @ 29.872 fps + AAC 48 kHz stereo, 5.021 s. Performance is excellent (wall median 26.835 ms, ~88 MiB peak), but performance is moot here because correctness alone decides an uncontested win.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'decrypt'". Honest NA — Remotion's WebCodecs wrapper is a transcode/encode engine, not a CENC decryptor; it has no path to strip CENC and feed WebCodecs clear samples.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'decrypt'". Honest NA. Browser-native decrypt of CENC is only via EME/MSE to a protected media pipeline (not a clear-byte output the oracle can decode and digest); the platform adapter correctly does not claim the op.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare operation 'decrypt'". Honest NA — mp4box.js can *parse* `pssh/tenc/senc` protection metadata but performs no AES, so it cannot produce a clear output. Correctly under-declared rather than faking a decrypt.
- **mediabunny@1.48.0** — `NA_ENGINE`: "engine does not declare feature 'webcrypto:cenc-ctr-clear-output'". Honest NA, and notably *different* gating: mediabunny declares `decrypt` but lacks the specific `webcrypto:cenc-ctr-clear-output` feature the scenario requires (metamorphic.ts:72). This feature gate exists precisely so an engine that can only read protected-track metadata cannot post a false decrypt PASS (scenario notes, metamorphic.ts:76-78). The gate did its job.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'decrypt'". Honest NA — a demuxer only; no crypto.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'decrypt'". Honest NA — a parser only; no crypto.

All six NAs look genuine, not under-declared: producing the gating evidence (bit-exact clear pixels + a de-protected re-importable container) requires actually running AES-CTR over every sample, which none of these libraries do.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/encryption/metamorphic.ts:62-80` (case `cenc_ctr_decrypt_eq_cleartext`); built into a scenario at metamorphic.ts:119-145 with `op:'decrypt'`, `input:'cenc_ctr.mp4'`, `oracles:['property-invariant','reference-reimport','playback-smoke']`.
- **Fixture exists:** `fixtures/media/cenc_ctr.mp4` (2.2 MB) and the cleartext twin `fixtures/media/cenc_ctr_clear.mp4` (2.2 MB) both exist and are real H.264/AAC MP4s (meta: 1280×720 @ 29.872 fps, AAC 48 kHz stereo, 5.021 s). Not synthetic/empty.
- **Golden is real & baked:** `fixtures/golden/cenc_ctr_clear.mp4.frames.json` — `pending:false`, 12 real sha256 RGBA digests, `bakedBy:"frame-bake (platform engine)"`. The leftover `$todo` placeholder string is stale prose; the actual `frames` array is fully populated, so the oracle compares against true cleartext pixels (not a placeholder).
- **Oracle is meaningful:** `propertyInvariant` decode branch at `src/core/oracles.ts:2686-2707` decodes the engine output with the platform decoder and runs `compareDigests` against the golden — a real per-frame sha256 equality check, not a wide tolerance. `reference-reimport` at `src/core/oracles.ts:1225-1271` re-demuxes the output and requires a non-empty packet table. Measurements (12 frames, 0 mismatches; 386 packets / 239 keyframes) are physically plausible for ~5 s of 30 fps H.264 + AAC.
- **Winner adapter is genuine:** `src/engines/ffmpeg-wasm/adapter.ts:2073` (`decrypt`) → :2127 → `decryptCencCtrMp4` :1349 → `decryptCencSample` :1297 → `aesCtrDecrypt` :1283 (real `crypto.subtle.decrypt` AES-CTR). It parses real protection boxes, runs real AES, KID-checks (:1368), pads subsamples to AES block (:1315-1322), and rewrites `encv/enca`→`frma` (:1396). No canned output, no input→output copy, no short-circuit to golden, no error-swallow (failures throw).
- **Cached:** `cached:true` (reason "cached previous PASS result"). The PASS is a reused prior run, not freshly re-executed — minor staleness risk, but the implementation and golden inspected here are current and consistent with the cached measurements.
- **Verdict:** **REAL** — real encrypted fixture, real WebCrypto AES-CTR implementation against parsed CENC boxes, and a strong bit-exact frame-digest oracle plus structural re-import gate.

## Confidence & caveats

- **Confidence: high.** Single uncontested winner; the winning oracle is the strongest tier (crypto/bit-exact), measurements are concrete and plausible, and the adapter code path is genuinely implemented.
- **Caveat (cached):** the winner's result is `cached:true`; numbers were not re-measured this run. Per the launcher seeding caveat, a fully honest fresh run would clear raw + `.browser-cache`.
- **Caveat (no byte-identity / encryptionInfo-null oracle):** per scenario notes (metamorphic.ts:16-33), the strongest structural de-protection assertion ("reference reports encryptionInfo===null on output") is a recorded core-level oracle gap; the current gate proves clear pixels + re-importability but not literal absence of all protection boxes. This does not weaken the PASS but is the ceiling of available evidence.
- **Caveat (stale golden prose):** the golden carries an out-of-date `$todo`/`$note` placeholder warning, while `pending:false` and populated digests show it is actually baked. The text is misleading but the data is correct.
