# remux/hevc_1080p_10s_mp4_to_mov

- family: remux | fixture asset: `fixtures/media/hevc_1080p_10s.mp4` (11,061,061 bytes, real HEVC/hvc1 1080p30 + AAC stereo, 10s) | primaryMetric: wall | passCount: 2 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- CONTESTED: two engines reached PASS — `ffmpeg-wasm` and `mediabunny@1.48.0`. Both satisfy the single gating oracle `reference-reimport`.
- Decisive factor: **performance + a marginal correctness edge**, on otherwise-equal oracle strength. ffmpeg-wasm posts wall median **78.10 ms vs 115.83 ms** (1.48x faster), throughputRealtime **128.05x vs 86.33x** (1.48x higher), and — most strikingly — **longtasks 1012 ms vs 19963 ms** (mediabunny blocks the main thread ~19.7x longer). ffmpeg-wasm also re-imported with **durationDeltaSec=0** (exact) vs mediabunny's 0.0693 s (still inside the 0.1 s tolerance, but non-zero).
- Margin over runner-up: 1.48x faster wall, 1.48x higher realtime throughput, 0.051x the main-thread blocking (longtasks), and exact vs ~70 ms duration drift.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true | 78.10 ms | 128.05x | n/a (n=0) | 1012 ms | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true | 115.83 ms | 86.33x | n/a (n=0) | 19963 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'mov' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |

(peakMemory/sourceReads/targetWrites bench all have n=0 samples for both engines, so no memory comparison is possible from this shard.)

## Why the winner wins (deep technical)

The operation is a **lossless container re-wrap**: HEVC (`hvc1`) coded samples + AAC stereo are copied from an ISO-BMFF MP4 into a QuickTime `.mov` container. HEVC is legal in both MP4 and QuickTime, so no decode/re-encode is required — the coded bitstream is identical and only the box structure (`ftyp`/`moov`/`mdat`, sample-entry FourCC, `stsd`) changes. This is exactly the cell defined at `src/scenarios/remux/matrix.ts:113-120` (`asset: 'hevc_1080p_10s.mp4', from: 'mp4', to: 'mov', videoCodecs: ['hevc'], audioCodecs: ['aac']`).

ffmpeg-wasm's path (`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) is a textbook stream-copy: it writes the input to MEMFS, runs `runInfo` to get track metadata, calls `assertRemuxContainerCompatible(...)` against the `mov` target, then invokes the muxer with `['-i', name, '-map', '0', '-c', 'copy', '-movflags', '+faststart', outName]` (adapter.ts:2044-2049). `-map 0` forces every input stream to carry over (so the AAC audio track is not dropped), `-c copy` guarantees no transcode, and `+faststart` relocates the `moov` atom ahead of `mdat`. Because no codec runs, the only CPU cost is demux + re-mux of ~770 packets — hence the 78.10 ms wall and the modest 1012 ms longtasks figure. The `reference-reimport` oracle (`src/core/oracles.ts:1279-1377`) then re-parsed the produced `.mov` and found **770 packets, 475 keyframes, 2 media tracks** matching the golden's 2 media tracks (`fixtures/golden/hevc_1080p_10s.mp4.meta.json`: HEVC video + AAC audio), with `durationDeltaSec=0` against the 0.1 s tolerance band computed at oracles.ts:1311-1323. Exact duration recovery is the expected outcome of a clean stream copy where ffmpeg preserves sample timestamps verbatim.

mediabunny's path (`src/engines/mediabunny/adapter.ts:1244-1260`) is also genuine: it builds a real `Output` with `makeOutputFormat('mov', ...)`, opens the input via `openInput`, and drives `runConversion(...)` (the library's `Conversion` API in stream-copy mode for matching codecs), using the WebCodecs-backed pipeline declared in `env.configUsed` (`backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `hwAccel: "prefer-hardware"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`). It passed the same oracle with **772 packets, 477 keyframes, 2 media tracks** and `durationDeltaSec=0.0693` — within tolerance but not exact. The ~2-packet / ~70 ms difference versus ffmpeg is consistent with mediabunny materializing a small audio-frame tail from block rounding during its conversion-driven re-mux (the oracle header at oracles.ts:1316-1318 explicitly anticipates this), whereas ffmpeg's `-c copy` keeps the timeline byte-faithful.

The decisive gap is not correctness (both pass the same gate at the same strength) but **execution profile**. mediabunny's streaming-lockstep conversion runs a heavier per-packet path on the main thread, producing **longtasks=19963 ms** — roughly 19.7x ffmpeg's 1012 ms — which for an interactive browser context is the dominant penalty: it would jank the UI for ~20 s of blocking work despite a 115 ms wall. ffmpeg-wasm runs its work inside its wasm worker, so the main thread sees far less blocking. Combined with the 1.48x wall/throughput advantage and the exact duration, ffmpeg-wasm is the clear winner for this codec/container/operation.

Caveat on evidence weight: both winners' benches are **n=1** (single sample, mad=0, p95==median), so the magnitude of the margins is single-shot evidence, not a distribution. The direction (ffmpeg faster, far lower longtasks, exact duration) is consistent and large enough to be decisive, but the precise ratios should be treated as point estimates.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, runner-up): correct and genuine, but lost on performance — 1.48x slower wall (115.83 vs 78.10 ms), 1.48x lower realtime throughput (86.33x vs 128.05x), and 19.7x more main-thread blocking (longtasks 19963 vs 1012 ms). It also showed a small non-zero `durationDeltaSec=0.0693` vs ffmpeg's exact 0.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare output container 'mov'". Honest NA: mp4box.js is an ISOBMFF writer; it can emit MP4 but does not register `mov` as an output container token. Could arguably emit a QuickTime-flavored ISOBMFF, so this is a borderline under-declaration, but mp4box does not expose a real mov muxer, so the NA is defensible.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — "engine does not declare output container 'mov'". Honest NA: its muxer surface targets MP4/WebM, not QuickTime `mov`.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'remux'". Honest NA: it is a *parser/demuxer* only, with no muxing/remux op at all.
- **platform@chrome-149**: NA_ENGINE — "engine does not declare operation 'remux'". Honest NA: the bare WebCodecs/platform shim exposes decode/encode primitives but no container remux operation.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare operation 'remux'". Honest NA: it is a demux-only wasm library; it cannot write/remux a container.

## Anti-cheat validation

- Scenario definition: `src/scenarios/remux/matrix.ts:113-120` (id derived via `remuxId` in `src/scenarios/remux/_shared.ts:73-75` → `remux/hevc_1080p_10s_mp4_to_mov`). Notes: "HEVC MP4->MOV: hvc1 is legal in QuickTime; lossless re-wrap."
- Fixture: `fixtures/media/hevc_1080p_10s.mp4` exists and is a real 11,061,061-byte HEVC/AAC asset (`stat` confirmed). Golden metadata `fixtures/golden/hevc_1080p_10s.mp4.meta.json` declares 2 media tracks (hevc 1920x1080@30 + aac 48k/stereo), 10 s; golden packets file present (87 KB). Not synthetic/empty/mock.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069`. Genuine stream-copy via `-map 0 -c copy -movflags +faststart`; it reads the muxed bytes back from MEMFS (`readBinary(outName)`). It does NOT return canned output, does NOT copy input→output bytes (it runs a real ffmpeg mux), does NOT short-circuit to the golden, and surfaces failures (errors from `this.run`/`assertRemuxContainerCompatible` propagate, not swallowed).
- Gating oracle: `reference-reimport` at `src/core/oracles.ts:1279-1377`. It re-parses `ctx.output` with the reference engine and checks media-track count + per-type layout against golden (oracles.ts:1289-1299), duration within a tolerance ≥0.1 s (oracles.ts:1311-1323), and that a video remux is not keyframe-empty (oracles.ts:1361-1365). This is a real structural comparison, not trivially satisfiable. Measurements are physically plausible: 770 packets / 475 keyframes for a 10 s clip is reasonable (HEVC here is heavily intra-coded; ~770 video+audio packets and a high keyframe ratio are consistent with the golden packet table).
- Strength note: this is a structural/semantic gate, not bit-exact. The default remux battery deliberately omits `decoded-frames-bitexact` while source frame goldens remain browser-bake placeholders (`_shared.ts:19-21`). So the PASS is real but mid-ladder, not the strongest possible (no pixel-bit-exact or golden-packets gate).
- Cached: BOTH PASS results have `cached: true` ("cached previous PASS result"). Numbers were reused, not re-run this session — staleness risk applies to the exact metric magnitudes, though the relative ordering is robust.
- Verdict: **WEAK-GATE**. The fixture is real, both implementations are genuine, and the oracle performs a meaningful structural re-import comparison — but it is a single structural/semantic gate (track count + layout + duration tolerance ≥0.1 s + non-empty keyframes), not a bit-exact or packet-table-exact correctness gate. The winner is real and correct; the gate just does not prove pixel/sample identity.

## Confidence & caveats

- Confidence: **high** for the winner identity. ffmpeg-wasm wins on every available metric (wall, throughput, longtasks) and on duration exactness, with a large longtasks margin.
- Caveats: (1) both benches are n=1 (mad=0, p95==median) — margins are point estimates. (2) Both results are cached, so figures are not from this run. (3) peakMemory has n=0 samples for both, so memory could not be compared. (4) The gate is structural (WEAK-GATE), not bit-exact, so neither PASS proves the HEVC coded bitstream is byte-identical post-remux — only that the output is a parseable mov with the right track layout and duration. (5) mp4box/remotion-webcodecs NAs ("no mov output") are borderline but defensible given neither exposes a real QuickTime muxer.
