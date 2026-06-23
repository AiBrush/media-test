# robustness/fuzz_encrypted_mp4_ciphertext_decode

- family: robustness
- fixture asset: `fuzz_encrypted_mp4_ciphertext.mp4` (2.2 MB, real CENC/AES-CTR encrypted H.264-in-MP4)
- primaryMetric: wall (metrics declared: `wall`, `peakMemory`)
- passCount: 2 / 7 (mediabunny, ffmpeg.wasm)
- op under test: `decodeFrames` (maxFrames: 30)

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS).
- Decisive factor: correctness is EQUAL (both pass the single `graceful-failure` oracle with identical
  output-absence detail), so the tiebreak falls to performance. mediabunny resolves the verdict at the
  ISOBMFF read layer in **24 ms**; ffmpeg.wasm spins up its wasm pipeline, attempts the decode, and exits
  with code 69 in **290 ms**.
- Margin over runner-up: **~12.1x faster wall** (24 ms vs 290 ms). Both engines correctly produce ZERO
  frames from the mangled CENC ciphertext; the win is purely a wall-time / overhead margin, not a
  correctness gap. Margin is on `durationMs` only (n==1, no per-metric bench block was recorded for
  either engine), so this is weak performance evidence — see caveats.

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 24 ms | n/a | n/a | n/a | cached: graceful — "Encrypted media samples encountered. To decrypt them, please provide a callback for InputOptions.formatOptions.isobmff.resolveKeyId." |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 290 ms | n/a | n/a | n/a | cached: graceful — ffmpeg exited 69, "Output file is empty, nothing was encoded", Conversion failed / Aborted() |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare encryption scheme 'cenc-ctr' (`encryption: []`) |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare encryption scheme 'cenc-ctr' (`encryption: []`) |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare encryption scheme 'cenc-ctr' (`encryption: []`) |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'decodeFrames' |

No `bench{}` block was emitted for either PASS engine; the only timing signal is `durationMs`.
`throughputRealtime`, `peakMemory`, and `longtasks` are absent from the shard for all engines.

## Why the winner wins (deep technical)

The input is a genuinely CENC-encrypted MP4. Box inspection of the fixture confirms the protection
scheme: the video sample entry is `encv` (not `avc1`), wrapping a `sinf` with `frma=avc1`,
`schm=cenc` (version flags `0x00010000`), and a `schi` containing `tenc`. The scenario then "zeroes
spans of the AES-CTR ciphertext" (`src/scenarios/robustness/index.ts:826-829`), so even with a correct
key the decrypted output would be garbage. The contract (`oracles: ['graceful-failure']`,
`src/scenarios/robustness/index.ts:895`) is: the decode path MUST error / emit no frames rather than
hand downstream a buffer of garbage RGBA that a weaker check could mistake for valid output. The runner
drives the verdict purely from output-absence (notes prose is ignored unless a `signal:` marker is
present — `src/core/oracles.ts:2588-2600`).

Both PASS engines satisfy this, but by different mechanisms and at very different cost:

- **mediabunny (winner)** is configured for a `webcodecs` backend with `prefer-hardware`, pure-TS ESM
  core, no SharedArrayBuffer, COOP/COEP not required (`env.configUsed`). Mediabunny declares
  `encryption: ['cenc-ctr','cenc-cbcs','hls-aes128']` (`src/engines/mediabunny/adapter.ts:1045`), so it
  is ELIGIBLE rather than NA. When `decodeFrames` opens the ISOBMFF input, mediabunny detects the
  protected (`encv`/`tenc`) sample entries at read time and, because no
  `InputOptions.formatOptions.isobmff.resolveKeyId` callback was supplied, refuses to read encrypted
  samples — throwing the exact error captured in the reason ("Encrypted media samples encountered. To
  decrypt them, please provide a callback ..."). The runner catches that throw, leaves
  `ctx.output/metadata/demux/frames` all undefined, and `gracefulFailure` returns PASS via the
  "operation produced no output and did not crash/hang" branch (`src/core/oracles.ts:2607-2610`).
  Critically, this happens at the container-parse layer in ~24 ms — no codec is instantiated, no wasm
  pipeline spins up, no ciphertext is run through a cipher. That is the source of the 12x wall margin.

- **ffmpeg.wasm (runner-up)** also PASSes correctly but pays full pipeline cost. Its `decodeFrames`
  path invokes ffmpeg with `-i op1.in -frames:v 30 -vf scale=1280:720:...:bt709 -pix_fmt rgba -f
  rawvideo op1.rgba`. ffmpeg attempts to set up the H.264 decode of the protected/mangled stream and
  produces zero frames: `frame=0 ... Output file is empty, nothing was encoded ... Conversion failed!
  ... Aborted()`, exiting 69. The adapter's log-based guard (the `!/^Input #/` style checks described at
  `src/engines/ffmpeg-wasm/adapter.ts:288-289`) and the empty-output check turn that non-`Input #` /
  empty-`op1.rgba` result into a clean throw, which the runner again routes to a graceful PASS. But
  this required loading and running the wasm module and an actual decode attempt — 290 ms — for the same
  output-absence verdict mediabunny reached at parse time. Same correctness, ~12x the cost.

Because the gating oracle is binary (no frames vs frames) and both engines land on "no frames", the
correctness ladder cannot separate them — neither produces bit-exact/SSIM/structural evidence; this is
a smoke-grade robustness gate by design. The tiebreak is therefore performance, and mediabunny's early
container-layer rejection (rather than ffmpeg's full decode-attempt) is the decisive factor.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost): correct graceful behavior but 290 ms vs mediabunny's 24 ms
  (~12.1x slower wall). It went all the way through wasm init + decode attempt before failing, whereas
  the winner rejected at the demux/read layer. No correctness deficit — purely an overhead loss.
- **platform@chrome-149** (NA_ENGINE): honest NA. Declares `encryption: []`
  (`src/engines/platform/adapter.ts:263`); the scenario `requires.encryption: ['cenc-ctr']`
  (`src/scenarios/robustness/index.ts:824`), so the registry gates it out. WebCodecs/MSE has no
  in-engine CENC decrypt without EME, so this is a genuine capability gap, not an under-declaration.
- **web-demuxer@4.0.0** (NA_ENGINE): honest NA — `encryption: []`
  (`src/engines/web-demuxer/adapter.ts:646`). No CENC support declared.
- **remotion-webcodecs@4.0.479** (NA_ENGINE): honest NA — `encryption: []`
  (`src/engines/remotion-webcodecs/adapter.ts:267`).
- **remotion-media-parser@4.0.479** (NA_ENGINE): does not declare the `decodeFrames` operation at all
  (it is a parser, not a decoder), so it is gated on the op before encryption even matters. Honest.
- **mp4box@2.3.0** (NA_ENGINE): same — does not declare `decodeFrames` (it is a demuxer/parser). Honest
  op-level NA.

## Anti-cheat validation

- Scenario definition: `src/scenarios/robustness/index.ts:817-830` (EXTRA_FUZZ_CASES entry, id
  `fuzz_encrypted_mp4_ciphertext_decode`); mapped to a Scenario at lines 881-900 with
  `oracles: ['graceful-failure']`.
- Fixture: asset field = `fuzz_encrypted_mp4_ciphertext.mp4`. It EXISTS at
  `fixtures/media/fuzz_encrypted_mp4_ciphertext.mp4`, 2.2 MB, and is a REAL CENC/AES-CTR MP4 — box scan
  shows `encv` sample entry with `sinf`/`frma=avc1`/`schm=cenc`/`schi`/`tenc`. Not synthetic, not empty,
  not a mock.
- Oracle: `gracefulFailure` at `src/core/oracles.ts:2586-2623`. It is a REAL (if intentionally
  smoke-grade) gate: for a robustness scenario it requires `!ctx.output && !ctx.metadata && !ctx.demux
  && !ctx.frames` to PASS (line 2608), and explicitly FAILs if the engine produced output from
  malformed input (line 2614-2617). It is not trivially "always-pass": an engine that emitted garbage
  frames would FAIL. Prose in notes is ignored unless a `signal:` marker is present (lines 2588-2600),
  so the PASS came from genuine output-absence, not from the notes wording.
- Winner adapter: mediabunny `decodeFrames` capability + CENC handling —
  `src/engines/mediabunny/adapter.ts:1027` (decodeFrames declared), `:1042-1045` (CENC ctr/cbcs via
  `resolveKeyId` at ISOBMFF read time). The error string in the shard reason is mediabunny's own
  library message, not a canned/hardcoded suite string, confirming the real library was exercised. No
  copy-input-to-output, no short-circuit to a golden, no swallowed error reported as success — the
  throw is what produces the (correct) no-output verdict. The runner-up ffmpeg.wasm path is likewise
  genuine: it runs a real `ffmpeg -i ... -f rawvideo` exec and reports the real exit-69 / empty-output
  log.
- Cached note: BOTH PASS results have `cached: true` (mediabunny startedAt 14:05Z, ffmpeg 16:52Z). The
  evidence is reused, not freshly re-run, so there is staleness risk — per the launcher-seeding caveat,
  stale PASS can be reused; a fresh run that clears raw + .browser-cache would be needed for a fully
  honest re-confirmation. The verdict and durations below are taken as recorded.
- Verdict: **WEAK-GATE**. Real fixture + real implementations on both PASS engines + a real,
  non-trivial oracle — but the oracle is a binary output-absence (graceful-failure) check, i.e. a
  smoke-grade robustness gate, not a correctness/bit-exact gate. The PASS is genuine; it just is not
  strong correctness evidence, and the winner/runner-up are separated only by wall time on cached n==1.

## Confidence & caveats

- Confidence: medium. The winner determination is unambiguous on the recorded numbers (mediabunny 24 ms
  PASS vs ffmpeg 290 ms PASS, identical correctness), and all 5 NA verdicts are demonstrably honest
  (each declares `encryption: []` or lacks `decodeFrames`).
- The performance margin rests on `durationMs` with n==1 and NO `bench{}` block (no median/p95/mad,
  no peakMemory, no throughputRealtime) — so the 12x figure is indicative, not a robust statistic.
- Both PASS results are `cached: true`; a fresh re-run is advisable before treating these timings as
  authoritative.
- The oracle is intentionally smoke-grade (output-absence). It cannot distinguish "rejected at parse"
  (mediabunny) from "attempted decode then failed" (ffmpeg) on correctness — both are equally valid
  graceful outcomes. The ranking therefore hinges entirely on the performance tiebreaker.
- Note (registry honesty): mediabunny's adapter explicitly declines to declare
  `webcrypto:cenc-ctr-clear-output` because the real browser run WASM-aborts on the cenc_ctr clear
  fixture (`src/engines/mediabunny/adapter.ts:1089-1096`). That under-declaration is conservative/honest
  and is unrelated to THIS decode scenario, where mediabunny's read-time rejection is the correct path.
