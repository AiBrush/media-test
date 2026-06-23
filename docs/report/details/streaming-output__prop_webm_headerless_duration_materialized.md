# streaming-output/prop_webm_headerless_duration_materialized

family: streaming-output | fixture asset: `recorder_headerless.webm` (VP8 video + Opus audio, 320x240@30, 3.084s, 192KB) | primaryMetric: wall | passCount: 1 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** (env.engineId `mediabunny`).
- Contested? **No — uncontested.** Exactly one engine reached status=PASS; the other six are all NA_ENGINE (none even declares the capability set this case requires).
- Decisive factor: mediabunny is the only adapter that declares ALL three gating capabilities for this row — input container `webm`, operation `remux`, AND the `headerless` feature (WebM/Matroska append-only live layout). Every other engine is gated out (NA_ENGINE) before any oracle runs because it is missing at least one of those declarations.
- Margin over runner-up: not applicable (no second PASS). Mediabunny's own bench: wall median 16.15 ms (n=1), longtasks 66 ms; peakMemory not captured (n=0).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | property-invariant:true, webm-live-layout:true | 16.15 ms | n/a (not reported) | n/a (n=0) | 66 ms | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'webm' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'headerless' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'headerless' |

## Why the winner wins (deep technical)

This case is a lossless `remux` of a headerless / "live" MediaRecorder-origin WebM: VP8 video + Opus audio coded samples are copied into an append-only Matroska(WebM) output whose Segment has unknown size, with no SeekHead and no Segment `Duration` element. The property under test is metamorphic: `probe(remux_headerless_stream(x)).dur ≈ probe(x).dur` — i.e. the streamed live-profile output must still materialize a sane duration on re-probe even though it carries no global Duration. This is the §A.16 "headerless-MediaRecorder neighbor" of the streaming-output family (scenario header, ts-webm-live.ts:7-10, 98-111).

mediabunny is the only engine that runs at all. Its adapter advertises `headerless` as a first-class capability — `'headerless', // WebM/Matroska appendOnly live layout: unknown Segment size, no SeekHead/duration` (src/engines/mediabunny/adapter.ts:1081) — alongside `'target:writes'` (adapter.ts:1080) for native StreamTarget telemetry. The runner therefore admits it where it gates everyone else out.

The operation is genuinely executed against the real library. `remux()` (src/engines/mediabunny/adapter.ts:1244) builds the output format from the option bag via `outputFormatOptionsFrom` (adapter.ts:180-199), which lifts the scenario's `shape.appendOnly === true` into `{ appendOnly: true }` (adapter.ts:193-197). That format object is handed to mediabunny's native `Output` together with an instrumented `StreamTarget` (adapter.ts:1254-1255; the WritableStream/StreamTarget plumbing at adapter.ts:786-801), and the actual byte production runs through `runConversion` (adapter.ts:1256). The input is opened with the real demuxer (`openInput`, adapter.ts:1252) — no input→output byte copy, no canned blob, no short-circuit to a golden file.

The two attached oracles both pass with physically plausible, matching numbers:

- `property-invariant` (probe-duration, "across containers" branch, src/core/oracles.ts:2709-2758): the oracle re-probes the streamed output with the reference engine (mediabunny `probe`, oracles.ts:2719-2722) and diffs against golden duration. Measurements: `outDurationSec` 3.084, `goldenDurationSec` 3.084, `deltaSec` 0.0, `durationToleranceSec` 0.5. Δ 0.0000s ≤ 0.5000s. The 0.5s loose band is the documented estimate-only band for headerless WebM (oracles.ts:610-613, 2740-2743) — appropriate because a live WebM has no authored Segment Duration, so the duration must be reconstructed from cluster/block timestamps. mediabunny's reconstructed duration lands EXACTLY on golden (3.084s), proving the append-only output is not duration-corrupt.
- `webm-live-layout` (oracles.ts:485-535): a structural EBML walk of the output bytes. Measurements: `segmentOffset` 39, `segmentUnknownSize` 1 (unknown-size Segment ✓), `seekHeadCount` 0 (no SeekHead ✓), `segmentDurationPresent` 0 (no Segment Duration ✓), `clusterCount` 1 (≥1 cluster ✓), `cuesCount` 0. This is the strict positive proof that mediabunny actually emitted the live profile rather than a normal indexed WebM — the oracle would FAIL if Segment size were known, or if a SeekHead/Duration were present (oracles.ts:517-525).

So the win combines a structural/metadata-exact oracle (webm-live-layout: exact unknown-size Segment, zero SeekHead, zero Duration) with a property-invariant duration check that hits Δ=0. That is strong correctness on the §A.16 ladder (structural-exact + property-invariant), not a smoke/perceptual proxy.

## What each other framework did wrong

- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'webm'". Honest NA. mp4box is an ISOBMFF-only library; it has no Matroska/WebM demuxer, so it genuinely cannot read the VP8/Opus WebM input.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA. The platform adapter is a WebCodecs decode/probe surface; it has no muxer to author a WebM output, let alone an append-only live one.
- **ffmpeg.wasm@0.12.15** — NA_ENGINE: "engine does not declare feature 'headerless'". This is the most arguable NA: ffmpeg CAN write a live/streaming WebM (`-live 1`, fragmented matroska). The adapter simply does not declare the `headerless` capability token, so it is gated out. Looks like an UNDER-declared capability rather than a hard limitation, but it is an honest gate (it does not claim to pass).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA. web-demuxer is a demux-only (read-side) library; it has no output/mux path.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'remux'". Honest NA. The media-parser is a read-only parser; no muxing/remuxing surface.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'headerless'". Similar to ffmpeg.wasm: remotion-webcodecs can write WebM via its converter, but it does not declare the append-only/headerless live profile token. Plausibly under-declared, but honestly gated (no false PASS).

## Anti-cheat validation

- Scenario definition: src/scenarios/streaming-output/ts-webm-live.ts:98-111 (`id: 'prop_webm_headerless_duration_materialized'`), built via `buildStreamPropertyAll` in src/scenarios/streaming-output/_shared.ts.
- Fixture asset: `fixtures/media/recorder_headerless.webm` — EXISTS, 192KB real media (VP8+Opus, 3.084s). Not synthetic/empty/mock. Golden `fixtures/golden/recorder_headerless.webm.meta.json` declares durationSec 3.084 / container webm / vp8+opus, consistent with the measured output.
- Oracle implementations: `property-invariant` probe-duration across-containers branch at src/core/oracles.ts:2709-2758 (re-probes output via reference engine, real Δ-vs-golden comparison); `webm-live-layout` at src/core/oracles.ts:485-535 (real EBML structural walk with positive AND negative assertions — fails on known-size Segment, any SeekHead, or any Duration). Neither is trivially satisfiable: webm-live-layout can fail four distinct ways; the duration check uses a documented loose band yet the actual delta was 0.0000s, well inside it.
- Winner adapter: src/engines/mediabunny/adapter.ts:1244 (`remux`), :180-199 (`appendOnly` mapping), :1080-1081 (capability declarations), :786-801 (StreamTarget). Genuine library calls (`openInput`, `Output`, `runConversion`) — no canned output, no input→output copy, no golden short-circuit, no error swallowing.
- Verdict: **REAL.** Real fixture + real mediabunny remux through a native StreamTarget + two meaningful oracles (one structural-exact, one duration-invariant) that both report plausible, matching numbers (Δ duration 0.0000s; unknown-size Segment with 0 SeekHead / 0 Duration / 1 Cluster).
- Cached note: mediabunny's result has `cached: true` ("cached previous PASS result"). The PASS evidence was REUSED from a prior run rather than re-executed in this run, so there is mild staleness risk; the embedded oracle measurements are internally consistent (3.084s == 3.084s) which mitigates but does not eliminate it.

## Confidence & caveats

- Confidence: HIGH on the winner (only eligible PASS; both oracles strong and numerically consistent; adapter path verified in source).
- Caveat 1 (cache): the winning result is cached, not freshly re-run — per the launcher seeding caveat, a stale PASS can be reused; a clean re-run would harden this.
- Caveat 2 (capability under-declaration): ffmpeg.wasm and remotion-webcodecs are technically capable of writing live/streaming WebM but do not declare `headerless`, so the "uncontested" win partly reflects capability-declaration scope, not an absolute technical monopoly. mp4box / platform / web-demuxer / remotion-media-parser NAs are hard and honest.
- Caveat 3 (bench): wall n=1 (16.15 ms), peakMemory n=0 (not captured), throughputRealtime not reported — performance evidence is thin but irrelevant to ranking since the win is uncontested on capability/correctness, not speed.
