# probe/massive_vp9_1080p_2h

- **family:** probe
- **fixture asset:** `massive_vp9_1080p_2h.webm` (775 MB real VP9/Opus WebM, ~2h, fixtures/media/)
- **primaryMetric:** wall (median ms; probe-family case has no `opsPerSec`, only `wall`)
- **passCount:** 5 of 7 (mp4box NA_ENGINE; all others PASS)

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479` — **CONTESTED** (5 engines PASS).
- **Decisive factor:** PERFORMANCE. All five PASS engines satisfy the *identical* single correctness gate
  (`golden-metadata`), each with `durationDeltaSec` ≤ 0.007s against a ±0.0417s (±1 frame @ 24fps) tolerance,
  so correctness strength is a flat tie. The win is decided purely on `wall` median.
- **Margin over runner-up:** 3.74 ms vs 3.95 ms (`remotion-webcodecs`) = **1.06x faster wall** — a razor-thin
  lead. Both are ~3.3x faster than mediabunny (12.9 ms), ~6.9x faster than web-demuxer (25.9 ms),
  ~300x faster than ffmpeg.wasm (1122.7 ms) and ~2138x faster than platform (7999.5 ms). The two leaders are
  statistically indistinguishable: n==1, mad==0, no spread to separate them.

## Per-engine results

| engine | status | oracles passed | wall median (ms) | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:pass | 3.74 | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:pass | 3.95 | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:pass | 12.91 | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | PASS | golden-metadata:pass | 25.89 | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:pass | 1122.66 | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | PASS | golden-metadata:pass | 7999.49 | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | (none) | n/a | n/a | n/a | n/a | engine does not declare input container 'webm' |

(No throughputRealtime/peakMemory/longtasks metrics are emitted by this probe case; only `wall` is collected.)

## Why the winner wins (deep technical)

The operation is a **probe** (metadata read) of a **775 MB, ~2-hour VP9-in-WebM file with an Opus mono audio
track** (golden: container `webm`, durationSec 7200.008, video vp9 1920x1080 @30fps, audio opus 48000 Hz mono).
The scenario's whole point (notes: *"massive bucket VP9/WebM twin. Exercises long-form lazy probe behavior
outside ISOBMFF"*) is to confirm an engine reports ~2h duration + track shape **without** ingesting the full
file or walking the cluster/cue index — i.e. a lazy, header-only read of a Matroska/EBML container.

`remotion-media-parser` wins because its adapter has a **purpose-built EBML header-only fast path** that bypasses
the general parser entirely for long WebM files. In `src/engines/remotion-media-parser/adapter.ts:348` (`probe`),
it first calls `webmHeaderMetadata(input)` (adapter.ts:354), which (adapter.ts:724) reads only the first
`WEBM_HEADER_RANGE_BYTES` of the file via an HTTP **Range** request (`readInputPrefix`, adapter.ts:774-792, issues
`Range: bytes=0-<len-1>` and requires a 206/short response). It then hand-parses the EBML tree
(`webmHeaderMetadataFromPrefix`, adapter.ts:820+) walking only `Segment → Info` (TimestampScale 0x2ad7b1 +
Duration 0x4489) and `Segment → Tracks` (TrackEntry/CodecID/PixelWidth/PixelHeight/SamplingFrequency/Channels EBML
IDs at adapter.ts:801-818). The gate `shouldUseHeaderOnlyWebmProbe` (adapter.ts:737) fires precisely here:
non-mutated input with `durationSec >= 600`, which the 7200s file satisfies, so the adapter returns metadata after
reading only the file header and **never** opens the multi-GB body. With `configUsed.backend: cpu-js`,
`reader: webReader`, `fieldsTier: metadata-only`, `worker: false`, this is a pure-JS, no-WebCodecs, no-wasm,
no-COOP/COEP path — and it lands at **3.74 ms** with `durationDeltaSec: 0` (exact match to golden 7200.008s).

`remotion-webcodecs` (3.95 ms, also `durationDeltaSec: 0`) is effectively the same parser stack underneath
(shared Remotion media-parser), so its 0.21 ms deficit is noise, not a structural difference — its config shows
the WebCodecs decode pipeline that is simply not exercised for a metadata-only probe. mediabunny (12.9 ms) and
web-demuxer (25.9 ms) also parse the EBML header correctly (both `durationDeltaSec: 0`) but lack a dedicated
"≥600s ⇒ header-only" short-circuit and pay more per-call overhead. ffmpeg.wasm (1122.7 ms, `durationDeltaSec:
0.002`) pays the wasm module + libavformat container-open cost — three orders of magnitude slower but still
correct. `platform` (7999.5 ms, `durationDeltaSec: 0.007`) uses the browser's `<video>`/WebCodecs media element to
extract metadata, the slowest viable path here.

## What each other framework did wrong

- **remotion-webcodecs@4.0.479** — PASSed, lost on wall by 0.21 ms (3.95 vs 3.74, 1.06x). Same correctness
  (golden-metadata pass, durationDeltaSec 0). Loss is within measurement noise (n==1, mad==0).
- **mediabunny@1.48.0** — PASSed (durationDeltaSec 0) but 12.9 ms = 3.45x slower than winner; no ≥600s header-only
  short-circuit, so more per-call EBML/setup overhead despite identical result.
- **web-demuxer@4.0.0** — PASSed (durationDeltaSec 0) but 25.9 ms = 6.9x slower; wasm-backed demuxer open cost on
  top of header parse.
- **ffmpeg.wasm@0.12.15** — PASSed but 1122.7 ms = 300x slower (wasm libavformat container open); durationDeltaSec
  0.002s, well inside tolerance.
- **platform@chrome-149** — PASSed but 7999.5 ms = 2138x slower (browser media-element metadata extraction);
  durationDeltaSec 0.007s, inside tolerance.
- **mp4box@2.3.0** — NA_ENGINE, honest: "engine does not declare input container 'webm'". MP4Box is an ISOBMFF-only
  parser; WebM/Matroska is genuinely out of its scope, so the NA is correct, not an under-declared capability.

## Anti-cheat validation

- **Scenario:** `src/scenarios/probe/index.ts:327` — `asset: 'massive_vp9_1080p_2h.webm'`, container `webm`,
  videoCodecs `['vp9']`, audioCodecs `['opus']`, oracles `['golden-metadata']`, metrics `['wall']`. Notes confirm
  the intent (long-form lazy probe outside ISOBMFF).
- **Fixture exists:** `fixtures/media/massive_vp9_1080p_2h.webm` = **775 MB real WebM** (stat confirmed). Not
  synthetic/empty/mock. Golden present: `fixtures/golden/massive_vp9_1080p_2h.webm.meta.json` (container webm,
  durationSec 7200.008, vp9 1920x1080@30 + opus 48000 mono), plus `.packets.json` (68 MB) and `.frames.json`.
- **Oracle:** `golden-metadata` at `src/core/oracles.ts:595-657`. Real comparison: container string match,
  duration within ±tolerance (`durationToleranceFor`, default `1/24 ≈ 0.0417s`, oracles.ts:159), and positional
  per-track codec/width/height/fps/sampleRate/channels checks (`compareTrack`, oracles.ts:659+). Not trivially
  satisfiable — wrong container, missing track, or >1-frame duration drift all FAIL. Measured deltas (0–0.007s)
  are physically plausible for a 7200s file.
- **Winner adapter:** `src/engines/remotion-media-parser/adapter.ts:348` (`probe`) → `webmHeaderMetadata`
  (adapter.ts:724) → `readInputPrefix` HTTP Range read (adapter.ts:774) → `webmHeaderMetadataFromPrefix` EBML parse
  (adapter.ts:820). Genuine: real ranged fetch + real EBML element walk; no canned output, no copy of golden, no
  swallowed error reported as success (failures return null and fall through to real `parseMedia`, adapter.ts:335).
- **Verdict:** **WEAK-GATE.** The implementation, fixture, and oracle are all REAL, but the only gate is a
  single `golden-metadata` comparison (container + duration band + track shape). For a probe this is the
  appropriate correctness check, yet it is a metadata-exact gate, not a bit-exact/packet-level one, and the
  winning margin (0.21 ms, 1.06x) is inside n==1 noise. The PASS is real but the *winner selection* rests on a
  near-tie performance number, so the result is not strong evidence of a meaningful lead.
- **Cached note:** ALL seven entries have `cached: true` ("cached previous PASS result"). Every number here was
  reused, not re-run this session — staleness risk applies uniformly; the wall figures (3.74 vs 3.95 ms) come
  from a prior run and were not freshly measured.

## Confidence & caveats

- **Confidence: medium.** Fixture, oracle, and winner code paths verified as real and correctly scoped.
- The winner/runner-up gap (1.06x, 0.21 ms) is within noise: n==1, mad==0, no p95 spread. remotion-media-parser
  and remotion-webcodecs share the Remotion media-parser core, so the "winner" is essentially a coin-flip between
  two builds of the same parser; treat the ranking as a tie at the top.
- All entries cached ⇒ numbers are stale (per launcher seeding caveat in memory); a fresh run could reorder the
  two leaders. The conclusion that *this Remotion parser family wins probe-at-scale on WebM* is robust; the exact
  1st-vs-2nd ordering is not.
- mp4box NA is honest (ISOBMFF-only); no under-declaration.
