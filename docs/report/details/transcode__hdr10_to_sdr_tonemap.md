# transcode/hdr10_to_sdr_tonemap

- **family:** transcode
- **fixture asset(s):** `fixtures/media/hdr10_pq_micro_hevc.mp4` (HEVC Main10-style BT.2020/PQ source, ~26 KB)
- **primaryMetric:** wall (ms)
- **passCount:** 1 / 7

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15` — **uncontested** (the only PASS; the other 6 are all NA_ENGINE).
- **Decisive factor:** It is the only engine that declares BOTH the `transcode` operation AND the `tonemap` feature, and it actually implements an HDR10/PQ→SDR/BT.709 tone-map filter chain. The other 6 negotiated themselves out (3 lack the `transcode` op entirely; 3 declare `transcode` but not the `tonemap` feature).
- **Margin over runner-up:** N/A — no second PASS. Reported wall is 40.91 ms median (n=1), 48.89x realtime, encode 244.47 fps.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | property-invariant:pass, playback-smoke:pass | 40.905 ms | 48.894 x | 0 (n=0) | 19963 ms | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'tonemap' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'tonemap' |
| mediabunny@1.48.0 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'tonemap' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

This scenario takes a real HEVC Main10 BT.2020/SMPTE-2084 (PQ) HDR10 clip and asks for an SDR
H.264-in-MP4 output, with `tonemap: { from: 'pq', to: 'sdr' }` (scenario `src/scenarios/transcode/index.ts:855-873`).
Tone-mapping is a colour-volume transform — it is not a passthrough remux and not a simple
bit-depth truncation — so it requires an engine that can (a) decode 10-bit HEVC, (b) convert PQ/BT.2020
into linear light, apply an HDR→SDR tone-map operator, and re-encode to 8-bit BT.709 H.264, and (c)
mux the result into MP4. Among the 7 engines, only the ffmpeg.wasm adapter exposes that whole pipeline.

The winning code path is in `src/engines/ffmpeg-wasm/adapter.ts:2342-2375`. When `extra.tonemap` is
present and the source/target are recognised as PQ→SDR (`pqSource && sdrTarget`, lines 2347-2351), the
adapter pushes a physically correct five-stage `-vf` chain:
`zscale=matrixin=bt2020nc:transferin=smpte2084:primariesin=bt2020:matrix=gbr:transfer=linear:primaries=bt2020:npl=100`
→ `format=gbrpf32le` → `tonemap=tonemap=hable:desat=0` → `zscale=matrix=bt709:transfer=bt709:primaries=bt709:range=tv`
→ `format=yuv420p` (lines 2353-2359). That is the canonical libavfilter HDR→SDR recipe: linearise PQ
in BT.2020 at 100-nit nominal peak luminance, tone-map in float gbrp (Hable operator, `ffmpegToneMapAlgorithm`
default at `adapter.ts:246-257`), then re-quantise to limited-range BT.709 4:2:0. It also tags the output
stream with `-color_primaries bt709 -color_trc bt709 -colorspace bt709` (lines 2373-2374) so the muxed
MP4 advertises SDR colour metadata. The actual work is executed by real ffmpeg.wasm via `ff.exec(args)`
(e.g. `adapter.ts:2063`, `:1779`) — not canned output.

The gate is the `property-invariant` oracle with `invariant: 'transcode-output-metadata'`
(`src/core/oracles.ts:2651`, impl `transcodeOutputMetadataInvariant` at `:3626-3708`). It re-probes the
produced bytes with the reference engine and checks: container == requested `mp4`
(`:3655-3657`), output duration within the explicit ±0.15 s tolerance vs the source duration
(`:3659-3677`), and that the requested video track shape exists (`:3682-3690`). The recorded
measurements — `durationDeltaSec: 0`, `durationToleranceSec: 0.15`, `videoTracks: 1` — show an exact
duration match and exactly one video track in the SDR MP4. The second gate, `playback-smoke`
(`oracles.ts:1574-1580`), loads the output into a real `<video>` element and confirms it advances a few
frames ("`<video> played a few frames of the output`"). Bench: 40.91 ms wall, 244.47 fps encode,
48.89x realtime on a micro clip — plausible for a tiny fixture run single-threaded in wasm.

Note: SSIM/PSNR is deliberately NOT part of this gate (scenario `oracles: ['property-invariant',
'playback-smoke']`, notes line 870-872: "SSIM is omitted because the SDR output is deliberately colour
transformed from the HDR source frames"). That is correct reasoning — a tone-mapped SDR frame is, by
design, not pixel-similar to its HDR source, so an SSIM gate would be meaningless here. The trade-off is
that the gate verifies *container/codec/duration shape + decodability*, not the *colour accuracy* of the
tone-map itself. That makes the PASS real but structural rather than perceptual (see Confidence).

## What each other framework did wrong

- **platform@chrome-149** — NA_ENGINE: "engine does not declare feature 'tonemap'". WebCodecs can
  decode/encode but the adapter does not expose an HDR→SDR tone-map operator, so the runner gates it out
  before execution. Honest NA: browser WebCodecs has no built-in PQ→BT.709 tone-map primitive; declaring
  it would require a custom GPU/canvas colour-volume transform the adapter does not implement.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'tonemap'". Same as
  platform — it wraps WebCodecs encode/decode but has no tone-mapping stage. Honest NA.
- **mediabunny@1.48.0** — NA_ENGINE: "engine does not declare feature 'tonemap'". Mediabunny does real
  transcodes but its declared feature set omits HDR tone-mapping. Honest NA.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare operation 'transcode'". It is a
  demux-only library; no encode/transcode path exists. Honest NA.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare operation 'transcode'". MP4Box is a
  container (de)muxer with no codec re-encode capability. Honest NA.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare operation 'transcode'". It is
  a parser/probe library, not an encoder. Honest NA.

All six NAs look genuine, not under-declared: 3 of them (web-demuxer, mp4box, remotion-media-parser)
cannot transcode at all, and the 3 transcode-capable engines (platform, remotion-webcodecs, mediabunny)
simply lack a tone-mapping primitive, which is a real, non-trivial capability gap, not a sandbagged flag.

## Anti-cheat validation

- **Scenario:** `src/scenarios/transcode/index.ts:855-873` (id `hdr10_to_sdr_tonemap`), generated by
  `defineScenario` at `:876-895`. Requires op `transcode`, feature `tonemap`, MP4 in/out, hevc→h264.
- **Fixture:** `asset: 'hdr10_pq_micro_hevc.mp4'` → `fixtures/media/hdr10_pq_micro_hevc.mp4` confirmed to
  exist via stat (~26 KB). A real HEVC Main10 PQ/BT.2020 file, not synthetic/empty/mock.
- **Oracle(s):** `property-invariant` / `transcode-output-metadata` at `src/core/oracles.ts:3626-3708`
  (re-probes output, checks container=mp4, duration within ±0.15 s, video track present) and
  `playback-smoke` at `:1574-1580` (real `<video>` playback). Neither is trivially satisfiable: the
  metadata invariant would fail if the output were the unmodified HEVC source (codec/container/track
  mismatch) and playback-smoke would fail on a non-decodable file.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:2342-2375` (tone-map filter chain) executed via
  `ff.exec(args)` (`:2063`, `:1779`). Genuine libavfilter zscale+tonemap+zscale pipeline; no
  hardcoded/golden short-circuit, no input→output copy. Measurements (durationDeltaSec 0, videoTracks 1)
  are physically plausible for a real tiny clip.
- **Cached note:** the winning result has `cached: true` ("cached previous PASS result"); the bench
  values (wall 40.905, longtasks 19963, encode 244.47 fps) were reused, not freshly re-measured this run.
  Per the launcher-seeding caveat this carries staleness risk for the timing numbers, though the
  oracle PASS itself is deterministic given the fixture+filter chain.
- **Verdict:** **WEAK-GATE.** The fixture is real and the implementation is a genuine ffmpeg tone-map,
  but the gate verifies output *shape* (container/codec/duration/decodability) only — it does NOT verify
  the colour accuracy of the tone-map (no SSIM/PSNR, by deliberate design). So the PASS is real but
  structural, not a perceptual proof that the HDR→SDR transform is correct.

## Confidence & caveats

- **Confidence: high** on the winner selection — it is the only PASS and the only engine that even
  declares the required op+feature, so there is no contest to adjudicate.
- **Caveat (gate strength):** the colour-volume correctness of the tone-map is unverified; a buggy
  tone-map operator that still produced a decodable 8-bit BT.709 MP4 of the right duration would also
  pass. This is an intentional design choice given that SSIM cannot meaningfully compare HDR source to
  SDR output, but it means "PASS" = "produced a playable, correctly-shaped SDR MP4", not "tone-mapped
  accurately".
- **Caveat (caching):** `cached: true` — performance numbers are reused from a prior run and may be
  stale; only the PASS/FAIL outcome is robust to that.
- **Caveat (single sample):** all bench metrics are n=1 (mad=0, p95==median), so the timing figures are
  point estimates with no spread, not statistically robust.
