# encryption/cenc_ctr_truncated_mdat_graceful

family: encryption | fixture asset: `cenc_ctr_truncated_mdat.mp4` (1.3 MB, real CENC-CTR ISOBMFF truncated to ~60% of the 2.2 MB `cenc_ctr.mp4` source) | primaryMetric: wall (metrics declared: wall, peakMemory) | passCount: 2 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS: mediabunny and ffmpeg.wasm).
- Both winners satisfy the single gating oracle `graceful-failure` identically (a malformed/truncated CENC file must be rejected with a clean throw, no crash/hang/OOM, and no output produced). Correctness strength is therefore a tie: same oracle, same `pass=true`, same "produced no output and did not crash/hang" detail.
- Decisive factor: **PERFORMANCE / robustness latency** at the tiebreak stage. mediabunny rejected the truncated fixture in `durationMs=17` vs ffmpeg.wasm's `durationMs=134` — a ~**7.9x faster** clean rejection. mediabunny additionally wins the qualitative tiebreakers: native streaming ISOBMFF reader, WebCodecs backend, `coopCoep: not-required`, `sharedArrayBuffer: false`, no wasm module load on the failure path.
- Margin over runner-up: 17 ms vs 134 ms wall (~7.9x). Note: both entries are `cached:true` and neither carries a populated `bench{}` block, so the latency margin rests on `durationMs` single-shot values (n effectively 1) — weaker evidence than a benched median; recorded as a soft tiebreak, not a hard perf win.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs 17) | n/a | n/a | n/a | cached: graceful: offset is out of bounds |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs 134) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: CENC decrypt found empty stsc |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decrypt' |

No engine recorded a `bench{}` block for this scenario (graceful-failure paths are short-circuit throws; the runner stores only `durationMs`). All numbers above are the literal shard values.

## Why the winner wins (deep technical)

The operation is `decrypt` on a CENC-CTR (AES-128 counter mode) protected, non-fragmented MP4 carrying H.264 video and AAC audio. The fixture `cenc_ctr_truncated_mdat.mp4` is the golden `cenc_ctr.mp4` cut to ~60% of its length: the `mdat` is severed mid-fragment while the surviving `moov` protection boxes (`tenc`, `senc`, `saiz`, `saio`) still promise more encrypted bytes than the file physically contains. The scenario (src/scenarios/encryption/robustness.ts:70-80) gates purely on `graceful-failure`: any engine that reads the `saiz`/`saio` byte offsets and trusts them must avoid an out-of-bounds read and instead reject cleanly.

mediabunny (env.configUsed: `backend: webcodecs`, `pipeline: streaming-lockstep`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`) decrypts at ISOBMFF read time by supplying the key through `resolveKeyId` (src/engines/mediabunny/adapter.ts:1628-1648). It opens the buffer with `mb.Input({ source: new mb.BufferSource(buffer), formats: mb.ALL_FORMATS, formatOptions: { isobmff: { resolveKeyId: () => keyBytes } } })` and streams samples through `runConversion`. Because the sample table / sample-aux-info offsets point past the truncated `mdat`, mediabunny's native reader detects the byte-range overrun and throws — recorded as `graceful: offset is out of bounds`. The throw is caught by the runner, no output is produced, and the oracle infers PASS via the output-presence branch (src/core/oracles.ts:2607-2609). Crucially this happens in 17 ms: the pure-TS reader fails fast on the bounds check before any WebCodecs decode or re-mux work, and no wasm core has to be instantiated.

ffmpeg.wasm (env.engineId `ffmpeg-wasm`) also PASSes the same oracle, but via a different, hand-rolled CENC path. Its adapter parses the ISOBMFF boxes itself (WebCrypto AES-CTR clears samples, then ffmpeg.wasm stream-copies the clear MP4 — see header note src/engines/ffmpeg-wasm/adapter.ts:21-22). On this truncated file its sample-table walk reaches the `stsc` parse and finds no usable chunk entries, throwing `CENC decrypt found empty stsc` at src/engines/ffmpeg-wasm/adapter.ts:1185 (`if (entries.length === 0) throw ...`). That is an equally clean, equally graceful rejection — but it costs 134 ms, ~7.9x mediabunny's, because the adapter does substantially more eager box parsing (tenc/stsd/stsz/stsc/stco/senc validation, lines 1101-1289) and lives in the wasm-adjacent code path. Same oracle, same verdict, slower clean-fail.

Since the correctness ladder ranks both at the bottom rung — `graceful-failure` is a smoke-grade safety gate, not a bit-exact/structural correctness oracle — neither earns a correctness edge. The decision falls to the perf/qualitative tiebreaker, where mediabunny wins on wall (17 vs 134 ms), on backend (native WebCodecs + pure-TS reader vs wasm), and on deployment friction (`coopCoep: not-required`, no SharedArrayBuffer). That is the decisive factor.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (graceful-failure:true, `CENC decrypt found empty stsc`) but lost the tiebreak: 134 ms vs 17 ms clean-reject latency (~7.9x slower) and a wasm-bound path with heavier eager box parsing. No correctness deficit; purely a performance/footprint gap.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'decrypt'". Honest NA. The platform adapter intentionally exposes WebCodecs decode/encode but not a CENC decrypt op; EME/CENC clear-key decrypt is not a non-EME programmatic capability here.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: does not declare 'decrypt'. Honest — it is a WebCodecs transcode wrapper with no decryptor.
- **remotion-media-parser@4.0.479** — NA_ENGINE: does not declare 'decrypt'. Honest — a parser/probe library, not a decryptor.
- **mp4box@2.3.0** — NA_ENGINE: does not declare 'decrypt'. mp4box.js parses CENC protection metadata (tenc/pssh/senc) but does not perform sample decryption; the NA is honest.
- **web-demuxer@4.0.0** — NA_ENGINE: does not declare 'decrypt'. Honest — demux-only, no key handling.

All five NAs are honest capability declines, not under-declared abilities: none of these libraries ships an AES-CTR CENC sample decryptor, so declining the `decrypt` op is correct rather than a dodge.

## Anti-cheat validation

- Scenario definition: src/scenarios/encryption/robustness.ts:70-80 (case `cenc_ctr_truncated_mdat_graceful`), assembled into a Scenario at lines 83-101 with `op: 'decrypt'`, `oracles: ['graceful-failure']`, `timeoutMs: 15000`.
- Fixture asset: `fixtures/media/cenc_ctr_truncated_mdat.mp4` — EXISTS (1.3 MB, `ISO Media, MP4 Base Media v1`). `xxd` confirms real CENC boxes present: `ftyp/isom`, `moov`, `tenc`, `senc`, `saiz`, and a `mdat` that is truncated mid-stream (file is 1.3 MB vs the 2.2 MB `cenc_ctr.mp4` source ≈ 60%, matching the notes "cut to 60%"). Real, baked, deterministic input — not synthetic/empty/mock.
- Oracle: `gracefulFailure` at src/core/oracles.ts:2586-2623. It is a SAFETY gate, not a correctness gate: it PASSes when the malformed input produced NO output and the op threw within the timeout (lines 2607-2610), and FAILs if the engine returns output for known-malformed input (lines 2614-2617) or if notes contain a bad token (crash/hang/timeout/oom). Both winners hit the no-output branch legitimately because their adapters actually threw.
- Winner adapter: src/engines/mediabunny/adapter.ts:1608-1652. Genuinely implemented — it instantiates `mb.Input` with `resolveKeyId` and runs a real conversion; the throw "offset is out of bounds" comes from mediabunny's native reader detecting the saiz/saio overrun against the truncated mdat. No canned output, no input→output copy, no golden short-circuit, no error swallowing (the throw propagates to the runner, which is exactly what produces the PASS).
- Verdict: **REAL**. Real baked CENC fixture + real decrypt implementation that genuinely fails on the bounds overrun + a meaningful (if smoke-grade) safety oracle that distinguishes a clean reject from a crash/hang or a false success. The only weakness is that `graceful-failure` is the weakest rung of the correctness ladder — it proves robustness, not decrypt correctness — so this is REAL but not a strong correctness win.
- Cached note: both PASS entries are `cached:true` (mediabunny startedAt 2026-06-22T14:07Z, ffmpeg 2026-06-22T13:58Z). The verdicts were reused, not re-run this pass; the latency tiebreak (17 vs 134 ms) is therefore stale single-shot evidence. Staleness risk is low for a deterministic throw-on-truncation path but should be flagged.

## Confidence & caveats

- Confidence: medium. The PASS/NA structure is unambiguous and the winner's code path is verified real. But (1) both winners pass the SAME single smoke-grade oracle, so the "win" is a perf/qualitative tiebreak rather than a correctness superiority; (2) no `bench{}` was recorded — the 7.9x margin is from `durationMs` single-shots (n≈1, no mad/p95), so the magnitude is indicative, not statistically robust; (3) both entries are cached, adding staleness risk. If a re-run benched these, the latency ordering could shift, though mediabunny's fail-fast native bounds check makes a reversal unlikely.
