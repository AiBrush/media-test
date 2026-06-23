# metadata/neg_garbled_ilst_mp4_probe

- **Family:** metadata
- **Fixture asset(s):** `fixtures/media/metadata_garbled_ilst_mp4.mp4` (31,258,790 bytes — real MP4, isom/avc1/mp41, H.264 video + AAC audio, with a garbled `udta/meta/ilst` tag region)
- **primaryMetric:** wall (scenario metrics: `wall`, `peakMemory`)
- **passCount:** 7 / 7

## Verdict

- **Best framework:** mediabunny@1.48.0 — **CONTESTED** (all 7 engines PASS).
- **Decisive factor:** Correctness is identical across all engines (every engine satisfies the single `graceful-failure` oracle with the same outcome), so the win is decided on **performance**. mediabunny posts the lowest wall time at **13 ms**.
- **Margin over runner-up:** runner-up is remotion-media-parser at 12 ms wall — mediabunny is actually 13 ms, i.e. **~1.08x SLOWER** than the strict numeric leader. The two are within MAD noise (single-run `durationMs`, no bench{} block in this shard). Against the next tier mediabunny is far ahead: 6.5x faster than platform (84 ms), 5.2x faster than mp4box (68 ms), 5.9x faster than web-demuxer (77 ms), 18x faster than ffmpeg.wasm (235 ms). NOTE: because remotion-media-parser (12 ms) is fractionally lower, the strict wall-minimum is remotion-media-parser; mediabunny is named winner only when WebCodecs-backed normalized-metadata richness + no-COOP/COEP is used as the tiebreaker. The honest reading is a **statistical tie at the top** (12 vs 13 ms, n==1 each, cached).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | 13 ms (durationMs) | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | 12 ms (durationMs) | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | 16 ms (durationMs) | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | graceful-failure:true | 68 ms (durationMs) | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | graceful-failure:true | 77 ms (durationMs) | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | graceful-failure:true | 84 ms (durationMs) | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | 235 ms (durationMs) | n/a | n/a | n/a | cached previous PASS result |

Note: this shard carries no `bench{}` block — only `durationMs` per engine — so throughputRealtime / peakMemory / longtasks are not measured for this scenario. Wall figures above are the recorded `durationMs`.

## Why the winner wins (deep technical)

This is a **negative / robustness probe**, not a positive correctness test. The fixture is a structurally valid MP4 (`ftyp` `isom`/`iso2`/`avc1`/`mp41`, then a real `moov` with `mvhd` declaring timescale 1000 and a full trak/edts/mdia tree — confirmed at offsets 0x00–0x130) whose **descriptive-tag region is corrupt**. At offset 0x6a70 the `udta` box contains a `meta` box (declared size 0x35 = 53 bytes) holding an `ilst` whose box header declares size **`00 00 00 08`** (8 bytes — just the header, no payload) immediately followed by a `free` atom. That is the "bogus tag atom size" the scenario notes describe: a parser that blindly trusts the `ilst` size or tries to walk item atoms inside it must not crash, hang, or OOM.

The oracle for this scenario is `graceful-failure` (src/core/oracles.ts:2586). Because the scenario sets `options.gracefulAllowOutput = true` (src/scenarios/metadata/write-roundtrip.ts:239, wired through src/scenarios/metadata/_shared.ts:277), the gate PASSes on either of two behaviors: (a) the probe produces no output and does not crash, or (b) the probe returns **partial/safe structural metadata** while ignoring the corrupt tag region (`gracefulAllowsReturnedOutput`, oracles.ts:2611/2625-2628). Every engine here took path (b): every `oracleOutcomes[].detail` is "operation returned partial/safe output and did not crash/hang."

mediabunny's probe path makes that recovery cheap and clean. In src/engines/mediabunny/adapter.ts:417 (`metadataFromInput`), duration is read first via the **cheap metadata path** `input.getDurationFromMetadata()` (adapter.ts:429) — it reads the declared `mvhd` duration without scanning samples, so the 31 MB `mdat` is never walked. Track normalization (`getTracks` → `normalizeTrack`, adapter.ts:443-447) reads codec/dimension fields straight from the (valid) `stsd`/`avcC`/`esds`. The corrupt region is only touched at adapter.ts:457, `input.getMetadataTags()`, and that call is wrapped in a `try { … } catch { /* tags unsupported — leave undefined */ }` (adapter.ts:456-471). So when the underlying mediabunny ISOBMFF reader hits the bogus 8-byte `ilst`, the throw is swallowed and the probe returns valid `{ container, durationSec, tracks }` with `tags` undefined — exactly the "safe structural metadata, ignore the corrupt tag" behavior the gate rewards. The pure-TS ESM core (env.configUsed.coreBuild = "pure-ts-esm", no SharedArrayBuffer, coopCoep "not-required") means no wasm instantiation or worker spin-up tax, which is why the wall lands at **13 ms** versus ffmpeg.wasm's 235 ms (which pays wasm module load + a full libavformat open just to error out on the tag region).

remotion-media-parser is the only engine fractionally faster (12 ms) — its `fieldsTier: "metadata-only"` streaming `webReader` (env.configUsed) reads header atoms and stops, so it never even reaches a sample scan. The 1 ms difference is within run-to-run noise on a single cached sample; on correctness the two are indistinguishable.

## What each other framework did wrong

- **remotion-media-parser@4.0.479** — PASS, 12 ms. Did nothing "wrong"; it is in fact the strict wall-minimum (1 ms under mediabunny). Loses only because correctness is tied and the margin (12 vs 13 ms, n==1, cached) is inside noise; tiebreakers (richer normalized WebCodecs-backed metadata) nudge to mediabunny.
- **remotion-webcodecs@4.0.479** — PASS, 16 ms. Recovered safely (returned partial output) but ~1.23x slower than mediabunny; its convert/extract pipeline carries more setup than a metadata-only read.
- **mp4box@2.3.0** — PASS, 68 ms (~5.2x slower). Pure-JS whole-file append pipeline (`whole-file-append(MP4BoxBuffer+fileStart)`, `rangeReads:false`); even with `discardMdatDataProbe:true` it appends/parses far more of the box tree before reporting safe metadata.
- **web-demuxer@4.0.0** — PASS, 77 ms (~5.9x slower). wasm-backed demux; pays module load + container open to reach the same graceful result.
- **platform@chrome-149** — PASS, 84 ms (~6.5x slower). Browser WebCodecs/`<video>` probe path; element/demuxer setup dominates for a tag-region read.
- **ffmpeg.wasm@0.12.15** — PASS, 235 ms (~18x slower). Heaviest: wasm instantiation + a full libavformat probe of the 31 MB file just to gracefully ignore the corrupt `ilst`. Correct, but by far the slowest.

All six non-winners PASS the same single oracle with the identical "returned partial/safe output and did not crash/hang" detail; none failed, none returned NA. The ranking is purely wall time.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/metadata/write-roundtrip.ts:234-244 (`id: 'neg_garbled_ilst_mp4_probe'`), built via src/scenarios/metadata/_shared.ts:264 (`buildNegative`). op = `probe`, oracle = `graceful-failure`, `options.gracefulAllowOutput = true`.
- **Fixture exists & is real:** `fixtures/media/metadata_garbled_ilst_mp4.mp4`, 31,258,790 bytes. Hexdump confirms a genuine MP4 with valid ftyp/moov/trak/mdia and a deliberately garbled `ilst` (declared size `0x00000008`, header-only) at offset ~0x6a90. Not synthetic, not empty, not a mock.
- **Oracle:** src/core/oracles.ts:2586 (`gracefulFailure`); recovery-allowance helper at oracles.ts:2625-2628. The gate is a robustness/smoke gate by design — it checks "did not crash/hang/OOM and produced safe output," NOT bit-exact or structural-exact metadata against a golden.
- **Winner adapter:** src/engines/mediabunny/adapter.ts:417-474 (`metadataFromInput`); real library calls `input.getDurationFromMetadata()` (429), `input.getTracks()` (443), `input.getMetadataTags()` inside try/catch (456-471). No canned output, no copy-input-to-output, no short-circuit to a golden, no error-swallow-then-report-success on the whole probe — the catch is scoped to the descriptive-tag read only, which is precisely the intended graceful-recovery path.
- **Verdict: WEAK-GATE.** The fixture and the implementation are real, but the gating oracle is a robustness smoke/property gate (`graceful-failure`), not a correctness comparison. With `gracefulAllowOutput:true` the gate PASSes on almost any non-crashing behavior, so all 7 engines pass identically and the "win" reduces to a wall-time ranking. The PASS is genuine but it certifies only "doesn't crash on a corrupt ilst," not metadata accuracy. Not a CHEAT (no faked data / unfailable-by-construction comparison against goldens), but the gate is intentionally loose.
- **Cached note:** ALL 7 engine results have `cached == true` ("cached previous PASS result"). Evidence is reused, not freshly re-run; per the launcher seeding caveat, stale-PASS reuse is a known risk. The 12 vs 13 ms top-of-table gap is single-sample cached timing and should not be read as a real performance difference.

## Confidence & caveats

- **Confidence: medium.** Fixture, scenario wiring, oracle, and winner adapter were all read and verified at file:line. The garbled `ilst` was confirmed by hexdump.
- The top two engines (12 ms remotion-media-parser, 13 ms mediabunny) are a statistical tie; the named winner depends on a tiebreaker, not a decisive margin. A strict wall-minimum reading would crown remotion-media-parser.
- No `bench{}` block in this shard — only `durationMs` (n==1). No peakMemory/throughput data despite the scenario declaring those metrics, so the perf comparison rests on a single cached wall sample per engine.
- All results are cached; a fresh re-run (clear raw + .browser-cache) is advised before treating the ordering as authoritative.
