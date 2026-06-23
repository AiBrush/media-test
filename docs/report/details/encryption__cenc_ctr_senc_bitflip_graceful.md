# encryption/cenc_ctr_senc_bitflip_graceful

- family: encryption
- fixture asset: `cenc_ctr_senc_bitflip.mp4` (fixtures/media/, 2.2 MB, real baked CENC-CTR fragmented MP4 with 96 bit-flips across the moof/mdat senc/saiz/saio + encrypted samples)
- primaryMetric: wall (metrics declared: `wall`, `peakMemory`); shard records only `durationMs` per engine — no `bench{}` block present
- passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Decisive factor: PERFORMANCE. Both passing engines satisfy the identical, sole oracle (`graceful-failure`) at identical strictness — they each threw cleanly on the mangled CENC protection metadata and produced no output. Correctness strength is therefore tied, so the tiebreak falls to wall time.
- Margin over runner-up: mediabunny `durationMs` = 21 ms vs ffmpeg.wasm = 119 ms → **~5.67x faster** to reach the clean rejection. Note: both results are `cached==true`, n is effectively 1 (single durationMs, no median/p95/mad/samples), so this margin is weak statistical evidence — see caveats.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 21 ms (durationMs) | n/a | n/a | n/a | cached: graceful: offset is out of bounds |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 119 ms (durationMs) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm CENC decrypt found empty stsc |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

No `bench{}` object exists in any engine entry for this scenario; the only timing signal is `durationMs`. throughputRealtime / peakMemory / longtasks were not recorded.

## Why the winner wins (deep technical)

The operation under test is `decrypt` on a **CENC-CTR (AES-128 counter mode) protected MP4** whose protection region has been deliberately corrupted: per the scenario notes (robustness.ts:53-55), 96 bit-flips were scattered across the `senc`/`saiz`/`saio` sample-encryption metadata and the encrypted sample bytes in the moof/mdat area. The correct behavior is not to decrypt successfully — it is to detect the corruption and reject cleanly, never emitting output and never crashing/hanging. The `graceful-failure` oracle (oracles.ts:2586-2623) infers PASS when the runner caught a throw and `ctx.output`/`metadata`/`demux`/`frames` are all absent (oracles.ts:2608-2609).

mediabunny's adapter (src/engines/mediabunny/adapter.ts:1608-1652) implements decrypt honestly: for `cenc-ctr` it opens the bytes through `mb.Input` with `formatOptions.isobmff.resolveKeyId` returning the real key (adapter.ts:1631-1642), then runs a no-transform conversion that copies the transparently-decrypted plaintext samples into an MP4 BufferTarget (adapter.ts:1646-1648). On this fixture, mediabunny's ISOBMFF reader walks the corrupted box/offset tables and throws `offset is out of bounds` (shard reason) — the byte offsets promised by the mangled saiz/saio/senc point past valid buffer bounds, so the parser aborts before producing any output. The runner routes that throw to `gracefulFailure`, which sees no output and returns PASS (oracles.ts:2609). It reached this rejection in 21 ms.

ffmpeg.wasm's adapter (src/engines/ffmpeg-wasm/adapter.ts:~1101-1369) implements a far more manual CENC-CTR path: it parses `stsd`/`tenc` (adapter.ts:1101-1152), `stsz`/`stsc`/`stco`/`co64` sample tables (adapter.ts:1171-1232), and `senc` per-sample IVs+subsamples (adapter.ts:1237-1278), then WebCrypto AES-CTR decrypts each subsample (adapter.ts:1285-1297) before stream-copying clear samples through ffmpeg. On the bit-flipped fixture its hand-rolled validation trips at `parseStsc` — `CENC decrypt found empty stsc` (adapter.ts:1185, shard reason) — i.e. the corruption left the sample-to-chunk table with zero entries, and the adapter's explicit guard throws. That is also a clean, defensive rejection (no OOB read, no output), so it likewise PASSes the oracle — but it took 119 ms, ~5.67x mediabunny's time. The extra cost is consistent with ffmpeg.wasm's heavier path: loading/booting the wasm core context and doing manual box-table parsing in JS, versus mediabunny's pure-TS ESM reader (env shows `coreBuild: pure-ts-esm`, `backend: webcodecs`, `coopCoep: not-required`, `sharedArrayBuffer: false`) bailing early during its native ISOBMFF scan.

Because both PASS on the same single oracle at the same (binary) strictness, correctness cannot separate them; mediabunny wins purely on the wall margin, with the secondary tiebreak (no COOP/COEP requirement, no SharedArrayBuffer, lighter pure-TS core vs wasm boot) also favoring it.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (graceful, "empty stsc") but lost on speed: 119 ms vs mediabunny 21 ms (5.67x slower wall). Correctness identical; it is the runner-up, not a failure.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest — Chrome's WebCodecs/Media APIs expose no app-level CENC decrypt-to-clear-bytes primitive (EME decrypts inside a protected pipeline, not into accessible plaintext), so not declaring `decrypt` is correct.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare operation 'decrypt'". Honest — mp4box is a demuxer/box parser; it can read CENC metadata but does not perform AES decryption.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'decrypt'". Honest — a demux-only library, no decrypt capability.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'decrypt'". Honest — a parser, not a decryptor.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "does not declare operation 'decrypt'". Honest — WebCodecs wrapper with no plaintext-CENC decrypt op.

All five NAs look genuine, not under-declared: only mediabunny and ffmpeg.wasm declare a real `decrypt` operation (mediabunny declares `encryption: ['cenc-ctr','cenc-cbcs','hls-aes128']`, adapter.ts:1045), and the other libraries have no decryption layer to under-declare.

## Anti-cheat validation

- Scenario definition: src/scenarios/encryption/robustness.ts:46-56 (case `cenc_ctr_senc_bitflip_graceful`), constructed at robustness.ts:83-101 with `op: 'decrypt'`, `oracles: ['graceful-failure']`, `timeoutMs: 15000`.
- Fixture: `cenc_ctr_senc_bitflip.mp4` exists in fixtures/media/ at 2.2 MB — a real baked CENC-CTR fragmented MP4 (not synthetic/empty/mock). Notes document the corruption: 96 bit-flips across senc/saiz/saio + encrypted samples (robustness.ts:53-55).
- Oracle: oracles.ts:2586-2623 (`gracefulFailure`). It is a robustness gate by design — PASS requires the engine to throw AND produce no output (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`, oracles.ts:2608). It is NOT a correctness gate (no golden/bitexact comparison), so the bar is "reject cleanly," which is the intended property here. There is a notes-token guard so prose words like crash/hang/timeout/oom would force FAIL (oracles.ts:2592-2594) — the scenario notes correctly avoid those substrings.
- Winner adapter: src/engines/mediabunny/adapter.ts:1608-1652 — genuine decrypt via `resolveKeyId` + conversion; not canned, not input→output copy, not a golden short-circuit. It threw `offset is out of bounds` during real ISOBMFF parsing of the corrupted bytes.
- Verdict: **WEAK-GATE**. The implementations and fixture are real (this is not a CHEAT — no faked output, no trivially-unfailable oracle, the throw was a genuine parse abort). However the sole gating oracle is a robustness/negative gate: it only checks "threw + no output," with no positive correctness measurement. A PASS proves graceful rejection, not decryption correctness, and effectively any engine that throws on this input passes — so the gate is loose relative to a correctness oracle. The winner is decided by a soft timing margin (durationMs only) rather than oracle strength.
- Cached note: BOTH passing engines are `cached==true` (mediabunny startedAtIso 2026-06-22T16:48, ffmpeg.wasm 2026-06-22T13:59). Results were reused, not freshly re-run; the 21 ms vs 119 ms timings carry staleness risk and there is no median/p95/mad/samples to assess spread.

## Confidence & caveats

- Confidence: medium. The PASS/NA structure and adapter implementations are unambiguous and the fixture is real. The winner ranking, however, rests on a single cached `durationMs` per engine (no statistical spread) and a negative-only oracle.
- Caveat 1: the decisive metric is `durationMs`, not a proper `bench.wall.median`; n≈1, no mad/p95 — treat the 5.67x margin as indicative, not robust.
- Caveat 2: both winners cached — re-running could shift timings.
- Caveat 3: this gate rewards graceful rejection, not decrypt fidelity. mediabunny's own adapter comments (adapter.ts:1089-1096) note its CENC-CTR clear-output path is NOT a reliable working capability on the clean cenc_ctr fixture, while ffmpeg.wasm decrypts that one correctly — so for actual correct decryption (a different scenario) ffmpeg.wasm is the stronger engine. The win here is narrowly about who rejects malformed input faster.
