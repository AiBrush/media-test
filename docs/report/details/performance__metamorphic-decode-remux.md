# performance/metamorphic-decode-remux

family: performance · fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 1080p30 + AAC 48 kHz stereo, 30 s) · primaryMetric: `throughputRealtime` · passCount: 2 / 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** — CONTESTED (2 PASS: ffmpeg-wasm and mediabunny).
- **Decisive factor: performance under equal correctness.** Both PASS engines satisfied the *exact same* two oracles at *identical strength* (`property-invariant` decode-remux bit-exact 12/12 frames, plus `reference-reimport` semantic round-trip). Correctness is a tie, so the ranking falls to the primary performance metric.
- **Margin over runner-up (mediabunny):** `throughputRealtime` 90.96x vs 76.09x = **1.20x faster** realtime; `wall` median 329.83 ms vs 394.25 ms = **1.20x lower** wall. Both samples are `n==1` (single timed run, `mad==0`, `p95==median`), so the margin is real but low-confidence as a sample. Both results are `cached==true`.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | property-invariant:pass, reference-reimport:pass | 329.83 ms | 90.96x | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass, reference-reimport:pass | 394.25 ms | 76.09x | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |

(peakMemory / longtasks were not captured in the `bench{}` block for this scenario; only `throughputRealtime` and `wall` were measured.)

## Why the winner wins (deep technical)

The operation is **remux H.264-in-MP4 → MKV (Matroska)** with `options.invariant='decode-remux'` (scenario `src/scenarios/performance/metamorphic.ts:99-119`). This is a stream-copy / re-wrap path: no pixels are re-encoded, the H.264 AVC NAL units and AAC ADTS/raw frames are lifted out of the ISO-BMFF `mdat`/`moov` sample tables and rewritten into Matroska clusters/blocks. The challenge is doing it (a) bit-exactly (so `decode(remux(x)) == decode(x)`) and (b) fast.

**Correctness is a true tie.** Both engines passed:
- `property-invariant` decode-remux: the oracle (`src/core/oracles.ts:2686-2707`) decodes `ctx.output` (the MKV) *with the platform WebCodecs decoder* and SHA-256-compares the normalized RGBA frame digests against the offline-baked golden `decode(x)` in `fixtures/golden/h264_1080p_30s.mp4.frames.json` (12 real baked digests, `pending:false`, baked by the platform engine on Chrome 149). Both engines report `measuredFrames:12, goldenFrames:12, comparedFrames:12, mismatchedFrames:0` — i.e. the H.264 NAL payloads survived the MP4→MKV rewrap byte-for-byte; the decoder produced pixel-identical frames. This is the **strongest** rung on the ladder (bit-exact frame digest) and both clear it.
- `reference-reimport` (`src/core/oracles.ts:1225-1271`, `semanticRemuxReimport` 1273+): the reference engine demuxes the produced MKV and checks track count + duration vs golden. ffmpeg-wasm: `2308 packets, 1423 keyframes, 2 media tracks, durationDelta 0.042 s ≤ 0.1 s`. mediabunny: `2310 packets, 1425 keyframes, 2 media tracks, durationDelta 0.080 s ≤ 0.1 s`. Both round-trip to the expected 2-track (H.264 + AAC) layout with ~30 s duration.

So the gate is satisfied identically; the win is **throughput**.

**Mechanistically why ffmpeg-wasm is faster here.** ffmpeg-wasm's `remux` (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) runs a single native FFmpeg invocation: `-i <in> -map 0 -c copy <out.mkv>`. `-c copy` means the demuxer reads ISO-BMFF sample tables and the Matroska muxer writes blocks with **no codec touching the bitstream** — it is essentially a memcpy-of-packets loop inside compiled wasm with FFmpeg's mature, tight MP4 demux + MKV mux state machines. `-map 0` explicitly maps every stream so the second (audio) track is not dropped. The MKV branch takes neither the `+faststart` MP4 rewrite nor the TS muxdelay path, so there is no second pass over the output. On this 30 s / 31 MB asset that pure copy completes in 329.83 ms wall (90.96x realtime).

mediabunny's `remux` (`src/engines/mediabunny/adapter.ts:1244-1260`) opens the input, builds a Matroska output format, and drives `runConversion` over an instrumented output target — a pure-TS/ESM pipeline (`env.configUsed.coreBuild:"pure-ts-esm"`, `backend:"webcodecs"`, `pipeline:"streaming-lockstep"`). For a stream-copy remux the codec stays untouched, but the per-packet JS orchestration, the streaming-lockstep queueing, and the instrumented target add overhead relative to FFmpeg's compiled inner loop. Result: 394.25 ms wall / 76.09x realtime — 1.20x slower on both metrics. The 2-packet difference (2308 vs 2310) and 0.042 s vs 0.080 s duration delta are within tolerance and reflect minor differences in how each muxer handles trailing/edit-list samples; neither is a correctness defect.

ffmpeg-wasm here is single-threaded wasm (`env` shows no SharedArrayBuffer/COOP-COEP context for ffmpeg), so this is not a multi-thread advantage — it is the raw efficiency of the compiled C demux/mux copy loop beating a JS-orchestrated conversion for a no-transcode rewrap.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS but lost on speed: same oracles, same strength, but 1.20x slower wall (394.25 ms vs 329.83 ms) and 1.20x lower realtime throughput (76.09x vs 90.96x). The JS/ESM streaming-lockstep conversion path costs more than FFmpeg's compiled `-c copy` for a pure rewrap. No correctness penalty.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: web-demuxer is a demux-only library, no muxer. Genuine capability gap.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: the raw WebCodecs/platform surface decodes and encodes but has no container muxer abstraction declared for remux.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest: it is a parser/probe library, not a muxer.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest: mp4box is ISO-BMFF only; it can write MP4 fragments but not Matroska, so the MKV output target is genuinely outside its capability set.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest: its container support does not include Matroska as a write target.

All five NA verdicts are physically honest (demux-only / parser / MP4-only muxers), not under-declared capabilities being dodged.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/performance/metamorphic.ts:99-119` (`id: 'performance/metamorphic-decode-remux'`), op `remux`, input `h264_1080p_30s.mp4`, options `{ container: 'mkv', invariant: 'decode-remux' }`, oracles `['property-invariant','reference-reimport']`, primary `throughputRealtime`.
- **Fixture exists & is real:** `fixtures/media/h264_1080p_30s.mp4` is present, 31 MB — a genuine 30 s 1080p30 H.264 + AAC MP4 (matches `fixtures/golden/h264_1080p_30s.mp4.meta.json`: mp4, 30 s, video h264 1920x1080 @30, audio aac 48 kHz stereo). Not synthetic/empty/mock.
- **Winner adapter is a genuine implementation:** `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` calls real FFmpeg wasm via `this.run(['-map','0','-c','copy', outName])`. No canned output, no input→output passthrough fake, no short-circuit to the golden file, no error-swallowing. It reads the produced MKV bytes back from MEMFS and returns them.
- **Oracles are real, non-trivial gates:**
  - `property-invariant` decode-remux (`src/core/oracles.ts:2686-2707`) decodes the engine's MKV output with the platform decoder and SHA-256 frame-digest compares against `fixtures/golden/h264_1080p_30s.mp4.frames.json`. That golden has `pending:false` and 12 real baked digests; if golden frames were missing the oracle FAILs (line 2691-2694), so it cannot be trivially passed. Measurements (12/12, 0 mismatches) are plausible for a lossless rewrap.
  - `reference-reimport` (`src/core/oracles.ts:1225-1271`) re-demuxes the output with the reference engine and checks track count + duration delta against golden, failing on empty packet tables. Measurements (2308/2310 packets, 1423/1425 keyframes, 2 tracks, 0.042/0.080 s delta ≤ 0.1 s) are physically plausible for a 30 s H.264+AAC remux.
- **Cached note:** BOTH PASS results are `cached==true` ("cached previous PASS result") — reused, not re-run in this pass. The timing margin (1.20x) and oracle outcomes are therefore from a prior run; staleness risk exists for the *numeric* throughput values, though the adapter code and goldens inspected here are current.
- **Verdict: REAL.** Real fixture + real `-c copy` FFmpeg remux implementation + a meaningful bit-exact frame-digest oracle plus a semantic re-import gate. The only caveat is the cached evidence and n==1 timing.

## Confidence & caveats

- Confidence: **high** on the correctness verdict (both engines clear a genuine bit-exact frame-digest gate against a real baked golden) and on the NA honesty of the five losers. Medium on the *magnitude* of the performance win: it is a clean 1.20x on both wall and throughput, but **n==1** per engine (`mad==0`, `p95==median`) and both results are **cached**, so the numeric margin is single-sample and potentially stale.
- The winner does not require COOP/COEP and ran single-thread wasm (`sharedArrayBuffer:false` context for ffmpeg); mediabunny used WebCodecs+pure-TS streaming. No bundle-size or hwAccel tiebreaker was needed — performance alone decided it.
- If re-run fresh with higher n, the ranking is unlikely to flip given the consistent 1.20x lead across both metrics, but a re-bake would harden the throughput numbers.
