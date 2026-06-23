# metadata/write_ogg_vorbiscomment

- family: metadata
- fixture asset: `opus.ogg` (Opus-in-Ogg, 48 kHz stereo, 145,910 bytes, golden duration 10.007s)
- primaryMetric: none set in scenario (bench reports `wall`, `targetWrites`)
- passCount: 2 of 7 (ffmpeg.wasm, mediabunny). 5 NA_ENGINE.

## Verdict

- Best framework: **ffmpeg.wasm@0.12.15** (engineId `ffmpeg-wasm`).
- Status: **CONTESTED** — two engines PASS with byte-for-byte identical oracle outcomes.
- Decisive factor: **performance only** (correctness is a tie). On the `wall` metric ffmpeg.wasm
  posts median 8.475 ms vs mediabunny 13.835 ms — **~1.63x faster wall** (13.835 / 8.475 = 1.632).
- Margin caveat: both samples are **n=1, mad=0, cached=true**. The wall gap is real but weak evidence
  (single shot, both reused from cache). Correctness rank is a dead heat (same two oracles, same
  measurements to the 4th decimal), so the decision falls to the only differentiator available.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | reference-reimport:true, property-invariant:true | 8.475 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | reference-reimport:true, property-invariant:true | 13.835 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'remux' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ogg' |

Neither passing engine emitted `throughputRealtime`, `peakMemory`, or `longtasks` (the write scenario's
metrics are `['wall','targetWrites']`; `targetWrites` recorded n=0, median 0 for both). So the contest is
settled on `wall` alone.

## Why the winner wins (deep technical)

This case is an **op:`remux` with `tags`** on an Opus elementary stream carried in an Ogg container
(`buildWrite`, `_shared.ts:133-152`). The runner forwards `options.tags` (the UNICODE_TAGS map — emoji/CJK
title, non-ASCII artist, a ~324-byte comment) to `engine.remux(input, { container:'ogg', tags })`, exposes
the bytes as `ctx.output`, and gates with two oracles that observe that output:

1. `reference-reimport` (`oracles.ts:1225`) — the reference engine demuxes the produced Ogg and asserts a
   real, parseable container with the expected media-track layout. Both engines yield exactly:
   `reimportPackets 501, reimportKeyframes 501, reimportMediaTracks 1, goldenMediaTracks 1,
   durationDeltaSec 0.0065, durationToleranceSec 0.1`. 501 Opus packets at 48 kHz over ~10 s is physically
   right (~20 ms per Opus packet → ~500 packets), and every Opus packet is independently decodable, so all
   501 reading as keyframes is correct, not a fabrication.
2. `property-invariant` with token `probe-duration` (PROBE_DUR; `_shared.ts:68`) routes to the
   probe-duration branch (`oracles.ts:2709-2758`): the reference re-probes `ctx.output` and compares its
   duration to the golden. Both engines report `outDurationSec 10.0135, goldenDurationSec 10.007,
   deltaSec 0.0065 ≤ durationToleranceSec 0.0417`. This is the honest no-PCM-oracle proxy for "the tag
   rewrite did not corrupt the audio stream."

Because the two oracles are **identical to the 4th decimal across both engines**, correctness strength is a
true tie (both: structural/duration proxy tier — there is no bit-exact or tag-content gate here). The
ladder in section A(4)(a) cannot separate them, so the tiebreak is A(4)(b) performance.

ffmpeg.wasm wins on `wall`: 8.475 ms vs 13.835 ms (1.63x). Mechanistically, ffmpeg.wasm's remux
(`src/engines/ffmpeg-wasm/adapter.ts:2031-2069`) is a pure stream-copy: it runs `-i in -map 0 -c copy`
and appends `-metadata key=value` per tag (`adapter.ts:2056-2061`), so no Opus decode/encode happens — the
encoded Opus packets are rewrapped into a fresh Ogg with a rewritten comment header, inside an already-warm
wasm core (the bench `wall` measures the in-MEMFS exec window; the 4201 ms `durationMs` includes
core/FS setup, which is why wall is so small). mediabunny's remux
(`src/engines/mediabunny/adapter.ts:1244-1260`) goes through `Conversion.init/execute` with a
BufferTarget, which copies samples track-by-track through its TS conversion pipeline — correct and lossless,
but a heavier per-call path, hence the ~5.4 ms higher wall.

A noteworthy implementation gap (does not change the verdict, since no oracle gates it): mediabunny's
`remux()` never threads `opts.tags` into `Output.setMetadataTags` — `outputFormatOptionsFrom`
(`adapter.ts:180-199`) only handles fastStart/appendOnly, and `runConversion` (`adapter.ts:842-868`) is
called with no tag argument; the only `getMetadataTags`/tag handling in the adapter is on the READ/probe
side (`adapter.ts:455-468`). So mediabunny almost certainly emits a valid tag-less (or default) Ogg, while
ffmpeg.wasm genuinely writes the VorbisComment fields. Both PASS because the gate only checks container
validity + duration, not tag content (the scenario itself documents this gap in its `notes` and in
`_shared.ts:24-34`). ffmpeg.wasm is therefore not only faster but is the one engine that actually performs
the declared operation end-to-end.

## What each other framework did wrong

- **mediabunny@1.48.0** (PASS, lost on perf): correct lossless Ogg remux, identical oracle measurements,
  but 13.835 ms wall vs 8.475 ms (1.63x slower); n=1/mad=0/cached so weak evidence. Separately, its remux
  path does not forward `opts.tags` to `setMetadataTags` (adapter.ts:1244-1260), so the actual
  VorbisComment write is likely a no-op — unobserved by the gate but a real functional shortfall vs the
  winner.
- **platform@chrome-149**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: WebCodecs/
  MediaRecorder exposes no muxing/remux primitive for Ogg, so the capability is genuinely absent.
- **remotion-media-parser@4.0.479**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: it is
  a parser/demuxer, not a muxer.
- **web-demuxer@4.0.0**: NA_ENGINE — "engine does not declare operation 'remux'". Honest: demux-only library.
- **mp4box@2.3.0**: NA_ENGINE — "engine does not declare input container 'ogg'". Honest: mp4box is an
  ISO-BMFF (MP4) toolkit and cannot ingest Ogg.
- **remotion-webcodecs@4.0.479**: NA_ENGINE — "engine does not declare input container 'ogg'". Honest:
  its container support does not include Ogg as an input.

All five NA verdicts look honest (Ogg-remux is outside a parser/MP4-only/WebCodecs engine's real surface);
none looks like an under-declared capability being hidden.

## Anti-cheat validation

- Scenario: `src/scenarios/metadata/write-roundtrip.ts:103-113` (`id:'write_ogg_vorbiscomment'`), built via
  `buildWrite` at `src/scenarios/metadata/_shared.ts:133-152`. op `remux`, container `ogg`, invariant
  PROBE_DUR, oracles `['reference-reimport','property-invariant']`.
- Fixture: `asset:'opus.ogg'` → `fixtures/media/opus.ogg` **exists**, 145,910 bytes, real Opus-in-Ogg
  (golden `fixtures/golden/opus.ogg.meta.json`: ogg/opus/48000/2ch/10.007s; golden packet table
  `opus.ogg.packets.json` present). Not synthetic/empty/mock.
- Oracles: `reference-reimport` `src/core/oracles.ts:1225` (and `semanticRemuxReimport` :1273) demuxes the
  produced bytes with the reference engine and checks real track layout + duration band — not trivially
  satisfiable. `property-invariant` probe-duration branch `src/core/oracles.ts:2709-2758` re-probes the
  output and compares to golden within ±0.0417s; measured Δ 0.0065s. Measurements (501 packets/keyframes,
  10.0135s) are physically plausible for ~10 s of 48 kHz Opus.
- Winner adapter: `src/engines/ffmpeg-wasm/adapter.ts:2031-2069` — genuine `-i … -map 0 -c copy` stream
  copy with `-metadata key=value` per tag (lines 2056-2061). Calls the real vendored ffmpeg.wasm core, no
  canned output, no copy-input-as-output shortcut, no golden short-circuit, no swallowed errors reported as
  success.
- Verdict: **WEAK-GATE**. The fixture and the winner's implementation are real, but the gate is a proxy:
  it verifies "valid Ogg container + duration preserved," NOT that the requested VorbisComment tags were
  actually written and read back. The scenario explicitly acknowledges this gap (`_shared.ts:24-34`,
  scenario notes). So the PASS is real but does not prove the core promise (tag content) of
  "write_ogg_vorbiscomment." This weakness applies to BOTH passing engines and is why mediabunny's
  apparent tag-drop goes undetected.
- Cached note: the winning result has **cached==true** ("cached previous PASS result"), reused not re-run;
  the 8.475 ms wall (n=1) is a stale single sample — treat the perf margin as indicative, not robust.

## Confidence & caveats

- Confidence: **medium**. The winner (ffmpeg.wasm) is unambiguous on the only differentiating axis (wall),
  and the NA verdicts are clean. But: (1) the perf win is n=1/cached for both engines; (2) correctness is a
  pure tie under a proxy gate; (3) the gate is WEAK — neither engine is proven to actually persist the
  VorbisComment tags, and mediabunny's adapter appears not to write tags at all on the remux path.
- If a tag-content readback oracle were added, ffmpeg.wasm would likely remain the winner (it actually
  emits `-metadata`), and mediabunny could flip to FAIL — strengthening, not weakening, this verdict.
