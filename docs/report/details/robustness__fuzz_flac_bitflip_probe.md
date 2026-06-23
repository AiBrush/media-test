# robustness/fuzz_flac_bitflip_probe

- Family: robustness
- Fixture asset: `fuzz_flac_bitflip.flac` (143 KB, real `fLaC` magic; FLAC metadata-block bit-flips with bad block sizes)
- primaryMetric: none recorded in shard (metrics requested: `wall`, `peakMemory`; no `bench{}`/`primaryMetric` present — only `durationMs`)
- passCount: 4 of 7 (3 NA_ENGINE)

## Verdict

- Best framework: **remotion-media-parser@4.0.479** (env.engineId `remotion-media-parser@4.0.479`).
- CONTESTED: 4 engines PASS, all satisfying the identical single oracle `graceful-failure`. Correctness strength is therefore tied (one smoke-grade robustness gate, no golden/bit-exact comparison), so ranking falls to performance.
- Decisive factor: lowest wall time. remotion-media-parser completed the probe in `durationMs=8`, vs mediabunny 13, remotion-webcodecs 27, ffmpeg-wasm 153.
- Margin over runner-up (mediabunny, 13 ms): **1.6x faster** (8 vs 13 ms). Against remotion-webcodecs 3.4x, against ffmpeg-wasm 19.1x. Caveat: durations are tiny single observations (cached, n effectively 1, no MAD/p95 in shard) — the margin is weak evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | graceful-failure:true | n/a (durationMs=8) | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs=13) | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | n/a (durationMs=27) | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs=153) | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |
| platform@chrome-149 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |
| web-demuxer@4.0.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'flac' |

Note: the shard carries no `bench{}` block, so `wall median`, `throughputRealtime`, `peakMemory`, and `longtasks` are not populated for any engine; `durationMs` (total adapter run time) is the only timing signal and is shown inline.

## Why the winner wins (deep technical)

The operation is `probe` on a deliberately corrupted FLAC stream. `fuzz_flac_bitflip.flac` begins with a valid `fLaC` magic followed by a STREAMINFO metadata block whose block-size fields have been bit-flipped (the scenario note: "FLAC metadata-block bit-flips (bad block sizes); probe must not loop forever"). The container is native FLAC (no ISO-BMFF/Matroska wrapper); the only codec is FLAC audio. The single gating oracle is `graceful-failure` with `options.gracefulAllowOutput=true` (src/scenarios/robustness/index.ts:311-318), meaning a probe PASSES if it either rejects cleanly OR returns a partial/safe metadata object — the one forbidden outcome is crash/hang/OOM/infinite loop on the mangled block-size field.

remotion-media-parser is purpose-built as a read-only streaming metadata parser. Its `configUsed.backend="cpu-js"`, `fieldsTier="metadata-only"`, `reader="webReader"`, `pipeline="streaming"`, `worker:false` for this row — i.e. it asks `parseMedia` for the fewest, cheapest metadata-tier fields and reads the file lazily through `webReader` rather than buffering. The adapter documents exactly this fast path: "ask for the fewest, fastest metadata-tier fields for probe (the metadata tier)" and declares `probe` + `demux` as its only canonical capabilities, with FLAC listed in both `containersIn` and `audioCodecs` (src/engines/remotion-media-parser/adapter.ts:188-205). Because it only needs the STREAMINFO header tier, it touches the corrupted leading metadata block, detects the inconsistent block size, and stops — yielding `durationMs=8`, the lowest of all engines. It never has to spin up WebCodecs, a WASM core, or a full demux table, which is precisely why it beats the heavier engines on this header-only probe. The oracle outcome recorded is `graceful-failure:true`, detail "operation returned partial/safe output and did not crash/hang" (the `gracefulAllowOutput=true` branch, src/core/oracles.ts:2611-2612).

mediabunny (13 ms) is the closest competitor: a pure-TS ESM reader (`coreBuild="pure-ts-esm"`, `coopCoep="not-required"`) that opens an `Input` over a `BlobSource` restricted to the FLAC format and reads duration via the cheap `getDurationFromMetadata()` first (src/engines/mediabunny/adapter.ts:34, 245-289). It also handles the corruption gracefully but is ~1.6x slower here — consistent with constructing an `Input`/format-detection object graph and codec-probe warm-up versus media-parser's leaner metadata-only request.

remotion-webcodecs (27 ms) routes the probe through its broader WebCodecs-oriented adapter (`backend="webcodecs"`, `pipeline="streaming-backpressure"`); its per-op overhead is higher even though no actual decoding is needed for a probe. ffmpeg-wasm (153 ms) is ~19x slower because it drives the heavy `@ffmpeg/core` WASM `ffmpeg` program to derive metadata (it explicitly does NOT use `_ffprobe`, which is broken in the vendored 0.12.10 core — src/engines/ffmpeg-wasm/adapter.ts:262-267) — a single-threaded WASM round-trip dwarfs a JS header read.

## What each other framework did wrong

- mediabunny@1.48.0: PASS, lost on performance only — 13 ms vs winner 8 ms (1.6x slower wall). Identical oracle coverage; no correctness deficit.
- remotion-webcodecs@4.0.479: PASS, lost on performance — 27 ms (3.4x slower). WebCodecs-oriented pipeline overhead for a header-only probe.
- ffmpeg.wasm@0.12.15: PASS, lost on performance — 153 ms (19.1x slower). Derives probe metadata via the heavyweight single-thread WASM `ffmpeg` program (no working `ffprobe`).
- mp4box@2.3.0: NA_ENGINE — declares `containersIn: ['mp4','mov']` (src/engines/mp4box/adapter.ts:645); no FLAC support. Honest NA (mp4box is an ISO-BMFF-only parser; it genuinely cannot read native FLAC).
- platform@chrome-149: NA_ENGINE — declares `containersIn: ['mp4','mov','webm','mkv','wav']` (src/engines/platform/adapter.ts:240); WebCodecs/MediaSource has no native FLAC-container demuxer here. Honest NA.
- web-demuxer@4.0.0: NA_ENGINE — declares `containersIn: ['mp4','mov','mkv','webm','ts']` (src/engines/web-demuxer/adapter.ts:639); no FLAC. Honest NA.

## Anti-cheat validation

- Scenario definition: src/scenarios/robustness/index.ts:311-318 (`id: 'fuzz_flac_bitflip_probe'`, `asset: 'fuzz_flac_bitflip.flac'`, `op: 'probe'`, `containersIn: ['flac']`, `audioCodecs: ['flac']`, `options.gracefulAllowOutput: true`, oracles `['graceful-failure']`, metrics `['wall','peakMemory']`).
- Fixture: `fixtures/media/fuzz_flac_bitflip.flac` EXISTS — 143 KB, header `66 4c 61 43` (`fLaC`) confirmed via xxd; a real (intentionally bit-flipped) FLAC file, not synthetic/empty/mock.
- Oracle: `graceful-failure` at src/core/oracles.ts:2586-2628. For a robustness scenario with `gracefulAllowOutput=true` it PASSES on a clean reject OR a partial/safe return, and FAILS only if a malformed input yields non-allowed output or the runner reports crash/hang/timeout/oom. This is a SMOKE-grade robustness gate by design (it checks "did not crash/hang/loop"), not a golden/bit-exact comparison — there is no SSIM/PCM/packet comparison to perform on a corrupt-header probe.
- Winner adapter: src/engines/remotion-media-parser/adapter.ts:188-205 (capabilities declare `probe`+`demux`, FLAC in `containersIn`/`audioCodecs`) and the metadata-only `parseMedia` path documented at lines 16-31 and executed at line 335 (`await parseMedia(options)`). Genuine library call to `@remotion/media-parser`; no canned output, no copy-to-golden, no error-swallowing-as-success (the runner routes a thrown reject to the graceful path; output is real partial metadata).
- Verdict: **WEAK-GATE**. Implementation and fixture are real and the PASS is genuine, but the only oracle is a smoke-grade graceful-failure check — it confirms the probe doesn't hang/crash on the bad block size, not that the parsed metadata is correct. A correctness-strength claim cannot be made from this gate.
- Cached note: ALL 4 PASS rows (and the run as a whole) have `cached:true` ("cached previous PASS result"). Timing margins were reused, not freshly measured — treat the 8/13/27/153 ms figures as stale, single-sample evidence (consistent with the launcher stale-PASS reuse caveat).

## Confidence & caveats

- Confidence: medium. The winner is unambiguous on the only available metric (durationMs=8, lowest of 4), and the NA verdicts are clearly honest from declared container support.
- Caveats: (1) No `bench{}` / `primaryMetric` in the shard — ranking rests on `durationMs`, which is total adapter time, single-sample, with no MAD/p95 spread, and all-cached. The 1.6x margin over mediabunny is fragile. (2) The gate is smoke-grade (graceful-failure), so all four PASSes are equal in correctness; the winner is a performance pick only. (3) durations are too small (8 vs 13 ms) for the difference to be robust against scheduling noise on a re-run.
