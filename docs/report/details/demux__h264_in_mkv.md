# demux/h264_in_mkv

family: demux | fixture asset: `h264_in_mkv.mkv` (Matroska, H.264 video + AAC audio, 1280x720@30fps, 10.021s, 4.4 MB) | primaryMetric: wall | passCount: 6 of 7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 6 of 7 engines PASS).
- Decisive factor: **performance**. Correctness is a dead heat — all 6 passing engines satisfied the single gating oracle `golden-packets` identically (770/770 packets, comparedTracks=2, maxPtsDriftUs=0). With correctness indistinguishable, the wall-clock primaryMetric decides, and mediabunny is the fastest at **22.835 ms** wall median.
- Margin over runner-up: mediabunny 22.835 ms vs ffmpeg.wasm 53.335 ms = **2.34x faster wall**. Against the rest the gap widens dramatically: 3.33x vs remotion-media-parser (75.96 ms), 4.37x vs remotion-webcodecs (99.845 ms), 28.5x vs web-demuxer (651.93 ms), and 263x vs platform (6002.285 ms).

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:pass (770/770, drift 0µs) | 22.835 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (770/770, drift 0µs) | 53.335 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (770/770, drift 0µs) | 75.96 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (770/770, drift 0µs) | 99.845 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:pass (770/770, drift 0µs) | 651.93 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-packets:pass (770/770, drift 0µs) | 6002.285 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mkv' |

The shard's `bench` block carries only the `wall` metric; throughputRealtime/peakMemory/longtasks were not recorded for this demux row (n/a). Every passing run has n=1 (single sample, mad=0, p95==median), so the timing evidence is one observation per engine — see caveats.

## Why the winner wins (deep technical)

This row is a pure read-side demux of H.264-in-Matroska. The container is EBML/Matroska (not ISO-BMFF), so the demuxer must parse the EBML element tree, walk Cluster/SimpleBlock (or BlockGroup) structures, recover per-block laced/unlaced frame sizes, and emit the H.264 video and AAC audio packets with their Matroska 1-ms-granular timestamps. The golden (`fixtures/golden/h264_in_mkv.mkv.packets.json`, 87 KB) encodes exactly that: audio packets ~290–420 bytes, video packets ~14–25 KB, a leading audio packet at ptsUs=-21000 (container priming), and keyframe flags. The gating oracle requires byte-exact `size`, exact `keyframe` flags, exact packet count, and per-track timestamps within ±1 ms after a constant per-track origin shift (`src/core/oracles.ts:761-795`).

mediabunny's demux is a genuine library walk, not a shortcut. `src/engines/mediabunny/adapter.ts:1152-1183` opens the file as a `mb.Input` over a `BlobSource`/`BufferSource` (`openInput`, adapter.ts:245-278), enumerates tracks via `getTracks()`, then for each track constructs an `EncodedPacketSink` and iterates `sink.packets(undefined, undefined, { verifyKeyPackets: true })` (adapter.ts:1162-1167). Each yielded `EncodedPacket` contributes `byteLength` → `size`, `microsecondTimestamp` → `ptsUs`/`dtsUs`, and `pkt.type === 'key'` → `keyframe`. The `verifyKeyPackets: true` flag forces mediabunny to actually inspect the bitstream for true keyframe status rather than trusting the container's possibly-coarse flag — which is exactly why its keyframe column matches golden with zero mismatches. That this yields 770/770 packets and maxPtsDriftUs=0 confirms its Matroska SimpleBlock parser and µs timestamp normalization are bit-faithful.

Performance is where it separates from the field. mediabunny is a pure-TS ESM core (`env.configUsed.coreBuild: "pure-ts-esm"`, `sharedArrayBuffer: false`, `coopCoep: "not-required"`) running in-process with no WASM module to instantiate and no worker round-trip. For a 4.4 MB whole-file demux it just streams the EBML tree and emits packet descriptors — 22.835 ms. ffmpeg.wasm (runner-up, 53.335 ms) pays for libavformat running inside a WASM sandbox plus FS marshalling of the input file; correct, but 2.34x slower. The two Remotion engines (75.96 / 99.845 ms) use a JS parser (`backend: "cpu-js"` for media-parser) and a WebCodecs-oriented streaming pipeline whose per-packet bookkeeping adds overhead even though demux itself doesn't decode. web-demuxer (651.93 ms) wraps an ffmpeg-WASM build behind a worker/message bridge, so it eats both WASM startup and postMessage serialization for every packet batch — 28.5x slower. platform@chrome-149 (6002.285 ms) is catastrophically slow here because Chrome has no script-accessible Matroska demuxer; the adapter has to drive the H.264-in-MKV through a `<video>`/MediaSource-style path to enumerate packets, which is two-and-a-half orders of magnitude heavier than a native EBML parser. mediabunny avoids every one of those tax lines: no WASM, no worker hop, no media-element fallback — just a direct typed-array walk of the container.

## What each other framework did wrong

- **mp4box@2.3.0** — NA_ENGINE, honest. It declares `containersIn: ['mp4', 'mov']` (`src/engines/mp4box/adapter.ts:645`); mp4box.js is an ISO-BMFF-only parser and structurally cannot read EBML/Matroska. The NA is correct, not an under-declared capability.
- **ffmpeg.wasm@0.12.15** — PASS, but lost on speed: 53.335 ms vs 22.835 ms (2.34x slower). libavformat-in-WASM plus virtual-FS file marshalling overhead; identical correctness (770/770, drift 0µs).
- **remotion-media-parser@4.0.479** — PASS, lost on speed: 75.96 ms (3.33x slower). Pure JS demux (`backend: "cpu-js"`, `fieldsTier: "full-parse(demux)"`); same exact packet table.
- **remotion-webcodecs@4.0.479** — PASS, lost on speed: 99.845 ms (4.37x slower). WebCodecs-centric streaming-backpressure pipeline adds per-packet overhead for a pure-demux job; same exact packet table.
- **web-demuxer@4.0.0** — PASS, lost badly on speed: 651.93 ms (28.5x slower). ffmpeg-WASM behind a worker bridge; WASM init + postMessage serialization dominate. Same exact packet table.
- **platform@chrome-149** — PASS, but 6002.285 ms (263x slower). No native script-accessible Matroska demuxer in Chrome; forced through a media-element/MSE path. Correct (770/770) but unusable as a demux strategy here.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:124` — `{ asset: 'h264_in_mkv.mkv', container: 'mkv', videoCodecs: ['h264'], audioCodecs: ['aac'] }`, part of the demux family's golden-packets battery.
- Fixture: `fixtures/media/h264_in_mkv.mkv` EXISTS, 4.4 MB real Matroska file (not synthetic/empty/mock). Golden `fixtures/golden/h264_in_mkv.mkv.packets.json` exists (87 KB) with physically plausible H.264/AAC packet sizes, keyframe flags, and 1-ms Matroska timestamps including a -21000µs primed first packet.
- Oracle: `src/core/oracles.ts:701-796` (`goldenPackets`). Real, strict comparison: exact packet count, exact per-packet `size`, exact `keyframe` flags, order-independent per-track sort by dts/pts, timestamps within ±1 ms after a single constant per-track origin offset. Not trivially satisfiable — size and keyframe mismatches fail hard; not a smoke/proxy gate. Measurements (770 measured == 770 golden, comparedTracks=2, maxPtsDriftUs=0) are consistent with real media.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1152-1183` — genuine `Input` + `EncodedPacketSink.packets({verifyKeyPackets:true})` walk over the real file. No canned output, no input→output copy, no short-circuit to golden, no error-swallowing (the `for await` loop yields real `EncodedPacket`s; errors propagate out of `demux`).
- Verdict: **REAL**. Real fixture + real library implementation + strict meaningful oracle.
- Cached note: the winner's result has `cached: true` ("cached previous PASS result"), as do all 6 passing engines — these were reused from a prior run, not freshly re-executed. Relative ranking is internally consistent (all cached from the same era), but absolute wall numbers carry staleness risk.

## Confidence & caveats

- Confidence: **high** on the verdict (mediabunny wins). Correctness is a clean tie at the strongest applicable oracle, and mediabunny's wall margin (2.34x over runner-up, far larger over the rest) is well outside any plausible single-sample noise.
- Caveat — sampling: every passing engine has n=1 (mad=0, p95==median is a single-point artifact). One observation per engine is weak evidence individually, but the 2.34x–263x spread makes the ordering robust.
- Caveat — cached: all rows are `cached:true`; numbers were reused, not re-run. A fresh run could shift absolute timings (e.g. WASM init amortization), though it would not plausibly overturn a no-WASM/no-worker engine beating WASM-backed ones at pure demux.
- Caveat — bench coverage: only `wall` was recorded; peakMemory/throughputRealtime/longtasks were unavailable, so the performance decision rests on wall alone (which is the declared primaryMetric).
