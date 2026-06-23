# transcode/negative_png_to_video

family: transcode | fixture asset: `image.png` (PNG image data, 640x480, 8-bit/color RGB, non-interlaced, ~34 KB) | primaryMetric: wall | passCount: 4 of 7

This is a **negative / robustness** scenario: a still image (PNG) is fed to a VIDEO transcode (`{container:'mp4', video:{codec:'h264'}}`). The single gating oracle is `graceful-failure` — an engine "wins" by *rejecting* the still image cleanly (throw/reject, no output, no crash/hang/OOM). There is no decoded-frame or golden comparison here by design: a PNG has no video track to transcode, so the only correct outcome is a clean refusal.

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 4 engines PASS the same single oracle).
- **Decisive factor:** With correctness tied across all four PASS engines (all satisfy the identical, smoke-tier `graceful-failure` oracle), the tiebreak falls to performance. mediabunny rejects fastest at **durationMs=8** vs platform=11, remotion-webcodecs=11, and ffmpeg.wasm=139.
- **Margin over runner-up:** ~**1.375x faster** than the next engines (8ms vs 11ms for platform / remotion-webcodecs); ~**17.4x faster** than ffmpeg.wasm (8ms vs 139ms). NOTE: this margin is weak evidence — these are single cached `durationMs` values (no `bench{}` block, n effectively 1, no mad/p95), and for a "reject the bad input" test, raw speed is a low-stakes differentiator. All four are functionally equivalent winners.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:true | n/a (durationMs=8) | n/a | n/a | n/a | cached: graceful: Input has an unsupported or unrecognizable format. |
| platform@chrome-149 | PASS | graceful-failure:true | n/a (durationMs=11) | n/a | n/a | n/a | cached: graceful: `<video>` error before metadata (transcode source) |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:true | n/a (durationMs=11) | n/a | n/a | n/a | cached: graceful: Image files are not supported |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:true | n/a (durationMs=139) | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: transcode rejected still-image input |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |

No engine emitted a `bench{}` block for this scenario (the only declared metric is `wall`, and the run recorded the fast-fail path via `durationMs`). All four PASS entries are `cached:true`.

## Why the winner wins (deep technical)

The container/codec target here is **H.264-in-MP4**, but the input is a **PNG raster image** — there is no elementary video stream, no sample table, no timestamps, nothing for an H.264 encoder pipeline to ingest as frames-over-time. The "correct" engine behavior is therefore *detection and refusal*, not transcoding. All four PASS engines reach that refusal, but by mechanistically different routes:

- **mediabunny (winner):** uses its `webcodecs` backend with `hwAccel:"prefer-hardware"`, `pipeline:"streaming-lockstep"`, `coreBuild:"pure-ts-esm"`, `coopCoep:"not-required"`. The rejection comes from mediabunny's own demux/format-sniffing layer — the reason string `"Input has an unsupported or unrecognizable format."` is the library's container parser refusing the PNG before any WebCodecs `VideoDecoder`/`VideoEncoder` is ever configured. Because mediabunny sniffs the bytes itself (no spawned wasm runtime, no `<video>` element round-trip), the failure is the cheapest of the four: **durationMs=8**. The pure-TS ESM core with `sharedArrayBuffer:false` and no COOP/COEP requirement means there is no worker spin-up or cross-origin-isolation cost on the reject path.

- **platform (chrome-149), 11ms:** backend `webcodecs`/`hwAccel:true`, but its transcode source path drives a `<video>` element (`encode:"<video>→canvas→MediaRecorder(out)"`). The PNG is fed to the media element, which raises an error event *before metadata* (reason: `"<video> error before metadata (transcode source)"`). Correct rejection, but it pays the element-load latency, landing 3ms behind mediabunny.

- **remotion-webcodecs, 11ms:** backend `webcodecs`/`hwAccel:"prefer-hardware(+software fallback)"`, `pipeline:"streaming-backpressure"`. Its remotion media-parser front-end classifies the input as an image and throws `"Image files are not supported"` before the WebCodecs convert step. Functionally identical reject, tied with platform on time.

- **ffmpeg.wasm, 139ms (slowest):** the adapter has an explicit still-image guard. `transcode()` at `src/engines/ffmpeg-wasm/adapter.ts:2165-2168` calls `isStillImageInput(input)` (`src/engines/ffmpeg-wasm/adapter.ts:812-817`), which returns true when the MIME starts with `image/` or the filename matches `/\.(jpe?g|png|webp|gif|bmp|avif)$/`, then throws `"ffmpeg.wasm@0.12.15: transcode rejected still-image input"`. This is the *most deliberate / principled* rejection (it refuses before the wasm encode ever spins up), but the 139ms reflects ffmpeg.wasm's heavier module/runtime accounting on this path.

Decisive point: correctness is a flat tie (one oracle, all true), so the ranking is purely the performance tiebreak in the decision procedure — and mediabunny's self-contained format sniff is the lowest-overhead reject at 8ms. It is worth stressing this is a *low-stakes* win: for a negative test, every PASS engine is doing exactly the right thing, and an 8-vs-11ms gap on cached single samples is not strong evidence of superiority.

## What each other framework did wrong

- **platform@chrome-149 (PASS, lost on time):** rejected correctly via `<video>` error before metadata, but at durationMs=11 vs 8 (~1.375x slower than mediabunny) due to the media-element load path.
- **remotion-webcodecs@4.0.479 (PASS, lost on time):** rejected correctly (`"Image files are not supported"`) at durationMs=11 (~1.375x slower); media-parser image classification overhead.
- **ffmpeg.wasm@0.12.15 (PASS, lost on time):** rejected correctly and most explicitly (`isStillImageInput` guard, adapter.ts:2166), but at durationMs=139 (~17.4x slower) — wasm-runtime accounting on the reject path.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare operation 'transcode'". Honest NA — mp4box is a muxer/demuxer/box parser with no transcode/encode capability; not under-declared.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare operation 'transcode'". Honest NA — it is a demux-only library; no encoder.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** "engine does not declare operation 'transcode'". Honest NA — a pure parser/probe, no encode pipeline (the transcode-capable Remotion path is `remotion-webcodecs`, which is present and passed).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:1534-1539` (the `negative_png_to_video` entry in `NEGATIVE_CASES`), built into a `Scenario` at `src/scenarios/transcode/index.ts:1603-1620` with `op:'transcode'`, `oracles:['graceful-failure']`, `metrics:['wall']`, `timeoutMs: TC_EDGE_TIMEOUT_MS`.
- **Fixture:** asset `image.png` — `fixtures/media/image.png` EXISTS and is a real raster: `PNG image data, 640 x 480, 8-bit/color RGB, non-interlaced` (~34 KB). Not synthetic/empty/mock. It is genuinely un-transcodable to a video stream, so the test premise is sound.
- **Oracle:** `gracefulFailure` at `src/core/oracles.ts:2586-2623`. For a scenario that lists `graceful-failure` in `oracles` (true here, see scenario:1615), it PASSes when the op produced no output (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`) — i.e. the runner caught the throw — and FAILs if the op produced output from the bad input. This is a real "did the engine refuse" check, not a no-op.
- **Winner adapter (mediabunny):** rejects via mediabunny's own format sniffer; reason `"Input has an unsupported or unrecognizable format."` is library-emitted (mediabunny's demux refuses the PNG container). No canned output, no input→output copy, no golden short-circuit; the engine simply throws and produces nothing. (Cross-checked the most explicit guard in ffmpeg-wasm at `src/engines/ffmpeg-wasm/adapter.ts:812-817` + `:2166-2167`, confirming the suite's image-reject contract is genuine, not faked-success.)
- **Verdict: WEAK-GATE.** Real fixture + real implementations + a meaningful "must refuse" oracle, BUT `graceful-failure` is a **smoke-tier / negative gate** — it only asserts "no output, no crash," the weakest rung of the correctness ladder. The PASS is real, not strong, and it cannot distinguish a thoughtful image-detector from an engine that happens to throw for any reason. There is no bit-exact, structural, or perceptual comparison (correctly so for a negative test). Not a CHEAT: the inputs and refusals are genuine.
- **Cached note:** ALL four PASS results are `cached:true` (reused, not re-run this session). Staleness risk is low for a deterministic reject path (a PNG will not become transcodable), but the exact durationMs values (8/11/11/139) are cached single samples and should not be over-interpreted.

## Confidence & caveats

- Confidence: **high** that the *set* of correct outcomes is right (4 genuine refusals, 3 honest NAs) and that the gate is a weak/smoke negative gate.
- Confidence: **low** that mediabunny is meaningfully "better" than platform/remotion-webcodecs — the 8ms vs 11ms gap is a single cached `durationMs` with no `bench{}`, no mad/p95, n≈1, on a path where speed is nearly irrelevant. The three fast engines are effectively co-winners; mediabunny is named purely by the deterministic durationMs tiebreak.
- All evidence is from cached entries; a fresh re-run could reorder the sub-millisecond-to-tens-of-ms reject timings without changing any PASS/FAIL verdict.
