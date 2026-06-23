# streaming-output/webm_headerless_live_stream

family: streaming-output | fixture asset: `recorder_headerless.webm` (192 KB, real VP8+Opus WebM) | primaryMetric: wall (ms) | passCount: 1/7

## Verdict

- Best framework: **mediabunny@1.48.0** (uncontested — exactly 1 PASS).
- Contested: no. Six of seven engines returned NA_ENGINE (capability not declared); mediabunny was the only engine that both declared the operation and produced a valid, re-importable headerless/live WebM.
- Decisive factor: mediabunny is the only engine declaring the `remux` op AND the `headerless` feature, and it emitted a genuine append-only Matroska Segment that satisfied BOTH gating oracles: `reference-reimport` (139 packets, 47 keyframes, 2 media tracks, durationDelta 0s) and `webm-live-layout` (unknown-size Segment at offset 39, no SeekHead, no Segment Duration, 1 Cluster).
- Margin over runner-up: not applicable (no other PASS to compare). Absolute performance: wall median 15.86 ms (n=1), throughputRealtime 194.45x, 95 target writes, 188429 bytesOut, longtasks 185 ms.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | reference-reimport:true, webm-live-layout:true | 15.86 ms | 194.45x | 0 (not sampled) | 185 ms | won; both gates passed |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'headerless' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'headerless' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

Note: peakMemory has n=0 samples (not instrumented in this run), so it is not a usable discriminator here; it would not matter regardless since there is a single eligible engine.

## Why the winner wins (deep technical)

The operation is a WebM→WebM remux of a Chrome-MediaRecorder-style headerless/"live" source (`recorder_headerless.webm`: VP8 video 320x240@30, Opus stereo 48 kHz, ~3.084 s per the golden meta) into an append-only, unknown-size Matroska Segment streamed through a `StreamTarget`. The challenge is structural, not transcode: produce a WebM that a MediaRecorder-style consumer/MSE would accept — a Segment whose size header is the EBML "unknown" sentinel, with no SeekHead and no Info/Duration element (those require a global seek table and a finalized duration, which a live stream cannot know up front), yet still parseable into the original elementary streams.

Mechanistically, mediabunny's `remux` path (src/engines/mediabunny/adapter.ts:1244) opens the input, builds the output format via `makeOutputFormat(opts.container, outputFormatOptionsFrom(opts))` (adapter.ts:1250), and crucially threads the `appendOnly` flag through `outputFormatOptionsFrom` (adapter.ts:193-198), which sets `appendOnly: true` on the WebM output format. That single flag is what makes mediabunny's muxer omit the SeekHead, omit the Segment Duration, and write the Segment with an unknown size — exactly the live profile the scenario demands. The output is written through a real `mb.StreamTarget(writable)` (adapter.ts:801), with each muxer write counted by an instrumented WritableStream (adapter.ts:786-799); the run recorded 95 target writes and 188429 output bytes, confirming the muxer actually streamed chunked output rather than buffering a single blob. The backend was `webcodecs` / `prefer-hardware`, pipeline `streaming-lockstep`, `coopCoep: not-required`, `wasmThreads: 0` (pure-TS ESM core) per env.configUsed — no SharedArrayBuffer / COOP-COEP requirement, which matters for a streaming live profile.

The two oracles confirm correctness independently. `webm-live-layout` (src/core/oracles.ts:485) re-parses the emitted bytes with a real EBML reader and asserts the structural live invariants: it measured `segmentUnknownSize: 1` (Segment size == EBML unknown sentinel, oracles.ts:509/517), `seekHeadCount: 0` (oracles.ts:504/520), `segmentDurationPresent: 0` (no Info>Duration, oracles.ts:503/523), `clusterCount: 1` (oracles.ts:506/526), `cuesCount: 0`, with the Segment at byte offset 39. Any of those failing (e.g. a finalized Segment size, an injected SeekHead, or a written Duration) would have failed the gate — so this is a real structural proof, not a smoke test. `reference-reimport` (oracles.ts:1225 → semanticRemuxReimport at oracles.ts:1273) feeds the emitted WebM back into the reference demuxer and checks semantic identity: it recovered 139 packets, 47 keyframes, 2 media tracks vs golden's 2 (oracles.ts:1289 track-count + oracles.ts:1292-1298 layout match), with `durationDeltaSec: 0` inside `durationToleranceSec: 0.5` (oracles.ts:1311-1322). Recovering both the video and audio track and the full packet/keyframe set from a headerless Segment proves the append-only output is genuinely demuxable, not merely well-formed at the top level.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'headerless'". Honest NA. ffmpeg can mux WebM, but this adapter does not advertise the live/append-only unknown-size-Segment profile, so the runner correctly skips it rather than letting it emit a normal finalized Segment that would fail webm-live-layout.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: same "does not declare feature 'headerless'". Honest NA; its conversion path targets finalized outputs, not the unknown-size live profile.
- **web-demuxer@4.0.0** — NA_ENGINE: "does not declare operation 'remux'". Honest — web-demuxer is a demux/parse-only library (libav-based demuxer); it has no muxer, so it cannot produce a remuxed WebM at all.
- **platform@chrome-149** — NA_ENGINE: "does not declare operation 'remux'". Honest — the platform engine is WebCodecs decode + bespoke demuxers (demux-webm.ts, demux-mp4.ts); it has no general-purpose muxer/remux op.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "does not declare operation 'remux'". Honest — media-parser is a parser/demuxer, not a muxer.
- **mp4box@2.3.0** — NA_ENGINE: "does not declare input container 'webm'". Honest — mp4box.js is ISO-BMFF/MP4 only and cannot ingest a Matroska/WebM source, so it is correctly gated out at the input-container check.

All six NAs are genuine capability gates (op / feature / input-container not declared), not under-declarations: none of these libraries can both ingest WebM and emit a headerless append-only Matroska Segment.

## Anti-cheat validation

- Scenario definition: src/scenarios/streaming-output/ts-webm-live.ts:63 (`id: 'webm_headerless_live_stream'`), shape `{ container: 'webm', target: 'stream', appendOnly: true }`, `features: ['headerless']`, oracles `['reference-reimport']` (the runner additionally attaches `webm-live-layout` for the live profile — both appear in the shard). Rationale in notes (lines 74-78) and file header (lines 19-24): playback-smoke is deliberately avoided because a live WebM may not plain-`<video>`-play; the genuine MSE-appendability proof is acknowledged as out of scope, and the two attached oracles are documented as the honest gates.
- Fixture: `recorder_headerless.webm` exists at fixtures/media/recorder_headerless.webm (192 KB, real file — not synthetic/empty). Goldens present: `.meta.json` (VP8+Opus, 3.084 s), `.packets.json` (16 KB), `.frames.json`, `.ssim.json`. Golden meta declares 2 media tracks, matching the reimport's `goldenMediaTracks: 2`.
- Winner adapter: src/engines/mediabunny/adapter.ts:1244 (`remux`) → real `this.lib.Output` + `runConversion` over a real `mb.StreamTarget` (adapter.ts:801); `appendOnly` threaded at adapter.ts:193-198. No canned output, no input→output copy, no short-circuit to golden, no error swallowing — output bytes are measured (188429) and chunk-counted (95 writes).
- Oracles: webm-live-layout (src/core/oracles.ts:485) performs real EBML parsing with explicit fail branches for finalized Segment size, present SeekHead, present Duration, and zero Clusters — not trivially satisfiable. reference-reimport (src/core/oracles.ts:1225 / semanticRemuxReimport 1273) re-demuxes the output and checks track count, track layout, and duration within tolerance. Measurements are physically plausible: 139 packets / 47 keyframes for a ~3 s 30fps VP8+Opus clip, durationDelta exactly 0s within 0.5s band.
- Verdict: **REAL**. Real fixture, genuine streaming remux implementation, and two non-trivial structural/semantic oracles. The only soft spot (per the scenario's own notes) is the absence of an actual MSE `SourceBuffer.appendBuffer` playback proof — but the structural live-layout + semantic reimport gates together are a strong, honest substitute, well above smoke level.
- Cached note: mediabunny's result has `cached: false` (startedAtIso 2026-06-22T17:34:17Z, durationMs 3666) — freshly run this batch, no staleness risk.

## Confidence & caveats

- Confidence: high. Single eligible engine with two passing real oracles and a fresh (non-cached) run; all six NAs are verifiably honest capability gates.
- Caveats: (1) This is an uncontested win — there is no head-to-head performance comparison, so the absolute wall/throughput numbers (n=1, mad=0) are single-sample and only weak evidence of speed, though correctness is the load-bearing result here. (2) peakMemory was not sampled (n=0). (3) The live profile is proven structurally and semantically but NOT through real MSE playback (acknowledged out-of-scope in the scenario header); a future MSE-appendability oracle would strengthen the gate further.
