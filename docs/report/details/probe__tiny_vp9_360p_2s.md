# probe/tiny_vp9_360p_2s

- family: probe
- fixture asset(s): `tiny_vp9_360p_2s.webm` (real corpus file, 155 KB, WebM/Matroska container, VP9 video + Opus audio)
- primaryMetric: wall (ms, single-shot probe latency; n=1, warmup=1)
- passCount: 5 of 7 (1 NA_ENGINE, 0 FAIL)

## Verdict

- Best framework: **mediabunny@1.48.0**
- Contested: yes — 5 engines PASS, all satisfying the identical single gate (`golden-metadata`). Correctness is therefore a tie, so the decision falls to performance (primaryMetric = wall).
- Decisive factor: lowest probe wall-time. mediabunny median **3.225 ms** vs runner-up remotion-webcodecs **6.755 ms**.
- Margin over runner-up: **2.09x faster wall** (6.755 / 3.225). Against the next non-WebCodecs demuxers it is ~2.6x (ffmpeg.wasm 8.40 ms), ~3.7x (remotion-media-parser 12.085 ms), ~4.06x (web-demuxer 13.09 ms), and ~1860x faster than the platform `<video>`-element path (6000.05 ms). Caveat: every engine has n=1 (mad=0, p95=median), so the spread is unknown and a single-sample win is weaker evidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 3.225 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 6.755 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 8.400 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 12.085 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:true | 13.090 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:true | 6000.050 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | — | n/a | n/a | n/a | engine does not declare input container 'webm' |

(No engine reported throughputRealtime, peakMemory, or longtasks in this shard — only the `wall` bench metric is populated.)

## Why the winner wins (deep technical)

The operation is a **metadata-only probe** of a WebM/Matroska file carrying a VP9 video track (640×360, 30 fps) and an Opus audio track (48 kHz, stereo), total duration 2.008 s. No frames are decoded; the gate (`golden-metadata`) only checks container token, duration within tolerance, and per-track codec/dims/fps/sampleRate/channels against `fixtures/golden/tiny_vp9_360p_2s.webm.meta.json`. So this is a pure container-parse / header-read race — backend GPU/WebCodecs power is irrelevant to correctness and largely irrelevant to speed; what matters is how cheaply the engine reaches the EBML/Segment header and track entries.

mediabunny ran with `backend:webcodecs`, `hwAccel:prefer-hardware`, `coreBuild:pure-ts-esm`, `coopCoep:not-required`, `sharedArrayBuffer:false`. For a probe, none of the WebCodecs/canvas machinery is exercised — its probe path is pure container parsing. The adapter opens the file via a mediabunny `Input` over a `BlobSource` (`src/engines/mediabunny/adapter.ts:245` `openInput`), then `metadataFromInput` (`src/engines/mediabunny/adapter.ts:417`) reads duration the **cheap way first**: `input.getDurationFromMetadata()` (`adapter.ts:429`), which reads the Matroska Segment/Info `Duration` element (with `TimecodeScale`) directly from the header WITHOUT scanning Clusters/SimpleBlocks. Only if that returns null/non-finite does it fall back to `computeDuration()` (`adapter.ts:436`). For this WebM the header carries a finite duration, so the fallback scan is skipped — that is the mechanism behind the 3.225 ms result: header-only read, no cluster walk. Track normalization (`adapter.ts:297` `normalizeTrack`) reads codec/dims from the TrackEntry getters and estimates fps from a 120-packet prefix (`computePacketStats(120)`), which for a 60-frame 2 s clip is bounded and cheap. The measured `durationDeltaSec` is **0** (golden 2.008 s, tolerance 0.04167 s ≈ ±1 frame at 24 fps band) — exact agreement, the strongest possible result this metadata oracle can report.

The runner-up, remotion-webcodecs (6.755 ms), is also exact (`durationDeltaSec:0`) but pays ~2.09x the wall. Its config advertises MP4-specific fast paths (`mp4-sample-table:http-range`, `MOV->MP4 ftyp rewrite`) that do nothing for a WebM input, so it falls back to its generic Matroska parse path with more per-call overhead than mediabunny's lean pure-TS reader. ffmpeg.wasm (8.40 ms) must instantiate/drive a wasm demuxer (libavformat) to read the header — heavier setup than a native-JS EBML reader for a 155 KB file. remotion-media-parser (12.085 ms, `backend:cpu-js`, `fieldsTier:metadata-only`) and web-demuxer (13.09 ms) both parse correctly but are slower JS/wasm container readers. The platform path (6000.05 ms) is catastrophically slow because it probes via a real `<video>` element + `MediaRecorder` pipeline (`encode:"<video>→canvas→MediaRecorder(out)"`); even for a metadata read it incurs element load/`loadedmetadata` event latency measured in seconds, ~1860x mediabunny — correct but utterly uncompetitive for a probe.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASS, exact metadata (`durationDeltaSec:0`), but lost on performance: 6.755 ms vs 3.225 ms = **2.09x slower wall**. Its declared adapter fast-paths are MP4/MOV-specific and don't apply to this WebM, so it uses the generic heavier parse path.
- **ffmpeg.wasm@0.12.15** — PASS, exact (`durationDeltaSec:0.002`, well within ±0.0417 s tol), but **2.6x slower** (8.40 ms). wasm/libavformat instantiation + demux overhead exceeds a pure-JS EBML header read for a 155 KB file.
- **remotion-media-parser@4.0.479** — PASS, exact (`durationDeltaSec:0`), but **3.75x slower** (12.085 ms). `backend:cpu-js`, single-thread JS parser; metadata-only tier but still slower per call.
- **web-demuxer@4.0.0** — PASS, exact (`durationDeltaSec:0`), but the slowest correct demuxer at **13.09 ms (4.06x)**.
- **platform@chrome-149** — PASS, exact (`durationDeltaSec:0.007`), but **6000.05 ms (~1860x slower)**: it probes through a `<video>` element/MediaRecorder pipeline, paying full element-load latency for a header read.
- **mp4box@2.3.0** — NA_ENGINE, reason "engine does not declare input container 'webm'". This NA is **honest**: mp4box.js is an ISO-BMFF (MP4/MOV/fragmented-MP4/CMAF) parser only (`src/engines/mp4box/adapter.ts:2-4`); it genuinely cannot parse WebM/Matroska. Not an under-declared capability.

## Anti-cheat validation

- Scenario definition: `src/scenarios/probe/index.ts:264-270` — asset `tiny_vp9_360p_2s.webm`, container `webm`, videoCodecs `['vp9']`, audioCodecs `['opus']`, notes "tiny bucket (~100 KB) 360p WebM — pairs with tiny_h264 so the tiny rung covers both families."
- Fixture exists: `fixtures/media/tiny_vp9_360p_2s.webm`, **155 KB real WebM** (not synthetic/empty/mock).
- Golden: `fixtures/golden/tiny_vp9_360p_2s.webm.meta.json` — real, independent metadata (container webm, duration 2.008 s, VP9 640×360@30, Opus 48 kHz/2ch, encoder "Lavf"). Plausible for a real 2 s 360p clip.
- Oracle: `src/core/oracles.ts:595` `goldenMetadata` — performs a REAL comparison: container token equality, duration within a per-container tolerance (here ±0.04167 s, the strict ~1-frame band, not a loose estimate band), and positional per-track codec/width/height/fps/sampleRate/channels diff (`compareTrack`, `oracles.ts:659`). Not trivially satisfiable: any wrong codec/dim/duration produces a `fail`. Measured `durationDeltaSec:0` for the winner is physically exact.
- Winner adapter: `src/engines/mediabunny/adapter.ts:417` `metadataFromInput` (+ `:429` cheap duration, `:297` `normalizeTrack`). Genuinely opens the file via the real mediabunny `Input`/`BlobSource` and reads real container/track data — no canned output, no copy-to-fake, no short-circuit to golden, no error-swallow-as-success.
- Verdict: **REAL**. Real 155 KB fixture, real library parse path, and a metadata-exact oracle with strict (~1-frame) duration tolerance and full per-track structural comparison. The gate is structural/metadata-exact (mid-strength on the ladder), not a smoke/perceptual proxy.
- Cached note: winner result has `cached:true` ("cached previous PASS result"), as do all 5 PASS engines. Numbers were reused, not re-run this pass — staleness risk exists, but it applies uniformly to all ranked engines so the relative ordering is internally consistent.

## Confidence & caveats

- Confidence: **high** on the winner and on the REAL verdict — the fixture, golden, oracle, and adapter all check out, and the win is mechanistically explained (cheap header-only duration read on a small WebM).
- Caveats: (1) every engine is **n=1** (mad=0, p95=median) — a single-sample wall win is weaker evidence; the 2.09x margin over remotion-webcodecs is comfortable but not multi-sample-verified. (2) All results are **cached**; a fresh run could shift sub-millisecond timings (though not the platform engine's seconds-scale gap). (3) The gate is metadata-only — this ranks probe latency/correctness, not decode fidelity; no decoded-frame or packet-level oracle is exercised here.
