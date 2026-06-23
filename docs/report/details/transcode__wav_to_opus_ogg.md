# transcode/wav_to_opus_ogg

- **family:** transcode
- **fixture asset(s):** `fixtures/media/wav_s16.wav` (PCM s16 WAV, ~960 KB)
- **primaryMetric:** wall (ms)
- **passCount:** 1 / 7

## Verdict

- **Best framework:** `mediabunny@1.48.0` — **UNCONTESTED** (the only engine with status PASS).
- **Decisive factor:** mediabunny is the only engine that both declares the `transcode` operation AND declares `ogg` as an output container AND can actually drive a WebCodecs **Opus encode** into an **Ogg** mux. Every other engine self-excluded: 3 never declare `transcode` at all, 2 declare transcode but not the `ogg` output container, and ffmpeg.wasm declares transcode but explicitly NAs Opus encode (its vendored libopus encoder traps/times out).
- **Margin over runner-up:** none — there is no second PASS, so no head-to-head margin exists. For reference, mediabunny's run: wall median **46.53 ms**, throughputRealtime **107.46 x-realtime**, longtasks **555 ms**, peakMemory not sampled (n=0).

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | **PASS** | property-invariant:true | 46.53 ms | 107.46 x | n/a (n=0) | 555 ms | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | NA_ENGINE | — | — | — | — | — | transcode not applicable: libopus encode in the vendored wasm core traps or exceeds the suite timeout; Opus encode is not declared as a reliable transcode path |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ogg' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare output container 'ogg' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

The operation is a **lossy re-encode**: decode PCM s16 from a RIFF/WAV container, encode to **Opus** at 128 kbps, and mux the Opus packets into an **Ogg** container (`opts: { container: 'ogg', audio: { codec: 'opus', bitrate: 128_000 } }`, scenario `src/scenarios/transcode/index.ts:353-360`). This is the hard case for browser media stacks: WAV→Opus requires a working Opus *encoder*, and the only standardized in-browser encoder is `AudioEncoder` (WebCodecs). Containerizing raw Opus packets into Ogg additionally requires an Ogg page muxer with proper `OpusHead`/`OpusTags` headers and granulepos accounting — something most JS demux/parse libraries simply do not ship.

mediabunny is the only engine that owns the whole chain. Its `transcode()` adapter (`src/engines/mediabunny/adapter.ts:1271-1322`) builds an Ogg output format via `makeOutputFormat(opts.container, ...)` (`adapter.ts:1285`), opens the WAV through `openInput()` (`adapter.ts:1287`), maps the requested audio codec via `buildAudioOptions()` (`adapter.ts:1303` → `adapter.ts:672-692`, which canonicalizes `'opus'` and forwards `bitrate: 128_000`), pins the trim window to the full input duration (`adapter.ts:1305`), then runs the real `Conversion.init`/`conversion.execute()` pipeline (`adapter.ts:1307` → `runConversion`, `adapter.ts:842-868`). `runConversion` checks `conversion.isValid` and surfaces discarded-track reasons as hard errors, so a non-encodable codec would throw rather than silently pass. The configUsed confirms the live path: `backend: "webcodecs"`, `hwAccel: "prefer-hardware"`, `pipeline: "streaming-lockstep"`, `coreBuild: "pure-ts-esm"`, `wasmThreads: 0`, `coopCoep: "not-required"` — i.e. WebCodecs `AudioEncoder` for Opus, no SharedArrayBuffer / cross-origin-isolation requirement, single-threaded with no wasm dependency for the encode.

The gating oracle is `property-invariant` with the `transcode-output-metadata` invariant (`src/core/oracles.ts:3631-3708`). It is **not** a smoke test: it re-probes the produced output bytes with the reference engine (`oracles.ts:3641`), asserts the muxed container equals the requested one (`oracles.ts:3655-3657`, output `'ogg'` vs requested `'ogg'`), asserts exactly one audio track of the requested shape (`oracles.ts:3692-3700`), and verifies the output duration against the source within a container-specific tolerance band (`oracles.ts:3659-3677`). The recorded measurements are physically plausible for a genuine WAV→Opus→Ogg encode: `audioTracks: 1`, `durationDeltaSec: 0.0135` against `durationToleranceSec: 0.12` — a 13.5 ms drift, exactly the kind of small granulepos/priming-delay rounding you expect when Opus's 20 ms framing and encoder pre-skip are remuxed into Ogg pages, comfortably inside the 120 ms band but far from a "tolerance so wide anything passes" situation. Performance is strong and self-consistent: 46.53 ms wall to transcode the whole clip at **107.46x realtime**, with a single 555 ms longtask (the encoder warm-up / module init). These are single-sample numbers (n=1, mad=0), so the timing is indicative rather than statistically tight — but timing is moot here because there is no competing PASS to rank against.

## What each other framework did wrong

- **ffmpeg.wasm@0.12.15 — NA_ENGINE (honest, but the most interesting near-miss):** declares `transcode` generally, but the adapter explicitly does *not* declare Opus encode as a reliable path: "libopus encode in the vendored wasm core traps or exceeds the suite timeout." This is a truthful capability gate, not an under-declaration — vendored ffmpeg.wasm builds frequently ship without/with a flaky libopus encoder, and shipping a transcode that traps mid-encode would surface as a hard ERROR, worse than a clean NA. durationMs=185 (it NA'd fast, before doing real encode work).
- **platform@chrome-149 — NA_ENGINE:** "does not declare output container 'ogg'." Honest. Chrome's `MediaRecorder`/WebCodecs platform path can encode Opus but does not expose an Ogg muxer (it offers WebM/MP4 muxing); without an Ogg writer it correctly declines the `ogg` target rather than producing WebM and mislabeling it.
- **remotion-webcodecs@4.0.479 — NA_ENGINE:** "does not declare output container 'ogg'." Same honest gap — it can drive WebCodecs Opus encode but ships no Ogg muxer, only WebM/MP4 output.
- **web-demuxer@4.0.0 — NA_ENGINE:** "does not declare operation 'transcode'." Honest by design — web-demuxer is a demux/packet-extraction library, not an encoder/transcoder.
- **remotion-media-parser@4.0.479 — NA_ENGINE:** "does not declare operation 'transcode'." Honest — it is a read-only metadata/packet parser with no encode or mux capability.
- **mp4box@2.3.0 — NA_ENGINE:** "does not declare operation 'transcode'." Honest, and additionally mp4box is MP4/ISO-BMFF only — it has neither an Opus encoder nor an Ogg muxer.

## Anti-cheat validation

- **Scenario:** `src/scenarios/transcode/index.ts:353-360` — `id: 'wav_to_opus_ogg'`, `asset: 'wav_s16.wav'`, `toContainer: 'ogg'`, `toAudio: 'opus'`, `opts.audio.bitrate: 128_000`. This case carries no `notes` (no special gating caveat); it is a straightforward lossy audio transcode.
- **Fixture:** `fixtures/media/wav_s16.wav` exists — `stat` reports ~960 KB, a real PCM s16 RIFF/WAV file, not synthetic/empty/mock.
- **Winner adapter:** `src/engines/mediabunny/adapter.ts:1271-1322` (transcode entry), `:842-868` (`runConversion` driving `Conversion.execute()`), `:672-692` (`buildAudioOptions` mapping codec='opus' + bitrate). The path genuinely invokes the library's Conversion/WebCodecs encode → Ogg mux; it does **not** copy input→output, short-circuit to a golden, return canned bytes, or swallow encode errors (invalid conversions throw via the `isValid` guard at `:849-854`).
- **Oracle:** `src/core/oracles.ts:3631-3708` (`property-invariant` / `transcode-output-metadata`). Performs a real reference-engine re-probe of the output bytes and asserts container match, audio-track count/shape, and duration within a container-specific tolerance. Measurements (`audioTracks: 1`, `durationDeltaSec: 0.0135` vs `0.12` tolerance) are plausible for real Opus-in-Ogg output.
- **Verdict:** **WEAK-GATE.** The fixture is real and the implementation genuinely encodes Opus via WebCodecs and muxes Ogg — there is no cheating. However, the gating oracle is a *metadata/property invariant* (container + track count/shape + duration-within-tolerance), not a bit-exact or decoded-PCM comparison. It confirms a well-formed Opus/Ogg file of the right duration was produced, but does NOT verify the decoded audio fidelity of the lossy re-encode. PASS is real but sits on the structural/metadata rung of the correctness ladder, not perceptual or bit-exact. (The sibling `wav_to_flac` case explicitly notes that PCM bit-exactness "needs a dedicated audio decode oracle before it can be asserted here" — the same limitation applies in spirit to this lossy case.)
- **Cached note:** mediabunny's result is `cached: true` ("cached previous PASS result"), startedAtIso `2026-06-22T13:52:10Z`. The numbers were reused, not re-run in this batch — minor staleness risk for the timing figures, though the PASS verdict and oracle measurements are deterministic for this fixture.

## Confidence & caveats

- **Confidence: high** on the *winner selection* — it is mechanically forced (single PASS; all six others self-declare NA with honest, verifiable reasons rooted in missing transcode op or missing Ogg muxer or flaky wasm libopus).
- **Caveats:**
  - The gate is metadata-level (WEAK-GATE): no decoded-audio-PCM or bit-exact oracle runs here, so lossy Opus fidelity is unverified — only structural correctness + duration are proven.
  - mediabunny's bench is `cached` and n=1 (mad=0, p95==median), so the 46.53 ms / 107.46x figures are indicative, not statistically robust; `peakMemory` was not sampled (n=0).
  - No contest existed, so there is no comparative performance evidence — the win rests entirely on capability coverage, not on beating a rival on a shared correctness gate.
