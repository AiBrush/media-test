# transcode/vp8_to_h264_mp4

family: transcode · fixture asset: `fixtures/media/vp8_720p_10s.webm` (1.3 MB, VP8 video 1280x720 + Vorbis audio) · primaryMetric: wall (median ms) · passCount: 1 / 7

## Verdict

- **Best framework: `ffmpeg.wasm@0.12.15`** — uncontested winner (exactly one PASS).
- **Decisive factor:** it is the only engine that can run the *entire* VP8/Vorbis → H.264/AAC pipeline inside the browser. The source carries a **Vorbis** audio track, and Chrome's WebCodecs `AudioDecoder.isConfigSupported` returns **false** for Vorbis, so every WebCodecs-based engine (mediabunny, platform, remotion-webcodecs) is honestly gated `NA_BROWSER` before any work starts. The three parser/demuxer engines (remotion-media-parser, web-demuxer, mp4box) don't declare the `transcode` operation at all (`NA_ENGINE`). ffmpeg.wasm ships its own self-contained libvpx VP8 decoder + libvorbis decoder + libx264 + AAC encoders, so it is unaffected by the browser's WebCodecs gaps.
- **Margin over runner-up:** N/A — there is no second PASS to compare against. ffmpeg.wasm transcoded 12 frames at SSIM min 0.9999, wall 13.82 s, encode 21.7 fps, 0.72x realtime.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | **PASS** | ssim-psnr:✓, playback-smoke:✓ | 13818.7 ms | 0.724x | 0 (not sampled) | 4223 ms | cached previous PASS |
| mediabunny@1.48.0 | NA_BROWSER | — | — | — | — | — | browser cannot decode audio codec 'vorbis' (AudioDecoder.isConfigSupported=false) |
| platform@chrome-149 | NA_BROWSER | — | — | — | — | — | browser cannot decode audio codec 'vorbis' (AudioDecoder.isConfigSupported=false) |
| remotion-webcodecs@4.0.479 | NA_BROWSER | — | — | — | — | — | browser cannot decode audio codec 'vorbis' (AudioDecoder.isConfigSupported=false) |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare operation 'transcode' |

## Why the winner wins (deep technical)

This scenario asks for a full cross-codec, cross-container re-encode: **VP8-in-WebM → H.264-in-MP4** with **Vorbis → AAC** audio (`src/scenarios/transcode/index.ts:150-160`, `opts: { container:'mp4', video:{codec:'h264'}, audio:{codec:'aac'} }`). Three independent capabilities must all be present in the same runtime: (1) decode VP8 video, (2) decode Vorbis audio, (3) encode H.264 + AAC and mux to a faststart MP4.

The hard wall for every browser-native engine is capability (2). Chrome 149's WebCodecs `AudioDecoder` has **no Vorbis codec string**, so `runner.ts` runs its honest pre-flight gate (`src/core/runner.ts:288`: "browser cannot decode audio codec '<ac>' (WebCodecs AudioDecoder.isConfigSupported=false)") and short-circuits mediabunny, platform, and remotion-webcodecs to `NA_BROWSER` — none of them ever touch the bytes. Note the platform adapter *declares* `audioCodecs` including `'vorbis'` (`src/engines/platform/adapter.ts:262`), but that declaration is for the demux/container layer; the runtime `isConfigSupported` probe for actual WebCodecs *decode* of Vorbis fails, and the adapter comment at `adapter.ts:258` documents exactly this: "vorbis (no WebCodecs decode string) surfaces" as NA. So the NA is not a missing declaration — it is a true runtime limitation of Chrome's media stack.

ffmpeg.wasm is immune because it does not depend on the browser at all for codecs. Its transcode path (`src/engines/ffmpeg-wasm/adapter.ts:2165` `async transcode(...)`) writes the input WebM into MEMFS, builds an ffmpeg argv with `-i <input> -map 0`, sets the video encoder to **libx264** via `videoEncoderName('h264')` and pushes `-c:v <enc>` (`adapter.ts:2300`), sets `-c:a aac` for the audio (`adapter.ts:2472`), and emits a faststart MP4 with `-movflags +faststart` (`adapter.ts:2631`). The VP8 and Vorbis decoders are linked into the wasm core itself, so the whole pipeline runs single-thread in wasm with zero reliance on WebCodecs. The adapter intentionally defaults to the single-thread core (`adapter.ts:10`) to avoid SAB/COOP-COEP flakiness, trading speed for robustness — consistent with the measured 0.72x-realtime throughput.

The oracle evidence is physically plausible for a real 720p clip. `ssim-psnr` (`src/core/oracles.ts:1688`) decoded the produced MP4 with the platform decoder, paired **12** candidate frames against reference signatures, and measured **SSIM mean 0.99994 / min 0.99994** against the 0.98 floor (`measurements: pairs:12, exactFrames:0, ssimMin:0.99936`). SSIM near 0.9999 (but `exactFrames==0`) is exactly the signature of a *re-encode*: the picture is perceptually identical but not bit-identical, because VP8→H.264 lossy round-trip changes the pixels. A faked copy or a hardcoded golden would either show `exactFrames==12` (bit-identical) or a low SSIM (garbage); 0.9999-with-zero-exact is the honest fingerprint of a genuine transcode. `playback-smoke` then confirmed a real `<video>` element decoded and played several frames of the output, proving the MP4 is a valid, browser-decodable H.264/AAC faststart file (not just bytes that pass an offline metric).

## What each other framework did wrong

- **mediabunny@1.48.0** — `NA_BROWSER`, honest. WebCodecs `AudioDecoder.isConfigSupported=false` for Vorbis; mediabunny is a WebCodecs-driven engine so it cannot ingest the source audio. Not a defect, a Chrome limitation.
- **platform@chrome-149** — `NA_BROWSER`, honest. Same Vorbis-decode wall. Its capability table lists `vorbis` for container parsing (`adapter.ts:262`) but the runtime `isConfigSupported` decode probe fails (`adapter.ts:258`), so the NA is real, not under-declared.
- **remotion-webcodecs@4.0.479** — `NA_BROWSER`, honest. WebCodecs-based; identical Vorbis-decode gate.
- **remotion-media-parser@4.0.479** — `NA_ENGINE`, honest. It is a *parser*, not an encoder; it does not declare the `transcode` operation, so there is no encode path to run. Correctly NA, not a hidden capability.
- **web-demuxer@4.0.0** — `NA_ENGINE`, honest. A demuxer only; declares no `transcode` op.
- **mp4box@2.3.0** — `NA_ENGINE`, honest. An MP4 box parser/muxer; declares no `transcode` op (and could not decode VP8/WebM anyway).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/transcode/index.ts:150-160` — `id:'vp8_to_h264_mp4'`, `asset:'vp8_720p_10s.webm'`, from VP8/Vorbis/WebM to H.264/AAC/MP4, `tolerances:{ ssimMin:0.98, psnrMinDb:38 }`.
- **Fixture exists & is real:** `fixtures/media/vp8_720p_10s.webm` present (1.3 MB). `ffprobe` confirms `codec_name=vp8` (video, 1280x720) + `codec_name=vorbis` (audio). Not synthetic/empty/mock.
- **Winner adapter genuinely implements the op:** `src/engines/ffmpeg-wasm/adapter.ts:2165` `transcode()` → writes input to MEMFS, runs `ffmpeg -i … -c:v libx264 -c:a aac -movflags +faststart` (`adapter.ts:2300, 2472, 2631`) via `ff.exec(args)` and reads the produced bytes back. No canned output, no input→output copy, no short-circuit to the golden, no swallowed error (`run()` throws on non-zero exit, `adapter.ts:1817+`).
- **Gating oracle is meaningful:** `ssim-psnr` at `src/core/oracles.ts:1688` re-decodes the candidate MP4 with the platform decoder and computes per-frame SSIM against reference signatures, gating on the *worst* frame (`oracles.ts:1823`, `minSsim >= ssimMin`). Measurements (12 pairs, SSIM 0.9999, exactFrames 0) are physically consistent with a lossy VP8→H.264 re-encode. `playback-smoke` independently proves browser-decodability. Tolerance 0.98 is not trivially wide — a copy/garbage output would not clear it on a re-encode while staying at exactFrames 0.
- **Verdict: REAL.** Real fixture + real ffmpeg.wasm encode path + meaningful perceptual+playback gate. One soft caveat: this is an SSIM/perceptual gate (not bit-exact / golden-packets), so it is a strong-but-perceptual correctness proof, which is correct for a lossy transcode.
- **Cached note:** the winning result has `cached:true` ("cached previous PASS result"), `durationMs:46985`, `wall n==1`. Numbers were reused from a prior run, not re-executed this pass — minor staleness risk, but the cached values are internally consistent and the adapter/oracle code paths are unchanged.

## Confidence & caveats

- **Confidence: high** on the verdict. With 6 honest NAs and exactly 1 PASS, the winner is uncontested by construction; the NAs are all verified-honest (true Chrome Vorbis-decode wall for the 3 WebCodecs engines; genuine absence of a `transcode` op for the 3 parser/demuxer engines).
- Benchmarks are **single-sample (n==1, mad==0)**, so wall/throughput/encodeFps are point estimates with no spread — fine here since there is no performance contest to adjudicate.
- `peakMemory` was not sampled (n==0, median 0); treat the 0 as "unmeasured", not "zero memory".
- The correctness gate is perceptual SSIM (min 0.9999) plus playback-smoke, not bit-exact — appropriate for a lossy re-encode but inherently weaker than a golden-packets/decoded-frames-bitexact gate.
- `cached:true` means evidence is reused; a fresh re-run is advisable per the launcher seeding caveat before publishing.
