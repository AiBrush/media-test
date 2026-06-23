# encryption/cenc_ctr_protection_zeroed_graceful

- family: encryption
- fixture asset: `cenc_ctr_protection_zeroed.mp4` (fixtures/media/, 2,209,644 bytes, real baked CENC-CTR MP4)
- primaryMetric: wall (metrics declared: wall, peakMemory)
- passCount: 2 of 7 (mediabunny@1.48.0, ffmpeg.wasm@0.12.15)

## Verdict

Best framework: **mediabunny@1.48.0** — CONTESTED (2 engines PASS).

Decisive factor: correctness strength is identical (both pass the single `graceful-failure` smoke gate — there is no bit-exact / structural oracle in play), so the tie breaks on PERFORMANCE. mediabunny rejected the mangled CENC fragment in `durationMs=24` vs ffmpeg.wasm's `durationMs=147` — **~6.1x faster** to reach the clean throw. Tiebreakers also favor mediabunny: no COOP/COEP requirement (`coopCoep:"not-required"`, `sharedArrayBuffer:false`), pure-TS ESM core (no multi-MB wasm load), vs ffmpeg.wasm's heavyweight wasm runtime.

Both numbers are `cached:true`, single-sample (`n` effectively 1, no `bench{}` block emitted for either engine), so the performance margin is weak evidence in isolation — but the structural advantage (lighter runtime, fail-fast TS parser) corroborates the direction.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 24 ms (durationMs) | n/a | n/a | n/a | cached: graceful: offset is out of bounds |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 147 ms (durationMs) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: CENC decrypt found empty stsc |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

No `bench{}` object is present in the shard for either passing engine; only `durationMs` is recorded (both cached). throughputRealtime/peakMemory/longtasks were not captured for this graceful-failure case.

## Why the winner wins (deep technical)

The input is a real CENC-CTR (AES-128 counter mode) fragmented-style MP4 whose **protection region was deliberately destroyed**: per the scenario notes (robustness.ts:65-68), four 512-byte spans were zeroed inside the CENC fragment, wiping whole `senc` entries and encrypted sample ranges, while the `saiz`/`saio` auxiliary-info offset tables still promise more encrypted bytes than survive. The correct behavior for a decryptor is to refuse — specifically, to detect that the sample table / protection metadata no longer describes valid bytes and throw before reading out of bounds, rather than crash, hang, or emit garbage output. The oracle `graceful-failure` (oracles.ts:2586-2623) PASSes precisely when the operation produced no output and did not crash/hang (the runner caught a clean throw and routed here): `ctx.output`/`metadata`/`demux`/`frames` are all undefined for a robustness scenario whose oracle list includes `graceful-failure` (oracles.ts:2607-2610).

mediabunny (env.configUsed: `backend:"webcodecs"`, `coreBuild:"pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`) drives its decrypt via `resolveKeyId` at ISOBMFF read time (adapter.ts:1608-1652): it builds a `mb.Input` over a `BufferSource`, sets `formatOptions.isobmff.resolveKeyId` to return the CENC key (adapter.ts:1631-1641), and runs a no-transform conversion to MP4 (adapter.ts:1646-1648). Its pure-TS ISOBMFF parser walks the box tree and, when the zeroed `senc`/`saiz` region forces an index past the end of the backing buffer, throws **"offset is out of bounds"** (the recorded reason) immediately on the first invalid array/DataView access. There is no wasm module to instantiate, so the whole reject path completes in `durationMs=24`.

ffmpeg.wasm (adapter.ts:21-22 documents a narrow WebCrypto-then-ffmpeg CENC path) also rejects, but later and more expensively: its hand-written CENC parser validates the sample-table boxes (`stsc`/`stsz`/`stco`/`senc`) before any AES-CTR work (adapter.ts:1101-1259). On the zeroed fixture it reaches the `stsc` validation and finds no chunk-to-sample entries, throwing **"CENC decrypt found empty stsc"** (adapter.ts:1185). This is exactly the defensive guard the scenario targets ("a decryptor trusting saiz/saio offsets must reject, not read OOB") — but reaching it costs `durationMs=147`, ~6.1x mediabunny, consistent with the heavier wasm-backed engine even on a path that short-circuits before AES.

Both reach a correct clean throw; the only separating dimension measured is wall time, where mediabunny's lighter, fail-fast TS parser wins decisively.

## What each other framework did wrong

- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest: the bare WebCodecs/browser platform adapter exposes no standalone CENC decrypt op (EME/MediaKeys is decode-time playback, not a file decrypt op), so it cannot enter this scenario.
- **mp4box@2.3.0** — NA_ENGINE: does not declare 'decrypt'. Honest: mp4box.js parses/segments ISOBMFF (including CENC boxes) but does not perform AES sample decryption.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'decrypt'. Honest: it is a demuxer, no decryption capability.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'decrypt'. Honest: a parser, not a decryptor.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'decrypt'. Honest: WebCodecs transcode wrapper, no CENC decrypt op.

All five NAs are genuine capability gaps (the `requires.operations:['decrypt']` gate in robustness.ts:90 filters anything not declaring decrypt), not under-declarations — only mediabunny and ffmpeg.wasm declare CENC-CTR decrypt (adapter.ts:1031/1045 and 1464/1475 respectively).

## Anti-cheat validation

- Scenario definition: `src/scenarios/encryption/robustness.ts:58-68` (case `cenc_ctr_protection_zeroed_graceful`), routed at robustness.ts:83-101 with `op:'decrypt'`, `oracles:['graceful-failure']`, `timeoutMs:15000`.
- Fixture: `cenc_ctr_protection_zeroed.mp4` EXISTS at fixtures/media/ (2,209,644 bytes) — a real 2.2MB baked file, not synthetic/empty/mock. It is a deterministic product of fixtures/bake.mjs that zeroes four 512-byte spans in the CENC protection region (robustness.ts:20-23, 65-68).
- Oracle: `graceful-failure` at `src/core/oracles.ts:2586-2623`. It is a non-trivial behavioral gate: PASS requires the op to produce NO output (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`) AND not crash/hang; producing output from malformed input FAILs (oracles.ts:2614-2617). The notes-token guard (robustness.ts:14-18) also blocks bad tokens (crash/hang/timeout/oom) in notes. It is, however, a SMOKE-class gate, not a correctness/crypto oracle — it confirms a clean reject but does not verify any decrypted-plaintext bytes.
- Winner adapter: mediabunny `decrypt()` at `src/engines/mediabunny/adapter.ts:1608-1652` genuinely opens the bytes through `mb.Input` with `resolveKeyId` (adapter.ts:1631-1641) and runs a real conversion — no canned output, no input→output copy, no short-circuit to a golden. The recorded throw "offset is out of bounds" is a real parser fault on the zeroed bytes. ffmpeg.wasm's guard at adapter.ts:1185 ("empty stsc") is likewise a real structural check.
- Cached note: BOTH passing entries have `cached:true` (mediabunny startedAtIso 2026-06-22T16:49, ffmpeg.wasm 2026-06-22T14:07). Results were reused, not freshly re-run, so the 24ms/147ms figures carry staleness risk.

Verdict: **WEAK-GATE**. The fixture is real, both implementations genuinely parse and throw, but the only oracle is the smoke-class `graceful-failure` (no plaintext/bit-exact verification). The PASS is real but proves "rejects cleanly," not "decrypts correctly." Not a CHEAT — no fabricated output or unfailable oracle.

## Confidence & caveats

- Confidence: medium. Two genuine PASSes with real adapter code paths and a real fixture; winner direction (mediabunny faster + lighter runtime) is well supported.
- Caveats: (1) The performance margin rests on single, cached `durationMs` values — no `bench{}` block, n≈1, no mad/p95 spread, so the 6.1x ratio is suggestive, not statistically robust. (2) The gating oracle is smoke-only; this scenario does not exercise correct CENC decryption, only graceful rejection. (3) Both engines throw at DIFFERENT structural points (mediabunny: OOB on buffer read; ffmpeg.wasm: empty stsc guard) — both are acceptable "reject cleanly" behaviors. (4) Five engines are honest NA_ENGINE (no decrypt op declared), correctly narrowing the field to the two CENC-capable engines.
