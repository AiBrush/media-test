# probe/mp3_cbr_notoc

- **Family:** probe
- **Fixture asset:** `mp3_cbr_notoc.mp3` (161 KB, real file in `fixtures/media/`)
- **Golden:** `fixtures/golden/mp3_cbr_notoc.mp3.meta.json` (container `mp3`, duration 10.031s, 1 audio track: mp3 / 44100 Hz / 2ch / 128 kbps)
- **primaryMetric:** wall (ms)
- **passCount:** 4 of 7 (3 NA_ENGINE)

## Verdict

- **Best framework:** `remotion-webcodecs@4.0.479` (env.engineId `remotion-webcodecs`)
- **Contested:** YES — 4 engines PASS the identical gating oracle (`golden-metadata`) at identical strictness, so the decision falls to performance.
- **Decisive factor:** lowest wall-clock probe time. Correctness is a tie (every PASS engine matched container/duration/codec/sampleRate/channels against the golden), so the runner-up margin is purely latency.
- **Margin over runner-up:** wall median **4.140 ms** vs mediabunny **5.335 ms** = **1.29x faster** (mediabunny is runner-up). Versus ffmpeg.wasm 9.62 ms = 2.32x; versus remotion-media-parser 13.515 ms = 3.27x. CAVEAT: all benches are n=1 (single sample, mad=0), so the ordering is weak evidence — see Confidence.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 4.140 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 5.335 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 9.620 | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 13.515 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |

(No throughputRealtime / peakMemory / longtasks were recorded in the shard bench for any engine — only `wall`.)

## Why the winner wins (deep technical)

The operation is a metadata probe of a **CBR MP3 elementary stream with no Xing/Info TOC frame**. This is the hard case for duration: an MP3 file is a bare concatenation of MPEG-1 Layer III frames; unlike MP4 `mvhd` or FLAC STREAMINFO, the container carries **no global duration field**. Without a Xing/Info header (which would carry an exact frame count), a demuxer must ESTIMATE total duration as `byterate × size` (here 128000 bps over ~161 KB of audio payload ≈ 10.03 s), an estimate that drifts with ID3 padding and the final partial frame. The scenario explicitly notes this: *"CBR, no Xing TOC — duration estimated from bitrate × size; oracle tolerance applies"* (`src/scenarios/probe/index.ts:210`).

Because no precise global duration exists, the gating oracle relaxes the duration band for this asset. `isLooseMp3` (`src/core/oracles.ts:216-223`) matches the asset id `mp3_cbr_notoc` on the `notoc`/`cbr` markers and returns true, so `durationToleranceFor` (`src/core/oracles.ts:240-254`) applies the loose band `max(±0.5 s, ±15% × golden)` ≈ `max(0.5, 1.50465)` = **±1.50465 s** (the `durationToleranceSec` reported by every engine). Crucially, the winner's MEASURED duration delta is **0.0000204 s** — five orders of magnitude inside the tolerance. So although the gate is wide *by design* for this container, remotion-webcodecs did not exploit slack: it returned a duration essentially bit-identical to the golden 10.031 s. The same is true of mediabunny (Δ 0.0000204 s) and remotion-media-parser (Δ 0.0000204 s); only ffmpeg.wasm differed materially (Δ 0.001 s), still trivially inside band.

Mechanistically the winner runs a real `@remotion/media-parser` `parseMedia()` call with `fields: { container, durationInSeconds, tracks, metadata }` (`src/engines/remotion-webcodecs/adapter.ts:346-355`), then `normalizeMetadata(container, result.durationInSeconds, result.tracks, result.metadata)` (`adapter.ts:360`). For a header-less MP3 there is no WebM-fps fallback and no packet-probe fallback path taken (`adapter.ts:366-376` are skipped), so the probe is a single streaming header/frame scan — `pipeline: "streaming-backpressure"`, `reader: webReader`. It does NOT decode any audio (probe needs only frame headers + sampleRate/channels/bitrate), which is why the wall time is ~4 ms.

Why faster than the others, even though all four use a frame-header scan: backend differences are negligible for a metadata-only probe (mediabunny `backend: webcodecs`, remotion-webcodecs `backend: webcodecs`, both `coopCoep: not-required`, no SharedArrayBuffer needed — none actually invoke WebCodecs here since no frames are decoded). The 4.14 ms vs 5.335 ms vs 9.62 ms vs 13.515 ms spread reflects per-library header-scan overhead and parser setup cost on a 161 KB file: remotion-webcodecs and remotion-media-parser share the IDENTICAL parseMedia read path yet differ 3.27x — strong indication this is single-sample noise (warmup/JIT) rather than an architectural advantage, since the same underlying library cannot be 3x faster than itself. ffmpeg.wasm carries wasm module-init + virtual-FS write overhead (it must `writeFile` the input into MEMFS before `ffprobe`-style demux), explaining its mid-pack 9.62 ms despite being a mature C demuxer.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on latency only. Same oracle, same Δ 0.0000204 s duration match, but wall 5.335 ms vs 4.140 ms = 0.78x the speed (1.29x slower). Correctness identical; this is the genuine runner-up.
- **ffmpeg.wasm@0.12.15** — PASS, lost on latency. wall 9.620 ms = 2.32x slower than winner; duration Δ 0.001 s (still ~1500x inside the ±1.50465 s band). Slowed by wasm init + MEMFS input copy before its demux.
- **remotion-media-parser@4.0.479** — PASS, lost on latency. wall 13.515 ms = 3.27x slower, the slowest PASS. Shares the exact parseMedia code path with the winner, so its loss is almost certainly n=1 warmup noise, not a real deficit.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'mp3'". HONEST NA — MP4Box.js is an ISO-BMFF (MP4/MOV/fragmented) box parser and structurally cannot parse a bare MPEG elementary stream; it correctly does not declare `mp3` as an input container.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'mp3'". HONEST NA — the platform adapter relies on WebCodecs/MediaSource demux paths that do not expose a raw-MP3 container parser; declining is correct rather than under-declared (a probe via `<audio>` would not yield the normalized track/duration fields this suite requires).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'mp3'". HONEST NA — web-demuxer's declared container set targets MP4/WebM/etc.; not declaring raw MP3 is a truthful capability statement, not a dodge.

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/probe/index.ts:206-211` — `{ asset: 'mp3_cbr_notoc.mp3', container: 'mp3', audioCodecs: ['mp3'], notes: 'CBR, no Xing TOC ...' }`. Real probe scenario, real gating rationale.
- **Fixture exists:** `fixtures/media/mp3_cbr_notoc.mp3` present, 161 KB — a genuine MP3 elementary stream, NOT synthetic/empty/mock. Golden `fixtures/golden/mp3_cbr_notoc.mp3.meta.json` present with physically plausible values (10.031 s, 44100 Hz, 2ch, 128 kbps CBR — consistent: 128000 bps × 10.031 s ≈ 160 KB, matching the 161 KB file).
- **Oracle:** `golden-metadata` at `src/core/oracles.ts:595-657`. Performs a REAL field-by-field comparison of measured metadata vs golden: container string, per-track type/codec/sampleRate/channels (exact), duration within a documented per-container band. The MP3-no-TOC duration band is loose (±1.50465 s) but this is JUSTIFIED and auditable (`oracles.ts:174-254`) — and the winner's actual Δ of 0.0000204 s would pass even the STRICT ±1-frame gate, so the loose band did not rescue it. Codec/sampleRate/channels are still exact-match (no tolerance), so the oracle is not trivially satisfiable.
- **Winner adapter:** `src/engines/remotion-webcodecs/adapter.ts:332-376` (`probe`) — calls real `mp.parseMedia({ fields: { container, durationInSeconds, tracks, metadata } })` and normalizes. No canned output, no copy of input to fake a result, no short-circuit to the golden, no error-swallowing. Genuine library call.
- **Verdict: REAL** — real fixture + real `parseMedia` implementation + a meaningful oracle that exact-matches codec/sampleRate/channels and whose duration check the winner passes by 5 orders of magnitude. The loose duration band is the only soft spot, but it is documented, container-justified, and not load-bearing for this result.
- **Cached note:** winner result has `cached: true` ("cached previous PASS result"); ALL four PASS engines and their benches are cached/reused, not freshly re-run. The PASS correctness is stable, but the wall-time ranking carries staleness risk on top of the n=1 issue.

## Confidence & caveats

- **Confidence: medium.** The PASS/NA classification and correctness verdict are solid (REAL fixture, REAL implementation, exact codec/track match). The *winner identity* is the soft part: it rests entirely on a wall-time margin where every bench is **n=1, mad=0, cached=true**, and the slowest engine (remotion-media-parser, 13.515 ms) runs the IDENTICAL parseMedia code as the winner (4.140 ms) — a 3.27x intra-library spread that can only be single-sample/warmup noise. The 1.29x margin over mediabunny is real but small and equally fragile on one sample.
- The duration tolerance for this asset is intentionally loose (±1.50465 s); it did not affect ranking because all engines matched within microseconds.
- No throughputRealtime / peakMemory / longtasks data was captured, so secondary performance tiebreakers could not be applied.
