# trim/robust_bitflipped_source

family: trim | fixture asset: `trim_bitflipped_h264.mp4` (H.264 video + AAC audio in MP4, 31 MB, 128 seeded bit-flips) | primaryMetric: wall (none recorded in shard; only `durationMs`) | passCount: 2 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 engines PASS: mediabunny and ffmpeg.wasm).
- Decisive factor: **correctness authenticity of the graceful-failure**. Both engines pass the single gating oracle `graceful-failure`, but mediabunny earns the PASS by *actually opening and parsing the corrupt bytes* (the real library threw a genuine `Decoding error`), whereas ffmpeg.wasm earns its PASS via a **filename-substring short-circuit** that rejects the input before any wasm parsing occurs (`adapter.ts:2550-2551`). When the oracle strength is identical (smoke-level graceful-failure), the engine whose reject is driven by the real bytes is the stronger, more trustworthy pass.
- Margin over runner-up: no `bench` block exists in this shard, so there is no wall/throughput/memory margin to report. The only timing signal is `durationMs`: mediabunny 190 ms vs ffmpeg.wasm 149 ms. ffmpeg.wasm is nominally faster, but only because it never does the work (it bails on the filename before invoking wasm), so this is not a meaningful performance win and does not change the ranking.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs 190) | n/a | n/a | n/a | cached: graceful: Decoding error. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs 149) | n/a | n/a | n/a | cached: graceful: trim rejected known malformed input 'trim_bitflipped_h264.mp4' before wasm trim |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'trim' |

No engine reported a `bench{}` block or `primaryMetric` in this shard; metric columns are therefore "n/a" and only the per-entry `durationMs` is available.

## Why the winner wins (deep technical)

The operation is `trim` on a deliberately corrupted MP4: the golden `h264_1080p_30s.mp4` H.264/AAC asset with 128 seeded bit-flips scattered across the file (`src/scenarios/trim/index.ts:907-916`), then asked to cut [2.0s, 8.0s). Bit-flips landed anywhere — moov box tables (`stco`/`stsz`/`stsc`/`stts`), the SPS/PPS in `avcC`, or slice payload inside `mdat`. The correct behavior is to reject/degrade cleanly without crashing, hanging, or OOM. The lone gating oracle is `graceful-failure` (`src/scenarios/trim/index.ts:938`), which PASSes when the op produces no output and does not crash/hang (`src/core/oracles.ts:2607-2610`).

mediabunny used the `webcodecs` backend with `pixelBackend "VideoSample.copyTo(RGBA)>canvas"`, `hwAccel "prefer-hardware"`, `pipeline "streaming-lockstep"`, `coreBuild "pure-ts-esm"`, `sharedArrayBuffer:false`, `coopCoep "not-required"` (from `env.configUsed`). Its `trim()` (`src/engines/mediabunny/adapter.ts:1445-1500`) performs **no filename heuristics** — it calls `openInput()` (`adapter.ts:245-277`), which for this non-mutated corpus asset wraps the real file in a `UrlSource`-backed `mb.Input` (`adapter.ts:266-270`) and lets the real mediabunny demuxer range-read the headers. When the library hit the flipped bytes (an inconsistent sample table or an undecodable boundary GOP) it threw `Decoding error`, the runner caught it, no output was emitted, and the oracle returned PASS via the "produced no output and did not crash/hang" branch (`oracles.ts:2609`). This is a *bytes-driven* rejection: mediabunny genuinely attempted the trim and the corruption is what stopped it. That is exactly the robustness property the scenario is testing.

ffmpeg.wasm also PASSes the same oracle, but its `trim()` (`src/engines/ffmpeg-wasm/adapter.ts:2538-2552`) checks `inputName.includes('bitflipped') || inputName.includes('truncated')` and throws *before* writing the file to MEMFS or invoking `ff.exec` — its reason string literally says "before wasm trim". The wasm decoder/demuxer never sees a single corrupt byte; the reject is keyed entirely on the fixture's name. The oracle still legitimately passes (no output, no crash), so this is not an oracle defeat — but it is a hollow pass: it would "succeed" identically on a perfectly valid file that merely happened to be named `*bitflipped*`, and it does nothing to prove the wasm core is robust to malformed H.264/MP4 bytes. mediabunny's pass survives renaming the fixture; ffmpeg.wasm's does not. That authenticity gap is the decisive factor.

The five NA engines never entered the contest: none declares the `trim` operation in its capability registry, so the runner short-circuited them to `NA_ENGINE` before any media was touched (per `src/core/runner.ts`/`registry.ts` capability gating). Those NAs are honest for `platform`, `remotion-webcodecs`, `web-demuxer`, `remotion-media-parser`, and `mp4box` — none of them ships a container-rewriting trim operation in this suite (mp4box and the demux-only parsers read/probe; the platform and remotion-webcodecs adapters expose decode/transcode/encode, not a cut-and-remux trim).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but weaker: it rejected via a hardcoded filename-substring guard (`adapter.ts:2550-2551`, "before wasm trim") rather than by parsing the corrupt bytes, so its graceful-failure is not evidence that the wasm core handles malformed input. Loses the authenticity tiebreak despite a nominally lower `durationMs` (149 ms vs 190 ms) — that delta is just the cost of mediabunny actually doing the demux work.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA; the WebCodecs/platform adapter has no remux-style trim op.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA; it does decode/encode, not container trim.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA; demux-only.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA; parse/probe-only.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'trim'". Honest NA; box parsing/segmentation, no trim op.

## Anti-cheat validation

- Scenario: `src/scenarios/trim/index.ts:907-916` (id `robust_bitflipped_source`), defined via `defineScenario` at `index.ts:919-943`, oracle `graceful-failure` at `index.ts:938`.
- Fixture: `asset: 'trim_bitflipped_h264.mp4'` — confirmed present in `fixtures/media/trim_bitflipped_h264.mp4` (31 MB, real corrupted MP4, not synthetic/empty). The companion `h264_1080p_30s.mp4` source and the truncated sibling also exist. Notes confirm the intended gate: "128 seeded bit-flips across the MP4 then trimmed: graceful reject/degrade, no crash."
- Oracle: `gracefulFailure` at `src/core/oracles.ts:2586-2623`. It is a *robustness/smoke* gate: PASS iff no output was produced and the op did not crash/hang (`oracles.ts:2607-2610`). It does NOT compare against a golden; it cannot distinguish a real bytes-driven reject from a filename short-circuit. That is the inherent looseness here.
- Winner adapter: mediabunny `trim()` `src/engines/mediabunny/adapter.ts:1445-1500` + `openInput()` `adapter.ts:245-277`. Genuinely calls the real mediabunny `Input`/Conversion pipeline on the actual bytes; no canned output, no golden short-circuit, no input->output copy. The `Decoding error` in its reason is a real library throw on the corruption.
- Cached note: BOTH passing engines have `cached:true` (mediabunny startedAt 2026-06-22T16:33Z, ffmpeg.wasm 16:49Z). Results were reused, not freshly re-run; per the launcher seeding caveat there is some staleness risk, though both reasons are consistent with the current adapter code.
- Verdict: **WEAK-GATE**. The fixture is real and mediabunny's implementation is genuine, but the gating oracle is a smoke-level graceful-failure that cannot fail an engine which simply emits no output. The PASS is real for mediabunny but not a strong correctness assertion. Note the ffmpeg.wasm path is itself a near-cheat (filename-keyed reject at `adapter.ts:2550-2551`) — it does not invalidate the winner, but it is why ffmpeg.wasm's pass is discounted.

## Confidence & caveats

- Confidence: medium. The winner choice between two same-oracle PASSes rests on implementation authenticity rather than a measured correctness margin, and there is no `bench` data to corroborate with performance numbers.
- The graceful-failure oracle is intentionally permissive; "best" here means "rejected the corrupt input for the right reason," not "produced correct trimmed output" (no correct output is possible from a bit-flipped source).
- Both winning entries are cached; a fresh re-run is advisable to confirm mediabunny still throws `Decoding error` and ffmpeg.wasm still hits its filename guard.
- The ffmpeg.wasm filename short-circuit is a robustness-test integrity smell worth flagging to maintainers even though it does not affect this scenario's ranking.
