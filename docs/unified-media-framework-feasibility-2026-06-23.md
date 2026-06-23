# Can One Framework Win All the Benchmarks? — Unified Media-Engine Feasibility

> **Purpose:** Decide whether we can build a single in-browser media framework (`aibrush-media`) that is best-in-class across *every* feature, by learning from the 7 benchmarked engines — and, specifically, whether we can do it **without an ffmpeg.wasm-sized bundle** while still getting **maximum speed and maximum coverage**.
>
> **Grounded in:** the 558-feature benchmark — `docs/report/best-framework-by-feature.md` (per-feature winners + why) and `docs/report/leaderboard.md` (roll-up). Source run: `results/runs/results-chromium-2026-06-22T17-42-49-289Z.json` · chromium 149 · Apple M1 Max (ANGLE Metal) · suite 0.1.0.
> **Date:** 2026-06-23.

---

## 1. The question

The benchmark compared 7 frameworks across 558 features. They win by **fundamentally different substrates**: hardware WebCodecs, hand-written TS/JS parsers, WASM/libav (software), and native browser elements. We are building our own engine. Two questions:

1. Can we fold the best-performing substrate *per feature* into one framework and beat all 7 in aggregate?
2. Can we do that with a **non-huge bundle** (not monolithic ffmpeg.wasm) while still maximizing **speed** *and* **coverage**?

## 2. TL;DR verdict

- **Yes — a single framework can win in aggregate, and the "mix" of substrates is the winning design, not an obstacle.** No current engine spans all substrates; that gap is the opportunity. Our own `aibrush-media` scored **0 wins** precisely because it competed as *another mono-substrate engine* instead of unifying them.
- **You cannot hold every individual crown at once.** Smallest-bundle, no-isolation-multithreading, and total-codec-coverage are mutually exclusive at the extremes. "Best of the best" means **best aggregate via capability routing**, plus a *deliberate* choice of where to sit on the speed ↔ coverage ↔ bundle ↔ determinism frontier.
- **Non-huge bundle + max speed + max *practical* coverage is achievable** — because the two biggest levers ship **zero bytes** (WebCodecs for speed, the GPU for pixel filters), and the genuinely-heavy coverage tail is only **~5% of features**, shippable as **lazy, per-codec wasm modules** rather than a monolith.
- **The only residual catch is a knob, not a wall:** the ~5% wasm-fallback tail is *correct-but-slow* on single-thread wasm; making it fast too requires `COOP/COEP` cross-origin isolation (opt-in). The common ~95% is unaffected.

## 3. What the benchmark actually proves

### 3.1 Win distribution (who won, out of 558)

| Framework | Wins | Share | Substrate |
|---|---:|---:|---|
| mediabunny@1.48.0 | **313** | 56.1% | WebCodecs + hand-written TS containers |
| ffmpeg.wasm@0.12.15 | **129** | 23.1% | WASM / libav (software) |
| remotion-webcodecs@4.0.479 | 38 | 6.8% | WebCodecs |
| remotion-media-parser@4.0.479 | 26 | 4.7% | pure-JS (cpu) parser |
| platform@chrome-149 | 23 | 4.1% | native WebCodecs |
| mp4box@2.3.0 | 16 | 2.9% | pure-JS box parser |
| web-demuxer@4.0.0 | 10 | 1.8% | WASM demux → WebCodecs |
| *NONE (no engine passed)* | 3 | 0.5% | — |

### 3.2 The winners collapse to **3 substrates** — and each engine is mono-substrate

From each winner's `env.configUsed`:

| Substrate | Wins | Share | Shipped bundle cost |
|---|---:|---:|---|
| **WebCodecs** (hardware-leaning) | 374 | 67% | **zero** (built into browser) |
| **WASM / libav** (software) | 139 | 25% | high (this is the bundle problem) |
| **Pure-JS parsers** | 42 | 8% | tiny (tens of KB) |
| Native `<video>`/MediaRecorder | ~0 | — | zero, but ~never wins (probe path 600–7000× slower) |

**Every winning engine used exactly one substrate** (mediabunny = 100% WebCodecs; ffmpeg.wasm = 100% wasm; mp4box = 100% pure-JS, …). So **"best of the best" = the union of substrates that no single engine spans today.** mediabunny is the closest existence proof but deliberately ships **no wasm**, so it loses all of audio-dsp and every codec/filter the browser lacks.

### 3.3 The dominant winning config needs **no isolation and no threads**

- **313 wins (56% of everything)** ran with `coopCoep: not-required` **and** `wasmThreads: 0`.
- **No winner anywhere used wasm threads.** ffmpeg.wasm earned its 129 wins in **single-thread** mode — i.e., despite being the slow configuration.

Implication: the highest-value path (WebCodecs + TS, no isolation) is also the most *deployable*. Threads are only relevant to the small wasm tail.

### 3.4 The genuinely-heavy coverage tail is **~5%**, not 25%

Of the 139 wasm-tier wins:

- **~112 are "cheap glue"** — container/demux/remux/probe/trim/PCM-copy/mux/decode operations ffmpeg.wasm won mostly by *being present and correct*, which a WebCodecs + hand-written-TS engine reclaims natively (mediabunny already beats ffmpeg.wasm on most of these where it competes).
- **~27 flagged as heavy** by a keyword heuristic — itself an overcount (it flags gain/fade/downmix as "heavy" when they're a few lines of TS).
- **True irreducible heavy-native tail ≈ 15–20 features (~3–5% of 558):** lossy audio *encoders* (Opus/AAC/MP3/Vorbis), software video *encoders* for codecs WebCodecs can't encode, **FLAC decode**, **true sample-rate resampling**, and a few colorimetry ops not done on the GPU.

> Example: **audio-dsp** — ffmpeg.wasm won 25/36, but the bulk are PCM format/endianness conversions, gain, fade, and channel up/down-mix — all kilobytes of TS (or an AudioWorklet/GPU kernel). Only real **resampling** and **lossy encode** need DSP/wasm.

### 3.5 Speed: hardware WebCodecs is 20–35× single-thread wasm

Representative gaps from the transcode details:

- `transcode/av_downmix_stereo_to_mono`: mediabunny **2,598 ms** vs ffmpeg.wasm **88,342 ms** (~**34×**).
- `transcode/bframe_reorder_h264_to_h264`: ~**23.9×** faster on hardware WebCodecs.

**The fastest path is the one that ships no bytes.** "Max speed" and "small bundle" are therefore *aligned* for the 67% WebCodecs path — not opposed.

### 3.6 Bundle spectrum (from the `performance/bundle-size` scenario)

mp4box ~41 kB · web-demuxer ~43 kB · remotion-media-parser ~73 kB · remotion-webcodecs ~94 kB · **mediabunny ~165 kB** · **ffmpeg.wasm = multi-MB wasm core (loaded up front)**. You cannot be both the smallest *and* the most complete — and you don't need to be either.

## 4. Why one framework *can* unify them — it composes at standard seams

The substrates meet at **two standardized boundaries**, so implementations are swappable *per stage*:

- **Encoded packets** join **containers ↔ codecs**.
- **WebCodecs `VideoFrame` / `AudioData` / `EncodedChunk`** join **codecs ↔ filters ↔ muxers**.

A pipeline `demux-in-TS → decode-in-WebCodecs → filter-on-GPU → encode-in-WebCodecs → mux-in-TS` lets any single stage's backend change without touching the others. **mediabunny already is this** (TS containers + WebCodecs codecs); adding a lazy libav-wasm tier and GPU filters behind the same seams is an *extension*, not a rewrite.

## 5. The hard limits (what you can't hold simultaneously)

1. **Bundle ⟂ codec coverage.** Smallest (mp4box ~41 kB) vs widest (libav, multi-MB). Resolve by **lazy + per-codec wasm**, not a monolith.
2. **Speed ⟂ coverage ⟂ deployability (trilemma).** Hardware WebCodecs is fastest but incomplete; multi-thread wasm closes the gap but needs **COOP/COEP**, which 56% of today's winning configs avoid. You get two of {fast, complete, no-isolation} on any single op.
3. **Reproducibility ⟂ hardware.** "Bit-exact decode" wins here are **GPU/platform-specific** (Apple M1 Max ANGLE). Software decode is deterministic across machines. If you need cross-machine golden parity, you'll sometimes *prefer the slower software path* — so "best" depends on the goal. Keep a force-software mode.

## 6. The refined answer: non-huge bundle + max speed + max coverage

**Achievable**, because the cost structure is favorable:

- **Speed is free in bundle terms.** WebCodecs is in the browser (0 bytes) and 20–35× faster than single-thread wasm. You'd hit max speed *more* reliably than ffmpeg.wasm by routing to hardware first.
- **Most filters are free.** Scale/crop/pad/rotate/flip/colorspace/tonemap run on **WebGPU/WebGL/Canvas** over the `VideoFrame` — zero wasm, GPU-fast, often beating libavfilter.
- **Most "coverage" is cheap glue.** Containers/PCM/mux/demux/trim-copy = hand-written **TS**, tens of KB.
- **The heavy ~5% ships lazily, per-codec.** FLAC decoder (~50–100 kB), libopus (~300 kB), a resampler (soxr, small), etc. — fetched **only when WebCodecs can't serve the op**. **Eager bundle stays mediabunny-class (~150–250 kB)**; worst-case per-op download is bounded by *that codec's* module, never the whole library.

**The one catch (a knob):** the ~5% wasm tail is correct-but-slow on single-thread wasm. To make it fast too → wasm SIMD+threads → `SharedArrayBuffer` → **COOP/COEP**. Offer it as a per-deployment choice:

- **No isolation:** common path max-speed; exotic tail correct-but-slow.
- **With isolation (opt-in):** exotic tail also fast.

**Two honest scope boundaries:** (a) "max coverage" should mean *everything your users actually need*, not literal ffmpeg parity — the last 2% of ffmpeg's codec zoo is exactly what makes it multi-MB; skipping it is *how* you stay non-huge. (b) Expect a determinism/complexity tax: more codepaths + capability detection + browser drift.

## 7. Recommended architecture — a 3-tier, capability-routed engine

Adopt mediabunny's spine (proven: 56% of wins, zero wasm, no isolation) and add the tiers it lacks.

```
                 ┌─────────────────────────────────────────────┐
   operation ──▶ │  CAPABILITY ROUTER                           │
                 │  • WebCodecs.isConfigSupported?              │
                 │  • crossOriginIsolated? (→ wasm threads ok)  │
                 │  • preference: speed | determinism           │
                 └───────────────┬─────────────────────────────┘
        ┌────────────────────────┼───────────────────────────────┐
        ▼                        ▼                                 ▼
 TIER 0: containers      TIER 1: codecs (default)        TIER 2: fallback (lazy)
 hand-written TS         WebCodecs (prefer-hardware)      per-codec libav-wasm + GPU filters
 demux/mux/remux/        decode/encode                    FLAC decode, lossy audio enc,
 trim/probe (streaming,  + GPU (WebGPU/WebGL/Canvas)      SW video enc, resample, tonemap
 range reads)            for pixel filters                (fetched on demand only)
   ~tens of KB              0 shipped bytes                  small, code-split, amortized
```

| Tier | Handles | Backend | Bundle |
|---|---|---|---|
| **0 — Containers** | demux, mux, remux, trim-copy, probe, metadata | hand-written streaming **TS** (range reads; header-only probe fast paths) | tens of KB |
| **1 — Codecs (default)** | decode, encode | **WebCodecs**, `prefer-hardware`, gated on `isConfigSupported`; **GPU** for pixel filters | **0** |
| **2 — Fallback (lazy)** | codecs/filters the browser lacks: FLAC decode, Opus/AAC/MP3/Vorbis encode, SW video encode, sample-rate resample, advanced colorimetry | **per-codec libav-wasm**, lazy-loaded; threads only if `crossOriginIsolated` | small, on-demand |
| (last resort) | playback-smoke only | native `<video>`/MediaRecorder | 0 — never for metadata/probe |

**Routing policy:** detect WebCodecs config support → use Tier 1; else lazy-load the specific Tier-2 module. Detect `crossOriginIsolated` to decide single- vs multi-thread wasm. Expose a `speed | determinism` preference (determinism forces software/GPU-off for reproducible goldens). **Ship two build profiles:** lean "WebCodecs-first" core, and opt-in "+wasm" that lazy-loads libav — making the bundle/coverage trade a *user choice*, not a baked compromise.

## 8. Per-operation routing cheat-sheet (who to learn from, by family)

| Family | Primary path | Learn from | Fallback (Tier 2) |
|---|---|---|---|
| probe / metadata | TS header-only, range reads | mediabunny, remotion-media-parser, mp4box | — (never use `<video>`: 600–7000× slower) |
| demux | TS streaming demux | mediabunny | per-codec/container wasm for exotic inputs |
| mux / remux / streaming-output | TS muxers (MP4/MKV/WebM/Ogg/WAV/TS), `StreamTarget`, faststart | **mediabunny (dominant)** | ffmpeg-wasm only for containers not worth hand-writing |
| trim | TS packet-copy (keyframe-aligned + frame-accurate) | mediabunny | — |
| decode-seek | WebCodecs `VideoDecoder` (prefer-hardware) | platform, mediabunny, web-demuxer | wasm decode for codecs WebCodecs lacks |
| transcode (video) | WebCodecs decode+encode; **GPU** for resize/crop/rotate/colorspace/tonemap | mediabunny | SW encoder for HEVC/AV1/VP8 where WebCodecs can't encode |
| audio-dsp | TS for PCM/format/endianness/gain/mix/fade; AudioWorklet/GPU | (reclaim from ffmpeg.wasm) | wasm only for **resample** + **lossy encode** |
| encryption | WebCrypto (AES-CTR/CBC) + TS CENC/HLS parsing | ffmpeg.wasm (CTR), mediabunny (CBCS) | — |

## 9. Known coverage gaps to plan for

The 3 **no-winner** features mark the real browser ceiling (all transcode):

- `flac_to_opus_webm` — **no FLAC `AudioDecoder`** in Chrome 149 WebCodecs → needs a Tier-2 FLAC decoder.
- `h264_8bit_to_hevc_10bit` — **no 10-bit HEVC encoder** available → needs SW encoder (license/bundle cost; may be out of scope).
- `h264_to_vp8_webm` — ffmpeg.wasm encoded VP8 but **failed `<video>` playback-smoke** → validate output playability, not just production.

Also plan for **browser drift**: WebCodecs codec support changes per Chrome version (FLAC may land later; HEVC/AV1 support varies by OS/build). The router must feature-detect at runtime, not assume.

## 10. Integrity lessons — don't copy the shortcuts

The validation roll-up found **0 CHEAT but 3 SUSPECT and 206 WEAK-GATE**. When "learning from the winner," copy the *mechanism behind REAL wins*, and re-verify with strict (bit-exact / structural) oracles:

- **SUSPECT — do not emulate:** `remux/huge_h264_1080p_600s_mov_to_mp4` "won" by **flipping 8 `ftyp` bytes and returning the input** past a loose oracle; `performance/size-ladder-iterate-packets-medium` used a **hardcoded per-asset sample table**; `performance/size-ladder-demux-peak-memory-large4k` won on a **degenerate empty-metric** (`median([])==0`).
- **WEAK-GATE (206):** PASS rested on duration-only / SSIM-`exactFrames==0` / "didn't crash" gates — concentrated in transcode (47), trim (31), robustness (29). Treat these as "fast + plausible," not "proven correct." Our engine should gate itself with **bit-exact frame digests (transcode), boundary-frame digests (trim), and output-content assertions (robustness).**

## 11. Recommendation & phased roadmap

**Build the router none of the 7 is.** Concretely:

1. **Phase 1 — Spine (Tier 0 + Tier 1).** Hand-written streaming TS containers + WebCodecs-default codecs + GPU pixel filters, no COOP/COEP. This alone targets the ~75% of features the WebCodecs/TS/GPU substrates already win, at mediabunny-class bundle. Strict oracles from day one.
2. **Phase 2 — Lazy Tier 2.** Code-split per-codec wasm (FLAC decode, libopus, resampler) loaded on demand behind capability detection. Reclaims audio-dsp + 2 of the 3 no-winner gaps. Eager bundle unchanged.
3. **Phase 3 — Optional isolation profile.** `+threads` build using `SharedArrayBuffer` when `crossOriginIsolated`, to make the wasm tail fast. Keep the no-isolation build as default.
4. **Continuous — re-measure.** 542/555 winners in this run were `cached` (cache-seeded launcher); most perf margins are single-sample. Re-run head-to-heads on fresh, multi-sample timings before trusting any margin.

## 12. Open decisions (need a human call)

- **Coverage ceiling:** which exotic codecs/filters are explicitly *out of scope* (the multi-MB tail we refuse)?
- **Isolation stance:** is requiring COOP/COEP acceptable for the fast-wasm profile, or must we stay no-isolation-only?
- **Reproducibility:** do we need cross-machine bit-exact goldens (→ ship/keep a software-deterministic mode), or is hardware-fast-but-platform-specific fine?
- **Bundle budget:** target eager-core KB ceiling (e.g., ≤250 kB) and per-codec lazy-module ceiling.

---

### Appendix — sources

- Per-feature winners & deep technical why: `docs/report/best-framework-by-feature.md` (558 rows) + `docs/report/details/*.md`.
- Roll-up (wins, per-family, validation, cached, no-winner, confidence, sanity): `docs/report/leaderboard.md`.
- Structured data: `docs/report/_rows.ndjson` (one normalized row per feature). Backend/config figures derived from each winner's `env.configUsed` in `docs/report/shards/`.
