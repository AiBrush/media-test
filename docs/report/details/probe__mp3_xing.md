# probe/mp3_xing

family: probe | fixture asset: `mp3_xing.mp3` (fixtures/media/mp3_xing.mp3, 64 KB, real) | primaryMetric: wall | passCount: 4/7

## Verdict

- Best framework: **mediabunny@1.48.0** (status=PASS).
- **CONTESTED**: 4 engines PASS (mediabunny, ffmpeg.wasm, remotion-media-parser, remotion-webcodecs); 3 NA_ENGINE (platform, mp4box, web-demuxer).
- Decisive factor: **performance**. All four passers satisfy the identical correctness gate (the single `golden-metadata` oracle, all under the STRICT mp3 per-frame band), so the ranking falls through to wall-clock. mediabunny has the lowest wall median, 2.965 ms.
- Margin over runner-up (ffmpeg.wasm @ 4.105 ms): **1.38x faster wall**. Over remotion-webcodecs (6.69 ms): 2.26x. Over remotion-media-parser (13.02 ms): 4.39x.
- Evidence strength caveat: every passer is `cached=true` and `n=1` (mad=0, p95==median) — a single-sample, reused timing, so the perf margin is weak evidence (see Confidence).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-metadata:true | 2.965 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 4.105 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 6.690 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 13.020 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'mp3' |
| mp4box@2.3.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'mp3' |
| web-demuxer@4.0.0 | NA_ENGINE | — | n/a | n/a | n/a | n/a | engine does not declare input container 'mp3' |

The shard's `bench` object only contains the `wall` metric for every engine; throughputRealtime/peakMemory/longtasks were not recorded for this probe, so they are reported n/a (not invented).

## Why the winner wins (deep technical)

The operation is a **metadata probe of a raw MP3 elementary stream** (`mp3_xing.mp3`): MPEG-1 Layer III, 44100 Hz, 2 channels, ~51.2 kbps, 10.000 s nominal. The container is "mp3" — a headerless concatenation of MPEG audio frames with a leading **Xing/Info VBR header** in the first (silent) frame. The Xing header carries an explicit frame count, which is exactly why this scenario is gated STRICT rather than estimate-only: the demuxer can compute an accurate duration (frames × samples-per-frame ÷ sample rate) instead of guessing from bitrate × file size. The scenario note confirms this: "Xing/Info header → accurate duration." The oracle's `isLooseMp3()` (src/core/oracles.ts:216) only loosens MP3s whose id contains `cbr`/`notoc`/`noxing`/`no_toc`; `mp3_xing` matches none, so the strict per-frame band `durationToleranceSec = 0.041666...s` (one MP3 frame = 1152/44100 s ≈ 26.1 ms; the band is ~1.6 frames) applies.

The only gate is `golden-metadata` (src/core/oracles.ts:595). It performs a real field-by-field comparison of measured metadata against `fixtures/golden/mp3_xing.mp3.meta.json` (container=mp3, durationSec=10, one audio track: codec=mp3, 44100 Hz, 2ch). It checks container string, duration within tolerance, track count, and per-track codec/sampleRate/channels (compareTrack, oracles.ts:659). mediabunny's measured `durationDeltaSec = 0.03102 s` sits comfortably under the 0.04167 s strict band — i.e. it landed within ~1.2 MP3 frames of the golden 10.000 s, which is the expected encoder-delay/padding residue for a Xing-headed file, and it matched container + codec + 44100/2 exactly (the oracle returned "metadata matches golden (1 track(s))").

Mechanistically, mediabunny earns the win on the cheap-metadata path in its adapter, `metadataFromInput()` (src/engines/mediabunny/adapter.ts:417-453). It opens the file with the real `mb.Input` (adapter.ts:245+) and resolves duration via `input.getDurationFromMetadata()` FIRST (adapter.ts:429) — this reads the Xing frame-count header directly and only falls back to the expensive `input.computeDuration()` sample-walk (adapter.ts:436) if the header path yields null/non-finite. For an MP3 with a valid Xing header that fast path returns immediately, so mediabunny never walks all MPEG frames. Combined with mediabunny's pure-TS ESM core (`coreBuild: pure-ts-esm`, no wasm instantiation, no SharedArrayBuffer/COOP-COEP per env.configUsed), the probe is a near-pure header read, which is why its 2.965 ms wall beats the wasm-backed ffmpeg (which must boot/feed the wasm module) by 1.38x and the heavier remotion paths by 2.3-4.4x.

Note ffmpeg.wasm was marginally MORE accurate on duration (durationDeltaSec=0.03000 vs mediabunny 0.03102), but both are far inside the same strict band, so correctness is a tie and ffmpeg loses purely on wall time. The two remotion engines reported the identical delta to mediabunny (0.03102), consistent with the same frame-count source; they lose only on wall.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** correct (golden-metadata pass, durationDeltaSec=0.03000s, even tighter than the winner), but wall median 4.105 ms = 1.38x slower than mediabunny. The wasm core must be instantiated and fed the file before it can parse the Xing header, paying overhead a pure-TS reader avoids.
- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** correct (durationDeltaSec=0.03102s), wall 6.69 ms = 2.26x slower. Its WebCodecs/backpressure pipeline machinery is overkill for a metadata-only header read.
- **remotion-media-parser@4.0.479 (PASS, lost on perf):** correct (durationDeltaSec=0.03102s), wall 13.02 ms = 4.39x slower — slowest passer. The `cpu-js` streaming `webReader` parser (env.configUsed.backend=cpu-js) is the heaviest path for this tiny file.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare input container 'mp3'". Honest NA — the Chrome platform adapter is built around WebCodecs + MSE/MP4 demuxing and does not expose a raw-MP3 container demuxer/prober, so it correctly negotiates out rather than faking a result.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'mp3'". Honest — mp4box.js is an ISO-BMFF (MP4/MOV/fragmented) parser by design; a raw MPEG elementary stream is genuinely out of scope.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare input container 'mp3'". Plausibly honest given its declared container set; web-demuxer wraps ffmpeg-style demuxing and could in principle handle MP3, so this is the only NA worth flagging as a possible under-declaration — but with no contrary evidence in the registry it reads as an honest capability gap, not a dodge of a hard test.

## Anti-cheat validation

- Scenario definition: src/scenarios/probe/index.ts:194 — `{ asset: 'mp3_xing.mp3', container: 'mp3', audioCodecs: ['mp3'], notes: 'Xing/Info header → accurate duration.' }`. No explicit `id`, so the scenarioId `probe/mp3_xing` is derived from the asset stem. Real probe of a real container; not synthetic/mock.
- Fixture: `fixtures/media/mp3_xing.mp3` EXISTS (stat: 64 KB regular file). Golden: `fixtures/golden/mp3_xing.mp3.meta.json` EXISTS (container=mp3, durationSec=10, audio mp3 44100/2ch, bitrate 51158), plus a `.packets.json` golden present (used by the separate demux scenario, not this probe).
- Oracle: `goldenMetadata` at src/core/oracles.ts:595 — performs a genuine field comparison (container/duration/track-count/codec/sampleRate/channels) against the golden file; duration band is the STRICT per-frame tolerance (0.04167 s) because `isLooseMp3()` (oracles.ts:216) excludes Xing-headed MP3s. Not trivially satisfiable: the band is ~1.6 frames and the measured deltas (~0.030-0.031 s) are physically plausible Xing encoder-delay residue, not a slop-anything tolerance.
- Winner adapter: src/engines/mediabunny/adapter.ts:417 `metadataFromInput()` — opens the real `mb.Input`, reads duration via the real `input.getDurationFromMetadata()` (adapter.ts:429) with a real `computeDuration()` fallback (adapter.ts:436), and enumerates tracks via `input.getTracks()` (adapter.ts:443). No hardcoded/canned metadata, no short-circuit to the golden file, no swallowed-error-as-success (catches set duration to null, which would FAIL the oracle, not fake a pass).
- Verdict: **REAL** — real fixture + real library probe + a meaningful strict-band metadata oracle whose measurements are physically plausible.
- Cached note: the winner's result has `cached=true` (reason "cached previous PASS result"), as do all four passers. The timings were reused, not freshly re-run, and each has n=1 (mad=0). Per the launcher-seeding caveat, a fully honest fresh perf run would require clearing the cache; the PASS verdict (correctness) is unaffected, but the 1.38x perf margin should be treated as indicative, not definitive.

## Confidence & caveats

- Correctness winner is solid; the perf-based ranking is **medium confidence**. Every passer is single-sample (n=1, mad=0, p95==median) and `cached=true`, so the 1.38x margin over ffmpeg.wasm could plausibly invert under a fresh multi-sample run on a 64 KB file where absolute times are tiny (a few ms) and noise-dominated.
- Correctness is genuinely tied among the four passers (same oracle, same strict band, deltas 0.030-0.031 s); ffmpeg.wasm is fractionally more duration-accurate, so if perf were a wash the call would be near-arbitrary between mediabunny and ffmpeg.
- The three NA_ENGINE outcomes are honest container-capability gaps; only web-demuxer is theoretically capable of MP3 and worth a registry double-check, but nothing in the shard indicates a dodge.
