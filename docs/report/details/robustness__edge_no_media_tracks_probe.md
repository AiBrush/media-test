# robustness/edge_no_media_tracks_probe

family: robustness | fixture asset: `empty_audio.wav` (44 bytes, structurally-valid WAV with 0-length `data` chunk) | primaryMetric: durationMs (no `bench{}` block present in shard) | passCount: 5 / 7

## Verdict
- **Best framework: remotion-media-parser@4.0.479** (CONTESTED — 5 of 7 engines PASS).
- **Decisive factor: PERFORMANCE.** Correctness is a dead heat — every PASS engine satisfies the single gating oracle `golden-metadata` identically ("metadata matches golden (1 track(s))"), with no oracle measurements to separate them and no `bench{}` block in this shard. The only quantitative discriminator available is wall time (`durationMs`).
- **Margin over runner-up:** remotion-media-parser 10 ms vs mediabunny 15 ms = **1.5x faster** wall; vs remotion-webcodecs 16 ms = 1.6x; vs ffmpeg-wasm 157 ms = 15.7x; vs platform 6012 ms = **601x**. Caveat: this is a single sample per engine (n=1, all `cached:true`), and a sub-20 ms probe of a 44-byte file is dominated by fixed harness/parse-setup overhead, so the 10 vs 15 vs 16 ms ordering is weak evidence; the large gaps (vs ffmpeg-wasm and platform) are robust.

## Per-engine results
| engine | status | oracles passed | wall (durationMs) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 10 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 15 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 16 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 157 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 6012 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'wav' |

(No engine in this shard carries a `bench{}` object, so throughputRealtime / peakMemory / longtasks are unavailable for all rows; the only numeric field is `durationMs`.)

## Why the winner wins (deep technical)
The operation under test is **probe** (`op: 'probe'`) of a **WAV/PCM** container, not a decode/transcode. The fixture is a deliberate edge case: a 44-byte RIFF/WAVE file whose `fmt ` chunk is well-formed (PCM, 48000 Hz, 2 channels, 16-bit → bitrate 1,536,000) but whose `data` chunk has length 0. The golden (`fixtures/golden/empty_audio.wav.meta.json`) encodes the truth a correct probe must reproduce: `container:"wav"`, `durationSec:null` (no samples → no derivable duration), and exactly one audio track `pcm-s16 / 48000 / 2ch`. The robustness point (scenario `notes`, src/scenarios/robustness/index.ts:666-669) is that the probe must report a *parseable* container with no media payload and **not crash** on the empty `data` chunk — distinct from `zero_length.mp4` (a true 0-byte file that must graceful-fail).

For a header-only WAV probe there is no codec bitstream to decode and no backend math to exercise, so correctness collapses to "parse the RIFF chunk table and enumerate the `fmt ` track without choking on `data`=0." All five PASS engines do this correctly — hence the identical `golden-metadata` pass. remotion-media-parser wins purely on how cheaply it reaches that answer.

remotion-media-parser's adapter declares `probe` as a metadata-tier streaming read and requests only the minimal field set — `durationInSeconds, container, tracks, metadata, rotation` — via `runParse(..., 'metadata-only')` (src/engines/remotion-media-parser/adapter.ts:363-384). Its `configUsed` confirms the cheap path: `backend:"cpu-js", pipeline:"streaming", reader:"webReader", fieldsTier:"metadata-only", worker:false`. For WAV the parser reads the RIFF header and the `fmt ` chunk, emits one audio track, and stops; with `data` length 0 it never iterates samples, so it returns `durationInSeconds:null` straight from the header — exactly the golden. No WebCodecs init, no wasm module load, no worker round-trip. That is why it lands at **10 ms**.

The two other fast PASS engines are essentially tied and lose on fixed setup cost, not capability: **mediabunny** (15 ms) runs its pure-TS demuxer but its config spins up a WebCodecs-oriented streaming-lockstep pipeline (`backend:"webcodecs", pixelBackend:"VideoSample.copyTo(RGBA)>canvas", canvasPoolSize:4`) whose scaffolding is pure overhead for a header-only probe; **remotion-webcodecs** (16 ms) likewise carries a `streaming-backpressure` WebCodecs convert pipeline. **ffmpeg.wasm** (157 ms) is correct but pays the single-thread wasm `avformat` open cost (~15x the winner) just to read a 44-byte header. **platform@chrome-149** (6012 ms) is the outlier: its config (`encode:"<video>→canvas→MediaRecorder(out)", decode:"VideoDecoder"`) routes probe through a real `<video>`/MediaElement metadata load, which for a zero-sample WAV stalls on `loadedmetadata`/timeout-style behavior — 601x slower than the winner for the same one-track answer.

## What each other framework did wrong
- **mediabunny@1.48.0** — PASS, lost on perf only: 15 ms vs 10 ms (1.5x slower). Correctness identical (golden-metadata pass, 1 track). Slower because its WebCodecs streaming-lockstep pipeline scaffolding (canvasPoolSize:4) is set up even for a header-only probe.
- **remotion-webcodecs@4.0.479** — PASS, lost on perf: 16 ms vs 10 ms (1.6x slower). Same correctness; carries a streaming-backpressure WebCodecs convert pipeline that adds setup cost for a no-payload WAV.
- **ffmpeg.wasm@0.12.15** — PASS, lost on perf: 157 ms vs 10 ms (15.7x slower). Correct probe, but single-thread wasm `avformat` container-open dominates for a 44-byte file.
- **platform@chrome-149** — PASS, lost on perf decisively: 6012 ms vs 10 ms (601x slower). MediaElement-based probe (`<video>`/MediaRecorder pipeline) stalls on a zero-sample WAV's metadata-load path; correctness still fine (1 track).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'wav'." Honest NA — web-demuxer is an MP4/MKV/WebM-family WASM demuxer and genuinely does not support RIFF/WAVE input; not an under-declaration.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'wav'." Honest NA — MP4Box.js is ISO-BMFF (MP4/MOV/fMP4) only and cannot parse a RIFF/WAVE container; correct to decline.

## Anti-cheat validation
- **Scenario definition:** src/scenarios/robustness/index.ts:660-670 — `id:'edge_no_media_tracks_probe'`, `op:'probe'`, `asset:'empty_audio.wav'`, `containersIn:['wav']`, `oracles:['golden-metadata']`. Notes (line 666-669) explicitly describe a structurally-valid WAV with a 0-length `data` chunk that must probe to duration-0/no-samples without crashing.
- **Fixture exists & is real:** `fixtures/media/empty_audio.wav` is present, 44 bytes — exactly the size of a RIFF/WAVE header + empty `fmt `/`data` chunks. Real (not mock/synthetic-empty): a true 0-byte file would route to graceful-failure, not this golden-metadata probe. Golden present: `fixtures/golden/empty_audio.wav.meta.json` (container wav, durationSec null, 1 audio pcm-s16/48000/2ch track) and `fixtures/golden/empty_audio.wav.packets.json` (3 bytes → empty packet list, consistent with 0-length data).
- **Oracle is real:** src/core/oracles.ts:593-657 (`goldenMetadata`). It loads `ctx.golden.meta`, fails if probe metadata or golden is absent, then diffs container (line 606), duration within tolerance (614-640), track count (645-647), and per-track codec/dims/fps/sampleRate/channels (compareTrack, 659-686). Not trivially satisfiable: a wrong container, wrong track count, or wrong sampleRate/channels would push a diff and fail. For this fixture it enforces exactly-one-audio-track with codec pcm-s16, sampleRate 48000, channels 2 — physically plausible for the header. durationSec is null in golden so the duration branch is skipped (no spurious tolerance widening). measurements are empty here because durationSec is null (no durationDeltaSec computed) — consistent with the code path, not a sign of a stubbed oracle.
- **Winner adapter is genuine:** src/engines/remotion-media-parser/adapter.ts:348-417 (`probe`) calls `runParse(..., 'metadata-only')` against the real media-parser library requesting `{durationInSeconds, container, tracks, metadata, rotation}` and maps the result through `toNormalizedMetadata`. No hardcoded WAV output, no copy of golden, no swallowed error reported as success. capabilities() declares only probe/demux (lines 188-199), and `containersIn` includes 'wav' (line 197) — so it legitimately accepts this input.
- **Verdict: REAL.** Real fixture + real library parse + a meaningful multi-field golden-metadata comparison that the losers/NAs respect honestly.
- **Cached note:** ALL five PASS rows (and the run as a whole) are `cached:true` ("cached previous PASS result"). Evidence is reused, not freshly re-run; per the launcher seeding caveat, durationMs values (esp. the 10/15/16 ms cluster) are historical and could be stale. The PASS verdicts themselves are deterministic for a header-only probe, so staleness mainly affects the perf ranking confidence, not correctness.

## Confidence & caveats
- **Confidence: medium.** Correctness winner-set (5 PASS) is unambiguous and validated REAL. The *ranking* among the top three rests on a 10/15/16 ms spread at n=1 with everything cached — within fixed-overhead noise for a 44-byte file, so the specific #1 (remotion-media-parser over mediabunny) is the weakest part of the claim.
- No `bench{}` metrics in this shard (no throughputRealtime/peakMemory/longtasks/mad/p95), so the perf comparison is limited to a single `durationMs` sample each.
- The two NA_ENGINE results are honest container-support declines (RIFF/WAVE vs ISO-BMFF / MP4-family), not under-declared capabilities.
- The large gaps (ffmpeg-wasm 157 ms, platform 6012 ms) are robust signal even allowing for cache staleness; the platform MediaElement probe path stalling on a zero-sample WAV is the most interesting robustness finding here.
