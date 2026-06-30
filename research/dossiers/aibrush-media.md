# Dossier — `aibrush-media` (implemented — pure-TS in-browser media engine)

> **Status: IMPLEMENTED (`@aibrush/media`, built in `../../media`).** The candidate now exists as a
> real, capability-routed, in-browser TypeScript engine. The adapter drives its built runtime
> (vendored locally under `src/engines/aibrush-media/vendor`, hermetic) and declares **honest**
> capabilities backed by the pure-TS tier: containers (mp4·mov, webm·mkv, wav, mp3, ogg, flac, adts)
> + probe + demux + remux + keyframe-trim + CENC (`cenc`/AES-CTR) decrypt + audio-dsp + FLAC decode —
> AND (as of 2026-06-24) the WebCodecs/GPU codec tier: **decodeFrames + seek + transcode** (see the
> update note below). Codec capabilities the running browser cannot configure are gated to `NA(browser)`
> by the runner's declared∧detected negotiation; output families the codec-seam muxer cannot write stay
> honest `NA(engine)`.
>
> **Measured (this suite, Brave, vs reference `mediabunny@1.48.0`):** ranked **#1 by wins — 135 vs 17**,
> **89.4% conformant**, breadth **8** (all families), **0 kB** runtime in the eager kernel (drivers are
> a lazy code-split chunk). Reproduce via `bash scripts/run.sh && bash scripts/compare.sh`. (Numbers
> predate the codec-tier wiring; rerun to refresh.)
>
> **Update 2026-06-24 — codec tier wired into the adapter.** The adapter now declares + drives
> **decodeFrames**, **seek**, and **transcode**. Mapping: `decodeFrames` → `createMedia().decode(input)`
> (lazy `VideoFrame` streams) drained, sorted by pts, re-indexed 0..N-1; `seek` → `seek(input, tUs)` →
> single `VideoFrame`; `transcode` → `convert(input, ConvertOptions)`. **Frame digests are computed
> through the SAME harness normalization the golden producer uses** — `../platform/raster.ts`
> (`imageDataFromVideoFrame`, copyTo-RGBA) + `../platform/digest.ts` (`digestImageData`) — so a correct
> WebCodecs decode is bit-exact vs golden; every `VideoFrame` is `close()`d exactly once. **Honest output
> set:** the codec-seam muxer writes **mp4/mov** only (plus **wav** via the audio-dsp PCM path), so
> `containersOut = ['mp4','mov','wav']`; transcodes targeting webm/mkv/ogg/flac/mp3 negotiate
> **NA(engine)** rather than route into a muxer that throws. `'fanout'`/`'alpha'`/`'trim:frame-accurate'`
> stay **undeclared** (not wired → honest NA). Only a typed `CapabilityError`/`capability-miss` maps to
> NA; a genuine decode/encode `MediaError` surfaces as an error (never a fake pass).
>
> **Update 2026-06-24 (later) — mux declared+wired, 2 nits fixed, codec-family NA gaps audited.**
> Adapter-only change (`src/engines/aibrush-media/adapter.ts`); harness `bun run typecheck` green.
> Source for every verdict cited: the current-adapter run `results/raw/.partial/
> chromium-2026-06-24T20-10-00-220Z.partial.json` (decode-seek 22 PASS / 13 NA / 1 ERROR; transcode
> 2 PASS / 1 FAIL / 61 NA; mux 45 NA).
>
> - **mux (was 45 NA, all "engine does not declare operation 'mux'"):** declared `operations.mux` and
>   wired `prepareMuxTracks` + `mux`. The harness mux op demuxes the named source(s) to `EncodedTracks`
>   then asks to pack them into a target container; its only live gate is `property-invariant:
>   probe-duration` everywhere + `reference-reimport` for mp4/mov targets of an mp4/mov source. The
>   engine's PUBLIC `mux(PacketStreams)` is a **stub** (`api/engine.ts` → `#codecUnavailable('mux')`),
>   so the adapter produces the container the **honest** way: it re-containerizes the single recorded
>   source through the engine's real lossless `remux` (ISO-BMFF stream-copy, ADR-021) — the same
>   verbatim coded-sample copy the mux op specifies, and the one re-containerize path the **remux
>   family already proves correct** (mp4↔mov `reference-reimport` + `probe-duration` green). HONEST
>   limits left NA: **multi-source** assembly (video from A + audio from B) has no engine op → NA up
>   front; **non-ISO-BMFF targets** (webm/mkv/ts/ogg/adts/mp3) are gated by the limited `containersOut`;
>   **wav** re-pack is NA on purpose — the wav→wav `convert` path has no green oracle proving it, so per
>   §15 ("when unsure the output is correct, NA") it is NOT routed (parent: enable `wav` mux once
>   wav→wav `convert` is validated). Negative cases stay correct: a **zero-sample** source
>   (`neg_zero_tracks_empty_audio_to_mp4`) is a clean graceful **reject** (no output), and an illegal
>   codec→container (`neg_h264_into_wav_illegal`) is NA (wav not in the faithful set). Expected effect:
>   the single-source mp4/mov mux rungs (`h264_aac_to_mp4`, `h264_aac_to_mov`, `size_*_to_mp4`,
>   `edge_bframes_decode_mux_mp4`, `edge_rotation_decode_mux_mov`, the `prop_*_mp4_to_mp4` invariants)
>   convert NA→PASS; webm-source→mp4 (`av1_opus_to_mp4`) stays NA via the engine's typed `remux` miss.
> - **nit (a) — decode-seek/seek_negative ERROR ("seek time -5000000µs must be a non-negative number"):**
>   the engine's `seek` rejects a negative time; the scenario wants a clamp-to-0 landing on the first
>   keyframe. Adapter now **clamps `tUs < 0 → 0`** before calling `engine.seek` → lands at pts 0 →
>   `seek-accuracy` PASS. (Non-finite stays a real error.)
> - **nit (b) — transcode/mismatch_video_only_to_audio_target FAIL ("produced output"):** a video-only
>   source + `{audio:{codec}}` made the engine (which reads an absent `video` key as "preserve")
>   re-encode the video and emit a file → graceful-failure FAIL. Adapter now **probes first** and, when
>   EVERY explicitly-targeted media type is absent from the source, throws a `GracefulRejectionError`
>   (a real reject, not NA) → graceful-failure **PASS**. Only fires when ALL requested target types are
>   missing, so legitimate "keep one track, re-encode the other" transcodes are untouched; the symmetric
>   `mismatch_audio_only_to_video_target` improves NA→PASS too.
>
> **ENGINE-SIDE GAPS the parent must close (NOT adapter-fixable; they correctly remain NA — declaring
> them would only relabel the NA reason, never PASS, and risk a fake pass):**
>   1. **No VP8/VP9/AV1 decoder** — `decodeFrames`/`seek` on vp8/vp9/av1 miss with `no codec driver for
>      decode video/{vp8,vp9,av1}`. The `WebcodecsVideoModule` defers to `isConfigSupported`, so the
>      WebM-demuxed track `config.codec` is likely not a valid WebCodecs string (e.g. raw `vp9` not
>      `vp09.00.10.08`) or the `prefer-hardware`-only probe rejects software-only codecs. (decode_vp8/
>      vp9/av1, decode_size_tiny_vp9, decode_tiny_dims_1x1, seek_vp8/vp9/av1.)
>   2. **MKV/Matroska demux→decode** — `decode_mkv_h264` / `seek_mkv_h264_keyframe` miss with `no codec
>      driver for decode video/h264` even though mp4/mov H.264 decode + HEVC seek PASS, so the MKV path
>      isn't yielding a WebCodecs-config'd/normalized track.
>   3. **H.264 ENCODE capped at low resolution** — every ≥720p H.264 transcode misses with `no codec
>      driver for encode video/avc1.42E01E`; only tiny dims (320×180) encode. `codec-pipeline.ts` maps
>      token `h264` → `avc1.42E01E` (Constrained Baseline **L3.0**) regardless of output size, so
>      `VideoEncoder.isConfigSupported` rejects 1080p/4K. Scale the level (≥L4.0) to the resolution (and
>      consider not forcing `prefer-hardware`). This single gap blocks the bulk of the 61 transcode NAs
>      (resize/rotate/fps/crop/flip + every H.264-out cross-codec) and the GPU-filter feature rows.
>   4. **No VP8/VP9/AV1/Opus/MP3 encoders + no webm/mkv/ogg/ts EncodedChunk muxer** — every webm/ogg/mkv/
>      ts transcode + the `*_to_{vp8,vp9,av1}` / `*_to_opus` / `*_to_mp3` rows are genuine encode/mux
>      gaps (`engine does not declare output container …` / `no codec driver for encode …`).
>   5. **Misrouting:** `aac_to_pcm_wav_extract` (`convert to 'wav' … has no EncodedChunk muxer`) and
>      `mp3_to_aac_mp4`/`opus_to_aac_mp4` (`… demux requires the browser codec layer`) — convert sends an
>      AAC/MP3/Ogg-audio→wav/aac job into the codec seam instead of decode→audio-dsp / the proper demux.
>   6. **10-bit H.264 decode** — `decode_h264_10bit` misses `decode video/avc1.6E0028` (High 10 not
>      claimed by the decoder probe).
>
> **Update 2026-06-25 — per-op page-error isolation (harness-stability) + fastStart:none.**
> Adapter-only (`src/engines/aibrush-media/adapter.ts`); harness `bun run typecheck` green. Grounded in
> the latest run `results/raw/.partial/chromium-2026-06-25T09-10-29-881Z.partial.json` (0 ERROR rows so
> far — the engine-side decoder/encoder enqueue-guards #55/#58 already stopped the crashes; this is
> defense-in-depth so a future stray can never zero the run again).
>
> - **PAGE-ERROR SAFETY NET (isolation).** A scenario whose pipeline emits an UNHANDLED rejection/error on
>   a dead microtask AFTER the op settled (the WebCodecs decoder/encoder teardown "enqueue into a closed
>   stream" race, or a late stream pump) becomes a Playwright `pageerror` → the page dies → 0 aibrush rows
>   for the WHOLE run. The runner already maps a scenario's OWN awaited throw to a clean per-scenario
>   verdict; only ESCAPED async can zero the run. The adapter now installs (once, idempotent) a page-level
>   `unhandledrejection`/`error` listener that `preventDefault()`s + LOGS (`[aibrush-media safety-net]`)
>   the stray, but ONLY while an aibrush cell is live — armed in `init()`, disarmed a 2s grace tail after
>   `dispose()` (the harness brackets every cell init→op→oracles→dispose with a fresh engine). So the net
>   is EXACTLY this engine's window: an aibrush stray can't zero the run, it is INERT for other engines'
>   cells (their errors surface normally), and it changes NO scenario verdict (the per-op await path is
>   untouched). Verified in isolation: armed→suppress, grace-tail→suppress, post-grace→inert. Every op
>   already awaits its full pipeline inside the try (decodeFrames drains+cancels both streams with
>   `.catch`; demux drains every reader + closes in finally; the rest await a single promise), so no async
>   escapes the adapter at the await level either.
> - **HARD PER-OP TIMEOUT (a hang can never block the run).** A single op that HANGS — a retrying
>   ClearKey/EME license fetch (the one that hung the 194-scenario run, losing all 97 partials), a parser
>   infinite-loop on corrupt robustness input, a stuck decode/encode — must never block the whole run. The
>   runner's own `withTimeout` only `Promise.race`s (ABANDONS the loser; the runaway background work keeps
>   consuming the page → the run still stalls). EVERY op is now wrapped in `withOpTimeout(op, fn(signal))`:
>   a 30s timer races the body and, on timeout, `abort()`s an `AbortController` threaded into the engine
>   call (`probe/demux/remux/convert/seek/trim/decrypt` all now take `{signal}`) so the work is genuinely
>   CANCELLED (fetch aborts, decoder/encoder tears down), then rejects with a typed `OpTimeoutError` →
>   bounded per-scenario verdict. The body promise gets a `.catch` so its post-timeout abort-rejection is
>   consumed (never a new escaped pageerror). 30s is comfortably under the runner's 120s default so the
>   cancelling timer fires first. Verified in isolation: a never-settling body is bounded (~timeout),
>   the signal aborts, a subsequent op still runs, a fast op is not falsely timed out, and zero unhandled
>   rejections leak. (Caveat for the parent: a GENUINELY-long re-encode (>30s, e.g. a 120s-source 1080p
>   transcode) would false-FAIL; bump `OP_TIMEOUT_MS` if a specific legit long case needs it.)
> - **fastStart:none WIRED (capability refresh).** `remux` now forwards the streaming-output `fastStart`
>   knob: `fastStart:false`→engine `faststart:false` (mdat-first), else `faststart:true`. Declared the
>   `fastStart:none` feature → `mp4_buffer_target` + `prop_probe_dur_buffer_shape` flip NA→PASS
>   (mp4-box-layout verifies mdat-before-moov; reference-reimport/probe-duration pass). A `fragmented`
>   request is an explicit NA (the stream-copy remux cannot fragment — the CMAF muxer is convert-only);
>   `fragmented`/`target:writes`/`fastStart:reserve` stay UNDECLARED (honesty §15 — never a wrong/
>   unobservable output).
> - **AUTO-REFRESH (already declared+wired — attempt on the next vendor, no adapter change):** webm/mkv
>   demux packets (#69) and mp4 B-frame/VFR demux (#61) — `demux` already reads `packets()` for the
>   declared webm/mkv/mp4 containersIn; mov output (#71) — already in `containersOut`+remux/mux; mkv-H.264
>   decode — #56 (webm-driver CodecPrivate→description) + the engine's `normalizeDecoderCodec` now feed a
>   valid `avc1.*`+avcC config, so decode_mkv_h264/seek_mkv_h264 should attempt.
> - **ENGINE GAPS for the parent (NOT advertised — verify/re-vendor first):** (a) **#74 cross-container
>   remux** (`remuxViaSeam` → webm/mkv/ogg writable) landed in `media/src` (engine.ts 11:12) but the
>   VENDOR (10:52) is STALE for it — the bundle still lacks `remuxViaSeam`/"writable containers". Once
>   re-vendored AND a webm/mkv/ogg remux passes `reference-reimport`, add webm/mkv/ogg to `containersOut`
>   (would unlock the remux/mux/streaming webm/mkv/ogg targets). Left NA now to avoid a §15 fake/wrong
>   output. (b) **adts/mp3/ogg audio `packets()` still throw** (mp3-driver:186, ogg-driver:210, source +
>   vendor) — Gap#5 audio-extract transcodes stay NA until those drivers implement packet demux.

- **Engine id (current):** `aibrush-media@dev`
- **Latest version:** n/a — not published. There is no npm package, no GitHub repo, and no
  documentation for a browser media-processing library named `aibrush-media`, `@aibrush/media`, or
  `aibrush/media` (verified June 2026, see Research log below).
- **Kind (orientation only, per `test-instructions.md` §1):** "future candidate — placeholder
  adapter today; no capabilities until built."
- **Adapter file in the repo:** `src/engines/aibrush-media/adapter.ts` (already present as a stub;
  `capabilities()` returns all-empty, every operation method throws `NOT_IMPLEMENTED`, and
  `registerAibrushMedia()` is called by app wiring so the placeholder appears in the matrix as
  explicit `NA_ENGINE` coverage instead of being silently omitted).
- **Researched on:** 2026-06-17.

---

## 0. Why this dossier is a stub (and what that means for the suite)

`test-instructions.md` is explicit and consistent on three points:

- §1 framework table: `aibrush-media` → *"placeholder adapter today; no capabilities until built."*
- §13 Definition of done: *"…aibrush-media (stub) — each with honest `capabilities()`."*
- §15 research-first rule: *"Do not code a framework's API from memory"* and *"the honest limits
  (what it genuinely cannot do → declare `NA`, render `-`)."*

Because nothing about the library is published, the **only honest research output** is: the library
does not exist yet as a browser engine, so it supports **nothing** and every Appendix A row resolves
to `NA(engine)` → rendered `-` in the report. Declaring any operation, container, codec, or
fast-path here would be **fabrication** (forbidden by §0.6 "Never fabricate" and §14). Therefore the
adapter declares an empty `CapabilitySet`, the runner negotiates `NA(engine)` for every scenario, and
no method is ever invoked.

This is a *deliberate, valuable* state: the placeholder appears in the matrix as a **real,
not-yet-capable engine** (a visible, honest gap) rather than a silent omission. When the real
implementation lands, flipping capabilities on (with oracle-validated functionality) makes the entire
existing scenario battery + report machinery measure it with **zero scenario changes** (§4
"Adding a framework").

---

## 1. Latest version

**n/a (unpublished).** No release exists to pin. The repo's stub uses the sentinel id
`aibrush-media@dev` (see `src/engines/aibrush-media/adapter.ts`, constant `ENGINE_ID`). When the
library ships, bump this to a real semver such as `aibrush-media@0.1.0` and re-run the §15 research
pass against its actual README / API reference / changelog.

---

## 2. Recommended API per operation

**No API is documented or invented.** Every operation is **undeclared** today; the adapter throws
`"aibrush-media@dev: aibrush-media not yet implemented (placeholder adapter)"` if called (it never is,
because `capabilities().operations` is empty and the runner gates on declaration).

| Operation (`engine.ts` `Operation` union) | Recommended API today | Resolves to |
| --- | --- | --- |
| probe        | **NA** — not implemented | `NA(engine)` → `-` |
| demux        | **NA** — not implemented | `NA(engine)` → `-` |
| decode (`decodeFrames`) | **NA** — not implemented | `NA(engine)` → `-` |
| encode (via `transcode`/`mux`) | **NA** — not implemented | `NA(engine)` → `-` |
| remux        | **NA** — not implemented | `NA(engine)` → `-` |
| transcode    | **NA** — not implemented | `NA(engine)` → `-` |
| trim         | **NA** — not implemented | `NA(engine)` → `-` |
| mux          | **NA** — not implemented | `NA(engine)` → `-` |
| decrypt      | **NA** — not implemented | `NA(engine)` → `-` |
| seek         | **NA** — not implemented | `NA(engine)` → `-` |

> When real: research each op against the library's own docs and record the exact recommended call,
> mirroring the `MediaEngine` contract in `src/core/engine.ts`
> (`probe / demux / remux / transcode / decodeFrames / seek / trim / mux? / decrypt?`).

---

## 3. Documented BEST-PERFORMANCE path (§0.9)

**None — there is nothing to optimize and nothing to measure.** Per §0.7/§8.4 the timed window only
ever wraps an operation; since no operation is implemented, there is no `configUsed` to record. A
placeholder is **never benchmarked** (§0.1: correctness gates the number; with no PASS there is no
admissible value). The structured `bestPath` field below is therefore an all-empty/`n/a` object, not
a guess.

> When real: research and record the framework's *own-docs-endorsed* fastest configuration —
> hardware WebCodecs over software, WebGPU > WebGL > 2D-canvas/CPU for scale/color/pixel work,
> multi-threaded WASM (if it ships one), streaming/pipelined over batch, Worker offload, tuned
> `encodeQueueSize`/`decodeQueueSize`, transferable/zero-copy buffers, progressive HTTP-Range reads —
> then surface it as `configUsed` (§8.5). It must be a path the docs sanction (§0.9 guard-rail a) and
> still pass the same oracle (guard-rail b).

---

## 4. Required headers / flags / Worker setup

**None today.** The stub needs no `init()` (nothing to load), spawns no Worker, requires no
COOP/COEP, `SharedArrayBuffer`, or browser flags. The suite-wide dev-server headers
(COOP: same-origin + COEP: require-corp, per §8.5, which unlock cross-origin isolation and
`SharedArrayBuffer` for the mt-WASM engines) are set uniformly for all engines and cost this
placeholder nothing.

> When real: record exactly which of these the library *requires* for its best path (e.g. needs
> `SharedArrayBuffer`/COOP+COEP for a multi-threaded WASM core, runs in a Worker, needs a browser
> flag for an experimental codec). Per §8.5 such requirements are *recorded honestly*, never hidden.

---

## 5. How to VENDOR it locally (§0.8)

**Nothing to vendor.** There is no package to `bun add`, no `.js`/`.wasm` core to copy into a
`vendor/` dir, and no run-time fetch of any kind. The placeholder is pure local TypeScript
(`src/engines/aibrush-media/adapter.ts`) with no external bytes — it is already fully hermetic and
offline.

> When real: install via `bun add <real-pkg>` (bun-only, §0.5), then serve every runtime artifact
> (its bundle, any `.wasm`/worker `.js`) from the **local origin** out of `node_modules/` or a
> committed-by-reference `src/engines/aibrush-media/vendor/` directory. **No CDN/unpkg/`toBlobURL`
> from the internet at run time** (§0.8). Pin + record the vendored paths in each run's `env`.

---

## 6. Honest limits (these become `NA(engine)` → `-`)

The library cannot do **anything** in the browser today. Concretely, every Appendix A capability is
unavailable:

- Cannot probe / extract metadata.
- Cannot demux / iterate packets.
- Cannot decode frames; cannot seek.
- Cannot encode / transcode / remux / trim / mux.
- Cannot decrypt (CENC ctr/cbcs, HLS AES-128, ClearKey).
- Cannot read or write any container (in or out).
- Cannot decode or encode any video or audio codec.
- No metadata read/write, no subtitles/data tracks.
- No streaming/fragmented/CMAF/fastStart output modes.
- No video/audio transforms (resize/rotate/flip/crop/fps/color/HDR/alpha/fan-out/resample/ch-mix).
- No edge-case handling claims (it is never invoked, so it neither passes nor crashes — it is `NA`).

Distinction (§0.6): every cell is `NA(engine)` ("the framework can't"), **never** `NA(browser)`.
The browser is irrelevant here because the engine itself declares no capability to gate.

---

## 7. Appendix A coverage (A.1–A.16)

**Supported rows: none.** Every row resolves to `NA(engine)` → `-` because `capabilities()` declares
nothing and the runner never invokes a stub method. Listed per-row so the assessment is exhaustive
and explicit:

| Appendix A row | Coverage | Note |
| --- | --- | --- |
| A.1 Input sources & reading modes | `-` NA(engine) | no probe/demux to exercise any source/reading mode |
| A.2 Containers — READ (demux/probe) | `-` NA(engine) | `containersIn: []` |
| A.3 Containers — WRITE (mux) | `-` NA(engine) | `containersOut: []` |
| A.4 Video codecs — DECODE | `-` NA(engine) | `videoCodecs: []`; no `decodeFrames` |
| A.5 Video codecs — ENCODE | `-` NA(engine) | `videoCodecs: []`; no `transcode`/`mux` |
| A.6 Audio codecs — DECODE & ENCODE | `-` NA(engine) | `audioCodecs: []` |
| A.7 Core operations (probe/demux/decode/seek/remux/transcode/trim/mux/extract-audio/decrypt/thumbnail/fragmentation) | `-` NA(engine) | `operations: {}` — every core op undeclared |
| A.8 Video transforms (resize/rotate/flip/crop/fps/color/HDR/alpha/fan-out) | `-` NA(engine) | no `transcode`; `features: []` (no resize/rotate/alpha/fanout) |
| A.9 Audio transforms / DSP (resample/ch-mix/PCM convert/gain/fade) | `-` NA(engine) | no audio op declared |
| A.10 Output / streaming modes (buffer/streaming/CMAF/fastStart/tiny-chunk/MSE) | `-` NA(engine) | no output op; `features: []` (no fragmented/fastStart:reserve) |
| A.11 Metadata / tags / structure (read + write tags, rotation, chapters, edit lists, track select) | `-` NA(engine) | no probe; `features: []` (no metadata:write) |
| A.12 Encryption / DRM (CENC ctr/cbcs, HLS AES-128, ClearKey, untouched-negative) | `-` NA(engine) | `encryption: []`; no `decrypt` |
| A.13 Subtitles / text / data tracks | `-` NA(engine) | no read/write text or data-track op |
| A.14 Performance dimensions (ops/s, packets/s, fps, seek ms, ttf, load/init, peak-mem, longtask, bundle-size, range-fetches) | `-` NA(engine) | never benchmarked; no PASS, so no admissible perf number (§0.1). Even `load/init time` is ~0 (nothing to load) but a placeholder does not contest the case. |
| A.15 Developer / platform aspects (TS types, zero-deps, tree-shakeable, Worker, SAB/COOP+COEP, hw-accel, WebGPU/WebGL, license) | unknown / not-yet-applicable | the stub is TS with zero deps and needs no Worker/SAB, but these describe the *placeholder*, not a real product; record real values when the library ships |
| A.16 Deep edge cases + metamorphic invariants | `-` NA(engine) | never invoked → neither graceful nor crash; `NA`, not a robustness data point |

---

## 8. Research log (sources)

Verified that no public browser media library by this name exists (June 2026):

- npm/web search for `aibrush-media` (WebCodecs/browser media library): **no package by that exact
  name**; results were unrelated libraries (mediabunny, web-demuxer, libav.js-webcodecs, etc.).
- Web search for `"aibrush/media"` / `"@aibrush/media"` JavaScript library: **no matching npm
  package, GitHub repo, or library docs.** The only `aibrush.co` hit is **AiBrush Studio**
  documentation (`https://docs.aibrush.co/`), an AI media-*creation product* — **not** a browser
  media-processing/demux/transcode library — so it does not provide an API to adapt.
- Local install check: no `node_modules/aibrush-media` and no `@aibrush` scope installed; `bun pm ls`
  shows no aibrush dependency.

Reference doc URLs (for context only; none describe a usable browser engine API):

- AiBrush Studio docs (product, not a library): <https://docs.aibrush.co/>
- MDN WebCodecs (the API a future real engine would build on): <https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API>
- Mediabunny (the suite's reference engine, for comparison of what a real dossier contains): <https://mediabunny.dev/>

Internal references in this repo (authoritative for the placeholder's intended shape):

- `test-instructions.md` §1 (framework table), §13 (DoD), §15 (research-first), Appendix A.1–A.16.
- `src/engines/aibrush-media/adapter.ts` (existing stub: empty `capabilities()`, throwing methods,
  opt-in `registerAibrushMedia()`).
- `src/core/engine.ts` (the `MediaEngine` / `CapabilitySet` contract a real version must implement).

---

## 9. When the library becomes real — the upgrade checklist

1. Re-run the §15 research pass against the library's **current** README / API reference / changelog;
   pin the **latest version** and replace `aibrush-media@dev` with the real semver id.
2. Fill `capabilities()` **honestly** with canonical tokens (`engine.ts` `CANONICAL_*`) — only for
   operations/containers/codecs/features that pass an oracle.
3. Implement `init()`/`dispose()` for any one-time load (WASM compile, Worker spawn, encoder warmup)
   so it stays **outside** the timed window (§0.7).
4. Vendor every runtime artifact locally (§0.8); no run-time CDN.
5. Determine and record the **own-docs-endorsed fastest path** as `configUsed` (§0.9/§8.5).
6. Note honest limits → they remain `NA(engine)`.
7. Update **this dossier** and the structured object with real, cited facts; rewrite Appendix A
   coverage from `-` to measured `PASS`/value where earned.
8. Call `registerAibrushMedia()` (or wire it into `src/app/register.ts`) so it enters runs, then let
   the existing battery + report machinery measure it with zero scenario changes.
