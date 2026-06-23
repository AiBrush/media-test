# mux/neg_h264_into_ogg_illegal

**family:** mux  •  **fixture asset:** `h264_1080p_30s.mp4` (31 MB, real H.264/AVC + AAC in MP4)  •  **primaryMetric:** wall (negative case; metrics = `wall`, `peakMemory`)  •  **passCount:** 2 / 7

This is a NEGATIVE / illegal-mux scenario. The source's demuxed H.264 video track is fed to a muxer asked to write the OGG container. OGG can carry Opus/Vorbis/FLAC/Theora — never H.264/AVC. The single gating oracle is `graceful-failure`: an engine PASSes iff its `mux()` rejects cleanly (throws/rejects, produces NO output, no crash/hang) within the 15 s timeout. There is no positive output to score.

## Verdict

**Best framework: mediabunny@1.48.0** — CONTESTED (2 engines PASS: mediabunny and ffmpeg.wasm; both satisfy the only oracle, `graceful-failure`).

- **Correctness strength:** identical. Both pass exactly one oracle (`graceful-failure:true`) with detail "operation produced no output and did not crash/hang → handled gracefully". For a negative test, a clean reject is the strongest available outcome; there is no bit-exact/structural gate to separate them.
- **Decisive factor: latency of the rejection.** No `bench` block was recorded for this scenario (only `durationMs`). mediabunny rejected in **81 ms** vs ffmpeg.wasm in **422 ms** — a **5.2x faster** clean failure. The margin is wall-clock only; both `n` are effectively single cached runs, so the timing evidence is weak (see caveats), but mediabunny is the faster guard and also requires no wasm core boot.
- Tiebreaker reinforcement: mediabunny rejects at the JS/library guard (pure-ts-esm core, no COOP/COEP, no SharedArrayBuffer) before any heavy work; ffmpeg.wasm must instantiate its wasm core to reach its `assertMuxContainerCompatible` guard.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | graceful-failure:true | n/a (durationMs 81) | n/a | n/a | n/a | cached: graceful: Ogg does not support video tracks. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs 422) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: mux cannot write tracks [h264, aac] into Ogg |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare output container 'ogg' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'mux' |

No `bench` object is present for any engine in this shard; `wall/throughput/peakMemory/longtasks` were not captured for a negative case, so only `durationMs` is comparable.

## Why the winner wins (deep technical)

The operation under test is "build an OGG container from encoded tracks that include an H.264 video track." OGG's bitstream model is a sequence of logical streams whose codecs are restricted to the registered OGG mappings (Vorbis, Opus, FLAC, Theora, Speex). H.264/AVC has no OGG codec mapping — there is no codec-private header layout or packet framing defined for AVC inside OGG pages. A correct muxer must refuse this at track-add time rather than emit pages that no demuxer could interpret. PASS therefore means "refused cleanly".

**mediabunny (winner).** The adapter's `mux()` (`src/engines/mediabunny/adapter.ts:1508`) first resolves the output format via `makeOutputFormat('ogg', …)`, which returns a real `OggOutputFormat` instance (`src/engines/mediabunny/codecs.ts:180-181`). It then iterates the demuxed tracks; for the video track it maps the codec and calls the genuine library API `output.addVideoTrack(source, …)` at `src/engines/mediabunny/adapter.ts:1529`. mediabunny's `OggOutputFormat` does not accept a video track, so the library itself throws ("Ogg does not support video tracks"), which the runner catches → `ctx.output` stays undefined → `gracefulFailure` returns PASS via the `!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames` branch (`src/core/oracles.ts:2607-2610`). This is the *library's own* container/codec legality guard firing, not an adapter shortcut — the rejection reflects real OGG semantics. The throw happens at the synchronous `addVideoTrack` call before `output.start()` and before any packet copy, which is why it lands in **81 ms** with no wasm boot, no GPU, no SharedArrayBuffer (env.configUsed: backend `webcodecs`, core `pure-ts-esm`, `coopCoep: not-required`).

**ffmpeg.wasm (runner-up, also PASS).** Its adapter does the legality check itself before invoking ffmpeg, in `assertMuxContainerCompatible` (`src/engines/ffmpeg-wasm/adapter.ts:3043`). The OGG branch (`:3067-3070`) rejects when `hasVideo` is true or any audio codec is outside `{opus, vorbis, flac}`; with the H.264 + AAC track set both conditions hold, so it throws `ffmpeg.wasm@0.12.15: mux cannot write tracks [h264, aac] into Ogg` (`:3047-3048`). This is a faithful guard mirroring FFmpeg's own ogg muxer constraints. It is correct but slower (**422 ms**) because reaching that guard requires the wasm core to be instantiated; the 5.2x latency gap is the only differentiator and it favors mediabunny.

The five NA engines are honest: this is the negotiation behavior the scenario notes (`src/scenarios/mux/negative.ts:15-23`) explicitly anticipate — an engine that does not declare the `mux` operation or the `ogg` output target cleanly NA's and never claims the illegal combo, which is also a correct outcome but cannot win (only PASS is eligible).

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (same single oracle) but lost on speed: clean rejection took **422 ms** vs mediabunny's **81 ms** (5.2x slower); it must boot the wasm core to reach its `assertMuxContainerCompatible` OGG guard (`src/engines/ffmpeg-wasm/adapter.ts:3067`), whereas mediabunny rejects at a synchronous JS library call.
- **platform@chrome-149** — `NA_ENGINE`: "engine does not declare operation 'mux'". Honest — the WebCodecs/MediaSource platform adapter exposes no encoded-track muxer, so it never claims H.264→OGG.
- **mp4box@2.3.0** — `NA_ENGINE`: "engine does not declare output container 'ogg'". Honest — mp4box.js writes ISO-BMFF only; OGG is outside its capability, so it correctly NA's rather than faking a reject.
- **web-demuxer@4.0.0** — `NA_ENGINE`: "engine does not declare operation 'mux'". Honest — it is a demux-only engine; no mux capability declared.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'mux'". Honest — parser/probe engine, no muxer.
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: "engine does not declare operation 'mux'". Honest — its declared surface is decode/transcode via WebCodecs, no encoded-track mux op.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/mux/negative.ts:44-53` (`id: 'neg_h264_into_ogg_illegal'`), built by `buildMuxNegative` in `src/scenarios/mux/_shared.ts:309-328`, which sets `op: 'mux'`, `options.container = 'ogg'`, `requires.containersOut = ['ogg']`, `requires.videoCodecs = ['h264']`, and `oracles: ['graceful-failure']`.
- **Fixture exists & is real:** `input: 'h264_1080p_30s.mp4'` → `fixtures/media/h264_1080p_30s.mp4`, stat confirms a **31 MB** real H.264 1080p/30s MP4 (not synthetic/empty/mock). It carries a genuine H.264 video track, which is exactly the unrepresentable-in-OGG payload the test needs.
- **Oracle is real & not trivially satisfiable:** `gracefulFailure` (`src/core/oracles.ts:2586-2623`). For this negative case (no `signal:` marker in notes), it PASSes ONLY when the op produced NO output (`:2608-2610`) and explicitly FAILs if any output/metadata/demux/frames was emitted from the illegal mux (`:2614-2617`). So an engine that wrote a bogus OGG would FAIL, not pass — the gate genuinely distinguishes reject from emit.
- **Winner implementation is genuine:** mediabunny `mux()` `src/engines/mediabunny/adapter.ts:1508`, output format `src/engines/mediabunny/codecs.ts:180-181`, real `output.addVideoTrack` call at `:1529`. No canned output, no input→output copy, no golden short-circuit, no swallowed error reported as success — the throw originates in the mediabunny library's OGG video-track rejection and propagates to the runner. Reason string "Ogg does not support video tracks" matches the library guard.
- **Measurements physically plausible:** the only measurement is "produced no output", consistent with a synchronous reject; durationMs 81 (mediabunny) / 422 (ffmpeg.wasm) are plausible for a JS guard vs a wasm-core-boot-then-guard.
- **Cached note:** BOTH PASS results have `cached:true` (mediabunny startedAt 14:00:45Z, ffmpeg-wasm 16:34:38Z). The verdict relies on reused runs, not a fresh re-execution — staleness risk applies, and the durationMs margin in particular is single-sample cached evidence.

**validationVerdict: REAL** — real 31 MB H.264 fixture, real library/wasm mux guards on both PASS engines, and an oracle that fails on emitted output. The gate is a negative-case reject check (not a bit-exact/structural correctness gate), which is the appropriate and strong gate for an illegal-mux test, so REAL rather than WEAK-GATE. Caveat: evidence is cached, not freshly re-run.

## Confidence & caveats

- **Confidence: medium.** The winner's correctness (clean reject of H.264→OGG) is unambiguous and code-verified for both PASS engines. The *ranking* between the two rests solely on durationMs (81 ms vs 422 ms) because no `bench` was captured; with cached single-sample timing and no mad/p95 spread, the 5.2x margin is directionally reliable (JS guard vs wasm-boot guard) but not statistically robust.
- Both PASS results are `cached:true`; a fresh re-run is advisable before treating the latency gap as authoritative.
- The five NA outcomes are all honest capability non-declarations (no under-declared capability that should have been exercised): mux-op or ogg-output simply absent. Per the decision procedure they are ineligible to win regardless.
