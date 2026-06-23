# trim/h264_noop_full_range_idempotent

family: trim | fixture asset: `h264_1080p_30s.mp4` (H.264/AVC video + AAC audio in MP4) | primaryMetric: wall (default; INVARIANT_CASES set no explicit primaryMetric, so the first of TRIM_METRICS = `wall`) | passCount: 2

## Verdict

- **Best framework: mediabunny@1.48.0** (env.engineId `mediabunny`).
- **Contested**: 2 engines PASS (mediabunny, ffmpeg.wasm@0.12.15). The other 5 are NA_ENGINE (do not declare `trim`).
- **Decisive factor: PERFORMANCE.** Correctness is a dead heat — both engines pass the identical 4-oracle set with identical headline measurements (probe-duration Δ 0.0000s; trim-boundaries Δ 0.0000s; playback-smoke ok; reference-reimport ~2308 vs ~2307 packets). No oracle in this scenario is bit-exact (decoded-frames-bitexact is intentionally omitted), so neither engine can out-correct the other. mediabunny wins on speed and main-thread responsiveness.
- **Margin over runner-up (ffmpeg.wasm):** wall 80.235ms vs 231.130ms = **2.88x faster**; throughputRealtime 373.90x vs 129.80x = **2.88x higher**; longtasks 406ms vs 19963ms = **49.2x lower main-thread blocking**. peakMemory was not sampled for either (n=0). All bench samples are n=1 (single sample, mad=0), so the magnitude is directional but not statistically robust.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks (ms) | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, trim-boundaries:true, playback-smoke:true, reference-reimport:true | 80.235 | 373.90 | n=0 (not sampled) | 406 | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true, trim-boundaries:true, playback-smoke:true, reference-reimport:true | 231.130 | 129.80 | n=0 (not sampled) | 19963 | cached previous PASS result |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'trim' |

## Why the winner wins (deep technical)

**The operation is an idempotent full-range trim of H.264-in-MP4.** The scenario (src/scenarios/trim/index.ts:744-763) requests `trim(startUs=0 .. endUs=30_000_000)` on a 30s source whose probed duration is exactly 30s, with `frameAccurate: false`. Semantically this is the identity transform: the correct output is a container holding every packet of the source.

**mediabunny's decisive path is the no-op short-circuit.** Because `range.startUs == 0` and `endUs == source duration`, the adapter takes the fast branch at src/engines/mediabunny/adapter.ts:1468-1477. It first opens the real input (`openInput`, line 1460), lazily reads normalized metadata (`metadataFromInput`, line 1464), and calls `isNoopTrim(meta, range, opts.container)` (src/engines/mediabunny/adapter.ts:476-489). That predicate genuinely validates the identity condition: container matches, `|startSec| <= 0.001` and `|endSec - meta.durationSec| <= 0.001` (NOOP_TRIM_TOLERANCE_SEC, line 167). Only when those hold does it return `new Uint8Array(await input.arrayBuffer())` verbatim (line 1471-1475). For the identity case this is the *mathematically correct* output and it avoids any demux/remux/transcode work — which is exactly why wall collapses to 80.235ms and main-thread longtasks to 406ms. No COOP/COEP, no SharedArrayBuffer, pure-ts-esm core (env.configUsed: backend `webcodecs`, hwAccel `prefer-hardware`, coopCoep `not-required`, sharedArrayBuffer false). The verification reference-reimport then re-demuxes that byte-identical output and recovers **2308 packets / 1423 keyframes** — the full source packet table, confirming nothing was dropped.

**ffmpeg.wasm does the same operation as a genuine remux, hence the cost.** With `frameAccurate:false` it takes the keyframe-aligned `-c copy` fast-trim path (src/engines/ffmpeg-wasm/adapter.ts:2613-2627): `-ss 0.000000 -i in -map 0 -t 30.000000 -c copy`. This still spins up the single-thread wasm core, runs `runInfo` to parse metadata, then a real demux+stream-copy+mux pass through the MP4 muxer. The result is correct (reference-reimport: **2307 packets / 1422 keyframes** — one packet/keyframe fewer than mediabunny, well within the reference-reimport ±2% tolerance at src/core/oracles.ts:1258-1262), but the wasm round-trip costs 231.130ms wall and a 19963ms longtask burst (the wasm execution monopolizes the main thread). That is the entire ~2.88x wall gap and the ~49x longtasks gap.

**Why correctness cannot break the tie.** All four gating oracles are duration/structure/smoke level, not pixel level:
- property-invariant `probe-duration` (src/core/oracles.ts:2709-2759) compares probed out.dur to golden source dur with a 0.05s band — both engines: outDurationSec 30, goldenDurationSec 30, deltaSec 0.
- trim-boundaries (src/core/oracles.ts:2348-2434) compares out.dur to the requested range; the boundary-frame digest is explicitly **skipped** ("loaded golden is source-prefix, not trim-range golden", line 2429) so `boundaryFrameComparisons:0` for both.
- playback-smoke just plays a few frames.
- reference-reimport (src/core/oracles.ts:1225-1270) only checks the re-demuxed packet/keyframe counts are within 2% of golden.

Since `decoded-frames-bitexact` was deliberately omitted (scenario notes, index.ts:754-756: "source-prefix golden can validate only the opening frames, not the full identity trim"), there is no crypto/bit-exact rung to separate the two. With correctness tied, performance is the only discriminator, and mediabunny wins it cleanly on every sampled axis.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correct output but slower — 231.130ms wall (2.88x mediabunny's 80.235ms), 129.80x throughput (0.35x of mediabunny's 373.90x), and a 19963ms longtask burst (49.2x mediabunny's 406ms) because the single-thread wasm core does a full demux→stream-copy→remux pass where mediabunny does a metadata-validated byte copy.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'trim'". Honest NA — remotion-media-parser is a read-only parser/probe library with no muxing/output path, so it legitimately cannot produce a trimmed container.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'trim'". Honest NA — web-demuxer is a demux-only API (libav-backed packet reader); it has no remux/output capability.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare operation 'trim'". Borderline — MP4Box.js *can* segment/extract MP4 ranges, so a copy-trim is conceivably implementable; but the adapter does not declare `trim`, so for this suite the NA is a real (not faked) capability gap, just possibly under-declared.
- **remotion-webcodecs@4.0.479 (NA_ENGINE):** "engine does not declare operation 'trim'". Under-declaration risk — remotion-webcodecs can convert/re-encode and could in principle trim via WebCodecs, but it does not register the `trim` op here, so it is excluded.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare operation 'trim'". Honest NA — the raw browser platform baseline (MediaSource/WebCodecs primitives) has no single declared trim operation.

## Anti-cheat validation

- **Scenario:** src/scenarios/trim/index.ts:744-763 (`id: 'h264_noop_full_range_idempotent'`), built into a scenario at index.ts:783-807. op `trim`, input `h264_1080p_30s.mp4`, range 0..30_000_000us, frameAccurate false, invariant `probe-duration`, oracles `[property-invariant, trim-boundaries, playback-smoke, reference-reimport]`.
- **Fixture exists and is real:** `fixtures/media/h264_1080p_30s.mp4` is present, **31MB** — a genuine 1080p/30s H.264+AAC MP4, not synthetic/empty/mock.
- **Winner adapter is genuine:** src/engines/mediabunny/adapter.ts:1445-1500. It opens the real input, reads real metadata, and only returns the input bytes after `isNoopTrim` (adapter.ts:476-489) *verifies* the requested range truly equals the full source range to within 1ms and the container matches. This is a legitimate identity-case optimization, not a fabricated transcode: for an idempotent full-range trim the correct output IS the input. It does not hardcode output, does not short-circuit to a golden file, and does not swallow errors (it throws on bad ranges/containers, lines 1450-1458).
- **Oracle is real but weak:** reference-reimport (src/core/oracles.ts:1225-1270) genuinely re-demuxes the output and counts packets/keyframes (mediabunny recovered 2308/1423, ffmpeg 2307/1422 — physically plausible for a 30s 1080p H.264 clip). property-invariant probe-duration (oracles.ts:2709-2759) and trim-boundaries (oracles.ts:2348-2434) do real reference-engine probes. BUT none is bit-exact, the trim-boundary frame digest is skipped (boundaryFrameComparisons:0), and decoded-frames-bitexact is omitted — so the gate validates *duration + packet-table identity + playability*, not pixel identity.
- **Cached note:** BOTH PASS results have `cached==true` ("cached previous PASS result"). The evidence was reused, not re-run in this batch — staleness risk applies to both engines equally and to the bench numbers (all n=1).
- **Verdict: WEAK-GATE.** Real fixture + real implementations + meaningful-but-loose oracles. The winner's PASS is genuine (and the no-op byte-copy is the correct identity result, so it is not a CHEAT), but the gate cannot prove full-stream pixel identity, only duration/packet-count/playback equivalence. The win itself rests purely on cached, single-sample performance numbers.

## Confidence & caveats

- **Confidence: medium.** The verdict (mediabunny wins on perf, correctness tied) is well-supported by code and measurements, but two caveats lower it: (1) both PASS rows are `cached==true`, so the numbers were not freshly produced this run; (2) every bench metric is n=1 (mad=0, p95==median), so the 2.88x/49.2x margins are directional, not statistically confirmed. peakMemory was not sampled (n=0) for either engine, so the memory tiebreaker is unavailable.
- The correctness tie is intrinsic to this scenario's gate design (no bit-exact oracle by deliberate choice). A future trim-range golden enabling decoded-frames-bitexact or boundary-frame digests could change the correctness ranking; today it cannot.
- mediabunny's win is partly a byproduct of its identity-case short-circuit; on a non-no-op sub-range trim (where the byte-copy path is not taken) the performance gap would likely shrink, since mediabunny would also have to demux/remux.
