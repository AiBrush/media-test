# probe/hls_vod

family: probe · fixture asset: `hls_vod.m3u8` (+ segments `hls_vod_000..004.ts`) · primaryMetric: wall (ms) · passCount: 4/7

## Verdict

- **Best framework: mediabunny@1.48.0** — CONTESTED (4 of 7 engines PASS).
- **Decisive factor: performance.** All four passing engines satisfy the *same single* oracle (`golden-metadata`) with the identical, perfect result (`durationDeltaSec: 0` against the golden 10 s, container `hls`, 2 tracks). Correctness is therefore a tie, so the ranking falls to the primary metric (wall median). mediabunny is the fastest by a wide margin.
- **Margin over runner-up (ffmpeg.wasm):** 21.19 ms vs 47.84 ms = **2.26x faster wall**. Over the remotion engines the gap is ~22x.
- **Caveat on strength of win:** n==1 (single timed sample, mad==0, p95==median), and every result is `cached==true`. The performance ordering is real but rests on one un-replicated sample per engine.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 21.19 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 47.84 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 468.77 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 483.22 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |

No engine reports throughputRealtime/peakMemory/longtasks in this shard; the only bench metric present is `wall`.

## Why the winner wins (deep technical)

**The operation.** This is a *playlist probe*. The input is an HLS VOD master/media playlist `hls_vod.m3u8` (`#EXT-X-PLAYLIST-TYPE:VOD`, `#EXT-X-VERSION:3`, 5 × `#EXTINF:2.000000` segments → 10 s) whose media is H.264 video + AAC audio carried in five sibling MPEG-TS segments (`hls_vod_000..004.ts`, ~900 KB each). The golden (`fixtures/golden/hls_vod.m3u8.meta.json`) requires: container `hls`, durationSec `10`, a video track (h264, 1280×720, 30 fps) and an audio track (aac, 48 kHz, 2 ch). The gating oracle `golden-metadata` (`src/core/oracles.ts:595`) compares container string, duration within tolerance, track count, and per-track codec/dims/fps/sampleRate/channels.

**Why mediabunny is fast and correct.** mediabunny opens HLS through a dedicated path: `openInput` detects the `.m3u8` asset (`isHlsAsset`, `src/engines/mediabunny/adapter.ts:170`) and constructs an `Input` with a `UrlSource` (mandatory PathedSource, because the playlist must resolve sibling segment URIs relative to its own path) and `formats: mb.HLS_FORMATS` (`adapter.ts:246-252`). The probe then runs `metadataFromInput` (`adapter.ts:417`), which deliberately takes the **cheap metadata path first** — `input.getDurationFromMetadata()` (`adapter.ts:429`). For HLS, mediabunny aggregates the `#EXTINF` segment durations from the playlist text alone (5 × 2.0 s = 10.0 s) instead of demuxing every TS segment to find the last packet. That is why duration matches the golden *exactly* (`durationDeltaSec: 0`, `durationToleranceSec: 1.5`) while the wall time stays at **21.19 ms** — no per-segment TS sample scan, no decode, no OOM walk. Track typing/codec come from `input.getTracks()` reading the first segment's PSI/PMT, yielding the h264 video + aac audio pair the golden demands ("metadata matches golden (2 track(s))"). The configUsed (`backend: webcodecs`, `coopCoep: not-required`, `sharedArrayBuffer: false`, `coreBuild: pure-ts-esm`) confirms a pure-TS demux with no wasm-thread/COOP-COEP cost — the playlist+PMT parse is plain JS, which is the cheapest possible way to satisfy a metadata-only gate.

**Why it beats the other three passers.** ffmpeg.wasm (47.84 ms) is correct but pays the wasm module/FS overhead of routing the playlist + at least one segment through libavformat's HLS demuxer; it is 2.26x slower for an identical metadata result. The two remotion engines (468.77 ms / 483.22 ms) run a `cpu-js` / `webcodecs` streaming parser (remotion-media-parser configUsed: `backend: cpu-js`, `pipeline: streaming`, `fieldsTier: full-parse(demux)`) that performs a heavier full-parse demux to reach the same two-track metadata — ~22x slower wall for no correctness gain on this single metadata-exact gate. Since the oracle ladder treats all four as equal in correctness (one structural/metadata-exact oracle, all `pass`, all `durationDeltaSec: 0`), the ~2.3x / ~22x wall advantage is the sole and decisive differentiator.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — PASS but lost on speed.** Identical correctness (golden-metadata pass, durationDeltaSec 0) but wall 47.84 ms = 2.26x mediabunny's 21.19 ms. Heavier wasm/libavformat HLS+TS path for a metadata-only probe.
- **remotion-media-parser@4.0.479 — PASS but lost on speed.** golden-metadata pass; wall 468.77 ms ≈ 22.1x mediabunny. cpu-js full-parse(demux) streaming pipeline over the segments is far costlier than mediabunny's playlist-aggregated duration shortcut.
- **remotion-webcodecs@4.0.479 — PASS but lost on speed.** golden-metadata pass; wall 483.22 ms ≈ 22.8x mediabunny (slowest passer). Same heavy demux path as the parser sibling.
- **platform@chrome-149 — NA_ENGINE.** "engine does not declare input container 'hls'." Honest: Chrome's WebCodecs/MediaSource platform exposes no synchronous HLS demuxer to this harness; not under-declared.
- **mp4box@2.3.0 — NA_ENGINE.** "engine does not declare input container 'hls'." Honest: mp4box parses ISOBMFF only; it cannot read an `.m3u8` playlist or MPEG-TS segments.
- **web-demuxer@4.0.0 — NA_ENGINE.** "engine does not declare input container 'hls'." Honest: web-demuxer's ffmpeg-core build is registered without an `hls` containersIn; no playlist resolver is wired, so a genuine non-declaration rather than a hidden capability.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/probe/index.ts:135-141` — `{ asset: 'hls_vod.m3u8', container: 'hls', videoCodecs: ['h264'], audioCodecs: ['aac'], notes: 'Playlist probe: duration aggregated across segments; engines lacking HLS negotiate NA.' }`. The notes match the observed behavior (duration aggregated across segments; non-HLS engines go NA_ENGINE).
- **Fixture exists and is real:** `fixtures/media/hls_vod.m3u8` (278 B, a real VOD playlist with `#EXT-X-PLAYLIST-TYPE:VOD`, 5 `#EXTINF:2.000000` entries, `#EXT-X-ENDLIST`) plus five real ~900 KB TS segments `hls_vod_000.ts`..`hls_vod_004.ts`. Not synthetic/empty/mock.
- **Oracle is real:** `golden-metadata` at `src/core/oracles.ts:595-657` does a genuine field-by-field compare against `fixtures/golden/hls_vod.m3u8.meta.json` (container string, duration within band, track count, per-track codec/dims/fps/sampleRate/channels via `compareTrack` `oracles.ts:659`). Not trivially satisfiable: it would fail on a wrong container, a track-count mismatch, or a duration outside the band. Measured `durationDeltaSec: 0` against golden 10 s is physically plausible for a 5×2 s VOD playlist.
- **Winner implementation is genuine:** mediabunny adapter `probe` (`src/engines/mediabunny/adapter.ts:1134`) → `metadataFromInput` (`adapter.ts:417`) → real library calls `getDurationFromMetadata()`/`getTracks()` over a real `UrlSource` + `HLS_FORMATS` Input (`adapter.ts:246-252`). No canned output, no copy-input-to-output, no short-circuit to the golden, no error swallowing that reports success.
- **Caveat — single-gate / cached.** This is a *metadata-only* probe: the lone gate is `golden-metadata` (structural/metadata-exact, not bit-exact). No golden-packets / decoded-frame oracle runs here, so the PASS proves correct *metadata*, not correct decoded media. All four PASS results are `cached==true` (reused, not re-run this invocation) — staleness risk noted, though the numbers are internally consistent.
- **Verdict: REAL.** Real playlist + real TS segments + real mediabunny HLS demux + a meaningful field-level metadata oracle. The gate is appropriate for a probe scenario (metadata-exact), and the win is decided on a real, if single-sample, performance margin.

## Confidence & caveats

- Confidence: **medium.** Correctness verdict is solid (real fixture, real impl, meaningful metadata oracle). The *winner ranking* rests purely on performance because all four passers tie on the single oracle, and each wall figure is n==1 (mad==0, p95==median) and `cached==true`. The 2.26x margin over ffmpeg.wasm is comfortable but un-replicated; the ~22x margin over the remotion engines is large enough to be robust to single-sample noise.
- The probe gate does not assert decoded-frame or packet-level correctness for HLS VOD, so "best" here means "fastest engine that returns golden-exact metadata," not "best decoder."
