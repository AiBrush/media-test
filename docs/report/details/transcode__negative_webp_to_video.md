# transcode/negative_webp_to_video

family: transcode | fixture asset: `image.webp` (RIFF/WebP, VP8, 640x480, ~10 KB) | primaryMetric: wall | passCount: 4 (of 7)

## Verdict

- **Best framework: mediabunny@1.48.0** (CONTESTED — 4 engines PASS: mediabunny, remotion-webcodecs, ffmpeg.wasm, platform).
- This is a **negative scenario**: a still WebP image is fed to a video transcode (`{container:'mp4', video:{codec:'h264'}}`). The single oracle is `graceful-failure`, which PASSes iff the engine produces NO output and does not crash/hang/OOM. All 4 PASS engines satisfy it identically (correctness-equal), so the contest is decided on **performance (wall)**.
- **Decisive factor:** mediabunny rejects in **durationMs = 10**, via the library's own native byte-level format detection. Runner-up remotion-webcodecs is 18 ms, ffmpeg.wasm 122 ms, and platform a catastrophic 1,375,856 ms.
- **Margin over runner-up:** ~**1.8x faster** than remotion-webcodecs (18/10), ~**12x** faster than ffmpeg.wasm (122/10), and ~**137,586x** faster than platform (1,375,856/10). Mediabunny also rejects via real format sniffing rather than a filename suffix heuristic.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 10 ms (durationMs) | n/a (no bench) | n/a | n/a | cached: graceful: Input has an unsupported or unrecognizable format. |
| remotion-webcodecs@4.0.479 | PASS | graceful-failure:pass | 18 ms | n/a | n/a | n/a | cached: graceful: Image files are not supported |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 122 ms | n/a | n/a | n/a | cached: graceful: ffmpeg.wasm@0.12.15: transcode rejected still-image input |
| platform@chrome-149 | PASS | graceful-failure:pass | 1,375,856 ms | n/a | n/a | n/a | cached: graceful: transcode source metadata timeout |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

Note: this negative scenario declares `metrics: ['wall']` only (src/scenarios/transcode/index.ts:1616), so no `bench{}` object is emitted; ranking uses `durationMs`. All four PASS results are `cached==true`.

## Why the winner wins (deep technical)

The input is a genuine still-image RIFF/WebP container (`file` reports `RIFF (little-endian) data, Web/P image, VP8 encoding, 640x480`). There is no video timeline, no sample table, no track index — a correct transcoder must detect "this is not demuxable timed media" and refuse, *cheaply*, without spinning a decode/encode pipeline. The graceful-failure oracle (src/core/oracles.ts:2586-2623) PASSes any engine whose operation throws/rejects so the runner produces no `output/metadata/demux/frames`; it explicitly does NOT reward output, so all four passers are equivalent on correctness. The differentiator is *how fast and how honestly* each detects the dead end.

**mediabunny (winner, 10 ms).** Its transcode path resolves the input format up front through the library's own `Input.getFormat()` (src/engines/mediabunny/adapter.ts:418). For a RIFF/WebP byte stream, mediabunny's format resolver does not match any of its known demuxable containers (MP4/MOV/WebM/Matroska/WAV/etc.), so the *library itself* throws `"Input has an unsupported or unrecognizable format."` — exactly the cached reason in the shard. This is a byte-level sniff of the actual container magic, not a filename guess, and it short-circuits before any WebCodecs `VideoDecoder`/`VideoEncoder` is constructed (env.configUsed.backend `webcodecs`, `pipeline:"streaming-lockstep"`, `coopCoep:"not-required"`). The result is the fastest possible clean rejection (10 ms) and the most trustworthy: it would also reject a WebP that was mislabeled with a `.mp4` name, because the decision is made on bytes.

**Why the others are slower / weaker mechanistically:**
- **remotion-webcodecs (18 ms, runner-up):** rejects with `"Image files are not supported"` (a remotion `@remotion/media-parser` classification of the input as an image). Correct and fast, but ~1.8x slower than mediabunny and one rung weaker in spirit — it classifies it as "image" rather than failing to resolve a media container; still a real byte/format-driven decision (env backend `webcodecs`, `pipeline:"streaming-backpressure"`).
- **ffmpeg.wasm (122 ms):** rejects via an adapter-level pre-check `isStillImageInput()` (src/engines/ffmpeg-wasm/adapter.ts:812-817, thrown at adapter.ts:2166-2167 `"transcode rejected still-image input"`). This is a **filename/MIME suffix heuristic** (`/\.(?:jpe?g|png|webp|gif|bmp|avif)$/`), not a libav format probe — honest and correct for this fixture, but ~12x slower and weaker provenance (it short-circuits on the `.webp` extension before invoking the wasm core). The 122 ms is largely wasm module/setup overhead, not real work.
- **platform (1,375,856 ms ≈ 22.9 min):** the worst. The raw-platform transcoder feeds the blob into an `HTMLVideoElement` and waits for `loadedmetadata` (src/engines/platform/transcode.ts:91 `whenMetadata`). A still WebP never fires `loadedmetadata` on a `<video>` element, so the path falls into the metadata timeout (`reject(new Error('transcode source metadata timeout'))`, transcode.ts:177-182). It does eventually reject (so graceful-failure PASSes), but only after an enormous wall — the cached durationMs of 1,375,856 ms reflects the timeout/queueing cost. This is a PASS by the letter of the oracle but the polar opposite of a cheap, intentional rejection: 137,586x slower than mediabunny.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS but lost on performance: 18 ms vs mediabunny's 10 ms (~1.8x slower). Rejects via image classification (`"Image files are not supported"`) rather than container-resolution failure.
- **ffmpeg.wasm@0.12.15** — PASS but lost: 122 ms (~12x slower). Rejection comes from a filename-suffix heuristic (adapter.ts:812-817), not a real libav format probe; correct here but weaker provenance.
- **platform@chrome-149** — PASS but effectively a degenerate pass: 1,375,856 ms (~137,586x slower) because a still WebP never raises `loadedmetadata` on `<video>`, so it only fails after the metadata timeout (transcode.ts:177-182). Technically graceful, practically a hang masquerading as a clean reject.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". Honest — MP4Box.js is a parser/muxer, not a re-encoder; no transcode capability is declared.
- **remotion-media-parser@4.0.479** — NA_ENGINE: same; media-parser is demux/probe-only and does not declare `transcode`. Honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE: same; web-demuxer is a demuxer only, no transcode. Honest NA.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/transcode/index.ts:1540-1545 (`negative_webp_to_video`), built into a Scenario at index.ts:1603-1620 with `op:'transcode'`, `oracles:['graceful-failure']`, `metrics:['wall']`, `timeoutMs: TC_EDGE_TIMEOUT_MS`. Notes: "WebP (still image) → video transcode negative. Engines with transcode support must reject the still image cleanly."
- **Fixture:** `fixtures/media/image.webp` exists (~10 KB; `file` => `RIFF ... Web/P image, VP8 encoding, 640x480`). Real, non-synthetic still image — the correct adversarial input for a "reject the image" negative test.
- **Oracle:** `gracefulFailure` at src/core/oracles.ts:2586-2623. It is a genuine inverted gate: PASS only when the operation threw/rejected and produced no `output/metadata/demux/frames` (lines 2608-2609), or for the explicit `gracefulAllowOutput` opt-in (not set here). It cannot be satisfied by emitting a fake/copied output — producing any output from this non-`gracefulAllowOutput` scenario returns FAIL (lines 2614-2617). So a PASS genuinely means a clean refusal.
- **Winner adapter:** mediabunny resolves format at src/engines/mediabunny/adapter.ts:418 (`input.getFormat()`); the cached reason `"Input has an unsupported or unrecognizable format."` is the mediabunny library's own format-resolution error on RIFF/WebP bytes — real implementation, no canned output, no copy-through, no golden short-circuit, no swallowed error reported as success.
- **Cross-check on others:** ffmpeg's `isStillImageInput` (adapter.ts:812-817) and platform's `<video>` metadata timeout (transcode.ts:177-182) are both real code paths that throw; none fakes output.
- **Cached note:** ALL four PASS results have `cached==true` (mediabunny startedAt 2026-06-22T16:55:51Z; platform 14:13Z; ffmpeg 14:12Z; remotion-webcodecs 17:00Z). Numbers are reused, not freshly re-run, so the exact durationMs values carry staleness risk — but the ORDERING (mediabunny fastest, platform pathological) is robust and consistent with the code paths.
- **Verdict: REAL.** Real fixture + real library-driven rejection in the winner + a meaningful, non-trivially-satisfiable inverted oracle. The mediabunny win is genuine. (The platform PASS is real-but-degenerate; it does not affect the winner.)

## Confidence & caveats

- Confidence: **high** on the winner and verdict. Correctness is tied across all 4 PASS engines (one binary oracle), and mediabunny's wall lead is unambiguous and mechanistically explained.
- Caveats: (1) All winners are cached, so absolute ms are stale; the relative ranking is what matters and is code-consistent. (2) No `bench{}` object exists for this scenario (wall-only metric), so spread/n/mad cannot be reported — durationMs is single-shot evidence (weaker than a multi-sample bench), but the 10 vs 18 vs 122 vs 1,375,856 ms gaps are far larger than any plausible single-run noise. (3) ffmpeg's pass relies on a filename-suffix heuristic; it would behave differently for an extension-stripped WebP, which is a robustness caveat against ffmpeg, not against the winner.
