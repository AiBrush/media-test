# performance/metamorphic-probe-duration-cross-container

- **family:** performance
- **fixture asset:** `fixtures/media/h264_1080p_30s.mp4` (31 MB, H.264 video 1920×1080@30 + AAC 48 kHz stereo; golden duration 30.000 s)
- **operation:** `remux` MP4 → WebM, `options.invariant = 'probe-duration'`
- **primaryMetric:** throughputRealtime (x-realtime)
- **oracle gate:** `property-invariant` (probe-duration branch)
- **passCount:** 2 of 7 (contested)

## Verdict

- **Best framework: remotion-webcodecs@4.0.479** — *contested* (2 PASS: remotion-webcodecs and mediabunny).
- **Decisive factor: correctness strength, not speed.** Both PASS engines satisfy the *same single* oracle (`property-invariant` / probe-duration), which sits in the structural/metadata-exact tier. Per the ranking ladder, within one oracle tier the **tighter measured tolerance wins before performance is consulted.** remotion-webcodecs reproduced the source duration **bit-on-the-nose: Δ 0.0000 s** (`outDurationSec 30`, `goldenDurationSec 30`). mediabunny landed at **Δ 0.0400 s** (`outDurationSec 30.04`), which is *just* inside the ±1-frame@24 fps band (`durationToleranceSec 0.041666…`) — it would have FAILED at any duration tolerance below ~0.04 s. That is a real structural difference in the authored WebM/Matroska timeline (last-block duration / timestamp-scale rounding), not noise.
- **Margin:** On the headline performance metric mediabunny is **faster** — throughputRealtime 3.658x vs 2.831x (**1.29x**), wall median 8201.7 ms vs 10597.1 ms (**1.29x** lower). So this is a deliberate correctness-over-throughput call: the runner-up (mediabunny) is the throughput leader but loses on duration fidelity. Both samples are n=1 (mad=0), so the performance gap is single-shot evidence; the correctness gap (0.00 vs 0.04 s) is the more robust signal.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime (x) | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | **PASS** | property-invariant:pass (Δ0.0000s) | 10597.06 | 2.8310 | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | property-invariant:pass (Δ0.0400s) | 8201.69 | 3.6578 | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | n/a | n/a | remux not applicable: WebM cannot stream-copy track codecs [h264, aac] |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | n/a | n/a | engine does not declare output container 'webm' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | n/a | n/a | engine does not declare operation 'remux' |
| platform@chrome-149 | NA_ENGINE | — | — | — | n/a | n/a | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | n/a | n/a | engine does not declare operation 'remux' |

(The shard's `bench` block carries only `throughputRealtime` and `wall`; no peakMemory/longtasks were recorded for this scenario, so those columns are n/a.)

## Why the winner wins (deep technical)

**The operation is a hard cross-container remux: H.264+AAC out of an ISO-BMFF (MP4) into WebM.** This is the metamorphic relation "probe(x).dur is invariant across containers" (`src/scenarios/performance/metamorphic.ts:76-96`). The scenario uses `op: 'remux'` with `options: { container: 'webm', invariant: 'probe-duration' }`. The oracle (`src/core/oracles.ts:2709-2759`) takes the engine's `ctx.output`, re-probes it through the **reference engine**, and asserts the probed duration is within ±1 frame of the baked golden (`fixtures/golden/h264_1080p_30s.mp4.meta.json` → `durationSec: 30`). Tolerance is `durationToleranceFor(...)` = `1/24 ≈ 0.0417 s` (`src/core/oracles.ts:159`).

**Why this is genuinely difficult.** WebM is a constrained Matroska profile that is only *standards-legal* for VP8/VP9/AV1 video and Vorbis/Opus audio — it does **not** carry H.264 or AAC. So a faithful "stream-copy" remux of this fixture into WebM is impossible: an engine must either (a) re-encode the elementary streams into WebM-legal codecs while preserving the 30 s timeline, or (b) write the H.264/AAC samples into a permissive Matroska/WebM container. Either way the **timeline must survive the container rewrite to 30 s**, which is exactly what the invariant probes.

**remotion-webcodecs path.** Its `remux()` (`src/engines/remotion-webcodecs/adapter.ts:494-510`) has no stream-copy fast path for a WebM target, so it falls through to `this.convert(input, { container: 'webm' })` (`adapter.ts:580-639`). `convert` first runs a header-only `parseMedia` to recover `durationInSeconds` and `fps` (`adapter.ts:600-606`) and feeds them to `convertMedia` as `expectedDurationInSeconds` / `expectedFrameRate` (`adapter.ts:625-626`). Because the WebM target cannot hold H.264/AAC and no codec is forced, `convertMedia` **re-encodes** through WebCodecs (`env.configUsed.backend: "webcodecs"`, `hwAccel: "prefer-hardware(+software fallback)"`, `pipeline: "streaming-backpressure"`, `writer: "bufferWriter"`). Driving the muxer with the explicitly probed source duration is precisely why the output's probed duration comes back **exactly 30.0000 s (Δ 0.0000 s)** — the duration hint is threaded end-to-end into the Matroska Segment/Cues, eliminating the trailing-block rounding error. That exactness is the winning margin.

**mediabunny path (runner-up).** Its `remux()` (`src/engines/mediabunny/adapter.ts:1244-1260`) builds a `WebMOutputFormat` (`src/engines/mediabunny/codecs.ts:170-171`) and runs `runConversion` over a real `Input`/`Output` pair — also a genuine WebCodecs conversion (`env.configUsed.backend: "webcodecs"`, `pipeline: "streaming-lockstep"`, `coopCoep: "not-required"`, `sharedArrayBuffer: false`). It is **faster** (3.658x vs 2.831x realtime; 8201.7 ms vs 10597.1 ms wall) — plausibly its `streaming-lockstep` pipeline and pure-TS-ESM core have less backpressure overhead than remotion's `streaming-backpressure` path on this M1 Max. But its authored WebM reports **30.04 s** (Δ 0.0400 s): a one-extra-frame / block-duration rounding artifact that sits a single millisecond under the 0.0417 s gate. Same oracle, same tier — but a looser realized tolerance, so it loses the correctness tiebreak.

**Net:** both are real WebCodecs remuxes that survive the cross-container duration invariant; the winner is decided by which one preserved the 30 s timeline more exactly, and remotion-webcodecs nailed it to 0.0000 s.

## What each other framework did wrong

- **mediabunny@1.48.0 (PASS, lost on correctness):** Produced a 30.04 s WebM (Δ 0.0400 s) vs golden 30.000 s — barely inside the ±0.0417 s gate. Faster (1.29x throughput, 1.29x lower wall) but the looser realized duration tolerance forfeits the correctness-first tiebreak. Both engines are cached (n=1).
- **ffmpeg.wasm@0.12.15 (NA_ENGINE):** Honest NA — its `assertRemuxContainerCompatible` (`src/engines/ffmpeg-wasm/adapter.ts:903-921`) throws `NotApplicableError('remux', 'WebM cannot stream-copy track codecs [h264, aac]')` because WebM is illegal for H.264/AAC and ffmpeg.wasm's remux contract is strict stream-copy (no implicit re-encode). This is arguably the *most standards-correct* stance; it simply declines the op rather than re-encoding, so it cannot win a scenario that requires producing an output.
- **mp4box@2.3.0 (NA_ENGINE):** Honest NA — "engine does not declare output container 'webm'". MP4Box is an ISO-BMFF (MP4) muxer only; it has no Matroska/WebM writer, so the runner records NA(engine) at capability-match time and never invokes it.
- **remotion-media-parser@4.0.479 (NA_ENGINE):** Honest NA — "engine does not declare operation 'remux'". It is a read-only parser with no muxer (`src/engines/remotion-media-parser/adapter.ts:188-199`); its `remux()` stub throws by design (`adapter.ts:548-549`).
- **platform@chrome-149 (NA_ENGINE):** Honest NA — "engine does not declare operation 'remux'". Bare WebCodecs has decoders/encoders but no container muxer, so remux is genuinely outside its surface.
- **web-demuxer@4.0.0 (NA_ENGINE):** Honest NA — "engine does not declare operation 'remux'". Demuxer/parser only, no muxer (`src/engines/web-demuxer/adapter.ts:624-641, 1047-1048`).

## Anti-cheat validation

- **Scenario:** `src/scenarios/performance/metamorphic.ts:77-96` (`probeDurationCrossContainer`). Input is the real fixture `h264_1080p_30s.mp4`, op=remux, container=webm, invariant=probe-duration. Notes confirm "golden meta is baked TODAY → this ranks for real now."
- **Fixture existence:** `fixtures/media/h264_1080p_30s.mp4` exists, 31 MB — a real, non-trivial H.264/AAC MP4 (golden meta: container mp4, durationSec 30, video h264 1920×1080@30 bitrate 8.2 Mbps, audio aac 48 kHz/2ch). Not synthetic/empty/mock.
- **Oracle:** `src/core/oracles.ts:2709-2759` (property-invariant, probe-duration branch). It requires a real `ctx.output`, re-probes it via the *reference engine* (`ctx.referenceEngine.probe`, line 2721), compares the probed output duration against the baked golden (`fixtures/golden/h264_1080p_30s.mp4.meta.json`), and fails if `Δ > tolSec` (line 2745). The gate is a genuine ±1-frame band (0.0417 s), not a permissive wildcard — mediabunny passing at Δ 0.0400 s proves the band actually bites near the boundary.
- **Winner adapter:** `src/engines/remotion-webcodecs/adapter.ts:494-510` (`remux` → `convert`) and `:580-639` (`convert` → real `wc.convertMedia` with bufferWriter and probed duration hints). It calls the real `@remotion/webcodecs` library, re-encodes through WebCodecs, returns actual output bytes — no canned output, no input→output copy, no short-circuit to the golden, no swallowed errors.
- **Verdict: REAL.** Real 31 MB fixture, real WebCodecs remux implementation in the winner, and a meaningful reference-probe duration oracle with a tight ±1-frame band that the runner-up nearly missed. The NA verdicts for the other five engines are all honest capability declarations (no muxer / no WebM target / strict stream-copy refusal), not under-declarations.
- **Cached note:** Both PASS results have `cached: true` ("cached previous PASS result"). The evidence is therefore *reused*, not freshly re-run — staleness risk applies to both the duration deltas and the throughput numbers. Given the launcher's known stale-PASS reuse caveat, a fresh run (clearing raw + .browser-cache) would harden these figures; the winner choice would only change if a fresh remotion-webcodecs run regressed its Δ above mediabunny's, which is unlikely since the 0.0000 s comes from the deterministic duration-hint path.

## Confidence & caveats

- **Confidence: medium.** The correctness signal (Δ 0.0000 vs 0.0400 s on a real reference probe) is clear and code-grounded, but the call rests on interpreting "tighter tolerance wins within tier" over mediabunny's 1.29x throughput lead.
- Only **one** oracle gates this scenario (a single structural/property invariant), so there is no second correctness axis to break the near-tie more decisively. If the suite weighted primaryMetric (throughputRealtime) above sub-tolerance fidelity, mediabunny would win.
- Both winners' measurements are **n=1 (mad=0)** and **cached**; throughput especially is single-shot, M1-Max-specific evidence.
- The deeper standards observation: ffmpeg.wasm's NA is the most *spec-pure* behavior here (H.264/AAC genuinely don't belong in WebM); the two "PASS" engines only succeed by silently re-encoding into WebM-legal codecs. The oracle validates the *duration invariant*, not codec legality, so this is allowed — but a stricter scenario could legitimately reclassify these passes.
