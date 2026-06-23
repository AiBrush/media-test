# transcode/negative_jpeg_to_video

- family: transcode
- fixture asset: `fixtures/media/image.jpg` (real 22 KB baseline JPEG, JFIF 1.02, 640x480, 3 components)
- primaryMetric: none recorded (negative scenario; engines report only `durationMs`, no `bench{}`)
- passCount: 3 of 7 (mediabunny, platform, ffmpeg-wasm) — all via the single `graceful-failure` oracle

## Verdict

- Best framework: **platform@chrome-149** (uncontested on the only ranking axis available; see caveat).
- Contested: YES — 3 engines PASS, but all pass the *same* single oracle (`graceful-failure`) with identical
  correctness strength. There is no correctness differentiator, so the decision falls to performance.
- Decisive factor: lowest clean-rejection latency. platform rejects in **12 ms**, mediabunny in 13 ms,
  ffmpeg-wasm in 136 ms.
- Margin over runner-up: platform 12 ms vs mediabunny 13 ms = **1.08x faster** (effectively a tie, n=1,
  cached — see caveats). Both are **~11.3x faster** than ffmpeg-wasm (136 ms), which must spin up its wasm
  core before it can even reject the input.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | graceful-failure:pass | 12 ms (durationMs) | n/a | n/a | n/a | graceful: `<video>` error before metadata (transcode source) |
| mediabunny@1.48.0 | PASS | graceful-failure:pass | 13 ms (durationMs) | n/a | n/a | n/a | graceful: Input has an unsupported or unrecognizable format. |
| ffmpeg.wasm@0.12.15 | PASS | graceful-failure:pass | 136 ms (durationMs) | n/a | n/a | n/a | graceful: ffmpeg.wasm@0.12.15: transcode rejected still-image input |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare operation 'transcode' |
| remotion-webcodecs@4.0.479 | PASS-adjacent | graceful-failure:pass | 13 ms (durationMs) | n/a | n/a | n/a | graceful: Image files are not supported |

(Note: remotion-webcodecs also reported status=PASS via graceful-failure at 13 ms; it is a co-passer, not a
loser. There are effectively 4 PASS engines; the three NA_ENGINE rows are mp4box, remotion-media-parser,
web-demuxer.)

No engine has a `bench{}` block for this scenario — negatives are timed only by `durationMs`, so
throughputRealtime / peakMemory / longtasks are unavailable (shown n/a above).

## Why the winner wins (deep technical)

This scenario is an **A.16 image-negative**: a still 640x480 baseline JPEG (`image.jpg`) is handed to a
`transcode` op whose target is `{ container: 'mp4', video: { codec: 'h264' } }` (src/scenarios/transcode/index.ts:1528-1533).
There is no video elementary stream, no container, no timed samples — a JPEG is not a movie. The only correct
behavior is to detect "this is not transcodable media" and throw cleanly, with no partial MP4 emitted and no
crash/hang/OOM. The `graceful-failure` oracle (src/core/oracles.ts:2586-2623) inverts the usual semantics:
because the scenario lists `graceful-failure` among its oracles, `hasGracefulSignal` is true, and PASS is
awarded iff the op produced **no output** (`!ctx.output && !ctx.metadata && !ctx.demux && !ctx.frames`) while
not crashing (src/core/oracles.ts:2607-2609). All four passing engines reach that no-output state; they
differ only in *how fast and how cheaply* they get there.

platform (chrome-149) wins on latency. Its transcode source path uses an `<video>` element to ingest the
source (env.configUsed `decode: "VideoDecoder"`, source path `<video>→canvas→MediaRecorder(out)`,
`backend: webcodecs`, `hwAccel: true`). When fed JPEG bytes, the HTMLMediaElement fires an `error` event
**before metadata** is available ("`<video>` error before metadata (transcode source)") — the browser's
demux/sniff logic rejects the non-media payload almost immediately. There is no wasm module to instantiate
and no library buffer to parse: the rejection is a native event on the main thread, which is why it lands at
12 ms — the lowest of any engine here.

mediabunny is one millisecond behind (13 ms) but goes through a genuine library path. Its `transcode()`
(src/engines/mediabunny/adapter.ts:1271-1322) constructs the output format, then calls
`openInput(this.lib, input)` (adapter.ts:1287) and `mbInput.getTracks()` (adapter.ts:1293) **before** any
encoding. mediabunny's format sniffer does not recognize JFIF/JPEG as a media container and throws
"Input has an unsupported or unrecognizable format." — the exact string surfaced in the shard reason. The
throw happens inside the `try` and the `finally` disposes the input (adapter.ts:1308-1310); no `Output` is
written, so `ctx.output` stays undefined and the oracle passes. This is the cleanest *real-library* rejection
and is correctness-identical to platform; it loses only the 1 ms of native-vs-TS sniff overhead.

ffmpeg-wasm also rejects correctly ("transcode rejected still-image input") but pays the wasm tax: it must
have its single-thread core resident/initialized to probe the input, so even a clean reject costs 136 ms —
**11.3x** platform's 12 ms. Correctness is the same; the cost is the architectural floor of a wasm transcoder.

Because every passing engine clears the identical (and weak) oracle, the "win" here is narrow and is about
fail-fast efficiency, not transcode quality. The strongest claim that can be made is: platform and mediabunny
reject malformed image input an order of magnitude faster than the wasm engine, and platform does it with the
absolute lowest latency via the browser's native media-error path.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, runner-up): correct clean reject via real `openInput`/`getTracks`
  (adapter.ts:1287-1293), but 13 ms vs platform's 12 ms — 1 ms / 1.08x slower (noise-level; see caveats).
- **ffmpeg.wasm@0.12.15** (PASS): correct clean reject of the still-image input, but 136 ms — 11.3x slower
  than platform because the wasm core must be live to probe/reject. No correctness deficit, pure latency loss.
- **remotion-webcodecs@4.0.479** (PASS): correct clean reject ("Image files are not supported") at 13 ms —
  tied with mediabunny, 1 ms behind platform. Co-passer, not decisively worse on correctness.
- **mp4box@2.3.0** (NA_ENGINE): does not declare the `transcode` operation. Honest NA — MP4Box.js is a
  parser/segmenter/muxer, it has no encode/transcode pipeline, so declining is correct, not under-declared.
- **remotion-media-parser@4.0.479** (NA_ENGINE): does not declare `transcode`. Honest NA — it is a demuxer/
  parser only; transcoding is the sibling `remotion-webcodecs` engine's job.
- **web-demuxer@4.0.0** (NA_ENGINE): does not declare `transcode`. Honest NA — it is a wasm *demuxer*; no
  encoder, so it cannot legitimately offer a transcode op.

## Anti-cheat validation

- Scenario: src/scenarios/transcode/index.ts:1528-1533 (`id: 'negative_jpeg_to_video'`, `asset: 'image.jpg'`,
  `options: { container: 'mp4', video: { codec: 'h264' } }`). Gating rationale in `notes` (line 1531-1532)
  and the section header comment (lines 1506-1514): image negatives deliberately omit a pseudo-container so
  the `graceful-failure` oracle exercises clean rejection of non-media input.
- Fixture: `fixtures/media/image.jpg` EXISTS — verified via `file(1)`: "JPEG image data, JFIF standard 1.02 …
  baseline … 640x480, components 3", 22 KB. Real, non-synthetic, non-empty image. Correct negative input.
- Oracle: `gracefulFailure` at src/core/oracles.ts:2586-2623. For this scenario it takes the
  `hasGracefulSignal` branch (the scenario lists `graceful-failure`, oracles.ts:2606) and PASSes only when
  the op produced NO output/metadata/demux/frames (oracles.ts:2607-2609); it explicitly FAILs an engine that
  emits output from malformed input (oracles.ts:2614-2617). It is sound for a negative (throw=PASS,
  output=FAIL) but it is a **robustness/smoke-class gate**, not a bit-exact or structural correctness check —
  it verifies "rejected cleanly," not transcode fidelity.
- Winner adapter: platform transcode source path uses `<video>` ingest (env.configUsed
  `encode: "<video>→canvas→MediaRecorder(out)"`, `decode: "VideoDecoder"`); rejection is the native
  HTMLMediaElement error before metadata. mediabunny (runner-up) real path:
  src/engines/mediabunny/adapter.ts:1287 (`openInput`) and :1293 (`getTracks`) throw on the unrecognized
  format — no canned output, no input→output copy, no golden short-circuit. The `finally` (adapter.ts:1308)
  disposes input; nothing is written to `Output`.
- Verdict: **WEAK-GATE**. The fixture is real, the implementations genuinely attempt to open/probe the JPEG
  and throw, and the oracle does enforce "no output." But the only gate is `graceful-failure` — a robustness/
  smoke-class check, not a correctness gate. PASS is real but proves only clean rejection, not transcode
  quality; multiple engines tie at it. Measurements (12/13/136 ms, no output) are physically plausible for a
  fast reject of a 22 KB image. No evidence of mock data or a non-failable oracle.
- Cached note: ALL passing results have `cached: true` (mediabunny startedAt 2026-06-22T16:46Z, platform
  14:11Z, ffmpeg-wasm 16:47Z). Numbers were reused, not re-run this pass — staleness/timing-noise risk
  applies to the 12-vs-13 ms ordering in particular.

## Confidence & caveats

- Confidence: MEDIUM. The PASS/NA classification is unambiguous and the implementations are real, but the
  *winner* selection rests on a 1 ms gap (12 vs 13 ms) at n=1 with `cached: true` — that is within timing
  noise and could flip between platform and mediabunny on a fresh run. The only robust, defensible claim is
  the ~11.3x advantage of both native/TS engines over ffmpeg-wasm.
- This is a negative scenario: there is no transcode output to grade, so the strongest oracle in play is a
  smoke/robustness gate. Do not read this result as a transcode-quality ranking — it ranks fail-fast latency.
- No `bench{}` / `primaryMetric` data exists for this row; throughput/memory/longtask columns are unavailable.
- NA verdicts for mp4box, remotion-media-parser, and web-demuxer are honest capability gaps (no encoder),
  not under-declared transcode support.
