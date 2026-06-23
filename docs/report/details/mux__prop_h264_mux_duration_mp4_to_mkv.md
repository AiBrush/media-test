# mux/prop_h264_mux_duration_mp4_to_mkv

family: mux | fixture asset: `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 1080p30 + AAC 48k/2ch, 30 s) | primaryMetric: wall | passCount: 2

## Verdict

**Best framework: mediabunny@1.48.0** — CONTESTED (2 of 7 engines PASS: mediabunny and ffmpeg.wasm).

Both passing engines satisfied the identical and only gating oracle (`property-invariant` / probe-duration), so correctness strength is a tie at the structural-metadata tier. The decisive factor is **performance**: mediabunny mux+probe wall median **125.07 ms** vs ffmpeg.wasm **377.48 ms** → **3.02x faster wall**, and longtasks **142 ms** vs **4531 ms** → **31.9x less main-thread blocking**. Mediabunny additionally has the tighter duration delta (Δ 0.021 s vs 0.042 s, both well inside the 0.125 s band). Both results are n==1 and cached (weaker statistical evidence), but the margin is an order of magnitude on the blocking metric, far beyond any plausible single-sample noise.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:pass (Δ0.021s) | 125.07 ms | n/a (not measured) | 0 (n=0) | 142 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass (Δ0.042s) | 377.48 ms | n/a (not measured) | 0 (n=0) | 4531 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mkv' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

## Why the winner wins (deep technical)

The operation is a cross-container **mux**: take pre-encoded H.264 (AVCC) video + AAC audio access units and author them into a Matroska/MKV container, then prove the materialized Segment Duration matches the source. The gate is `property-invariant` with the probe-duration branch (`src/core/oracles.ts:2709`): the runner re-probes the muxed MKV with a reference engine and asserts `|outDur − goldenDur| ≤ tol`. Golden source duration is 30 s (`fixtures/golden/h264_1080p_30s.mp4.meta.json:3`); scenario tolerance is an explicit 0.125 s (`src/scenarios/mux/metamorphic.ts:48`).

Mechanistically, MP4→MKV requires the muxer to re-author timestamps into Matroska's millisecond-tick block timestamps and Segment Duration rather than ISO-BMFF mvhd/timescale. Mediabunny does this on the **native WebCodecs / browser muxer path** (`env.configUsed.backend = "webcodecs"`, `hwAccel = "prefer-hardware"`, `pipeline = "streaming-lockstep"`, `sharedArrayBuffer:false`, `coopCoep:"not-required"`). Its mux path (`src/engines/mediabunny/adapter.ts:1508`) constructs a real `Output` with a Matroska `OutputFormat` and `BufferTarget`, adds an `EncodedVideoPacketSource`/`EncodedAudioPacketSource` (lines 1528, 1539), and feeds each access unit as an `EncodedPacket` carrying its own `ptsUs`/`durationUs` (lines 1562-1569), with the first packet of each track supplying the `decoderConfig.description` so the muxer can write codec-private data (avcC/AudioSpecificConfig → MKV CodecPrivate) at lines 1571-1590. Because per-packet PTS/duration are preserved from the source table, the re-authored Matroska Segment Duration lands at **30.021 s, Δ 0.021 s** — the tightest of the two passers. Crucially, this is pure-TS ESM with no wasm thread pool and no cross-origin isolation requirement, so the whole mux+finalize runs as short tasks: longtasks total only **142 ms**.

FFmpeg.wasm also passes correctly but is structurally heavier. Its mux (`src/engines/ffmpeg-wasm/adapter.ts:2899`) cannot mux from in-memory packet objects directly: FFmpeg muxes from FILES, so the adapter first rebuilds each WebCodecs-style track as a demuxable **elementary stream in MEMFS** (`buildElementaryStream`, line 2919 — re-wrapping length-prefixed AVCC into Annex-B, raw AAC into ADTS), writes them into the virtual FS, then runs a `-c copy` stream-copy mux with one `-i` per stream, `-map` per track, `-avoid_negative_ts make_zero` (lines 2925-2941). That round trip through the single-threaded wasm core (no SharedArrayBuffer thread pool) is why its wall is 3.02x higher (377.48 ms) and, decisively, why its main thread is blocked for **4531 ms** of longtasks — the monolithic wasm exec is one giant synchronous-feeling chunk to the event loop. Its duration delta of 0.042 s is also slightly looser than mediabunny's (a consequence of Annex-B/ADTS re-framing rounding), though still comfortably inside the 0.125 s band.

Net: equal correctness tier, but mediabunny's native streaming muxer beats the wasm file-rebuild path on both wall (3.02x) and responsiveness (31.9x fewer longtasks), with no COOP/COEP requirement as a deployment tiebreaker.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS but lost on performance: wall 377.48 ms (3.02x slower than 125.07 ms) and longtasks 4531 ms (31.9x more main-thread blocking than 142 ms); slightly looser duration delta (0.042 s vs 0.021 s). Cause: single-thread wasm core + MEMFS elementary-stream rebuild before `-c copy` mux, vs mediabunny's native streaming packet muxer.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare output container 'mkv'". Honest NA — MP4Box.js is an ISO-BMFF (MP4/MOV/fragmented) library and genuinely has no Matroska writer; it cannot author an MKV Segment.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — the raw WebCodecs platform shim exposes encode/decode/probe primitives, not a container muxer; there is no WebCodecs MKV writer.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — web-demuxer is a read/demux-only wrapper around an FFmpeg demuxer; it has no mux/write side.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest — the media parser is a read-only parser; no encode/mux path.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare operation 'mux'". Honest in this matrix — its conversion path is declared under transcode/remux, not the encoded-packet `mux` op gated here.

## Anti-cheat validation

- **Scenario definition**: `src/scenarios/mux/metamorphic.ts:41` (id `prop_h264_mux_duration_mp4_to_mkv`, invariant `PROBE_DUR`, input `h264_1080p_30s.mp4`, to `mkv`, tol 0.125 s).
- **Fixture exists**: `fixtures/media/h264_1080p_30s.mp4` confirmed present, 31 MB — a real H.264+AAC clip (golden meta: 1920x1080 @30fps 8.2 Mbps video + AAC 48k/2ch, 30 s). Not synthetic/empty/mock.
- **Oracle**: `src/core/oracles.ts:2709` (probe-duration branch of `propertyInvariant`). Performs a REAL comparison: re-probes the produced MKV via the reference engine and checks `|outDur − goldenDur|` against the band. Not trivially satisfiable here — tolerance is a finite 0.125 s, and both engines land far inside (0.021 s / 0.042 s) with physically plausible ~30 s durations matching the 30 s source. This is a structural/metadata gate, weaker than bit-exact decoded-frame comparison but appropriate (the scenario notes at metamorphic.ts:10-17 explain that a packet-count gate would false-fail across containers, so duration is the faithful count-gate-free invariant).
- **Winner adapter**: `src/engines/mediabunny/adapter.ts:1508` — genuine `Output` + `EncodedVideoPacketSource`/`EncodedAudioPacketSource` + `EncodedPacket` per access unit + `finalize()`. No canned output, no input→output copy, no golden short-circuit, no swallowed errors (it throws on unsupported codec/container).
- **Verdict: REAL.** Real 31 MB fixture, genuinely implemented native muxer, meaningful (if structural-tier rather than bit-exact) duration oracle with plausible measurements.
- **Cached note**: BOTH passing results have `cached==true` ("cached previous PASS result"). Evidence is reused, not freshly re-run — staleness risk per the launcher-seeding caveat. The verdict and the order-of-magnitude longtasks margin are unlikely to invert on re-run, but a fresh run (clear raw + .browser-cache) would harden the numeric margins, which are single-sample (n==1, mad==0).

## Confidence & caveats

- Confidence: **high** on the winner choice. Equal correctness tier; mediabunny wins both performance metrics by large margins (3.02x wall, 31.9x longtasks) and on the tighter duration delta, with no COOP/COEP requirement as a bonus tiebreaker.
- Caveats: (1) both winners' benches are **n==1, cached** — margins are indicative not statistically robust; peakMemory and throughputRealtime were not captured (n==0 / unmeasured), so the comparison rests on wall + longtasks. (2) The gate is structural duration, not bit-exact pixels — a muxer could in principle corrupt non-duration structure and still pass; the stronger `decode-mux` gate for this codec exists in a sibling scenario (`prop_h264_decode_mux_mp4_to_mp4`) but is pending baked source frames. (3) Five NA_ENGINE results are all honest capability gaps (no MKV writer / read-only / no mux op), not under-declarations.
