# demux/pcm_s16be

- family: demux
- fixture asset: `pcm_s16be.aiff` (AIFF container, big-endian PCM s16, 48 kHz, 2 ch, 5 s, 1536 kbps) — 960 KB real fixture
- primaryMetric: wall (ms)
- passCount: 1 of 7

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (env.engineId `ffmpeg-wasm`).
- Contested: **NO** — uncontested. Exactly one engine reached PASS; the other six returned `NA_ENGINE`.
- Decisive factor: ffmpeg.wasm is the only engine that declares the **AIFF input container**. All six others returned a clean capability NA ("engine does not declare input container 'aiff'"). FFmpeg's AIFF demuxer then produced a packet table that is **byte-for-byte identical to the golden** (235/235 packets, every size and keyframe flag exact, maxPtsDriftUs=0).
- Margin over runner-up: not applicable for performance (no second PASS). The win is purely capability-driven: AIFF support vs. universal NA.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass | 7.235 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'aiff' |

The shard records `bench.wall` only (n=1, warmup=1, median=p95=7.234999984502792 ms, mad=0). No throughputRealtime, peakMemory, or longtasks metrics were collected for this case, so those columns are n/a.

## Why the winner wins (deep technical)

This case isolates a single dimension: can the engine *read the AIFF container at all*? AIFF (Audio Interchange File Format, Apple's IFF-derived `FORM…AIFF` chunked format) is rare in the browser media stack. None of the WebCodecs-class demuxers (mediabunny, mp4box, web-demuxer, the two remotion engines, and the Chrome platform demuxer) advertise it: each engine's capability set omits `aiff` from its `containersIn`, so the runner short-circuits to `NA_ENGINE` before any I/O happens. The scenario's own notes anticipate exactly this: "Engines that don't read AIFF (e.g. mediabunny lists AIFF as unsupported) report a clean NA(engine)" (src/scenarios/demux/index.ts:250-252).

ffmpeg.wasm is the only engine whose container capability is *derived from the real binary*, not hand-declared. At startup it runs `ffmpeg -formats`, parses the demuxer column (src/engines/ffmpeg-wasm/codecs.ts:242-266 `parseFormats`), and maps it back to canonical containers via `deriveContainersIn` (codecs.ts:330-334), using the `aiff: ['aiff']` demux-name mapping (codecs.ts:83). Because the vendored FFmpeg core genuinely ships the AIFF demuxer, `aiff` lands in `containersIn`, so the runner lets the case execute instead of NA-ing it.

The actual demux is a real stream-copy walk, not a canned response. `demux()` (src/engines/ffmpeg-wasm/adapter.ts:1961-1995) writes the fixture to MEMFS and runs one pass: `-i <in> -map 0 -c copy -f framecrc <out>`. The `framecrc` muxer emits one line per *copied* container packet — `stream, dts, pts, duration, size, 0xCRC[, F=flags]` — which `parseFramecrcRows` (adapter.ts:438-488) converts to `PacketInfo[]` with per-stream timebase scaling (the s16be/48 kHz timebase yields the 21333 µs spacing seen in the golden: 1024 samples ≈ 21.33 ms per 4096-byte packet). `-map 0` is explicitly present so default single-stream-per-type selection cannot drop tracks; `-c copy` re-packetizes nothing, so the row count and sizes mirror the real container chunking.

The gating oracle is `golden-packets` (src/core/oracles.ts:701-795), the strongest structural/metadata-exact gate available for demux. For this AIFF case it takes the **strict per-packet branch**, NOT the loose `pcm-aggregate` branch: `usesPcmAggregatePacketOracle` (oracles.ts:798-805) only fires for `container === 'wav'` (or an explicit `packetOracle: 'pcm-aggregate'` option), and this fixture's container is `aiff`, so the full exact comparison at oracles.ts:711-795 runs. That branch checks (1) total packet count equality, (2) trackIndex multiset layout, (3) per-packet **exact** size match, (4) per-packet **exact** keyframe-flag match, and (5) pts/dts drift bounded to ±1 ms after a constant per-track origin offset. The shard's measurements are physically consistent with the golden file: `measuredCount: 235`, `goldenCount: 235`, `comparedTracks: 1`, `maxPtsDriftUs: 0`. 235 packets of 4096 bytes each over a 5 s 48 kHz stereo stream is the correct chunking, and a maxPtsDriftUs of exactly 0 means FFmpeg's reconstructed timestamps matched the golden timebase to the microsecond. This is a genuine bit-of-structure match, not a tolerance pass.

Performance is incidental here: 7.235 ms wall on the M1 Max via single-thread wasm, n=1 (mad=0, so no spread information). It is not a comparative win because there is no second PASS to beat.

## What each other framework did wrong

- **mediabunny@1.48.0** — `NA_ENGINE`: does not declare input container 'aiff'. Honest NA; mediabunny explicitly lists AIFF as unsupported (per the scenario note). No under-declaration.
- **platform@chrome-149** — `NA_ENGINE`: does not declare 'aiff'. Honest; Chrome's built-in demuxers do not expose AIFF as a decodable container for this pipeline.
- **mp4box@2.3.0** — `NA_ENGINE`: does not declare 'aiff'. Honest by design — MP4Box is an ISO-BMFF/MP4 parser; AIFF is a different (IFF) container entirely, outside its scope.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`: does not declare 'aiff'. Honest; its parser set targets MP4/WebM/etc., not AIFF.
- **web-demuxer@4.0.0** — `NA_ENGINE`: does not declare 'aiff'. Honest at the capability layer (though web-demuxer wraps FFmpeg, its declared container set here omits AIFF, so it cleanly NAs rather than risking an undeclared path).
- **remotion-webcodecs@4.0.479** — `NA_ENGINE`: does not declare 'aiff'. Honest; same parser lineage as remotion-media-parser.

All six NAs are capability-honest: AIFF is a genuinely niche container in the WebCodecs ecosystem, and none of these engines claim it.

## Anti-cheat validation

- Scenario definition: src/scenarios/demux/index.ts:246-253 (`asset: 'pcm_s16be.aiff'`, `container: 'aiff'`, `audioCodecs: ['pcm-s16be']`), id assembled at index.ts:258 as `demux/pcm_s16be`.
- Fixture: `fixtures/media/pcm_s16be.aiff` EXISTS, 960 KB — a real AIFF file, not synthetic/empty/mock. Golden present: `fixtures/golden/pcm_s16be.aiff.meta.json` (aiff / pcm-s16be / 48000 / 2ch / 5 s) and `fixtures/golden/pcm_s16be.aiff.packets.json` (235 real packets, first two: size 4096, ptsUs 0 then 21333, keyframe true).
- Oracle: `golden-packets` at src/core/oracles.ts:701-795 performs a real per-packet comparison against the golden (count, layout, exact size, exact keyframe flag, ±1 ms ts drift). It is NOT trivially satisfiable for this case: the loose `pcm-aggregate` branch (oracles.ts:798-805) is gated to `container === 'wav'` and does not apply to AIFF, so the strict branch enforces exact sizes/flags. measurements (235/235, maxPtsDriftUs=0) are physically plausible.
- Winner adapter: src/engines/ffmpeg-wasm/adapter.ts:1961-1995 (`demux()` runs `-c copy -f framecrc`), parsed at adapter.ts:438-488; AIFF capability derived from real `-formats` output at codecs.ts:83/242-266/330-334. The operation calls the real vendored FFmpeg wasm core — no hardcoded output, no input→output copy fakery, no short-circuit to golden, no swallowed errors (failures throw at adapter.ts:2002-2005).
- Cached note: ffmpeg.wasm's result has `cached: true` ("cached previous PASS result"), durationMs 3857. The PASS evidence is a reuse, not a fresh re-run, so there is mild staleness risk per the known launcher seeding caveat. However the cached measurements (235/235 exact, drift 0) are internally consistent with the present golden file, and the adapter/oracle code paths verified above are real.
- Verdict: **REAL** — real AIFF fixture, real FFmpeg demux via framecrc stream-copy, strict exact golden-packets gate with plausible measurements.

## Confidence & caveats

- Confidence: **high**. The fixture and goldens exist on disk, the oracle is the strict (non-aggregate) golden-packets path, and the adapter genuinely invokes FFmpeg. The uncontested verdict is unambiguous (1 PASS, 6 honest NAs).
- Caveats: (1) The winning result is `cached: true`; it was reused rather than re-run, so a truly fresh launch (raw + .browser-cache cleared) would confirm liveness. (2) Bench has n=1 (single sample, mad=0) so the 7.235 ms wall figure carries no spread/confidence interval — but performance is not load-bearing for an uncontested capability win. (3) The six NAs are capability declarations; web-demuxer in particular wraps FFmpeg and could in principle read AIFF, but it does not declare the container here, so its NA is honest at the suite's capability contract even if conservatively under-declared relative to its underlying library.
