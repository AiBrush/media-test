# encryption/unencrypted_left_untouched_noop

- Family: encryption
- Fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 video + AAC audio in a plain/unencrypted MP4)
- primaryMetric: wall
- passCount: 2 of 7 (mediabunny@1.48.0, ffmpeg.wasm@0.12.15)

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15**
- Status: **CONTESTED** (2 engines PASS: ffmpeg-wasm and mediabunny).
- Decisive factor: **correctness fidelity + wall-clock speed**. Both engines decode the no-op output bit-exact (12/12 golden frame digests, 0 mismatches). On the structural `reference-reimport` gate ffmpeg.wasm re-imports **2308 packets / 1423 keyframes — an EXACT match to the golden source** (`fixtures/golden/h264_1080p_30s.mp4.packets.json`: 2308 packets, 1423 keyframes), whereas mediabunny drifts to **2310 packets / 1425 keyframes** (+2 packets / +2 keyframes; it only passes because the oracle's 2% relative band absorbs the drift). ffmpeg.wasm is also faster on the primary metric.
- Margin over runner-up: wall median **274.41 ms vs 384.08 ms = 1.40x faster** (0.71x of mediabunny's wall). Structural fidelity: ffmpeg drift = 0 packets vs mediabunny drift = +2 packets. Counter-metric: mediabunny has **lower main-thread longtasks (3675 ms vs 5449 ms; ffmpeg blocks 1.48x more)**. Both samples are n==1 and cached, so the timing margin is weak evidence; the fidelity margin (exact vs drifted reimport) is the durable tiebreaker.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:✓ reference-reimport:✓ playback-smoke:✓ | 274.41 ms | n/a | 0 (not sampled) | 5449 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:✓ reference-reimport:✓ playback-smoke:✓ | 384.08 ms | n/a | 0 (not sampled) | 3675 ms | cached previous PASS result |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

Notes: `peakMemory` has n==0 samples for both PASS engines (the metric was not captured this run), so it cannot break the tie. `throughputRealtime` is not part of this scenario's `metrics` set (`['wall','peakMemory','longtasks']`, metamorphic.ts:142).

## Why the winner wins (deep technical)

This is the §A.16 "leave-unencrypted-untouched" metamorphic no-op: the operation is `decrypt`, but the input `h264_1080p_30s.mp4` is a **clear, unprotected MP4** (no `pssh`/`tenc`/`senc`/`sinf` boxes, no `schm`). A correct `decrypt()` must therefore detect that there is nothing to decrypt and reproduce the source media intact — `decode(decrypt(clear)) == decode(clear)`, the decrypt analogue of `decode(remux(x)) == decode(x)`.

ffmpeg.wasm's adapter (`src/engines/ffmpeg-wasm/adapter.ts:2073` `decrypt`) handles the no-op explicitly and honestly. It first attempts a real CENC-CTR parse via `decryptCencCtrMp4()` (adapter.ts:1349), which walks the moov, requires a `schm` with scheme `'cenc'` and a protected `tenc` (adapter.ts:1363, 1148). On this clear fixture that scan finds no protected tracks and throws `CENC decrypt found no protected tracks` (adapter.ts:1400). The adapter catches **only that specific message** (adapter.ts:2130) and falls back to `clearBytes = encryptedBytes` (adapter.ts:2134) — i.e., it does not fake a decrypt; it recognizes the input is already cleartext. It then runs a genuine ffmpeg stream-copy remux: `-map 0 -c copy -tag:v avc1 -tag:a mp4a -movflags +faststart` (adapter.ts:2138-2153). Because it is a pure container stream-copy (no re-encode, no resample), the emitted elementary streams are byte-preserved, so the platform decode of the output yields the identical 12 frame SHA-256 digests as the golden (`measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0`, compared bit-exact by `compareDigests` at oracles.ts:1190 via strict `normHex` SHA-256 equality). The faststart remux preserves the exact sample table, so the reference engine re-demuxes **2308 packets / 1423 keyframes** — identical to the golden packet table — satisfying `reference-reimport` with zero divergence (oracles.ts:1258-1262 band check passes trivially). `playback-smoke` confirms a real `<video>` element decoded a few frames of the output. Backend per `env.configUsed`: ffmpeg-wasm runs single-thread wasm (no SharedArrayBuffer / COOP-COEP), and still completed in 274.41 ms wall.

mediabunny (`src/engines/mediabunny/adapter.ts:1608` `decrypt`) also passes all three oracles bit-exact, but takes a structurally heavier path even for a clear input: it always opens the input through `mb.Input` with a `resolveKeyId` callback (adapter.ts:1639) and runs a **full mediabunny conversion/remux** (`runConversion`, adapter.ts:1648) rather than a stream-copy. There is no clear-input short-circuit; the conversion re-authors the container. That re-authoring is what produces the +2 packet / +2 keyframe drift on reimport (2310 / 1425 vs golden 2308 / 1423) — small, almost certainly an edit-list / priming-sample / final-fragment boundary artifact, and well inside the oracle's 2% relative tolerance, but it means mediabunny's output is **not** a faithful byte-preserving copy of the clear source the way ffmpeg's `-c copy` is. For a "leave-untouched" no-op, fewer mutations is the more correct behaviour. mediabunny's WebCodecs/hardware backend (`backend:webcodecs, hwAccel:prefer-hardware, pipeline:streaming-lockstep`) gives it the lower longtasks figure (3675 ms vs 5449 ms — less synchronous main-thread blocking), but it is 1.40x slower on wall and produces the drifted reimport, so it loses the head-to-head.

The two timing samples are each n==1 with `cached:true` (mad==0, single sample), so the 1.40x wall margin is suggestive rather than statistically robust. The fidelity ranking (exact vs drifted structural reimport, both bit-exact on pixels) is the decisive, deterministic factor.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, runner-up): correct (bit-exact 12/12 frames) but loses on two axes — 1.40x slower wall (384.08 ms vs 274.41 ms) and a non-byte-faithful no-op: its always-on `runConversion` remux (adapter.ts:1648) re-authored the container, yielding reimport 2310 packets / 1425 keyframes vs the golden's exact 2308 / 1423. It only edges ahead on longtasks (3675 vs 5449 ms).
- **remotion-webcodecs@4.0.479**: NA_ENGINE — "engine does not declare operation 'decrypt'". Honest NA: this is a transcode/encode-oriented WebCodecs wrapper with no encryption capability declared.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare operation 'decrypt'". Honest NA: a demux-only libav wasm binding; no decrypt path.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare operation 'decrypt'". Honest NA: mp4box parses CENC metadata boxes but does not perform sample decryption.
- **platform@chrome-149**: NA_ENGINE — "engine does not declare operation 'decrypt'". Honest NA: raw WebCodecs/Media Source has no standalone container-decrypt-to-file primitive (EME decrypts only inside a protected playback pipeline, not as a file transform).
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'decrypt'". Honest NA: a parser, not a decryptor.

All five NAs are honest under-declaration of a genuinely-absent capability, not hidden capability. Notably, even mediabunny deliberately does NOT declare `webcrypto:cenc-ctr-clear-output` (adapter.ts:1089-1096) because its clear-output decrypt path is unreliable on the CENC-CTR fixture; here the no-op case has no such feature requirement, so both decrypt-capable engines legitimately contest.

## Anti-cheat validation

- Scenario definition: `src/scenarios/encryption/metamorphic.ts:101` (`id: 'unencrypted_left_untouched_noop'`), built into a full Scenario at metamorphic.ts:119-145. op=`decrypt`, oracles default to `['property-invariant','reference-reimport','playback-smoke']` (metamorphic.ts:141).
- Fixture: `asset: 'h264_1080p_30s.mp4'` → `fixtures/media/h264_1080p_30s.mp4` EXISTS, 31 MB real H.264/AAC MP4. Not synthetic/empty. The scenario `notes` (metamorphic.ts:108-115) candidly document that a TRUE byte-identity oracle (output bytes === input bytes) is NOT expressible in the frozen runner, so the strongest available browser-pure no-op gate is frame-digest invariant + reference-reimport + smoke. This is a disclosed core-level limitation, not a cheat.
- Oracle implementations: `property-invariant`/decode-cleartext-baseline at `src/core/oracles.ts:2645` → frame-digest branch at oracles.ts:2686-2707, performing strict per-frame SHA-256 equality via `compareDigests` (oracles.ts:1166-1207, `normHex` exact compare at line 1190). `reference-reimport` at oracles.ts:1225 demuxes the engine output with the reference engine and compares packet/keyframe counts to golden within 2% (oracles.ts:1258-1262). Measurements are physically plausible: 12 decoded frames, 2308 demuxed packets, 1423 keyframes for a 30 s 1080p clip match the golden tables exactly. Not trivially satisfiable: a faked/empty output would fail the empty-packet-table guard (oracles.ts:1249) and the bit-exact frame compare.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2073` (`decrypt`); real CENC parse `decryptCencCtrMp4` at adapter.ts:1349; honest clear-input fallback at adapter.ts:2128-2134; genuine ffmpeg `-c copy` stream-copy remux at adapter.ts:2138-2156. No canned output, no golden short-circuit, no error-swallow-as-success (it catches only the specific "no protected tracks" message and re-throws anything else, adapter.ts:2130-2131).
- cached: BOTH PASS results have `cached:true` ("cached previous PASS result"). Staleness risk: the timing numbers (wall/longtasks) were reused from a prior run, not re-measured this run, which further weakens the timing margin. The correctness measurements (frame digests, packet counts) are deterministic and reproducible, so the fidelity verdict is unaffected.
- Verdict: **REAL** — real 31 MB H.264/AAC fixture, real ffmpeg.wasm stream-copy decrypt-no-op implementation, and a meaningful gating oracle (strict bit-exact frame-digest compare + structural reimport vs golden). The win is genuine; only the speed margin is soft (cached n==1).

## Confidence & caveats

- Confidence: **high** on the winner and the REAL verdict; the fidelity gap (exact vs drifted reimport, both bit-exact on pixels) is deterministic.
- Caveat 1: timing is weak evidence — n==1, mad==0, and both results are `cached:true`, so the 1.40x wall margin could shift on a fresh run.
- Caveat 2: mediabunny wins the longtasks counter-metric (3675 vs 5449 ms); a consumer optimizing for main-thread responsiveness over wall time could reasonably prefer it. The decision here weights primaryMetric (wall) + no-op fidelity, where ffmpeg leads.
- Caveat 3: `peakMemory` was not sampled (n==0) for either engine, so the memory tiebreaker is unavailable.
- Caveat 4: per the scenario notes, no oracle compares output bytes to input bytes, so "no-op" is verified at the decode + structural level, not at true byte identity; both engines technically re-mux the container rather than returning the input untouched.
