# Browser Media-Framework Benchmark Suite — Specification

**What this is.** A **library-agnostic, real-browser benchmark suite** that puts every browser media framework through the **same battery of cases** — functional correctness, deep edge cases, and performance — measures a **value for each framework on each case**, and declares a **clear winner per case** plus an **overall leaderboard**. The deliverable is the comparison: *for this case, which framework is correct, and which is fastest, and by how much.*

**This is not a loop.** There is no cron, no "continuous iteration", no background driver. You **bake once**, then **run on demand** (now, after a framework updates, after you add a case, or in CI) and read the report. "Run the suite" is like "run the tests": a one-shot, re-runnable command — not a recurring job.

**The question it answers:** *Across the media libraries that run in a browser, which one wins each task — and is it actually correct while winning?*

---

## 0. The rules that override everything

1. **Correctness gates the number.** A framework is eligible to *win* a case only if its output passed that case's correctness oracle. A fast-but-wrong result never wins; it is recorded `FAIL`. No green oracle → no admissible benchmark value. (This is what separates a real benchmark from a vanity chart.)
2. **The winner is the product.** Every case ends in a verdict: **a winner** (the fastest *correct* framework), its value, and the margin over the runner-up — per browser. The suite's output is the leaderboard, not prose.
3. **Judge only observable behavior.** Bytes/metadata/frames in → bytes/metadata/frames out, validated against independent ground truth. Never a framework's internals (those are framework-specific and unfair to compare).
4. **Real browser, never headless.** Every measurement runs in a **real, non-headless browser** (Brave by default). No headless shell, no fake/software-only codec contexts — they don't reflect what users get.
5. **bun only, never node.** Every JS/TS execution uses `bun`/`bunx` — scripts, shebangs, the launcher, CI. The single exception is the **offline bake**, where native `ffmpeg`/`ffprobe`/Bento4 produce fixtures; even there the JS runtime is `bun`.
6. **Never fabricate.** Not run = `—`. Unsupported = `NA` with the reason (framework-can't vs browser-can't, kept distinct). Every number is produced in-browser by the suite.
7. **Measure the operation, not the library.** A framework's one-time cost — downloading its code, compiling/instantiating WASM, configuring/warming a WebCodecs encoder — is **excluded from every operation benchmark**. It happens in `init()`, awaited *before* the timed window opens, and is reported **separately** as a `load/init time` metric (informational, never folded into ops/s, packets/s, frames/s, or wall). A 30 MB WASM core is a *bundle-size* and *load-time* fact, not a slowdown of the convert it then performs.
8. **All libraries are hosted locally.** Every framework runtime (incl. heavy WASM cores like `@ffmpeg/core`) is vendored and served from the local origin. **Nothing is fetched from the internet at run time** — no CDN/unpkg `toBlobURL`. Runs are hermetic, offline, and repeatable; a flaky network can never perturb a measurement.
9. **Every framework competes on its OWN best path.** Fairness is *not* forcing an identical lowest-common-denominator API on everyone — it is giving each framework its **fastest documented configuration** on the current browser, then recording exactly what that was. Use hardware-accelerated WebCodecs over software; **WebGPU > WebGL > 2D-canvas/CPU** for scaling/color/pixel work; pipelined/streaming over batch; Worker offload; multi-threaded WASM where the framework ships and recommends it; zero-copy/transferable buffers; the queue depths the docs suggest. The chosen config is **recorded per framework** in the report so every number reads "this framework, at its best, configured thus." Two guard-rails: (a) it must be a path the framework's **own docs endorse** — best *supported* config, never a hand-rolled advantage the library doesn't sanction, and never crippling a rival's fast path; (b) the fast path still must pass the **same correctness oracle** — speed is earned via the better backend, never via a lower correctness bar (a WebGPU resize is SSIM/PSNR-gated like any other).

---

## 1. The frameworks under test

All sit behind one common adapter (`MediaEngine`, §4). Adding a framework = adding one adapter file; it then runs the **entire battery** automatically. Mediabunny is the **reference** (deltas are quoted against it), but any framework can win any case.

> **Kind is orientation only.** The "kind" column positions each framework so we know roughly what to test; the **exact capabilities are determined by research (§15) + `capabilities()` + runtime detection — never asserted here.** Do not infer support from this table.

| Framework | Kind (per its own docs) | First thing the research agent (§15) must establish |
| --- | --- | --- |
| **mediabunny** (reference) | WebCodecs orchestrator, pure-TS, zero-dep | the Δ baseline — its full read/write/transcode/trim API + recommended fast path + version |
| **ffmpeg.wasm** | WASM, software codecs | single- vs **multi-thread** core, which codecs/containers the wasm build ships, how to **vendor it locally** |
| **mp4box.js** | pure-JS ISOBMFF parser/fragmenter | exactly which read/probe/segment ops it exposes (and what it does not) |
| **platform** | raw WebCodecs + `<video>`/MSE/MediaRecorder | per-browser WebCodecs/MSE/MediaRecorder/ImageDecoder limits |
| **@remotion/media-parser** | pure-JS parser | its container + metadata/packet coverage and streaming model |
| **web-demuxer** | WASM (ffmpeg-based) demuxer | its container list + WebCodecs-chunk output shape |
| **@remotion/webcodecs** | WebCodecs converter | its transcode/convert/resize options + supported in/out |
| **aibrush-media** | future candidate | placeholder adapter today; no capabilities until built |

> A framework being read-only (a parser) is **not** a reason to drop a case. Parsers simply score `-` on encode cases and compete only on the cases they declare. The suite is **case-centric and framework-blind**: cases are defined once and never edited to flatter a framework, and **who supports what is discovered, not assumed.**

---

## 2. Execution model — three commands, no loop

```
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. BAKE   (offline, once; native binaries allowed)           │
  │    fixtures/bake.mjs (run via bun) → static corpus + golden  │  → committed (golden+manifest)
  └─────────────────────────────────────────────────────────────┘
                          │ static files, fetched in-page
  ─────────────────────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────┐
  │ 2. RUN    (on demand, REAL BROWSER — Brave, non-headless)    │
  │    serve the suite → open in Brave → for each framework×case:│
  │      run op in-page → CORRECTNESS oracle → if pass, MEASURE  │
  │    → write results/raw/<browser>.json                        │
  └─────────────────────────────────────────────────────────────┘
                          │
  ┌─────────────────────────────────────────────────────────────┐
  │ 3. REPORT (on demand)                                        │
  │    compare → results/report.md: winner per case + leaderboard│
  └─────────────────────────────────────────────────────────────┘
```

- **Bake** is offline and one-time (re-run only when the corpus changes). It is the *only* place a binary runs.
- **Run** happens entirely in a real browser. The launcher (Playwright driving real Brave, or the `/chrome` extension, or simply opening `index.html`) only **automates** open→run→save; it performs **no measurement**.
- **Report** turns raw results into the winners + leaderboard. Pure transformation, re-runnable anytime.

You re-run `run`+`report` whenever you want a fresh comparison. That is the whole lifecycle.

---

## 3. Directory layout (`media-browser-test/`, self-contained)

```
├── test-instructions.md        # THIS spec (the canonical description)
├── README.md  package.json  tsconfig.json  vite.config.mjs  index.html  .gitignore
├── fixtures/
│   ├── bake.mjs                # offline: ffmpeg/ffprobe/Bento4 (+ in-browser capture) → media/ + golden/
│   ├── manifest.json           # every asset: id, family, container, codecs[], genMethod, sha256, sizeBytes
│   ├── media/   (git-ignored)  # rebuilt by bake
│   └── golden/  (committed)    # small JSON ground truth (meta, packets, frame digests, luma sigs)
├── src/
│   ├── core/  engine.ts scenario.ts registry.ts runner.ts measure.ts bench.ts oracles.ts feature-detect.ts report.ts
│   ├── engines/  mediabunny/ ffmpeg-wasm/ mp4box/ platform/ remotion-media-parser/ web-demuxer/ remotion-webcodecs/ aibrush-media/ _template/
│   ├── cases/    functional/ edge/ performance/      # the battery, grouped by dimension (§6–§8)
│   └── app/      # in-page UI: pick frameworks + cases, Run, watch the live matrix + winners
├── results/  raw/ (git-ignored)   report.md (committed)   report.json (committed)
└── scripts/  bake-fixtures.sh  serve.sh  run.sh  compare.sh  add-engine.sh   (all bun/bunx)
```

`.gitignore`: `fixtures/media/`, `node_modules/`, `dist/`, `.vite/`, `results/raw/`, `src/engines/**/vendor/`.

---

## 4. The adapter contract (`src/core/engine.ts` — authoritative)

Everything is **bytes/blobs/metadata/frames in → out**, async, browser-native; no method exposes internals. A framework declares a **CapabilitySet**; the runner only runs a case on it when the framework declares the capability **and** the real browser can configure the needed codec (else `NA`, with which kind).

Key types (see `engine.ts` for the full, current definitions):

- `MediaInput` (served static asset, HTTP-Range capable), `MediaBytes`, `NormalizedMetadata`, `PacketInfo`, `DemuxResult`, `FrameDigest`/`FrameSink` (sha256 of normalized RGBA).
- `Operation = probe | demux | remux | transcode | decodeFrames | seek | trim | mux | decrypt`.
- `CapabilitySet { operations, containersIn[], containersOut[], videoCodecs[], audioCodecs[], encryption[], features[] }` — honest declaration; `features` includes e.g. `resize`, `rotate`, `fanout`, `metadata:write`, `fragmented`, `fastStart:reserve`, `webcodecs:independent` (WASM/JS engines that don't route through WebCodecs opt out of the browser-codec gate).
- `MediaEngine { id; capabilities(); init?; dispose?; probe; demux; remux; transcode; decodeFrames; seek; trim; mux?; decrypt? }`.

**`init()` is the load phase, and it is untimed (rule §0.7).** Every adapter does *all* one-time, heavy work in `init()` — dynamic-import its (locally-hosted, §0.8) bundle, fetch+compile+instantiate WASM, spin up its Worker, configure/warm a WebCodecs encoder/decoder. The runner `await`s `init()` **before** opening any timing window, so library load/compile never counts against an operation. `dispose()` tears it down (free WASM heap, close Workers/codecs) so peak-memory is clean. The one-time cost is captured *separately* as the `load/init time` metric.

**Adding a framework:** `scripts/add-engine.sh <id>` copies `_template/adapter.ts`; implement the interface + honest `capabilities()`, register it, and it's automatically in every case and the leaderboard.

---

## 5. Corpus & oracles (the correctness gate)

### 5.1 Corpus (`fixtures/bake.mjs`, offline, checksummed)

A fixed, `sha256`-pinned corpus the browser `fetch()`es. Families, chosen to exercise everything and to break weak parsers:

- **Big read file** — a large 1080p H.264 `.mov` (BigBuckBunny-style) to stress metadata-extract / packet-iteration / convert throughput (mirrors Mediabunny's benchmark input).
- **Video MP4/MOV** — H.264 1080p & 4K, HEVC, **with/without B-frames**, **VFR**, **rotated**, **multi-track**.
- **Matroska/WebM** — H.264-in-MKV, VP8/VP9/AV1 WebM, **VP9 with alpha**.
- **MPEG-TS / HLS** — H.264 TS, HLS VOD, **AES-128 HLS**.
- **Encrypted MP4** — **CENC `ctr`**, **CENC `cbcs`** (baked via Bento4/Shaka if available, else honest `NA`).
- **Audio** — WAV s16/s24/f32, **big-endian PCM (AIFF)**, MP3 (**Xing TOC** + **CBR no-TOC**), FLAC (**±SEEKTABLE**), AAC/ADTS, Opus/OGG.
- **Recorder-origin** — **headerless MediaRecorder WebM/Opus** (no Duration element), captured in-browser once and committed.
- **Stress / malformed** — multi-hour / many-samples, **zero-length**, **truncated**, bit-flipped mutants.
- **Image negatives** — JPEG/PNG/WebP, kept **only for the negative-input guard** (feeding an image into an audio/video op must fail cleanly, never crash — §7/§A.16).

`manifest.json` carries the checksum set; the suite asserts on load and fails loudly on mismatch. Media is git-ignored + rebuilt; **manifest + golden + bake script are committed**.

### 5.2 Oracles (`src/core/oracles.ts`, browser-pure)

Correctness is judged the same way for every framework, using only the browser + committed golden + the reference engine:

| Op | Oracle | Pass criterion |
| --- | --- | --- |
| probe | vs `golden/<a>.meta.json` | duration within tolerance (strict for precise containers; wider, documented band for estimate-only TS/ADTS/HLS/CBR-MP3); codec/dims/fps/channels match |
| demux | vs `golden/<a>.packets.json` | per-track, order-independent: counts, sizes, keyframe flags; timestamps within a constant per-track origin offset |
| remux (lossless) | decode output in-browser → frame digests vs golden; reference re-import; `<video>` playback | frames bit-exact; re-imports; plays |
| transcode/resize/rotate/alpha/fan-out | decode output → **SSIM + PSNR** vs reference frames; alpha plane separately | SSIM ≥ 0.99 (tuned per codec); PSNR ≥ 40 dB; plays |
| decode/seek | frame digest vs golden; seek lands on expected keyframe | correct frame; accuracy within tolerance |
| trim | out duration ≈ requested; boundary frames vs golden | duration + boundaries correct |
| decrypt | decoded frames bit-exact vs golden | byte/frame-exact |
| mux | reference re-import + playback; frames vs source | round-trips; plays |
| property/metamorphic | computed in-browser (§7) | invariant holds |

Golden = small committed JSON, baked from **independent** tools (ffprobe/ffmpeg/Bento4) so the oracle is real ground truth, not "whatever the reference did."

### 5.3 The asset directory & the size ladder

**There is ONE asset directory: `fixtures/media/`.** Every test media file lives here (indexed by `fixtures/manifest.json`, fetched at run time as `/fixtures/media/<id>`). It is git-ignored (binary/large) and populated three ways — **generated** by the bake, **fetched** by the bake from pinned URLs, or **provided** by you (§5.4). The directory is the single source of test media; nothing is read from anywhere else at run time.

**Size is a first-class test axis** — throughput, peak memory, lazy/partial reading, and streaming all behave differently at each scale, so we prepare media at **all sizes** and benchmark the applicable operations across the full ladder (the winner at 10 MB can differ from the winner at 1 GB):

| Bucket | Target size | Example asset(s) | Source | What it stresses |
| --- | --- | --- | --- | --- |
| **empty** | 0 B | `zero_length.mp4` | generated (touch) | robustness (graceful fail) |
| **micro** | ~1 KB | `truncated_h264.mp4`, 1-frame clip | generated | header/edge robustness |
| **tiny** | ~100 KB | 1–2 s 360p, short audio | generated | probe/demux latency, init overhead |
| **small** | ~1 MB | ~5 s 720p, one song | generated | functional baseline + perf |
| **medium** | ~10 MB | 30 s 1080p (`h264_1080p_30s`) | generated | default workhorse |
| **large** | ~100 MB | 60–120 s 1080p, 20 s 4K | generated (slow) | sustained throughput, memory |
| **huge** | ~500–700 MB | `BigBuckBunny1080pH264.mov` (Mediabunny's own input) | **fetched or provided** | metadata-extract / packet-iterate / convert **at scale** (parity with the published chart) |
| **massive** | 1–4 GB / multi-hour | multi-hour 1080p, many-thousand-sample file | bake makes a long low-bitrate one; real ones **provided** | lazy-read, streaming, peak-memory, OOM resistance |

For each bucket we keep at least one asset per **major container/codec** it is meant to stress (e.g. a *huge* H.264 MP4 **and** a *huge* VP9 WebM), so the size axis crosses the format axis. Perf cases may report a metric **vs size** (a short curve), not just a single point.

### 5.4 Provenance & the user-provided protocol (when an asset can't be generated)

Every `manifest.json` entry declares a `source` and a `sizeBucket`:

- **`generated`** — `bake.mjs` makes it deterministically with ffmpeg (testsrc2/sine + bit-exact flags). Covers most buckets.
- **`fetched`** — `bake.mjs` downloads a **pinned public URL** (recorded + `sha256`-verified), offline-once, never re-fetched at run time (e.g. BigBuckBunny).
- **`captured`** — produced once in a real browser (e.g. headerless MediaRecorder WebM via `fixtures/tools/record-fixture.html`), then kept as a committed-provided file.
- **`provided`** — **the agent cannot produce it**: no available tool (real CENC `cbcs` without Bento4/Shaka), too large/licensed to fetch, or a real-world capture (device HEVC, HDR, camera).

**Protocol the agent MUST follow when it cannot produce an asset:**

1. **Never fake it; never silently skip.** Keep the manifest entry with `source: "provided"`, clear acquisition `notes`, an optional `sourceUrl`, expected `sizeBytes`/`sha256` when known.
2. `bake.mjs` prints a **`MISSING ASSETS`** block: for each, the exact path to drop it at (`fixtures/media/<id>`), where to obtain it, and the expected size/checksum.
3. The agent **surfaces that list to the user verbatim** — "please place these files in `fixtures/media/`: …" — and proceeds with everything else (it does not block the rest of the suite).
4. Until the file is present, every case needing it is **`NA(asset-missing)`** — a distinct reason, never `FAIL` and never a fabricated value.
5. After you drop the file in and re-run `bake --golden-only`, the suite fills checksums + golden and the cases activate. On load the suite verifies each present asset's `sha256`; a mismatch **fails loudly** so a wrong "provided" file can't corrupt results.

This is how the corpus stays both **complete** (every size, every format we care about) and **honest** (agents request what they can't make, rather than guessing or skipping silently).

---

## 6. Dimension A — Functional cases (correctness coverage)

Each case is one `(op, asset, options, requires, oracles, metrics)`, framework-blind. Coverage families: **probe/metadata, demux, remux (cross-container matrix MP4↔MOV↔MKV↔WebM↔TS + audio), transcode (codec matrix H.264/HEVC/VP8/VP9/AV1 + AAC/Opus/MP3/FLAC/PCM), decode/seek, trim, mux, encryption (ctr/cbcs/HLS-AES), metadata read+write, streaming/output (buffer/streaming/fragmented/CMAF/fastStart/tiny-TS), audio-DSP (resample/ch-mix/PCM incl. big-endian & 24-bit), fan-out/ABR, image negatives.**

**Winner semantics (functional):** a case is PASS/FAIL/NA per framework. The dimension winner is the framework with the **highest correctness coverage** (most cases PASS, NA excluded from the denominator) — reported as a **conformance %** and a per-family breakdown. Ties broken by fewer FAILs, then by breadth of declared capabilities actually exercised.

---

## 7. Dimension B — Deep edge cases (the stress dimension)

Every framework runs these in a **Worker** so a crash/hang is contained and timeout-detectable. This is where weak frameworks are separated from robust ones.

- **Container/codec edges:** open-GOP & B-frame reorder; VFR; display-matrix rotation; multi-track selection; fragmented/CMAF; `fastStart:reserve` large forward seek; tiny 188-byte TS writes; many-samples / multi-hour.
- **Audio edges:** big-endian PCM (AIFF), 24-bit PCM, MP3 Xing-TOC vs CBR-no-TOC duration, FLAC ±SEEKTABLE seek accuracy, headerless MediaRecorder WebM (no Duration → must still report a sane duration).
- **Encryption edges:** CENC `ctr`, `cbcs` per-subsample IV pattern, AES-128 HLS; unencrypted input must be left untouched.
- **Malformed / fuzz:** in-browser byte mutation (bit-flips, header truncation, zeroed spans) of valid assets → the framework must **fail gracefully** (throw/reject) within a timeout — **no crash, no hang, no unbounded memory.** Record `graceful` / `crash` / `timeout` / `OOM`.
- **Property / metamorphic invariants (in-browser):** `decode(remux(x)) == decode(x)`; `demux(mux(x)) ≈ x`; `probe(remux(x)).dur ≈ probe(x).dur`; `trim(a..b) ++ trim(b..c) ≈ trim(a..c)`; `probe(x).dur` consistent across containers of the same content.
- **Image negatives:** JPEG/PNG/WebP → clean `NA`/error, never a crash.

**Winner semantics (edge):** the framework with the highest **robustness rate** = (graceful-or-correct outcomes) ÷ (applicable edge cases), with invariants-held counted. A crash/hang/OOM is a hard loss for that case.

---

## 8. Dimension C — Performance benchmarks (the headline)

Same observable operations, now **timed and resource-profiled**. Includes the **four published Mediabunny benchmarks** as first-class cases, run for **every** framework, plus a per-op timing sweep.

### 8.1 Headline cases (Mediabunny-parity, run for all frameworks)

| Case | Operation | Primary metric (direction) |
| --- | --- | --- |
| `perf/extract-metadata` | repeated `probe` of the big file | **ops/s** (higher) |
| `perf/iterate-video-packets` | `demux`, count all video packets | **packets/s** (higher) |
| `perf/convert-webm-resize-320x180` | `transcode` → WebM, resize 320×180 | **frames/s** (higher) |
| `perf/bundle-size` | build-time: bundle the framework's used entrypoints, minify+gzip | **kB** (lower) |

### 8.2 Full per-op sweep (across the corpus)

Every functional op also gets a timed case: probe, demux, remux (per container pair), transcode (per codec/resize/fps/bitrate/rotate), decode, seek, trim, mux, decrypt, audio-DSP.

### 8.3 Metrics (`src/core/measure.ts`, all in-browser)

| Metric | Source |
| --- | --- |
| wall time / **throughput × real-time** (`mediaSec/wallSec`) | `performance.now()` |
| **ops/s**, **packets/s**, **frames/s** (decode & encode) | per-op counters / wall |
| peak memory | `measureUserAgentSpecificMemory()` (gated) → `performance.memory` → omit+flag |
| main-thread blocking | `PerformanceObserver({type:'longtask'})`, Σ tasks > 50 ms |
| source reads / range fetches, target writes / bytes out | counting Source/Target wrappers |
| **bundle size** (kB, min+gzip) | offline per-engine build (the one build-time metric) |

### 8.4 Protocol (`src/core/bench.ts`)

- **Load/init is OUTSIDE the timed window (rule §0.7).** The framework is fully initialized first — `await engine.init()` performs module load, WASM compile/instantiate, and any encoder/decoder configure+warmup — and *then* the clock starts and wraps **only the operation call**. `measure.ts` opens the timing window after init resolves and closes it when the op returns; init bytes/seconds are never inside it.
- **Fresh context for clean memory, init still untimed.** When an iteration runs in a fresh Worker/page (for clean peak-memory), `init()` runs untimed inside that context *before* the measured op — so re-initialization per iteration never leaks into the operation time. (For load-heavy engines you may also init once and reuse across iterations; either way the timed window excludes load.)
- Warm up ≥ 3 unmeasured iterations of the **operation** (separate from init warmup); measure ≥ 6 (record actual N).
- Report **median, p95, MAD**. A difference counts only when it exceeds `max(noise-band, 3%)`; otherwise **within-noise** (→ tie).
- A/B-alternate when head-to-head; never "all A then all B."; AC power; quiesced machine.
- A bench runs **only after** the same case's correctness oracle passed for that framework (rule §0.1).
- **`load/init time` is its own case/metric** (§A.14) — measured once per framework×browser (cold: clear caches; and warm: caches primed), reported on its own line. It explains *why* a heavy engine is heavier to adopt, without ever penalizing the speed of the work it does.

### 8.5 Fairness — every framework on its own best path (rule §0.9)

Each adapter must drive its framework the way the framework's **docs recommend for maximum performance**, and expose what it used so the comparison is reproducible.

- **Backend selection (fastest available, in order):** hardware WebCodecs → software; **WebGPU → WebGL → OffscreenCanvas 2D → CPU** for resize/rotate/color/SSIM; native container fast paths over generic ones. If a framework auto-selects, let it; if it has a flag, set it to the fast option.
- **Pipelining & concurrency:** streaming/pipelined reads+decode+encode over batch; Worker offload; tuned `encodeQueueSize`/`decodeQueueSize` (avoid encoder starvation); transferable/zero-copy buffers; progressive HTTP-Range reads.
- **Multi-threaded WASM, now unlocked by local hosting:** because every lib is same-origin (§0.8), the dev server sets **COOP: same-origin + COEP: require-corp** → cross-origin isolation → `SharedArrayBuffer` available. That lets ffmpeg.wasm (and any mt-WASM framework) run its **multi-threaded** core — its best path — and also enables `measureUserAgentSpecificMemory()` for precise peak-memory. Headers are uniform for all frameworks; each uses what it can.
- **Recorded per framework (`configUsed`):** e.g. `{ backend:'webgpu', hwAccel:true, wasmThreads:8, pipeline:'streaming', queueDepth:8, coreBuild:'mt' }`. The report prints this beside each framework so a number is never an apples-to-oranges artifact of a slow API path.
- **Still gated:** the fast path's output runs the **same** oracle as everyone else. Faster backend, identical correctness bar.
- **Honest caveat in the report:** if a framework's best path needs cross-origin isolation, hardware that another lacks, or a browser flag, that is *recorded* (it is part of "what it takes to get this framework's best") — never hidden, never used to silently disadvantage another.

---

## 9. Winner determination (`src/core/report.ts`) — the core deliverable

For **each case**, **within each browser**:

1. **Eligibility:** a framework is eligible only if its correctness oracle for the case **passed** (`PASS`). Frameworks that are `FAIL`/`NA`/`—` are listed but cannot win.
2. **Rank** eligible frameworks by the case's **primary metric**, respecting direction (ops/s, packets/s, frames/s, throughput×RT → higher-better; wall, peak-mem, bundle-size → lower-better).
3. **Winner = rank 1.** Report its **value** and the **margin** over rank 2 (Δ%).
4. **Tie** when rank 1 and rank 2 are within `max(noise-band, 3%)` → co-winners, flagged `tie`.
5. **Uncontested** when only one framework is eligible (others `NA`/`FAIL`) → it wins, flagged `uncontested` so a default win is never mistaken for a contest.
6. **Never cross browsers.** Winners are per-browser; a Brave number is never ranked against a different browser's number.

**Overall leaderboard** (per browser, and a combined view):

- **Wins** — count of cases each framework won (and ties).
- **Perf index** — geomean of each framework's ratio to the per-case winner (1.00 = always the fastest), and separately vs the reference (mediabunny).
- **Conformance %** (Dimension A), **robustness rate** (Dimension B), **bundle size**, **capability breadth**.
- A one-line **verdict per framework** ("wins metadata-extract & packet-iteration; loses convert to platform; smallest bundle").

---

## 10. The report (`results/report.md` + `report.json`)

Sections, all grouped by browser, with a `—`/`-`(NA-engine)/`-ᵇ`(NA-browser) legend:

1. **Winners table** — one row per case: `case → 🏆 winner (value) · runner-up (value, Δ%) · tie/uncontested flag`.
2. **Leaderboard** — wins, perf index, conformance %, robustness rate, bundle size, per-framework verdict.
3. **Capability matrix** — declared caps + runtime-detected codecs per framework × browser.
4. **Conformance matrix** — framework × case → PASS/FAIL/NA + reasons (Dimensions A & B).
5. **Benchmark matrix** — framework × case → {median, p95, primary-metric value, peak mem, longtasks} (Dimension C; blank behind a non-PASS gate).
6. **Δ-vs-reference** — per case, each framework vs mediabunny: `faster/slower/within-noise/gained/regressed/NA`.
7. **Caveats** — numbers are indicative (GPU/OS/thermals, hardware codec-session limits); AC power + quiesced; never cross-browser/cross-machine compare; bundle size is min+gzip at a pinned version.

`report.json` is the machine-readable twin (every value + every winner verdict).

---

## 11. Execution environment & reproducibility

- **Browser:** a **real, non-headless** browser — **Brave by default** (`/Applications/Brave Browser.app`, overridable via `BRAVE_PATH`). Other real browsers (Chromium/WebKit/Firefox) are selectable, also non-headless. **No headless shell anywhere.** If launching the system Brave conflicts with a running instance, use a dedicated user-data-dir or drive it via the `/chrome` extension.
- **Serving:** `bun --bun` runs Vite (so vite never spawns node); a small middleware serves `fixtures/**` as raw bytes with HTTP Range **before** module transform (so `.ts` *media* like `h264_ts.ts` is not parsed as TypeScript).
- **All libraries hosted locally (rule §0.8).** Every framework — and every heavy core it needs (`@ffmpeg/core` .js/.wasm, web-demuxer's wasm, etc.) — is installed via `bun` and served from the **local origin** (out of `node_modules/` or a committed-by-reference `vendor/` dir). **No CDN/unpkg/`toBlobURL`-from-the-internet at run time.** This makes runs hermetic + offline + repeatable, and means a 30 MB core is downloaded **once at `bun install`**, not per run, and never inside a measured window. Vendored core paths are pinned + recorded in each run's `env`.
- **Load/init excluded from operation timing (rule §0.7).** `init()` (load, WASM instantiate, encoder warmup) is awaited before the clock starts; only the operation is timed. A separate `load/init time` metric reports the one-time cost on its own.
- **Pinning & env:** record per run the browser build + GPU string, each framework's version/bundle hash, the corpus checksum set. A change in any invalidates comparisons until re-run.

---

## 12. How you use it

```
bun run bake      # scripts/bake-fixtures.sh — offline, once (binaries OK; bun runtime)
bun run serve     # serve the suite for manual viewing (open index.html in Brave)
bun run bench     # scripts/run.sh — real Brave, run the battery, write results/raw/
bun run compare   # scripts/compare.sh — build results/report.md (winners + leaderboard)
bun run add-engine <id>   # scaffold a new framework adapter; it joins the battery automatically
```

Re-run `bench` + `compare` whenever you want a fresh comparison (after a framework update, a new case, or an optimization). Adding coverage = adding cases; adding a contender = adding an adapter. Both are append-only and never edited to favor a framework.

---

## 13. Definition of done

- [ ] **Bake** reproduces corpus + golden deterministically (binaries only here, bun runtime); checksums asserted on load.
- [ ] **Run** executes the full battery in **real Brave, non-headless**, for **every** registered framework, and writes per-browser raw results. No headless path remains.
- [ ] **All frameworks present** — mediabunny, ffmpeg.wasm (local core), mp4box.js, platform, @remotion/media-parser, web-demuxer, @remotion/webcodecs, aibrush-media (stub) — each with honest `capabilities()`.
- [ ] **Dimension A/B/C cases** implemented with browser-pure oracles; the reference engine is green-or-honest-NA on every case.
- [ ] **Correctness gates every measured value**; `NA(framework)` vs `NA(browser)` kept distinct.
- [ ] **Winner per case** computed (with tie / uncontested flags) + **overall leaderboard**, per browser.
- [ ] The four **headline Mediabunny benchmarks** run for all frameworks.
- [ ] `report.md` + `report.json` produced, with caveats; bun-only throughout; no `node`/`npx` anywhere.
- [ ] **Self-check:** the same framework registered twice ties itself within noise on every perf case (proves the rig measures nothing where nothing changed).

---

## 14. Honesty & anti-patterns

- ❌ A perf value without a green correctness oracle for that exact framework × browser × case.
- ❌ Headless browsers, fake/software codec contexts, or measuring in Node.
- ❌ `node`/`npx` anywhere; fetching WASM cores from a CDN at run time.
- ❌ Declaring a winner across browsers/machines, or from a within-noise margin (that's a **tie**), or hiding that a win was **uncontested**.
- ❌ Editing a case to make a favored framework look better; cases are framework-blind and append-only.
- ❌ Judging by internals; collapsing `NA(framework)` and `NA(browser)`; fabricating any number.

> **The contract, restated:** one battery, every framework, in a real browser; correctness gates every number; each case ends in a clear, honest winner; the leaderboard is the product.

---

## 15. How Claude builds & maintains this suite (research-first, Opus-orchestrated)

This suite is built by Claude Code agents, and the **build process itself has rules** — because a framework benchmarked through the wrong (slow, deprecated) API is an unfair, wrong result.

**Research-first — before writing ANY framework's adapter or its cases:**

1. **Search + read the framework's official, current docs** (README, API reference, guide, changelog, release notes). **Do not code a framework's API from memory** — these libraries move fast; the recommended API and the fastest path change between versions.
2. Determine and write down: the **latest version**; the **recommended API** for each operation (probe / demux / decode / encode / remux / trim / mux); the **documented best-performance path** (§0.9 — hardware WebCodecs, WebGPU vs WebGL, multi-threaded WASM, streaming/pipelining, queue depth); required **headers / flags / Worker** setup; how to **vendor it locally** (§0.8 — no CDN at run time); and the **honest limits** (what it genuinely cannot do → declare `NA`, render `-`).
3. **Cite sources** in the adapter header (doc URLs + the version researched) and surface the chosen fast-path config as `configUsed` (§8.5). Every number must be traceable to "this is the framework's own recommended way, at version X."

**Orchestration — Opus agents + Workflows:**

- **Contracts first, then parallelize.** Author/confirm the shared contracts (`src/core/engine.ts`, `scenario.ts`, the §A catalog) so concurrent agents cannot drift; only then fan out.
- **Fan out** independent units to subagents: **one agent per framework adapter** (each does its own research above + implements the fast path + an honest `capabilities()`), plus agents for **case families**, **oracles**, **bake recipes**, and **report sections**. Prefer a **Workflow** for any substantial multi-file batch.
- **Always launch spawned agents on the Opus model**, and brief each on the standing rules: bun-only (§0.5), real-browser/no-headless (§0.4), local hosting (§0.8), load-excluded (§0.7), best-path + record `configUsed` (§0.9), and research-first (this section).
- **Integrate centrally:** after a fan-out, run `bunx tsc --noEmit`, reconcile interface drift, run the affected cases in **real Brave**, then **commit small**. Individual agents never commit.

**Verification before a number is admissible:** ran in real Brave · correctness oracle green · `configUsed` recorded · Δ-vs-reference computed. Only then does the value enter the report.

---

## Appendix A — Exhaustive feature/benchmark catalog

**This catalog enumerates the FEATURES — the rows below. It deliberately does NOT state which framework supports what.** Per §15, per-framework support is the **output of research** (a Claude search agent reads each framework's *current* docs/source) **+ each adapter's honest `capabilities()` + per-browser runtime feature-detect** — never assumed in this spec. The **report** is where support appears, per framework × browser: a measured `value`/`PASS` (supported & correct), `-` = `NA(engine)` (the framework doesn't do it), `-ᵇ` = `NA(browser)` (the browser can't configure it), `—` = not run.

**Rule:** every feature *any* framework exposes becomes a case. A feature only one framework has still gets a case; the others simply show `-` in the report (informative — it shows what they can't do). Cases are never dropped because some framework lacks a feature, and never edited to flatter one. **New features discovered during research are appended here as rows**, then implemented as cases.

Each row = one or more registered cases, parameterized across the corpus + the size ladder (§5.3). *Oracle* = how correctness is gated (§5.2); *Metric* = the primary number a perf case reports (§8). **Per-framework support columns are intentionally absent — that determination is the research agent's job; read the report for who supports what.**

**Scope rule.** A feature is in scope **iff at least one of the core frameworks** — **mediabunny, mp4box.js, @remotion/media-parser, web-demuxer, @remotion/webcodecs** — supports it. A feature that **only** `ffmpeg.wasm` and/or the raw `platform` can do (no core framework) is **out of scope and removed**. `ffmpeg.wasm` and `platform` still run as **contenders / baseline** on in-scope features, but they never *define* scope. The §15 research pass applies this rule per row and deletes any row no core framework supports. (This is why playback/adaptive-streaming, audio-effects/Web-Audio, image-processing, scene-analysis, real-time/WebRTC, and multi-input compositing are not here — they are platform/specialist/ffmpeg-only.)

## A.1 Input sources & reading modes

`File`/`Blob` · `ArrayBuffer`/`Uint8Array` · URL + **HTTP Range** (partial/lazy — read only needed bytes) · **streaming input** (process while downloading) · `ReadableStream`/async-iterable source · custom pluggable `Source` · read **without loading the whole file into memory**.
*Oracle:* produced metadata/packets match golden. *Metric:* wall, source-reads / range-fetches (lower = lazier), time-to-first-byte.

## A.2 Containers — READ (demux / probe)

mp4 / ISOBMFF · mov / QuickTime · fragmented-mp4 / CMAF · Matroska (MKV) · WebM · MPEG-TS · HLS (m3u8) · FLV · AVI · Ogg / OGV · MP3 (elementary) · WAV / RIFF · AIFF · FLAC · AAC / ADTS · CAF · 3GP / 3G2 · GIF-as-video · *(+ any other a framework documents — research appends it)*.
*Oracle:* `golden-metadata` (probe) / `golden-packets` (demux). *Metric:* probe **ops/s**, demux **packets/s**.

## A.3 Containers — WRITE (mux)

mp4 — progressive · **fastStart** (moov-first) · **in-place reserve** (no second pass) — · fragmented-mp4 / CMAF · mov · Matroska (MKV) · WebM · WAV · MP3 · Ogg · ADTS / AAC · MPEG-TS · **streaming write target** (write while muxing).
*Oracle:* reference re-import + `<video>` playback + decoded-frames vs source. *Metric:* wall, **frames/s**, bytes-out, target-writes.

## A.4 Video codecs — DECODE

H.264 / AVC · H.265 / HEVC · VP8 · VP9 · AV1 · MPEG-2 · MPEG-4 part2 · Theora · ProRes · **8-bit & 10-bit depth** · *(+ others a framework lists)*. Browser-gated codecs (HEVC/AV1) → `NA(browser)` where the browser can't configure them, distinct from `NA(engine)`.
*Oracle:* decoded-frames vs golden / SSIM. *Metric:* **decode fps**. (A parse-only framework that identifies a codec but renders no pixels is `-` here; it contests packet-iteration instead, §A.7.)

## A.5 Video codecs — ENCODE

H.264 / AVC · H.265 / HEVC · VP8 · VP9 · AV1 · **10-bit / HDR10** · *(+ others)*.
*Oracle:* SSIM/PSNR on decoded output. *Metric:* **encode fps**.

## A.6 Audio codecs — DECODE & ENCODE

AAC (LC/HE) · Opus · MP3 · FLAC · Vorbis · PCM s16/s24/f32 · **PCM big-endian & 24-bit** (the AIFF/s16be edge) · ALAC · AC-3 / E-AC-3 · DTS · *(+ others)*. Two cases each — decode and encode.
*Oracle:* decoded-PCM digest vs golden / format match. *Metric:* decode & encode throughput (samples or frames / s).

## A.7 Core operations (one correctness-gated + timed case each, across the corpus)

probe / extract-metadata · demux / iterate-packets · decode-frames (→ pixels) · seek (keyframe + exact) · remux (lossless container change) · transcode (re-encode) · trim / cut (keyframe + frame-accurate) · concat / splice · mux (from encoded tracks) · **extract audio track** (→ wav/mp3) · **replace / swap audio track** · decrypt (CENC/HLS) · thumbnail / frame-at-time · fragmentation / MSE-segments.
*Oracle:* per §5.2 (golden / reference-reimport / SSIM / playback / invariants). *Metric:* per op — probe **ops/s**, demux **packets/s**, decode/encode **fps**, remux/transcode/trim/mux **wall** + throughput×realtime, seek **ms/seek**.

## A.8 Video transforms (transcode-case variants, SSIM/PSNR-gated)

resize / scale (down & up) · rotate 90/180/270 + display-matrix · flip (h/v) · crop / pad / letterbox · fps change (down & up / interpolate) · bitrate target / CRF / quality / two-pass · color-space convert (601/709/2020) · **HDR → SDR tone-map** · **alpha preservation** (VP8/VP9 alpha — separate alpha-plane oracle) · **fan-out / ABR ladder** (1 input → N renditions).
*Oracle:* SSIM + PSNR vs reference frames (alpha plane compared separately). *Metric:* **frames/s**.

## A.9 Audio transforms / DSP

resample (rate convert) · channel-mix (mono↔stereo↔5.1) · PCM format convert (incl. big-endian / 24-bit) · volume / gain · fade in/out.
*Oracle:* decoded-PCM digest vs golden / format match. *Metric:* wall, samples/s.

## A.10 Output / streaming modes

buffer (whole file in memory) · streaming target (incremental write) · fragmented / CMAF output · fastStart (moov-first) · tiny-chunk writes (188-byte TS / low-latency) · MSE-ready segment generation.
*Oracle:* reference re-import + `<video>` playback. *Metric:* wall, target-writes, time-to-first-byte, bytes-out.

## A.11 Metadata / tags / structure

read duration / dims / fps / sample-rate / channels · read tags · **write tags** (then re-probe) · rotation / display-matrix · chapters · edit lists · multi-track + track selection · language / cover-art / timecode.
*Oracle:* `golden-metadata` / re-probe after write. *Metric:* wall.

## A.12 Encryption / DRM

CENC `cenc` (AES-CTR) decrypt · CENC `cbcs` (AES-CBC pattern, per-subsample IV) decrypt · HLS AES-128 decrypt · ClearKey · leave-unencrypted-input-untouched (negative).
*Oracle:* `decrypt-bitexact` — decoded frames bit-exact vs golden (golden from an offline reference decrypt). *Metric:* wall, decode fps.

## A.13 Subtitles / text / data tracks

read text track (mov_text / WebVTT / SRT) · write / mux text track · data / metadata tracks (e.g. GPMF, KLV).
*Oracle:* extracted text vs golden / re-probe. *Metric:* wall.

## A.14 Performance dimensions (each a measured, correctness-gated case)

extract-metadata **ops/s** (↑) · iterate-video-packets **packets/s** (↑) · convert-to-WebM + resize 320×180 **frames/s** (↑) · decode **fps** (↑) · encode **fps** (↑) · seek **ms/seek** (↓) · time-to-first-frame / first-byte **ms** (↓) · **load/init time ms** (↓ — reported separately per §0.7) · peak memory **bytes** (↓ — via `measureUserAgentSpecificMemory`) · main-thread **longtask ms** (↓) · **bundle size** per-feature + total **kB min+gzip** (↓) · source-reads / range-fetches **count** (↓ = lazier). (↑ higher-is-better, ↓ lower-is-better; winner per §9. Which frameworks contest each case is research/runtime-determined, not assumed.)

## A.15 Developer / platform aspects (researched from docs/source — scored, not a perf race)

TypeScript types · zero runtime deps · tree-shakeable (pay-for-what-you-use) · runs in a Worker · needs `SharedArrayBuffer`/COOP+COEP · hardware-accelerated (WebCodecs) · WebGPU / WebGL backend (§0.9) · license. **Established by the §15 research agent** from each framework's docs/source/package and recorded — never assumed.

## A.16 Deep edge cases (each a case; expectation = "handle gracefully or correctly")

Open-GOP & B-frame reorder · VFR (nominal vs real fps) · rotated (matrix not w/h swap) · multi-track + non-default track select · **headerless MediaRecorder WebM** (no Duration → must still report a sane duration) · big-endian & 24-bit PCM · MP3 **Xing-TOC vs CBR-no-TOC** duration · FLAC **±SEEKTABLE** seek accuracy · CENC `cbcs` per-subsample IV pattern · MP4 `fastStart:reserve` large forward seek · fragmented/CMAF init+media split · multi-hour / many-thousand-sample file · **zero-length** file · **header-truncated** file · **bit-flipped / fuzzed** spans (must fail gracefully, no crash/hang/OOM) · negative/seek-past-EOF · 0×0 or 1×1 video · extreme fps (1 fps, 240 fps) · audio-only / video-only / no-tracks · mismatched container/codec (e.g. h264 mislabeled) · timestamp wraparound / discontinuity (TS) · gapless audio (encoder delay/padding) · variable channel count.

**Metamorphic invariants (each a case):** `decode(remux(x)) == decode(x)` · `demux(mux(x)) ≈ x` · `probe(remux(x)).dur ≈ probe(x).dur` · `trim(a..b) ++ trim(b..c) ≈ trim(a..c)` · `probe(x).dur` consistent across containers of identical content · `transcode` is idempotent in dimensions (resize to same size = no-op-ish).

---

### Appendix B — How the catalog drives the run & report

- Each catalog row with a non-`-` cell for ≥1 framework becomes one or more registered cases (parameterized across the corpus assets that exercise it).
- A framework's adapter `capabilities()` declares which rows it claims; the runner turns an unclaimed row into `NA(engine)` → **`-`** in the report. A claimed-but-browser-unsupported codec → `NA(browser)` → **`-ᵇ`**.
- The report shows the full catalog as rows; cells are `🏆`/value/`PASS`/`FAIL`/`-`/`-ᵇ`/`—`. The **per-row winner** = fastest *correct* framework; rows where only one framework is non-`-` are flagged **uncontested** (still reported — they show unique capabilities, which is itself a finding).
- New features discovered in any framework are **appended** here first (as rows with `?` for the unknowns), then implemented as cases. This appendix is the living source of "what we benchmark."
