# robustness/edge_video_only_micro_probe

family: robustness | fixture asset: `micro_h264_1frame.mp4` (real, 5.5 KB, ISO Media MP4 Base Media v1, single H.264 keyframe, video-only, no audio) | primaryMetric: (none in shard; ranked on `durationMs`) | passCount: 7/7

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED — all 7 engines PASS).
- Decisive factor: **performance only**. Every engine satisfies the identical and only gating oracle (`golden-metadata`) with an exact metadata match (`durationDeltaSec=0`, single H.264 320x240 video track). Correctness strength is therefore a perfect tie, so ranking falls to wall time (`durationMs`, the only timing signal present — there is no `bench{}` block in this shard).
- Margin over runner-up: mediabunny `durationMs=10` vs platform `durationMs=11` → **1.1x faster** (≈1 ms). Extremely thin margin on a **single, cached sample (n=1)** — weak evidence (see Confidence).

## Per-engine results

| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 10 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 11 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 18 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | PASS | golden-metadata:pass | 44 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 64 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 84 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 173 | n/a | n/a | n/a | cached previous PASS result |

No `bench{}` (median/p95/mad/throughput/peakMemory/longtasks) is present for any engine in this shard; `durationMs` is the only per-engine timing field, and all seven results are `cached==true`.

## Why the winner wins (deep technical)

This scenario is a §A.16 edge-case **probe** (op `probe`, `src/scenarios/robustness/index.ts:640-649`): a real video-only MP4 carrying a single H.264 keyframe and **no audio track**. The point is track-enumeration robustness — the demuxer must report *exactly one video track* (h264, 320x240, fps 1, duration 1 s per `fixtures/golden/micro_h264_1frame.mp4.meta.json`) and must NOT synthesize a phantom audio track. The gating oracle `golden-metadata` (`src/core/oracles.ts:595-657`) compares container, duration (strict ±1-frame band — here `durationToleranceSec≈0.0417`s = 1/24), and per-track codec/dims/fps positionally against the golden. Every engine returned `durationDeltaSec=0` and `metadata matches golden (1 track(s))`, so all seven correctly enumerated the lone video track. Correctness is a clean tie at the structural/metadata-exact tier — there is no bit-exact or packet-level gate on this row to break the tie.

Because correctness is identical, the decisive axis is wall time. mediabunny wins at `durationMs=10`. Mechanistically, mediabunny's probe path (`src/engines/mediabunny/adapter.ts:417-447`, `metadataFromInput`) is deliberately allocation-light and avoids any sample scan: it calls `input.getFormat()` for the container, then takes duration from the **cheap metadata path first** — `input.getDurationFromMetadata()` (line 429), which reads the MP4 `mvhd`/`tkhd` declared duration *without walking samples or mdat*, only falling back to `computeDuration()` (line 436) when metadata yields null. For a tiny single-frame `isom` MP4 the declared `mvhd` duration resolves immediately, so mediabunny never touches the (already trivial) sample table. It then enumerates tracks via `input.getTracks()` (line 443) and normalizes each. The backend (`env.configUsed`) is `webcodecs`, `coreBuild: pure-ts-esm`, `sharedArrayBuffer:false`, `coopCoep: not-required` — but for a metadata-only probe no decoder is instantiated; the win comes from the pure-TS ISOBMFF parser reading a handful of boxes from a 5.5 KB blob with no wasm boot and no COOP/COEP gating.

The closest competitor, **platform@chrome-149** (`durationMs=11`, 1.1x slower), uses Chrome's native `webcodecs` stack (`hwAccel:true`, `decode: VideoDecoder`) but for probe-only metadata the native demux/parse of this MP4 is essentially as fast as mediabunny's hand-rolled parser — the 1 ms gap is within timer noise. mediabunny's edge is its zero-boot, zero-fallback fast path on a file this small.

## What each other framework did wrong

All six non-winners PASSed the oracle identically (exact metadata, `durationDeltaSec=0`); they "lost" only on wall time, not correctness:

- **platform@chrome-149** — PASS, lost by 1 ms (`durationMs=11` vs 10, 1.1x). Native WebCodecs/VideoDecoder stack; negligible gap, effectively tied.
- **remotion-media-parser@4.0.479** — PASS, `durationMs=18` (1.8x slower). `backend: cpu-js`, `fieldsTier: metadata-only`, `reader: webReader` — pure-JS streaming parser, slightly heavier per-call overhead on a micro file.
- **mp4box@2.3.0** — PASS, `durationMs=44` (4.4x slower). `backend: pure-js`, `pipeline: whole-file-append(MP4BoxBuffer+fileStart)`, `rangeReads:false` — appends the whole file and runs box callbacks; more setup cost than the cheap `getDurationFromMetadata` path.
- **remotion-webcodecs@4.0.479** — PASS, `durationMs=64` (6.4x slower). `backend: webcodecs`, `pipeline: streaming-backpressure` with `bufferWriter`; the convert/WebCodecs harness carries more init overhead even for a metadata-only probe.
- **web-demuxer@4.0.0** — PASS, `durationMs=84` (8.4x slower). wasm-backed demuxer; wasm module boot dominates the cost of probing a 5.5 KB file.
- **ffmpeg.wasm@0.12.15** — PASS, `durationMs=173` (17.3x slower). Heaviest fixed cost — wasm core load + FS write + probe invocation — disproportionate for a micro probe.

No engine returned NA_ENGINE, NA_BROWSER, or FAIL on this row; nobody synthesized a phantom audio track.

## Anti-cheat validation

- Scenario: `src/scenarios/robustness/index.ts:640-649` (`id: 'edge_video_only_micro_probe'`, op `probe`, asset `micro_h264_1frame.mp4`, oracle `golden-metadata`, notes §A.16 video-only).
- Fixture: `fixtures/media/micro_h264_1frame.mp4` **exists**, 5.5 KB, `file` reports "ISO Media, MP4 Base Media v1 [ISO 14496-12:2003]" — a real, non-empty, non-synthetic MP4. Golden truth at `fixtures/golden/micro_h264_1frame.mp4.meta.json` declares container mp4, duration 1 s, one h264 320x240 fps-1 track, bitrate 37992 — physically plausible for a single-keyframe clip.
- Oracle: `golden-metadata` at `src/core/oracles.ts:595-657`. REAL comparison: container string match, duration within a measured tolerance (`durationToleranceSec≈0.0417`s, the strict per-frame band, not a wide catch-all), positional per-track codec/dims/fps/sampleRate/channels diff (`compareTrack`, lines 659-686), and a track-count check that would catch a synthesized audio track. A wrong codec, wrong dims, an extra phantom track, or a duration off by more than one frame would fail it.
- Winner adapter: mediabunny `src/engines/mediabunny/adapter.ts:417-447` (`metadataFromInput`) genuinely opens the file via `Input`/`BlobSource` and reads `getFormat()`, `getDurationFromMetadata()`/`computeDuration()`, and `getTracks()` from the real mediabunny library (imports at `src/engines/mediabunny/adapter.ts:72-77`). No canned output, no input->output copy, no short-circuit to the golden, no error-swallow-as-success (the try/catch only downgrades duration to null, which would then *fail* the oracle, not fake a pass).
- Verdict: **REAL** — real fixture + real library probe + a meaningful, strict structural oracle (exact metadata, ±1-frame duration band, track-count guard against phantom tracks).
- Cached note: ALL seven results are `cached==true` ("cached previous PASS result"). The PASS is real, but the `durationMs` figures (and thus the 10-vs-11 ms ranking) were reused, not re-run — staleness/timing-noise risk applies to the ordering, not the correctness verdict.

## Confidence & caveats

- Confidence: **medium**. Correctness verdict (all 7 PASS, oracle real and strict, fixture genuine) is high-confidence. The *winner ranking* is low-confidence: it rests entirely on `durationMs` because the shard has no `bench{}` (no median/p95/mad, n effectively 1), and the top three (10/11/18 ms) are within timer noise on a 5.5 KB file.
- Caveat: all results are cached, so timings predate this run; a re-run could plausibly reorder mediabunny vs platform.
- Caveat: this is a metadata-only probe, so the strongest oracle tiers (bit-exact decode, golden-packets) are intentionally not exercised — a PASS certifies correct track enumeration, not pixel-accurate decode.
