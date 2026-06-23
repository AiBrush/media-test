# demux/hls_aes128

- **family:** demux
- **fixture asset(s):** `fixtures/media/hls_aes128.m3u8` (+ `hls_aes128.key`, segments `hls_aes128_000.ts`..`hls_aes128_004.ts`)
- **primaryMetric:** wall (ms)
- **passCount:** 2 of 7 (mediabunny, ffmpeg-wasm)

## Verdict

- **Best framework:** `mediabunny@1.48.0`
- **Contested:** YES — two engines PASS (mediabunny, ffmpeg.wasm), both satisfying the single gating oracle `golden-packets` identically.
- **Decisive factor:** PERFORMANCE. Correctness is a dead heat — both recover the **exact same 770-packet plaintext table** (300 video + 470 audio across 2 tracks) with zero size/keyframe/timestamp drift. The tiebreaker is wall time: mediabunny **374.68 ms** vs ffmpeg.wasm **381.88 ms**.
- **Margin over runner-up:** **1.019x faster wall** (374.68 ms vs 381.88 ms; ~7.2 ms). This is a *thin* margin — see caveats: both samples are n=1 (mad=0, p95=median) and both results are `cached`. Secondary tiebreakers favor mediabunny more decisively (pure-TS ESM, no wasm thread/COOP-COEP requirement vs ffmpeg's multi-MB wasm core + MEMFS sidecar materialization).

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | golden-packets:pass (770/770, drift 1µs) | 374.68 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (770/770, drift 0µs) | 381.88 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare encryption scheme 'hls-aes128' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare encryption scheme 'hls-aes128' |

Note: the shard records only `bench.wall` for these two engines; throughputRealtime / peakMemory / longtasks were not captured for this demux scenario.

## Why the winner wins (deep technical)

**The operation.** This is HLS-AES-128 *demux*: the input is a multi-file VOD playlist (`#EXT-X-VERSION:3`, `#EXT-X-PLAYLIST-TYPE:VOD`) carrying H.264 video + AAC audio inside five MPEG-2 Transport Stream segments. Every segment is whole-segment AES-128-CBC encrypted, declared by a single `#EXT-X-KEY:METHOD=AES-128,URI="hls_aes128.key",IV=0x953e5e232e1585e615d9164ece153cf2`. To produce the packet table, an engine must: (1) parse the playlist, (2) fetch the sibling key (`366a63833fcc99941516c6239b0d3f11`) and each `.ts` segment relative to the playlist URL, (3) AES-128-CBC-decrypt each segment with the playlist IV, (4) demux the resulting clear TS, depacketize PES, and emit per-track encoded packets with sizes, keyframe flags and 90 kHz timestamps. The golden encodes the *unwrapped* 90 kHz origin: first video packet `ptsUs=1421333` (= 1421333µs, i.e. the raw MPEG-TS PCR origin, exactly as the scenario notes describe), size 24642, keyframe=true.

**What the gate measures.** The sole oracle is `golden-packets` (`src/core/oracles.ts:701-796`). It is a real, strict structural comparison: it asserts packet count equality, that the per-track index multiset matches (`trackLayout`/`sameLayout`), then groups both sides by `trackIndex`, sorts each group by dts→pts, and compares **position-by-position** — `size` and `keyframe` flags must match *exactly* (any mismatch fails), while timestamps are allowed only a *constant* per-track origin offset, with any varying residual beyond `tsTolUs = seekToleranceUs` (1000µs) counted as drift (`oracles.ts:774-792`). Anything except a faithful, fully-decrypted, correctly-depacketized stream fails this gate.

**Mediabunny's path.** The adapter detects the HLS asset via `isHlsAsset` (`src/engines/mediabunny/adapter.ts:170-174`, matching `.m3u8`/container hint) and opens it with a `UrlSource` + `mb.HLS_FORMATS` (`adapter.ts:246-252`) — a *pathed* source is mandatory so the library can resolve the sibling `.key` and `.ts` URLs relative to the playlist; mediabunny's segmented HLS reader resolves `#EXT-X-KEY` and AES-128-decrypts segment bytes before demux (declared at `adapter.ts:1042-1045,1070`). The packet table itself is built in `demux()` (`adapter.ts:1152-1183`): for each track it drains an `EncodedPacketSink` with `verifyKeyPackets:true` (`adapter.ts:1162-1167`) — this is what makes the `keyframe` flags trustworthy — and records `{trackIndex, size: pkt.byteLength, ptsUs: pkt.microsecondTimestamp, keyframe: pkt.type==='key'}`. Result in the shard: **measuredCount 770 = goldenCount 770, comparedTracks 2, maxPtsDriftUs 1** — a single-microsecond rounding residual, three orders of magnitude under the 1000µs tolerance. This runs on a `backend:webcodecs / coreBuild:pure-ts-esm / wasmThreads:0 / sharedArrayBuffer:false / coopCoep:not-required` config (shard `env.configUsed`), i.e. no cross-origin isolation and no wasm thread pool needed to do the decrypt+demux.

**Why mediabunny edges ffmpeg.wasm.** ffmpeg.wasm passes identically on correctness (`measuredCount 770, maxPtsDriftUs 0` — actually a hair *better* on timestamps), routing through FFmpeg's native `hls`/`applehttp` demuxer (`src/engines/ffmpeg-wasm/adapter.ts:77,167,512`). But to do so its `writeInput()` must first **materialize the playlist plus every referenced segment and key into MEMFS** and rewrite the playlist URIs (`adapter.ts:1854-1878`, `rewriteHlsPlaylistUris` `:937`) before the demuxer can open relative URIs — extra fetch + filesystem-staging work on top of loading the multi-MB emscripten core. That overhead shows up as the **7.2 ms (1.019x) wall gap** (381.88 vs 374.68 ms). Since correctness is tied, the decision falls to performance per the ranking rule (4b), and the secondary tiebreakers (4c) reinforce it: mediabunny is pure-TS ESM with no COOP/COEP and no wasm-thread requirement, versus ffmpeg's heavyweight wasm runtime and MEMFS sidecar staging.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASSed (golden-packets 770/770, drift 0µs) but *lost on speed*: wall 381.88 ms vs mediabunny 374.68 ms (0.98x; 7.2 ms slower). Mechanistic cause: it must materialize the playlist + 5 segments + key into MEMFS and rewrite URIs (`adapter.ts:1854-1878`) and carry a multi-MB wasm core, where mediabunny streams directly off a `UrlSource`. Correctness is a genuine tie, so this is purely the runner-up.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'hls'". Honest: web-demuxer is a single-file WASM-FFmpeg demuxer with no playlist/segment-resolution layer; it has no notion of multi-file `.m3u8` input. Genuine capability gap, not under-declaration.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'hls'". Honest: the WebCodecs/`MediaSource` platform path has no HLS playlist demuxer (Chrome desktop does not natively demux HLS); declaring `hls` would be false.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'hls'". Honest: MP4Box.js parses ISOBMFF only; it cannot read MPEG-TS segments, walk a playlist, or AES-128-decrypt. Correct NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare encryption scheme 'hls-aes128'". Honest: it can parse some containers but does not implement EXT-X-KEY AES-128 segment decryption; declaring it would be a cheat.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare encryption scheme 'hls-aes128'". Same as above — no AES-128 HLS decrypt path. Correct NA.

All five NAs are gated by `negotiate` Pass-1 declaration checks in `src/core/runner.ts:123-167` (container at :123-126, encryption at :165-167) and look like genuine missing capabilities, not under-declared ones.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/demux/index.ts:187-196` — `asset: 'hls_aes128.m3u8'`, `container: 'hls'`, `videoCodecs:['h264']`, `audioCodecs:['aac']`, `encryption:['hls-aes128']`. id derived as `demux/hls_aes128`. Notes: "#EXT-X-KEY segments must be decrypted before the PES packet table is recovered; golden matches the plaintext packet table."
- **Fixture exists (real, not synthetic):** `fixtures/media/hls_aes128.m3u8` (378 B real VOD playlist with AES-128 EXT-X-KEY + IV), `hls_aes128.key` (16 B), and five real encrypted TS segments `hls_aes128_000.ts`..`004.ts` (~900 KB each, ~4.5 MB total). Goldens present: `hls_aes128.m3u8.packets.json` (87 KB, **770 real packets**, first video pts 1421333µs, size 24642, kf=true), `.meta.json` (hls / 10 s / h264 1280x720@30 + aac 48 kHz stereo), `.keys.json`, `.segments.json`. Inputs and goldens are physically plausible for real H.264+AAC-in-TS media.
- **Gating oracle:** `src/core/oracles.ts:701-796` (`golden-packets`). Performs exact count + per-track size + keyframe-flag comparison with only a constant-origin timestamp tolerance (1000µs); not trivially satisfiable. No ssim/smoke shortcut here. Measurements in shard (770/770, comparedTracks 2, drift 0-1µs) are consistent with the golden.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts` — HLS open `:246-252`, demux/packet build `:1152-1183` (real `EncodedPacketSink` with `verifyKeyPackets`), HLS-AES128 declared `:1042-1045,1070`. Genuinely calls the real mediabunny API; no canned output, no copy-through, no golden short-circuit, no error swallowing (errors propagate from `sink.packets`).
- **Verdict:** **REAL** — real multi-file encrypted fixture, real library decrypt+demux path, strict structural oracle with physically plausible measurements.
- **Cached note:** Both PASS results have `cached:true` ("cached previous PASS result") — they were reused, not re-run in this pass. The PASS itself is real, but the *exact* 7.2 ms margin is stale and from n=1 samples; do not over-weight the timing.

## Confidence & caveats

- **Confidence:** medium. The verdict (mediabunny wins, REAL gate) is solid: two engines tie on a strict correctness oracle and mediabunny wins on both speed and the structural tiebreakers (no wasm threads, no COOP/COEP, no MEMFS staging).
- **Margin is thin and soft:** 1.019x wall (7.2 ms) on **n=1** samples (mad=0, p95=median for both), and both rows are **cached**. A fresh re-run could plausibly invert the wall ordering; the durable advantage is architectural (mediabunny's streaming pure-TS path vs ffmpeg's wasm + MEMFS sidecar materialization), not the precise millisecond count.
- Only `bench.wall` was captured for this scenario; throughputRealtime/peakMemory/longtasks were unavailable, so the performance ranking rests on wall alone plus tiebreakers 4c.
- ffmpeg.wasm is a fully legitimate co-winner on correctness (drift 0µs vs 1µs); calling it the "loser" reflects only the speed/architecture tiebreak, not a correctness deficit.
