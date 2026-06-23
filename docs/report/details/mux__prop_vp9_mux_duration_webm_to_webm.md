# mux/prop_vp9_mux_duration_webm_to_webm

family: mux | fixture asset: `fixtures/media/vp9_1080p_10s.webm` (VP9 1080p30 + Opus, 9.3 MB) | primaryMetric: wall | passCount: 2/7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — 2 PASS: mediabunny, ffmpeg.wasm).
- Decisive factor: with both engines satisfying the identical `property-invariant` (probe-duration) gate at the *same strictness*, the tiebreak falls to **performance**. mediabunny is **3.63x faster** on wall median (45.16 ms vs 164.12 ms) and incurs **3.52x fewer long-task ms** (1361 ms vs 4784 ms). It is also strictly *more accurate* on the gate itself: Δ 0.0070 s vs ffmpeg.wasm's Δ 0.0200 s (both ≤ tol 0.0417 s).
- Margin over runner-up (ffmpeg.wasm): 3.63x faster wall, 0.28x long-task budget, and ~2.9x tighter duration error.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true (Δ0.0070s) | 45.165 ms | n/a | 113,170,652 B | 1361 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:true (Δ0.0200s) | 164.120 ms | n/a | 0 (not measured) | 4784 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'mux' |

(throughputRealtime/peakMemory absent from the ffmpeg.wasm bench block; mediabunny reports peakMemory only.)

## Why the winner wins (deep technical)

This scenario is the metamorphic identity-mux invariant `demux(mux(x)) ≈ x` measured by duration: the source `vp9_1080p_10s.webm` (VP9 video + Opus audio in a Matroska/WebM Segment) is demuxed to encoded packets and re-muxed back into a fresh WebM. The gating oracle is `property-invariant` on the `probe-duration` branch (src/core/oracles.ts:2709–2758). Because `ctx.scenario.op` here is the mux op (not `probe`), the oracle takes the cross-container probe path at oracles.ts:2714: it re-probes the *authored output* with the reference engine, reads `durationSec`, and compares against the golden `durationSec` of 10.008 s (fixtures/golden/vp9_1080p_10s.webm.meta.json:3). The tolerance is the conventional ±1-frame band (DEFAULT_TOLERANCES.durationToleranceSec = 1/24 ≈ 0.04167 s, oracles.ts:159). WebM is a precise (non-estimate-only) container, so no loose relaxation is applied (oracles.ts:2740–2743).

mediabunny's mux is a genuine container author, not a passthrough. The path is `MediabunnyAdapter.mux` (src/engines/mediabunny/adapter.ts:1508–1600): it constructs a real `mb.Output` with a WebM `format` and an instrumented target (adapter.ts:1509–1514), creates an `EncodedVideoPacketSource(vp9)` / `EncodedAudioPacketSource(opus)` per track (adapter.ts:1528, 1539), then for each demuxed packet builds a fresh `mb.EncodedPacket(c.data, key/delta, c.ptsUs/1e6, c.durationUs/1e6, i)` with PTS and per-packet duration carried through in microseconds (adapter.ts:1562–1569). The decoder config (codec string, coded width/height, codec-private `description`) rides the first packet so the muxer can emit the correct CodecPrivate/codec boxes (adapter.ts:1571–1590). Crucially it calls `output.start()` → packet add loop → `output.finalize()` (adapter.ts:1553/1598), and `finalize()` is what writes the Matroska Segment `Duration` element from the accumulated last-PTS + duration. Because mediabunny re-derives that Segment Duration from the real packet timestamps, the re-authored WebM probes at 10.001 s — only **Δ 0.0070 s** off the source's 10.008 s (shard measurement `outDurationSec:10.001`, `goldenDurationSec:10.008`, `deltaSec:0.006999...`), comfortably inside the 0.04167 s band. The backend was pure-TS WebCodecs (env.configUsed: `backend:"webcodecs"`, `coreBuild:"pure-ts-esm"`, `wasmThreads:0`, `coopCoep:"not-required"`), so it muxes the encoded packets without spinning up a heavy wasm runtime — hence the 45 ms wall and only 1361 ms of long-task time.

ffmpeg.wasm also genuinely re-muxes (it PASSes the same oracle) but pays the wasm tax: a single-threaded Emscripten libavformat WebM writer recomputes the Segment Duration too, landing at 10.028 s (Δ 0.0200 s ≤ 0.0417 s) — correct, but ~2.9x looser than mediabunny and at 164.12 ms wall with 4784 ms of long-tasks. The duration drift to 10.028 s is consistent with ffmpeg's Matroska muxer rounding cluster/block timestamps to its default 1 ms timescale and appending the final block's nominal duration; it stays inside tolerance but is measurably less faithful than mediabunny's microsecond-accurate re-author.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** (PASS, lost on tiebreak): correct but slower — 164.12 ms wall vs 45.165 ms (3.63x), 4784 ms vs 1361 ms long-tasks (3.52x), and looser duration (Δ 0.0200 s vs 0.0070 s). peakMemory was not captured (n=0), so memory could not be used as a discriminator.
- **platform@chrome-149**: NA_ENGINE — does not declare operation 'mux'. Honest: the Chrome platform has no built-in container muxer surface (WebCodecs encodes/decodes frames but does not author WebM/Matroska), so the non-declaration is correct, not under-declared.
- **mp4box@2.3.0**: NA_ENGINE — does not declare input container 'webm'. Honest: mp4box.js is an ISO-BMFF (MP4) library and cannot ingest a Matroska/WebM Segment.
- **remotion-media-parser@4.0.479**: NA_ENGINE — does not declare operation 'mux'. Honest: it is a parser/demuxer, not a muxer.
- **web-demuxer@4.0.0**: NA_ENGINE — does not declare operation 'mux'. Honest: name and scope are demux-only.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — does not declare operation 'mux'. Plausible: its converter pipeline targets transcode/remux flows rather than a raw encoded-packet mux op; the non-declaration reads as honest scope rather than a hidden capability.

## Anti-cheat validation

- Scenario definition: src/scenarios/mux/metamorphic.ts:66–76 (`id: 'prop_vp9_mux_duration_webm_to_webm'`, input `vp9_1080p_10s.webm`, containersIn `['webm']`, to `'webm'`, invariant PROBE_DUR). Notes confirm intent: "VP9+Opus WebM→WebM identity mux must re-author a sane Segment Duration."
- Fixture exists: `fixtures/media/vp9_1080p_10s.webm`, 9.3 MB real VP9+Opus WebM (not synthetic/empty). Golden meta `fixtures/golden/vp9_1080p_10s.webm.meta.json` declares container webm, duration 10.008 s, VP9 1920x1080@30 + Opus 48 kHz stereo — physically plausible and matching the oracle's goldenDurationSec.
- Oracle: src/core/oracles.ts:2709–2758. It re-probes the *authored output bytes* via the reference engine (oracles.ts:2721) and compares to the golden duration with a strict ±1-frame band (0.04167 s); it is not trivially satisfiable — a passthrough that dropped the Duration element or wrote a wrong timescale would fall outside the band. Measurements (out 10.001 s, golden 10.008 s, Δ 0.0070 s) are physically plausible for a faithful 10 s clip.
- Winner adapter: src/engines/mediabunny/adapter.ts:1508–1600. Real `mb.Output`/`EncodedVideoPacketSource`/`EncodedAudioPacketSource` with per-packet PTS+duration and `output.finalize()` writing the Segment Duration. No canned output, no input→output copy, no golden short-circuit, no swallowed errors (unsupported codecs throw at 1527/1538).
- Verdict: **REAL**. Real fixture + genuine mediabunny WebM author + strict ±1-frame duration oracle against a real golden.
- Cached note: mediabunny's result has `cached:true` ("cached previous PASS result"); ffmpeg.wasm is also cached. Both rows are reused, not freshly re-run — minor staleness risk per the launcher seeding caveat, but the measurements are internally consistent and codec-plausible.

## Confidence & caveats

- Confidence: high. The win is unambiguous: only 2 eligible PASS engines, identical oracle at identical strictness, and mediabunny is both more accurate (Δ 0.0070 vs 0.0200 s) and 3.63x faster.
- Caveats: (1) bench n=1 (no warmup-excluded repeats), so wall/longtask figures carry single-sample variance — the 3.63x gap is large enough to survive that. (2) Both results are cached; a fresh re-run is advised to fully discharge staleness. (3) peakMemory could not be used as a tiebreak because ffmpeg.wasm did not report it. (4) This is a duration-only invariant (it does not assert decoded-pixel or PCM bit-exactness), so PASS proves faithful container timing, not byte-level sample survival.
