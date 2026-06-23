# metadata/read_mp3_xing

**Family:** metadata | **Fixture asset:** `fixtures/media/mp3_xing.mp3` (64 KB, real MPEG-1 Layer III + Xing/Info header) | **Golden:** `fixtures/golden/mp3_xing.mp3.meta.json` | **primaryMetric:** wall | **passCount:** 3 / 7

## Verdict

- **Best framework:** `remotion-webcodecs@4.0.479` (engineId `remotion-webcodecs`).
- **Contested:** YES — 3 engines PASS (`remotion-webcodecs`, `ffmpeg.wasm`, `mediabunny`; plus `remotion-media-parser` which shares the same parser core), all satisfying the single gating oracle `golden-metadata` with effectively identical correctness.
- **Decisive factor:** PERFORMANCE (wall median). Correctness is a tie — every PASS engine clears the *same* strict structural gate with a duration delta inside the ±1-frame band — so the ranking falls to (b) performance. remotion-webcodecs has the lowest wall median.
- **Margin over runner-up:** 3.83 ms vs ffmpeg.wasm 4.22 ms = **1.10x faster wall** over the nearest PASS rival; 1.10x vs remotion-media-parser (4.42 ms) and **1.32x** vs mediabunny (5.06 ms). Caveat: n=1 sample per engine (mad=0, p95==median), so the margins are weak evidence and within plausible run-to-run noise.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 3.830 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 4.220 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 4.425 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 5.065 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |

Only `wall` is collected for this scenario (the read case requests `metrics: ['wall']` in `buildRead`, `src/scenarios/metadata/_shared.ts:93`), so throughputRealtime/peakMemory/longtasks are absent for all engines.

## Why the winner wins (deep technical)

**The operation.** This is a pure structural-metadata READ (`op: 'probe'`) over a bare MP3 *elementary stream* carrying a Xing/Info frame in its first MPEG frame. There is no container box structure to walk (unlike MP4 `moov`/`mvhd`); a correct parser must locate the first valid MPEG sync word, read the side-info/Xing field to recover the exact frame count, and compute duration = frames × 1152 / 44100 for MPEG-1 Layer III. The golden (`fixtures/golden/mp3_xing.mp3.meta.json`) is `container=mp3, durationSec=10, track[0]={audio, mp3, 44100 Hz, 2 ch}`.

**The gate is STRICT, not loose.** This is the crux of the scenario. `golden-metadata` (`src/core/oracles.ts:595`) compares container + duration (±tolerance) + positional per-track {type, codec, sampleRate, channels}. The per-container tolerance resolver `durationToleranceFor` (`src/core/oracles.ts:240`) routes MP3 through `isLooseMp3` (`src/core/oracles.ts:216`), which returns **false** for any asset id containing `xing` (line 221) — so the Xing variant keeps the STRICT ±1-frame band (`durationToleranceSec = 1/24 ≈ 0.04167s`, `src/core/oracles.ts:159`) rather than the loose `max(±0.5s, ±15%)` band that a CBR-no-TOC MP3 would get. The scenario notes make this intent explicit: "duration STRICT: Xing frame count" (`src/scenarios/metadata/index.ts:108`). So passing here means the engine read the Xing frame count accurately, not just byterate-estimated.

**Winner mechanism.** `remotion-webcodecs.probe()` (`src/engines/remotion-webcodecs/adapter.ts:332`) delegates to `@remotion/media-parser`'s `parseMedia({ fields: { container, durationInSeconds, tracks, metadata } })` (line 346). For MP3 this is a streaming `webReader` parse (`env.configUsed.reader: "webReader"`, `pipeline: "streaming-backpressure"`) that does NOT spin up WebCodecs or the wasm core at all for a header-only probe — it reads the first frames, parses the Xing header, and returns the exact duration. The measured `durationDeltaSec = 0.03102s < tol 0.04167s` (a delta of ~1.2 MP3 frames against the rounded golden 10.0s; the true stream tail is at PTS 10.0049s per the golden packet table, 384 frames) — a comfortable PASS on the strict band. Because the probe is a lightweight header scan with no decode and no container demux, it finishes in **3.83 ms** wall, the lowest of the field.

**Why it edges the other PASS engines.** `remotion-media-parser` (4.42 ms) reports the *identical* `durationDeltaSec = 0.03102040816326479` — unsurprising, since remotion-webcodecs *is* the media-parser core wrapped with a WebCodecs convert layer; for a probe the two share the same parse path, and the ~0.6 ms gap is parse-wrapper overhead at n=1, i.e. noise. `ffmpeg.wasm` (4.22 ms) takes an independent path: it runs the vendored ffmpeg core (`src/engines/ffmpeg-wasm/adapter.ts:1892`) which yields a slightly different `durationDeltaSec = 0.03000s` — also a clean PASS — but pays wasm-core invocation cost. `mediabunny` (5.06 ms) parses with its pure-TS ESM core (`coreBuild: "pure-ts-esm"`, `coopCoep: "not-required"`) and is correct but slowest. All four agree on the structural fields; the only separator is wall time, and remotion-webcodecs is fastest.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15** — PASS, lost on performance: wall 4.22 ms vs 3.83 ms (1.10x slower). Correctness is arguably *equal-or-better* (its delta 0.0300s is marginally tighter than 0.0310s), but the ranking ladder uses performance once correctness is comparable, and it is slower. wasm-core invocation overhead vs a JS header scan.
- **remotion-media-parser@4.0.479** — PASS, lost on performance: wall 4.42 ms vs 3.83 ms (1.15x slower). Same parser core as the winner, identical durationDelta; loses only the WebCodecs-wrapper's marginal speed edge at n=1.
- **mediabunny@1.48.0** — PASS, lost on performance: wall 5.06 ms vs 3.83 ms (1.32x slower), the slowest PASS. Correct structural read via pure-TS core; just the highest wall time.
- **platform@chrome-149** — NA_ENGINE, "does not declare input container 'mp3'". HONEST: its `containersIn` is `['mp4','mov','webm','mkv','wav']` (`src/engines/platform/adapter.ts:240`) — no mp3. The WebCodecs/`<video>` route has no demuxer for a bare MP3 elementary stream, so an honest NA, not an under-declared capability.
- **mp4box@2.3.0** — NA_ENGINE, "does not declare input container 'mp3'". HONEST: `containersIn: ['mp4','mov']` (`src/engines/mp4box/adapter.ts:645`). mp4box.js is an ISO-BMFF box parser; it cannot parse a bare MP3 elementary stream (it lists `mp3` only as an audio *codec* inside MP4, line 650). Correct NA.
- **web-demuxer@4.0.0** — NA_ENGINE, "does not declare input container 'mp3'". HONEST: `containersIn: ['mp4','mov','mkv','webm','ts']` (`src/engines/web-demuxer/adapter.ts:639`). It lists `mp3` as an audio codec (line 645) but not the bare mp3 container as an input. Correct NA.

## Anti-cheat validation

- **Scenario definition:** built by `buildRead` (`src/scenarios/metadata/_shared.ts:81`), case at `src/scenarios/metadata/index.ts:104-109` → id `metadata/read_mp3_xing`, `op:'probe'`, `input:'mp3_xing.mp3'`, oracles `['golden-metadata']`, requires container `mp3` + audioCodec `mp3`.
- **Fixture is real:** `fixtures/media/mp3_xing.mp3` exists, 64 KB, a genuine MPEG-1 Layer III + Xing file (golden packet table `fixtures/golden/mp3_xing.mp3.packets.json` has 384 frames, first keyframe size 731 B @ PTS 0, last @ PTS 10.0049 s — physically consistent with 384 × 1152/44100 ≈ 10.03 s of audio). Not synthetic/empty/mock.
- **Winner adapter is genuine:** `remotion-webcodecs.probe()` (`src/engines/remotion-webcodecs/adapter.ts:332`) calls the real `@remotion/media-parser parseMedia` (line 346) requesting real fields; no canned output, no golden short-circuit, no error-swallowing. The returned duration drives the oracle.
- **Oracle is meaningful:** `goldenMetadata` (`src/core/oracles.ts:595`) does a real field-by-field compare against the golden and applies the STRICT ±0.04167 s band (Xing routed out of the loose path by `isLooseMp3`, `src/core/oracles.ts:216-223`). The measured 0.03102 s delta is a real, plausible MP3 frame-count delta inside that band — this is NOT a trivially-satisfiable gate (a byterate-estimating parser that drifted past ~1.2 frames would FAIL).
- **Verdict:** **REAL** — real fixture + real library probe + a strict, meaningful structural oracle.
- **Cached note:** ALL four PASS results have `cached==true` ("cached previous PASS result"). The verdict is sound but the precise wall numbers were reused, not freshly re-run; the 1.10x margin over ffmpeg.wasm could flip on a fresh n>1 run. Per the launcher-seeding caveat, treat the perf ranking as low-confidence.

## Confidence & caveats

- **Correctness: high.** The gate is strict and all three winners clear it on independent parse paths with mutually consistent deltas.
- **Perf ranking: low.** n=1 per engine (mad=0, p95==median — single sample), all cached, and the spread between the top three (3.83 / 4.22 / 4.42 ms) is well within sub-millisecond noise. remotion-webcodecs and remotion-media-parser share a parser core, so the "winner" vs media-parser distinction is essentially a wrapper artifact.
- Only one oracle gates this scenario (single-oracle correctness); tag CONTENT (TIT2/TPE1) is explicitly NOT verified (see HONEST SCOPE, `src/scenarios/metadata/index.ts:21-24`), so "metadata read" here means STRUCTURAL fields only.
