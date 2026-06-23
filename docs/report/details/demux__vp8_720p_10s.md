# demux/vp8_720p_10s

family: demux | fixture asset: `vp8_720p_10s.webm` (1.3 MB, WebM/Matroska, VP8 video + Vorbis audio) | primaryMetric: wall | passCount: 5 / 7

## Verdict

- **Best framework: `platform@chrome-149`** (the browser-native baseline path).
- **CONTESTED**: 5 of 7 engines PASS, and all five pass the *identical* gating oracle (`golden-packets`) with byte-identical results — 771 packets, 2 tracks compared, `maxPtsDriftUs=0`. Correctness is therefore a dead tie at the strongest available level for this scenario (structural/metadata-exact packet table, with bit-exact packet sizes and keyframe flags).
- **Decisive factor: PERFORMANCE (wall median).** Since correctness is indistinguishable, ranking falls to the primaryMetric `wall`.
- **Margin over runner-up:** platform 9.875 ms vs ffmpeg.wasm 16.675 ms = **1.69x faster wall** than the runner-up; **2.01x** faster than mediabunny (19.855 ms). Caveat: every measurement is `n=1` (mad=0, p95==median), so the margin is single-shot evidence, not a distribution.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| platform@chrome-149 | PASS | golden-packets:true | 9.875 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true | 16.675 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:true | 19.855 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true | 358.680 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true | 518.445 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-packets:true | 722.975 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

All five PASS engines reported identical oracle measurements: `measuredCount=771, goldenCount=771, comparedTracks=2, maxPtsDriftUs=0`. The bench block only carries `wall`; throughputRealtime / peakMemory / longtasks were not emitted for this demux row (n/a above).

## Why the winner wins (deep technical)

This scenario is a **pure read-side demux of VP8 video + Vorbis audio inside a WebM/Matroska (EBML) container** — no decode, no transcode. The oracle that gates it (`golden-packets`, src/core/oracles.ts:703) groups packets per track, sorts each group by dts then pts, and checks, position-by-position: packet **count**, the **trackIndex multiset layout**, exact **size**, exact **keyframe flag**, and pts/dts drift after a constant per-track origin alignment (tolerance = `seekToleranceUs` = 1 ms). The golden (fixtures/golden/vp8_720p_10s.webm.packets.json) is an ffprobe-derived table whose first entries show track 1 (Vorbis) at size 41 keyframe, track 0 (VP8) at 46442 keyframe — real, physically plausible WebM SimpleBlock sizes. Passing this means an engine genuinely parsed every Cluster/SimpleBlock of the 1.3 MB file and reconstructed the exact packet boundaries; the reported `maxPtsDriftUs=0` means timestamps matched the golden exactly with zero residual.

Because all five PASS engines hit that same wall (771/771, drift 0), there is **no correctness separation** — the ladder cannot break the tie. The win is therefore mechanical throughput. `platform` used `configUsed.backend="webcodecs"` with `hwAccel=true`, but for a demux-only row the dominant cost is the EBML walk, not any codec. Its WebM path is a tight, hand-written single-pass Matroska parser: src/engines/platform/demux-webm.ts emits packets by walking the Segment once, reading each `Cluster` Timestamp then iterating `SimpleBlock`/`BlockGroup` children and routing frames to tracks by track number (demux-webm.ts:464-493). Keyframe semantics are derived correctly and cheaply — SimpleBlock uses the block flag, BlockGroup infers non-keyframe from the presence of a `ReferenceBlock` (demux-webm.ts:479-491). This is native-typed-array byte scanning with no WASM module instantiation, no FFI marshaling, and no JS-side container library load, which is why it lands at **9.875 ms** — fastest of the field.

The runner-up, **ffmpeg.wasm (16.675 ms)**, is genuinely fast but pays the WASM boundary cost: it must hand the whole buffer into the emscripten FS and run libavformat's matroska demuxer, then marshal packet metadata back out. That is 1.69x slower than the in-process native scan. **mediabunny (19.855 ms)** is a pure-TS-ESM streaming-lockstep demuxer (`coreBuild="pure-ts-esm"`); also correct and drift-free, but 2.01x slower than platform's tuned parser. The two slow PASS engines — remotion-media-parser (358.68 ms, `backend="cpu-js"`, full-parse streaming) and remotion-webcodecs (518.445 ms) and web-demuxer (722.975 ms, a WASM ffmpeg wrapper) — are correct but 36x-73x slower, reflecting heavier general-purpose parse pipelines and (for web-demuxer) per-call WASM/worker setup overhead amortized poorly over a short 10 s clip.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on performance only: 16.675 ms wall = **1.69x slower** than platform. Correct packet table (771/771, drift 0). Cost is the WASM/libavformat marshaling boundary.
- **mediabunny@1.48.0** — PASS, lost on performance: 19.855 ms = **2.01x slower** than platform. Pure-TS streaming demux; correct (771/771, drift 0) but no native fast path.
- **remotion-media-parser@4.0.479** — PASS, lost on performance: 358.68 ms = **36.3x slower**. `cpu-js` full-parse(demux) pipeline; correct but heavy.
- **remotion-webcodecs@4.0.479** — PASS, lost on performance: 518.445 ms = **52.5x slower**. Its declared adapter fast-paths target large progressive MP4/MOV, not short WebM, so it falls back to the slow generic path here.
- **web-demuxer@4.0.0** — PASS, lost on performance: 722.975 ms = **73.2x slower** (slowest PASS). WASM ffmpeg wrapper; per-run setup dominates a tiny 10 s file.
- **mp4box@2.3.0** — NA_ENGINE, "engine does not declare input container 'webm'". **Honest NA**: MP4Box.js is an ISO-BMFF (MP4/MOV) parser and genuinely cannot read Matroska/EBML; declining the WebM input is correct capability gating, not an under-declared skip.

## Anti-cheat validation

- **Scenario definition:** src/scenarios/demux/index.ts:115 — `{ asset: 'vp8_720p_10s.webm', container: 'webm', videoCodecs: ['vp8'], audioCodecs: ['vorbis'] }`. Real container/codec axis (VP8/Vorbis in WebM).
- **Fixture exists:** `fixtures/media/vp8_720p_10s.webm` present, **1.3 MB** real WebM (not synthetic/empty/mock).
- **Golden exists & is plausible:** `fixtures/golden/vp8_720p_10s.webm.packets.json` (86 KB) with real ffprobe packet rows (e.g. VP8 keyframe size 46442 at pts 3000µs, Vorbis 41/87/61-byte packets).
- **Oracle is real:** `golden-packets` at src/core/oracles.ts:703-796 does per-track, order-independent, position-by-position comparison of count + trackIndex layout + exact size + exact keyframe flag + pts/dts drift (±1 ms). Not trivially satisfiable; not smoke; not SSIM-with-exactFrames==0. A wrong packet count, a single size mismatch, or a flipped keyframe flag fails it. Reported `maxPtsDriftUs=0` is the strongest possible result.
- **Winner adapter is genuine:** src/engines/platform/demux-webm.ts is a hand-written EBML/Matroska demuxer (header comment lines 2-9; single-pass Cluster/SimpleBlock/BlockGroup walk at lines 464-493; keyframe derived from block flag / ReferenceBlock presence). No canned output, no copy-input-to-output, no short-circuit to golden, no error swallowing — unidentified-codec blocks are dropped honestly (demux-webm.ts:458), and unparseable WebM throws `UnsupportedWebmError`.
- **Cached note:** the winner's result (and all 7 entries) are `cached==true` ("cached previous PASS result"). The PASS and the 9.875 ms figure are reused, not freshly re-run, so there is mild staleness risk; per the launcher-seeding caveat, an honest fresh run would require clearing the cache. The cached evidence is internally consistent (drift 0, plausible counts), so I rate it REAL with a staleness caveat rather than SUSPECT.

**validationVerdict: REAL** — real 1.3 MB WebM fixture, genuine hand-written EBML demuxer, and a strict exact-match packet oracle (771/771, drift 0).

## Confidence & caveats

- Confidence: **medium**. The correctness verdict is rock-solid (strict oracle, exact match). The *winner selection* rests on a single-shot wall metric (`n=1`, mad=0) and on **cached** results, so the precise 1.69x margin over ffmpeg.wasm could shift on a fresh multi-sample run — though platform's structural advantage (native byte scan vs WASM boundary) makes it very likely to remain fastest regardless.
- Correctness is a 5-way tie; if the suite wanted to separate these engines it would need a tighter or additional oracle (e.g. decoded-frames-bitexact), which this demux-only row deliberately does not run.
- mp4box's NA is the only non-PASS and is a legitimate capability boundary (no Matroska support).
