# robustness/edge_dims_2x2_h264_probe

family: robustness | fixture asset: `fixtures/media/video_2x2_h264.mp4` (2.7 KB, real H.264/MP4) | primaryMetric: (none recorded in shard; durationMs used) | passCount: 7 / 7

## Verdict

- Best framework: **mediabunny@1.48.0** — CONTESTED (all 7 engines PASS the single gating oracle `golden-metadata`).
- Decisive factor: **correctness is identical across all 7** (every engine reports `durationDeltaSec: 0`, container `mp4`, 1 track h264 2×2 @ 30fps), so the tiebreak falls to **performance**. mediabunny posts the lowest probe wall time at **10 ms**.
- Margin over runner-up: **1.5× faster** than remotion-webcodecs (15 ms), 1.6× faster than mp4box (16 ms), 2.9× faster than platform (29 ms), and 20.2× faster than the slowest passing engine ffmpeg.wasm (202 ms).
- Evidence strength is WEAK: this is a metadata-probe gate (no decode/bit-exact comparison), every result is `cached: true`, and the perf signal is a single `durationMs` reading per engine (n=1, no bench median/p95/mad in the shard).

## Per-engine results

All 7 engines passed the only oracle (`golden-metadata`), each reporting `durationDeltaSec: 0` against `durationToleranceSec: 0.041666…` (±1 frame @ 30fps). The shard carries no `bench{}` block, so throughputRealtime / peakMemory / longtasks are not recorded; `durationMs` is the only performance figure.

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | **10** | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 15 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 16 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 29 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 52 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 68 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 202 | n/a | n/a | n/a | cached previous PASS result |

## Why the winner wins (deep technical)

The operation is `op: 'probe'` on `video_2x2_h264.mp4` — a 2×2 yuv420p H.264 elementary stream in a faststart ISO-BMFF (`major_brand: isom`) container, ~2 s long, ~6.3 kbit/s. The scenario note (src/scenarios/robustness/index.ts:704-706) makes the point explicit: 2×2 is the *smallest honest* yuv420p H.264 fixture, because libx264 cannot encode 1×1/0×0 yuv420p as valid media. So this test is a degenerate-dimension robustness probe: the engine must parse the `moov`/`avcC`/`tkhd` boxes and faithfully surface width=2, height=2, codec=h264, container=mp4, duration≈2 s — without choking on the tiny dimensions or mistaking a 2-pixel-wide track for corrupt.

Correctness is a flat tie. The gating oracle is `golden-metadata` (src/core/oracles.ts:595-657). It compares container (oracles.ts:606), duration within a per-container band (oracles.ts:614-637), and per-track codec/width/height/fps positionally (compareTrack, oracles.ts:659-686) against `fixtures/golden/video_2x2_h264.mp4.meta.json` (container mp4, durationSec 2, one video track h264 2×2 @ 30fps). All 7 engines hit `durationDeltaSec: 0` — exact duration match, well inside the strict ±0.04167 s (1-frame @ 30fps) band — and all report a single matching track ("metadata matches golden (1 track(s))"). There is no decode, SSIM, or packet-level discrimination here, so no engine can pull ahead on correctness strength.

That collapses the decision onto performance, where mediabunny's probe path is the lightest. Its adapter (src/engines/mediabunny/adapter.ts:1134-1141) does the minimum: `openInput` → `metadataFromInput` → `dispose`. Critically, `metadataFromInput` (adapter.ts:417-453) takes the **cheap metadata duration path first** — `input.getDurationFromMetadata()` (adapter.ts:429) reads the declared `mvhd` duration without scanning samples, only falling back to `computeDuration()` (adapter.ts:436) if metadata yields null. For a tiny faststart MP4 whose `moov` is at the front, this is a single header parse with no sample-table walk and no WebCodecs decode session — which is why it lands at 10 ms, the floor of the field. The config (`backend: webcodecs`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`) means no SAB/COOP-COEP gating and no wasm bootstrap tax on the probe path; the WebCodecs init warm-up is untimed (adapter.ts:68).

The contrast is sharpest against ffmpeg.wasm at 202 ms (20.2× slower): a probe there pays the wasm module instantiation / FS-mount / libavformat open cost even for a 2.7 KB file, dwarfing the actual header parse. The two pure-JS box parsers (mp4box 16 ms, remotion-media-parser 68 ms) sit between — mp4box's `whole-file-append(MP4BoxBuffer+fileStart)` config with `discardMdatDataProbe: true` keeps it lean (it discards mdat on probe), while remotion-media-parser's `webReader` streaming + `fieldsTier: metadata-only` is correct but heavier per-op. mediabunny edges all of them because its header-only metadata read is the most direct.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** (PASS, 15 ms): correct and second-fastest, but **1.5× slower** than mediabunny's 10 ms. No correctness deficit — pure perf gap on a metadata-only probe.
- **mp4box@2.3.0** (PASS, 16 ms): correct; `discardMdatDataProbe: true` keeps it cheap, but the `whole-file-append` buffering path is **1.6× slower** than mediabunny's cheap-metadata-first read.
- **platform@chrome-149** (PASS, 29 ms): correct; the browser WebCodecs/`<video>`-backed probe path carries more setup overhead, **2.9× slower**.
- **web-demuxer@4.0.0** (PASS, 52 ms): correct; wasm-backed demuxer probe is **5.2× slower** on this tiny file (wasm bring-up cost not amortized).
- **remotion-media-parser@4.0.479** (PASS, 68 ms): correct; `metadata-only` streaming `webReader` is **6.8× slower** per probe.
- **ffmpeg.wasm@0.12.15** (PASS, 202 ms): correct but **20.2× slower** — wasm libavformat instantiation/FS overhead dominates a 2.7 KB probe.

No engine FAILed and none was NA — every engine genuinely declares and implements `probe` for MP4/H.264, which is honest (probe of a standard faststart MP4 is universally supported).

## Anti-cheat validation

- Scenario: src/scenarios/robustness/index.ts:697-707 — `id: 'edge_dims_2x2_h264_probe'`, `op: 'probe'`, `asset: 'video_2x2_h264.mp4'`, `videoCodecs: ['h264']`, `oracles: ['golden-metadata']`. Notes (line 704-706) give a real robustness rationale (smallest honest yuv420p H.264 fixture).
- Fixture: `fixtures/media/video_2x2_h264.mp4` — **exists, 2.7 KB real MP4** (not synthetic/empty/mock). Golden `fixtures/golden/video_2x2_h264.mp4.meta.json` exists and declares mp4 / 2 s / h264 2×2 @ 30fps — physically plausible for a 2×2 30fps ~6.3 kbit/s clip.
- Oracle: src/core/oracles.ts:595-657 (`goldenMetadata`) — performs a REAL comparison: container equality (line 606), duration within ±1-frame band (lines 614-637), per-track codec/dims/fps via `compareTrack` (lines 659-686). It is a metadata-exact gate, not trivially-passing; however it is **probe/metadata-only** — no decoded-frame or packet-level check — so passing it proves correct header parsing, not pixel correctness. Measurements (`durationDeltaSec: 0`, tol 0.04167) are plausible.
- Winner adapter: src/engines/mediabunny/adapter.ts:1134-1141 (`probe`) → adapter.ts:417-473 (`metadataFromInput`). Genuinely opens the real input and reads real container metadata via mediabunny's `getDurationFromMetadata`/`getTracks`/`normalizeTrack`. No canned output, no copy-input-to-output, no short-circuit to the golden, no error-swallow-then-report-success.
- Cached note: **every engine's result is `cached: true`** ("cached previous PASS result"). The numbers are reused from prior runs (timestamps span 2026-06-22 13:51 → 16:49), not freshly re-executed; staleness risk applies to both the PASS verdicts and the durationMs perf ordering.
- Verdict: **WEAK-GATE**. The fixture and the winner's implementation are real, but the only oracle is a metadata-only probe gate (no decode/bit-exact comparison), so the PASS is genuine yet not strong. The winner is selected purely on a single-sample (n=1) cached wall-time, which is thin evidence.

## Confidence & caveats

- Confidence: medium. Correctness tie is unambiguous (identical golden-metadata pass with Δ=0 for all 7). The winner pick rests entirely on a perf tiebreak.
- Caveats: (1) shard has **no `bench{}`** block — no median/p95/mad/throughput/memory; ranking uses single `durationMs` readings (n=1), so the 10 vs 15 ms gap is within plausible noise and should be treated as soft. (2) All results are **cached** — not re-run in this pass. (3) The gate is metadata-only; it does not exercise decode of the degenerate 2×2 frame, so it does not distinguish decoders' handling of minimum dimensions, only their header parsers.
